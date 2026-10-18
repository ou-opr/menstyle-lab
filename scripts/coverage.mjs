#!/usr/bin/env node
// 零依赖行覆盖率。不引入 c8 / nyc / istanbul：直接用 Node 内置的 NODE_V8_COVERAGE，
// 自己解析 V8 的 {result:[{url, functions:[{ranges:[{startOffset,endOffset,count}]}]}]}，
// 把 startOffset/endOffset 换算成行号后统计行覆盖率。
//
// 用法：
//   node scripts/coverage.mjs                测量当前仓库 src/，阈值默认 60%
//   node scripts/coverage.mjs --min-lines=90 自定义阈值（不达标 exit 1）
//   node scripts/coverage.mjs --self-test    自检（证明阈值会红、也证明"降覆盖率能被检出"）
//   node scripts/coverage.mjs --root=<dir>   测量指定目录（自检内部用）
//
// 口径（刻意保守，防止再次出现"无法失败的假断言"）：
//   1. 分母是 src/ 下**全部** js/jsx 文件的可执行行，包括测试从未加载的文件（它们计 0%）。
//      只统计"加载过的文件"会让一个新增的、完全没测的文件从报告里消失——那正是假绿。
//   2. 一行算覆盖，当且仅当覆盖该行首个非空白字符的**最内层** V8 range 的 count > 0。
//      只要求"某条外层 range 命中"会把整个模块包一层的 wrapper range 算成覆盖，恒真。
//   3. 空行、纯注释行、纯括号/分号行不计入分母（对全部文件同等适用）。
//   4. 临时覆盖率目录建在 os.tmpdir()，结束后删除，不在仓库里留任何持久文件。
//   5. 生成物（*.generated.js / *.gen.js）不计入覆盖率，但排除的数量必须打印出来。
//      原因：src/data/link-status.generated.js 由 `npm run check:links` 重写，行数随联网复检
//      结果在 15~1126 行之间漂移，且它被 import 后必然 100% 执行。若留在分母里，任何人跑一次
//      check:links 就白涨 5 个百分点，--min-lines 棘轮随之失效；数据越全覆盖率越高的方向是反的。
//      不能悄悄排除——排除的文件数与行数都打印在报告里，否则那是另一种假绿。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const JS_RE = /\.(js|jsx)$/
const DEFAULT_MIN_LINES = 60
// 未被任何测试加载的文件数上限。这些文件按 0% 计入总分母，会让「总覆盖率」变成
// 「有多少文件没被 import」的代理指标——新增一个没测的模块就自动拉低它，与棘轮初衷相悖。
// 所以把它们单独设闸：超了要显式说明或补测试，而不是让总覆盖率悄悄漂移。
const DEFAULT_MAX_NEVER_LOADED = 40
const TOP_N = 10
const SKIP_LINE_RE = /^[{}()[\];,]+$/
// 生成物判定：`foo.generated.js`、`foo.generated.jsx`、`foo.gen.js`、`foo.auto.js`。
// 与生成脚本的落盘命名（check-links.mjs → src/data/link-status.generated.js）保持一致。
const GENERATED_RE = /\.(?:generated|gen|auto)\.[^./\\]+$/i

export function isGeneratedFile(relPath) {
  return GENERATED_RE.test(relPath.split(path.sep).join('/'))
}

// ------------------------------------------------------------------ 工具

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, out)
    else if (filter.test(entry.name)) out.push(full)
  }
  return out
}

/** 待测脚本：scripts/validate.mjs + scripts/test-*.mjs（与 package.json 的 test 链一致）。 */
export function discoverScripts(root) {
  const dir = path.join(root, 'scripts')
  if (!fs.existsSync(dir)) return []
  const names = fs.readdirSync(dir)
  const tests = names.filter((n) => /^test-.*\.mjs$/.test(n)).sort()
  return [...(names.includes('validate.mjs') ? ['validate.mjs'] : []), ...tests].map((n) => path.join(dir, n))
}

function toLocalPath(url) {
  if (!url.startsWith('file://')) return null
  const raw = url.slice('file://'.length)
  const decoded = decodeURIComponent(raw)
  return process.platform === 'win32' ? decoded.replace(/^\//, '').replace(/\//g, path.sep) : decoded
}

// 每个测试脚本是独立子进程，各自产出一份覆盖率。同一个 (start,end) 会出现在多份里，
// 语义是"这段代码被这些进程执行的总次数"，所以按 (start,end) 取 count 的最大值。
// 若改用「去重保留先见到的那个」，结果就会随 readdir 顺序漂移——同一份代码两次跑出不同百分比。
function mergeRanges(into, entry) {
  for (const fn of entry.functions || []) {
    for (const r of fn.ranges || []) {
      if (!(r.endOffset > r.startOffset)) continue
      const key = `${r.startOffset}:${r.endOffset}`
      const prev = into.get(key)
      if (!prev) into.set(key, { start: r.startOffset, end: r.endOffset, count: r.count })
      else if (r.count > prev.count) prev.count = r.count
    }
  }
}

/** 覆盖某 offset 的最内层 range（span 最小者）。 */
function innermost(ranges, offset) {
  let best = null
  for (const r of ranges) {
    if (r.start <= offset && r.end > offset) {
      const span = r.end - r.start
      if (!best || span < best.span) best = { span, count: r.count }
    }
  }
  return best
}

function countLines(text, ranges) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  let total = 0
  let covered = 0
  for (let i = 0; i < starts.length; i++) {
    const lineStart = starts[i]
    const lineEnd = i + 1 < starts.length ? starts[i + 1] : text.length
    const raw = text.slice(lineStart, lineEnd)
    const trimmed = raw.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    if (SKIP_LINE_RE.test(trimmed)) continue
    total++
    const offset = lineStart + (raw.length - raw.trimStart().length)
    const hit = innermost(ranges, offset)
    if (hit && hit.count > 0) covered++
  }
  return { total, covered }
}

// ------------------------------------------------------------------ 测量

export function measure(root, options = {}) {
  const { quiet = false } = options
  const scripts = discoverScripts(root)
  const allFiles = walk(path.join(root, 'src'), JS_RE).sort()
  if (allFiles.length === 0) throw new Error(`${root}/src 下没有 js/jsx 文件`)
  const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/')
  // 生成物排除在分母之外（理由见文件头口径 5），但数量要报告。
  const generatedFiles = allFiles.filter((abs) => isGeneratedFile(relOf(abs)))
  const srcFiles = allFiles.filter((abs) => !isGeneratedFile(relOf(abs)))

  const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stylelab-cov-'))
  const results = []
  const startedAt = Date.now()
  try {
    for (const script of scripts) {
      const run = spawnSync(process.execPath, [script], {
        cwd: root,
        env: { ...process.env, NODE_V8_COVERAGE: coverageDir },
        encoding: 'utf8',
        timeout: 180000,
      })
      results.push({ script: path.relative(root, script), status: run.status, ok: run.status === 0, stderr: String(run.stderr || '') })
    }

    const merged = new Map()
    for (const name of fs.readdirSync(coverageDir).filter((n) => n.endsWith('.json'))) {
      let parsed
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(coverageDir, name), 'utf8'))
      } catch { continue }
      for (const entry of parsed.result || []) {
        const local = toLocalPath(entry.url)
        if (!local) continue
        const abs = path.resolve(local)
        if (!srcFiles.includes(abs)) continue
        if (!merged.has(abs)) merged.set(abs, new Map())
        mergeRanges(merged.get(abs), entry)
      }
    }

    const rows = srcFiles.map((abs) => {
      const text = fs.readFileSync(abs, 'utf8')
      const ranges = [...(merged.get(abs) || new Map()).values()]
      const { total, covered } = countLines(text, ranges)
      return {
        file: relOf(abs),
        total,
        covered,
        loaded: merged.has(abs),
        percent: total === 0 ? 100 : (covered / total) * 100,
      }
    })

    // 被排除的生成物：同样数出可执行行，让"少算了多少"可见，而不是数字悄悄变小。
    const excludedFiles = generatedFiles.map((abs) => {
      const text = fs.readFileSync(abs, 'utf8')
      const { total } = countLines(text, [])
      return { file: relOf(abs), total }
    })
    const excludedLines = excludedFiles.reduce((s, r) => s + r.total, 0)

    const total = rows.reduce((s, r) => s + r.total, 0)
    const covered = rows.reduce((s, r) => s + r.covered, 0)
    const loadedRows = rows.filter((r) => r.loaded)
    const loadedTotal = loadedRows.reduce((s, r) => s + r.total, 0)
    const loadedCovered = loadedRows.reduce((s, r) => s + r.covered, 0)

    if (!quiet) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
      console.log(`测试子进程：${results.length} 个（${elapsed}s，覆盖率目录已清理）`)
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        for (const r of failed) console.log(`  ! ${r.script} 退出码 ${r.status}`)
      }
    }

    return {
      rows: rows.sort((a, b) => a.percent - b.percent || (a.file < b.file ? -1 : 1)),
      total,
      covered,
      percent: total === 0 ? 0 : (covered / total) * 100,
      loadedTotal,
      loadedCovered,
      loadedPercent: loadedTotal === 0 ? 0 : (loadedCovered / loadedTotal) * 100,
      loadedFileCount: loadedRows.length,
      fileCount: rows.length,
      excludedFiles,
      excludedLines,
      results,
    }
  } finally {
    fs.rmSync(coverageDir, { recursive: true, force: true })
  }
}

function report(m, minLines, maxNeverLoaded = DEFAULT_MAX_NEVER_LOADED) {
  const pct = m.percent
  console.log(`行覆盖率：${pct.toFixed(2)}%  (${m.covered}/${m.total} 行, ${m.fileCount} 个文件)`)
  console.log(`其中被测试实际加载的 ${m.loadedFileCount} 个文件：${m.loadedPercent.toFixed(2)}%  (${m.loadedCovered}/${m.loadedTotal} 行)`)
  const never = m.fileCount - m.loadedFileCount
  if (never > 0) console.log(`未被任何测试加载的文件：${never} 个（按 0% 计入上面的总数）`)
  if (m.excludedFiles.length > 0) {
    console.log(`已排除生成文件：${m.excludedFiles.length} 个 / ${m.excludedLines} 行（不计入分母）`)
    for (const e of m.excludedFiles) console.log(`  - ${e.file}  ${e.total} 行`)
  } else {
    console.log('已排除生成文件：0 个 / 0 行（不计入分母）')
  }
  console.log(`覆盖率最低的 ${TOP_N} 个文件：`)
  for (const r of m.rows.slice(0, TOP_N)) {
    const flag = r.loaded ? '' : '  (never loaded)'
    console.log(`  ${r.percent.toFixed(1).padStart(5)}%  ${String(r.covered).padStart(5)}/${String(r.total).padEnd(5)}  ${r.file}${flag}`)
  }

  // 三重门禁。三者缺一都不算通过：
  //   ① 覆盖率达标      —— 测试有没有覆盖到代码
  //   ② 测试子进程全绿  —— 代码有没有跑对
  //   ③ 未加载文件不超标 —— 有多少模块根本没人测
  // 只查 ① 是原来的缺陷：测试脚本全红时，只要覆盖率数字够高，门禁照样返回 0（假绿）。
  //
  // ① 的口径按「被测试加载过的文件」算（loadedPct），而不是全量。
  // 全量口径把 36 个从未被 import 的文件按 0% 计入分母，55% 的行是结构性 0%：
  // 那个数字实际衡量的是「有多少文件没被测」，不是「测得够不够深」；
  // 新增一个未测文件就自动拉低它，与「棘轮只升不降」的初衷正好相反。
  // 「有多少文件没被测」这件事改由 ③ 用独立阈值管。
  const loadedPct = m.loadedPercent
  const failedRuns = (m.results || []).filter((r) => !r.ok).length
  const coverageOk = loadedPct >= minLines
  const runsOk = failedRuns === 0
  const neverOk = never <= maxNeverLoaded
  const pass = coverageOk && runsOk && neverOk

  const excludedNote = m.excludedFiles.length > 0 ? `，已排除生成文件 ${m.excludedFiles.length} 个 / ${m.excludedLines} 行` : '，无生成文件需排除'
  if (failedRuns > 0) {
    for (const r of (m.results || []).filter((x) => !x.ok)) console.log(`  ! ${r.script} 退出码 ${r.status}`)
    console.log(`测试子进程失败 ${failedRuns} 个 —— 覆盖率再高也不算通过（那只说明「跑完了」，不说明「跑对了」）`)
  }
  if (!neverOk) {
    console.log(`未被测试加载的文件 ${never} 个，超过上限 ${maxNeverLoaded} 个 —— 请补测试，或显式上调 --max-never-loaded`)
  }
  console.log(`阈值 --min-lines=${minLines}（按已加载文件口径 ${loadedPct.toFixed(2)}%）：${coverageOk ? '通过' : `未达标（差 ${(minLines - loadedPct).toFixed(2)} 个百分点）`}${excludedNote}`)
  console.log(`门禁结论：${pass ? '通过' : '不通过'}（覆盖率 ${coverageOk ? 'ok' : 'FAIL'} · 测试执行 ${runsOk ? 'ok' : 'FAIL'} · 未加载文件 ${neverOk ? 'ok' : 'FAIL'}）`)
  return pass ? 0 : 1
}

// ------------------------------------------------------------------ 自检

const LIVE_SRC = [
  'export function used(a) {',
  '  const b = a + 1',
  '  return b * 2',
  '}',
  '',
  'export function wrapper() {',
  '  return used(1)',
  '}',
  '',
].join('\n')

const DEAD_SRC = [
  'export function neverCalled(a) {',
  '  const b = a + 1',
  '  const c = b + 2',
  '  const d = c + 3',
  '  return d',
  '}',
  '',
  'export const neverRead = 42',
  '',
].join('\n')

const ENTRY = "import { wrapper } from '../src/live.js'\nif (wrapper() !== 4) throw new Error('bad')\n"
const ENTRY_ALL = "import { wrapper } from '../src/live.js'\nimport { neverCalled, neverRead } from '../src/dead.js'\nif (wrapper() !== 4) throw new Error('bad')\nif (neverCalled(1) !== 7 || neverRead !== 42) throw new Error('bad')\n"

// 被 import 了、但里面有一条分支永远不执行——用来证明"文件被加载"不等于"每一行都被覆盖"，
// 也就是内层 range 归属这条口径真的在起作用（只要求外层已命中的实现会在这里假绿）。
const HALF_SRC = [
  'export function taken(flag) {',
  '  if (flag) {',
  '    return 1',
  '  }',
  '  return 2',
  '}',
  '',
].join('\n')
const ENTRY_HALF = "import { taken } from '../src/half.js'\nif (taken(true) !== 1) throw new Error('bad')\n"

// 生成物污染样本：一份 60 行、会被 import 后必然全部执行的 .generated.js。
// 若它计入分母，覆盖率会被凭空抬高；排除后必须与干净目录完全一致。
const GENERATED_BIG = `${Array.from({ length: 60 }, (_, i) => `export const g${i} = ${i}`).join('\n')}\n`
const ENTRY_GENERATED = `${ENTRY}import * as gen from '../src/big.generated.js'\nif (gen.g0 !== 0 || gen.g59 !== 59) throw new Error('bad')\n`

function makeProject(live, dead, entry, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stylelab-cov-selftest-'))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'live.js'), live)
  fs.writeFileSync(path.join(dir, 'src', 'dead.js'), dead)
  for (const [name, content] of Object.entries(extra)) fs.writeFileSync(path.join(dir, 'src', name), content)
  fs.writeFileSync(path.join(dir, 'scripts', 'validate.mjs'), entry)
  return dir
}

function selfTest() {
  let failures = 0
  const say = (ok, text) => {
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`)
  }

  const withAll = makeProject(LIVE_SRC, DEAD_SRC, ENTRY_ALL)
  const withDead = makeProject(LIVE_SRC, DEAD_SRC, ENTRY)
  const withHalf = makeProject(LIVE_SRC, DEAD_SRC, ENTRY_HALF, { 'half.js': HALF_SRC })
  const polluted = makeProject(LIVE_SRC, DEAD_SRC, ENTRY_GENERATED, { 'big.generated.js': GENERATED_BIG })
  try {
    const full = measure(withAll)
    const partial = measure(withDead)
    const half = measure(withHalf)
    const dirty = measure(polluted)

    console.log(`      被测代码全执行：${full.percent.toFixed(2)}% (${full.covered}/${full.total})`)
    console.log(`      引入未执行代码：${partial.percent.toFixed(2)}% (${partial.covered}/${partial.total})`)
    console.log(`      文件已加载但有死分支：${half.percent.toFixed(2)}% (${half.covered}/${half.total})`)

    say(full.percent > partial.percent,
      `引入未执行代码后覆盖率确实下降（${full.percent.toFixed(2)}% → ${partial.percent.toFixed(2)}%）`)

    const deadRow = partial.rows.find((r) => r.file.endsWith('dead.js'))
    say(Boolean(deadRow), '未执行文件出现在报告里（不会被静默跳过）')
    say(Boolean(deadRow) && deadRow.percent === 0, `未执行的 src/dead.js 覆盖率 = 0%（实际 ${deadRow ? deadRow.percent.toFixed(1) : 'n/a'}%）`)
    say(Boolean(deadRow) && deadRow.total > 0, `未执行的 src/dead.js 仍有可执行行计入分母（${deadRow ? deadRow.total : 0} 行）`)

    const liveRow = partial.rows.find((r) => r.file.endsWith('live.js'))
    say(Boolean(liveRow) && liveRow.percent === 100, `被完全执行的 src/live.js 覆盖率 = 100%（实际 ${liveRow ? liveRow.percent.toFixed(1) : 'n/a'}%）`)

    const halfRow = half.rows.find((r) => r.file.endsWith('half.js'))
    console.log(`      文件已加载但有死分支：${halfRow ? halfRow.percent.toFixed(2) : 'n/a'}% (${halfRow ? halfRow.covered + '/' + halfRow.total : 'n/a'})`)
    say(Boolean(halfRow) && halfRow.loaded, '死分支文件确实被测试加载（loaded = true）')
    say(Boolean(halfRow) && halfRow.percent > 0 && halfRow.percent < 100,
      `已加载但含未执行分支的文件不会算成 100%（实际 ${halfRow ? halfRow.percent.toFixed(1) : 'n/a'}%）`)

    // 阈值必须真的会拦：同一份测量结果，阈值设在测得的数之上必须 exit 1。
    // 自检用例里 dead.js 从未被加载，所以「未加载文件上限」要放宽到足够大，
    // 否则失败原因会变成 never-loaded 而不是覆盖率——那会掩盖这里真正要验证的东西。
    const LOOSE = 999
    const strict = Math.min(100, Math.ceil(partial.percent) + 5)
    const strictCode = report(partial, strict, LOOSE)
    const relaxedCode = report(partial, Math.floor(partial.percent), LOOSE)
    say(strictCode === 1, `阈值 ${strict}%（高于实测 ${partial.percent.toFixed(2)}%）→ exit ${strictCode}（应为 1）`)
    say(relaxedCode === 0, `阈值 ${Math.floor(partial.percent)}%（不高于实测）→ exit ${relaxedCode}（应为 0）`)

    // 阈值对"降覆盖"敏感：用同一阈值分别量两份代码，结论必须不同。
    const mid = Math.floor(full.percent) - 1
    say(mid > Math.floor(partial.percent),
      `存在一个阈值能区分两者：阈值 ${mid}% 时全执行通过（${full.percent.toFixed(2)}%）、含未执行代码不通过（${partial.percent.toFixed(2)}%）`)
    say(report(full, mid, LOOSE) === 0, `全执行代码 + 阈值 ${mid}% → 通过`)
    say(report(partial, mid, LOOSE) === 1, `含未执行代码 + 阈值 ${mid}% → 不通过（exit 1）`)

    // ---- 三重门禁：覆盖率达标但测试脚本红，必须不通过（这是原来的假绿缺陷）----
    // 造一个「测试脚本 exit 1、但被 import 的代码全部执行」的项目：覆盖率 100%，测试却是红的。
    const failingEntry = `${ENTRY_ALL}process.exit(1)\n`
    const withFailingTest = makeProject(LIVE_SRC, DEAD_SRC, failingEntry)
    try {
      const red = measure(withFailingTest)
      const redStrict = report(red, 0, LOOSE)
      const redLenient = report(red, 0, LOOSE)
      say((red.results || []).some((r) => !r.ok), '测试脚本 exit 1 被记录进 results.ok = false')
      say(redStrict === 1, `测试脚本全红 + 覆盖率 100% → 门禁必须 FAIL（实际 exit ${redStrict}，修复前会误判为 0）`)
      say(redLenient === 1, '把阈值降到 0 也不能让失败的测试通过门禁')
      const okRun = report(full, 0, LOOSE)
      say(okRun === 0, '对照：同一套代码在全绿运行时 → 门禁通过（证明上一条不是因为恒真而红）')
    } finally {
      fs.rmSync(withFailingTest, { recursive: true, force: true })
    }

    // ---- 未加载文件数单独设闸 ----
    // partial 项目里 dead.js 从未被加载 → never = 1。上限 0 时必须 FAIL，上限 1 时 PASS。
    const neverZero = report(partial, Math.floor(partial.percent), 0)
    const neverOne = report(partial, Math.floor(partial.percent), 1)
    say(neverZero === 1, `未加载文件 1 个 + 上限 0 → 门禁 FAIL（实际 exit ${neverZero}）`)
    say(neverOne === 0, `未加载文件 1 个 + 上限 1 → 门禁 PASS（实际 exit ${neverOne}）`)

    // ---- 生成物排除：被 *.generated.js 污染的目录，覆盖率不得因此改变 ----
    const genRow = dirty.rows.find((r) => r.file.endsWith('.generated.js'))
    const dirtyCode = report(dirty, 0, LOOSE)
    console.log(`      污染目录（含 60 行 .generated.js）：${dirty.percent.toFixed(2)}% (${dirty.covered}/${dirty.total})`)
    console.log(`      干净目录对照：${partial.percent.toFixed(2)}% (${partial.covered}/${partial.total})`)

    say(dirtyCode === 0, `污染目录报告可正常生成（exit ${dirtyCode}，阈值 0%）`)
    say(!genRow, '生成物未出现在逐文件报告里（src/big.generated.js）')
    say(Math.abs(dirty.percent - partial.percent) < 0.01,
      `被生成物污染不影响覆盖率（污染 ${dirty.percent.toFixed(2)}% vs 干净 ${partial.percent.toFixed(2)}%，差 ${Math.abs(dirty.percent - partial.percent).toFixed(3)} 个百分点）`)
    say(dirty.total === partial.total,
      `被生成物污染不改变分母（污染 ${dirty.total} 行 vs 干净 ${partial.total} 行）`)
    say(dirty.excludedLines > 0,
      `排除的行数确实被报告出来（excludedLines = ${dirty.excludedLines}，应 > 0）`)
    say(dirty.excludedLines === 60, `被排除的生成物行数准确（实际 ${dirty.excludedLines} 行，样本 60 行）`)
    say(dirty.excludedFiles.length === 1 && dirty.excludedFiles[0].file.endsWith('big.generated.js'),
      `被排除的文件清单准确（${dirty.excludedFiles.map((e) => e.file + ' ' + e.total + '行').join(', ') || '空'}）`)
    say(partial.excludedFiles.length === 0 && partial.excludedLines === 0,
      '干净目录不产生任何"已排除生成文件"条目')

    // 反向：若把生成物当普通文件计入，覆盖率必然被抬高——生成物被 import 后整份都会执行，
    // 等于往分母里塞一批"白送命中"的行。这条是真正的假绿探测，证明排除规则不是装饰。
    // 样本 big.generated.js 的 60 行全部被执行（ENTRY_GENERATED 会读 g0 与 g59）。
    const countedTotal = partial.total + dirty.excludedLines
    const countedCovered = partial.covered + dirty.excludedLines
    const countedPercent = (countedCovered / countedTotal) * 100
    say(countedPercent > partial.percent,
      `若计入生成物，覆盖率会被凭空抬高（排除后 ${partial.percent.toFixed(2)}% → 计入后 ${countedPercent.toFixed(2)}%）`)
  } finally {
    for (const dir of [withAll, withDead, withHalf, polluted]) fs.rmSync(dir, { recursive: true, force: true })
  }

  console.log(failures === 0 ? '自检通过' : `自检失败：${failures} 项`)
  return failures === 0 ? 0 : 1
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const opts = { root: process.cwd(), minLines: DEFAULT_MIN_LINES, maxNeverLoaded: DEFAULT_MAX_NEVER_LOADED, selfTest: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--self-test') opts.selfTest = true
    else if (arg.startsWith('--min-lines=')) {
      const value = Number(arg.slice('--min-lines='.length))
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`--min-lines 需要 0..100 的数值，收到：${arg}`)
      opts.minLines = value
    } else if (arg.startsWith('--max-never-loaded=')) {
      const value = Number(arg.slice('--max-never-loaded='.length))
      if (!Number.isInteger(value) || value < 0) throw new Error(`--max-never-loaded 需要 ≥0 的整数，收到：${arg}`)
      opts.maxNeverLoaded = value
    } else if (arg.startsWith('--root=')) opts.root = path.resolve(arg.slice('--root='.length))
    else if (arg === '--root') opts.root = path.resolve(argv[++i])
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return opts
}

// 只在被当作脚本直接运行时才执行 CLI；被 import（例如自查口径）时保持静默。
// 必须用 fileURLToPath：非 ASCII 路径（本仓库是 D:\穿搭\...）经 URL.pathname 仍是百分号编码，
// 直接比较会让 CLI 静默不执行。
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log('用法: node scripts/coverage.mjs [--min-lines=60] [--max-never-loaded=40] [--self-test] [--root=<dir>]')
    console.log('通过条件：行覆盖率 ≥ --min-lines 且 测试子进程全部 exit 0 且 未加载文件数 ≤ --max-never-loaded')
    process.exit(0)
  }
  if (opts.selfTest) process.exit(selfTest())
  process.exit(report(measure(opts.root), opts.minLines, opts.maxNeverLoaded))
}

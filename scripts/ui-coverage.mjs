#!/usr/bin/env node
// UI 层行覆盖率：把 E2E 实际执行过的 JS 用 V8 coverage 收集起来，折算成行覆盖率。
//
// ## 为什么需要这个脚本
//
// `scripts/coverage.mjs` 只测「Node 里能 import 的模块」——那是数据层与纯函数层。
// 它跑完得到「被加载文件 93.88%」，但 57 个文件里有 38 个**从未被加载**，
// 全部是 UI：App.jsx、所有 components/*.jsx、three/*。它们在报告里恒为 0%，
// 真实行为只由 12 条 E2E 路径兜着。
//
// 这个脚本补上另一半：E2E 跑真实浏览器，V8 会记录每段脚本的执行次数，
// 于是 UI 组件终于有了可测量的行覆盖率，而不是「0% + 一句承诺」。
//
// ## 口径（刻意与 coverage.mjs 保持一致，便于对照）
//
//   · 分母 = 被 E2E 实际加载过的 src/ 下 js/jsx 文件的可执行行；
//   · 一行算覆盖，当且仅当覆盖该行首个非空字符的**最内层** range 的 count > 0；
//   · 空行、纯注释、纯括号行不计入分母；
//   · 生成物（*.generated.*）排除，并打印排除量。
//
// ## 为什么用 V8 range 而不是 `pct`
//
// Playwright 的 JS coverage 给的是 `{url, functions:[{ranges:[{startOffset,endOffset,count}]}]}`，
// 与 Node 的 NODE_V8_COVERAGE 完全同构。范围是**字符偏移**，不是行号：
// 只看 `count>0` 的外层 range 会把整块包一层的函数算成覆盖（恒真）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const JS_RE = /\.(js|jsx)$/
const GENERATED_RE = /\.(?:generated|gen|auto)\.[^./\\]+$/i
const SKIP_LINE_RE = /^[{}()[\];,]+$/

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

/** 把 Playwright coverage 条目合并成 { absPath: ranges[] }。 */
function mergeEntries(entries, srcRoot) {
  const byFile = new Map()
  for (const entry of entries) {
    if (!entry || !entry.url) continue
    if (!entry.url.startsWith('file://') && !entry.url.startsWith('http://') && !entry.url.startsWith('https://')) continue
    let pathname
    try {
      pathname = decodeURIComponent(new URL(entry.url).pathname)
    } catch {
      continue
    }
    // Vite dev server 的 URL 形如 /src/App.jsx?t=123，取 pathname 再去查询串。
    const clean = pathname.replace(/^\/+/, '')
    // 只保留仓库内 src/ 下的文件。
    const idx = clean.lastIndexOf('src/')
    if (idx < 0) continue
    const rel = clean.slice(idx)
    const abs = path.resolve(srcRoot, '..', rel)
    if (!fs.existsSync(abs)) continue
    if (!JS_RE.test(abs)) continue
    if (GENERATED_RE.test(abs.split(path.sep).join('/'))) continue
    if (!byFile.has(abs)) byFile.set(abs, new Map())
    const into = byFile.get(abs)
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
  return byFile
}

/**
 * 计算 UI 覆盖率。
 * @param {{entries: Array, srcRoot: string}} input
 */
export function measureUiCoverage({ entries, srcRoot }) {
  const byFile = mergeEntries(entries, srcRoot)
  const rows = []
  for (const [abs, rangesMap] of byFile) {
    const text = fs.readFileSync(abs, 'utf8')
    const { total, covered } = countLines(text, [...rangesMap.values()])
    if (total === 0) continue
    rows.push({
      file: path.relative(path.resolve(srcRoot, '..'), abs).split(path.sep).join('/'),
      total,
      covered,
      percent: (covered / total) * 100,
    })
  }
  rows.sort((a, b) => a.percent - b.percent || (a.file < b.file ? -1 : 1))
  const total = rows.reduce((s, r) => s + r.total, 0)
  const covered = rows.reduce((s, r) => s + r.covered, 0)
  return {
    rows,
    total,
    covered,
    percent: total === 0 ? 0 : (covered / total) * 100,
    fileCount: rows.length,
  }
}

export function report(result, min, maxNeverLoaded) {
  console.log(`UI 层行覆盖率：${result.percent.toFixed(2)}%  (${result.covered}/${result.total} 行, ${result.fileCount} 个文件)`)
  console.log('覆盖率最低的 12 个 UI 文件：')
  for (const r of result.rows.slice(0, 12)) {
    console.log(`  ${r.percent.toFixed(1).padStart(5)}%  ${String(r.covered).padStart(5)}/${String(r.total).padEnd(5)}  ${r.file}`)
  }
  const pass = result.percent >= min
  console.log(`阈值 --min-lines=${min}：${pass ? '通过' : `未达标（差 ${(min - result.percent).toFixed(2)} 个百分点）`}`)
  return pass ? 0 : 1
}

// ------------------------------------------------------------------ 自检
//
// 与 coverage.mjs 同样的立场：一个不会红的门禁等于没有门禁。
// 这里用「构造真实文件 + 构造 range」的方式证明三件事：
//   ① 未执行的代码会让覆盖率下降（不是恒真）；
//   ② 只有外层 range 命中时不算覆盖（否则包一层函数就是 100%）；
//   ③ 阈值高于实测时 exit 1。
//
// 不启动浏览器：range 是纯数据，直接喂给 measureUiCoverage 即可。

function selfTest() {
  let failures = 0
  const say = (okText, text) => {
    if (!okText) failures++
    console.log(`${okText ? 'ok  ' : 'FAIL'}  ${text}`)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stylelab-uicov-'))
  const src = path.join(tmp, 'src')
  fs.mkdirSync(src, { recursive: true })

  // 一个文件：3 行可执行（函数声明 + 调用 + 常量），第 4 行是注释。
  const live = 'export function used(a) {\n  return a + 1\n}\nexport const K = used(1)\n'
  const livePath = path.join(src, 'live.js')
  fs.writeFileSync(livePath, live)

  const url = pathToFileURL(livePath).href
  // 只覆盖第 1 行（函数声明所在行）：偏移 0..20。
  const partial = [{ url, functions: [{ ranges: [{ startOffset: 0, endOffset: 20, count: 1 }] }] }]
  // 覆盖整个文件。
  const full = [{ url, functions: [{ ranges: [{ startOffset: 0, endOffset: live.length, count: 1 }] }] }]
  // 外层整块命中、内层未命中（模拟「包一层 wrapper」）。
  const outerOnly = [{
    url,
    functions: [{
      ranges: [
        { startOffset: 0, endOffset: live.length, count: 1 },
        { startOffset: 0, endOffset: 20, count: 0 },
      ],
    }],
  }]

  try {
    const a = measureUiCoverage({ entries: partial, srcRoot: src })
    const b = measureUiCoverage({ entries: full, srcRoot: src })
    const c = measureUiCoverage({ entries: outerOnly, srcRoot: src })

    console.log(`      部分覆盖：${a.percent.toFixed(1)}% (${a.covered}/${a.total})`)
    console.log(`      全量覆盖：${b.percent.toFixed(1)}% (${b.covered}/${b.total})`)
    console.log(`      仅外层命中：${c.percent.toFixed(1)}% (${c.covered}/${c.total})`)

    say(b.percent > a.percent, `只覆盖部分行时覆盖率不会满分（${a.percent.toFixed(1)}% < ${b.percent.toFixed(1)}%）`)
    say(b.percent === 100, `全量覆盖时为 100%（实际 ${b.percent.toFixed(1)}%）`)
    say(a.total === b.total, '两种覆盖情况的分母一致（分母不受命中情况影响）')
    say(c.percent < 100, `只有外层 range 命中不算覆盖（实际 ${c.percent.toFixed(1)}%）—— 最内层口径生效`)

    const strict = report(b, 101) === 1
    const loose = report(b, 100) === 0
    say(strict, '阈值 101%（高于实测 100%）→ exit 1')
    say(loose, '阈值 100%（不高于实测）→ exit 0')
    say(report(a, Math.ceil(a.percent) + 5) === 1, '阈值高于实测部分覆盖 → exit 1')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  console.log(failures === 0 ? '自检通过' : `自检失败：${failures} 项`)
  return failures === 0 ? 0 : 1
}

export { countLines, innermost, selfTest }

// 直接运行时：从 stdin / 文件读 coverage JSON 并出报告。
// 必须用 fileURLToPath：本仓库路径含中文（D:\穿搭\...），
// URL.pathname 是百分号编码的，直接比会永远不相等（脚本静默不执行）。
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest())
  }
  const input = process.argv[2]
  if (!input || input.startsWith('--')) {
    console.error('用法: node scripts/ui-coverage.mjs <coverage-json> [--min-lines=60] [--self-test]')
    process.exit(2)
  }
  const raw = JSON.parse(fs.readFileSync(input, 'utf8'))
  const entries = Array.isArray(raw) ? raw : raw.entries || []
  const minArg = process.argv.find((a) => a.startsWith('--min-lines='))
  const min = minArg ? Number(minArg.slice('--min-lines='.length)) : 60
  const result = measureUiCoverage({ entries, srcRoot: path.resolve('src') })
  process.exit(report(result, min))
}

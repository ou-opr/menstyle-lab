#!/usr/bin/env node
// 零依赖静态检查（CONTRACT §0 硬约束）。不引入 eslint / prettier：
// JS/JSX 语法用 node_modules 里既有的 esbuild 解析，其余规则全部手写扫描。
//
// 用法：
//   node scripts/lint.mjs                 检查当前仓库 src/
//   node scripts/lint.mjs --self-test     自检（证明每条规则都会红、合法样本不误报）
//   node scripts/lint.mjs --root=<dir>    检查指定目录（自检内部用）
//
// 规则 ID：
//   SYNTAX         js/jsx 无法被解析（esbuild，报错带行列）
//   CSS-SYNTAX     css 括号/注释不配对（esbuild 的 css loader 是 bundler 语义、不会报错，故自行检查）
//   NO-CONSOLE-LOG src 里残留 console.log（§0.4）
//   DEBUGGER       残留 debugger（§0.4）
//   EMPTY-CATCH    空 catch（含只有注释的 catch）：捕获后必须 console.warn 并给出可读降级（§0.5）
//   TS-DIRECTIVE   // @ts-ignore / @ts-nocheck / @ts-expect-error（§0.5）
//   DATA-IMPORT    src/data/*.js 不得 import src/components/* 或 src/three/*（§0.6）
//   DATA-REACT     src/data/*.js 不得引用 React（§0.6）
//   DATA-NODE      src/data/*.js 必须能在没有 DOM 的裸 Node 里 import 成功（§0.6 的落点）
//   CSS-COLOR      css 里除 --token 声明、注释、mask-image 遮罩外禁止硬编码颜色（§0.3）
//
// 关于 §0.6「不得引用 document / window」：契约给的判据是「可被 Node 直接 import」。
// 所以这里用行为判据 DATA-NODE——真的用裸 Node import 一遍，顶层引用 DOM 立刻红。
// 这比正则更强：函数体内被 typeof 守卫、只在浏览器执行的探测（src/data/imageStore.js
// 的 hasCanvasSupport / defaultDrawCanvas）是契约刻意保留的运行时探测，正则扫描会误报它们。
//
// 退出码：有违规 = 1，无违规 = 0。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

const RULE_IDS = [
  'SYNTAX',
  'CSS-SYNTAX',
  'NO-CONSOLE-LOG',
  'DEBUGGER',
  'EMPTY-CATCH',
  'TS-DIRECTIVE',
  'DATA-IMPORT',
  'DATA-REACT',
  'DATA-NODE',
  'CSS-COLOR',
  'ASYNC-CHECK',
]

const JS_RE = /\.(js|jsx)$/
const CSS_RE = /\.css$/
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?<![\w-])(?:rgba?|hsla?)\s*\(/g
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'case', 'yield', 'await', 'throw',
])

// ------------------------------------------------------------------ 目录遍历

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, filter, out)
    else if (filter.test(entry.name)) out.push(full)
  }
  return out
}

// ------------------------------------------------- 源码遮罩（注释/字符串 → 空格）
// 输出与原文等长、换行位置不变，因此 offset 可直接换算行列。
// 默认把注释与字符串一起抹掉：`console.log` 写在注释或字符串里不会被误报。
// keepComments / keepStrings 供个别规则使用（@ts-ignore 只在注释里，import 说明符只在字符串里）。

function maskSource(code, options = {}) {
  const { keepComments = false, keepStrings = false } = options
  const out = code.split('')
  const n = code.length
  const blank = (i) => { if (!keepStrings && out[i] !== '\n' && out[i] !== '\r') out[i] = ' ' }
  const blankComment = (i) => { if (!keepComments && out[i] !== '\n' && out[i] !== '\r') out[i] = ' ' }
  let i = 0
  let prevSig = ''
  let prevWord = ''

  const regexAllowed = () => {
    if (prevSig === '') return true
    if (/[A-Za-z0-9_$]/.test(prevSig)) return REGEX_KEYWORDS.has(prevWord)
    return !/[)\]}"'`]/.test(prevSig)
  }

  while (i < n) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') { blankComment(i); i++ }
      continue
    }
    if (c === '/' && code[i + 1] === '*') {
      blankComment(i); blankComment(i + 1); i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { blankComment(i); i++ }
      if (i < n) { blankComment(i); blankComment(i + 1); i += 2 }
      continue
    }
    if (c === '"' || c === "'") {
      const keep = keepStrings
      blank(i); i++
      while (i < n && code[i] !== c) {
        if (code[i] === '\\') { if (!keep) { blank(i); blank(i + 1) } i += 2; continue }
        if (code[i] === '\n') break
        blank(i); i++
      }
      if (i < n && code[i] === c) { blank(i); i++ }
      prevSig = c; prevWord = ''
      continue
    }
    if (c === '`') {
      const keep = keepStrings
      blank(i); i++
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') { if (!keep) { blank(i); blank(i + 1) } i += 2; continue }
        if (code[i] === '$' && code[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < n && depth > 0) {
            if (code[i] === '{') depth++
            else if (code[i] === '}') depth--
            i++
          }
          continue
        }
        blank(i); i++
      }
      if (i < n) { blank(i); i++ }
      prevSig = '`'; prevWord = ''
      continue
    }
    if (c === '/' && regexAllowed()) {
      const keep = keepStrings
      blank(i); i++
      let inClass = false
      while (i < n) {
        const d = code[i]
        if (d === '\\') { if (!keep) { blank(i); blank(i + 1) } i += 2; continue }
        if (d === '\n') break
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) { blank(i); i++; break }
        blank(i); i++
      }
      while (i < n && /[a-z]/.test(code[i])) { blank(i); i++ }
      prevSig = '/'; prevWord = ''
      continue
    }
    if (!/\s/.test(c)) {
      prevSig = c
      prevWord = /[A-Za-z0-9_$]/.test(c) ? (prevWord + c).slice(-12) : ''
    }
    i++
  }
  return out.join('')
}

// ------------------------------------------------------------------ 定位工具

function makeLocator(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 }
  }
}

// ------------------------------------------------------------------ JS/JSX 规则

function matchBrace(masked, openIdx) {
  let depth = 0
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') { depth--; if (depth === 0) return i }
  }
  return -1
}

const STATEMENT_START = /(^|[;{}])\s*$/

function lintJsSource(rel, code) {
  const found = []
  const masked = maskSource(code)
  const loc = makeLocator(code)
  const push = (offset, rule, message) => {
    const { line, col } = loc(offset)
    found.push({ file: rel, line, col, rule, message })
  }

  let m
  const consoleLog = /console\s*\.\s*log\b/g
  while ((m = consoleLog.exec(masked))) {
    push(m.index, 'NO-CONSOLE-LOG', '禁止 console.log 残留（UI 代码输出请用 console.warn / console.error）')
  }

  const debuggerRe = /(?<![\w$.])debugger\b(?!\s*:)/g
  while ((m = debuggerRe.exec(masked))) {
    push(m.index, 'DEBUGGER', '禁止 debugger 残留')
  }

  // @ts-* 指令只可能出现在注释里，所以这里用「保留注释、抹掉字符串」的遮罩。
  const commentView = maskSource(code, { keepComments: true })
  const directiveRe = /@ts-(?:ignore|nocheck|expect-error)\b/g
  while ((m = directiveRe.exec(commentView))) {
    push(m.index, 'TS-DIRECTIVE', '禁止 @ts-ignore / @ts-nocheck / @ts-expect-error（项目是 JS，不许绕过检查）')
  }

  const catchRe = /(?<![\w$.])catch\s*(?:\([^)]*\)\s*)?\{/g
  while ((m = catchRe.exec(masked))) {
    const open = m.index + m[0].length - 1
    const close = matchBrace(masked, open)
    if (close < 0) continue
    // 注意不要 lastIndex 跳到块的末尾：catch 内部还可能嵌套 catch。
    if (masked.slice(open + 1, close).trim() === '') {
      push(m.index, 'EMPTY-CATCH', '空 catch：捕获后必须 console.warn 并给出可读降级（§0.5）')
    }
  }

  if (isDataFile(rel)) {
    const reactRe = /(?<![\w$.])React\b/g
    while ((m = reactRe.exec(masked))) {
      push(m.index, 'DATA-REACT', 'src/data/*.js 必须是纯 ESM：不得引用 React（§0.6）')
    }

    // import 说明符是字符串，用「保留字符串、抹掉注释」的遮罩才能读到它。
    const stringView = maskSource(code, { keepStrings: true })
    const importRe = /(?<![\w$.])import\s*(?:[^;'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g
    while ((m = importRe.exec(stringView))) {
      if (!STATEMENT_START.test(stringView.slice(Math.max(0, m.index - 2), m.index))) {
        const lineStart = stringView.lastIndexOf('\n', m.index) + 1
        if (stringView.slice(lineStart, m.index).trim() !== '') continue
      }
      const spec = m[1]
      if (!/(^|\/)(components|three)\//.test(spec)) continue
      push(m.index, 'DATA-IMPORT', `src/data/*.js 不得 import ${spec}（§0.6：数据层不得依赖组件/three）`)
    }
  }

  return found
}

function isDataFile(rel) {
  return /(^|\/)src\/data\/[^/]+\.js$/.test(rel)
}

async function checkSyntax(rel, abs, code) {
  const loader = rel.endsWith('.jsx') ? 'jsx' : 'js'
  try {
    await transform(code, { loader, sourcefile: abs, logLevel: 'silent' })
    return []
  } catch (error) {
    const first = error?.errors?.[0]
    const location = first?.location
    return [{
      file: rel,
      line: location?.line ?? 1,
      col: (location?.column ?? 0) + 1,
      rule: 'SYNTAX',
      message: `无法解析：${String(first?.text ?? error.message ?? '').replace(/\s+/g, ' ').slice(0, 200)}`,
    }]
  }
}

// ------------------------------------------------------------------ CSS 规则

/** esbuild 的 css loader 是 bundler 语义：括号不配对也不报错，所以结构检查自己写。 */
function checkCssStructure(rel, code) {
  const found = []
  const loc = makeLocator(code)
  const stack = []
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2)
      if (close < 0) {
        const { line, col } = loc(i)
        found.push({ file: rel, line, col, rule: 'CSS-SYNTAX', message: '注释未闭合' })
        return found
      }
      i = close + 2
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') j++
        j++
      }
      i = j + 1
      continue
    }
    if (c === '{' || c === '(' || c === '[') {
      stack.push({ char: c, offset: i })
      i++
      continue
    }
    if (c === '}' || c === ')' || c === ']') {
      const open = { '}': '{', ')': '(', ']': '[' }[c]
      const top = stack.pop()
      if (!top || top.char !== open) {
        const { line, col } = loc(i)
        found.push({ file: rel, line, col, rule: 'CSS-SYNTAX', message: `多余的 ${c}（没有配对的 ${open}）` })
        return found
      }
      i++
      continue
    }
    i++
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1]
    const { line, col } = loc(top.offset)
    found.push({ file: rel, line, col, rule: 'CSS-SYNTAX', message: `${top.char} 未闭合` })
  }
  return found
}

/**
 * CSS 专用的遮罩：只抹掉注释与字符串，同样保留长度与换行。
 * 不能复用 maskSource——它带 JS 的正则字面量启发式，而 CSS 里 `calc(100% / 3)` 的 `/`
 * 会被误判成正则开头，把该行后面的真实颜色一起抹掉（假绿）。
 */
function maskCss(code) {
  const out = code.split('')
  const blank = (i) => { if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ' }
  let i = 0
  while (i < code.length) {
    const c = code[i]
    if (c === '/' && code[i + 1] === '*') {
      blank(i); blank(i + 1); i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { blank(i); i++ }
      if (i < code.length) { blank(i); blank(i + 1); i += 2 }
      continue
    }
    if (c === '"' || c === "'") {
      blank(i); i++
      while (i < code.length && code[i] !== c) {
        if (code[i] === '\\') { blank(i); blank(i + 1); i += 2; continue }
        if (code[i] === '\n') break
        blank(i); i++
      }
      if (i < code.length && code[i] === c) { blank(i); i++ }
      continue
    }
    i++
  }
  return out.join('')
}

function lintCssSource(rel, code) {
  const found = []
  const masked = maskCss(code)
  const loc = makeLocator(code)
  const push = (offset, message) => {
    const { line, col } = loc(offset)
    found.push({ file: rel, line, col, rule: 'CSS-COLOR', message })
  }

  const propRe = /([-A-Za-z_][\w-]*)\s*:/y
  let i = 0
  while (i < masked.length) {
    propRe.lastIndex = i
    const m = propRe.exec(masked)
    if (!m) { i++; continue }

    // 声明只出现在块/语句起点（否则 a:hover 的选择器会被当成声明）
    let prev = i - 1
    while (prev >= 0 && /\s/.test(masked[prev])) prev--
    if (prev >= 0 && !'{;}'.includes(masked[prev])) { i++; continue }

    const prop = m[1]
    let j = i + m[0].length
    let depth = 0
    let end = masked.length
    let terminator = ''
    for (; j < masked.length; j++) {
      const c = masked[j]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (depth === 0 && (c === ';' || c === '}' || c === '{')) { end = j; terminator = c; break }
    }
    // 值里出现 '{' 说明这是选择器而不是声明
    if (terminator === '{') { i++; continue }

    const isToken = prop.startsWith('--')
    const isMask = /^(?:-webkit-)?mask(?:-image)?$/.test(prop)
    if (!isToken && !isMask) {
      const value = masked.slice(i + m[0].length, end)
      COLOR_RE.lastIndex = 0
      let c
      while ((c = COLOR_RE.exec(value))) {
        const offset = i + m[0].length + c.index
        // url(#grad) 是 svg fragment 引用，不是颜色
        if (/url\(\s*['"]?$/.test(masked.slice(Math.max(0, offset - 12), offset))) continue
        const literal = c[0].trim().replace(/\($/, '()')
        push(offset, `禁止硬编码颜色 ${literal}：颜色必须走 CSS 自定义属性（§0.3）`)
      }
    }
    i = end + 1
  }
  return found
}

// ------------------------------------------------------- §0.6 行为判据：裸 Node import

function checkDataImportable(root, dataFiles, relOf) {
  if (dataFiles.length === 0) return []
  const script = `
const targets = ${JSON.stringify(dataFiles.map((f) => pathToFileURL(f).href))}
for (const spec of targets) {
  try { await import(spec) } catch (error) {
    const message = String((error && error.message) || error).replace(/\\s+/g, ' ')
    console.log('FAIL\\t' + spec + '\\t' + message)
  }
}
`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  })
  if (run.error) {
    return [{ file: 'src/data', line: 1, col: 1, rule: 'DATA-NODE', message: `无法启动 Node 子进程：${run.error.message}` }]
  }
  const found = []
  for (const line of String(run.stdout || '').split(/\r?\n/)) {
    if (!line.startsWith('FAIL\t')) continue
    const [, spec, message] = line.split('\t')
    const file = relOf(spec)
    if (!file) continue
    found.push({
      file, line: 1, col: 1, rule: 'DATA-NODE',
      message: `无 DOM 的 Node 无法 import（§0.6）：${String(message || '').slice(0, 200)}`,
    })
  }
  if (found.length === 0 && run.status !== 0) {
    const detail = String(run.stderr || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' ')
    return [{ file: 'src/data', line: 1, col: 1, rule: 'DATA-NODE', message: `import 探测子进程异常退出 ${run.status}：${detail.slice(0, 200)}` }]
  }
  return found
}

// ------------------------------------------------------------------ 主流程

// ------------------------------------------------- 脚本里的异步断言必须被 await
// ASYNC-CHECK：测试脚本里定义了 `acheck(...)` 这类返回 Promise 的断言包装时，
// 调用处若不 await（也没有在末尾 await Promise.all 兜住），脚本的同步
// `process.exit()` 会在 microtask 出队前结束进程——断言一条都没跑，门禁却是绿的。
// 这不是假想：scripts/test-wardrobe.mjs 曾在 17 条照片管线断言上这么静默了整轮。
function checkAsyncAssertions(rel, code) {
  const violations = []
  const masked = maskSource(code)
  const calls = [...masked.matchAll(/(^|[^.\w])acheck\(/gm)]
  if (!calls.length) return violations
  const awaited = (masked.match(/await\s+acheck\(/g) || []).length
  const drains = /await\s+Promise\.all\(/.test(masked)
  const pendingCalls = calls.length - awaited
  if (pendingCalls <= 0 || drains) return violations
  const first = calls[0]
  const offset = first.index + first[0].length - 'acheck('.length
  const line = masked.slice(0, offset).split('\n').length
  violations.push({
    file: rel, line, col: 1, rule: 'ASYNC-CHECK',
    message: `${pendingCalls} 处 acheck(...) 没有 await，也没有末尾 await Promise.all 兜底：进程会在断言执行前退出`,
  })
  return violations
}

async function lint(root, options = {}) {
  const src = path.join(root, 'src')
  const js = walk(src, JS_RE).sort()
  const css = walk(src, CSS_RE).sort()
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/')
  const violations = []

  for (const abs of js) {
    const code = fs.readFileSync(abs, 'utf8')
    const r = rel(abs)
    violations.push(...await checkSyntax(r, abs, code))
    violations.push(...lintJsSource(r, code))
  }
  for (const abs of css) {
    const code = fs.readFileSync(abs, 'utf8')
    const r = rel(abs)
    violations.push(...checkCssStructure(r, code))
    violations.push(...lintCssSource(r, code))
  }

  const dataFiles = js.filter((abs) => isDataFile(rel(abs)))
  const relOf = (spec) => {
    try {
      const raw = new URL(spec).pathname
      const decoded = decodeURIComponent(process.platform === 'win32' ? raw.replace(/^\//, '') : raw)
      const target = path.resolve(decoded)
      return dataFiles.includes(target) ? rel(target) : null
    } catch { return null }
  }
  if (!options.skipNodeProbe) violations.push(...checkDataImportable(root, dataFiles, relOf))

  // 测试脚本不进 src，但「断言有没有真的执行」同样属于门禁质量，所以一起扫。
  for (const abs of walk(path.join(root, 'scripts'), /\.mjs$/).sort()) {
    violations.push(...checkAsyncAssertions(rel(abs), fs.readFileSync(abs, 'utf8')))
  }

  violations.sort((a, b) => (a.file === b.file
    ? a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule)
    : a.file < b.file ? -1 : 1))
  return { violations, fileCount: js.length + css.length }
}

function report(result) {
  for (const v of result.violations) {
    console.log(`${v.file}:${v.line}:${v.col}  ${v.rule}  ${v.message}`)
  }
  console.log(`${result.fileCount} 个文件, ${result.violations.length} 条违规`)
  return result.violations.length === 0 ? 0 : 1
}

// ------------------------------------------------------------------ 自检

const FIXTURES = {
  'src/app/bad-syntax.jsx': 'export function Broken() {\n  return <div>\n}\n',
  'src/app/console-log.jsx': "export function A() {\n  console.log('debug')\n  return null\n}\n",
  'src/app/debugger.js': 'export function B(x) {\n  debugger\n  return x\n}\n',
  'src/app/empty-catch.js': 'export function C(fn) {\n  try { return fn() } catch (error) {\n  }\n  return null\n}\n',
  'src/app/comment-catch.js': 'export function D(fn) {\n  try { return fn() } catch {\n    // 忽略\n  }\n  return null\n}\n',
  'src/app/ts-ignore.js': '// @ts-ignore\nexport const e = 1\n',
  'src/app/ts-nocheck.js': '/* @ts-nocheck */\nexport const f = 2\n',
  'src/components/Panel.jsx': 'export function Panel({ children }) {\n  return <section>{children}</section>\n}\n',
  'src/data/bad-import.js': "import { Panel } from '../components/Panel.jsx'\nexport const p = Panel\n",
  'src/data/react-user.js': 'export const el = React.createElement("div")\n',
  'src/data/top-level-dom.js': 'export const title = document.title\n',
  // 回归样本：异步断言没有被 await 也没有 Promise.all 兜底（进程会在断言前退出）
  'scripts/bad-async-check.mjs': [
    'const pending = []',
    'const acheck = (label, fn) => {',
    '  const task = (async () => { try { await fn(); console.log(label) } catch (e) { console.error(e) } })()',
    '  pending.push(task)',
    '}',
    "acheck('one', async () => { await Promise.resolve() })",
    "acheck('two', async () => { await Promise.resolve() })",
    'console.log("dump")',
    'process.exit(0)',
    '',
  ].join('\n'),
  'scripts/good-async-check.mjs': [
    'const pending = []',
    'const acheck = (label, fn) => {',
    '  const task = (async () => { try { await fn(); console.log(label) } catch (e) { console.error(e) } })()',
    '  pending.push(task)',
    '}',
    "acheck('one', async () => { await Promise.resolve() })",
    'await Promise.all(pending)',
    'process.exit(0)',
    '',
  ].join('\n'),
  'src/styles/broken.css': '.card {\n  color: var(--ink);\n',
  'src/styles/theme.css': '.card {\n  color: #ff0000;\n  background: rgba(0, 0, 0, 0.4);\n}\n',
  // 回归样本：calc(100% / 3) 里的 `/` 曾被当成 JS 正则开头，把后面真实颜色一起抹掉（假绿）
  'src/styles/calc-slash.css': '.card {\n  width: calc(100% / 3);\n  color: #ff0000;\n}\n',
  'src/app/clean.jsx': [
    'export function Clean({ fn }) {',
    '  try {',
    "    console.warn('[clean] 降级：', fn())",
    '  } catch (error) {',
    "    console.warn('[clean] 失败，已降级：', error)",
    '  }',
    "  const hint = 'console.log 与 debugger 出现在字符串里不算违规'",
    '  const re = /[a-z]+\\/[\'"]/g',
    '',
    '  return <p title={hint}>{re.source}</p>',
    '}',
    '',
  ].join('\n'),
  'src/data/clean.js': [
    "import { findItem } from './catalog.js'",
    '/** 纯 ESM：不引用 document / window / React。 */',
    'export const peek = (id) => findItem(id)',
    'export const hasDom = () => typeof document !== \'undefined\'',
    '',
  ].join('\n'),
  'src/data/catalog.js': 'export const findItem = (id) => (id === \'a\' ? { id } : null)\n',
  'src/styles/clean.css': [
    ':root {',
    '  --bg: #f6f4ef;',
    '  --ink: #1b1c1e;',
    '  --th-nav-bg: rgba(246, 244, 239, 0.88);',
    '}',
    '/* 注释里的 #fff 与 rgba(0,0,0,1) 不算违规 */',
    '.list {',
    '  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 16px, #000 100%);',
    '  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 16px), transparent 100%);',
    '  color: var(--ink);',
    '  width: calc(100% / 3);',
    '  font: 12px/1.5 serif;',
    '}',
    '.link:hover { color: var(--accent); }',
    '',
  ].join('\n'),
}

const EXPECTED = {
  'src/app/bad-syntax.jsx': 'SYNTAX',
  'src/styles/broken.css': 'CSS-SYNTAX',
  'src/app/console-log.jsx': 'NO-CONSOLE-LOG',
  'src/app/debugger.js': 'DEBUGGER',
  'src/app/empty-catch.js': 'EMPTY-CATCH',
  'src/app/comment-catch.js': 'EMPTY-CATCH',
  'src/app/ts-ignore.js': 'TS-DIRECTIVE',
  'src/app/ts-nocheck.js': 'TS-DIRECTIVE',
  'src/data/bad-import.js': 'DATA-IMPORT',
  'src/data/react-user.js': 'DATA-REACT',
  'src/data/top-level-dom.js': 'DATA-NODE',
  'src/styles/theme.css': 'CSS-COLOR',
  'src/styles/calc-slash.css': 'CSS-COLOR',
  'scripts/bad-async-check.mjs': 'ASYNC-CHECK',
}

const CLEAN_FIXTURES = [
  'src/app/clean.jsx',
  'src/components/Panel.jsx',
  'src/data/clean.js',
  'src/data/catalog.js',
  'src/styles/clean.css',
  'scripts/good-async-check.mjs',
]

async function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stylelab-lint-selftest-'))
  let failures = 0
  const say = (ok, text) => {
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`)
  }

  const writeFixtures = (target, only) => {
    for (const [relPath, content] of Object.entries(FIXTURES)) {
      if (only && !only.includes(relPath)) continue
      const abs = path.join(target, relPath)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content)
    }
  }

  try {
    writeFixtures(dir)
    const result = await lint(dir)
    const byFile = new Map()
    for (const v of result.violations) {
      if (!byFile.has(v.file)) byFile.set(v.file, new Set())
      byFile.get(v.file).add(v.rule)
    }

    for (const [file, rule] of Object.entries(EXPECTED)) {
      const got = byFile.get(file)
      say(Boolean(got && got.has(rule)),
        `违规样本被检出：${file} → ${rule}${got ? `（实际：${[...got].join(',')}）` : '（无任何违规）'}`)
    }

    for (const rule of RULE_IDS) {
      const shouldHit = Object.values(EXPECTED).includes(rule)
      const seen = result.violations.some((v) => v.rule === rule)
      say(seen === shouldHit, `规则${shouldHit ? '会红' : '未覆盖'}：${rule}（实际${seen ? '有' : '无'}命中）`)
    }

    for (const file of CLEAN_FIXTURES) {
      const got = byFile.get(file)
      say(!got, `合法样本不误报：${file}${got ? `（误报：${[...got].join(',')}）` : ''}`)
    }

    const cleanViolations = result.violations.filter((v) => CLEAN_FIXTURES.includes(v.file))
    say(cleanViolations.length === 0, `合法样本合计 0 条违规（实际 ${cleanViolations.length} 条）`)

    // 反向确认：只放合法样本时，同一套规则必须归于 0 条
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'stylelab-lint-selftest-ok-'))
    try {
      writeFixtures(dir2, CLEAN_FIXTURES)
      const clean = await lint(dir2)
      say(clean.violations.length === 0, `只含合法样本的目录：0 条违规（实际 ${clean.violations.length} 条）`)
      for (const v of clean.violations) console.log(`      ${v.file}:${v.line}:${v.col}  ${v.rule}  ${v.message}`)
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }

  console.log(failures === 0 ? '自检通过' : `自检失败：${failures} 项`)
  return failures === 0 ? 0 : 1
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const opts = { root: process.cwd(), selfTest: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--self-test') opts.selfTest = true
    else if (arg.startsWith('--root=')) opts.root = path.resolve(arg.slice('--root='.length))
    else if (arg === '--root') opts.root = path.resolve(argv[++i])
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  console.log('用法: node scripts/lint.mjs [--self-test] [--root=<dir>]')
  process.exit(0)
}
if (opts.selfTest) process.exit(await selfTest())
process.exit(report(await lint(opts.root)))

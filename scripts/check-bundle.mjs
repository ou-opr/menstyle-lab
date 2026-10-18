#!/usr/bin/env node
// 构建产物断言：防止「首屏被懒加载本不该加载的东西」这类回归。
//
// ## 为什么需要它
//
// 这不是假想问题，是实测踩到的：为了让 three 缓存更友好，曾经把
// three / fiber / drei 各切一个 chunk（three-core 669KB）。结果 Rollup 必须在
// index chunk 里生成 `import "./three-core-xxx.js"`（副作用导入，保证初始化顺序），
// Vite 见到静态 import 就注入 <link rel="modulepreload">，于是**首屏下载了 three**：
//
//   拆 three：首屏 5 个 js / 395KB（gzip）
//   不拆    ：首屏 2 个 js / 203KB（gzip）
//
// 差 192KB，而 three 只在用户滚到 3D 试衣间时才需要。首屏体积是每个访客每次都要付的钱，
// 缓存收益只影响回访——这笔账算反了，而且从「构建成功」看不出来，只能靠断言兜住。
//
// ## 断言什么
//
//   ① index.html 里被 <script src> 或 <link rel=modulepreload> 引用的 JS，
//      合计（gzip）不超过预算；
//   ② 这些首屏 JS 的名字里不出现 3D 相关的 chunk（three / Mannequin）；
//   ③ 懒加载 chunk 确实存在（否则「没 preload」可能只是因为它根本不在产物里）。
//
// 用法：node scripts/check-bundle.mjs        （需先 npm run build）
//      node scripts/check-bundle.mjs --self-test

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const DIST = path.resolve('dist')
const INDEX = path.join(DIST, 'index.html')

/** 首屏 JS 的 gzip 预算。当前 203KB，留 ~25% 余量；超了就说明有东西被提前加载了。 */
const FIRST_SCREEN_BUDGET_KB = 260

/** 只允许出现在懒加载里的 chunk 关键词（命中即失败）。 */
const LAZY_ONLY = ['three', 'Mannequin', 'garments']

function parseIndexHtml(html) {
  const direct = [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)].map((m) => m[1])
  const preload = [...html.matchAll(/<link[^>]*rel="?modulepreload"?[^>]*\bhref="([^"]+\.js)"/g)].map((m) => m[1])
  // 属性顺序不固定，再兜一遍「href 在 rel 前」的写法。
  const preloadAlt = [...html.matchAll(/<link[^>]*\bhref="([^"]+\.js)"[^>]*rel="?modulepreload"?/g)].map((m) => m[1])
  return { direct, preload: [...new Set([...preload, ...preloadAlt])] }
}

function gzipKb(file) {
  const buf = fs.readFileSync(file)
  return zlib.gzipSync(buf, { level: 9 }).length / 1024
}

/** 把 index.html 里的相对路径解析成磁盘路径（相对给定产物目录，自检时不能写死模块级 DIST）。 */
function resolveAsset(ref, distDir) {
  const clean = ref.replace(/^\.\//, '').split('?')[0]
  return path.join(distDir, clean)
}

export function checkBundle(distDir = DIST) {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: `找不到 ${indexPath} —— 先跑 npm run build` }
  }
  const html = fs.readFileSync(indexPath, 'utf8')
  const { direct, preload } = parseIndexHtml(html)
  const firstScreen = [...new Set([...direct, ...preload])]

  const problems = []
  const rows = []
  let totalKb = 0
  for (const ref of firstScreen) {
    const file = resolveAsset(ref, distDir)
    if (!fs.existsSync(file)) {
      problems.push(`首屏引用了不存在的文件：${ref}`)
      continue
    }
    const kb = gzipKb(file)
    totalKb += kb
    rows.push({ name: path.basename(file), kb })
    const base = path.basename(file).toLowerCase()
    for (const word of LAZY_ONLY) {
      if (base.includes(word.toLowerCase())) {
        problems.push(
          `首屏预加载了懒加载专属 chunk「${path.basename(file)}」（${kb.toFixed(0)}KB gzip）—— `
          + `它只在 3D 试衣间需要，进首屏等于让所有访客为它付费`,
        )
      }
    }
  }
  if (totalKb > FIRST_SCREEN_BUDGET_KB) {
    problems.push(`首屏 JS 合计 ${totalKb.toFixed(0)}KB（gzip），超过预算 ${FIRST_SCREEN_BUDGET_KB}KB`)
  }

  // 懒加载 chunk 必须真的存在：否则「首屏没有」可能只是因为它压根没产出。
  const assetsDir = path.join(distDir, 'assets')
  const jsFiles = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
    : []
  const lazyChunks = jsFiles.filter((f) => LAZY_ONLY.some((w) => f.toLowerCase().includes(w.toLowerCase())))
  if (lazyChunks.length === 0) {
    problems.push('产物里找不到 three/Mannequin 懒加载 chunk —— 3D 试衣间会加载失败')
  }

  return { ok: problems.length === 0, problems, rows, totalKb, lazyChunks, firstScreen }
}

function report(result) {
  if (result.reason) {
    console.error(`[bundle] ${result.reason}`)
    return 2
  }
  console.log(`[bundle] 首屏 JS：${result.rows.length} 个 / ${result.totalKb.toFixed(0)}KB（gzip，预算 ${FIRST_SCREEN_BUDGET_KB}KB）`)
  for (const r of result.rows) console.log(`  ${r.kb.toFixed(0).padStart(4)}KB  ${r.name}`)
  console.log(`[bundle] 懒加载 chunk：${result.lazyChunks.join(', ') || '（无）'}`)
  if (result.ok) {
    console.log('[bundle] 断言通过')
    return 0
  }
  for (const p of result.problems) console.error(`[bundle] ✗ ${p}`)
  return 1
}

// ------------------------------------------------------------------ 自检

function selfTest() {
  let failures = 0
  const say = (okText, text) => {
    if (!okText) failures++
    console.log(`${okText ? 'ok  ' : 'FAIL'}  ${text}`)
  }

  const tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve('dist')), '.bundle-selftest-'))
  // 造一个 gzip 后体积可控的 JS：随机字符串几乎不可压缩，
  // 所以「原文 kb」≈「gzip kb」，便于验证预算断言（重复语句会被压到 1KB）。
  const mk = (name, kb) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let out = ''
    const target = kb * 1024
    while (out.length < target) {
      let line = 'const v' + out.length + '="'
      for (let i = 0; i < 60; i++) line += chars[Math.floor(Math.random() * chars.length)]
      out += line + '";\n'
    }
    fs.writeFileSync(path.join(tmp, 'assets', name), out)
  }
  try {
    fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true })

    // 场景 A：健康产物——首屏只有 index + vendor，three 在懒加载里。
    mk('index-aaa.js', 130)
    mk('react-vendor-aaa.js', 75)
    mk('Mannequin-bbb.js', 200)
    fs.writeFileSync(path.join(tmp, 'index.html'),
      '<script type="module" src="./assets/index-aaa.js"></script>'
      + '<link rel="modulepreload" href="./assets/react-vendor-aaa.js">')
    const good = checkBundle(tmp)
    say(good.ok, `健康产物通过（首屏 ${good.totalKb.toFixed(0)}KB）`)
    say(good.lazyChunks.length === 1, `识别出懒加载 chunk（${good.lazyChunks.join(',')}）`)

    // 场景 B：把 three 拆出来并被 preload —— 这正是踩过的坑，必须失败。
    mk('three-core-ccc.js', 170)
    fs.writeFileSync(path.join(tmp, 'index.html'),
      '<script type="module" src="./assets/index-aaa.js"></script>'
      + '<link rel="modulepreload" href="./assets/react-vendor-aaa.js">'
      + '<link rel="modulepreload" href="./assets/three-core-ccc.js">')
    const bad = checkBundle(tmp)
    say(!bad.ok, '预加载 three 时断言失败（复现了真实踩到的回归）')
    say(bad.problems.some((p) => p.includes('懒加载')), '失败原因指向「preload 了懒加载 chunk」')

    // 场景 C：首屏超预算（没有 three，但总价超了）。
    fs.writeFileSync(path.join(tmp, 'index.html'),
      '<script type="module" src="./assets/index-aaa.js"></script>'
      + '<link rel="modulepreload" href="./assets/react-vendor-aaa.js">'
      + '<link rel="modulepreload" href="./assets/three-core-ccc.js">'.replace('three-core-ccc.js', 'extra.js'))
    mk('extra.js', 200)
    const heavy = checkBundle(tmp)
    say(!heavy.ok, `首屏超预算时失败（${heavy.totalKb.toFixed(0)}KB > ${FIRST_SCREEN_BUDGET_KB}KB）`)

    // 场景 D：产物里没有懒加载 chunk → 说明 3D 会挂，必须失败。
    // 要把**所有**命中 LAZY_ONLY 关键词的文件都删掉：
    // 只删 Mannequin 的话，three-core-ccc.js（场景 B 造的）仍命中 "three"。
    for (const f of fs.readdirSync(path.join(tmp, 'assets'))) {
      if (LAZY_ONLY.some((w) => f.toLowerCase().includes(w.toLowerCase()))) {
        fs.rmSync(path.join(tmp, 'assets', f))
      }
    }
    fs.writeFileSync(path.join(tmp, 'index.html'), '<script type="module" src="./assets/index-aaa.js"></script>')
    const noLazy = checkBundle(tmp)
    say(!noLazy.ok, '缺少懒加载 chunk 时失败（3D 会加载不出来）')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  console.log(failures === 0 ? '[bundle] 自检通过' : `[bundle] 自检失败：${failures} 项`)
  return failures === 0 ? 0 : 1
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  if (process.argv.includes('--self-test')) process.exit(selfTest())
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('用法: node scripts/check-bundle.mjs [--self-test]')
    console.log(`断言：首屏 JS ≤ ${FIRST_SCREEN_BUDGET_KB}KB(gzip)、首屏不含 three/Mannequin、懒加载 chunk 存在`)
    process.exit(0)
  }
  process.exit(report(checkBundle()))
}

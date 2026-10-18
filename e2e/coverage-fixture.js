// E2E 覆盖率收集：让 UI 组件层也有可测量的行覆盖率。
//
// 背景：`scripts/coverage.mjs` 只测 Node 里能 import 的模块，57 个文件里 38 个是
// UI（App.jsx / components/* / three/*），在它的报告里恒为 0%。这些文件的真实行为
// 只由 e2e/smoke.spec.js 的路径兜着，但「兜着」不等于「有数字」。
//
// 做法：Playwright 的 page.coverage 走 V8 精确覆盖（precise coverage），
// 数据与 NODE_V8_COVERAGE 同构，交给 scripts/ui-coverage.mjs 折算成行覆盖率。
//
// 为什么不跨 test 累积在模块变量里：Playwright 每个 test 有独立 page，
// 而 worker 是进程级——模块级数组在「多 worker」时不会共享，单 worker 时又会
// 因为 spec 的 afterAll 早于 worker 关闭而拿到不完整数据。所以改成：
// **每个 test 结束时把自己的 coverage 追加写进同一个 JSONL 文件**，
// 脚本端按 url+range 合并。追加写是原子的（小数据量、单 worker），不需要锁。

import fs from 'node:fs'
import path from 'node:path'

export const OUT_DIR = path.resolve('coverage-e2e')
export const PARTS_FILE = path.join(OUT_DIR, 'parts.jsonl')
export const MERGED_FILE = path.join(OUT_DIR, 'raw.json')

/** 覆盖率采集是否启用（`E2E_COVERAGE=0` 可关掉，用于只看行为不看数字的场景）。 */
export function coverageEnabled(projectName) {
  if (process.env.E2E_COVERAGE === '0') return false
  // 只采 desktop：mobile 是同一套代码，重复采集无意义且耗时翻倍。
  return projectName === 'desktop'
}

/** 开始采集（在 page 创建后、goto 前调用）。 */
export async function startCoverage(page) {
  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false })
    return true
  } catch (error) {
    console.warn('[e2e-coverage] 启动采集失败：', error && error.message)
    return false
  }
}

/** 结束采集并把本次结果追加到 JSONL；返回写入条数。 */
export async function stopAndAppend(page) {
  let entries = []
  try {
    entries = await page.coverage.stopJSCoverage()
  } catch (error) {
    console.warn('[e2e-coverage] 停止采集失败：', error && error.message)
    return 0
  }
  if (!entries.length) return 0
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    // 一行一个 JSON 对象，便于脚本端增量合并、也便于人工 grep。
    fs.appendFileSync(PARTS_FILE, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
    return entries.length
  } catch (error) {
    console.warn('[e2e-coverage] 写入失败：', error && error.message)
    return 0
  }
}

/** 把 parts.jsonl 合并成 raw.json，返回 {entries:number, files:number}。 */
export function mergeParts() {
  if (!fs.existsSync(PARTS_FILE)) return { entries: 0, files: 0 }
  const lines = fs.readFileSync(PARTS_FILE, 'utf8').split('\n').filter((l) => l.trim())
  const entries = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // 半行（进程被 kill）直接跳过，不要因为一行坏数据让整份度量失败。
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(MERGED_FILE, JSON.stringify({ entries }))
  const urls = new Set(entries.map((e) => e.url))
  return { entries: entries.length, files: urls.size }
}

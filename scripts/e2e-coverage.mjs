#!/usr/bin/env node
// UI 层覆盖率一条龙：跑 E2E → 合并 V8 coverage → 折算行覆盖率 → 卡阈值。
//
// ## 为什么需要它
//
// `scripts/coverage.mjs` 只测 Node 能 import 的模块：57 个文件里 38 个是 UI
// （App.jsx / components/* / three/*），在它的报告里恒为 0%，只能靠「有 12 条 E2E」
// 这句话兜着。这个脚本把「兜着」变成「有数字」：
// 用 Playwright 的 page.coverage 采 V8 精确覆盖，按行折算。
//
// ## 为什么单独一条命令，不并进 npm test
//
// E2E 要起 dev server + 真实浏览器，比回归网慢一个量级（约 30s vs 3s），
// 塞进 npm test 会让每次改一行数据都要等半分钟。所以它是独立门禁：CI 里跑，
// 本地按需跑。
//
// ## 口径
//
// 分母只算「被 E2E 实际加载过的 src/ 文件」——没被加载的组件不在这里惩罚，
// 它们的缺席由 `coverage.mjs --max-never-loaded` 那条闸门管。
// 两条线合起来才是完整故事：数据层看 coverage.mjs，UI 层看这个。

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { mergeParts, OUT_DIR, MERGED_FILE } from '../e2e/coverage-fixture.js'
import { measureUiCoverage, report } from './ui-coverage.mjs'

const MIN_LINES = 60

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
}

function main() {
  // 每次从零开始：残留的 parts.jsonl 会让覆盖率虚高（旧用例的 range 混进来）。
  fs.rmSync(OUT_DIR, { recursive: true, force: true })

  console.log('[ui-cov] 跑 E2E（desktop project，含覆盖率采集）…')
  const result = run('npx', ['playwright', 'test', '--project=desktop', '--reporter=line'])
  if (result.status !== 0) {
    console.error('[ui-cov] E2E 失败 —— UI 覆盖率没有意义（测试都没过），先修 E2E')
    return result.status || 1
  }

  const merged = mergeParts()
  if (merged.entries === 0) {
    console.error('[ui-cov] 没有采到任何 coverage 数据。可能原因：E2E_COVERAGE=0、')
    console.error('         或 playwright.config.js 里 project 名不是 desktop。')
    return 1
  }
  console.log(`[ui-cov] 合并 ${merged.entries} 条 coverage 记录（涉及 ${merged.files} 个 URL）`)

  const raw = JSON.parse(fs.readFileSync(MERGED_FILE, 'utf8'))
  const measured = measureUiCoverage({ entries: raw.entries, srcRoot: path.resolve('src') })
  const code = report(measured, MIN_LINES)

  // 报告落盘：CI 的 Job Summary 与本地排查都用它，不必重跑去复现数字。
  const summaryPath = path.join(OUT_DIR, 'summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    minLines: MIN_LINES,
    percent: measured.percent,
    covered: measured.covered,
    total: measured.total,
    fileCount: measured.fileCount,
    pass: code === 0,
    lowest: measured.rows.slice(0, 20),
  }, null, 2))
  console.log(`[ui-cov] 报告：${summaryPath}`)
  return code
}

process.exit(main())

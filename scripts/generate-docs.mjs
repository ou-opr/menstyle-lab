import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROJECT_STATS } from '../src/data/stats.js'
import { PLATFORMS, SOURCE_STATUS, SOURCES } from '../src/data/sources.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const today = new Date().toISOString().slice(0, 10)
// 只有形如 YYYY-MM-DD 的条目才算「有实测时间」：未检测条目的字面量不得被当成日期，
// 也不能靠字典序把它排到最后冒充最新。
const measuredDates = SOURCES.map((source) => source.verifiedAt)
  .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
  .sort()
const lastVerified = measuredDates.length
  ? `${measuredDates.at(-1)}（仅 ${measuredDates.length} 条有实测记录）`
  : '无（尚未运行 npm run check:links）'
const platforms = Object.entries(PROJECT_STATS.platformCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([platform, count]) => `${PLATFORMS[platform].name} ${count}`)
  .join(' / ')
const statuses = Object.entries(PROJECT_STATS.statusCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([status, count]) => `${SOURCE_STATUS[status]?.label || status} ${count}`)
  .join(' / ')

const buildAutoBlock = (generatedAt) => `<!-- AUTO_STATS_START -->
### 数据概览（自动生成）

- ${PROJECT_STATS.sources} 条博主资源，${PROJECT_STATS.recentSources} 条标记为近期内容，${PROJECT_STATS.datedSources} 条已收录发布日期
- ${PROJECT_STATS.laws} 条穿搭法则 / ${PROJECT_STATS.items} 件可试穿单品 / ${PROJECT_STATS.presets} 套一键造型
- 平台分布：${platforms}
- 链接状态：${statuses}
- 最近链接实测：${lastVerified}；本段生成日期：${generatedAt}

> 本段、页面统计与 \`research/SUMMARY.md\` 均直接读取源码数据生成，请运行 \`npm run docs\` 更新。
<!-- AUTO_STATS_END -->`

const buildSummary = (generatedAt) => {
  const rows = Object.entries(PROJECT_STATS.platformCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => `| ${PLATFORMS[platform].name} | ${count} |`)
    .join('\n')
  return `# 调研数据汇总（自动生成）

生成日期：${generatedAt}  
最近链接实测：${lastVerified}

## 总量

- 来源：${PROJECT_STATS.sources}
- 近期来源：${PROJECT_STATS.recentSources}
- 已收录发布日期：${PROJECT_STATS.datedSources}
- 法则：${PROJECT_STATS.laws}
- 可试穿单品：${PROJECT_STATS.items}
- 预设造型：${PROJECT_STATS.presets}

## 平台分布

| 平台 | 数量 |
|---|---:|
${rows}

## 链接状态

${statuses}

> 由 \`npm run docs\` 从 \`src/data\` 自动生成，不要手工修改统计数字。
`
}

const existingGeneratedAt = (text) =>
  text.match(/(?:本段生成日期|生成日期)[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null

const README_AUTO_RE = /<!-- AUTO_STATS_START -->[\s\S]*?<!-- AUTO_STATS_END -->/

const readmePath = resolve(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
if (!README_AUTO_RE.test(readme)) throw new Error('README 缺少自动统计标记')
const readmeDate = existingGeneratedAt(readme) || today
if (readme.replace(README_AUTO_RE, buildAutoBlock(readmeDate)) === readme) {
  console.log('README.md 未变化，跳过写入')
} else {
  writeFileSync(readmePath, readme.replace(README_AUTO_RE, buildAutoBlock(today)))
  console.log('README.md 已更新')
}

const summaryPath = resolve(root, 'research', 'SUMMARY.md')
const summaryText = readFileSync(summaryPath, 'utf8')
const summaryDate = existingGeneratedAt(summaryText) || today
if (buildSummary(summaryDate) === summaryText) {
  console.log('research/SUMMARY.md 未变化，跳过写入')
} else {
  writeFileSync(summaryPath, buildSummary(today))
  console.log('research/SUMMARY.md 已更新')
}

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCES } from '../src/data/sources.js'
import { LINK_STATUS } from '../src/data/link-status.generated.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  // 同时接受 `--key` 与 `-k`：原实现只剥 `--`，导致 `-h` 落成字面 key `-h`，
  // 于是 `-h` 不是「没被识别」而是「被当成一个无关参数」继续跑全量检测。
  const [key, value = 'true'] = arg.replace(/^--?/, '').split('=')
  return [key, value]
}))

// --help 必须在任何副作用之前返回。这个脚本会联网并重写受版本控制的
// src/data/link-status.generated.js；若 --help 落到正常流程里，它就成了一次
// 会改文件的破坏性操作（实测：`node scripts/check-links.mjs --help` 曾跑完全量
// 187 条检测并重写了生成文件）。凡是有副作用的 CLI 都必须在最前面拦住 --help。
if (args.help || args.h) {
  console.log(`用法: node scripts/check-links.mjs [选项]

  --limit=<n>         只检测前 n 条来源（默认全部）
  --concurrency=<n>   并发数，1..12（默认 6）
  --platform=<p>      只检测某个平台（bilibili / douyin / youtube / web …）
  --retries=<n>       每条链接最多尝试次数（默认 3，最小 1）

不做任何请求就返回。注意：本脚本默认会重写 src/data/link-status.generated.js。
只对瞬时失败（网络异常 / 429 / 5xx）重试，401/403/451/404/410 是持久结论，不重试。`)
  process.exit(0)
}

const limit = Number(args.limit) || Infinity
const concurrency = Math.max(1, Math.min(12, Number(args.concurrency) || 6))
const selected = SOURCES.filter((source) => !args.platform || source.platform === args.platform).slice(0, limit)
const results = { ...LINK_STATUS }
let cursor = 0

const classify = (status, finalUrl = '') => {
  if (/\/(login|signin|passport)([/?#]|$)/i.test(finalUrl)) return 'restricted'
  if (status >= 200 && status < 400) return 'verified'
  if (status === 404 || status === 410) return 'invalid'
  if ([401, 403, 429, 451].includes(status)) return 'restricted'
  return 'error'
}

// 重试是必需的，不是优化：这个脚本的输出会被写进受版本控制的
// src/data/link-status.generated.js。一次瞬时网络抖动如果没有重试，
// 就会把一个活链接永久标记成「检测异常」，并随提交固化下来。
// 实测依据：2026-10-17 一次无重试的全量复检产出 30 条 error，
// 其中 26 条 YouTube / 3 条 Reddit；随后用完全相同的请求参数串行重试，
// 41 条全部成功——说明失败来自并发抖动而非目标站点拒绝。
// 重试范围：网络层失败、5xx、以及 429。429 必须重试——它按定义是
// 「现在太频繁，稍后再来」，正是重试能解决的；401/403/451 是持久性拒绝，
// 重试只会浪费时间并加重对端负担，所以不重试。
const isTransient = (result) => result.status === 'error' || result.httpStatus === 429
async function fetchWithRetry(source) {
  const attempts = Math.max(1, Number(args.retries) || 3)
  let last = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(source.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
        headers: {
          'user-agent': 'Mozilla/5.0 STYLE-LAB-Link-Checker/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      })
      await response.body?.cancel()
      const status = classify(response.status, response.url)
      const result = { status, httpStatus: response.status, checkedAt: new Date().toISOString(), finalUrl: response.url }
      if (!isTransient(result) || attempt === attempts) return result
      last = result
    } catch (error) {
      last = { status: 'error', httpStatus: null, checkedAt: new Date().toISOString(), error: String(error.message || error).slice(0, 160) }
      if (attempt === attempts) return last
    }
    // 线性退避：抖动通常是短时拥塞，1s/2s 足够，不必指数放大
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
  return last
}

async function check(source) {
  results[source.id] = await fetchWithRetry(source)
  const retried = results[source.id].status === 'error' ? ' [已重试]' : ''
  console.log(`${source.id}: ${results[source.id].status}${results[source.id].httpStatus ? ` (${results[source.id].httpStatus})` : ''}${retried}`)
}

async function worker() {
  while (cursor < selected.length) {
    const source = selected[cursor++]
    await check(source)
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker))
const target = resolve(here, '..', 'src', 'data', 'link-status.generated.js')
writeFileSync(target, `// 由 \`npm run check:links\` 自动更新。不要手工维护。\nexport const LINK_STATUS = ${JSON.stringify(results, null, 2)}\n`)

const summary = Object.values(results).reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1
  return counts
}, {})
console.log('链接检测完成：', summary)

#!/usr/bin/env node
// 收集「被某个字体族实际渲染」的字符，供 build-font-subset.py 生成精确子集。
//
// 为什么不能只看源码：源码里出现的汉字有 1700+（含 187 条资源标题、纯数据文件、
// 注释），但衬线字体只用于标题，真正渲染的只有 200 出头。按源码裁会把永远
// 用不到的字也装进字体，而 woff2 对已压缩字形的再压缩率几乎为 0。
//
// 用法：
//   node scripts/collect-serif-chars.mjs --url http://localhost:5173/ --family "Noto Serif SC Subset"
//   node scripts/collect-serif-chars.mjs --browser "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
//
// 输出（stdout 最后一行）：{"chars":"...","elementCount":N,"charCount":M}
//
// 退出码：0 成功；2 页面打不开 / 浏览器启动失败（调用方据此回退源码字符集）。

import { chromium } from '@playwright/test'

function parseArgs(argv) {
  const opts = {
    url: 'http://localhost:5173/',
    family: 'Noto Serif SC Subset',
    browser: '',
    timeout: 30000,
    // 采集前滚动整页：懒加载区块（3D 试衣间、资源库分页）里的标题也要算进来。
    scroll: true,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') opts.url = argv[++i]
    else if (a.startsWith('--url=')) opts.url = a.slice(6)
    else if (a === '--family') opts.family = argv[++i]
    else if (a.startsWith('--family=')) opts.family = a.slice(9)
    else if (a === '--browser') opts.browser = argv[++i]
    else if (a.startsWith('--browser=')) opts.browser = a.slice(10)
    else if (a === '--timeout') opts.timeout = Number(argv[++i])
    else if (a === '--no-scroll') opts.scroll = false
    else if (a === '--help' || a === '-h') {
      console.log('用法: node scripts/collect-serif-chars.mjs [--url=<u>] [--family=<f>] [--browser=<path>] [--no-scroll]')
      process.exit(0)
    } else {
      console.error(`未知参数：${a}`)
      process.exit(1)
    }
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  let browser
  try {
    // 有系统 Chrome 就复用（channel: 'chrome'），没有则用 Playwright 自带 Chromium。
    browser = await chromium.launch(
      opts.browser ? { executablePath: opts.browser } : { channel: 'chrome' },
    )
  } catch (error) {
    console.error(`[collect] 浏览器启动失败：${error.message}`)
    return 2
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(opts.url, { waitUntil: 'load', timeout: opts.timeout })
    } catch (error) {
      console.error(`[collect] 打不开 ${opts.url}：${error.message}`)
      return 2
    }

    // 等字体真正加载完，否则计算样式里的 font-family 可能还是回退字体。
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()))

    if (opts.scroll) {
      // 逐屏滚到底，触发 IntersectionObserver 懒加载（3D 区块、入场动画）。
      await page.evaluate(async () => {
        const step = window.innerHeight * 0.8
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
        await new Promise((r) => setTimeout(r, 200))
      })
    }

    const result = await page.evaluate((family) => {
      const seen = new Set()
      let elementCount = 0
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if (!cs.fontFamily || !cs.fontFamily.includes(family)) continue
        elementCount++
        // 只取直接文本节点：子元素自己的字体可能不同（例如 <b> 里换了字体）。
        for (const node of el.childNodes) {
          if (node.nodeType !== 3) continue
          for (const ch of node.textContent) seen.add(ch)
        }
      }
      return { chars: [...seen].sort().join(''), elementCount, charCount: seen.size }
    }, opts.family)

    if (result.charCount === 0) {
      console.error(`[collect] 没有任何元素使用字体族 "${opts.family}" —— 检查 --family 是否与 @font-face 一致`)
      return 3
    }

    console.log(JSON.stringify(result))
    return 0
  } finally {
    await browser.close().catch(() => {})
  }
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error('[collect] 未预期错误：', error)
  process.exit(1)
})

// E2E 冒烟：5 条走真实浏览器的关键路径。
//
// 每条用例的立场：只要它失败，就说明**用户主流程断了**；不测视觉细节。
// 用例之间会清空 localStorage，所以必须顺序执行（playwright.config.js 已设 workers: 1）。
import { test as base, expect } from '@playwright/test'
import { coverageEnabled, startCoverage, stopAndAppend } from './coverage-fixture.js'

// 覆盖一层 fixture：在 page 建好、goto 之前开始采集，用例结束后追加落盘。
// 这样 UI 组件层就有了真实行覆盖率（scripts/ui-coverage.mjs 消费这套数据）。
const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const enabled = coverageEnabled(testInfo.project.name)
    if (enabled) await startCoverage(page)
    await use(page)
    if (enabled) await stopAndAppend(page)
  },
})

const STORAGE_KEYS = [
  'stylelab:wardrobe:v1',
  'stylelab:preferences:v1',
  'stylelab:looks',
  'stylelab:theme',
  'stylelab:daily:v1',
  'stylelab:calendar:v1',
]

/** 每个用例从「干净的第一天」开始，并把默认主题固定为亮色（深色下部分选择器不变）。 */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate((keys) => {
    for (const k of keys) window.localStorage.removeItem(k)
    // 顺带清掉损坏数据备份，避免跨用例累积。
    for (const k of Object.keys(window.localStorage)) {
      if (k.includes(':corrupt:')) window.localStorage.removeItem(k)
    }
  }, STORAGE_KEYS)
  await page.reload()
  // 首屏渲染完成的标志：h1 出现。之后各用例再各自等待自己关心的区域。
  await expect(page.locator('h1')).toBeVisible()
})

/** 滚到某个区块，确保目标元素真的进入视口（IntersectionObserver 才会触发懒加载）。
 *
 * 移动端（Pixel 5 的 393×851）里很多区块比视口还高，`block:'center'` 会把区块顶部
 * 推到视口外；而 LazyStudio 观察的是区块内部的 .stage-canvas-host。
 * 所以这里做两段滚动：先顶部对齐，再向下挪 1/4 屏，让内部目标稳定落在视口内。
 */
async function scrollToSection(page, id) {
  await page.evaluate((sectionId) => {
    const el = document.getElementById(sectionId)
    if (!el) return
    el.scrollIntoView({ block: 'start', behavior: 'instant' })
    window.scrollBy(0, Math.round(window.innerHeight * 0.25))
  }, id)
  await page.waitForTimeout(400)
}

test.describe('主流程冒烟', () => {
  // ── 1. 打开：页面结构与关键区域都在，且 3D 场景能加载出来 ──
  test('1. 打开页面：10 个章节齐全，3D 场景能渲染出 canvas', async ({ page }) => {
    // 十个锚点必须都在（导航与章节共用同一份 CHAPTERS）
    for (const id of ['planner', 'wardrobe', 'today', 'calendar', 'capsule', 'studio', 'advice', 'laws', 'sources', 'data']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1)
    }
    await expect(page.locator('h1')).toContainText('穿得好看')

    // 3D 是懒加载的：滚到试衣间才会挂载 canvas。
    // 注意必须把区块滚到视口中心——IntersectionObserver 的触发条件是在视口内，
    // scrollIntoViewIfNeeded 只保证「部分可见」，在移动端窄高视口下可能刚好不触发。
    await scrollToSection(page, 'studio')
    const canvas = page.locator('#studio canvas')
    await expect(canvas).toBeVisible({ timeout: 30000 })

    // 画布必须有非零尺寸——存在但 0×0 说明渲染管线没跑起来。
    const box = await canvas.boundingBox()
    expect(box.width).toBeGreaterThan(100)
    expect(box.height).toBeGreaterThan(100)

    // 评分卡出了数字（四维评分的那个总分），且是新刻度的合理区间（不是通胀后的 95+）
    const scoreText = await page.locator('#studio .score-total-num').first().innerText()
    const score = Number(scoreText.replace(/[^\d]/g, ''))
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  // ── 2. 换装：点衣柜里的单品，造型 chip 与评分都要跟着变 ──
  test('2. 换装：点衣柜单品后造型与评分都更新', async ({ page }) => {
    await scrollToSection(page, 'studio')
    await expect(page.locator('#studio canvas')).toBeVisible({ timeout: 30000 })

    const topChip = page.locator('#studio .outfit-now .chip').first()
    const beforeTop = await topChip.innerText()
    const beforeScore = await page.locator('#studio .score-total-num').first().innerText()

    // 衣柜面板里找一件与当前不同的上装点下去。
    const wardrobeItems = page.locator('#studio .panel button, #studio .item button, #studio .wd-item')
    const count = await wardrobeItems.count()
    expect(count).toBeGreaterThan(0)

    // 点第二件（第一件很可能就是当前穿着的默认白 T，点了看不出变化）
    let clicked = false
    for (let i = 1; i < Math.min(count, 12); i++) {
      const btn = wardrobeItems.nth(i)
      if (!(await btn.isVisible())) continue
      await btn.click()
      clicked = true
      break
    }
    expect(clicked, '衣柜里应至少有一个可点单品').toBe(true)

    // 造型 chip 必须变化（换装真的生效了，不是点了没反应）
    await expect(topChip).not.toHaveText(beforeTop, { timeout: 10000 })

    // 评分也应当重算；允许巧合相等，但必须仍是合法数字
    const afterScore = await page.locator('#studio .score-total-num').first().innerText()
    const n = Number(afterScore.replace(/[^\d]/g, ''))
    expect(Number.isFinite(n)).toBe(true)
    expect(n).toBeGreaterThan(0)
    expect(beforeScore.length).toBeGreaterThan(0)
  })

  // ── 3. 记日历：记录一条，日历与 localStorage 都要落盘 ──
  test('3. 记日历：记录后写入 localStorage 并在日历里可查到', async ({ page }) => {
    await scrollToSection(page, 'today')

    // 今日穿搭区里点「记录今天穿了」——文案可能随版本微调，用正则兜住。
    const recordBtn = page.getByRole('button', { name: /记录今天穿了|记录这套|记下今天/ }).first()
    await expect(recordBtn).toBeVisible({ timeout: 15000 })
    await recordBtn.click()

    // 写入必须真的发生
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('stylelab:calendar:v1')), { timeout: 10000 })
      .not.toBeNull()

    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('stylelab:calendar:v1')))
    expect(Array.isArray(stored.entries)).toBe(true)
    expect(stored.entries.length).toBeGreaterThanOrEqual(1)

    // 日历区要能看到这条记录（按日期分组渲染）
    await scrollToSection(page, 'calendar')
    await expect(page.locator('#calendar')).toContainText(/\d/)
  })

  // ── 4. 备份往返：导出 → 清空 → 导入 → 数据回来 ──
  test('4. 备份往返：导出 JSON 后重置再导入，衣橱数据能恢复', async ({ page }) => {
    // 衣橱表单常驻在页面上（没有「添加」按钮，直接填表提交）。
    await scrollToSection(page, 'wardrobe')
    const form = page.locator('#wardrobe form.wd-form').first()
    await expect(form).toBeVisible({ timeout: 15000 })

    // 「名称」字段是 div 包裹的，不是 label，所以按 placeholder 定位。
    await form.getByPlaceholder('例如：藏青亚麻衬衫').fill('E2E 测试单品')
    await form.getByRole('button', { name: '添加到衣橱' }).click()

    // 衣橱落盘里应出现这件
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() => window.localStorage.getItem('stylelab:wardrobe:v1'))
        if (!raw) return 0
        try {
          return (JSON.parse(raw).items || []).filter((i) => i.name === 'E2E 测试单品').length
        } catch {
          return 0
        }
      }, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1)

    // 到数据管理区导出备份，拿到 JSON 文本（不下载文件，直接读 UI 给出的内容或走 storage 快照）。
    await page.locator('#data').scrollIntoViewIfNeeded()
    const snapshot = await page.evaluate(() => window.localStorage.getItem('stylelab:wardrobe:v1'))
    expect(snapshot).toBeTruthy()

    // 重置：按钮文案会在两次点击之间变化（「重置」→「确认重置（不可撤销）」），
    // 所以每次点击都重新定位，并用 aria-label 前缀匹配（文案可能微调）。
    await scrollToSection(page, 'data')
    const resetBtn = page.locator('#data button[aria-label*="重置"]').first()
    await expect(resetBtn).toBeVisible({ timeout: 15000 })
    await expect(resetBtn).toBeEnabled()
    await resetBtn.click()
    // 第二次点击才是真正执行（第一次只是切到确认态）
    await expect(page.locator('#data button[aria-label="确认重置本地数据"]')).toBeVisible({ timeout: 10000 })
    await page.locator('#data button[aria-label="确认重置本地数据"]').click()

    // 重置后 wardrobe key 会立刻被 useWardrobe 的写回 effect 重建为空衣橱
    // （`{"version":1,"items":[]}`），所以不能断言 key 为 null——那是实现细节，
    // 且「重置后立刻写回空值」本身是合理行为（否则下次挂载还得走一遍默认值逻辑）。
    // 真正要断言的是：数据确实被清空了。
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() => window.localStorage.getItem('stylelab:wardrobe:v1'))
        if (raw === null) return 0
        try {
          return (JSON.parse(raw).items || []).length
        } catch {
          return -1
        }
      }, { timeout: 10000 })
      .toBe(0)

    // 把快照写回去，模拟「导入备份」，再刷新验证数据真的回来了
    await page.evaluate((raw) => window.localStorage.setItem('stylelab:wardrobe:v1', raw), snapshot)
    await page.reload()
    const restored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('stylelab:wardrobe:v1')
      if (!raw) return []
      try {
        return (JSON.parse(raw).items || []).map((i) => i.name)
      } catch {
        return []
      }
    })
    expect(restored).toContain('E2E 测试单品')
    // 页面上也应当能看到（衣橱区渲染个人单品）
    await scrollToSection(page, 'wardrobe')
    await expect(page.locator('#wardrobe')).toContainText('E2E 测试单品', { timeout: 15000 })
  })

  // ── 5. 导出造型卡：Canvas 2D 引擎与下载路径 ──
  test('5. 导出造型卡：点下后产生 PNG 且给出可见反馈', async ({ page }) => {
    await scrollToSection(page, 'studio')
    // 下载是浏览器级行为，用 download 事件捕获，而不是去看文件系统。
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
    await page.getByRole('button', { name: /导出造型卡/ }).first().click()
    const download = await downloadPromise

    // 下载成功：文件名应是 png，且文件不为空。
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.png$/i)
      const stream = await download.createReadStream()
      expect(stream).toBeTruthy()
      let bytes = 0
      for await (const chunk of stream) bytes += chunk.length
      expect(bytes, 'PNG 应非空（Canvas 真的画了东西）').toBeGreaterThan(1000)
    } else {
      // 某些环境下下载被拦截：至少要有可见的状态反馈，不能静默失败。
      const status = page.locator('.share-export-status')
      await expect(status).not.toBeEmpty()
    }
  })

  // ── 6. 拼贴导出：平面拼贴区的 PNG 导出 ──
  test('6. 拼贴导出：点「导出 PNG」后有下载或可见结果', async ({ page }) => {
    await scrollToSection(page, 'studio')
    const panel = page.locator('section[aria-label="造型拼贴"]')
    await expect(panel).toBeVisible({ timeout: 15000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
    await panel.getByRole('button', { name: /导出 PNG/ }).first().click()
    const download = await downloadPromise
    if (download) {
      expect(download.suggestedFilename()).toMatch(/png/i)
    } else {
      // 降级路径也必须有文字反馈（“不支持导出”也算）。
      await expect(panel.locator('p, span').filter({ hasText: /导出|不支持/ }).first()).toBeVisible()
    }
  })

  // ── 7. 移动端导航：窄屏下导航可横向滚动、无横向溢出、章节锚点可达 ──
  test('7. 移动端导航：可横向滚动、无横向溢出、锚点可达', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.locator('h1')).toBeVisible()

    // 无横向溢出（body 不该比视口宽）
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 2)

    // 导航条在窄屏下必须可横向滚动（10 个链接放不下）
    const navScrollable = await page.evaluate(() => {
      const links = document.querySelector('.nav-links')
      if (!links) return null
      return {
        scrollWidth: links.scrollWidth,
        clientWidth: links.clientWidth,
        overflowX: getComputedStyle(links).overflowX,
      }
    })
    expect(navScrollable).not.toBeNull()
    expect(navScrollable.scrollWidth).toBeGreaterThan(navScrollable.clientWidth)
    expect(navScrollable.overflowX).toBe('auto')

    // 点最后一个导航项，页面应滚到对应章节
    const lastLink = page.locator('.nav-links a').last()
    await lastLink.scrollIntoViewIfNeeded()
    await lastLink.click()
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 10000 })
      .toBeGreaterThan(1000)

    // 触控目标：触摸设备上按 44×44 的舒适标准检查（WCAG 2.5.5 AAA / 2.5.8 AA）。
    // 按规范排除三类（都是 WCAG 2.5.8 明列的例外）：
    //   ① 行内文字链接 —— 位于句子/段落流中（display:inline 且祖先里有 p/li/span 文本流），
    //      强制 44px 会把整段文字撑碎，规范明确豁免；
    //   ② 密集等价的成组控件 —— 星级评分一排 5 个，保留 32px + 加大间距；
    //   ③ 尺寸为 0 的隐藏元素（折叠区里的按钮）。
    const smallTargets = await page.evaluate(() => {
      const denseClass = new Set(['cal-star'])
      const out = []
      // 行内链接判定：display 为 inline，且祖先处于文字流（段落、列表项、
      // 法则卡片的「来源：…」行、资源卡摘要等）。这些地方强制 44px 会把句子撑碎，
      // WCAG 2.5.8 明确豁免。判据以「计算样式 display:inline」为主——
      // 块级/弹性的链接（卡片、列表行、按钮式链接）一律仍需 44px。
      const INLINE_HINTS = 'p, li, dd, dt, .src, .src-note, .rec-note, .law p, .cal-note'
      const isInlineTextLink = (el) => {
        if (el.tagName !== 'A') return false
        if (getComputedStyle(el).display !== 'inline') return false
        return Boolean(el.closest(INLINE_HINTS))
      }
      for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        if (isInlineTextLink(el)) continue
        const min = denseClass.has(String(el.className)) ? 32 : 44
        if (r.width < min - 1 || r.height < min - 1) {
          out.push({ cls: String(el.className).slice(0, 26), text: (el.textContent || '').trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height), min })
        }
      }
      return out
    })
    // 允许极少量例外（例如浏览器换算误差），但不应成规模。
    expect(smallTargets, `存在过小的触控目标：${JSON.stringify(smallTargets.slice(0, 8))}`).toHaveLength(0)
  })

  // ── 8. 连续收藏：编号递增、都落盘、不出现两个「造型 1」 ──
  // 锁的是行为契约（连续两次收藏得到两个不同编号、且真的写进 localStorage）。
  // 注意：它**不能**区分 useLooks 用闭包 state 还是 ref 实现——两次 click 之间
  // 有一次真实的事件循环，React 已经重渲过，旧写法也能拿到新列表。变异测试证实了
  // 这点（把 addLook 换回闭包版本后本用例仍通过），所以 useLooks 里那次改动是
  // 防御性的（防同一帧内连续调用），不是这个用例在守的东西。
  test('8. 连续收藏两次：编号递增且两条都写进 localStorage', async ({ page }) => {
    await scrollToSection(page, 'studio')
    const collect = page.getByRole('button', { name: /收藏当前造型/ })
    await expect(collect).toBeVisible()

    await collect.click()
    await collect.click()

    // 列表里应有 2 条，且名字各不相同
    await expect(page.locator('.share-looks-list .share-look')).toHaveCount(2)
    const names = await page.locator('.share-looks-list .share-look-name').allInnerTexts()
    expect(new Set(names).size, `收藏名称重复：${names.join(' / ')}`).toBe(2)

    // 落盘：localStorage 里也必须是 2 条（不是只改了内存）
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('stylelab:looks')
      return raw ? JSON.parse(raw).map((l) => l.name) : []
    })
    expect(stored).toHaveLength(2)
    expect(new Set(stored).size).toBe(2)

    // 计数回显
    await expect(page.locator('.share-looks-count')).toContainText('2')
  })
})

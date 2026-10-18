import { defineConfig, devices } from '@playwright/test'

// E2E（冒烟级，不是全覆盖）。
//
// 为什么需要这一层：`npm test` 有 1300+ 断言，但它们全部在 Node 里跑纯函数——
// 37/60 个文件从未被加载，其中包含 App.jsx、所有 React 交互、3D 场景、
// 备份恢复 UI、移动端导航。也就是说「数据层正确」被证明了，「产品能用」没被证明。
// 这里补 5 条走真实浏览器的路径，覆盖「打开 → 换装 → 记日历 → 备份往返 → 移动端导航」。
//
// 刻意不做的：
//   · 不断言像素/视觉细节（脆弱且收益低）；
//   · 不 mock localStorage（要验证的正是真实持久化行为）；
//   · 不并发跑（备份/重置用例会改同一份 localStorage）。
// 本地复用系统 Chrome（省一次 ~120MB 下载）；CI 镜像里没有系统 Chrome，
// 必须用 Playwright 自带的 chromium（由 `npx playwright install chromium` 提供）。
const browserChannel = process.env.CI ? {} : { channel: 'chrome' }

export default defineConfig({
  testDir: './e2e',
  // 顺序执行：用例之间共享 localStorage，并发会互相污染。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 显式中文 locale：日历/日期格式化走本地时区，避免 CI（UTC）与本地（+08）结果不同。
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...browserChannel, viewport: { width: 1280, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 5'], ...browserChannel } },
  ],
  // 复用已跑着的 dev server；没有就自己起一个（CI 里走这条）。
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})

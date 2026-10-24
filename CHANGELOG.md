# 更新日志 · CHANGELOG

口径：按 [SemVer](https://semver.org/lang/zh-CN/) 记录「面向使用者的变化」，不逐条罗列重构。
**当前发布点 `v1.2.0`**；首个发布周期 2026-10-16 → 2026-10-18。

## [1.2.0] — 2026-10-24

依赖升级第二步：React / Three 生态整体上一个代际（维护手册 §五 的遗留项就此清零）。

### 变更
- React 18.3 → **19.3**、`@react-three/fiber` 8 → 9、`@react-three/drei` 9 → 10、three 0.169 → **0.186**。
- 首屏 JS 201KB → **195KB**（gzip）——React 19 运行时更小，预算 ≤260KB 断言继续通过。
- 懒加载 3D chunk 210KB → **271KB**（gzip）：drei 10 的依赖面更大。它只在进 3D 试衣间时下载，
  不占首屏预算；首屏访问者完全不受影响。

### 验证
- `npm test` exit 0；`check:bundle` / `build:single` / E2E 冒烟 16/16 / UI 覆盖率门禁全部通过。
- 浏览器控制台冒烟（打开页面 + 懒加载 3D + 换装）0 error / 0 warning，无 React 19 deprecation 提示。
- `src/` 源码**零改动**即兼容：`Canvas` / `useThree` / `OrbitControls` / `ContactShadows` /
  `RoundedBox` / `RoomEnvironment` 均为新版保留 API。

## [1.1.0] — 2026-10-24

工具链升级轮：按维护手册「先升 vite 生态 → 再升 React」的既定路线完成第一步。

### 变更
- **vite 生态升级**：vite 5.4 → 7.3、`@vitejs/plugin-react` 4 → 5、直接依赖 esbuild 0.21 → 0.28、
  `vite-plugin-singlefile` 2.3.3 → 2.3.4。React / Three 运行时版本未动，产物行为不变。
- **安全通告清零**：`npm audit` 从 2 条（esbuild dev server 漏洞，1 high + 1 moderate，
  只影响本地开发服务器、不影响产物与线上站点）降到 0 条。

### 性能
- 首屏 JS 203KB → **201KB**（gzip，预算 ≤260KB 断言继续通过）；懒加载 Mannequin 206KB → 210KB。

### 验证
- `npm test`（离线 16 步）exit 0；`check:bundle`、`build:single` 通过；
  E2E 冒烟 16/16（desktop + mobile）；UI 覆盖率门禁（≥60%）通过。
- React 19 / fiber 9 / drei 10 / three 0.186 仍按计划留作第二步，见 `docs/MAINTENANCE.md` §五。

## [1.0.0] — 2026-10-18

首个正式发布点。包含 3D 换装试衣间、造型推荐引擎、穿搭日历/胶囊衣橱、全网博主资源库，以及一套可复跑的质量门禁。

### 新增
- **E2E 冒烟层**（Playwright，desktop / mobile 两个 project），CI 增加独立的 E2E job（Chromium）。
- **UI 层真实行覆盖率**统计（`scripts/ui-coverage.mjs`），口径改为「已加载文件」，补上覆盖率长期缺失的另一半。
- **产物体积预算断言**（`scripts/check-bundle.mjs`）：超预算直接失败，防止「优化后被悄悄改回去」。
- 照片管线补全格式与体积约束；字体子集化（两个字重合计 152KB）。
- `docs/` 增加**能力边界**小节——明确哪些事做不到，避免过度承诺。
- `docs/REVIEW-FOLLOWUP.md`：第二轮评审的逐条处理报告。

### 变更
- 3D 试衣间**模型与材质质量**提升；PBR 贴图真正生效（修 WebGL2 不可变存储导致的 2×2 卡死）。
- 质量门禁改为**三重判定**（不再只看单一指标）。
- 「近期」标签口径修正，避免用发布日期冒充更新日期。
- 资源库重建：187 条外部资源全量复核，借登录态补全 YouTube / 抖音 / 小红书的真实互动数据。

### 性能
- 首屏 JS **395KB → 203KB（-49%）**，并加产物预算断言锁住收益。

### 修复
- 审计修复轮：P1 三件 + P2 八条。
- 第三方评审中被确认为真的修复项（P0 / P1 / P2 逐条核验，不照单全收）。
- 第二轮复查：10 条 P0 + 6 条 P1。
- 17 条**异步断言从未执行**（测试长期假绿）——已修复并纳入门禁。
- 187 条资源复核中修复 1 条失效链接、5 处数据错标。

### 测试
- 用 `ci-red-check` 分支**故意制造失败**，确认 CI 门禁真的会红（不是永不失败的形式主义）。

# 维护手册 · MAINTENANCE

> **基线：v1.2.0（2026-10-24）**。仓库历史从 v1.0.0 提交起算，之前的开发期迭代已按发布需要重置。
> 本文档说明「日常改什么、跑什么门禁、怎么发版、什么需要定期看」。

## 一、基线数字

| 项 | v1.2.0 |
|---|---|
| 提交 | 1 个（`型格 STYLE LAB 1.0.0`）+ 后续维护提交 |
| 跟踪文件 | 182 |
| `.git` | 3.8 MB |
| 依赖 | React 19.3 · Three 0.186 · fiber 9 · drei 10 · Vite 7.3 · Playwright 1.64 |
| 门禁 | `npm test` 20 余项 + E2E 冒烟层（desktop / mobile） |
| 首屏 JS | 195 KB（预算断言守住，超了直接失败；懒加载 3D chunk 另计 271 KB） |
| UI 层行覆盖率 | 70.29% |
| 线上 | https://ou-opr.github.io/menstyle-lab/ |

## 二、日常改动：改哪里 → 跑什么

| 想改什么 | 改哪里 | 必须跑 |
|---|---|---|
| UI 组件 / 交互 | `src/components/`、`src/app/` | `npm test`（含 lint 与覆盖率） |
| 造型引擎 / 打分规则 | `src/data/advice.js`、`personalRecommendations.js`、`conflicts.js` | `npm test`（硬冲突口径三处必须一致） |
| 单品目录 | `src/data/catalog.js` + `scripts/validate.mjs` 的断言 | `npm run validate` + `npm test` |
| 博主资源库 | `src/data/sources.js`（HTML 由 `test-sources.mjs` 用真实 SSR 断言） | `npm run test:sources` |
| 样式 | `src/styles/` | `npm test`（含 CSS 令牌与硬编码颜色检查） |
| 文案 | `src/**` 里的中文 | `node scripts/build-font-subset.py`（**改中文必须重跑**，否则字体子集缺字） |

**改完至少跑 `npm test`**。它依次跑：lint → lint 自检 → 覆盖率自检 → 产物预算自检 →
数据校验 → 引擎 → 衣橱 → 偏好 → 备份 v1 → 备份 v2 → 日历 → 胶囊 → 体型 → 收藏 → 造型形状 →
分享 → 资源库 → 拼图。

单项速查：

```bash
npm run test:engine      # 造型引擎语义
npm run test:sources     # 资源库（真实 SSR 渲染断言）
npm run check:bundle     # 产物预算（首屏体积）
npm run coverage:ui      # UI 层真实行覆盖率
npm run test:e2e         # Playwright 冒烟（需要浏览器）
```

## 三、发版流程

```bash
# 1) 改版本号（package.json 的 version）
# 2) 更新 CHANGELOG.md
# 3) 构建验证（prebuild 会自动跑 npm test + docs）
npm run build            # 产物 dist/
npm run build:single     # 单文件版 dist-single/（可直接双击）

# 4) 提交 + 打 tag + 推送
git add -A && git commit -m "release: v1.1.0"
git tag -a v1.1.0 -m "style lab 1.1.0"
git push origin main --follow-tags

# 5) 建 Release
gh release create v1.1.0 --title "1.1.0" --notes-file notes.md --verify-tag
```

- **pre-push 钩子会自动跑一遍 `npm test`**（装了 hooks 才有，见 `npm run hooks:install`）。内容没变只改文档时可 `--no-verify` 跳过。
- **不要**用 `gh release delete --cleanup-tag`（会连本地 tag 一起删）。

## 四、定期维护

| 频率 | 做什么 | 怎么查 |
|---|---|---|
| 每月 | 依赖漏洞 | `npm audit`（v1.1.0 起清零） |
| 每月 | 资源库链接状态 | `npm run test:freshness`（checkedAt 距今是否 ≤ 30 天） |
| 每季 | 依赖大版本评估 | `npm outdated` |
| 有新版 Three / React 时 | 单独评估，别跟日常改动混在一次提交里 | 改完必须重跑 `npm test` + `npm run check:bundle` |

**如需自动依赖更新**：可加 `.github/dependabot.yml`（monthly + 分组），但个人项目会被 PR 噪音打扰，按需启用。

## 五、已知遗留（都是有意为之）

- **~~安全漏洞剩 2 个~~ 已在 v1.1.0 修复**：原来是 `esbuild <= 0.24.2` 的开发服务器漏洞
  （1 moderate + 1 high，经 vite 5.4 传递引入，只影响本地 dev server、不影响产物与线上站点）。
  v1.1.0 升级 vite 5.4 → 7.3（esbuild 0.28）后 `npm audit` 清零。
- **~~依赖落后一个大版本~~ 已在 v1.1.0 + v1.2.0 完成**：vite 生态（vite 7 / plugin-react 5 /
  esbuild 0.28 / singlefile）在 v1.1.0，React 19 + fiber 9 + drei 10 + three 0.186 在 v1.2.0
  （`src/` 零改动兼容）。剩余候选：vite 8（plugin-react 5 已声明支持；其 React 插件 6 才需要
  rolldown 生态，届时单独评估）。
- **懒加载 3D chunk 变大（271KB gzip）**：drei 10 的依赖面比 9 大，已如实记录在 CHANGELOG。
  它不进首屏预算；若未来想压回去，可评估从 drei 换成手写 OrbitControls 包装（有真实需求再做）。
- **`reports/` 入库**（23 个文件 / 约 2MB）：是评审对比图，作为证据保留。
- **`node_modules` / `dist` / `coverage-e2e` 不入库**：`coverage-e2e` 在磁盘上可达 262MB，可随时删（每次 E2E 重建）。
- **备份**：`D:\穿搭\_backup\menstyle-lab-history-*.bundle`（4.3MB）是重置前的完整历史。

## 六、CI 与部署

| 工作流 | 触发 | 内容 |
|---|---|---|
| `verify.yml`（CI） | push / PR | 离线回归 + E2E（Chromium） |
| `pages.yml` | push main | `npx vite build` → 上传 `dist/` 到 GitHub Pages |

部署是自动的：推到 `main` 就重新发布。`vite.config.js` 的 `base` 是 `'./'`、路由用 hash，
所以部署在 `/menstyle-lab/` 子路径不需要额外配置。

# 型格 STYLE LAB · 男士穿搭实验室

一个集 **个性化造型推荐 + 3D 换装试衣间 + 实时穿搭建议引擎 + 全网博主资源库** 于一体的男士穿搭网站。

## 快速开始

```bash
# 开发模式（热更新）
npm run dev          # 打开 http://localhost:5173

# 生产构建
npm run build        # 产物在 dist/（配合 npm run preview 或部署使用）

# 单文件版（可直接双击打开，无需任何服务器）
npm run build:single # 产物在 dist-single/index.html，所有 JS/CSS 已内联
npm run build:release # 生成单文件版，并同步根目录「型格穿搭实验室-双击打开.html」
npm run preview      # 本地预览构建产物 http://localhost:4173
```

> ⚠️ **关于双击打开**：直接双击 `index.html` 或 `dist/index.html` 会白屏——浏览器安全策略禁止
> `file://` 协议加载模块脚本（页面会给出提示）。请双击「单文件版」`dist-single/index.html`
> （工作区根目录也放了一份 `型格穿搭实验室-双击打开.html`）。

## 如何自检（离线可跑）

```bash
npm test                # 16 步串联：lint + 引擎 / 衣橱 / 偏好 / 日历 / 收藏 / 分享 / 拼图 / 来源 …
npm run validate        # 建议引擎 16 上装 × (下装 / 鞋 / 配饰) 全量穷举检查
npm run lint            # 零依赖静态检查（语法 / console.log / debugger / 空 catch / CSS 硬编码色 / data 纯净性）
npm run coverage        # 零依赖行覆盖率（已加载文件口径，阈值 50% + 未加载文件 ≤40 + 测试全绿）
npm run test:e2e        # 浏览器端到端冒烟（Playwright，8 条 × 桌面/移动）
npm run test:e2e:coverage # 跨上面那条 + 采集 UI 层真实行覆盖率（阈值 60%）
npm run test:freshness  # 严格校验链接数据新鲜度：check:links 超过 30 天未复检即失败（发布前 / CI 用）
npm run check:links     # 联网复检 187 条来源链接，并刷新链接状态文件
```

> `npm test`、`npm run validate`、`npm run lint`、`npm run coverage` **完全离线、不写任何文件**
> （覆盖率的临时产物落在系统临时目录并自行清理），可随时当回归网用；
> `npm run check:links` 是唯一的联网步骤，结果写入 `src/data/link-status.generated.js`。
> 它只对瞬时失败重试（网络异常 / 429 / 5xx，线性退避 1s/2s，`--retries` 可调）；
> `401/403/451/404/410` 是持久结论，不重试。`--help` / `-h` 纯打印、零请求、零写入。

## 门禁

三道门，都能真正变红，不是「写了个文件」：

| 门禁 | 触发点 | 如何证明它会红 |
|---|---|---|
| `npm run lint` | 已并入 `npm test` 第一步与 CI | `npm run lint:self-test`（11 条规则各喂一个违规样本 + 7 个合法样本断言不误报）；或往任意 `src/` 文件加一行 `console.log` |
| `npm run coverage` | CI（仅 Node 22 一格） | **三重判定**：覆盖率达标 **且** 全部测试子进程 exit 0 **且** 未加载文件数 ≤ 40（`--max-never-loaded`）——只查覆盖率时，测试脚本全红也能「通过」。判定用的是**已加载文件口径**（当前 93.88%，阈值 50），因为把「从未被 import 的组件」按 0% 计入总分会让它只反映「有多少文件没被测试加载」，新增一个模块就自动跌破阈值（详见 `docs/GATE-REVIEW.md` §5.2）。全量口径（当前 42.17%，4339/10290）只作为记录打印，不参与判定。要上调就改 `package.json` 里的 `--min-lines`。只在 Node 22 跑，是因为行列覆盖率不应随 V8 版本漂移——两格都跑会让棘轮变成「随机红/绿」 |
| `.githooks/pre-push` | `git push` 前跑 `npm test` | 破坏任一测试后推送会被拒（已在临时 bare 仓库实测红/绿对照）；`SKIP_TESTS=1 git push` 可临时跳过 |

```bash
npm run hooks:install     # 启用 pre-push 门禁（git config core.hooksPath .githooks）
npm run hooks:uninstall   # 卸载
```

> `npm run lint:self-test` 与 `npm run coverage:self-test` 是这两个脚本的**自检**：
> 它们先证明「自己会在坏代码上变红、且在好代码上不误报」，再谈基线是否通过。
> 这是本项目此前的教训——`test-sources.mjs:361-362` 曾被误认为恒真断言，
> 用变异测试（把 `Sources.jsx` 的排序改反）证实它确实会红，详见
> `docs/GATE-REVIEW.md`。
>
> 覆盖率**排除生成物**（`*.generated.*` / `*.gen.*` / `*.auto.*`）。理由是它会让棘轮失效：
> `link-status.generated.js` 由 `npm run check:links` 生成，基线 11 行，跑一次真实联网复检
> 变成 936 行（187 条记录），且整份被 `import`。分子分母**各涨 936**。
> 于是覆盖率凭空上涨（+9.12pp 量级），也就是说，谁跑一次 `check:links` 就能免费抬高覆盖率，
> 棘轮形同虚设。排除后不再随数据刷新漂移。报告里会打印
> 「已排除生成文件 N 个 / M 行」——只让数字悄悄变化是另一种假绿。
>
> > 本段与 `docs/GATE-REVIEW.md` 里的百分数是**当时（2026-10-17）的实测快照**，
> > 分母随后因新增模块而增长，不必与当前打印的数字一致；要认数字请直接跑一次
> > `npm run coverage`，它的输出才是唯一权威。当前基线：全量 42.17%（4339/10290）、
> > 已加载文件口径 93.88%、未加载文件 38 个、已排除生成文件 936 行。
>
> CI（`.github/workflows/ci.yml`）已在私有仓库 `ou-opr/menstyle-lab` 上真实运行：
> Regression(node 20 / 22)、Coverage、E2E smoke(Chromium)、Source freshness 五个 job。
> 推送到 `main` 即触发；本地 pre-push 门禁只在本机有效（需先 `npm run hooks:install`）。

> 两条已知的时间相关行为，都不是环境故障：
> 1. 链接数据新鲜度（`check:links` 超过 30 天未复检）在 `npm test` 里**只打印 `WARN`、不计入失败**——
>    离线回归网不该被日历卡住；需要硬门槛时单独跑 `npm run test:freshness`
>    （即 `node scripts/test-sources.mjs --freshness-only`），过期即 exit 1，适合发布前或 CI 卡点；
> 2. 资源库里没有实测记录的条目一律显示「待验证」，不会用平台启发式假装「已验证」。


## 首屏体积预算（带断言，不是口号）

`npm run check:bundle` 断言三件事（需先 `npm run build`）：

1. 首屏 JS（`<script src>` + `<link rel=modulepreload>` 引用的，按 gzip 计）≤ **260KB**；
2. 首屏 JS 的文件名里不出现 `three` / `Mannequin`；
3. 懒加载 chunk 确实存在（否则「首屏没有」可能只是它压根没产出，3D 会挂）。

> 为什么要这条断言：为了让 three 缓存更友好，曾经把 three / fiber / drei 各切一个 chunk。
> 但一旦 three 成为独立 chunk，Rollup 必须在 index 里生成 `import "./three-core-xxx.js"`
> （副作用导入，保证初始化顺序），Vite 见到静态 import 就注入 `modulepreload`——
> **首屏一下多了 192KB（gzip）395KB vs 203KB**，而 three 只在滚到 3D 试衣间时才需要。
> 首屏体积是每个访客每次都要付的钱，缓存收益只影响回访——这笔账算反了。
> 现在只拆 `react-vendor`，three 全留在懒加载 chunk 里：**首屏 2 个 js / 195KB**，
> 进 3D 才拉 Mannequin 271KB。

**实测对照**（preview 构建，`performance.getEntriesByType('resource')`）：

| 方案 | 首屏 JS | 进 3D 后额外 |
|---|---|---|
| 拆 three-core / fiber / drei | 5 个文件 / **395KB**（含 three-core 173KB） | 0（已预载） |
| 只拆 react-vendor（当前） | 2 个文件 / **195KB** | 271KB（Mannequin） |

## 覆盖率的两条线（各管一半，别只看一个数）

覆盖率不是一个数字能说完的事。本项目把它拆成两条互补的线：

| 线 | 命令 | 口径 | 当前值 | 管什么 |
|---|---|---|---|---|
| 数据层 | `npm run coverage` | 被 Node 测试 import 过的文件 | **93.88%**（4339/4622 行） | `src/data/*` 纯函数、校验、合并策略 |
| 全量（含未加载） | 同上，报告首行 | 全部 `src/` 文件 | 42.17%（4339/10290） | 有多少文件根本没被测（闸门：未加载 ≤40） |
| UI 层 | `npm run coverage:ui` | 被 E2E 实际执行过的文件 | **70.29%**（7233/10290 行） | `App.jsx`、`components/*`、`three/*` |

> 为什么需要第二条线：57 个文件里有 38 个是 UI，它们在 Node 测试里**恒为 0%**
> （Node 里 import 不了 `.jsx`）。在引入 UI 覆盖率之前，这 38 个文件的真实行为
> 只由「有 E2E」这句话兜着——那是承诺，不是数字。
> 现在用 Playwright 的 V8 精确覆盖采到真实执行行，UI 层有了可卡的阈值（60%）。

> 两条线都带自检（`coverage:self-test` / `coverage:ui:self-test`）：
> 先证明「阈值确实会红」，再谈基线是否达标。见 `docs/GATE-REVIEW.md`。

## 功能说明

### 1. 个性化造型推荐
- 填写身高、体型、季节和场景，生成最适合的三套现有衣柜造型
- 每套提供 100 分制适配评分、推荐理由、穿搭雷区和原始内容来源
- 点击「在 3D 试衣间试穿」即可把整套造型同步到模特

### 2. 3D 试衣间（浏览器实时渲染）
- 程序化构建的风格化 3D 男士模特（Three.js / React Three Fiber）
- 左键拖动旋转、滚轮缩放、可开启自动旋转
- 右侧「衣柜」5 个分类页签：内搭上装 / 外套 / 裤装 / 鞋履 / 配饰，点击即上身
- 配饰为多选（腕表、项链、棒球帽、眼镜、斜挎包、围巾），可叠加
- 「一键造型」19 套灵感预设：新手安全牌 / 街头机能 / 秋日约会 / 通勤体面 / 秋冬层次 / 黑白灰禁欲 / 清爽校园 / 夏日短裤 / 周末城市 / 露营户外 / 音乐节 / 正式晚宴 / 梅雨季 / 酷暑 / 寒冬 / 健身通勤 / 朋友婚礼 / 看展 / 居家

### 3. 穿搭建议引擎（数据驱动）
- 换任何一件上装，页面自动给出该配色/品类下的**下装、鞋子、配饰**建议与理由
- 内置冲突检测：皮鞋×短裤、跑鞋×西装、配饰超 3 件等雷区提醒
- 细节技巧：塞衣角、卷袖口、领口扣法、同色系显高等
- 每条建议附「思路来自 XXX（平台）」，点击「试试这件 →」直接上身

### 4. 穿搭法则 + 博主资源库
- 16 条从调研中提炼的通用法则（三色原则、三分法则、尺寸公式、buy nice or buy twice…），每条附原始出处链接
- 每条来源展示发布日期、最后验证时间、链接状态、观点类型与编辑入选理由
- 小红书笔记链接带访问凭证，可通过 `npm run check:links -- --platform=xiaohongshu` 批量复检

<!-- AUTO_STATS_START -->
### 数据概览（自动生成）

- 187 条博主资源，3 条标记为近期内容，155 条已收录发布日期
- 16 条穿搭法则 / 59 件可试穿单品 / 19 套一键造型
- 平台分布：哔哩哔哩 69 / YouTube 36 / 小红书 30 / 抖音 20 / 知乎 9 / 其他平台 7 / Reddit 5 / 少数派 4 / 豆瓣 4 / 虎扑 3
- 链接状态：已验证 146 / 访问受限 41
- 最近链接实测：2026-10-18（仅 187 条有实测记录）；本段生成日期：2026-10-18

> 本段、页面统计与 `research/SUMMARY.md` 均直接读取源码数据生成，请运行 `npm run docs` 更新。
<!-- AUTO_STATS_END -->

## 调研数据来源（research/ 目录）

| 文件 | 内容 |
|---|---|
| `bilibili.md` | B站男士穿搭调研：34 个高播放视频 + 18 位头部 UP主（浏览器实测抓取并经 B站 API 验证） |
| `youtube-reddit.md` | YouTube 14 个视频 + Reddit 7 个帖子（全部经页面抓取验证有效） |
| `cn-platforms.md` | 知乎/少数派/虎扑/豆瓣/抖音等中文图文平台调研（链接均来自真实搜索结果） |

## 技术栈

React 19 · Vite 7 · Three.js 0.186 · @react-three/fiber 9 · @react-three/drei 10
（3D 模特与全部服装网格均为程序化建模，无外部模型资源，可离线运行）

## 目录结构

```
src/
├── data/
│   ├── catalog.js      # 服装目录与预设造型
│   ├── advice.js       # 建议引擎 + 穿搭法则
│   ├── recommendations.js # 身高/体型/季节/场景推荐排序
│   └── sources.js      # 博主资源库（各平台链接）
├── three/
│   └── Mannequin.jsx   # 3D 模特、服装网格、舞台灯光
├── components/         # 衣柜面板 / 建议面板 / 法则 / 资源库
└── App.jsx
```

## 能力边界（重要，请先读这一段）

这个项目的定位是**「穿搭知识库 + 3D 试穿台」**，不是电商、不是社交产品。
下面几条是刻意的设计边界，不是「还没做完」：

| 维度 | 实际能力 | 明确不提供 |
|---|---|---|
| 数据 | **纯本地**：全部数据存在浏览器的 localStorage / IndexedDB 里 | 无账号、无云端、无多设备同步；换设备请手动「导出备份 → 导入」 |
| 多标签页 | 已监听 `storage` 事件做**跨标签页同步**（另一页改动会自动重读） | 无冲突合并：同一时刻两页都改同一份数据时，以最后写入为准 |
| 3D | **风格化程序化模特**：几何体代码生成，用于「看配色与比例关系」 | 不是写实版型拟合，不模拟面料垂坠/褶皱，不能判断合身度 |
| 单品 | **59 件程序化单品**，是风格参考坐标 | 不是可购买的真实商品：无价格、无库存、无购买链接（`ref` 字段是风格参考，不是商品页） |
| 推荐 | 基于规则的**可解释评分**（配色/正式度/轮廓/完成度四维），每条建议都标注来源 | 不是机器学习模型，不学习你的身材数据；分数用于横向比较，不是绝对标准 |
| 资源库 | 187 条人工调研的博主内容，链接会定期复检 | 不保证链接长期有效（平台内容会下架）；页面会显示最后验证时间 |

**关于「穿搭建议」的可信度**：所有法则与建议都整理自公开的博主视频/帖子，
每条都带原始出处。但穿搭本身没有标准答案，本项目提供的是**可追溯的思路**，
不是「照做就好看」的保证。

## 许可与第三方

- **代码**（`src/**`、`scripts/**`、`e2e/**`、构建配置）：**MIT**
- **站点文字内容**（README、`docs/**`、`research/**`、站内文案）：**CC BY-NC 4.0**（署名 + 非商业）
- **第三方资源**：
  - 面料 PBR 贴图来自 **Poly Haven（CC0）**，逐项来源见 `src/assets/textures/pbr/SOURCES.json`
  - 中文衬线字体为 **Noto Serif SC**（**SIL OFL 1.1**）的子集化版本，完整许可见 `src/assets/fonts/OFL.txt`
  - 视频与博主内容版权归各平台创作者，本项目**只做链接整理与官方播放器嵌入**

完整条文：[代码 MIT](LICENSE) · [文字内容与第三方资源](LICENSE-CONTENT.md)。

## 免责声明

建议内容整理自公开网络视频与帖子，版权归原作者所有；穿搭无标准答案，本站提供的思路仅供参考。

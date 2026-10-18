# 共享接口契约 v1（冻结，任何队友不得单方面修改）

> 本文件由调度者（Lead）维护。五支并行工作流必须严格遵守本契约中的
> **文件所有权**、**数据形状**、**新单品 ID 清单**。若发现契约本身有缺陷，
> 回报给 Lead，由 Lead 修改本文件后广播，不得自行改动。

## 0. 全局硬约束（对所有人）

1. **不得新增任何 npm 依赖**。`package.json` 的 `dependencies` / `devDependencies` 只能由 Lead 改动。
2. **不得改动** `package.json`、`vite.config.js`、`index.html`、`src/main.jsx`、`src/App.jsx`、`src/styles.css`
   ——这些是集成面，由 Lead 拥有（例外见第 1 节表中明确授给某位队友的文件）。
3. **颜色必须走 CSS 自定义属性**。组件自己的样式文件里，除了新声明的
   `--<组件前缀>-*` 令牌外，禁止出现硬编码颜色字面量（`#xxx` / `rgb()`）。
   深色主题由 Lead 在 `styles.css` 通过 `[data-theme='dark']` 重定义既有令牌实现，
   所以只要用既有令牌 + 自己的前缀令牌，深色模式自动生效。
4. **禁止 `console.log` 残留**（脚本文件里的进度输出除外）。禁止 `debugger`。
5. **禁止使用 `any` 语义的偷懒写法**：不允许 `// @ts-ignore`（本项目是 JS）、不允许吞掉异常的空 `catch {}`，
   捕获后必须 `console.warn` 并给出可读降级（有 UI 时给 UI 反馈）。
6. **数据文件必须是纯 ESM**，可被 Node 直接 `import`（`scripts/validate.mjs` 依赖这一点）：
   不得在 `src/data/*.js` 里引用 `document` / `window` / React。
   `src/data/*.js` 可以互相 import，但**不得** import `src/components/*` 或 `src/three/*`。
7. **`npm test` 必须始终全绿**（`node scripts/validate.mjs` + `node scripts/test-engine.mjs`）。
   改了数据或引擎的队友必须自己跑 `& npm.cmd test` 并把输出贴进回报。
   注意：本机 PowerShell 禁止运行 `npm.ps1`，**必须用 `npm.cmd`**。
8. 每个队友**只创建/修改表中属于自己的文件**。新建文件时目录不存在就一并创建。

## 1. 文件所有权表

| 文件 | 所有者 | 说明 |
|---|---|---|
| `src/data/catalog.js` | **T1 引擎与内容** | 单品目录 + 预设造型 |
| `src/data/advice.js` | **T1 引擎与内容** | 建议规则矩阵 + 法则 + `getAdvice` |
| `src/data/recommendations.js` | **T1 引擎与内容** | 个性化推荐打分 |
| `scripts/validate.mjs` | **T1 引擎与内容** | 追加校验（不得删既有校验） |
| `src/components/ScoreCard.jsx` | **T1 引擎与内容** | 新建：渲染 `advice.score` |
| `src/styles/score.css` | **T1 引擎与内容** | 新建 |
| `src/components/Sources.jsx` | **T2 资源检索** | 检索/筛选/排序/分页 |
| `src/styles/sources.css` | **T2 资源检索** | 新建 |
| `src/data/share.js` | **T3 分享与持久化** | 新建：编解码 + 文案 |
| `src/hooks/usePersistentState.js` | **T3 分享与持久化** | 新建 |
| `src/components/ShareBar.jsx` | **T3 分享与持久化** | 新建 |
| `src/components/ExportCard.jsx` | **T3 分享与持久化** | 新建：Canvas 造型卡 PNG |
| `src/styles/share.css` | **T3 分享与持久化** | 新建 |
| `src/styles.css` | **T4 主题与体验** | 深色主题 / 焦点 / 响应式 / 动效 |
| `src/components/ThemeToggle.jsx` | **T4 主题与体验** | 新建 |
| `src/styles/theme.css` | **T4 主题与体验** | 新建 |
| `src/components/Panel.jsx` | **T4 主题与体验** | 仅无障碍与键盘可用性 |
| `src/components/AdvicePanel.jsx` | **T4 主题与体验** | 仅无障碍与键盘可用性（**不要**加评分卡，Lead 接线） |
| `src/components/Laws.jsx` | **T4 主题与体验** | 仅无障碍 |
| `src/components/ProfileRecommender.jsx` | **T4 主题与体验** | 仅无障碍 |
| `src/components/ErrorBoundary.jsx` | **T4 主题与体验** | 仅无障碍 |
| `src/three/Mannequin.jsx` | **T5 3D 舞台** | 模特/服装网格/灯光 |
| `src/three/garments.jsx` | **T5 3D 舞台** | 新建：单品 ID → 网格映射 |
| `src/styles/stage.css` | **T5 3D 舞台** | 新建 |
| `src/App.jsx` / `main.jsx` / `styles.css` 外的一切集成文件 | **Lead** | 最终接线 |

## 2. 数据形状契约

### 2.1 单品（`src/data/catalog.js`）

沿用既有字段，**只允许新增** `mesh` 字段（供 T5 映射，见第 3 节）：

```js
{ id:'t-white', name:'白色短袖T恤', hex:'#f1efe8', family:'light',
  formality:1, warmth:1, tip:'…', ref:'…', mesh:'tee' }
```

- `family` ∈ `light | dark | earth | accent`
- `formality` ∈ `0|1|2|3`（0 仅 `o-none`）
- `warmth` ∈ `1|2|3|4`（新增）
- **`ACCS` 每项必须补上 `hex`**（当前缺失，导致 App.jsx 色块与 3D 取色拿到 `undefined`）。
- `ACCS` 项另需 `mesh`，取值见第 3 节。

新增导出（**必须存在**，T5/T2/Lead 依赖）：

```js
export const ITEMS = [...TOPS, ...OUTERS, ...BOTTOMS, ...SHOES, ...ACCS]
export const CATEGORIES = { top:TOPS, outer:OUTERS, bottom:BOTTOMS, shoes:SHOES, acc:ACCS }
export const findItem = (id) => ITEMS.find((x) => x.id === id)
```

`byId`、`PRESETS`、`TOPS`、`OUTERS`、`BOTTOMS`、`SHOES`、`ACCS` 名称与语义保持不变。

### 2.2 建议结果（`getAdvice(state)`）

**必须保留**现有全部字段：`{ bottomSugs, shoeSugs, accSugs, warnings, tips, overall, top, outer, bottom, shoes, accs }`，
每条建议对象保留 `{ title, why, applyId, src }`。

**新增** `score` 字段（T1 提供，Lead 负责接到 UI）：

```js
score: {
  total: 0..100,           // 整数
  verdict: '优秀' | '良好' | '及格' | '需要调整',
  breakdown: [             // 固定四项，顺序固定，总分 = 各项之和
    { key:'palette',    label:'配色',   value:0..30, max:30, note:'一句话依据' },
    { key:'formality',  label:'正式度', value:0..25, max:25, note:'…' },
    { key:'silhouette', label:'轮廓',   value:0..25, max:25, note:'…' },
    { key:'completeness',label:'完成度',value:0..20, max:20, note:'…' },
  ],
}
```

硬要求：
- `total === breakdown.reduce((s,i)=>s+i.value,0)`，且 `0 <= total <= 100`。
- **`total` 必须对不同搭配敏感**：`scripts/validate.mjs` 要新增一条校验——
  遍历全部 `TOPS×OUTERS×BOTTOMS×SHOES`（59 单品下组合数为 16×9×13×9 = 16848），
  至少出现 40 个不同 `total` 取值，最高分 > 最低分 + 45，
  且 ≥85 分的组合不超过 15%、中位数落在 60–80 之间。
  （门槛从 25 收紧到 40 的原因：旧实现只有 37 个取值、中位数 82、33% 的组合拿「优秀」，
  25 这个下限拦不住「起始即满分」的通胀写法。详见 docs/GATE-REVIEW.md。）
- `state` 字段缺失时不得抛异常（返回 `score.total` 仍在 0..100）。

### 2.3 预设造型（`PRESETS`）

- 扩充到 **≥14 套**，`id` 形如 `p-*` 且唯一；每套 `outfit` 的 5 个字段引用的 id 必须存在。
- 新增预设每套**至少用到 1 个第 3 节的新单品**。
- 保留 `{ id, name, mood, outfit, desc, src }` 形状，`src` 必须是 `SOURCES` 里存在的 id。
- `RECOMMENDATION_LOOKS`（`recommendations.js`）必须与 `PRESETS` 一一对齐：
  **每个 preset id 恰好一条 look**，`sources` 里的 id 必须存在于 `SOURCES`。

### 2.4 资源检索（`src/data/sources.js` 只读）

`SOURCES` 项字段：`{ id, platform, creator, title, url, plays?, note, tags, publishedAt, verifiedAt, status, httpStatus, perspective, editorNote }`。
`PLATFORMS`、`SOURCE_STATUS`、`PERSPECTIVE_TYPES` 可读。**T2 不得修改 `sources.js`。**

### 2.5 分享编解码（`src/data/share.js`，T3 提供）

```js
export function encodeOutfit(outfit) // -> string，URL-safe，无 '#'，长度 < 120
export function decodeOutfit(str)    // -> outfit | null（非法输入必须返回 null，绝不抛）
export function outfitToText(outfit) // -> 多行可读文本，用于复制到聊天/朋友圈
export const SHARE_VERSION = 1
```

`outfit` 形状固定：`{ top, outer, bottom, shoes, accs: string[] }`。
编解码必须**基于 catalog id 表**（而不是硬编码序号），保证新增单品后旧链接仍能解出。

### 2.6 持久化（`src/hooks/usePersistentState.js`，T3 提供）

```js
export function usePersistentState(key, initialValue, options?)
// 返回 [value, setValue]，签名与 useState 一致（支持函数式更新）
// options.serialize / options.deserialize 可选
// localStorage 不可用（隐私模式）或数据损坏时：静默回退到 initialValue，不得抛异常
// key 统一以 'stylelab:' 前缀（由调用方传入完整 key）
```

## 3. 冻结的单品清单（T1 与 T5 共同基准）

`mesh` 列即 `item.mesh` 字段取值，也是 T5 在 `src/three/garments.jsx` 里必须实现的映射键。

### TOPS（10 → 16）

| id | 名称 | hex | family | formality | warmth | mesh |
|---|---|---|---|---|---|---|
| `t-white` | 白色短袖T恤 | `#f1efe8` | light | 1 | 1 | `tee` |
| `t-black` | 黑色短袖T恤 | `#23242a` | dark | 1 | 1 | `tee` |
| `t-gray` | 灰色短袖T恤 | `#9a9da3` | light | 1 | 1 | `tee` |
| `t-stripe-t` | 藏青条纹T恤 | `#dfe3ea` | light | 1 | 1 | `tee-stripe` |
| `t-polo` | 藏青Polo衫 | `#2b3a55` | dark | 2 | 1 | `polo` |
| `t-polo-b` | 黑色针织Polo | `#212328` | dark | 2 | 2 | `polo` |
| `t-shirt-w` | 白衬衫 | `#f4f2ec` | light | 3 | 2 | `shirt` |
| `t-shirt-b` | 浅蓝衬衫 | `#a8c0d8` | light | 2 | 2 | `shirt` |
| `t-oxford-g` | 灰蓝牛津衬衫 | `#7c8896` | light | 2 | 2 | `shirt` |
| `t-hoodie-g` | 灰色连帽卫衣 | `#8d9096` | light | 1 | 3 | `hoodie` |
| `t-hoodie-b` | 黑色连帽卫衣 | `#26272b` | dark | 1 | 3 | `hoodie` |
| `t-sweatshirt-c` | 米白圆领卫衣 | `#efe7d8` | light | 1 | 3 | `sweatshirt` |
| `t-sweater-o` | 燕麦色针织毛衣 | `#d3c4ab` | earth | 2 | 3 | `sweater` |
| `t-sweater-w` | 酒红色针织毛衣 | `#7a3b40` | accent | 2 | 3 | `sweater` |
| `t-knit-n` | 藏青圆领针织衫 | `#2f3a4d` | dark | 2 | 3 | `sweater` |
| `t-ls-tee-b` | 黑色长袖T恤 | `#26272b` | dark | 1 | 2 | `longsleeve-tee` |

### OUTERS（5 → 9）

| id | 名称 | hex | family | formality | warmth | mesh |
|---|---|---|---|---|---|---|
| `o-none` | 不穿外套 | `#00000000` | — | 0 | 0 | `none` |
| `o-overshirt-k` | 卡其工装夹克 | `#b49a72` | earth | 1 | 2 | `overshirt` |
| `o-overshirt-d` | 牛仔夹克 | `#5b7492` | dark | 1 | 2 | `overshirt` |
| `o-harrington-o` | 军绿哈林顿夹克 | `#5d6647` | earth | 1 | 2 | `harrington` |
| `o-bomber-b` | 黑色飞行夹克 | `#2a2b30` | dark | 1 | 3 | `bomber` |
| `o-puffer-b` | 黑色轻薄羽绒服 | `#232428` | dark | 1 | 4 | `puffer` |
| `o-blazer-n` | 藏青西装外套 | `#2e3b52` | dark | 3 | 2 | `blazer` |
| `o-trench-k` | 卡其风衣 | `#bcaa8c` | earth | 2 | 2 | `trench` |
| `o-coat-g` | 深灰毛呢大衣 | `#4b4d52` | dark | 3 | 4 | `coat` |

### BOTTOMS（8 → 13）

| id | 名称 | hex | family | formality | warmth | mesh |
|---|---|---|---|---|---|---|
| `b-jeans-d` | 深蓝直筒牛仔裤 | `#3d4d66` | dark | 1 | 2 | `pants-denim` |
| `b-jeans-l` | 浅蓝牛仔裤 | `#7e97b5` | light | 1 | 2 | `pants-denim` |
| `b-jeans-b` | 黑色牛仔裤 | `#2b2c31` | dark | 1 | 2 | `pants-denim` |
| `b-jeans-g` | 灰色直筒牛仔裤 | `#6b7078` | dark | 1 | 2 | `pants-denim` |
| `b-chinos-k` | 卡其锥形裤 | `#c0a97e` | earth | 2 | 2 | `pants-twill` |
| `b-chinos-o` | 燕麦色休闲裤 | `#cdbb9c` | earth | 2 | 2 | `pants-twill` |
| `b-trousers-g` | 深灰休闲西裤 | `#4a4d55` | dark | 3 | 2 | `pants-twill` |
| `b-trousers-b` | 黑色西裤 | `#232428` | dark | 3 | 2 | `pants-twill` |
| `b-trousers-n` | 藏青西裤 | `#2c3648` | dark | 3 | 2 | `pants-twill` |
| `b-cargo-o` | 迷彩工装裤 | `#6f7355` | earth | 1 | 2 | `pants-cargo` |
| `b-joggers-g` | 灰色束脚运动裤 | `#83878e` | light | 1 | 2 | `joggers` |
| `b-shorts-b` | 黑色运动短裤 | `#2f3036` | dark | 1 | 1 | `shorts` |
| `b-shorts-k` | 卡其休闲短裤 | `#c3ae86` | earth | 1 | 1 | `shorts` |

### SHOES（5 → 9）

| id | 名称 | hex | family | formality | warmth | mesh |
|---|---|---|---|---|---|---|
| `s-white` | 白色小白鞋 | `#edeae2` | light | 1 | 2 | `sneaker` |
| `s-canvas` | 米色帆布鞋 | `#d8cdb8` | earth | 1 | 1 | `canvas` |
| `s-runner` | 黑白跑鞋 | `#dcdcdc` | light | 1 | 2 | `runner` |
| `s-loafer-b` | 棕色乐福鞋 | `#6b4a33` | earth | 2 | 2 | `loafer` |
| `s-chelsea` | 棕色切尔西靴 | `#6e4a2f` | earth | 2 | 3 | `chelsea` |
| `s-chelsea-b` | 黑色切尔西靴 | `#1d1e22` | dark | 2 | 3 | `chelsea` |
| `s-boot-b` | 黑色工装靴 | `#26262a` | dark | 1 | 4 | `boot` |
| `s-derby` | 黑色德比皮鞋 | `#1e1f23` | dark | 3 | 2 | `derby` |
| `s-derby-b` | 棕色德比鞋 | `#6a452c` | earth | 2 | 2 | `derby` |

`S` 系列中 `s-runner` 保留既有 `hex2: '#222326'`。

### ACCS（6 → 12，**全部补 `hex`**）

| id | 名称 | hex | mesh | note |
|---|---|---|---|---|
| `a-watch` | 银色腕表 | `#c9ccd1` | `watch` | 上手就是"有细节的人" |
| `a-necklace` | 银色项链 | `#d3d6da` | `necklace` | 圆领上装的好搭档 |
| `a-cap` | 棒球帽 | `#2f3138` | `cap` | 街头/运动风的点睛 |
| `a-beanie-g` | 灰色针织帽 | `#8b8f96` | `beanie` | 秋冬保暖兼造型 |
| `a-glasses` | 黑框眼镜 | `#20211f` | `glasses` | 斯文感滤镜 |
| `a-sunglasses` | 黑框墨镜 | `#1b1c1f` | `sunglasses` | 户外与街拍提亮 |
| `a-bag` | 黑色斜挎包 | `#26272b` | `bag` | 机能感 + 实用 |
| `a-tote-k` | 卡其帆布托特包 | `#c2b295` | `tote` | 通勤装得下电脑 |
| `a-belt-b` | 黑色皮带 | `#26262a` | `belt` | 塞衣角时的收尾 |
| `a-ring-s` | 银色戒指 | `#d6d9dd` | `ring` | 手部细节 |
| `a-scarf` | 灰色围巾 | `#9aa0a6` | `scarf` | 秋冬层次感来源 |
| `a-socks-w` | 白色长袜 | `#efece4` | `socks` | 短裤与露踝搭配用 |

**合计 16 + 9 + 13 + 9 + 12 = 59 件可试穿单品。**

## 4. 必守的 ID 前缀约定

`applyId` 的分类靠前缀判断（`AdvicePanel`/`App` 已依赖此约定，不要破坏）：

- `t-` 上装 · `o-` 外套 · `b-` 下装 · `s-` 鞋履 · `a-` 配饰

新 id **必须**符合 `^(t|o|b|s|a)-[a-z0-9-]+$`，`scripts/validate.mjs` 会校验。

## 5. 验收门槛（Lead 只认证据）

每位队友回报必须包含：
1. 改动文件清单 + 每个文件的实际改动行数。
2. `& npm.cmd test` 的**完整尾部输出**（至少含最后的汇总行）。
3. 针对自己模块的**独立验证命令与真实输出**（不是"我觉得没问题"）。
4. 明确写出**未完成项 / 已知缺陷 / 未验证的假设**。

缺少第 2 或第 3 项的回报一律打回。

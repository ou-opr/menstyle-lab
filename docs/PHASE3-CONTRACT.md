# 阶段三契约（PHASE3-CONTRACT）

本文件是阶段三各分支的接口冻结稿。**实现必须按这里的签名来**，Lead 的接线不会再改名字。
三条硬约束贯穿全程：不新增 npm 依赖；不修改别人的文件（需要跨界就报告 Lead）；纯逻辑模块必须能在 Node 下直接 `import`（不依赖 window/document）。

---

## §1 阶段三范围

- A 多套对比 + 二维拼贴（task-8）
- B 3D 体型参数（Lead 自做：`src/three/Mannequin.jsx`、`src/three/garments.jsx`）
- C 性能优化（Lead 自做）
- D 版本迁移与四档浏览器测试矩阵（Lead 自做）

---

## §2 多套对比 + 二维拼贴（task-8）

### 允许改动的文件

```
新增  src/data/collage.js              纯函数，Node 可直接 import
新增  src/components/ComparePanel.jsx  React 组件
新增  src/components/OutfitCollage.jsx React 组件
新增  src/styles/collage.css           由组件 import，只用既有令牌
新增  scripts/test-collage.mjs         node:assert，≥30 条
```

不得修改：`src/App.jsx`、`src/styles.css`、`src/three/*`、`src/data/catalog.js`、`src/data/share.js`、`src/data/advice.js`、`package.json`、其余任何已有文件。

### `src/data/collage.js` 必须导出的常量

```js
export const MAX_COMPARE = 4          // 一次最多对比几套
export const MIN_COMPARE = 2          // 少于两套时 compareOutfits 返回 ok:false
export const COLLAGE_PRESETS = ['auto','single','duo','trio','quad']
export const SLOT_ORDER = ['outer','top','bottom','shoes','accs']   // flat-lay 陈列顺序
export const SLOT_LABELS = { top:'上装', outer:'外套', bottom:'下装', shoes:'鞋履', accs:'配饰' }
```

### `compareOutfits(outfits, ctx = {})`

```js
/**
 * @param {Array} outfits 2–MAX_COMPARE 套造型（{top,outer,bottom,shoes,accs}）
 * @param {{ items?: Array, scoreOf?: Function, adviceOf?: Function, wardrobe?: Object }} ctx
 *   items        可选的目录数组（默认从 ./catalog 取 ITEMS）
 *   scoreOf      可选，(outfit) => number|{total}；默认 `getAdvice(outfit).score.total`
 *   adviceOf     可选，(outfit) => advice 对象；默认 `getAdvice(outfit)`
 *   wardrobe     useWardrobe() 的返回值或其 .state，用于算已有占比
 *   ※ advice.js **没有** scoreOutfit；评分只能从 `getAdvice(state).score` 拿，形状是
 *     `{ total, verdict, breakdown: [{ key, label, value, max, note }] }`（四维：配色30/正式度25/轮廓25/完成度20）
 *     收藏造型的形状是 `{ id, name, ts, outfit }`，见 src/components/ShareBar.jsx 的 LOOKS_KEY 值。
 * @returns {{
 *   ok: boolean, error?: string,
 *   looks: Array<{
 *     index:number, outfit:object, title:string,
 *     score:number|null, grade:string|null,
 *     warmth:number, formality:number,
 *     ownedRatio:number|null, ownedCount:number, missingCount:number, missing:Array<{slot:string,label:string}>,
 *     palette:Array<{hex:string,slot:string,label:string}>, colorCount:number,
 *     scoreParts:Array<{key:string,label:string,value:number,max:number}>
 *   }>,
 *   metrics: Array<{
 *     key:string, label:string, unit:string, direction:'higher'|'lower',
 *     values:Array<{ lookIndex:number, value:number|null, display:string, best:boolean }>
 *   }>,
 *   best: Object<string, number>,   // metricKey -> lookIndex
 *   bestOverall: number|null,       // 综合最好的 lookIndex
 *   warnings: string[]
 * }}
 */
```

`metrics` 至少包含六项，顺序固定：`score`（综合评分）、`warmth`（保暖总和）、`formality`（正式度均值）、`ownedRatio`（衣橱已有占比，无衣橱时为 null）、`missingCount`（缺件数）、`colorCount`（配色数，越少越好 → `direction:'lower'`）。

规则：少于 2 套或不是数组 → `ok:false` + `error`；超过 MAX_COMPARE → 只取前 4 套并记 warning；单套造型里的未知 id 记为缺件而不是抛异常；`display` 必须是给用户看的字符串（例：`96 分`、`总和 6`、`25%`、`3 件`、`4 色`）。

### `flatLay(outfit, ctx = {})`

```js
/**
 * 把一套造型摊平成「平铺图」的格子描述（纯数据，不含任何像素）。
 * @returns {{
 *   ok:boolean, error?:string,
 *   cells:Array<{
 *     slot:string, label:string, order:number,
 *     item:{ id:string, name:string, hex:string, family:string, mesh:string }|null,
 *     placeholder:boolean,        // item 为 null 时 true，界面据此画虚线空位
 *     shape:string                // 'torso'|'legs'|'shoe'|'accessory'|'outer'，供组件选轮廓
 *   }>,
 *   palette:Array<{ hex:string, count:number, share:number }>,   // 按出现次数降序
 *   colorCount:number,
 *   warnings:string[]
 * }}
 */
```

`cells` 按 `SLOT_ORDER` 排列；`accs` 里每个配饰各一个 cell（`slot` 仍为 `'accs'`，`order` 递增）；缺项输出 `item:null, placeholder:true`；`shape` 由 slot 推导（top→torso、outer→outer、bottom→legs、shoes→shoe、accs→accessory）。

### `collageLayout({ looks, preset = 'auto', cell = {width:260,height:320}, gap = 16, padding = 24, caption = true })`

纯几何：只返回数字，不碰 DOM，也不要读 `window`。

```js
/**
 * @param {Array} looks  compareOutfits 的 looks，或直接是造型数组（内部会自己摊平）
 * @returns {{
 *   ok:boolean, error?:string,
 *   cols:number, rows:number,
 *   width:number, height:number,
 *   cell:{width:number,height:number}, gap:number, padding:number, caption:boolean,
 *   cells:Array<{ x:number, y:number, width:number, height:number, lookIndex:number,
 *                 title:string, score:number|null, flatLay:object }>,
 *   warnings:string[]
 * }}
 */
```

`preset:'auto'` 按套数决定：1→1×1、2→2×1、3→3×1（窄屏由组件自行改成 2+1，函数不管响应式）、4→2×2。`single/duo/trio/quad` 强制对应布局。`width/height` 必须恰好容纳所有单元格 + 间距 + 内边距（`padding*2 + cols*cell.width + (cols-1)*gap`）。

### 组件接口（Lead 按这个接线）

```jsx
<ComparePanel looks={savedLooks} wardrobe={wardrobe} activeIndex={i} onPick={setIndex} onRemove={removeLook} />
<OutfitCollage outfits={[outfit]} preset="auto" onExport={handleExportPng} />
```

- `ComparePanel`：2–4 套并排，展示 `metrics` 表（每项最优值高亮），支持点选、移除、把某套设为「当前」。
- `OutfitCollage`：按 `collageLayout` 的几何绝对定位渲染 `cells`，每格用 `flatLay.cells` 画平铺色块 + 名称 + 评分；`onExport` 可选，给了就显示导出 PNG 按钮。
- 导出 PNG 不得引入新依赖：用 Canvas 2D 手绘（`src/components/ExportCard.jsx` 已有同类实现可参考，但**不要修改那个文件**）。
- 只用既有 CSS 令牌：`--bg --bg2 --ink --ink2 --ink3 --line --card --accent --accent-soft --ok --warn` 与 `--th-*` 系列；零颜色字面量。
- 无障碍：对比表用真实 `<table>`（带 `<caption>`/`<th scope>`）；色块要带可见文字标签，不能只靠颜色传达信息；空位要有 `aria-label`。

### 测试 `scripts/test-collage.mjs`

`node:assert`，≥30 条。至少覆盖：套数下限/上限与 warning、六项 metric 的名称与顺序、best 计算（含并列与全 null）、已知 id 与未知 id、缺件计数、ownedRatio 在无衣橱时为 null、flatLay 的槽位顺序/配饰多格/缺项占位/shape 推导/配色份额之和为 1、collageLayout 三种 preset 的行列数与宽高公式、非数组与 null 输入不抛异常、确定性（同样输入两次结果深相等）、不修改入参。

### 回报要求

用 `send_message` 发给 `lead`：① 文件清单与行数；② `node scripts/test-collage.mjs` 的真实末行输出；③ App.jsx 接线片段（import + props + 插入位置）；④ 任何你改了签名的地方与理由；⑤ 未覆盖的边界。

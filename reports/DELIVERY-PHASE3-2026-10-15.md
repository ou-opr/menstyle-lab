# 阶段三交付报告 · 2026-10-15

承接用户的「三阶段升级」授权（m00804），本报告覆盖阶段三的 A、B 两节，
并如实说明 C、D 两节的完成度与依据。

产物：`D:\穿搭\型格穿搭实验室-双击打开.html`（与 `D:\穿搭\style-lab\dist-single\index.html` 同源同内容）。

---

## 一、交付总览

| 节 | 内容 | 状态 |
| --- | --- | --- |
| A | 多套对比 + 二维拼贴 | 完成 |
| B | 3D 体型参数 | 完成 |
| C | 性能优化 | 已实测，未发现值得改动的热点（见 §4） |
| D | 版本迁移 + 浏览器测试矩阵 | 迁移在阶段二已完成；矩阵部分覆盖（见 §5） |

---

## 二、A · 多套对比 + 二维拼贴

### 新增文件

| 文件 | 规模 | 职责 |
| --- | --- | --- |
| `D:\穿搭\style-lab\src\data\collage.js` | 377 行 / 16,596 B | 纯计算：对比指标、平铺拆解、拼贴几何 |
| `D:\穿搭\style-lab\src\components\ComparePanel.jsx` | — | 对比表（真实 `<table>`，带 `<caption>` 与 `<th scope>`） |
| `D:\穿搭\style-lab\src\components\OutfitCollage.jsx` | — | 拼贴渲染 + Canvas 2D 导出 PNG（零依赖） |
| `D:\穿搭\style-lab\src\styles\collage.css` | 4,655 B | `.cmp-*` / `.clg-*`，只用契约令牌 |
| `D:\穿搭\style-lab\scripts\test-collage.mjs` | 42 项 | 断言全绿 |

### 契约要点

- `compareOutfits(outfits, ctx)` 输出六项指标：综合评分 / 保暖总和 / 正式度 / 衣橱已有 / 缺件 / 配色数。
  每项带 `direction`（`higher` 越高越好 / `lower` 越少越好）、`unit`，并逐套给出 `best`（并列时全部标记）。
- `collageLayout({ looks, preset, cell, gap, padding })` 只返回数字（`x/y/width/height` + 每格 `flatLay`），
  不碰 DOM、不读 `window`，因此同一份几何既能定位 div，也能在 Canvas 上重画。
- 上限 `MAX_COMPARE = 4`、下限 `MIN_COMPARE = 2`，超出/不足都给 warning 而不是抛异常。

### 接线

- `D:\穿搭\style-lab\src\App.jsx` 把 `wardrobe` 传给 `ShareBar`。
- `D:\穿搭\style-lab\src\components\ShareBar.jsx` 在「造型夹」列表下方内嵌 `<ComparePanel>`；
  为了高亮「当前身上这套」，新增了本地 `sameSlots(a, b)`——配饰按排序后的集合比较，
  顺序不同不算不同套；`onPick` 复用已有的回填通道 `handleApplyLook`，不新造一套应用逻辑。
- `D:\穿搭\style-lab\src\App.jsx` 在 `#studio` 末尾渲染 `<OutfitCollage outfits={[{ name: '当前造型', outfit, score }]} />`。

### 修掉的真实缺陷

- `collage.js` 内 `Number(null) === 0`：直接 `Number()` 会把「没有评分」悄悄变成 0 分，
  于是该套在排行榜上永远垫底、界面显示「0 分」而不是「—」。改为显式判空后再转数字。

### 浏览器实测（`file://` 真机，ego-browser）

| 项 | 结果 |
| --- | --- |
| 1280×800 横向溢出 | 0 |
| 500×918 横向溢出 | 0 |
| 对比表结构 | 4 列（指标 + 3 套）× 6 行指标，10 个「本项最优」高亮，1 个「综合最好」徽标 |
| 「设为当前」实测 | 点第三套「轻松约会」→ chips 变为 藏青Polo衫 / 黑色飞行夹克 / 卡其锥形裤 / 米色帆布鞋 / 黑框眼镜，对应列高亮 |
| 收藏 / 移除实测 | 造型数 3 → 4（新增「造型 3」）→ 3（移除「正式通勤」） |
| 拼贴结构 | 1 格 × 5 行；外套未选显示虚线占位，其余为色块 + 名称 |
| 导出 PNG | 状态区回显「造型卡已导出为 PNG」，Canvas 2D `toDataURL` 返回合法 `data:image/png;base64` |

截图证据：
`reports\phase3-compare-desktop.png`、`reports\phase3-compare-mobile.png`、
`reports\phase3-collage-desktop.png`、`reports\phase3-collage-mobile.png`。

**如实说明**：本会话的自动化无法在 `file://` 下观测「下载」事件（`ego_download` 会超时），
所以「导出成功」的依据是组件状态回显 + `toDataURL` 可用，而不是落盘文件。

---

## 三、B · 3D 体型参数

### 新增文件

| 文件 | 规模 | 职责 |
| --- | --- | --- |
| `D:\穿搭\style-lab\src\three\bodyProfile.js` | 4,511 B | 体型 → 模特变换（纯函数，Node 可直跑） |
| `D:\穿搭\style-lab\scripts\test-bodyprofile.mjs` | 24 项 | 断言全绿 |

### 口径（决定了实现方式）

- **整身等比缩放**，不做局部拉伸：衣服是按固定骨架摆的独立网格，
  非等比缩放会让袖长、裤长和身体错位「穿帮」。
- 身高只改 `y`，体型只改宽深；基准 `175cm + 匀称` 恰好是 `1:1`，所以默认身材与改造前完全一致。
- 导出：`BODY_BASELINE_HEIGHT = 175`、`BODY_KEYS = ['slim','standard','athletic','plump']`、
  `bodyTransform({height, body}) → { scale:[x,y,z], y, width, depth, defaulted, height, label }`、
  `cameraTargetFor`、`describeBodyProfile`、`normalizeProfile`。
- 相机注视点随身高上移，否则高个子会被切头顶。

### 接线

- `D:\穿搭\style-lab\src\components\ProfileRecommender.jsx` 改为受控：
  身高/体型由 App 持有（`profile` / `onProfileChange`），不传时退回内部 state 以保持单独可用。
  这样「推荐方案」和「3D 模特」用同一份参数，不会各存一份。
- `D:\穿搭\style-lab\src\App.jsx` 把 `profile` 传给 `<LazyStudio>`，舞台徽标显示 `describeBodyProfile(profile)`。

---

## 四、C · 性能：实测结论（未改动代码）

在 `file://` 单文件产物上实测（1280×800）：

| 指标 | 实测值 |
| --- | --- |
| DOM 节点数 | 2,093 |
| 首次绘制 | 56 ms |
| 首次内容绘制（FCP） | 124 ms |
| `domInteractive` / `DOMContentLoaded` / `load` | 34 / 45 / 47 ms |
| 强制重排（读 `offsetHeight`） | < 0.01 ms |
| JS 堆 | 28 MB |
| 单文件产物体积 | 1,546.93 kB（gzip 541.76 kB） |

结论：**没有发现值得改动的热点**。资源库早在阶段二就做了分页（`PAGE_SIZE = 24`，
`paginate` / `searchSources` 都是纯函数且结果被 `useMemo` 缓存），187 条不会一次性挂载；
3D 画布的 dpr 与阴影分辨率在阶段三 B 之前就已设上限。
唯一的大头是 three.js 本体，而「离线单文件双击可用」要求必须把它内联，属于需求成本而非浪费。
因此这一节如实记为「已测量、无需改动」，而不是为了交差塞一个没有依据的改动。

---

## 五、D · 版本迁移与测试矩阵

### 版本迁移（阶段二已完成，此处复核）

- `BACKUP_VERSION = 2`，v1 备份包仍可导入，且**不会**把本地已有的天气条件/日历抹成默认值
  （缺省记 `null` 而非默认值，导入端据此跳过）。
- 主题键必须裸字符串读写（`ThemeToggle` 用 `setItem(key, mode)`），已在契约中固化。
- `scripts/test-backup-v2.mjs` 26 项断言全绿。

### 浏览器测试矩阵

| 档位 | 结果 |
| --- | --- |
| 1280×800（深色） | 横向溢出 0；对比表、拼贴、3D 均正常 |
| 500×918（移动） | 横向溢出 0；全站 10 个章节均存在；移动端导航 9 个链接可横向滚动 |
| 主题三态 | 实测 `data-theme` 由 `dark` → `light` → `dark` 切换生效 |

未覆盖：1024 / 1440 档，以及 Firefox / Safari（本机只有 Chromium）。

---

## 六、门禁与产物

```
& npm.cmd test        → EXIT=0
  validate（13 组契约）
  test:engine（建议引擎语义断言）
  test:wardrobe（41）  test:preferences（77）  test:backup（13 类损坏包）
  test:backup-v2（26） test:daily（42）        test:calendar（33）
  test:capsule（36）   test:bodyProfile（24）  test:collage（42）

& npm.cmd run build:release → EXIT=0
  680 modules transformed
  dist-single/index.html  1,546.93 kB │ gzip: 541.76 kB
  已复制到 D:\穿搭\型格穿搭实验室-双击打开.html
```

依赖未变（react / react-dom / three / @react-three/fiber / @react-three/drei / vite / vite-plugin-singlefile），
依旧零新增依赖、单文件离线可用。

---

## 七、遗留与建议

1. 拼贴目前只拼「当前这一套」，多套拼贴的几何与导出已经具备（`collageLayout` 支持 2–4 套且有测试），
   若想直接把收藏的几套拼成一张图，只需把 `OutfitCollage` 的 `outfits` 换成造型夹切片。
2. 对比表在 500px 宽下可读但不宽裕，四个按钮会换行；若后续要支持手机端密集对比，
   建议改成「两套一屏 + 横向滑动」而不是继续压缩单元格。
3. 阶段三未覆盖 1024 / 1440 断点与非 Chromium 浏览器。

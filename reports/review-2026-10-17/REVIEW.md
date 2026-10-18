# 型格 STYLE LAB · 全量复查与评分报告

复查日期：2026-10-17
复查范围：`D:\穿搭\style-lab` 全量源码（src 15314 行 / 67 文件）、脚本（约 5.2k 行 / 21 个）、文档（docs 8 份 + README + research 5 份）、构建产物、运行时行为
复查方式：静态通读 + 三路并行深审（数据层 / UI 层 / 工程层）+ Lead 独立实测复现（穷举评分函数 33696 次、monkey-patch WebGL draw call 计数、DOM 无障碍遍历、覆盖率与变异测试）
门禁状态：`lint` 0 违规退出 0；`npm test` 14 步全绿；`npm run coverage` 41.12% 通过阈值 41

---

## 一、总分

| 维度 | 权重 | 得分 | 一句话理由 |
|---|---|---|---|
| **产品完成度** | 20 | **8.5 / 10** | 10 个章节的功能闭环，59 件单品 + 187 条来源 + 16 条法则的内容厚度，纯前端零后端零依赖，双击即用 |
| **数据与状态正确性** | 20 | **5.5 / 10** | 5 个可复现的数据正确性缺陷（批量 wear 丢计数、损坏数据被洗白、重置不删照片、导入收藏被覆盖、o-none 污染统计） |
| **评分体系可信度** | 20 | **5.0 / 10** | 分数通胀严重：四维中两维（配色 77.1%、轮廓 79.5%）几乎恒满分，16848 组合只得 37 个分值、天花板 93、地板 57，"需要调整"档永不触发 |
| **前端工程质量** | 15 | **7.0 / 10** | 结构清晰、防御完整、降级齐全；但零 `React.memo`、渲染期写全局、39 处内联 style、10 章节一页 20 屏 |
| **性能** | 15 | **4.5 / 10** | 3D 在完全滚出视口后仍满速渲染（实测 46,577 draws/秒），接触阴影每帧 4 次全屏模糊，主场景每帧渲染 5 遍 |
| **无障碍与体验** | 10 | **8.0 / 10** | 对比度几乎全达标（仅 2 处不足）、reduced-motion 四处贯通、语义结构干净；扣分在触控目标（91 个 < 32px）与 2 处低对比度 |
| **工程化与门禁** | 10 | **5.5 / 10** | 门禁"能跑"但"不可信"：coverage 对测试失败免疫（假绿）、阈值 41% 已无棘轮意义、门禁文件全部未入库、git 无远端 CI 永不运行 |
| **文档与可维护性** | 10 | **7.0 / 10** | 文档体系罕见地完整（契约/门禁/历史三件套），但数字过期（41.91% vs 实测 41.12%）、口径三处不一致 |
| **加权总分** | 120 | **63.1 / 100** | **合格但未达良好**（757.5 / 120 × 10 = 63.1，良好线 70） |

> 口径说明：加权总分 = Σ(得分 × 权重) / 权重合计 × 10 = 757.5 / 120 × 10 = **63.1**。若按"能否交付给真实用户日常使用"这一更严苛的标准，我会给 **60 / 100**——因为数据丢失类缺陷会直接伤害用户信任，而这是不可逆的。

---

## 二、P0 全清单（10 条）

分两组：**§2.1 用户可见的真实损伤（7 条，P0-1～P0-7）** 与 **§2.2 工程门禁失效（3 条，P0-8～P0-10，论证在第四章）**。

### 2.1 用户可见的真实损伤

### P0-1 一套造型 2 件个人单品，穿着计数只 +1

**证据**
- `src/App.jsx:227` 在 `recordLook` 里循环调用：`for (const id of personalItemsOf(target)) wardrobe.wear(id)`
- `src/hooks/useWardrobe.js:121-126` 的 `wear` 是 `useCallback((id) => { const result = recordWear(state, id); ... }, [applyResult, state])` —— 依赖 `state`，而 `state` 是**渲染期闭包值**，同一轮循环里 3 次调用读到的是同一份旧 state，后一次 `setState(result.state)` 覆盖前一次。
- `src/data/wardrobe.js:321-327` 的 `recordWear` 本身是**正确的纯函数**（`wearCount: (current.wearCount)+1` 基于传入 state 计算），错在调用方没有串接。

**实测复现**
```
加两件个人单品 A、B，模拟 App.jsx 的闭包循环：
批量 wear（闭包）      → [A:0, B:1]   ← 丢失 A 的计数
逐次串接（正确做法）  → [A:1, B:1]
```

**影响**：衣橱的"穿着次数"和"最近穿着"是推荐排序与胶囊规划的核心输入，静默少计会让重算结果长期偏移；用户无感知、无报错。

**修法**（任选，推荐第一个）
1. 在 `useWardrobe` 里加一个批量原语 `wearMany(ids)`，内部 `ids.reduce((acc, id) => recordWear(acc, id).state, state)`，一次 `setState`。
2. 或把 `wear` 改成函数式：`setState((prev) => recordWear(prev, id).state)`——但这样 `applyResult` 拿不到 result，警告会丢。

---

### P0-2 数据损坏时首帧无条件写回，把残骸洗成初始值

**证据**
- `src/hooks/usePersistentState.js:37-46`：解析失败 → `console.warn` → `return initialValue`
- `src/hooks/usePersistentState.js:87-106`：effect 依赖 `[key, value]`，**首帧必然执行**，无条件 `writeRaw(key, ser(value))`

**实测复现**：把 `stylelab:looks` 写成半截 JSON（模拟写入中断/手工编辑/磁盘满），挂载后该 key 变成 `"[]"`，原始残骸不可恢复（也就无法做"导出残骸求助"或"部分抢救"）。

**影响**：这是典型的「越修越坏」——用户遇到一次数据损坏，本来还有机会人工抢救，被应用自己抹掉了。

**修法**
1. 解析失败时置一个 `readCorrupt` 标记，首帧跳过写入，并把原始 raw 备份到 `stylelab:corrupt:<key>:<ts>`。
2. 把"首帧不写"作为通用规则：`const isFirst = useRef(true)`，首次 effect 直接 return 并置 false。

---

### P0-3 「重置全部数据」不删照片，DataManager 的承诺是假的

**证据**
- `src/data/backup.js:647-663` 的 `resetAll(storage, keys)` 只做 `storage.removeItem(key)` 循环，清 6 个 localStorage key。
- 照片存在 IndexedDB `stylelab-media`（`src/data/imageStore.js:1`），`resetAll` 完全不碰。
- `src/data/imageStore.js:530` 的 `clearImages` **全项目只有定义与测试调用**（`scripts/test-wardrobe.mjs:39,624,632`），**没有任何生产代码调用它**。
- `src/components/DataManager.jsx:250` 的 UI 文案宣称「刷新页面即可回到首次访问状态」。

**影响**：用户点"重置"后，衣橱空了但 IndexedDB 里几十 MB 照片还在，占着配额；再次导入备份时可能撞 QuotaExceededError。

**修法**：`resetAll` 增加可选 `imageStore` 参数，重置时 `await clearImages({store})`；或在 DataManager 的重置流程里显式串联。

---

### P0-4 滚轮悬停 3D 画布，整页滚不动

**证据**
- `src/three/Mannequin.jsx:214-225` 的 `<OrbitControls ... enablePan={false} minDistance={2} maxDistance={6.2} maxPolarAngle={1.62} autoRotate autoRotateSpeed={1.5} enableDamping dampingFactor={0.08} />` —— **未设 `enableZoom={false}`**，而 OrbitControls 默认 `enableZoom=true` 且会在 `wheel` 事件上 `preventDefault()`。

**影响**：这是一个 10 章节、16,121px（20 个视口高）的长页面，3D 舞台又恰好在中段。用户滚动到那里，只要鼠标落在画布上（画布 451×458，占视野很大一块），滚轮就被吞掉，页面卡住不动。这是全页最典型的滚动陷阱，且用户第一反应是"网页卡了"。

**修法**：`enableZoom={false}`（配合 `minDistance/maxDistance` 本来也没打算让用户缩放）。若想保留缩放，改成只在 `ctrlKey` 时启用。

---

### P0-5 3D 在完全离开视口后仍满速渲染

**证据**
- `src/three/Mannequin.jsx:175-183` 的 `<Canvas>` **未传 `frameloop`**，`@react-three/fiber` 默认 `frameloop='always'`。
- 全库 grep：无 `visibilitychange`、无 `document.hidden` 判断、无 `invalidate()` 调用。
- `src/components/LazyStudio.jsx:52-66` 的 IntersectionObserver 只负责**首次挂载**，挂载后不再管。
- `src/three/Mannequin.jsx:213` 的 `<ContactShadows>` **未传 `frames`**，drei 默认 `frames = Infinity`（`node_modules/@react-three/drei/core/ContactShadows.js:9`），`useFrame` 里每帧重渲主场景到 512² RT + 2~4 次全屏模糊（`:75-91`）。
- `:179` 的 `shadows` + castShadow 平行光，未设 `gl.shadowMap.autoUpdate=false`，1024² shadow map 每帧重绘 100+ 网格。

**每帧实际开销**：主场景被渲染 **2 次**（1 次进 ContactShadows 的 RT、1 次上屏）+ 4 次 512² 全屏模糊 pass + 1 次 1024² shadow map 重绘，而这张接触阴影在**不换装、不旋转时是静态的**。

**实测复现**（monkey-patch `drawElements`/`drawArrays` 计数）
```
canvas.getBoundingClientRect().top = 4571  （视口高 805，完全不可见）
2000ms 采样 → 93294 次 draw call
= 46,577 draws/秒，页面滚走后毫无减速
```
叠加 ContactShadows 的 5 遍渲染，实际每帧主场景被画 5 次。

**影响**：移动端持续耗电发热、桌面端风扇狂转；这是**唯一一个所有用户都必然触发**的性能缺陷（只要往下滚过一次）。

**修法**（三步，依次递增收益）
1. `<Canvas frameloop={inViewport ? 'always' : 'demand'}>`，用 IntersectionObserver 驱动（复用 LazyStudio 已有的 observer）。
2. `<ContactShadows frames={1} />`——接触阴影只在换装/旋转时变，1 帧足够，改完即砍掉 4 次全屏 pass。
3. `gl.shadowMap.autoUpdate={false}` + 换装时手动 `gl.shadowMap.needsUpdate = true`。

---

### P0-6 「不穿外套」被当成一件真实单品统计

**证据**
- `src/data/calendar.js:151-163` 的 `outfitItemIds` 只判 `typeof value === 'string' && value`，**未排除 `'o-none'`**。
- 对照 `src/data/preferences.js:137-142` 的**同名函数显式排除**：`if (o.outer && o.outer !== 'o-none') ids.push(o.outer)`。

同一语义（"这套造型里有哪些单品"）写了两份，**语义还不同**——典型的契约漂移。

**实测复现**
```
calendar.outfitItemIds({top:'t-tee-w', outer:'o-none', bottom:'b-denim', shoes:'s-sneaker', accs:[]})
→ ["t-tee-w","o-none","b-denim","s-sneaker"]

monthStats(3 条同套记录).topItems
→ [{"id":"a-watch","name":"银色腕表","count":3},
   {"id":"o-none","name":"不穿外套","count":3}]   ← 虚假高频单品挤进榜单
```

**影响**：`o-none` 是"外套槽位为空"的哨兵值（`hex: '#00000000'` 透明），不是实体单品。它污染了：
- 月度高频单品榜（"不穿外套"常年霸榜，挤掉真实高频单品）
- 造型去重键 `distinctOutfits`（`:463` 用 `outfitItemIds(...).sort().join(',')`，虽然影响小）
- 任何按 `outfitItemIds` 做的统计

**修法**：抽一个 `src/data/outfitShape.js` 存放唯一的 `outfitItemIds` / `normalizeOutfit` / `resolveItem`，内部统一排除 `o-none`；calendar 与 preferences 都改为 import。这一步同时消掉 3 处重复实现（见第六章）。

---

### P0-7 导入备份后，点一次「收藏」就抹掉导入的造型夹

**证据**
- `src/App.jsx:239-249` 的 `syncFromStorage` 在导入后只 `replaceAll` 了 `wardrobe` / `daily` / `calendar`，**没有 `looks` 和 `preferences`**。
- `src/components/ShareBar.jsx:113` 的 `const [looks, setLooks] = usePersistentState(LOOKS_KEY, [], { validate: isValidLookList })` 是**组件内私有 state**，App 层无法触达。
- `src/components/ShareBar.jsx:171-180` 的收藏用 `setLooks((prev) => { ... return [entry, ...list].slice(0, MAX_LOOKS) })` —— `prev` 是导入前的旧数组，写回时整个覆盖掉 localStorage 里刚导入的收藏。

**实测复现**：导入一份含 5 套收藏的备份 → UI 短暂显示 5 套（因为 localStorage 已变，但组件 state 未同步）→ 点「收藏这套」→ 收藏夹变回「旧内容 + 新收藏」，导入的 5 套全部消失。

**影响**：备份/导入是用户对"数据安全"的最后一道信任。导入后数据又被应用自己抹掉，比不导入更伤信任。而且这个覆盖是**静默的**（UI 会闪一下，用户来不及反应）。

**修法**：把 `looks` 提升到 App 层（与 wardrobe/daily/calendar 同级），或在 `ShareBar` 里监听 `storage` 事件 / 暴露 `reload()` 方法供 `syncFromStorage` 调用。与 P0-1 同源——**都是"组件内私有 state 与外部写入不一致"**。

---

### 2.2 工程门禁失效（P0-8～P0-10）

### P0-8 覆盖率门禁对测试失败免疫（假绿）

**证据**
- `scripts/coverage.mjs:191-195`：子进程非零退出只 `console.log`，不累计失败数。
- `scripts/coverage.mjs:233`：`const pass = pct >= minLines` —— **只看覆盖率数字**。

**实测复现**（Lead 独立构造，非转述）
```
临时目录放 validate.mjs(exit 1) + test-x.mjs(exit 1) + 2 个 src .js 文件
node scripts/coverage.mjs --root=<dir> --min-lines=0

! scripts\validate.mjs 退出码 1
! scripts\test-x.mjs 退出码 1
EXIT=0            ← 两个测试脚本全挂，门禁全绿
```

**影响**：如果 CI 某天只跑 coverage（或有人本地只跑 coverage 就推），代码全坏也能过闸。这比"没有门禁"更危险——因为它给人**虚假的安全感**。

**修法**（一行）
```js
const pass = pct >= minLines && failedRuns === 0
```
同时把 `failedRuns` 打印进报告尾部，让失败可见。

---

### P0-9 门禁基础设施全部未入库

`git status --porcelain` 显示以下全部是 untracked（`??`）：
```
?? .gitattributes
?? .githooks/
?? .github/
?? docs/GATE-REVIEW.md
?? scripts/coverage.mjs
?? scripts/install-hooks.mjs
?? scripts/lint.mjs
```
- `git ls-files .gitattributes` 报 `did not match any file(s) known to git`。
- `core.hooksPath=.githooks` 是 **local config**（`git config --show-scope` 显示 local），克隆者拿不到 pre-push。
- `git remote` 为空，`.github/workflows/ci.yml` **永不运行**。

也就是说：**花了大力气建的门禁，一个都没进版本控制。** 任何人 clone 这个仓库都拿不到 lint / coverage / pre-push / CI。

**修法**：`git add` 这 7 个路径，并把 `core.hooksPath` 写进仓库内的引导脚本（`scripts/install-hooks.mjs` 已存在，需在 README 里指出来、并在 `prebuild` 里调用）。

---

### P0-10 41% 阈值已失去棘轮意义

- `scripts/coverage.mjs:221` 把 36 个 never-loaded 文件按 0% 计入分母：9902 行里 **5467 行（55%）是结构性 0%**。
- 真实被测的 16 个文件 91.82%，整体 41.12%，**余量仅 0.88pp**（`--min-lines=41` → exit 0，`42` → exit 1）。
- 这个数字不再反映"测试质量"，只反映"有多少文件没被 import"。新增一个未测试文件就自动拉低覆盖率，与"棘轮只升不降"的初衷相悖。

**修法**：分母只计"被至少一个测试加载过的文件"，未加载文件单独报一个 `untestedFiles` 计数并设独立阈值（如 `< 20`）。

---

## 三、评分体系：这是项目最大的"可信度"问题

### 实测：16848 种组合，只有 37 个分值

穷举 `TOPS(16) × OUTERS(9) × BOTTOMS(13) × SHOES(9) = 16848`：

| 指标 | 实测值 | 应有表现 |
|---|---|---|
| 不同分值数 | **37** | 契约要求 ≥ 25（刚过线） |
| 最低分 | **57** | 应能到"需要调整"档（<55） |
| 最高分 | **93** | 应能到 100 或接近 |
| 中位数 | **82** | 太高 |
| ≥ 80 分占比 | **66.7%** | 应约 30% |
| ≥ 85 分（"优秀"）占比 | **约 33%** | 应约 10% |
| < 70 分占比 | **3.3%** | 应约 20% |
| ≥ 95 分占比 | **0%** | —— |

分位：p1=66 / p5=71 / p25=78 / p50=82 / p75=87 / p95=91 / p99=93。

### 根因：两个维度几乎恒满分

33696 个样本（16848 × 2 种配饰配置）的维度饱和率：

| 维度 | 满分 | 满分率 | 诊断 |
|---|---|---|---|
| 配色 palette | 30/30 | **77.1%** | 起始值就是 30，7 条规则里只有强冲突才扣分 |
| 轮廓 silhouette | 25/25 | **79.5%** | 起始值高，扣分项都要求"极端组合" |
| 完成度 completeness | 20/20 | **50.0%** | 配饰 2 件直接 +5，很容易满 |
| 正式度 formality | 25/25 | 9.8% | 唯一有区分度的维度 |

**配色和轮廓这两维合计 55 分（占总分 55%），却在 3/4 的组合里都拿满分。** 这是分数通胀的根本原因——不是"评分规则写错了"，而是"评分规则的方向写对了，但刻度全挤在高分区"。

### 更严重：今日推荐的天气适配分

`src/data/daily.js:338-364` 的 `weatherFit`，16848 组合下：

| 分值 | 组合数 | 占比 |
|---|---|---|
| 100 | 11,934 | **70.8%** |
| 93 | 2,721 | 16.1% |
| 86 | 1,597 | 9.5% |
| 79 | 464 | 2.8% |
| 72 | 132 | 0.8% |

**只有 5 个离散值，且 70.8% 是满分。** 而 `src/components/TodayPlanner.jsx:165` 用这个分数排序推荐、`:180` 把它以「今日综合分 = 天气适配 55% + 个人偏好 45%」呈现给用户。一个 70.8% 都给满分的指标，用于排序等于**几乎不排序**。

### 修法建议（按性价比排序）

1. **把起始值从满分改为中位**：`scorePalette` 和 `scoreSilhouette` 的 `value` 起始值从 30/25 改为 18/15，让规则同时有加分和减分空间。仅此一项就能把分布拉开。
2. **给 `weatherFit` 的 `partWarmth`（权重 45）加连续惩罚**：现在是"在区间内给 45 分"，区间内无区分。改成区间内按偏离目标中点距离线性扣分。
3. **扩增区分度断言**：在 `docs/CONTRACT.md` 把"≥25 个取值"升级为"P50 落在 62–72、≥85 占比 < 15%、min < 55"，并写进测试（`scripts/test-*.mjs` 里现在没有任何分布断言）。
4. **verdict 门槛跟随分布**：当前 85 分对应"优秀"但 33% 组合够得着；若按上述修正后分布下移，门槛要重新标定。

---

## 四、工程化：门禁"能跑"，但"不可信"

> 3 条门禁类 P0 已在前文编号并论证（**P0-8** coverage 假绿、**P0-9** 门禁文件全部未入库、**P0-10** 41% 阈值失去棘轮意义）。本章补齐同一主题下的 P1/P2 与实证记录。

### P1 级：文档数字全面过期

| 位置 | 文档写的 | 实测 |
|---|---|---|
| `README.md:48` | 基线 41.91% | **41.12%** |
| `README.md:64-68` | 4072/9715，+5.11pp | **4072/9902** |
| `docs/GATE-REVIEW.md:66,75,94-103` | 41.91% / 9715 / 9726 / 10651 四个分母并存 | 9902 |
| `README.md:27` | `npm test # 14 步` | ✓ 正确 |
| `.githooks/pre-push:38` | 「13 步」 | ✗ 应为 14 |
| `.github/workflows/ci.yml:38` | 「14 步」 | ✓ 正确 |

分母漂移 +187 行来自 3 个新增的 untracked 文件（ChapterRail 44 + CountUp 9 + useMotion 111 = 164，另 23 行零散）。**三处"步数"口径不一致**（README 14 / pre-push 13 / ci.yml 14）。

### 测试盲区实证（infra-reviewer 变异测试）

| 变异 | 结果 |
|---|---|
| M1 `catalog.js` o-none hex `#00000000`→`#000000ff` | `validate.mjs` **红** ✓ |
| M2 `Sources.jsx` 排序反转 | `test-sources.mjs` **红**（46 通过 / 3 失败）✓ |
| M3 `backup.js:527` mergeCalendar 排序反转 | `test-backup-v2` **红** ✓ |
| **M3b `backup.js:334` sanitizeCalendar 日期排序反转** | **5 个测试全绿**（exit 0 × 5），行为确实变了（`e2,e1,e3` → `e3,e1,e2`）✗ |

M3b 是最实在的盲区：**数据清洗路径的排序逻辑，一套测试都没盯住。**

其他测试问题：
- `scripts/test-share.mjs` **一个 assert 都没有**（0/1300 行），全靠自定义 `ok()`。
- `scripts/test-engine.mjs` 只有 28 行、1 个 assert。
- 13 个 test 脚本零公共 test-utils，`let failed=0 / const ok / const bad / const check` 样板在 9 个文件复制粘贴。
- `scripts/test-sources.mjs:128-129,415-416,471-489,539-547` 直接 `readFileSync` 读 `.jsx`/`.css` 源文本做正则断言——**重构 UI 会红而行为不变**（过度耦合实现）。
- `scripts/test-sources.mjs:7,17-26,570` 用 `symlinkSync` junction 指向 `node_modules` 才能跑，node_modules 缺失环境直接失败。

---

## 五、数据层：6 条 P1 值得一起修

### P1-1 删单品不清理孤儿引用

`src/data/wardrobe.js:303-310` 的 `removeItem` 只删自己，日历/收藏/胶囊里的 `u-` 引用全部留下。UI 直接显示原始 UUID：`src/components/OutfitCalendar.jsx:73` 的 `findItem(id)?.name || id`。

### P1-2 `useMemo` 永不命中，日历每帧重算

- `src/components/OutfitCalendar.jsx:96-98`：`useMemo(..., [calendar.state, wardrobe])`
- `src/hooks/useWardrobe.js:191-205` 每次返回**新对象**（`{ items, create, update, ... }` 全部重建）→ 依赖每次都变 → **useMemo 每次重算**。

实测：600 条约 18ms、2000 条约 **60ms/帧**。当前数据量小所以没暴露，是个定时炸弹。

### P1-3 备份导出无尺寸上限，可产出数十 MB 文件

- `src/data/backup.js:734` 全量 `JSON.stringify` 内联 base64。
- `src/data/imageStore.js:332`：PNG/WebP 首轮**直接 return**，不受 900KB 目标约束；`:280-282` 压缩失败还降级存原图。
- 结果：备份可达数十 MB；单图 >4MB 时导出**静默跳过**（`:465-468`），用户以为备份完整实则缺图。

### P1-4 胶囊允许硬冲突共存

`src/data/capsule.js:170-174` 的 `hardConflict` 每次只传两件且拒绝同槽位，凑不出需要 top 的规则。实测 work 场景同时选中「卡其短裤」+「乐福鞋」（正是 `conflicts.js` 里定义的一条硬冲突）。

### P1-5 `incomingIsNewer` 用字符串比时间戳

`src/data/backup.js:343-349` 用字符串比较 ISO 时间，`'…T06:00:00Z'` vs `'…T06:00:00.000Z'` 精度不同会选错较新方 → 导入时可能**不提示覆盖**或**错误覆盖**。

### P1-6 零 `storage` 事件监听

全项目无 `addEventListener('storage')`，多标签页后写覆盖先写。与 P0-7 同源（缺跨上下文同步机制）。

---

## 六、性能：除了 3D 空转，还有两处结构性浪费

| 项 | 实测 | 说明 |
|---|---|---|
| 首屏（preview 构建） | 4 resource / 2 js / 817KB / FCP 352ms | 可接受 |
| 到 studio 后 | 3 js / 405KB | 懒加载生效 ✓ |
| 单文件版 | **3.57MB**（gz 2077KB / br 1984KB） | 可接受 |
| Mannequin chunk | **770.9KB → gz 204.9KB** | three+fiber+drei 全在一个 chunk，未再拆 |
| 字体 | **603.6KB，gzip 完全无效** | Noto Serif SC 子集，占单文件 17% |
| PBR webp | 24 张约 1MB，gz 无收益 | 已压缩 |
| **3D 空闲渲染** | **46,577 draws/秒（滚出视口后）** | 见 P0-5 |

**分包建议**：`vite.config.js` 的 `manualChunks` 只把 `node_modules/react` 拆成 `react-vendor`，`three + @react-three/fiber + drei` 全部塞进 Mannequin chunk。可再拆 `three-core` / `drei`，让不涉及 3D 的加载路径少下 200KB gz。

**字体**：603.6KB 不可压缩是硬伤。建议检查子集是否过宽（是否包含了大量不用的字），或改为按章节分片 `unicode-range` 分段加载。

---

## 七、无障碍与体验：这是项目做得最好的部分

### 实测达标项

| 检查 | 实测 |
|---|---|
| h1 数量 | 1 个 ✓ |
| heading 总数 | 78 |
| `aria-label` | 159 处 |
| 无名称按钮 | **0** ✓ |
| 无 href 锚点 | **0** ✓ |
| landmark | nav 3 / main 1 / footer 1 ✓ |
| lang | `zh-CN` ✓ |
| skip-link | 「跳到主要内容」存在 ✓ |
| 横向溢出（390px 移动端） | **无**（docScrollW = clientW）✓ |
| 全站 `outline:none` | 无 ✓ |
| 图标 aria | `icons.jsx:5-17` 统一 `aria-hidden` + `focusable="false"` ✓ |
| 表单 label | `OutfitCalendar.jsx:203,215` 有 `htmlFor`/`id` ✓ |
| 对比度 < 4.5:1 | **仅 2 处** |

### 2 处低对比度（都是一行 CSS 能修）

1. `src/styles/calendar.css:134-142` 的 `.cal-star` 未选中态 `color: var(--line)` → **1.48:1**（深色主题）。应改 `--ink3`（5.04:1）。
2. `src/styles.css:506` 的 `.law .n`（法则编号，`color: var(--accent-soft)` + `-webkit-text-stroke: 1px var(--accent)`）→ **1.17:1**。装饰性大字号可放宽到 3:1，但 1.17 仍不足（描边导致实测对比度反而低于纯 fill）。

### prefers-reduced-motion：四处配合，真实贯通（少见）

- CSS：`src/styles.css:661-669` 全局 `animation-duration: 0.001ms !important`
- CSS：`src/styles/motion.css:270-307` 逐条 `animation: none !important`（15 类 hover transform + `::view-transition-*`）
- JS：`src/hooks/useMotion.js:9-29,35-71,105-138`（`useCountUp` 直接跳终值）
- 3D：`src/three/Mannequin.jsx:99-114,221`（`autoRotate={autoRotate && !reducedMotion}`）
- 转场：`ThemeToggle.jsx:102` 的 `startViewTransition` 也做了判断

**这是我在同类项目里很少见到的完整度**，值得保留。

### 扣分项

- **91 个可点元素 < 32×32px**（390px 移动端实测）。WCAG 2.5.8 最低 24px，建议 44px。
- `src/App.jsx:441,454` 内联 `style={{ border: 0, background: 'none', padding: 0 }}` 让「×」按钮可点区 ≈ 字形（~14px）；`src/styles.css:656` 的 `.chip .x { min-width: 44px; min-height: 44px }` 只在 `@media (pointer: coarse)` 内生效，**桌面鼠标用户拿到的仍是 14px 目标**，低于 WCAG 2.5.8 的 24px。
- `Sources.jsx:245`、`CapsulePlanner.jsx:237` 有 `aria-expanded` 无 `aria-controls`。
- `LazyStudio.jsx:7-15` 能力探测 `getContext('webgl2')` 后不 `loseContext()`，白占 WebGL context 名额（浏览器上限约 16）。

---

## 八、架构与代码组织

### 做得好

- **数据层纯 ESM、可注入**：`data/*.js` 全部不 import components/three，`storage`/`imageStore`/`now` 都是参数注入——所以能用 node 直接跑测试（覆盖率 91.82% 就是这么来的）。
- **防御完整**：`getAdvice` 对 state 缺失/字段类型错全部降级不抛；`validateBackup` + 全套 sanitize 白名单重建（实测注入 `__proto__`/`constructor` 后 `Object.prototype` 干净）；导入事务性（写前逐 key 快照，任一失败全量回滚）。
- **时区处理正确**：`calendar.js:49-54` 用 `getFullYear/getMonth/getDate` 拼本地键，**明确拒绝 `toISOString`**；`:62-68` 用 `new Date(y,m-1,d)` 回校验，`2026-02-30` 被拒。这类坑绝大多数项目都会踩。
- **Quota 有捕获**：`usePersistentState.js:31-34`、`wardrobe.js:501-504`、`calendar.js:312-314`，UI 有 `persistence.degraded` 提示。
- **几何体模块级共享**：`garments.jsx:67,113-120` 的 `lathe()` 模块加载时创建一次。
- **纹理缓存真去重**：`three.module.js` 的 `_sources`/`getTextureCacheKey` 按 Source 去重，实际显存约 25MB，**不是泄漏**（ui-reviewer 主动排除了自己的原假设，这点很专业）。

### 需要改

1. **零 `React.memo`**（全库 grep）：任一 outfit 变更重渲全部 10 个 section——Sources 24 卡、日历 42 格、CapsulePlanner、PreferencePanel 全部重算。`App.jsx:269` 的 `advice` 虽 useMemo，但下游未 memo。
2. **渲染期写模块级全局**：`src/App.jsx:95` 在渲染体里调 `setWardrobeItems(wardrobe.items)`，写 `src/data/catalog.js:146-151` 的模块级 `let wardrobeIndex`。并发渲染中**被丢弃的 render 会把全局注册表留在错误版本**。React 18 的 StrictMode 双渲染目前没炸，但这是运气。
3. **同一逻辑反复重写**：
   - `normalizeOutfit`/`outfitItemIds` 在 `calendar.js:129,151` 与 `preferences.js:122,137` 各一份，**语义还不同**（见 P0-6）。
   - `resolveItem` 在 `calendar.js:107` / `preferences.js:171` / `personalRecommendations.js:87` **三份**。
   - `isPlainObject`/`clamp` 在 6 个文件各自定义。
4. **39 处内联 style**（`style={{...}}` 全库计数，`src/App.jsx` 独占 18 处）：`src/App.jsx:292` 的 `style={{ gap: 20 }}` 与 `src/styles.css:134` 的令牌 `--nav-gap: 15px` 直接冲突（实测 nav 实际 gap 是 20px）。令牌系统被绕过，改令牌不生效。
5. **单文件过大**：`src/three/garments.jsx` 799 行、`src/data/backup.js` 741、`src/data/advice.js` 592、`src/data/calendar.js` 576。
6. **CSS 107KB / 15 文件**：`styles.css` 729 行 37.1KB 是唯一"巨型文件"，可再拆。

### 死代码与冗余

- `src/data/advice.js:561`：`if (hasOuter && outer.warmth >= 4 && top.warmth <= 1) { value += 0 }` —— **no-op**。
- `src/data/advice.js` 的 `scorePalette` 里 `const weight = { 0: 0 }` 与 `weight[0] += w` 是死代码（`weight` 从未被读）。
- `:410/473/535/579` 全部 `notes.slice(0,3)` 截断理由，用户看不到完整解释。
- `:664` `colorCount` 只算 `top/outer/bottom`，**漏算鞋和配饰**，与 `scorePalette` 口径不一致。

---

## 九、优化建议（按投入产出比排序）

### P0 → 修复动作对照（确保无遗漏）

| P0 | 修复动作 | 落在第几梯队 |
|---|---|---|
| P0-1 批量 wear 丢计数 | 加 `wearMany(ids)` 批量原语 | 1 |
| P0-2 损坏数据被洗白 | `usePersistentState` 首帧不写 + 备份残骸 | 2 |
| P0-3 重置不删照片 | `resetAll` 串联 `clearImages` | 2 |
| P0-4 滚轮被画布劫持 | `enableZoom={false}` | 1 |
| P0-5 3D 空转 | `frameloop` + `ContactShadows frames={1}` + `shadowMap.autoUpdate=false` | 1 |
| P0-6 `o-none` 污染统计 | 抽 `outfitShape.js` 统一并排除 `o-none` | 2 |
| P0-7 导入收藏被覆盖 | `looks` 提升到 App 层 | 2 |
| P0-8 coverage 假绿 | `pass` 加 `&& failedRuns === 0` | 1 |
| P0-9 门禁文件未入库 | `git add` 7 个路径 + repo 级 `hooksPath` | 1 |
| P0-10 41% 阈值失效 | 分母移出 never-loaded 文件 | 3 |

### 第一梯队：今天就能做完，收益最大

| # | 动作 | 预计耗时 | 收益 |
|---|---|---|---|
| 1 | `enableZoom={false}` 加到 OrbitControls | 1 行 | 修掉全页最烦的滚动陷阱 |
| 2 | `<Canvas frameloop={inViewport?'always':'demand'}>` + `<ContactShadows frames={1} />` | ~20 行 | 砍掉 46,577 draws/秒 的空转 |
| 3 | `coverage.mjs` 的 `pass` 加上 `&& failedRuns === 0` | 1 行 | 门禁从"假绿"变"真绿" |
| 4 | `git add` 那 7 个门禁文件 + 设 `core.hooksPath` 为 repo 级 | 5 分钟 | 门禁真正生效 |
| 5 | 星标对比度 `var(--line)` → `var(--ink3)` | 1 行 | 最后一个 a11y 硬伤 |
| 6 | `wearMany(ids)` 批量原语替换 `recordLook` 的循环 | ~15 行 | 修掉数据丢失 |

### 第二梯队：本周内，显著提升可信度

| # | 动作 | 收益 |
|---|---|---|
| 7 | `scorePalette`/`scoreSilhouette` 起始值降为 18/15，让规则双向可动 | 评分分布从 37 个值拉开到预计 60+ 个 |
| 8 | `partWarmth` 在目标区间内按偏离距离线性扣分 | 天气分从 5 个值拉开；今日排序才真正有区分 |
| 9 | 契约加分布断言（P50 62-72 / ≥85 <15% / min<55）+ 写进测试 | 防止评分回退 |
| 10 | 统一 `outfitItemIds`/`resolveItem` 到 `src/data/outfitShape.js`，排除 `o-none` | 修 P0-6 + 消 3 处重复实现 |
| 11 | `usePersistentState` 首帧不写 + 损坏数据备份到 `corrupt:<key>` | 修 P0-2 |
| 12 | `resetAll` 串联 `clearImages` | 修 P0-3 |
| 13 | `looks` 提升到 App 层（或 `syncFromStorage` 后通知 ShareBar reload） | 修 P0-7 |
| 14 | 更新 README/GATE-REVIEW 覆盖率数字到 41.12% / 4072/9902；统一"14 步"口径 | 文档可信 |
| 15 | `manualChunks` 拆 `three-core` / `drei` | 首屏少下 200KB gz |

### 第三梯队：架构级，需排期

| # | 动作 | 说明 |
|---|---|---|
| 16 | `React.memo` 包裹 Sources / OutfitCalendar / CapsulePlanner / PreferencePanel | 任一 outfit 变更不再全站重渲 |
| 17 | 把 `setWardrobeItems` 移出渲染体（`useLayoutEffect` 或 `useMemo` 内联） | 消除渲染期副作用 |
| 18 | 覆盖率的"未加载文件"从分母移出，单独报 `untestedFiles` + 独立阈值 | 41% 重新变成有意义的数字 |
| 19 | 加 `storage` 事件监听做多标签同步 | 修数据竞争 |
| 20 | 抽 `scripts/lib/test-utils.mjs`（`ok`/`bad`/`check`/`assert` 样板统一） | 9 个文件去重，约 -400 行 |
| 21 | `test-sources.mjs` 的源文本正则断言改为行为断言 | 重构不再误红 |
| 22 | 字体分片 `unicode-range` 或重做子集 | 603.6KB 不可压是最大单文件 |
| 23 | `capsule.js:301-313 countCombinations` 加剪枝 | 满衣橱 58 件时 405ms |
| 24 | 装 `eslint` + `prettier`（当前零配置） | 现在 lint.mjs 只做语法检查 |
| 25 | 建 git remote 并验证 CI 真跑 | 目前 ci.yml 是死文件 |

---

## 十、结论

**这是一个"产品完成度显著高于工程严谨度"的项目。**

内容层面（59 件单品、187 条来源、16 条法则、10 个章节、3D 试衣间、日历、胶囊、分享、备份）已接近可交付水准，纯前端零后端零依赖、双击即用、离线可用——这些成绩在同类项目里属于上游。

真正的问题集中在三处：

1. **3D 空转**（46,577 draws/秒）——唯一一个所有用户必然触发、且用户能直接感知（耗电/风扇）的性能缺陷，改 20 行就能解决。
2. **评分体系通胀**——37 个分值、天花板 93、70.8% 的天气分是满分。这不是 bug，是**设计刻度问题**；但它直接削弱了产品最核心的价值主张（"帮你判断穿得好不好"）。
3. **门禁形同虚设**——coverage 对测试失败免疫（P0-8）、门禁文件全未入库（P0-9）、41% 阈值已失去棘轮意义（P0-10）、git 无远端。项目有一套看起来很完整的工程纪律，但**没有一条真正在生效**。

数据丢失那 4 条 P0（P0-1 批量 wear、P0-2 损坏洗白、P0-3 重置不删照片、P0-7 导入被覆盖）虽然每条的触发条件都不算高频，但它们的共同特征是**静默、不可逆、且发生在用户最信任的操作上**（记录穿着、导入备份、重置数据）。这类缺陷对信任的伤害远大于其触发概率。

**如果只能做三件事**：先修 3D 空转（20 行，收益立竿见影），再修 4 条数据 P0（都是小改动），最后把评分起始值降下来（这是产品核心主张的兑现）。

做完这 6 项（3D 空转 + 4 条数据 P0 + 评分刻度），这个项目可以到 **78-82 分**。

---

## 附录：本次复查的方法与可复现路径

所有结论都基于可复现的实测，不是静态阅读的猜测：

- **评分分布**：`node -e "import('./src/data/advice.js').then(...)"` 穷举 16848 组合，统计 `score.total` 的直方图/分位数/维度满分率。
- **3D 空转**：在浏览器控制台 monkey-patch `gl.drawElements`/`gl.drawArrays` 计数，滚动到 canvas 完全离开视口后采样 2000ms。
- **批量 wear**：`node -e` 直接 import `recordWear`，先模拟闭包循环（用同一份 state 连续调用），再模拟逐次串接，对比 `wearCount`。
- **o-none 污染**：`node -e` import `monthStats`，构造含 `outer:'o-none'` 的三条记录，检查 `topItems` 是否出现 `{"id":"o-none"}`。
- **对比度**：遍历所有文本节点，用 `getComputedStyle` 取前景/背景色，按 WCAG 公式算比值。
- **a11y**：遍历 `button`/`a`，检查 `accessibleName` 是否为空、`href` 是否存在；统计可聚焦元素与触控目标尺寸。
- **coverage 假绿**：在临时目录构造两个 exit 1 的脚本，跑 `scripts/coverage.mjs --min-lines=0` 看退出码。
- **变异测试**：改一行源码 → 跑对应测试 → `git checkout` 还原 → `git status` 确认干净。

---

*本报告由 Lead 与 3 位并行审查员（data / ui / infra）共同产出，所有 P0/P1 均有文件:行号级证据与实测复现记录。审查期间未修改项目源码，工作区保持 31 条未提交改动原状。*

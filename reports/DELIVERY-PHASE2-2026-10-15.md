# 阶段二交付报告 · 天气推荐 / 穿搭日历 / 胶囊衣橱

日期：2026-10-15
成品：`D:\穿搭\型格穿搭实验室-双击打开.html`、`D:\穿搭\style-lab\dist-single\index.html`
契约：`D:\穿搭\style-lab\docs\PHASE2-CONTRACT.md`

---

## 一、这一阶段做了什么

阶段一解决的是「把衣服管起来」。阶段二解决的是每天真正要回答的三个问题：

1. **今天穿什么** —— 填入天气与场合，系统按保暖、防雨、防风、室内外、通勤方式打分排序（`#today`）。
2. **我昨天穿了什么、哪些衣服在闲置** —— 本地日历记录造型，统计高频单品与连续重复（`#calendar`）。
3. **哪十几件就能撑一季** —— 12–20 件的胶囊衣橱，给出组合数、覆盖率与购买优先级（`#capsule`）。

三节都插在「我的衣橱」之后、「3D 试衣间」之前，导航编号顺延为 01–10。

## 二、新增模块

| 文件 | 规模 | 职责 |
| --- | --- | --- |
| `src\data\daily.js` | 527 行 | 今日条件、季节/保暖目标、五维天气适配评分、Open-Meteo URL 与解析（不主动联网） |
| `src\data\calendar.js` | 666 行 | 本地日期日历、CRUD、月度统计、闲置判定、连续重复 |
| `src\data\capsule.js` | 583 行 | 胶囊配额、硬冲突、配对分、组合数、覆盖率、缺口与补齐优先级 |
| `src\hooks\useDaily.js` | 9.4 KB | 条件状态 + 联网/定位动作 + 存储降级 |
| `src\hooks\useCalendar.js` | 4.5 KB | 日历状态与 CRUD |
| `src\components\TodayPlanner.jsx` | — | 今日面板 |
| `src\components\OutfitCalendar.jsx` | — | 日历与统计面板 |
| `src\components\CapsulePlanner.jsx` | 239 行 | 胶囊面板 |
| `src\styles\today.css` / `calendar.css` / `capsule.css` | — | 三节样式，只用既有令牌，深浅色自动适配 |

测试：`scripts\test-daily.mjs`（42 条）、`test-calendar.mjs`（33 条）、`test-capsule.mjs`（36 条）、`test-backup-v2.mjs`（26 条），全部串入 `npm test`。

## 三、验收证据

```
& npm.cmd test              EXIT=0
  validate        13 组 ok + 全部通过        59 件（16/9/13/9/12）· 16,848 组合 · 评分 span 36
  test:engine     ✓ 建议引擎语义断言全部通过
  test:wardrobe   ✓ 41 条（CRUD / 状态 / 照片 / 筛选统计 / 存储降级）
  test:preferences ✓ 77 组
  test:backup     ✓ 13 种损坏包 + 合并/覆盖/回滚/重置
  test:backup-v2  ✓ 26 条（v1 兼容 + daily/calendar 合并 + 坏数据清洗 + 往返）
  test-daily      ✓ 42 条
  test-calendar   ✓ 33 条（本地日期 + CRUD + 坏数据 + 统计口径）
  test-capsule    ✓ 36 条

& npm.cmd run build:release EXIT=0
  675 modules transformed
  dist-single/index.html  1,527.28 kB │ gzip 535.18 kB
  单文件成品已复制到：D:\穿搭\型格穿搭实验室-双击打开.html
```

浏览器实测（`file://` 直开，ego-browser，桌面 1264×805 与移动 500×881 两档）：

- 两档均 `documentElement.scrollWidth === clientWidth`，**零页面级横向溢出**；移动档逐元素扫描越界元素 2 个，但都落在自身 `overflow-x` 容器内，无裸露溢出。
- 十个章节与九个导航锚点齐全；无错误边界、无破图、无无名按钮（可访问名 100%）。
- 3D 试衣间滚入视口后 canvas 挂载成功，`glLost:false`；个人单品「试穿」后衣柜条正确显示其名称。
- 「记录今天穿了」写入日历后条目数 17→21、live region 播报「已记入穿搭日历」。
- 截图：`reports\phase2-today-desktop.png`、`phase2-today-mobile.png`、`phase2-capsule-desktop.png`、`phase2-nav-mobile.png`。

## 四、本阶段修掉的真实缺陷

测试与新写的探针不是形式，它们抓出了 9 个真问题：

1. **`src\hooks\useDaily.js` 重复声明 `setWeather`** —— `const [weather, setWeather]` 与 `const setWeather = useCallback` 同作用域，SyntaxError，整个文件无法构建。已把状态 setter 改名 `setWeatherInfo`。
2. **`src\data\daily.js` 的 `planToday` 没摊平 `.outfit`** —— `recommendOutfits` 把槽位放在 `.outfit` 里，直接读顶层得到 undefined，导致 `totalWarmth` 恒为 0、所有造型 `outfitKey` 相同、天气评分整条链失效。现在与 `ProfileRecommender.jsx` 同口径先摊平。
3. **`conditionFromWeatherCode` 没有上界** —— `c >= 95` 会吞掉任意大数（9999 → 雨）。WMO 码只到 99，已加上下界判断。
4. **`normalizeDaily` 对空 `updatedAt` 误告警** —— 每次 encode/decode 往返都凭空多一条告警。非文本才告警。
5. **个人衣橱单品在界面上是空白** —— 衣柜条、3D、建议引擎都按 id 去系统目录里查，查不到。已在 `src\data\catalog.js` 加运行时叠加层 `setWardrobeItems()`，由 App 每帧同步登记。
6. **含个人单品的造型会生成解码即失效的分享死链** —— 短链编码用的是系统目录下标。新增 `canEncodeOutfit()`，ShareBar 在编链前拦下并提示改用清单或造型卡。
7. **胶囊区高 4914px** —— 空衣橱时 31 条补齐建议全部展开，比整页其余部分加起来还长。默认 6 条 + 「显示全部 31 条补齐建议」折叠开关，降到 1850px。
8. **胶囊「目标件数」一行按钮压住数值** —— 1264px 下就已重叠。改成 flex 换行，实测由重叠变为 10px 间距。
9. **手机上导航整条 `display:none`** —— 十节内容只能一路滚，跳不过去。改为 logo/主题按钮留一行、链接折下去横向可滑（纯 CSS，无 JS 菜单），实测 9 个链接可见且可滑、无溢出。

另有 4 条测试断言是我自己写错的（不是模块 bug），已在报告之外的提交说明中记录，未改动被测代码。

## 五、过程说明

本阶段三个分支的成员（`t1-engine` / `t2-sources` / `t3-share`）各失败两次后不再产出，且 `spawn_teammate` 被硬拒（成员上限 8）。按 R8 兜底条款，剩余实现由 Lead 直接接管；已落地的两个纯模块（`daily.js`、`capsule.js`）逐行核对后保留并复用，未重写。

## 六、阶段三待办

按用户授权继续：二维拼贴与多套对比、3D 体型参数、性能优化（首屏与包体）、版本迁移（v1→v2 之外的后续）、完整浏览器测试矩阵（含浅色/深色 × 桌面/移动四档）。

# STYLE LAB · 阶段二契约（每日使用闭环）

## 1. 原则
- 离线优先：手动天气、日历、统计、胶囊衣橱在 `file://` 下完整可用。
- 联网增强必须由用户主动触发；失败只给可见中文提示，不影响手动输入。
- 不新增 npm 依赖；纯逻辑模块不得引用 React、DOM 或网络。
- 全部本地数据可被阶段一备份导出/导入/重置。

## 2. 今日条件 v1
存储键 `stylelab:daily:v1`，结构：
```js
{ version:1, city:'', temp:20, condition:'clear', wind:'light', indoor:'normal', commute:'walk', occasion:'casual', updatedAt:'ISO' }
```
- `condition`: clear/cloudy/rain/snow；`wind`: light/strong；`indoor`: none/normal/strong；`commute`: walk/transit/car。
- 手动输入永远可用。联网按钮可用 Open-Meteo（先 geocoding，再 forecast）；浏览器定位只在明确点击后请求。
- 今日推荐输出 3 套，复用系统推荐与个人衣橱排序；每套含天气适配分、理由、警告、已有占比、缺少项。

## 3. 穿搭日历 v1
存储键 `stylelab:calendar:v1`，结构：
```js
{ version:1, entries:[{ id:'c-...', date:'YYYY-MM-DD', outfit:{top,outer,bottom,shoes,accs}, weather:{temp,condition}, occasion, note:'', rating:null|1..5, createdAt:'ISO', updatedAt:'ISO' }] }
```
- 同日可多条；CRUD、损坏数据逐条丢弃、安全降级。
- 记录“今天穿了”时，对其中个人单品逐件调用衣橱 `wear(id)`。
- 统计：本月天数/造型数、单品频率、颜色/风格趋势、连续重复、30/60/90 天闲置提醒。

## 4. 胶囊衣橱
纯函数输入：季节、场景、个人衣橱、目标件数 12–20。输出：
- `selected` 核心单品、`missing` 建议补齐、可组成造型数、每件覆盖率、购买优先级与理由。
- 优先 owned；wishlist 可作为补齐候选；系统单品只作建议购买，不冒充已有。
- 至少覆盖 top/bottom/shoes；冷季覆盖 outer；避免硬冲突。

## 5. UI 与集成
- 新增 `#today`（今日穿什么）、`#calendar`（穿搭日历）、`#capsule`（胶囊衣橱），置于 `#wardrobe` 后、`#studio` 前。
- 今日推荐可一键试穿；记录到日历时使用 App 当前 outfit。
- 日历、天气 store 各只在 App 创建一份并向下传递，不允许子组件重复创建写盘 store。
- 导航与章节号同步更新；移动端无页面级横向溢出。

## 6. 备份 v2 兼容
- 阶段一备份包 schema 不变；应用支持版本提升到 2。
- `STORAGE_KEYS` 增加 daily/calendar；v1 包仍可导入，缺少的新字段按空状态处理；v2 可完整往返。
- 合并策略：daily 取 updatedAt 新者；calendar 按 id 合并，冲突取 updatedAt 新者。

## 7. 门禁
- 新增 `scripts/test-daily.mjs`、`scripts/test-calendar.mjs`、`scripts/test-capsule.mjs`，串入 `npm test`。
- 覆盖正常、边界、损坏存储、断网/缺定位降级、日期与时区边界、空衣橱、12/20 件边界、备份 v1→v2 兼容。
- `npm test`、`npm run build:single`、`npm run build:release` 全绿，根目录单文件更新。

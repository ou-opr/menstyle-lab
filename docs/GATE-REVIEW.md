# 门禁复盘：一条被误判的「恒真断言」

本文件记录 2026-10-17 这一轮「补齐测试门禁」的核查过程与结论。
起因是一份第三方评审的 4 条建议，其中第 1 条的核心指控经实测**不成立**，
而它外层的三个判断（无 lint / 无覆盖率 / 无 CI）**成立**。
这份文档存在的意义是：把「哪些是真问题、哪些是误判、误判是怎么被证伪的」留下来，
避免下一轮有人照着错误的结论重复返工。

## 一、评审 4 条建议的实测裁决

| # | 评审原文 | 裁决 | 证据 |
|---|---|---|---|
| 1 | 无覆盖率的 580 个断言 / 无 CI / 无 lint；`test-sources.mjs:361` 还留着一条恒真断言（只 console.log 无 assert） | **外层成立，核心指控不成立** | 见下节 |
| 2 | three 26 MB 未分包，首屏加载完整 three | **不成立** | 首屏 chunk `dist/assets/index-*.js` 内 `WebGLRenderer`/`BufferGeometry`/`Object3D` 命中均为 **0**；three 在懒加载的 `Mannequin-*.js`（770 KB）。`dist/` 全部 27 个文件合计 **2447 KB**，不存在 26 MB |
| 3 | `advice.js` 约 250 行硬编码 `applyId` 且 `getAdvice` 不校验 | **不成立** | `src/data/advice.js:255-271` 已有 `HARDCODED_APPLY_IDS` + `CATALOG_ID_SET`，缺 id 在**模块导入期直接抛错**（提交 `afe6c2f` 已修） |
| 4 | 路线 B 的 Phase 2/Phase 3 已立项未开始 | **查无实据** | 全工作区 grep `路线[AB]`/`Roadmap` 零命中；`docs/PHASE3-CONTRACT.md` §1 的「B 3D 体型参数」已完成并有 24 项断言 |

## 二、第 1 条的三个判断分别是什么结论

### 「580 个断言」——数字错，方向对
实测 `scripts/` 下 241 个 `check(...)` 块、**1302 处 `assert.` 调用**，不是 580。
用花括号配对切出每个 `check` 块函数体后统计块内 `assert` 数：**没有一个是「只打印不断言」**。

### 「`test-sources.mjs:361` 是恒真断言（只 console.log 无 assert）」——不成立
两个独立反证：

**反证 A（静态）**：该处（`scripts/test-sources.mjs:361-362`）实为
```js
const plays = r.items.map((s) => parsePlays(s.plays) ?? -1)   // 361
assert.deepEqual(plays, [...plays].sort((a, b) => b - a))      // 362
```
是 `assert.deepEqual`，不是 `console.log`。它拿「函数返回的顺序」与「同一数组按降序重排的结果」比较，
只有当函数确实返回降序时才成立。审查者可能只看到了上一行 `console.log(...)`（360 行）就下了结论。

**反证 B（变异测试，决定性）**：把 `src/components/Sources.jsx` 里
`return bv - av || byInputOrder(a, b)` 改成 `return av - bv || byInputOrder(a, b)`（排序方向反转），
再跑 `node scripts/test-sources.mjs`：

```
故意改反后测试通过 = false      <- 断言变红了
还原后测试通过 = true           <- 断言又绿了
```

**能变红的断言就不是恒真断言。** 该指控被证伪。

> 教训：判断一条断言有没有「牙」，不能靠读它像不像在打印，只能靠**让它失败一次**。
> 这也是本轮所有新门禁都被要求带 `--self-test` 的原因。

### 「无 lint / 无覆盖率 / 无 CI」——三项全部成立
- `node_modules` 内无 eslint / prettier / c8 / nyc / istanbul / vitest / jest。
- 无覆盖率机制。
- 无 `.github` 目录，`git remote` 为空。

## 三、本轮补上的东西

| 项 | 交付 | 它怎么证明自己会红 |
|---|---|---|
| lint | `scripts/lint.mjs`（10 条规则） | `--self-test`：10 条规则各喂一个违规样本断言必检出，6 个合法样本断言不误报 |
| 覆盖率 | `scripts/coverage.mjs` | `--self-test`：验证「引入未执行代码 → 覆盖率下降」「死分支不算 100%」「未加载文件仍计入分母」「生成物不计入分母」；另实测阈值 42/45 均 `exit 1` |
| CI | `.github/workflows/ci.yml` | 用真实 YAML 解析器（PyYAML）断言结构与步骤清单；**该解析器抓出裸 `on:` 被读成布尔 `true` 的真问题，已改为 `"on":`** |
| 本地门禁 | `.githooks/pre-push` + `scripts/install-hooks.mjs` | 破坏测试后 `git push` 实测 `EXIT=1` 且远端 refs 为空；还原后 `EXIT=0` |
| 换行符 | `.gitattributes` | `git ls-files --eol` 显示 `i/lf w/lf attr/text eol=lf` |

### 覆盖率为什么定 41% 而不是 60%

当前真实行覆盖率为 **41.16%**（4185/10167 行，56 个文件；其中被测试实际加载的 19 个文件为 92.02%，
33 个组件文件从未被任何测试加载）。连跑多次结果完全一致，无漂移。

> 这里的 41.16% 是**排除生成物之后**的口径，且是 2026-10-17 第二轮复查后的基线（新增 looks / outfitShape / references 三组测试与四个模块）。
> 差的 5.04 个百分点见下面「生成物污染」一节——那是一个真实缺陷，不是笔误。

阈值取 **41**（棘轮下限）而非 60，理由是：**一个从第一天起就必然变红的门禁会被关掉**，
关掉之后覆盖率重新变成无人看守。取 41 则当天通过、且**只许上调不许下降**——
把 `--min-lines` 调高是提升水位，任何让覆盖率跌破 41 的改动会立刻被拦。
要提升时改 `package.json` 的 `coverage` 脚本。当前余量 0.91 个百分点（阈值 42 即 `exit 1`），
留这点余量是刻意的：调到 41.9 会让任何一次小幅重构误伤无关改动。

### 生成物污染：一个差点被放过的缺陷

初版覆盖率把 `src/data/link-status.generated.js` 也算进分母与分子。这个文件由
`npm run check:links` 生成，基线只有 11 行；跑一次联网复检后膨胀到 **936 行**，且整份被 import、
**全部算作已覆盖**。后果：

```
基线文件（11 行）：  41.98%  (4083/9726)      <- 排除逻辑尚未实现，11 行已计入
刷新后（936 行）：  50.28%  (5121/10403)   <- 凭空 +9.12pp
```

方向是反的——**数据越全、覆盖率越高**，谁跑一次 `check:links` 就能免费抬高 5 个百分点，
棘轮彻底失效。修法是按文件名模式（`*.generated.*` / `*.gen.*` / `*.auto.*`）把生成物排除在分母外，
**同时把排除量与文件清单打印出来**（只让数字悄悄变小是另一种假绿）。修复后：

```
基线文件（11 行）：  41.16%  (4185/10167)，已排除生成文件 1 个 / 11 行
刷新后（936 行）：  41.16%  (4185/10167)，已排除生成文件 1 个 / 936 行
```

两者完全一致，不再随数据刷新漂移。`--self-test` 新增 9 条断言覆盖此口径，其中一条是
「若计入生成物，覆盖率会被凭空抬高（排除后 45.45% → 计入后 91.55%）」。

> 上表两组百分数（+5.04pp 与 README 里的 +5.11pp）不是矛盾，是**不同基线**：
> 本节的 41.98% 测于排除逻辑实现之前，11 行生成物还在分母里；
> 排除生效后基线变成 4072/9715 = 41.91%。两组数字的分子分母都正好差 11 行。
> 换句话说，`+5.04pp` 是「在污染基线上再加污」，`+5.11pp` 是「干净基线被污染」。

### 另一个被合法操作弄挂的门禁

`scripts/test-sources.mjs` 里原有两条断言把 `link-status.generated.js` 的**当时快照**写进了测试：

```js
assert.equal(counts.unchecked, 185)     // 原 144-147 行
assert.equal(counts.restricted, 2)
assert.equal(counts.verified, 0)
// 以及组合筛选里写死的 statuses: ['unchecked']
```

于是任何人照 README 跑一次 `npm run check:links`（合法操作），`npm test` 立刻 **2 项失败**。
实测分布会变成 `unchecked:0, verified:121, restricted:36, error:30`，而写死的 185/2/0 永远不再成立。
这一类「测试锁死数据快照」与「门禁必然变红」是同一个病灶，一并修掉：改为断言结构不变量
（状态枚举合法性、孤儿记录），组合筛选改为用命中集合自身的状态集合去筛。

> 修复过程中我自己先犯了一次同样的错：加的三条「有记录却标 unchecked」「记录状态与来源不一致」
> 「条数之和等于总数」全是恒真断言——因为 `src/data/sources.js:269` 是
> `status: checked?.status || source.status || 'unchecked'`，`status` 完全由 `LINK_STATUS` 派生，
> 且 `RAW_SOURCES` 里根本没有 `status` 字段。变异测试（4 个变异全部「通过」）把它暴露出来后已删除。
> 留下的两条各自有能失败的变异：来源状态改成未定义值 / 记录指向不存在的来源。


### 第三个：`check:links` 没有重试，瞬时失败被固化进版本库

`scripts/check-links.mjs` 原本对每条链接只请求一次。这在本项目里是错的，因为它的输出会写进
**受版本控制的** `src/data/link-status.generated.js`——一次网络抖动会被永久记录成「检测异常」并随提交固化。

实测证据（2026-10-17，并发 6，无重试）：

```
链接检测完成： { restricted: 36, verified: 121, error: 30 }
30 条 error 的目标主机： www.youtube.com 26 / www.reddit.com 3 / malefashionadvice.substack.com 1
```

随后用**完全相同的请求参数**把这几条串行重试，全部 200——说明失败来自并发抖动，不是目标站点拒绝。
同一域名下一次跑出 10 条 verified、26 条 error，也不可能是「站点针对该域名拒绝」。

修法是线性退避重试（1s/2s，`--retries` 可调），但**只对瞬时失败重试**：

| 情形 | 是否重试 | 理由 |
|---|---|---|
| 网络层异常（`fetch failed` / 超时） | 是 | 典型抖动 |
| `429 Too Many Requests` | 是 | 「太频繁，稍后再来」按定义就是重试能解决的 |
| `5xx` | 是（归为 `error`） | 服务端临时故障 |
| `401 / 403 / 451` | **否** | 持久性拒绝，重试浪费时间且加重对端负担 |
| `404 / 410` | 否 | 真实结论，重试无意义 |

对照实验（并发 12，YouTube 全量）：

```
--retries=1（等价旧行为）: { restricted: 36, verified: 147, error: 4 }
--retries=3（修复后）      : { restricted: 36, verified: 147, error: 4 }
```

并发 12 下两者都只剩 4 条 error，说明重试主要救的是**并发争用**；把并发降回默认 6 并全量重跑后：

```
链接检测完成： { restricted: 36, verified: 151 }     error = 0
```

重试逻辑本身用本地 HTTP 服务器做了双向验证（不是只测「重试代码跑到了」）：
第一次 429、之后 200 → `verified`，共请求 **2** 次；恒定 403 → `restricted`，共请求 **1** 次。

> 教训与前面一致：**会写文件的工具必须对「瞬时失败」和「持久结论」区别对待**，
> 否则一次抖动就会变成一条带时间戳的假记录，而且看起来和真记录一模一样。

顺带修掉同一处的第二个缺陷：`--help` 原来会**跑完全量检测并重写生成文件**。
实测 `node scripts/check-links.mjs --help` 会重写 `link-status.generated.js`（mtime 变化为证），
把「查帮助」变成一次破坏性操作。根因有两层，第二层比第一层更隐蔽：

1. 没有 `--help` 分支，未知参数被静默忽略后照常执行；
2. 参数解析是 `arg.replace(/^--/, '')`，只剥两个连字符，所以 `-h` 落成字面 key `-h`——
   **它不是「没被识别」，而是「被当成一个无关参数」继续跑全量**。只补 `--help` 判断是不够的。

修法：改成 `/^--?/` 同时接受单双连字符，并把帮助分支放在**任何副作用之前**。

```bash
node scripts/check-links.mjs --help   # 纯打印，0 请求，0 写入
node scripts/check-links.mjs -h       # 同上
```

验证方式不是「看到了帮助文本」，而是比对该文件的 `LastWriteTimeUtc`：两个命令执行前后
mtime **不变**（`文件被重写: False`），而修复前同一条命令会让 mtime 变化。


## 四、已知取舍

1. **CI 当前不会真正运行**：仓库没有 git remote，`workflow` 只有在推送到 GitHub 后才触发。
   本轮只保证配置正确且能被真实解析器解析，端到端 Actions 执行无法在此环境验证。
2. **`check:links` 不进 CI**：它是唯一联网步骤（187 条外部链接），既慢又受第三方影响，不适合当门禁。
   `test:freshness` 作为软门禁（`continue-on-error: true`），想收紧时删掉该行即可。
3. **CSS 语法检查的边界**：esbuild 的 css loader 是 bundler 语义、**从不报错**
   （实测 8 种畸形 CSS 全部无错），所以 `CSS-SYNTAX` 是自写的括号/注释配平扫描，
   查不出 `color red;` 这类缺冒号。这是工具能力边界，不是遗漏。
4. **`NO-CONSOLE-LOG` 只认 `console.log`**：`console['log']` 形式漏检。口径上算放水，要收紧再加规则。
5. **`CSS-COLOR` 残余误报风险**：值里含 `#` 的非颜色写法（如内联 SVG data-uri 里的 `%23fff`）
   理论上可能误报，当前基线 0 命中。
6. **门禁文件必须入库**（2026-10-17 第二轮复查发现并修复）：`.github/`、`.githooks/`、
   `.gitattributes`、`scripts/lint.mjs`、`scripts/coverage.mjs`、`scripts/install-hooks.mjs`
   在这一轮之前**全部处于 untracked 状态**，且 `core.hooksPath` 只是本机 local config。
   也就是说「三道门禁」只存在于这台机器的工作区里，任何人 clone 都拿不到。
   本轮已全部 `git add`；`core.hooksPath` 仍需每人跑一次 `npm run hooks:install`。

---

## 五、第二轮复查（2026-10-17）：三个真实的门禁缺陷

第一轮补上 lint / coverage / CI / pre-push 之后，第二轮复查用「制造失败」的方式
重新验证这些门禁，发现三处「看起来绿、其实没拦住」的真问题。

### 5.1 coverage 门禁对测试失败完全免疫（假绿）

`report()` 原实现只有 `const pass = pct >= minLines` 一行判定。也就是说：
**测试脚本全红，只要覆盖率数字够高，门禁照样返回 exit 0。**

复现（Lead 独立构造）：

```
临时目录放 validate.mjs(exit 1) + test-x.mjs(exit 1) + 2 个 src 文件
node scripts/coverage.mjs --root=<dir> --min-lines=0
> ! scripts\validate.mjs 退出码 1
> ! scripts\test-x.mjs 退出码 1
> EXIT=0            <- 两个测试脚本全挂，门禁全绿
```

修法：改成三重判定，任一不满足即 FAIL。

```js
const failedRuns = (m.results || []).filter((r) => !r.ok).length
const pass = pct >= minLines && failedRuns === 0 && never <= maxNeverLoaded
```

`--self-test` 新增 4 条断言，其中决定性的一条是「造一个 exit 1 的测试脚本、
但被 import 的代码全部执行（覆盖率 100%），门禁必须 FAIL」——
这条在修复前会绿，修复后必须红，才算证明修对了。

### 5.2 41% 阈值失去了棘轮意义

`coverage.mjs:221` 把从未被任何测试加载的文件按 0% 计入总分母。当时 52 个文件里
36 个从未加载，9902 行里 5467 行（55%）是结构性 0%。后果是：

- 总覆盖率不再反映「测试质量」，只反映「有多少文件没被 import」；
- **新增一个没测的文件就自动拉低覆盖率**——与「棘轮只升不降」的初衷正好相反，
  于是每次加新模块都得手动下调阈值，棘轮变成噪音。

修法：覆盖率门槛改按「已加载文件口径」（`loadedPercent`，当时 92.02%）判定，
未加载文件数单独设闸（`--max-never-loaded`，默认 40）。两个数字都打印出来，
并新增「未加载文件 1 个 + 上限 0 → FAIL / 上限 1 → PASS」的双向断言。

### 5.3 `sanitizeCalendar` 的排序方向没有任何测试盯住

变异测试（把 `backup.js:334` 的日期排序改反）结果：**5 个测试脚本全部 exit 0**，
而实际输出已经从 `e2,e1,e3` 变成 `e3,e1,e2`。这是第一轮「用变异测试找恒真断言」
时没覆盖到的一处真盲区。

修法：新增两条断言（`test-backup-v2.mjs`）——清洗后必须按日期降序，且换一个插入
顺序再验一次（排除「降序是碰巧由插入顺序造成的」）。

### 5.4 评分体系通胀（不是门禁问题，但属于同一类「看起来对其实没区分度」）

穷举 16848 组合的实测：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 不同 `total` 取值 | 37 | **57** |
| 最低分 / 最高分 | 57 / 93 | 34 / 91 |
| 中位数 | 82 | **70** |
| ≥85（「优秀」）占比 | 约 33% | **4.5%** |
| <70 占比 | 3.3% | 47.6% |
| 配色维度满分率 | 77.1% | 23.8% |
| 轮廓维度满分率 | 79.5% | 26.2% |
| 完成度维度满分率 | 50.0% | 35.2% |
| 天气适配分满分率 | 70.8% | 16.2% |

根因是四个维度全部**从满分起算**，规则只能往下扣，扣不动就给满分。
修法是把起始值下调到中等（palette 30→18、silhouette 25→14、completeness 12→10），
让「好搭配加分」这条路真的能动；同时给天气分的 `partWarmth` 在目标区间内
按「离区间中心的距离」线性给分（原来区间内一律 45 分满分）。

`validate.mjs` 的门槛随之收紧：取值数 ≥40（原 25）、span >45（原 25）、
≥85 占比 ≤15%、中位数必须落在 60–80。这四条一起把「改回起始即满分」变成红灯。

---

## 六、第三轮复查（2026-10-18）：17 条异步断言从未执行

这一轮的问题是**门禁本身没有被测的兴趣点**：`npm test` 全绿、
`test-wardrobe.mjs` 的输出看起来也正常，但它的异步断言一条都没跑。

### 6.1 症状与实测

```
# 修复前
$ node scripts/test-wardrobe.mjs | grep -c '^✓'
45            <- 44 个同步 check + 1 行汇总

# 文件里实际写了多少
$ grep -c '^check('  scripts/test-wardrobe.mjs     -> 44
$ grep -c '^acheck(' scripts/test-wardrobe.mjs     -> 17
```

45 从来都对得上「44 + 1」，所以没人怀疑过。真正的分母是 **61** 条断言。

### 6.2 根因

```js
const acheck = async (label, fn) => {           // 返回 Promise，但调用处没有 await
  try { await fn(); ok(label) } catch (e) { bad(...) }
}
...
acheck('saveCompressedImage 压缩到 1200 长边…', async () => { ... })
...
console.log('✓ 个人衣橱 v1 断言全部通过…')
process.exit(0)                                 // 同步退出，microtask 队列直接丢弃
```

`acheck(...)` 被调用时，函数体只同步执行到第一个 `await` 就返回，
后续的 `ok(label)` / `bad(...)` 与断言本身都排在 microtask 里。
脚本接下来是同步的 `console.log` + `process.exit()`，进程在 microtask 出队前就结束了。

对照组说明这不是「异步测试本来就不该放在这种脚本里」：`test-backup.mjs` 与
`test-backup-v2.mjs` 的调用处**全部**写成 `await acheck(...)`（11 / 3 处），
所以它们的异步用例一直在跑。只有 `test-wardrobe.mjs` 漏了 await。

### 6.3 影响面：正好是照片管线

被静默跳过的 17 条断言覆盖的是 `src/data/imageStore.js` 的全部对外行为：
压缩到 1200 长边、超 900KB 逐级降质量、拒绝非图片、压缩失败降级保存原图、
仓库不可用时返回 `ok:false`、删除幂等、导出/导入往返、坏记录跳过、
挂载失败不留孤儿照片……

也就是说：**照片这条链路上没有任何一条断言真正执行过，而门禁报告是绿的。**
覆盖率也帮不上忙——`imageStore` 被 `import` 就会执行模块顶层代码，
在覆盖率账本里同样是「已加载」，因此全量口径与加载口径都把它算进去了。

### 6.4 修法与新的判定

```js
const pending = []
const acheck = (label, fn) => {
  const task = (async () => { try { await fn(); ok(label) } catch (e) { bad(...) } })()
  pending.push(task)
  return task
}
...
await Promise.all(pending)     // 汇总之前先等全部异步断言落地
console.log(...); process.exit(failed === 0 ? 0 : 1)
```

修复后 `grep -c '^✓'` = **62**（61 条断言 + 汇总行），17 条异步用例首次真正执行，
其中包含本轮新增的 3 条（PNG 压缩目标、透明图不强转 JPEG、`exportImages` 的 `onSkip` 上报）。

### 6.5 教训

1. **断言数量必须与执行数量对账**：脚本应该自己打印「本文件执行了 N 条断言」，
   而不是让人从 ✓ 的条数去猜。一个靠 `grep -c '^✓'` 才能发现的门禁，
   在没有人去 grep 的时候就是不存在的。
2. **`process.exit()` 与未 await 的 Promise 是静默组合**：它不会报错、不会警告，
   只表现为「少打了几行」。凡是脚本里出现 `process.exit`，就必须确认所有异步任务都有 await。
3. 上一轮用「变异测试」证明断言有牙（§二），这一轮补上另一半：
   **先确认断言真的被执行，再谈它会不会变红**。

---

## 六、第三轮（2026-10-18）：覆盖率看不到的一半

前两轮把门禁修到了「会变红」，但仍有一个结构性盲区：
**57 个源文件里有 38 个是 UI，在覆盖率报告里恒为 0%**。

### 6.1 现象：一半的代码没有任何数字

```
行覆盖率：42.17%  (4339/10290 行, 57 个文件)
其中被测试实际加载的 19 个文件：93.88%  (4339/4622 行)
    0.0%      0/463    src/App.jsx  (never loaded)
    0.0%      0/334    src/components/DataManager.jsx  (never loaded)
    0.0%      0/206    src/components/CapsulePlanner.jsx  (never loaded)
    ... 共 38 个
```

「19 个文件 93.88%」看上去很好，但它只覆盖了**数据层**。
用户真正看到的东西（App、七个主题面板、西装拓展、3D 场景）全在那 38 个 0% 里。

### 6.2 归根：Node 里 import 不了 `.jsx`

`scripts/coverage.mjs` 跑的是 `node scripts/test-*.mjs`。Node 无法直接 import JSX，
所以所有 React 组件天然进不了分母——它们不是「没测」，是「测不到」。
这不是漏写了几个测试，是工具链选择带来的结构性盲区。

当时的兑现方式是「写了几条 E2E」。但 E2E 通过 = 主流程没断，
**不等于那些组件里的分支被执行过**。比如 `ExportCard` 有下载/降级/内存不足三条路径，
原来一条 E2E 都没路过它。

### 6.3 修法：用 Playwright 的 V8 精确覆盖补上另一半

`page.coverage.startJSCoverage()` 拿到的数据与 `NODE_V8_COVERAGE` **完全同构**
（都是 `{url, functions:[{ranges:[{startOffset,endOffset,count}]}]}`），
所以可以复用同一套「最内层 range」口径去折算行覆盖率。

新增：

| 文件 | 职责 |
|---|---|
| `e2e/coverage-fixture.js` | 开始/停止采集，按用例追加写 JSONL（避免 worker 间丢数据） |
| `scripts/ui-coverage.mjs` | 合并 range、折算行覆盖率、卡阈值，带 `--self-test` |
| `scripts/e2e-coverage.mjs` | 一条龙：跑 E2E → 合并 → 报告 → exit code |

**实测结果**：

```
UI 层行覆盖率：70.29%  (7233/10290 行, 57 个文件)
覆盖率最低的 12 个文件：
   13.6%     52/381    src/data/imageStore.js
   19.4%      6/31     src/data/references.js
   24.4%     21/86     src/data/share.js
   31.3%    187/598    src/data/backup.js
   32.0%      8/25     src/hooks/useCrossTabSync.js
   47.8%    308/645    src/three/garments.jsx
   53.0%    177/334    src/components/DataManager.jsx
```

与此同时补了 3 条 E2E（导出造型卡 / 拼贴导出 / 连续收藏），
UI 覆盖率从 **68.27% → 70.29%**，`ExportCard` 从 **18.2% → 58%+**。

### 6.4 为什么不直接把阈值拉到 90%

因为低分区里有几个文件**本身就不该由 E2E 覆盖**：

- `imageStore.js`（13.6%）：压缩管线靠 `createImageBitmap` + `canvas.toBlob`，
  headless 里画布编码行为与真机不同，硬要它高覆盖只会写成「测了 mock」；
  它的算法部分已由 `test-wardrobe.mjs` 的 17 条断言覆盖。
- `useCrossTabSync.js`（32%）：需要**两个真实标签页**才能触发 `storage` 事件，
  单页 E2E 天然触不到。要测就得开两个 context，成本不值得。

所以阈值取 **60%** 而非 90%：它能拦住「新加了一个完全没测的组件」
这类回归，又不会因为「测不到的部分」变红。

### 6.5 两条线都带自检

`coverage:ui:self-test` 用构造的文件与 range 证明三件事：

```
ok    只覆盖部分行时覆盖率不会满分（33.3% < 100.0%）
ok    全量覆盖时为 100%（实际 100.0%）
ok    两种覆盖情况的分母一致（分母不受命中情况影响）
ok    只有外层 range 命中不算覆盖（实际 33.3%）—— 最内层口径生效
ok    阈值 101%（高于实测 100%）→ exit 1
ok    阈值 100%（不高于实测）→ exit 0
```

第四条是关键：若只看「某个外层 range 命中」，把整个模块包一层函数就能伪造出 100%。
只有取**覆盖该行首字符的最内层 range**，才能真的区分「这行执行了」与「这块执行了」。

### 6.6 仍然做不到的

- **分支覆盖率**：现在只算行。一行里的 `a ? b : c` 只要走过一个分支就算覆盖。
- **组件单元测试**：没引入 jsdom / testing-library（契约 §0.1 禁止新增依赖），
  所以组件的边界分支仍靠 E2E 路径覆盖，而非逐个断言。
- **多标签页路径**：`useCrossTabSync` 需要两个 context，本轮未测。

---

## 七、第四轮（2026-10-18）：一次「为了性能而变慢」的修正

上一轮为了让 three 的缓存更友好，把 `three` / `@react-three/fiber` / `@react-three/drei`
各切了一个 chunk。当时的理由是「并行下载 + 改 UI 时 three 缓存不失效」，
但没验证过首屏到底付了什么代价。

### 7.1 发现：首屏就下载了 three

用 `performance.getEntriesByType('resource')` 量 preview 构建的首屏：

```
首屏 JS 5 个 / 395KB（gzip）
  index       128KB
  three-core  173KB   ← 本该只在 3D 试衣间加载
  three-fiber  12KB
  three-drei    8KB
  react-vendor 74KB
```

`three` 占了首屏的 **49%**，而用户只想看排版、法则、资源库时根本不需要它。

### 7.2 根因：拆 chunk 会造出静态 import

查 `dist/index-*.js`，发现一条副作用导入：

```js
import"./three-core-Ck0n6MB-.js";
```

为什么会有它：一旦 `three` 被 `manualChunks` 切成独立 chunk，Rollup 必须保证
该 chunk 的副作用在 `index` 执行前已运行，否则模块初始化顺序可能错。
而 Vite 见到 index 里有静态 import，就会在 index.html 里注入：

```html
<link rel="modulepreload" href="./assets/three-core-Ck0n6MB-.js">
```

于是「懒加载」被预加载折叠了。

### 7.3 修法：只拆 react-vendor

```js
manualChunks(id) {
  if (id.includes('node_modules/react')) return 'react-vendor'
  return undefined
}
```

实测对照：

| 方案 | 首屏 JS | 进 3D 后额外 |
|---|---|---|
| 拆 three（上一轮） | 5 个 / **395KB** | 0 |
| 不拆 three（现在） | 2 个 / **203KB** | 206KB |

**首屏省 192KB（-49%）**。代价是「改 UI 时 three 缓存失效」，
但 three 的版本号在 package.json 里锁死，本来就不常变；
而首屏体积是**每个访客每次**都要付的钱。这笔账之前算反了。

### 7.4 为什么要加断言而不是只改回来

这类回归从「构建成功」完全看不出来：构建会一直绿，只是首屏悄悄变胖。
所以新增 `scripts/check-bundle.mjs`，断言三件事：

1. 首屏 JS（gzip）≤ 260KB；
2. 首屏文件名里不出现 `three` / `Mannequin`；
3. 懒加载 chunk 确实存在。

第 3 条不是凑数：否则「首屏没有 three」可能只是它压根没产出（3D 会挂），
两种情况必须区分开。

`--self-test` 共 6 条，其中一条**精确复现了真实踩到的回归**：

```
ok    健康产物通过（首屏 135KB）
ok    识别出懒加载 chunk（Mannequin-bbb.js）
ok    预加载 three 时断言失败（复现了真实踩到的回归）
ok    失败原因指向「preload 了懒加载 chunk」
ok    首屏超预算时失败（265KB > 260KB）
ok    缺少懒加载 chunk 时失败（3D 会加载不出来）
```

### 7.5 教训

**「优化」不等于「拆包」。** 拆包的收益（缓存、并行）是二阶的，
不拆包的代价（首屏多下载）是一阶的。并且拆包会改变模块图的
边（新增副作用 import），而这些边会触发构建工具的预加载行为——
**拆包本身就是一个可能带来副作用的操作**，不是免费的。

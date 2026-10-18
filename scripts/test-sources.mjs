// test-sources：Sources.jsx 检索核心逻辑与无障碍标记正式测试。
// 用 esbuild 把真实组件打包（仅 stub 掉 CSS import），再断言纯函数 + SSR 渲染结果。
// 输出走系统临时目录（node:os.tmpdir()），结束后清理自身产生的文件，绝不写入 .t2-tmp/。
// 运行：node scripts/test-sources.mjs（workdir 为 style-lab 根目录）

import { build } from 'esbuild'
import { writeFileSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

// --freshness-only：只校验链接数据新鲜度，不打包、不建 junction。过期即非零退出。
// 由 `npm run test:freshness` 使用；`npm test` 走普通模式，把过期降级为 WARN，不阻塞构建。
const FRESHNESS_ONLY = process.argv.includes('--freshness-only')

const outDir = join(tmpdir(), `style-lab-test-sources-${process.pid}`)
const repoNodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url))
const tempNodeModules = join(outDir, 'node_modules')
if (!FRESHNESS_ONLY) {
  mkdirSync(outDir, { recursive: true })
  // 打包产物落在系统临时目录后，其 bare import（react/jsx-runtime 等外部依赖）
  // 需要按 Node 规则从产物所在目录向上查找 node_modules。临时目录不在仓库内，
  // 因此在这里放一个指向仓库 node_modules 的 junction（不复制、不跟随删除），
  // 让外部依赖解析行为与仓库内完全一致；测试结束后先摘除 junction 再删目录。
  symlinkSync(repoNodeModules, tempNodeModules, 'junction')
}

let pass = 0
let fail = 0
const failures = []

// 链接状态是周级以上的慢变量，30 天（约一个月）既能发现「check:links 被遗忘」，
// 又不会让离线测试因几天没联网就红。
// 注意：该阈值只在 `npm run test:freshness` 里强制失败；`npm test` / `prebuild` 只打印 WARN。
const LINK_FRESHNESS_MAX_DAYS = 30

// 新鲜度扫描（纯函数，maxDays / now 可注入，便于用构造数据自测，无需改文件）。
// 返回三类问题：非 unchecked 条目缺记录、checkedAt 不可解析、距今超过 maxDays 天。
function inspectLinkFreshness(sources, linkStatus, maxDays, now = Date.now()) {
  const missing = []
  const unparsable = []
  const stale = []
  for (const s of sources) {
    if (s.status === 'unchecked') continue
    const rec = linkStatus[s.id]
    if (!rec) { missing.push(s.id); continue }
    const parsed = Date.parse(rec.checkedAt)
    if (!Number.isFinite(parsed)) { unparsable.push(`${s.id}:${JSON.stringify(rec.checkedAt)}`); continue }
    const ageDays = (now - parsed) / 86400000
    if (ageDays > maxDays) stale.push({ id: s.id, checkedAt: rec.checkedAt, ageDays })
  }
  return { missing, unparsable, stale }
}

function check(label, fn) {
  try {
    fn()
    pass += 1
    console.log(`  ok  ${label}`)
  } catch (e) {
    fail += 1
    failures.push(label)
    console.error(`FAIL ${label}: ${e && e.message ? e.message : e}`)
  }
}

// 严格新鲜度模式（npm run test:freshness）：缺记录 / checkedAt 非法 / 过期都算失败。
// 只读数据文件，不打包、不建 node_modules junction。
async function runFreshnessOnly() {
  const { SOURCES } = await import('../src/data/sources.js')
  const { LINK_STATUS } = await import('../src/data/link-status.generated.js')
  const checked = SOURCES.filter((s) => s.status !== 'unchecked')
  const { missing, unparsable, stale } = inspectLinkFreshness(SOURCES, LINK_STATUS, LINK_FRESHNESS_MAX_DAYS)
  console.log(`--- 链接数据新鲜度严格校验（阈值 ${LINK_FRESHNESS_MAX_DAYS} 天）---`)
  console.log('      非 unchecked 条目 =', checked.length, '| 已有记录 =', checked.length - missing.length, '| 过期 =', stale.length)
  check('非 unchecked 条目都有可解析的 checkedAt', () => {
    assert.deepEqual(missing, [], `link-status.generated.js 无记录（请运行 npm run check:links）: ${missing.join(', ')}`)
    assert.deepEqual(unparsable, [], `checkedAt 无法解析: ${unparsable.join(', ')}`)
  })
  check(`非 unchecked 条目 checkedAt 距今 ≤ ${LINK_FRESHNESS_MAX_DAYS} 天`, () => {
    const detail = stale.map((s) => `${s.id}@${s.checkedAt}（距今 ${s.ageDays.toFixed(1)} 天）`).join(', ')
    assert.deepEqual(stale.map((s) => s.id), [], `链接检测数据已超过 ${LINK_FRESHNESS_MAX_DAYS} 天未更新，请运行 npm run check:links 刷新: ${detail}`)
  })
}

async function main() {
  if (FRESHNESS_ONLY) {
    await runFreshnessOnly()
    return
  }

  const cssStub = {
    name: 'css-stub',
    setup(buildApi) {
      buildApi.onResolve({ filter: /\.css$/ }, () => ({ path: 'css-stub', namespace: 'stub' }))
      buildApi.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: '', loader: 'js' }))
    },
  }

  const outfile = join(outDir, 'sources.mjs')
  await build({
    entryPoints: ['src/components/Sources.jsx'],
    bundle: true,
    format: 'esm',
    outfile,
    jsx: 'automatic',
    jsxImportSource: 'react',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    plugins: [cssStub],
    logLevel: 'error',
  })

  const mod = await import(pathToFileURL(outfile).href)
  const {
    Sources, PAGE_SIZE, TAG_LIMIT, EMPTY_FILTERS, filterSources, sortSources, paginate,
    searchSources, buildFacets, parsePlays, normalizeQuery, pageWindow, countActiveFilters, toggleValue,
  } = mod

  const { SOURCES, SOURCE_STATUS } = await import('../src/data/sources.js')
  const { LINK_STATUS } = await import('../src/data/link-status.generated.js')
  const { HARDCODED_APPLY_IDS, getAdvice } = await import('../src/data/advice.js')
  const { findItem } = await import('../src/data/catalog.js')
  const { detectConflicts } = await import('../src/data/conflicts.js')
  const { hardConflict } = await import('../src/data/capsule.js')
  const { detectHardConflicts } = await import('../src/data/personalRecommendations.js')

  const readSourcesSource = () => readFileSync('src/components/Sources.jsx', 'utf8')
  const readStylesSource = () => readFileSync('src/styles/sources.css', 'utf8')

  console.log('--- 数据基线 ---')
  console.log('SOURCES 条数 =', SOURCES.length)
  check('SOURCES.length === 187', () => assert.equal(SOURCES.length, 187))
  check('PAGE_SIZE === 24', () => assert.equal(PAGE_SIZE, 24))
  check('TAG_LIMIT === 16', () => assert.equal(TAG_LIMIT, 16))

  check('链接状态自洽：状态枚举合法，检测记录与来源一一对应', () => {
    const counts = { unchecked: 0, restricted: 0, verified: 0, 'token-risk': 0, invalid: 0, error: 0 }
    for (const s of SOURCES) counts[s.status] = (counts[s.status] || 0) + 1
    console.log('       status 分布 =', JSON.stringify(counts))

    // 2026-10-17 修：此前这里写死 unchecked=185 / restricted=2 / verified=0，
    // 是 link-status.generated.js 某一时刻的快照。任何人照 README 跑一次
    // `npm run check:links` 做真实联网复检，这四条断言立刻全红——
    // 等于「合法操作会把回归网弄挂」。
    //
    // 这里刻意**不**写以下三种断言，因为它们在当前数据流下恒真：
    //   - 「各状态条数之和 === SOURCES.length」：counts 就是从 SOURCES 数出来的；
    //   - 「有记录却标 unchecked」：sources.js:269 是
    //       status: checked?.status || source.status || 'unchecked'
    //     有记录时 status 必然等于记录状态；
    //   - 「RAW 自带非 unchecked 却无记录」：RAW_SOURCES 里根本没有 status 字段。
    // 保留的三条都能失败，见下方各自注释。

    const known = new Set(Object.keys(SOURCE_STATUS))

    // (1) 来源状态必须在枚举内。失败场景：改错 status 字面量、新增状态未登记，
    //     以及 check-links 写入新状态值（如把超时写成 'timeout'）而
    //     SOURCE_STATUS 未同步——因为 sources.js:269 会把记录状态传播成来源状态，
    //     这条同时覆盖了「检测记录里出现未定义状态」的情况，无需另立一条。
    const unknown = SOURCES.filter((s) => !known.has(s.status)).map((s) => `${s.id}:${s.status}`)
    assert.deepEqual(unknown, [], '存在 SOURCE_STATUS 未定义的状态')

    // (2) 检测记录不能指向不存在的来源（孤儿记录）。失败场景：删除/重命名来源
    //     后没重跑 check-links，或 check-links 把 id 拼错，记录会悄悄留在文件里，
    //     既不计入任何 UI，也让「已验证数」看起来比实际多。
    //     这条与 (1) 不重合：孤儿记录的 status 合法却无对应来源。
    const sourceIds = new Set(SOURCES.map((s) => s.id))
    const orphanRecords = Object.keys(LINK_STATUS).filter((id) => !sourceIds.has(id))
    assert.deepEqual(orphanRecords, [], 'link-status 存在指向不存在来源的孤儿记录')
  })

  check('链接状态记录完整：非 unchecked 条目都有可解析的 checkedAt', () => {
    const { missing, unparsable } = inspectLinkFreshness(SOURCES, LINK_STATUS, LINK_FRESHNESS_MAX_DAYS)
    assert.deepEqual(missing, [], `状态非 unchecked 但 link-status.generated.js 无记录（请运行 npm run check:links）: ${missing.join(', ')}`)
    assert.deepEqual(unparsable, [], `checkedAt 无法解析: ${unparsable.join(', ')}`)
  })

  // 新鲜度过期只降级打印 WARN，不计入 fail、不影响退出码：构建与「上次联网复检日期」无关。
  // 需要让过期变成硬失败时走单独入口：npm run test:freshness。
  const freshness = inspectLinkFreshness(SOURCES, LINK_STATUS, LINK_FRESHNESS_MAX_DAYS)
  if (freshness.stale.length === 0) {
    console.log(`  ok  链接数据新鲜度：非 unchecked 条目 checkedAt 距今 ≤ ${LINK_FRESHNESS_MAX_DAYS} 天`)
  } else {
    const ages = freshness.stale.map((s) => s.ageDays.toFixed(1)).join('/')
    const detail = freshness.stale.map((s) => `${s.id}@${s.checkedAt}（距今 ${s.ageDays.toFixed(1)} 天）`).join(', ')
    console.warn(`WARN 链接检测数据已过期 ${ages} 天（阈值 ${LINK_FRESHNESS_MAX_DAYS} 天），已降级为警告、不计入失败: ${detail}`)
    console.warn('WARN 请运行 npm run check:links 刷新；需要硬失败时运行 npm run test:freshness')
  }

  check('所有硬编码 applyId 都能在 catalog 找到', () => {
    const ids = [...HARDCODED_APPLY_IDS]
    const missingIds = ids.filter((id) => findItem(id) === undefined)
    console.log('       applyId 总数 =', ids.length, '| 缺失 =', JSON.stringify(missingIds))
    assert.deepEqual(missingIds, [])
  })

  console.log('\n--- 1. 搜索 ---')
  const niuzai = filterSources(SOURCES, { ...EMPTY_FILTERS, q: '牛仔' })
  console.log('搜索 "牛仔" ->', niuzai.length, '条')
  console.log('ids =', JSON.stringify(niuzai.map((s) => s.id)))
  check('搜索 "牛仔" 命中 6 条', () => assert.equal(niuzai.length, 6))

  check('大小写不敏感（英文查询）', () => {
    const lower = filterSources(SOURCES, { ...EMPTY_FILTERS, q: 'look' })
    const upper = filterSources(SOURCES, { ...EMPTY_FILTERS, q: 'LOOK' })
    const mixed = filterSources(SOURCES, { ...EMPTY_FILTERS, q: 'LoOk' })
    assert.ok(lower.length > 0, 'look 应有命中')
    assert.deepEqual(lower.map((s) => s.id), upper.map((s) => s.id))
    assert.deepEqual(lower.map((s) => s.id), mixed.map((s) => s.id))
    console.log('       "look"/"LOOK"/"LoOk" 各 ->', lower.length, '条，结果一致')
    const creator = filterSources(SOURCES, { ...EMPTY_FILTERS, q: 'chammy' })
    assert.ok(creator.some((s) => s.creator.includes('chammy')))
    console.log('       "chammy" 命中 creator ->', creator.length, '条')
  })

  check('命中 tags 字段', () => {
    const byTag = filterSources(SOURCES, { ...EMPTY_FILTERS, q: '显高' })
    assert.ok(byTag.length >= 13, `显高 标签命中 ${byTag.length} 条`)
    console.log('       "显高" ->', byTag.length, '条（tag 命中）')
  })

  check('空白关键词返回全部', () => {
    assert.equal(filterSources(SOURCES, { ...EMPTY_FILTERS, q: '   ' }).length, 187)
    assert.deepEqual(normalizeQuery('  '), [])
  })

  check('多词 AND 语义', () => {
    const one = filterSources(SOURCES, { ...EMPTY_FILTERS, q: '牛仔' })
    const two = filterSources(SOURCES, { ...EMPTY_FILTERS, q: '牛仔 裤' })
    assert.ok(two.length <= one.length && two.length > 0)
    console.log(`       "牛仔" ${one.length} 条 -> "牛仔 裤" ${two.length} 条`)
  })

  console.log('\n--- 2. 筛选 ---')
  const facets = buildFacets(SOURCES)
  console.log('platforms =', JSON.stringify(facets.platforms.map((o) => [o.value, o.label, o.count])))
  console.log('statuses  =', JSON.stringify(facets.statuses.map((o) => [o.value, o.label, o.count])))
  console.log('perspectives =', JSON.stringify(facets.perspectives.map((o) => [o.value, o.label, o.count])))
  console.log('tags 总数 =', facets.tags.length, '| Top', TAG_LIMIT, '=', JSON.stringify(facets.tags.slice(0, TAG_LIMIT).map((o) => `${o.label}:${o.count}`)))

  check('平台计数之和 = 187 且共 10 个平台', () => {
    assert.equal(facets.platforms.reduce((s, o) => s + o.count, 0), 187)
    assert.equal(facets.platforms.length, 10)
  })
  check('状态/视角计数之和 = 187', () => {
    assert.equal(facets.statuses.reduce((s, o) => s + o.count, 0), 187)
    assert.equal(facets.perspectives.reduce((s, o) => s + o.count, 0), 187)
  })
  check('无 0 条目死选项', () => {
    for (const g of ['platforms', 'statuses', 'perspectives']) {
      assert.ok(facets[g].every((o) => o.count > 0), `${g} 含 0 计数项`)
    }
  })
  check('标签选项降序且无重复', () => {
    const counts = facets.tags.map((o) => o.count)
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
    assert.equal(new Set(facets.tags.map((o) => o.value)).size, facets.tags.length)
  })
  check('平台多选 OR', () => {
    const both = filterSources(SOURCES, { ...EMPTY_FILTERS, platforms: ['bilibili', 'youtube'] })
    const only = filterSources(SOURCES, { ...EMPTY_FILTERS, platforms: ['bilibili'] })
    assert.equal(both.length, 69 + 36)
    assert.ok(both.length > only.length)
    console.log(`       bilibili ${only.length} / bilibili+youtube ${both.length}`)
  })
  check('跨组 AND', () => {
    const r = filterSources(SOURCES, { ...EMPTY_FILTERS, platforms: ['bilibili'], perspectives: ['principle'] })
    const pf = filterSources(SOURCES, { ...EMPTY_FILTERS, platforms: ['bilibili'] })
    assert.ok(r.length > 0 && r.length <= pf.length)
    console.log(`       bilibili ${pf.length} ∧ principle ${r.length}`)
  })
  check('组合筛选（平台+状态+视角+标签+关键词）', () => {
    // 2026-10-17 修：此前这里把 statuses 写死为 ['unchecked']，依赖
    // link-status.generated.js 恰好是「none verified」那一刻的快照——
    // 跑一次 `npm run check:links` 让来源变成 verified 后这条就会红。
    // 改为「用命中集合自身的状态集合去筛」，不再依赖检测结果，
    // 但仍能验证状态筛选这一组条件参与 AND 且不丢条目。
    const base = filterSources(SOURCES, { q: '穿搭', platforms: ['bilibili'], perspectives: ['principle'], tags: ['原则'] })
    console.log('       基础组合命中', base.length, '条 ->', JSON.stringify(base.slice(0, 3).map((s) => s.id)))
    assert.ok(base.length > 0, '基础组合应至少命中 1 条（不依赖链接检测结果）')

    const statuses = [...new Set(base.map((s) => s.status))]
    console.log('       这些条目的状态集合 =', JSON.stringify(statuses))
    const r = filterSources(SOURCES, { q: '穿搭', platforms: ['bilibili'], statuses, perspectives: ['principle'], tags: ['原则'] })
    console.log('       加上自身状态集合后命中', r.length, '条')
    assert.equal(r.length, base.length, '用命中集合自身的状态集合去筛，不应丢失任何条目')
    assert.ok(r.every((s) => s.platform === 'bilibili' && statuses.includes(s.status) && s.perspective === 'principle' && s.tags.includes('原则')))

    // 状态筛选必须真有筛选力：用一个命中集合里不存在的合法状态去筛，结果应为空。
    const other = Object.keys(SOURCE_STATUS).find((k) => !statuses.includes(k))
    if (other) {
      const none = filterSources(SOURCES, { q: '穿搭', platforms: ['bilibili'], statuses: [other], perspectives: ['principle'], tags: ['原则'] })
      assert.equal(none.length, 0, `状态 ${other} 不在命中集合内，筛选后应为空`)
    }
  })


  console.log('\n--- 3. 播放量解析 ---')
  console.log('"241万播放" ->', parsePlays('241万播放'))
  console.log('"53万播放 · 2026-07" ->', parsePlays('53万播放 · 2026-07'))
  console.log('"1327赞" ->', parsePlays('1327赞'))
  console.log('undefined ->', parsePlays(undefined))
  check('播放量解析边界', () => {
    assert.equal(parsePlays('241万播放'), 2410000)
    assert.equal(parsePlays('53万播放 · 2026-07'), 530000)
    assert.equal(parsePlays('1327赞'), 1327)
    assert.equal(parsePlays(undefined), null)
    assert.equal(parsePlays(''), null)
    // 2026-10-18：YouTube 36 条、抖音 20 条经登录态实测补齐播放量后，无播放量条目 39 → 32。
    // 剩下的 32 条全是本来就没有播放量口径的平台（Reddit/知乎/少数派/虎扑/豆瓣/网页文章）。
    // 这个数字随数据补录而变，保留它是因为它能抓住「批量补数据时误删字段」这类批量事故。
    assert.equal(SOURCES.filter((s) => parsePlays(s.plays) == null).length, 32)
  })

  console.log('\n--- 4. 排序 ---')
  const byPlays = sortSources(SOURCES, 'plays')
  console.log('按播放量降序第一条 =', byPlays[0].id, '|', byPlays[0].plays)
  console.log('前 5 =', JSON.stringify(byPlays.slice(0, 5).map((s) => [s.id, s.plays])))
  check('按播放量降序第一条为 yt2-rmrs-tuck', () => assert.equal(byPlays[0].id, 'yt2-rmrs-tuck'))
  check('播放量降序、缺失排最后', () => {
    const vals = byPlays.map((s) => parsePlays(s.plays))
    const present = vals.filter((v) => v != null)
    assert.deepEqual(present, [...present].sort((a, b) => b - a))
    const firstNull = vals.indexOf(null)
    assert.ok(firstNull === -1 || vals.slice(firstNull).every((v) => v === null), 'null 必须全部在末尾')
    console.log('       有播放量', present.length, '条 / 缺失', vals.length - present.length, '条（全部在末尾）')
  })
  check('排序稳定（同值保持输入顺序）', () => {
    const a = sortSources(SOURCES, 'plays').map((s) => s.id)
    const b = sortSources(SOURCES, 'plays').map((s) => s.id)
    assert.deepEqual(a, b)
    const nulls = sortSources(SOURCES, 'plays').filter((s) => parsePlays(s.plays) == null).map((s) => s.id)
    const orig = SOURCES.filter((s) => parsePlays(s.plays) == null).map((s) => s.id)
    assert.deepEqual(nulls, orig, '同值组必须保持原始相对顺序')
  })
  check('最新排序（publishedAt 降序，缺失排最后）', () => {
    const r = sortSources(SOURCES, 'recent')
    console.log('       第一条 =', r[0].id, r[0].publishedAt, '| 末条 =', r.at(-1).id, r.at(-1).publishedAt)
    assert.equal(r[0].publishedAt, '2026-09')
    assert.equal(parsePlays(r.at(-1).publishedAt), null)
    const dated = r.map((s) => s.publishedAt)
    const firstNull = dated.indexOf(null)
    assert.ok(firstNull === -1 || dated.slice(firstNull).every((v) => v === null))
  })
  check('标题排序可比较且稳定', () => {
    const r = sortSources(SOURCES, 'title')
    assert.equal(r.length, 187)
    assert.deepEqual(r.map((s) => s.id), sortSources(SOURCES, 'title').map((s) => s.id))
    console.log('       首条 =', JSON.stringify(r[0].title))
  })
  check('未知排序键退化为默认顺序', () => {
    assert.deepEqual(sortSources(SOURCES, 'nope').map((s) => s.id), SOURCES.map((s) => s.id))
  })
  check('缺字段条目不崩', () => {
    const dirty = [{ id: 'a' }, { id: 'b', plays: 'x万', publishedAt: null }, null, { title: 'z' }]
    for (const key of ['default', 'plays', 'recent', 'title']) {
      assert.equal(sortSources(dirty, key).length, 4)
    }
    assert.equal(filterSources(dirty, { ...EMPTY_FILTERS, q: 'z' }).length, 1)
  })

  console.log('\n--- 5. 分页 ---')
  const p1 = searchSources(SOURCES, EMPTY_FILTERS, 'default', 1)
  console.log('全部/默认/第 1 页 ->', p1.items.length, '条 | total', p1.total, '| pageCount', p1.pageCount, '| 区间', `${p1.start}-${p1.end}`)
  const p2 = searchSources(SOURCES, EMPTY_FILTERS, 'default', 2)
  console.log('第 2 页第一条 =', p2.items[0].id)
  check('首页分页基础', () => {
    assert.equal(p1.items.length, 24)
    assert.equal(p1.pageCount, 8)
    assert.equal(p1.total, 187)
    assert.equal(p2.items[0].id, SOURCES[24].id)
  })
  check('页边界与窗口计算', () => {
    assert.equal(p1.start, 1); assert.equal(p1.end, 24)
    assert.equal(p1.hasPrev, false); assert.equal(p1.hasNext, true)
    const last = paginate(SOURCES, 8)
    console.log('       第 8 页 ->', last.items.length, '条 | 区间', `${last.start}-${last.end}`)
    assert.equal(last.items.length, 187 - 24 * 7)
    assert.equal(last.hasNext, false); assert.equal(last.hasPrev, true)
  })
  check('越界页码收敛到合法范围', () => {
    assert.equal(paginate(SOURCES, 999).page, 8)
    assert.equal(paginate(SOURCES, 0).page, 1)
    assert.equal(paginate(SOURCES, -5).page, 1)
    assert.equal(paginate(SOURCES, NaN).page, 1)
    assert.equal(paginate([], 3).page, 1)
    assert.equal(paginate([], 3).pageCount, 1)
    assert.equal(paginate([], 3).start, 0)
    assert.equal(paginate([], 3).hasNext, false)
    assert.deepEqual(paginate(null, 1).items, [])
  })
  check('每页无重复无遗漏（8 页拼回全集）', () => {
    const all = []
    for (let page = 1; page <= 8; page += 1) all.push(...paginate(SOURCES, page).items.map((s) => s.id))
    assert.deepEqual(all, SOURCES.map((s) => s.id))
  })
  check('筛选后分页区间正确（牛仔 6 条 -> 1 页）', () => {
    const r = searchSources(SOURCES, { ...EMPTY_FILTERS, q: '牛仔' }, 'plays', 1)
    console.log('       "牛仔" 按播放量 ->', JSON.stringify(r.items.map((s) => s.id)), 'pageCount', r.pageCount)
    assert.equal(r.total, 6)
    assert.equal(r.pageCount, 1)
    assert.equal(r.items.length, 6)
    const plays = r.items.map((s) => parsePlays(s.plays) ?? -1)
    assert.deepEqual(plays, [...plays].sort((a, b) => b - a))
  })
  check('分页条窗口含首末页且带省略号', () => {
    console.log('       window(1,8) =', JSON.stringify(pageWindow(1, 8)))
    console.log('       window(5,8) =', JSON.stringify(pageWindow(5, 8)))
    console.log('       window(8,8) =', JSON.stringify(pageWindow(8, 8)))
    const w = pageWindow(5, 8)
    assert.ok(w.includes(1) && w.includes(8) && w.includes('…'))
    assert.ok(!w.includes(2) || w.includes(6))
  })

  console.log('\n--- 6. 筛选后重置到第 1 页（UI 行为）---')
  check('切换任何筛选条件都重置 page', () => {
    const src = readSourcesSource()
    const resets = src.match(/setPage\(1\)/g) || []
    console.log('       Sources.jsx 中 setPage(1) 出现', resets.length, '处（防抖/筛选/排序/清除）')
    assert.ok(resets.length >= 4, '防抖、toggle、排序、清除都应重置页码')
  })

  console.log('\n--- 7. 无障碍（真实 SSR 渲染）---')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const React = (await import('react')).default
  const html = renderToStaticMarkup(React.createElement(Sources))
  const renderPath = join(outDir, 'render.html')
  writeFileSync(renderPath, html, 'utf8')
  console.log('渲染 HTML 长度 =', html.length, '字节')
  const countOf = (re) => (html.match(re) || []).length
  console.log('  <input type=search> =', countOf(/<input[^>]*type="search"/g))
  console.log('  <label for=…>       =', countOf(/<label[^>]*for="/g))
  console.log('  aria-pressed        =', countOf(/aria-pressed="/g))
  console.log('  aria-live="polite"  =', countOf(/aria-live="polite"/g))
  console.log('  <fieldset>          =', countOf(/<fieldset/g))
  console.log('  <legend>            =', countOf(/<legend/g))
  console.log('  <button>            =', countOf(/<button/g))
  console.log('  <a class="src-card">=', countOf(/<a class="src-card"/g))
  console.log('  分页 disabled       =', countOf(/disabled=""/g))

  check('搜索框可访问', () => {
    assert.equal(countOf(/<input[^>]*type="search"/g), 1)
    assert.ok(/<label[^>]*for="[^"]*"[^>]*>关键词<\/label>/.test(html), 'label 必须绑定 htmlFor=id')
  })
  check('筛选 chips 是 button 且带 aria-pressed', () => {
    assert.equal(countOf(/aria-pressed="/g), countOf(/class="src-chip"/g))
    assert.ok(countOf(/aria-pressed="/g) >= 10)
  })
  check('分组用 fieldset + legend', () => {
    assert.equal(countOf(/<fieldset/g), 4)
    assert.equal(countOf(/<legend/g), 4)
    for (const name of ['平台', '状态', '视角', '标签']) assert.ok(html.includes(`>${name}<`), `缺少分组 ${name}`)
  })
  check('结果区 aria-live 播报条数', () => {
    assert.ok(/aria-live="polite"[^>]*>当前 187 条结果/.test(html))
  })
  check('首屏 24 张卡片 + 分页首尾禁用', () => {
    assert.equal(countOf(/<a class="src-card"/g) + countOf(/<div class="src-card invalid"/g), 24)
    assert.ok(html.includes('上一页'), '应有上一页按钮')
    const nav = html.slice(html.indexOf('src-pager'))
    const firstBtn = nav.slice(nav.indexOf('<button'), nav.indexOf('</button>'))
    assert.ok(/disabled=""/.test(firstBtn) || /disabled/.test(firstBtn), '第 1 页时上一页必须 disabled')
    console.log('       上一页按钮 =', firstBtn.replace(/<[^>]*>/g, '').trim(), '| disabled =', /disabled/.test(firstBtn))
  })
  check('分页 nav 带 aria-label', () => {
    assert.ok(/<nav[^>]*aria-label="结果分页"/.test(html))
  })
  check('页面不出现非 button/select/input 的点击控件', () => {
    assert.ok(!/<div[^>]*onclick/i.test(html), '不得有 div onClick')
    assert.ok(!/<span[^>]*onclick/i.test(html), '不得有 span onClick')
  })
  check('URL 无关：不触碰 location.hash', () => {
    const src = readSourcesSource() + readStylesSource()
    for (const bad of ['location', 'window.location', 'history.', 'hashchange']) {
      assert.ok(!src.includes(bad), `源码不应出现 ${bad}`)
    }
  })
  check('无 console.log / debugger / 空 catch', () => {
    const src = readSourcesSource()
    assert.ok(!src.includes('console.log'), '不得有 console.log')
    assert.ok(!src.includes('debugger'), '不得有 debugger')
    assert.ok(!/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src), '不得有空 catch')
  })
  check('样式表无硬编码颜色字面量', () => {
    const css = readStylesSource()
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []
    console.log('       发现颜色字面量 =', JSON.stringify(literals))
    assert.deepEqual(literals, [], '不得出现任何 hex/rgb/hsl 颜色字面量（阴影也必须走令牌）')
  })
  check('所有颜色都来自既有令牌或 --src-* 令牌', () => {
    const css = readStylesSource()
    const declared = [...css.matchAll(/--(src-[\w-]+)\s*:/g)].map((m) => m[1])
    const used = [...new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]))]
    const allowedBase = ['bg', 'bg2', 'ink', 'ink2', 'ink3', 'line', 'card', 'accent', 'accent-soft', 'ok', 'warn']
    const illegal = used.filter((name) => !declared.includes(name) && !allowedBase.includes(name))
    const unusedTokens = declared.filter((name) => !used.includes(name))
    console.log('       声明的 --src-* 令牌 =', JSON.stringify(declared))
    console.log('       引用的令牌 =', JSON.stringify(used))
    console.log('       越界令牌 =', JSON.stringify(illegal), '| 未使用令牌 =', JSON.stringify(unusedTokens))
    assert.deepEqual(illegal, [])
    assert.deepEqual(unusedTokens, [], '不得声明未使用的令牌')
  })
  check('三处硬冲突口径一致（advice / capsule / personalRecommendations 都委托 conflicts.js）', () => {
    const outfits = [
      { top: 't-white', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-derby' },
      { top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-g', shoes: 's-runner' },
      { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white' },
      { top: 't-shirt-w', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-chelsea' },
      { top: 't-polo-b', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-derby-b' },
      { top: 't-shirt-w', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-runner' },
    ]
    const slots = ['top', 'outer', 'bottom', 'shoes']
    for (const outfit of outfits) {
      const items = {
        top: findItem(outfit.top),
        outer: findItem(outfit.outer),
        bottom: findItem(outfit.bottom),
        shoes: findItem(outfit.shoes),
      }
      const core = detectConflicts(items)
      const adviceWarnings = getAdvice({ ...outfit, accs: [] }).warnings
      for (const reason of core) {
        assert.ok(adviceWarnings.includes(reason), `${JSON.stringify(outfit)}：advice 缺少冲突原因「${reason}」`)
      }
      assert.deepEqual(detectHardConflicts(outfit), core, `${JSON.stringify(outfit)}：personalRecommendations 与 conflicts.js 不一致`)
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          const a = { ...items[slots[i]], slot: slots[i] }
          const b = { ...items[slots[j]], slot: slots[j] }
          const pairCore = detectConflicts({ [slots[i]]: a, [slots[j]]: b })[0] ?? null
          assert.equal(hardConflict(a, b), pairCore, `${JSON.stringify(outfit)}：capsule(${slots[i]}×${slots[j]}) 与 conflicts.js 不一致`)
          assert.equal(hardConflict(b, a), pairCore, `${JSON.stringify(outfit)}：capsule(${slots[j]}×${slots[i]}) 与 conflicts.js 不一致`)
        }
      }
    }
    console.log(`       已对 ${outfits.length} 套样本 × ${(slots.length * (slots.length - 1)) / 2} 对槽位断言口径一致`)
  })

  check('样式类名统一 src- 前缀', () => {
    // 先剔除 CSS 注释再匹配类名：注释里的 "styles.css"（第 2 行）会被正则误报为类名 css。
    const css = readStylesSource().replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])
    const foreign = [...new Set(classes.filter((c) => !c.startsWith('src-')))]
    console.log('       非 src- 前缀类名 =', JSON.stringify(foreign))
    assert.deepEqual(foreign, [], '不得出现非 src- 前缀的类选择器')
  })
  check('未改动他人文件', () => {
    const src = readSourcesSource()
    assert.ok(!src.includes('../App'), 'Sources.jsx 不得 import App')
    assert.ok(src.includes("import '../styles/sources.css'"))
  })

  console.log('\n--- 8. 边界：空数据源 ---')
  check('sources=[] 时不崩且显示空态', () => {
    const empty = renderToStaticMarkup(React.createElement(Sources, { sources: [] }))
    assert.ok(empty.includes('没有符合条件的资源'))
    assert.ok(empty.includes('清除全部筛选'))
    assert.ok(empty.includes('当前 0 条结果'))
    console.log('       空数据源 HTML 长度 =', empty.length, '字节，含空态与清除按钮')
  })
  check('countActiveFilters / toggleValue', () => {
    assert.equal(countActiveFilters(EMPTY_FILTERS), 0)
    assert.equal(countActiveFilters({ ...EMPTY_FILTERS, q: 'a b', platforms: ['x'] }), 2)
    assert.deepEqual(toggleValue(['a'], 'b'), ['a', 'b'])
    assert.deepEqual(toggleValue(['a', 'b'], 'a'), ['b'])
  })
}

try {
  await main()
} finally {
  rmSync(tempNodeModules, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
}

const SCRIPT_LABEL = FRESHNESS_ONLY ? 'test:freshness' : 'test-sources'

if (fail === 0) {
  console.log(`\nOK ${SCRIPT_LABEL}: ${pass} 项断言通过`)
} else {
  console.error(`\nFAIL ${SCRIPT_LABEL}: ${pass} 项通过 / ${fail} 项失败`)
  for (const f of failures) console.error(`  - ${f}`)
}
process.exitCode = fail === 0 ? 0 : 1

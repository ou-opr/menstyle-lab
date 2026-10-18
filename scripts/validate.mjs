// 数据一致性校验：node scripts/validate.mjs
import { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, PRESETS, ITEMS, CATEGORIES, findItem, byId } from '../src/data/catalog.js'
import { LAWS, getAdvice } from '../src/data/advice.js'
import { SOURCES } from '../src/data/sources.js'
import { RECOMMENDATION_LOOKS, recommendOutfits } from '../src/data/recommendations.js'

let errors = 0
const err = (msg) => { console.error('❌ ' + msg); errors++ }
const ok = (msg) => console.log('✓ ' + msg)

// 1) 资源库：id 唯一性
const idCount = {}
SOURCES.forEach((s) => { idCount[s.id] = (idCount[s.id] || 0) + 1 })
const dups = Object.entries(idCount).filter(([, n]) => n > 1)
if (dups.length) err('SOURCES 重复 id: ' + dups.map(([id]) => id).join(', '))
else ok(`SOURCES ${SOURCES.length} 条，id 无重复`)

// 2) 资源库：字段完整 + URL 协议安全
SOURCES.forEach((s) => {
  if (!s.id || !s.platform || !s.creator || !s.title || !s.url || !s.note) err(`SOURCES[${s.id}] 缺字段`)
  if (!/^https:\/\//.test(s.url)) err(`SOURCES[${s.id}] URL 非 https: ${s.url}`)
  if (!/^[\w-]+$/.test(s.id)) err(`SOURCES[${s.id}] id 含异常字符`)
  if (!s.verifiedAt || !s.status || !s.perspective || !s.editorNote) err(`SOURCES[${s.id}] 缺可信度元数据`)
  if (!['verified', 'token-risk', 'restricted', 'invalid', 'error', 'unchecked'].includes(s.status)) err(`SOURCES[${s.id}] 状态异常: ${s.status}`)
  if (!['principle', 'style', 'subjective'].includes(s.perspective)) err(`SOURCES[${s.id}] 观点类型异常: ${s.perspective}`)
})
ok('SOURCES 字段与 URL 协议检查完成')

// 3) 目录：id 唯一
for (const [name, list] of [['TOPS', TOPS], ['OUTERS', OUTERS], ['BOTTOMS', BOTTOMS], ['SHOES', SHOES], ['ACCS', ACCS]]) {
  const ids = list.map((x) => x.id)
  if (new Set(ids).size !== ids.length) err(`${name} 存在重复 id`)
}
ok('目录 id 唯一性检查完成')

// 4) 预设：outfit 引用必须存在
const topIds = new Set(TOPS.map((x) => x.id)), outerIds = new Set(OUTERS.map((x) => x.id))
const bottomIds = new Set(BOTTOMS.map((x) => x.id)), shoeIds = new Set(SHOES.map((x) => x.id)), accIds = new Set(ACCS.map((x) => x.id))
PRESETS.forEach((p) => {
  const o = p.outfit
  if (!topIds.has(o.top)) err(`预设[${p.id}] top 不存在: ${o.top}`)
  if (!outerIds.has(o.outer)) err(`预设[${p.id}] outer 不存在: ${o.outer}`)
  if (!bottomIds.has(o.bottom)) err(`预设[${p.id}] bottom 不存在: ${o.bottom}`)
  if (!shoeIds.has(o.shoes)) err(`预设[${p.id}] shoes 不存在: ${o.shoes}`)
  o.accs.forEach((a) => { if (!accIds.has(a)) err(`预设[${p.id}] 配饰不存在: ${a}`) })
  if (p.src && !idCount[p.src]) err(`预设[${p.id}] 引用资源不存在: ${p.src}`)
})
ok(`预设 ${PRESETS.length} 套引用检查完成`)

// 5) 法则：src 引用必须存在
LAWS.forEach((l) => {
  if (!idCount[l.src]) err(`法则[${l.n}] 引用资源不存在: ${l.src}`)
  if (!['principle', 'style', 'subjective', 'experience'].includes(l.kind)) err(`法则[${l.n}] 类型异常: ${l.kind}`)
})
ok(`法则 ${LAWS.length} 条引用检查完成`)

// 6) 建议引擎：每个 top 都有规则；建议里的 applyId/src 必须存在
TOPS.forEach((t) => {
  const r = getAdvice({ top: t.id, outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] })
  if (!r.bottomSugs?.length) err(`上装[${t.id}] 缺下装建议`)
  if (!r.shoeSugs?.length) err(`上装[${t.id}] 缺鞋子建议`)
  if (!r.accSugs?.length) err(`上装[${t.id}] 缺配饰建议`)
  const applyIds = [...r.bottomSugs, ...r.shoeSugs, ...r.accSugs].map((s) => s.applyId).filter(Boolean)
  applyIds.forEach((aid) => {
    const valid = topIds.has(aid) || outerIds.has(aid) || bottomIds.has(aid) || shoeIds.has(aid) || accIds.has(aid)
    if (!valid) err(`上装[${t.id}] 建议的 applyId 不存在: ${aid}`)
  })
  ;[...r.bottomSugs, ...r.shoeSugs, ...r.accSugs].forEach((s) => {
    if (s.src && !idCount[s.src]) err(`上装[${t.id}] 建议引用资源不存在: ${s.src}（"${s.title}"）`)
  })
})
ok(`建议引擎 ${TOPS.length} 上装 × (下装/鞋/配饰) 全量检查完成`)

// 7) 个性化方案：候选引用与全条件矩阵
RECOMMENDATION_LOOKS.forEach((look) => {
  if (!PRESETS.some((p) => p.id === look.presetId)) err(`个性化方案引用预设不存在: ${look.presetId}`)
  look.sources.forEach((src) => { if (!idCount[src]) err(`个性化方案[${look.presetId}] 来源不存在: ${src}`) })
})
let profiles = 0
for (const height of [165, 175, 185]) for (const body of ['slim', 'standard', 'athletic', 'plump']) {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) for (const occasion of ['casual', 'campus', 'work', 'date']) {
    const results = recommendOutfits({ height, body, season, occasion })
    if (results.length !== 3) err(`个性化方案未返回3套: ${height}/${body}/${season}/${occasion}`)
    if (new Set(results.map((r) => r.id)).size !== results.length) err(`个性化方案出现重复: ${height}/${body}/${season}/${occasion}`)
    results.forEach((r) => {
      if (r.score < 0 || r.score > 100) err(`个性化方案评分越界: ${r.id}=${r.score}`)
      if (!r.reasons.length || !r.sourceIds.length) err(`个性化方案缺理由或来源: ${r.id}`)
    })
    profiles++
  }
}
ok(`个性化推荐 ${profiles} 组用户条件 × 3 套方案检查完成`)

// 8) 建议引擎：全部外套 × 全部下装 × 全部鞋组合不抛异常
let combos = 0
for (const t of TOPS) for (const o of OUTERS) for (const b of BOTTOMS) for (const s of SHOES) {
  getAdvice({ top: t.id, outer: o.id, bottom: b.id, shoes: s.id, accs: ['a-watch', 'a-cap', 'a-bag', 'a-scarf', 'a-necklace', 'a-glasses'] })
  combos++
}
ok(`组合遍历 ${combos} 种无异常`)

// 9) 目录导出契约：ITEMS / CATEGORIES / findItem / byId
if (!Array.isArray(ITEMS)) err('ITEMS 必须是数组')
else {
  const expanded = [...TOPS, ...OUTERS, ...BOTTOMS, ...SHOES, ...ACCS]
  if (ITEMS.length !== expanded.length) err(`ITEMS 长度 ${ITEMS.length} ≠ 五类之和 ${expanded.length}`)
  expanded.forEach((it, i) => {
    if (ITEMS[i] !== it) err(`ITEMS[${i}] 与五类展开顺序不一致: ${ITEMS[i] && ITEMS[i].id} ≠ ${it.id}`)
  })
}
if (!CATEGORIES || typeof CATEGORIES !== 'object') err('CATEGORIES 缺失')
else {
  for (const [key, list] of [['top', TOPS], ['outer', OUTERS], ['bottom', BOTTOMS], ['shoes', SHOES], ['acc', ACCS]]) {
    const got = CATEGORIES[key]
    if (!Array.isArray(got)) err(`CATEGORIES.${key} 不是数组`)
    else if (got.length !== list.length || got.some((x, i) => x !== list[i])) err(`CATEGORIES.${key} 与源数组不一致`)
  }
}
if (typeof findItem !== 'function') err('findItem 不是函数')
if (typeof byId !== 'function') err('byId 不是函数')
if (typeof findItem === 'function' && typeof byId === 'function') {
  for (const [key, list] of [['top', TOPS], ['outer', OUTERS], ['bottom', BOTTOMS], ['shoes', SHOES], ['acc', ACCS]]) {
    list.forEach((it) => {
      if (findItem(it.id) !== it) err(`findItem(${it.id}) 未在 ${key} 中返回同一对象`)
      if (byId(list, it.id) !== it) err(`byId(${key}, ${it.id}) 与 findItem 语义不一致`)
    })
  }
  if (findItem('__no_such_item__') !== undefined) err('findItem 对不存在的 id 应返回 undefined')
}
ok('目录导出 ITEMS / CATEGORIES / findItem / byId 检查完成')

// 10) 单品：id 唯一 + 命名正则 + 五类数量下限 + 字段取值域
const ID_RE = /^(t|o|b|s|a)-[a-z0-9-]+$/
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const FAMILIES = ['light', 'dark', 'earth', 'accent']
const WARMTH_SET = [1, 2, 3, 4]
const itemIdCount = {}
ITEMS.forEach((it) => { itemIdCount[it.id] = (itemIdCount[it.id] || 0) + 1 })
Object.entries(itemIdCount).filter(([, n]) => n > 1).forEach(([id, n]) => err(`单品 id 重复: ${id}（${n} 次）`))
ITEMS.forEach((it) => {
  const where = `单品[${it.id}]`
  if (typeof it.id !== 'string' || !ID_RE.test(it.id)) err(`${where} id 不匹配 ${ID_RE}`)
  if (typeof it.name !== 'string' || !it.name) err(`${where} name 缺失`)
  if (typeof it.hex !== 'string' || !HEX_RE.test(it.hex)) err(`${where} hex 非法: ${it.hex}（需 #rrggbb 或 #rrggbbaa）`)
  if (typeof it.mesh !== 'string' || !it.mesh) err(`${where} mesh 必须是非空字符串，当前: ${JSON.stringify(it.mesh)}`)
  if (it.id === 'o-none') {
    // 契约第 3 节：o-none 用透明色 + family '—' + formality/warmth 0（不渲染外套的哨兵值）
    if (it.hex !== '#00000000') err(`${where} o-none 的 hex 必须是 #00000000，当前: ${it.hex}`)
    if (it.family !== '—') err(`${where} o-none 的 family 必须是 '—'，当前: ${it.family}`)
    if (it.formality !== 0) err(`${where} o-none 的 formality 必须是 0，当前: ${it.formality}`)
    if (it.warmth !== 0) err(`${where} o-none 的 warmth 必须是 0，当前: ${it.warmth}`)
    if (it.mesh !== 'none') err(`${where} o-none 的 mesh 必须是 'none'，当前: ${it.mesh}`)
  } else {
    if (!FAMILIES.includes(it.family)) err(`${where} family 越界: ${it.family}（应 ∈ ${FAMILIES.join('|')}）`)
    if (!WARMTH_SET.includes(it.warmth)) err(`${where} warmth 越界: ${it.warmth}（应 ∈ 1|2|3|4）`)
    if (typeof it.tip !== 'string' || !it.tip) err(`${where} tip 缺失或为空`)
  }
  if (![0, 1, 2, 3].includes(it.formality)) err(`${where} formality 越界: ${it.formality}（应 ∈ 0|1|2|3）`)
})
for (const [name, list, floor] of [['TOPS', TOPS, 16], ['OUTERS', OUTERS, 9], ['BOTTOMS', BOTTOMS, 13], ['SHOES', SHOES, 9], ['ACCS', ACCS, 12]]) {
  if (list.length < floor) err(`${name} 数量不足: ${list.length} < ${floor}`)
}
if (ITEMS.length < 59) err(`单品总数不足: ${ITEMS.length} < 59`)
ACCS.forEach((a) => { if (typeof a.hex !== 'string' || !HEX_RE.test(a.hex)) err(`ACCS[${a.id}] 缺 hex 或非法: ${a.hex}`) })
const runner = SHOES.find((x) => x.id === 's-runner')
if (!runner) err('SHOES 缺少 s-runner')
else if (runner.hex2 !== '#222326') err(`s-runner 的 hex2 必须是 #222326，当前: ${runner.hex2}`)
ok(`单品 ${ITEMS.length} 件（${TOPS.length}/${OUTERS.length}/${BOTTOMS.length}/${SHOES.length}/${ACCS.length}）id/字段取值域检查完成`)

// 11) 预设：数量、id 唯一性与命名、outfit 引用、src 引用
if (!Array.isArray(PRESETS) || PRESETS.length < 14) err(`PRESETS 数量不足: ${PRESETS.length} < 14`)
const presetIds = new Set()
PRESETS.forEach((p) => {
  if (typeof p.id !== 'string' || !/^p-[a-z0-9-]+$/.test(p.id)) err(`预设[${p.id}] id 不匹配 ^p-[a-z0-9-]+$`)
  if (presetIds.has(p.id)) err(`预设 id 重复: ${p.id}`)
  presetIds.add(p.id)
  if (!p.name || !p.desc) err(`预设[${p.id}] 缺 name/desc`)
  const o = p.outfit
  if (!o || typeof o !== 'object') { err(`预设[${p.id}] 缺 outfit`); return }
  if (!topIds.has(o.top)) err(`预设[${p.id}] top 不存在: ${o.top}`)
  if (!outerIds.has(o.outer)) err(`预设[${p.id}] outer 不存在: ${o.outer}`)
  if (!bottomIds.has(o.bottom)) err(`预设[${p.id}] bottom 不存在: ${o.bottom}`)
  if (!shoeIds.has(o.shoes)) err(`预设[${p.id}] shoes 不存在: ${o.shoes}`)
  if (!Array.isArray(o.accs)) err(`预设[${p.id}] accs 必须是数组`)
  else o.accs.forEach((a) => { if (!accIds.has(a)) err(`预设[${p.id}] 配饰不存在: ${a}`) })
  if (typeof p.src !== 'string' || !idCount[p.src]) err(`预设[${p.id}] 引用资源不存在: ${p.src}`)
})
ok(`预设 ${PRESETS.length} 套（≥14）id/引用检查完成`)

// 12) 个性化方案：与 PRESETS 一一对应（多一条 / 少一条都失败）
const lookByPreset = new Map()
RECOMMENDATION_LOOKS.forEach((look) => {
  if (lookByPreset.has(look.presetId)) err(`个性化方案 presetId 重复: ${look.presetId}`)
  lookByPreset.set(look.presetId, look)
  if (!Array.isArray(look.sources) || !look.sources.length) err(`个性化方案[${look.presetId}] sources 缺失`)
  else look.sources.forEach((src) => { if (!idCount[src]) err(`个性化方案[${look.presetId}] 来源不存在: ${src}`) })
  if (!Array.isArray(look.seasons) || !look.seasons.length) err(`个性化方案[${look.presetId}] seasons 为空`)
  if (!Array.isArray(look.occasions) || !look.occasions.length) err(`个性化方案[${look.presetId}] occasions 为空`)
  if (!Array.isArray(look.traits) || !look.traits.length) err(`个性化方案[${look.presetId}] traits 为空`)
})
PRESETS.forEach((p) => { if (!lookByPreset.has(p.id)) err(`预设[${p.id}] 缺个性化方案 look（应为每个 preset 恰好一条）`) })
lookByPreset.forEach((_, presetId) => { if (!presetIds.has(presetId)) err(`个性化方案[${presetId}] 没有对应的预设（多余 look）`) })
ok(`个性化方案 ${RECOMMENDATION_LOOKS.length} 条 × 预设 ${PRESETS.length} 套双向一一对应检查完成`)

// 13) score 契约：结构不变量 + 16848 组合敏感度
const SCORE_KEYS = [['palette', '配色', 30], ['formality', '正式度', 25], ['silhouette', '轮廓', 25], ['completeness', '完成度', 20]]
const verdictOf = (t) => (t >= 85 ? '优秀' : t >= 70 ? '良好' : t >= 55 ? '及格' : '需要调整')
const checkScore = (tag, r) => {
  const sc = r && r.score
  if (!sc || typeof sc !== 'object') { err(`${tag} 缺 score 字段`); return null }
  if (!Array.isArray(sc.breakdown) || sc.breakdown.length !== 4) { err(`${tag} breakdown 长度必须为 4，当前: ${sc.breakdown && sc.breakdown.length}`); return null }
  const sum = sc.breakdown.reduce((s, i) => s + i.value, 0)
  if (sc.total !== sum) err(`${tag} total(${sc.total}) ≠ breakdown 之和(${sum})`)
  if (!Number.isInteger(sc.total) || sc.total < 0 || sc.total > 100) err(`${tag} total 越界或非整数: ${sc.total}`)
  if (sc.verdict !== verdictOf(sc.total)) err(`${tag} verdict 与分数不符: ${sc.verdict} @ ${sc.total}`)
  SCORE_KEYS.forEach(([key, label, max], i) => {
    const item = sc.breakdown[i]
    if (!item) return
    if (item.key !== key || item.label !== label || item.max !== max) err(`${tag} breakdown[${i}] 元数据错误: ${item.key}/${item.label}/${item.max}，应为 ${key}/${label}/${max}`)
    if (!Number.isInteger(item.value) || item.value < 0 || item.value > max) err(`${tag} breakdown[${i}].value 越界: ${item.value}（0..${max}）`)
    if (typeof item.note !== 'string' || item.note.length < 4) err(`${tag} breakdown[${i}].note 缺失或过短: ${JSON.stringify(item.note)}`)
  })
  return sc
}
const scoreErrorsBefore = errors
;[
  ['缺失 state(undefined)', undefined],
  ['缺失 state(null)', null],
  ['缺失 state({})', {}],
  ['缺失 state({top})', { top: 't-white' }],
  ['非法 id state', { top: 't-white', outer: '__nope__', bottom: 'b-jeans-d', shoes: 's-white', accs: ['__nope__'] }],
].forEach(([tag, input]) => {
  let r
  try { r = getAdvice(input) } catch (e) { err(`${tag} 抛异常: ${e && e.message}`); return }
  checkScore(tag, r)
})
const scoreErrors = errors - scoreErrorsBefore
if (scoreErrors) {
  console.error(`⚠️  退化输入已存在 ${scoreErrors} 处 score 结构问题，跳过 16848 组合敏感度遍历（先修结构）`)
} else {
  const dist = new Map()
  let scoreMin = Infinity, scoreMax = -Infinity, scoreCombos = 0
  for (const t of TOPS) for (const o of OUTERS) for (const b of BOTTOMS) for (const s of SHOES) {
    const sc = checkScore(`组合[${t.id}/${o.id}/${b.id}/${s.id}]`, getAdvice({ top: t.id, outer: o.id, bottom: b.id, shoes: s.id, accs: [] }))
    if (!sc) continue
    dist.set(sc.total, (dist.get(sc.total) || 0) + 1)
    if (sc.total < scoreMin) scoreMin = sc.total
    if (sc.total > scoreMax) scoreMax = sc.total
    scoreCombos++
  }
  const distinctTotals = dist.size
  if (scoreCombos !== TOPS.length * OUTERS.length * BOTTOMS.length * SHOES.length) err(`score 遍历组合数异常: ${scoreCombos}/${TOPS.length * OUTERS.length * BOTTOMS.length * SHOES.length}`)
  // 敏感度门槛从「≥25 个取值」收紧到「≥40」：25 太低，评分通胀到只有三十几个分值
  // 时依然能过线（实测旧实现 37 个、中位数 82、33% 的组合拿「优秀」，那等于没区分度）。
  // 现在实测 57 个；留出余量，但只要有人把评分改回「起始即满分」就会立刻红。
  if (distinctTotals < 40) err(`score 敏感度不足: 不同 total 取值只有 ${distinctTotals} 个（要求 ≥40）—— 评分疑似又变回「起始即满分」的通胀写法`)
  if (!(scoreMax > scoreMin + 45)) err(`score 区分度不足: max(${scoreMax}) - min(${scoreMin}) = ${scoreMax - scoreMin}（要求 >45）`)
  // 分布形状：把「优秀」定义为 ≥85，那么它不该占到三成以上——否则这个词就没意义。
  const excellent = [...dist.entries()].filter(([v]) => v >= 85).reduce((s, [, n]) => s + n, 0)
  const excellentPct = (excellent / scoreCombos) * 100
  if (excellentPct > 15) err(`评分通胀: ≥85 分的组合占 ${excellentPct.toFixed(1)}%（要求 ≤15%）—— 「优秀」门槛形同虚设`)
  // 中位数落在 60..80 才算「有中间地带」。旧实现中位数 82，明显偏高。
  const sorted = [...dist.entries()].flatMap(([v, n]) => Array.from({ length: n }, () => v)).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median < 60 || median > 80) err(`评分中位数 ${median} 落在 60..80 之外 —— 分布偏了（过低=苛责，过高=通胀）`)
  const hot = [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v}×${n}`).join(' ')
  ok(`score 契约 + 敏感度检查完成：${scoreCombos} 组合，不同取值 ${distinctTotals} 个，min ${scoreMin} / max ${scoreMax}（span ${scoreMax - scoreMin}），中位数 ${median}，≥85 占 ${excellentPct.toFixed(1)}%；高频分值 ${hot}`)
}

console.log(errors ? `\n共 ${errors} 个问题` : '\n全部通过')
process.exit(errors ? 1 : 0)

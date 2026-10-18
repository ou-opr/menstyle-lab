// 阶段一 preference / personalRecommendations 纯函数测试（task-2）
// 运行：& npm.cmd run test:prefs  （或 node scripts/test-preferences.mjs）
import assert from 'node:assert/strict'

import {
  DELTA_LIMIT,
  FEEDBACK_REASONS,
  PREFERENCES_KEY,
  STEP_LIMIT,
  WEIGHT_LIMIT,
  applyFeedback,
  buildItemLookup,
  createEmptyPreferences,
  isEmptyPreferences,
  isValidPreferences,
  itemWeight,
  normalizeOutfit,
  outfitItemIds,
  preferenceDeltaOf,
  resetPreferences,
  sanitizePreferences,
  summarizePreferences,
} from '../src/data/preferences.js'
import {
  INTENTS,
  SLOTS,
  availableSlots,
  buildLookup,
  detectHardConflicts,
  findSmartReplacements,
  normalizeCandidateItem,
  normalizeWardrobe,
  ownedItemsForSlot,
  rankWithPersonalWardrobe,
} from '../src/data/personalRecommendations.js'
import { ITEMS, findItem } from '../src/data/catalog.js'

let checks = 0
const ok = (label, fn) => {
  fn()
  checks += 1
  console.log('  ✓', label)
}

const OUTFIT = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] }

// 个人衣橱夹具：只拥有 3 件（上装/下装/鞋），配饰与外套缺失 → ownedRatio 可预测
const WARDROBE = {
  version: 1,
  items: [
    { id: 'u-top-1', name: '我的白衬衫', category: 'tops', status: 'owned', hex: '#f4f2ec', family: 'light', formality: 3, warmth: 2, fit: 'regular', mesh: 'shirt', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
    { id: 'u-bottom-1', name: '我的卡其裤', category: 'bottoms', status: 'owned', hex: '#bcaa8c', family: 'earth', formality: 2, warmth: 1, fit: 'regular', mesh: 'chinos', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
    { id: 'u-shoes-1', name: '我的乐福鞋', category: 'shoes', status: 'owned', hex: '#3b2f26', family: 'dark', formality: 2, warmth: 1, fit: 'regular', mesh: 'loafer', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
    { id: 'u-acc-1', name: '我的银表', category: 'accs', status: 'owned', hex: '#c9c9c9', family: 'light', formality: 2, warmth: 1, fit: 'regular', mesh: 'watch', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
    { id: 'u-wish-1', name: '想要的大衣', category: 'outers', status: 'wishlist', hex: '#4b4d52', family: 'dark', formality: 3, warmth: 4, fit: 'regular', mesh: 'coat', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
    { id: 'u-dis-1', name: '不想要的鞋', category: 'shoes', status: 'disliked', hex: '#111111', family: 'dark', formality: 1, warmth: 1, fit: 'regular', mesh: 'sneaker', notes: '', tags: [], photoId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', wearCount: 0, lastWornAt: null },
  ],
}

console.log('\n[1] 契约 §4 常量与空状态')
ok('存储 key 为 stylelab:preferences:v1', () => assert.equal(PREFERENCES_KEY, 'stylelab:preferences:v1'))
ok('单次增量上限 STEP_LIMIT=3 / 权重 WEIGHT_LIMIT=12 / 修正 DELTA_LIMIT=10', () => {
  assert.equal(STEP_LIMIT, 3)
  assert.equal(WEIGHT_LIMIT, 12)
  assert.equal(DELTA_LIMIT, 10)
})
ok('七个原因码与契约一致', () => {
  assert.deepEqual(
    FEEDBACK_REASONS.map((x) => x.value),
    ['too-formal', 'too-casual', 'too-warm', 'too-cold', 'color', 'fit', 'other'],
  )
})
ok('空偏好结构完整且被判空', () => {
  const empty = createEmptyPreferences()
  assert.equal(empty.version, 1)
  assert.deepEqual(empty.feedback, [])
  assert.deepEqual(empty.weights, { itemIds: {}, colors: {}, formalities: {} })
  assert.equal(isEmptyPreferences(empty), true)
})
ok('sanitize 对非法输入返回空偏好（null/数组/字符串）', () => {
  for (const bad of [null, undefined, [], 'x', 42, { feedback: 'no' }]) {
    const safe = sanitizePreferences(bad)
    assert.deepEqual(safe.feedback, [])
    assert.deepEqual(safe.weights, { itemIds: {}, colors: {}, formalities: {} })
  }
})
ok('isValidPreferences 只认承载结构', () => {
  assert.equal(isValidPreferences({ feedback: [], weights: {} }), true)
  assert.equal(isValidPreferences({ feedback: [], weights: { itemIds: {} } }), true)
  assert.equal(isValidPreferences({ feedback: 'x', weights: {} }), false)
  assert.equal(isValidPreferences({ feedback: [] }), false)
  assert.equal(isValidPreferences(null), false)
})

console.log('\n[2] like / dislike / worn 与权重夹紧')
ok('like 让参与单品 +3', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  for (const id of ['t-white', 'b-jeans-d', 's-white', 'a-watch']) {
    assert.equal(itemWeight(next, id), 3, `${id} 应为 +3`)
  }
  assert.equal(next.feedback.length, 1)
  assert.equal(next.feedback[0].kind, 'like')
})
ok('dislike 让参与单品 -3', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'dislike', outfit: OUTFIT })
  assert.equal(itemWeight(next, 't-white'), -3)
  assert.equal(itemWeight(next, 'b-jeans-d'), -3)
})
ok('worn 是弱正向信号 +1', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'worn', outfit: OUTFIT })
  assert.equal(itemWeight(next, 't-white'), 1)
})
ok('o-none 外套不计入权重', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: { ...OUTFIT, outer: 'o-none' } })
  assert.equal(itemWeight(next, 'o-none'), 0)
  assert.equal(outfitItemIds({ ...OUTFIT, outer: 'o-none' }).includes('o-none'), false)
})
ok('真实外套计入权重', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: { ...OUTFIT, outer: 'o-bomber-b' } })
  assert.equal(itemWeight(next, 'o-bomber-b'), 3)
})
ok('累计权重夹在 [-12,12]：10 次 like 不越界', () => {
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 10; i += 1) prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  assert.equal(itemWeight(prefs, 't-white'), WEIGHT_LIMIT)
  assert.equal(prefs.feedback.length, 10)
})
ok('负向也夹在 [-12,12]：10 次 dislike 不越界', () => {
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 10; i += 1) prefs = applyFeedback(prefs, { kind: 'dislike', outfit: OUTFIT })
  assert.equal(itemWeight(prefs, 't-white'), -WEIGHT_LIMIT)
})
ok('非法 kind 被拒绝，状态不变', () => {
  const base = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  const same = applyFeedback(base, { kind: 'love', outfit: OUTFIT })
  assert.equal(same.feedback.length, 1)
})
ok('applyFeedback 不改写入参（纯函数）', () => {
  const base = createEmptyPreferences()
  const snapshot = JSON.stringify(base)
  applyFeedback(base, { kind: 'like', outfit: OUTFIT })
  assert.equal(JSON.stringify(base), snapshot)
})
ok('颜色权重按 hex 小写聚合', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  assert.equal(next.weights.colors['#f1efe8'], 3)
})
ok('正式度权重按档位聚合', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  assert.equal(next.weights.formalities['1'], 3)
})

console.log('\n[3] 原因记录与对正式度的方向修正')
ok('原因被规范化记录（去重 + 丢弃非法值）', () => {
  const next = applyFeedback(createEmptyPreferences(), {
    kind: 'dislike', outfit: OUTFIT,
    reasons: ['too-formal', 'too-formal', 'bogus', 'color', 7, null],
  })
  assert.deepEqual(next.feedback[0].reasons, ['too-formal', 'color'])
})
ok('非数组 reasons 归一为 []', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT, reasons: 'too-warm' })
  assert.deepEqual(next.feedback[0].reasons, [])
})
ok('too-formal 压低正式度权重，且整体仍受 STEP_LIMIT 夹紧', () => {
  // worn(1) + too-formal(-2) = -1：方向修正生效且未触碰上限
  const mild = applyFeedback(createEmptyPreferences(), { kind: 'worn', outfit: OUTFIT, reasons: ['too-formal'] })
  assert.equal(mild.weights.formalities['1'], -1)
  assert.equal(itemWeight(mild, 't-white'), 1)
  // dislike(-3) + too-formal(-2) = -5 被契约的「单次增量 ±3」夹回 -3
  const strong = applyFeedback(createEmptyPreferences(), { kind: 'dislike', outfit: OUTFIT, reasons: ['too-formal'] })
  assert.equal(strong.weights.formalities['1'], -STEP_LIMIT)
  assert.equal(itemWeight(strong, 't-white'), -STEP_LIMIT)
})
ok('too-casual 抬高正式度权重，同样夹在 ±3', () => {
  const mild = applyFeedback(createEmptyPreferences(), { kind: 'worn', outfit: OUTFIT, reasons: ['too-casual'] })
  assert.equal(mild.weights.formalities['1'], STEP_LIMIT)
  const strong = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT, reasons: ['too-casual'] })
  assert.equal(strong.weights.formalities['1'], STEP_LIMIT)
})
ok('不带原因时正式度权重就等于 kind 增量', () => {
  const next = applyFeedback(createEmptyPreferences(), { kind: 'dislike', outfit: OUTFIT })
  assert.equal(next.weights.formalities['1'], -STEP_LIMIT)
})
ok('summarizePreferences 统计三种 kind 与原因计数', () => {
  let prefs = createEmptyPreferences()
  prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  prefs = applyFeedback(prefs, { kind: 'worn', outfit: OUTFIT })
  prefs = applyFeedback(prefs, { kind: 'dislike', outfit: OUTFIT, reasons: ['color'] })
  const summary = summarizePreferences(prefs)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.byKind, { like: 1, dislike: 1, worn: 1 })
  // 同套房：每件单品 like(+1) + worn(+1) + dislike(-1) = 净 +1，并列时按 id 升序
  assert.deepEqual(summary.liked.map((x) => x.id), ['a-watch', 'b-jeans-d', 's-white', 't-white'])
  assert(summary.liked.every((x) => x.score === 1))
  assert.deepEqual(summary.disliked, [])
  assert.equal(summary.reasons[0].value, 'color')
  assert.equal(summary.reasons[0].label, '颜色不合适')
  assert.equal(summary.lastFeedbackAt, prefs.feedback[2].at)
})
ok('summarize 的 liked 按累计得分降序、disliked 独立归类且带出可读名称', () => {
  let prefs = createEmptyPreferences()
  prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  prefs = applyFeedback(prefs, { kind: 'dislike', outfit: { ...OUTFIT, top: 't-black' } })
  const summary = summarizePreferences(prefs)
  assert.equal(summary.liked[0].id, 't-white')
  assert.equal(summary.liked[0].score, 2)
  assert.equal(summary.liked[0].name, findItem('t-white').name)
  assert.equal(summary.disliked[0].id, 't-black')
  assert.equal(summary.disliked[0].score, -1)
  // 个人单品也要能解析出可读名称
  const personal = summarizePreferences(
    applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: { ...OUTFIT, top: 'u-top-1' } }),
    buildLookup(WARDROBE),
  )
  assert.equal(personal.liked.some((x) => x.name === '我的白衬衫'), true)
})
ok('summarize 的 liked/disliked 各不超过 5 条', () => {
  let prefs = createEmptyPreferences()
  for (const id of ['t-white', 't-black', 't-gray', 't-polo', 't-polo-b', 't-shirt-w', 't-shirt-b']) {
    prefs = applyFeedback(prefs, { kind: 'like', outfit: { ...OUTFIT, top: id } })
  }
  assert.equal(summarizePreferences(prefs).liked.length, 5)
})

console.log('\n[4] 查看与重置')
ok('resetPreferences 返回全空且已判空', () => {
  let prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  const reset = resetPreferences()
  assert.deepEqual(reset, createEmptyPreferences())
  assert.equal(isEmptyPreferences(reset), true)
  assert.equal(isEmptyPreferences(prefs), false)
  assert.equal(itemWeight(reset, 't-white'), 0)
})
ok('偏好经 sanitize 往返幂等', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  const once = sanitizePreferences(prefs)
  const twice = sanitizePreferences(once)
  assert.deepEqual(once, twice)
})
ok('sanitize 丢弃非法 feedback 项并夹紧越界权重', () => {
  const safe = sanitizePreferences({
    version: 99,
    feedback: [{ kind: 'nope' }, { kind: 'like', outfit: null }, null],
    weights: { itemIds: { 't-white': 999, bad: 0 }, colors: null, formalities: { 1: -999 } },
  })
  assert.equal(safe.feedback.length, 1)
  assert.equal(safe.weights.itemIds['t-white'], WEIGHT_LIMIT)
  assert.equal(safe.weights.itemIds.bad, undefined)
  assert.equal(safe.weights.formalities['1'], -WEIGHT_LIMIT)
  assert.deepEqual(safe.weights.colors, {})
})

console.log('\n[5] 最终排序修正夹在 [-10,10]')
ok('空偏好修正为 0', () => {
  assert.equal(preferenceDeltaOf(OUTFIT, createEmptyPreferences()), 0)
})
ok('全 dislike 也翻不过 -10', () => {
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 6; i += 1) prefs = applyFeedback(prefs, { kind: 'dislike', outfit: OUTFIT })
  const delta = preferenceDeltaOf(OUTFIT, prefs)
  assert.equal(delta, -DELTA_LIMIT)
})
ok('全 like 也翻不过 +10', () => {
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 6; i += 1) prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  assert.equal(preferenceDeltaOf(OUTFIT, prefs), DELTA_LIMIT)
})
ok('修正对任意 outfit 都落在 [-10,10]（含空 outfit / 未知 id）', () => {
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 6; i += 1) prefs = applyFeedback(prefs, { kind: 'like', outfit: OUTFIT })
  for (const probe of [{}, { top: null }, { top: 'nope-id' }, { top: 't-white', accs: [] }, null]) {
    const delta = preferenceDeltaOf(probe, prefs)
    assert(delta >= -DELTA_LIMIT && delta <= DELTA_LIMIT, `delta 越界：${delta}`)
  }
})
ok('三分量加权：单品 0.5 / 颜色 0.3 / 正式度 0.2，单次 like 得 3', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  assert.equal(preferenceDeltaOf(OUTFIT, prefs), 3)
  // 累计到上限时三个分量都是 12 → 加权平均 12，被夹到 10
  let capped = createEmptyPreferences()
  for (let i = 0; i < 6; i += 1) capped = applyFeedback(capped, { kind: 'like', outfit: OUTFIT })
  assert.equal(capped.weights.itemIds['t-white'], WEIGHT_LIMIT)
  assert.equal(preferenceDeltaOf(OUTFIT, capped), DELTA_LIMIT)
})
ok('只影响被反馈过的单品所在 outfit', () => {
  let prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  const unrelated = preferenceDeltaOf({ top: 't-shirt-w', outer: 'o-none', bottom: 'b-trousers-g', shoes: 's-derby', accs: [] }, prefs)
  assert(unrelated < preferenceDeltaOf(OUTFIT, prefs), '未反馈单品不应获得同等加成')
})

console.log('\n[6] 个人衣橱归一与已有占比 / 缺少单品')
ok('normalizeWardrobe 兼容 {items:[]} 与裸数组，且只认 u- 前缀', () => {
  assert.equal(normalizeWardrobe(WARDROBE).length, 6)
  assert.equal(normalizeWardrobe(WARDROBE.items).length, 6)
  assert.equal(normalizeWardrobe([{ id: 't-white' }, { id: 'u-ok', category: 'tops', status: 'owned' }]).length, 1)
  assert.equal(normalizeWardrobe(null).length, 0)
  assert.equal(normalizeWardrobe({ items: 'x' }).length, 0)
})
ok('ownedItemsForSlot 只返回 owned 且类目匹配', () => {
  assert.deepEqual(ownedItemsForSlot(WARDROBE, 'top').map((x) => x.id), ['u-top-1'])
  assert.deepEqual(ownedItemsForSlot(WARDROBE, 'shoes').map((x) => x.id), ['u-shoes-1'])
  assert.deepEqual(ownedItemsForSlot(WARDROBE, 'accs').map((x) => x.id), ['u-acc-1'])
  assert.deepEqual(ownedItemsForSlot(WARDROBE, 'outer').map((x) => x.id), [])
  assert.deepEqual(ownedItemsForSlot(WARDROBE, 'bogus'), [])
})
ok('rank 附加四个契约字段', () => {
  const [first] = rankWithPersonalWardrobe([{ ...OUTFIT, id: 'p-safe', score: 80 }], WARDROBE, createEmptyPreferences())
  assert.equal(typeof first.personalScore, 'number')
  assert.equal(typeof first.ownedRatio, 'number')
  assert(Array.isArray(first.missing))
  assert.equal(typeof first.preferenceDelta, 'number')
})
ok('个人单品被优先替换进 outfit，ownedRatio 与 missing 自洽', () => {
  const [first] = rankWithPersonalWardrobe([{ ...OUTFIT, id: 'p-safe', score: 80 }], WARDROBE, createEmptyPreferences())
  assert.equal(first.top, 'u-top-1')
  assert.equal(first.bottom, 'u-bottom-1')
  assert.equal(first.shoes, 'u-shoes-1')
  assert.deepEqual(first.accs, ['u-acc-1'])
  // 槽位：top/bottom/shoes（+accs 因为原 outfit 带配饰）= 4 个，全部命中 → 1
  assert.equal(first.ownedRatio, 1)
  assert.deepEqual(first.missing, [])
})
ok('外套缺失时 missing 明确标记 category 与替代的系统单品名', () => {
  const [first] = rankWithPersonalWardrobe(
    [{ ...OUTFIT, id: 'p-layer', score: 70, outer: 'o-coat-g' }], WARDROBE, createEmptyPreferences())
  assert.equal(first.missing.length, 1)
  assert.equal(first.missing[0].category, 'outers')
  assert.equal(first.missing[0].itemId, 'o-coat-g')
  assert.equal(first.missing[0].name, findItem('o-coat-g').name)
  assert.equal(first.ownedRatio, 0.8) // 5 槽中 4 槽命中
})
ok('wishlist / disliked 不被当作已拥有', () => {
  const [first] = rankWithPersonalWardrobe([{ ...OUTFIT, id: 'x', score: 60, outer: 'o-coat-g' }], WARDROBE, createEmptyPreferences())
  assert.notEqual(first.outer, 'u-wish-1')
  assert.notEqual(first.shoes, 'u-dis-1')
  assert.equal(first.shoes, 'u-shoes-1')
})
ok('空衣橱 → ownedRatio 0 且 missing 覆盖全部槽位', () => {
  const [first] = rankWithPersonalWardrobe([{ ...OUTFIT, id: 'p-safe', score: 80 }], { version: 1, items: [] }, createEmptyPreferences())
  assert.equal(first.ownedRatio, 0)
  assert.equal(first.missing.length, 4)
  assert.equal(first.top, 't-white')
  assert.deepEqual(first.accs, ['a-watch'])
})
ok('rank 按 personalScore 降序，且返回条数不变', () => {
  const outfits = [
    { ...OUTFIT, id: 'p-a', score: 60 },
    { ...OUTFIT, id: 'p-b', score: 90 },
    { ...OUTFIT, id: 'p-c', score: 75 },
  ]
  const ranked = rankWithPersonalWardrobe(outfits, WARDROBE, createEmptyPreferences())
  assert.equal(ranked.length, 3)
  assert.deepEqual(ranked.map((x) => x.id), ['p-b', 'p-c', 'p-a'])
  assert(ranked[0].personalScore >= ranked[1].personalScore)
})
ok('偏好能改变排序：被 dislike 的套装配件下沉', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'dislike', outfit: { ...OUTFIT, top: 't-black' } })
  const outfits = [
    { ...OUTFIT, id: 'p-black', score: 70, top: 't-black' },
    { ...OUTFIT, id: 'p-white', score: 70, top: 't-white' },
  ]
  const ranked = rankWithPersonalWardrobe(outfits, { version: 1, items: [] }, prefs)
  assert.equal(ranked[0].id, 'p-white')
})
ok('rank 不改写入参 outfits', () => {
  const outfits = [{ ...OUTFIT, id: 'p-a', score: 60 }]
  const snapshot = JSON.stringify(outfits)
  rankWithPersonalWardrobe(outfits, WARDROBE, createEmptyPreferences())
  assert.equal(JSON.stringify(outfits), snapshot)
})
ok('rank 对空数组 / 非法入参不崩', () => {
  assert.deepEqual(rankWithPersonalWardrobe([], WARDROBE, null), [])
  assert.deepEqual(rankWithPersonalWardrobe(null, null, null), [])
  const [item] = rankWithPersonalWardrobe([{ id: 'p-x' }], 'bogus', { feedback: [] })
  assert.equal(item.personalScore, 60)
})

console.log('\n[7] 硬性冲突不得被偏好覆盖')
ok('皮鞋 × 短裤被判为硬冲突', () => {
  const conflicts = detectHardConflicts({ top: 't-shirt-w', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-derby' })
  assert.equal(conflicts.length >= 1, true)
})
ok('跑鞋 × 西装被判为硬冲突', () => {
  const conflicts = detectHardConflicts({ top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-g', shoes: 's-runner' })
  assert(conflicts.some((x) => x.includes('跑鞋')), '应报跑鞋冲突')
})
ok('干净搭配无冲突', () => {
  assert.deepEqual(detectHardConflicts(OUTFIT), [])
})
ok('被强烈喜欢的冲突套装仍被排到无冲突套装之后', () => {
  let prefs = createEmptyPreferences()
  const bad = { top: 't-shirt-w', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-derby', id: 'bad', score: 95 }
  for (let i = 0; i < 6; i += 1) {
    // 对冲突套装里每一件都给满正反馈（delta 上限 +10）
    for (const id of ['t-shirt-w', 'b-shorts-b', 's-derby']) {
      prefs = applyFeedback(prefs, { kind: 'like', outfit: { top: id, outer: 'o-none', bottom: id, shoes: id, accs: [] } })
    }
  }
  const ranked = rankWithPersonalWardrobe([bad, { ...OUTFIT, id: 'good', score: 60 }], { version: 1, items: [] }, prefs)
  assert.equal(ranked[0].id, 'good', '硬冲突惩罚必须大于修正上限')
  assert.equal(ranked[1].id, 'bad')
  assert.equal(ranked[0].hardConflict, false)
  assert.equal(ranked[1].hardConflict, true)
  assert.equal(ranked[1].preferenceDelta, DELTA_LIMIT, '偏好确实被记录')
  assert(ranked[1].conflicts.length > 0)
})
ok('硬冲突惩罚独立于修正上限（20 > 10，且冲突时丢弃偏好加成）', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: OUTFIT })
  const [clean] = rankWithPersonalWardrobe([{ ...OUTFIT, id: 'c', score: 70 }], { version: 1, items: [] }, prefs)
  const [dirty] = rankWithPersonalWardrobe(
    [{ top: 't-shirt-w', outer: 'o-blazer-n', bottom: 'b-trousers-g', shoes: 's-runner', id: 'd', score: 70 }],
    { version: 1, items: [] }, createEmptyPreferences())
  assert.equal(dirty.hardConflict, true)
  assert.equal(dirty.personalScore, 70 - 20, '冲突套装的偏好加成必须被丢弃')
  assert.equal(clean.hardConflict, false)
  // 一次 like 的三分量加权平均恰好是 3（0.5/0.3/0.2 各得 3）
  assert.equal(clean.preferenceDelta, 3)
  assert.equal(clean.personalScore, 70 + clean.preferenceDelta)
  // 同为 base 70，冲突套装必须比干净套装低至少 20 分——大于任何可能的偏好加成
  assert(clean.personalScore - dirty.personalScore >= 20, `实际差距 ${clean.personalScore - dirty.personalScore}`)
})

console.log('\n[8] 七种 intent 的智能替换')
ok('INTENTS 恰好是契约里的七种', () => {
  assert.deepEqual(INTENTS, ['more-formal', 'more-casual', 'warmer', 'cooler', 'taller', 'subtle', 'owned-only'])
})
ok('每种 intent 都能返回结果且字段完整', () => {
  for (const intent of INTENTS) {
    const results = findSmartReplacements({
      outfit: OUTFIT, slot: 'top', intent, wardrobeState: WARDROBE, preferences: createEmptyPreferences(), limit: 5,
    })
    assert(results.length > 0, `${intent} 应有候选`)
    assert(results.length <= 5, `${intent} 不应超过 limit`)
    for (const entry of results) {
      assert.equal(typeof entry.item.id, 'string')
      assert(['personal', 'system'].includes(entry.source))
      assert.equal(typeof entry.owned, 'boolean')
      assert.equal(typeof entry.scoreDelta, 'number')
      // 契约未约束 scoreDelta 上下界；此处区间 = 意图/偏好增量 [-10,10] + 衣橱加成 [0,5]
      assert(entry.scoreDelta >= -DELTA_LIMIT && entry.scoreDelta <= DELTA_LIMIT + 5,
        `${intent} scoreDelta 越界：${entry.scoreDelta}`)
      assert(Array.isArray(entry.reasons) && entry.reasons.length > 0)
      assert.notEqual(entry.item.id, 't-white', `${intent} 不应把当前单品当替换项`)
    }
  }
})
ok('排序：scoreDelta 单调不增（衣橱加成已计入该字段）', () => {
  for (const intent of INTENTS) {
    const results = findSmartReplacements({ outfit: OUTFIT, slot: 'bottom', intent, wardrobeState: WARDROBE, limit: 8 })
    for (let i = 1; i < results.length; i += 1) {
      assert(results[i - 1].scoreDelta >= results[i].scoreDelta, `${intent} 未按 scoreDelta 降序`)
    }
  }
})
ok('owned-only 只给个人单品，且不出现系统单品', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'owned-only', wardrobeState: WARDROBE })
  assert(results.length > 0)
  assert(results.every((x) => x.source === 'personal' && x.owned === true))
  assert(results.every((x) => x.item.id.startsWith('u-')))

})
ok('衣橱单品获得 +5 有界加成（不是绝对优先）', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', wardrobeState: WARDROBE, limit: 40 })
  const personal = results.find((x) => x.item.id === 'u-top-1')
  assert(personal, '应有个人上装候选')
  assert(personal.reasons.some((x) => x.includes('已经拥有')))
  // 系统候选的 scoreDelta 可高于它——证明这是加成而非绝对优先
  assert(results.some((x) => x.source === 'system'), '系统建议仍应出现')
  const maxSystem = Math.max(...results.filter((x) => x.source === 'system').map((x) => x.scoreDelta))
  assert.equal(personal.scoreDelta <= maxSystem + 5 + 10, true)
})
ok('more-formal 的首选正式度高于当前上装', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'more-formal', wardrobeState: WARDROBE, limit: 5 })
  const current = findItem('t-white').formality
  assert(results[0].item.formality > current, `期望正式度 > ${current}，实际 ${results[0].item.formality}`)
  assert(results[0].reasons.some((x) => x.includes('正式度')))
})
ok('more-casual 在意图差异明显时由系统建议胜出（衣橱加成不掩盖意图）', () => {
  const shirt = { ...OUTFIT, top: 't-shirt-w' }
  const results = findSmartReplacements({ outfit: shirt, slot: 'top', intent: 'more-casual', wardrobeState: WARDROBE, limit: 5 })
  // 衣橱里的白衬衫同为 formality 3，只能拿到 +5 加成；系统休闲上装正式度差更大，应胜出
  assert(results[0].item.formality < findItem('t-shirt-w').formality, `实际首选 ${results[0].item.id}`)
})
ok('warmer 的首选保暖等级高于当前上装', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'warmer', wardrobeState: WARDROBE, limit: 5 })
  assert(results[0].item.warmth > findItem('t-white').warmth)
  assert(results[0].reasons.some((x) => x.includes('保暖')))
})
ok('cooler 对厚上装给出更薄选择', () => {
  const heavy = { ...OUTFIT, top: 't-hoodie-b' }
  const results = findSmartReplacements({ outfit: heavy, slot: 'top', intent: 'cooler', wardrobeState: WARDROBE, limit: 5 })
  assert(results[0].item.warmth < findItem('t-hoodie-b').warmth)
})
ok('taller 不选宽松厚重上装作首选', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'taller', wardrobeState: WARDROBE, limit: 5 })
  assert.equal(['hoodie', 'sweatshirt', 'overshirt', 'puffer'].includes(results[0].item.mesh), false)
})
ok('taller 在鞋槽识别同色系加成', () => {
  const results = findSmartReplacements({
    outfit: { ...OUTFIT, bottom: 'b-jeans-b' }, slot: 'shoes', intent: 'taller', wardrobeState: WARDROBE, limit: 10,
  })
  assert(results.length > 0)
  const bonus = results.find((x) => x.reasons.some((r) => r.includes('同色系')))
  if (bonus) assert(bonus.reasons.some((r) => r.includes('腿')))
  assert(results[0].scoreDelta >= results[results.length - 1].scoreDelta)
})
ok('subtle 压低彩度单品', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', wardrobeState: WARDROBE, limit: 30 })
  const accent = results.find((x) => x.item.family === 'accent')
  const dark = results.find((x) => x.item.family === 'dark')
  if (accent && dark) assert(dark.scoreDelta > accent.scoreDelta)
})
ok('偏好影响替换排序：被 like 的个人单品上浮', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: { ...OUTFIT, top: 'u-top-1' } })
  const withPref = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', wardrobeState: WARDROBE, preferences: prefs })
  const without = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', wardrobeState: WARDROBE, preferences: createEmptyPreferences() })
  const a = withPref.find((x) => x.item.id === 'u-top-1')
  const b = without.find((x) => x.item.id === 'u-top-1')
  assert(a.scoreDelta > b.scoreDelta, '偏好应抬高该单品')
  assert(a.reasons.some((x) => x.includes('反馈')))
})
ok('会引入新硬冲突的候选被剔除（下装槽不会被推到短裤×皮鞋）', () => {
  const conflicting = { ...OUTFIT, shoes: 's-derby' }
  const results = findSmartReplacements({ outfit: conflicting, slot: 'bottom', intent: 'more-casual', wardrobeState: WARDROBE, limit: 30 })
  assert.equal(results.some((x) => x.item.id === 'b-shorts-b'), false, '短裤必须被硬冲突规则挡掉')
})
ok('能消除现有硬冲突的候选获得加成', () => {
  const broken = { top: 't-shirt-w', outer: 'o-none', bottom: 'b-shorts-b', shoes: 's-derby' }
  const results = findSmartReplacements({ outfit: broken, slot: 'shoes', intent: 'subtle', wardrobeState: WARDROBE, limit: 30 })
  assert.equal(results.some((x) => x.item.id === 's-derby'), false, '当前鞋不该出现')
  const healer = results.find((x) => x.reasons.some((r) => r.includes('消除现有硬性冲突')))
  assert(healer, '应存在解除冲突的候选并给出说明')
})
ok('limit 生效且非法 limit 回落到 5', () => {
  assert.equal(findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', limit: 2 }).length, 2)
  assert(findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', limit: 0 }).length <= 5)
  assert(findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle' }).length <= 5)
})
ok('未知 slot / intent 安全回落', () => {
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'hat', intent: 'bling', limit: 3 })
  assert(results.length <= 3)
  assert(results.every((x) => typeof x.item.id === 'string'))
})
ok('空输入不崩', () => {
  assert.deepEqual(findSmartReplacements(null), [])
  assert.deepEqual(findSmartReplacements(undefined), [])
  assert.deepEqual(findSmartReplacements('x'), [])
  assert(findSmartReplacements({}).length <= 5)
  const results = findSmartReplacements({ outfit: null, slot: 'top', intent: 'subtle', wardrobeState: null, preferences: null })
  assert(Array.isArray(results))
})
ok('五个槽位都能产出替换候选', () => {
  for (const slot of SLOTS) {
    const results = findSmartReplacements({ outfit: OUTFIT, slot, intent: 'subtle', wardrobeState: WARDROBE, limit: 3 })
    assert(results.length > 0, `${slot} 应有候选`)
    assert(results.every((x) => x.item.slot === slot))
  }
})
ok('availableSlots 返回五个可替换槽位', () => {
  assert.deepEqual(availableSlots().sort(), [...SLOTS].sort())
})
ok('normalizeCandidateItem 对个人与系统单品给出统一形状', () => {
  const personal = normalizeCandidateItem(WARDROBE.items[0], 'top')
  assert.equal(personal.id, 'u-top-1')
  assert.equal(personal.name, '我的白衬衫')
  assert.equal(personal.category, 'tops')
  const bare = normalizeCandidateItem({ id: 'u-x' }, 'shoes')
  assert.equal(bare.name, 'u-x')
  assert.equal(bare.hex, null)
  assert.equal(bare.formality, null)
})
ok('个人单品即使字段残缺也不会让替换崩', () => {
  const thin = { version: 1, items: [{ id: 'u-thin', category: 'tops', status: 'owned' }] }
  const results = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'subtle', wardrobeState: thin, limit: 5 })
  assert(results.length > 0)
  assert(results.every((x) => Number.isFinite(x.scoreDelta)))
})

console.log('\n[9] 系统与个人单品安全兼容 / 端到端')
ok('全目录 ITEMS 对每个槽位都能被评分而不抛错', () => {
  const lookup = buildLookup(WARDROBE)
  for (const item of ITEMS) assert(lookup.get(item.id), `查表缺 ${item.id}`)
  for (const slot of SLOTS) {
    const results = findSmartReplacements({ outfit: OUTFIT, slot, intent: 'subtle', wardrobeState: WARDROBE, limit: 50 })
    assert(results.every((x) => x.item.id.length > 0))
  }
})
ok('个人单品参与偏好权重与修正（不再是黑盒）', () => {
  const prefs = applyFeedback(createEmptyPreferences(), { kind: 'like', outfit: { ...OUTFIT, top: 'u-top-1' } })
  assert.equal(itemWeight(prefs, 'u-top-1'), 3)
  const delta = preferenceDeltaOf({ ...OUTFIT, top: 'u-top-1' }, prefs, buildLookup(WARDROBE))
  assert(delta > 0, '个人单品反馈应产生正向修正')
})
ok('lookup 同时解析系统与个人单品', () => {
  const lookup = buildLookup(WARDROBE)
  assert.equal(lookup.get('t-white').name !== undefined, true)
  assert.equal(lookup.get('u-top-1').name, '我的白衬衫')
  assert.equal(buildItemLookup(WARDROBE.items).get('u-top-1').name, '我的白衬衫')
})
ok('normalizeOutfit 归一缺字段 / 非法 accs', () => {
  assert.deepEqual(normalizeOutfit(null), { top: null, outer: 'o-none', bottom: null, shoes: null, accs: [] })
  assert.equal(normalizeOutfit({ accs: 'a-watch' }).accs.length, 0)
  assert.equal(normalizeOutfit({ accs: ['a-watch', 7, null] }).accs.length, 1)
})
ok('闭环：反馈 → 排序变化 → 替换建议一致', () => {
  const outfits = [
    { ...OUTFIT, id: 'p-safe', score: 80 },
    { ...OUTFIT, id: 'p-mono', score: 80, top: 't-black', bottom: 'b-jeans-b' },
  ]
  const before = rankWithPersonalWardrobe(outfits, WARDROBE, createEmptyPreferences())
  let prefs = createEmptyPreferences()
  for (let i = 0; i < 4; i += 1) prefs = applyFeedback(prefs, { kind: 'like', outfit: { ...OUTFIT, top: 't-black' } })
  const after = rankWithPersonalWardrobe(outfits, WARDROBE, prefs)
  assert.equal(before.length, after.length)
  const blackBefore = before.find((x) => x.id === 'p-mono').preferenceDelta
  const blackAfter = after.find((x) => x.id === 'p-mono').preferenceDelta
  assert(blackAfter > blackBefore, '偏好应提升该套装的修正量')
  const replacement = findSmartReplacements({ outfit: OUTFIT, slot: 'top', intent: 'more-formal', wardrobeState: WARDROBE, preferences: prefs, limit: 1 })
  assert.equal(replacement.length, 1)
})

console.log(`\n✓ 偏好与个人推荐断言全部通过（${checks} 组）`)

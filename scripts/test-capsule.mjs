// 胶囊衣橱断言：node scripts/test-capsule.mjs
//
// 胶囊的答案天生「有点主观」，所以这里不去断言「应该选哪几件」——那是调参，
// 换个季节就变。真正必须钉死的是四条**可判定的性质**：
//   1) 配额自洽：各槽位件数之和 == 目标件数，且必补槽位不会被算成 0；
//   2) 归属诚实：owned 优先入选，wishlist 只当补齐候选，绝不在「已入选」里冒充已有；
//   3) 组合数可复算：必补槽位缺一即为 0；覆盖率之和 == 组合数（同一槽位每套恰好取一件）；
//   4) 坏数据不放大：脏单品被逐条丢弃并告警，而一条脏数据不能让整次规划崩掉。
import assert from 'node:assert/strict'
import {
  CAPSULE_MAX,
  CAPSULE_MIN,
  DEFAULT_TARGET,
  OCCASIONS,
  REQUIRED_SLOTS,
  SEASONS,
  SLOTS,
  SLOT_LABELS,
  computeCoverage,
  countCombinations,
  hardConflict,
  normalizeCandidates,
  pairScore,
  planCapsule,
  quotaFor,
} from '../src/data/capsule.js'

let failed = 0
const ok = (m) => console.log('✓ ' + m)
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}

const item = (id, slot, extra = {}) => ({
  id,
  name: id,
  slot,
  source: 'personal',
  ownership: 'owned',
  hex: '#333333',
  family: 'dark',
  formality: 2,
  warmth: 2,
  mesh: 'tee',
  ...extra,
})

const personal = (id, name, category, status, extra = {}) => ({
  id,
  name,
  category,
  status,
  hex: '#333333',
  family: 'dark',
  formality: 2,
  warmth: 2,
  mesh: 'pants',
  ...extra,
})

/** 一套完整可穿的衣橱：每个槽位都有 owned 单品。 */
const FULL_WARDROBE = { items: [
  personal('u-top-1', '我的白T', 'tops', 'owned', { mesh: 'tee', family: 'light', formality: 1, warmth: 1 }),
  personal('u-top-2', '我的黑衬衫', 'tops', 'owned', { mesh: 'shirt', formality: 2, warmth: 2 }),
  personal('u-top-3', '我的针织衫', 'tops', 'owned', { mesh: 'sweater', family: 'neutral', formality: 2, warmth: 3 }),
  personal('u-bottom-1', '我的深蓝牛仔', 'bottoms', 'owned', { mesh: 'pants-denim', family: 'cool' }),
  personal('u-bottom-2', '我的卡其长裤', 'bottoms', 'owned', { mesh: 'pants-twill', family: 'neutral' }),
  personal('u-bottom-3', '我的灰西裤', 'bottoms', 'owned', { mesh: 'pants-twill', family: 'neutral', formality: 3 }),
  personal('u-shoes-1', '我的白鞋', 'shoes', 'owned', { mesh: 'sneaker', family: 'light', formality: 1, warmth: 1 }),
  personal('u-shoes-2', '我的德比鞋', 'shoes', 'owned', { mesh: 'derby', formality: 3, warmth: 2 }),
  personal('u-outer-1', '我的黑大衣', 'outers', 'owned', { mesh: 'coat', formality: 3, warmth: 4 }),
  personal('u-outer-2', '我的军绿夹克', 'outers', 'owned', { mesh: 'harrington', formality: 1, warmth: 2 }),
  personal('u-acs-1', '我的腕表', 'accs', 'owned', { mesh: 'watch' }),
  personal('u-wish-1', '想买的切尔西靴', 'shoes', 'wishlist', { mesh: 'chelsea', formality: 2, warmth: 2 }),
] }

// ------------------------------------------------------------------ 常量与配额

check('胶囊常量与契约一致', () => {
  assert.equal(CAPSULE_MIN, 12)
  assert.equal(CAPSULE_MAX, 20)
  assert.equal(DEFAULT_TARGET, 16)
  assert.deepEqual(SLOTS, ['top', 'outer', 'bottom', 'shoes', 'accs'])
  assert.deepEqual(REQUIRED_SLOTS, ['top', 'bottom', 'shoes'])
  assert.deepEqual(SEASONS, ['spring', 'summer', 'autumn', 'winter'])
  assert.deepEqual(OCCASIONS, ['casual', 'campus', 'work', 'date'])
  for (const s of SLOTS) assert.equal(typeof SLOT_LABELS[s], 'string')
})

check('quotaFor 各槽位件数之和等于目标件数', () => {
  for (const season of SEASONS) {
    for (let t = CAPSULE_MIN; t <= CAPSULE_MAX; t += 1) {
      const quota = quotaFor(t, season)
      const sum = SLOTS.reduce((s, slot) => s + (quota[slot] || 0), 0)
      assert.equal(sum, t, `${season}/${t} 件配额之和应为 ${t}，实际 ${sum}`)
      for (const s of REQUIRED_SLOTS) assert.ok(quota[s] >= 1, `${season}/${t} 的必补槽位 ${s} 不应为 0`)
    }
  }
})

check('quotaFor 冬季外套多于夏季', () => {
  assert.ok(quotaFor(DEFAULT_TARGET, 'winter').outer > quotaFor(DEFAULT_TARGET, 'summer').outer)
  assert.ok(quotaFor(DEFAULT_TARGET, 'winter').outer >= 1)
})

check('quotaFor 对非法季节与越界目标回退而不抛异常', () => {
  const fallback = quotaFor(DEFAULT_TARGET, 'rainy-season')
  assert.deepEqual(fallback, quotaFor(DEFAULT_TARGET, 'autumn'))
  const low = quotaFor(-999, 'autumn')
  assert.equal(SLOTS.reduce((s, slot) => s + low[slot], 0), CAPSULE_MIN)
  const high = quotaFor(999, 'autumn')
  assert.equal(SLOTS.reduce((s, slot) => s + high[slot], 0), CAPSULE_MAX)
  const nan = quotaFor('abc', 'autumn')
  assert.equal(SLOTS.reduce((s, slot) => s + nan[slot], 0), DEFAULT_TARGET)
})

// ------------------------------------------------------------------ 候选池归一

check('normalizeCandidates 接受 {items} 与裸数组两种形状', () => {
  const a = normalizeCandidates(FULL_WARDROBE)
  const b = normalizeCandidates(FULL_WARDROBE.items)
  assert.deepEqual(Object.keys(a.pool).sort(), [...SLOTS].sort())
  assert.equal(a.pool.top.length, b.pool.top.length)
  assert.equal(a.pool.top.length, 3)
})

check('normalizeCandidates 丢弃脏数据并计数告警', () => {
  const { pool, warnings } = normalizeCandidates({ items: [
    personal('u-ok', '好单品', 'tops', 'owned'),
    null,
    'not-an-object',
    { id: 'u-nocat', name: '没有分类' },
    { id: 'u-noname', category: 'tops', status: 'owned' },
    personal('u-ok', '重复 id', 'tops', 'owned'),
  ] })
  assert.equal(pool.top.length, 1)
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('5 件'), `应统计 5 件被丢弃，实际提示：${warnings[0]}`)
})

check('normalizeCandidates 跳过 disliked 并单独告警', () => {
  const { pool, warnings } = normalizeCandidates({ items: [
    personal('u-1', '喜欢的', 'tops', 'owned'),
    personal('u-2', '不要的', 'tops', 'disliked'),
    personal('u-3', '不要的鞋', 'shoes', 'disliked'),
  ] })
  assert.equal(pool.top.length, 1)
  assert.equal(pool.shoes.length, 0)
  assert.ok(warnings.some((w) => w.includes('2 件')))
})

check('normalizeCandidates 保留 wishlist 但状态如实标注', () => {
  const { pool } = normalizeCandidates(FULL_WARDROBE)
  assert.equal(pool.shoes.length, 3)
  assert.ok(pool.shoes.some((c) => c.ownership === 'wishlist'))
  assert.ok(pool.shoes.some((c) => c.ownership === 'owned'))
})

check('normalizeCandidates 对空/非法输入返回空池而不抛异常', () => {
  for (const input of [undefined, null, 'x', 42, {}, { items: 'x' }]) {
    const { pool, warnings } = normalizeCandidates(input)
    assert.equal(warnings.length, 0)
    for (const s of SLOTS) assert.deepEqual(pool[s], [])
  }
})

check('normalizeCandidates 修复残缺字段而不是丢弃好单品', () => {
  const { pool } = normalizeCandidates({ items: [
    { id: 'u-x', name: '缺字段的裤子', category: 'bottoms', status: 'owned' },
  ] })
  const c = pool.bottom[0]
  assert.equal(c.ownership, 'owned')
  assert.equal(c.family, 'neutral')
  assert.equal(c.formality, 2)
  assert.equal(c.warmth, 2)
  assert.equal(c.mesh, '')
})

// ------------------------------------------------------------------ 冲突与搭配

check('hardConflict 认得出皮鞋配短裤', () => {
  const shoes = item('s-derby', 'shoes', { mesh: 'derby', formality: 3 })
  const shorts = item('b-shorts', 'bottom', { mesh: 'shorts', formality: 1 })
  const reason = hardConflict(shoes, shorts)
  assert.ok(typeof reason === 'string' && reason.includes('短裤'))
  assert.equal(hardConflict(shorts, shoes), reason, '冲突判定应与顺序无关')
})

check('hardConflict 认得出跑鞋配西装外套', () => {
  const runner = item('s-runner', 'shoes', { mesh: 'runner', formality: 1 })
  const blazer = item('o-blazer-n', 'outer', { mesh: 'blazer', formality: 3 })
  assert.ok(typeof hardConflict(runner, blazer) === 'string')
})

check('hardConflict 对干净搭配与同槽位返回 null', () => {
  const sneaker = item('s-white', 'shoes', { mesh: 'sneaker', formality: 1 })
  const jeans = item('b-jeans', 'bottom', { mesh: 'pants-denim', formality: 1 })
  assert.equal(hardConflict(sneaker, jeans), null)
  assert.equal(hardConflict(sneaker, item('s-other', 'shoes', { mesh: 'derby' })), null)
})

check('hardConflict 对退化输入返回 null 而不抛异常', () => {
  for (const a of [null, undefined, 'x', [], {}]) {
    for (const b of [null, 'y', [], {}]) assert.equal(hardConflict(a, b), null)
  }
})

check('pairScore 落在 0..1 且硬冲突为 0', () => {
  const derby = item('s-derby', 'shoes', { mesh: 'derby', formality: 3 })
  const shorts = item('b-shorts', 'bottom', { mesh: 'shorts', formality: 1 })
  assert.equal(pairScore(derby, shorts), 0)

  const a = item('a', 'top', { family: 'dark', formality: 2 })
  const b = item('b', 'bottom', { family: 'dark', formality: 2 })
  const c = item('c', 'bottom', { family: 'light', formality: 3 })
  assert.ok(pairScore(a, b) > pairScore(a, c), '同色系且正式度接近应更搭')
  for (const [x, y] of [[a, b], [a, c], [b, c]]) {
    const s = pairScore(x, y)
    assert.ok(s >= 0 && s <= 1)
    assert.equal(s, pairScore(y, x), '搭配度应对称')
  }
  assert.equal(pairScore(null, a), 0)
})

// ------------------------------------------------------------------ 组合数与覆盖率

check('countCombinations 缺必补槽位时结果为 0 且精确', () => {
  const result = countCombinations([item('t', 'top'), item('b', 'bottom')])
  assert.deepEqual(result, { count: 0, exact: true, conflicts: [] })
  assert.deepEqual(countCombinations([]), { count: 0, exact: true, conflicts: [] })
})

check('countCombinations 与手算一致（1×2×2 = 4）', () => {
  const selected = [
    item('t1', 'top'),
    item('b1', 'bottom'), item('b2', 'bottom'),
    item('s1', 'shoes'), item('s2', 'shoes'),
  ]
  const result = countCombinations(selected)
  assert.equal(result.exact, true)
  assert.equal(result.count, 4)
  assert.deepEqual(result.conflicts, [])
})

check('countCombinations 扣掉硬冲突的组合并说明原因', () => {
  const selected = [
    item('t1', 'top'),
    item('b-shorts', 'bottom', { mesh: 'shorts', formality: 1 }),
    item('s-derby', 'shoes', { mesh: 'derby', formality: 3 }),
    item('s-sneak', 'shoes', { mesh: 'sneaker', formality: 1 }),
  ]
  const result = countCombinations(selected)
  assert.equal(result.count, 1, '皮鞋配短裤那套应被剔除')
  assert.equal(result.exact, true)
  assert.equal(result.conflicts.length, 1)
})

check('countCombinations 组合数过大时退化为下界并标记非精确', () => {
  const selected = []
  for (let i = 0; i < 60; i += 1) selected.push(item(`t${i}`, 'top'))
  for (let i = 0; i < 60; i += 1) selected.push(item(`b${i}`, 'bottom'))
  for (let i = 0; i < 60; i += 1) selected.push(item(`s${i}`, 'shoes'))
  const result = countCombinations(selected)
  assert.equal(result.exact, false)
  assert.equal(result.count, 216000)
  assert.deepEqual(result.conflicts, [])
})

check('computeCoverage 满足「同槽位覆盖率之和 == 组合数」', () => {
  const selected = [
    item('t1', 'top'), item('t2', 'top'),
    item('b1', 'bottom'), item('b2', 'bottom'),
    item('s1', 'shoes'), item('s2', 'shoes'),
    item('a1', 'accs'),
  ]
  const map = computeCoverage(selected)
  assert.equal(map.size, selected.length)
  for (const s of SLOTS) {
    const inSlot = selected.filter((x) => x.slot === s)
    const sum = inSlot.reduce((acc, x) => acc + map.get(x.id).count, 0)
    assert.equal(sum, inSlot.length === 0 ? 0 : 8, `槽位 ${s} 的覆盖率之和应等于组合数`)
  }
  for (const hit of map.values()) assert.ok(hit.ratio > 0 && hit.ratio <= 1)
})

check('computeCoverage 在必补槽位缺失时给出 0 而不是崩', () => {
  const map = computeCoverage([item('t1', 'top'), item('a1', 'accs')])
  assert.equal(map.get('t1').count, 0)
  assert.equal(map.get('t1').ratio, 0)
  assert.equal(computeCoverage(null).size, 0)
})

// ------------------------------------------------------------------ planCapsule

check('planCapsule 返回契约字段齐全', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  assert.equal(plan.version, 1)
  assert.equal(plan.season, 'autumn')
  assert.equal(plan.seasonLabel, '秋季')
  assert.equal(plan.occasion, 'work')
  assert.equal(plan.occasionLabel, '通勤 / 面试')
  assert.equal(plan.target, 16)
  assert.ok(Array.isArray(plan.selected) && Array.isArray(plan.missing))
  assert.ok(Array.isArray(plan.gaps) && Array.isArray(plan.warnings))
  assert.ok(Number.isFinite(plan.combinationCount))
  assert.equal(typeof plan.combinationExact, 'boolean')
  assert.ok(Array.isArray(plan.conflicts))
  assert.equal(plan.gaps.length, SLOTS.length)
})

check('planCapsule 目标件数不超配额、且入选件数受目标约束', () => {
  for (const target of [CAPSULE_MIN, 15, CAPSULE_MAX]) {
    const plan = planCapsule({ season: 'autumn', occasion: 'casual', target, wardrobe: FULL_WARDROBE })
    assert.equal(plan.target, target)
    assert.ok(plan.selected.length <= target, `${target}：入选 ${plan.selected.length} 件不应超过目标`)
    assert.equal(plan.stats.selectedCount, plan.selected.length)
  }
})

check('planCapsule 优先入选 owned 单品', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  const owned = plan.selected.filter((i) => i.ownership === 'owned')
  assert.ok(owned.length >= 6, `应优先选满已有单品，实际 ${owned.length} 件`)
  for (const s of REQUIRED_SLOTS) {
    assert.ok(plan.selected.some((i) => i.slot === s && i.source === 'personal' && i.ownership === 'owned'), `槽位 ${s} 应有已有单品入选`)
  }
})

check('planCapsule 把 wishlist 只当补齐候选，不混进已入选', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'casual', target: 16, wardrobe: FULL_WARDROBE })
  assert.ok(!plan.selected.some((i) => i.ownership === 'wishlist'), 'wishlist 不应出现在已入选里')
  const wish = plan.missing.find((m) => m.id === 'u-wish-1')
  if (wish) {
    assert.equal(wish.ownership, 'wishlist')
    assert.ok(wish.reason.includes('愿望清单'))
  }
})

check('planCapsule 空衣橱时只给系统建议并明确告警', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'casual', target: 16, wardrobe: { items: [] } })
  assert.equal(plan.selected.length, 0)
  assert.ok(plan.missing.length > 0)
  assert.ok(plan.missing.every((m) => m.source === 'system'))
  assert.ok(plan.warnings.some((w) => w.includes('还没有')))
  assert.equal(plan.combinationCount, 0)
})

check('planCapsule 无 wardrobe 入参时同样安全降级', () => {
  const plan = planCapsule({})
  assert.equal(plan.season, 'autumn')
  assert.equal(plan.occasion, 'casual')
  assert.equal(plan.target, DEFAULT_TARGET)
  assert.ok(Array.isArray(plan.selected))
  assert.ok(plan.missing.length > 0)
})

check('planCapsule 归一化非法季节/场景并告警', () => {
  const plan = planCapsule({ season: 'rainy', occasion: 'gala', target: 16, wardrobe: FULL_WARDROBE })
  assert.equal(plan.season, 'autumn')
  assert.equal(plan.occasion, 'casual')
  assert.equal(plan.warnings.filter((w) => w.includes('非法')).length, 2)
})

check('planCapsule 夹取越界目标件数并告警', () => {
  const low = planCapsule({ target: 1, wardrobe: FULL_WARDROBE })
  assert.equal(low.target, CAPSULE_MIN)
  const high = planCapsule({ target: 999, wardrobe: FULL_WARDROBE })
  assert.equal(high.target, CAPSULE_MAX)
  assert.ok(high.warnings.some((w) => w.includes('目标件数')))
})

check('planCapsule 冬季排除保暖度不足的外套并告警', () => {
  const plan = planCapsule({ season: 'winter', occasion: 'casual', target: 16, wardrobe: FULL_WARDROBE })
  const thin = plan.selected.find((i) => i.id === 'u-outer-2')
  assert.equal(thin, undefined, '保暖度 2 的夹克不应出现在冬季胶囊里')
  assert.ok(plan.warnings.some((w) => w.includes('保暖度')))
})

check('planCapsule 每件入选单品都带覆盖率与理由', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  for (const i of plan.selected) {
    assert.ok(i.coverageRatio >= 0 && i.coverageRatio <= 1, `${i.id} 覆盖率越界`)
    assert.equal(typeof i.reason, 'string')
    assert.ok(i.reason.length > 0)
    assert.ok(SLOTS.includes(i.slot))
  }
})

check('planCapsule 的覆盖率与组合数自洽', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'casual', target: 16, wardrobe: FULL_WARDROBE })
  if (!plan.combinationExact || plan.combinationCount === 0) return
  for (const s of SLOTS) {
    const inSlot = plan.selected.filter((i) => i.slot === s)
    const sum = inSlot.reduce((acc, i) => acc + Math.round(i.coverageRatio * plan.combinationCount), 0)
    const expected = inSlot.length === 0 ? 0 : plan.combinationCount
    assert.ok(Math.abs(sum - expected) <= inSlot.length, `槽位 ${s} 覆盖率与组合数不自洽`)
  }
})

check('planCapsule 的 missing 按优先级降序且 rank 连续', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  plan.missing.forEach((m, i) => assert.equal(m.rank, i + 1))
  for (let i = 1; i < plan.missing.length; i += 1) {
    assert.ok(plan.missing[i - 1].priority >= plan.missing[i].priority, 'missing 应按 priority 降序')
  }
  for (const m of plan.missing) {
    assert.ok(SLOTS.includes(m.slot))
    assert.ok(typeof m.reason === 'string' && m.reason.length > 0)
    assert.equal(typeof m.priority, 'number')
  }
})

check('planCapsule 的 gaps 与配额一致且 deficit 非负', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 18, wardrobe: FULL_WARDROBE })
  const quota = quotaFor(18, 'autumn')
  for (const gap of plan.gaps) {
    assert.equal(gap.target, quota[gap.slot])
    assert.equal(gap.deficit, Math.max(0, gap.target - gap.have))
    assert.equal(typeof gap.required, 'boolean')
    assert.ok(gap.have >= 0)
  }
  assert.ok(plan.gaps.filter((g) => REQUIRED_SLOTS.includes(g.slot) || g.slot === 'outer').every((g) => typeof g.required === 'boolean'))
})

check('planCapsule 的 stats 自洽', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  assert.equal(plan.stats.selectedCount, plan.selected.length)
  assert.equal(plan.stats.missingCount, plan.missing.length)
  assert.equal(plan.stats.combinationCount, plan.combinationCount)
  assert.equal(plan.stats.exact, plan.combinationExact)
  if (plan.selected.length > 0) {
    const avg = plan.selected.reduce((s, i) => s + i.coverageRatio, 0) / plan.selected.length
    assert.ok(Math.abs(plan.stats.averageCoverage - avg) < 0.002)
  }
  for (const s of plan.stats.missingRequiredSlots) assert.ok(REQUIRED_SLOTS.includes(s))
})

check('planCapsule 是确定性的，且不修改输入衣橱', () => {
  const snapshot = JSON.stringify(FULL_WARDROBE)
  const a = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  const b = planCapsule({ season: 'autumn', occasion: 'work', target: 16, wardrobe: FULL_WARDROBE })
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(FULL_WARDROBE), snapshot)
})

check('planCapsule 对被污染的衣橱逐条丢弃并告警', () => {
  const plan = planCapsule({ season: 'autumn', occasion: 'casual', target: 16, wardrobe: { items: [
    ...FULL_WARDROBE.items,
    personal('u-dirty', '标记不要的', 'tops', 'disliked'),
    { id: 'u-broken', name: '缺分类' },
    null,
  ] } })
  assert.ok(plan.warnings.some((w) => w.includes('数据不完整') || w.includes('不要')))
  assert.ok(!plan.selected.some((i) => i.id === 'u-dirty'))
})

check('planCapsule 汇总告警不超过可读数量且都是字符串', () => {
  const plan = planCapsule({ season: 'rainy', occasion: 'gala', target: 999, wardrobe: { items: [null, 'x'] } })
  assert.ok(Array.isArray(plan.warnings))
  for (const w of plan.warnings) assert.equal(typeof w, 'string')
  assert.ok(plan.warnings.length >= 2)
})

check('planCapsule 对全部退化输入不抛异常', () => {
  for (const input of [undefined, null, 'x', [], {}, { wardrobe: 'bad' }, { target: -5, season: 42 }]) {
    const plan = planCapsule(input)
    assert.equal(plan.version, 1)
    assert.ok(Array.isArray(plan.selected))
    assert.ok(Array.isArray(plan.gaps))
    assert.ok(Array.isArray(plan.missing))
  }
})

console.log('')
if (failed > 0) {
  console.error(`test-capsule: ${failed} 项失败`)
  process.exit(1)
}
console.log('test-capsule: 全部通过')

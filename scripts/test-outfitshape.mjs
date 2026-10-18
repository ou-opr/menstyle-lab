// 造型形状 + 引用清理 的断言。
//
// 这一层是「同一份数据被多处解读」的收敛点：
//   - outfitItemIds 曾有两份实现（calendar 不排除 o-none、preferences 排除），
//     导致「不穿外套」被当成真实单品混进月度统计。这里钉死唯一口径。
//   - 删掉个人单品后，日历与收藏里的 id 会变成孤儿（UI 会显示原始 UUID）。
//     pruneCalendarRef / pruneLooksRef 负责清掉它们。
import assert from 'node:assert/strict'
import {
  NO_OUTER,
  SLOTS,
  isNoOuter,
  normalizeOutfitShape,
  outfitItemIds,
  resolveItem,
} from '../src/data/outfitShape.js'
import {
  outfitReferences,
  pruneCalendarRef,
  pruneLooksRef,
  stripIdFromOutfit,
} from '../src/data/references.js'

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log('  ok ' + label)
}

const FULL = { top: 't-white', outer: 'o-blazer-n', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch', 'a-cap'] }
const NO_OUTER_OUTFIT = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] }

console.log('outfitShape:')

ok('NO_OUTER 就是 o-none，isNoOuter 认空串/undefined/o-none 三种写法', () => {
  assert.equal(NO_OUTER, 'o-none')
  assert.equal(isNoOuter('o-none'), true)
  assert.equal(isNoOuter(null), true)
  assert.equal(isNoOuter(undefined), true)
  assert.equal(isNoOuter(''), true)
  assert.equal(isNoOuter('o-blazer-n'), false)
})

ok('outfitItemIds 含全部五个槽位、配饰展开、去重', () => {
  assert.deepEqual(outfitItemIds(FULL), ['t-white', 'o-blazer-n', 'b-jeans-d', 's-white', 'a-watch', 'a-cap'])
  assert.deepEqual(
    outfitItemIds({ ...FULL, accs: ['a-watch', 'a-watch', null, 42] }),
    ['t-white', 'o-blazer-n', 'b-jeans-d', 's-white', 'a-watch'],
  )
})

ok('outfitItemIds 排除 o-none（「不穿外套」不是一件真实单品）', () => {
  const ids = outfitItemIds(NO_OUTER_OUTFIT)
  assert.equal(ids.includes('o-none'), false)
  assert.deepEqual(ids, ['t-white', 'b-jeans-d', 's-white', 'a-watch'])
})

ok('outfitItemIds 对 null / 非对象 / 空对象返回空数组，不抛', () => {
  assert.deepEqual(outfitItemIds(null), [])
  assert.deepEqual(outfitItemIds(undefined), [])
  assert.deepEqual(outfitItemIds('nope'), [])
  assert.deepEqual(outfitItemIds([]), [])
  assert.deepEqual(outfitItemIds({}), [])
})

ok('outfitItemIds 跳过空槽位但不跳过 o-none 之外的外套', () => {
  assert.deepEqual(outfitItemIds({ top: null, outer: 'o-none', bottom: '', shoes: 's-white' }), ['s-white'])
  assert.deepEqual(outfitItemIds({ outer: 'o-coat-g' }), ['o-coat-g'])
})

ok('SLOTS 顺序稳定且与实现一致', () => {
  assert.deepEqual(SLOTS, ['top', 'outer', 'bottom', 'shoes', 'accs'])
})

ok('resolveItem 认得系统单品、个人单品、未知 id', () => {
  const system = resolveItem('t-white')
  assert.equal(system.id, 't-white')
  assert.equal(system.personal, false)
  assert.equal(typeof system.item.hex, 'string')

  const personal = resolveItem('u-abc')
  assert.deepEqual(personal, { id: 'u-abc', name: 'u-abc', personal: true })

  assert.equal(resolveItem('nope-1'), null)
  assert.equal(resolveItem(''), null)
  assert.equal(resolveItem(null), null)
  assert.equal(resolveItem(42), null)
})

ok('normalizeOutfitShape 补齐五槽、accs 恒数组、outer 缺省 o-none', () => {
  assert.deepEqual(normalizeOutfitShape(null), { top: null, outer: 'o-none', bottom: null, shoes: null, accs: [] })
  assert.deepEqual(
    normalizeOutfitShape({ top: 't-white', accs: ['a-watch', '', 7] }),
    { top: 't-white', outer: 'o-none', bottom: null, shoes: null, accs: ['a-watch'] },
  )
})

ok('normalizeOutfitShape 不修改入参', () => {
  const input = { top: 't-white', accs: ['a-watch'] }
  const snapshot = JSON.stringify(input)
  normalizeOutfitShape(input)
  assert.equal(JSON.stringify(input), snapshot)
})

console.log('references:')

ok('outfitReferences 认槽位与配饰', () => {
  assert.equal(outfitReferences(FULL, 't-white'), true)
  assert.equal(outfitReferences(FULL, 'a-cap'), true)
  assert.equal(outfitReferences(FULL, 'a-cap-2'), false)
  assert.equal(outfitReferences(null, 't-white'), false)
  assert.equal(outfitReferences(FULL, ''), false)
})

ok('stripIdFromOutfit 清槽位/踢配饰，且不改入参', () => {
  const snapshot = JSON.stringify(FULL)
  const noTop = stripIdFromOutfit(FULL, 't-white')
  assert.equal(noTop.top, null)
  assert.equal(JSON.stringify(FULL), snapshot)

  const noOuter = stripIdFromOutfit(FULL, 'o-blazer-n')
  assert.equal(noOuter.outer, 'o-none', '外套被删后应回落到 o-none 而不是 null')

  const noAcc = stripIdFromOutfit(FULL, 'a-cap')
  assert.deepEqual(noAcc.accs, ['a-watch'])

  // 没有引用时原样返回（引用相等，调用方据此判断有无变化）
  assert.equal(stripIdFromOutfit(FULL, 'u-nope'), FULL)
})

ok('pruneCalendarRef 只改有引用的条目，并报告改动数', () => {
  const state = {
    version: 1,
    entries: [
      { id: 'e1', date: '2026-10-01', outfit: { top: 'u-1', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] } },
      { id: 'e2', date: '2026-10-02', outfit: { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] } },
      { id: 'e3', date: '2026-10-03', outfit: { top: 'u-1', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] } },
    ],
  }
  const pruned = pruneCalendarRef(state, 'u-1')
  assert.equal(pruned.changed, 2)
  assert.equal(pruned.state.entries[0].outfit.top, null)
  assert.equal(pruned.state.entries[1].outfit.top, 't-white')
  assert.equal(pruned.state.entries[2].outfit.top, null)
  // 原 state 不变
  assert.equal(state.entries[0].outfit.top, 'u-1')
})

ok('pruneCalendarRef 无引用时原样返回且 changed=0', () => {
  const state = { version: 1, entries: [{ id: 'e1', date: '2026-10-01', outfit: NO_OUTER_OUTFIT }] }
  const pruned = pruneCalendarRef(state, 'u-nope')
  assert.equal(pruned.changed, 0)
  assert.equal(pruned.state, state)
})

ok('pruneCalendarRef 对坏输入不抛', () => {
  assert.deepEqual(pruneCalendarRef(null, 'u-1'), { state: null, changed: 0 })
  assert.deepEqual(pruneCalendarRef({}, 'u-1'), { state: {}, changed: 0 })
  assert.deepEqual(pruneCalendarRef({ entries: 'nope' }, 'u-1'), { state: { entries: 'nope' }, changed: 0 })
})

ok('pruneLooksRef 清掉收藏里的失效引用', () => {
  const looks = [
    { id: 'look-1', name: '造型 1', ts: 1, outfit: { top: 'u-9', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] } },
    { id: 'look-2', name: '造型 2', ts: 2, outfit: { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [] } },
  ]
  const pruned = pruneLooksRef(looks, 'u-9')
  assert.equal(pruned.changed, 1)
  assert.equal(pruned.looks[0].outfit.top, null)
  assert.equal(pruned.looks[0].name, '造型 1', '其它字段应保留')
  assert.equal(pruned.looks[1].outfit.top, 't-white')
  assert.equal(looks[0].outfit.top, 'u-9', '不修改入参')
})

ok('pruneLooksRef 对非数组返回原值', () => {
  assert.deepEqual(pruneLooksRef(null, 'u-1'), { looks: null, changed: 0 })
  assert.deepEqual(pruneLooksRef([], 'u-1'), { looks: [], changed: 0 })
})

ok('清理后 outfitItemIds 不再包含被删 id', () => {
  const state = { version: 1, entries: [{ id: 'e1', date: '2026-10-01', outfit: { top: 'u-1', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['u-1'] } }] }
  const pruned = pruneCalendarRef(state, 'u-1')
  assert.equal(outfitItemIds(pruned.state.entries[0].outfit).includes('u-1'), false)
})

console.log(`\noutfitShape + references: 全部通过（${passed} 项）`)

// 收藏夹（造型夹）纯函数层的断言。
//
// 这一层原本藏在 ShareBar 组件里，是「导入后被覆盖」缺陷的温床：
// 组件私有 state 读不到 localStorage 的外部变化。抽成纯函数后，
// 形状校验、编号、增删都能在 Node 里钉死。
import assert from 'node:assert/strict'
import {
  LOOKS_KEY,
  MAX_LOOKS,
  appendLook,
  cloneOutfit,
  formatLookTs,
  isOutfit,
  isValidLookList,
  nextLookNumber,
  removeLook,
  sameSlots,
} from '../src/data/looks.js'

let passed = 0
function ok(label, fn) {
  fn()
  passed += 1
  console.log('  ok ' + label)
}

const A = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] }
const B = { top: 't-hoodie-b', outer: 'o-bomber-b', bottom: 'b-cargo-o', shoes: 's-runner', accs: [] }

console.log('looks:')

ok('LOOKS_KEY 与 backup.js 的 STORAGE_KEYS.looks 一致', () => {
  assert.equal(LOOKS_KEY, 'stylelab:looks')
  assert.equal(MAX_LOOKS, 30)
})

ok('isOutfit 只接受五槽齐全且类型正确', () => {
  assert.equal(isOutfit(A), true)
  assert.equal(isOutfit({ ...A, accs: [] }), true)
  assert.equal(isOutfit(null), false)
  assert.equal(isOutfit({}), false)
  assert.equal(isOutfit({ ...A, top: 1 }), false)
  assert.equal(isOutfit({ ...A, accs: 'a-watch' }), false)
  assert.equal(isOutfit({ ...A, accs: [1] }), false)
  assert.equal(isOutfit({ ...A, outer: undefined }), false)
})

ok('sameSlots 配饰按集合比较，顺序不同仍算同一套', () => {
  assert.equal(sameSlots(A, { ...A }), true)
  assert.equal(sameSlots({ ...A, accs: ['a-watch', 'a-cap'] }, { ...A, accs: ['a-cap', 'a-watch'] }), true)
  assert.equal(sameSlots(A, B), false)
  assert.equal(sameSlots(A, { ...A, accs: ['a-watch', 'a-cap'] }), false)
  assert.equal(sameSlots(null, A), false)
})

ok('cloneOutfit 复制配饰数组（避免共享引用）', () => {
  const copy = cloneOutfit(A)
  assert.deepEqual(copy, A)
  assert.notEqual(copy.accs, A.accs)
  copy.accs.push('a-cap')
  assert.equal(A.accs.length, 1, '改副本不应影响原件')
})

ok('cloneOutfit 对缺 accs 的输入补空数组', () => {
  assert.deepEqual(cloneOutfit({ top: 't-white' }).accs, [])
  assert.deepEqual(cloneOutfit(null).accs, [])
})

ok('isValidLookList 拒绝非数组与坏元素', () => {
  assert.equal(isValidLookList([]), true)
  assert.equal(isValidLookList([{ id: 'a', outfit: A }]), true)
  assert.equal(isValidLookList(null), false)
  assert.equal(isValidLookList('nope'), false)
  assert.equal(isValidLookList([null]), false)
  assert.equal(isValidLookList([{ id: 'a' }]), false, '缺 outfit 应拒绝')
  assert.equal(isValidLookList([{ id: 'a', outfit: { top: 't-white' } }]), false, 'outfit 不完整应拒绝')
})

ok('nextLookNumber 按已有最大编号递增，删中间不重名', () => {
  assert.equal(nextLookNumber([]), 1)
  assert.equal(nextLookNumber([{ name: '造型 1' }, { name: '造型 2' }]), 3)
  // 删掉 1 之后剩 造型 2、造型 3 → 下一个是 4，不会复用已删的 1 或撞上 3
  assert.equal(nextLookNumber([{ name: '造型 2' }, { name: '造型 3' }]), 4)
  // 名字不带编号时退回列表长度 + 1
  assert.equal(nextLookNumber([{ name: '自定义' }]), 2)
  assert.equal(nextLookNumber([{ name: '自定义' }, { name: '造型 7' }]), 8)
})

ok('appendLook 插到头部、不超上限、带 id/name/ts', () => {
  const list = appendLook([], A, 1000, () => 0.5)
  assert.equal(list.length, 1)
  assert.equal(list[0].name, '造型 1')
  assert.equal(list[0].ts, 1000)
  assert.equal(typeof list[0].id, 'string')
  assert.ok(list[0].id.startsWith('look-1000-'))
  assert.deepEqual(list[0].outfit, A)

  const many = Array.from({ length: MAX_LOOKS }, (_, i) => ({ id: `old-${i}`, name: `造型 ${i + 1}`, ts: i, outfit: A }))
  const next = appendLook(many, B, 2000, () => 0.1)
  assert.equal(next.length, MAX_LOOKS, '不应超过上限')
  assert.deepEqual(next[0].outfit, B, '新收藏应在头部')
})

ok('appendLook 不修改入参列表', () => {
  const list = [{ id: 'x', name: '造型 1', ts: 1, outfit: A }]
  const snapshot = JSON.stringify(list)
  appendLook(list, B, 2, () => 0.5)
  assert.equal(JSON.stringify(list), snapshot)
})

ok('appendLook 对非数组输入当作空列表', () => {
  assert.equal(appendLook(null, A, 1, () => 0.5).length, 1)
  assert.equal(appendLook('nope', A, 1, () => 0.5).length, 1)
})

ok('appendLook 的两个参数默认值可用（不传 now/random 也不崩）', () => {
  const list = appendLook([], A)
  assert.equal(list.length, 1)
  assert.equal(typeof list[0].ts, 'number')
})

ok('removeLook 按 id 删除，且不修改入参', () => {
  const list = [
    { id: 'a', name: '造型 1', ts: 1, outfit: A },
    { id: 'b', name: '造型 2', ts: 2, outfit: B },
  ]
  const next = removeLook(list, 'a')
  assert.deepEqual(next.map((l) => l.id), ['b'])
  assert.equal(list.length, 2, '不修改入参')
})

ok('removeLook 对不存在 id / 非数组输入安全', () => {
  assert.deepEqual(removeLook([], 'nope'), [])
  assert.deepEqual(removeLook(null, 'a'), [])
  assert.deepEqual(removeLook([null, { id: 'a' }], 'a'), [null])
})

ok('formatLookTs 输出本地时间格式，非法值返回空串', () => {
  const ts = new Date(2026, 9, 17, 9, 5).getTime() // 本地时间 2026-10-17 09:05
  assert.equal(formatLookTs(ts), '2026-10-17 09:05')
  assert.equal(formatLookTs(null), '')
  assert.equal(formatLookTs('nope'), '')
  assert.equal(formatLookTs(NaN), '')
  assert.equal(formatLookTs(Infinity), '')
})

console.log(`\nlooks: 全部通过（${passed} 项）`)

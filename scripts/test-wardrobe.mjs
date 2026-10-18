// 个人衣橱 v1 的纯函数 + 照片仓库断言：node scripts/test-wardrobe.mjs
// 覆盖验收要求：增删改查、owned/wishlist/disliked、照片压缩/保存/预览/删除、
// 刷新恢复（写读往返）、损坏数据降级、筛选统计。
// 全程不依赖浏览器：localStorage 与照片后端都用内存假对象注入。
import assert from 'node:assert/strict'
import {
  ITEM_CATEGORIES,
  ITEM_FAMILIES,
  ITEM_FITS,
  ITEM_STATUSES,
  WARDROBE_KEY,
  WARDROBE_VERSION,
  addItem,
  attachPhoto,
  categoryOfSlot,
  clearWardrobe,
  createItemId,
  decodeWardrobe,
  emptyWardrobe,
  encodeWardrobe,
  findPersonalItem,
  isPersonalItemId,
  isValidWardrobe,
  makePersonalItem,
  normalizeHex,
  normalizeWardrobe,
  queryItems,
  readWardrobe,
  recordWear,
  recordWearMany,
  removeItem,
  setItemStatus,
  slotOfCategory,
  summarizeWardrobe,
  updateItem,
  validatePersonalItem,
  writeWardrobe,
} from '../src/data/wardrobe.js'
import {
  TARGET_MAX_BYTES,
  clearImages,
  compressBlob,
  countImages,
  createMemoryBackend as createImageMemoryBackend,
  dataUrlToBlob,
  deleteImage,
  exportImages,
  fitSize,
  getImageBlob,
  getImageDataUrl,
  importImages,
  pickOutputType,
  saveCompressedImage,
} from '../src/data/imageStore.js'
import { sanitizePersonalItem } from '../src/data/backup.js'

let failed = 0
let passed = 0
const ok = (m) => { passed++; console.log('✓ ' + m) }
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}
// 异步断言的 Promise 全部收集起来，末尾统一 await。
// 修复前这里是「fire-and-forget」：acheck 内部的 await 让出后，脚本已经跑到
// 末尾的 process.exit()，进程直接退出——17 条照片仓库断言（压缩/保存/预览/删除/
// 导出/导入）从未真正执行，而 npm test 照样全绿。
const pending = []
const acheck = (label, fn) => {
  const task = (async () => {
    try { await fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
  })()
  pending.push(task)
  return task
}

/* 内存假 localStorage（与 scripts/test-backup.mjs 同形状） */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _dump: () => Object.fromEntries(map),
    _map: map,
  }
}

/** 抛错的 storage，用来验证降级路径。 */
function throwingStorage() {
  return {
    getItem() { throw new Error('SecurityError') },
    setItem() { throw new Error('QuotaExceededError') },
    removeItem() { throw new Error('SecurityError') },
  }
}

const sample = (over = {}) => ({
  name: '藏青亚麻衬衫', category: 'tops', status: 'owned', hex: '#2B3A55',
  family: 'cool', formality: 2, warmth: 2, fit: 'regular', mesh: 'shirt',
  notes: '夏天单穿', tags: ['通勤', '夏季'], ...over,
})

// ---------------------------------------------------------------- 契约形状

check('本模块产出的单品字段集与 backup.js 的 sanitizePersonalItem 完全一致（跨模块契约）', () => {
  const { item } = makePersonalItem(sample())
  const { item: fromBackup, reason } = sanitizePersonalItem(item)
  assert.equal(reason, null, `backup.js 拒绝了我们产出的单品：${reason}`)
  assert.deepEqual(Object.keys(fromBackup).sort(), Object.keys(item).sort())
  assert.deepEqual(fromBackup, item, 'backup.js 往返后字段值必须一字不差')
})

check('id 形状为 u-<uuid>；createItemId 每次不同', () => {
  const a = createItemId()
  const b = createItemId()
  assert.ok(isPersonalItemId(a), `生成的 id 不合法：${a}`)
  assert.ok(isPersonalItemId(b))
  assert.notEqual(a, b)
  assert.ok(!isPersonalItemId('t-white'), '系统 id 不能被当成个人单品')
  assert.ok(!isPersonalItemId('u-not-a-uuid'))
})

check('枚举常量与契约一致', () => {
  assert.deepEqual(ITEM_CATEGORIES, ['tops', 'outers', 'bottoms', 'shoes', 'accs'])
  assert.deepEqual(ITEM_STATUSES, ['owned', 'wishlist', 'disliked'])
  assert.deepEqual(ITEM_FAMILIES, ['light', 'dark', 'neutral', 'warm', 'cool'])
  assert.deepEqual(ITEM_FITS, ['slim', 'regular', 'relaxed'])
  assert.equal(WARDROBE_KEY, 'stylelab:wardrobe:v1')
  assert.equal(WARDROBE_VERSION, 1)
})

check('槽位 ↔ 分类互转是双向的', () => {
  for (const slot of ['top', 'outer', 'bottom', 'shoes', 'accs']) {
    assert.equal(slotOfCategory(categoryOfSlot(slot)), slot)
  }
  assert.equal(slotOfCategory('nope'), null)
  assert.equal(categoryOfSlot('nope'), null)
})

check('合法单品通过 validatePersonalItem（零错误）', () => {
  const { item } = makePersonalItem(sample())
  assert.deepEqual(validatePersonalItem(item), [])
  assert.equal(isValidWardrobe({ version: 1, items: [item] }), true)
})

// ---------------------------------------------------------------- 防御性规范化

check('缺 name / 非法 category 时拒绝创建并给出中文原因', () => {
  const a = makePersonalItem({ category: 'tops' })
  assert.equal(a.ok, false)
  assert.equal(a.item, null)
  assert.match(a.errors.join(), /名称不能为空/)
  const b = makePersonalItem({ name: 'x', category: 'hats' })
  assert.equal(b.ok, false)
  assert.match(b.errors.join(), /分类必须是/)
})

check('非法字段被自动修复且写进 warnings（不拒绝保存）', () => {
  const r = makePersonalItem(sample({ hex: 'not-a-color', family: 'rainbow', formality: 9, warmth: 0, fit: 'boxy', id: 'weird-id' }))
  assert.equal(r.ok, true)
  assert.equal(r.item.hex, '#9a9da3')
  assert.equal(r.item.family, 'neutral')
  assert.equal(r.item.formality, 3)
  assert.equal(r.item.warmth, 1)
  assert.equal(r.item.fit, 'regular')
  assert.ok(isPersonalItemId(r.item.id))
  assert.ok(r.warnings.length >= 5, `warnings 太少：${r.warnings.length}`)
})

check('normalizeHex 覆盖 #rgb / #rrggbb / #rrggbbaa（丢 alpha）与非字符串', () => {
  assert.equal(normalizeHex('#2B3A55'), '#2b3a55')
  assert.equal(normalizeHex('#abc'), '#aabbcc')
  assert.equal(normalizeHex('#11223344'), '#112233')
  assert.equal(normalizeHex('red'), '#9a9da3')
  assert.equal(normalizeHex(null), '#9a9da3')
  assert.equal(normalizeHex('#zzzzzz'), '#9a9da3')
})

check('hex 六位校验真的能拦住坏值（validatePersonalItem 会报错）', () => {
  const { item } = makePersonalItem(sample())
  assert.deepEqual(validatePersonalItem(item), [])
  const bad1 = validatePersonalItem({ ...item, hex: '#12345' })
  const bad2 = validatePersonalItem({ ...item, hex: 'rgb(1,2,3)' })
  assert.ok(bad1.some((e) => e.includes('hex')), bad1.join())
  assert.ok(bad2.some((e) => e.includes('hex')), bad2.join())
})

check('normalizeWardrobe 丢弃坏件、保留好件、同 id 去重', () => {
  const good = makePersonalItem(sample()).item
  const other = makePersonalItem(sample({ name: '黑色跑鞋', category: 'shoes' })).item
  const { value, warnings } = normalizeWardrobe({
    version: 1,
    items: [{ name: '缺分类' }, good, other, { ...good, name: good.name }],
  })
  assert.equal(value.items.length, 2, '3 件合法输入里有 1 件重复 id，应去重为 2')
  assert.ok(warnings.some((w) => w.includes('丢弃')), warnings.join())
  assert.ok(warnings.some((w) => w.includes('重复')), warnings.join())
})

check('normalizeWardrobe 对 undefined / null / 字符串 / 数组等异常输入都返回空衣橱', () => {
  for (const input of [undefined, null, 'abc', 42, [], true]) {
    const { value } = normalizeWardrobe(input)
    assert.deepEqual(value, emptyWardrobe(), `输入 ${JSON.stringify(input)} 未降级为空衣橱`)
  }
})

// ---------------------------------------------------------------- 增删改查

check('addItem 增加一件并返回新状态；原状态不被修改（纯函数）', () => {
  const before = emptyWardrobe()
  const r = addItem(before, sample())
  assert.equal(r.item.name, '藏青亚麻衬衫')
  assert.equal(r.state.items.length, 1)
  assert.equal(before.items.length, 0, 'addItem 不应就地修改入参')
  assert.equal(findPersonalItem(r.state, r.item.id).name, '藏青亚麻衬衫')
})

check('addItem 失败时状态不变且返回错误', () => {
  const before = addItem(emptyWardrobe(), sample()).state
  const r = addItem(before, { name: '', category: 'tops' })
  assert.equal(r.item, null)
  assert.equal(r.state.items.length, 1)
})

check('updateItem 局部更新：只改传入字段，id/createdAt 不变', () => {
  const a = addItem(emptyWardrobe(), sample())
  const r = updateItem(a.state, a.item.id, { name: '藏青亚麻衬衫（改）', formality: 3 })
  assert.equal(r.item.name, '藏青亚麻衬衫（改）')
  assert.equal(r.item.formality, 3)
  assert.equal(r.item.id, a.item.id)
  assert.equal(r.item.createdAt, a.item.createdAt)
  assert.equal(r.item.hex, a.item.hex, '未传入的字段必须保留')
  assert.ok(r.item.updatedAt >= a.item.updatedAt)
})

check('updateItem 找不到 id 时返回错误，不抛异常', () => {
  const r = updateItem(emptyWardrobe(), 'u-00000000-0000-4000-8000-000000000000', { name: 'x' })
  assert.equal(r.item, null)
  assert.match(r.errors.join(), /找不到单品/)
})

check('updateItem 传入非法值会被规范化而不是写进脏数据', () => {
  const a = addItem(emptyWardrobe(), sample())
  const r = updateItem(a.state, a.item.id, { hex: 'nope', formality: 99 })
  assert.equal(r.item.hex, '#9a9da3')
  assert.equal(r.item.formality, 3)
  assert.ok(validatePersonalItem(r.item).length === 0)
})

check('removeItem 删除并返回被删对象；删不存在的 id 不报错', () => {
  const a = addItem(emptyWardrobe(), sample())
  const r = removeItem(a.state, a.item.id)
  assert.equal(r.removed.id, a.item.id)
  assert.equal(r.state.items.length, 0)
  const miss = removeItem(a.state, 'u-00000000-0000-4000-8000-000000000000')
  assert.equal(miss.removed, null)
  assert.equal(miss.state.items.length, 1)
})

check('create → update → remove 全链路后衣橱回到空', () => {
  let state = emptyWardrobe()
  const created = addItem(state, sample()); state = created.state
  state = updateItem(state, created.item.id, { notes: '换季收起来' }).state
  state = removeItem(state, created.item.id).state
  assert.deepEqual(state, emptyWardrobe())
})

// ---------------------------------------------------------------- 状态与穿着

check('owned / wishlist / disliked 三种状态可互相切换', () => {
  const a = addItem(emptyWardrobe(), sample({ status: 'owned' }))
  let state = a.state
  for (const status of ['wishlist', 'disliked', 'owned']) {
    const r = setItemStatus(state, a.item.id, status)
    assert.equal(r.item.status, status)
    state = r.state
    assert.deepEqual(validatePersonalItem(r.item), [])
  }
})

check('setItemStatus 拒绝非法状态且不改动数据', () => {
  const a = addItem(emptyWardrobe(), sample())
  const r = setItemStatus(a.state, a.item.id, 'favorite')
  assert.equal(r.item, null)
  assert.match(r.errors.join(), /状态非法/)
  assert.equal(r.state.items[0].status, 'owned')
})

check('recordWear 累加 wearCount、写入 lastWornAt，并把想买升级为已有', () => {
  const a = addItem(emptyWardrobe(), sample({ status: 'wishlist' }))
  const at = new Date('2026-10-01T08:00:00.000Z')
  const first = recordWear(a.state, a.item.id, at)
  assert.equal(first.item.wearCount, 1)
  assert.equal(first.item.lastWornAt, at.toISOString())
  assert.equal(first.item.status, 'owned', '穿过一次即视为已有')
  const second = recordWear(first.state, a.item.id, new Date('2026-10-02T08:00:00.000Z'))
  assert.equal(second.item.wearCount, 2)
  assert.equal(second.item.lastWornAt, '2026-10-02T08:00:00.000Z')
})

check('recordWear 找不到 id 时返回错误而不是抛异常', () => {
  const r = recordWear(emptyWardrobe(), 'u-00000000-0000-4000-8000-000000000000')
  assert.equal(r.item, null)
  assert.match(r.errors.join(), /找不到单品/)
})

// 回归：一套造型里有 2 件个人单品时，批量记穿着必须两件都 +1。
// 缺陷原状：调用方在 for 循环里调 recordWear(state, id)，每次都从同一份旧 state 出发，
// 后一次覆盖前一次（实测结果是 [0, 1]）。修法是 recordWearMany 在内部串接 state。
check('recordWearMany 给每件单品都 +1（不是只加最后一件）', () => {
  const a = addItem(emptyWardrobe(), sample())
  const b = addItem(a.state, sample({ name: '另一件' }))
  assert.equal(b.state.items.length, 2, '前置：应有两件单品')

  const result = recordWearMany(b.state, [a.item.id, b.item.id])
  assert.equal(result.items.length, 2)
  const counts = result.state.items.map((i) => i.wearCount)
  assert.deepEqual(counts, [1, 1], `两件都应为 1，实际 ${JSON.stringify(counts)}`)
})

check('recordWearMany 与逐件串接的结果完全一致', () => {
  const a = addItem(emptyWardrobe(), sample())
  const b = addItem(a.state, sample({ name: '另一件' }))
  const ids = [a.item.id, b.item.id]
  const at = new Date('2026-10-05T08:00:00.000Z')

  const bulk = recordWearMany(b.state, ids, at)
  let sequential = b.state
  for (const id of ids) sequential = recordWear(sequential, id, at).state

  assert.deepEqual(
    bulk.state.items.map((i) => [i.wearCount, i.lastWornAt]),
    sequential.items.map((i) => [i.wearCount, i.lastWornAt]),
  )
})

check('recordWearMany 去重重复 id、跳过非字符串、缺 id 记错误但不中断', () => {
  const a = addItem(emptyWardrobe(), sample())
  const result = recordWearMany(a.state, [a.item.id, a.item.id, null, 42, ''])
  assert.equal(result.items.length, 1, '重复 id 只算一次')
  assert.equal(result.state.items[0].wearCount, 1)

  const missing = recordWearMany(a.state, ['u-nonexistent'])
  assert.equal(missing.items.length, 0)
  assert.match(missing.errors.join(), /找不到单品/)
  assert.equal(missing.state.items[0].wearCount, 0, '找不到的单品不应影响其它数据')
})

check('recordWearMany 对空数组 / 非数组输入返回原 state', () => {
  const a = addItem(emptyWardrobe(), sample())
  const empty = recordWearMany(a.state, [])
  assert.equal(empty.items.length, 0)
  assert.deepEqual(empty.state, a.state)

  const bad = recordWearMany(a.state, null)
  assert.equal(bad.items.length, 0)
  assert.deepEqual(bad.state, a.state)
})

check('attachPhoto / detachPhoto 只改 photoId 引用', () => {
  const a = addItem(emptyWardrobe(), sample())
  const withPhoto = attachPhoto(a.state, a.item.id, 'img-1')
  assert.equal(withPhoto.item.photoId, 'img-1')
  const cleared = attachPhoto(withPhoto.state, a.item.id, null)
  assert.equal(cleared.item.photoId, null)
})

check('clearWardrobe 返回空状态', () => {
  assert.deepEqual(clearWardrobe(), { version: 1, items: [] })
})

// ---------------------------------------------------------------- 筛选与统计

check('queryItems 按状态/分类/色系/版型/照片/关键字筛选，并支持排序', () => {
  let state = emptyWardrobe()
  const tops = addItem(state, sample({ name: '白T', status: 'owned', family: 'light', hex: '#ffffff' })); state = tops.state
  const shoes = addItem(state, sample({ name: '黑色跑鞋', category: 'shoes', status: 'wishlist', family: 'dark', hex: '#222222', tags: ['运动'] })); state = shoes.state
  const photo = addItem(state, sample({ name: '带照片的外套', category: 'outers', status: 'owned' })); state = photo.state
  state = attachPhoto(state, photo.item.id, 'img-9').state

  assert.equal(queryItems(state).length, 3)
  assert.deepEqual(queryItems(state, { status: 'owned' }).map((i) => i.name).sort(), ['带照片的外套', '白T'].sort())
  assert.equal(queryItems(state, { category: 'shoes' }).length, 1)
  assert.equal(queryItems(state, { family: 'light' }).length, 1)
  assert.equal(queryItems(state, { fit: 'regular' }).length, 3)
  assert.equal(queryItems(state, { photo: 'with' }).length, 1)
  assert.equal(queryItems(state, { photo: 'without' }).length, 2)
  assert.equal(queryItems(state, { q: '跑鞋' }).length, 1)
  assert.equal(queryItems(state, { q: '运动' }).length, 1, '标签也应参与关键字匹配')
  assert.equal(queryItems(state, { status: ['owned', 'wishlist'] }).length, 3)
  assert.equal(queryItems(state, { status: 'nonsense' }).length, 3, '非法筛选值应当作「全部」')
  assert.deepEqual(queryItems(state, { sort: 'wear' }).map((i) => i.wearCount), [0, 0, 0])
  assert.deepEqual(queryItems(state, { sort: 'category' }).map((i) => i.category), ['tops', 'outers', 'shoes'])
})

check('queryItems 不修改原状态（返回新数组）', () => {
  const a = addItem(emptyWardrobe(), sample())
  const list = queryItems(a.state, { sort: 'name' })
  list.push({ id: 'fake' })
  assert.equal(a.state.items.length, 1)
})

check('summarizeWardrobe 统计总数/状态/分类/照片/穿着次数/最常穿', () => {
  let state = emptyWardrobe()
  const a = addItem(state, sample({ name: 'A', status: 'owned' })); state = a.state
  const b = addItem(state, sample({ name: 'B', category: 'shoes', status: 'wishlist' })); state = b.state
  const c = addItem(state, sample({ name: 'C', category: 'shoes', status: 'disliked' })); state = c.state
  state = attachPhoto(state, a.item.id, 'img-1').state
  state = recordWear(state, a.item.id).state
  state = recordWear(state, a.item.id).state
  // 穿过一次即视为已有：B 原本是 wishlist，记录穿着后被提升为 owned。
  state = recordWear(state, b.item.id).state

  const s = summarizeWardrobe(state)
  assert.equal(s.total, 3)
  assert.equal(s.byStatus.owned, 2, 'A 与（被提升为已有的）B 都算已有')
  assert.equal(s.byStatus.wishlist, 0, 'B 记录穿着后不应再算「想买」')
  assert.equal(s.byStatus.disliked, 1)
  assert.equal(s.byCategory.tops, 1)
  assert.equal(s.byCategory.shoes, 2)
  assert.equal(s.withPhoto, 1)
  assert.equal(s.totalWears, 3)
  assert.equal(s.ownedRatio, Math.round((2 / 3) * 100) / 100)
  assert.equal(s.mostWorn.name, 'A')
  assert.equal(s.mostWorn.wearCount, 2)
})

check('summarizeWardrobe 对空/非法输入给出全零而不是抛异常', () => {
  for (const input of [emptyWardrobe(), null, undefined, 'x', { items: 'nope' }]) {
    const s = summarizeWardrobe(input)
    assert.equal(s.total, 0)
    assert.equal(s.totalWears, 0)
    assert.equal(s.mostWorn, null)
    assert.equal(s.ownedRatio, 0)
  }
})

// ---------------------------------------------------------------- 存储往返与降级

check('encode → decode 往返完全一致（刷新恢复的基础）', () => {
  const a = addItem(emptyWardrobe(), sample())
  const text = encodeWardrobe(a.state)
  assert.match(text, /"version":1/)
  const back = decodeWardrobe(text)
  assert.equal(back.ok, true)
  assert.deepEqual(back.state, decodeWardrobe(a.state).state)
  assert.equal(back.state.items[0].name, '藏青亚麻衬衫')
  assert.deepEqual(back.warnings, [])
})

check('writeWardrobe → readWardrobe 经 localStorage 往返后数据不丢（模拟刷新）', () => {
  const storage = fakeStorage()
  const a = addItem(emptyWardrobe(), sample())
  const w = writeWardrobe(storage, a.state)
  assert.equal(w.ok, true)
  assert.ok(storage._dump()[WARDROBE_KEY], 'key 必须是 stylelab:wardrobe:v1')

  const back = readWardrobe(storage)
  assert.equal(back.missing, false)
  assert.equal(back.state.items.length, 1)
  assert.equal(back.state.items[0].name, '藏青亚麻衬衫')
  assert.equal(back.state.items[0].hex, '#2b3a55')
  assert.equal(back.state.items[0].wearCount, 0)
  assert.deepEqual(validatePersonalItem(back.state.items[0]), [])
})

check('首次启动（key 不存在）返回空衣橱且 missing=true', () => {
  const back = readWardrobe(fakeStorage())
  assert.equal(back.missing, true)
  assert.deepEqual(back.state, emptyWardrobe())
})

check('损坏 JSON 降级为空衣橱 + 可读警告，不抛异常', () => {
  const back = readWardrobe(fakeStorage({ [WARDROBE_KEY]: '{oops' }))
  assert.deepEqual(back.state, emptyWardrobe())
  assert.equal(back.missing, false)
  assert.ok(back.warnings.length >= 1)
})

check('局部损坏只丢坏件、好件仍在（这是不用 usePersistentState 的原因）', () => {
  const good = makePersonalItem(sample()).item
  const back = readWardrobe(fakeStorage({
    [WARDROBE_KEY]: JSON.stringify({ version: 1, items: [{ name: '没有分类' }, good] }),
  }))
  assert.equal(back.state.items.length, 1)
  assert.equal(back.state.items[0].id, good.id)
  assert.ok(back.warnings.some((w) => w.includes('丢弃')))
})

check('storage 抛异常（隐私模式 / 配额满）时读写都降级，不抛到调用方', () => {
  const storage = throwingStorage()
  const read = readWardrobe(storage)
  assert.deepEqual(read.state, emptyWardrobe())
  assert.ok(read.error instanceof Error)
  const write = writeWardrobe(storage, addItem(emptyWardrobe(), sample()).state)
  assert.equal(write.ok, false)
  assert.ok(write.error instanceof Error)
})

check('storage 为 null（无 window）时读写降级为空衣橱 / ok:false', () => {
  assert.deepEqual(readWardrobe(null).state, emptyWardrobe())
  assert.equal(writeWardrobe(null, emptyWardrobe()).ok, false)
})

check('decodeWardrobe 拒绝非对象/数组等异常输入', () => {
  for (const input of ['[]', '"str"', '42', 'null']) {
    const r = decodeWardrobe(input)
    assert.deepEqual(r.state, emptyWardrobe(), `输入 ${input} 未降级`)
  }
  assert.equal(decodeWardrobe('').ok, true)
})

// ---------------------------------------------------------------- 照片仓库

check('fitSize 只缩不放，且最长边受控', () => {
  assert.deepEqual(fitSize(3000, 2000, 1200), { width: 1200, height: 800, scale: 0.4 })
  assert.deepEqual(fitSize(600, 400, 1200), { width: 600, height: 400, scale: 1 })
  assert.deepEqual(fitSize(400, 3000, 1200), { width: 160, height: 1200, scale: 0.4 })
  assert.deepEqual(fitSize(0, 0), { width: 0, height: 0, scale: 1 })
  assert.deepEqual(fitSize(NaN, 100), { width: 0, height: 0, scale: 1 })
})

check('pickOutputType：透明图保留 PNG，其余转 JPEG', () => {
  assert.equal(pickOutputType('image/png'), 'image/png')
  assert.equal(pickOutputType('image/jpeg'), 'image/jpeg')
  assert.equal(pickOutputType('image/heic'), 'image/jpeg')
  assert.equal(pickOutputType(undefined), 'image/jpeg')
  assert.equal(pickOutputType('image/jpeg', true), 'image/png')
})

check('dataUrlToBlob ↔ Blob 解析：非法输入返回 null 而不抛', () => {
  const blob = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')
  assert.ok(blob instanceof Blob)
  assert.equal(blob.type, 'image/png')
  for (const badInput of [null, 42, 'not-a-data-url', 'data:image/png,']) {
    const r = dataUrlToBlob(badInput)
    assert.ok(r === null || r instanceof Blob, `输入 ${String(badInput)} 结果异常`)
  }
})

acheck('saveCompressedImage 压缩到 1200 长边并写入仓库（注入假解码/绘制）', async () => {
  const store = createImageMemoryBackend()
  const seen = []
  const createBitmap = async () => ({ source: {}, width: 3000, height: 2000, hasAlpha: false, close() {} })
  const drawCanvas = async (bitmap, w, h, type, q) => {
    seen.push({ w, h, type, q })
    return new Blob([new Uint8Array(Math.round(200000 * q))], { type })
  }
  const saved = await saveCompressedImage(new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  assert.equal(saved.ok, true)
  assert.equal(saved.width, 1200)
  assert.equal(saved.height, 800)
  assert.equal(saved.type, 'image/jpeg')
  assert.equal(seen[0].q, 0.82, '首选质量应为契约默认 0.82')
  assert.ok(saved.size > 0)
  assert.equal(await countImages({ store }), 1)

  const blob = await getImageBlob(saved.id, { store })
  assert.ok(blob instanceof Blob)
  assert.equal(blob.size, saved.size)
})

acheck('saveCompressedImage 超 900KB 时逐级降质量直到达标', async () => {
  const store = createImageMemoryBackend()
  const qualities = []
  const createBitmap = async () => ({ source: {}, width: 2400, height: 2400, hasAlpha: false, close() {} })
  const drawCanvas = async (bitmap, w, h, type, q) => {
    qualities.push(q)
    // 质量 0.82 时超限，0.72 也不够，0.62 才达标 —— 迫使梯度真正生效。
    const size = q > 0.7 ? 2 * 1024 * 1024 : 400 * 1024
    return new Blob([new Uint8Array(size)], { type })
  }
  const saved = await saveCompressedImage(new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  assert.equal(saved.ok, true)
  assert.ok(qualities.length >= 3, `应至少尝试 3 档质量，实际 ${qualities.join('/')}`)
  assert.ok(qualities[2] < qualities[0], '质量应逐级下降')
  assert.ok(saved.size <= 900 * 1024, `最终体积 ${saved.size} 仍超限`)
})

acheck('compressBlob：PNG 也受 900KB 目标约束，压不下来时无透明图转 JPEG', async () => {
  const renders = []
  const createBitmap = async () => ({ source: {}, width: 3000, height: 3000, hasAlpha: false, close() {} })
  const drawCanvas = async (bitmap, w, h, type, q) => {
    renders.push({ w, h, type, q })
    // PNG 无损：体积与像素密度无关，任何边长都是 2MB（模拟信息熵极高的截图）；
    // JPEG 有质量梯度，能压到目标以下。
    const size = type === 'image/png' ? 2 * 1024 * 1024 : 300 * 1024
    return new Blob([new Uint8Array(size)], { type })
  }
  const out = await compressBlob(new Blob([new Uint8Array(8)], { type: 'image/png' }), { createBitmap, drawCanvas })
  assert.equal(out.type, 'image/jpeg', 'PNG 压不到目标时应在无透明通道的前提下转 JPEG')
  assert.ok(out.blob.size <= TARGET_MAX_BYTES, `最终体积 ${out.blob.size} 仍超限`)
  // 修复前 PNG 在第一轮 q=0.82 就无条件返回 2MB 的 PNG，永远不会走到这里。
  const pngRounds = renders.filter((r) => r.type === 'image/png')
  assert.ok(pngRounds.length >= 2, `PNG 应先逐级缩边重试，实际只渲染了 ${pngRounds.length} 次`)
  assert.equal(new Set(pngRounds.map((r) => r.w)).size, pngRounds.length, '每次重试的边长应递减')
  assert.ok(renders.some((r) => r.type === 'image/jpeg'), '应尝试 JPEG 兜底')
})

acheck('compressBlob：透明 PNG 压不到目标时保留 PNG，不强转 JPEG（不丢透明通道）', async () => {
  const createBitmap = async () => ({ source: {}, width: 3000, height: 3000, hasAlpha: true, close() {} })
  const drawCanvas = async (bitmap, w, h, type) => new Blob([new Uint8Array(2 * 1024 * 1024)], { type })
  const out = await compressBlob(new Blob([new Uint8Array(8)], { type: 'image/png' }), { createBitmap, drawCanvas })
  assert.equal(out.type, 'image/png')
  assert.ok(out.blob.size > TARGET_MAX_BYTES, '透明图无法达标时应如实返回最大努力结果，而不是报错或改格式')
})

acheck('exportImages：超过 4MB 上限的照片通过 onSkip 上报（不再只打日志）', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 100, height: 100, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(128)], { type: 'image/jpeg' })
  const small = await saveCompressedImage(new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  // 绕开压缩管线直接塞一张超限照片：模拟旧版本存下的无损大图。
  await store.put({ id: 'img-big', blob: new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/jpeg' }), type: 'image/jpeg' })

  const skipped = []
  const exported = await exportImages([small.id, 'img-big'], { store, onSkip: (info) => skipped.push(info) })
  assert.equal(exported.length, 1, '超限照片不应出现在导出结果里')
  assert.equal(exported[0].id, small.id)
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0].id, 'img-big')
  assert.match(skipped[0].reason, /上限/)
})

acheck('saveCompressedImage 拒绝非图片与空输入，返回 ok:false 而非抛异常', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 10, height: 10, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
  const notImage = await saveCompressedImage(new Blob([new Uint8Array(4)], { type: 'text/plain' }), { store, createBitmap, drawCanvas })
  assert.equal(notImage.ok, false)
  assert.match(notImage.error.message, /不是图片文件/)
  const empty = await saveCompressedImage(null, { store, createBitmap, drawCanvas })
  assert.equal(empty.ok, false)
  assert.equal(await countImages({ store }), 0)
})

acheck('压缩失败时降级保存原图，而不是整条链路失败', async () => {
  const store = createImageMemoryBackend()
  const boom = async () => { throw new Error('解码器不可用') }
  const file = new Blob([new Uint8Array(500)], { type: 'image/jpeg' })
  const saved = await saveCompressedImage(file, { store, createBitmap: boom, drawCanvas: async () => null })
  assert.equal(saved.ok, true)
  assert.equal(saved.size, 500, '应保存原图体积')
  assert.ok(await getImageBlob(saved.id, { store }))
})

acheck('saveCompressedImage 在仓库不可用时返回 ok:false（store: null）', async () => {
  const createBitmap = async () => ({ source: {}, width: 100, height: 100, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
  const saved = await saveCompressedImage(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), { store: null, createBitmap, drawCanvas })
  assert.equal(saved.ok, false)
  assert.ok(saved.error instanceof Error)
})

acheck('getImageBlob / getImageDataUrl 对不存在的 id 返回 null，不抛异常', async () => {
  const store = createImageMemoryBackend()
  assert.equal(await getImageBlob('img-nope', { store }), null)
  assert.equal(await getImageDataUrl('img-nope', { store }), null)
  assert.equal(await getImageBlob('', { store }), null)
  assert.equal(await getImageBlob(null, { store }), null)
})

acheck('照片预览：getImageDataUrl 返回可直接给 <img src> 的 dataURL', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 100, height: 100, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(64)], { type: 'image/jpeg' })
  const saved = await saveCompressedImage(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  const dataUrl = await getImageDataUrl(saved.id, { store })
  assert.match(dataUrl, /^data:image\/jpeg;base64,/)
})

acheck('deleteImage 幂等：删两次都成功，删除后读回 null', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 100, height: 100, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(32)], { type: 'image/jpeg' })
  const saved = await saveCompressedImage(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  await deleteImage(saved.id, { store })
  assert.equal(await getImageBlob(saved.id, { store }), null)
  await deleteImage(saved.id, { store })
  await deleteImage('', { store })
  assert.equal(await countImages({ store }), 0)
})

acheck('exportImages → importImages 往返，重复导入按 skipped 计', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 100, height: 100, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(128)], { type: 'image/jpeg' })
  const a = await saveCompressedImage(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  const b = await saveCompressedImage(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })

  const exported = await exportImages([a.id, b.id], { store })
  assert.equal(exported.length, 2)
  assert.equal(exported[0].type, 'image/jpeg')
  assert.match(exported[0].dataUrl, /^data:/)

  const target = createImageMemoryBackend()
  const imported = await importImages(exported, { store: target })
  assert.deepEqual(imported, { imported: 2, skipped: 0 })
  const again = await importImages(exported, { store: target })
  assert.deepEqual(again, { imported: 0, skipped: 2 }, '已存在的照片不能被覆盖')
  assert.equal(await countImages({ store: target }), 2)
})

acheck('exportImages 省略 ids 时导出全部；空仓库返回空数组', async () => {
  const store = createImageMemoryBackend()
  assert.deepEqual(await exportImages(undefined, { store }), [])
  const createBitmap = async () => ({ source: {}, width: 50, height: 50, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(16)], { type: 'image/jpeg' })
  await saveCompressedImage(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  assert.equal((await exportImages(undefined, { store })).length, 1)
})

acheck('importImages 跳过坏记录并统计，不抛异常', async () => {
  const store = createImageMemoryBackend()
  const r = await importImages([
    { id: 'img-ok', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    { id: '', dataUrl: 'data:image/png;base64,AAAA' },
    { id: 'img-nodata', dataUrl: 'nope' },
    null,
    42,
  ], { store })
  assert.equal(r.imported, 1)
  assert.equal(r.skipped, 4)
})

acheck('仓库不可用时所有接口都安全降级，不抛异常', async () => {
  const none = { store: null }
  assert.equal(await getImageBlob('img-x', none), null)
  assert.equal(await getImageDataUrl('img-x', none), null)
  assert.deepEqual(await exportImages(undefined, none), [])
  assert.deepEqual(await importImages([{ id: 'a', dataUrl: 'data:image/png;base64,AAAA' }], none), { imported: 0, skipped: 1 })
  assert.equal(await countImages(none), 0)
  await deleteImage('img-x', none)
  assert.deepEqual(await clearImages(none), { ok: true, removed: 0 })
})

acheck('clearImages 清空仓库并报告删除数量', async () => {
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 50, height: 50, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(16)], { type: 'image/jpeg' })
  await saveCompressedImage(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  const r = await clearImages({ store })
  assert.deepEqual(r, { ok: true, removed: 1 })
  assert.equal(await countImages({ store }), 0)
})

// ---------------------------------------------------------------- 集成：单品 + 照片

acheck('删单品时清照片、挂载失败不留孤儿照片（useWardrobe 的两条清理规则）', async () => {
  // 直接复现 useWardrobe.remove / savePhoto 的清理逻辑，不依赖 React。
  const store = createImageMemoryBackend()
  const createBitmap = async () => ({ source: {}, width: 50, height: 50, hasAlpha: false, close() {} })
  const drawCanvas = async () => new Blob([new Uint8Array(16)], { type: 'image/jpeg' })

  const created = addItem(emptyWardrobe(), sample())
  const saved = await saveCompressedImage(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  const attached = attachPhoto(created.state, created.item.id, saved.id)
  assert.equal(await countImages({ store }), 1)

  const existing = findPersonalItem(attached.state, created.item.id)
  const removed = removeItem(attached.state, created.item.id)
  if (existing.photoId) await deleteImage(existing.photoId, { store })
  assert.equal(removed.state.items.length, 0)
  assert.equal(await countImages({ store }), 0, '删单品应顺手清掉它的照片')

  const orphan = await saveCompressedImage(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), { store, createBitmap, drawCanvas })
  await deleteImage(orphan.id, { store })
  assert.equal(await countImages({ store }), 0, '挂载失败的照片不应留在仓库里')
})

check('个人单品能被 catalog 的 byId 语义之外的合并查表识别（与 personalRecommendations 对齐）', () => {
  const created = addItem(emptyWardrobe(), sample())
  // personalRecommendations.normalizeWardrobe 只接受 u- 前缀；本模块产出的必须全部通过。
  const accepted = created.state.items.filter((i) => i.id.startsWith('u-'))
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].category, 'tops')
  assert.equal(accepted[0].status, 'owned')
  assert.equal(typeof accepted[0].hex, 'string')
  assert.equal(typeof accepted[0].formality, 'number')
})

await Promise.all(pending)

// 断言数量对账：修复前 17 条异步断言从未执行，而输出仍然「看起来正常」。
// 把这行打印出来，下次少跑多少条一眼可见（lint 的 ASYNC-CHECK 规则是硬门禁）。
console.log(`\n本文件执行断言 ${passed + failed} 条（其中异步 ${pending.length} 条）`)
console.log(failed === 0
  ? '\n✓ 个人衣橱 v1 断言全部通过（CRUD / 状态 / 照片 / 筛选统计 / 存储降级）'
  : `\n❌ 个人衣橱 v1 有 ${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)

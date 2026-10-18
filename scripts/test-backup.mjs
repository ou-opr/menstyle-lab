// 备份包 v1 的纯函数 + 集成断言：node scripts/test-backup.mjs
// 覆盖验收要求的四类：有效包往返、损坏包拒绝、高版本拒绝、合并/覆盖冲突策略。
// 本脚本不依赖浏览器：localStorage 与 imageStore 都用内存假对象注入。
import assert from 'node:assert/strict'
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  STORAGE_KEYS,
  backupFilename,
  collectBackup,
  exportBackup,
  importBackup,
  mergeLooks,
  mergePreferences,
  mergeWardrobe,
  planImport,
  resetAll,
  sanitizePersonalItem,
  validateBackup,
} from '../src/data/backup.js'

/* ThemeToggle.jsx 的 THEME_MODES */
const BACKUP_THEME_MODES = ['auto', 'light', 'dark']

let failed = 0
const ok = (m) => console.log('✓ ' + m)
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}
const acheck = async (label, fn) => {
  try { await fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}

// ---- 内存假 localStorage ----
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

const item = (over = {}) => ({
  id: 'u-1', name: '白衬衫', category: 'tops', status: 'owned', hex: '#F1EFE8',
  family: 'light', formality: 2, warmth: 2, fit: 'regular', mesh: 'shirt',
  notes: '', tags: ['通勤'], photoId: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  wearCount: 3, lastWornAt: null, ...over,
})

const look = (over = {}) => ({
  id: 'look-1', name: '造型 1', ts: 1000,
  outfit: { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] },
  ...over,
})

// ============================================================ 1. 有效包往返
check('往返：collectBackup 产出的包能自己通过 validateBackup', () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({ version: 1, items: [item()] }),
    [STORAGE_KEYS.preferences]: JSON.stringify({
      version: 1,
      feedback: [{ id: 'f-1', at: '2026-01-01', kind: 'like', outfit: look().outfit, reasons: ['color'] }],
      weights: { itemIds: { 'u-1': 5 }, colors: { light: 2 }, formalities: {} },
    }),
    [STORAGE_KEYS.looks]: JSON.stringify([look()]),
    // 主题是裸字符串：ThemeToggle.jsx:30 用 setItem(key, mode) 直接写，不是 JSON。
    [STORAGE_KEYS.theme]: 'dark',
  })
  const { backup } = collectBackup({ storage, appVersion: '0.1.0' })
  const v = validateBackup(JSON.parse(JSON.stringify(backup)))
  assert.equal(v.ok, true, v.reason)
  assert.equal(v.backup.data.wardrobe.items.length, 1)
  assert.equal(v.backup.data.wardrobe.items[0].hex, '#f1efe8', 'hex 应规范化为小写')
  assert.equal(v.backup.data.looks.length, 1)
  assert.equal(v.backup.data.theme, 'dark')
  assert.equal(v.backup.schema, BACKUP_SCHEMA)
  assert.equal(v.backup.version, BACKUP_VERSION)
})

await acheck('往返：exportBackup -> importBackup(overwrite) 到空 storage 得到同一份数据', async () => {
  const src = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({ version: 1, items: [item()] }),
    [STORAGE_KEYS.looks]: JSON.stringify([look()]),
    [STORAGE_KEYS.theme]: 'light',
  })
  const exp = await exportBackup({ storage: src, appVersion: '0.1.0', now: new Date('2026-10-15T00:00:00Z') })
  assert.equal(exp.filename, 'style-lab-backup-2026-10-15.json', '文件名须符合契约 §6')
  assert.equal(JSON.parse(exp.json).data.theme, 'light', '主题应被原样导出（裸字符串）')

  const dst = fakeStorage()
  const res = await importBackup(exp.json, { storage: dst, mode: 'overwrite' })
  assert.equal(res.ok, true, res.reason)
  // 主题必须写成裸字符串，否则 ThemeToggle 的 isMode() 判非法回退 auto。
  assert.equal(dst.getItem(STORAGE_KEYS.theme), 'light', '主题必须以裸字符串写入，不能是 JSON 引号串')

  const round = fakeStorage(dst._dump())
  const { backup } = collectBackup({ storage: round })
  assert.equal(backup.data.wardrobe.items.length, 1)
  assert.equal(backup.data.wardrobe.items[0].name, '白衬衫')
  assert.equal(backup.data.looks.length, 1)
  assert.equal(backup.data.looks[0].outfit.top, 't-white')
  assert.equal(backup.data.theme, 'light')
})

check('文件名格式 style-lab-backup-YYYY-MM-DD.json', () => {
  assert.equal(backupFilename(new Date(2026, 0, 5)), 'style-lab-backup-2026-01-05.json')
})

// ============================================================ 2. 损坏包拒绝
const CORRUPT = [
  ['非 JSON 文本', 'not json at all', 'bad-json'],
  ['空字符串', '', 'empty'],
  ['纯空白', '   ', 'empty'],
  ['JSON 但非对象', '"a string"', 'not-object'],
  ['数组', '[1,2,3]', 'not-object'],
  ['null', 'null', 'not-object'],
  ['schema 不符', JSON.stringify({ schema: 'other', version: 1, data: {} }), 'bad-schema'],
  ['缺少 schema', JSON.stringify({ version: 1, data: {} }), 'bad-schema'],
  ['version 非整数', JSON.stringify({ schema: BACKUP_SCHEMA, version: '1', data: {} }), 'bad-version'],
  ['version 为 0', JSON.stringify({ schema: BACKUP_SCHEMA, version: 0, data: {} }), 'bad-version'],
  ['version 负数', JSON.stringify({ schema: BACKUP_SCHEMA, version: -1, data: {} }), 'bad-version'],
  ['缺少 data', JSON.stringify({ schema: BACKUP_SCHEMA, version: 1 }), 'bad-data'],
  ['data 是数组', JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, data: [] }), 'bad-data'],
]
for (const [label, payload, code] of CORRUPT) {
  await acheck(`损坏包拒绝：${label} -> ${code}，且不写盘`, async () => {
    const dst = fakeStorage()
    const before = JSON.stringify(dst._dump())
    const res = await importBackup(payload, { storage: dst })
    assert.equal(res.ok, false, '应被判为非法')
    assert.equal(res.code, code, `错误码应为 ${code}，实际 ${res.code}`)
    assert.ok(res.reason && res.reason.length > 0, '必须给出可读原因')
    assert.equal(JSON.stringify(dst._dump()), before, '被拒绝的导入不得改动 storage')
  })
}

// ============================================================ 3. 高版本拒绝
await acheck('高版本拒绝：version 大于本应用支持的版本时拒绝并说明原因', async () => {
  const dst = fakeStorage({ [STORAGE_KEYS.looks]: JSON.stringify([look()]) })
  const before = JSON.stringify(dst._dump())
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: BACKUP_VERSION + 1, exportedAt: '', app: { version: '9' },
    data: { wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: '', images: [] },
  })
  const res = await importBackup(payload, { storage: dst })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'unsupported-version')
  assert.match(res.reason, /高于本应用支持/, '原因需说明版本过高')
  assert.equal(JSON.stringify(dst._dump()), before, '高版本包不得改动 storage')

  const direct = validateBackup(JSON.parse(payload))
  assert.equal(direct.ok, false)
  assert.equal(direct.code, 'unsupported-version')
})

await acheck('同版本（version = 本应用版本）仍可导入', async () => {
  const dst = fakeStorage()
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: BACKUP_VERSION, exportedAt: '', app: { version: '0.1.0' },
    data: {
      wardrobe: { version: 1, items: [item()] }, preferences: { version: 1 },
      looks: [], theme: '', images: [],
    },
  })
  const res = await importBackup(payload, { storage: dst, mode: 'overwrite' })
  assert.equal(res.ok, true, res.reason)
})

// ============================================================ 4. 合并策略（纯函数）
check('合并：衣橱同 id 按 updatedAt 取较新，不同 id 各自保留', () => {
  const current = { version: 1, items: [item({ id: 'u-1', name: '旧名', updatedAt: '2026-01-01T00:00:00.000Z' }), item({ id: 'u-2', name: '本地独有' })] }
  const incoming = { version: 1, items: [item({ id: 'u-1', name: '新名', updatedAt: '2026-02-01T00:00:00.000Z' }), item({ id: 'u-3', name: '导入独有' })] }
  const { value, stats } = mergeWardrobe(current, incoming)
  assert.equal(value.items.length, 3, 'u-1 / u-2 / u-3')
  assert.equal(value.items.find((i) => i.id === 'u-1').name, '新名', '较新的 updatedAt 应胜出')
  assert.equal(value.items.find((i) => i.id === 'u-2').name, '本地独有', '本地独有项不得丢失')
  assert.deepEqual(stats, { added: 1, updated: 1, kept: 0 })
})

check('合并：导入方 updatedAt 更旧时保留本地（kept）', () => {
  const current = { version: 1, items: [item({ id: 'u-1', name: '本地较新', updatedAt: '2026-03-01T00:00:00.000Z' })] }
  const incoming = { version: 1, items: [item({ id: 'u-1', name: '导入较旧', updatedAt: '2026-01-01T00:00:00.000Z' })] }
  const { value, stats } = mergeWardrobe(current, incoming)
  assert.equal(value.items[0].name, '本地较新')
  assert.equal(stats.kept, 1)
  assert.equal(stats.updated, 0)
})

check('合并：偏好反馈按 id 去重，权重各桶相加并夹在 [-12, 12]', () => {
  const current = {
    version: 1,
    feedback: [{ id: 'f-1', at: 'a', kind: 'like', outfit: look().outfit, reasons: [] }],
    weights: { itemIds: { 'u-1': 10 }, colors: { light: -12 }, formalities: {} },
  }
  const incoming = {
    version: 1,
    feedback: [
      { id: 'f-1', at: 'b', kind: 'dislike', outfit: look().outfit, reasons: ['fit'] },
      { id: 'f-2', at: 'c', kind: 'worn', outfit: look().outfit, reasons: [] },
    ],
    weights: { itemIds: { 'u-1': 5, 'u-2': 1 }, colors: { light: -5 }, formalities: { 2: 3 } },
  }
  const { value, stats } = mergePreferences(current, incoming)
  assert.equal(value.feedback.length, 2, 'f-1 去重 + f-2 新增')
  assert.equal(stats.feedbackAdded, 1)
  assert.equal(stats.feedbackMerged, 1)
  assert.equal(value.feedback.find((f) => f.id === 'f-1').kind, 'dislike', '同 id 以导入方为准')
  assert.equal(value.weights.itemIds['u-1'], 12, '10+5 应被夹到上限 12')
  assert.equal(value.weights.itemIds['u-2'], 1)
  assert.equal(value.weights.colors.light, -12, '-12 + -5 应被夹到下限 -12')
  assert.equal(value.weights.formalities[2], 3)
})

check('合并：收藏按 id 合并、按 ts 倒序、上限 30 条且丢弃最旧', () => {
  const current = Array.from({ length: 25 }, (_, i) => look({ id: `c-${i}`, ts: 1000 + i }))
  const incoming = Array.from({ length: 10 }, (_, i) => look({ id: `i-${i}`, ts: 5000 + i }))
  const { value, stats } = mergeLooks(current, incoming)
  assert.equal(value.length, 30, '上限 30 条')
  assert.equal(stats.added, 10)
  assert.equal(stats.dropped, 5, '25+10-30 = 5 条最旧的被丢弃')
  assert.equal(value[0].ts, 5009, '应按 ts 倒序，最新在前')
  assert.ok(!value.some((l) => l.id === 'c-0'), 'ts 最小的 c-0 应被丢弃')
})

check('覆盖：planImport(overwrite) 完全替换而非合并', () => {
  const current = { wardrobe: { version: 1, items: [item({ id: 'u-local', name: '本地' })] }, looks: [look({ id: 'c-1' })], theme: 'dark' }
  const backup = {
    data: {
      wardrobe: { version: 1, items: [item({ id: 'u-import', name: '导入' })] },
      preferences: { version: 1, feedback: [], weights: { itemIds: {}, colors: {}, formalities: {} } },
      looks: [look({ id: 'i-1', ts: 9000 })], theme: 'light', images: [],
    },
  }
  const plan = planImport(current, backup, { mode: 'overwrite' })
  assert.equal(plan.mode, 'overwrite')
  const wardrobeWrite = plan.writes.find((w) => w.key === STORAGE_KEYS.wardrobe)
  const parsed = JSON.parse(wardrobeWrite.value)
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].id, 'u-import', '覆盖后本地项应消失')
  const looksWrite = plan.writes.find((w) => w.key === STORAGE_KEYS.looks)
  assert.deepEqual(JSON.parse(looksWrite.value).map((l) => l.id), ['i-1'])
})

check('覆盖：planImport(merge) 保留本地并合并', () => {
  const current = { wardrobe: { version: 1, items: [item({ id: 'u-local', name: '本地' })] }, looks: [], theme: '' }
  const backup = {
    data: {
      wardrobe: { version: 1, items: [item({ id: 'u-import', name: '导入' })] },
      preferences: { version: 1, feedback: [], weights: { itemIds: {}, colors: {}, formalities: {} } },
      looks: [], theme: '', images: [],
    },
  }
  const plan = planImport(current, backup, { mode: 'merge' })
  const parsed = JSON.parse(plan.writes.find((w) => w.key === STORAGE_KEYS.wardrobe).value)
  assert.equal(parsed.items.length, 2, '合并后本地与导入项都在')
  assert.deepEqual(parsed.items.map((i) => i.id).sort(), ['u-import', 'u-local'])
})

check('默认模式是 merge（未指定 mode 时不覆盖用户数据）', () => {
  const plan = planImport({ wardrobe: { version: 1, items: [item({ id: 'u-local' })] } }, {
    data: { wardrobe: { version: 1, items: [] }, preferences: { version: 1, feedback: [], weights: {} }, looks: [], theme: '', images: [] },
  })
  assert.equal(plan.mode, 'merge')
})

// ============================================================ 5. 单件清洗与降级
check('单项清洗：字段非法时丢弃，缺省字段补默认值', () => {
  assert.equal(sanitizePersonalItem(null).item, null)
  assert.equal(sanitizePersonalItem({}).item, null, '缺 id/name/category 应丢弃')
  assert.equal(sanitizePersonalItem(item({ category: 'hats' })).item, null, 'category 非法应丢弃')
  assert.equal(sanitizePersonalItem(item({ status: 'nope' })).item, null, 'status 非法应丢弃')
  assert.equal(sanitizePersonalItem(item({ hex: 'red' })).item, null, 'hex 非法应丢弃')
  const { item: fixed } = sanitizePersonalItem({ id: 'u-9', name: 'x', category: 'tops', status: 'owned', hex: '#ABCDEF' })
  assert.equal(fixed.hex, '#abcdef')
  assert.equal(fixed.family, 'neutral', 'family 缺省补 neutral')
  assert.equal(fixed.formality, 2)
  assert.equal(fixed.wearCount, 0)
  assert.deepEqual(fixed.tags, [])
})

check('部分损坏的包：可修复则放行并给出 warnings，坏件被逐条丢弃', () => {
  const res = validateBackup({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '0.1.0' },
    data: {
      wardrobe: { version: 1, items: [item(), { id: 'bad' }, null] },
      preferences: { version: 1 }, looks: [{ id: 'l1' }, look()], theme: 'x', images: [{ id: 'p1' }],
    },
  })
  assert.equal(res.ok, true, '部分损坏不应整包拒绝')
  assert.equal(res.backup.data.wardrobe.items.length, 1, '只留合法的那件')
  assert.equal(res.backup.data.looks.length, 1, '缺 outfit 的收藏被丢弃')
  assert.equal(res.backup.data.images.length, 0, '缺 dataUrl 的照片被丢弃')
  assert.ok(res.warnings.length >= 3, `应累积多条 warning，实际 ${res.warnings.length}`)
})

await acheck('无 localStorage 时：导出仍成功但给出降级 warning，导入明确失败且不抛', async () => {
  const exp = await exportBackup({ storage: null, appVersion: '0.1.0' })
  assert.equal(exp.ok, true, '无 storage 时导出不应崩')
  assert.ok(exp.warnings.some((w) => w.includes('localStorage')), '应提示不支持 localStorage')

  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '' },
    data: { wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: '', images: [] },
  })
  const res = await importBackup(payload, { storage: null })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'no-storage')
  assert.ok(res.reason.includes('未被修改'), '需明确告知数据未被修改')
})

await acheck('写入抛错时回滚：setItem 中途失败不得留下半写状态', async () => {
  const base = fakeStorage({ [STORAGE_KEYS.looks]: JSON.stringify([look({ id: 'orig' })]) })
  let calls = 0
  const flaky = {
    getItem: base.getItem,
    removeItem: base.removeItem,
    setItem: (k, v) => {
      calls++
      if (calls === 2) throw new Error('QuotaExceededError')
      base.setItem(k, v)
    },
  }
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '' },
    data: {
      wardrobe: { version: 1, items: [item()] }, preferences: { version: 1 },
      looks: [look({ id: 'imported' })], theme: '', images: [],
    },
  })
  const res = await importBackup(payload, { storage: flaky, mode: 'overwrite' })
  assert.equal(res.ok, false, '应报告失败')
  assert.equal(res.code, 'write-failed')
  assert.equal(res.rolledBack, true, '应已回滚')
  const after = JSON.parse(base.getItem(STORAGE_KEYS.looks))
  assert.deepEqual(after.map((l) => l.id), ['orig'], '第一个 key 必须被还原成原值')
})

// ============================================================ 6. 照片（注入假 imageStore）
await acheck('照片往返：注入假 imageStore 时走 exportImages / importImages', async () => {
  const store = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({ version: 1, items: [item({ photoId: 'p-1' })] }),
  })
  const fakeImages = {
    exportImages: async (ids) => {
      assert.deepEqual(ids, ['p-1'], '应只导出被引用的 photoId')
      return [{ id: 'p-1', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }]
    },
    importImages: async (records) => {
      assert.equal(records.length, 1)
      return { imported: 1, skipped: 0 }
    },
    getImageBlob: async () => null,
    deleteImage: async () => {},
  }
  const exp = await exportBackup({ storage: store, imageStore: fakeImages })
  assert.equal(JSON.parse(exp.json).data.images.length, 1, '备份包应含照片')

  const res = await importBackup(exp.json, { storage: fakeStorage(), imageStore: fakeImages, mode: 'overwrite' })
  assert.equal(res.ok, true, res.reason)
  assert.equal(res.images.imported, 1)
})

await acheck('照片导入失败时回滚新照片，且结构化数据仍在并如实告警', async () => {
  const deleted = []
  const failImages = {
    getImageBlob: async () => null,
    importImages: async () => { throw new Error('IndexedDB unavailable') },
    deleteImage: async (id) => { deleted.push(id) },
  }
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '' },
    data: {
      wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: '',
      images: [{ id: 'p-9', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,BBBB' }],
    },
  })
  const dst = fakeStorage()
  const res = await importBackup(payload, { storage: dst, imageStore: failImages, mode: 'overwrite' })
  assert.equal(res.ok, true, '结构化数据已写入，整体仍算成功')
  assert.equal(res.images.imported, 0)
  assert.equal(res.images.rolledBack, true)
  assert.deepEqual(deleted, ['p-9'], '只回滚本包新进的照片')
  assert.ok(res.warnings.some((w) => w.includes('照片导入失败')), '必须如实告警')
})

await acheck('dryRun：只算计划不写盘', async () => {
  const dst = fakeStorage()
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '' },
    data: { wardrobe: { version: 1, items: [item()] }, preferences: { version: 1 }, looks: [], theme: '', images: [] },
  })
  const res = await importBackup(payload, { storage: dst, dryRun: true })
  assert.equal(res.ok, true)
  assert.equal(res.dryRun, true)
  assert.ok(res.plan.writes.length > 0)
  assert.equal(dst._dump()[STORAGE_KEYS.wardrobe], undefined, 'dryRun 不得写盘')
})

// ============================================================ 主题裸字符串契约
// ThemeToggle.jsx:30 用 setItem(key, mode) 直接写裸字符串，读回用 isMode(raw) 比对。
// 备份若按 JSON 读写，主题会在导出时丢失、在导入后被判非法而回退 auto。
await acheck('主题往返：导出读到裸字符串，导入写回裸字符串（非 JSON 引号串）', async () => {
  const src = fakeStorage({ [STORAGE_KEYS.theme]: 'dark' })
  const { backup } = collectBackup({ storage: src })
  assert.equal(backup.data.theme, 'dark', '裸字符串 dark 必须被原样读出，不能被 JSON.parse 吃掉')
  assert.equal(BACKUP_THEME_MODES.includes(backup.data.theme), true)

  const dst = fakeStorage()
  const res = await importBackup(JSON.stringify(backup), { storage: dst, mode: 'overwrite' })
  assert.equal(res.ok, true, res.reason)
  assert.equal(dst.getItem(STORAGE_KEYS.theme), 'dark', '必须是裸字符串 dark，不能是 "dark"（含引号）')
})

await acheck('主题合并：仅在本地缺失时采用导入值，本地已有则不覆盖', async () => {
  const payload = JSON.stringify({
    schema: BACKUP_SCHEMA, version: 1, exportedAt: '', app: { version: '' },
    data: { wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: 'dark', images: [] },
  })
  const empty = fakeStorage()
  await importBackup(payload, { storage: empty, mode: 'merge' })
  assert.equal(empty.getItem(STORAGE_KEYS.theme), 'dark', '本地为空时采用导入主题')

  const occupied = fakeStorage({ [STORAGE_KEYS.theme]: 'light' })
  await importBackup(payload, { storage: occupied, mode: 'merge' })
  assert.equal(occupied.getItem(STORAGE_KEYS.theme), 'light', '合并模式不得覆盖本地已有主题')
})

// ============================================================ 重置
check('resetAll：清空全部已知 key，且不碰无关 key', () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({ version: 1, items: [item()] }),
    [STORAGE_KEYS.preferences]: JSON.stringify({ version: 1 }),
    [STORAGE_KEYS.looks]: JSON.stringify([look()]),
    [STORAGE_KEYS.theme]: 'dark',
    'unrelated:key': 'keep-me',
  })
  const res = resetAll(storage)
  assert.equal(res.ok, true)
  assert.deepEqual(res.cleared.sort(), Object.values(STORAGE_KEYS).sort())
  assert.equal(storage.getItem('unrelated:key'), 'keep-me', '不得误删非本应用的 key')
  Object.values(STORAGE_KEYS).forEach((k) => assert.equal(storage.getItem(k), null, `${k} 应被清空`))
})

check('resetAll：storage 不可用时明确失败且不抛', () => {
  const res = resetAll(null)
  assert.equal(res.ok, false)
  assert.equal(res.cleared.length, 0)
  assert.ok(res.errors[0].message.includes('localStorage'))
})

check('resetAll：单个 key 抛错不影响其余 key，且如实上报', () => {
  const storage = fakeStorage({ [STORAGE_KEYS.wardrobe]: 'x', [STORAGE_KEYS.looks]: 'y' })
  storage.removeItem = (k) => { throw new Error(`blocked:${k}`) }
  const res = resetAll(storage)
  assert.equal(res.ok, false)
  assert.equal(res.errors.length, Object.values(STORAGE_KEYS).length)
  assert.equal(res.cleared.length, 0)
})

check('resetAll 后 collectBackup 仍能产出一个合法（空）包，不抛', () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({ version: 1, items: [item()] }),
    [STORAGE_KEYS.theme]: 'dark',
  })
  resetAll(storage)
  const { backup } = collectBackup({ storage })
  assert.equal(backup.data.wardrobe.items.length, 0)
  assert.equal(backup.data.theme, '')
  assert.equal(validateBackup(backup).ok, true, '重置后的空包仍须可通过校验')
})

console.log(failed === 0
  ? `\n✓ 备份 v1 断言全部通过（${CORRUPT.length} 种损坏包 + 合并/覆盖/回滚/重置策略）`
  : `\n❌ 备份 v1 有 ${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)

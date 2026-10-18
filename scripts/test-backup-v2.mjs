// 备份包 v2 增量断言：node scripts/test-backup-v2.mjs
//
// v2 相对 v1 只多了两样长期累积的数据：每日条件（daily）与穿搭日历（calendar）。
// 这两个字段的风险和衣橱不同——它们没有「重建成本低」的兜底，
// 一旦被 v1 备份或默认值静默覆盖，用户几个月的记录就没了。
// 所以这里专门盯四件事：
//   1) v1 包缺字段时不得动本地的 daily / calendar；
//   2) merge 只在真正产生变化时写盘（否则一次无谓写会把 updatedAt 语义弄乱）；
//   3) 冲突按 updatedAt 取新，且「导入方没时间戳」不等于「导入方更新」；
//   4) 坏条目逐条丢弃，不因一条脏数据否掉整份日历。
//
// 本脚本不依赖浏览器：localStorage 用内存假对象注入。
import assert from 'node:assert/strict'
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  STORAGE_KEYS,
  collectBackup,
  exportBackup,
  importBackup,
  mergeCalendar,
  mergeDaily,
  planImport,
  resetAll,
  sanitizeCalendar,
  sanitizeDaily,
  validateBackup,
} from '../src/data/backup.js'

let failed = 0
const ok = (m) => console.log('✓ ' + m)
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}
const acheck = async (label, fn) => {
  try { await fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}

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

const daily = (over = {}) => ({
  version: 1, city: '上海', temp: 18, condition: 'rain', wind: 'light',
  indoor: 'normal', commute: 'walk', occasion: 'work', updatedAt: '2026-03-01T00:00:00.000Z', ...over,
})

const entry = (over = {}) => ({
  id: 'c-1', date: '2026-03-01',
  outfit: { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] },
  weather: { temp: 18, condition: 'rain' }, occasion: 'work', note: '',
  rating: 4, createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z', ...over,
})

const calendar = (entries) => ({ version: 1, entries })

/** 造一个 v1 包：data 里没有 daily / calendar。 */
const v1Package = () => ({
  schema: BACKUP_SCHEMA, version: 1, exportedAt: '2026-02-01T00:00:00.000Z',
  app: { version: '1.0.0' },
  data: { wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: 'dark', images: [] },
})

/** 把 daily/calendar 塞进一个合法包。 */
const pkgWith = (data) => ({
  schema: BACKUP_SCHEMA, version: 2, exportedAt: '2026-03-02T00:00:00.000Z',
  app: { version: '2.0.0' },
  data: {
    wardrobe: { version: 1, items: [] }, preferences: { version: 1 }, looks: [], theme: '', images: [],
    ...data,
  },
})

console.log('— 版本与契约 —')
check('BACKUP_VERSION 已提升到 2', () => assert.equal(BACKUP_VERSION, 2))
check('STORAGE_KEYS 覆盖 daily 与 calendar', () => {
  assert.equal(STORAGE_KEYS.daily, 'stylelab:daily:v1')
  assert.equal(STORAGE_KEYS.calendar, 'stylelab:calendar:v1')
})
check('version=3 的包被拒（高版本拒绝）', () => {
  const r = validateBackup({ ...v1Package(), version: 3 })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'unsupported-version')
})
check('v1 包仍可校验通过，且 daily/calendar 记为 null', () => {
  const r = validateBackup(v1Package())
  assert.equal(r.ok, true)
  assert.equal(r.backup.data.daily, null)
  assert.equal(r.backup.data.calendar, null)
})

console.log('— v1 包不得抹掉本地的 daily / calendar —')
check('v1 包合并：本地已有 daily/calendar 时两条 key 都不写', () => {
  const plan = planImport(
    { daily: daily(), calendar: calendar([entry()]) },
    validateBackup(v1Package()).backup,
    { mode: 'merge' },
  )
  const keys = plan.writes.map((w) => w.key)
  assert.equal(keys.includes(STORAGE_KEYS.daily), false, 'daily 被误写')
  assert.equal(keys.includes(STORAGE_KEYS.calendar), false, 'calendar 被误写')
})
check('v1 包覆盖模式：本地 daily/calendar 同样保留', () => {
  const plan = planImport(
    { daily: daily(), calendar: calendar([entry()]) },
    validateBackup(v1Package()).backup,
    { mode: 'overwrite' },
  )
  const keys = plan.writes.map((w) => w.key)
  assert.equal(keys.includes(STORAGE_KEYS.daily), false)
  assert.equal(keys.includes(STORAGE_KEYS.calendar), false)
})
check('v1 包导入不得把 daily 覆盖成默认条件', () => {
  const cur = daily({ city: '北京', temp: -5, condition: 'snow' })
  const merged = mergeDaily(cur, null, 'merge')
  assert.equal(merged.changed, false)
  assert.equal(merged.value.city, '北京')
})
check('v1 包导入不得清空本地日历', () => {
  const merged = mergeCalendar(calendar([entry(), entry({ id: 'c-2', date: '2026-03-02' })]), null, 'merge')
  assert.equal(merged.changed, false)
  assert.equal(merged.value.entries.length, 2)
})

console.log('— daily 冲突策略 —')
check('daily 合并：导入方 updatedAt 更新则采用导入', () => {
  const merged = mergeDaily(daily(), daily({ city: '广州', updatedAt: '2026-04-01T00:00:00.000Z' }), 'merge')
  assert.equal(merged.changed, true)
  assert.equal(merged.value.city, '广州')
})
check('daily 合并：导入方 updatedAt 更旧则保留本地', () => {
  const merged = mergeDaily(daily({ city: '上海' }), daily({ city: '广州', updatedAt: '2026-01-01T00:00:00.000Z' }), 'merge')
  assert.equal(merged.changed, false)
  assert.equal(merged.value.city, '上海')
})
check('daily 合并：导入方无 updatedAt 不覆盖本地', () => {
  const merged = mergeDaily(daily(), daily({ city: '广州', updatedAt: '' }), 'merge')
  assert.equal(merged.changed, false)
  assert.equal(merged.value.city, '上海')
})

console.log('— 日历冲突策略 —')
check('calendar 合并：新 id 追加、同 id 取 updatedAt 新者、旧者记 kept', () => {
  const merged = mergeCalendar(
    calendar([entry(), entry({ id: 'c-2', date: '2026-03-02', rating: 3 })]),
    calendar([
      entry({ rating: 5, updatedAt: '2026-03-10T00:00:00.000Z' }),
      entry({ id: 'c-2', date: '2026-03-02', rating: 1, updatedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'c-3', date: '2026-03-03' }),
    ]),
    'merge',
  )
  assert.equal(merged.stats.added, 1)
  assert.equal(merged.stats.updated, 1)
  assert.equal(merged.stats.kept, 1)
  assert.equal(merged.changed, true)
  const byId = Object.fromEntries(merged.value.entries.map((e) => [e.id, e]))
  assert.equal(byId['c-1'].rating, 5, 'c-1 应采用更新的导入版本')
  assert.equal(byId['c-2'].rating, 3, 'c-2 导入版本更旧，应保留本地版本')
  assert.ok(byId['c-3'], 'c-3 应被追加')
})
check('calendar 合并：无变化时 changed=false（不产生无谓写盘）', () => {
  const merged = mergeCalendar(calendar([entry()]), calendar([entry()]), 'merge')
  assert.equal(merged.changed, false)
  assert.equal(merged.stats.added + merged.stats.updated, 0)
})
check('calendar 覆盖模式：完全替换并报告 stats', () => {
  const merged = mergeCalendar(calendar([entry(), entry({ id: 'c-2', date: '2026-03-02' })]), calendar([entry({ id: 'c-9', date: '2026-03-09' })]), 'overwrite')
  assert.equal(merged.value.entries.length, 1)
  assert.equal(merged.value.entries[0].id, 'c-9')
  assert.equal(merged.stats.added, 1)
})
check('calendar 合并后按日期倒序，最新一天在最前', () => {
  const merged = mergeCalendar(
    calendar([]),
    calendar([entry({ id: 'c-1', date: '2026-03-01' }), entry({ id: 'c-2', date: '2026-03-20' }), entry({ id: 'c-3', date: '2026-03-10' })]),
    'merge',
  )
  assert.deepEqual(merged.value.entries.map((e) => e.date), ['2026-03-20', '2026-03-10', '2026-03-01'])
})

console.log('— 坏数据清洗 —')
check('sanitizeCalendar：缺 id / 日期非法 / 重复 id 逐条丢弃并给理由', () => {
  const r = sanitizeCalendar(calendar([
    entry({ id: '' }),
    entry({ id: 'c-2', date: '2026/03/02' }),
    entry({ id: 'c-3', date: '2026-03-03' }),
    entry({ id: 'c-3', date: '2026-03-04' }),
  ]))
  assert.equal(r.value.entries.length, 1)
  assert.equal(r.value.entries[0].id, 'c-3')
  assert.equal(r.warnings.length, 3)
})
check('sanitizeCalendar：rating 越界置 null，accs 过滤非字符串', () => {
  const r = sanitizeCalendar(calendar([entry({ rating: 9, outfit: { top: 't-white', accs: ['a-watch', 7, null] } })]))
  const e = r.value.entries[0]
  assert.equal(e.rating, null)
  assert.deepEqual(e.outfit.accs, ['a-watch'])
})
check('sanitizeCalendar：entries 非数组时按空日历处理而不抛', () => {
  const r = sanitizeCalendar({ version: 1, entries: 'nope' })
  assert.deepEqual(r.value.entries, [])
  assert.equal(r.warnings.length, 1)
})
// 回归：变异测试曾证明这里是盲区——把 sanitizeCalendar 的排序方向改反，
// 5 个测试脚本全绿但行为已变（原始 e2,e1,e3 → 变异后 e3,e1,e2）。
// 这条钉死「清洗后按日期降序」这个不变量。
check('sanitizeCalendar：清洗后按日期降序排列（变异测试曾漏掉此断言）', () => {
  const r = sanitizeCalendar(calendar([
    entry({ id: 'c-1', date: '2026-03-01' }),
    entry({ id: 'c-2', date: '2026-03-20' }),
    entry({ id: 'c-3', date: '2026-03-10' }),
  ]))
  assert.deepEqual(r.value.entries.map((e) => e.date), ['2026-03-20', '2026-03-10', '2026-03-01'])
  // 换一个插入顺序再验一次，排除「降序是碰巧由插入顺序造成的」
  const reversed = sanitizeCalendar(calendar([
    entry({ id: 'c-3', date: '2026-03-10' }),
    entry({ id: 'c-1', date: '2026-03-01' }),
    entry({ id: 'c-2', date: '2026-03-20' }),
  ]))
  assert.deepEqual(reversed.value.entries.map((e) => e.date), ['2026-03-20', '2026-03-10', '2026-03-01'])
})
// 回归：ISO 时间戳带不带毫秒是不同的字符串，却表示同一时刻。
// 旧实现直接比字符串，会把 '…:00.000Z' 判成比 '…:00Z' 新，从而在合并时选错一边。
check('mergeDaily：同一时刻的两种 ISO 写法不会被误判为「更新」', () => {
  const base = { version: 1, updatedAt: '2026-03-01T06:00:00Z', date: '2026-03-01', temp: 20 }
  const sameMoment = { version: 1, updatedAt: '2026-03-01T06:00:00.000Z', date: '2026-03-01', temp: 30 }
  const merged = mergeDaily(base, sameMoment)
  assert.equal(merged.value.temp, 20, `同一时刻不应判为更新，实际 temp=${merged.value.temp}`)
})
check('mergeDaily：真正更晚的时间戳仍然覆盖', () => {
  const base = { version: 1, updatedAt: '2026-03-01T06:00:00.000Z', date: '2026-03-01', temp: 20 }
  const later = { version: 1, updatedAt: '2026-03-01T07:00:00.000Z', date: '2026-03-01', temp: 30 }
  assert.equal(mergeDaily(base, later).value.temp, 30)
})
check('sanitizeDaily：温度越界夹取、枚举非法回默认并告警', () => {
  const r = sanitizeDaily({ city: '上海', temp: 999, condition: 'hail', wind: 'typhoon', occasion: 'gala' })
  assert.equal(r.value.temp, 45)
  assert.equal(r.value.condition, 'clear')
  assert.equal(r.value.wind, 'light')
  assert.equal(r.value.occasion, 'casual')
  assert.ok(r.warnings.length >= 4)
})
check('sanitizeDaily：非对象输入重置为默认条件且不抛', () => {
  const r = sanitizeDaily('rain')
  assert.equal(r.value.temp, 20)
  assert.equal(r.value.condition, 'clear')
})

console.log('— 导出 / 导入往返 —')
check('collectBackup：本地没有 daily/calendar 时导出 null', () => {
  const r = collectBackup({ storage: fakeStorage(), appVersion: '2.0.0' })
  assert.equal(r.backup.data.daily, null)
  assert.equal(r.backup.data.calendar, null)
  assert.equal(r.backup.version, 2)
})
check('collectBackup：本地有 daily/calendar 时原样带出', () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.daily]: JSON.stringify(daily()),
    [STORAGE_KEYS.calendar]: JSON.stringify(calendar([entry()])),
  })
  const r = collectBackup({ storage, appVersion: '2.0.0' })
  assert.equal(r.backup.data.daily.city, '上海')
  assert.equal(r.backup.data.calendar.entries.length, 1)
})
await acheck('exportBackup -> importBackup(overwrite) 到空 storage 后 daily/calendar 完整落盘', async () => {
  const from = fakeStorage({
    [STORAGE_KEYS.daily]: JSON.stringify(daily()),
    [STORAGE_KEYS.calendar]: JSON.stringify(calendar([entry()])),
  })
  const exported = await exportBackup({ storage: from, appVersion: '2.0.0' })
  assert.equal(exported.ok, true)
  const to = fakeStorage()
  const imported = await importBackup(exported.json, { storage: to, mode: 'overwrite' })
  assert.equal(imported.ok, true)
  const back = collectBackup({ storage: to, appVersion: '2.0.0' })
  assert.equal(back.backup.data.daily.city, '上海')
  assert.equal(back.backup.data.daily.condition, 'rain')
  assert.equal(back.backup.data.calendar.entries.length, 1)
  assert.equal(back.backup.data.calendar.entries[0].rating, 4)
})
await acheck('v1 包导入到已有 daily/calendar 的 storage：两条 key 原样保留', async () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.daily]: JSON.stringify(daily({ city: '成都' })),
    [STORAGE_KEYS.calendar]: JSON.stringify(calendar([entry()])),
  })
  const imported = await importBackup(JSON.stringify(v1Package()), { storage, mode: 'merge' })
  assert.equal(imported.ok, true)
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.daily)).city, '成都')
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.calendar)).entries.length, 1)
})
await acheck('dryRun 只算计划不写盘，且 stats 含 daily/calendar', async () => {
  const storage = fakeStorage()
  const result = await importBackup(JSON.stringify(pkgWith({ daily: daily(), calendar: calendar([entry()]) })), { storage, mode: 'merge', dryRun: true })
  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  assert.equal(storage.getItem(STORAGE_KEYS.daily), null)
  assert.equal(storage.getItem(STORAGE_KEYS.calendar), null)
  assert.ok(result.stats.daily && result.stats.calendar)
})
await acheck('exportBackup：照片被跳过时给出可见 warning，而不是假装备份完整', async () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.wardrobe]: JSON.stringify({
      version: 1,
      items: [
        { id: 'u-1', name: '白衬衫', category: 'tops', hex: '#f1efe8', formality: 2, warmth: 2, fit: 'regular', status: 'owned', photoId: 'img-huge' },
        { id: 'u-2', name: '黑T', category: 'tops', hex: '#23242a', formality: 1, warmth: 1, fit: 'regular', status: 'owned' },
      ],
    }),
  })
  const skippedIds = []
  const imageStore = {
    exportImages: async (ids, options) => {
      // 模拟 exportImages 的真实行为：超限照片不返回，但要通过 onSkip 上报。
      options.onSkip({ id: 'img-huge', reason: '编码后超过 4MB 上限', size: 5 * 1024 * 1024 })
      skippedIds.push(...(ids || []))
      return []
    },
  }
  const exported = await exportBackup({ storage, imageStore, appVersion: '2.0.0' })
  assert.equal(exported.ok, true)
  assert.deepEqual(skippedIds, ['img-huge'], '应只导出衣橱引用到的照片 id')
  assert.ok(
    exported.warnings.some((w) => w.includes('1 张照片未写入备份包')),
    `warnings 里应有缺图提示，实际：${JSON.stringify(exported.warnings)}`,
  )
  assert.equal(exported.backup.data.images.length, 0)
})

await acheck('exportBackup：bytes 字段是 JSON 的真实字节数，可用于体积提示', async () => {
  const exported = await exportBackup({ storage: fakeStorage(), appVersion: '2.0.0' })
  assert.equal(exported.bytes, Buffer.byteLength(exported.json, 'utf8'))
  assert.ok(exported.bytes > 0)
})

check('resetAll 会清掉 daily 与 calendar', () => {
  const storage = fakeStorage({
    [STORAGE_KEYS.daily]: JSON.stringify(daily()),
    [STORAGE_KEYS.calendar]: JSON.stringify(calendar([entry()])),
    'stylelab:unrelated': 'keep-me',
  })
  const r = resetAll(storage)
  assert.equal(r.ok, true)
  assert.equal(storage.getItem(STORAGE_KEYS.daily), null)
  assert.equal(storage.getItem(STORAGE_KEYS.calendar), null)
  assert.equal(storage.getItem('stylelab:unrelated'), 'keep-me')
})

console.log('')
if (failed > 0) {
  console.error(`❌ 备份 v2 断言失败 ${failed} 项`)
  process.exit(1)
}
console.log('✓ 备份 v2 断言全部通过（v1 兼容 + daily/calendar 合并 + 坏数据清洗 + 往返）')

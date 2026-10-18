// 穿搭日历 v1 断言：node scripts/test-calendar.mjs
//
// 这个模块的风险和前两个不同：它记的是**已经发生过的事**，写错一条就是永久
// 错误的历史。所以测试重点放在三处：
//   1) 本地日期不许 UTC 跨日（早上 8 点前记「今天」最容易错到这里）；
//   2) 坏数据逐条丢弃，不能让一条脏记录否掉整份日历；
//   3) 统计口径可复算（天数/造型数/连击/闲置阈值）。
//
// 纯 Node：storage 用内存假对象注入。
import assert from 'node:assert/strict'
import {
  CALENDAR_KEY,
  IDLE_THRESHOLDS,
  MAX_NOTE,
  addEntry,
  allEntries,
  createCalendar,
  daysBetween,
  entriesInMonth,
  entriesOnDate,
  idleItems,
  isValidDateString,
  itemFrequency,
  listReminders,
  localDateKey,
  markedDates,
  monthStats,
  normalizeCalendar,
  outfitItemIds,
  personalIdsInOutfit,
  readCalendar,
  removeEntry,
  repeatStreak,
  sameOutfit,
  shiftDateKey,
  todayKey,
  updateEntry,
  writeCalendar,
} from '../src/data/calendar.js'

let failed = 0
const ok = (m) => console.log('✓ ' + m)
const bad = (m) => { console.error('❌ ' + m); failed++ }
const check = (label, fn) => {
  try { fn(); ok(label) } catch (e) { bad(`${label} — ${e.message}`) }
}

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _dump: () => Object.fromEntries(map),
  }
}

const OUTFIT = { top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch'] }
const wardrobe = { items: [
  { id: 'u-1', name: '我的白衬衫', category: 'tops', status: 'owned', lastWornAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-2', name: '我的黑裤', category: 'bottoms', status: 'owned', lastWornAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-3', name: '闲置外套', category: 'outers', status: 'owned', lastWornAt: '2026-01-05T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u-4', name: '想买的上衣', category: 'tops', status: 'wishlist', lastWornAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
] }

/** 从零搭一份日历：entries 按给定日期与造型写入。 */
function build(rows) {
  let state = createCalendar()
  for (const row of rows) {
    const result = addEntry(state, row)
    assert.equal(result.errors.length, 0, `addEntry 失败：${result.errors.join('，')}`)
    state = result.state
  }
  return state
}

console.log('— 本地日期不许 UTC 跨日 —')
check('localDateKey 用本地年月日：23:30 仍算当天', () => {
  assert.equal(localDateKey(new Date(2026, 2, 1, 23, 30)), '2026-03-01')
})
check('localDateKey 用本地年月日：00:10 已是次日', () => {
  assert.equal(localDateKey(new Date(2026, 2, 2, 0, 10)), '2026-03-02')
})
check('localDateKey 不受 UTC 偏移影响（同一本地时刻两种构造方式结果一致）', () => {
  const byParts = localDateKey(new Date(2026, 0, 1, 0, 5))
  const byString = localDateKey(new Date('2026-01-01T00:05:00'))
  assert.equal(byParts, '2026-01-01')
  assert.equal(byString, '2026-01-01')
})
check('todayKey 接受注入的 now', () => {
  assert.equal(todayKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31')
})
check('isValidDateString 拒绝不存在的日期与宽松格式', () => {
  assert.equal(isValidDateString('2026-02-28'), true)
  assert.equal(isValidDateString('2024-02-29'), true)
  assert.equal(isValidDateString('2026-02-30'), false)
  assert.equal(isValidDateString('2026-13-01'), false)
  assert.equal(isValidDateString('2026-3-1'), false)
  assert.equal(isValidDateString(''), false)
  assert.equal(isValidDateString(null), false)
})
check('shiftDateKey 与 daysBetween 跨月跨年跨闰年正确', () => {
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDateKey('2024-03-01', -1), '2024-02-29')
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01')
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1)
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2)
  assert.equal(daysBetween('2026-03-01', '2026-02-28'), -1)
  assert.equal(daysBetween('bad', '2026-03-01'), null)
})

console.log('— CRUD —')
check('addEntry 缺省日期为注入的「今天」，并写入 createdAt/updatedAt', () => {
  const r = addEntry(createCalendar(), { outfit: OUTFIT, now: new Date(2026, 2, 5, 9, 0) })
  assert.equal(r.entry.date, '2026-03-05')
  assert.equal(r.entry.createdAt, r.entry.updatedAt)
  assert.ok(r.entry.id.startsWith('c-'))
})
check('addEntry 拒绝非法日期且不改动状态', () => {
  const r = addEntry(createCalendar(), { date: '2026-02-30', outfit: OUTFIT })
  assert.equal(r.entry, null)
  assert.equal(r.errors.length, 1)
  assert.equal(r.state.entries.length, 0)
})
check('addEntry 清洗 rating 与超长 note', () => {
  const r = addEntry(createCalendar(), { date: '2026-03-01', outfit: OUTFIT, rating: 9, note: 'x'.repeat(MAX_NOTE + 50) })
  assert.equal(r.entry.rating, null)
  assert.equal(r.entry.note.length, MAX_NOTE)
})
check('addEntry 丢弃未知单品 id 并给 warning，不抛异常', () => {
  const r = addEntry(createCalendar(), { date: '2026-03-01', outfit: { ...OUTFIT, top: 'not-a-real-id', accs: ['a-watch', 'nope'] } })
  assert.equal(r.entry.outfit.top, null)
  assert.deepEqual(r.entry.outfit.accs, ['a-watch'])
  assert.ok(r.warnings.length >= 2)
})
check('addEntry 允许 u- 个人单品并在造型里保留', () => {
  const r = addEntry(createCalendar(), { date: '2026-03-01', outfit: { ...OUTFIT, top: 'u-1' } })
  assert.equal(r.entry.outfit.top, 'u-1')
  assert.deepEqual(personalIdsInOutfit(r.entry.outfit), ['u-1'])
})
check('同日可记多条，超过上限被拒', () => {
  let state = createCalendar()
  for (let i = 0; i < 20; i++) {
    const r = addEntry(state, { date: '2026-03-01', outfit: { ...OUTFIT, shoes: i % 2 ? 's-white' : 's-runner' } })
    assert.equal(r.errors.length, 0, `第 ${i + 1} 条被误拒`)
    state = r.state
  }
  const over = addEntry(state, { date: '2026-03-01', outfit: OUTFIT })
  assert.equal(over.entry, null)
  assert.equal(over.errors.length, 1)
})
check('updateEntry 局部更新，未提供的字段保持原值', () => {
  const state = build([{ date: '2026-03-01', outfit: OUTFIT, occasion: 'work', rating: 4, note: '通勤' }])
  const id = state.entries[0].id
  const r = updateEntry(state, id, { rating: 2 })
  assert.equal(r.entry.rating, 2)
  assert.equal(r.entry.occasion, 'work')
  assert.equal(r.entry.note, '通勤')
})
check('updateEntry 传 null 清空 weather，传非法日期则整体拒绝', () => {
  const state = build([{ date: '2026-03-01', outfit: OUTFIT, weather: { temp: 12, condition: 'rain' } }])
  const id = state.entries[0].id
  assert.equal(updateEntry(state, id, { weather: null }).entry.weather, null)
  const rejected = updateEntry(state, id, { date: '2026-13-01' })
  assert.equal(rejected.entry, null)
  assert.equal(rejected.errors.length, 1)
})
check('updateEntry 找不到 id 时明确报错且不改状态', () => {
  const state = build([{ date: '2026-03-01', outfit: OUTFIT }])
  const r = updateEntry(state, 'c-missing', { rating: 3 })
  assert.equal(r.entry, null)
  assert.equal(r.state.entries.length, 1)
  assert.equal(r.errors.length, 1)
})
check('removeEntry 返回 removed 标志，重复删不报错', () => {
  const state = build([{ date: '2026-03-01', outfit: OUTFIT }])
  const id = state.entries[0].id
  const first = removeEntry(state, id)
  assert.equal(first.removed, true)
  assert.equal(first.state.entries.length, 0)
  assert.equal(removeEntry(first.state, id).removed, false)
})
check('记录按日期倒序排列，同日按 createdAt 倒序', () => {
  const state = build([
    { date: '2026-03-01', outfit: OUTFIT, now: new Date('2026-03-01T08:00:00Z') },
    { date: '2026-03-20', outfit: OUTFIT, now: new Date('2026-03-20T08:00:00Z') },
    { date: '2026-03-10', outfit: OUTFIT, now: new Date('2026-03-10T08:00:00Z') },
  ])
  assert.deepEqual(state.entries.map((e) => e.date), ['2026-03-20', '2026-03-10', '2026-03-01'])
})

console.log('— 坏数据清洗与持久化 —')
check('normalizeCalendar 逐条丢弃坏记录并给出理由', () => {
  const r = normalizeCalendar({ version: 1, entries: [
    null,
    { id: 'c-1', date: '2026/03/01' },
    { date: '2026-03-01' },
    { id: 'c-2', date: '2026-03-02', outfit: OUTFIT, rating: 9 },
    { id: 'c-2', date: '2026-03-03', outfit: OUTFIT },
    'garbage',
  ] })
  assert.equal(r.state.entries.length, 1)
  assert.equal(r.state.entries[0].id, 'c-2')
  assert.equal(r.state.entries[0].rating, null)
  assert.ok(r.warnings.length >= 5)
})
check('normalizeCalendar 对非对象 / entries 非数组都按空日历处理且不抛', () => {
  assert.equal(normalizeCalendar('[]').state.entries.length, 0)
  assert.equal(normalizeCalendar({ version: 1, entries: 'x' }).state.entries.length, 0)
  assert.equal(normalizeCalendar(undefined).state.entries.length, 0)
})
check('readCalendar：storage 损坏 JSON 时按空日历启动并告警', () => {
  const r = readCalendar(fakeStorage({ [CALENDAR_KEY]: '{{{not json' }))
  assert.equal(r.state.entries.length, 0)
  assert.equal(r.warnings.length, 1)
})
check('readCalendar：key 缺失时 missing=true 且无警告', () => {
  const r = readCalendar(fakeStorage())
  assert.equal(r.missing, true)
  assert.equal(r.warnings.length, 0)
})
check('readCalendar：无 storage 时安全降级', () => {
  const r = readCalendar(null)
  assert.equal(r.state.entries.length, 0)
  assert.equal(r.warnings.length, 1)
})
check('writeCalendar 往返一致；storage 抛错时返回 ok:false 而不抛', () => {
  const storage = fakeStorage()
  const state = build([{ date: '2026-03-01', outfit: OUTFIT, rating: 5, note: '好' }])
  assert.equal(writeCalendar(storage, state).ok, true)
  const back = readCalendar(storage)
  assert.equal(back.state.entries.length, 1)
  assert.equal(back.state.entries[0].rating, 5)
  const blocked = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {} }
  const r = writeCalendar(blocked, state)
  assert.equal(r.ok, false)
  assert.ok(r.error instanceof Error)
})

console.log('— 查询与统计 —')
check('entriesOnDate / markedDates / allEntries', () => {
  const state = build([
    { date: '2026-03-01', outfit: OUTFIT },
    { date: '2026-03-01', outfit: { ...OUTFIT, top: 't-black' } },
    { date: '2026-03-02', outfit: OUTFIT },
  ])
  assert.equal(entriesOnDate(state, '2026-03-01').length, 2)
  assert.equal(entriesOnDate(state, 'bad').length, 0)
  assert.equal(markedDates(state).get('2026-03-01'), 2)
  assert.equal(allEntries(state).length, 3)
})
check('entriesInMonth 覆盖 1 月 / 12 月 / 闰年 2 月边界', () => {
  const state = build([
    { date: '2026-01-01', outfit: OUTFIT },
    { date: '2026-01-31', outfit: OUTFIT },
    { date: '2026-02-01', outfit: OUTFIT },
    { date: '2026-12-31', outfit: OUTFIT },
    { date: '2024-02-29', outfit: OUTFIT },
  ])
  assert.equal(entriesInMonth(state, { year: 2026, month: 1 }).length, 2)
  assert.equal(entriesInMonth(state, { year: 2026, month: 2 }).length, 1)
  assert.equal(entriesInMonth(state, { year: 2026, month: 12 }).length, 1)
  assert.equal(entriesInMonth(state, { year: 2024, month: 2 }).length, 1)
  assert.equal(entriesInMonth(state, { year: 2026, month: 13 }).length, 0)
})
check('monthStats 口径可复算：天数/造型数/评分均值/高频单品/分布', () => {
  const state = build([
    { date: '2026-03-01', outfit: OUTFIT, occasion: 'work', rating: 4, weather: { temp: 12, condition: 'rain' } },
    { date: '2026-03-01', outfit: OUTFIT, occasion: 'work', rating: 2, weather: { temp: 12, condition: 'rain' } },
    { date: '2026-03-05', outfit: { ...OUTFIT, top: 't-black', accs: ['a-watch'] }, occasion: 'casual', rating: 5 },
  ])
  const s = monthStats(state, { year: 2026, month: 3, wardrobe })
  assert.equal(s.days, 2)
  assert.equal(s.entries, 3)
  assert.equal(s.outfits, 2, '同日同一套只算一套')
  assert.equal(s.ratingAvg, 3.7)
  // a-watch 三套都戴 → 3 次；t-white 只在前两套里 → 2 次。
  assert.equal(s.topItems[0].id, 'a-watch')
  assert.equal(s.topItems[0].count, 3)
  assert.equal(s.topItems.find((i) => i.id === 't-white').count, 2)
  const tied = s.topItems.filter((i) => i.count === 2).map((i) => i.id)
  assert.deepEqual(tied, [...tied].sort(), '同分时按 id 升序，保证顺序可复算')
  assert.equal(s.byOccasion[0].count, 2)
  assert.equal(s.byCondition[0].label, '雨')
  assert.equal(s.busiestDay.date, '2026-03-01')
  assert.equal(s.busiestDay.count, 2)
})
check('monthStats：空月份返回零值与 null 均值，不抛', () => {
  const s = monthStats(createCalendar(), { year: 2026, month: 7 })
  assert.equal(s.entries, 0)
  assert.equal(s.ratingAvg, null)
  assert.equal(s.busiestDay, null)
})
check('itemFrequency 只统计窗口内记录，并带出最后出现日期', () => {
  const state = build([
    { date: '2026-10-15', outfit: OUTFIT },
    { date: '2026-10-14', outfit: { ...OUTFIT, top: 'u-1' } },
    { date: '2026-06-01', outfit: OUTFIT },
  ])
  const freq = itemFrequency(state, { days: 7, now: new Date(2026, 9, 15), wardrobe })
  assert.equal(freq.find((f) => f.id === 't-white').count, 1)
  assert.equal(freq.find((f) => f.id === 'u-1').name, '我的白衬衫')
  assert.equal(freq.find((f) => f.id === 'u-1').lastDate, '2026-10-14')
})
check('idleItems：按 30/60/90 阈值判定，从未穿过排最前', () => {
  const state = build([{ date: '2026-10-15', outfit: OUTFIT }])
  const now = new Date(2026, 9, 15)
  const idle30 = idleItems({ state, wardrobe, days: 30, now })
  const ids30 = idle30.map((i) => i.id)
  assert.ok(ids30.includes('u-1'), '从未穿过应算闲置')
  assert.ok(ids30.includes('u-3'), '今年 1 月穿过，早已超过 30 天')
  assert.ok(ids30.includes('u-2'), '9 月 1 日穿过 = 44 天前，跨过 30 天线')
  assert.equal(ids30.includes('u-4'), false, 'wishlist 不该被算成闲置')
  assert.equal(idle30[0].neverWorn, true, '从未穿过的排最前')
  assert.equal(idle30.find((i) => i.id === 'u-1').days, null)
  const idle90 = idleItems({ state, wardrobe, days: 90, now }).map((i) => i.id)
  assert.equal(idle90.includes('u-2'), false, '44 天前穿过不该算 90 天闲置')
  assert.ok(idle90.includes('u-3'), '年初穿过应算 90 天闲置')
})
check('idleItems：日历里出现过但没点「穿了」的单品不算闲置', () => {
  const state = build([{ date: '2026-10-10', outfit: { ...OUTFIT, top: 'u-1' } }])
  const idle = idleItems({ state, wardrobe, days: 30, now: new Date(2026, 9, 15) })
  assert.equal(idle.some((i) => i.id === 'u-1'), false)
})
check('idleItems：阈值为 30/60/90 三者之一', () => {
  assert.deepEqual(IDLE_THRESHOLDS, [30, 60, 90])
})
check('repeatStreak 只在连续日期上累计，断档即归零', () => {
  const state = build([
    { date: '2026-03-01', outfit: OUTFIT },
    { date: '2026-03-02', outfit: OUTFIT },
    { date: '2026-03-03', outfit: OUTFIT },
    { date: '2026-03-07', outfit: OUTFIT },
  ])
  const streak = repeatStreak(state, { wardrobe, minRun: 3 })
  assert.equal(streak.itemId, 't-white')
  assert.equal(streak.length, 3)
  assert.equal(streak.repeated, true)
  assert.equal(streak.from, '2026-03-01')
  assert.equal(streak.to, '2026-03-03')
})
check('repeatStreak 未达阈值时 repeated=false', () => {
  const state = build([{ date: '2026-03-01', outfit: OUTFIT }, { date: '2026-03-02', outfit: OUTFIT }])
  assert.equal(repeatStreak(state, { minRun: 3 }).repeated, false)
})
check('listReminders 汇总闲置与连续重复，且每条都有中文 message', () => {
  const state = build([
    { date: '2026-10-15', outfit: { ...OUTFIT, top: 'u-1' } },
    { date: '2026-10-14', outfit: { ...OUTFIT, top: 'u-1' } },
    { date: '2026-10-13', outfit: { ...OUTFIT, top: 'u-1' } },
  ])
  const reminders = listReminders({ state, wardrobe, now: new Date(2026, 9, 15) })
  assert.ok(reminders.length > 0)
  assert.ok(reminders.every((r) => typeof r.message === 'string' && r.message.length > 0))
  const repeat = reminders.find((r) => r.kind === 'repeat')
  assert.ok(repeat, '应给出连续重复提醒')
  assert.equal(repeat.itemIds[0], 'u-1')
})

console.log('— 造型工具 —')
check('outfitItemIds 去重、跳过空值、含配饰', () => {
  assert.deepEqual(
    outfitItemIds({ top: 't-white', outer: null, bottom: 'b-jeans-d', shoes: 's-white', accs: ['a-watch', 'a-watch', null] }),
    ['t-white', 'b-jeans-d', 's-white', 'a-watch'],
  )
  assert.deepEqual(outfitItemIds(null), [])
})
check('personalIdsInOutfit 只挑 u- 前缀', () => {
  assert.deepEqual(personalIdsInOutfit({ ...OUTFIT, top: 'u-9' }), ['u-9'])
})
check('sameOutfit 配饰按集合比较，顺序不同仍算同一套', () => {
  assert.equal(sameOutfit(OUTFIT, { ...OUTFIT }), true)
  assert.equal(sameOutfit({ ...OUTFIT, accs: ['a-watch', 'a-cap'] }, { ...OUTFIT, accs: ['a-cap', 'a-watch'] }), true)
  assert.equal(sameOutfit(OUTFIT, { ...OUTFIT, top: 't-black' }), false)
})

console.log('')
if (failed > 0) {
  console.error(`❌ 穿搭日历断言失败 ${failed} 项`)
  process.exit(1)
}
console.log('✓ 穿搭日历断言全部通过（本地日期 + CRUD + 坏数据 + 统计口径）')

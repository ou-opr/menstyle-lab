// 穿搭日历 v1（契约 docs/PHASE2-CONTRACT.md §3）。
//
// 纯 ESM：不引用 React / DOM，可被 Node 直接 import 做单元测试；
// storage 通过参数注入，缺省取 wardrobe.js 的 defaultStorage（与 daily.js 一致）。
//
// 两条纪律贯穿全文件：
//   1) 日期一律用**本地**年月日拼 YYYY-MM-DD。用 toISOString() 会在 UTC+8 的
//      早上 8 点前把「今天」记成昨天，这类跨日 bug 在日历里是致命的。
//   2) 坏记录逐条丢弃并记 warning，绝不因为一条脏数据抛异常——用户几个月的
//      记录不能因为一行坏了就整块打不开。

import { findItem } from './catalog.js'
import { outfitItemIds, resolveItem } from './outfitShape.js'
import { defaultStorage } from './wardrobe.js'

export const CALENDAR_KEY = 'stylelab:calendar:v1'
export const CALENDAR_VERSION = 1

export const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']
export const SLOT_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋子', accs: '配饰' }
export const WEATHER_CONDITIONS = ['clear', 'cloudy', 'rain', 'snow']
export const CONDITION_LABELS = { clear: '晴', cloudy: '多云', rain: '雨', snow: '雪' }

export const MAX_ENTRIES = 2000
export const MAX_NOTE = 500
export const IDLE_THRESHOLDS = [30, 60, 90]
export const MAX_LOOKS_PER_DAY = 20

// ------------------------------------------------------------------ 基础工具

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v : '')
const asArray = (v) => (Array.isArray(v) ? v : [])
const pad2 = (n) => String(n).padStart(2, '0')
const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(v)))

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string' && value) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** 本地日期键（YYYY-MM-DD）。**不用 toISOString()**，避免 UTC 跨日。 */
export function localDateKey(date = new Date()) {
  const d = toDate(date)
  if (!d) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 「今天」的本地日期键。 */
export function todayKey(now = new Date()) {
  return localDateKey(now)
}

/** 严格校验 YYYY-MM-DD，且必须是真实存在的日期（2026-02-30 不通过）。 */
export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** 日期键 → 本地零点的 Date；非法返回 null。 */
export function parseDateKey(value) {
  if (!isValidDateString(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 两个日期键相差的天数（b - a）；任一非法返回 null。 */
export function daysBetween(a, b) {
  const da = parseDateKey(a)
  const db = parseDateKey(b)
  if (!da || !db) return null
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/** 日期键加减天数。 */
export function shiftDateKey(value, days) {
  const d = parseDateKey(value)
  if (!d || !Number.isFinite(days)) return ''
  d.setDate(d.getDate() + Math.round(days))
  return localDateKey(d)
}

function newId(existing) {
  const base = `c-${Date.now().toString(36)}`
  let id = base
  let n = 0
  while (existing.has(id)) { n += 1; id = `${base}-${n}` }
  return id
}

// ------------------------------------------------------------------ 单品解析

// resolveItem / outfitItemIds 的实现统一在 ./outfitShape.js：
// 此前 calendar 与 preferences 各有一份，且 calendar 版没排除 o-none，
// 于是「不穿外套」这个槽位哨兵被当成真实单品混进了月度高频榜。
// 这里转出同名符号，保持既有 import 路径可用（日历内多处调用 outfitItemIds）。
export { resolveItem, outfitItemIds }

function normalizeAccs(value, warnings, label) {
  const out = []
  for (const raw of asArray(value)) {
    const resolved = resolveItem(raw)
    if (!resolved) {
      if (raw !== null && raw !== undefined) warnings.push(`${label}：配饰 ${String(raw)} 不是已知单品，已丢弃`)
      continue
    }
    if (!out.includes(resolved.id)) out.push(resolved.id)
  }
  return out
}

/** 归一化一套造型：槽位缺失记 null，配饰数组去重。 */
export function normalizeOutfit(raw, { warnings = [], label = 'outfit' } = {}) {
  const source = isPlainObject(raw) ? raw : {}
  const outfit = {}
  for (const slot of SLOTS) {
    if (slot === 'accs') {
      outfit.accs = normalizeAccs(source.accs, warnings, label)
      continue
    }
    const value = source[slot]
    if (value === null || value === undefined || value === '') { outfit[slot] = null; continue }
    const resolved = resolveItem(value)
    if (!resolved) {
      warnings.push(`${label}：${SLOT_LABELS[slot]} ${String(value)} 不是已知单品，已置空`)
      outfit[slot] = null
      continue
    }
    outfit[slot] = resolved.id
  }
  return outfit
}

/** 造型里属于**个人衣橱**的单品 id（u- 前缀），用于记录穿着次数。 */
export function personalIdsInOutfit(outfit) {
  return outfitItemIds(outfit).filter((id) => id.startsWith('u-'))
}

/** 两个造型是否同一套（槽位逐个相等，配饰按集合比较）。 */
export function sameOutfit(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  for (const slot of SLOTS) {
    if (slot === 'accs') {
      const x = [...asArray(a.accs)].sort()
      const y = [...asArray(b.accs)].sort()
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false
      continue
    }
    if ((a[slot] ?? null) !== (b[slot] ?? null)) return false
  }
  return true
}

// ------------------------------------------------------------------ 状态与持久化

export function createCalendar() {
  return { version: CALENDAR_VERSION, entries: [] }
}

function normalizeWeather(raw, warnings, label) {
  if (raw === null || raw === undefined) return null
  if (!isPlainObject(raw)) {
    warnings.push(`${label}：weather 不是对象，已忽略`)
    return null
  }
  const temp = Number(raw.temp)
  const condition = WEATHER_CONDITIONS.includes(raw.condition) ? raw.condition : null
  if (raw.condition !== undefined && raw.condition !== null && !condition) {
    warnings.push(`${label}：天气 ${String(raw.condition)} 非法，已置空`)
  }
  return {
    temp: Number.isFinite(temp) ? clampInt(temp, -60, 60) : null,
    condition,
  }
}

function normalizeEntry(raw, warnings, index) {
  const label = `第 ${index + 1} 条`
  if (!isPlainObject(raw)) {
    warnings.push(`${label}：不是对象，已丢弃`)
    return null
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id : ''
  if (!id) {
    warnings.push(`${label}：缺少 id，已丢弃`)
    return null
  }
  if (!isValidDateString(raw.date)) {
    warnings.push(`${label}（${id}）：日期 ${String(raw.date)} 非法，已丢弃`)
    return null
  }
  const rating = Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 5 ? raw.rating : null
  if (raw.rating !== null && raw.rating !== undefined && rating === null) {
    warnings.push(`${label}（${id}）：评分 ${String(raw.rating)} 不在 1–5，已置空`)
  }
  const note = str(raw.note).slice(0, MAX_NOTE)
  return {
    id,
    date: raw.date,
    outfit: normalizeOutfit(raw.outfit, { warnings, label: `${label}（${id}）` }),
    weather: normalizeWeather(raw.weather, warnings, `${label}（${id}）`),
    occasion: str(raw.occasion),
    note,
    rating,
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  }
}

/** 逐条清洗；重复 id 只保留第一条。 */
export function normalizeCalendar(raw) {
  const warnings = []
  if (raw === null || raw === undefined) return { state: createCalendar(), warnings }
  const source = isPlainObject(raw) ? raw : null
  if (!source) return { state: createCalendar(), warnings: ['日历数据不是对象，已按空日历处理'] }

  const rawEntries = source.entries
  if (rawEntries !== undefined && rawEntries !== null && !Array.isArray(rawEntries)) {
    return { state: createCalendar(), warnings: ['日历 entries 不是数组，已按空日历处理'] }
  }

  const entries = []
  const seen = new Set()
  asArray(rawEntries).forEach((rawEntry, index) => {
    const entry = normalizeEntry(rawEntry, warnings, index)
    if (!entry) return
    if (seen.has(entry.id)) {
      warnings.push(`第 ${index + 1} 条：id ${entry.id} 重复，已丢弃`)
      return
    }
    seen.add(entry.id)
    entries.push(entry)
  })

  if (entries.length > MAX_ENTRIES) {
    warnings.push(`日历超过 ${MAX_ENTRIES} 条，只保留最近的 ${MAX_ENTRIES} 条`)
  }
  entries.sort(compareByDateDesc)
  return { state: { version: CALENDAR_VERSION, entries: entries.slice(0, MAX_ENTRIES) }, warnings }
}

function compareByDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return String(a.createdAt) < String(b.createdAt) ? 1 : String(a.createdAt) > String(b.createdAt) ? -1 : 0
}

export function encodeCalendar(state) {
  return isPlainObject(state) ? state : createCalendar()
}

export function decodeCalendar(raw) {
  return normalizeCalendar(raw)
}

export function readCalendar(storage) {
  const store = storage !== undefined ? storage : defaultStorage()
  if (!store) return { state: createCalendar(), warnings: ['本地存储不可用，已按空日历启动'], missing: true, error: null }
  let raw
  try {
    raw = store.getItem(CALENDAR_KEY)
  } catch (error) {
    return { state: createCalendar(), warnings: ['读取本地日历失败，已按空日历启动'], missing: false, error }
  }
  if (raw === null || raw === undefined) return { state: createCalendar(), warnings: [], missing: true, error: null }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { state: createCalendar(), warnings: ['本地日历数据损坏（不是合法 JSON），已按空日历启动'], missing: false, error }
  }
  const { state, warnings } = normalizeCalendar(parsed)
  return { state, warnings, missing: false, error: null }
}

export function writeCalendar(storage, state) {
  const store = storage !== undefined ? storage : defaultStorage()
  if (!store) return { ok: false, error: new Error('本地存储不可用') }
  try {
    store.setItem(CALENDAR_KEY, JSON.stringify(encodeCalendar(state)))
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

// ------------------------------------------------------------------ CRUD

/**
 * 新增一条日记。日期缺省为今天；同日条数上限 MAX_LOOKS_PER_DAY。
 * @returns {{state:object, entry:object|null, errors:string[], warnings:string[]}}
 */
export function addEntry(state, input = {}) {
  const { state: base } = normalizeCalendar(state)
  const source = isPlainObject(input) ? input : {}
  const errors = []
  const warnings = []

  const date = source.date === undefined || source.date === null || source.date === ''
    ? todayKey(source.now instanceof Date ? source.now : new Date())
    : source.date
  if (!isValidDateString(date)) {
    return { state: base, entry: null, errors: [`日期 ${String(source.date)} 非法（需要 YYYY-MM-DD）`], warnings }
  }
  if (base.entries.filter((e) => e.date === date).length >= MAX_LOOKS_PER_DAY) {
    return { state: base, entry: null, errors: [`同一天最多记录 ${MAX_LOOKS_PER_DAY} 套造型`], warnings }
  }

  const rating = Number.isInteger(source.rating) && source.rating >= 1 && source.rating <= 5 ? source.rating : null
  const nowIso = (source.now instanceof Date ? source.now : new Date()).toISOString()
  const ids = new Set(base.entries.map((e) => e.id))
  const entry = {
    id: typeof source.id === 'string' && source.id ? source.id : newId(ids),
    date,
    outfit: normalizeOutfit(source.outfit, { warnings, label: '新记录' }),
    weather: normalizeWeather(source.weather, warnings, '新记录'),
    occasion: str(source.occasion),
    note: str(source.note).slice(0, MAX_NOTE),
    rating,
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  if (outfitItemIds(entry.outfit).length === 0) warnings.push('这套造型没有任何单品，只记了日期')

  const entries = [entry, ...base.entries].sort(compareByDateDesc).slice(0, MAX_ENTRIES)
  return { state: { version: CALENDAR_VERSION, entries }, entry, errors, warnings }
}

/** 局部更新一条日记。date 非法会被拒绝；outfit/weather 传 null 表示清空。 */
export function updateEntry(state, id, patch = {}) {
  const { state: base } = normalizeCalendar(state)
  const errors = []
  const warnings = []
  const index = base.entries.findIndex((e) => e.id === id)
  if (index < 0) return { state: base, entry: null, errors: [`找不到记录：${String(id)}`], warnings }

  const current = base.entries[index]
  const source = isPlainObject(patch) ? patch : {}
  const next = { ...current }

  if (source.date !== undefined) {
    if (!isValidDateString(source.date)) {
      return { state: base, entry: null, errors: [`日期 ${String(source.date)} 非法（需要 YYYY-MM-DD）`], warnings }
    }
    next.date = source.date
  }
  if (source.outfit !== undefined) {
    next.outfit = source.outfit === null
      ? normalizeOutfit({}, {})
      : normalizeOutfit(source.outfit, { warnings, label: '更新' })
  }
  if (source.weather !== undefined) {
    next.weather = source.weather === null ? null : normalizeWeather(source.weather, warnings, '更新')
  }
  if (source.occasion !== undefined) next.occasion = str(source.occasion)
  if (source.note !== undefined) next.note = str(source.note).slice(0, MAX_NOTE)
  if (source.rating !== undefined) {
    if (source.rating === null) next.rating = null
    else if (Number.isInteger(source.rating) && source.rating >= 1 && source.rating <= 5) next.rating = source.rating
    else {
      warnings.push(`评分 ${String(source.rating)} 不在 1–5，已忽略本次修改`)
    }
  }
  next.updatedAt = (source.now instanceof Date ? source.now : new Date()).toISOString()

  const entries = base.entries.slice()
  entries[index] = next
  entries.sort(compareByDateDesc)
  return { state: { version: CALENDAR_VERSION, entries }, entry: next, errors, warnings }
}

export function removeEntry(state, id) {
  const { state: base } = normalizeCalendar(state)
  const entries = base.entries.filter((e) => e.id !== id)
  return { state: { version: CALENDAR_VERSION, entries }, removed: entries.length !== base.entries.length }
}

export function clearCalendar() {
  return createCalendar()
}

// ------------------------------------------------------------------ 查询

/** 某一天的记录（按创建时间倒序）。 */
export function entriesOnDate(state, date) {
  const { state: base } = normalizeCalendar(state)
  if (!isValidDateString(date)) return []
  return base.entries.filter((e) => e.date === date).sort(compareByDateDesc)
}

/** 某月的记录。month 为 1–12。 */
export function entriesInMonth(state, { year, month } = {}) {
  const { state: base } = normalizeCalendar(state)
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return []
  const prefix = `${y}-${pad2(m)}-`
  return base.entries.filter((e) => e.date.startsWith(prefix))
}

// ------------------------------------------------------------------ 统计

/** 名称查表：个人单品名从 wardrobe.items 取，系统单品从 catalog 取。 */
function buildNameLookup(wardrobe) {
  const map = new Map()
  const items = isPlainObject(wardrobe) && Array.isArray(wardrobe.items)
    ? wardrobe.items
    : isPlainObject(wardrobe) && Array.isArray(wardrobe.state?.items) ? wardrobe.state.items : []
  for (const item of items) {
    if (isPlainObject(item) && typeof item.id === 'string') map.set(item.id, str(item.name) || item.id)
  }
  return (id) => {
    if (map.has(id)) return map.get(id)
    const resolved = resolveItem(id)
    return resolved ? resolved.name : id
  }
}

/**
 * 本月概览：天/造型数、评分均值、高频单品、场景与天气分布、颜色家族分布。
 * @returns {{year:number, month:number, label:string, days:number, entries:number, outfits:number, ratingAvg:number|null, topItems:Array, byOccasion:Array, byCondition:Array, byFamily:Array, busiestDay:object|null}}
 */
export function monthStats(state, { year, month, wardrobe = null } = {}) {
  const nameOf = buildNameLookup(wardrobe)
  const list = entriesInMonth(state, { year, month })
  const days = new Set(list.map((e) => e.date))
  const ratings = list.map((e) => e.rating).filter((r) => Number.isInteger(r))

  // 造型去重：同一天同一套只算一次，避免「同套记两条」把统计刷高。
  const distinctOutfits = new Set()
  for (const entry of list) {
    distinctOutfits.add(`${entry.date}|${outfitItemIds(entry.outfit).sort().join(',')}`)
  }

  const itemCount = new Map()
  const occasionCount = new Map()
  const conditionCount = new Map()
  const familyCount = new Map()
  const dayCount = new Map()

  for (const entry of list) {
    dayCount.set(entry.date, (dayCount.get(entry.date) || 0) + 1)
    if (entry.occasion) occasionCount.set(entry.occasion, (occasionCount.get(entry.occasion) || 0) + 1)
    const condition = entry.weather?.condition
    if (condition) conditionCount.set(condition, (conditionCount.get(condition) || 0) + 1)
    for (const id of outfitItemIds(entry.outfit)) {
      itemCount.set(id, (itemCount.get(id) || 0) + 1)
      const resolved = resolveItem(id)
      const family = resolved?.item?.family
      if (family) familyCount.set(family, (familyCount.get(family) || 0) + 1)
    }
  }

  const topItems = [...itemCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([id, count]) => ({ id, name: nameOf(id), count }))

  let busiestDay = null
  for (const [date, count] of dayCount) {
    if (!busiestDay || count > busiestDay.count || (count === busiestDay.count && date > busiestDay.date)) {
      busiestDay = { date, count }
    }
  }

  const toSorted = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([key, count]) => ({ key, count }))

  return {
    year: Number(year),
    month: Number(month),
    label: `${Number(year)} 年 ${Number(month)} 月`,
    days: days.size,
    entries: list.length,
    outfits: distinctOutfits.size,
    ratingAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    topItems,
    byOccasion: toSorted(occasionCount),
    byCondition: toSorted(conditionCount).map((row) => ({ ...row, label: CONDITION_LABELS[row.key] || row.key })),
    byFamily: toSorted(familyCount),
    busiestDay,
  }
}

/** 最近 days 天（含今天）的单品频率。 */
export function itemFrequency(state, { days = 30, limit = 10, now = new Date(), wardrobe = null } = {}) {
  const { state: base } = normalizeCalendar(state)
  const today = todayKey(now)
  const span = Number.isFinite(days) && days > 0 ? Math.round(days) : 30
  const from = shiftDateKey(today, -(span - 1))
  const nameOf = buildNameLookup(wardrobe)
  const count = new Map()
  const lastDate = new Map()

  for (const entry of base.entries) {
    if (entry.date < from || entry.date > today) continue
    for (const id of outfitItemIds(entry.outfit)) {
      count.set(id, (count.get(id) || 0) + 1)
      if (!lastDate.has(id) || entry.date > lastDate.get(id)) lastDate.set(id, entry.date)
    }
  }

  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, Math.round(limit)))
    .map(([id, times]) => ({ id, name: nameOf(id), count: times, lastDate: lastDate.get(id) || null }))
}

/**
 * 闲置单品：owned 的个人单品里，超过 days 天没穿过的。
 * 判定取「衣橱 lastWornAt」与「日历里最后一次出现」中较新的那个——
 * 用户在日历里记了一次但没点「穿了」时，不该被判成闲置。
 */
export function idleItems({ state, wardrobe, days = 30, now = new Date() } = {}) {
  const { state: base } = normalizeCalendar(state)
  const items = isPlainObject(wardrobe) && Array.isArray(wardrobe.items)
    ? wardrobe.items
    : isPlainObject(wardrobe) && Array.isArray(wardrobe.state?.items) ? wardrobe.state.items : []
  const today = todayKey(now)
  const span = IDLE_THRESHOLDS.includes(days) ? days : (Number.isFinite(days) && days > 0 ? Math.round(days) : 30)

  const lastSeen = new Map()
  for (const entry of base.entries) {
    for (const id of outfitItemIds(entry.outfit)) {
      if (!lastSeen.has(id) || entry.date > lastSeen.get(id)) lastSeen.set(id, entry.date)
    }
  }

  const idle = []
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.id !== 'string') continue
    if (item.status !== undefined && item.status !== 'owned') continue
    const fromWardrobe = typeof item.lastWornAt === 'string' && item.lastWornAt ? localDateKey(new Date(item.lastWornAt)) : ''
    const fromCalendar = lastSeen.get(item.id) || ''
    const last = fromWardrobe > fromCalendar ? fromWardrobe : fromCalendar
    const gap = last ? daysBetween(last, today) : null
    // 从未穿过（gap=null）也算闲置，用 createdAt 或「无穷久」表达紧迫度。
    const neverWorn = !last
    if (neverWorn || (gap !== null && gap >= span)) {
      idle.push({
        id: item.id,
        name: str(item.name) || item.id,
        category: str(item.category),
        lastWornAt: last || null,
        days: neverWorn ? null : gap,
        neverWorn,
      })
    }
  }

  idle.sort((a, b) => {
    if (a.neverWorn !== b.neverWorn) return a.neverWorn ? -1 : 1
    return (b.days ?? 0) - (a.days ?? 0) || a.id.localeCompare(b.id)
  })
  return idle
}

/**
 * 连续重复：同一天里同一件单品被反复使用，或连续多天出现同一件「标志性单品」。
 * 返回最近的一次最长连击，用于提示「最近是不是总穿这件」。
 */
export function repeatStreak(state, { wardrobe = null, minRun = 3 } = {}) {
  const { state: base } = normalizeCalendar(state)
  const nameOf = buildNameLookup(wardrobe)
  const byDate = new Map()
  for (const entry of base.entries) {
    const set = byDate.get(entry.date) || new Set()
    for (const id of outfitItemIds(entry.outfit)) set.add(id)
    byDate.set(entry.date, set)
  }
  const dates = [...byDate.keys()].sort()

  let best = { itemId: null, name: '', length: 0, from: null, to: null }

  // 连续日期上的交集：只有当天确实穿了该件，才算连击的一天。
  for (const itemId of new Set(base.entries.flatMap((e) => outfitItemIds(e.outfit)))) {
    let run = 0
    let runStart = null
    let prev = null
    for (const date of dates) {
      if (!byDate.get(date).has(itemId)) { run = 0; runStart = null; prev = date; continue }
      const gap = prev === null ? 1 : daysBetween(prev, date)
      if (run > 0 && gap === 1) run += 1
      else { run = 1; runStart = date }
      prev = date
      if (run > best.length) best = { itemId, name: nameOf(itemId), length: run, from: runStart, to: date }
    }
  }

  return { ...best, threshold: Math.max(2, Math.round(minRun)), repeated: best.length >= Math.max(2, Math.round(minRun)) }
}

/** 汇总提醒：闲置（30/60/90）与连续重复。 */
export function listReminders({ state, wardrobe, now = new Date() } = {}) {
  const reminders = []
  for (const threshold of IDLE_THRESHOLDS) {
    const idle = idleItems({ state, wardrobe, days: threshold, now })
    if (idle.length === 0) continue
    const never = idle.filter((i) => i.neverWorn).length
    reminders.push({
      kind: 'idle',
      level: threshold >= 90 ? 'high' : threshold >= 60 ? 'mid' : 'low',
      days: threshold,
      count: idle.length,
      itemIds: idle.slice(0, 12).map((i) => i.id),
      message: never > 0
        ? `有 ${idle.length} 件超过 ${threshold} 天没穿（其中 ${never} 件从未穿过）`
        : `有 ${idle.length} 件超过 ${threshold} 天没穿`,
    })
  }
  const streak = repeatStreak(state, { wardrobe })
  if (streak.repeated) {
    reminders.push({
      kind: 'repeat',
      level: streak.length >= 5 ? 'mid' : 'low',
      length: streak.length,
      itemIds: [streak.itemId],
      message: `${streak.name} 已连续 ${streak.length} 天出现（${streak.from} → ${streak.to}）`,
    })
  }
  return reminders
}

/** 全部记录按日期倒序（UI 直接渲染；已由 normalizeCalendar 保证顺序）。 */
export function allEntries(state) {
  const { state: base } = normalizeCalendar(state)
  return base.entries
}

/** 有记录的日期集合，供日历格子打点。 */
export function markedDates(state) {
  const { state: base } = normalizeCalendar(state)
  const map = new Map()
  for (const entry of base.entries) map.set(entry.date, (map.get(entry.date) || 0) + 1)
  return map
}

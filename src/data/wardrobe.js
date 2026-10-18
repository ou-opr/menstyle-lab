// 个人衣橱 v1：PersonalItem 的规范化 / 校验 / 增删改查 / 统计 / 存储读写。
// 契约见 docs/PHASE1-CONTRACT.md 第 2 节（PersonalItem v1 + localStorage `stylelab:wardrobe:v1`）。
//
// 本文件是纯 ESM，不引用 document / window / React，可被 Node 直接 import 做单元测试。
// 所有 storage 与「当前时间」都通过参数注入，测试里用内存假对象即可完全覆盖。
//
// 降级原则：读 / 写 / 迁移失败一律返回安全结果并 console.warn，绝不抛异常。
// 单件数据坏掉只丢弃那一件，不因为一件坏数据否掉整个衣橱。

export const WARDROBE_KEY = 'stylelab:wardrobe:v1'
export const WARDROBE_VERSION = 1

/** 契约 §2 的取值域。 */
export const ITEM_CATEGORIES = ['tops', 'outers', 'bottoms', 'shoes', 'accs']
export const ITEM_STATUSES = ['owned', 'wishlist', 'disliked']
export const ITEM_FAMILIES = ['light', 'dark', 'neutral', 'warm', 'cool']
export const ITEM_FITS = ['slim', 'regular', 'relaxed']

/** outfit 槽位 ↔ PersonalItem.category 的互转（系统 outfit 用小写单数槽位名）。 */
export const SLOT_TO_CATEGORY = { top: 'tops', outer: 'outers', bottom: 'bottoms', shoes: 'shoes', accs: 'accs' }
export const CATEGORY_TO_SLOT = { tops: 'top', outers: 'outer', bottoms: 'bottom', shoes: 'shoes', accs: 'accs' }

export const CATEGORY_LABELS = { tops: '上装', outers: '外套', bottoms: '下装', shoes: '鞋履', accs: '配饰' }
export const STATUS_LABELS = { owned: '已有', wishlist: '想买', disliked: '不要' }
export const FAMILY_LABELS = { light: '浅色', dark: '深色', neutral: '中性', warm: '暖色', cool: '冷色' }
export const FIT_LABELS = { slim: '修身', regular: '常规', relaxed: '宽松' }

export const STATUS_ORDER = ITEM_STATUSES
export const SORT_OPTIONS = [
  { value: 'recent', label: '最近更新' },
  { value: 'name', label: '按名称' },
  { value: 'wear', label: '穿过次数' },
  { value: 'category', label: '按分类' },
]

/** 颜色默认值：任何意外输入兜底到中性灰，保证 hex 永远是合法 #rrggbb。 */
export const FALLBACK_HEX = '#9a9da3'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RE = /^#[0-9a-fA-F]{6}$/

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const asArray = (v) => (Array.isArray(v) ? v : [])

/** 归一化任意时间输入为 ISO 字符串；不可解析时回退到当前时间。 */
export function toIsoString(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value)
    if (Number.isFinite(t)) return new Date(t).toISOString()
  }
  return new Date().toISOString()
}

function uuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch (error) {
    console.warn('[wardrobe] crypto.randomUUID 不可用，改用随机数降级：', error)
  }
  // RFC4122 v4 形状的降级实现：只用 Math.random，不依赖任何全局。
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue }
    if (i === 14) { out += '4'; continue }
    const r = Math.floor(Math.random() * 16)
    out += i === 19 ? hex[(r & 0x3) | 0x8] : hex[r]
  }
  return out
}

/** 生成个人单品 id：契约要求 `u-<uuid>`。 */
export function createItemId() {
  return `u-${uuid()}`
}

/** 是否为个人单品 id（系统 id 是 t-/o-/b-/s-/a- 前缀，二者不会互相碰撞）。 */
export function isPersonalItemId(id) {
  return typeof id === 'string' && id.startsWith('u-') && UUID_RE.test(id.slice(2))
}

/** 把 hex 归一化成合法 `#rrggbb`。接受 #rgb / #rrggbb / #rrggbbaa（丢弃 alpha），非法则返回 fallback。 */
export function normalizeHex(raw, fallback = FALLBACK_HEX) {
  const safeFallback = HEX_RE.test(String(fallback)) ? String(fallback).toLowerCase() : FALLBACK_HEX
  if (typeof raw !== 'string') return safeFallback
  const s = raw.trim()
  if (!s.startsWith('#')) return safeFallback
  const body = s.slice(1)
  if (/^[0-9a-fA-F]{3}$/.test(body)) return ('#' + body.split('').map((c) => c + c).join('')).toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(body)) return ('#' + body).toLowerCase()
  if (/^[0-9a-fA-F]{8}$/.test(body)) return ('#' + body.slice(0, 6)).toLowerCase()
  return safeFallback
}

const clampInt = (raw, min, max, fallback) => {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (!Number.isFinite(n)) return fallback
  const i = Math.round(n)
  if (i < min) return min
  if (i > max) return max
  return i
}

const oneOf = (raw, list, fallback) => (list.includes(raw) ? raw : fallback)

/** category ↔ outfit 槽位。未知值返回 null，不抛异常。 */
export function slotOfCategory(category) {
  return CATEGORY_TO_SLOT[category] || null
}

export function categoryOfSlot(slot) {
  return SLOT_TO_CATEGORY[slot] || null
}

/**
 * 构造一件合法的 PersonalItem。
 * 只有 name / category 缺失或非法才是致命错误（ok:false，不产出 item）；
 * 其余字段一律自动修复并在 warnings 里说明，绝不让 UI 因为一个脏字段而无法保存。
 * @param {object} input 用户输入（部分字段即可）
 * @param {string|number|Date} [now]
 * @returns {{ok:boolean, item:object|null, errors:string[], warnings:string[]}}
 */
export function makePersonalItem(input, now = new Date()) {
  const raw = isPlainObject(input) ? input : {}
  const errors = []
  const warnings = []

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) errors.push('名称不能为空')
  else if (name.length > 40) {
    warnings.push('名称超过 40 字，已截断')
  }

  const category = oneOf(raw.category, ITEM_CATEGORIES, null)
  if (!category) errors.push(`分类必须是 ${ITEM_CATEGORIES.join(' / ')} 之一`)

  if (errors.length) return { ok: false, item: null, errors, warnings }

  const status = oneOf(raw.status, ITEM_STATUSES, 'owned')
  if (raw.status !== undefined && status !== raw.status) warnings.push(`状态 ${String(raw.status)} 非法，已按「已有」处理`)

  const hex = normalizeHex(raw.hex)
  if (typeof raw.hex === 'string' && raw.hex.trim() && normalizeHex(raw.hex) !== raw.hex.toLowerCase()) {
    warnings.push(`颜色 ${raw.hex} 已归一化为 ${hex}`)
  } else if (!isNonEmptyString(raw.hex)) {
    warnings.push(`未提供颜色，已使用中性灰 ${hex}`)
  }

  const family = oneOf(raw.family, ITEM_FAMILIES, 'neutral')
  if (raw.family !== undefined && family !== raw.family) warnings.push(`色系 ${String(raw.family)} 非法，已按「中性」处理`)

  const formality = clampInt(raw.formality, 1, 3, 2)
  if (raw.formality !== undefined && formality !== raw.formality) warnings.push(`正式度 ${String(raw.formality)} 超范围，已夹到 ${formality}`)
  const warmth = clampInt(raw.warmth, 1, 3, 2)
  if (raw.warmth !== undefined && warmth !== raw.warmth) warnings.push(`保暖度 ${String(raw.warmth)} 超范围，已夹到 ${warmth}`)
  const fit = oneOf(raw.fit, ITEM_FITS, 'regular')
  if (raw.fit !== undefined && fit !== raw.fit) warnings.push(`版型 ${String(raw.fit)} 非法，已按「常规」处理`)

  const tags = [...new Set(asArray(raw.tags).filter(isNonEmptyString).map((t) => t.trim()))].slice(0, 12)
  const createdAt = toIsoString(raw.createdAt ?? now)
  const updatedAt = toIsoString(raw.updatedAt ?? now)

  const item = {
    id: isPersonalItemId(raw.id) ? raw.id : createItemId(),
    name: name.slice(0, 40),
    category,
    status,
    hex,
    family,
    formality,
    warmth,
    fit,
    mesh: typeof raw.mesh === 'string' ? raw.mesh : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    tags,
    photoId: isNonEmptyString(raw.photoId) ? raw.photoId : null,
    createdAt,
    updatedAt,
    wearCount: clampInt(raw.wearCount, 0, 100000, 0),
    lastWornAt: raw.lastWornAt === null || raw.lastWornAt === undefined || raw.lastWornAt === ''
      ? null
      : toIsoString(raw.lastWornAt),
  }

  if (!isPersonalItemId(raw.id) && isNonEmptyString(raw.id)) warnings.push(`id ${raw.id} 不是 u-<uuid> 形状，已重新生成`)

  return { ok: true, item, errors, warnings }
}

/**
 * 校验一件 PersonalItem 是否符合契约 §2。返回错误描述数组（空数组＝合法）。
 * @returns {string[]}
 */
export function validatePersonalItem(item) {
  const errors = []
  if (!isPlainObject(item)) return ['不是对象']
  if (!isPersonalItemId(item.id)) errors.push(`id 非法：${String(item.id)}（应为 u-<uuid>）`)
  if (!isNonEmptyString(item.name)) errors.push('name 缺失')
  if (!ITEM_CATEGORIES.includes(item.category)) errors.push(`category 非法：${String(item.category)}`)
  if (!ITEM_STATUSES.includes(item.status)) errors.push(`status 非法：${String(item.status)}`)
  if (typeof item.hex !== 'string' || !HEX_RE.test(item.hex)) errors.push(`hex 非法：${String(item.hex)}`)
  if (!ITEM_FAMILIES.includes(item.family)) errors.push(`family 非法：${String(item.family)}`)
  if (![1, 2, 3].includes(item.formality)) errors.push(`formality 非法：${String(item.formality)}`)
  if (![1, 2, 3].includes(item.warmth)) errors.push(`warmth 非法：${String(item.warmth)}`)
  if (!ITEM_FITS.includes(item.fit)) errors.push(`fit 非法：${String(item.fit)}`)
  if (typeof item.mesh !== 'string') errors.push('mesh 不是字符串')
  if (typeof item.notes !== 'string') errors.push('notes 不是字符串')
  if (!Array.isArray(item.tags) || !item.tags.every((t) => typeof t === 'string')) errors.push('tags 不是字符串数组')
  if (item.photoId !== null && !isNonEmptyString(item.photoId)) errors.push(`photoId 非法：${String(item.photoId)}`)
  if (!isNonEmptyString(item.createdAt)) errors.push('createdAt 缺失')
  if (!isNonEmptyString(item.updatedAt)) errors.push('updatedAt 缺失')
  if (!Number.isInteger(item.wearCount) || item.wearCount < 0) errors.push(`wearCount 非法：${String(item.wearCount)}`)
  if (item.lastWornAt !== null && !isNonEmptyString(item.lastWornAt)) errors.push(`lastWornAt 非法：${String(item.lastWornAt)}`)
  return errors
}

/** 空衣橱状态。 */
export function emptyWardrobe() {
  return { version: WARDROBE_VERSION, items: [] }
}

/**
 * 清洗任意输入为合法衣橱状态。同 id 去重（保留后者，视为更新）。
 * @returns {{value:{version:number, items:object[]}, warnings:string[]}}
 */
export function normalizeWardrobe(raw) {
  if (raw === undefined || raw === null) return { value: emptyWardrobe(), warnings: [] }
  const source = isPlainObject(raw) ? raw : null
  if (!source) return { value: emptyWardrobe(), warnings: ['衣橱数据不是对象，已按空衣橱处理'] }
  const warnings = []
  const byId = new Map()
  for (const entry of asArray(source.items)) {
    const { ok, item, errors, warnings: itemWarnings } = makePersonalItem(entry, entry?.updatedAt)
    for (const w of itemWarnings) warnings.push(`${isPlainObject(entry) && entry.name ? entry.name : '未命名单品'}：${w}`)
    if (!ok) {
      warnings.push(`丢弃一件单品（${isPlainObject(entry) ? String(entry.name ?? entry.id ?? '无名') : '非对象'}）：${errors.join('；')}`)
      continue
    }
    if (byId.has(item.id)) warnings.push(`id ${item.id} 重复，保留后一条`)
    byId.set(item.id, item)
  }
  const version = Number.isFinite(source.version) ? source.version : WARDROBE_VERSION
  return { value: { version, items: [...byId.values()] }, warnings }
}

/** 是否为一个合法衣橱状态（用于 usePersistentState 的 validate）。 */
export function isValidWardrobe(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items)) return false
  return value.items.every((item) => validatePersonalItem(item).length === 0)
}

export function findPersonalItem(state, id) {
  if (!state || !Array.isArray(state.items)) return null
  return state.items.find((item) => item.id === id) || null
}

/**
 * 新增一件单品。
 * @returns {{state:object, item:object|null, errors:string[], warnings:string[]}}
 */
export function addItem(state, input, now = new Date()) {
  const base = isPlainObject(state) && Array.isArray(state.items) ? { ...state, items: [...state.items] } : emptyWardrobe()
  const { ok, item, errors, warnings } = makePersonalItem(input, now)
  if (!ok) return { state: base, item: null, errors, warnings }
  const index = base.items.findIndex((x) => x.id === item.id)
  if (index >= 0) base.items[index] = item
  else base.items.push(item)
  return { state: base, item, errors: [], warnings }
}

const EDITABLE_FIELDS = [
  'name', 'category', 'status', 'hex', 'family', 'formality', 'warmth', 'fit',
  'mesh', 'notes', 'tags', 'photoId', 'wearCount', 'lastWornAt',
]

/**
 * 修改一件单品：先与旧值合并，再走同一套 makePersonalItem 规范化，保证结果永远合法。
 * @returns {{state:object, item:object|null, errors:string[], warnings:string[]}}
 */
export function updateItem(state, id, patch, now = new Date()) {
  const base = isPlainObject(state) && Array.isArray(state.items) ? { ...state, items: [...state.items] } : emptyWardrobe()
  const index = base.items.findIndex((x) => x.id === id)
  if (index < 0) return { state: base, item: null, errors: [`找不到单品：${String(id)}`], warnings: [] }

  const current = base.items[index]
  const next = { ...current }
  for (const key of EDITABLE_FIELDS) {
    if (isPlainObject(patch) && Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key]
  }
  const { ok, item, errors, warnings } = makePersonalItem({ ...next, id: current.id, createdAt: current.createdAt, updatedAt: now }, now)
  if (!ok) return { state: base, item: null, errors, warnings }
  base.items[index] = item
  return { state: base, item, errors: [], warnings }
}

/**
 * 删除一件单品。
 * @returns {{state:object, removed:object|null}}
 */
export function removeItem(state, id) {
  const base = isPlainObject(state) && Array.isArray(state.items) ? { ...state, items: [...state.items] } : emptyWardrobe()
  const index = base.items.findIndex((x) => x.id === id)
  if (index < 0) return { state: base, removed: null }
  const removed = base.items[index]
  base.items.splice(index, 1)
  return { state: base, removed }
}

/** 切换 / 设置状态（owned / wishlist / disliked）。非法状态不做改动并返回 errors。 */
export function setItemStatus(state, id, status, now = new Date()) {
  if (!ITEM_STATUSES.includes(status)) {
    return { state: isPlainObject(state) ? state : emptyWardrobe(), item: null, errors: [`状态非法：${String(status)}`], warnings: [] }
  }
  return updateItem(state, id, { status }, now)
}

/** 记一次穿着：wearCount +1、lastWornAt 更新。顺便把「想买」升级为「已有」——穿过就是拥有。 */
export function recordWear(state, id, now = new Date()) {
  const current = findPersonalItem(state, id)
  if (!current) return { state: isPlainObject(state) ? state : emptyWardrobe(), item: null, errors: [`找不到单品：${String(id)}`], warnings: [] }
  const patch = { wearCount: (Number.isInteger(current.wearCount) ? current.wearCount : 0) + 1, lastWornAt: now }
  if (current.status === 'wishlist') patch.status = 'owned'
  return updateItem(state, id, patch, now)
}

/**
 * 一次记多件穿着（一套造型里的全部个人单品）。
 *
 * 为什么不能在外面 for 循环调 recordWear：每次调用都从**入参 state** 出发，
 * 循环里必然拿到同一份旧 state，后一次覆盖前一次，一套造型 N 件最后只 +1。
 * 这里在函数内部串接 state，一次算完再返回，语义与「逐件记录」完全一致。
 *
 * @returns {{state:object, items:object[], errors:string[], warnings:string[]}}
 */
export function recordWearMany(state, ids, now = new Date()) {
  const list = Array.isArray(ids) ? ids : []
  let current = isPlainObject(state) && Array.isArray(state.items) ? state : emptyWardrobe()
  const items = []
  const errors = []
  const warnings = []
  const seen = new Set()
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw || seen.has(raw)) continue
    seen.add(raw)
    const result = recordWear(current, raw, now)
    if (result.item) {
      items.push(result.item)
      current = result.state
    }
    if (result.errors) errors.push(...result.errors)
    if (result.warnings) warnings.push(...result.warnings)
  }
  return { state: current, items, errors, warnings }
}

/** 关联 / 解除照片（照片本体在 imageStore 里，这里只存 id 引用）。 */
export function attachPhoto(state, id, photoId, now = new Date()) {
  return updateItem(state, id, { photoId: isNonEmptyString(photoId) ? photoId : null }, now)
}

export function detachPhoto(state, id, now = new Date()) {
  return updateItem(state, id, { photoId: null }, now)
}

/** 清空全部单品（数据管理器重置用）。 */
export function clearWardrobe() {
  return emptyWardrobe()
}

/**
 * 筛选 + 排序。所有条件都可省略；非法条件按「全部」处理。
 * @param {object} state
 * @param {{status?:string|string[], category?:string|string[], family?:string|string[], fit?:string,
 *          photo?:'all'|'with'|'without', q?:string, sort?:string}} [filters]
 * @returns {object[]} 新数组（元素是原对象引用，调用方不要就地改写）
 */
export function queryItems(state, filters = {}) {
  const items = isPlainObject(state) && Array.isArray(state.items) ? state.items : []
  const f = isPlainObject(filters) ? filters : {}
  const listFilter = (raw, allowed) => {
    if (raw === undefined || raw === null || raw === 'all' || raw === '') return null
    const arr = (Array.isArray(raw) ? raw : [raw]).filter((v) => allowed.includes(v))
    return arr.length ? new Set(arr) : null
  }
  const statuses = listFilter(f.status, ITEM_STATUSES)
  const categories = listFilter(f.category, ITEM_CATEGORIES)
  const families = listFilter(f.family, ITEM_FAMILIES)
  const fits = listFilter(f.fit, ITEM_FITS)
  const q = typeof f.q === 'string' ? f.q.trim().toLowerCase() : ''

  let out = items.filter((item) => {
    if (statuses && !statuses.has(item.status)) return false
    if (categories && !categories.has(item.category)) return false
    if (families && !families.has(item.family)) return false
    if (fits && !fits.has(item.fit)) return false
    if (f.photo === 'with' && !item.photoId) return false
    if (f.photo === 'without' && item.photoId) return false
    if (q) {
      const hay = `${item.name} ${item.notes} ${item.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const sort = SORT_OPTIONS.some((o) => o.value === f.sort) ? f.sort : 'recent'
  out = [...out].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN')
    if (sort === 'wear') return b.wearCount - a.wearCount || a.name.localeCompare(b.name, 'zh-Hans-CN')
    if (sort === 'category') {
      const d = ITEM_CATEGORIES.indexOf(a.category) - ITEM_CATEGORIES.indexOf(b.category)
      return d !== 0 ? d : a.name.localeCompare(b.name, 'zh-Hans-CN')
    }
    return String(b.updatedAt).localeCompare(String(a.updatedAt))
  })
  return out
}

/**
 * 统计：总数 / 各状态 / 各分类 / 照片覆盖 / 已有占比 / 穿着次数。
 * @returns {{total:number, byStatus:object, byCategory:object, withPhoto:number, ownedRatio:number,
 *            totalWears:number, mostWorn:object|null, lastUpdatedAt:string|null}}
 */
export function summarizeWardrobe(state) {
  const items = isPlainObject(state) && Array.isArray(state.items) ? state.items : []
  const byStatus = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0]))
  const byCategory = Object.fromEntries(ITEM_CATEGORIES.map((c) => [c, 0]))
  let withPhoto = 0
  let totalWears = 0
  let mostWorn = null
  let lastUpdatedAt = null
  for (const item of items) {
    if (byStatus[item.status] !== undefined) byStatus[item.status] += 1
    if (byCategory[item.category] !== undefined) byCategory[item.category] += 1
    if (item.photoId) withPhoto += 1
    totalWears += Number.isInteger(item.wearCount) ? item.wearCount : 0
    if (!mostWorn || item.wearCount > mostWorn.wearCount) mostWorn = { id: item.id, name: item.name, wearCount: item.wearCount }
    if (!lastUpdatedAt || String(item.updatedAt) > lastUpdatedAt) lastUpdatedAt = String(item.updatedAt)
  }
  const total = items.length
  return {
    total,
    byStatus,
    byCategory,
    withPhoto,
    ownedRatio: total === 0 ? 0 : Math.round((byStatus.owned / total) * 100) / 100,
    totalWears,
    mostWorn: mostWorn && mostWorn.wearCount > 0 ? mostWorn : null,
    lastUpdatedAt,
  }
}

// ---------------------------------------------------------------- 存储（读 / 写）

/** 取全局 localStorage；不可用（SSR / 隐私模式 / 沙箱 / 被禁用）返回 null，绝不抛异常。 */
export function defaultStorage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    const probe = '__stylelab_wardrobe_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch (error) {
    console.warn('[wardrobe] localStorage 不可用，本次仅保留在内存中：', error)
    return null
  }
}

/** localStorage 是否可用于永久保存（UI 据此提示「本次会话内有效」）。 */
export function isStorageAvailable() {
  return defaultStorage() !== null
}

/** 把衣橱序列化成契约要求的字符串形状 `{version, items}`。 */
export function encodeWardrobe(state) {
  const { value } = normalizeWardrobe(state)
  return JSON.stringify(value)
}

/**
 * 解析 JSON 字符串或对象为衣橱状态。任何损坏输入都返回空衣橱 + warnings，绝不抛异常。
 * @returns {{state:object, warnings:string[], ok:boolean}}
 */
export function decodeWardrobe(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { state: emptyWardrobe(), warnings: [], ok: true }
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      console.warn('[wardrobe] 衣橱数据损坏，已按空衣橱处理：', error)
      return { state: emptyWardrobe(), warnings: ['衣橱数据不是合法 JSON，已按空衣橱处理'], ok: false }
    }
  }
  const { value, warnings } = normalizeWardrobe(parsed)
  return { state: value, warnings, ok: true }
}

/**
 * 从 storage 读取衣橱。
 * @returns {{state:object, warnings:string[], missing:boolean, error:Error|null}}
 */
export function readWardrobe(storage) {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return { state: emptyWardrobe(), warnings: [], missing: true, error: null }
  let raw
  try {
    raw = store.getItem(WARDROBE_KEY)
  } catch (error) {
    console.warn('[wardrobe] 读取衣橱失败，已按空衣橱处理：', error)
    return { state: emptyWardrobe(), warnings: ['读取衣橱失败，已按空衣橱处理'], missing: false, error }
  }
  if (raw === null || raw === undefined) return { state: emptyWardrobe(), warnings: [], missing: true, error: null }
  const { state, warnings } = decodeWardrobe(raw)
  return { state, warnings, missing: false, error: null }
}

/**
 * 写回 storage。
 * @returns {{ok:boolean, error:Error|null}} ok:false 表示只保留在内存里，调用方应给出可见提示。
 */
export function writeWardrobe(storage, state) {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return { ok: false, error: null }
  try {
    store.setItem(WARDROBE_KEY, encodeWardrobe(state))
    return { ok: true, error: null }
  } catch (error) {
    // 超配额 / 隐私模式（Safari QuotaExceededError）：降级为本次会话内存态。
    console.warn('[wardrobe] 保存衣橱失败，本次仅在内存中保留：', error)
    return { ok: false, error }
  }
}

// 偏好学习（PHASE1-CONTRACT §4）——纯函数层，不依赖 React / localStorage / window。
// 存储读写由 src/hooks/usePreferences.js 通过 usePersistentState 完成。
//
// 契约红线（本文件用常量固化，测试逐条断言）：
//   单次反馈增量 ±3  → STEP_LIMIT
//   累计权重 [-12,12] → WEIGHT_LIMIT
//   最终排序修正 [-10,10] → DELTA_LIMIT
//   必须支持查看（summarizePreferences）与重置（resetPreferences）

import { ITEMS, findItem } from './catalog.js'
import { normalizeOutfitShape, outfitItemIds } from './outfitShape.js'

export { outfitItemIds }

export const PREFERENCES_KEY = 'stylelab:preferences:v1'
export const PREFERENCES_VERSION = 1

export const FEEDBACK_KINDS = ['like', 'dislike', 'worn']

export const FEEDBACK_REASONS = [
  { value: 'too-formal', label: '太正式' },
  { value: 'too-casual', label: '太随意' },
  { value: 'too-warm', label: '太热' },
  { value: 'too-cold', label: '太冷' },
  { value: 'color', label: '颜色不合适' },
  { value: 'fit', label: '版型不合身' },
  { value: 'other', label: '其他' },
]

const REASON_VALUES = FEEDBACK_REASONS.map((item) => item.value)

export const STEP_LIMIT = 3
export const WEIGHT_LIMIT = 12
export const DELTA_LIMIT = 10

// like / dislike 是强信号；worn（穿过）是弱正向信号，避免"穿过一次"压过明确喜好
const KIND_STEP = { like: 3, dislike: -3, worn: 1 }

// 原因只对"正式度"权重做方向修正：说"太正式"就压低该档位，说"太随意"就抬高。
// warmth / color / fit 没有独立权重桶（契约只给了 itemIds/colors/formalities 三个），
// 因此这些原因只影响记录与回显，不改变权重——这是已知边界，见回报的"未完成项"。
const REASON_FORMALITY_SHIFT = { 'too-formal': -2, 'too-casual': 2 }

// 反馈记录上限：本地存档不无限增长
const MAX_FEEDBACK = 500

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const str = (value) => (typeof value === 'string' ? value : '')
const round2 = (value) => Math.round(value * 100) / 100

export const reasonLabel = (value) =>
  FEEDBACK_REASONS.find((item) => item.value === value)?.label || str(value)

export function createEmptyPreferences() {
  return {
    version: PREFERENCES_VERSION,
    feedback: [],
    weights: { itemIds: {}, colors: {}, formalities: {} },
  }
}

/** 判空用：空偏好表示"还没有任何学习信号"。 */
export function isEmptyPreferences(preferences) {
  const safe = sanitizePreferences(preferences)
  return safe.feedback.length === 0
}

/** 从任意来源（存档 / 备份包 / 手写）取回的偏好在进入内存前一律过这里。 */
export function sanitizePreferences(raw) {
  const empty = createEmptyPreferences()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const feedback = Array.isArray(raw.feedback)
    ? raw.feedback.map(sanitizeFeedback).filter(Boolean).slice(-MAX_FEEDBACK)
    : []
  const weights = raw.weights && typeof raw.weights === 'object' && !Array.isArray(raw.weights) ? raw.weights : {}
  return {
    version: PREFERENCES_VERSION,
    feedback,
    weights: {
      itemIds: sanitizeBucket(weights.itemIds),
      colors: sanitizeBucket(weights.colors),
      formalities: sanitizeBucket(weights.formalities),
    },
  }
}

/** usePersistentState 的 validate：只校验承载结构，过严会让合法写入被静默跳过。 */
export function isValidPreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  if (!Array.isArray(raw.feedback)) return false
  const weights = raw.weights
  return !!weights && typeof weights === 'object' && !Array.isArray(weights)
}

function sanitizeBucket(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key.length === 0) continue
    const value2 = num(value)
    if (value2 === 0) continue
    out[key] = clamp(value2, -WEIGHT_LIMIT, WEIGHT_LIMIT)
  }
  return out
}

function sanitizeFeedback(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (!FEEDBACK_KINDS.includes(entry.kind)) return null
  return {
    id: str(entry.id) || makeId('fb'),
    at: str(entry.at) || new Date(0).toISOString(),
    kind: entry.kind,
    outfit: normalizeOutfit(entry.outfit),
    reasons: normalizeReasons(entry.reasons),
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * outfit 的存储归一形态：五个槽位固定存在，accs 恒为数组，outer 缺省 o-none。
 * 实现统一在 ./outfitShape.js —— 此前 calendar.js 与偏好模块各有一份、且语义不同，
 * 导致「不穿外套」这个槽位哨兵被日历统计当成真实单品。
 */
export const normalizeOutfit = normalizeOutfitShape

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) return []
  const seen = new Set()
  const out = []
  for (const value of reasons) {
    if (typeof value !== 'string' || !REASON_VALUES.includes(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/**
 * id → item 查表（系统目录 + 个人单品）。个人单品必须能被解析出
 * hex / formality，否则它们的反馈学不进颜色与正式度权重。
 */
export function buildItemLookup(extraItems) {
  const map = new Map()
  for (const item of ITEMS) map.set(item.id, item)
  if (Array.isArray(extraItems)) {
    for (const item of extraItems) {
      if (item && typeof item.id === 'string' && item.id.length > 0) map.set(item.id, item)
    }
  }
  return map
}

function resolveItem(id, lookup) {
  if (typeof id !== 'string' || id.length === 0) return null
  if (lookup instanceof Map) return lookup.get(id) || null
  return findItem(id) || null
}

/**
 * 记录一次反馈，返回**新的**偏好状态（不修改入参）。
 * @param {object} preferences 当前偏好
 * @param {{kind:'like'|'dislike'|'worn', outfit:object, reasons?:string[], at?:string, id?:string, items?:Map}} input
 */
export function applyFeedback(preferences, input) {
  const base = sanitizePreferences(preferences)
  const source = input && typeof input === 'object' ? input : {}
  if (!FEEDBACK_KINDS.includes(source.kind)) return base

  const outfit = normalizeOutfit(source.outfit)
  const reasons = normalizeReasons(source.reasons)
  const lookup = source.items instanceof Map ? source.items : null

  const step = KIND_STEP[source.kind]
  const itemStep = clamp(step, -STEP_LIMIT, STEP_LIMIT)
  const formalityShift = reasons.reduce((sum, value) => sum + (REASON_FORMALITY_SHIFT[value] || 0), 0)
  const formalityStep = clamp(step + formalityShift, -STEP_LIMIT, STEP_LIMIT)

  const weights = {
    itemIds: { ...base.weights.itemIds },
    colors: { ...base.weights.colors },
    formalities: { ...base.weights.formalities },
  }

  const ids = outfitItemIds(outfit)
  const colors = new Set()
  const formalities = new Set()

  for (const id of ids) {
    weights.itemIds[id] = clamp(num(weights.itemIds[id]) + itemStep, -WEIGHT_LIMIT, WEIGHT_LIMIT)
    const item = resolveItem(id, lookup)
    if (!item) continue
    if (typeof item.hex === 'string' && item.hex.length > 0) colors.add(item.hex.toLowerCase())
    if (Number.isFinite(item.formality)) formalities.add(String(item.formality))
  }

  for (const color of colors) {
    weights.colors[color] = clamp(num(weights.colors[color]) + itemStep, -WEIGHT_LIMIT, WEIGHT_LIMIT)
  }
  for (const formality of formalities) {
    weights.formalities[formality] = clamp(
      num(weights.formalities[formality]) + formalityStep,
      -WEIGHT_LIMIT,
      WEIGHT_LIMIT,
    )
  }

  const entry = {
    id: str(source.id) || makeId('fb'),
    at: str(source.at) || new Date().toISOString(),
    kind: source.kind,
    outfit,
    reasons,
  }

  return {
    version: PREFERENCES_VERSION,
    feedback: [...base.feedback, entry].slice(-MAX_FEEDBACK),
    weights,
  }
}

/** 契约 §4：重置。返回全新的空偏好，不保留任何权重残留。 */
export function resetPreferences() {
  return createEmptyPreferences()
}

/**
 * 最终排序修正量，严格夹在 [-10, 10]。
 * 三分量加权：单品 0.5 / 颜色 0.3 / 正式度 0.2 —— 单品信号最具体，正式度最泛化。
 */
export function preferenceDeltaOf(outfit, preferences, items) {
  const source = preferences && typeof preferences === 'object' ? preferences : {}
  const weights = source.weights && typeof source.weights === 'object' ? source.weights : source
  const lookup = items instanceof Map ? items : null
  const ids = outfitItemIds(outfit)
  if (ids.length === 0) return 0

  let itemSum = 0
  let formalitySum = 0
  let formalityCount = 0
  const colors = new Set()

  for (const id of ids) {
    itemSum += clamp(num(weights.itemIds?.[id]), -WEIGHT_LIMIT, WEIGHT_LIMIT)
    const item = resolveItem(id, lookup)
    if (!item) continue
    if (typeof item.hex === 'string' && item.hex.length > 0) colors.add(item.hex.toLowerCase())
    if (Number.isFinite(item.formality)) {
      formalitySum += clamp(num(weights.formalities?.[String(item.formality)]), -WEIGHT_LIMIT, WEIGHT_LIMIT)
      formalityCount += 1
    }
  }

  const itemAvg = itemSum / ids.length
  let colorSum = 0
  for (const color of colors) colorSum += clamp(num(weights.colors?.[color]), -WEIGHT_LIMIT, WEIGHT_LIMIT)
  const colorAvg = colors.size > 0 ? colorSum / colors.size : 0
  const formalityAvg = formalityCount > 0 ? formalitySum / formalityCount : 0

  const delta = 0.5 * itemAvg + 0.3 * colorAvg + 0.2 * formalityAvg
  return clamp(round2(delta), -DELTA_LIMIT, DELTA_LIMIT)
}

/** 单个单品 id 的累计权重（面板与推荐共用）。 */
export function itemWeight(preferences, itemId) {
  const weights = preferences?.weights || {}
  return clamp(num(weights.itemIds?.[itemId]), -WEIGHT_LIMIT, WEIGHT_LIMIT)
}

/**
 * 契约 §4 的"查看"：把原始反馈聚合成人能读的摘要。
 * 纯函数，返回新对象，不改 preferences。
 */
export function summarizePreferences(preferences, items) {
  const safe = sanitizePreferences(preferences)
  const lookup = items instanceof Map ? items : null
  const byKind = { like: 0, dislike: 0, worn: 0 }
  const itemScore = new Map()
  const reasonCount = new Map()

  for (const entry of safe.feedback) {
    byKind[entry.kind] = (byKind[entry.kind] || 0) + 1
    const direction = entry.kind === 'dislike' ? -1 : 1
    for (const id of outfitItemIds(entry.outfit)) {
      itemScore.set(id, (itemScore.get(id) || 0) + direction)
    }
    for (const reason of entry.reasons) {
      reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1)
    }
  }

  const ranked = [...itemScore.entries()].map(([id, score]) => ({
    id,
    score,
    name: resolveItem(id, lookup)?.name || id,
  }))

  const liked = ranked
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5)

  const disliked = ranked
    .filter((item) => item.score < 0)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .slice(0, 5)

  const reasons = [...reasonCount.entries()]
    .map(([value, count]) => ({ value, count, label: reasonLabel(value) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))

  return {
    total: safe.feedback.length,
    byKind,
    liked,
    disliked,
    reasons,
    weights: safe.weights,
    lastFeedbackAt: safe.feedback.length > 0 ? safe.feedback[safe.feedback.length - 1].at : null,
  }
}

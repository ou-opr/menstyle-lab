// 个人衣橱优先推荐与智能替换（PHASE1-CONTRACT §5）——纯函数层。
//
// 契约 §1：个人衣橱优先，缺项才使用系统单品，并明确标记为建议补充。
// 契约 §4：最终排序修正夹在 [-10,10]，且**不得覆盖硬性穿搭冲突**——
//   这里用"硬冲突惩罚 20 > 修正上限 10"实现：偏好再高也翻不过硬冲突。
//
// 硬冲突规则统一来自 src/data/conflicts.js（皮鞋×短裤、正装鞋×休闲下装、
// 跑鞋×正装、短裤×正式鞋），与 advice.js / capsule.js 保持同一套口径。

import { ACCS, BOTTOMS, CATEGORIES, ITEMS, OUTERS, SHOES, TOPS, findItem } from './catalog.js'
import { detectConflicts } from './conflicts.js'
import {
  DELTA_LIMIT,
  WEIGHT_LIMIT,
  buildItemLookup,
  itemWeight,
  normalizeOutfit,
  preferenceDeltaOf,
} from './preferences.js'

export const INTENTS = ['more-formal', 'more-casual', 'warmer', 'cooler', 'taller', 'subtle', 'owned-only']

export const INTENT_LABELS = {
  'more-formal': '更正式',
  'more-casual': '更休闲',
  warmer: '更保暖',
  cooler: '更凉快',
  taller: '显高',
  subtle: '更低调',
  'owned-only': '只用我有的',
}

export const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']

export const SLOT_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋子', accs: '配饰' }

// 契约 §2 的 category 是复数（tops/outers/...），outfit 槽位是单数（top/outer/...）
const SLOT_CATEGORY = { top: 'tops', outer: 'outers', bottom: 'bottoms', shoes: 'shoes', accs: 'accs' }
const CATEGORY_KEY = { top: 'top', outer: 'outer', bottom: 'bottom', shoes: 'shoes', accs: 'acc' }

// 宽松/厚重轮廓：在"显高"诉求下会压低腰线
const BULKY_MESHES = new Set(['hoodie', 'sweatshirt', 'overshirt', 'puffer', 'coat', 'trench', 'bomber'])

// family 有两套词汇：系统目录用 light/dark/earth/accent（见 catalog.js），
// PersonalItem v1 契约用 light/dark/neutral/warm/cool（见 PHASE1-CONTRACT §2）。
// 两套都要认，否则个人单品的颜色信号会被静默忽略。
const LOW_KEY_FAMILIES = new Set(['dark', 'earth', 'neutral', 'warm'])

// 硬冲突惩罚，必须大于 DELTA_LIMIT，否则偏好能把它抵消掉
const HARD_CONFLICT_PENALTY = 20

// 「个人衣橱优先」（契约 §1）实现为**有界加成**而不是绝对优先：
// 绝对优先会让"我想更休闲"推出一件你恰好拥有的、同样正式的衬衫——忠于意图但不忠于诉求。
// 5 分足以让同等匹配度的衣橱单品胜出，又不至于盖过意图差异明显的系统建议。
export const OWNED_BONUS = 5

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const round2 = (value) => Math.round(value * 100) / 100

/** 个人单品 id 契约：u-<uuid>。非此形状的条目一律不参与个人逻辑。 */
const isPersonalItem = (item) =>
  !!item && typeof item === 'object' && typeof item.id === 'string' && item.id.startsWith('u-')

/** wardrobeState 兼容 {version,items:[]} 与裸数组两种形态；非法输入返回空数组。 */
export function normalizeWardrobe(wardrobeState) {
  const raw = Array.isArray(wardrobeState)
    ? wardrobeState
    : (Array.isArray(wardrobeState?.items) ? wardrobeState.items : [])
  return raw.filter(isPersonalItem)
}

/** 某个槽位上用户**已拥有**（status === 'owned'）的个人单品。 */
export function ownedItemsForSlot(wardrobeState, slot) {
  const category = SLOT_CATEGORY[slot]
  if (!category) return []
  return normalizeWardrobe(wardrobeState).filter(
    (item) => item.category === category && item.status === 'owned',
  )
}

/** 系统目录 + 个人单品合并查表：个人单品缺少 mesh/hex 时也要能安全参与。 */
export function buildLookup(wardrobeState) {
  return buildItemLookup(normalizeWardrobe(wardrobeState))
}

function resolveItem(id, lookup) {
  if (typeof id !== 'string' || id.length === 0) return null
  if (lookup instanceof Map) return lookup.get(id) || null
  return findItem(id) || null
}

function withSlot(outfit, slot, id) {
  if (slot === 'accs') return { ...normalizeOutfit(outfit), accs: id ? [id] : [] }
  return { ...normalizeOutfit(outfit), [slot]: id }
}

/**
 * 硬性穿搭冲突（规则统一来自 src/data/conflicts.js）。返回中文冲突原因数组，空数组代表无冲突。
 * 入参 promise：outfit 里可能是个人单品 id，所以允许传入合并查表。
 */
export function detectHardConflicts(outfit, lookup) {
  const o = normalizeOutfit(outfit)
  const map = lookup instanceof Map ? lookup : null
  const top = resolveItem(o.top, map)
  const outer = o.outer !== 'o-none' ? resolveItem(o.outer, map) : null
  const bottom = resolveItem(o.bottom, map)
  const shoes = resolveItem(o.shoes, map)

  return detectConflicts({ top, outer, bottom, shoes })
}

/** 槽位总数：三个核心槽 + 实际存在的外套/配饰槽。missing 的分母就是它。 */
function slotListFor(outfit) {
  const o = normalizeOutfit(outfit)
  const slots = ['top', 'bottom', 'shoes']
  if (o.outer && o.outer !== 'o-none') slots.push('outer')
  if (o.accs.length > 0) slots.push('accs')
  return slots
}

/** 已拥有候选的择优顺序：偏好权重 → 与原本单品的正式度接近 → id。 */
function rankOwnedCandidates(candidates, slot, outfit, lookup, preferences) {
  const currentId = slot === 'accs' ? null : normalizeOutfit(outfit)[slot]
  const current = resolveItem(currentId, lookup)
  return candidates
    .map((item) => {
      const distance =
        current && Number.isFinite(current.formality) && Number.isFinite(item.formality)
          ? Math.abs(current.formality - item.formality)
          : 0
      return { item, weight: itemWeight(preferences, item.id), distance }
    })
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.distance - b.distance ||
        String(a.item.id).localeCompare(String(b.item.id)),
    )
    .map((entry) => entry.item)
}

/**
 * 契约 §5：个人衣橱优先的排序。
 * 返回项在 outfit 原字段之外附加 personalScore / ownedRatio / missing / preferenceDelta，
 * 以及 hardConflict / conflicts 两个诊断字段（UI 用来解释为什么排在后面）。
 */
export function rankWithPersonalWardrobe(outfits, wardrobeState, preferences) {
  const list = Array.isArray(outfits) ? outfits : []
  const lookup = buildLookup(wardrobeState)

  const scored = list.map((outfit, order) => ({
    order,
    value: personalize(outfit, wardrobeState, lookup, preferences),
  }))

  scored.sort(
    (a, b) =>
      (a.value.hardConflict ? 1 : 0) - (b.value.hardConflict ? 1 : 0) ||
      b.value.personalScore - a.value.personalScore ||
      b.value.ownedRatio - a.value.ownedRatio ||
      String(a.value.id).localeCompare(String(b.value.id)) ||
      a.order - b.order,
  )

  return scored.map((entry) => entry.value)
}

function personalize(outfit, wardrobeState, lookup, preferences) {
  const source = normalizeOutfit(outfit)
  const slots = slotListFor(source)
  const personalized = { ...outfit, ...source, accs: [...source.accs] }
  const missing = []
  let ownedCount = 0

  for (const slot of slots) {
    const candidates = ownedItemsForSlot(wardrobeState, slot)

    if (slot === 'accs') {
      const picks = []
      for (const item of rankOwnedCandidates(candidates, 'accs', personalized, lookup, preferences)) {
        if (picks.length >= 2) break
        const trial = { ...personalized, accs: [...picks.map((x) => x.id), item.id] }
        if (detectHardConflicts(trial, lookup).length === 0) picks.push(item)
      }
      if (picks.length > 0) {
        personalized.accs = picks.map((item) => item.id)
        ownedCount += 1
      } else {
        missing.push({
          category: SLOT_CATEGORY.accs,
          itemId: source.accs[0] || null,
          name: resolveItem(source.accs[0], lookup)?.name || SLOT_LABELS.accs,
        })
      }
      continue
    }

    let replaced = false
    for (const item of rankOwnedCandidates(candidates, slot, personalized, lookup, preferences)) {
      const trial = withSlot(personalized, slot, item.id)
      if (detectHardConflicts(trial, lookup).length > 0) continue
      personalized[slot] = item.id
      ownedCount += 1
      replaced = true
      break
    }
    if (!replaced) {
      missing.push({
        category: SLOT_CATEGORY[slot],
        itemId: source[slot] || null,
        name: resolveItem(source[slot], lookup)?.name || SLOT_LABELS[slot],
      })
    }
  }

  const conflicts = detectHardConflicts(personalized, lookup)
  const preferenceDelta = preferenceDeltaOf(personalized, preferences, lookup)
  const baseScore = Number.isFinite(outfit?.score) ? outfit.score : 60
  // 硬性冲突时**完全丢弃**偏好修正再加惩罚——这是"偏好不得覆盖硬性冲突"的字面实现：
  // 喜欢一套皮鞋配短裤，也不会因此获得任何排序加成。
  const personalScore = clamp(
    Math.round(baseScore + (conflicts.length > 0 ? 0 : preferenceDelta)) -
      (conflicts.length > 0 ? HARD_CONFLICT_PENALTY : 0),
    0,
    100,
  )

  return {
    ...personalized,
    personalScore,
    ownedRatio: slots.length > 0 ? round2(ownedCount / slots.length) : 0,
    missing,
    preferenceDelta,
    hardConflict: conflicts.length > 0,
    conflicts,
  }
}

/** 把候选单品归一成 UI 可直接渲染的形状（系统与个人单品字段名不同）。 */
export function normalizeCandidateItem(item, slot) {
  return {
    id: item.id,
    name: typeof item.name === 'string' && item.name ? item.name : item.id,
    hex: typeof item.hex === 'string' ? item.hex : null,
    family: typeof item.family === 'string' ? item.family : null,
    formality: Number.isFinite(item.formality) ? item.formality : null,
    warmth: Number.isFinite(item.warmth) ? item.warmth : null,
    mesh: typeof item.mesh === 'string' ? item.mesh : null,
    category: SLOT_CATEGORY[slot] || null,
    slot,
  }
}

/** 意图/偏好对单个候选的增量打分，返回 { delta, reasons }。delta 最终夹在 ±DELTA_LIMIT。 */
function scoreCandidate({ item, slot, outfit, intent, lookup, preferences }) {
  const reasons = []
  let delta = 0

  const formality = Number.isFinite(item.formality) ? item.formality : 1
  const warmth = Number.isFinite(item.warmth) ? item.warmth : 1
  const currentId = slot === 'accs' ? null : normalizeOutfit(outfit)[slot]
  const current = resolveItem(currentId, lookup)
  const currentFormality = Number.isFinite(current?.formality) ? current.formality : formality
  const currentWarmth = Number.isFinite(current?.warmth) ? current.warmth : warmth

  switch (intent) {
    case 'more-formal': {
      const step = (formality - currentFormality) * 7
      delta += step
      if (step > 0) reasons.push(`正式度 ${currentFormality} → ${formality}，比当前更正式`)
      else if (step < 0) reasons.push(`正式度反而降到 ${formality}，与"更正式"相反`)
      break
    }
    case 'more-casual': {
      const step = (currentFormality - formality) * 7
      delta += step
      if (step > 0) reasons.push(`正式度 ${currentFormality} → ${formality}，比当前更松弛`)
      else if (step < 0) reasons.push(`正式度上升到 ${formality}，与"更休闲"相反`)
      break
    }
    case 'warmer': {
      const step = (warmth - currentWarmth) * 7
      delta += step
      if (step > 0) reasons.push(`保暖等级 ${currentWarmth} → ${warmth}`)
      else if (step < 0) reasons.push(`保暖等级降到 ${warmth}，与"更保暖"相反`)
      break
    }
    case 'cooler': {
      const step = (currentWarmth - warmth) * 7
      delta += step
      if (step > 0) reasons.push(`保暖等级 ${currentWarmth} → ${warmth}，更透气`)
      else if (step < 0) reasons.push(`保暖等级上升到 ${warmth}，与"更凉快"相反`)
      break
    }
    case 'taller': {
      if (slot === 'bottom' || slot === 'shoes') {
        const partnerId = slot === 'bottom' ? normalizeOutfit(outfit).shoes : normalizeOutfit(outfit).bottom
        const partner = resolveItem(partnerId, lookup)
        if (partner?.family && item.family && partner.family === item.family) {
          delta += 8
          reasons.push('与另一件下装/鞋同色系，视觉上把腿延长')
        }
      }
      if (item.family === 'dark') {
        delta += 4
        reasons.push('深色块减少横向分割，对小个子更友好')
      }
      if (BULKY_MESHES.has(item.mesh) && (slot === 'top' || slot === 'outer')) {
        delta -= 6
        reasons.push('宽松厚重轮廓会压低腰线，显高诉求下不建议')
      }
      break
    }
    case 'subtle': {
      if (item.family === 'accent') {
        delta -= 8
        reasons.push('彩度偏高，与"低调"相悖')
      } else if (LOW_KEY_FAMILIES.has(item.family)) {
        delta += 4
        reasons.push('低饱和深色/大地色更容易融进整体，不抢戏')
      } else {
        delta += 1
        reasons.push('浅色基础款，存在感克制')
      }
      break
    }
    case 'owned-only':
      break
    default:
      break
  }

  // 偏好信号：单品权重最具体，颜色权重次之
  const weight = itemWeight(preferences, item.id)
  if (weight > 0) reasons.push(`你给过这件 ${weight > 0 ? '+' : ''}${weight} 的累计正面反馈`)
  else if (weight < 0) reasons.push(`你给过这件 ${weight} 的累计负面反馈`)
  delta += clamp(weight, -WEIGHT_LIMIT, WEIGHT_LIMIT) * 0.5

  const before = preferenceDeltaOf(outfit, preferences, lookup)
  const after = preferenceDeltaOf(withSlot(outfit, slot, item.id), preferences, lookup)
  delta += after - before

  return { delta: clamp(Math.round(delta * 10) / 10, -DELTA_LIMIT, DELTA_LIMIT), reasons }
}

/**
 * 契约 §5：智能替换。
 * @param {{outfit:object, slot:string, intent:string, wardrobeState:object, preferences:object, limit?:number}} input
 * @returns {Array<{item:object, source:'personal'|'system', owned:boolean, scoreDelta:number, reasons:string[]}>}
 *
 * 会引入**新的**硬性冲突的候选一律剔除；能**消除**现有硬性冲突的候选获得额外加成。
 */
export function findSmartReplacements(input) {
  if (!input || typeof input !== 'object') return []
  const source = input
  const safeSlot = SLOTS.includes(source.slot) ? source.slot : 'top'
  const safeIntent = INTENTS.includes(source.intent) ? source.intent : 'subtle'
  const limit = Number.isFinite(source.limit) && source.limit > 0 ? Math.floor(source.limit) : 5
  const preferences = source.preferences
  const outfit = normalizeOutfit(source.outfit)
  const lookup = buildLookup(source.wardrobeState)

  const currentIds = new Set(safeSlot === 'accs' ? outfit.accs : [outfit[safeSlot]].filter(Boolean))
  const beforeConflicts = detectHardConflicts(outfit, lookup)

  const candidates = []
  const seen = new Set()

  const push = (item, kind, owned) => {
    if (!item || typeof item.id !== 'string' || item.id.length === 0) return
    if (seen.has(item.id) || currentIds.has(item.id)) return
    if (kind === 'system' && safeSlot === 'outer' && item.id === 'o-none') {
      // "不穿外套"是合法替换目标（去掉外套），但只在真的有外套时才有意义
      if (!outfit.outer || outfit.outer === 'o-none') return
    }
    seen.add(item.id)
    candidates.push({ item, kind, owned })
  }

  for (const item of ownedItemsForSlot(source.wardrobeState, safeSlot)) push(item, 'personal', true)
  if (safeIntent !== 'owned-only') {
    for (const item of CATEGORIES[CATEGORY_KEY[safeSlot]] || []) push(item, 'system', false)
  }

  const results = []
  for (const candidate of candidates) {
    const trial = withSlot(outfit, safeSlot, candidate.item.id)
    const afterConflicts = detectHardConflicts(trial, lookup)

    const introduced = afterConflicts.filter((reason) => !beforeConflicts.includes(reason))
    if (introduced.length > 0) continue // 不得覆盖硬性冲突：直接不出现在候选里

    const scored = scoreCandidate({
      item: candidate.item,
      slot: safeSlot,
      outfit,
      intent: safeIntent,
      lookup,
      preferences,
    })

    const reasons = [...scored.reasons]
    let delta = scored.delta

    const resolved = beforeConflicts.filter((reason) => !afterConflicts.includes(reason))
    if (resolved.length > 0) {
      delta = clamp(delta + 8, -DELTA_LIMIT, DELTA_LIMIT)
      reasons.push(`消除现有硬性冲突：${resolved.join('、')}`)
    }

    if (candidate.kind === 'personal') reasons.push('来自你的个人衣橱，已经拥有，排序获得 +5 优先')
    else if (safeIntent === 'owned-only') continue
    else reasons.push('需要补充购买的系统单品')

    results.push({
      item: normalizeCandidateItem(candidate.item, safeSlot),
      source: candidate.kind,
      owned: candidate.owned,
      // 意图/偏好增量（夹在 ±DELTA_LIMIT）+ 衣橱加成；契约未约束本字段上下界
      scoreDelta: clamp(delta, -DELTA_LIMIT, DELTA_LIMIT) + (candidate.owned ? OWNED_BONUS : 0),
      reasons: reasons.length > 0 ? reasons : ['与当前单品接近，只是换个观感'],
    })
  }

  results.sort(
    (a, b) =>
      b.scoreDelta - a.scoreDelta ||
      (b.owned ? 1 : 0) - (a.owned ? 1 : 0) ||
      a.item.id.localeCompare(b.item.id),
  )

  return results.slice(0, limit)
}

/** 目录里可供替换的槽位（UI 用来禁用没有候选的槽位）。 */
export function availableSlots() {
  return SLOTS.filter((slot) => (CATEGORIES[CATEGORY_KEY[slot]] || []).length > 0)
}

/**
 * 把一次替换结果落到 outfit 上，返回**新的** outfit（不修改入参）。
 * accs 槽位替换为单件配饰（与原 outfit 的其余配饰合并去重由调用方决定）。
 */
export function applyReplacement(outfit, slot, itemId) {
  if (!SLOTS.includes(slot)) return normalizeOutfit(outfit)
  return withSlot(outfit, slot, itemId)
}

/** 契约 §5 的 intent 中文标签，UI 与测试共用一份。 */
export function intentLabel(intent) {
  return INTENT_LABELS[intent] || String(intent)
}

export const CATALOG_LISTS = { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, ITEMS }

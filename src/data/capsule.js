// ============================================================================
// 胶囊衣橱规划（PHASE2-CONTRACT §4）
//
// 纯函数引擎：不引用 React / DOM / 网络，可被 Node 直接 `import` 做单测。
// 输入：季节、场景、个人衣橱、目标件数（12–20）。
// 输出：selected 核心单品 / missing 建议补齐 / 可组成造型数 / 每件覆盖率 /
//       购买优先级与理由。
//
// 三条硬规则（契约原文）：
//   1. 优先 owned；wishlist 只作补齐候选；系统单品只作「建议购买」，绝不冒充已有。
//   2. 至少覆盖 top / bottom / shoes；冷季（秋 / 冬）必须覆盖 outer。
//   3. 避免已知硬冲突（规则统一来自 src/data/conflicts.js，不另造一套说法）。
//
// 降级原则：空衣橱 / 脏数据 / 非法参数一律返回结构完整的空结果，绝不抛异常。
// 所有 storage 与时间都不需要——胶囊方案是纯派生结果，不写盘（契约 §5 禁止子组件
// 重复创建写盘 store，所以这里刻意不做任何持久化）。
// ============================================================================

import { ACCS, BOTTOMS, OUTERS, SHOES, TOPS } from './catalog.js'
import { CATEGORY_TO_SLOT } from './wardrobe.js'
import { detectConflicts } from './conflicts.js'

export const CAPSULE_MIN = 12
export const CAPSULE_MAX = 20
export const DEFAULT_TARGET = 16

/** 槽位顺序固定，UI 与测试都依赖这个顺序做稳定输出。 */
export const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']
export const SLOT_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋履', accs: '配饰' }

/** 至少要凑齐才能算「一套造型」的槽位（outer / accs 可为空）。 */
export const REQUIRED_SLOTS = ['top', 'bottom', 'shoes']

export const SEASONS = ['spring', 'summer', 'autumn', 'winter']
export const SEASON_LABELS = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }

// 场景沿用 recommendations.js / PHASE1 的既有取值域，避免出现第二套词汇。
export const OCCASIONS = ['casual', 'campus', 'work', 'date']
export const OCCASION_LABELS = { casual: '日常休闲', campus: '校园 / 上课', work: '通勤 / 面试', date: '约会 / 聚会' }

/**
 * 季节配置。
 * - perSlotWarmth：该季节下每个槽位的「理想保暖度」，用来给候选打分。
 *   分槽位而不是全局一个数，是因为冬季上装最高只有 3 而外套有 4，
 *   用单一目标值会让所有上装并列，失去区分度。
 * - outerQuota：外套在该季节的预算位（夏 1 件应付空调与早晚温差，冬 3 件）。
 * - outerMinWarmth：外套的保暖度下限（冬季只保留 3 以上的厚外套）。
 * - cold：契约里的「冷季」，决定 outer 是否为必需槽位。
 */
const SEASON_CONFIG = {
  spring: { perSlotWarmth: { top: 2, outer: 2, bottom: 2, shoes: 2, accs: 1 }, outerQuota: 2, outerMinWarmth: 1, cold: false },
  summer: { perSlotWarmth: { top: 1, outer: 0, bottom: 1, shoes: 1, accs: 1 }, outerQuota: 1, outerMinWarmth: 0, cold: false },
  autumn: { perSlotWarmth: { top: 3, outer: 2, bottom: 2, shoes: 3, accs: 2 }, outerQuota: 2, outerMinWarmth: 1, cold: true },
  winter: { perSlotWarmth: { top: 3, outer: 4, bottom: 2, shoes: 3, accs: 2 }, outerQuota: 3, outerMinWarmth: 3, cold: true },
}

/** 场景 → 理想正式度（1 休闲 … 3 正装）。胶囊要「一套穿得出去」，所以向场景靠拢。 */
const OCCASION_CONFIG = {
  casual: { formality: 1.2 },
  campus: { formality: 1.2 },
  work: { formality: 2.6 },
  date: { formality: 2.0 },
}

/** 非外套槽位的预算权重（总和不必为 1，allocateQuota 会归一化）。 */
const SLOT_WEIGHTS = { top: 0.32, bottom: 0.28, shoes: 0.18, accs: 0.12 }
/** 各槽位的保底件数：胶囊再小也要有换洗与搭配余地。 */
const SLOT_MIN = { top: 3, bottom: 3, shoes: 2, accs: 1 }

/** 枚举组合的上限。正常配额下最多 4^5 量级，这里只是防脏数据把内存打爆。 */
const COMBO_LIMIT = 200000

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const asArray = (v) => (Array.isArray(v) ? v : [])

// ---------------------------------------------------------------- 目录候选

/** 系统单品池：按槽位分组。o-none（不穿外套）不是可购买单品，排除。 */
function catalogCandidates() {
  const build = (list, slot) => list
    .filter((item) => item && typeof item.id === 'string' && item.id !== 'o-none')
    .map((item) => ({
      id: item.id,
      name: item.name,
      slot,
      source: 'system',
      ownership: 'catalog',
      hex: item.hex,
      family: item.family,
      formality: Number.isFinite(item.formality) ? item.formality : 1,
      warmth: Number.isFinite(item.warmth) ? item.warmth : 2,
      mesh: typeof item.mesh === 'string' ? item.mesh : '',
      tip: typeof item.tip === 'string' ? item.tip : '',
      ref: typeof item.ref === 'string' ? item.ref : '',
    }))
  return {
    top: build(TOPS, 'top'),
    outer: build(OUTERS, 'outer'),
    bottom: build(BOTTOMS, 'bottom'),
    shoes: build(SHOES, 'shoes'),
    accs: build(ACCS, 'accs'),
  }
}

const CATALOG_BY_SLOT = catalogCandidates()

/**
 * 个人单品 → 候选。category 是复数（tops/outers/…），要转成 outfit 槽位。
 * 脏数据（category 非法、缺 name）直接判为不可用，由调用方计入 warnings。
 */
function personalCandidate(item) {
  if (!isPlainObject(item)) return null
  const slot = CATEGORY_TO_SLOT[item.category]
  if (!slot || !SLOTS.includes(slot)) return null
  if (typeof item.name !== 'string' || !item.name.trim()) return null
  return {
    id: item.id,
    name: item.name,
    slot,
    source: 'personal',
    ownership: ['owned', 'wishlist', 'disliked'].includes(item.status) ? item.status : 'owned',
    hex: item.hex,
    family: typeof item.family === 'string' ? item.family : 'neutral',
    formality: Number.isFinite(item.formality) ? item.formality : 2,
    warmth: Number.isFinite(item.warmth) ? item.warmth : 2,
    mesh: typeof item.mesh === 'string' ? item.mesh : '',
    tip: typeof item.notes === 'string' ? item.notes : '',
    ref: '',
    wearCount: Number.isInteger(item.wearCount) ? item.wearCount : 0,
  }
}

/**
 * 归一化候选池。
 * @param {object|object[]} [wardrobe] 衣橱状态 `{items}` 或直接是 items 数组
 * @returns {{pool:object, warnings:string[]}} pool 按槽位分组，只含 owned（可入选）与
 *          wishlist（可补齐）两类；disliked 与脏数据被剔除。
 */
export function normalizeCandidates(wardrobe) {
  const warnings = []
  const source = isPlainObject(wardrobe) ? wardrobe.items : wardrobe
  const pool = Object.fromEntries(SLOTS.map((s) => [s, []]))
  const seen = new Set()
  let dropped = 0
  let disliked = 0

  for (const raw of asArray(source)) {
    const candidate = personalCandidate(raw)
    if (!candidate) { dropped += 1; continue }
    if (candidate.ownership === 'disliked') { disliked += 1; continue }
    // 个人 id 与系统 id 前缀不同（u- vs t-/o-/b-/s-/a-），正常不会碰撞；
    // 真撞了就保留先出现的那个，避免同一件被算两次导致覆盖率虚高。
    if (seen.has(candidate.id)) { dropped += 1; continue }
    seen.add(candidate.id)
    pool[candidate.slot].push(candidate)
  }

  if (dropped > 0) warnings.push(`衣橱里有 ${dropped} 件数据不完整或重复，未纳入胶囊规划`)
  if (disliked > 0) warnings.push(`已跳过 ${disliked} 件标记为「不要」的单品`)
  return { pool, warnings }
}

// ---------------------------------------------------------------- 冲突与搭配

/**
 * 已知硬冲突。返回中文原因，没有冲突返回 null。
 * 规则统一来自 src/data/conflicts.js（与 advice.js / personalRecommendations.js 同源）。
 */
export function hardConflict(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b) || a.slot === b.slot) return null
  const bySlot = { [a.slot]: a, [b.slot]: b }
  return detectConflicts(bySlot)[0] ?? null
}

/**
 * 两件单品的搭配度 0–1（越大越搭）。硬冲突返回 0。
 * 只做「正负号」级别的判断，不用它当主排序，避免和评分模型耦合过深。
 */
export function pairScore(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return 0
  if (hardConflict(a, b)) return 0
  let score = 0.5
  if (a.family === b.family) score += 0.2 // 同色系呼应（法则 16）
  const gap = Math.abs(a.formality - b.formality)
  if (gap <= 1) score += 0.2
  else if (gap >= 2.5) score -= 0.15
  return clamp01(score)
}

// ---------------------------------------------------------------- 配额

/**
 * 最大余数法按权重分配整数件数，先满足 mins 再分剩余。
 * @returns {Record<string, number>} 保证各项 ≥ mins 且总和尽量等于 total
 */
function allocateQuota(total, weights, mins) {
  const keys = Object.keys(weights)
  const out = {}
  let used = 0
  for (const k of keys) { out[k] = mins[k] || 0; used += out[k] }

  let pool = Math.max(0, total - used)
  if (pool > 0) {
    const sumW = keys.reduce((s, k) => s + weights[k], 0)
    if (sumW > 0) {
      const raw = keys.map((k) => ({ k, exact: (pool * weights[k]) / sumW }))
      let assigned = 0
      for (const r of raw) { const f = Math.floor(r.exact); out[r.k] += f; assigned += f }
      let left = pool - assigned
      const ranked = [...raw].sort((x, y) => (y.exact - Math.floor(y.exact)) - (x.exact - Math.floor(x.exact)))
      for (let i = 0; i < ranked.length && left > 0; i++) { out[ranked[i].k] += 1; left -= 1 }
      // 极小 target 下可能仍有剩余（mins 已吃掉预算），按权重顺序兜底补齐。
      for (let i = 0; i < keys.length && left > 0; i++) { out[keys[i]] += 1; left -= 1 }
    }
  } else if (total < used) {
    // target 小于保底总和（例如把目标件数压到 12 以下又被调用方强塞）：
    // 按权重从低到高削减，但每项至少留 1 件。
    const order = keys.slice().sort((x, y) => weights[x] - weights[y])
    let over = used - total
    for (const k of order) {
      while (over > 0 && out[k] > 1) { out[k] -= 1; over -= 1 }
      if (over <= 0) break
    }
  }
  return out
}

/**
 * 目标件数 + 季节 → 各槽位预算件数。总和等于 target。
 * @returns {Record<string, number>}
 */
export function quotaFor(target, season = 'autumn') {
  const cfg = SEASON_CONFIG[season] || SEASON_CONFIG.autumn
  const t = clampTarget(target)
  const outer = Math.min(cfg.outerQuota, t)
  const rest = t - outer
  const quota = allocateQuota(rest, SLOT_WEIGHTS, SLOT_MIN)
  return { ...quota, outer }
}

function clampTarget(target) {
  if (!Number.isFinite(target)) return DEFAULT_TARGET
  const i = Math.round(target)
  return Math.max(CAPSULE_MIN, Math.min(CAPSULE_MAX, i))
}

// ---------------------------------------------------------------- 打分与选择

function baseScore(c, cfg, occasionCfg) {
  const targetWarmth = cfg.perSlotWarmth[c.slot] ?? 2
  const warmthFit = clamp01(1 - Math.abs(c.warmth - targetWarmth) / 4)
  const formalityFit = clamp01(1 - Math.abs(c.formality - occasionCfg.formality) / 3)
  const ownership = c.ownership === 'owned' ? 1 : c.ownership === 'wishlist' ? 0.55 : 0.3
  // owned 优先是契约第一要求，所以给最高权重；其余两项保证「选出来的确实适合这个季节/场景」。
  return 0.42 * ownership + 0.30 * warmthFit + 0.28 * formalityFit
}

function reasonFor(c, cfg, occasionCfg, season, occasion) {
  const parts = [c.ownership === 'owned' ? '衣橱已有' : c.ownership === 'wishlist' ? '在愿望清单里' : '来自系统单品库']
  const targetWarmth = cfg.perSlotWarmth[c.slot] ?? 2
  if (Math.abs(c.warmth - targetWarmth) <= 1) parts.push(`保暖度 ${c.warmth} 契合${SEASON_LABELS[season]}`)
  else parts.push(`保暖度 ${c.warmth}，${SEASON_LABELS[season]}里需要靠叠穿调节`)
  if (Math.abs(c.formality - occasionCfg.formality) <= 0.6) parts.push(`正式度贴合${OCCASION_LABELS[occasion]}`)
  return parts.join(' · ')
}

/** 贪婪选件：每次都在「基础分 + 同槽色系多样性 + 与已选单品的搭配度」上取最优。 */
function selectForSlot(pool, quota, ctx) {
  if (quota <= 0) return []
  const candidates = [...pool].sort((a, b) => a.id.localeCompare(b.id))
  const picked = []
  while (picked.length < quota && picked.length < candidates.length) {
    let best = null
    let bestScore = -Infinity
    for (const c of candidates) {
      if (picked.some((p) => p.id === c.id)) continue
      if (picked.some((p) => hardConflict(p, c))) continue
      const already = picked.filter((p) => p.family === c.family).length
      // 同槽位色系重复轻微扣分：胶囊要能互相搭，不能五件全黑。
      const diversity = already === 0 ? 0.08 : -0.04 * already
      const others = ctx.chosen.filter((p) => p.slot !== c.slot)
      const pairAvg = others.length
        ? others.reduce((s, p) => s + pairScore(p, c), 0) / others.length
        : 0.5
      const score = c.base + diversity + 0.12 * (pairAvg - 0.5)
      if (score > bestScore || (score === bestScore && best && c.id < best.id)) {
        bestScore = score
        best = c
      }
    }
    if (!best) break
    picked.push(best)
    ctx.chosen.push(best)
  }
  return picked
}

// ---------------------------------------------------------------- 组合枚举

function enumerateCombos(slotPicks) {
  const active = SLOTS.filter((s) => slotPicks[s].length > 0)
  let combos = [[]]
  for (const slot of active) {
    const next = []
    for (const combo of combos) {
      for (const item of slotPicks[slot]) next.push([...combo, { slot, item }])
    }
    combos = next
    if (combos.length > COMBO_LIMIT) return null
  }
  return combos
}

function comboConflict(entries) {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const reason = hardConflict(entries[i].item, entries[j].item)
      if (reason) return reason
    }
  }
  return null
}

/**
 * 可组成造型数 = 每个非空槽位各取一件、且彼此无硬冲突的组合数。
 * 必填槽位（top/bottom/shoes）任一为空时结果为 0——凑不出一套就不该虚报。
 * @returns {{count:number, exact:boolean, conflicts:string[]}}
 */
export function countCombinations(selected) {
  const slotPicks = Object.fromEntries(SLOTS.map((s) => [s, []]))
  for (const item of asArray(selected)) {
    if (slotPicks[item.slot]) slotPicks[item.slot].push(item)
  }
  if (!REQUIRED_SLOTS.every((s) => slotPicks[s].length > 0)) return { count: 0, exact: true, conflicts: [] }

  const combos = enumerateCombos(slotPicks)
  if (combos === null) {
    const product = SLOTS.reduce((acc, s) => acc * (slotPicks[s].length || 1), 1)
    return { count: product, exact: false, conflicts: [] }
  }
  const conflicts = []
  let valid = 0
  for (const combo of combos) {
    const reason = comboConflict(combo)
    if (reason) { if (!conflicts.includes(reason)) conflicts.push(reason); continue }
    valid += 1
  }
  return { count: valid, exact: true, conflicts }
}

/**
 * 每件单品的覆盖率 = 包含它的合法组合数。
 * 不变式：同一槽位所有单品的覆盖率之和 == 组合数（每套组合在每个槽位恰好取一件）。
 * @returns {Map<string, {count:number, ratio:number}>}
 */
export function computeCoverage(selected) {
  const map = new Map()
  for (const item of asArray(selected)) map.set(item.id, { count: 0, ratio: 0 })
  const slotPicks = Object.fromEntries(SLOTS.map((s) => [s, []]))
  for (const item of asArray(selected)) if (slotPicks[item.slot]) slotPicks[item.slot].push(item)
  if (!REQUIRED_SLOTS.every((s) => slotPicks[s].length > 0)) return map

  const combos = enumerateCombos(slotPicks)
  if (combos === null) return map
  let valid = 0
  for (const combo of combos) {
    if (comboConflict(combo)) continue
    valid += 1
    for (const entry of combo) {
      const hit = map.get(entry.item.id)
      if (hit) hit.count += 1
    }
  }
  for (const hit of map.values()) hit.ratio = valid === 0 ? 0 : Math.round((hit.count / valid) * 1000) / 1000
  return map
}

// ---------------------------------------------------------------- 缺项与优先级

function slotNeed(slot, have, target, season) {
  const required = REQUIRED_SLOTS.includes(slot) || (slot === 'outer' && SEASON_CONFIG[season]?.cold)
  if (have === 0) return required ? 1 : 0.5
  if (target <= 0) return 0
  const deficit = Math.max(0, target - have)
  return clamp01(deficit / Math.max(1, target)) * 0.8 + (required ? 0.2 : 0)
}

/**
 * 生成补齐建议。候选来源顺序体现契约的优先级：
 * wishlist（已经想买，可以直接下单）→ 系统单品库（建议购买，明确标注不是已有）。
 * @returns {{items:object[], gaps:object[]}}
 */
function buildMissing({ pool, selected, quota, cfg, occasionCfg, season, occasion }) {
  const selectedIds = new Set(selected.map((s) => s.id))
  const gaps = []
  const items = []

  for (const slot of SLOTS) {
    const have = selected.filter((s) => s.slot === slot).length
    const target = quota[slot] || 0
    const need = slotNeed(slot, have, target, season)
    gaps.push({
      slot,
      target,
      have,
      deficit: Math.max(0, target - have),
      required: REQUIRED_SLOTS.includes(slot) || (slot === 'outer' && cfg.cold),
    })
    if (target - have <= 0) continue

    const wishlist = pool[slot].filter((c) => c.ownership === 'wishlist' && !selectedIds.has(c.id))
    const system = CATALOG_BY_SLOT[slot] || []
    const wanted = Math.min(target - have, 3) * 2 + 1

    const candidates = [
      ...wishlist.map((c) => ({ c, tier: 1 })),
      ...system.map((c) => ({ c, tier: 2 })),
    ]
    const scored = candidates.map(({ c, tier }) => {
      const fit = baseScore({ ...c, ownership: tier === 1 ? 'wishlist' : 'catalog' }, cfg, occasionCfg)
      // 优先级 = 槽位缺口（一半权重）+ 这件本身有多合适（一半权重）；wishlist 略微提前。
      const priority = 0.5 * need + 0.5 * fit + (tier === 1 ? 0.04 : 0)
      return { c, tier, fit, priority }
    })

    scored.sort((a, b) => b.priority - a.priority || a.c.id.localeCompare(b.c.id))

    for (const entry of scored.slice(0, wanted)) {
      const { c, tier, priority } = entry
      const warmthGap = Math.abs(c.warmth - (cfg.perSlotWarmth[slot] ?? 2))
      const why = tier === 1
        ? `已在愿望清单，可直接补齐${SLOT_LABELS[slot]}`
        : `衣橱缺 ${Math.max(0, target - have)} 件${SLOT_LABELS[slot]}，这件保暖度 ${c.warmth}／正式度 ${c.formality} 与${SEASON_LABELS[season]}${OCCASION_LABELS[occasion]}最贴合`
      items.push({
        id: c.id,
        name: c.name,
        slot,
        source: c.source,
        ownership: c.ownership,
        hex: c.hex,
        family: c.family,
        formality: c.formality,
        warmth: c.warmth,
        mesh: c.mesh,
        tip: c.tip,
        ref: c.ref,
        needScore: Math.round(need * 1000) / 1000,
        priority: Math.round(priority * 1000) / 1000,
        warmthGap,
        reason: why,
      })
    }
  }

  items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  items.forEach((item, index) => { item.rank = index + 1 })
  return { items, gaps }
}

// ---------------------------------------------------------------- 主入口

/**
 * 生成胶囊衣橱方案。
 * @param {{season?:string, occasion?:string, target?:number, wardrobe?:object|object[]}} [input]
 * @returns {{
 *   version:number, season:string, seasonLabel:string, occasion:string, occasionLabel:string,
 *   target:number, quota:object, selected:object[], missing:object[], gaps:object[],
 *   combinationCount:number, combinationExact:boolean, conflicts:string[],
 *   stats:object, warnings:string[]
 * }}
 */
export function planCapsule(input) {
  const raw = isPlainObject(input) ? input : {}
  const warnings = []
  const season = SEASONS.includes(raw.season) ? raw.season : 'autumn'
  const occasion = OCCASIONS.includes(raw.occasion) ? raw.occasion : 'casual'
  const target = clampTarget(raw.target)
  if (raw.season !== undefined && !SEASONS.includes(raw.season)) warnings.push(`季节 ${String(raw.season)} 非法，已按秋季处理`)
  if (raw.occasion !== undefined && !OCCASIONS.includes(raw.occasion)) warnings.push(`场景 ${String(raw.occasion)} 非法，已按日常休闲处理`)
  if (Number.isFinite(raw.target) && Math.round(raw.target) !== target) {
    warnings.push(`目标件数已调整到 ${target} 件（契约范围为 ${CAPSULE_MIN}–${CAPSULE_MAX}）`)
  }

  const cfg = SEASON_CONFIG[season]
  const occasionCfg = OCCASION_CONFIG[occasion]
  const quota = quotaFor(target, season)

  const { pool, warnings: poolWarnings } = normalizeCandidates(raw.wardrobe)
  warnings.push(...poolWarnings)

  // owned 才能入选核心清单；wishlist 留到 missing 里当补齐候选。
  const ownedPool = Object.fromEntries(SLOTS.map((s) => [s, pool[s].filter((c) => c.ownership === 'owned')]))
  // 冬季只留足够厚的外套，否则「冷季覆盖 outer」会覆盖成一件夹克。
  ownedPool.outer = ownedPool.outer.filter((c) => c.warmth >= cfg.outerMinWarmth)
  if (cfg.outerMinWarmth > 0 && pool.outer.some((c) => c.ownership === 'owned' && c.warmth < cfg.outerMinWarmth)) {
    warnings.push(`冬季已排除保暖度低于 ${cfg.outerMinWarmth} 的外套`)
  }

  const chosen = []
  const selected = []
  for (const slot of SLOTS) {
    const scored = ownedPool[slot].map((c) => ({ ...c, base: baseScore(c, cfg, occasionCfg) }))
    scored.sort((a, b) => b.base - a.base || a.id.localeCompare(b.id))
    const picked = selectForSlot(scored, quota[slot] || 0, { chosen })
    for (const c of picked) {
      selected.push({
        id: c.id,
        name: c.name,
        slot: c.slot,
        source: c.source,
        ownership: c.ownership,
        hex: c.hex,
        family: c.family,
        formality: c.formality,
        warmth: c.warmth,
        mesh: c.mesh,
        tip: c.tip,
        ref: c.ref,
        reason: reasonFor(c, cfg, occasionCfg, season, occasion),
      })
    }
  }

  const combo = countCombinations(selected)
  const coverage = computeCoverage(selected)
  for (const item of selected) {
    const hit = coverage.get(item.id)
    item.coverage = hit ? hit.count : 0
    item.coverageRatio = hit ? hit.ratio : 0
  }

  const { items: missing, gaps } = buildMissing({
    pool, selected, quota, cfg, occasionCfg, season, occasion,
  })

  if (selected.length === 0) warnings.push('衣橱里还没有「已有」单品，下面是建议购买清单')
  else if (selected.length < target) warnings.push(`当前只凑出 ${selected.length} 件（目标 ${target} 件），缺口见补齐建议`)
  if (combo.conflicts.length) warnings.push(`已按硬冲突过滤：${combo.conflicts.join('；')}`)
  if (combo.count === 0 && selected.length > 0) warnings.push('现有单品无法组成完整造型（至少需要上装 / 下装 / 鞋履各一件）')

  const coveredSlots = SLOTS.filter((s) => selected.some((i) => i.slot === s))
  return {
    version: 1,
    season,
    seasonLabel: SEASON_LABELS[season],
    occasion,
    occasionLabel: OCCASION_LABELS[occasion],
    target,
    quota,
    selected,
    missing,
    gaps,
    combinationCount: combo.count,
    combinationExact: combo.exact,
    conflicts: combo.conflicts,
    stats: {
      selectedCount: selected.length,
      missingCount: missing.length,
      combinationCount: combo.count,
      exact: combo.exact,
      coveredSlots,
      missingRequiredSlots: REQUIRED_SLOTS.filter((s) => !coveredSlots.includes(s)),
      averageCoverage: selected.length === 0
        ? 0
        : Math.round((selected.reduce((s, i) => s + i.coverageRatio, 0) / selected.length) * 1000) / 1000,
    },
    warnings,
  }
}

// 多套对比 + 二维拼贴的纯逻辑（PHASE3-CONTRACT §2）。
//
// 这一层刻意不产出任何像素：对比表要的是可排序的数值，拼贴要的是每格的位置与内容。
// 谁去画（DOM 还是 Canvas）由组件决定，因此这里只返回数字与字符串，
// 也就能在 Node 下直接跑断言——样式和渲染是这个项目里最难自测的部分。
//
// 评分只能从 getAdvice(outfit).score 拿（advice.js 没有独立评分函数），
// 所以这里把 getAdvice 包成默认实现，同时留出 ctx 注入口方便测试替身。
import { ITEMS, byId } from './catalog.js'
import { getAdvice } from './advice.js'

export const MAX_COMPARE = 4
export const MIN_COMPARE = 2
export const COLLAGE_PRESETS = ['auto', 'single', 'duo', 'trio', 'quad']
/** 平铺陈列顺序：外套在最外，配饰收尾，和肉眼从上到下扫的顺序一致。 */
export const SLOT_ORDER = ['outer', 'top', 'bottom', 'shoes', 'accs']
export const SLOT_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋履', accs: '配饰' }

const SLOT_SHAPES = { outer: 'outer', top: 'torso', bottom: 'legs', shoes: 'shoe', accs: 'accessory' }
const SLOT_LISTS = { top: 'top', outer: 'outer', bottom: 'bottom', shoes: 'shoes' }
const DEFAULT_CELL = { width: 260, height: 320 }
const PRESET_GRIDS = { single: [1, 1], duo: [2, 1], trio: [3, 1], quad: [2, 2] }

const isOutfit = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** 造型 → 五槽位 id 列表（含缺项占位用的 undefined，便于数缺件）。 */
function slotIds(outfit) {
  const source = isOutfit(outfit) ? outfit : {}
  const accs = Array.isArray(source.accs) ? source.accs.filter((id) => typeof id === 'string') : []
  return {
    top: typeof source.top === 'string' ? source.top : null,
    outer: typeof source.outer === 'string' && source.outer !== 'o-none' ? source.outer : null,
    bottom: typeof source.bottom === 'string' ? source.bottom : null,
    shoes: typeof source.shoes === 'string' ? source.shoes : null,
    accs,
  }
}

function pickItem(id, items) {
  if (!id) return null
  const list = Array.isArray(items) ? items : null
  const found = list ? byId(list, id) : null
  return found || ITEMS.find((item) => item.id === id) || null
}

/**
 * 一套造型的主色带（按槽位出现顺序，去重但保留首个来源槽位）。
 * 只统计有 hex 的单品；个人单品也走同一条路（目录叠加层已能解析 u- id）。
 */
function paletteOf(outfit, items) {
  const ids = slotIds(outfit)
  const seen = new Map()
  const push = (id, slot) => {
    const item = pickItem(id, items)
    if (!item || typeof item.hex !== 'string') return
    const key = item.hex.toLowerCase()
    if (seen.has(key)) return
    seen.set(key, { hex: item.hex, slot, label: item.name || item.id })
  }
  SLOT_ORDER.forEach((slot) => {
    if (slot === 'accs') ids.accs.forEach((id) => push(id, 'accs'))
    else push(ids[slot], slot)
  })
  return [...seen.values()]
}

function ownedRatioOf(outfit, wardrobe) {
  const state = wardrobe && wardrobe.items ? wardrobe : wardrobe && wardrobe.state ? wardrobe.state : wardrobe
  const list = state && Array.isArray(state.items) ? state.items : null
  if (!list) return null
  const owned = new Set(list.filter((item) => item && item.status === 'owned').map((item) => item.id))
  const ids = slotIds(outfit)
  const all = [ids.top, ids.outer, ids.bottom, ids.shoes, ...ids.accs].filter(Boolean)
  if (!all.length) return null
  const have = all.filter((id) => owned.has(id)).length
  return { ratio: have / all.length, ownedCount: have, total: all.length }
}

function missingOf(outfit, wardrobe) {
  const state = wardrobe && wardrobe.items ? wardrobe : wardrobe && wardrobe.state ? wardrobe.state : wardrobe
  const list = state && Array.isArray(state.items) ? state.items : null
  if (!list) return { count: 0, list: [] }
  const owned = new Set(list.filter((item) => item && item.status === 'owned').map((item) => item.id))
  const ids = slotIds(outfit)
  const entries = []
  const push = (id, slot) => {
    if (!id || owned.has(id)) return
    entries.push({ slot, label: SLOT_LABELS[slot] || slot, id })
  }
  ;['top', 'outer', 'bottom', 'shoes'].forEach((slot) => push(ids[slot], slot))
  ids.accs.forEach((id) => push(id, 'accs'))
  return { count: entries.length, list: entries }
}

function warmthOf(outfit, items) {
  const ids = slotIds(outfit)
  const all = [ids.top, ids.outer, ids.bottom, ids.shoes, ...ids.accs]
  return all.reduce((sum, id) => {
    const item = pickItem(id, items)
    const warmth = Number(item?.warmth)
    return sum + (Number.isFinite(warmth) ? warmth : 0)
  }, 0)
}

function formalityOf(outfit, items) {
  const ids = slotIds(outfit)
  const main = [ids.top, ids.outer, ids.bottom, ids.shoes]
    .map((id) => pickItem(id, items))
    .filter(Boolean)
  const values = main
    .map((item) => Number(item.formality))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function scoreOfDefault(outfit) {
  try {
    const advice = getAdvice(outfit)
    const total = Number(advice?.score?.total)
    return { total: Number.isFinite(total) ? total : null, advice }
  } catch {
    // 评分失败不该让整个对比表消失：这一列显示为「—」，其余照常。
    return { total: null, advice: null }
  }
}

/**
 * 对比 2–MAX_COMPARE 套造型。
 * 少于两套、或不是数组 → ok:false（这不是异常，是调用方还没选够）。
 * 超过上限 → 截断并记 warning，而不是报错：用户可能一下选了五套。
 */
export function compareOutfits(outfits, ctx = {}) {
  const context = isOutfit(ctx) ? ctx : {}
  const warnings = []
  if (!Array.isArray(outfits)) {
    return { ok: false, error: '需要一组造型（数组）', looks: [], metrics: [], best: {}, bestOverall: null, warnings }
  }
  if (outfits.length < MIN_COMPARE) {
    return { ok: false, error: '至少选 ' + MIN_COMPARE + ' 套才能对比', looks: [], metrics: [], best: {}, bestOverall: null, warnings }
  }
  let picked = outfits
  if (outfits.length > MAX_COMPARE) {
    warnings.push('一次最多对比 ' + MAX_COMPARE + ' 套，已取前 ' + MAX_COMPARE + ' 套')
    picked = outfits.slice(0, MAX_COMPARE)
  }

  const items = Array.isArray(context.items) ? context.items : null
  const scoreFn = typeof context.scoreOf === 'function' ? context.scoreOf : null
  const adviceFn = typeof context.adviceOf === 'function' ? context.adviceOf : null

  const looks = picked.map((raw, index) => {
    const outfit = isOutfit(raw) ? (raw.outfit && isOutfit(raw.outfit) ? raw.outfit : raw) : {}
    const titled = isOutfit(raw) && typeof raw.name === 'string' ? raw.name : ''
    let score = null
    let advice = null
    if (scoreFn) {
      // 注意 Number(null) === 0：直接 Number() 会把「没有评分」悄悄变成 0 分，
      // 于是它在排行榜上永远垫底、界面显示「0 分」而不是「—」。所以先显式判空。
      const produced = scoreFn(outfit)
      const raw = produced && typeof produced === 'object' ? produced.total : produced
      const numeric = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw)
      score = Number.isFinite(numeric) ? numeric : null
      advice = adviceFn ? adviceFn(outfit) : null
    } else {
      const produced = scoreOfDefault(outfit)
      score = produced.total
      advice = adviceFn ? adviceFn(outfit) : produced.advice
    }
    if (!Number.isFinite(score)) score = null
    const breakdown = Array.isArray(advice?.score?.breakdown) ? advice.score.breakdown : []
    const owned = ownedRatioOf(outfit, context.wardrobe)
    const missing = missingOf(outfit, context.wardrobe)
    const palette = paletteOf(outfit, items)
    return {
      index,
      outfit,
      title: titled || '造型 ' + (index + 1),
      score,
      grade: typeof advice?.score?.verdict === 'string' ? advice.score.verdict : null,
      warmth: warmthOf(outfit, items),
      formality: formalityOf(outfit, items),
      ownedRatio: owned ? owned.ratio : null,
      ownedCount: owned ? owned.ownedCount : 0,
      missingCount: missing.count,
      missing: missing.list,
      palette,
      colorCount: palette.length,
      scoreParts: breakdown
        .filter((part) => part && typeof part === 'object')
        .map((part) => ({
          key: String(part.key ?? ''),
          label: String(part.label ?? ''),
          value: Number(part.value) || 0,
          max: Number(part.max) || 0,
        })),
    }
  })

  // 六项固定指标。指标定义写在一处，界面就不用自己知道「怎么算最好」。
  const definitions = [
    { key: 'score', label: '综合评分', unit: '分', direction: 'higher', read: (look) => look.score, format: (v) => v + ' 分' },
    { key: 'warmth', label: '保暖总和', unit: '级', direction: 'higher', read: (look) => look.warmth, format: (v) => '总和 ' + v },
    { key: 'formality', label: '正式度', unit: '级', direction: 'higher', read: (look) => look.formality, format: (v) => v.toFixed(1) + ' 级' },
    { key: 'ownedRatio', label: '衣橱已有', unit: '%', direction: 'higher', read: (look) => look.ownedRatio, format: (v) => Math.round(v * 100) + '%' },
    { key: 'missingCount', label: '缺件', unit: '件', direction: 'lower', read: (look) => look.missingCount, format: (v) => v + ' 件' },
    { key: 'colorCount', label: '配色数', unit: '色', direction: 'lower', read: (look) => look.colorCount, format: (v) => v + ' 色' },
  ]

  const best = {}
  const metrics = definitions.map((definition) => {
    const raw = looks.map((look) => {
      const value = definition.read(look)
      return Number.isFinite(value) ? value : null
    })
    const present = raw.filter((value) => value !== null)
    // 缺件只看有衣橱数据时才比较；没有衣橱（全 0）时这一列的「最优」毫无意义。
    const comparable = present.length > 0
      && !(definition.key === 'missingCount' && looks.every((look) => look.ownedRatio === null))
    let bestValue = null
    if (comparable) {
      bestValue = definition.direction === 'lower' ? Math.min(...present) : Math.max(...present)
    }
    const values = raw.map((value, lookIndex) => ({
      lookIndex,
      value,
      display: value === null ? '—' : definition.format(value),
      // 并列最优都算最优：只高亮一套会让用户以为另一套更差。
      best: comparable && value !== null && value === bestValue,
    }))
    if (comparable) {
      const champion = values.find((entry) => entry.best)
      if (champion) best[definition.key] = champion.lookIndex
    }
    return { key: definition.key, label: definition.label, unit: definition.unit, direction: definition.direction, values }
  })

  // 综合最好 = 评分并列时看「衣橱已有占比」更高的那套（更能马上穿出门）。
  let bestOverall = null
  const scored = looks.filter((look) => look.score !== null)
  if (scored.length) {
    const topScore = Math.max(...scored.map((look) => look.score))
    const tied = scored.filter((look) => look.score === topScore)
    bestOverall = tied
      .slice()
      .sort((a, b) => (b.ownedRatio ?? -1) - (a.ownedRatio ?? -1))[0]
      .index
  }

  return { ok: true, looks, metrics, best, bestOverall, warnings }
}

/**
 * 把一套造型摊平成「平铺图」格子描述。
 * 与实际渲染无关，只回答：有哪几格、每格什么形状、什么颜色、缺了什么。
 */
export function flatLay(outfit, ctx = {}) {
  const context = isOutfit(ctx) ? ctx : {}
  const warnings = []
  if (!isOutfit(outfit)) {
    return { ok: false, error: '需要一套造型（对象）', cells: [], palette: [], colorCount: 0, warnings }
  }
  const items = Array.isArray(context.items) ? context.items : null
  const ids = slotIds(outfit)
  const cells = []
  let order = 0

  SLOT_ORDER.forEach((slot) => {
    if (slot === 'accs') {
      if (!ids.accs.length) {
        cells.push({ slot, label: SLOT_LABELS[slot], order: order++, item: null, placeholder: true, shape: SLOT_SHAPES[slot] })
        return
      }
      ids.accs.forEach((id) => {
        const item = pickItem(id, items)
        if (!item) warnings.push('配饰 ' + id + ' 不在目录里，已画成空位')
        cells.push({
          slot,
          label: SLOT_LABELS[slot],
          order: order++,
          item: item ? { id: item.id, name: item.name || item.id, hex: item.hex || '', family: item.family || '', mesh: item.mesh || '' } : null,
          placeholder: !item,
          shape: SLOT_SHAPES[slot],
        })
      })
      return
    }
    const id = ids[slot]
    const item = pickItem(id, items)
    // 外套留空是常态（o-none），不该刷告警；只有「给了 id 却查不到」才是异常。
    if (id && !item) warnings.push('单品 ' + id + ' 不在目录里，已画成空位')
    cells.push({
      slot,
      label: SLOT_LABELS[slot],
      order: order++,
      item: item ? { id: item.id, name: item.name || item.id, hex: item.hex || '', family: item.family || '', mesh: item.mesh || '' } : null,
      placeholder: !item,
      shape: SLOT_SHAPES[slot],
    })
  })

  const counts = new Map()
  cells.forEach((cell) => {
    if (!cell.item || !cell.item.hex) return
    const key = cell.item.hex.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0)
  const palette = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))

  return { ok: true, cells, palette, colorCount: palette.length, warnings }
}

/** 行列数：auto 按套数决定，其余强制。 */
function gridFor(preset, count) {
  if (preset === 'auto' || !COLLAGE_PRESETS.includes(preset)) {
    if (count <= 1) return PRESET_GRIDS.single
    if (count === 2) return PRESET_GRIDS.duo
    if (count === 3) return PRESET_GRIDS.trio
    return PRESET_GRIDS.quad
  }
  return PRESET_GRIDS[preset]
}

/**
 * 拼贴几何。只返回数字与每格内容，不碰 DOM、不读 window——
 * 组件可以拿它去绝对定位 div，也可以拿同一份数字去 Canvas 上画。
 */
export function collageLayout(input = {}) {
  const options = isOutfit(input) ? input : {}
  const warnings = []
  const rawLooks = Array.isArray(options.looks) ? options.looks : null
  if (!rawLooks || !rawLooks.length) {
    return { ok: false, error: '至少需要一套造型', cols: 0, rows: 0, width: 0, height: 0, cells: [], warnings }
  }
  let looks = rawLooks
  if (looks.length > MAX_COMPARE) {
    warnings.push('拼贴最多 ' + MAX_COMPARE + ' 套，已取前 ' + MAX_COMPARE + ' 套')
    looks = looks.slice(0, MAX_COMPARE)
  }

  const cellInput = isOutfit(options.cell) ? options.cell : {}
  const cell = {
    width: Number.isFinite(cellInput.width) && cellInput.width > 0 ? cellInput.width : DEFAULT_CELL.width,
    height: Number.isFinite(cellInput.height) && cellInput.height > 0 ? cellInput.height : DEFAULT_CELL.height,
  }
  const gap = Number.isFinite(options.gap) && options.gap >= 0 ? options.gap : 16
  const padding = Number.isFinite(options.padding) && options.padding >= 0 ? options.padding : 24
  const caption = options.caption !== false
  const preset = COLLAGE_PRESETS.includes(options.preset) ? options.preset : 'auto'

  const [cols, rows] = gridFor(preset, looks.length)
  const width = padding * 2 + cols * cell.width + (cols - 1) * gap
  const height = padding * 2 + rows * cell.height + (rows - 1) * gap

  const cells = looks.map((raw, lookIndex) => {
    const column = lookIndex % cols
    const row = Math.floor(lookIndex / cols)
    const outfit = isOutfit(raw) ? (isOutfit(raw.outfit) ? raw.outfit : raw) : {}
    const title = isOutfit(raw) && typeof raw.name === 'string' && raw.name ? raw.name : '造型 ' + (lookIndex + 1)
    const scoreValue = isOutfit(raw) && Number.isFinite(Number(raw.score)) ? Number(raw.score) : null
    return {
      x: padding + column * (cell.width + gap),
      y: padding + row * (cell.height + gap),
      width: cell.width,
      height: cell.height,
      lookIndex,
      title,
      score: scoreValue,
      flatLay: flatLay(outfit, options),
    }
  })

  return { ok: true, cols, rows, width, height, cell, gap, padding, caption, cells, warnings }
}

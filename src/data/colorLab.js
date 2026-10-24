// 色彩实验室 · 纯计算层
//
// 这里刻意不碰 DOM：照片由组件解码成像素数组再传进来，因此
// 取色、诊断、色差匹配、同色造型生成都能在 Node 下直接断言。
// 造型生成复用 advice 的评分与 conflicts 的硬冲突，保证和 3D 试衣间同一套口径。

import { ITEMS, TOPS, OUTERS, BOTTOMS, SHOES, ACCS, byId } from './catalog.js'
import { getAdvice } from './advice.js'
import { detectConflicts } from './conflicts.js'

export const PALETTE_SIZE = 5
export const MAX_PALETTE_SIZE = 8
export const MATCH_LIMIT = 4
export const CLOSE_DELTA_E = 10
export const MAX_SAMPLE_PIXELS = 24000

export const SLOT_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋履', accs: '配饰' }
export const SLOT_WEIGHTS = { top: 0.32, outer: 0.22, bottom: 0.28, shoes: 0.1, accs: 0.08 }
const SLOT_ORDER = ['top', 'outer', 'bottom', 'shoes', 'accs']
const CATEGORY_LABELS = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋履', accs: '配饰' }
const CATEGORY_OF = new Map([
  ...TOPS.map((item) => [item.id, 'top']),
  ...OUTERS.map((item) => [item.id, 'outer']),
  ...BOTTOMS.map((item) => [item.id, 'bottom']),
  ...SHOES.map((item) => [item.id, 'shoes']),
  ...ACCS.map((item) => [item.id, 'accs']),
])

const HUE_CLUSTER_GAP = 40
// 以 Lab 彩度判定中性色：米白/浅灰在 HSL 里饱和度可以到 0.25，
// 但视觉上仍是中性色；只看 HSL 会把它当成彩色族。
const NEUTRAL_CHROMA = 8

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
const round = (value, digits = 1) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 归一化为 #rrggbb；支持 3/6 位与带 alpha 的 8 位（alpha≈0 视为无效）。 */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null
  let hex = value.trim().replace(/^#/, '').toLowerCase()
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return null
  if (hex.length === 8) {
    if (parseInt(hex.slice(6), 16) / 255 <= 0.05) return null
    hex = hex.slice(0, 6)
  }
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('')
  return `#${hex}`
}

export function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const int = parseInt(normalized.slice(1), 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function rgbToHex(rgb) {
  if (!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)) return null
  const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

export function rgbToHsl(rgb) {
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h
  if (max === r) h = (g - b) / delta + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  return { h: h * 60, s, l }
}

const srgbToLinear = (channel) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function rgbToLab(rgb) {
  if (!rgb) return null
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function hexToLab(hex) {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToLab(rgb) : null
}

/** CIE76 色差：0 为同色，约 2.3 起人眼可辨；用于「最接近的颜色」排序足够。 */
export function deltaE(hexA, hexB) {
  const a = hexToLab(hexA)
  const b = hexToLab(hexB)
  if (!a || !b) return null
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b)
}

const relativeLuminance = (rgb) => (
  0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b)
)

export function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return null
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 给用户看的颜色名：不追求学名准确，追求「看一眼能对上」。 */
export function colorName(hex) {
  const rgb = hexToRgb(hex)
  const hsl = rgbToHsl(rgb)
  if (!hsl) return '未知色'
  const { h, s, l } = hsl
  if (l <= 0.18) return '黑'
  if (s < 0.1) {
    if (l >= 0.9) return '白'
    if (l >= 0.72) return '浅灰'
    if (l <= 0.34) return '深灰'
    return '灰'
  }
  if (h >= 20 && h <= 55 && l >= 0.8) return '米白'
  if (h >= 15 && h <= 55 && s <= 0.5) {
    if (l <= 0.35) return '深棕'
    if (l >= 0.7) return '浅卡其'
    return '棕'
  }
  if (h >= 65 && h <= 120 && s <= 0.35 && l <= 0.5) return '军绿'
  let base
  if (h < 15 || h >= 345) base = '红'
  else if (h < 40) base = '橙'
  else if (h < 65) base = '黄'
  else if (h < 160) base = '绿'
  else if (h < 195) base = '青'
  else if (h < 255) base = '蓝'
  else if (h < 290) base = '紫'
  else base = '粉'
  const tone = l < 0.32 ? '深' : l > 0.72 ? '浅' : ''
  return `${tone}${base}`
}

const hueGap = (a, b) => {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

const circularHue = (entries) => {
  let x = 0
  let y = 0
  let weight = 0
  for (const entry of entries) {
    const share = entry.share ?? 0
    const rad = (entry.h * Math.PI) / 180
    x += Math.cos(rad) * share
    y += Math.sin(rad) * share
    weight += share
  }
  if (weight <= 0) return entries[0]?.h ?? 0
  const angle = (Math.atan2(y, x) * 180) / Math.PI
  return (angle + 360) % 360
}

/** 色相聚类：相邻色相差 ≤ 40° 归为一族，首尾也按环形合并。 */
function clusterHues(entries) {
  if (!entries.length) return []
  const sorted = entries.slice().sort((a, b) => a.h - b.h)
  const groups = []
  for (const entry of sorted) {
    const last = groups[groups.length - 1]
    if (last && hueGap(circularHue(last), entry.h) <= HUE_CLUSTER_GAP) last.push(entry)
    else groups.push([entry])
  }
  if (groups.length > 1 && hueGap(circularHue(groups[0]), circularHue(groups[groups.length - 1])) <= HUE_CLUSTER_GAP) {
    groups[0] = groups[groups.length - 1].concat(groups[0])
    groups.pop()
  }
  return groups.map((group) => ({
    hue: circularHue(group),
    share: group.reduce((sum, entry) => sum + (entry.share ?? 0), 0),
    size: group.length,
  }))
}

/** 把外部输入整理成统一的 { hex, share, ... } 列表；份额按总和归一。 */
function normalizePalette(palette) {
  const list = Array.isArray(palette) ? palette : []
  const rows = []
  for (const entry of list) {
    const raw = typeof entry === 'string' ? { hex: entry } : entry
    const hex = normalizeHex(raw?.hex)
    if (!hex) continue
    const share = Number(raw?.share)
    rows.push({
      hex,
      share: Number.isFinite(share) && share > 0 ? share : null,
      slot: raw?.slot ?? null,
      labels: Array.isArray(raw?.labels) ? raw.labels.filter((label) => typeof label === 'string') : [],
    })
  }
  if (!rows.length) return []
  const hasShare = rows.every((row) => row.share !== null)
  const total = hasShare ? rows.reduce((sum, row) => sum + row.share, 0) : 0
  const share = hasShare && total > 0 ? null : 1 / rows.length
  return rows.map((row) => ({
    ...row,
    share: share === null ? row.share / total : share,
  }))
}

/**
 * 从 RGBA 像素里提取主色（5 位直方图 + 最相近色合并）。
 * 组件负责把照片缩到小尺寸，这里只做纯计算；alpha < 125 的像素会被忽略。
 *
 * 为什么不用中位切分：在「主色块边界清晰」的图上，按通道中位数切会切穿色块，
 * 留下红绿混合的棕色伪主色。直方图先按真实颜色计数，再把最接近的桶合并，
 * 3 色图就会稳定返回 3 个颜色，照片也能收敛到指定数量。
 */
export function quantizeColors(pixels, count = PALETTE_SIZE) {
  const data = pixels && (ArrayBuffer.isView(pixels) || Array.isArray(pixels)) ? pixels : pixels?.data
  if (!data || typeof data.length !== 'number' || data.length < 4) return []
  const limit = clamp(Math.floor(Number(count)) || PALETTE_SIZE, 1, MAX_PALETTE_SIZE)
  const totalPixels = Math.floor(data.length / 4)
  const step = Math.max(1, Math.ceil(totalPixels / MAX_SAMPLE_PIXELS))
  const buckets = new Map()
  let sampled = 0
  for (let index = 0; index < totalPixels; index += step) {
    const offset = index * 4
    if (data[offset + 3] < 125) continue
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
    sampled += 1
  }
  if (!sampled) return []

  const seeds = [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b)
    .slice(0, Math.max(limit * 12, 48))
    .map((bucket) => ({
      hex: rgbToHex({ r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }),
      count: bucket.count,
    }))

  // 只保留最终 limit 个色：每次合并色差最小的一对（按像素数加权）。
  let entries = seeds
  while (entries.length > limit) {
    let bestA = 0
    let bestB = 1
    let bestDistance = Infinity
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const distance = deltaE(entries[i].hex, entries[j].hex)
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance
          bestA = i
          bestB = j
        }
      }
    }
    const a = entries[bestA]
    const b = entries[bestB]
    const rgbA = hexToRgb(a.hex)
    const rgbB = hexToRgb(b.hex)
    const weight = a.count + b.count
    const merged = {
      hex: rgbToHex({
        r: (rgbA.r * a.count + rgbB.r * b.count) / weight,
        g: (rgbA.g * a.count + rgbB.g * b.count) / weight,
        b: (rgbA.b * a.count + rgbB.b * b.count) / weight,
      }),
      count: weight,
    }
    entries = entries.filter((_, index) => index !== bestA && index !== bestB)
    entries.push(merged)
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0)
  return entries
    .map((entry) => ({ hex: entry.hex, share: entry.count / total }))
    .sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex))
}

/** 当前造型 → 按面积估算的主色列表；个人单品也能通过 byId 的衣橱叠加层解析。 */
export function outfitPalette(outfit) {
  const source = outfit && typeof outfit === 'object' ? outfit : {}
  const rows = []
  const push = (slot, id, weight) => {
    if (typeof id !== 'string' || !id) return
    if (slot === 'outer' && id === 'o-none') return
    const item = byId(ITEMS, id)
    const hex = normalizeHex(item?.hex)
    if (!item || !hex) return
    rows.push({ hex, weight, slot, label: item.name || item.id })
  }
  push('top', source.top, SLOT_WEIGHTS.top)
  push('outer', source.outer, SLOT_WEIGHTS.outer)
  push('bottom', source.bottom, SLOT_WEIGHTS.bottom)
  push('shoes', source.shoes, SLOT_WEIGHTS.shoes)
  const accs = Array.isArray(source.accs) ? source.accs.filter((id) => typeof id === 'string') : []
  if (accs.length) {
    const each = SLOT_WEIGHTS.accs / accs.length
    for (const id of accs) push('accs', id, each)
  }
  if (!rows.length) return []

  const grouped = new Map()
  for (const row of rows) {
    const existing = grouped.get(row.hex)
    if (existing) {
      existing.weight += row.weight
      if (!existing.labels.includes(row.label)) existing.labels.push(row.label)
      if (!existing.slots.includes(row.slot)) existing.slots.push(row.slot)
    } else {
      grouped.set(row.hex, {
        hex: row.hex,
        weight: row.weight,
        labels: [row.label],
        slots: [row.slot],
      })
    }
  }
  const total = [...grouped.values()].reduce((sum, row) => sum + row.weight, 0)
  return [...grouped.values()]
    .map((row) => ({
      hex: row.hex,
      share: row.weight / total,
      labels: row.labels,
      slot: row.slots[0],
      slots: row.slots,
    }))
    .sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex))
}

/** 配色诊断：主色、色族、和谐关系、明暗对比、三色原则与呼应关系。 */
export function analyzePalette(input) {
  const colors = normalizePalette(input)
  if (!colors.length) {
    return {
      ok: false,
      reason: '没有可分析的颜色',
      colors: [],
      dominant: null,
      keywords: [],
      harmony: { key: 'empty', label: '暂无配色', note: '加入单品或上传照片后，这里会给出配色诊断。' },
      families: 0,
      threeColorOk: true,
      neutralShare: 0,
      chromaShare: 0,
      contrast: { ratio: null, label: '未知', note: '' },
      echo: false,
      laws: [],
      summary: '暂无配色',
      advice: '加入单品或上传照片后，这里会给出配色诊断。',
    }
  }

  const rows = colors.map((color) => {
    const lab = hexToLab(color.hex)
    return {
      ...color,
      hsl: rgbToHsl(hexToRgb(color.hex)),
      lab,
      chroma: Math.hypot(lab.a, lab.b),
    }
  })
  const sorted = rows.slice().sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex))
  const dominant = sorted[0]
  const neutrals = rows.filter((row) => row.chroma < NEUTRAL_CHROMA)
  const chroma = rows.filter((row) => row.chroma >= NEUTRAL_CHROMA)
  const clusters = clusterHues(chroma.map((row) => ({ h: row.hsl.h, share: row.share })))
  const neutralShare = neutrals.reduce((sum, row) => sum + row.share, 0)
  const chromaShare = clamp(1 - neutralShare, 0, 1)
  const families = clusters.length + (neutrals.length ? 1 : 0)

  let harmony
  if (!clusters.length) {
    harmony = {
      key: 'neutral',
      label: '中性色',
      note: '全部落在黑白灰与米色区间，安全、干净；想更有记忆点，可以留一件低饱和彩色做焦点。',
    }
  } else if (clusters.length === 1) {
    harmony = neutralShare >= 0.5
      ? {
        key: 'accent',
        label: '中性打底',
        note: '大面积中性色压住画面，只留一个彩色做焦点；干净、有重点，是最稳妥的高分配色。',
      }
      : {
        key: 'monochrome',
        label: '同色系',
        note: '颜色集中在同一个色相里，最显高级也最不容易出错；用材质或明度差拉开层次。',
      }
  } else if (clusters.length === 2) {
    const gap = hueGap(clusters[0].hue, clusters[1].hue)
    if (gap <= 45) {
      harmony = { key: 'analogous', label: '邻近色', note: '两个色相相邻，过渡自然；再用一个中性色打底会更稳。' }
    } else if (gap >= 130) {
      harmony = { key: 'complementary', label: '对比色', note: '色相相对，张力强；让主色占大面积、对比色只做点缀，就不会打架。' }
    } else {
      harmony = { key: 'split', label: '分离色', note: '色相落在相邻与对比之间，属于微妙的组合；保留一个主色，其余降低饱和度。' }
    }
  } else if (clusters.length === 3) {
    harmony = { key: 'triad', label: '三色组合', note: '三个色相互相拉开，是进阶玩法；用中性色平衡面积，别让三种颜色平均分。' }
  } else {
    harmony = { key: 'varied', label: '多色相', note: '颜色超过三个族，视觉重心容易散；按三色原则保留主色、辅色和一个点缀即可。' }
  }

  const contrastPairs = []
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const ratio = contrastRatio(rows[i].hex, rows[j].hex)
      if (ratio !== null) contrastPairs.push(ratio)
    }
  }
  const maxContrast = contrastPairs.length ? Math.max(...contrastPairs) : 1
  const contrastLabel = maxContrast >= 4.5 ? '强' : maxContrast >= 2 ? '中' : '弱'
  const contrastNote = contrastLabel === '强'
    ? '明暗分得开，轮廓和比例容易读。'
    : contrastLabel === '中'
      ? '明暗有层次但不算强烈，适合安静的通勤配色。'
      : '整体明暗接近，容易糊成一块；用一件深浅差明显的单品拉开层次。'

  let echo = false
  outer: for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[i].share < 0.05 || sorted[j].share < 0.05) continue
      const distance = deltaE(sorted[i].hex, sorted[j].hex)
      if (distance === null || distance > 8) continue
      const slotsA = sorted[i].slots ?? (sorted[i].slot ? [sorted[i].slot] : [])
      const slotsB = sorted[j].slots ?? (sorted[j].slot ? [sorted[j].slot] : [])
      const differentArea = !slotsA.length || !slotsB.length || slotsA.some((slot) => !slotsB.includes(slot))
      if (differentArea) {
        echo = true
        break outer
      }
    }
  }

  const threeColorOk = families <= 3
  const keywords = sorted.slice(0, 3).map((row) => colorName(row.hex))
  const familyText = threeColorOk
    ? `共 ${families} 个色族，符合三色原则`
    : `共 ${families} 个色族，超过三色原则，建议减色`
  const dominantText = `主色是${colorName(dominant.hex)}，约占 ${Math.round(dominant.share * 100)}%`
  const echoText = echo ? '；有颜色在上下装/鞋包之间呼应，整体更成套' : ''
  const advice = `${dominantText}。${familyText}；${contrastNote.replace(/。$/, '')}${echoText}。`

  return {
    ok: true,
    colors: sorted,
    dominant: { hex: dominant.hex, share: dominant.share, name: colorName(dominant.hex) },
    keywords,
    harmony,
    families,
    threeColorOk,
    neutralShare,
    chromaShare,
    contrast: {
      ratio: round(maxContrast, 1),
      label: contrastLabel,
      note: contrastNote,
    },
    echo,
    laws: ['01', ...(echo ? ['16'] : [])],
    summary: `${harmony.label} · ${families} 个色族 · 明暗对比${contrastLabel}`,
    advice,
  }
}

let itemLabCache = null
const itemLabs = () => {
  if (itemLabCache) return itemLabCache
  itemLabCache = new Map()
  for (const item of ITEMS) {
    const hex = normalizeHex(item.hex)
    if (!hex) continue
    itemLabCache.set(item.id, { hex, lab: hexToLab(hex) })
  }
  return itemLabCache
}

function categoryOf(item) {
  return CATEGORY_OF.get(item.id) || (item.category === 'accs' ? 'accs' : item.category) || 'top'
}

/** 每个主色在目录里最接近的几件单品（含色差，便于 UI 标注“接近/有点远”）。 */
export function matchPalette(palette, options = {}) {
  const colors = normalizePalette(palette)
  if (!colors.length) return []
  const limit = clamp(Math.floor(Number(options.limit)) || MATCH_LIMIT, 1, ITEMS.length)
  const cache = itemLabs()
  return colors.map((color) => {
    const lab = hexToLab(color.hex)
    const matches = []
    for (const item of ITEMS) {
      if (item.id === 'o-none') continue
      const entry = cache.get(item.id)
      if (!entry) continue
      const distance = Math.hypot(lab.l - entry.lab.l, lab.a - entry.lab.a, lab.b - entry.lab.b)
      matches.push({
        id: item.id,
        name: item.name,
        hex: entry.hex,
        category: categoryOf(item),
        categoryLabel: CATEGORY_LABELS[categoryOf(item)] || categoryOf(item),
        deltaE: round(distance, 1),
        close: distance <= CLOSE_DELTA_E,
        hex2: normalizeHex(item.hex2) || null,
      })
    }
    matches.sort((a, b) => a.deltaE - b.deltaE || a.id.localeCompare(b.id))
    return { ...color, name: colorName(color.hex), matches: matches.slice(0, limit) }
  })
}

const itemDistance = (item, palette, labs) => {
  const entry = labs.get(item.id)
  if (!entry) return { raw: 30, weighted: 30 }
  let best = { raw: Infinity, weighted: Infinity }
  for (const color of palette) {
    const raw = Math.hypot(entry.lab.l - color.lab.l, entry.lab.a - color.lab.a, entry.lab.b - color.lab.b)
    const weighted = raw + (1 - color.share) * 6
    if (weighted < best.weighted) best = { raw, weighted }
  }
  return best
}

const rankByPalette = (items, palette, labs, take) => items
  .map((item) => ({ item, ...itemDistance(item, palette, labs) }))
  .filter((row) => row.item.id !== 'o-none')
  .sort((a, b) => a.weighted - b.weighted || a.item.id.localeCompare(b.item.id))
  .slice(0, take)
  .map((row) => row.item)

const paletteCoverage = (items, palette, labs) => {
  let covered = 0
  for (const color of palette) {
    let closest = Infinity
    for (const item of items) {
      const entry = labs.get(item.id)
      if (!entry) continue
      const distance = Math.hypot(entry.lab.l - color.lab.l, entry.lab.a - color.lab.a, entry.lab.b - color.lab.b)
      if (distance < closest) closest = distance
    }
    if (closest <= CLOSE_DELTA_E) covered += color.share
  }
  return covered
}

/**
 * 用一组颜色生成可试穿的造型。
 * 评分 = 配色覆盖 55 + 色差接近度 25 + 现有四维评分 20，硬冲突直接排除。
 */
export function buildPaletteOutfits(palette, options = {}) {
  const colors = normalizePalette(palette)
  if (!colors.length) return []
  const count = clamp(Math.floor(Number(options.count)) || 3, 1, 5)
  const scoreOf = typeof options.scoreOf === 'function' ? options.scoreOf : getAdvice
  const labs = itemLabs()
  const withLab = colors.map((color) => ({ ...color, lab: hexToLab(color.hex) }))
  const tops = rankByPalette(TOPS, withLab, labs, 4)
  const bottoms = rankByPalette(BOTTOMS, withLab, labs, 4)
  const shoes = rankByPalette(SHOES, withLab, labs, 4)
  const outers = [null, ...rankByPalette(OUTERS.filter((item) => item.id !== 'o-none'), withLab, labs, 4)]
  const accCandidates = ACCS
    .map((item) => ({ item, ...itemDistance(item, withLab, labs) }))
    .sort((a, b) => a.weighted - b.weighted || a.item.id.localeCompare(b.item.id))
    .slice(0, 6)

  const candidates = []
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const outer of outers) {
          const main = [top, bottom, shoe, outer].filter(Boolean)
          if (detectConflicts({ top, outer, bottom, shoes: shoe }).length) continue
          const coverage = paletteCoverage(main, withLab, labs)
          const distances = main.map((item) => itemDistance(item, withLab, labs).raw)
          const average = distances.reduce((sum, value) => sum + value, 0) / distances.length
          const similarity = clamp(1 - average / 40, 0, 1)
          const accs = accCandidates
            .filter((row) => row.raw <= 14 && row.weighted <= 18)
            .slice(0, 2)
            .map((row) => row.item)
          const outfit = {
            top: top.id,
            outer: outer?.id ?? 'o-none',
            bottom: bottom.id,
            shoes: shoe.id,
            accs: accs.map((item) => item.id),
          }
          const advice = scoreOf(outfit)
          const adviceScore = Number(advice?.score?.total ?? 60)
          const rank = Math.round(clamp(coverage * 60 + similarity * 20 + adviceScore * 0.2, 0, 100))
          const ids = [top.id, bottom.id, shoe.id, outer?.id ?? 'o-none', ...outfit.accs].join('|')
          candidates.push({
            outfit,
            score: Number.isFinite(adviceScore) ? adviceScore : rank,
            rank,
            paletteFit: Math.round(coverage * 100),
            colorDistance: round(average, 1),
            colors: [
              { hex: normalizeHex(top.hex), label: top.name },
              { hex: normalizeHex(bottom.hex), label: bottom.name },
              { hex: normalizeHex(shoe.hex), label: shoe.name },
              ...(outer ? [{ hex: normalizeHex(outer.hex), label: outer.name }] : []),
              ...accs.map((item) => ({ hex: normalizeHex(item.hex), label: item.name })),
            ],
            names: [top.name, bottom.name, shoe.name, ...(outer ? [outer.name] : []), ...accs.map((item) => item.name)],
            warnings: Array.isArray(advice?.warnings) ? advice.warnings.slice(0, 2) : [],
            ids,
          })
        }
      }
    }
  }

  candidates.sort((a, b) => b.rank - a.rank || b.paletteFit - a.paletteFit || a.ids.localeCompare(b.ids))
  const picked = []
  // diff 是两侧 id 的对称差：换掉一件会记 2（旧 id 不在新造型 + 新 id 不在旧造型），
  // 因此 4 才代表"真的换了两件"，避免三套方案只换了一件上装。
  const MIN_DIFF = 4
  for (const candidate of candidates) {
    if (picked.length >= count) break
    const diverse = picked.every((previous) => {
      const before = new Set(previous.ids.split('|'))
      const after = new Set(candidate.ids.split('|'))
      let diff = 0
      for (const id of before) if (!after.has(id)) diff += 1
      for (const id of after) if (!before.has(id)) diff += 1
      return diff >= MIN_DIFF
    })
    if (diverse) picked.push(candidate)
  }
  for (const candidate of candidates) {
    if (picked.length >= count) break
    if (!picked.includes(candidate)) picked.push(candidate)
  }
  const dominant = colors.slice().sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex))[0]
  return picked.map((candidate, index) => ({
    ...candidate,
    name: `同色方案 ${index + 1}`,
    dominant: dominant?.hex ?? null,
    dominantName: dominant ? colorName(dominant.hex) : '',
  }))
}

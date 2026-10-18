// 今日条件 v1（PHASE2-CONTRACT §2）：离线手动天气 + 天气适配评分 + 今日三套推荐。
//
// 本文件是纯 ESM，刻意不引用 React、DOM 与网络：
//   - 存储读写只经由调用方注入的 storage 对象（缺省用 wardrobe.js 的 defaultStorage 探测）。
//   - 联网只发生在 src/hooks/useDaily.js；这里只提供「URL 构造」与「响应解析」两个纯函数，
//     于是断网、畸形响应、天气码未知这些分支都能在 Node 里被真实单测覆盖，而不是靠浏览器手测。
//   - 任何损坏输入都返回合法状态 + 中文 warnings，绝不抛异常。

import { findItem } from './catalog.js'
import { rankWithPersonalWardrobe } from './personalRecommendations.js'
import { recommendOutfits } from './recommendations.js'
import { defaultStorage } from './wardrobe.js'

export const DAILY_KEY = 'stylelab:daily:v1'
export const DAILY_VERSION = 1

export const DAILY_CONDITIONS = ['clear', 'cloudy', 'rain', 'snow']
export const DAILY_WINDS = ['light', 'strong']
export const DAILY_INDOORS = ['none', 'normal', 'strong']
export const DAILY_COMMUTES = ['walk', 'transit', 'car']
export const DAILY_OCCASIONS = ['casual', 'campus', 'work', 'date', 'sport', 'formal']

export const TEMP_MIN = -30
export const TEMP_MAX = 45
export const DEFAULT_TEMP = 20

export const CONDITION_LABELS = { clear: '晴', cloudy: '多云', rain: '雨', snow: '雪' }
export const WIND_LABELS = { light: '微风', strong: '大风' }
export const INDOOR_LABELS = { none: '没有空调暖气', normal: '常规室内', strong: '暖气 / 强冷气' }
export const COMMUTE_LABELS = { walk: '步行', transit: '公交地铁', car: '开车' }
export const OCCASION_LABELS = { casual: '日常', campus: '校园', work: '通勤', date: '约会', sport: '运动', formal: '正式' }
export const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }

// 今日的「场合」只有四个能对上系统推荐的画像，其余按最接近的映射，避免为了新场景另造一套推荐数据。
const OCCASION_TO_PROFILE = { casual: 'casual', campus: 'campus', work: 'work', date: 'date', sport: 'casual', formal: 'work' }

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

function oneOf(value, list, fallback) {
  return list.includes(value) ? value : fallback
}

/** 数字或数字字符串 → 有限数；其余（含 ''、null、[]、NaN、Infinity）返回 null。 */
function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// ------------------------------------------------------------------ 默认值与归一化

/** 契约 §2 的字段全集；时间戳留给调用方（纯函数不依赖 now）。 */
export function createDaily() {
  return {
    version: DAILY_VERSION,
    city: '',
    temp: DEFAULT_TEMP,
    condition: 'clear',
    wind: 'light',
    indoor: 'normal',
    commute: 'walk',
    occasion: 'casual',
    updatedAt: '',
  }
}

/**
 * 把任意输入归一成合法的今日条件。逐字段修复并记录 warnings，绝不抛异常。
 * @returns {{state:object, warnings:string[], ok:boolean}}
 */
export function normalizeDaily(raw) {
  const warnings = []
  if (raw === undefined || raw === null) return { state: createDaily(), warnings, ok: true }

  if (!isPlainObject(raw)) {
    warnings.push('今日条件不是对象，已按默认值处理')
    return { state: createDaily(), warnings, ok: false }
  }

  const state = createDaily()

  if (typeof raw.city === 'string') state.city = raw.city.trim().slice(0, 40)
  else if (raw.city !== undefined && raw.city !== null) warnings.push(`城市字段不是文本，已忽略（收到 ${typeof raw.city}）`)

  const temp = finiteNumber(raw.temp)
  if (temp === null) {
    if (raw.temp !== undefined && raw.temp !== null) warnings.push(`气温 "${String(raw.temp)}" 不是数字，已按 ${DEFAULT_TEMP}℃ 处理`)
  } else {
    const rounded = Math.round(temp)
    const bounded = clamp(rounded, TEMP_MIN, TEMP_MAX)
    if (bounded !== rounded) warnings.push(`气温 ${rounded}℃ 超出 ${TEMP_MIN}~${TEMP_MAX}℃ 合理范围，已夹到 ${bounded}℃`)
    state.temp = bounded
  }

  for (const [key, list] of [
    ['condition', DAILY_CONDITIONS],
    ['wind', DAILY_WINDS],
    ['indoor', DAILY_INDOORS],
    ['commute', DAILY_COMMUTES],
    ['occasion', DAILY_OCCASIONS],
  ]) {
    const value = raw[key]
    if (value === undefined || value === null) continue
    if (list.includes(value)) state[key] = value
    else warnings.push(`${key} 取值 "${String(value)}" 不在 ${list.join('/')} 内，已用默认值 ${state[key]}`)
  }

  // updatedAt 的默认值就是空串，所以「空串 / 全空白」必须当作未填写，
  // 否则每写一次默认条件再读回来都会凭空多一条告警。
  if (typeof raw.updatedAt === 'string') state.updatedAt = raw.updatedAt.trim()
  else if (raw.updatedAt !== undefined && raw.updatedAt !== null) {
    warnings.push(`updatedAt 不是文本，已忽略（收到 ${typeof raw.updatedAt}）`)
  }

  return { state, warnings, ok: true }
}

/** 打上时间戳（写入前调用，集中在 hook 里，保持纯函数不依赖当前时间）。 */
export function touchDaily(state, now = new Date()) {
  const { state: clean } = normalizeDaily(state)
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : ''
  return { ...clean, updatedAt: at }
}

// ------------------------------------------------------------------ 存储读写

export function encodeDaily(state) {
  const { state: clean } = normalizeDaily(state)
  return JSON.stringify({ ...clean, version: DAILY_VERSION })
}

/** @returns {{state:object, warnings:string[], ok:boolean}} */
export function decodeDaily(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { state: createDaily(), warnings: [], ok: true }
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      console.warn('[daily] 今日条件数据损坏，已按默认值处理：', error)
      return { state: createDaily(), warnings: ['今日条件不是合法 JSON，已按默认值处理'], ok: false }
    }
  }
  return normalizeDaily(parsed)
}

/** @returns {{state:object, warnings:string[], missing:boolean, error:Error|null}} */
export function readDaily(storage) {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return { state: createDaily(), warnings: [], missing: true, error: null }
  let raw
  try {
    raw = store.getItem(DAILY_KEY)
  } catch (error) {
    console.warn('[daily] 读取今日条件失败，已按默认值处理：', error)
    return { state: createDaily(), warnings: ['读取今日条件失败，已按默认值处理'], missing: false, error }
  }
  if (raw === null || raw === undefined) return { state: createDaily(), warnings: [], missing: true, error: null }
  return { ...decodeDaily(raw), missing: false, error: null }
}

/** @returns {{ok:boolean, error:Error|null}} */
export function writeDaily(storage, state) {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return { ok: false, error: null }
  try {
    store.setItem(DAILY_KEY, encodeDaily(state))
    return { ok: true, error: null }
  } catch (error) {
    console.warn('[daily] 保存今日条件失败，本次仅在内存中保留：', error)
    return { ok: false, error }
  }
}

// ------------------------------------------------------------------ 温度 → 季节 / 保暖目标

export function seasonFromTemp(temp) {
  const value = finiteNumber(temp)
  const t = value === null ? DEFAULT_TEMP : value
  if (t >= 24) return 'summer'
  if (t >= 15) return 'spring'
  if (t >= 5) return 'autumn'
  return 'winter'
}

/**
 * 气温对应的「全身总保暖度」目标区间（上装 + 外套 + 下装 + 鞋的 warmth 之和）。
 * 区间偏宽，是因为同一温度下厚薄不同的合理组合本来就多；真正被罚的是明显不匹配的组合。
 */
export function warmthTarget(temp) {
  const value = finiteNumber(temp)
  const t = value === null ? DEFAULT_TEMP : value
  if (t >= 28) return [3, 6]
  if (t >= 24) return [4, 8]
  if (t >= 18) return [5, 9]
  if (t >= 10) return [7, 11]
  if (t >= 4) return [9, 13]
  return [11, 16]
}

// ------------------------------------------------------------------ 天气适配评分

export const WEATHER_PARTS = [
  { key: 'warmth', label: '保暖匹配', max: 45 },
  { key: 'rain', label: '降水应对', max: 20 },
  { key: 'wind', label: '防风', max: 15 },
  { key: 'indoor', label: '室内过渡', max: 10 },
  { key: 'commute', label: '通勤方式', max: 10 },
]

const WATERPROOF_MESHES = ['boot', 'chelsea', 'derby', 'loafer']
const ABSORBENT_MESHES = ['canvas']

const warmthOf = (item) => (item && Number.isFinite(item.warmth) ? item.warmth : 0)
const meshOf = (item) => (item && typeof item.mesh === 'string' ? item.mesh : '')
const nameOf = (item, fallback) => (item && typeof item.name === 'string' ? item.name : fallback)

function defaultResolve(id) {
  return typeof id === 'string' ? findItem(id) || null : null
}

/** 把衣橱里的个人单品也纳入查表，否则 u- 单品在评分里会被当成缺件。 */
function buildResolver(wardrobeState) {
  const personal = new Map()
  const items = wardrobeState && Array.isArray(wardrobeState.items) ? wardrobeState.items : []
  for (const item of items) {
    if (item && typeof item.id === 'string') personal.set(item.id, item)
  }
  if (personal.size === 0) return defaultResolve
  return (id) => {
    if (typeof id !== 'string') return null
    return findItem(id) || personal.get(id) || null
  }
}

function partWarmth(daily, total, pieces) {
  const [lo, hi] = warmthTarget(daily.temp)
  const detail = `上装 ${pieces.top} / 外套 ${pieces.outer} / 下装 ${pieces.bottom} / 鞋 ${pieces.shoes}`
  const mid = (lo + hi) / 2
  if (total >= lo && total <= hi) {
    // 落在目标区间内也要分档：贴区间边界只算合格，越靠近区间中心越舒服。
    // 原实现「区间内一律 45 分」让 70.8% 的组合直接拿满分，
    // 而这个分值被用来给「今日三套」排序——全都满分等于没有排序。
    const span = Math.max(1, hi - lo)
    const distance = Math.abs(total - mid) / (span / 2) // 0 = 正中，1 = 贴边
    const value = Math.round(45 - distance * 7) // 区间内 38..45
    const closeness = distance <= 0.34 ? '正好' : '尚可'
    return {
      value,
      note: `气温 ${daily.temp}℃ 时目标总保暖 ${lo}–${hi}，本套 ${total}（${detail}），体感${closeness}`,
      warning: '',
    }
  }
  const gap = total < lo ? lo - total : total - hi
  // 区间外从 38 起扣（而不是 45），与区间内的下界衔接，避免「差一档」比「区间接边」还高分。
  const value = Math.max(0, 38 - gap * 7)
  const direction = total < lo ? '偏薄' : '偏厚'
  const advice = total < lo ? '加一件外套或换厚一点的内搭' : '去掉一层或换薄一档的面料'
  return {
    value,
    note: `气温 ${daily.temp}℃ 时目标总保暖 ${lo}–${hi}，本套 ${total}（${detail}）${direction}`,
    warning: `气温 ${daily.temp}℃ 下这套${direction} ${gap} 档，建议${advice}`,
  }
}

function partRain(daily, outer, shoes, top) {
  const wet = daily.condition === 'rain' || daily.condition === 'snow'
  if (!wet) {
    // 不下雨时满分不该是「白送」：仍按「这套如果遇上雨有多糟」打折，
    // 让干燥天的推荐也带上一点防水倾向。原实现非降水一律 20 分，
    // 是天气分只有 5~7 个取值的主因之一（实测 70.8% 的组合拿满分）。
    const mesh = meshOf(shoes)
    const waterproof = WATERPROOF_MESHES.includes(mesh)
    const absorbent = ABSORBENT_MESHES.includes(mesh)
    if (daily.temp >= 30 && warmthOf(outer) >= 3) {
      return { value: 12, note: `天气${CONDITION_LABELS[daily.condition]}`, warning: `${daily.temp}℃ 还穿保暖度 ${warmthOf(outer)} 的${nameOf(outer, '外套')}，室外会闷热` }
    }
    let value = 20
    if (absorbent) value -= 2 // 帆布鞋遇雨最惨，晴天也降一档
    if (!outer) value -= 1 // 没有可挡雨的外套层
    const note = waterproof
      ? `天气${CONDITION_LABELS[daily.condition]}，鞋型本身就防水，遇上阵雨也不慌`
      : `天气${CONDITION_LABELS[daily.condition]}，无需额外防雨装备`
    return { value, note, warning: '' }
  }

  const mesh = meshOf(shoes)
  const shoeName = nameOf(shoes, '当前鞋')
  const hasOuter = !!outer
  // 挡雨层按「有没有外套」只给 0/10 太粗：外套的保暖度也决定它能不能真的挡雨
  // （薄衬衫挡不住，厚毛呢吸水反而更糟）。
  let value = 0
  let outerNote = ''
  if (hasOuter) {
    const w = warmthOf(outer)
    if (w >= 3) { value += 10; outerNote = `${nameOf(outer, '外套')}足够厚实，能挡住雨` }
    else if (w >= 2) { value += 7; outerNote = `${nameOf(outer, '外套')}能挡一阵小雨` }
    else { value += 3; outerNote = `${nameOf(outer, '外套')}太薄，挡雨能力有限` }
  }
  let shoeNote
  if (daily.condition === 'snow') {
    if (WATERPROOF_MESHES.includes(mesh)) { value += 10; shoeNote = `${shoeName} 是防水鞋型，雪地不渗水` }
    else if (ABSORBENT_MESHES.includes(mesh)) { value -= 6; shoeNote = `${shoeName} 在雪地会湿透且难干` }
    else { value += 4; shoeNote = `${shoeName} 不是防水鞋型，雪天会偏滑` }
  } else if (WATERPROOF_MESHES.includes(mesh)) {
    value += 10
    shoeNote = `${shoeName} 是防水鞋型，雨天不渗水`
  } else if (ABSORBENT_MESHES.includes(mesh)) {
    value -= 8
    shoeNote = `${shoeName} 遇水会湿透且不易干`
  } else {
    value += 5
    shoeNote = `${shoeName} 湿了会有点难受，但不算雷区`
  }
  // 内搭厚度也会影响淋湿后的恢复难度：没有外层保护时，厚内搭湿了整天难受。
  if (!hasOuter && warmthOf(top) >= 3) value -= 2
  const upperNote = hasOuter ? outerNote || `有${nameOf(outer, '外套')}可挡雨` : '只有单层上装，没有挡雨层'
  const warnings = []
  if (!hasOuter) warnings.push(`${CONDITION_LABELS[daily.condition]}天没有外套挡雨，建议加一件风衣或冲锋衣`)
  if (ABSORBENT_MESHES.includes(mesh)) warnings.push(`${CONDITION_LABELS[daily.condition]}天穿 ${shoeName} 会湿脚`)
  if (!hasOuter && warmthOf(top) >= 3) warnings.push(`厚内搭被雨淋湿后很难干，建议换成可快速干燥的薄层`)
  return {
    value: clamp(Math.round(value), 0, 20),
    note: `${CONDITION_LABELS[daily.condition]}天：${upperNote}；${shoeNote}`,
    warning: warnings.join('；'),
  }
}

function partWind(daily, outer) {
  const w = warmthOf(outer)
  const hasOuter = !!outer
  if (daily.wind !== 'strong') {
    // 微风天也保留一点梯度：完全没外套时体感仍会差半档。
    return { value: hasOuter ? 15 : 13, note: `${WIND_LABELS.light}，不用为风做额外准备`, warning: '' }
  }
  if (!hasOuter) return { value: 4, note: '大风天只有单层上装', warning: '大风天没有外套，风会直接穿透单层上装，体感明显变冷' }
  // 有外套也分档：越厚越挡风，薄衬衫当外层只能算聊胜于无。
  if (w >= 4) return { value: 15, note: `大风天：${nameOf(outer, '外套')}保暖度 ${w}，防风很稳`, warning: '' }
  if (w >= 3) return { value: 13, note: `大风天：${nameOf(outer, '外套')}保暖度 ${w}，基本挡得住`, warning: '' }
  if (w >= 2) return { value: 10, note: `大风天：${nameOf(outer, '外套')}保暖度 ${w}，挡风一般`, warning: '' }
  return { value: 7, note: `大风天：${nameOf(outer, '外套')}太薄，风会透进去`, warning: `大风天外层只有保暖度 ${w} 的${nameOf(outer, '外套')}，建议换一件更挡风的` }
}

function partIndoor(daily, outer, top) {
  const outerWarmth = warmthOf(outer)
  if (daily.indoor === 'strong') {
    // 室内温差大时，外套保暖度越高越难穿脱自如，按档连续扣分（原实现只有 3 / 10 两档）。
    if (outer && outerWarmth >= 3) {
      const value = clamp(10 - (outerWarmth - 2) * 3, 0, 10) // w3→7, w4→4, w5→1
      return { value, note: `室内${INDOOR_LABELS.strong}，本套外套保暖度 ${outerWarmth}`, warning: `${INDOOR_LABELS.strong}时穿保暖度 ${outerWarmth} 的${nameOf(outer, '厚外套')}，进屋会明显闷热，建议换成可脱卸的中间层` }
    }
    if (outer && outerWarmth === 2) {
      return { value: 9, note: `室内${INDOOR_LABELS.strong}，${nameOf(outer, '外套')}厚薄适中，进出都还好`, warning: '' }
    }
    return { value: 10, note: `室内${INDOOR_LABELS.strong}，外套能随手脱掉或本就轻薄，进出都合适`, warning: '' }
  }
  if (daily.indoor === 'none') {
    if (daily.temp <= 10 && !outer) {
      return { value: 6, note: `没有空调暖气且气温 ${daily.temp}℃，仅靠${nameOf(top, '上装')}保温`, warning: '室内也没有取暖时，缺一件外套会让整天都偏冷' }
    }
    // 无暖气但有外套：外套越薄越不够，按保暖度给梯度。
    if (daily.temp <= 10 && outer) {
      const value = clamp(6 + outerWarmth, 0, 10) // w1→7, w2→8, w3→9, w4→10
      const warning = outerWarmth <= 1 ? '室内无取暖时外套偏薄，久坐会冷' : ''
      return { value, note: `没有空调暖气，气温 ${daily.temp}℃，靠保暖度 ${outerWarmth} 的${nameOf(outer, '外套')}过渡`, warning }
    }
  }
  return { value: 10, note: `室内${INDOOR_LABELS[daily.indoor]}，不需要为温差额外调整`, warning: '' }
}

function partCommute(daily, outer) {
  const w = warmthOf(outer)
  if (daily.commute === 'transit' && outer && w >= 4) {
    return { value: 6, note: `公交地铁通勤，本套外套保暖度 ${w}`, warning: `公交地铁里人多且闷，穿保暖度 ${w} 的${nameOf(outer, '厚外套')}会热，建议选可脱卸的中间层` }
  }
  // 地铁 + 保暖度 3 的外套也略热，给 8 分形成梯度。
  if (daily.commute === 'transit' && outer && w === 3) {
    return { value: 8, note: `公交地铁通勤，本套外套保暖度 ${w}，略热但可控`, warning: '' }
  }
  if (daily.commute === 'walk' && (daily.condition === 'rain' || daily.condition === 'snow') && !outer) {
    return { value: 5, note: '步行通勤又遇上降水，却没有外套', warning: '步行通勤遇上降水又没有外套，路上会很难受' }
  }
  if (daily.commute === 'car' && daily.temp <= 4 && !outer) {
    return { value: 5, note: '开车通勤，但室外段没有外套', warning: '开车虽然从室内到室内，但上车前那段路在 4℃ 以下没有外套会冷' }
  }
  return { value: 10, note: `${COMMUTE_LABELS[daily.commute]}通勤，这套的穿脱负担可以接受`, warning: '' }
}

/**
 * 天气适配评分。纯函数：同一输入必然得到同一输出。
 * @returns {{value:number, parts:Array, reasons:string[], warnings:string[]}}
 */
export function weatherFit(input, conditions, resolve = defaultResolve) {
  const outfit = isPlainObject(input) ? input : {}
  const { state: daily } = normalizeDaily(conditions)
  const look = typeof resolve === 'function' ? resolve : defaultResolve

  const top = look(outfit.top)
  const bottom = look(outfit.bottom)
  const shoes = look(outfit.shoes)
  const outer = outfit.outer && outfit.outer !== 'o-none' ? look(outfit.outer) : null

  const pieces = { top: warmthOf(top), outer: warmthOf(outer), bottom: warmthOf(bottom), shoes: warmthOf(shoes) }
  const total = pieces.top + pieces.outer + pieces.bottom + pieces.shoes

  const results = [
    { ...WEATHER_PARTS[0], ...partWarmth(daily, total, pieces) },
    { ...WEATHER_PARTS[1], ...partRain(daily, outer, shoes, top) },
    { ...WEATHER_PARTS[2], ...partWind(daily, outer) },
    { ...WEATHER_PARTS[3], ...partIndoor(daily, outer, top) },
    { ...WEATHER_PARTS[4], ...partCommute(daily, outer) },
  ].map((part) => ({ ...part, value: clamp(part.value, 0, part.max) }))

  const reasons = results.map((part) => `${part.label}：${part.note}`)
  const warnings = results.map((part) => part.warning).filter(Boolean)
  const value = clamp(results.reduce((sum, part) => sum + part.value, 0), 0, 100)

  return { value, parts: results, reasons, warnings, totalWarmth: total }
}

// ------------------------------------------------------------------ 今日推荐

export const outfitKey = (outfit) => {
  const source = isPlainObject(outfit) ? outfit : {}
  const accs = Array.isArray(source.accs) ? [...source.accs].filter((id) => typeof id === 'string').sort() : []
  return [source.top, source.outer, source.bottom, source.shoes, accs.join('+')].map((part) => part || '').join('|')
}

const wardrobeStateOf = (wardrobe) => {
  if (!wardrobe) return null
  return isPlainObject(wardrobe.state) ? wardrobe.state : wardrobe
}

export function profileForDaily(conditions, extra = {}) {
  const { state: daily } = normalizeDaily(conditions)
  const source = isPlainObject(extra) ? extra : {}
  const season = ['spring', 'summer', 'autumn', 'winter'].includes(source.season)
    ? source.season
    : seasonFromTemp(daily.temp)
  const body = ['slim', 'standard', 'athletic', 'plump'].includes(source.body) ? source.body : 'standard'
  const height = clamp(Math.round(finiteNumber(source.height) ?? 175), 150, 210)
  return { height, body, season, occasion: OCCASION_TO_PROFILE[daily.occasion] || 'casual' }
}

/**
 * 今日三套推荐：复用系统推荐 + 个人衣橱排序，再叠加天气适配分。
 * @param {{daily?:object, wardrobe?:object, preferences?:object, height?:number, body?:string, season?:string, limit?:number}} [input]
 * @returns {{conditions:object, profile:object, outfits:Array, notices:string[], warnings:string[]}}
 */
export function planToday(input = {}) {
  const source = isPlainObject(input) ? input : {}
  const { state: conditions, warnings: dataWarnings } = normalizeDaily(source.daily)
  const profile = profileForDaily(conditions, source)
  const limit = clamp(Math.round(finiteNumber(source.limit) ?? 3), 1, 6)

  const wardrobeState = wardrobeStateOf(source.wardrobe)
  const resolve = buildResolver(wardrobeState)
  // 推荐结果把造型槽位放在 .outfit 里，排名字段（personalScore / ownedRatio）在顶层。
  // 必须先摊平再排名，否则天气评分读到的全是 undefined 槽位——totalWarmth 会恒为 0，
  // 于是「冷天穿厚衣」这条最基本的判断就整个失效了。
  const candidates = recommendOutfits(profile).map((entry) => (
    entry && entry.outfit ? { ...entry, ...entry.outfit } : entry
  ))
  const personalized = rankWithPersonalWardrobe(candidates, wardrobeState, source.preferences)

  const seen = new Set()
  const outfits = []
  const duplicates = []
  for (const item of personalized) {
    const key = outfitKey(item)
    if (seen.has(key)) { duplicates.push(item.id); continue }
    seen.add(key)
    const fit = weatherFit(item, conditions, resolve)
    outfits.push({
      ...item,
      weatherScore: fit.value,
      weatherParts: fit.parts,
      totalWarmth: fit.totalWarmth,
      weatherReasons: fit.reasons,
      weatherWarnings: fit.warnings,
      reasons: [...fit.reasons, ...(Array.isArray(item.reasons) ? item.reasons : [])],
      warnings: [...fit.warnings, ...(Array.isArray(item.warnings) ? item.warnings : [])],
      dayScore: clamp(Math.round(fit.value * 0.55 + (Number.isFinite(item.personalScore) ? item.personalScore : 60) * 0.45), 0, 100),
    })
  }

  outfits.sort(
    (a, b) => b.dayScore - a.dayScore || b.weatherScore - a.weatherScore || String(a.id).localeCompare(String(b.id)),
  )

  const notices = []
  if (duplicates.length > 0) notices.push(`已跳过 ${duplicates.length} 套与前面重复的造型（${duplicates.join('、')}）`)
  if (outfits.length < limit) notices.push(`只找到 ${outfits.length} 套不重复的造型，少于期望的 ${limit} 套`)

  return { conditions, profile, outfits: outfits.slice(0, limit), notices, warnings: dataWarnings }
}

// ------------------------------------------------------------------ Open-Meteo（只有 URL 与解析，没有网络调用）

export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const FORECAST_WIND_STRONG_KMH = 30

export function buildGeocodingUrl(cityName) {
  const name = typeof cityName === 'string' ? cityName.trim() : ''
  if (!name) return ''
  const params = new URLSearchParams({ name, count: '1', language: 'zh', format: 'json' })
  return `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`
}

export function buildForecastUrl(latitude, longitude) {
  const lat = finiteNumber(latitude)
  const lon = finiteNumber(longitude)
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return ''
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    timezone: 'auto',
  })
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`
}

/** WMO 天气码 → 契约的四种 condition。 */
export function conditionFromWeatherCode(code) {
  const value = finiteNumber(code)
  if (value === null) return 'cloudy'
  const c = Math.round(value)
  // WMO 码只到 99；超出范围的是脏数据，不能让它落进 c >= 95 的雷雨分支。
  if (c < 0 || c > 99) return 'cloudy'
  if (c === 0 || c === 1) return 'clear'
  if (c === 2 || c === 3 || c === 45 || c === 48) return 'cloudy'
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow'
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain'
  return 'cloudy'
}

/** @returns {{ok:boolean, city:string, latitude:number|null, longitude:number|null, region:string, error:string}} */
export function parseGeocodingResponse(json) {
  const fail = (error) => ({ ok: false, city: '', latitude: null, longitude: null, region: '', error })
  if (!isPlainObject(json)) return fail('城市查询返回的不是对象')
  const results = Array.isArray(json.results) ? json.results : []
  const first = results.find((item) => isPlainObject(item))
  if (!first) return fail('没有找到这个城市，请换个写法或直接手填')
  const latitude = finiteNumber(first.latitude)
  const longitude = finiteNumber(first.longitude)
  if (latitude === null || longitude === null) return fail('城市查询缺少经纬度')
  const region = [first.admin1, first.country].filter((part) => typeof part === 'string' && part).join(' · ')
  return { ok: true, city: typeof first.name === 'string' ? first.name : '', latitude, longitude, region, error: '' }
}

/** @returns {{ok:boolean, temp:number|null, condition:string, wind:string, observedAt:string, error:string}} */
export function parseForecastResponse(json) {
  const fail = (error) => ({ ok: false, temp: null, condition: 'cloudy', wind: 'light', observedAt: '', error })
  if (!isPlainObject(json)) return fail('天气查询返回的不是对象')
  const current = isPlainObject(json.current) ? json.current : isPlainObject(json.current_weather) ? json.current_weather : null
  if (!current) return fail('天气查询缺少 current 字段')

  const temp = finiteNumber(current.temperature_2m ?? current.temperature)
  if (temp === null) return fail('天气查询缺少气温')

  let windSpeed = finiteNumber(current.wind_speed_10m ?? current.windspeed)
  const windUnit = isPlainObject(json.current_units) ? json.current_units.wind_speed_10m : ''
  if (windSpeed !== null && typeof windUnit === 'string' && windUnit.includes('m/s')) windSpeed *= 3.6

  return {
    ok: true,
    temp,
    condition: conditionFromWeatherCode(current.weather_code ?? current.weathercode),
    wind: windSpeed !== null && windSpeed >= FORECAST_WIND_STRONG_KMH ? 'strong' : 'light',
    observedAt: typeof current.time === 'string' ? current.time : '',
    error: '',
  }
}

/** 把一次成功的查询结果并进今日条件（保留用户手填的室内/通勤/场合，只覆盖天气本身）。 */
export function mergeWeatherIntoDaily(daily, weather, city) {
  const { state } = normalizeDaily(daily)
  if (!isPlainObject(weather) || weather.ok !== true) return state
  return {
    ...state,
    city: typeof city === 'string' && city.trim() ? city.trim().slice(0, 40) : state.city,
    temp: clamp(Math.round(weather.temp), TEMP_MIN, TEMP_MAX),
    condition: oneOf(weather.condition, DAILY_CONDITIONS, state.condition),
    wind: oneOf(weather.wind, DAILY_WINDS, state.wind),
  }
}

export function describeDaily(daily) {
  const { state } = normalizeDaily(daily)
  const city = state.city || '未填写城市'
  return `${city} · ${state.temp}℃ · ${CONDITION_LABELS[state.condition]} · ${WIND_LABELS[state.wind]}`
}

// 备份包 v1：导出 / 校验 / 合并导入 / 覆盖导入。契约见 docs/PHASE1-CONTRACT.md 第 6 节。
//
// 本文件是纯 ESM，不引用 document / window / React，可被 Node 直接 import 做单元测试。
// 所有 storage / imageStore 都通过参数注入：默认取全局 localStorage，
// 注入假对象即可在 Node 里测「损坏包拒绝 / 高版本拒绝 / 合并冲突策略 / 事务回滚」。

export const BACKUP_SCHEMA = 'style-lab-backup'
// v2 起包含每日条件（daily）与穿搭日历（calendar）。v1 包仍可导入：缺的字段按空状态处理。
export const BACKUP_VERSION = 2

// 与既有模块共用同一批 key：ShareBar 的 LOOKS_KEY、ThemeToggle 的 THEME_STORAGE_KEY。
// 这里写死字面量而不是 import 组件，避免 backup.js 依赖 React 组件（会拖进 JSX）。
// daily/calendar 同理写死：它们由 src/data/daily.js 与 src/data/calendar.js 定义，
// 但备份层只做「结构化搬运」，不关心那边的内部实现，所以不做跨模块 import。
export const STORAGE_KEYS = {
  wardrobe: 'stylelab:wardrobe:v1',
  preferences: 'stylelab:preferences:v1',
  looks: 'stylelab:looks',
  theme: 'stylelab:theme',
  daily: 'stylelab:daily:v1',
  calendar: 'stylelab:calendar:v1',
}

const DAILY_CONDITIONS = ['clear', 'cloudy', 'rain', 'snow']
const DAILY_WINDS = ['light', 'strong']
const DAILY_INDOORS = ['none', 'normal', 'strong']
const DAILY_COMMUTES = ['walk', 'transit', 'car']
const DAILY_OCCASIONS = ['casual', 'campus', 'work', 'date', 'sport', 'formal']
const DAILY_TEMP_MIN = -30
const DAILY_TEMP_MAX = 45
const CALENDAR_MAX_ENTRIES = 2000
const CALENDAR_SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']

// 契约 §4：单次反馈增量 ±3、累计权重夹在 [-12, 12]。
const WEIGHT_MIN = -12
const WEIGHT_MAX = 12
// 与 ShareBar 的 MAX_LOOKS 保持一致。
const MAX_LOOKS = 30
// 备份包体积提示阈值：超过就提醒「别走聊天窗口」，但不是错误（不阻断导出）。
const BACKUP_SIZE_WARN_BYTES = 24 * 1024 * 1024

const CATEGORIES = ['tops', 'outers', 'bottoms', 'shoes', 'accs']
const STATUSES = ['owned', 'wishlist', 'disliked']
const FAMILIES = ['light', 'dark', 'neutral', 'warm', 'cool']
const FITS = ['slim', 'regular', 'relaxed']
const FEEDBACK_KINDS = ['like', 'dislike', 'worn']
const FEEDBACK_REASONS = ['too-formal', 'too-casual', 'too-warm', 'too-cold', 'color', 'fit', 'other']

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0
const inEnum = (v, list) => list.includes(v)
const clampWeight = (n) => Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, n))
/** 字符串的 UTF-8 字节数（浏览器/Node 都有 Blob；都不可用时退回 UTF-16 近似上界）。 */
const byteSize = (text) => {
  try {
    if (typeof Blob === 'function') return new Blob([text]).size
  } catch (error) {
    console.warn('[backup] 计算备份体积失败，改用字符数近似：', error)
  }
  return String(text).length * 2
}
const asArray = (v) => (Array.isArray(v) ? v : [])

/** 取全局 localStorage；不可用（SSR / 隐私模式 / 被禁用）返回 null。 */
export function defaultStorage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    // Safari 隐私模式下 localStorage 存在但写入抛异常，这里试探一次。
    const probe = '__stylelab_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch (error) {
    console.warn('[backup] localStorage 不可用，降级为“无持久化”模式：', error)
    return null
  }
}

function readJSON(storage, key) {
  if (!storage) return { value: null, ok: false, missing: true }
  try {
    const raw = storage.getItem(key)
    if (raw === null || raw === undefined) return { value: null, ok: true, missing: true }
    return { value: JSON.parse(raw), ok: true, missing: false }
  } catch (error) {
    console.warn(`[backup] 读取 ${key} 失败（按缺失处理）：`, error)
    return { value: null, ok: false, missing: false }
  }
}

/**
 * 主题是**裸字符串**而非 JSON —— ThemeToggle.jsx:30 用 `setItem(key, mode)` 直接写，
 * 且读回时用 `isMode(raw)` 比对原值。这里若按 JSON 解析，`dark` 会解析失败、
 * 备份丢掉主题；若写入时 JSON.stringify，又会被 isMode 判为非法而回退 auto。
 * 因此主题必须单独用裸字符串读写。
 */
function readRawString(storage, key) {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return typeof raw === 'string' ? raw : null
  } catch (error) {
    console.warn(`[backup] 读取 ${key} 失败（按缺失处理）：`, error)
    return null
  }
}

// ---------------------------------------------------------------- 校验（纯）

/**
 * 逐条清洗个人单品。字段不合法就丢弃该件，不因一件坏数据否掉整包。
 * @returns {{item: object|null, reason: string|null}}
 */
export function sanitizePersonalItem(raw) {
  if (!isPlainObject(raw)) return { item: null, reason: '不是对象' }
  if (!isNonEmptyString(raw.id)) return { item: null, reason: '缺少 id' }
  if (!isNonEmptyString(raw.name)) return { item: null, reason: '缺少 name' }
  if (!inEnum(raw.category, CATEGORIES)) return { item: null, reason: `category 非法：${raw.category}` }
  if (!inEnum(raw.status, STATUSES)) return { item: null, reason: `status 非法：${raw.status}` }
  if (typeof raw.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.hex)) {
    return { item: null, reason: `hex 非法：${raw.hex}` }
  }
  const item = {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    status: raw.status,
    hex: raw.hex.toLowerCase(),
    family: inEnum(raw.family, FAMILIES) ? raw.family : 'neutral',
    formality: [1, 2, 3].includes(raw.formality) ? raw.formality : 2,
    warmth: [1, 2, 3].includes(raw.warmth) ? raw.warmth : 2,
    fit: inEnum(raw.fit, FITS) ? raw.fit : 'regular',
    mesh: typeof raw.mesh === 'string' ? raw.mesh : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    tags: asArray(raw.tags).filter((t) => typeof t === 'string'),
    photoId: typeof raw.photoId === 'string' ? raw.photoId : null,
    createdAt: isNonEmptyString(raw.createdAt) ? raw.createdAt : '',
    updatedAt: isNonEmptyString(raw.updatedAt) ? raw.updatedAt : '',
    wearCount: Number.isFinite(raw.wearCount) && raw.wearCount >= 0 ? Math.floor(raw.wearCount) : 0,
    lastWornAt: isNonEmptyString(raw.lastWornAt) ? raw.lastWornAt : null,
  }
  return { item, reason: null }
}

export function sanitizeWardrobe(raw) {
  if (!isPlainObject(raw)) return { value: null, warnings: ['wardrobe 不是对象，已忽略'] }
  const warnings = []
  const items = []
  for (const entry of asArray(raw.items)) {
    const { item, reason } = sanitizePersonalItem(entry)
    if (item) items.push(item)
    else warnings.push(`丢弃一件单品：${reason}`)
  }
  // 同 id 去重，保留后出现的那件（导入包内的后者视为更新）
  const byIdMap = new Map()
  for (const item of items) byIdMap.set(item.id, item)
  return { value: { version: 1, items: [...byIdMap.values()] }, warnings }
}

export function sanitizePreferences(raw) {
  if (!isPlainObject(raw)) return { value: null, warnings: ['preferences 不是对象，已忽略'] }
  const warnings = []
  const feedback = []
  for (const entry of asArray(raw.feedback)) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) {
      warnings.push('丢弃一条反馈：缺少 id')
      continue
    }
    if (!inEnum(entry.kind, FEEDBACK_KINDS)) {
      warnings.push(`丢弃一条反馈：kind 非法（${entry.kind}）`)
      continue
    }
    const outfit = isPlainObject(entry.outfit) ? entry.outfit : {}
    feedback.push({
      id: entry.id,
      at: isNonEmptyString(entry.at) ? entry.at : '',
      kind: entry.kind,
      outfit: {
        top: typeof outfit.top === 'string' ? outfit.top : '',
        outer: typeof outfit.outer === 'string' ? outfit.outer : '',
        bottom: typeof outfit.bottom === 'string' ? outfit.bottom : '',
        shoes: typeof outfit.shoes === 'string' ? outfit.shoes : '',
        accs: asArray(outfit.accs).filter((a) => typeof a === 'string'),
      },
      reasons: asArray(entry.reasons).filter((r) => inEnum(r, FEEDBACK_REASONS)),
    })
  }
  const rawWeights = isPlainObject(raw.weights) ? raw.weights : {}
  const weights = { itemIds: {}, colors: {}, formalities: {} }
  for (const bucket of Object.keys(weights)) {
    const src = isPlainObject(rawWeights[bucket]) ? rawWeights[bucket] : {}
    for (const [k, v] of Object.entries(src)) {
      if (Number.isFinite(v)) weights[bucket][k] = clampWeight(v)
    }
  }
  return { value: { version: 1, feedback, weights }, warnings }
}

export function sanitizeLooks(raw) {
  if (!Array.isArray(raw)) return { value: null, warnings: ['looks 不是数组，已忽略'] }
  const warnings = []
  const looks = []
  for (const entry of asArray(raw)) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) {
      warnings.push('丢弃一条收藏：缺少 id')
      continue
    }
    const outfit = isPlainObject(entry.outfit) ? entry.outfit : null
    if (!outfit || typeof outfit.top !== 'string' || typeof outfit.bottom !== 'string') {
      warnings.push(`丢弃一条收藏：outfit 不完整（${entry.id}）`)
      continue
    }
    looks.push({
      id: entry.id,
      name: isNonEmptyString(entry.name) ? entry.name : '未命名造型',
      ts: Number.isFinite(entry.ts) ? entry.ts : 0,
      outfit: {
        top: outfit.top,
        outer: typeof outfit.outer === 'string' ? outfit.outer : 'o-none',
        bottom: outfit.bottom,
        shoes: typeof outfit.shoes === 'string' ? outfit.shoes : '',
        accs: asArray(outfit.accs).filter((a) => typeof a === 'string'),
      },
    })
  }
  return { value: looks, warnings }
}

export function sanitizeImages(raw) {
  if (raw === undefined || raw === null) return { value: [], warnings: [] }
  if (!Array.isArray(raw)) return { value: [], warnings: ['images 不是数组，已忽略'] }
  const warnings = []
  const images = []
  for (const entry of asArray(raw)) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) {
      warnings.push('丢弃一张照片：缺少 id')
      continue
    }
    if (typeof entry.dataUrl !== 'string' || !entry.dataUrl.startsWith('data:')) {
      warnings.push(`丢弃一张照片：dataUrl 非法（${entry.id}）`)
      continue
    }
    images.push({ id: entry.id, type: typeof entry.type === 'string' ? entry.type : 'image/jpeg', dataUrl: entry.dataUrl })
  }
  return { value: images, warnings }
}

/**
 * 每日条件（契约 §2）。字段非法就退回默认值而不是丢弃整块——
 * 天气是可手改的偏好，丢一件不该让用户丢掉城市。写入端已保证结构，
 * 这里只防「外部备份包被手改」。
 */
export function sanitizeDaily(raw) {
  const warnings = []
  const fallback = {
    version: 1, city: '', temp: 20, condition: 'clear', wind: 'light',
    indoor: 'normal', commute: 'walk', occasion: 'casual', updatedAt: '',
  }
  if (raw === undefined || raw === null) return { value: fallback, warnings }
  if (!isPlainObject(raw)) return { value: fallback, warnings: ['daily 不是对象，已重置为默认条件'] }

  const temp = Number(raw.temp)
  const clamped = Number.isFinite(temp) ? Math.min(DAILY_TEMP_MAX, Math.max(DAILY_TEMP_MIN, Math.round(temp))) : fallback.temp
  if (Number.isFinite(temp) && clamped !== Math.round(temp)) warnings.push(`温度 ${temp} 超出 ${DAILY_TEMP_MIN}~${DAILY_TEMP_MAX}，已夹到 ${clamped}`)

  const pick = (value, list, def, label) => {
    if (value === undefined || value === null) return def
    if (list.includes(value)) return value
    warnings.push(`${label} ${String(value)} 非法，已改为默认值 ${def}`)
    return def
  }

  return {
    value: {
      version: 1,
      city: isNonEmptyString(raw.city) ? raw.city : '',
      temp: clamped,
      condition: pick(raw.condition, DAILY_CONDITIONS, fallback.condition, '天气'),
      wind: pick(raw.wind, DAILY_WINDS, fallback.wind, '风力'),
      indoor: pick(raw.indoor, DAILY_INDOORS, fallback.indoor, '室内'),
      commute: pick(raw.commute, DAILY_COMMUTES, fallback.commute, '通勤方式'),
      occasion: pick(raw.occasion, DAILY_OCCASIONS, fallback.occasion, '场景'),
      updatedAt: isNonEmptyString(raw.updatedAt) ? raw.updatedAt : '',
    },
    warnings,
  }
}

/** 穿搭日历（契约 §3）。坏条目逐条丢弃，不因一条脏数据否掉整月记录。 */
export function sanitizeCalendar(raw) {
  const warnings = []
  const empty = { version: 1, entries: [] }
  if (raw === undefined || raw === null) return { value: empty, warnings }
  if (!isPlainObject(raw)) return { value: empty, warnings: ['calendar 不是对象，已按空日历处理'] }
  if (raw.entries !== undefined && !Array.isArray(raw.entries)) {
    return { value: empty, warnings: ['calendar.entries 不是数组，已按空日历处理'] }
  }

  const entries = []
  const seen = new Set()
  for (const entry of asArray(raw.entries)) {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) {
      warnings.push('丢弃一条日记：缺少 id')
      continue
    }
    if (seen.has(entry.id)) {
      warnings.push(`丢弃重复日记：${entry.id}`)
      continue
    }
    if (!isNonEmptyString(entry.date) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      warnings.push(`丢弃一条日记：日期非法（${entry.id}）`)
      continue
    }
    const outfitRaw = isPlainObject(entry.outfit) ? entry.outfit : {}
    const outfit = {}
    for (const slot of CALENDAR_SLOTS) {
      outfit[slot] = slot === 'accs'
        ? asArray(outfitRaw.accs).filter((a) => typeof a === 'string')
        : (typeof outfitRaw[slot] === 'string' ? outfitRaw[slot] : null)
    }
    const rating = Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5 ? entry.rating : null
    const weather = isPlainObject(entry.weather)
      ? {
        temp: Number.isFinite(Number(entry.weather.temp)) ? Math.round(Number(entry.weather.temp)) : null,
        condition: DAILY_CONDITIONS.includes(entry.weather.condition) ? entry.weather.condition : null,
      }
      : null
    seen.add(entry.id)
    entries.push({
      id: entry.id,
      date: entry.date,
      outfit,
      weather,
      occasion: isNonEmptyString(entry.occasion) ? entry.occasion : '',
      note: typeof entry.note === 'string' ? entry.note : '',
      rating,
      createdAt: isNonEmptyString(entry.createdAt) ? entry.createdAt : '',
      updatedAt: isNonEmptyString(entry.updatedAt) ? entry.updatedAt : '',
    })
  }

  if (entries.length > CALENDAR_MAX_ENTRIES) {
    warnings.push(`日历超过 ${CALENDAR_MAX_ENTRIES} 条，仅保留最近的部分`)
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { value: { version: 1, entries: entries.slice(0, CALENDAR_MAX_ENTRIES) }, warnings }
}

/**
 * 解析 ISO 时间戳为毫秒数；无效返回 null。
 * 不能直接拿字符串比大小：`2026-10-17T06:00:00Z` 与 `2026-10-17T06:00:00.000Z`
 * 表示同一时刻，但字符串比较会把带毫秒的那个判成「更大」，于是合并时选错较新的一方。
 */
function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * 比较两个 updatedAt：返回 true 表示 incoming 更新。
 * 导入方没有时间戳时**不覆盖**现有值——v1 包缺字段会被洗成空串，
 * 若让它胜出就会把用户真实的天气条件/日历记录抹平。
 */
function incomingIsNewer(currentAt, incomingAt) {
  const incomingMs = parseTimestamp(incomingAt)
  const currentMs = parseTimestamp(currentAt)
  if (incomingMs === null) return false // 导入方时间戳缺失/无法解析 → 不覆盖
  if (currentMs === null) return true // 现有值没有可比时间戳 → 让导入方胜出
  if (incomingMs !== currentMs) return incomingMs > currentMs
  // 同一时刻：退回字符串比较只为保证确定性（否则相等时行为取决于调用顺序）。
  return String(incomingAt) > String(currentAt)
}

/**
 * 校验一个备份包。**先全量校验再写入**：调用方只有在 ok 为 true 时才允许动 storage。
 * @param {unknown} raw 已 JSON.parse 的值
 * @returns {{ok:true, backup:object, warnings:string[]} | {ok:false, code:string, reason:string}}
 */
export function validateBackup(raw) {
  if (!isPlainObject(raw)) return { ok: false, code: 'not-object', reason: '备份内容不是一个 JSON 对象' }
  if (raw.schema !== BACKUP_SCHEMA) {
    return { ok: false, code: 'bad-schema', reason: `不是 style-lab 备份包（schema=${String(raw.schema)}）` }
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, code: 'bad-version', reason: `版本号非法：${String(raw.version)}` }
  }
  if (raw.version > BACKUP_VERSION) {
    return {
      ok: false,
      code: 'unsupported-version',
      reason: `备份包版本 ${raw.version} 高于本应用支持的 ${BACKUP_VERSION}，请升级应用后再导入`,
    }
  }
  if (!isPlainObject(raw.data)) return { ok: false, code: 'bad-data', reason: '缺少 data 字段' }

  const warnings = []
  const wardrobe = sanitizeWardrobe(raw.data.wardrobe ?? { version: 1, items: [] })
  const preferences = sanitizePreferences(raw.data.preferences ?? { version: 1 })
  const looks = sanitizeLooks(raw.data.looks ?? [])
  const images = sanitizeImages(raw.data.images)
  // v1 包没有 daily/calendar：缺省记作 null（而不是默认值），这样导入时可以
  // 「什么都不做」而不是把用户已有的数据覆盖成默认值（契约 §6 向后兼容）。
  const hasDaily = raw.data.daily !== undefined && raw.data.daily !== null
  const hasCalendar = raw.data.calendar !== undefined && raw.data.calendar !== null
  const daily = sanitizeDaily(raw.data.daily)
  const calendar = sanitizeCalendar(raw.data.calendar)
  warnings.push(
    ...wardrobe.warnings, ...preferences.warnings, ...looks.warnings, ...images.warnings,
    ...(hasDaily ? daily.warnings : []), ...(hasCalendar ? calendar.warnings : []),
  )

  const theme = typeof raw.data.theme === 'string' ? raw.data.theme : ''

  return {
    ok: true,
    warnings,
    backup: {
      schema: BACKUP_SCHEMA,
      version: raw.version,
      exportedAt: isNonEmptyString(raw.exportedAt) ? raw.exportedAt : '',
      app: isPlainObject(raw.app) ? { version: isNonEmptyString(raw.app.version) ? raw.app.version : '' } : { version: '' },
      data: {
        wardrobe: wardrobe.value ?? { version: 1, items: [] },
        preferences: preferences.value ?? { version: 1, feedback: [], weights: { itemIds: {}, colors: {}, formalities: {} } },
        looks: looks.value ?? [],
        theme,
        images: images.value,
        daily: hasDaily ? daily.value : null,
        calendar: hasCalendar ? calendar.value : null,
      },
    },
  }
}

// ------------------------------------------------------- 合并策略（纯函数）

/**
 * 个人衣橱按 id 合并：同一件比较 updatedAt，较新的胜出；缺失 updatedAt 时导入方胜出
 * （用户主动导入即表达了「以这份为准」的意图）。
 */
export function mergeWardrobe(current, incoming) {
  const stats = { added: 0, updated: 0, kept: 0 }
  const cur = sanitizeWardrobe(current).value ?? { version: 1, items: [] }
  const inc = sanitizeWardrobe(incoming).value ?? { version: 1, items: [] }
  const map = new Map(cur.items.map((item) => [item.id, item]))
  for (const item of inc.items) {
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      stats.added++
      continue
    }
    const a = existing.updatedAt || ''
    const b = item.updatedAt || ''
    // 用 incomingIsNewer 而非字符串比较：ISO 时间戳带不带毫秒精度不同，
    // 直接比字符串会把同一时刻判成「更新」，从而选错要保留的那一件。
    if (incomingIsNewer(a, b)) {
      map.set(item.id, item)
      stats.updated++
    } else {
      stats.kept++
    }
  }
  return { value: { version: 1, items: [...map.values()] }, stats }
}

/**
 * 偏好按 id 合并；权重各桶相加后夹在 [-12, 12]（契约 §4）。
 */
export function mergePreferences(current, incoming) {
  const stats = { feedbackAdded: 0, feedbackMerged: 0, weightKeys: 0 }
  const cur = sanitizePreferences(current).value ?? { version: 1, feedback: [], weights: {} }
  const inc = sanitizePreferences(incoming).value ?? { version: 1, feedback: [], weights: {} }

  const order = []
  const map = new Map()
  for (const f of cur.feedback) {
    if (!map.has(f.id)) order.push(f.id)
    map.set(f.id, f)
  }
  for (const f of inc.feedback) {
    if (map.has(f.id)) stats.feedbackMerged++
    else { order.push(f.id); stats.feedbackAdded++ }
    map.set(f.id, f)
  }

  const weights = { itemIds: {}, colors: {}, formalities: {} }
  for (const bucket of Object.keys(weights)) {
    const a = isPlainObject(cur.weights?.[bucket]) ? cur.weights[bucket] : {}
    const b = isPlainObject(inc.weights?.[bucket]) ? inc.weights[bucket] : {}
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const sum = (Number.isFinite(a[key]) ? a[key] : 0) + (Number.isFinite(b[key]) ? b[key] : 0)
      weights[bucket][key] = clampWeight(sum)
      stats.weightKeys++
    }
  }

  return { value: { version: 1, feedback: order.map((id) => map.get(id)), weights }, stats }
}

/** 收藏按 id 合并，按 ts 倒序保留最新 30 条（与 ShareBar 上限一致）。 */
export function mergeLooks(current, incoming) {
  const stats = { added: 0, replaced: 0, dropped: 0 }
  const cur = sanitizeLooks(Array.isArray(current) ? current : []).value ?? []
  const inc = sanitizeLooks(Array.isArray(incoming) ? incoming : []).value ?? []
  const map = new Map(cur.map((l) => [l.id, l]))
  for (const look of inc) {
    if (map.has(look.id)) stats.replaced++
    else stats.added++
    map.set(look.id, look)
  }
  const all = [...map.values()].sort((a, b) => b.ts - a.ts)
  const capped = all.slice(0, MAX_LOOKS)
  stats.dropped = all.length - capped.length
  return { value: capped, stats }
}

/** 主题是标量：合并时只在当前为空时采用导入值；覆盖时直接采用。 */
export function mergeTheme(current, incoming, mode) {
  if (mode === 'overwrite') return { value: typeof incoming === 'string' ? incoming : '', changed: current !== incoming }
  const useIncoming = !isNonEmptyString(current) && isNonEmptyString(incoming)
  return { value: useIncoming ? incoming : (typeof current === 'string' ? current : ''), changed: useIncoming }
}

/** 每日条件是单条记录：按 updatedAt 取新者（契约 §6）。incoming 为 null 表示本包没带这项。 */
export function mergeDaily(current, incoming, mode) {
  const cur = sanitizeDaily(current).value
  if (incoming === null || incoming === undefined) return { value: cur, changed: false }
  const inc = sanitizeDaily(incoming).value
  if (mode === 'overwrite') return { value: inc, changed: true }
  const changed = incomingIsNewer(cur.updatedAt, inc.updatedAt)
  return { value: changed ? inc : cur, changed }
}

/** 穿搭日历按 id 合并，同一 id 取 updatedAt 新者（契约 §6）。incoming 为 null 表示本包没带这项。 */
export function mergeCalendar(current, incoming, mode) {
  const cur = sanitizeCalendar(current).value
  const emptyStats = { added: 0, updated: 0, kept: 0 }
  if (incoming === null || incoming === undefined) return { value: cur, stats: emptyStats, changed: false }
  const inc = sanitizeCalendar(incoming).value
  if (mode === 'overwrite') {
    return { value: inc, stats: { added: inc.entries.length, updated: 0, kept: 0 }, changed: true }
  }
  const map = new Map(cur.entries.map((e) => [e.id, e]))
  const stats = { added: 0, updated: 0, kept: 0 }
  for (const entry of inc.entries) {
    const existing = map.get(entry.id)
    if (!existing) { stats.added++; map.set(entry.id, entry); continue }
    if (incomingIsNewer(existing.updatedAt, entry.updatedAt)) { stats.updated++; map.set(entry.id, entry) }
    else stats.kept++
  }
  const all = [...map.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const value = { version: 1, entries: all.slice(0, CALENDAR_MAX_ENTRIES) }
  // 不做 updatedAt 时间戳比较：日期串与 updatedAt 都不是单调的，semantic 上「有变化」即写。
  const changed = stats.added > 0 || stats.updated > 0
  return { value, stats, changed }
}

/**
 * 决定「这次导入要写哪些 key、写成什么」——纯函数，不碰 storage。
 * 高风险策略在这里显式化，便于测试。
 * @param {{wardrobe?:unknown, preferences?:unknown, looks?:unknown, theme?:unknown}} current 当前已存的值
 * @param {object} backup validateBackup 返回的 backup
 * @param {{mode:'merge'|'overwrite'}} options
 * @returns {{mode:string, writes:Array<{key:string, value:string}>, stats:object, warnings:string[]}}
 */
export function planImport(current, backup, options = {}) {
  const mode = options.mode === 'overwrite' ? 'overwrite' : 'merge'
  const warnings = []
  const cur = isPlainObject(current) ? current : {}
  const data = backup.data
  const writes = []

  if (mode === 'overwrite') {
    writes.push({ key: STORAGE_KEYS.wardrobe, value: JSON.stringify({ version: 1, items: data.wardrobe.items }) })
    writes.push({ key: STORAGE_KEYS.preferences, value: JSON.stringify(data.preferences) })
    writes.push({ key: STORAGE_KEYS.looks, value: JSON.stringify(data.looks.slice(0, MAX_LOOKS)) })
    if (data.looks.length > MAX_LOOKS) warnings.push(`收藏超过 ${MAX_LOOKS} 条，超出的 ${data.looks.length - MAX_LOOKS} 条已丢弃`)
    const theme = mergeTheme(cur.theme, data.theme, 'overwrite')
    if (theme.value) writes.push({ key: STORAGE_KEYS.theme, value: theme.value })
    // 覆盖模式同样尊重「本包没带这项」：null 表示不写，避免用默认值抹掉现有条件。
    const daily = mergeDaily(cur.daily, data.daily, 'overwrite')
    const calendar = mergeCalendar(cur.calendar, data.calendar, 'overwrite')
    if (data.daily !== null && data.daily !== undefined) writes.push({ key: STORAGE_KEYS.daily, value: JSON.stringify(daily.value) })
    if (data.calendar !== null && data.calendar !== undefined) writes.push({ key: STORAGE_KEYS.calendar, value: JSON.stringify(calendar.value) })
    return {
      mode,
      writes,
      warnings,
      stats: {
        wardrobe: { added: data.wardrobe.items.length, updated: 0, kept: 0 },
        preferences: { feedbackAdded: data.preferences.feedback.length, feedbackMerged: 0, weightKeys: 0 },
        looks: { added: data.looks.length, replaced: 0, dropped: Math.max(0, data.looks.length - MAX_LOOKS) },
        daily: { written: data.daily !== null && data.daily !== undefined },
        calendar: calendar.stats,
      },
    }
  }

  const wardrobe = mergeWardrobe(cur.wardrobe, data.wardrobe)
  const preferences = mergePreferences(cur.preferences, data.preferences)
  const looks = mergeLooks(cur.looks, data.looks)
  writes.push({ key: STORAGE_KEYS.wardrobe, value: JSON.stringify(wardrobe.value) })
  writes.push({ key: STORAGE_KEYS.preferences, value: JSON.stringify(preferences.value) })
  writes.push({ key: STORAGE_KEYS.looks, value: JSON.stringify(looks.value) })
  const theme = mergeTheme(cur.theme, data.theme, 'merge')
  if (theme.value) writes.push({ key: STORAGE_KEYS.theme, value: theme.value })
  if (looks.stats.dropped > 0) warnings.push(`收藏合并后超过 ${MAX_LOOKS} 条，丢弃最旧的 ${looks.stats.dropped} 条`)

  const daily = mergeDaily(cur.daily, data.daily, 'merge')
  const calendar = mergeCalendar(cur.calendar, data.calendar, 'merge')
  // 只在「确实带来了变化」时写：daily/calendar 是长期累积的数据，
  // 一次无谓的写会把 updatedAt 语义弄乱，也容易在合并灰区制造惊喜。
  if (daily.changed) writes.push({ key: STORAGE_KEYS.daily, value: JSON.stringify(daily.value) })
  if (calendar.changed) writes.push({ key: STORAGE_KEYS.calendar, value: JSON.stringify(calendar.value) })
  if (calendar.stats.kept > 0) warnings.push(`日历有 ${calendar.stats.kept} 条因本地版本更新而保留`)

  return {
    mode,
    writes,
    warnings,
    stats: { wardrobe: wardrobe.stats, preferences: preferences.stats, looks: looks.stats, daily: { written: daily.changed }, calendar: calendar.stats },
  }
}

// ------------------------------------------------------------- 写盘（事务）

/**
 * 执行 planImport 的写入。写前对每个 key 做快照，任一写入抛错就把已写的全部还原，
 * 尽量不给用户留下半写状态。
 * @returns {{ok:boolean, written:string[], error?:Error, rolledBack?:boolean, rollbackErrors?:string[]}}
 */
export function applyPlan(plan, storage) {
  if (!storage) return { ok: false, written: [], error: new Error('localStorage 不可用'), rolledBack: false }
  const snapshot = new Map()
  for (const write of plan.writes) {
    try {
      snapshot.set(write.key, storage.getItem(write.key))
    } catch (error) {
      console.warn(`[backup] 快照 ${write.key} 失败：`, error)
      snapshot.set(write.key, null)
    }
  }
  const written = []
  try {
    for (const write of plan.writes) {
      storage.setItem(write.key, write.value)
      written.push(write.key)
    }
    return { ok: true, written }
  } catch (error) {
    console.warn('[backup] 写入失败，开始回滚：', error)
    const rollbackErrors = []
    for (const [key, raw] of snapshot) {
      try {
        if (raw === null || raw === undefined) storage.removeItem(key)
        else storage.setItem(key, raw)
      } catch (rollbackError) {
        rollbackErrors.push(`${key}: ${rollbackError.message}`)
        console.warn(`[backup] 回滚 ${key} 失败：`, rollbackError)
      }
    }
    return { ok: false, written: [], error, rolledBack: true, rollbackErrors }
  }
}

/**
 * 清空本应用写入的全部 localStorage 数据（重置为「首次访问」状态）。
 * 与导入一致，逐 key try/catch：某个 key 被禁用不应妨碍其余 key 被清理。
 * @returns {{ok:boolean, cleared:string[], errors:Array<{key:string,message:string}>}}
 */
export function resetAll(storage, keys = Object.values(STORAGE_KEYS)) {
  if (!storage) {
    return { ok: false, cleared: [], errors: [{ key: '*', message: 'localStorage 不可用，本地数据未被修改' }] }
  }
  const cleared = []
  const errors = []
  for (const key of keys) {
    try {
      storage.removeItem(key)
      cleared.push(key)
    } catch (error) {
      console.warn(`[backup] 清空 ${key} 失败：`, error)
      errors.push({ key, message: error.message })
    }
  }
  return { ok: errors.length === 0, cleared, errors }
}

// ---------------------------------------------------------------- 导出（读）

/** 收集当前数据成一个备份包对象（纯函数 + 注入 storage/imageStore）。 */
export function collectBackup({ storage = defaultStorage(), imageStore = null, appVersion = '', images = [], now = new Date() } = {}) {
  const wardrobeRaw = readJSON(storage, STORAGE_KEYS.wardrobe)
  const preferencesRaw = readJSON(storage, STORAGE_KEYS.preferences)
  const looksRaw = readJSON(storage, STORAGE_KEYS.looks)
  const themeRaw = readRawString(storage, STORAGE_KEYS.theme)
  // 缺失（用户从未设置过）导出为 null，导入端据此判断「本包不带这项」。
  const dailyRaw = readJSON(storage, STORAGE_KEYS.daily)
  const calendarRaw = readJSON(storage, STORAGE_KEYS.calendar)
  const warnings = []
  if (!storage) warnings.push('浏览器不支持或禁用了 localStorage，导出的包不含个人数据')

  const wardrobe = sanitizeWardrobe(wardrobeRaw.value ?? { version: 1, items: [] }).value
  const preferences = sanitizePreferences(preferencesRaw.value ?? { version: 1 }).value
  const looks = sanitizeLooks(looksRaw.value ?? []).value
  const theme = typeof themeRaw === 'string' ? themeRaw : ''
  const daily = dailyRaw.missing ? null : sanitizeDaily(dailyRaw.value).value
  const calendar = calendarRaw.missing ? null : sanitizeCalendar(calendarRaw.value).value

  return {
    backup: {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      app: { version: appVersion },
      data: { wardrobe, preferences, looks, theme, images: sanitizeImages(images).value, daily, calendar },
    },
    warnings,
    hasImageStore: !!imageStore,
  }
}

/** 文件名：style-lab-backup-YYYY-MM-DD.json（契约 §6）。 */
export function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `style-lab-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/**
 * 把当前数据（含照片）打包成 JSON 字符串。
 * imageStore 走契约 §3 的 exportImages(ids?)——现在 imageStore 尚未落地，
 * 传入 null 就跳过 images 并在 warnings 里说明，UI 据此提示降级。
 * @returns {Promise<{ok:boolean, json?:string, filename?:string, backup?:object, warnings:string[], error?:Error}>}
 */
export async function exportBackup({ storage = defaultStorage(), imageStore = null, appVersion = '', now = new Date() } = {}) {
  const warnings = []
  let images = []
  if (imageStore && typeof imageStore.exportImages === 'function') {
    try {
      const ids = collectBackup({ storage, now }).backup.data.wardrobe.items
        .map((item) => item.photoId)
        .filter((id) => isNonEmptyString(id))
      // 记录被跳过的照片：exportImages 只在 console 里留痕，不收集就会让「备份成功」
      // 与「照片齐全」画等号——用户恢复后才发现某几件单品的照片不见了。
      const skipped = []
      images = await imageStore.exportImages(ids.length ? ids : undefined, {
        onSkip: (info) => skipped.push(info),
      })
      if (!Array.isArray(images)) images = []
      if (skipped.length) {
        const oversized = skipped.filter((item) => item && item.reason && item.reason.includes('上限')).length
        warnings.push(
          `有 ${skipped.length} 张照片未写入备份包` +
          (oversized === skipped.length
            ? '（单张编码后超过 4MB 上限，建议先在衣橱里重新上传小图）'
            : '（过大或数据损坏，建议重新上传这些照片）'),
        )
      }
    } catch (error) {
      console.warn('[backup] 导出照片失败，备份包不含照片：', error)
      warnings.push(`照片导出失败，备份包不含照片：${error.message}`)
      images = []
    }
  } else if (imageStore) {
    warnings.push('imageStore 未提供 exportImages，备份包不含照片')
  } else {
    warnings.push('当前没有照片仓库，备份包不含照片')
  }

  const { backup, warnings: collectWarnings } = collectBackup({ storage, imageStore, appVersion, images, now })
  warnings.push(...collectWarnings)
  const json = JSON.stringify(backup, null, 2)
  // 体积提示：衣橱单品数没有上限，每张照片最多 ~1MB（base64 后约 1.33 倍），
  // 几十件带照片的衣橱就能做出几十 MB 的备份包。这里不阻断导出，只让用户知道
  // 「这个文件可能不适合走聊天工具/邮件」。
  const size = byteSize(json)
  if (size > BACKUP_SIZE_WARN_BYTES) {
    warnings.push(`备份包约 ${(size / 1024 / 1024).toFixed(1)}MB，体积偏大（多为照片），建议用文件传输而不是聊天窗口发送`)
  }
  return { ok: true, json, filename: backupFilename(now), backup, warnings, bytes: size }
}

// ---------------------------------------------------------------- 导入（写）

/**
 * 从一个 JSON 字符串导入。流程：解析 → validateBackup 全量校验 → planImport → applyPlan（可回滚）
 * → 照片导入（失败则按 id 回滚新导入的照片）。
 * 任何一步失败都返回 ok:false 且不留下半写状态；**绝不抛异常**。
 * @param {string} json
 * @param {{mode:'merge'|'overwrite', storage?:object, imageStore?:object, dryRun?:boolean}} options
 */
export async function importBackup(json, options = {}) {
  const { mode = 'merge', dryRun = false, imageStore = null } = options
  const storage = options.storage !== undefined ? options.storage : defaultStorage()

  if (typeof json !== 'string' || json.trim() === '') {
    return { ok: false, code: 'empty', reason: '没有可导入的内容' }
  }
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    console.warn('[backup] 备份包 JSON 解析失败：', error)
    return { ok: false, code: 'bad-json', reason: `不是合法的 JSON：${error.message}` }
  }

  const checked = validateBackup(parsed)
  if (!checked.ok) return { ok: false, code: checked.code, reason: checked.reason }

  if (!storage) {
    return { ok: false, code: 'no-storage', reason: '浏览器不可用或不支持 localStorage，无法导入（数据未被修改）' }
  }

  const current = {
    wardrobe: readJSON(storage, STORAGE_KEYS.wardrobe).value,
    preferences: readJSON(storage, STORAGE_KEYS.preferences).value,
    looks: readJSON(storage, STORAGE_KEYS.looks).value,
    theme: readRawString(storage, STORAGE_KEYS.theme),
    daily: readJSON(storage, STORAGE_KEYS.daily).value,
    calendar: readJSON(storage, STORAGE_KEYS.calendar).value,
  }
  const plan = planImport(current, checked.backup, { mode })

  if (dryRun) {
    return { ok: true, dryRun: true, mode, plan, warnings: [...checked.warnings, ...plan.warnings], stats: plan.stats }
  }

  const applied = applyPlan(plan, storage)
  if (!applied.ok) {
    return {
      ok: false,
      code: 'write-failed',
      reason: `写入失败（${applied.error.message}），已回滚${applied.rolledBack ? '' : '（部分回滚失败）'}`,
      rolledBack: applied.rolledBack,
      rollbackErrors: applied.rollbackErrors || [],
    }
  }

  const warnings = [...checked.warnings, ...plan.warnings]
  let images = { imported: 0, skipped: 0, attempted: checked.backup.data.images.length, rolledBack: false }

  if (checked.backup.data.images.length > 0) {
    if (imageStore && typeof imageStore.importImages === 'function') {
      // 先算出「本包新进的照片 id」：导入中途失败时只删这些，
      // 绝不误删用户导入前就存在的同名照片。
      const newIds = []
      if (typeof imageStore.getImageBlob === 'function') {
        for (const record of checked.backup.data.images) {
          try {
            const existing = await imageStore.getImageBlob(record.id)
            if (!existing) newIds.push(record.id)
          } catch (error) {
            console.warn(`[backup] 查询照片 ${record.id} 失败，保守视为已存在：`, error)
          }
        }
      }
      try {
        const result = await imageStore.importImages(checked.backup.data.images)
        images = {
          imported: Number.isFinite(result?.imported) ? result.imported : 0,
          skipped: Number.isFinite(result?.skipped) ? result.skipped : 0,
          attempted: checked.backup.data.images.length,
          rolledBack: false,
        }
        if (images.imported < images.attempted) {
          warnings.push(`照片仅导入 ${images.imported}/${images.attempted} 张，其余已跳过`)
        }
      } catch (error) {
        console.warn('[backup] 导入照片失败，回滚本包新导入的照片：', error)
        let rolledBack = false
        if (typeof imageStore.deleteImage === 'function' && newIds.length > 0) {
          for (const id of newIds) {
            try { await imageStore.deleteImage(id) } catch (e) { console.warn(`[backup] 回滚照片 ${id} 失败：`, e) }
          }
          rolledBack = true
        }
        images = { imported: 0, skipped: 0, attempted: checked.backup.data.images.length, rolledBack, error: error.message }
        warnings.push(`照片导入失败（结构化数据已写入，照片未写入）：${error.message}`)
      }
    } else {
      images.skipped = checked.backup.data.images.length
      warnings.push(`当前没有照片仓库，${checked.backup.data.images.length} 张照片被跳过`)
    }
  }

  return {
    ok: true,
    mode,
    written: applied.written,
    stats: plan.stats,
    warnings,
    images,
  }
}

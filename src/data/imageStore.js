// 照片仓库 v1：IndexedDB `stylelab-media` / version 1 / objectStore `images`。
// 契约见 docs/PHASE1-CONTRACT.md 第 3 节。
//
// 设计要点（可测性 + 降级安全）：
// 1. 本文件是纯 ESM，不引用 React；对 document / indexedDB / createImageBitmap 只做
//    「运行时探测」，Node 直接 import 也不会抛（Node 里没有 indexedDB，相关函数返回安全降级值）。
// 2. 所有副作用都可通过 inject 参数替换：测试用内存后端（memoryBackend）覆盖全部增删查逻辑，
//    浏览器里默认走 IndexedDB 后端。压缩管线同理可注入 createBitmap / drawImage。
// 3. 任何失败都 console.warn 并返回 ok:false/null，绝不抛异常、绝不阻断 App 渲染。

export const MEDIA_DB_NAME = 'stylelab-media'
export const MEDIA_DB_VERSION = 1
export const MEDIA_STORE = 'images'

/** 契约 §3 的上限：最长边 1200、JPEG 质量 0.82、单图目标 ≲900KB。 */
export const DEFAULT_MAX_EDGE = 1200
export const DEFAULT_QUALITY = 0.82
export const TARGET_MAX_BYTES = 900 * 1024
/** 逐级降质量的重试梯度（仍超限就降分辨率，见 compressBitmap）。 */
export const QUALITY_LADDER = [0.82, 0.72, 0.62, 0.5]
export const MIN_MAX_EDGE = 480
/** 契约 §3：size 字段可省略，用 dataURL 长度反推字节数的经验比例。 */
const BASE64_BYTES_RATIO = 0.75
const MAX_DATAURL_CHARS = 4 * 1024 * 1024

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** 是否具备 IndexedDB（浏览器 / 支持的环境）。 */
export function hasIndexedDB() {
  return typeof indexedDB !== 'undefined' && !!indexedDB
}

/** 是否具备浏览器图片压缩能力。 */
export function hasCanvasSupport() {
  return typeof document !== 'undefined' && !!document.createElement
}

function newImageId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `img-${crypto.randomUUID()}`
  } catch (error) {
    console.warn('[imageStore] crypto.randomUUID 不可用，改用时间戳降级：', error)
  }
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------- 后端抽象

/**
 * 内存后端：Node 测试与「IndexedDB 不可用」时的降级实现。
 * 生产代码不会用它持久化，但在同一会话内仍能预览刚选的图片。
 */
export function createMemoryBackend(seed = new Map()) {
  const map = seed instanceof Map ? seed : new Map(Object.entries(seed || {}))
  return {
    kind: 'memory',
    async put(record) {
      map.set(record.id, record)
      return record.id
    },
    async get(id) {
      return map.has(id) ? map.get(id) : null
    },
    async delete(id) {
      map.delete(id)
    },
    async keys() {
      return [...map.keys()]
    },
    _map: map,
  }
}

/**
 * IndexedDB 后端。任何一步失败都 reject，由上层 catch 成可见降级。
 */
export function createIndexedDBBackend(dbName = MEDIA_DB_NAME) {
  let dbPromise = null

  const open = () => {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
      let request
      try {
        request = indexedDB.open(dbName, MEDIA_DB_VERSION)
      } catch (error) {
        reject(error)
        return
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'))
      request.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'))
    })
    // 打开失败后允许下次重试，而不是永久缓存一个 rejected promise。
    dbPromise.catch((error) => {
      console.warn('[imageStore] IndexedDB 打开失败，下次调用将重试：', error)
      dbPromise = null
    })
    return dbPromise
  }

  const withStore = async (mode, fn) => {
    const db = await open()
    return new Promise((resolve, reject) => {
      let tx
      try {
        tx = db.transaction(MEDIA_STORE, mode)
      } catch (error) {
        reject(error)
        return
      }
      tx.onerror = () => reject(tx.error || new Error('IndexedDB 事务失败'))
      tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务被中止'))
      let request
      try {
        request = fn(tx.objectStore(MEDIA_STORE))
      } catch (error) {
        reject(error)
        return
      }
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'))
    })
  }

  return {
    kind: 'indexeddb',
    put: (record) => withStore('readwrite', (store) => store.put(record)).then(() => record.id),
    get: (id) => withStore('readonly', (store) => store.get(id)).then((v) => (v === undefined ? null : v)),
    delete: (id) => withStore('readwrite', (store) => store.delete(id)).then(() => undefined),
    keys: () => withStore('readonly', (store) => store.getAllKeys()),
  }
}

/**
 * 空后端：调用方显式表示「没有照片仓库」（例如 localStorage/IndexedDB 都不可用）时使用。
 * 读永远返回空、写永远失败，由各公开函数 catch 成可见降级，语义比「悄悄回退到默认后端」更诚实。
 */
export function createNullBackend() {
  return {
    kind: 'none',
    async put() { throw new Error('照片仓库不可用') },
    async get() { return null },
    async delete() {},
    async keys() { return [] },
  }
}

/** 默认后端：有 IndexedDB 用它，否则内存（同一会话仍可预览）。 */
export function defaultBackend() {
  if (hasIndexedDB()) {
    try {
      return createIndexedDBBackend()
    } catch (error) {
      console.warn('[imageStore] IndexedDB 后端创建失败，降级为内存后端：', error)
    }
  }
  return createMemoryBackend()
}

/** undefined＝用默认后端；null/false＝显式无仓库；对象或工厂＝调用方注入。 */
function resolveBackend(inject) {
  if (inject === undefined) return defaultBackend()
  if (!inject) return createNullBackend()
  if (typeof inject.open === 'function') return inject.open() // 兼容「传工厂」写法
  return inject
}

const base64ToBytes = (base64) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const bytesToBase64 = (bytes) => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Blob/File → dataURL（Node 与浏览器都能跑：Node 18+ 有 Blob 与 FileReader 之外的 arrayBuffer）。 */
export async function blobToDataUrl(blob) {
  if (!blob) return null
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => reject(reader.error || new Error('FileReader 读取失败'))
      reader.readAsDataURL(blob)
    })
  }
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer()
    const type = typeof blob.type === 'string' && blob.type ? blob.type : 'image/jpeg'
    return `data:${type};base64,${bytesToBase64(new Uint8Array(buffer))}`
  }
  throw new Error('当前环境无法把图片转成 dataURL')
}

/** dataURL → Blob。非法输入返回 null，不抛异常。 */
export function dataUrlToBlob(dataUrl) {
  try {
    if (typeof dataUrl !== 'string') return null
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl)
    if (!match) return null
    const type = match[1] || 'application/octet-stream'
    const isBase64 = !!match[2]
    const payload = match[3]
    const bytes = isBase64 ? base64ToBytes(payload) : new TextEncoder().encode(decodeURIComponent(payload))
    return new Blob([bytes], { type })
  } catch (error) {
    console.warn('[imageStore] dataURL 解析失败：', error)
    return null
  }
}

export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const payload = dataUrl.length - comma - 1
  return Math.max(0, Math.round(payload * BASE64_BYTES_RATIO))
}

// ---------------------------------------------------------------- 压缩

/** 按最长边等比缩放；不会放大原图。 */
export function fitSize(width, height, maxEdge = DEFAULT_MAX_EDGE) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0, scale: 1 }
  const longest = Math.max(w, h)
  const scale = longest <= maxEdge ? 1 : maxEdge / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale }
}

/** 透明图保留 PNG/WebP，其余统一转 JPEG（契约 §3）。 */
export function pickOutputType(sourceType, hasAlpha = false) {
  const type = typeof sourceType === 'string' ? sourceType.toLowerCase() : ''
  if (type === 'image/png' || type === 'image/webp' || type === 'image/gif' || hasAlpha) {
    return type === 'image/webp' ? 'image/webp' : 'image/png'
  }
  return 'image/jpeg'
}

/**
 * 压缩并保存一张图。
 * @param {Blob|File} file
 * @param {{maxEdge?:number, quality?:number, store?:object, createBitmap?:Function,
 *          drawCanvas?:Function, makeId?:Function}} [options]
 * @returns {Promise<{ok:boolean, id:string|null, width:number, height:number, type:string, size:number, error?:Error}>}
 */
export async function saveCompressedImage(file, options = {}) {
  const opts = isPlainObject(options) ? options : {}
  const maxEdge = Number.isFinite(opts.maxEdge) && opts.maxEdge > 0 ? Math.round(opts.maxEdge) : DEFAULT_MAX_EDGE
  const quality = Number.isFinite(opts.quality) && opts.quality > 0 && opts.quality <= 1 ? opts.quality : DEFAULT_QUALITY
  const failure = (error, extra = {}) => ({
    ok: false, id: null, width: 0, height: 0, type: 'image/jpeg', size: 0, error, ...extra,
  })

  if (!file) return failure(new Error('没有可保存的图片'))
  const sourceType = typeof file.type === 'string' && file.type ? file.type : 'image/jpeg'
  if (!sourceType.startsWith('image/')) return failure(new Error(`不是图片文件：${sourceType}`))

  const store = resolveBackend(opts.store)
  const id = typeof opts.makeId === 'function' ? opts.makeId() : newImageId()

  let compressed
  try {
    compressed = await compressBlob(file, { maxEdge, quality, createBitmap: opts.createBitmap, drawCanvas: opts.drawCanvas })
  } catch (error) {
    console.warn('[imageStore] 图片压缩失败，降级保存原图：', error)
    compressed = { blob: file, width: 0, height: 0, type: sourceType, degraded: true }
  }

  const record = {
    id,
    blob: compressed.blob,
    type: compressed.type,
    width: compressed.width,
    height: compressed.height,
    size: Number.isFinite(compressed.blob?.size) ? compressed.blob.size : 0,
    createdAt: new Date().toISOString(),
    degraded: !!compressed.degraded,
  }

  try {
    await store.put(record)
  } catch (error) {
    console.warn('[imageStore] 照片写入失败（存储可能已满或被禁用）：', error)
    return failure(error, { width: record.width, height: record.height, type: record.type, size: record.size })
  }

  return { ok: true, id, width: record.width, height: record.height, type: record.type, size: record.size }
}

/**
 * 真正的压缩管线：解码 → 缩放 → 编码 → 超限重试。
 * 与 saveCompressedImage 分开，便于单测直接注入假的 createBitmap / drawCanvas。
 *
 * 目标体积对**所有输出格式**生效，不只是 JPEG：
 *   修复前非 JPEG（PNG/WebP）在第一轮就无条件返回，于是「单图 ≤900KB」只对照片
 *   （JPEG）成立；一张带透明的手机截图缩到 1200 长边仍是几 MB 的无损 PNG，
 *   既撑大 IndexedDB，又会因为超过导出上限（4MB dataURL）在备份里被静默丢掉。
 *   现在 PNG 也走同一套「达标才停」的循环：无损格式的质量档无意义，只缩边；
 *   缩到 MIN_MAX_EDGE 仍超限且原图无透明通道时，再转 JPEG 压一轮（透明信息本来就不存在）。
 * @returns {Promise<{blob:Blob, width:number, height:number, type:string}>}
 */
export async function compressBlob(file, { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY, createBitmap, drawCanvas } = {}) {
  const decode = typeof createBitmap === 'function' ? createBitmap : defaultCreateBitmap
  const render = typeof drawCanvas === 'function' ? drawCanvas : defaultDrawCanvas

  const bitmap = await decode(file)
  if (!bitmap || !Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height)) throw new Error('无法解码图片尺寸')
  const type = pickOutputType(file?.type, bitmap.hasAlpha === true)

  let best = null
  // 质量梯度：以 QUALITY_LADDER 为基准，按调用方给的 quality 与契约默认值的比例整体缩放。
  // quality 传 0.82（默认）时就是 0.82/0.72/0.62/0.5；传更高值则整条梯度上移，但仍会逐级回退。
  const ladder = QUALITY_LADDER
    .map((q) => Math.round(q * (quality / DEFAULT_QUALITY) * 100) / 100)
    .filter((q) => q > 0 && q <= 1)
    .filter((q, i, arr) => arr.indexOf(q) === i)

  /** 在给定输出格式上跑「缩边 × 质量档」，命中目标体积即返回；未命中返回 null 并把最小的结果留在 best。 */
  const run = async (outType, startEdge) => {
    // 无损格式忽略 quality 参数，重复渲染四档纯属浪费一次 canvas 编码。
    const qualities = outType === 'image/png' ? ladder.slice(0, 1) : ladder
    let edge = startEdge
    for (let round = 0; round < 4; round++) {
      const { width, height } = fitSize(bitmap.width, bitmap.height, edge)
      for (const q of qualities) {
        const blob = await render(bitmap, width, height, outType, q)
        if (!blob) continue
        if (!best || blob.size < best.blob.size) best = { blob, width, height, type: outType }
        if (blob.size <= TARGET_MAX_BYTES) return best
      }
      if (edge <= MIN_MAX_EDGE) break
      edge = Math.max(MIN_MAX_EDGE, Math.round(edge * 0.75))
    }
    return null
  }

  const hit = await run(type, maxEdge)
  if (hit) return hit
  // 兜底：无损格式压不到目标、且原图没有透明通道 → 转 JPEG 再来一轮（不丢任何视觉信息）。
  if (type !== 'image/jpeg' && bitmap.hasAlpha !== true) {
    const jpegHit = await run('image/jpeg', maxEdge)
    if (jpegHit) return jpegHit
  }
  if (!best) throw new Error('图片编码失败')
  return best
}

/** 浏览器默认解码：createImageBitmap 优先，HTMLImageElement 兜底。 */
async function defaultCreateBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, hasAlpha: file?.type === 'image/png' || file?.type === 'image/webp', close: () => bitmap.close?.() }
  }
  if (!hasCanvasSupport()) throw new Error('当前环境不支持图片解码')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = document.createElement('img')
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('图片加载失败'))
      el.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, hasAlpha: file?.type === 'image/png', close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** 浏览器默认编码：Canvas → toBlob（失败回退 toDataURL）。 */
function defaultDrawCanvas(bitmap, width, height, type, quality) {
  if (!hasCanvasSupport()) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  // 透明图铺白底，避免转 JPEG 后出现黑块。
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap.source, 0, 0, width, height)
  const done = () => {
    try {
      bitmap.close?.()
    } catch (error) {
      console.warn('[imageStore] 释放位图失败（可忽略）：', error)
    }
  }
  if (typeof canvas.toBlob !== 'function') {
    const dataUrl = canvas.toDataURL(type, quality)
    done()
    return Promise.resolve(dataUrlToBlob(dataUrl))
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      done()
      resolve(blob || null)
    }, type, quality)
  })
}

// ---------------------------------------------------------------- 读写接口（契约 §3）

/**
 * 取一张照片的 Blob。不存在或失败返回 null。
 * @param {string} id
 * @param {{store?:object}} [options]
 */
export async function getImageBlob(id, options = {}) {
  if (typeof id !== 'string' || !id) return null
  try {
    const store = resolveBackend(options.store)
    const record = await store.get(id)
    if (!record) return null
    if (record.blob) return record.blob
    if (typeof record.dataUrl === 'string') return dataUrlToBlob(record.dataUrl)
    return null
  } catch (error) {
    console.warn(`[imageStore] 读取照片 ${id} 失败：`, error)
    return null
  }
}

/** 取照片的可预览 dataURL（组件 <img src> 用）。 */
export async function getImageDataUrl(id, options = {}) {
  const blob = await getImageBlob(id, options)
  if (!blob) return null
  try {
    return await blobToDataUrl(blob)
  } catch (error) {
    console.warn(`[imageStore] 照片 ${id} 转 dataURL 失败：`, error)
    return null
  }
}

/**
 * 删除一张照片。幂等：删不存在的 id 也算成功。
 * @returns {Promise<void>}
 */
export async function deleteImage(id, options = {}) {
  if (typeof id !== 'string' || !id) return
  try {
    const store = resolveBackend(options.store)
    await store.delete(id)
  } catch (error) {
    console.warn(`[imageStore] 删除照片 ${id} 失败：`, error)
  }
}

/**
 * 导出照片为 `{id, type, dataUrl}` 数组（备份包 v1 用）。
 * @param {string[]|undefined} ids 省略则导出全部
 * @param {{store?:object, onSkip?:(info:{id:string, reason:string, size:number})=>void}} [options]
 *        onSkip：某张照片因过大/无法编码被跳过时回调。备份包会用它把「少了几张照片」
 *        写进 warnings —— 只打 console.warn 的话，用户看到「导出成功」却永远不知道照片不全。
 */
export async function exportImages(ids, options = {}) {
  const opts = isPlainObject(options) ? options : {}
  const onSkip = typeof opts.onSkip === 'function' ? opts.onSkip : null
  const skip = (id, reason, size = 0) => {
    console.warn(`[imageStore] 照片 ${id} ${reason}，已跳过导出`)
    if (!onSkip) return
    try {
      onSkip({ id, reason, size })
    } catch (error) {
      console.warn('[imageStore] onSkip 回调失败：', error)
    }
  }
  const out = []
  try {
    const store = resolveBackend(opts.store)
    let targets = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : null
    if (!targets) {
      const keys = await store.keys()
      targets = Array.isArray(keys) ? keys : []
    }
    for (const id of targets) {
      const record = await store.get(id)
      if (!record) {
        skip(id, '在仓库里找不到')
        continue
      }
      const blob = record.blob || (typeof record.dataUrl === 'string' ? dataUrlToBlob(record.dataUrl) : null)
      if (!blob) {
        skip(id, '无法还原为二进制')
        continue
      }
      const dataUrl = await blobToDataUrl(blob)
      if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATAURL_CHARS) {
        skip(id, `编码后超过 ${Math.round(MAX_DATAURL_CHARS / 1024 / 1024)}MB 上限`, blob.size || 0)
        continue
      }
      out.push({ id, type: record.type || blob.type || 'image/jpeg', dataUrl })
    }
  } catch (error) {
    console.warn('[imageStore] 导出照片失败，返回已成功部分：', error)
  }
  return out
}

/**
 * 导入照片。已存在同 id 的照片按「跳过」处理（不覆盖用户现有照片）。
 * @param {Array<{id:string, type?:string, dataUrl:string}>} records
 * @returns {Promise<{imported:number, skipped:number}>}
 */
export async function importImages(records, options = {}) {
  const result = { imported: 0, skipped: 0 }
  const list = Array.isArray(records) ? records : []
  if (list.length === 0) return result
  let store
  try {
    store = resolveBackend(options.store)
  } catch (error) {
    console.warn('[imageStore] 照片仓库不可用，全部跳过导入：', error)
    result.skipped = list.length
    return result
  }
  for (const record of list) {
    if (!isPlainObject(record) || typeof record.id !== 'string' || !record.id || typeof record.dataUrl !== 'string') {
      result.skipped += 1
      continue
    }
    try {
      const existing = await store.get(record.id)
      if (existing) {
        result.skipped += 1
        continue
      }
      const blob = dataUrlToBlob(record.dataUrl)
      if (!blob) {
        result.skipped += 1
        continue
      }
      await store.put({
        id: record.id,
        blob,
        type: typeof record.type === 'string' && record.type ? record.type : blob.type || 'image/jpeg',
        width: 0,
        height: 0,
        size: Number.isFinite(blob.size) ? blob.size : estimateDataUrlBytes(record.dataUrl),
        createdAt: new Date().toISOString(),
        imported: true,
      })
      result.imported += 1
    } catch (error) {
      console.warn(`[imageStore] 导入照片 ${record.id} 失败，已跳过：`, error)
      result.skipped += 1
    }
  }
  return result
}

/** 清空照片仓库（数据管理器重置用）。失败返回 {ok:false}。 */
export async function clearImages(options = {}) {
  try {
    const store = resolveBackend(options.store)
    const keys = await store.keys()
    for (const id of Array.isArray(keys) ? keys : []) await store.delete(id)
    return { ok: true, removed: Array.isArray(keys) ? keys.length : 0 }
  } catch (error) {
    console.warn('[imageStore] 清空照片仓库失败：', error)
    return { ok: false, removed: 0, error }
  }
}

/** 仓库里有多少张照片（UI 统计用）。 */
export async function countImages(options = {}) {
  try {
    const store = resolveBackend(options.store)
    const keys = await store.keys()
    return Array.isArray(keys) ? keys.length : 0
  } catch (error) {
    console.warn('[imageStore] 统计照片数量失败：', error)
    return 0
  }
}

/** 默认单例后端（组件层直接用契约签名，不必关心后端细节）。 */
let singleton = null
export function getDefaultStore() {
  if (!singleton) singleton = defaultBackend()
  return singleton
}

/** 测试用：重置单例后端。 */
export function resetDefaultStore() {
  singleton = null
}

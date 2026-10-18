// 个人衣橱状态 hook（PHASE1-CONTRACT §2 / §3）。
//
// 为什么不直接用 usePersistentState：
//   usePersistentState 是「整块 JSON 合法才采用，否则整体回退初始值」的语义，对衣橱太粗暴——
//   用户手改坏一件单品就会丢掉整个衣橱。这里改用 wardrobe.js 的 normalizeWardrobe，
//   逐件修复、只丢弃真正坏掉的那件，并把每次修复写成可展示的降级提示。
//
// 本文件只负责「读一次 + 把纯函数结果写回去」，所有数据变换都在 src/data/wardrobe.js 里（可被 Node 单测）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  WARDROBE_KEY,
  addItem,
  attachPhoto,
  clearWardrobe,
  decodeWardrobe,
  emptyWardrobe,
  findPersonalItem,
  isStorageAvailable,
  queryItems,
  readWardrobe,
  recordWear,
  recordWearMany,
  removeItem,
  setItemStatus,
  summarizeWardrobe,
  updateItem,
  writeWardrobe,
} from '../data/wardrobe.js'
import { deleteImage, getImageDataUrl, saveCompressedImage } from '../data/imageStore.js'

/** 组件层读一次存储：结果与降级提示都留成初始化状态。 */
function loadInitial() {
  const { state, warnings, missing, error } = readWardrobe()
  if (error) warnings.unshift('读取本地衣橱失败，已按空衣橱启动（本次改动仍可在页面内使用）')
  return { state, warnings, missing }
}

/**
 * @param {{storage?:object, imageStore?:object, onItemRemoved?:(id:string)=>void}} [options]
 *        测试/嵌入场景下注入替代实现；onItemRemoved 用于删除单品后清理日历与收藏里的引用。
 */
export function useWardrobe(options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const storageRef = useRef(opts.storage)
  const imageStoreRef = useRef(opts.imageStore)
  // 删除单品后的下游清理（日历 / 收藏夹）。用 ref 存放，避免它成为 useCallback 依赖
  // 而让 remove 每次渲染都换新身份。
  const onItemRemovedRef = useRef(opts.onItemRemoved)
  onItemRemovedRef.current = opts.onItemRemoved
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = loadInitial()

  const [state, setState] = useState(() => initialRef.current.state)
  const [warnings, setWarnings] = useState(() => initialRef.current.warnings)
  const [saveError, setSaveError] = useState(null)
  const [storageAvailable, setStorageAvailable] = useState(() => {
    try {
      return opts.storage !== undefined ? true : isStorageAvailable()
    } catch (error) {
      console.warn('[useWardrobe] 探测 localStorage 失败，按不可用处理：', error)
      return false
    }
  })
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 写回：与 usePersistentState 同策略——写失败只降级为「本次会话内存态」并给出可见提示。
  useEffect(() => {
    const result = writeWardrobe(storageRef.current, state)
    if (!mountedRef.current) return
    if (!result.ok) {
      setSaveError(result.error ? result.error.message : '浏览器不允许本地存储')
      setStorageAvailable(false)
    } else {
      setSaveError(null)
      setStorageAvailable(true)
    }
  }, [state])

  /** 统一出口：纯函数返回的 warnings/errors 都并入可见提示，绝不让错误静默。 */
  const applyResult = useCallback((result) => {
    const notes = [...(result.errors || []), ...(result.warnings || [])]
    if (notes.length) console.warn('[useWardrobe]', notes.join(' / '))
    if (mountedRef.current) setWarnings((prev) => [...notes, ...prev].slice(0, 8))
    return result
  }, [])

  const create = useCallback((input) => {
    const result = addItem(state, input)
    applyResult(result)
    if (result.item) setState(result.state)
    return result.item
  }, [applyResult, state])

  const update = useCallback((id, patch) => {
    const result = updateItem(state, id, patch)
    applyResult(result)
    if (result.item) setState(result.state)
    return result.item
  }, [applyResult, state])

  const remove = useCallback((id) => {
    const existing = findPersonalItem(state, id)
    const result = removeItem(state, id)
    if (!result.removed) applyResult({ errors: [`找不到单品：${id}`], warnings: [] })
    setState(result.state)
    // 照片是附属数据：删单品顺手清掉它的照片，避免 IndexedDB 里留下永远打不开的孤儿。
    if (existing?.photoId) {
      Promise.resolve(deleteImage(existing.photoId, { store: imageStoreRef.current })).catch((error) => {
        console.warn(`[useWardrobe] 清理照片 ${existing.photoId} 失败（可稍后在数据管理器重置）：`, error)
      })
    }
    // 日历与收藏夹里还留着这个 id 的引用。通知上层去清理，否则 UI 会把原始 UUID
    // 当成单品名显示出来，统计也会继续给它计数。
    if (result.removed && typeof onItemRemovedRef.current === 'function') {
      try {
        onItemRemovedRef.current(id)
      } catch (error) {
        console.warn('[useWardrobe] 清理单品的下游引用失败（可手动编辑日历）：', error)
      }
    }
    return result.removed
  }, [applyResult, state])

  const setStatus = useCallback((id, status) => {
    const result = setItemStatus(state, id, status)
    applyResult(result)
    if (result.item) setState(result.state)
    return result.item
  }, [applyResult, state])

  const wear = useCallback((id) => {
    const result = recordWear(state, id)
    applyResult(result)
    if (result.item) setState(result.state)
    return result.item
  }, [applyResult, state])

  /**
   * 一条造型里的多件个人单品一起记穿着。
   * 必须走这个原语而不是循环调 wear：wear 读的是渲染期闭包里的 state，
   * 循环中每次都从同一份旧 state 重算，一套造型 N 件最后只累加 1 次。
   */
  const wearMany = useCallback((ids) => {
    const result = recordWearMany(state, ids)
    applyResult(result)
    if (result.items.length) setState(result.state)
    return result.items
  }, [applyResult, state])

  /** 保存一张照片并挂到单品上。压缩/写入失败返回 null（降级提示已并入 warnings）。 */
  const savePhoto = useCallback(async (id, file) => {
    const saved = await saveCompressedImage(file, { store: imageStoreRef.current })
    if (!saved.ok || !saved.id) {
      applyResult({ errors: [`照片保存失败：${saved.error ? saved.error.message : '未知原因'}`], warnings: [] })
      return null
    }
    const result = attachPhoto(state, id, saved.id)
    if (!result.item) {
      // 挂载失败就别把照片留在仓库里，否则用户会看到一张谁都不引用的图片。
      await deleteImage(saved.id, { store: imageStoreRef.current })
      applyResult(result)
      return null
    }
    setState(result.state)
    return saved.id
  }, [applyResult, state])

  const removePhoto = useCallback(async (id) => {
    const existing = findPersonalItem(state, id)
    const result = attachPhoto(state, id, null)
    if (!result.item) {
      applyResult(result)
      return false
    }
    setState(result.state)
    if (existing?.photoId) await deleteImage(existing.photoId, { store: imageStoreRef.current })
    return true
  }, [applyResult, state])

  /** 取单品照片的 dataURL（组件 <img src> 用）。没有照片返回 null。 */
  const photoDataUrl = useCallback(async (item) => {
    const photoId = typeof item === 'string' ? findPersonalItem(state, item)?.photoId : item?.photoId
    if (!photoId) return null
    return getImageDataUrl(photoId, { store: imageStoreRef.current })
  }, [state])

  const clear = useCallback(() => {
    setState(clearWardrobe())
    setWarnings([])
  }, [])

  const replaceAll = useCallback((next) => {
    const { state: clean, warnings: notes } = decodeWardrobe(next)
    setState(clean)
    setWarnings(notes)
  }, [])

  const dismissWarnings = useCallback(() => setWarnings([]), [])

  const items = state.items
  const summary = useMemo(() => summarizeWardrobe(state), [state])
  const byId = useCallback((id) => findPersonalItem(state, id), [state])
  const query = useCallback((filters) => queryItems(state, filters), [state])

  const persistence = useMemo(() => ({
    available: storageAvailable,
    degraded: !storageAvailable || !!saveError,
    message: !storageAvailable
      ? '本地存储不可用（隐私模式或浏览器限制）：本次改动只保留在当前页面，刷新后会丢失。'
      : saveError ? `保存到本地失败：${saveError}。本次改动只保留在当前页面。` : '',
  }), [saveError, storageAvailable])

  // 返回对象本身也用 useMemo 固定住。
  // 原来每次渲染都返回新对象字面量，导致下游任何依赖 `wardrobe` 这个整体引用的
  // useMemo / React.memo 都永远失效（实测 OutfitCalendar 的 monthStats 每帧重算，
  // 2000 条记录时约 60ms/帧）。所有字段都已经是稳定引用，这里只是把它们包一次。
  return useMemo(() => ({
    // 状态
    state, items, summary, warnings, persistence,
    // 读
    byId, query,
    // 写
    create, update, remove, setStatus, wear, wearMany,
    // 照片
    savePhoto, removePhoto, photoDataUrl,
    // 维护
    clear, replaceAll, dismissWarnings,
    // 常量导出给 UI 复用
    storageKey: WARDROBE_KEY,
    empty: emptyWardrobe,
  }), [
    state, items, summary, warnings, persistence, byId, query,
    create, update, remove, setStatus, wear, wearMany,
    savePhoto, removePhoto, photoDataUrl, clear, replaceAll, dismissWarnings,
  ])
}

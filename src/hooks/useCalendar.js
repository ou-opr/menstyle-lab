// 穿搭日历 store（PHASE2-CONTRACT §3）。
//
// 与 useWardrobe 同策略：读一次、写回、把纯函数返回的 errors/warnings
// 都变成可见提示，绝不让「这条没记上」静默消失。
//
// 日历不是幂等数据（记录发生过的历史），所以任何写失败都必须让用户看得见——
// 用户以为记上了、其实没落盘，是这个功能最坏的失败方式。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CALENDAR_KEY,
  addEntry,
  allEntries,
  createCalendar,
  decodeCalendar,
  localDateKey,
  markedDates,
  readCalendar,
  removeEntry,
  updateEntry,
  writeCalendar,
} from '../data/calendar.js'
import { isStorageAvailable } from '../data/wardrobe.js'

function loadInitial() {
  const { state, warnings, error } = readCalendar()
  if (error) warnings.unshift('读取本地日历失败，已按空日历启动（本次新增仍可在页面内看到）')
  return { state, warnings }
}

/**
 * @param {{storage?:object}} [options] 测试场景注入替代存储
 */
export function useCalendar(options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const storageRef = useRef(opts.storage)
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = loadInitial()

  const [state, setState] = useState(() => initialRef.current.state)
  const [warnings, setWarnings] = useState(() => initialRef.current.warnings)
  const [saveError, setSaveError] = useState(null)
  const [storageAvailable, setStorageAvailable] = useState(() => {
    try {
      return opts.storage !== undefined ? true : isStorageAvailable()
    } catch (error) {
      console.warn('[useCalendar] 探测 localStorage 失败，按不可用处理：', error)
      return false
    }
  })

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const result = writeCalendar(storageRef.current, state)
    if (!mountedRef.current) return
    if (!result.ok) {
      setSaveError(result.error ? result.error.message : '浏览器不允许本地存储')
      setStorageAvailable(false)
    } else {
      setSaveError(null)
      setStorageAvailable(true)
    }
  }, [state])

  const note = useCallback((messages) => {
    const list = (messages || []).filter(Boolean)
    if (!list.length) return
    console.warn('[useCalendar]', list.join(' / '))
    if (mountedRef.current) setWarnings((prev) => [...list, ...prev].slice(0, 8))
  }, [])

  /** 新增一条记录。返回原始结果，调用方据 entry 是否存在决定是否记穿着次数。 */
  const add = useCallback((input) => {
    const result = addEntry(state, input)
    note([...(result.errors || []), ...(result.warnings || [])])
    if (result.entry) setState(result.state)
    return result
  }, [note, state])

  const update = useCallback((id, patch) => {
    const result = updateEntry(state, id, patch)
    note([...(result.errors || []), ...(result.warnings || [])])
    if (result.entry) setState(result.state)
    return result
  }, [note, state])

  const remove = useCallback((id) => {
    const result = removeEntry(state, id)
    if (!result.removed) note([`找不到这条记录：${id}`])
    else setState(result.state)
    return result.removed
  }, [note, state])

  const clear = useCallback(() => {
    setState(createCalendar())
    setWarnings([])
  }, [])

  const replaceAll = useCallback((raw) => {
    const { state: clean, warnings: notes } = decodeCalendar(raw)
    setState(clean)
    setWarnings(notes)
  }, [])

  const dismissWarnings = useCallback(() => setWarnings([]), [])

  const entries = state.entries
  const marked = useMemo(() => markedDates(state), [state])
  const today = localDateKey()
  const all = useMemo(() => allEntries(state), [state])

  const persistence = useMemo(() => ({
    available: storageAvailable,
    degraded: !storageAvailable || !!saveError,
    message: !storageAvailable
      ? '本地存储不可用（隐私模式或浏览器限制）：这次记录只保留在当前页面，刷新后会丢失。'
      : saveError ? `写入本地失败：${saveError}。这次记录只保留在当前页面，请先导出备份。` : '',
  }), [saveError, storageAvailable])

  return {
    state, entries, all, marked, today, warnings, persistence,
    add, update, remove, clear, replaceAll, dismissWarnings,
    storageKey: CALENDAR_KEY,
    empty: createCalendar,
  }
}

// 收藏夹（造型夹）的持久化 hook。
//
// 为什么放在 App 层而不是 ShareBar 组件里：
//   备份导入/重置改的是 localStorage，而组件私有 state 读不到这次变化。
//   导入之后只要再点一次「收藏这套」，就会用导入前的旧数组写回，
//   把刚导入的收藏整套覆盖掉（实测可复现）。抬到 App 层后，
//   syncFromStorage 能拿到 reload() 显式重读，ShareBar 只负责渲染与交互。

import { useCallback, useEffect, useRef, useState } from 'react'
import { LOOKS_KEY, appendLook, isValidLookList, removeLook } from '../data/looks.js'

function readLooks() {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(LOOKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // 校验不通过就回退空列表：宁可丢收藏，也不能让渲染对 undefined 取字段。
    if (!isValidLookList(parsed)) {
      console.warn('[useLooks] 收藏数据不合法，已回退为空列表（原数据保留在 localStorage）')
      return []
    }
    return parsed
  } catch (error) {
    console.warn('[useLooks] 读取收藏失败，回退为空列表：', error)
    return []
  }
}

function writeLooks(list) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOOKS_KEY, JSON.stringify(list))
  } catch (error) {
    // 超配额 / 隐私模式：降级为「本次会话内存态」，不影响页面使用。
    console.warn('[useLooks] 写入收藏失败，本次仅在内存中保留：', error)
  }
}

export function useLooks() {
  const [looks, setLooks] = useState(readLooks)
  // 首帧不回写：否则「读到损坏数据 → 回退空列表 → 立刻写回 []」会把用户残骸洗掉。
  const mountedRef = useRef(false)
  // 同步镜像最新列表：addLook 需要「当前列表」来算编号与返回值，而 state 是异步的。
  // 用闭包里的 looks 会出两个问题：连续收藏两次时第二次仍按旧长度编号（出现两个「造型 1」），
  // 且返回的 entry 与真正插入的那一条不是同一个对象。
  const looksRef = useRef(looks)

  useEffect(() => {
    looksRef.current = looks
  }, [looks])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    writeLooks(looks)
  }, [looks])

  const addLook = useCallback((outfit) => {
    const next = appendLook(looksRef.current, outfit)
    // 立即写镜像，不等 effect：同一帧内连续调用两次也要基于新的列表编号。
    looksRef.current = next
    setLooks(next)
    return next[0] || null
  }, [])

  const deleteLook = useCallback((id) => {
    setLooks((prev) => removeLook(prev, id))
  }, [])

  /** 导入 / 重置之后从 localStorage 重新读盘（与 wardrobe/daily/calendar 的 replaceAll 对齐）。 */
  const reload = useCallback(() => {
    const next = readLooks()
    looksRef.current = next
    setLooks(next)
  }, [])

  /** 直接替换整个列表（删单品后清理孤儿引用用）。 */
  const replaceAll = useCallback((next) => {
    const value = Array.isArray(next) ? next : []
    looksRef.current = value
    setLooks(value)
  }, [])

  return { looks, addLook, deleteLook, reload, replaceAll, storageKey: LOOKS_KEY }
}

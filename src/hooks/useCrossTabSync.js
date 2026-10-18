// 跨标签页同步：监听 `storage` 事件，让另一个标签页的改动在本页生效。
//
// 为什么需要：本应用把全部用户数据存在 localStorage 里，用户很可能同时开着两个
// 标签页（一个查资料、一个调造型）。没有同步时，后写的一方会把先写的一方**静默覆盖**——
// 例如 A 页记了一条日历、B 页随后改了衣橱，B 的整块衣橱写入会连带把日历写回旧值
// （因为两个 hook 各自持有自己的 state 快照）。
//
// `storage` 事件只在**其它**标签页写入时触发（本页写入不会触发自己），
// 正好是我们要的语义：外部变更 → 本页重读。
//
// 不做的事：不在这里解析具体数据结构——各 hook 自己知道怎么把原始字符串变成 state，
// 本模块只负责「哪个 key 变了 → 通知对应的 reload 回调」。

import { useEffect, useRef } from 'react'

/**
 * @param {Record<string, () => void>} handlers
 *        key → 该 key 被其它标签页改动时要执行的回调（通常是「从 storage 重读」）。
 *        传 null / 空对象即不监听。
 */
export function useCrossTabSync(handlers) {
  // 用 ref 存回调：handlers 通常是内联对象字面量，每次渲染都是新引用，
  // 直接放进 effect 依赖会导致每次渲染都解绑重绑事件。
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
    // 没有任何回调时不必挂监听（例如只有主题同步被关掉的场景）。
    if (!handlersRef.current || Object.keys(handlersRef.current).length === 0) return undefined

    const onStorage = (event) => {
      // key 为 null 表示 storage.clear()，此时所有 key 都变了，全部重读。
      const map = handlersRef.current || {}
      if (event.key === null) {
        for (const fn of Object.values(map)) {
          try {
            fn()
          } catch (error) {
            console.warn('[crossTab] 同步失败（clear）：', error)
          }
        }
        return
      }
      const fn = map[event.key]
      if (typeof fn !== 'function') return
      try {
        fn()
      } catch (error) {
        console.warn(`[crossTab] 同步 "${event.key}" 失败：`, error)
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}

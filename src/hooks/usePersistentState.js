// 与 useState 同签名的持久化 state。
// 契约见 docs/CONTRACT.md 2.6：localStorage 不可用（隐私模式 / 沙箱 / 无 window）
// 或数据损坏时，静默回退到 initialValue，绝不抛异常、绝不阻断渲染。

import { useEffect, useRef, useState } from 'react'

// 直接访问 window.localStorage 本身就可能抛（沙箱 / 无 window），所以每次读写都在 try 里取。
// 不缓存 storage 对象：Safari 隐私模式下 localStorage 存在但 setItem 会抛，
// 必须靠真实读写的 try/catch 覆盖，而不是靠一次性探测。
function getStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage || null
}

function readRaw(key) {
  try {
    const storage = getStorage()
    if (!storage) return null
    return storage.getItem(key)
  } catch (e) {
    console.warn(`[usePersistentState] 读取 "${key}" 失败，回退到初始值：`, e)
    return null
  }
}

function writeRaw(key, raw) {
  try {
    const storage = getStorage()
    if (!storage) return false
    storage.setItem(key, raw)
    return true
  } catch (e) {
    // 超配额 / 隐私模式（Safari 的 QuotaExceededError）——降级为「本次会话内存态」。
    console.warn(`[usePersistentState] 写入 "${key}" 失败，本次仅在内存中保留：`, e)
    return false
  }
}

/**
 * 读取结果带上 corrupt 标记。
 * corrupt 为 true 表示原值解析失败或未通过校验：此时**绝不能用初始值覆盖它**，
 * 否则用户遇到一次数据损坏（写入中断、手工编辑、磁盘满）就永久失去抢救机会。
 */
function readValue(key, initialValue, deserialize, validate) {
  const raw = readRaw(key)
  if (raw === null || raw === undefined) return { value: initialValue, corrupt: false }
  let parsed
  try {
    parsed = deserialize(raw)
  } catch (e) {
    console.warn(`[usePersistentState] "${key}" 数据损坏，本次使用初始值（原值已保留）：`, e)
    return { value: initialValue, corrupt: true }
  }
  if (parsed === undefined || parsed === null) return { value: initialValue, corrupt: true }
  if (typeof validate === 'function') {
    try {
      if (!validate(parsed)) {
        console.warn(`[usePersistentState] "${key}" 未通过校验，本次使用初始值（原值已保留）`)
        return { value: initialValue, corrupt: true }
      }
    } catch (e) {
      console.warn(`[usePersistentState] "${key}" 校验回调抛错，本次使用初始值（原值已保留）：`, e)
      return { value: initialValue, corrupt: true }
    }
  }
  return { value: parsed, corrupt: false }
}

/** 把可疑原值另存一份，供用户手动抢救；备份失败不影响主流程。 */
function backupCorrupt(key) {
  try {
    const storage = getStorage()
    if (!storage) return
    const raw = storage.getItem(key)
    if (raw === null || raw === undefined) return
    const backupKey = `${key}:corrupt:${Date.now()}`
    storage.setItem(backupKey, raw)
    console.warn(`[usePersistentState] "${key}" 的原始内容已备份到 "${backupKey}"，可手动检查或恢复`)
  } catch (e) {
    console.warn(`[usePersistentState] 备份 "${key}" 的损坏数据失败：`, e)
  }
}

/**
 * @param {string} key 完整 key（约定 'stylelab:' 前缀）
 * @param {unknown} initialValue localStorage 不可用或数据非法时的回退值
 * @param {{serialize?:(v:unknown)=>string, deserialize?:(s:string)=>unknown, validate?:(v:unknown)=>boolean}} [options]
 * @returns {[unknown, (next:unknown|((prev:unknown)=>unknown))=>void]} 与 useState 一致的 [value, setValue]
 */
export function usePersistentState(key, initialValue, options) {
  const { serialize = JSON.stringify, deserialize = JSON.parse, validate } = options || {}

  // 只在首次渲染读一次，且整个读取过程都有 try/catch —— 初始化失败也不会让组件抛。
  const initialRef = useRef(null)
  if (initialRef.current === null) {
    try {
      initialRef.current = readValue(key, initialValue, deserialize, validate)
    } catch (e) {
      console.warn(`[usePersistentState] "${key}" 初始化失败，使用初始值：`, e)
      initialRef.current = { value: initialValue, corrupt: false }
    }
  }

  const [value, setValue] = useState(() => initialRef.current.value)

  // options 通常是内联字面量，每次渲染都是新对象；用 ref 取当次最新值，
  // 避免它成为 effect 依赖导致每次都重写 localStorage。
  const ioRef = useRef({ serialize, validate })
  ioRef.current = { serialize, validate }

  // 首帧把可疑原值另存一份（之后无论怎么写都不会丢原件）。
  const corruptRef = useRef(initialRef.current.corrupt)
  useEffect(() => {
    if (!corruptRef.current) return
    backupCorrupt(key)
    corruptRef.current = false
  }, [key])

  // dirty：只有用户真的改过值才落盘。
  // 为什么必须这样：首帧无条件写回会把「解析失败 → 回退 initialValue」的结果
  // 立刻覆盖到磁盘上，等于应用亲手把用户损坏的数据擦成初始值——损坏本来还有救。
  const dirtyRef = useRef(false)
  const trackedSetRef = useRef(null)
  if (trackedSetRef.current === null) {
    // 转发给真正的 setState，同时打上 dirty 标记。函数式更新原样透传。
    trackedSetRef.current = (next) => {
      dirtyRef.current = true
      setValue(next)
    }
  }

  useEffect(() => {
    if (!dirtyRef.current) return
    const { serialize: ser, validate: val } = ioRef.current
    if (typeof val === 'function') {
      try {
        if (!val(value)) {
          console.warn(`[usePersistentState] 拒绝写入未通过校验的 "${key}"`)
          return
        }
      } catch (e) {
        console.warn(`[usePersistentState] 写入前校验抛错，跳过本次写入：`, e)
        return
      }
    }
    try {
      writeRaw(key, ser(value))
    } catch (e) {
      // 序列化本身抛错（循环引用等）：只退化为内存态，不要把渲染带崩。
      console.warn(`[usePersistentState] 序列化 "${key}" 失败，本次仅在内存中保留：`, e)
    }
  }, [key, value])

  return [value, trackedSetRef.current]
}

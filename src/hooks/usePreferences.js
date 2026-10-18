// 偏好状态 hook（PHASE1-CONTRACT §4）。
// 存储复用 src/hooks/usePersistentState：localStorage 不可用 / 数据损坏 / 无 window
// 时它已降级为初始化值 + 内存态，因此本 hook 不需要再包一层 try。
//
// 所有变更都走 preferences.js 的纯函数，本文件只负责"读一次 + 写回去"。

import { useCallback, useMemo } from 'react'
import { usePersistentState } from './usePersistentState.js'
import {
  PREFERENCES_KEY,
  applyFeedback,
  buildItemLookup,
  createEmptyPreferences,
  isEmptyPreferences,
  isValidPreferences,
  preferenceDeltaOf,
  resetPreferences,
  sanitizePreferences,
  summarizePreferences,
} from '../data/preferences.js'

/**
 * @param {unknown[]} [personalItems] 个人衣橱单品数组（来自 useWardrobe）。
 *        传入后，个人单品的颜色/正式度才能参与偏好权重；不传则只用系统目录。
 */
export function usePreferences(personalItems) {
  const [raw, setRaw] = usePersistentState(PREFERENCES_KEY, createEmptyPreferences(), {
    validate: isValidPreferences,
  })

  // 存档可能来自旧版本或被手改：进入内存前统一归一，避免下游到处判空。
  const preferences = useMemo(() => sanitizePreferences(raw), [raw])

  // 合并查表：系统目录 + 个人单品。个人单品数组变化时才重建。
  const items = useMemo(() => buildItemLookup(personalItems), [personalItems])

  const summary = useMemo(() => summarizePreferences(preferences, items), [preferences, items])

  const isEmpty = useMemo(() => isEmptyPreferences(preferences), [preferences])

  /** 记录一次 like / dislike / worn。reasons 为 FEEDBACK_REASONS 的 value 数组。 */
  const recordFeedback = useCallback(
    ({ kind, outfit, reasons } = {}) => {
      setRaw((current) => applyFeedback(sanitizePreferences(current), { kind, outfit, reasons, items }))
    },
    [items, setRaw],
  )

  /** 某套造型的最终排序修正（夹在 [-10,10]），UI 可直接显示。 */
  const deltaOf = useCallback(
    (outfit) => preferenceDeltaOf(outfit, preferences, items),
    [items, preferences],
  )

  /** 契约 §4：重置。清空全部反馈与权重。 */
  const reset = useCallback(() => setRaw(resetPreferences()), [setRaw])

  // 固定返回对象引用：每次新建字面量会让下游 memo 全部失效（同 useWardrobe 的问题）。
  return useMemo(
    () => ({ preferences, summary, isEmpty, items, recordFeedback, deltaOf, reset }),
    [preferences, summary, isEmpty, items, recordFeedback, deltaOf, reset],
  )
}

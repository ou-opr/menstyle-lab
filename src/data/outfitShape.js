// 造型形状的唯一事实来源（outfit shape，单一实现）。
//
// 背景：`outfitItemIds` / `normalizeOutfit` 曾在 calendar.js 与 preferences.js 各有一份，
// 且**语义不同**——preferences 版显式排除 `o-none`，calendar 版没有，于是「不穿外套」
// 这个槽位哨兵被当成一件真实单品混进了月度高频榜单。一份数据两种解读，属于契约漂移。
//
// 本文件只依赖 catalog，不依赖 storage / React，可被 Node 直接 import。
// calendar.js 与 preferences.js 都从这里取，避免再次分叉。

import { findItem } from './catalog.js'

/** 造型的五个槽位，顺序即 UI 与去重键的顺序。 */
export const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']

/** 「没有外套」的哨兵 id：占住 outer 槽位，但不是一件真实单品。 */
export const NO_OUTER = 'o-none'

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v : '')
const asArray = (v) => (Array.isArray(v) ? v : [])

/** outer 槽位是否表示「不穿外套」（空、缺失、o-none 三种写法都算）。 */
export function isNoOuter(id) {
  return !id || id === NO_OUTER
}

/**
 * 造型里出现的**真实单品** id（含配饰、去重、跳过空槽位、排除 o-none）。
 * @param {unknown} outfit
 * @returns {string[]}
 */
export function outfitItemIds(outfit) {
  if (!isPlainObject(outfit)) return []
  const ids = []
  const push = (id) => {
    if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id)
  }
  for (const slot of SLOTS) {
    const value = outfit[slot]
    if (slot === 'accs') {
      for (const id of asArray(value)) push(id)
      continue
    }
    // o-none 是「没有这件」的哨兵，不是单品：统计穿着次数、算颜色、算高频都不该带上它。
    if (slot === 'outer' && isNoOuter(value)) continue
    push(value)
  }
  return ids
}

/**
 * 解析单品 id：系统目录 id 走 catalog，个人单品 id（u-）当未知件保留。
 * 其余情况返回 null，由调用方记 warning 并丢弃。
 */
export function resolveItem(id) {
  if (typeof id !== 'string' || !id) return null
  if (id.startsWith('u-')) return { id, name: id, personal: true }
  const found = findItem(id)
  if (found) return { id, name: found.name, personal: false, item: found }
  return null
}

/**
 * 造型的存储归一形态：五个槽位固定存在，accs 恒为数组，outer 缺省为 o-none。
 * 只做「形状」归一，不校验 id 是否存在于目录（那是各模块自己的 warnings 职责）。
 */
export function normalizeOutfitShape(outfit) {
  const source = isPlainObject(outfit) ? outfit : {}
  return {
    top: str(source.top) || null,
    outer: str(source.outer) || NO_OUTER,
    bottom: str(source.bottom) || null,
    shoes: str(source.shoes) || null,
    accs: asArray(source.accs).filter((id) => typeof id === 'string' && id.length > 0),
  }
}

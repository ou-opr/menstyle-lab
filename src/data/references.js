// 引用清理：删掉一件个人单品后，把日历 / 收藏夹里指向它的残留引用清掉。
//
// 为什么需要：日历条目与收藏造型只存单品 id。个人单品被删之后，这些 id 就成了
// 没有归属的孤儿——UI 会直接把原始 UUID 显示给用户（`findItem(id)?.name || id`），
// 月度统计也会把它当成一个「存在但查不到」的单品继续计数。
//
// 纯函数、不依赖 React / storage，可被 Node 直接测试。

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const asArray = (v) => (Array.isArray(v) ? v : [])

/** 一套造型里是否有该 id（含配饰）。 */
export function outfitReferences(outfit, id) {
  if (!isPlainObject(outfit) || typeof id !== 'string' || !id) return false
  if (outfit.top === id || outfit.outer === id || outfit.bottom === id || outfit.shoes === id) return true
  return asArray(outfit.accs).includes(id)
}

/**
 * 从一套造型里摘掉某个 id（槽位置空 / 配饰从数组剔除）。
 * 不修改入参；没有引用时原样返回（保持引用相等，方便调用方判断有无变化）。
 */
export function stripIdFromOutfit(outfit, id) {
  if (!outfitReferences(outfit, id)) return outfit
  const next = { ...outfit }
  for (const slot of ['top', 'outer', 'bottom', 'shoes']) {
    if (next[slot] === id) next[slot] = slot === 'outer' ? 'o-none' : null
  }
  if (Array.isArray(next.accs) && next.accs.includes(id)) next.accs = next.accs.filter((a) => a !== id)
  return next
}

/**
 * 清理日历状态里对某个 id 的引用。
 * @returns {{state:object, changed:number}} changed 为被改动的条目数
 */
export function pruneCalendarRef(state, id) {
  if (!isPlainObject(state) || !Array.isArray(state.entries)) return { state, changed: 0 }
  let changed = 0
  const entries = state.entries.map((entry) => {
    if (!isPlainObject(entry) || !outfitReferences(entry.outfit, id)) return entry
    changed++
    return { ...entry, outfit: stripIdFromOutfit(entry.outfit, id) }
  })
  if (changed === 0) return { state, changed: 0 }
  return { state: { ...state, entries }, changed }
}

/**
 * 清理收藏夹里对某个 id 的引用（收藏项形状是 { id, name, ts, outfit }）。
 * @returns {{looks:object[], changed:number}}
 */
export function pruneLooksRef(looks, id) {
  if (!Array.isArray(looks)) return { looks, changed: 0 }
  let changed = 0
  const next = looks.map((look) => {
    if (!isPlainObject(look) || !outfitReferences(look.outfit, id)) return look
    changed++
    return { ...look, outfit: stripIdFromOutfit(look.outfit, id) }
  })
  if (changed === 0) return { looks, changed: 0 }
  return { looks: next, changed }
}

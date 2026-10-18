// 造型夹（收藏）的纯函数层：形状校验、编号、增删。
//
// 为什么要独立成模块：收藏列表原先只存在于 ShareBar 组件内部的 state 里，
// 而备份导入是「改 localStorage」，组件私有 state 读不到这次变化，
// 于是导入之后只要再点一次「收藏这套」，就会用导入前的旧数组覆盖回去，
// 刚导入的收藏整套消失。把数据与读写抬到 App 层之后，导入流程可以显式重读。

export const LOOKS_KEY = 'stylelab:looks'
export const MAX_LOOKS = 30

/** 一套造型的最小合法形状（top/outer/bottom/shoes 为字符串，accs 为字符串数组）。 */
export const isOutfit = (v) =>
  !!v && typeof v === 'object' &&
  typeof v.top === 'string' && typeof v.outer === 'string' &&
  typeof v.bottom === 'string' && typeof v.shoes === 'string' &&
  Array.isArray(v.accs) && v.accs.every((a) => typeof a === 'string')

export const cloneOutfit = (o) => ({ ...o, accs: Array.isArray(o?.accs) ? [...o.accs] : [] })

/** 两套造型是不是同一套。配饰按排序后的集合比较，顺序不同不算不同套。 */
export const sameSlots = (a, b) => {
  if (!isOutfit(a) || !isOutfit(b)) return false
  if (a.top !== b.top || a.outer !== b.outer || a.bottom !== b.bottom || a.shoes !== b.shoes) return false
  const left = [...a.accs].sort()
  const right = [...b.accs].sort()
  return left.length === right.length && left.every((id, i) => id === right[i])
}

/**
 * 收藏列表的校验回调：localStorage 里可能是任何东西（手改、旧版本、损坏），
 * 不合法就整体回退到 []，避免渲染时对 undefined 取字段。
 */
export const isValidLookList = (v) =>
  Array.isArray(v) && v.every((l) => !!l && typeof l === 'object' && isOutfit(l.outfit))

/** 按已有的「造型 N」最大编号递增，删掉中间几套后新收藏不会重名。 */
export function nextLookNumber(list) {
  const rows = Array.isArray(list) ? list : []
  let max = 0
  rows.forEach((l) => {
    const m = /^造型\s*(\d+)$/.exec(typeof l?.name === 'string' ? l.name : '')
    if (m) max = Math.max(max, Number(m[1]))
  })
  return Math.max(max + 1, rows.length + 1)
}

/**
 * 追加一套收藏到列表头部（纯函数，不修改入参）。
 * @returns {object[]} 新列表，长度不超过 MAX_LOOKS
 */
export function appendLook(list, outfit, now = Date.now(), random = Math.random) {
  const rows = Array.isArray(list) ? list : []
  const entry = {
    id: `look-${now}-${String(Math.round(random() * 1e6)).padStart(6, '0')}`,
    name: `造型 ${nextLookNumber(rows)}`,
    ts: now,
    outfit: cloneOutfit(outfit),
  }
  return [entry, ...rows].slice(0, MAX_LOOKS)
}

/** 删除一套收藏（纯函数，不修改入参）。 */
export function removeLook(list, id) {
  const rows = Array.isArray(list) ? list : []
  return rows.filter((l) => l?.id !== id)
}

/** 格式化收藏时间：YYYY-MM-DD HH:mm（本地时区）。 */
export function formatLookTs(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

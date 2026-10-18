// 分享编解码：把当前造型压缩成一个短字符串（放进 URL hash 分享给别人），
// 以及把造型转成可复制到微信/朋友圈的中文文案。契约见 docs/CONTRACT.md 2.5。
// 本文件是纯 ESM（不引用 document / window / React），可被 Node 直接 import。

import * as catalog from './catalog.js'

export const SHARE_VERSION = 1

const { TOPS, OUTERS, BOTTOMS, SHOES, ACCS } = catalog

// 契约 2.1 规定 catalog.js 必须导出 ITEMS = [...TOPS, ...OUTERS, ...BOTTOMS, ...SHOES, ...ACCS]。
// 这里用命名空间导入而不是具名导入 `import { ITEMS }`：具名导入一个当前不存在的导出
// 会在 ESM 链接阶段直接抛 SyntaxError，try/catch 兜不住；命名空间导入则允许在 ITEMS
// 尚未落地时（T1 并行开发期）安全回退到契约里的同一份拼接定义。
const ITEMS = Array.isArray(catalog.ITEMS)
  ? catalog.ITEMS
  : [...TOPS, ...OUTERS, ...BOTTOMS, ...SHOES, ...ACCS]

// base64url 字符表 A-Za-z0-9-_，共 64 个：URL-safe，且不含 '#' / '&' / '='，
// 不会被 atob / btoa 或 URL hash 解析拒掉。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// 末位留作「无 / 非法」哨兵，正文索引只用 0..62（当前 59 件单品，留 4 个余量）。
const MAX_INDEX = ALPHABET.length - 2
const SENTINEL = ALPHABET[ALPHABET.length - 1]

const PREFIX = `v${SHARE_VERSION}`

// id -> 序号 / 序号 -> id 两张表，都从 ITEMS 的数组顺序派生（不硬编码任何序号）。
// 契约第 3 节「新 id 只增不改」：T1 追加单品时已有 id 的序号保持不变，旧链接仍能解出。
const ID_TO_INDEX = new Map()
const INDEX_TO_ID = []
ITEMS.forEach((item, i) => {
  if (!item || typeof item.id !== 'string') return
  if (!ID_TO_INDEX.has(item.id)) ID_TO_INDEX.set(item.id, i)
  INDEX_TO_ID[i] = item.id
})

const byId = (list, id) => list.find((x) => x.id === id)

const indexChar = (id) => {
  const i = ID_TO_INDEX.get(id)
  if (typeof i !== 'number' || i > MAX_INDEX) return SENTINEL
  return ALPHABET[i]
}

const decodeIndex = (ch) => {
  const i = ALPHABET.indexOf(ch)
  if (i < 0 || i > MAX_INDEX) return null
  const id = INDEX_TO_ID[i]
  return typeof id === 'string' ? id : null
}

/**
 * 把 outfit 编码成一个短字符串（URL-safe，无 '#' / '&' / '='，长度 < 120）。
 * 形状：v1 + 上装 + 外套 + 下装 + 鞋履 + 配饰数 + 各配饰。
 * 未知 / 缺失的 id 写成哨兵字符，解码时会因此返回 null（编码本身不抛异常）。
 * @param {{top?:string, outer?:string, bottom?:string, shoes?:string, accs?:string[]}} outfit
 * @returns {string}
 */
export function encodeOutfit(outfit) {
  const o = outfit && typeof outfit === 'object' ? outfit : {}
  const rawAccs = Array.isArray(o.accs) ? o.accs : []
  const accs = [...new Set(rawAccs)].filter((a) => ID_TO_INDEX.has(a)).slice(0, MAX_INDEX)
  const body = indexChar(o.top) + indexChar(o.outer) + indexChar(o.bottom) + indexChar(o.shoes)
  const count = ALPHABET[accs.length]
  return PREFIX + body + count + accs.map((a) => ALPHABET[ID_TO_INDEX.get(a)]).join('')
}

/**
 * 这套造型能不能生成一条「对方打开还能还原」的链接。
 * 编码用的是系统目录里的下标，个人衣橱单品（u- 开头）没有下标，
 * 编出来只会是一条解码即失效的死链——所以先问这里，别让用户把死链发出去。
 * @param {{top?:string, outer?:string, bottom?:string, shoes?:string, accs?:string[]}} outfit
 * @returns {boolean}
 */
export function canEncodeOutfit(outfit) {
  const o = outfit && typeof outfit === 'object' ? outfit : {}
  const accs = Array.isArray(o.accs) ? o.accs : []
  const slots = [o.top, o.outer, o.bottom, o.shoes]
  return slots.every((id) => ID_TO_INDEX.has(id)) && accs.every((a) => ID_TO_INDEX.has(a))
}

/**
 * 解码 encodeOutfit 的产物。任何非法输入（null / undefined / 非字符串 / 空串 / 乱码 /
 * 版本不符 / 长度不符 / 引用了不存在的 id / 槽位分类错位）一律返回 null，绝不抛异常。
 * @param {unknown} str
 * @returns {{top:string, outer:string, bottom:string, shoes:string, accs:string[]}|null}
 */
export function decodeOutfit(str) {
  try {
    if (typeof str !== 'string') return null
    const s = str.trim()
    if (s.length > 200) return null
    if (!s.startsWith(PREFIX)) return null
    const body = s.slice(PREFIX.length)
    if (body.length < 5) return null

    const countIndex = ALPHABET.indexOf(body[4])
    if (countIndex < 0 || countIndex > MAX_INDEX) return null
    if (body.length !== 5 + countIndex) return null

    const top = decodeIndex(body[0])
    const outer = decodeIndex(body[1])
    const bottom = decodeIndex(body[2])
    const shoes = decodeIndex(body[3])

    const accs = []
    for (let i = 5; i < body.length; i++) {
      const id = decodeIndex(body[i])
      if (!id) return null
      if (!accs.includes(id)) accs.push(id)
    }

    // 语义校验：每个槽位必须落在正确的分类里，否则视为「合法编码但语义非法」。
    if (!byId(TOPS, top)) return null
    if (!byId(OUTERS, outer)) return null
    if (!byId(BOTTOMS, bottom)) return null
    if (!byId(SHOES, shoes)) return null
    for (const a of accs) if (!byId(ACCS, a)) return null

    return { top, outer, bottom, shoes, accs }
  } catch (e) {
    console.warn('[share] decodeOutfit 失败，按非法输入处理：', e)
    return null
  }
}

const UNKNOWN = '未知单品'

// 单个槽位的文案：单品名 + 色值提示。o-none / 全透明色不显示色值（对读者无意义）。
const slotText = (list, id) => {
  const item = byId(list, id)
  if (!item) return UNKNOWN
  const hex = typeof item.hex === 'string' ? item.hex : ''
  const meaningful = hex && !/^#0{8}$/i.test(hex) && !/^#0{6}$/i.test(hex)
  return meaningful ? `${item.name} (${hex})` : item.name
}

/**
 * 转成可复制到微信/朋友圈的多行中文文案。
 * @param {{top?:string, outer?:string, bottom?:string, shoes?:string, accs?:string[]}} outfit
 * @returns {string}
 */
export function outfitToText(outfit) {
  const o = outfit && typeof outfit === 'object' ? outfit : {}
  const rawAccs = Array.isArray(o.accs) ? o.accs : []
  const accNames = rawAccs.map((a) => byId(ACCS, a)?.name || UNKNOWN)
  return [
    '【型格 STYLE LAB】我的造型',
    `上装：${slotText(TOPS, o.top)}`,
    `外套：${slotText(OUTERS, o.outer)}`,
    `下装：${slotText(BOTTOMS, o.bottom)}`,
    `鞋履：${slotText(SHOES, o.shoes)}`,
    `配饰：${accNames.length ? accNames.join(' / ') : '无'}`,
  ].join('\n')
}

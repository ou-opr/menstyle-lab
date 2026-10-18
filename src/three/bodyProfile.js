// 体型参数 → 3D 模特比例（PHASE3-CONTRACT §1B）。
//
// 立场说明：这一层只做**整身等比缩放**，不改骨架、不做部位形变。
// 因为衣服是按固定骨架摆放的独立网格，只缩放躯干会让衣服穿帮；
// 整身缩放则身体和衣服一起变，视觉上仍然自洽。
// 因此体型差异靠宽/深两个方向表达（偏瘦更窄更薄、微胖更宽更厚、
// 健壮则「宽大于厚」），而不是靠肩线或腰线位移——那是下一步要改骨架才能做的。
//
// 纯函数，不依赖 window/document，可在 Node 下直接 import 做断言。

export const BODY_BASELINE_HEIGHT = 175
export const HEIGHT_MIN = 150
export const HEIGHT_MAX = 205
export const DEFAULT_HEIGHT = BODY_BASELINE_HEIGHT
export const DEFAULT_BODY = 'standard'

/** 与 src/data/recommendations.js 的 PROFILE_OPTIONS.bodies 保持同一套键。 */
export const BODY_SHAPES = {
  slim: { label: '偏瘦', width: 0.93, depth: 0.92 },
  standard: { label: '匀称', width: 1, depth: 1 },
  athletic: { label: '健壮 / 肩宽', width: 1.08, depth: 1.02 },
  plump: { label: '微胖', width: 1.14, depth: 1.16 },
}

export const BODY_KEYS = Object.keys(BODY_SHAPES)

const IDENTITY = {
  ok: true,
  height: BODY_BASELINE_HEIGHT,
  body: DEFAULT_BODY,
  label: BODY_SHAPES[DEFAULT_BODY].label,
  baseline: BODY_BASELINE_HEIGHT,
  y: 1,
  width: 1,
  depth: 1,
  scale: [1, 1, 1],
  defaulted: true,
  warnings: [],
}

/**
 * 把用户填的身高/体型收敛成合法值。非数字、超范围一律夹取，
 * 未知体型回落到匀称——但要把「我替你改了」记进 warnings，不静默。
 * @param {{height?:unknown, body?:unknown}} profile
 * @returns {{height:number, body:string, adjusted:boolean, warnings:string[]}}
 */
export function normalizeProfile(profile) {
  const warnings = []
  const raw = profile && typeof profile === 'object' ? profile : {}
  let adjusted = false

  const rawHeight = typeof raw.height === 'number' ? raw.height : Number.parseFloat(raw.height)
  let height = Number.isFinite(rawHeight) ? Math.round(rawHeight) : DEFAULT_HEIGHT
  if (!Number.isFinite(rawHeight)) {
    if (raw.height !== undefined) warnings.push('身高不是数字，已按 ' + DEFAULT_HEIGHT + 'cm 处理')
    adjusted = raw.height !== undefined
  } else if (height < HEIGHT_MIN || height > HEIGHT_MAX) {
    const clamped = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, height))
    warnings.push('身高 ' + height + 'cm 超出 ' + HEIGHT_MIN + '–' + HEIGHT_MAX + 'cm，已按 ' + clamped + 'cm 处理')
    height = clamped
    adjusted = true
  }

  let body = typeof raw.body === 'string' ? raw.body : DEFAULT_BODY
  if (!BODY_SHAPES[body]) {
    if (raw.body !== undefined) warnings.push('未知体型「' + String(raw.body) + '」，已按匀称处理')
    body = DEFAULT_BODY
    adjusted = true
  }

  return { height, body, adjusted, warnings }
}

/**
 * @param {{height?:number, body?:string}|null|undefined} profile
 * @returns {{
 *   ok:boolean, height:number, body:string, label:string, baseline:number,
 *   y:number, width:number, depth:number, scale:[number,number,number],
 *   defaulted:boolean, warnings:string[]
 * }}
 *   y/width/depth 是相对基准身材（175cm 匀称）的倍数；scale 直接喂给 <group scale>。
 *   defaulted 为 true 表示输入缺失或非法、结果等同基准身材。
 */
export function bodyTransform(profile) {
  if (!profile || typeof profile !== 'object') return { ...IDENTITY, scale: [...IDENTITY.scale], warnings: [] }

  const { height, body, warnings } = normalizeProfile(profile)
  const shape = BODY_SHAPES[body]
  const y = height / BODY_BASELINE_HEIGHT
  const defaulted = height === DEFAULT_HEIGHT && body === DEFAULT_BODY

  return {
    ok: true,
    height,
    body,
    label: shape.label,
    baseline: BODY_BASELINE_HEIGHT,
    y,
    width: shape.width,
    depth: shape.depth,
    scale: [shape.width, y, shape.depth],
    defaulted,
    warnings,
  }
}

/** 界面上的一句话描述，例如「175cm · 匀称」。 */
export function describeBodyProfile(profile) {
  const transform = bodyTransform(profile)
  return transform.height + 'cm · ' + transform.label
}

/** 相机注视点的高度：模特变高时视线跟着抬高，否则高个子会被裁掉头顶。 */
export function cameraTargetFor(transform, baseTargetY = 0.95) {
  const y = transform && Number.isFinite(transform.y) ? transform.y : 1
  return [0, baseTargetY * y, 0]
}

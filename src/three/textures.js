import * as THREE from 'three'
import cottonDiffUrl from '../assets/textures/pbr/cotton_diff.webp'
import cottonNorUrl from '../assets/textures/pbr/cotton_nor.webp'
import cottonRoughUrl from '../assets/textures/pbr/cotton_rough.webp'
import denimDiffUrl from '../assets/textures/pbr/denim_diff.webp'
import denimNorUrl from '../assets/textures/pbr/denim_nor.webp'
import denimRoughUrl from '../assets/textures/pbr/denim_rough.webp'
import fleeceDiffUrl from '../assets/textures/pbr/fleece_diff.webp'
import fleeceNorUrl from '../assets/textures/pbr/fleece_nor.webp'
import fleeceRoughUrl from '../assets/textures/pbr/fleece_rough.webp'
import jerseyDiffUrl from '../assets/textures/pbr/jersey_diff.webp'
import jerseyNorUrl from '../assets/textures/pbr/jersey_nor.webp'
import jerseyRoughUrl from '../assets/textures/pbr/jersey_rough.webp'
import leatherDiffUrl from '../assets/textures/pbr/leather_diff.webp'
import leatherNorUrl from '../assets/textures/pbr/leather_nor.webp'
import leatherRoughUrl from '../assets/textures/pbr/leather_rough.webp'
import oxfordDiffUrl from '../assets/textures/pbr/oxford_diff.webp'
import oxfordNorUrl from '../assets/textures/pbr/oxford_nor.webp'
import oxfordRoughUrl from '../assets/textures/pbr/oxford_rough.webp'
import twillDiffUrl from '../assets/textures/pbr/twill_diff.webp'
import twillNorUrl from '../assets/textures/pbr/twill_nor.webp'
import twillRoughUrl from '../assets/textures/pbr/twill_rough.webp'
import woolknitDiffUrl from '../assets/textures/pbr/woolknit_diff.webp'
import woolknitNorUrl from '../assets/textures/pbr/woolknit_nor.webp'
import woolknitRoughUrl from '../assets/textures/pbr/woolknit_rough.webp'

// CC0 PBR 贴图注册表（Lead 下载重编码：diff 512 q80 / nor 512 q90 OpenGL / rough 512 q80）。
// diff 已归一化为浅灰（188–255），只做明暗/纹理调制，服装颜色仍由 item.hex 控制。
// 分辨率依据实测：画布 678px、repeat=6 时每 tile 仅约 20 屏幕像素，GPU 采样深层 mip，
// 1024px 法线降采样到 512 在屏幕尺度（乃至 8 倍 texel 密度）下对比度差异 <7%。
const PBR = {
  cotton: { diff: cottonDiffUrl, nor: cottonNorUrl, rough: cottonRoughUrl },
  denim: { diff: denimDiffUrl, nor: denimNorUrl, rough: denimRoughUrl },
  fleece: { diff: fleeceDiffUrl, nor: fleeceNorUrl, rough: fleeceRoughUrl },
  jersey: { diff: jerseyDiffUrl, nor: jerseyNorUrl, rough: jerseyRoughUrl },
  leather: { diff: leatherDiffUrl, nor: leatherNorUrl, rough: leatherRoughUrl },
  oxford: { diff: oxfordDiffUrl, nor: oxfordNorUrl, rough: oxfordRoughUrl },
  twill: { diff: twillDiffUrl, nor: twillNorUrl, rough: twillRoughUrl },
  woolknit: { diff: woolknitDiffUrl, nor: woolknitNorUrl, rough: woolknitRoughUrl },
}

// camo 是唯一保留程序化 painter 的面料（pants-cargo 专用，贴图自带颜色）。
const TEXTURE_SIZE = 512

// 各向异性过滤：躯干等曲面大部分像素是斜视角，正是各向异性过滤起作用的地方。
// 取 16（本机 GPU 上限亦为 16）；three 会按 three.module.js 的
// Math.min(texture.anisotropy, capabilities.getMaxAnisotropy()) 自动收敛到设备支持值，
// 不支持该扩展时回落 1，因此无需在此自行探测。
const ANISOTROPY = 16

function makeCanvas(draw) {
  const c = document.createElement('canvas')
  c.width = c.height = TEXTURE_SIZE
  const ctx = c.getContext('2d')
  draw(ctx, TEXTURE_SIZE)
  return c
}
// 可复现随机数
function rng(seed) {
  let s = seed
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

const painters = {
  // 迷彩（工装裤专用，配合白色材质色）
  camo(ctx, S) {
    const k = S / 256
    ctx.fillStyle = '#b8bfa2'; ctx.fillRect(0, 0, S, S)
    const r = rng(33)
    const cols = ['#6d7552', '#93917a', '#4c5340', '#a8ad96']
    for (const col of cols) {
      const n = Math.round(26 * k * k)
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = col
        const x = r() * S, y = r() * S, w = (14 + r() * 34) * k, h = (10 + r() * 26) * k
        ctx.beginPath()
        ctx.ellipse(x, y, w / 2, h / 2, r() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse((x + w / 2) % S, (y + h / 2) % S, w / 3, h / 3, r() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
}

// 缓存：基础纹理按名共享；repeat 需求不同时用 clone
const cache = new Map()

// 法线贴图缓存：键含 |normal| 段，与 albedo 的 `name|rx|ry` 隔离
const normalCache = new Map()
// 粗糙度贴图缓存：键含 |rough| 段，与 albedo/法线隔离
const roughCache = new Map()
// 程序化面料的高度→法线像素数据按 name 共享：不同 repeat 的 DataTexture 各自独立，
// 但共享同一份只读像素数据（当前只有 camo 使用）
const normalDataCache = new Map()

// 法线标定（camo painter 管线保留）：目标平均坡度自标定，
// 先做箱式低通压掉取样噪点，再按高度场自身的平均梯度反推增益。
// 目视校准改 NORMAL_TARGET_SLOPE 即可（0.10~0.20 之间最像布料）。
const NORMAL_TARGET_SLOPE = 0.14
const NORMAL_SMOOTH_RADIUS = 2

function makeNormalTexture(data, S, repeatX, repeatY) {
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat)
  tex.colorSpace = THREE.NoColorSpace // 法线贴图必须是线性，绝不能设 SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.anisotropy = ANISOTROPY
  tex.needsUpdate = true
  return tex
}

// 环绕边界的可分离箱式低通（512² × 半径 2 约 2.6M 次读写），保持 RepeatWrapping 无缝
function boxBlurWrap(src, S, radius) {
  if (radius <= 0) return src.slice()
  const inv = 1 / (radius * 2 + 1)
  const tmp = new Float32Array(S * S)
  const out = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const row = y * S
    for (let x = 0; x < S; x++) {
      let sum = 0
      for (let d = -radius; d <= radius; d++) sum += src[row + ((x + d + S) % S)]
      tmp[row + x] = sum * inv
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let sum = 0
      for (let d = -radius; d <= radius; d++) sum += tmp[((y + d + S) % S) * S + x]
      out[y * S + x] = sum * inv
    }
  }
  return out
}

// 灰度高度图 → 切线空间法线（中心差分，边界环绕保证 RepeatWrapping 无缝）
// R=dx、G=dy、B=z（归一化）。增益由低通后高度场自身的平均梯度反推，
// 而非固定倍率——否则细密织纹会被烧成噪点。
function heightToNormalData(imageData, S, targetSlope = NORMAL_TARGET_SLOPE) {
  const { data } = imageData
  const raw = new Float32Array(S * S)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    raw[p] = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722
  }
  const h = boxBlurWrap(raw, S, NORMAL_SMOOTH_RADIUS)
  let gradSum = 0
  for (let y = 0; y < S; y++) {
    const rowC = y * S
    const rowU = (y === 0 ? S - 1 : y - 1) * S
    const rowD = (y === S - 1 ? 0 : y + 1) * S
    for (let x = 0; x < S; x++) {
      const xl = x === 0 ? S - 1 : x - 1
      const xr = x === S - 1 ? 0 : x + 1
      gradSum += Math.abs(h[rowC + xr] - h[rowC + xl])
      gradSum += Math.abs(h[rowD + x] - h[rowU + x])
    }
  }
  const strength = targetSlope / Math.max(1e-6, gradSum / (S * S * 2))
  const out = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    const yu = y === 0 ? S - 1 : y - 1
    const yd = y === S - 1 ? 0 : y + 1
    const rowU = yu * S
    const rowC = y * S
    const rowD = yd * S
    for (let x = 0; x < S; x++) {
      const xl = x === 0 ? S - 1 : x - 1
      const xr = x === S - 1 ? 0 : x + 1
      const dx = (h[rowC + xr] - h[rowC + xl]) * strength
      const dy = (h[rowD + x] - h[rowU + x]) * strength
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const nx = dx * inv
      const ny = dy * inv
      const nz = inv
      const p = (rowC + x) * 4
      out[p] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)))
      out[p + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)))
      out[p + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)))
      out[p + 3] = 255
    }
  }
  return out
}

// 程序化面料（camo）：复用 painter 在离屏 canvas 重绘同一图案，取灰度作为高度图再转法线
function painterNormalTexture(name, repeatX, repeatY) {
  const S = TEXTURE_SIZE
  let data = normalDataCache.get(name)
  if (!data) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    painters[name](ctx, S)
    data = heightToNormalData(ctx.getImageData(0, 0, S, S), S)
    normalDataCache.set(name, data)
  }
  return makeNormalTexture(data, S, repeatX, repeatY)
}

// ---- PBR 异步加载：先返回中性占位，加载完成后回填 tex.image + needsUpdate ----
const pbrLoader = new THREE.TextureLoader()

// albedo/roughness 的白色中性占位：乘法语义下 white(1.0) 不改变材质 base 值
function makeWhitePlaceholder() {
  const c = document.createElement('canvas')
  c.width = c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 2, 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

// 中性切线空间法线占位：(128,128,255) → (0,0,1)，加载完成前保持平坦
function makeNeutralNormalPlaceholder() {
  const c = document.createElement('canvas')
  c.width = c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#8080ff'
  ctx.fillRect(0, 0, 2, 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

function loadPBRTexture(url, { srgb, placeholder, repeatX, repeatY }) {
  placeholder.wrapS = placeholder.wrapT = THREE.RepeatWrapping
  placeholder.repeat.set(repeatX, repeatY)
  placeholder.anisotropy = ANISOTROPY
  placeholder.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  placeholder.needsUpdate = true
  pbrLoader.load(url, (loaded) => {
    placeholder.image = loaded.image
    // 必须先 dispose：占位图只有 2×2，而 three 在 WebGL2 下用不可变的 texStorage2D 一次性定容
    // （three.module.js:24904 `useTexStorage = texture.isVideoTexture !== true` → 恒为 true；
    //  :24905 `allocateMemory` 仅在 source 首次上传或换 WebGLTexture 时为 true）。
    // 同一个 texture 对象只换 image、不改 cache key，于是 512×512 的真实贴图会被
    // texSubImage2D 塞进 2×2 的既有存储里 —— WebGL 静默吞掉溢出，不报错也不抛异常，
    // 画面永远停在占位色（实测：把占位改成纯绿，构建产物上 T 恤与裤子始终是绿色）。
    // dispose 会释放这层 GPU 分配，下一次渲染才按真实尺寸重新 texStorage2D 定容。
    placeholder.dispose()
    placeholder.needsUpdate = true
  }, undefined, () => {
    // 加载失败就保留中性占位（白 / 平法线）：材质仍可渲染，只是缺少织纹细节。
  })
  return placeholder
}

export function getNormalMap(name, repeatX = 4, repeatY = 4) {
  const key = `${name}|normal|${repeatX}|${repeatY}`
  if (normalCache.has(key)) return normalCache.get(key)
  let tex = null
  const pbr = PBR[name]
  if (pbr) {
    tex = loadPBRTexture(pbr.nor, { srgb: false, placeholder: makeNeutralNormalPlaceholder(), repeatX, repeatY })
  } else if (painters[name]) {
    tex = painterNormalTexture(name, repeatX, repeatY)
  }
  if (!tex) return null
  normalCache.set(key, tex)
  return tex
}

export function getTexture(name, repeatX = 4, repeatY = 4) {
  const key = `${name}|${repeatX}|${repeatY}`
  if (cache.has(key)) return cache.get(key)
  let tex
  const pbr = PBR[name]
  if (pbr) {
    tex = loadPBRTexture(pbr.diff, { srgb: true, placeholder: makeWhitePlaceholder(), repeatX, repeatY })
  } else if (painters[name]) {
    tex = new THREE.CanvasTexture(makeCanvas(painters[name]))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatX, repeatY)
    tex.anisotropy = ANISOTROPY
  } else {
    return null
  }
  cache.set(key, tex)
  return tex
}

export function getRoughnessMap(name, repeatX = 4, repeatY = 4) {
  const key = `${name}|rough|${repeatX}|${repeatY}`
  if (roughCache.has(key)) return roughCache.get(key)
  const pbr = PBR[name]
  if (!pbr) return null
  const tex = loadPBRTexture(pbr.rough, { srgb: false, placeholder: makeWhitePlaceholder(), repeatX, repeatY })
  roughCache.set(key, tex)
  return tex
}

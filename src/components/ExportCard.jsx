// 把当前造型导出成一张 1080×1350 的 PNG 造型卡（小红书竖版比例），用原生 Canvas 2D 绘制。
// 不使用任何绘图库；导出图不参与深色主题，所以颜色在这里是固定字面量。

import { useCallback, useEffect, useRef, useState } from 'react'
import { ACCS, BOTTOMS, OUTERS, SHOES, TOPS, byId } from '../data/catalog'
import { IconImage } from './icons'
// ShareBar 也引这份样式；Vite 会去重，重复 import 是安全的。
// 单独引一次是为了让 Lead 只 import ExportCard 时按钮样式也在。
import '../styles/share.css'

// —— 为什么这里允许颜色字面量 ——
// 本组件绘制的是导出用的位图，不经过 CSS，读不到 styles.css 里的自定义属性：
// ctx.fillStyle 只认具体颜色值，`var(--ink)` 在 canvas 里是无效值（会被静默忽略并保留上一次颜色）。
// 因此卡片配色在这里以常量形式写死，并且是**刻意与深色主题解耦**的：
// 导出图要发给别人看，必须是稳定的高对比米白底 + 深墨字，不能随访问者的主题变化。
const CARD_BG = '#f6f4ef'      // 米白底
const CARD_INK = '#1b1c1e'     // 深墨主文字（对比度 ≈ 16:1）
const CARD_INK2 = '#5f6167'    // 次级文字（对比度 ≈ 5.4:1）
const CARD_ACCENT = '#b4551d'  // 品牌强调色（对比度 ≈ 4.9:1，用于 ≥20px 文字）
const CARD_LINE = '#e2ddd2'    // 细分割线
const CARD_EDGE = 'rgba(0,0,0,.10)' // 色块描边，浅色块在米白底上仍可见

const CARD_W = 1080
const CARD_H = 1350
const PAD = 72
const MAX_ACC_ROWS = 6

const FONT_STACK = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans SC", sans-serif'
const font = (weight, size) => `${weight} ${size}px ${FONT_STACK}`

// 色块 + 名字 + 一行摘要；o-none 之类的全透明色用浅底斜纹表示「没有这件」。
const isTransparent = (hex) => !hex || /^#0{8}$/i.test(hex) || /^#0{6}$/i.test(hex)

const tipOf = (item) => {
  if (!item) return ''
  return item.tip || item.note || item.ref || ''
}

function buildRows(outfit) {
  const o = outfit && typeof outfit === 'object' ? outfit : {}
  const rows = [
    { label: '上装', item: byId(TOPS, o.top) },
    { label: '外套', item: byId(OUTERS, o.outer) },
    { label: '下装', item: byId(BOTTOMS, o.bottom) },
    { label: '鞋履', item: byId(SHOES, o.shoes) },
  ]
  const accIds = Array.isArray(o.accs) ? o.accs : []
  const shown = accIds.slice(0, MAX_ACC_ROWS)
  for (const id of shown) rows.push({ label: '配饰', item: byId(ACCS, id) })
  return { rows, overflow: Math.max(0, accIds.length - shown.length) }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function clipText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

function formatDate(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 纯绘制函数：不碰 DOM，方便单独验证布局逻辑。
export function drawCard(ctx, outfit, ts = Date.now()) {
  const { rows, overflow } = buildRows(outfit)

  ctx.clearRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // —— 页眉 ——
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = CARD_INK
  ctx.font = font(700, 68)
  ctx.fillText('型格', PAD, 168)

  const wideOf = ctx.measureText('型格').width
  ctx.fillStyle = CARD_ACCENT
  ctx.font = font(700, 42)
  ctx.fillText('STYLE LAB', PAD + wideOf + 20, 168)

  ctx.fillStyle = CARD_INK2
  ctx.font = font(400, 26)
  ctx.fillText('男士穿搭实验室 · 造型卡', PAD, 218)

  const dateText = formatDate(ts)
  ctx.textAlign = 'right'
  ctx.fillText(dateText, CARD_W - PAD, 168)
  ctx.textAlign = 'left'

  ctx.fillStyle = CARD_LINE
  ctx.fillRect(PAD, 258, CARD_W - PAD * 2, 2)

  // —— 单品行（自适应行高，保证 4 件主单品 + 最多 6 件配饰都排得下）——
  const rowsTop = 300
  const footerTop = CARD_H - 150
  const overflowH = overflow > 0 ? 44 : 0
  const availH = footerTop - 40 - overflowH - rowsTop

  const step = Math.min(132, Math.floor(availH / Math.max(rows.length, 1)))
  const block = Math.min(96, Math.max(52, step - 34))
  const usedH = step * rows.length
  const startY = rowsTop + Math.max(0, (availH - usedH) / 2)

  rows.forEach((row, i) => {
    const y = startY + i * step
    const item = row.item
    const hex = item?.hex || ''

    if (isTransparent(hex)) {
      ctx.save()
      roundRect(ctx, PAD, y, block, block, 18)
      ctx.clip()
      ctx.fillStyle = CARD_BG
      ctx.fillRect(PAD, y, block, block)
      // 斜纹底纹：用绘制而不是图案填充，避免额外的离屏 canvas
      ctx.strokeStyle = CARD_LINE
      ctx.lineWidth = 2
      for (let x = -block; x < block * 2; x += 12) {
        ctx.beginPath()
        ctx.moveTo(PAD + x, y + block)
        ctx.lineTo(PAD + x + block, y)
        ctx.stroke()
      }
      ctx.restore()
    } else {
      ctx.fillStyle = hex
      roundRect(ctx, PAD, y, block, block, 18)
      ctx.fill()
    }
    ctx.strokeStyle = CARD_EDGE
    ctx.lineWidth = 2
    roundRect(ctx, PAD, y, block, block, 18)
    ctx.stroke()

    const textX = PAD + block + 30
    const textW = CARD_W - PAD - textX

    ctx.fillStyle = CARD_INK2
    ctx.font = font(500, Math.max(18, Math.round(block * 0.26)))
    ctx.fillText(row.label, textX, y + Math.round(block * 0.30))

    ctx.fillStyle = CARD_INK
    ctx.font = font(700, Math.max(24, Math.round(block * 0.36)))
    ctx.fillText(clipText(ctx, item?.name || '未知单品', textW), textX, y + Math.round(block * 0.66))

    const tip = tipOf(item)
    if (tip && block >= 62) {
      ctx.fillStyle = CARD_INK2
      ctx.font = font(400, Math.max(18, Math.round(block * 0.25)))
      ctx.fillText(clipText(ctx, tip, textW), textX, y + block)
    }
  })

  if (overflow > 0) {
    ctx.fillStyle = CARD_INK2
    ctx.font = font(400, 22)
    ctx.fillText(`另有 ${overflow} 件配饰未列出`, PAD, startY + usedH + 34)
  }

  // —— 页脚 ——
  ctx.fillStyle = CARD_LINE
  ctx.fillRect(PAD, footerTop, CARD_W - PAD * 2, 2)

  ctx.fillStyle = CARD_INK2
  ctx.font = font(400, 24)
  ctx.fillText(`型格 STYLE LAB · ${dateText}`, PAD, footerTop + 48)

  ctx.textAlign = 'right'
  ctx.fillStyle = CARD_ACCENT
  ctx.font = font(600, 24)
  ctx.fillText('由 style-lab 生成', CARD_W - PAD, footerTop + 48)
  ctx.textAlign = 'left'
}

function triggerDownload(href, filename) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function ExportCard({ outfit, filename = 'style-lab-造型.png' }) {
  const [status, setStatus] = useState({ kind: 'idle', text: '' })
  const timerRef = useRef(0)

  const flash = useCallback((kind, text) => {
    setStatus({ kind, text })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus({ kind: 'idle', text: '' }), 4000)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const handleExport = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = CARD_W
      canvas.height = CARD_H
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.warn('[ExportCard] 无法获取 2D 上下文，取消导出')
        flash('error', '导出失败：浏览器不支持 Canvas 2D')
        return
      }
      drawCard(ctx, outfit)

      if (typeof canvas.toBlob !== 'function') {
        // 老浏览器降级：toDataURL 生成的 data URI 同样可以下载（无需 revoke）。
        console.warn('[ExportCard] canvas.toBlob 不存在，降级为 toDataURL')
        triggerDownload(canvas.toDataURL('image/png'), filename)
        flash('ok', '造型卡已导出 ✓（降级模式）')
        return
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          // 内存不足时 toBlob 会回调 null，必须显式处理
          console.warn('[ExportCard] canvas.toBlob 回调 null（可能内存不足）')
          flash('error', '导出失败：内存不足，请关闭部分标签页后重试')
          return
        }
        const url = URL.createObjectURL(blob)
        try {
          triggerDownload(url, filename)
          flash('ok', `造型卡已导出 ✓ ${CARD_W}×${CARD_H}`)
        } catch (e) {
          console.warn('[ExportCard] 触发下载失败：', e)
          flash('error', '导出失败：浏览器阻止了下载')
        } finally {
          // 必须释放，否则每导出一次就泄漏一张 1080×1350 的位图。
          // 延迟释放：立刻 revoke 会让部分浏览器来不及读取 blob 就取消下载。
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      }, 'image/png')
    } catch (e) {
      console.warn('[ExportCard] 导出造型卡失败：', e)
      flash('error', '导出失败：绘制造型卡时出错')
    }
  }

  return (
    <span className="share-export">
      <button type="button" className="share-btn" onClick={handleExport}
        aria-label={`导出造型卡 PNG，尺寸 ${CARD_W}×${CARD_H}`}><IconImage /> 导出造型卡</button>
      <span
        className={`share-export-status ${status.kind === 'idle' ? '' : `is-${status.kind}`}`}
        role="status" aria-live="polite">
        {status.text}
      </span>
    </span>
  )
}

export const CARD_SIZE = { width: CARD_W, height: CARD_H }

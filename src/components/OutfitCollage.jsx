// 二维拼贴（PHASE3-CONTRACT §2）。
//
// 屏幕上是 DOM（可选中、可无障碍阅读），导出时才用 Canvas 2D 重画一遍——
// 两条路径共用 collageLayout 的同一份几何与同一份 flatLay 内容，
// 所以「看到的」和「导出的」不会各画一套。导出不引入任何依赖。
import { useCallback, useMemo, useState } from 'react'
import { collageLayout } from '../data/collage'
import { IconImage } from './icons'
import '../styles/collage.css'

// 导出图固定使用浅色配色：造型卡是要拿去分享的成品，
// 不应该因为收件人开了深色模式就变成另一张图（CSS 变量在 Canvas 里也读不到）。
const EXPORT_BG = '#fbf9f5'
const EXPORT_CARD = '#ffffff'
const EXPORT_LINE = '#ded7c9'
const EXPORT_INK = '#2b2a28'
const EXPORT_INK2 = '#6d6a63'
const EXPORT_ACCENT = '#a54d19'

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function clipText(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function drawCell(ctx, cell) {
  const { x, y, width, height } = cell
  roundRect(ctx, x, y, width, height, 14)
  ctx.fillStyle = EXPORT_CARD
  ctx.fill()
  ctx.strokeStyle = EXPORT_LINE
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = EXPORT_INK
  ctx.font = '700 17px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(clipText(cell.title || '造型', 12), x + 16, y + 14)

  if (cell.score !== null && cell.score !== undefined) {
    ctx.fillStyle = EXPORT_ACCENT
    ctx.font = '700 15px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(cell.score + ' 分', x + width - 16, y + 16)
    ctx.textAlign = 'left'
  }

  const entries = cell.flatLay?.cells || []
  const slotLabelWidth = 34
  entries.forEach((entry, index) => {
    const rowY = y + 48 + index * 34
    if (rowY + 34 > y + height - 8) return
    ctx.fillStyle = EXPORT_INK2
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(entry.label, x + 14, rowY + 6)

    const swatchX = x + 14 + slotLabelWidth
    roundRect(ctx, swatchX, rowY, 26, 26, 7)
    if (entry.item && entry.item.hex) {
      ctx.fillStyle = entry.item.hex
      ctx.fill()
      ctx.strokeStyle = EXPORT_LINE
      ctx.stroke()
    } else {
      ctx.fillStyle = EXPORT_BG
      ctx.fill()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = EXPORT_LINE
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.fillStyle = EXPORT_INK
    ctx.font = '13px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(clipText(entry.item ? entry.item.name : '未选', 14), swatchX + 34, rowY + 6)
  })
}

function downloadLayout(layout, fileName) {
  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = Math.round(layout.width * scale)
  canvas.height = Math.round(layout.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.scale(scale, scale)
  ctx.fillStyle = EXPORT_BG
  ctx.fillRect(0, 0, layout.width, layout.height)
  layout.cells.forEach((cell) => drawCell(ctx, cell))
  const url = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}

export function OutfitCollage({ outfits, preset = 'auto', onExport, fileName = 'style-lab-collage.png' }) {
  const layout = useMemo(() => collageLayout({ looks: outfits, preset }), [outfits, preset])
  const [status, setStatus] = useState('')
  const canExport = typeof document !== 'undefined'

  const handleExport = useCallback(() => {
    if (!layout.ok) return
    try {
      const done = downloadLayout(layout, fileName)
      const message = done ? '造型卡已导出为 PNG' : '当前浏览器不支持导出图片'
      setStatus(message)
      if (typeof onExport === 'function') onExport({ ok: done, error: done ? null : message })
    } catch (error) {
      const message = '导出失败：' + (error && error.message ? error.message : '未知错误')
      setStatus(message)
      if (typeof onExport === 'function') onExport({ ok: false, error: message })
    }
  }, [fileName, layout, onExport])

  if (!layout.ok) {
    return <p className="clg-empty">{layout.error || '还没有可以拼贴的造型。'}</p>
  }

  return (
    <section className="clg-panel" aria-label="造型拼贴">
      <div className="clg-head">
        <h3><IconImage /> 造型拼贴</h3>
        {canExport ? (
          <button type="button" className="clg-btn" onClick={handleExport}>
            导出 PNG
          </button>
        ) : null}
      </div>
      <p className="clg-status" role="status" aria-live="polite">{status}</p>
      <div className="clg-scroll">
        <div className="clg-canvas" style={{ width: layout.width, height: layout.height }}>
          {layout.cells.map((cell) => (
            <article
              key={cell.lookIndex}
              className="clg-cell"
              style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }}
            >
              <header className="clg-cell-head">
                <span className="clg-cell-title">{cell.title}</span>
                {cell.score !== null && cell.score !== undefined ? (
                  <span className="clg-cell-score">{cell.score} 分</span>
                ) : null}
              </header>
              <ul className="clg-items">
                {cell.flatLay.cells.map((entry) => (
                  <li key={entry.slot + entry.order} className={entry.placeholder ? 'is-empty' : ''}>
                    <span className="clg-slot">{entry.label}</span>
                    <span
                      className="clg-swatch"
                      style={entry.item && entry.item.hex ? { background: entry.item.hex } : undefined}
                      aria-hidden="true"
                    />
                    <span className="clg-name">
                      {entry.item ? entry.item.name : <span aria-label={entry.label + '未选'}>未选</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
      {layout.warnings.length ? <p className="clg-note">{layout.warnings.join('；')}</p> : null}
    </section>
  )
}

export default OutfitCollage

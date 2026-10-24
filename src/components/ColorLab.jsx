// 色彩实验室（UI 层）。
//
// 分工：这里只负责「拿照片 → 解码成像素」、「把纯函数结果摆出来」和交互反馈；
// 取色、诊断、色差匹配、造型生成全部在 src/data/colorLab.js，Node 下有独立断言。
// 照片不上传：解码与取色都在本机 canvas 里完成，结果只留在内存（刷新即清空）。
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ITEMS, byId } from '../data/catalog'
import { LAWS } from '../data/advice'
import {
  PALETTE_SIZE,
  analyzePalette,
  buildPaletteOutfits,
  colorName,
  matchPalette,
  outfitPalette,
  quantizeColors,
} from '../data/colorLab'
import { IconAlert, IconCheck, IconImage, IconShirt, IconSparkles } from './icons'
import '../styles/colorlab.css'

const MAX_FILE_BYTES = 20 * 1024 * 1024
// 取色只需要「颜色分布」，不需要原始分辨率；缩到 240px 后一张 4K 照片也只要几毫秒。
const MAX_EDGE = 240
const MATCH_LIMIT = 3
const OUTFIT_COUNT = 3
const SLOTS = ['top', 'outer', 'bottom', 'shoes', 'accs']
const SLOT_NAMES = { top: '上装', outer: '外套', bottom: '下装', shoes: '鞋履', accs: '配饰' }
const MIME_IMAGE = /^image\//i
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i
const LAWS_BY_NO = new Map(LAWS.map((law) => [law.n, law]))

function isImageFile(file) {
  if (!file || typeof file !== 'object') return false
  if (typeof file.type === 'string' && MIME_IMAGE.test(file.type)) return true
  return typeof file.name === 'string' && IMAGE_EXT.test(file.name)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('照片解码失败，请换一张 JPG / PNG / WebP 图片。'))
    image.src = url
  })
}

/** 把图片画到小画布并取出 RGBA；画布只在浏览器里创建。 */
function samplePixels(image) {
  const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('照片尺寸无效。')
  const scale = Math.min(1, MAX_EDGE / longest)
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('当前浏览器不支持 Canvas，无法读取照片颜色。')
  ctx.drawImage(image, 0, 0, width, height)
  let pixels
  try {
    pixels = ctx.getImageData(0, 0, width, height).data
  } catch (error) {
    throw new Error('浏览器拒绝了照片像素读取：' + (error?.message || '未知原因'))
  }
  return { pixels, width, height }
}

function analyzeColors(colors) {
  return {
    colors,
    analysis: analyzePalette(colors),
    matches: matchPalette(colors, { limit: MATCH_LIMIT }),
    outfits: buildPaletteOutfits(colors, { count: OUTFIT_COUNT }),
  }
}

const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`

function outfitRows(entry) {
  const outfit = entry.outfit
  const rows = []
  for (const slot of SLOTS) {
    if (slot === 'accs') {
      for (const id of outfit.accs) {
        const item = byId(ITEMS, id)
        if (item) rows.push({ slot, item })
      }
      continue
    }
    if (slot === 'outer' && outfit.outer === 'o-none') continue
    const item = byId(ITEMS, outfit[slot])
    if (item) rows.push({ slot, item })
  }
  return rows
}

export function ColorLab({ outfit, onTry }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const previewUrlRef = useRef('')
  const runRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState({ kind: 'idle', text: '' })

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
  }, [])

  useEffect(() => releasePreview, [releasePreview])

  const analyzeFile = useCallback(async (file) => {
    if (!file) return
    if (!isImageFile(file)) {
      setStatus({ kind: 'error', text: '请选择图片文件（JPG / PNG / WebP）。' })
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: 'error', text: '照片超过 20MB，请压缩后再试。' })
      return
    }
    if (file.size === 0) {
      setStatus({ kind: 'error', text: '这是一张空文件，换一张试试。' })
      return
    }
    const run = runRef.current + 1
    runRef.current = run
    setBusy(true)
    setStatus({ kind: 'info', text: '正在本机解码照片并提取主色…' })
    const url = URL.createObjectURL(file)
    try {
      const image = await loadImage(url)
      if (runRef.current !== run) {
        URL.revokeObjectURL(url)
        return
      }
      const { pixels } = samplePixels(image)
      const colors = quantizeColors(pixels, PALETTE_SIZE)
      if (!colors.length) throw new Error('照片里没有提取到可用颜色（可能是全透明图片）。')
      const built = analyzeColors(colors)
      if (runRef.current !== run) {
        URL.revokeObjectURL(url)
        return
      }
      releasePreview()
      previewUrlRef.current = url
      setResult({
        ...built,
        source: 'photo',
        label: file.name || '上传的照片',
        preview: { url, width: image.naturalWidth, height: image.naturalHeight },
      })
      setStatus({ kind: 'ok', text: `已提取 ${colors.length} 个主色；照片没有离开你的浏览器。` })
    } catch (error) {
      URL.revokeObjectURL(url)
      if (runRef.current !== run) return
      console.warn('STYLE LAB: 照片取色失败', error)
      setStatus({ kind: 'error', text: error?.message || '照片处理失败，请换一张试试。' })
    } finally {
      if (runRef.current === run) setBusy(false)
    }
  }, [releasePreview])

  const analyzeCurrentOutfit = useCallback(() => {
    const palette = outfitPalette(outfit)
    if (!palette.length) {
      setStatus({ kind: 'error', text: '当前造型没有可分析的颜色，先选几件单品。' })
      return
    }
    runRef.current += 1
    setBusy(false)
    try {
      const built = analyzeColors(palette)
      releasePreview()
      setResult({ ...built, source: 'outfit', label: '当前 3D 造型', preview: null })
      setStatus({ kind: 'ok', text: '已按当前造型的颜色完成诊断。' })
    } catch (error) {
      console.warn('STYLE LAB: 当前造型配色分析失败', error)
      setStatus({ kind: 'error', text: '配色分析失败，请稍后再试。' })
    }
  }, [outfit, releasePreview])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    setDragOver(false)
    const file = Array.from(event.dataTransfer?.files || []).find(isImageFile)
    if (file) analyzeFile(file)
    else setStatus({ kind: 'error', text: '没有检测到图片，请拖入 JPG / PNG / WebP 文件。' })
  }, [analyzeFile])

  const onPaste = useCallback((event) => {
    const item = Array.from(event.clipboardData?.items || [])
      .find((entry) => entry.kind === 'file' && MIME_IMAGE.test(entry.type))
    const file = item?.getAsFile()
    if (!file) return
    event.preventDefault()
    analyzeFile(file)
  }, [analyzeFile])

  const onDropKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      inputRef.current?.click()
    }
  }, [])

  const applyMatch = useCallback((match) => {
    if (typeof onTry !== 'function') return
    const next = { ...outfit, accs: Array.isArray(outfit.accs) ? [...outfit.accs] : [] }
    if (match.category === 'top') next.top = match.id
    else if (match.category === 'outer') next.outer = match.id
    else if (match.category === 'bottom') next.bottom = match.id
    else if (match.category === 'shoes') next.shoes = match.id
    else if (match.category === 'accs') {
      if (!next.accs.includes(match.id)) next.accs = [...next.accs, match.id]
    } else return
    onTry(next)
  }, [onTry, outfit])

  const fallbackBlocks = useMemo(() => {
    const palette = outfitPalette(outfit)
    return palette.slice(0, 5)
  }, [outfit])

  const laws = result
    ? result.analysis.laws.map((no) => LAWS_BY_NO.get(no)).filter(Boolean)
    : []

  return (
    <div className="colorlab">
      <div className="cl-intro">
        <div className="cl-intro-copy">
          <p className="cl-kicker"><IconSparkles /> PHOTO → PALETTE → OUTFIT</p>
          <h3>用一张照片，读懂你的配色</h3>
          <p className="cl-sub">
            提取主色、判断和谐关系与三色原则，再从 59 件可试穿单品里挑出最接近的颜色，
            生成 3 套可以直接上身的新造型。
          </p>
          <p className="cl-privacy">
            <IconCheck /> 照片只在浏览器本地解码，不上传服务器、不写入 localStorage。
          </p>
        </div>
        <div className="cl-source-actions">
          <label
            className={`cl-drop ${dragOver ? 'is-drag' : ''} ${result ? 'is-compact' : ''}`}
            htmlFor={inputId}
            role="button"
            tabIndex={0}
            aria-label={result ? '换一张照片' : '选择或拖入穿搭照片'}
            onKeyDown={onDropKeyDown}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPaste={onPaste}
          >
            <span className="cl-drop-icon"><IconImage /></span>
            <span className="cl-drop-copy">
              <b>{busy ? '正在取色…' : result ? '换一张照片' : '选择照片'}</b>
              <small>拖入 · 点击 · 聚焦后 Ctrl+V 粘贴</small>
            </span>
            <input
              id={inputId}
              ref={inputRef}
              className="cl-file"
              type="file"
              accept="image/*"
              aria-label="选择穿搭照片"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) analyzeFile(file)
              }}
            />
          </label>
          <button type="button" className="cl-btn" onClick={analyzeCurrentOutfit} disabled={busy}>
            <IconShirt /> 分析当前造型
          </button>
        </div>
      </div>

      <p className={`cl-status is-${status.kind}`} role="status" aria-live="polite">
        {busy ? <span className="cl-spinner" aria-hidden="true" /> : null}
        {status.text}
      </p>

      {!result ? (
        <div className="cl-steps">
          <div className="cl-step"><b>01</b><span>提取主色</span><p>直方图量化，最多 {PALETTE_SIZE} 色；纯色块不会被混成脏色。</p></div>
          <div className="cl-step"><b>02</b><span>诊断配色</span><p>色族数量、明暗对比、三色原则与色彩呼应，一次说清。</p></div>
          <div className="cl-step"><b>03</b><span>生成造型</span><p>按 CIE 色差匹配目录单品，排除硬冲突后给出 3 套方案。</p></div>
        </div>
      ) : null}

      {result ? (
        <div className="cl-result">
          <div className="cl-summary">
            <figure className="cl-preview">
              {result.preview ? (
                <img src={result.preview.url} alt={`已上传照片：${result.label}`} />
              ) : (
                <div
                  className="cl-preview-outfit"
                  role="img"
                  aria-label={`当前造型配色：${fallbackBlocks.map((block) => block.labels[0]).join('、')}`}
                >
                  {fallbackBlocks.map((block) => (
                    <i key={block.hex} style={{ background: block.hex }} aria-hidden="true" />
                  ))}
                </div>
              )}
              <figcaption>{result.label}</figcaption>
            </figure>

            <div className="cl-diagnosis">
              <div className="cl-diagnosis-head">
                <h3>{result.analysis.harmony.label}</h3>
                <span className="cl-dominant">
                  主色 {result.analysis.dominant.name} {percent(result.analysis.dominant.share)}
                </span>
              </div>
              <p className="cl-advice">{result.analysis.advice}</p>
              <ul className="cl-tags" aria-label="配色指标">
                <li>{result.analysis.families} 个色族</li>
                <li className={result.analysis.threeColorOk ? 'is-ok' : 'is-warn'}>
                  {result.analysis.threeColorOk ? '符合三色原则' : '超出三色原则'}
                </li>
                <li>明暗对比{result.analysis.contrast.label}</li>
                <li className={result.analysis.echo ? 'is-ok' : ''}>
                  {result.analysis.echo ? '有色彩呼应' : '没有明显呼应'}
                </li>
                <li>中性色占 {percent(result.analysis.neutralShare)}</li>
              </ul>
              {laws.length ? (
                <p className="cl-laws">
                  参考法则：
                  {laws.map((law) => (
                    <a key={law.n} href="#laws">{law.n} {law.title}</a>
                  ))}
                </p>
              ) : null}
            </div>
          </div>

          <div className="cl-block">
            <div className="cl-block-head">
              <h4>提取到的主色</h4>
              <span>按画面占比排序</span>
            </div>
            <ol className="cl-palette">
              {result.colors.map((color, index) => (
                <li key={`${color.hex}-${index}`}>
                  <i className="cl-swatch" style={{ background: color.hex }} aria-hidden="true" />
                  <span className="cl-color-name">{colorName(color.hex)}</span>
                  <span className="cl-color-hex">{color.hex}</span>
                  <span className="cl-color-share">{percent(color.share)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="cl-block">
            <div className="cl-block-head">
              <h4>目录里最接近的单品</h4>
              <span>点击可直接上身并跳到 3D 试衣间</span>
            </div>
            <div className="cl-matches">
              {result.matches.map((row, index) => (
                <div className="cl-match-row" key={`${row.hex}-${index}`}>
                  <div className="cl-match-color">
                    <i style={{ background: row.hex }} aria-hidden="true" />
                    <span>{row.name}</span>
                    <small>{percent(row.share)}</small>
                  </div>
                  <div className="cl-match-list">
                    {row.matches.map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        className={`cl-match-btn ${match.close ? 'is-close' : ''}`}
                        onClick={() => applyMatch(match)}
                        disabled={typeof onTry !== 'function'}
                        aria-label={`${match.categoryLabel}：${match.name}，色差 ${match.deltaE}${match.close ? '，颜色接近' : ''}，点击上身`}
                      >
                        <i style={{ background: match.hex }} aria-hidden="true" />
                        <span className="cl-match-name">{match.name}</span>
                        <span className="cl-match-meta">
                          {match.categoryLabel} · ΔE {match.deltaE}
                          {match.close ? ' · 接近' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cl-block">
            <div className="cl-block-head">
              <h4>用这组颜色生成的方案</h4>
              <span>已排除硬冲突 · 评分与 3D 试衣间同口径</span>
            </div>
            {result.outfits.length ? (
              <div className="cl-outfits">
                {result.outfits.map((entry) => (
                  <article className="cl-outfit" key={entry.ids}>
                    <div
                      className="cl-band"
                      role="img"
                      aria-label={`配色：${entry.colors.map((color) => color.label).join('、')}`}
                    >
                      {entry.colors.map((color, index) => (
                        <i key={`${color.hex}-${index}`} style={{ background: color.hex }} aria-hidden="true" />
                      ))}
                    </div>
                    <div className="cl-outfit-head">
                      <h5>{entry.name}</h5>
                      <span className="cl-score" title="现有四维评分">{entry.score} 分</span>
                    </div>
                    <ul className="cl-outfit-items">
                      {outfitRows(entry).map((row) => (
                        <li key={`${row.slot}-${row.item.id}`}>
                          <span className="cl-slot">{SLOT_NAMES[row.slot]}</span>
                          <i style={{ background: row.item.hex }} aria-hidden="true" />
                          <span className="cl-item-name">{row.item.name}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="cl-outfit-stats">
                      配色覆盖 {entry.paletteFit}% · 色差均值 ΔE {entry.colorDistance} · 主色 {entry.dominantName}
                    </p>
                    {entry.warnings.length ? (
                      <p className="cl-outfit-warn"><IconAlert /> {entry.warnings[0]}</p>
                    ) : null}
                    <button type="button" className="cl-try" onClick={() => onTry(entry.outfit)} disabled={typeof onTry !== 'function'}>
                      在 3D 中试穿这套
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="cl-empty-outfits">这组颜色的组合都触发了硬冲突，换一张照片或调整颜色后再试。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ColorLab

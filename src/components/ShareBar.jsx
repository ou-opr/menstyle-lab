// 分享工具条：复制链接 / 复制文案 / 收藏造型 / 随机一套 / 导出造型卡。
// 只负责产出与本地保存；URL hash 的解析接线由 Lead 在 App.jsx 完成。
//
// 收藏夹（looks）不再是本组件的私有 state —— 它抬到了 App 层（hooks/useLooks.js）。
// 原因：备份导入改的是 localStorage，组件私有 state 读不到；导入后再点一次「收藏」，
// 会用导入前的旧数组写回，把刚导入的收藏整套覆盖掉。现在通过 props 传入。

import { useCallback, useEffect, useRef, useState } from 'react'
import { PRESETS, TOPS, byId } from '../data/catalog'
import { canEncodeOutfit, encodeOutfit, outfitToText } from '../data/share'
import { LOOKS_KEY, MAX_LOOKS, cloneOutfit, formatLookTs, isOutfit, sameSlots } from '../data/looks.js'
import { ExportCard } from './ExportCard'
import { ComparePanel } from './ComparePanel'
import { IconDice, IconLink, IconMemo, IconSparkles, IconStar } from './icons'
import '../styles/share.css'

export { LOOKS_KEY }

const FLASH_MS = 2000
// 原生剪贴板 API 的等待上限：超过就当作不可用并降级，避免按钮永远「没反应」。
const CLIPBOARD_TIMEOUT_MS = 800

// navigator.clipboard 在非安全上下文（file:// / http 局域网）下不存在，被拒绝时也会 reject。
// 还有第三种、也是最阴险的一种：它**永远不 settle**（权限提示悬置、页面无焦点、
// 沙箱 iframe —— 实测 headless Chromium 就是这种）。此时 await 永不返回，
// 用户点了按钮却什么都不发生，正是「静默失败」。所以原生调用必须带超时。
async function writeWithClipboardApi(text) {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) return false
  const call = navigator.clipboard.writeText(text)
  // 超时放弃后，这个 promise 之后仍可能 reject；先挂上 handler，避免冒成 unhandledrejection。
  Promise.resolve(call).catch((e) => { console.warn('[ShareBar] navigator.clipboard 异步拒绝：', e) })
  let timer = 0
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), CLIPBOARD_TIMEOUT_MS) })
  try {
    return await Promise.race([
      Promise.resolve(call).then(() => true, (e) => {
        console.warn('[ShareBar] navigator.clipboard 被拒绝，尝试 execCommand 降级：', e)
        return false
      }),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

// 两条路都失败就返回 false，由调用方给出可见的失败提示，绝不静默。
async function copyToClipboard(text) {
  if (await writeWithClipboardApi(text)) return true
  try {
    if (typeof document === 'undefined') return false
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const done = document.execCommand('copy')
    document.body.removeChild(area)
    if (!done) console.warn('[ShareBar] document.execCommand("copy") 返回 false')
    return done
  } catch (e) {
    console.warn('[ShareBar] execCommand 复制降级同样失败：', e)
    return false
  }
}

// 收藏项的色块用上装色值做缩略提示；o-none 的全透明色渲染成斜纹。
const byIdHex = (id) => {
  const hex = byId(TOPS, id)?.hex
  if (!hex || /^#0{8}$/i.test(hex)) return 'repeating-linear-gradient(45deg, var(--line), var(--line) 4px, var(--card) 4px, var(--card) 8px)'
  return hex
}

export function ShareBar({ outfit, onApply, wardrobe, looks, onAddLook, onDeleteLook }) {
  const [status, setStatus] = useState({ kind: 'idle', text: '' })
  const timerRef = useRef(0)
  const canApply = typeof onApply === 'function'
  // 收藏夹由 App 持有；这里只做兜底，避免未接线时渲染崩掉。
  const list = Array.isArray(looks) ? looks : []
  const addLook = typeof onAddLook === 'function' ? onAddLook : null
  const deleteLook = typeof onDeleteLook === 'function' ? onDeleteLook : null

  const flash = useCallback((kind, text) => {
    setStatus({ kind, text })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus({ kind: 'idle', text: '' }), FLASH_MS)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const apply = useCallback((next) => {
    if (!canApply) {
      flash('error', '当前页面未接线回填能力')
      return false
    }
    if (!isOutfit(next)) {
      flash('error', '这套造型数据不完整，无法回填')
      return false
    }
    onApply(cloneOutfit(next))
    return true
  }, [canApply, onApply, flash])

  const handleCopyLink = async () => {
    // 含个人单品的造型编不进短链：编出来对方打开只会看到默认造型。
    // 与其发一条死链，不如当场说清，并指向还能用的两种分享方式。
    if (!canEncodeOutfit(outfit)) {
      flash('warn', '这套里有个人单品，分享链接只支持系统单品：可改用「复制搭配清单」或导出造型卡')
      return
    }
    const hash = `#o=${encodeOutfit(outfit)}`
    try {
      window.history.replaceState(null, '', hash)
    } catch (e) {
      console.warn('[ShareBar] history.replaceState 写入 hash 失败：', e)
    }
    // file:// 下 window.location.href 是本机绝对路径：发给别人打不开，还会泄露本机目录结构。
    // 本地打开没有可用的 http(s) 地址，只给明确替代方案，绝不复制死链。
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      flash('warn', '当前是本地打开（file://），复制链接只会得到本机路径、别人打不开。请改用「复制文案」或「导出图片」分享')
      return
    }
    const url = typeof window !== 'undefined' ? window.location.href : hash
    const done = await copyToClipboard(url)
    flash(done ? 'ok' : 'error', done ? '已复制分享链接 ✓' : '复制失败：请手动复制地址栏链接')
  }

  const handleCopyText = async () => {
    const done = await copyToClipboard(outfitToText(outfit))
    flash(done ? 'ok' : 'error', done ? '已复制搭配文案 ✓' : '复制失败：浏览器拒绝了剪贴板写入')
  }

  const handleSave = () => {
    if (!addLook) {
      flash('error', '当前页面未接线收藏能力')
      return
    }
    addLook(outfit)
    flash('ok', `已收藏到造型夹 ✓（最多保留 ${MAX_LOOKS} 套）`)
  }

  const handleApplyLook = (look) => {
    if (apply(look?.outfit)) flash('ok', `已回填「${look.name}」✓`)
  }

  const handleDeleteLook = (id) => {
    if (!deleteLook) return
    deleteLook(id)
    flash('ok', '已删除该收藏')
  }

  const handleRandom = () => {
    if (!Array.isArray(PRESETS) || !PRESETS.length) {
      flash('error', '没有可用的预设造型')
      return
    }
    const pick = PRESETS[Math.floor(Math.random() * PRESETS.length)]
    if (apply(pick.outfit)) flash('ok', `随机到「${pick.name}」✓`)
  }

  // 造型夹里哪一套就是当前身上这套（给对比表高亮用）。
  // 配饰按集合比较：同一套造型的配饰顺序不该影响"是不是这套"的判断。
  const activeIndex = list.findIndex((look) => sameSlots(look?.outfit, outfit))

  return (
    <section className="share-bar" aria-label="分享与收藏">
      <div className="share-head">
        <h3><IconSparkles /> 分享与收藏</h3>
        <span className="share-hint">复制链接发给朋友，打开就是你现在这一套</span>
      </div>

      <div className="share-actions">
        <button type="button" className="share-btn" onClick={handleCopyLink}
          aria-label="复制分享链接"><IconLink /> 复制链接</button>
        <button type="button" className="share-btn" onClick={handleCopyText}
          aria-label="复制搭配文案"><IconMemo /> 复制文案</button>
        <button type="button" className="share-btn" onClick={handleSave}
          aria-label={`收藏当前造型，最多保留 ${MAX_LOOKS} 套`}><IconStar /> 收藏这套</button>
        <button type="button" className="share-btn" onClick={handleRandom}
          aria-label="随机换一套预设造型" disabled={!canApply}><IconDice /> 随机一套</button>
        <ExportCard outfit={outfit} />
      </div>

      <p className={`share-status ${status.kind === 'idle' ? '' : `is-${status.kind}`}`}
        role="status" aria-live="polite">
        {status.text}
      </p>

      <div className="share-looks">
        <div className="share-looks-head">
          <span>我的造型夹</span>
          <span className="share-looks-count">{list.length} / {MAX_LOOKS}</span>
        </div>
        {list.length === 0 ? (
          <p className="share-looks-empty">还没有收藏。调好一套后点「<IconStar /> 收藏这套」，以后一键回填。</p>
        ) : (
          <ul className="share-looks-list">
            {list.map((look, i) => (
              <li key={typeof look?.id === 'string' ? look.id : `look-idx-${i}`} className="share-look">
                <span className="share-look-sw" aria-hidden="true" style={{ background: byIdHex(look?.outfit?.top) }} />
                <button type="button" className="share-look-apply"
                  onClick={() => handleApplyLook(look)}
                  disabled={!canApply || !isOutfit(look?.outfit)}
                  aria-label={`回填 ${look?.name || '未命名造型'}`}>
                  <span className="share-look-name">{look?.name || '未命名造型'}</span>
                  <span className="share-look-time">{formatLookTs(look?.ts)}</span>
                </button>
                <button type="button" className="share-look-del"
                  onClick={() => handleDeleteLook(look?.id)}
                  aria-label={`删除 ${look?.name || '未命名造型'}`}>删除</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ComparePanel
        looks={list}
        wardrobe={wardrobe}
        activeIndex={activeIndex}
        onPick={canApply ? (index) => handleApplyLook(list[index]) : undefined}
        onRemove={handleDeleteLook}
      />
    </section>
  )
}

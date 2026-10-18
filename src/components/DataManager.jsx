// 数据管理：备份导出 / 校验后导入（合并 或 覆盖）/ 全部重置。
// 契约见 docs/PHASE1-CONTRACT.md §6（备份包 v1）与 §7（数据管理器放在页脚之前）。
//
// 本组件只调用 src/data/backup.js 的纯函数，并把可选的 imageStore 透传进去：
// imageStore 尚未落地时（契约 §3 属其他模块），照片相关能力自动降级并在界面上说明，
// 而不是静默失败。组件不触碰 App 的 outfit 状态。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BACKUP_VERSION,
  collectBackup,
  defaultStorage,
  exportBackup,
  importBackup,
  resetAll,
} from '../data/backup'
import { IconDatabase } from './icons'
import '../styles/data-manager.css'

/* 导入策略。覆盖是高风险操作，UI 上需要二次确认（契约 §7）。 */
const MODES = [
  { key: 'merge', label: '合并', hint: '保留本地已有数据，同一件按 updatedAt 取较新' },
  { key: 'overwrite', label: '覆盖', hint: '用备份包整体替换本地数据，本地内容会丢失' },
]

const CONFIRM_WINDOW_MS = 6000
const MAX_WARNINGS_SHOWN = 4

/** 把 planImport / applyPlan 的 stats 翻成人话。stats 结构见 backup.js planImport。 */
function summarize(stats) {
  if (!stats) return []
  const lines = []
  if (stats.wardrobe) {
    lines.push(`衣橱：新增 ${stats.wardrobe.added} · 更新 ${stats.wardrobe.updated} · 保留 ${stats.wardrobe.kept}`)
  }
  if (stats.preferences) {
    lines.push(`偏好：反馈新增 ${stats.preferences.feedbackAdded} · 合并 ${stats.preferences.feedbackMerged} · 权重键 ${stats.preferences.weightKeys}`)
  }
  if (stats.looks) {
    lines.push(`收藏：新增 ${stats.looks.added} · 替换 ${stats.looks.replaced} · 丢弃 ${stats.looks.dropped}`)
  }
  return lines
}

/**
 * 触发一次 JSON 下载。必须 revokeObjectURL，否则每次导出都泄漏一个 blob。
 * 立刻 revoke 会让个别浏览器来不及读取，因此延迟释放。
 */
function downloadText(text, filename) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false
  let url = ''
  try {
    const blob = new Blob([text], { type: 'application/json' })
    url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  } catch (error) {
    console.warn('[DataManager] 触发下载失败：', error)
    return false
  } finally {
    if (url) {
      setTimeout(() => {
        try { URL.revokeObjectURL(url) } catch (error) { console.warn('[DataManager] 释放 blob URL 失败：', error) }
      }, 10000)
    }
  }
}

/**
 * @param {{imageStore?: object|null, appVersion?: string}} props
 * imageStore 若提供，必须是契约 §3 的接口对象（exportImages / importImages / getImageBlob / deleteImage）。
 */
export function DataManager({ imageStore = null, appVersion = '', onAfterImport = null }) {
  const [storage] = useState(() => defaultStorage())
  const [local, setLocal] = useState(null)
  const [mode, setMode] = useState('merge')
  const [pending, setPending] = useState(null)
  const [status, setStatus] = useState({ kind: 'idle', text: '', lines: [] })
  const [busy, setBusy] = useState(false)
  const [confirmKey, setConfirmKey] = useState('')
  const fileRef = useRef(null)
  const confirmTimer = useRef(0)

  const storageAvailable = !!storage

  /** 重新读一遍本地数据，用于「当前本地数据」概览。 */
  const refreshLocal = useCallback(() => {
    try {
      const { backup, warnings } = collectBackup({ storage, appVersion })
      setLocal({ counts: backup.data, warnings })
    } catch (error) {
      console.warn('[DataManager] 读取本地数据概览失败：', error)
      setLocal(null)
    }
  }, [storage, appVersion])

  useEffect(() => { refreshLocal() }, [refreshLocal])

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  const say = useCallback((kind, text, lines = []) => {
    setStatus({ kind, text, lines })
  }, [])

  /** 需要二次确认的动作：第一次点击只进入「确认」态，超时自动撤销。 */
  const requireConfirm = useCallback((key) => {
    if (confirmKey === key) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      setConfirmKey('')
      return true
    }
    setConfirmKey(key)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmKey(''), CONFIRM_WINDOW_MS)
    return false
  }, [confirmKey])

  const imageHint = useMemo(() => {
    if (imageStore && typeof imageStore.exportImages === 'function') return ''
    return '照片仓库尚未接入：备份包只含结构化数据（衣橱/偏好/收藏/主题），不含照片。'
  }, [imageStore])

  // ------------------------------------------------------------ 导出
  const handleExport = useCallback(async () => {
    setBusy(true)
    try {
      const result = await exportBackup({ storage, imageStore, appVersion })
      if (!result.ok || !result.json) {
        say('error', '导出失败：无法生成备份包')
        return
      }
      const started = downloadText(result.json, result.filename)
      if (!started) {
        say('error', '导出失败：浏览器阻止了下载，请检查下载权限')
        return
      }
      const lines = [imageHint, ...(result.warnings || [])].filter(Boolean).slice(0, MAX_WARNINGS_SHOWN)
      say('ok', `已导出 ${result.filename}（${Math.round(result.json.length / 1024)} KB）`, lines)
    } catch (error) {
      // exportBackup 设计上不抛，这里是最后一道防线：宁可给出可见提示，也不要静默卡住。
      console.warn('[DataManager] 导出过程意外失败：', error)
      say('error', `导出失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }, [storage, imageStore, appVersion, imageHint, say])

  // ------------------------------------------------------------ 导入：先预演
  const runDryRun = useCallback(async (json, nextMode) => {
    const result = await importBackup(json, { storage, imageStore, mode: nextMode, dryRun: true })
    if (!result.ok) return { ok: false, reason: result.reason, code: result.code }
    return { ok: true, stats: result.stats, warnings: result.warnings || [] }
  }, [storage, imageStore])

  const handlePickFile = useCallback(async (event) => {
    const file = event.target?.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const json = await file.text()
      const preview = await runDryRun(json, mode)
      if (!preview.ok) {
        setPending(null)
        say('error', `这个文件不能导入：${preview.reason}`)
        return
      }
      setPending({ filename: file.name, json, preview })
      say('idle', `已校验 ${file.name}，确认无误后点「确认导入」`, preview.warnings.slice(0, MAX_WARNINGS_SHOWN))
    } catch (error) {
      console.warn('[DataManager] 读取备份文件失败：', error)
      setPending(null)
      say('error', `读取文件失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }, [mode, runDryRun, say])

  const handleModeChange = useCallback(async (nextMode) => {
    setMode(nextMode)
    setConfirmKey('')
    if (!pending) return
    const preview = await runDryRun(pending.json, nextMode)
    if (!preview.ok) {
      setPending(null)
      say('error', `这个文件不能导入：${preview.reason}`)
      return
    }
    setPending({ ...pending, preview })
    say('idle', `已按「${nextMode === 'overwrite' ? '覆盖' : '合并'}」重新预演，确认后点「确认导入」`)
  }, [pending, runDryRun, say])

  const handleImport = useCallback(async () => {
    if (!pending) return
    // 覆盖模式会丢弃本地数据，必须先二次确认。
    if (mode === 'overwrite' && !requireConfirm('import-overwrite')) {
      say('warn', '覆盖会整体替换本地数据，再点一次「确认覆盖导入」以继续')
      return
    }
    setBusy(true)
    try {
      const result = await importBackup(pending.json, { storage, imageStore, mode })
      if (!result.ok) {
        say('error', `导入失败：${result.reason}`)
        return
      }
      const lines = [
        ...summarize(result.stats),
        ...(result.images && result.images.attempted > 0
          ? [`照片：导入 ${result.images.imported} / 跳过 ${result.images.skipped}`]
          : []),
        ...(result.warnings || []),
      ].filter(Boolean).slice(0, MAX_WARNINGS_SHOWN)
      say('ok', `导入完成（${mode === 'overwrite' ? '覆盖' : '合并'}模式）`, lines)
      setPending(null)
      refreshLocal()
      // 导入直接改的是 localStorage，App 里已经挂载的那些 store 还握着旧数据。
      // 通知它们重新读盘，否则用户会看到「导入成功」但页面纹丝不动。
      if (typeof onAfterImport === 'function') onAfterImport()
    } catch (error) {
      console.warn('[DataManager] 导入过程意外失败：', error)
      say('error', `导入失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }, [pending, mode, storage, imageStore, requireConfirm, say, refreshLocal, onAfterImport])

  // ------------------------------------------------------------ 重置
  const handleReset = useCallback(async () => {
    if (!storageAvailable) {
      say('error', '本机 localStorage 不可用，没有可重置的本地数据')
      return
    }
    if (!requireConfirm('reset')) {
      say('warn', '重置会清空衣橱、偏好、收藏、主题偏好与全部照片，再点一次「确认重置」以继续')
      return
    }
    const result = resetAll(storage)
    if (!result.ok) {
      const detail = result.errors.map((e) => `${e.key}（${e.message}）`).join('；')
      say('error', '重置未完全成功', [detail])
      refreshLocal()
      return
    }
    // 照片存在 IndexedDB，不在 resetAll 清的那批 localStorage key 里。
    // 不一起清掉的话，用户看到「已回到首次访问」但几十 MB 照片还占着配额。
    const notes = ['刷新页面即可回到「首次访问」状态。']
    if (imageStore && typeof imageStore.clearImages === 'function') {
      try {
        const cleared = await imageStore.clearImages()
        if (cleared && cleared.ok) {
          if (cleared.removed > 0) notes.push(`已同时清空 ${cleared.removed} 张照片。`)
        } else {
          notes.push('照片仓库未能清空，可稍后再试或手动清理浏览器数据。')
        }
      } catch (error) {
        console.warn('[DataManager] 清空照片仓库失败：', error)
        notes.push('照片仓库未能清空，可稍后再试或手动清理浏览器数据。')
      }
    } else {
      notes.push('（本次未接入照片仓库，照片不会被清空）')
    }
    say('ok', '已清空本地数据', notes)
    refreshLocal()
    if (typeof onAfterImport === 'function') onAfterImport()
  }, [storageAvailable, storage, requireConfirm, say, refreshLocal, onAfterImport, imageStore])

  const handleReload = useCallback(() => {
    try {
      window.location.reload()
    } catch (error) {
      console.warn('[DataManager] 刷新页面失败，请手动刷新：', error)
      say('warn', '浏览器阻止了自动刷新，请手动按 F5')
    }
  }, [say])

  const counts = local?.counts
  const modeInfo = MODES.find((m) => m.key === mode)

  return (
    <div className="dm" aria-label="数据管理">
      <div className="dm-head">
        <h3><IconDatabase /> 数据管理</h3>
        <span className="dm-sub">
          备份包 v{BACKUP_VERSION} · 本地数据只存在这台设备上，换设备请手动导出导入
        </span>
      </div>

      {!storageAvailable && (
        <p className="dm-banner" role="note">
          本机浏览器禁用或没有 localStorage（隐私模式常见）：导出仍可用，但导入与重置不可用，页面其余功能不受影响。
        </p>
      )}

      {/* ---------------- 当前本地数据 ---------------- */}
      <div className="dm-block">
        <div className="dm-block-head">
          <span className="dm-block-title">当前本地数据</span>
          <button type="button" className="dm-btn dm-btn-quiet" onClick={refreshLocal} aria-label="重新统计本地数据">刷新统计</button>
        </div>
        <p className="dm-counts">
          {counts ? (
            <>
              <span>衣橱 <b>{counts.wardrobe?.items?.length ?? 0}</b> 件</span>
              <span>收藏 <b>{counts.looks?.length ?? 0}</b> 套</span>
              <span>偏好反馈 <b>{counts.preferences?.feedback?.length ?? 0}</b> 条</span>
              <span>主题 <b>{counts.theme || '未设置'}</b></span>
              <span>照片 <b>{counts.images?.length ?? 0}</b> 张</span>
            </>
          ) : '暂时读不到本地数据'}
        </p>
      </div>

      {/* ---------------- 导出 ---------------- */}
      <div className="dm-block">
        <div className="dm-block-head">
          <span className="dm-block-title">① 导出备份</span>
          <button type="button" className="dm-btn dm-btn-primary" onClick={handleExport} disabled={busy} aria-label="导出备份文件">
            导出备份 JSON
          </button>
        </div>
        {imageHint && <p className="dm-note">{imageHint}</p>}
      </div>

      {/* ---------------- 导入 ---------------- */}
      <div className="dm-block">
        <div className="dm-block-head">
          <span className="dm-block-title">② 导入备份</span>
        </div>

        <fieldset className="dm-fieldset">
          <legend className="dm-legend">冲突策略</legend>
          <div className="dm-modes">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`dm-mode ${mode === m.key ? 'is-on' : ''}`}
                aria-pressed={mode === m.key}
                title={m.hint}
                aria-label={`${m.label}：${m.hint}`}
                onClick={() => handleModeChange(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="dm-note">{modeInfo?.hint}</p>
        </fieldset>

        <div className="dm-file-row">
          <input
            ref={fileRef}
            type="file"
            className="dm-file"
            accept="application/json,.json"
            aria-label="选择备份 JSON 文件"
            disabled={!storageAvailable || busy}
            onChange={handlePickFile}
          />
        </div>

        {pending && (
          <div className="dm-preview" role="group" aria-label="导入预演结果">
            <p className="dm-preview-title">已校验：{pending.filename}</p>
            <ul className="dm-preview-list">
              {summarize(pending.preview.stats).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {pending.preview.warnings.length > 0 && (
              <p className="dm-preview-warn">
                有 {pending.preview.warnings.length} 条提示：{pending.preview.warnings[0]}
              </p>
            )}
            <button
              type="button"
              className={`dm-btn ${mode === 'overwrite' && confirmKey === 'import-overwrite' ? 'dm-btn-danger' : 'dm-btn-primary'}`}
              onClick={handleImport}
              disabled={!storageAvailable || busy}
              aria-label={mode === 'overwrite' ? '确认覆盖导入' : '确认导入'}
            >
              {mode === 'overwrite' && confirmKey === 'import-overwrite' ? '确认覆盖导入（本地将被替换）' : '确认导入'}
            </button>
          </div>
        )}
      </div>

      {/* ---------------- 重置 ---------------- */}
      <div className="dm-block dm-block-danger">
        <div className="dm-block-head">
          <span className="dm-block-title">③ 重置本地数据</span>
          <button
            type="button"
            className={`dm-btn ${confirmKey === 'reset' ? 'dm-btn-danger' : 'dm-btn-quiet'}`}
            onClick={handleReset}
            disabled={!storageAvailable}
            aria-label={confirmKey === 'reset' ? '确认重置本地数据' : '重置本地数据'}
          >
            {confirmKey === 'reset' ? '确认重置（不可撤销）' : '重置'}
          </button>
        </div>
        <p className="dm-note">清空衣橱、偏好、收藏与主题偏好，不影响系统单品目录。建议先导出备份。</p>
      </div>

      {/* ---------------- 状态 ---------------- */}
      <div className={`dm-status ${status.kind === 'idle' ? '' : `is-${status.kind}`}`} role="status" aria-live="polite">
        {status.text}
        {status.lines.length > 0 && (
          <ul className="dm-status-lines">
            {status.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>

      {status.kind === 'ok' && status.text.includes('已清空') && (
        <button type="button" className="dm-btn dm-btn-quiet" onClick={handleReload} aria-label="刷新页面">
          刷新页面
        </button>
      )}
    </div>
  )
}

export default DataManager

// 偏好面板（PHASE1-CONTRACT §4 的"查看与重置"UI）。
//
// 本文件导出两个组件：
//   PreferencePanel           —— 受控/展示型，状态由调用方(App)持有。推荐卡里的
//                                 喜欢/不喜欢按钮与这里必须共用同一份状态，所以
//                                 生产路径应该用这个，避免两处各自持有副本互相覆盖。
//   PreferencePanelStandalone —— 自己调 usePreferences()，可直接 <PreferencePanelStandalone />
//                                 挂载使用（例如尚未接入 App 时）。
//
// 颜色纪律：只用 styles.css 既有令牌 + --pref-* 前缀令牌，不出现颜色字面量。

import { useCallback, useMemo, useState } from 'react'
import {
  DELTA_LIMIT,
  FEEDBACK_KINDS,
  FEEDBACK_REASONS,
  STEP_LIMIT,
  WEIGHT_LIMIT,
  reasonLabel,
} from '../data/preferences.js'
import { usePreferences } from '../hooks/usePreferences.js'
import '../styles/preferences.css'

const KIND_LABELS = { like: '喜欢', dislike: '不喜欢', worn: '穿过' }
const KIND_HINTS = {
  like: `记录为正向偏好，参与单品每次 +${STEP_LIMIT}（累计最多 +${WEIGHT_LIMIT}）`,
  dislike: `记录为负向偏好，参与单品每次 -${STEP_LIMIT}（累计最多 -${WEIGHT_LIMIT}）`,
  worn: '记录"实际穿过"，是比点赞更弱的正向信号（+1）',
}

function WeightBar({ value }) {
  const width = Math.min(100, Math.abs(value) / WEIGHT_LIMIT * 100)
  const tone = value > 0 ? 'up' : 'down'
  return (
    <span className="pref-bar" aria-hidden="true">
      <i className={`pref-bar-fill ${tone}`} style={{ width: `${width}%` }} />
    </span>
  )
}

export function PreferencePanel({
  outfit,
  summary,
  isEmpty = true,
  delta = 0,
  recordFeedback,
  onReset,
  disabled = false,
}) {
  const [pendingKind, setPendingKind] = useState(null)
  const [reasons, setReasons] = useState([])
  const [notice, setNotice] = useState('')
  const [confirmingReset, setConfirmingReset] = useState(false)

  const safeSummary = summary && typeof summary === 'object' ? summary : null
  const byKind = safeSummary?.byKind || { like: 0, dislike: 0, worn: 0 }
  const total = Number.isFinite(safeSummary?.total) ? safeSummary.total : 0
  const liked = Array.isArray(safeSummary?.liked) ? safeSummary.liked : []
  const disliked = Array.isArray(safeSummary?.disliked) ? safeSummary.disliked : []
  const topReasons = Array.isArray(safeSummary?.reasons) ? safeSummary.reasons : []

  const toggleReason = useCallback((value) => {
    setReasons((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }, [])

  const submit = useCallback((kind) => {
    if (typeof recordFeedback !== 'function') return
    recordFeedback({ kind, outfit, reasons })
    setNotice(`已记录「${KIND_LABELS[kind]}」${reasons.length > 0 ? `（${reasons.map(reasonLabel).join('、')}）` : ''}`)
    setPendingKind(null)
    setReasons([])
  }, [outfit, reasons, recordFeedback])

  const doReset = useCallback(() => {
    if (typeof onReset !== 'function') return
    onReset()
    setConfirmingReset(false)
    setPendingKind(null)
    setReasons([])
    setNotice('已重置全部偏好：反馈记录与权重都清空了')
  }, [onReset])

  const deltaTone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  return (
    <section className="pref-panel" aria-labelledby="pref-panel-title">
      <header className="pref-head">
        <div>
          <span className="pref-eyebrow">偏好学习</span>
          <h3 id="pref-panel-title">告诉系统你喜欢什么，它会越用越准</h3>
        </div>
        <span className={`pref-delta ${deltaTone}`} title={`当前造型的排序修正，夹在 ±${DELTA_LIMIT}`}>
          修正 <b>{delta > 0 ? `+${delta}` : delta}</b>
        </span>
      </header>

      <fieldset className="pref-fieldset" disabled={disabled}>
        <legend>对当前这套造型的反馈</legend>
        <div className="pref-kinds">
          {FEEDBACK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`pref-chip kind-${kind} ${pendingKind === kind ? 'on' : ''}`}
              aria-pressed={pendingKind === kind}
              aria-describedby={`pref-hint-${kind}`}
              onClick={() => setPendingKind((current) => (current === kind ? null : kind))}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        <p className="pref-hint" id="pref-hint-like">{KIND_HINTS.like}</p>
        <p className="pref-hint" id="pref-hint-dislike">{KIND_HINTS.dislike}</p>
        <p className="pref-hint" id="pref-hint-worn">{KIND_HINTS.worn}</p>

        <div className="pref-reasons" role="group" aria-label="反馈原因（可选，可多选）">
          <span className="pref-sublabel">原因（可选）</span>
          <div className="pref-chips">
            {FEEDBACK_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                className={`pref-chip ${reasons.includes(reason.value) ? 'on' : ''}`}
                aria-pressed={reasons.includes(reason.value)}
                onClick={() => toggleReason(reason.value)}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pref-actions">
          <button
            type="button"
            className="pref-submit"
            disabled={!pendingKind}
            onClick={() => submit(pendingKind)}
          >
            {pendingKind ? `提交「${KIND_LABELS[pendingKind]}」` : '先选一个反馈类型'}
          </button>
          {reasons.length > 0 && (
            <button type="button" className="pref-link" onClick={() => setReasons([])}>
              清空原因（{reasons.length}）
            </button>
          )}
        </div>
      </fieldset>

      <p className="pref-notice" role="status" aria-live="polite">{notice}</p>

      <div className="pref-view">
        <div className="pref-view-head">
          <span className="pref-sublabel">已学习到的偏好</span>
          <span className="pref-count">{total} 条反馈</span>
        </div>

        {isEmpty || total === 0 ? (
          <p className="pref-empty">
            还没有任何反馈。去上面的推荐卡点几次「喜欢 / 不喜欢」，或者直接对当前造型反馈一次。
          </p>
        ) : (
          <>
            <ul className="pref-kind-stats">
              {FEEDBACK_KINDS.map((kind) => (
                <li key={kind}>
                  <b>{byKind[kind] || 0}</b><span>{KIND_LABELS[kind]}</span>
                </li>
              ))}
            </ul>

            {liked.length > 0 && (
              <div className="pref-group">
                <b>明显偏好</b>
                <ul className="pref-tags">
                  {liked.map((item) => (
                    <li key={item.id}>
                      <span className="pref-tag-name">{item.name}</span>
                      <WeightBar value={item.score} />
                      <span className="pref-tag-score">+{item.score}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {disliked.length > 0 && (
              <div className="pref-group">
                <b>明显排斥</b>
                <ul className="pref-tags">
                  {disliked.map((item) => (
                    <li key={item.id}>
                      <span className="pref-tag-name">{item.name}</span>
                      <WeightBar value={item.score} />
                      <span className="pref-tag-score">{item.score}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topReasons.length > 0 && (
              <div className="pref-group">
                <b>最常选的原因</b>
                <ul className="pref-tags compact">
                  {topReasons.map((reason) => (
                    <li key={reason.value}>
                      <span className="pref-tag-name">{reason.label}</span>
                      <span className="pref-tag-score">{reason.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="pref-reset">
          {confirmingReset ? (
            <>
              <span className="pref-warn">重置会清空全部反馈与权重，不可撤销。</span>
              <button type="button" className="pref-danger" onClick={doReset}>确认重置</button>
              <button type="button" className="pref-link" onClick={() => setConfirmingReset(false)}>取消</button>
            </>
          ) : (
            <button
              type="button"
              className="pref-link danger"
              disabled={isEmpty || typeof onReset !== 'function'}
              onClick={() => setConfirmingReset(true)}
            >
              重置全部偏好
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** 自带 store 的包装：给尚未在 App 里提升状态的场景直接用。 */
export function PreferencePanelStandalone(props) {
  const { summary, isEmpty, items, recordFeedback, deltaOf, reset } = usePreferences(props.personalItems)
  const delta = useMemo(
    () => (props.outfit ? deltaOf(props.outfit) : 0),
    [deltaOf, props.outfit],
  )
  const merged = useMemo(() => ({ summary, isEmpty, recordFeedback, onReset: reset, items }), [summary, isEmpty, recordFeedback, reset, items])
  return <PreferencePanel {...props} {...merged} delta={props.delta ?? delta} />
}

export default PreferencePanel

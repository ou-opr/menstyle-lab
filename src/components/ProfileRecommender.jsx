import { useMemo, useState } from 'react'
import { byId, TOPS, OUTERS, BOTTOMS, SHOES, ACCS } from '../data/catalog'
import { PLATFORMS, SOURCES } from '../data/sources'
import { PROFILE_OPTIONS, recommendOutfits } from '../data/recommendations'
import { rankWithPersonalWardrobe } from '../data/personalRecommendations'
import { IconCheck, IconThumbDown, IconThumbUp } from './icons'

export const DEFAULT_PROFILE = { height: 175, body: 'standard', season: 'autumn', occasion: 'casual' }

const FEEDBACK_BUTTONS = [
  { kind: 'like', label: '喜欢', Icon: IconThumbUp },
  { kind: 'dislike', label: '不喜欢', Icon: IconThumbDown },
  { kind: 'worn', label: '穿过', Icon: IconCheck },
]

const outfitNames = (outfit) => [
  byId(TOPS, outfit.top)?.name,
  outfit.outer === 'o-none' ? null : byId(OUTERS, outfit.outer)?.name,
  byId(BOTTOMS, outfit.bottom)?.name,
  byId(SHOES, outfit.shoes)?.name,
  ...(Array.isArray(outfit.accs) ? outfit.accs.map((id) => byId(ACCS, id)?.name) : []),
].filter(Boolean)

const sourceOf = (id) => SOURCES.find((item) => item.id === id)

/** 只取五个槽位：个人化之后槽位里可能是 u- 单品，必须原样带上交给 3D。 */
const outfitOf = (item) => ({
  top: item.top,
  outer: item.outer,
  bottom: item.bottom,
  shoes: item.shoes,
  accs: Array.isArray(item.accs) ? [...item.accs] : [],
})

export function ProfileRecommender({ onTry, wardrobe, preferences, profile: profileProp, onProfileChange }) {
  // 受控用法：身高/体型由 App 持有，因为 3D 试衣间必须按同一份参数缩放模特，
  // 不能让「方案」和「模型」各存一份。不传 props 时退回内部 state，保持单独可用。
  const [innerProfile, setInnerProfile] = useState(DEFAULT_PROFILE)
  const controlled = Boolean(profileProp) && typeof onProfileChange === 'function'
  const profile = controlled ? profileProp : innerProfile
  const [results, setResults] = useState(() => recommendOutfits(profile))
  const [notice, setNotice] = useState('')

  const wardrobeState = wardrobe?.state
  const canFeedback = typeof preferences?.recordFeedback === 'function'

  // rankWithPersonalWardrobe 读的是**顶层**槽位（见 scripts/test-preferences.mjs 的调用形状），
  // 而 recommendOutfits 把造型放在 .outfit 上，所以先把两层摊平再排序。
  const ranked = useMemo(() => {
    const flat = results.map((result) => ({
      ...result,
      ...result.outfit,
      accs: Array.isArray(result.outfit?.accs) ? [...result.outfit.accs] : [],
    }))
    return rankWithPersonalWardrobe(flat, wardrobeState, preferences?.preferences)
  }, [results, wardrobeState, preferences])

  const change = (key, value) => {
    const next = { ...profile, [key]: value }
    if (controlled) onProfileChange(next)
    else setInnerProfile(next)
  }
  const submit = (event) => {
    event.preventDefault()
    setResults(recommendOutfits(profile))
    setNotice('')
  }

  const sendFeedback = (item, kind) => {
    if (!canFeedback) return
    preferences.recordFeedback({ kind, outfit: outfitOf(item), reasons: [] })
    const label = FEEDBACK_BUTTONS.find((button) => button.kind === kind)?.label || kind
    setNotice(`已记录「${label}」：${item.name}。排序会随你的反馈调整。`)
  }

  return (
    <div className="profile-planner">
      <form className="profile-form" onSubmit={submit}>
        <div className="profile-form-head">
          <span className="eyebrow">你的条件</span>
          <h3>先告诉我，你要为谁、在什么时候穿</h3>
          <p>系统会综合比例、体型、温度和场合，优先从你自己的衣橱里挑出最合适的三套。</p>
        </div>

        <label>
          <span>身高</span>
          <div className="height-input">
            <input type="number" min="150" max="210" value={profile.height}
              onChange={(event) => change('height', event.target.value)} />
            <b>cm</b>
          </div>
        </label>
        <label>
          <span>体型</span>
          <select value={profile.body} onChange={(event) => change('body', event.target.value)}>
            {PROFILE_OPTIONS.bodies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>季节</span>
          <select value={profile.season} onChange={(event) => change('season', event.target.value)}>
            {PROFILE_OPTIONS.seasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>场景</span>
          <select value={profile.occasion} onChange={(event) => change('occasion', event.target.value)}>
            {PROFILE_OPTIONS.occasions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <button className="generate-btn" type="submit">生成三套造型 →</button>
        <small>评分是搭配优先级，不是对身材或个人风格的评价。</small>
        {!canFeedback && <small>加入个人衣橱后，推荐会优先使用你已有的单品。</small>}
      </form>

      <div className="recommendation-list" aria-live="polite">
        {notice && <p className="po-feedback-note" role="status">{notice}</p>}

        {ranked.map((result, index) => {
          const outfit = outfitOf(result)
          const ownedRatio = Number.isFinite(result.ownedRatio) ? result.ownedRatio : null
          const missing = Array.isArray(result.missing) ? result.missing : []
          const delta = Number.isFinite(result.preferenceDelta) ? result.preferenceDelta : 0
          const score = Number.isFinite(result.personalScore) ? result.personalScore : result.score

          return (
            <article className="recommendation-card" key={result.id}>
              <div className="rec-topline">
                <span className="rec-rank">方案 {index + 1}</span>
                <span className="rec-score"><b>{score}</b><small>/100</small></span>
              </div>
              <h3>{result.name}<em>{result.mood}</em></h3>
              <p className="rec-items">{outfitNames(outfit).join(' · ')}</p>

              {ownedRatio !== null && (
                <div className="po-owned">
                  <span>已有占比 <b>{Math.round(ownedRatio * 100)}%</b></span>
                  <span className="po-owned-meter" aria-hidden="true">
                    <i style={{ width: `${Math.round(ownedRatio * 100)}%` }} />
                  </span>
                  {delta !== 0 && <span>偏好修正 <b>{delta > 0 ? `+${delta}` : delta}</b></span>}
                </div>
              )}

              {missing.length > 0 && (
                <p className="po-missing">
                  <b>建议补充</b>：{missing.map((entry) => entry.name).join('、')}
                </p>
              )}

              <div className="rec-block">
                <b>为什么适合你</b>
                <ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </div>
              <div className={`rec-block risks ${result.warnings.length ? '' : 'safe'}`}>
                <b>{result.warnings.length ? '穿搭雷区' : '雷区检查'}</b>
                {result.warnings.length
                  ? <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  : <p>暂无明显冲突，保持衣服平整和鞋面干净即可。</p>}
              </div>

              <div className="rec-sources">
                <b>参考来源</b>
                {result.sourceIds.map(sourceOf).filter(Boolean).map((source) => (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" key={source.id}>
                    {PLATFORMS[source.platform].name} · {source.creator} ↗
                  </a>
                ))}
              </div>

              {canFeedback && (
                <div className="po-feedback" role="group" aria-label={`对「${result.name}」的反馈`}>
                  {FEEDBACK_BUTTONS.map((button) => (
                    <button key={button.kind} type="button" onClick={() => sendFeedback(result, button.kind)}>
                      <button.Icon />
                      <span>{button.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <button className="try-look" type="button" onClick={() => onTry(outfit)}>在 3D 试衣间试穿</button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default ProfileRecommender

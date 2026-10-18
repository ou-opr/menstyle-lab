// 智能替换（PHASE1-CONTRACT §5 的 UI）。
//
// 契约 §7：替换成功仍通过 App 的 setOutfit 落地——本组件不直接改造型，
// 只把选中的单品 id 交给 onApply(slot, itemId)。
//
// 颜色纪律：只用 styles.css 既有令牌 + --pref-* 前缀令牌，不出现颜色字面量。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { byId, TOPS, OUTERS, BOTTOMS, SHOES, ACCS } from '../data/catalog.js'
import { INTENTS, INTENT_LABELS, SLOT_LABELS, SLOTS, applyReplacement, findSmartReplacements } from '../data/personalRecommendations.js'
import '../styles/preferences.css'

const LIST_BY_SLOT = { top: TOPS, outer: OUTERS, bottom: BOTTOMS, shoes: SHOES, accs: ACCS }

const itemName = (slot, id) => (id ? byId(LIST_BY_SLOT[slot] || [], id)?.name || id : null)

const outfitLine = (outfit) =>
  [
    itemName('top', outfit.top),
    outfit.outer && outfit.outer !== 'o-none' ? itemName('outer', outfit.outer) : null,
    itemName('bottom', outfit.bottom),
    itemName('shoes', outfit.shoes),
    ...(Array.isArray(outfit.accs) ? outfit.accs.map((id) => itemName('accs', id)) : []),
  ].filter(Boolean).join(' · ')

function Swatch({ hex, label }) {
  // 透明外套（o-none 的 hex 是 #00000000）用斜纹表示"无"，与 App 的既有写法一致
  const background = !hex || /^#0{8}$/i.test(hex)
    ? 'repeating-linear-gradient(45deg,var(--line),var(--line) 4px,var(--card) 4px,var(--card) 8px)'
    : hex
  return <i className="pref-swatch" style={{ background }} aria-hidden="true" title={label || undefined} />
}

export function SmartReplace({
  outfit,
  wardrobeState,
  preferences,
  onApply,
  defaultSlot = 'top',
  defaultIntent = 'subtle',
  limit = 6,
  disabled = false,
}) {
  const [slot, setSlot] = useState(SLOTS.includes(defaultSlot) ? defaultSlot : 'top')
  const [intent, setIntent] = useState(INTENTS.includes(defaultIntent) ? defaultIntent : 'subtle')
  const [applied, setApplied] = useState('')

  const safeOutfit = useMemo(
    () => ({
      top: outfit?.top ?? null,
      outer: outfit?.outer ?? 'o-none',
      bottom: outfit?.bottom ?? null,
      shoes: outfit?.shoes ?? null,
      accs: Array.isArray(outfit?.accs) ? outfit.accs : [],
    }),
    [outfit],
  )

  const results = useMemo(
    () => findSmartReplacements({ outfit: safeOutfit, slot, intent, wardrobeState, preferences, limit }),
    [safeOutfit, slot, intent, wardrobeState, preferences, limit],
  )

  // 换槽位/换意图后旧提示就过期了，清掉避免误导
  useEffect(() => setApplied(''), [slot, intent])

  const apply = useCallback((itemId) => {
    if (typeof onApply !== 'function') return
    onApply(slot, itemId, applyReplacement(safeOutfit, slot, itemId))
    setApplied(`已把${SLOT_LABELS[slot]}换成「${itemName(slot, itemId)}」`)
  }, [onApply, safeOutfit, slot])

  return (
    <section className="pref-replace" aria-labelledby="pref-replace-title">
      <header className="pref-head">
        <div>
          <span className="pref-eyebrow">智能替换</span>
          <h3 id="pref-replace-title">想换一件？说需求，我给你排序</h3>
        </div>
      </header>

      <p className="pref-current">当前：{outfitLine(safeOutfit) || '空造型'}</p>

      <fieldset className="pref-fieldset" disabled={disabled}>
        <legend>要换哪个部位</legend>
        <div className="pref-chips" role="group" aria-label="选择替换部位">
          {SLOTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`pref-chip ${slot === value ? 'on' : ''}`}
              aria-pressed={slot === value}
              onClick={() => setSlot(value)}
            >
              {SLOT_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pref-fieldset" disabled={disabled}>
        <legend>想要什么效果</legend>
        <div className="pref-chips" role="group" aria-label="选择替换意图">
          {INTENTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`pref-chip ${intent === value ? 'on' : ''}`}
              aria-pressed={intent === value}
              onClick={() => setIntent(value)}
            >
              {INTENT_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="pref-notice" role="status" aria-live="polite">{applied}</p>

      <div className="pref-results" aria-live="polite">
        <span className="pref-count" role="status">共 {results.length} 个候选</span>

        {results.length === 0 ? (
          <p className="pref-empty">
            这个诉求下没有安全候选。试试换一个部位或意图；「只用我有的」在衣橱里没有该部位单品时也会是空的。
          </p>
        ) : (
          <ul className="pref-result-list">
            {results.map((entry) => {
              const isCurrent = slot === 'accs'
                ? safeOutfit.accs.includes(entry.item.id)
                : safeOutfit[slot] === entry.item.id
              return (
                <li key={entry.item.id} className={`pref-result ${entry.owned ? 'owned' : ''}`}>
                  <div className="pref-result-head">
                    <Swatch hex={entry.item.hex} label={entry.item.name} />
                    <div className="pref-result-title">
                      <b>{entry.item.name}</b>
                      <span className="pref-result-meta">
                        {entry.owned ? '我的衣橱' : '建议补充'}
                        {entry.item.formality !== null && ` · 正式度 ${entry.item.formality}`}
                        {entry.item.warmth !== null && ` · 保暖 ${entry.item.warmth}`}
                      </span>
                    </div>
                    <span className={`pref-tag-score ${entry.scoreDelta >= 0 ? 'up' : 'down'}`}>
                      {entry.scoreDelta > 0 ? `+${entry.scoreDelta}` : entry.scoreDelta}
                    </span>
                  </div>

                  <ul className="pref-reason-list">
                    {entry.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>

                  <button
                    type="button"
                    className="pref-apply"
                    disabled={isCurrent || typeof onApply !== 'function'}
                    onClick={() => apply(entry.item.id)}
                  >
                    {isCurrent ? '已是当前单品' : `换成这件`}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

export default SmartReplace

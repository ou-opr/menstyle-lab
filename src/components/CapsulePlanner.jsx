// 胶囊衣橱（PHASE2-CONTRACT §5）。
//
// 这个面板的立场是「少而够」：不追求把 59 件都塞进去，而是算出一组
// 互相能搭、覆盖场合、件数在 12–20 之间的核心单品，并明确告诉你还缺什么。
//
// 因此界面上有两件事必须一眼看到：
//   1) 每件被选中单品的「覆盖率」——它在多少套可行造型里出现；
//   2) 缺口（gaps）与补齐建议（missing）分开显示：缺口是事实，建议是选项。
// 想买（wishlist）的单品只作为补齐候选出现，绝不混进「已入选」里冒充已有。

import { memo, useId, useMemo, useState } from 'react'
import {
  CAPSULE_MAX,
  CAPSULE_MIN,
  DEFAULT_TARGET,
  OCCASIONS,
  OCCASION_LABELS,
  SEASONS,
  SEASON_LABELS,
  SLOTS,
  SLOT_LABELS,
  planCapsule,} from '../data/capsule.js'
import { SLOT_TO_CATEGORY } from '../data/wardrobe.js'
import '../styles/capsule.css'

const OWNERSHIP_LABELS = { owned: '已有', wishlist: '想买', system: '系统参考' }

/** 补齐建议默认展示条数；其余折叠，避免空衣橱时这一节长到几千像素。 */
const MISSING_PREVIEW = 6

export const CapsulePlanner = memo(function CapsulePlanner({ wardrobe, onTry, onAddWishlist }) {
  const [season, setSeason] = useState('autumn')
  const [occasion, setOccasion] = useState('work')
  const [target, setTarget] = useState(DEFAULT_TARGET)
  // 空衣橱时补齐建议能有三十多条，全展开会让这一节比整页还长；先给前几条，其余按需展开。
  const [showAllMissing, setShowAllMissing] = useState(false)
  // 「显示全部补齐建议」按钮与它控制的 <ol> 配对：只有 aria-expanded 时，
  // 读屏用户听到「已展开」却不知道展开的是哪一块。
  const missingListId = useId()

  const plan = useMemo(() => {
    try {
      return planCapsule({ season, occasion, target, wardrobe: wardrobe.state })
    } catch (error) {
      console.warn('STYLE LAB: 胶囊衣橱计算失败，已跳过本次结果', error)
      return null
    }
  }, [season, occasion, target, wardrobe.state])

  const bySlot = useMemo(() => {
    const map = {}
    for (const slot of SLOTS) map[slot] = []
    for (const item of (plan ? plan.selected : [])) {
      if (!map[item.slot]) map[item.slot] = []
      map[item.slot].push(item)
    }
    return map
  }, [plan])

  /** 用胶囊里每槽位覆盖率最高的那件拼一套试穿（配饰最多两件）。 */
  const tryCapsule = () => {
    if (!plan) return
    const pick = (slot, take = 1) => bySlot[slot].slice(0, take).map((i) => i.id)
    const accs = pick('accs', 2)
    onTry({
      top: pick('top')[0] || 't-white',
      outer: pick('outer')[0] || 'o-none',
      bottom: pick('bottom')[0] || 'b-jeans-d',
      shoes: pick('shoes')[0] || 's-white',
      accs,
    })
  }

  return (
    <div className="cap">
      <div className="cap-controls">
        <fieldset className="cap-field">
          <legend>季节</legend>
          <div className="cap-chips">
            {SEASONS.map((key) => (
              <button
                key={key}
                type="button"
                className={`cap-chip${season === key ? ' on' : ''}`}
                aria-pressed={season === key}
                onClick={() => setSeason(key)}
              >
                {SEASON_LABELS[key]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="cap-field">
          <legend>主要场合</legend>
          <div className="cap-chips">
            {OCCASIONS.map((key) => (
              <button
                key={key}
                type="button"
                className={`cap-chip${occasion === key ? ' on' : ''}`}
                aria-pressed={occasion === key}
                onClick={() => setOccasion(key)}
              >
                {OCCASION_LABELS[key]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="cap-field">
          <label className="cap-label" htmlFor="cap-target">目标件数</label>
          <input
            id="cap-target"
            className="cap-range"
            type="range"
            min={CAPSULE_MIN}
            max={CAPSULE_MAX}
            step={1}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
            aria-valuetext={`${target} 件`}
          />
          <output className="cap-target" htmlFor="cap-target">{target} 件</output>
          <button type="button" className="cap-btn ghost" onClick={tryCapsule} disabled={!plan}>
            用这套胶囊搭一套
          </button>
        </div>

        {wardrobe.summary && wardrobe.summary.owned === 0 ? (
          <p className="cap-note warn">你的衣橱里还没有「已有」单品，下面全是建议购买清单。</p>
        ) : null}
      </div>

      {plan ? (
        <>
          <div className="cap-stats">
            <div className="cap-stat"><b>{plan.stats.selectedCount}</b><span>入选 / 目标 {plan.target}</span></div>
            <div className="cap-stat">
              <b>{plan.combinationExact ? plan.combinationCount : `${plan.combinationCount}+`}</b>
              <span>可组成造型</span>
            </div>
            <div className="cap-stat"><b>{Math.round(plan.stats.averageCoverage * 100)}%</b><span>平均覆盖率</span></div>
            <div className="cap-stat"><b>{plan.stats.missingCount}</b><span>件待补</span></div>
          </div>

          {plan.warnings.slice(0, 4).map((w) => <p className="cap-note warn" key={w} role="status">{w}</p>)}

          <h3 className="cap-h3">{plan.seasonLabel} · {plan.occasionLabel} 核心清单</h3>

          {plan.selected.length === 0 ? <p className="cap-note">还没有可选的核心单品，先看看下面的补齐建议。</p> : null}

          <div className="cap-slots">
            {SLOTS.map((slot) => (
              bySlot[slot] && bySlot[slot].length > 0 ? (
                <div className="cap-slot" key={slot}>
                  <h4 className="cap-h4">{SLOT_LABELS[slot]}（{bySlot[slot].length}）</h4>
                  <ul className="cap-items">
                    {bySlot[slot].map((item) => (
                      <li className="cap-item" key={item.id}>
                        <i style={{ background: item.hex }} aria-hidden="true" />
                        <span className="cap-name">{item.name}</span>
                        <span className="cap-badge">{OWNERSHIP_LABELS[item.ownership] || item.ownership}</span>
                        <span className="cap-cov" title="在多少套可行造型里出现">{Math.round(item.coverageRatio * 100)}%</span>
                        <p className="cap-reason">{item.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            ))}
          </div>

          <h3 className="cap-h3">缺口</h3>
          <table className="cap-gaps">
            <caption className="cap-dim">每个槽位的目标件数、现有件数与缺口</caption>
            <thead>
              <tr><th scope="col">槽位</th><th scope="col">目标</th><th scope="col">已有</th><th scope="col">缺口</th></tr>
            </thead>
            <tbody>
              {plan.gaps.map((gap) => (
                <tr key={gap.slot} className={gap.required && gap.deficit > 0 ? 'urgent' : ''}>
                  <th scope="row">{SLOT_LABELS[gap.slot] || gap.slot}{gap.required ? ' *' : ''}</th>
                  <td>{gap.target}</td>
                  <td>{gap.have}</td>
                  <td>{gap.deficit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap-dim">带 * 的是必补槽位（上装 / 下装 / 鞋履，冷季还有外套）。</p>

          <h3 className="cap-h3">补齐建议（按优先级）</h3>
          {plan.missing.length === 0 ? (
            <p className="cap-note ok">这套胶囊已经够用了，暂时没有需要补的。</p>
          ) : (
            <ol className="cap-missing" id={missingListId}>
              {(showAllMissing ? plan.missing : plan.missing.slice(0, MISSING_PREVIEW)).map((item) => (
                <li className="cap-miss" key={item.id}>
                  <div className="cap-miss-head">
                    <i style={{ background: item.hex }} aria-hidden="true" />
                    <b>{item.name}</b>
                    <span className="cap-badge">{OWNERSHIP_LABELS[item.ownership] || item.ownership}</span>
                    <span className="cap-cov" title="优先级越高越该先买">优先级 {item.priority}</span>
                  </div>
                  <p className="cap-reason">{item.reason}</p>
                  <div className="cap-miss-actions">
                    {item.slot && onAddWishlist && item.ownership !== 'owned' ? (
                      <button
                        type="button"
                        className="cap-btn ghost"
                        onClick={() => onAddWishlist({
                          name: item.name,
                          category: SLOT_TO_CATEGORY[item.slot] || 'tops',
                          status: 'wishlist',
                          hex: item.hex,
                          family: item.family,
                          formality: item.formality,
                          warmth: item.warmth,
                          mesh: item.mesh,
                          notes: item.tip || '',
                          tags: ['胶囊衣橱'],
                        })}
                      >
                        加入想买清单
                      </button>
                    ) : null}
                    <button type="button" className="cap-btn" onClick={() => onTry({ top: 't-white', outer: 'o-none', bottom: 'b-jeans-d', shoes: 's-white', accs: [], ...(item.slot ? { [item.slot]: item.id } : {}) })}>
                      试穿这件
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {plan.missing.length > MISSING_PREVIEW ? (
            <button
              type="button"
              className="cap-btn ghost cap-more"
              aria-expanded={showAllMissing}
              aria-controls={missingListId}
              onClick={() => setShowAllMissing((v) => !v)}
            >
              {showAllMissing ? '收起补齐建议' : `显示全部 ${plan.missing.length} 条补齐建议`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="cap-note warn">胶囊计算失败，请刷新页面重试（不影响其它功能）。</p>
      )}
    </div>
  )
})

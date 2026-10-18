// 多套造型并排对比（PHASE3-CONTRACT §2）。
//
// 只负责把 compareOutfits 算出来的数字摊成一张表：每一次判断「谁更好」
// 都发生在 data/collage.js 里，这里不重复实现任何指标口径，
// 否则界面和测试会各自长出一套「最优」定义。
import { useMemo } from 'react'
import { MAX_COMPARE, MIN_COMPARE, compareOutfits } from '../data/collage'
import { IconScale } from './icons'
import '../styles/collage.css'

function NameList({ look }) {
  const names = (look.palette || []).slice(0, 4).map((entry) => entry.label)
  return (
    <ul className="cmp-names">
      {names.map((name, index) => (
        <li key={name + index}>{name}</li>
      ))}
      {(look.palette || []).length > 4 ? <li className="cmp-names-more">…等 {look.palette.length} 件</li> : null}
    </ul>
  )
}

export function ComparePanel({ looks, wardrobe, activeIndex = -1, onPick, onRemove, onTry }) {
  const list = Array.isArray(looks) ? looks : []
  const result = useMemo(
    () => compareOutfits(list, { wardrobe }),
    [list, wardrobe],
  )

  if (list.length < MIN_COMPARE) {
    return (
      <section className="cmp-panel" aria-label="多套对比">
        <h4><IconScale /> 多套对比</h4>
        <p className="cmp-empty">
          在「分享与收藏」里至少收藏 {MIN_COMPARE} 套造型，这里就能把它们并排比一比（最多 {MAX_COMPARE} 套）。
        </p>
      </section>
    )
  }

  if (!result.ok) {
    return (
      <section className="cmp-panel" aria-label="多套对比">
        <h4><IconScale /> 多套对比</h4>
        <p className="cmp-empty">{result.error || '暂时无法对比这几套造型。'}</p>
      </section>
    )
  }

  return (
    <section className="cmp-panel" aria-label="多套对比">
      <div className="cmp-head">
        <h4><IconScale /> 多套对比</h4>
        <span className="cmp-hint">每项最优已高亮；「配色数」和「缺件」越少越好</span>
      </div>

      <div className="cmp-scroll">
        <table className="cmp-table">
          <caption className="sr-only">
            已收藏造型的对比表，{result.looks.length} 套造型 × {result.metrics.length} 项指标
          </caption>
          <thead>
            <tr>
              <th scope="col">指标</th>
              {result.looks.map((look) => (
                <th
                  key={look.index}
                  scope="col"
                  className={look.index === activeIndex ? 'is-active' : ''}
                >
                  <span className="cmp-look-name">{look.title}</span>
                  {look.index === result.bestOverall ? <span className="cmp-crown" title="综合最好">综合最好</span> : null}
                  <NameList look={look} />
                  <span className="cmp-actions">
                    {typeof onPick === 'function' ? (
                      <button type="button" className="cmp-btn" onClick={() => onPick(look.index)}>
                        设为当前
                      </button>
                    ) : null}
                    {typeof onTry === 'function' ? (
                      <button type="button" className="cmp-btn" onClick={() => onTry(look.outfit)}>
                        试穿
                      </button>
                    ) : null}
                    {typeof onRemove === 'function' && list[look.index]?.id ? (
                      <button
                        type="button"
                        className="cmp-btn cmp-btn-del"
                        aria-label={'移除 ' + look.title}
                        onClick={() => onRemove(list[look.index].id)}
                      >
                        移除
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.metrics.map((metric) => (
              <tr key={metric.key}>
                <th scope="row">
                  {metric.label}
                  <span className="cmp-direction">{metric.direction === 'lower' ? '越少越好' : '越高越好'}</span>
                </th>
                {metric.values.map((value) => (
                  <td
                    key={value.lookIndex}
                    className={`${value.best ? 'is-best' : ''} ${value.lookIndex === activeIndex ? 'is-active' : ''}`.trim()}
                  >
                    {value.display}
                    {value.best ? <span className="sr-only">（本项最优）</span> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.warnings.length ? (
        <p className="cmp-note">{result.warnings.join('；')}</p>
      ) : null}
    </section>
  )
}

export default ComparePanel

import { useMemo } from 'react'
import { getAdvice } from '../data/advice'
import { byId, TOPS, OUTERS, BOTTOMS, SHOES, ACCS } from '../data/catalog'
import { SOURCES } from '../data/sources'
import { IconAlert, IconLightbulb, IconScissors } from './icons'

const srcOf = (id) => SOURCES.find((s) => s.id === id)

function Sug({ s, onApply }) {
  const src = s.src ? srcOf(s.src) : null
  const srcText = src ? `思路来自 ${src.creator}（${src.platform === 'bilibili' ? 'B站' : src.platform}）` : ''
  return (
    <li className="sug">
      <b>{s.title}</b>
      <p>{s.why}</p>
      <div className="meta" title={srcText || '本条建议来自通用搭配经验总结'}
        aria-label={srcText || '本条建议来自通用搭配经验总结'}>
        {src ? <><IconLightbulb /> {srcText}</> : null}
      </div>
      {s.applyId && (
        <button className="apply" type="button" title={`采纳建议：${s.title}`}
          aria-label={`采纳建议「${s.title}」，直接换到这套造型里`}
          onClick={() => onApply(s.applyId)}>试试这件 →</button>
      )}
    </li>
  )
}

/* 建议条目用原生 ul>li 表达列表语义，而不是 div + role="listitem"：
   后者缺少 role="list" 祖先会触发 axe 的 aria-required-children 违规。
   .sug-list 已在 styles.css 里重置了 list-style 与内边距，视觉不变。 */
function Card({ title, warn, children }) {
  const empty = !children || children.length === 0
  return (
    <div className="advice-card">
      <h3 className={warn ? 'warn-h' : ''}><span className="dot" />{title}</h3>
      <ul className="sug-list">
        {children}
        {empty && <li className="sug"><p style={{ color: 'var(--ink3)' }}>暂无建议</p></li>}
      </ul>
    </div>
  )
}

export function AdvicePanel({ outfit, setOutfit }) {
  const adv = useMemo(() => getAdvice(outfit), [outfit])

  const apply = (id) => {
    if (id.startsWith('b-')) setOutfit((o) => ({ ...o, bottom: id }))
    else if (id.startsWith('s-')) setOutfit((o) => ({ ...o, shoes: id }))
    else if (id.startsWith('o-')) setOutfit((o) => ({ ...o, outer: id }))
    else if (id.startsWith('t-')) setOutfit((o) => ({ ...o, top: id }))
    else if (id.startsWith('a-')) setOutfit((o) => ({ ...o, accs: o.accs.includes(id) ? o.accs : [...o.accs, id] }))
  }

  const current = [
    { k: '上装', v: byId(TOPS, outfit.top)?.name },
    { k: '外套', v: outfit.outer === 'o-none' ? '无' : byId(OUTERS, outfit.outer)?.name },
    { k: '下装', v: byId(BOTTOMS, outfit.bottom)?.name },
    { k: '鞋子', v: byId(SHOES, outfit.shoes)?.name },
    { k: '配饰', v: outfit.accs.map((a) => byId(ACCS, a)?.name).join('、') || '无' },
  ]

  return (
    <div>
      <div className="advice-card" style={{ marginBottom: 14 }}>
        <h3><span className="dot" />搭配体检</h3>
        <p style={{ fontSize: 14 }}>{adv.overall}</p>
        <p style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 6 }}>
          当前：{current.map((c) => `${c.k}·${c.v}`).join(' ｜ ')}
        </p>
      </div>
      <div className="advice-grid">
        <Card title="下装怎么配">
          {adv.bottomSugs.map((s, i) => <Sug key={i} s={s} onApply={apply} />)}
        </Card>
        <Card title="鞋子怎么配">
          {adv.shoeSugs.map((s, i) => <Sug key={i} s={s} onApply={apply} />)}
        </Card>
        <Card title="配饰点睛">
          {adv.accSugs.map((s, i) => <Sug key={i} s={s} onApply={apply} />)}
        </Card>
        <Card title={adv.warnings.length ? '雷区提醒' : '细节技巧'} warn={adv.warnings.length > 0}>
          {adv.warnings.map((w, i) => (
            <li key={'w' + i} className="sug warn"><b><IconAlert /> 注意</b><p>{w}</p></li>
          ))}
          {adv.tips.map((t, i) => (
            <li key={'t' + i} className="sug"><b><IconScissors /> 细节</b><p>{t}</p></li>
          ))}
          {/* 本卡片有两个子数组，Card 的 empty 判定（children.length）不适用，显式兜底 */}
          {adv.warnings.length === 0 && adv.tips.length === 0 && (
            <li className="sug"><p style={{ color: 'var(--ink3)' }}>这套搭配暂无雷点，很稳！</p></li>
          )}
        </Card>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, PRESETS } from '../data/catalog'
import { IconBolt, IconShirt } from './icons'

const TABS = [
  { key: 'top', label: '内搭上装', list: TOPS },
  { key: 'outer', label: '外套', list: OUTERS },
  { key: 'bottom', label: '裤装', list: BOTTOMS },
  { key: 'shoes', label: '鞋履', list: SHOES },
  { key: 'acc', label: '配饰', list: ACCS },
]

const subLabel = (it) => {
  if (it.ref) return `经典款参考：${it.ref}`
  if (it.tip) return it.tip
  if (it.note) return it.note
  if (it.formality === 3) return '正式 · 面试/商务'
  if (it.formality === 2) return '通勤 smart casual'
  if (it.formality === 1) return '休闲百搭'
  return '可选'
}

export function Panel({ outfit, setOutfit }) {
  const [tab, setTab] = useState('top')
  const cur = TABS.find((t) => t.key === tab)

  const pick = (item) => {
    if (tab === 'acc') {
      setOutfit((o) => ({
        ...o,
        accs: o.accs.includes(item.id) ? o.accs.filter((a) => a !== item.id) : [...o.accs, item.id],
      }))
    } else {
      const key = tab === 'top' ? 'top' : tab === 'outer' ? 'outer' : tab === 'bottom' ? 'bottom' : 'shoes'
      setOutfit((o) => ({ ...o, [key]: item.id }))
    }
  }

  const isOn = (item) => {
    if (tab === 'acc') return outfit.accs.includes(item.id)
    if (tab === 'top') return outfit.top === item.id
    if (tab === 'outer') return outfit.outer === item.id
    if (tab === 'bottom') return outfit.bottom === item.id
    return outfit.shoes === item.id
  }

  return (
    <div className="panel">
      <div className="presets">
        <h3><IconBolt /> 一键造型（灵感预设）</h3>
        <div className="preset-row" role="group" aria-label="一键造型预设">
          {PRESETS.map((p) => (
            <button key={p.id} className="preset-btn" title={p.desc}
              aria-label={`${p.name}造型：${p.desc}`}
              onClick={() => setOutfit({ ...p.outfit, accs: [...p.outfit.accs] })}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="wardrobe">
        <h3><IconShirt /> 衣柜</h3>
        {/* 分类用 role=group + aria-pressed 而非 tab 模式：所有分类都在 Tab 焦点序列里，
            不需要额外实现方向键漫游，键盘用户不会迷路。 */}
        <div className="tabs" role="group" aria-label="衣柜分类">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`}
              aria-pressed={tab === t.key}
              aria-label={`${t.label}分类${tab === t.key ? '（当前）' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="item-list" role="group" aria-label={`${cur.label}单品`}>
          {cur.list.map((item) => (
            <button key={item.id} className={`item ${tab === 'acc' ? 'acc' : ''} ${isOn(item) ? 'on' : ''}`}
              aria-pressed={isOn(item)}
              aria-label={`${item.name}，${subLabel(item)}，${isOn(item) ? (tab === 'acc' ? '已佩戴' : '穿着中') : '未选中'}`}
              onClick={() => pick(item)}>
              <span className={`sw ${item.hex === '#00000000' ? 'sw-none' : ''}`} aria-hidden="true"
                style={item.hex === '#00000000' ? undefined : { background: item.hex }} />
              <span>
                <span className="nm">{item.name}</span>
                <span className="tag" style={{ display: 'block' }}>{subLabel(item)}</span>
              </span>
              <span className="check" aria-hidden="true">{tab === 'acc' ? (isOn(item) ? '已戴 ✓' : '戴上') : isOn(item) ? '穿着中 ✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

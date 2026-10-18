// 穿搭日历（PHASE2-CONTRACT §4 · 记录与统计）。
//
// 日历最容易出的错是「看着像记住了，其实没有」。所以这里所有写操作
// 都走 App 传下来的 onRecord / calendar.*，并且把返回的中文提示原样显示出来；
// 写入失败（隐私模式、配额满）显示的是红色的持久化降级提示，而不是静默通过。
//
// 日期一律用 calendar.js 的本地日期键，不在此文件里碰 toISOString。

import { memo, useMemo, useState } from 'react'
import { findItem } from '../data/catalog'
import {
  OCCASION_LABELS,
  DAILY_OCCASIONS,
} from '../data/daily.js'
import {
  IDLE_THRESHOLDS,
  SLOT_LABELS,
  entriesOnDate,
  idleItems,
  isValidDateString,
  itemFrequency,
  listReminders,
  localDateKey,
  monthStats,
  outfitItemIds,
  personalIdsInOutfit,
  todayKey,
} from '../data/calendar.js'
import '../styles/calendar.css'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const MAX_NOTE_INPUT = 200

/** 月历格子：周一起始，前后补空。 */
function buildGrid(year, month) {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` })
  }
  return cells
}

function Stars({ value, onChange, label }) {
  return (
    <span className="cal-stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`cal-star${value === n ? ' on' : ''}`}
          aria-pressed={value === n}
          aria-label={`${n} 分`}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}

function ItemLine({ outfit, wardrobe }) {
  const ids = outfitItemIds(outfit)
  if (ids.length === 0) return <span className="cal-dim">（没有单品）</span>
  return (
    <span className="cal-items">
      {ids.map((id) => {
        const personal = id.startsWith('u-') ? wardrobe.byId(id) : null
        const name = personal ? personal.name : (findItem(id)?.name || id)
        const hex = personal ? personal.hex : (findItem(id)?.hex || undefined)
        return (
          <span className="cal-item" key={id}>
            {hex ? <i style={{ background: hex }} aria-hidden="true" /> : null}
            {name}
          </span>
        )
      })}
    </span>
  )
}

export const OutfitCalendar = memo(function OutfitCalendar({ calendar, wardrobe, outfit, onTry, onRecord }) {
  const now = new Date()
  const [cursor, setCursor] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }))
  const [selected, setSelected] = useState(() => todayKey())
  const [draft, setDraft] = useState({ occasion: 'casual', note: '', rating: null })
  const [feedback, setFeedback] = useState('')

  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor])
  const today = todayKey()
  // 依赖只取「已归一化的事件数组」，而不是整个 `wardrobe` hook 对象：
  // useWardrobe 每次渲染都返回新的对象字面量，把它放进依赖会让下面几个 useMemo
  // 每一帧都重算（实测 2000 条记录时约 60ms/帧），memo 形同虚设。
  const wardrobeItems = wardrobe && Array.isArray(wardrobe.items) ? wardrobe.items : null
  const dayEntries = useMemo(() => entriesOnDate(calendar.state, selected), [calendar.state, selected])
  const stats = useMemo(
    () => monthStats(calendar.state, { ...cursor, wardrobe: wardrobeItems }),
    [calendar.state, cursor, wardrobeItems],
  )
  const frequency = useMemo(
    () => itemFrequency(calendar.state, { days: 30, wardrobe: wardrobeItems, limit: 6 }),
    [calendar.state, wardrobeItems],
  )
  const reminders = useMemo(
    () => listReminders({ state: calendar.state, wardrobe: wardrobeItems }),
    [calendar.state, wardrobeItems],
  )
  const recent = calendar.entries.slice(0, 12)

  const shiftMonth = (delta) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month - 1 + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1 }
    })
  }

  const recordHere = () => {
    const result = onRecord(outfit, {
      date: selected,
      occasion: draft.occasion,
      note: draft.note.slice(0, MAX_NOTE_INPUT),
      rating: draft.rating,
    })
    if (result && result.ok) {
      setFeedback(`已记录到 ${selected}`)
      setDraft({ occasion: 'casual', note: '', rating: null })
    } else {
      setFeedback(`记录失败：${(result && result.message) || '未知原因'}`)
    }
  }

  const removeEntry = (entry) => {
    if (!window.confirm(`删除 ${entry.date} 的这条记录？`)) return
    calendar.remove(entry.id)
    setFeedback(`已删除 ${entry.date} 的记录`)
  }

  const idleByThreshold = useMemo(
    () => IDLE_THRESHOLDS.map((days) => ({ days, items: idleItems({ state: calendar.state, wardrobe: wardrobeItems, days }) })),
    [calendar.state, wardrobeItems],
  )

  return (
    <div className="cal">
      <div className="cal-panel">
        <div className="cal-month-head">
          <button type="button" className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="上一个月">‹</button>
          <b aria-live="polite">{cursor.year} 年 {cursor.month} 月</b>
          <button type="button" className="cal-nav" onClick={() => shiftMonth(1)} aria-label="下一个月">›</button>
          <button
            type="button"
            className="cal-nav today"
            onClick={() => {
              const d = new Date()
              setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 })
              setSelected(today)
            }}
          >
            今天
          </button>
        </div>

        <div className="cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>

        <div className="cal-grid" role="grid" aria-label={`${cursor.year} 年 ${cursor.month} 月`}>
          {grid.map((cell, index) => {
            if (!cell) return <span className="cal-cell empty" key={`e${index}`} />
            const count = calendar.marked.get(cell.key) || 0
            const isToday = cell.key === today
            const isSelected = cell.key === selected
            return (
              <button
                type="button"
                key={cell.key}
                className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' on' : ''}${count ? ' has' : ''}`}
                aria-pressed={isSelected}
                aria-label={`${cell.key}${count ? `，${count} 条记录` : '，没有记录'}`}
                onClick={() => setSelected(cell.key)}
              >
                <span className="cal-day">{cell.day}</span>
                {count ? <span className="cal-dots" aria-hidden="true">{'•'.repeat(Math.min(count, 3))}</span> : null}
              </button>
            )
          })}
        </div>

        <div className="cal-day-panel">
          <h3 className="cal-h3">{selected} 的记录（{dayEntries.length} 条）</h3>

          {dayEntries.length === 0 ? <p className="cal-dim">这一天还没有记录。</p> : null}

          <ul className="cal-entries">
            {dayEntries.map((entry) => (
              <li className="cal-entry" key={entry.id}>
                <ItemLine outfit={entry.outfit} wardrobe={wardrobe} />
                <div className="cal-entry-meta">
                  <span>{entry.occasion ? (OCCASION_LABELS[entry.occasion] || entry.occasion) : '未填场合'}</span>
                  {entry.weather ? <span>{entry.weather.temp != null ? `${entry.weather.temp}℃` : ''}</span> : null}
                  <Stars value={entry.rating} label={`${entry.date} 的评分`} onChange={(v) => calendar.update(entry.id, { rating: v })} />
                </div>
                {entry.note ? <p className="cal-note">{entry.note}</p> : null}
                <div className="cal-entry-actions">
                  <button type="button" className="cal-btn" onClick={() => onTry(entry.outfit)}>试穿</button>
                  <button type="button" className="cal-btn ghost" onClick={() => removeEntry(entry)}>删除</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="cal-add">
            <h4 className="cal-h4">在 {selected} 补记一套</h4>
            <div className="cal-add-row">
              <label className="cal-label" htmlFor="cal-occasion">场合</label>
              <select
                id="cal-occasion"
                className="cal-input"
                value={draft.occasion}
                onChange={(event) => setDraft((d) => ({ ...d, occasion: event.target.value }))}
              >
                {DAILY_OCCASIONS.map((key) => <option key={key} value={key}>{OCCASION_LABELS[key] || key}</option>)}
              </select>
              <Stars value={draft.rating} label="这一天的评分" onChange={(v) => setDraft((d) => ({ ...d, rating: v }))} />
            </div>
            <div className="cal-add-row">
              <label className="cal-label" htmlFor="cal-note">备注</label>
              <input
                id="cal-note"
                className="cal-input grow"
                type="text"
                maxLength={MAX_NOTE_INPUT}
                placeholder="例如：面试 / 见朋友"
                value={draft.note}
                onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
              />
              <button type="button" className="cal-btn" onClick={recordHere} disabled={!isValidDateString(selected)}>
                记录 3D 里的这套
              </button>
            </div>
            {feedback ? <p className="cal-note" role="status" aria-live="polite">{feedback}</p> : null}
            {calendar.persistence.degraded ? <p className="cal-note warn" role="status">{calendar.persistence.message}</p> : null}
            {calendar.warnings.slice(0, 3).map((w) => <p className="cal-note warn" key={w} role="status">{w}</p>)}
          </div>
        </div>
      </div>

      <div className="cal-side">
        <div className="cal-block">
          <h3 className="cal-h3">本月概览</h3>
          <div className="cal-stats">
            <div className="cal-stat"><b>{stats.days}</b><span>天有记录</span></div>
            <div className="cal-stat"><b>{stats.outfits}</b><span>套不同造型</span></div>
            <div className="cal-stat"><b>{stats.ratingAvg == null ? '—' : stats.ratingAvg}</b><span>平均评分</span></div>
          </div>
          {stats.topItems.length > 0 ? (
            <>
              <h4 className="cal-h4">本月穿得最多</h4>
              <ul className="cal-rank">
                {stats.topItems.map((row) => (
                  <li key={row.id}><span>{row.name}</span><b>{row.count} 次</b></li>
                ))}
              </ul>
            </>
          ) : null}
          {stats.byCondition.length > 0 ? (
            <p className="cal-dim">天气分布：{stats.byCondition.map((c) => `${c.label} ${c.count}`).join(' · ')}</p>
          ) : null}
          {stats.busiestDay ? <p className="cal-dim">最忙的一天：{stats.busiestDay.date}（{stats.busiestDay.count} 套）</p> : null}
        </div>

        <div className="cal-block">
          <h3 className="cal-h3">最近 30 天频率</h3>
          {frequency.length === 0 ? <p className="cal-dim">最近 30 天还没有记录。</p> : (
            <ul className="cal-rank">
              {frequency.map((row) => <li key={row.id}><span>{row.name}</span><b>{row.count} 次</b></li>)}
            </ul>
          )}
        </div>

        <div className="cal-block">
          <h3 className="cal-h3">提醒</h3>
          {reminders.length === 0 ? <p className="cal-dim">暂时没有闲置或重复提醒。</p> : (
            <ul className="cal-reminders">
              {reminders.map((r) => <li key={`${r.kind}-${r.days || r.length}`} className={`lvl-${r.level}`}>{r.message}</li>)}
            </ul>
          )}
          {idleByThreshold.map(({ days, items }) => (
            items.length > 0 ? (
              <p className="cal-dim" key={days}>
                超过 {days} 天没穿（{items.length}）：{items.slice(0, 6).map((i) => i.name).join('、')}{items.length > 6 ? ' 等' : ''}
              </p>
            ) : null
          ))}
        </div>

        <div className="cal-block">
          <h3 className="cal-h3">最近记录</h3>
          {recent.length === 0 ? <p className="cal-dim">还没有任何记录。去 3D 里搭一套，然后点上面的「记录 3D 里的这套」。</p> : (
            <ul className="cal-recent">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="cal-recent-btn" onClick={() => { setSelected(entry.date); }}>
                    <b>{entry.date}</b>
                    <span>{entry.note || (entry.occasion ? (OCCASION_LABELS[entry.occasion] || entry.occasion) : '未填备注')}</span>
                    {entry.rating ? <em>{'★'.repeat(entry.rating)}</em> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="cal-dim">
          记入日历时，造型里的个人单品会自动累加穿着次数（用于闲置提醒）。
        </p>
      </div>
    </div>
  )
})

/** 供 App 记录时复用：这套造型里有哪些个人单品需要 +1 次穿着。 */
export function personalItemsOf(outfit) {
  return personalIdsInOutfit(outfit)
}

export { localDateKey }

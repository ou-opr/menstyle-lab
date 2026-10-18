// 今日穿什么（PHASE2-CONTRACT §3 · 今日推荐）。
//
// 两条设计取舍：
//   1) 手动输入永远可用——联网按钮只是「帮忙填」，失败了不留半个脏状态，
//      所以每个联网结果都只落到 daily 的三个天气字段上，室内/通勤/场合始终是用户说了算。
//   2) 推荐与「记录」分开：推荐卡上的「试穿」只改 3D 造型，「记录今天穿了」才写日历。
//      用户试了五套最后只穿一套，日历里不该出现五条。

import { useMemo, useState } from 'react'
import {
  COMMUTE_LABELS,
  CONDITION_LABELS,
  DAILY_COMMUTES,
  DAILY_CONDITIONS,
  DAILY_INDOORS,
  DAILY_OCCASIONS,
  DAILY_WINDS,
  INDOOR_LABELS,
  OCCASION_LABELS,
  SEASON_LABELS,
  TEMP_MAX,
  TEMP_MIN,
  WIND_LABELS,
  planToday,
} from '../data/daily.js'
import '../styles/today.css'

/** 一组互斥选项（fieldset + aria-pressed 按钮，键盘可操作）。 */
function Chips({ legend, options, value, labels, onChange, name }) {
  return (
    <fieldset className="td-field">
      <legend>{legend}</legend>
      <div className="td-chips" role="group" aria-label={legend}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`td-chip${value === option ? ' on' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            name={`${name}-${option}`}
          >
            {labels[option] || option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

const MISSING_SLOT_LABELS = { tops: '上装', outers: '外套', bottoms: '下装', shoes: '鞋子', accs: '配饰' }

export function TodayPlanner({ daily, wardrobe, preferences, outfit, onTry, onRecord }) {
  const [cityDraft, setCityDraft] = useState(() => daily.state.city || '')
  const [feedback, setFeedback] = useState('')

  const plan = useMemo(() => {
    try {
      return planToday({
        daily: daily.state,
        wardrobe: wardrobe.state,
        preferences: preferences ? preferences.preferences : null,
        limit: 3,
      })
    } catch (error) {
      console.warn('STYLE LAB: 今日推荐计算失败，已跳过本次推荐', error)
      return null
    }
  }, [daily.state, wardrobe.state, preferences])

  const busy = daily.weather.status === 'loading'

  const submitCity = async () => {
    const result = await daily.lookupCity(cityDraft)
    setFeedback(result.message)
  }
  const useLocation = async () => {
    const result = await daily.lookupLocation()
    setFeedback(result.message)
  }

  const record = (target, name) => {
    const result = onRecord(target, { occasion: daily.state.occasion, weather: { temp: daily.state.temp, condition: daily.state.condition } })
    setFeedback(result && result.ok ? `已记入穿搭日历：${name}` : `记录失败：${(result && result.message) || '未知原因'}`)
  }

  return (
    <div className="td">
      <div className="td-panel">
        <h3 className="td-h3">今天的天气与场合</h3>

        <div className="td-row">
          <label className="td-label" htmlFor="td-city">城市</label>
          <input
            id="td-city"
            className="td-input"
            type="text"
            value={cityDraft}
            placeholder="例如：上海"
            onChange={(event) => setCityDraft(event.target.value)}
            onBlur={() => daily.update({ city: cityDraft })}
          />
          <button type="button" className="td-btn" onClick={submitCity} disabled={busy}>
            {busy ? '查询中…' : '联网更新'}
          </button>
          <button type="button" className="td-btn ghost" onClick={useLocation} disabled={busy}>
            用我的定位
          </button>
        </div>

        <div className="td-row">
          <label className="td-label" htmlFor="td-temp">气温</label>
          <input
            id="td-temp"
            className="td-range"
            type="range"
            min={TEMP_MIN}
            max={TEMP_MAX}
            step={1}
            value={daily.state.temp}
            onChange={(event) => daily.update({ temp: Number(event.target.value) })}
            aria-valuetext={`${daily.state.temp} 摄氏度`}
          />
          <output className="td-temp" htmlFor="td-temp">{daily.state.temp}℃</output>
          <span className="td-hint">{SEASON_LABELS[daily.season] || daily.season}</span>
        </div>

        <Chips legend="天气" name="condition" options={DAILY_CONDITIONS} labels={CONDITION_LABELS} value={daily.state.condition} onChange={(v) => daily.update({ condition: v })} />
        <Chips legend="风力" name="wind" options={DAILY_WINDS} labels={WIND_LABELS} value={daily.state.wind} onChange={(v) => daily.update({ wind: v })} />
        <Chips legend="室内" name="indoor" options={DAILY_INDOORS} labels={INDOOR_LABELS} value={daily.state.indoor} onChange={(v) => daily.update({ indoor: v })} />
        <Chips legend="通勤方式" name="commute" options={DAILY_COMMUTES} labels={COMMUTE_LABELS} value={daily.state.commute} onChange={(v) => daily.update({ commute: v })} />
        <Chips legend="今天场合" name="occasion" options={DAILY_OCCASIONS} labels={OCCASION_LABELS} value={daily.state.occasion} onChange={(v) => daily.update({ occasion: v })} />

        <div className="td-row td-actions">
          <button
            type="button"
            className="td-btn"
            onClick={() => {
              if (!window.confirm('把今天的天气与场合恢复成默认值？')) return
              daily.reset()
              setCityDraft('')
              setFeedback('已恢复默认条件')
            }}
          >
            恢复默认
          </button>
          <span className="td-hint">{daily.description}</span>
        </div>

        {daily.weather.message ? (
          <p className={`td-note ${daily.weather.status === 'error' ? 'warn' : ''}`} role="status" aria-live="polite">
            {daily.weather.message}
          </p>
        ) : null}
        {feedback ? <p className="td-note" role="status" aria-live="polite">{feedback}</p> : null}

        {daily.persistence.degraded ? <p className="td-note warn" role="status">{daily.persistence.message}</p> : null}
        {daily.warnings.slice(0, 3).map((w) => <p className="td-note warn" key={w} role="status">{w}</p>)}
      </div>

      <div className="td-results">
        <div className="td-results-head">
          <h3 className="td-h3">今天可以穿这三套</h3>
          <span className="td-hint">
            按天气适配 {plan ? Math.round(plan.outfits[0]?.weatherScore ?? 0) : 0} 分区间排序 · 优先你的衣橱
          </span>
        </div>

        {!plan || plan.outfits.length === 0 ? (
          <p className="td-empty">暂时算不出推荐，请先把上装 / 下装 / 鞋子选好，或检查上面的条件。</p>
        ) : null}

        {plan && plan.notices.map((n) => <p className="td-note" key={n}>{n}</p>)}

        <ol className="td-list">
          {(plan ? plan.outfits : []).map((item, index) => (
            <li className="td-card" key={`${item.id}-${index}`}>
              <div className="td-card-head">
                <b>{index + 1}. {item.name || item.id}</b>
                <span className="td-score" title="今日综合分 = 天气适配 55% + 个人偏好 45%">{item.dayScore} 分</span>
              </div>

              <div className="td-meta">
                <span>天气适配 {Math.round(item.weatherScore)}</span>
                <span>保暖总和 {item.totalWarmth}</span>
                <span>衣橱占比 {Math.round((item.ownedRatio || 0) * 100)}%</span>
              </div>

              {item.missing && item.missing.length > 0 ? (
                <p className="td-missing">
                  待补：{item.missing.map((m) => MISSING_SLOT_LABELS[m.category] || m.category).join('、')}
                </p>
              ) : (
                <p className="td-missing ok">这套全部来自你的衣橱</p>
              )}

              <ul className="td-reasons">
                {(item.reasons || []).slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>

              {(item.warnings || []).slice(0, 2).map((w) => <p className="td-note warn" key={w}>{w}</p>)}

              <div className="td-card-actions">
                <button type="button" className="td-btn" onClick={() => onTry(item.outfit)}>试穿这套</button>
                <button type="button" className="td-btn ghost" onClick={() => record(item.outfit, item.name || item.id)}>
                  记录今天穿了
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="td-row td-actions">
          <button type="button" className="td-btn ghost" onClick={() => record(outfit, '当前造型')} disabled={!outfit}>
            把 3D 里现在的这套记进日历
          </button>
        </div>
      </div>
    </div>
  )
}

import '../styles/score.css'

const VERDICT_CLASS = {
  优秀: 'score-verdict-ok',
  良好: 'score-verdict-good',
  及格: 'score-verdict-pass',
  需要调整: 'score-verdict-warn',
}

const pct = (value, max) => {
  const m = Number(max)
  if (!Number.isFinite(m) || m <= 0) return 0
  const v = Number(value)
  if (!Number.isFinite(v)) return 0
  return Math.round(Math.max(0, Math.min(1, v / m)) * 100)
}

export default function ScoreCard({ score }) {
  if (!score) return null

  const total = Number.isFinite(Number(score.total)) ? Number(score.total) : 0
  const verdict = typeof score.verdict === 'string' && score.verdict ? score.verdict : '需要调整'
  const breakdown = Array.isArray(score.breakdown) ? score.breakdown.filter((i) => i && typeof i === 'object') : []

  return (
    <div className="score-card" aria-label={`搭配评分：总分 ${total} 分（满分 100），评级${verdict}`}>
      <div className="score-head">
        <div className="score-total">
          <b className="score-total-num">{total}</b>
          <span className="score-total-max">/ 100</span>
        </div>
        <span className={`score-verdict ${VERDICT_CLASS[verdict] || ''}`}>{verdict}</span>
      </div>

      <ul className="score-list">
        {breakdown.map((item) => {
          const value = Number.isFinite(Number(item.value)) ? Number(item.value) : 0
          const max = Number.isFinite(Number(item.max)) ? Number(item.max) : 0
          return (
            <li className="score-row" key={item.key || item.label}>
              <div className="score-row-head">
                <span className="score-row-label">{item.label}</span>
                <span className="score-row-value">
                  <b>{value}</b>
                  <i>/ {max}</i>
                </span>
              </div>
              <div
                className="score-bar"
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${item.label}得分`}
              >
                <span className="score-bar-fill" style={{ width: `${pct(value, max)}%` }} />
              </div>
              {item.note ? <p className="score-note">{item.note}</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

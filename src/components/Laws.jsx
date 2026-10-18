import { LAWS } from '../data/advice'
import { SOURCES } from '../data/sources'
import { IconPin } from './icons'

const KIND_LABELS = {
  principle: '通用原则', style: '特定风格观点', subjective: '主观审美', experience: '经验参考',
}

export function Laws() {
  return (
    <div className="laws-grid">
      {LAWS.map((l, index) => {
        const src = SOURCES.find((s) => s.id === l.src)
        return (
          <div className="law" key={l.n} data-reveal style={{ '--reveal-i': index % 3 }}>
            <span className="n">{l.n}</span>
            <span className={`law-kind ${l.kind}`}>{KIND_LABELS[l.kind]}</span>
            <h3>{l.title}</h3>
            <p>{l.body}</p>
            {src && (
              <div className="src">
                <IconPin /> 参考：<a href={src.url} target="_blank" rel="noopener noreferrer">{src.creator}《{src.title.length > 16 ? src.title.slice(0, 16) + '…' : src.title}》</a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

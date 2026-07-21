import { useState } from 'react'
import { READINESS_QUESTIONS } from './readinessOptions'
import { computeReadiness } from '../scores/readiness'
import type { ReadinessCheck } from '../db/schema'

type Answers = Partial<Record<'sleep' | 'fatigue' | 'energy', number>>

export function ReadinessScreen({
  onStart,
}: {
  onStart: (r: ReadinessCheck | null) => void
}) {
  const [a, setA] = useState<Answers>({})
  const complete = a.sleep != null && a.fatigue != null && a.energy != null

  const preview = complete
    ? computeReadiness({ sleep: a.sleep!, fatigue: a.fatigue!, energy: a.energy! }, null)
    : null

  return (
    <div className="col">
      <div>
        <h2>Come stai oggi?</h2>
        <p className="muted small">Check pre-workout · 15 secondi · alimenta il Readiness</p>
      </div>

      {READINESS_QUESTIONS.map((q) => (
        <div className="card" key={q.key}>
          <label className="fl">{q.label}</label>
          <div className="opts">
            {q.options.map((o) => (
              <button
                key={o.text}
                className={a[q.key] === o.value ? 'sel' : ''}
                onClick={() => setA((prev) => ({ ...prev, [q.key]: o.value }))}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>
      ))}

      {preview && (
        <div className="card score">
          <span className="muted small">Readiness stimato:</span>
          <span className="val">{preview.value}</span>
          <span className="tag">{preview.reliability}</span>
        </div>
      )}

      <div className="row">
        <button className="ghost" style={{ flex: 1 }} onClick={() => onStart(null)}>Salta</button>
        <button
          className="primary" style={{ flex: 2 }}
          disabled={!complete}
          onClick={() => complete && onStart({ sleep: a.sleep!, fatigue: a.fatigue!, energy: a.energy! })}
        >
          Inizia allenamento
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { READINESS_QUESTIONS } from './readinessOptions'
import { computeReadiness } from '../scores/readiness'
import { workoutPhrase } from '../util/phrases'
import type { ReadinessCheck } from '../db/schema'

type Answers = Partial<Record<'sleep' | 'fatigue' | 'soreness' | 'energy', number>>

export function ReadinessScreen({
  onStart,
}: {
  onStart: (r: ReadinessCheck | null) => void
}) {
  const [a, setA] = useState<Answers>({})
  const complete = a.sleep != null && a.fatigue != null && a.soreness != null && a.energy != null
  const answer = (): ReadinessCheck => ({ sleep: a.sleep!, fatigue: a.fatigue!, soreness: a.soreness!, energy: a.energy! })

  const preview = complete ? computeReadiness(answer(), null) : null

  return (
    <div className="col">
      <div>
        <h2>Come stai oggi?</h2>
        <p className="muted small">Check pre-workout · 15 secondi · alimenta il Readiness</p>
        <p className="small" style={{ color: 'var(--gold)', marginTop: 4 }}>{workoutPhrase()}</p>
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
          onClick={() => complete && onStart(answer())}
        >
          Inizia allenamento
        </button>
      </div>
    </div>
  )
}

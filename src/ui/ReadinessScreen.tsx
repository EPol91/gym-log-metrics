import { useEffect, useState } from 'react'
import { READINESS_QUESTIONS } from './readinessOptions'
import { computeReadiness } from '../scores/readiness'
import { getTodayReadiness, saveDailyReadiness } from '../db/repo'
import { workoutPhrase } from '../util/phrases'
import type { ReadinessCheck } from '../db/schema'

type Answers = Partial<Record<'sleep' | 'fatigue' | 'soreness' | 'energy', number>>

/**
 * Check "come stai oggi".
 * - `mode: 'workout'` → precede l'allenamento (precompilato se hai già risposto oggi).
 * - `mode: 'daily'`   → dalla Home, senza allenarsi: salva e basta.
 */
export function ReadinessScreen({ onStart, mode = 'workout', onCancel }: {
  onStart: (r: ReadinessCheck | null) => void
  mode?: 'workout' | 'daily'
  onCancel?: () => void
}) {
  const [a, setA] = useState<Answers>({})
  const [prefilled, setPrefilled] = useState(false)

  // Se hai già fatto il check oggi, parti da quelle risposte: confermi o correggi.
  useEffect(() => {
    let alive = true
    getTodayReadiness().then((c) => {
      if (!alive || !c) return
      setA({ sleep: c.sleep, fatigue: c.fatigue, soreness: c.soreness, energy: c.energy })
      setPrefilled(true)
    })
    return () => { alive = false }
  }, [])

  const complete = a.sleep != null && a.fatigue != null && a.soreness != null && a.energy != null
  const answer = (): ReadinessCheck => ({ sleep: a.sleep!, fatigue: a.fatigue!, soreness: a.soreness!, energy: a.energy! })
  const preview = complete ? computeReadiness(answer(), null) : null

  async function confirm() {
    if (!complete) return
    const r = answer()
    await saveDailyReadiness(r) // vale come check del giorno in entrambe le modalità
    onStart(r)
  }

  return (
    <div className="col">
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Come stai oggi?</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {mode === 'daily' ? 'Check del giorno · 15 secondi · alimenta il Readiness' : 'Check pre-workout · 15 secondi · alimenta il Readiness'}
          </p>
          <p className="small" style={{ color: 'var(--gold)', marginTop: 4 }}>{workoutPhrase()}</p>
        </div>
        {onCancel && (
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onCancel}>✕</button>
        )}
      </div>

      {prefilled && <p className="muted small" style={{ margin: 0 }}>Risposte di oggi già inserite: conferma o correggi.</p>}

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
        {mode === 'workout' && <button className="ghost" style={{ flex: 1 }} onClick={() => onStart(null)}>Salta</button>}
        <button className="primary" style={{ flex: 2 }} disabled={!complete} onClick={confirm}>
          {mode === 'daily' ? 'Salva il check' : 'Inizia allenamento'}
        </button>
      </div>
    </div>
  )
}

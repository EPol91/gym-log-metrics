import { useEffect, useState } from 'react'
import { READINESS_QUESTIONS } from './readinessOptions'
import { computeReadiness } from '../scores/readiness'
import { getTodayReadiness, saveDailyReadiness } from '../db/repo'
import { workoutPhrase } from '../util/phrases'
import { whoopDay } from '../db/whoop'
import { fmtOre } from '../util/format'
import { PesoOggi } from './PesoOggi'
import { useLiveQuery } from 'dexie-react-hooks'
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
  const whoop = useLiveQuery(() => whoopDay(), [])
  const [usato, setUsato] = useState(false)

  // Precompilo da solo appena arrivano i dati WHOOP, se non hai gia risposto oggi:
  // due tocchi invece di cinque. Restano tuoi indolenzimento ed energia, che il
  // sensore non misura, e tutto resta correggibile.
  useEffect(() => {
    if (!whoop || usato || prefilled) return
    if (a.sleep != null || a.fatigue != null) return
    setA((prev) => ({
      ...prev,
      ...(whoop.sleepPerf != null ? { sleep: gradino(whoop.sleepPerf) } : {}),
      ...(whoop.recovery != null ? { fatigue: gradino(whoop.recovery) } : {}),
    }))
    setUsato(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoop, prefilled])

  // Le risposte hanno cinque gradini: un 62% di recupero diventa "50", non "62".
  const gradino = (v: number) => [0, 25, 50, 75, 100].reduce((best, g) => (Math.abs(g - v) < Math.abs(best - v) ? g : best), 0)

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

      {/* Il peso sta qui perché qui ci passi ogni giorno: e' il posto dove ricordarlo
          costa meno. Se c'e' gia', conferma e si fa da parte. */}
      <PesoOggi dentro="check" />

      {/* WHOOP propone, non decide: la tua sensazione resta l'ultima parola. */}
      {whoop && (whoop.recovery != null || whoop.sleepPerf != null) && (
        <div className="card" style={{ borderColor: 'var(--gold)' }}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <span className="small">
              <strong style={{ color: 'var(--gold)' }}>WHOOP di stanotte</strong>
              <span className="muted">
                {whoop.recovery != null ? ` · recupero ${whoop.recovery}%` : ''}
                {whoop.sleepHours != null ? ` · ${fmtOre(whoop.sleepHours)} di sonno` : ''}
                {whoop.sleepPerf != null ? ` (resa ${whoop.sleepPerf}%)` : ''}
              </span>
            </span>
          </div>
          <button className="chip" style={{ marginTop: 8 }} disabled={usato}
            onClick={() => {
              setA((prev) => ({
                ...prev,
                ...(whoop.sleepPerf != null ? { sleep: gradino(whoop.sleepPerf) } : {}),
                ...(whoop.recovery != null ? { fatigue: gradino(whoop.recovery) } : {}),
              }))
              setUsato(true)
            }}>
            {usato ? 'Sonno e stanchezza presi da WHOOP · correggili se non ti tornano' : 'Usa questi dati'}
          </button>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
            Consiglio: compila sonno e stanchezza da qui, e lascia a te indolenzimento ed energia —
            quelli il sensore non li misura.
          </p>
        </div>
      )}

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

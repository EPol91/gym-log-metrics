import { useEffect, useState } from 'react'
import { READINESS_QUESTIONS } from './readinessOptions'
import { computeReadiness } from '../scores/readiness'
import { getTodayReadiness, saveDailyReadiness } from '../db/repo'
import { whoopDay } from '../db/whoop'
import { fmtOre } from '../util/format'
import { PesoOggi, usePesoOggi } from './PesoOggi'
import { ScoreRing } from './anim'
import { PiedeFisso } from './PiedeFisso'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ReadinessCheck } from '../db/schema'

type Chiave = 'sleep' | 'fatigue' | 'soreness' | 'energy' | 'stress' | 'motivation'
type Answers = Partial<Record<Chiave, number>>

// Le risposte hanno cinque gradini: un 62% di recupero diventa "50", non "62".
const gradino = (v: number) => [0, 25, 50, 75, 100].reduce((best, g) => (Math.abs(g - v) < Math.abs(best - v) ? g : best), 0)

/**
 * Check "come stai oggi", tutto in una schermata: una riga per domanda, il voto
 * che si aggiorna in cima. Sonno e stanchezza li propone WHOOP (in azzurro) e li
 * cambi solo se non tornano; la spiegazione di ogni domanda si apre col tocco.
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
  // Quali risposte arrivano da WHOOP e non le hai ancora toccate.
  const [daWhoop, setDaWhoop] = useState<Set<Chiave>>(new Set())
  const [aiuto, setAiuto] = useState<Chiave | null>(null)
  const whoop = useLiveQuery(() => whoopDay(), [])
  const { peso, letto } = usePesoOggi()

  // Precompilo da solo appena arrivano i dati WHOOP, se non hai gia risposto oggi.
  // Restano tuoi indolenzimento ed energia, che il sensore non misura.
  useEffect(() => {
    if (!whoop || prefilled || daWhoop.size) return
    if (a.sleep != null || a.fatigue != null) return
    const presi = new Set<Chiave>()
    const nuove: Answers = {}
    if (whoop.sleepPerf != null) { nuove.sleep = gradino(whoop.sleepPerf); presi.add('sleep') }
    if (whoop.recovery != null) { nuove.fatigue = gradino(whoop.recovery); presi.add('fatigue') }
    setA((prev) => ({ ...prev, ...nuove }))
    setDaWhoop(presi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoop, prefilled])

  // Se hai già fatto il check oggi, parti da quelle risposte: confermi o correggi.
  useEffect(() => {
    let alive = true
    getTodayReadiness().then((c) => {
      if (!alive || !c) return
      setA({ sleep: c.sleep, fatigue: c.fatigue, soreness: c.soreness, energy: c.energy, stress: c.stress, motivation: c.motivation })
      setDaWhoop(new Set())
      setPrefilled(true)
    })
    return () => { alive = false }
  }, [])

  // Stress e motivazione non bloccano il salvataggio: sono arrivate dopo, e un
  // check a meta' e' comunque meglio di un check saltato.
  const complete = a.sleep != null && a.fatigue != null && a.soreness != null && a.energy != null
  const answer = (): ReadinessCheck => ({
    sleep: a.sleep!, fatigue: a.fatigue!, soreness: a.soreness!, energy: a.energy!,
    ...(a.stress != null ? { stress: a.stress } : {}),
    ...(a.motivation != null ? { motivation: a.motivation } : {}),
  })
  const preview = complete ? computeReadiness(answer(), null) : null

  async function confirm() {
    if (!complete) return
    const r = answer()
    await saveDailyReadiness(r) // vale come check del giorno in entrambe le modalità
    onStart(r)
  }

  const scegli = (k: Chiave, v: number) => {
    setA((prev) => ({ ...prev, [k]: v }))
    setDaWhoop((prev) => { const n = new Set(prev); n.delete(k); return n })
  }

  const whoopRiga = [
    whoop?.recovery != null && `WHOOP recupero ${whoop.recovery}%`,
    whoop?.sleepHours != null && `sonno ${fmtOre(whoop.sleepHours)}`,
    peso != null && `peso ✓ ${String(peso).replace('.', ',')} kg`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="barra-s">
        {onCancel ? <button className="ind" onClick={onCancel}>‹ Indietro</button> : <span style={{ width: 70 }} />}
        <span className="tit">Come stai oggi?</span>
        <span style={{ width: 70 }} />
      </div>

      <div className="card row" style={{ margin: 0, gap: 12, padding: '10px 12px' }}>
        <ScoreRing value={preview?.value ?? null} size={58} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>
            {preview ? `Prontezza ${preview.value} · ${preview.reliability}` : 'Prontezza'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {whoopRiga || (prefilled ? 'Risposte di oggi già inserite: conferma o correggi.' : mode === 'daily' ? 'Check del giorno · 15 secondi' : 'Check prima della seduta · 15 secondi')}
          </div>
        </div>
      </div>

      {/* Il peso sta qui perché qui ci passi ogni giorno: se manca, si chiede. */}
      {letto && peso == null && <PesoOggi dentro="check" />}

      <div className="lista-p">
        {READINESS_QUESTIONS.map((q) => {
          const v = a[q.key]
          const scelta = q.options.find((o) => o.value === v)
          const auto = daWhoop.has(q.key)
          return (
            <div key={q.key} className="dom-r">
              <button className="q-r" onClick={() => setAiuto(aiuto === q.key ? null : q.key)} aria-expanded={aiuto === q.key}>
                <span>
                  {q.breve}
                  {q.key === 'motivation' && <small className="muted" style={{ fontSize: 11, marginLeft: 6 }}>non conta nel voto</small>}
                </span>
                {scelta && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: auto ? 'var(--cardio)' : 'var(--gold)' }}>
                    {scelta.text}{auto && q.key === 'sleep' && whoop?.sleepHours != null ? ` · da WHOOP ${fmtOre(whoop.sleepHours)}` : auto ? ' · da WHOOP' : ''}
                  </span>
                )}
              </button>
              {aiuto === q.key && <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.4 }}>{q.aiuto}</p>}
              <div className="scala-r">
                {q.options.map((o, i) => (
                  <button key={o.text} className={v === o.value ? (auto ? 'auto' : 'on') : ''} aria-label={o.text}
                    onClick={() => scegli(q.key, o.value)}>{q.brevi[i]}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', margin: 0 }}>Tocca una domanda per la spiegazione</p>

      <div className="spazio-piede" />
      <PiedeFisso>
        {mode === 'workout' && <button className="ghost" style={{ flex: '0 0 110px' }} onClick={() => onStart(null)}>Salta</button>}
        <button className="primary" disabled={!complete} onClick={confirm}>
          {mode === 'daily' ? 'Salva il check' : '▶ Inizia allenamento'}
        </button>
      </PiedeFisso>
    </div>
  )
}

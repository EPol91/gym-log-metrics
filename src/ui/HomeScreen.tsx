import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome, type HomeData } from '../scores/dashboardScores'
import { getOngoingSession, getUser, upsertMeasurement, todayISO, getNutritionToday } from '../db/repo'
import { NutritionCard } from './NutritionCard'
import { ScoreRing, Info } from './anim'
import { dailyPhrase } from '../util/phrases'
import { parseNum } from '../util/validate'

const SCORE_TIPS: Record<string, string> = {
  Readiness: 'Quanto sei pronto oggi. Dal check pre-workout (sonno · stanchezza · energia) e dal carico recente.',
  Workout: 'Qualità della seduta appena fatta rispetto ai TUOI standard: volume, intensità (RIR/e1RM), PR.',
  Performance: 'Stai progredendo? Trend di forza (e1RM) e volume su ~6 settimane, tarato sulla fase.',
  Consistency: 'Quanto sei costante: sedute vs obiettivo settimanale, regolarità e streak.',
}
const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

function todayStatus(v: number | null): { label: string; color: string } {
  if (v == null) return { label: 'fai il check ›', color: 'var(--muted)' }
  if (v >= 70) return { label: 'PRONTO', color: 'var(--good)' }
  if (v >= 40) return { label: 'CAUTO', color: '#e0a030' }
  return { label: 'SCARICO', color: '#e5484d' }
}

function coachMessage(home: HomeData): string {
  const r = home.readiness.value
  const wk = home.weekGoal
  let s = r == null
    ? 'Fai il check pre-workout per il consiglio del giorno.'
    : r >= 70 ? 'Sei pronto: oggi puoi spingere.'
      : r >= 40 ? 'Vai cauto: tecnica pulita, niente massimali forzati.'
        : 'Giornata scarica: tieni leggero o recupera.'
  if (wk.target > 0 && wk.done < wk.target) s += ` Ancora ${wk.target - wk.done} per l'obiettivo.`
  return s
}

const SCORES = [
  { key: 'readiness', label: 'Readiness', tip: 'Readiness' },
  { key: 'workout', label: 'Workout', tip: 'Workout' },
  { key: 'performance', label: 'Perf.', tip: 'Performance' },
  { key: 'consistency', label: 'Constan.', tip: 'Consistency' },
] as const

export function HomeScreen({ onStartWorkout, onResumeWorkout, onOpenAnalytics }: {
  onStartWorkout: () => void; onResumeWorkout: (id: string) => void; onOpenAnalytics: () => void
}) {
  const home = useLiveQuery(computeHome, [])
  const ongoing = useLiveQuery(getOngoingSession, [])
  const user = useLiveQuery(getUser, [])
  const nutri = useLiveQuery(getNutritionToday, [])
  const firstName = (user?.name ?? '').trim().split(' ')[0]

  const [w, setW] = useState('')
  const [savedW, setSavedW] = useState(false)
  const [nutOpen, setNutOpen] = useState(false)

  const today = todayStatus(home?.todayReady ?? null)

  async function saveWeight() {
    const n = parseNum(w, { min: 20, max: 400 })
    if (n == null) return
    await upsertMeasurement(todayISO(), { weight: n })
    setW(''); setSavedW(true)
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* Saluto + anello "Oggi" in alto a destra */}
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.06em' }}>GYM LOG &amp; METRICS</p>
          <h1>Ciao{firstName ? ` ${firstName}` : ''} <span className="brand">👋</span></h1>
          <p className="muted small">{dailyPhrase()}</p>
        </div>
        <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
          <ScoreRing value={home?.todayReady ?? null} size={82} />
          <div className="small" style={{ marginTop: 1, color: today.color, letterSpacing: '.04em' }}>Oggi · {today.label}</div>
        </div>
      </div>

      {/* CTA / riprendi */}
      {ongoing ? (
        <>
          <button className="primary" style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 600 }} onClick={() => onResumeWorkout(ongoing.id)}>
            ▶ Riprendi allenamento <span style={{ opacity: 0.75, fontWeight: 400 }}>· {TYPE_LABEL[ongoing.type] ?? ongoing.type}</span>
          </button>
          <button className="ghost small" style={{ width: '100%' }} onClick={onStartWorkout}>＋ Inizia una nuova seduta</button>
        </>
      ) : (
        <button className="primary" style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 600 }} onClick={onStartWorkout}>
          ＋ Inizia allenamento
        </button>
      )}

      {!home ? (
        <p className="muted">Calcolo…</p>
      ) : (
        <>
          {/* 4 anelli puliti (senza cornice) */}
          <div className="row" style={{ textAlign: 'center' }}>
            {SCORES.map((s) => (
              <div key={s.key} style={{ flex: 1 }}>
                <ScoreRing value={home[s.key].value} size={58} />
                <div className="muted small" style={{ marginTop: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {s.label}<Info text={SCORE_TIPS[s.tip]} />
                </div>
              </div>
            ))}
          </div>

          {/* Obiettivo settimana */}
          <div className="card">
            <div className="row spread small"><span className="muted">Obiettivo settimana</span><strong>{home.weekGoal.done} / {home.weekGoal.target}</strong></div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', border: '1px solid var(--line)', marginTop: 8 }}>
              <div style={{ height: '100%', background: 'var(--gold)', width: `${home.weekGoal.target ? Math.min(100, home.weekGoal.done / home.weekGoal.target * 100) : 0}%` }} />
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {home.weekGoal.done >= home.weekGoal.target ? 'Obiettivo centrato 💪' : `Ancora ${home.weekGoal.target - home.weekGoal.done} seduta/e`}
              {home.weekGoal.streak > 0 ? ` · 🔥 streak ${home.weekGoal.streak} ${home.weekGoal.streak === 1 ? 'giorno' : 'giorni'}` : ''}
            </div>
          </div>

          {/* Coach */}
          <div className="card" style={{ border: '1px solid var(--gold-dim)', background: 'linear-gradient(180deg, rgba(217,178,74,.08), transparent)' }}>
            <div className="row spread"><span className="small" style={{ color: 'var(--gold)', letterSpacing: '.1em' }}>💡 COACH · OGGI</span></div>
            <p className="small" style={{ margin: '6px 0 0' }}>{coachMessage(home)}</p>
          </div>

          {/* Peso oggi (quick log) */}
          <div className="card" style={{ padding: '10px 12px' }}>
            <div className="row spread">
              <span className="muted small">⚖️ Peso oggi
                {home.bodyWeight?.delta != null && <span className="small"> · {home.bodyWeight.delta > 0 ? '▲' : '▼'}{Math.abs(home.bodyWeight.delta)} vs prec.</span>}
              </span>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <input inputMode="decimal" value={w} placeholder={home.bodyWeight ? String(home.bodyWeight.weight) : 'kg'} onChange={(e) => { setW(e.target.value); setSavedW(false) }} style={{ flex: 1, textAlign: 'center' }} />
              <span className="muted small" style={{ alignSelf: 'center' }}>kg</span>
              <button className="primary" style={{ padding: '9px 16px' }} disabled={parseNum(w, { min: 20, max: 400 }) == null} onClick={saveWeight}>Salva</button>
            </div>
            {savedW && <p className="small" style={{ marginTop: 4, color: 'var(--good)' }}>✓ Peso di oggi salvato</p>}
          </div>

          {/* Nutrizione collassabile */}
          {nutOpen ? (
            <div>
              <button className="ghost small" style={{ width: '100%', marginBottom: 6 }} onClick={() => setNutOpen(false)}>🥗 Nutrizione — chiudi ▴</button>
              <NutritionCard />
            </div>
          ) : (
            <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setNutOpen(true)}>
              <div className="row spread">
                <span className="small">🥗 Nutrizione oggi
                  {nutri?.dayType ? <span style={{ color: 'var(--gold)' }}> · {nutri.dayType.toUpperCase()}</span> : ''}
                  {nutri?.water != null ? <span className="muted"> · 💧 {nutri.water}L</span> : ''}
                </span>
                <span className="muted small">apri ▾</span>
              </div>
            </button>
          )}

          <button className="ghost" onClick={onOpenAnalytics}>📊 Analisi avanzate</button>
        </>
      )}
    </div>
  )
}

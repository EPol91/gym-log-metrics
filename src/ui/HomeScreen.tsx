import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome, type HomeData } from '../scores/dashboardScores'
import { computeCoach, coachPrompt } from '../scores/coach'
import { isCoachAiOn, getAIProvider } from '../ai/aiEngine'
import { getOngoingSession, getUser, upsertMeasurement, todayISO, getNutritionToday } from '../db/repo'
import { NutritionCard } from './NutritionCard'
import { ScoreRing, Info } from './anim'
import { dailyPhrase } from '../util/phrases'
import { parseNum } from '../util/validate'

const SCORE_TIPS: Record<string, string> = {
  Readiness: 'Quanto sei pronto oggi. Dal check pre-workout (sonno · stanchezza · indolenzimento · energia) e dal carico recente.',
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

// Coach: il dato in chiaro, il consiglio marcato e in sordina — così si distingue
// a colpo d'occhio ciò che è misurato da ciò che è solo un suggerimento.
function CoachCard({ home }: { home: HomeData }) {
  const lines = useLiveQuery(() => computeCoach(home), [home]) ?? []
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const aiOn = isCoachAiOn()

  async function askAi() {
    setAiLoading(true); setAiError(null)
    try { setAiText(await getAIProvider().analyze(coachPrompt(home, lines))) }
    catch (e) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--gold-dim)' }}>
      <div className="row spread"><span className="small" style={{ color: 'var(--gold)', letterSpacing: '.1em' }}>💡 COACH · OGGI</span></div>
      {lines.map((l, i) => (
        <div key={i} style={{ marginTop: i ? 8 : 6 }}>
          <p className="small" style={{ margin: 0 }}>{l.fact}</p>
          {l.advice && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Consiglio: {l.advice}</p>}
        </div>
      ))}
      {aiOn && (
        <>
          {!aiText && (
            <button className="ghost small" style={{ width: '100%', marginTop: 10 }} onClick={askAi} disabled={aiLoading}>
              {aiLoading ? 'Analizzo…' : '🤖 Chiedi al coach AI'}
            </button>
          )}
          {aiError && <p className="small" style={{ color: '#e57373', marginTop: 6 }}>Errore: {aiError}</p>}
          {aiText && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 8 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>🤖 Coach AI</div>
              <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aiText}</p>
              <button className="ghost small" style={{ marginTop: 6 }} onClick={() => setAiText(null)}>Chiudi</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const SCORES = [
  { key: 'readiness', label: 'Readiness', tip: 'Readiness' },
  { key: 'workout', label: 'Workout', tip: 'Workout' },
  { key: 'performance', label: 'Perf.', tip: 'Performance' },
  { key: 'consistency', label: 'Constan.', tip: 'Consistency' },
] as const

export function HomeScreen({ onStartWorkout, onResumeWorkout, onOpenAnalytics, onOpenCheck }: {
  onStartWorkout: () => void; onResumeWorkout: (id: string) => void; onOpenAnalytics: () => void
  onOpenCheck: () => void
}) {
  const home = useLiveQuery(computeHome, [])
  const ongoing = useLiveQuery(getOngoingSession, [])
  const user = useLiveQuery(getUser, [])
  const nutri = useLiveQuery(getNutritionToday, [])
  const firstName = (user?.name ?? '').trim().split(' ')[0]

  const [w, setW] = useState('')
  const [savedW, setSavedW] = useState(false)
  const [panel, setPanel] = useState<'peso' | 'nutri' | null>(null)

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
        {/* Tap sull'anello = check del giorno, anche senza allenarsi. */}
        <button onClick={onOpenCheck} aria-label="Check del giorno"
          style={{ textAlign: 'center', flex: '0 0 auto', background: 'none', border: 'none', padding: 0 }}>
          <ScoreRing value={home?.todayReady ?? null} size={82} />
          <div className="small" style={{ marginTop: 1, color: today.color, letterSpacing: '.04em' }}>Oggi · {today.label}</div>
        </button>
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
          <CoachCard home={home} />

          {/* Peso + Nutrizione affiancati: al tap si apre il pannello sotto (uno alla volta) */}
          <div className="row" style={{ gap: 8 }}>
            <button className={panel === 'peso' ? 'card sel' : 'card'} style={{ flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setPanel((p) => p === 'peso' ? null : 'peso')}>
              <div className="small">⚖️ Peso {home.bodyWeight ? <strong style={{ color: 'var(--gold)' }}>{home.bodyWeight.weight}kg</strong> : <span className="muted">—</span>}</div>
              <div className="muted small" style={{ marginTop: 2 }}>oggi {panel === 'peso' ? '▴' : '▾'}</div>
            </button>
            <button className={panel === 'nutri' ? 'card sel' : 'card'} style={{ flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setPanel((p) => p === 'nutri' ? null : 'nutri')}>
              <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🥗 Nutrizione{nutri?.dayType ? <span style={{ color: 'var(--gold)' }}> {nutri.dayType.toUpperCase()}</span> : ''}</div>
              <div className="muted small" style={{ marginTop: 2 }}>oggi {panel === 'nutri' ? '▴' : '▾'}</div>
            </button>
          </div>

          {panel === 'peso' && (
            <div className="card" style={{ padding: '10px 12px' }}>
              <div className="muted small">⚖️ Peso oggi{home.bodyWeight?.delta != null && <span> · {home.bodyWeight.delta > 0 ? '▲' : '▼'}{Math.abs(home.bodyWeight.delta)} vs prec.</span>}</div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <input inputMode="decimal" value={w} placeholder={home.bodyWeight ? String(home.bodyWeight.weight) : 'kg'} onChange={(e) => { setW(e.target.value); setSavedW(false) }} style={{ flex: 1, textAlign: 'center' }} />
                <span className="muted small" style={{ alignSelf: 'center' }}>kg</span>
                <button className="primary" style={{ padding: '9px 16px' }} disabled={parseNum(w, { min: 20, max: 400 }) == null} onClick={saveWeight}>Salva</button>
              </div>
              {savedW && <p className="small" style={{ marginTop: 4, color: 'var(--good)' }}>✓ Peso di oggi salvato</p>}
            </div>
          )}
          {panel === 'nutri' && <NutritionCard />}

          <button className="ghost" onClick={onOpenAnalytics}>📊 Analisi avanzate</button>
        </>
      )}
    </div>
  )
}

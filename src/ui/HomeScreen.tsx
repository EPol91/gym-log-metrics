import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { getOngoingSession, getUser } from '../db/repo'
import { dailyPhrase } from '../util/phrases'
import { NutritionCard } from './NutritionCard'
import { ScoreRing, Info } from './anim'
import type { ScoreResult } from '../scores/types'

const SCORE_TIPS: Record<string, string> = {
  Readiness: 'Quanto sei pronto oggi. Dal check pre-workout (sonno 40% · stanchezza 35% · energia 25%) e dal carico recente. Affidabilità: alta/media/inferenziale/insufficiente.',
  Workout: 'Qualità della seduta appena fatta rispetto ai TUOI standard: volume vs baseline, intensità (RIR/e1RM), PR battuti.',
  Performance: 'Stai progredendo nel tempo? Trend di forza (e1RM) e volume su ~6 settimane, tarato sulla fase (in cut mantenere la forza vale tanto).',
  Consistency: 'Quanto sei costante: sedute fatte vs obiettivo settimanale + regolarità + streak, su 4 settimane.',
}

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

function ScoreTile({ name, s }: { name: string; s: ScoreResult }) {
  return (
    <div className="card" style={{ margin: 0, minWidth: 0 }}>
      <div className="row" style={{ gap: 4, alignItems: 'center', marginBottom: 8 }}>
        <strong className="small">{name}</strong>
        <Info text={SCORE_TIPS[name] ?? ''} />
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <ScoreRing value={s.value} size={52} />
        <span className="tag">{s.reliability}</span>
      </div>
    </div>
  )
}

export function HomeScreen({ onStartWorkout, onResumeWorkout, onOpenAnalytics }: {
  onStartWorkout: () => void; onResumeWorkout: (id: string) => void; onOpenAnalytics: () => void
}) {
  const home = useLiveQuery(computeHome, [])
  const ongoing = useLiveQuery(getOngoingSession, [])
  const user = useLiveQuery(getUser, [])
  const firstName = (user?.name ?? '').trim().split(' ')[0]

  return (
    <div className="col">
      <div>
        <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.04em' }}>GYM LOG &amp; METRICS</p>
        <h1>Ciao{firstName ? ` ${firstName}` : ''} <span className="brand">👋</span></h1>
        <p className="muted small">{dailyPhrase()}</p>
      </div>

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
          <div className="grid2">
            <ScoreTile name="Readiness" s={home.readiness} />
            <ScoreTile name="Workout" s={home.workout} />
            <ScoreTile name="Performance" s={home.performance} />
            <ScoreTile name="Consistency" s={home.consistency} />
          </div>

          <div className="card">
            <div className="muted small">Ultimo allenamento</div>
            {home.lastSession ? (
              <div className="row spread" style={{ marginTop: 6 }}>
                <strong>{TYPE_LABEL[home.lastSession.type] ?? home.lastSession.type}</strong>
                <span className="muted small">
                  {home.lastSession.date} · {home.lastSession.tonnage} kg · {home.lastSession.volume} reps
                </span>
              </div>
            ) : (
              <p className="muted small" style={{ marginTop: 6 }}>Nessun allenamento ancora.</p>
            )}
            {home.bodyWeight && (
              <div className="row spread" style={{ marginTop: 8 }}>
                <span className="muted">Peso corporeo</span>
                <span>
                  <strong>{home.bodyWeight.weight} kg</strong>
                  {home.bodyWeight.delta != null && (
                    <span className="muted small"> ({home.bodyWeight.delta > 0 ? '+' : ''}{home.bodyWeight.delta})</span>
                  )}
                </span>
              </div>
            )}
          </div>

          <NutritionCard />

          <button className="ghost" onClick={onOpenAnalytics}>📊 Analisi avanzate</button>
        </>
      )}
    </div>
  )
}

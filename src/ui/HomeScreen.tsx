import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { NutritionCard } from './NutritionCard'
import { ScoreRing, Info } from './anim'
import type { ScoreResult } from '../scores/types'

const SCORE_TIPS: Record<string, string> = {
  Readiness: 'Quanto sei pronto oggi. Calcolato dal check pre-workout (sonno 40% · stanchezza 35% · energia 25%) e aggiustato sul carico recente.',
  Workout: 'Qualità della seduta appena fatta rispetto ai TUOI standard: volume vs baseline, intensità (RIR/e1RM), PR battuti.',
  Performance: 'Stai progredendo nel tempo? Trend di forza (e1RM) e volume su ~6 settimane, tarato sulla fase (in cut mantenere la forza vale tanto).',
  Consistency: 'Quanto sei costante: sedute fatte vs obiettivo settimanale + regolarità + streak, su 4 settimane.',
}
const RELIABILITY_TIP = 'Affidabilità del dato: ALTA = dati solidi · MEDIA = parziali · INFERENZIALE = pochi dati, è una stima · INSUFFICIENTE = non calcolabile.'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

function ScoreTile({ name, s }: { name: string; s: ScoreResult }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <ScoreRing value={s.value} />
        <div>
          <div className="muted small">{name}<Info text={SCORE_TIPS[name] ?? ''} /></div>
          <span className="tag">{s.reliability}<Info text={RELIABILITY_TIP} /></span>
        </div>
      </div>
    </div>
  )
}

export function HomeScreen({ onStartWorkout, onOpenAnalytics }: { onStartWorkout: () => void; onOpenAnalytics: () => void }) {
  const home = useLiveQuery(computeHome, [])

  return (
    <div className="col">
      <div>
        <h1>EP - GYM LOG <span className="brand">&amp; METRICS</span></h1>
        <p className="muted small">La tua dashboard</p>
      </div>

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

      <button className="fab primary" style={{ bottom: 78 }} onClick={onStartWorkout}>＋ Inizia allenamento</button>
    </div>
  )
}

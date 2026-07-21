import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeAnalytics } from '../scores/analytics'
import { computeCardioAverages, computeCardioWeekly } from '../scores/cardioStats'
import { canUse } from '../entitlements/entitlements'
import { BarChart } from './BarChart'
import { LineChart } from './LineChart'

export function AnalyticsScreen({ onBack }: { onBack: () => void }) {
  const data = useLiveQuery(() => computeAnalytics(8), [])
  const [cardioPeriod, setCardioPeriod] = useState(7)
  const cardioAvg = useLiveQuery(() => computeCardioAverages(cardioPeriod), [cardioPeriod])
  const cardioWeekly = useLiveQuery(() => computeCardioWeekly(8), [])

  // Analisi avanzate = feature Premium.
  if (!canUse('advanced-charts')) {
    return (
      <div className="col">
        <button className="ghost small" onClick={onBack}>← Home</button>
        <h1>Analytics</h1>
        <div className="card"><p className="muted small">Funzione Premium.</p></div>
      </div>
    )
  }

  return (
    <div className="col">
      <button className="ghost small" onClick={onBack}>← Home</button>
      <h1>Analytics</h1>
      <p className="muted small">Ultime 8 settimane</p>

      {!data ? (
        <p className="muted">Calcolo…</p>
      ) : data.totalSessions === 0 ? (
        <div className="card"><p className="muted small">Nessun dato ancora.</p></div>
      ) : (
        <>
          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Tonnellaggio settimanale (kg)</div>
            <BarChart points={data.weeklyTonnage} />
          </div>
          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Sedute per settimana</div>
            <BarChart points={data.weeklySessions} />
          </div>
          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Workout Score nel tempo</div>
            <LineChart points={data.workoutScores} />
          </div>
        </>
      )}

      {cardioAvg && cardioAvg.count > 0 && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="muted small">Cardio — media {cardioPeriod === 7 ? 'settimana' : 'mese'}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className={cardioPeriod === 7 ? 'sel small' : 'ghost small'} onClick={() => setCardioPeriod(7)}>7g</button>
              <button className={cardioPeriod === 30 ? 'sel small' : 'ghost small'} onClick={() => setCardioPeriod(30)}>30g</button>
            </span>
          </div>
          <div className="row spread"><span className="muted">Durata media</span><strong>{cardioAvg.avgDurationMin} min</strong></div>
          <div className="row spread"><span className="muted">BPM medio</span><strong>{cardioAvg.avgBpm ?? '—'}</strong></div>
          <div className="row spread"><span className="muted">Sessioni</span><strong>{cardioAvg.count}</strong></div>
          {cardioWeekly && cardioWeekly.some((p) => p.value > 0) && (
            <div style={{ marginTop: 8 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>Minuti cardio / settimana</div>
              <BarChart points={cardioWeekly} unit="′" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

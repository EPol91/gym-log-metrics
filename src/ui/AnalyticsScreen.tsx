import { useLiveQuery } from 'dexie-react-hooks'
import { computeAnalytics } from '../scores/analytics'
import { canUse } from '../entitlements/entitlements'
import { BarChart } from './BarChart'
import { LineChart } from './LineChart'

export function AnalyticsScreen({ onBack }: { onBack: () => void }) {
  const data = useLiveQuery(() => computeAnalytics(8), [])

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
    </div>
  )
}

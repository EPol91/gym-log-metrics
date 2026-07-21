import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeExerciseList } from '../scores/exerciseStats'
import { ExerciseDetail } from './ExerciseDetail'

export function ExercisesScreen() {
  const [selected, setSelected] = useState<string | null>(null)
  const list = useLiveQuery(computeExerciseList, [])

  if (selected) return <ExerciseDetail exerciseId={selected} onBack={() => setSelected(null)} />

  return (
    <div className="col">
      <h1>Esercizi</h1>
      <p className="muted small">Exercise Intelligence · tocca per la dashboard</p>
      {!list ? (
        <p className="muted">Carico…</p>
      ) : list.length === 0 ? (
        <p className="muted small">Nessun esercizio allenato ancora.</p>
      ) : (
        list.map((e) => (
          <button key={e.id} className="card" style={{ textAlign: 'left', width: '100%' }} onClick={() => setSelected(e.id)}>
            <div className="row spread">
              <strong>{e.name}</strong>
              <span className="muted small">PR {e.prE1rm} kg ›</span>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {e.muscle}{e.isCustom ? ' · custom' : ''} · {e.sessions} sedute · ultima {e.lastDate}
            </div>
          </button>
        ))
      )}
    </div>
  )
}

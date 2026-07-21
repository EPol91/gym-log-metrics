import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHistory } from '../scores/dashboardScores'
import { SessionDetail } from './SessionDetail'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

export function HistoryScreen() {
  const [selected, setSelected] = useState<string | null>(null)
  const list = useLiveQuery(computeHistory, [])

  if (selected) return <SessionDetail sessionId={selected} onBack={() => setSelected(null)} />

  return (
    <div className="col">
      <h1>Storico</h1>
      {!list ? (
        <p className="muted">Carico…</p>
      ) : list.length === 0 ? (
        <p className="muted small">Nessuna seduta registrata.</p>
      ) : (
        list.map((s) => (
          <button className="card" style={{ textAlign: 'left', width: '100%' }} key={s.id} onClick={() => setSelected(s.id)}>
            <div className="row spread">
              <strong>{TYPE_LABEL[s.type] ?? s.type}</strong>
              <span className="muted small">{s.date}{!s.finished ? ' · in corso' : ''} ›</span>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {s.exercises} esercizi · {s.sets} set · {s.volume} reps · {s.tonnage} kg
            </div>
            {s.cardio.map((c, i) => (
              <div className="muted small" key={i} style={{ marginTop: 2 }}>
                🏃 {c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{c.zoneLabel ? ` · ${c.zoneLabel} (${c.zonePct}%)` : ''}
              </div>
            ))}
          </button>
        ))
      )}
    </div>
  )
}

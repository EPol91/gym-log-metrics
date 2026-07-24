import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHistory } from '../scores/dashboardScores'
import { ScoreRing } from './anim'
import { SessionDetail } from './SessionDetail'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

export function HistoryScreen() {
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const list = useLiveQuery(computeHistory, [])

  if (selected) return <SessionDetail sessionId={selected} onBack={() => setSelected(null)} />

  const types = [...new Set((list ?? []).map((s) => s.type))]
  const shown = (list ?? []).filter((s) => !filter || s.type === filter)

  return (
    <div className="col">
      <h1>Storico</h1>

      {types.length > 1 && (
        <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <button className={filter === null ? 'sel small' : 'ghost small'} style={{ flex: '0 0 auto' }} onClick={() => setFilter(null)}>Tutte</button>
          {types.map((t) => (
            <button key={t} className={filter === t ? 'sel small' : 'ghost small'} style={{ flex: '0 0 auto' }} onClick={() => setFilter(t)}>{TYPE_LABEL[t] ?? t}</button>
          ))}
        </div>
      )}

      {!list ? (
        <p className="muted">Carico…</p>
      ) : shown.length === 0 ? (
        <p className="muted small">Nessuna seduta registrata.</p>
      ) : (
        shown.map((s) => (
          <button className="card" style={{ textAlign: 'left', width: '100%' }} key={s.id} onClick={() => setSelected(s.id)}>
            <div className="row spread">
              <strong>{TYPE_LABEL[s.type] ?? s.type}</strong>
              <span className="muted small">{s.date}{!s.finished ? ' · in corso' : ''} ›</span>
            </div>
            <div className="row spread" style={{ marginTop: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="muted small">{s.exercises} eserc · {s.sets} set · {s.volume} reps</div>
                <div className="muted small" style={{ marginTop: 2 }}>{s.tonnage} kg totali</div>
              </div>
              {s.score != null && <ScoreRing value={s.score} size={44} />}
            </div>
            {s.cardio.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 8 }}>
                {s.cardio.map((c, i) => (
                  <div className="muted small" key={i} style={{ marginTop: i ? 3 : 0 }}>
                    🏃 {c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{c.zoneLabel ? ` · ${c.zoneLabel} (${c.zonePct}%)` : ''}
                  </div>
                ))}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  )
}

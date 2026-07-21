import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises, getOrCreateExercise } from '../db/repo'
import { normalizeName } from '../db/catalog'
import type { Exercise } from '../db/schema'

export function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = useLiveQuery(allExercises, []) ?? []
  const nq = normalizeName(q)
  const filtered = nq
    ? list.filter((e) => normalizeName(e.name).includes(nq) || e.aliases.some((a) => normalizeName(a).includes(nq)))
    : list
  const exactExists = list.some((e) => normalizeName(e.name) === nq || e.aliases.some((a) => normalizeName(a) === nq))

  return (
    <div className="card">
      <div className="row spread"><strong>Aggiungi esercizio</strong><button className="ghost small" onClick={onClose}>✕</button></div>
      <input placeholder="Cerca o scrivi un nome…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '10px 0' }} />
      <div className="col" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {q && !exactExists && (
          <button className="sel" onClick={async () => { const ex = await getOrCreateExercise(q); onPick(ex.id) }}>＋ Crea “{q.trim()}”</button>
        )}
        {filtered.map((e: Exercise) => (
          <button key={e.id} className="ghost" style={{ textAlign: 'left' }} onClick={() => onPick(e.id)}>
            {e.name} <span className="muted small">· {e.muscle}{e.isCustom ? ' · custom' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

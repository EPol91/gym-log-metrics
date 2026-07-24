import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeExerciseList } from '../scores/exerciseStats'
import { allExercises, getOrCreateExercise } from '../db/repo'
import { normalizeName } from '../db/catalog'
import { ExerciseDetail } from './ExerciseDetail'
import type { MuscleGroup } from '../db/schema'

export function ExercisesScreen() {
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const all = useLiveQuery(allExercises, []) ?? []
  const stats = useLiveQuery(computeExerciseList, [])
  const statsById = new Map((stats ?? []).map((s) => [s.id, s]))

  if (selected) return <ExerciseDetail exerciseId={selected} onBack={() => setSelected(null)} />

  const nq = normalizeName(q)
  const muscles = [...new Set(all.map((e) => e.muscle))]
  const filtered = all
    .filter((e) => !muscle || e.muscle === muscle)
    .filter((e) => !nq || normalizeName(e.name).includes(nq) || e.aliases.some((a) => normalizeName(a).includes(nq)))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const exactExists = all.some((e) => normalizeName(e.name) === nq || e.aliases.some((a) => normalizeName(a) === nq))

  const groups: { letter: string; items: typeof filtered }[] = []
  filtered.forEach((e) => {
    const L = (e.name[0] ?? '#').toUpperCase()
    let g = groups.find((x) => x.letter === L)
    if (!g) { g = { letter: L, items: [] }; groups.push(g) }
    g.items.push(e)
  })

  return (
    <div className="col">
      <h1>Esercizi</h1>
      <input placeholder="🔍 Cerca o crea un esercizio…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button className={muscle === null ? 'sel small' : 'ghost small'} style={{ flex: '0 0 auto' }} onClick={() => setMuscle(null)}>Tutti</button>
        {muscles.map((m) => (
          <button key={m} className={muscle === m ? 'sel small' : 'ghost small'} style={{ flex: '0 0 auto' }} onClick={() => setMuscle(m)}>{m}</button>
        ))}
      </div>

      {q && !exactExists && (
        <button className="sel" onClick={async () => { const ex = await getOrCreateExercise(q); setSelected(ex.id) }}>＋ Crea “{q.trim()}”</button>
      )}

      {groups.length === 0 ? (
        <p className="muted small">Nessun esercizio.</p>
      ) : groups.map((g) => (
        <div key={g.letter}>
          <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 12, margin: '8px 0 2px' }}>{g.letter}</div>
          {g.items.map((e) => {
            const st = statsById.get(e.id)
            return (
              <div key={e.id} onClick={() => setSelected(e.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name} <span className="muted small">· {e.muscle}{e.isCustom ? ' · custom' : ''}</span>
                </span>
                <span className="muted small" style={{ flex: '0 0 auto', marginLeft: 8 }}>{st ? `PR ${st.prE1rm} ›` : '›'}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

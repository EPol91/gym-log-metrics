import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises, getOrCreateExercise } from '../db/repo'
import { normalizeName } from '../db/catalog'
import type { Exercise, MuscleGroup } from '../db/schema'

export function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const list = useLiveQuery(allExercises, []) ?? []
  const nq = normalizeName(q)
  const muscles = [...new Set(list.map((e) => e.muscle))]
  const filtered = list
    .filter((e) => !muscle || e.muscle === muscle)
    .filter((e) => !nq || normalizeName(e.name).includes(nq) || e.aliases.some((a) => normalizeName(a).includes(nq)))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const exactExists = list.some((e) => normalizeName(e.name) === nq || e.aliases.some((a) => normalizeName(a) === nq))

  // Esc chiude; blocca lo scroll di fondo mentre la modale è aperta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  // Portal su body: la modale deve stare SOPRA tutto (gli antenati con transform
  // intrappolerebbero un position:fixed annidato).
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <strong>Aggiungi esercizio</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        <input autoFocus placeholder="🔍 Cerca o scrivi un nome…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '10px 0 8px' }} />

        {muscles.length > 1 && (
          <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 8, flex: 'none' }}>
            <button className={muscle === null ? 'chip on' : 'chip'} onClick={() => setMuscle(null)}>Tutti</button>
            {muscles.map((m) => (
              <button key={m} className={muscle === m ? 'chip on' : 'chip'} onClick={() => setMuscle(m)}>{m}</button>
            ))}
          </div>
        )}

        <div className="col" style={{ gap: 0, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {q && !exactExists && (
            <button className="sel" style={{ marginBottom: 8 }} onClick={async () => { const ex = await getOrCreateExercise(q); onPick(ex.id) }}>＋ Crea “{q.trim()}”</button>
          )}
          {filtered.length === 0 && !q && <p className="muted small">Nessun esercizio.</p>}
          {filtered.map((e: Exercise) => (
            <div key={e.id} onClick={() => onPick(e.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name} <span className="muted small">· {e.muscle}{e.isCustom ? ' · custom' : ''}</span>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>＋</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

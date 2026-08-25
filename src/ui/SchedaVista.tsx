// La scheda in sola lettura: guardarla senza iniziare l'allenamento.
//
// Prima l'unico modo per sapere com'era fatta la D4 era farla partire: apri la
// seduta, guardi, e poi ti ritrovi un allenamento aperto da chiudere. Qui la
// scheda si legge e basta — cosa c'è, in che ordine, con la prescrizione del
// coach e quello che ci hai messo l'ultima volta.

import { useLiveQuery } from 'dexie-react-hooks'
import { createPortal } from 'react-dom'
import { db } from '../db/db'
import { allExercises, exerciseHistory } from '../db/repo'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import { fmtData } from '../util/format'
import type { SetEntry } from '../db/schema'

/** L'ultima volta che hai fatto un esercizio, in due parole. */
async function ultimaVolta(exerciseId: string): Promise<{ data: string; sets: SetEntry[] } | null> {
  const h = await exerciseHistory(exerciseId, '', 1)
  return h.length ? { data: h[0].date, sets: h[0].sets } : null
}

export function SchedaVista({ templateId, onClose, onInizia }: {
  templateId: string
  onClose: () => void
  /** parte l'allenamento da questa scheda; assente = solo lettura */
  onInizia?: () => void
}) {
  useBloccoScroll()
  useIndietro(onClose)
  const scheda = useLiveQuery(() => db.templates.get(templateId), [templateId])
  const esercizi = useLiveQuery(allExercises, []) ?? []
  const storia = useLiveQuery(async () => {
    const t = await db.templates.get(templateId)
    if (!t) return {}
    const out: Record<string, { data: string; sets: SetEntry[] } | null> = {}
    for (const it of t.items) out[it.exerciseId] = await ultimaVolta(it.exerciseId)
    return out
  }, [templateId]) ?? {}

  if (!scheda) return null
  const righe = [...scheda.items].sort((a, b) => a.order - b.order)
  const nome = (id: string) => esercizi.find((e) => e.id === id)?.name ?? '—'
  const note = (id: string) => (esercizi.find((e) => e.id === id)?.settings ?? '')
    .split('\n').map((r) => r.trim()).filter(Boolean)

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scheda.name}</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center', flex: 'none' }} onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ margin: '0 0 10px' }}>
          {righe.length} esercizi · sola lettura, non apre nessuna seduta
        </p>

        {righe.map((it, i) => {
          const tutte = note(it.exerciseId)
          const dalCoach = tutte.filter((r) => r.startsWith('🦠'))
          const mie = tutte.filter((r) => !r.startsWith('🦠'))
          const u = storia[it.exerciseId]
          return (
            <div key={`${it.exerciseId}-${i}`} style={{ borderTop: '1px solid var(--line)', padding: '9px 0' }}>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span className="muted small" style={{ flex: 'none', width: 18 }}>{i + 1}</span>
                <strong style={{ fontSize: 14, minWidth: 0 }}>{nome(it.exerciseId)}</strong>
                {/* La coppia si vede prima di entrare in palestra: sapere che
                    due esercizi vanno insieme cambia come ti organizzi. */}
                {it.coppia && (
                  <span className="chip" style={{ padding: '1px 7px', fontSize: 10, color: 'var(--gold)', borderColor: 'var(--gold)' }}>
                    superset
                  </span>
                )}
              </div>
              {dalCoach.map((r, k) => (
                <p key={k} className="small" style={{ margin: '3px 0 0 26px', color: 'var(--rs)' }}>{r}</p>
              ))}
              {mie.length > 0 && (
                <p className="muted small" style={{ margin: '3px 0 0 26px' }}>⚙ {mie.join(' · ')}</p>
              )}
              {/* L'ultima volta che l'hai fatto: serve a sapere da che peso
                  riparti, prima ancora di entrare in palestra. */}
              <p className="muted" style={{ fontSize: 11, margin: '3px 0 0 26px' }}>
                {u
                  ? `ultima volta ${fmtData(u.data)} · ${u.sets.map((s) => `${s.weight}×${s.reps}`).join('  ')}`
                  : 'mai fatto'}
              </p>
            </div>
          )
        })}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Chiudi</button>
          {onInizia && <button className="primary" style={{ flex: 2 }} onClick={onInizia}>▶ Inizia</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

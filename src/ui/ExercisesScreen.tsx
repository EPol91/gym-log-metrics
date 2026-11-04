import { useState } from 'react'
import { usePersistedState } from '../util/persist'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeExerciseList, type ExerciseListItem } from '../scores/exerciseStats'
import { allExercises, getOrCreateExercise, listTemplates } from '../db/repo'
import { normalizeName } from '../db/catalog'
import { codiceScheda, nomeScheda } from '../scores/confronto'
import { todayLocal } from '../util/date'
import type { Exercise } from '../db/schema'

const kgv = (n: number) => String(n).replace('.', ',')

/** «oggi», «ieri», «5 gg fa». */
function quando(iso: string | null): string | null {
  if (!iso) return null
  const g = Math.round((Date.parse(todayLocal()) - Date.parse(iso)) / 86_400_000)
  return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : `${g} gg fa`
}

/** La tendenza in piccolo: verde sale, grigio fermo, rosso scende. */
function Tendenza({ v }: { v: number[] }) {
  if (v.length < 2) return <svg width="54" height="22" style={{ flex: 'none' }}><path d="M0 11 L54 11" stroke="#5d5951" strokeWidth="2" strokeDasharray="3 3" /></svg>
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 54).toFixed(1)} ${(19 - ((x - min) / span) * 16).toFixed(1)}`).join(' ')
  const var_ = (v[v.length - 1] - v[0]) / v[0]
  const col = var_ > 0.01 ? '#5bc27a' : var_ < -0.01 ? '#e0614f' : '#8f8a80'
  return <svg width="54" height="22" style={{ flex: 'none' }}><path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" /></svg>
}

type Vista = 'schede' | 'tutti' | string // string = un gruppo muscolare

// onOpen instrada il dettaglio nella navigazione dell'app (App.tsx) → sopravvive a refresh e tasto Back.
// isNew=true apre il dettaglio già in modifica: un esercizio appena creato nasce senza gruppo muscolare.
/**
 * Gli esercizi: per ognuno l'ultimo carico, quando e la tendenza. Di base divisi
 * per scheda, nell'ordine in cui li fai; «Tutti» resta l'elenco alfabetico.
 */
export function ExercisesScreen({ onOpen }: { onOpen: (id: string, isNew?: boolean) => void }) {
  const [q, setQ] = useState('')
  const [vista, setVista] = usePersistedState<Vista>('ex-vista', 'schede')
  const all = useLiveQuery(allExercises, []) ?? []
  const stats = useLiveQuery(computeExerciseList, [])
  const schede = (useLiveQuery(listTemplates, []) ?? []).filter((t) => !t.cardio && t.items.length)
  const statsById = new Map((stats ?? []).map((s) => [s.id, s]))

  const nq = normalizeName(q)
  const muscoli = [...new Set(all.map((e) => e.muscle))].sort((a, b) => a.localeCompare(b, 'it'))
  const exactExists = all.some((e) => normalizeName(e.name) === nq || e.aliases.some((a) => normalizeName(a) === nq))
  const etichetta = (nome: string) => codiceScheda(nome) ?? nomeScheda(nome)
  const schedeDi = (id: string) => schede.filter((t) => t.items.some((i) => i.exerciseId === id)).map((t) => etichetta(t.name))

  const crea = async (nome: string) => { const ex = await getOrCreateExercise(nome); onOpen(ex.id, true) } // apre subito in modifica: scegli il gruppo muscolare

  const riga = (e: Exercise, scheda?: string) => {
    const st: ExerciseListItem | undefined = statsById.get(e.id)
    const altre = scheda ? schedeDi(e.id).filter((x) => x !== scheda) : []
    const sotto = [e.muscle, quando(st?.lastDate ?? null) ?? 'mai fatto', altre.length ? `anche in ${altre.join(', ')}` : null].filter(Boolean).join(' · ')
    return (
      <button key={`${scheda ?? ''}${e.id}`} className="riga-s" onClick={() => onOpen(e.id)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</b>
          <span className="sotto">{sotto}</span>
        </span>
        {st && <Tendenza v={st.andamento} />}
        <span style={{ width: 54, flex: 'none', textAlign: 'right' }}>
          {st?.ultima ? (
            <>
              <b className="num" style={{ fontSize: 17, display: 'block', lineHeight: 1 }}>{kgv(st.ultima.weight)}</b>
              <span className="muted" style={{ fontSize: 10.5 }}>× {st.ultima.reps}</span>
            </>
          ) : <span className="muted">›</span>}
        </span>
      </button>
    )
  }

  // La ricerca guarda sempre tutto, qualunque sia la vista.
  const elenco = all
    .filter((e) => (nq ? normalizeName(e.name).includes(nq) || e.aliases.some((a) => normalizeName(a).includes(nq)) : vista === 'tutti' || e.muscle === vista))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const perScheda = !nq && vista === 'schede'

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <input placeholder="Cerca o crea un esercizio…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" aria-label="Nuovo esercizio" style={{ width: 46, padding: 0, fontSize: 20, flex: 'none' }} onClick={async () => {
          const name = prompt('Nome del nuovo esercizio')?.trim()
          if (name) await crea(name)
        }}>＋</button>
      </div>

      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button className={vista === 'schede' ? 'chip on' : 'chip'} onClick={() => setVista('schede')}>Nelle schede</button>
        <button className={vista === 'tutti' ? 'chip on' : 'chip'} onClick={() => setVista('tutti')}>Tutti</button>
        {muscoli.map((m) => (
          <button key={m} className={vista === m ? 'chip on' : 'chip'} style={{ textTransform: 'capitalize' }} onClick={() => setVista(m)}>{m}</button>
        ))}
      </div>

      {q && !exactExists && <button className="sel" onClick={() => void crea(q)}>＋ Crea «{q.trim()}»</button>}

      {perScheda ? (
        schede.length === 0 ? <p className="muted small">Nessuna scheda: guarda «Tutti».</p> : schede
          .slice().sort((a, b) => etichetta(a.name).localeCompare(etichetta(b.name), 'it'))
          .map((t) => {
            const voci = [...t.items].sort((a, b) => a.order - b.order).map((i) => all.find((e) => e.id === i.exerciseId)).filter((e): e is Exercise => !!e)
            return (
              <div key={t.id} className="col" style={{ gap: 6 }}>
                <div className="row spread" style={{ margin: '2px 4px 0', alignItems: 'baseline' }}>
                  <span className="etichetta-p">{nomeScheda(t.name)}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>ultimo carico · tendenza</span>
                </div>
                <div className="lista-p">{voci.map((e) => riga(e, etichetta(t.name)))}</div>
              </div>
            )
          })
      ) : elenco.length === 0 ? <p className="muted small">Nessun esercizio.</p> : (
        <div className="lista-p">{elenco.map((e) => riga(e))}</div>
      )}
    </div>
  )
}

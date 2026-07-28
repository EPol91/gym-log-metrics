import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { entriesOf, setsOf, allExercises, getSession, cardioOf, sessionElapsedSec } from '../db/repo'
import { tonnage, volume, e1rm } from '../metrics/metrics'
import { fmtRest } from '../util/format'
import type { ExerciseEntry, SetEntry } from '../db/schema'

interface Row { entry: ExerciseEntry; name: string; sets: SetEntry[] }
interface OverviewBlock {
  kind: 'single' | 'group'
  rows: Row[]
  index: number // posizione del blocco nella vista live, per tornarci
}

async function computeOverview(sessionId: string) {
  const session = await getSession(sessionId)
  const entries = await entriesOf(sessionId)
  const exercises = await allExercises()
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—'

  const rows: Row[] = []
  for (const e of entries) rows.push({ entry: e, name: nameOf(e.exerciseId), sets: await setsOf(e.id) })

  // Stessi blocchi della vista live: singoli e superset/triset.
  const blocks: OverviewBlock[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.entry.groupId) { blocks.push({ kind: 'single', rows: [r], index: blocks.length }); continue }
    if (seen.has(r.entry.groupId)) continue
    seen.add(r.entry.groupId)
    blocks.push({ kind: 'group', rows: rows.filter((x) => x.entry.groupId === r.entry.groupId), index: blocks.length })
  }

  const allSets = rows.flatMap((r) => r.sets)
  const cardio = await cardioOf(sessionId)
  return {
    session,
    blocks,
    totals: {
      exercises: rows.length,
      sets: allSets.filter((s) => !s.isWarmup).length,
      reps: volume(allSets),
      tonnage: tonnage(allSets),
    },
    cardio,
  }
}

/** Panoramica della seduta in corso: tutto quello che hai fatto finora, in un colpo d'occhio. */
export function WorkoutOverview({ sessionId, onBack, onOpenBlock }: {
  sessionId: string
  onBack: () => void
  onOpenBlock: (index: number) => void
}) {
  const d = useLiveQuery(() => computeOverview(sessionId), [sessionId])
  // Nota: la lettura passa da db per restare reattiva agli inserimenti in corso.
  useLiveQuery(() => db.sets.where('userId').equals(LOCAL_USER_ID).count(), [])

  if (!d) return <div className="col"><p className="muted">Carico…</p></div>

  const min = d.session ? Math.round(sessionElapsedSec(d.session) / 60) : 0

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" onClick={onBack}>‹ Allenamento</button>
        <span className="muted small">⏱ {min} min</span>
      </div>

      <h1 style={{ marginBottom: 0 }}>Panoramica</h1>

      {/* Totali */}
      <div className="card">
        <div className="row" style={{ textAlign: 'center' }}>
          {[
            { v: d.totals.exercises, l: 'esercizi' },
            { v: d.totals.sets, l: 'serie' },
            { v: d.totals.reps, l: 'reps' },
            { v: `${d.totals.tonnage}`, l: 'kg totali' },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
              <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {d.blocks.length === 0 && <p className="muted small">Nessun esercizio registrato.</p>}

      {/* Blocchi: tocca per tornare su quell'esercizio */}
      {d.blocks.map((b) => {
        const done = b.rows.reduce((a, r) => a + r.sets.filter((s) => !s.isWarmup).length, 0)
        const kg = tonnage(b.rows.flatMap((r) => r.sets))
        return (
          <button key={b.rows[0].entry.id} className="card" style={{ width: '100%', textAlign: 'left' }}
            onClick={() => onOpenBlock(b.index)}>
            <div className="row spread" style={{ alignItems: 'baseline' }}>
              <span style={{ minWidth: 0 }}>
                {b.kind === 'group' && (
                  <span className="chip on" style={{ padding: '2px 8px', fontSize: 10, marginRight: 6 }}>
                    {b.rows.length === 3 ? 'TRISET' : 'SUPERSET'}
                  </span>
                )}
                <strong>{b.rows.map((r) => r.name).join(' + ')}</strong>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>{done} serie · {kg} kg ›</span>
            </div>

            {b.rows.map((r) => {
              const work = r.sets.filter((s) => !s.isWarmup)
              const best = work.length ? Math.max(...work.map((s) => e1rm(s.weight, s.reps))) : 0
              return (
                <div key={r.entry.id} style={{ marginTop: 8 }}>
                  {b.kind === 'group' && <div className="muted" style={{ fontSize: 11 }}>{r.name}</div>}
                  {work.length === 0 ? (
                    <div className="muted small">nessuna serie</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                        {work.map((s, i) => (
                          <span key={s.id} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            <span className="muted">{i + 1}</span> {s.weight}×{s.reps}
                            {s.rir != null && <span className="muted"> R{s.rir}</span>}
                          </span>
                        ))}
                      </div>
                      <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                        e1RM migliore {Math.round(best)} kg
                        {work[0]?.restSec ? ` · recupero ${fmtRest(work[0].restSec)}` : ''}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </button>
        )
      })}

      {/* Cardio della seduta */}
      {d.cardio.length > 0 && (
        <div className="card">
          <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Cardio</div>
          {d.cardio.map((c) => (
            <div key={c.id} className="row spread small" style={{ padding: '3px 0' }}>
              <span>🏃 {c.cardioType ?? 'cardio'}</span>
              <span className="muted">{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {d.session?.notes && (
        <div className="card">
          <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Note</div>
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.session.notes}</p>
        </div>
      )}
    </div>
  )
}

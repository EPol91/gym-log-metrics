import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { cardioOf, deleteSession, finishSession, setSessionType, addSet, updateSet, deleteSet, addExerciseEntry, deleteExerciseEntry } from '../db/repo'
import { computeSessionWorkoutScore } from '../scores/sessionScore'
import { computeCardioZone } from '../metrics/cardio'
import { LOCAL_USER_ID } from '../db/seed'
import { volume, tonnage } from '../metrics/metrics'
import { parseNum } from '../util/validate'
import { CountUp } from './anim'
import { ExercisePicker } from './ExercisePicker'
import type { SetEntry, WorkoutType } from '../db/schema'

// Riga serie modificabile in-place (dettaglio storico).
function SetEditRow({ s }: { s: SetEntry }) {
  const [ed, setEd] = useState(false)
  const [w, setW] = useState(String(s.weight))
  const [r, setR] = useState(String(s.reps))
  if (ed) return (
    <div className="row" style={{ gap: 6, margin: '4px 0' }}>
      <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 64 }} />
      <input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 52 }} />
      <button className="primary small" onClick={async () => { const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true }); if (wn != null && rn != null) { await updateSet(s.id, { weight: wn, reps: rn }); setEd(false) } }}>✓</button>
      <button className="ghost small" onClick={() => setEd(false)}>annulla</button>
    </div>
  )
  return (
    <div className="setline">
      <span className="muted">{s.isWarmup ? 'W' : ''}</span>
      <span onClick={() => setEd(true)} style={{ cursor: 'pointer' }}>{s.weight} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''} <span className="muted small">✎</span></span>
      <button className="ghost small" onClick={() => { if (confirm('Eliminare la serie?')) deleteSet(s.id) }}>✕</button>
    </div>
  )
}

function AddSetRow({ entryId }: { entryId: string }) {
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  return (
    <div className="row" style={{ gap: 6, marginTop: 6 }}>
      <input placeholder="kg" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 64 }} />
      <input placeholder="reps" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 56 }} />
      <button className="ghost small" onClick={async () => { const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true }); if (wn != null && rn != null) { await addSet(entryId, { weight: wn, reps: rn }); setW(''); setR('') } }}>＋ set</button>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}
const TYPES = Object.keys(TYPE_LABEL) as WorkoutType[]

async function load(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session) return null
  const exNames = new Map((await db.exercises.where('userId').equals(LOCAL_USER_ID).toArray()).map((e) => [e.id, e.name]))
  const entries = await db.exerciseEntries.where({ sessionId }).sortBy('order')
  const items = []
  let allSets: SetEntry[] = []
  for (const e of entries) {
    const sets = await db.sets.where({ entryId: e.id }).sortBy('order')
    allSets = allSets.concat(sets)
    items.push({ entryId: e.id, name: exNames.get(e.exerciseId) ?? '—', sets })
  }
  const cardioRows = await cardioOf(sessionId)
  const user = await db.users.get(LOCAL_USER_ID)
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const cardio = cardioRows.map((c) => ({
    durationMin: c.durationMin, avgBpm: c.avgBpm,
    zone: c.avgBpm && (age || user?.hrMaxMeasured) ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr: user?.restingHr, method: c.method ?? 'standard', maxHr: user?.hrMaxMeasured }) : null,
  }))
  const score = await computeSessionWorkoutScore(sessionId)
  const durationMin = session.startedAt && session.finishedAt
    ? Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
    : null
  return { session, items, cardio, score, vol: volume(allSets), ton: tonnage(allSets), durationMin }
}

export function SessionDetail({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const d = useLiveQuery(() => load(sessionId), [sessionId])
  const [editType, setEditType] = useState(false)
  const [edit, setEdit] = useState(false)
  const [picking, setPicking] = useState(false)
  if (!d) return <div className="col"><button className="ghost small" onClick={onBack}>← Storico</button><p className="muted">Carico…</p></div>

  return (
    <div className="col">
      <button className="ghost small" onClick={onBack}>← Storico</button>
      <div className="row spread">
        {editType ? (
          <select value={d.session.type} style={{ fontSize: 18 }}
            onChange={(e) => { setSessionType(sessionId, e.target.value as WorkoutType); setEditType(false) }}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        ) : (
          <h1 style={{ cursor: 'pointer' }} onClick={() => setEditType(true)}>
            {TYPE_LABEL[d.session.type] ?? d.session.type} <span className="muted small">✎</span>
          </h1>
        )}
        <span className="muted small">{d.session.date}{!d.session.finishedAt ? ' · in corso' : ''}</span>
      </div>

      <div className="card score">
        <span className="muted small">Workout Score</span>
        <span className="val"><CountUp value={d.score.value} /></span>
        <span className="tag">{d.score.reliability}</span>
      </div>

      <div className="card">
        {d.durationMin != null && <div className="row spread"><span className="muted">Durata</span><strong>{d.durationMin} min</strong></div>}
        <div className="row spread"><span className="muted">Volume</span><strong>{d.vol} reps</strong></div>
        <div className="row spread"><span className="muted">Tonnellaggio</span><strong>{d.ton} kg</strong></div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className={edit ? 'sel small' : 'ghost small'} onClick={() => { setEdit((v) => !v); setPicking(false) }}>{edit ? '✓ Fine modifica' : '✎ Modifica'}</button>
      </div>

      {d.items.map((it) => (
        <div className="card" key={it.entryId}>
          <div className="row spread">
            <strong>{it.name}</strong>
            {edit && <button className="ghost small" onClick={() => { if (confirm(`Rimuovere ${it.name}?`)) deleteExerciseEntry(it.entryId) }}>🗑</button>}
          </div>
          {edit ? (
            <>
              {it.sets.map((s) => <SetEditRow key={s.id} s={s} />)}
              <AddSetRow entryId={it.entryId} />
            </>
          ) : (
            it.sets.length === 0 ? <p className="muted small">Nessun set.</p> : it.sets.map((s, j) => (
              <div className="setline" key={s.id}>
                <span className="muted">{s.isWarmup ? 'W' : j + 1}</span>
                <span>{s.weight} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''}{s.restSec != null && !s.isWarmup ? ` · ⏱${s.restSec}s` : ''}</span><span />
              </div>
            ))
          )}
        </div>
      ))}

      {edit && (picking
        ? <ExercisePicker onPick={async (id) => { await addExerciseEntry(sessionId, id); setPicking(false) }} onClose={() => setPicking(false)} />
        : <button className="ghost" onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
      )}

      {d.cardio.length > 0 && (
        <div className="card">
          <div className="muted small" style={{ marginBottom: 6 }}>Cardio</div>
          {d.cardio.map((c, i) => (
            <div className="setline" key={i}><span className="muted small">🏃</span>
              <span>{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{c.zone ? ` · ${c.zone.label} (${c.zone.pct}%)` : ''}</span><span /></div>
          ))}
        </div>
      )}

      {d.session.notes && <div className="card"><div className="muted small">Note</div><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{d.session.notes}</p></div>}

      <div className="row">
        {!d.session.finishedAt && <button className="ghost" style={{ flex: 1 }} onClick={() => finishSession(sessionId)}>Chiudi seduta</button>}
        <button className="ghost" style={{ flex: 1, color: '#e57373' }}
          onClick={() => { if (confirm('Eliminare definitivamente questa seduta?')) { deleteSession(sessionId); onBack() } }}>
          🗑 Elimina seduta
        </button>
      </div>
    </div>
  )
}

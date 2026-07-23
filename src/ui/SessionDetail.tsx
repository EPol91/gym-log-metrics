import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { cardioOf, deleteSession, finishSession } from '../db/repo'
import { computeSessionWorkoutScore } from '../scores/sessionScore'
import { computeCardioZone } from '../metrics/cardio'
import { LOCAL_USER_ID } from '../db/seed'
import { volume, tonnage } from '../metrics/metrics'
import { CountUp } from './anim'
import type { SetEntry } from '../db/schema'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

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
    items.push({ name: exNames.get(e.exerciseId) ?? '—', sets })
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
  if (!d) return <div className="col"><button className="ghost small" onClick={onBack}>← Storico</button><p className="muted">Carico…</p></div>

  return (
    <div className="col">
      <button className="ghost small" onClick={onBack}>← Storico</button>
      <div className="row spread">
        <h1>{TYPE_LABEL[d.session.type] ?? d.session.type}</h1>
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

      {d.items.map((it, i) => (
        <div className="card" key={i}>
          <strong>{it.name}</strong>
          {it.sets.length === 0 ? <p className="muted small">Nessun set.</p> : it.sets.map((s, j) => (
            <div className="setline" key={s.id}>
              <span className="muted">{s.isWarmup ? 'W' : j + 1}</span>
              <span>{s.weight} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''}</span><span />
            </div>
          ))}
        </div>
      ))}

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

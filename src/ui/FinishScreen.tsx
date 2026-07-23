import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { tonnage, volume } from '../metrics/metrics'
import { computeSessionWorkoutScore } from '../scores/sessionScore'
import { computeCardioZone } from '../metrics/cardio'
import { createTemplateFromSession } from '../db/repo'
import { LOCAL_USER_ID } from '../db/seed'
import { AiInsight } from './AiInsight'
import { CountUp } from './anim'
import type { SetEntry } from '../db/schema'

async function sessionStats(sessionId: string) {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  let sets: SetEntry[] = []
  for (const e of entries) sets = sets.concat(await db.sets.where({ entryId: e.id }).toArray())
  const score = await computeSessionWorkoutScore(sessionId)

  const session = await db.sessions.get(sessionId)
  const durationMin = session?.startedAt && session?.finishedAt
    ? Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
    : null

  const user = await db.users.get(LOCAL_USER_ID)
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const cardioRows = await db.cardio.where({ sessionId }).toArray()
  const cardio = cardioRows.map((c) => {
    const z = c.avgBpm && (age || user?.hrMaxMeasured)
      ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr: user?.restingHr, method: c.method ?? 'standard', maxHr: user?.hrMaxMeasured })
      : null
    return { durationMin: c.durationMin, avgBpm: c.avgBpm, zone: z }
  })

  return { exercises: entries.length, setCount: sets.length, vol: volume(sets), ton: tonnage(sets), score, cardio, durationMin }
}

export function FinishScreen({ sessionId, onHome }: { sessionId: string; onHome: () => void }) {
  const stats = useLiveQuery(() => sessionStats(sessionId), [sessionId])
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)

  async function saveTemplate() {
    await createTemplateFromSession(sessionId, name)
    setSaved(true)
    setSaving(false)
  }

  return (
    <div className="col">
      <h2>Allenamento finito 💪</h2>
      {!stats ? (
        <p className="muted">Calcolo…</p>
      ) : (
        <>
          <div className="card score">
            <span className="muted small">Workout Score</span>
            <span className="val"><CountUp value={stats.score.value} /></span>
            <span className="tag">{stats.score.reliability}</span>
          </div>
          {stats.score.note && <p className="muted small" style={{ marginTop: -6 }}>{stats.score.note}</p>}
          <div className="card">
            {stats.durationMin != null && <div className="row spread"><span className="muted">Durata</span><strong>{stats.durationMin} min</strong></div>}
            <div className="row spread"><span className="muted">Esercizi</span><strong>{stats.exercises}</strong></div>
            <div className="row spread"><span className="muted">Set totali</span><strong>{stats.setCount}</strong></div>
            <div className="row spread"><span className="muted">Volume (reps)</span><strong>{stats.vol}</strong></div>
            <div className="row spread"><span className="muted">Tonnellaggio</span><strong>{stats.ton} kg</strong></div>
          </div>

          {stats.cardio.length > 0 && (
            <div className="card">
              <div className="muted small" style={{ marginBottom: 6 }}>Cardio</div>
              {stats.cardio.map((c, i) => (
                <div className="setline" key={i}>
                  <span className="muted small">🏃</span>
                  <span>{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{c.zone ? ` · ${c.zone.label} (${c.zone.pct}%)` : ''}</span>
                  <span />
                </div>
              ))}
            </div>
          )}

          <AiInsight
            label="Report AI della seduta"
            buildPrompt={() => {
              const cardio = stats.cardio.map((c) => `${c.durationMin}min${c.avgBpm ? ` @${c.avgBpm}bpm` : ''}${c.zone ? ` ${c.zone.label}` : ''}`).join(', ')
              return `Seduta appena conclusa.\nWorkout Score: ${stats.score.value ?? 'n/d'} (${stats.score.reliability}).\nEsercizi: ${stats.exercises}, set: ${stats.setCount}, volume: ${stats.vol} reps, tonnellaggio: ${stats.ton} kg.${cardio ? `\nCardio: ${cardio}.` : ''}\n\nCommenta la seduta in modo conciso: qualità, punti di forza, cosa migliorare. Se i dati sono pochi, dillo.`
            }}
          />

          <div className="card">
            {saved ? (
              <p className="muted small">✓ Template salvato. Lo ritrovi in “Nuovo allenamento”.</p>
            ) : saving ? (
              <div className="col">
                <label className="fl">Nome template</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Push A" />
                <div className="row">
                  <button className="ghost" style={{ flex: 1 }} onClick={() => setSaving(false)}>Annulla</button>
                  <button className="primary" style={{ flex: 2 }} onClick={saveTemplate}>Salva</button>
                </div>
              </div>
            ) : (
              <button className="ghost" style={{ width: '100%' }} disabled={stats.exercises === 0} onClick={() => setSaving(true)}>
                ☆ Salva come template
              </button>
            )}
          </div>
        </>
      )}
      <button className="fab primary" onClick={onHome}>Torna alla home</button>
    </div>
  )
}

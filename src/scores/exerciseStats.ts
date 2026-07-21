// Exercise Intelligence: statistiche per singolo esercizio, derivate dai grezzi.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { bestE1rm, e1rm, isWorkingSet } from '../metrics/metrics'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID

export interface ExerciseListItem {
  id: string
  name: string
  muscle: string
  isCustom: boolean
  sessions: number
  lastDate: string | null
  prE1rm: number
}

async function sessionMap(): Promise<Map<string, WorkoutSession>> {
  const list = await db.sessions.where('userId').equals(U).toArray()
  return new Map(list.map((s) => [s.id, s]))
}

/** Lista esercizi allenati (con almeno un set), più recenti prima. */
export async function computeExerciseList(): Promise<ExerciseListItem[]> {
  const exercises = await db.exercises.where('userId').equals(U).toArray()
  const sessions = await sessionMap()
  const out: ExerciseListItem[] = []

  for (const ex of exercises) {
    const entries = await db.exerciseEntries.where({ exerciseId: ex.id }).toArray()
    if (!entries.length) continue
    let pr = 0
    let lastDate: string | null = null
    const sessionIds = new Set<string>()
    let hasSets = false
    for (const en of entries) {
      const sets = await db.sets.where({ entryId: en.id }).toArray()
      if (sets.some(isWorkingSet)) hasSets = true
      pr = Math.max(pr, bestE1rm(sets))
      const s = sessions.get(en.sessionId)
      if (s) {
        sessionIds.add(en.sessionId)
        if (!lastDate || s.date > lastDate) lastDate = s.date
      }
    }
    if (!hasSets) continue
    out.push({
      id: ex.id, name: ex.name, muscle: ex.muscle, isCustom: ex.isCustom,
      sessions: sessionIds.size, lastDate, prE1rm: Math.round(pr),
    })
  }
  out.sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
  return out
}

export interface ExercisePoint {
  date: string
  type: string
  bestE1rm: number
  topWeight: number
  topReps: number
  volume: number
}

export interface ExerciseDetailData {
  id: string
  name: string
  muscle: string
  prE1rm: number
  prDate: string | null
  trendPct: number
  points: ExercisePoint[]
}

/** Dashboard dettaglio di un esercizio: serie temporale e1RM, PR, trend. */
export async function computeExerciseDetail(exerciseId: string): Promise<ExerciseDetailData | null> {
  const ex = await db.exercises.get(exerciseId)
  if (!ex) return null
  const sessions = await sessionMap()
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()

  // Raggruppa i set per seduta.
  const bySession = new Map<string, SetEntry[]>()
  for (const en of entries) {
    const sets = await db.sets.where({ entryId: en.id }).toArray()
    bySession.set(en.sessionId, (bySession.get(en.sessionId) ?? []).concat(sets))
  }

  const rows: { startedAt: string; point: ExercisePoint }[] = []
  for (const [sid, sets] of bySession) {
    const s = sessions.get(sid)
    if (!s) continue
    const working = sets.filter(isWorkingSet)
    if (!working.length) continue
    // Top set = quella con l'e1RM più alto (lo sforzo migliore della seduta).
    const top = working.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a))
    rows.push({
      startedAt: s.startedAt,
      point: {
        date: s.date, type: s.type,
        bestE1rm: Math.round(bestE1rm(sets)),
        topWeight: top.weight, topReps: top.reps,
        volume: working.reduce((acc, x) => acc + x.reps, 0),
      },
    })
  }
  // Ordine cronologico reale (per orario di inizio, non solo data → gestisce più sedute nello stesso giorno).
  rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const points: ExercisePoint[] = rows.map((r) => r.point)

  let prE1rm = 0, prDate: string | null = null
  for (const p of points) if (p.bestE1rm > prE1rm) { prE1rm = p.bestE1rm; prDate = p.date }
  const trendPct = points.length >= 2 && points[0].bestE1rm > 0
    ? ((points[points.length - 1].bestE1rm - points[0].bestE1rm) / points[0].bestE1rm) * 100
    : 0

  return { id: ex.id, name: ex.name, muscle: ex.muscle, prE1rm, prDate, trendPct, points }
}

// Analytics: aggregati multi-periodo derivati dai grezzi.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { tonnage } from '../metrics/metrics'
import { computeSessionWorkoutScore } from './sessionScore'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID
const DAY = 86_400_000

async function setsOfSession(sessionId: string): Promise<SetEntry[]> {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  let sets: SetEntry[] = []
  for (const e of entries) sets = sets.concat(await db.sets.where({ entryId: e.id }).toArray())
  return sets
}

export interface Point { label: string; value: number }
export interface AnalyticsData {
  weeklyTonnage: Point[]
  weeklySessions: Point[]
  workoutScores: Point[]
  totalSessions: number
}

function ms(dateISO: string): number { return new Date(dateISO + 'T00:00:00').getTime() }
function mmdd(t: number): string {
  const d = new Date(t)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function computeAnalytics(weeks = 8): Promise<AnalyticsData> {
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => a.date.localeCompare(b.date))
  const nowMs = ms(new Date().toISOString().slice(0, 10))

  // Tonnellaggio per seduta.
  const perSession: { t: number; ton: number; finished: boolean; id: string }[] = []
  for (const s of sessions) {
    perSession.push({ t: ms(s.date), ton: tonnage(await setsOfSession(s.id)), finished: !!s.finishedAt, id: s.id })
  }

  // Bucket settimanali (ultime `weeks` settimane).
  const weeklyTonnage: Point[] = []
  const weeklySessions: Point[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const hi = nowMs - w * 7 * DAY
    const lo = hi - 7 * DAY
    const inWeek = perSession.filter((p) => p.t <= hi && p.t > lo)
    const label = mmdd(lo + DAY)
    weeklyTonnage.push({ label, value: inWeek.reduce((a, p) => a + p.ton, 0) })
    weeklySessions.push({ label, value: inWeek.length })
  }

  // Workout Score nel tempo (sedute concluse).
  const workoutScores: Point[] = []
  const finished = sessions.filter((s: WorkoutSession) => s.finishedAt)
  for (const s of finished) {
    const r = await computeSessionWorkoutScore(s.id)
    if (r.value != null) workoutScores.push({ label: mmdd(ms(s.date)), value: r.value })
  }

  return { weeklyTonnage, weeklySessions, workoutScores, totalSessions: sessions.length }
}

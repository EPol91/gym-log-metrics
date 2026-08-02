// Analytics: aggregati multi-periodo derivati dai grezzi.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { tonnage } from '../metrics/metrics'
import { computeSessionWorkoutScore } from './sessionScore'
import type { SetEntry, WorkoutSession } from '../db/schema'
import { todayLocal } from '../util/date'

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
  /** serie allenanti per gruppo muscolare negli ultimi 7 giorni */
  seriePerGruppo: Point[]
}

function ms(dateISO: string): number { return new Date(dateISO + 'T00:00:00').getTime() }
function mmdd(t: number): string {
  const d = new Date(t)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function computeAnalytics(weeks = 8): Promise<AnalyticsData> {
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => a.date.localeCompare(b.date))
  const nowMs = ms(todayLocal())

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

  // Serie per gruppo muscolare, ultimi 7 giorni.
  //
  // E' il numero su cui si programma davvero: il tonnellaggio dice quanto hai
  // spostato, non quante volte hai stimolato il dorso. Si contano le serie
  // allenanti — il riscaldamento non allena nessuno — e il gruppo e' quello
  // dell'esercizio in libreria.
  const daSette = nowMs - 7 * DAY
  const recenti = sessions.filter((s) => ms(s.date) > daSette)
  const conteggio = new Map<string, number>()
  const esercizi = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  for (const s of recenti) {
    for (const e of await db.exerciseEntries.where({ sessionId: s.id }).toArray()) {
      const gruppo = esercizi.get(e.exerciseId)?.muscle ?? 'altro'
      const serie = (await db.sets.where({ entryId: e.id }).toArray()).filter((x) => !x.isWarmup).length
      if (serie) conteggio.set(gruppo, (conteggio.get(gruppo) ?? 0) + serie)
    }
  }
  const seriePerGruppo = [...conteggio.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

  return { weeklyTonnage, weeklySessions, workoutScores, totalSessions: sessions.length, seriePerGruppo }
}

// Calcolo degli Score per la Home, a partire dai grezzi nel DB (derivati, non salvati).
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { tonnage, volume } from '../metrics/metrics'
import { computeCardioZone } from '../metrics/cardio'
import { computeReadiness, type LoadContext } from './readiness'
import { computeConsistency } from './consistency'
import { computeSessionWorkoutScore } from './sessionScore'
import { computePerformanceFromDB } from './performanceFromDB'
import type { ScoreResult } from './types'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID
const DAY = 86_400_000
const todayISO = () => new Date().toISOString().slice(0, 10)

async function setsOfSession(sessionId: string): Promise<SetEntry[]> {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  let sets: SetEntry[] = []
  for (const e of entries) sets = sets.concat(await db.sets.where({ entryId: e.id }).toArray())
  return sets
}

export interface CardioSummary {
  durationMin: number
  avgBpm?: number
  zoneLabel?: string
  zonePct?: number
}

export interface SessionSummary {
  id: string
  date: string
  type: string
  finished: boolean
  tonnage: number
  volume: number
  exercises: number
  sets: number
  cardio: CardioSummary[]
}

/** Storico sedute, più recenti prima. */
export async function computeHistory(): Promise<SessionSummary[]> {
  const user = await db.users.get(U)
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const out: SessionSummary[] = []
  for (const s of sessions) {
    const entries = await db.exerciseEntries.where({ sessionId: s.id }).count()
    const sets = await setsOfSession(s.id)
    const cardioRows = await db.cardio.where({ sessionId: s.id }).toArray()
    const cardio: CardioSummary[] = cardioRows.map((c) => {
      const z = c.avgBpm && (age || user?.hrMaxMeasured)
        ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr: user?.restingHr, method: c.method ?? 'standard', maxHr: user?.hrMaxMeasured })
        : null
      return {
        durationMin: c.durationMin,
        ...(c.avgBpm != null ? { avgBpm: c.avgBpm } : {}),
        ...(z ? { zoneLabel: z.label, zonePct: z.pct } : {}),
      }
    })
    out.push({
      id: s.id, date: s.date, type: s.type, finished: !!s.finishedAt,
      tonnage: tonnage(sets), volume: volume(sets), exercises: entries, sets: sets.length, cardio,
    })
  }
  return out
}

export interface HomeData {
  readiness: ScoreResult
  workout: ScoreResult
  performance: ScoreResult
  consistency: ScoreResult
  lastSession: { date: string; type: string; tonnage: number; volume: number } | null
  bodyWeight: { weight: number; delta: number | null } | null
}

/** Contesto carico (ACWR) dai tonnellaggi giornalieri. */
function buildLoadContext(daily: { t: number; ton: number }[], nowMs: number, historyDays: number): LoadContext {
  const sum = (fromDays: number) =>
    daily.filter((d) => d.t > nowMs - fromDays * DAY).reduce((a, d) => a + d.ton, 0)
  return { acute: sum(7) / 7, chronic: sum(28) / 28, historyDays }
}

export async function computeHome(): Promise<HomeData> {
  const user = await db.users.get(U)
  const weeklyTarget = user?.weeklyTarget ?? 4
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  // Tonnellaggi per seduta/giorno.
  const daily: { t: number; ton: number }[] = []
  for (const s of sessions) {
    const ton = tonnage(await setsOfSession(s.id))
    daily.push({ t: new Date(s.date + 'T00:00:00').getTime(), ton })
  }
  const nowMs = new Date(todayISO() + 'T00:00:00').getTime()
  const historyDays = sessions.length
    ? Math.round((nowMs - new Date(sessions[0].date + 'T00:00:00').getTime()) / DAY)
    : 0

  // Consistency (reale).
  const consistency = sessions.length
    ? computeConsistency(sessions.map((s) => s.date), weeklyTarget, todayISO())
    : { value: null, reliability: 'insufficiente' as const, note: 'Nessun allenamento registrato.' }

  // Readiness = ultimo check disponibile + contesto carico.
  const lastWithCheck = [...sessions].reverse().find((s) => s.readiness)
  const readiness = lastWithCheck
    ? computeReadiness(lastWithCheck.readiness, buildLoadContext(daily, nowMs, historyDays))
    : { value: null, reliability: 'insufficiente' as const, note: 'Nessun check pre-workout registrato.' }

  // Workout = ultima seduta conclusa.
  const lastFinished = [...sessions].reverse().find((s: WorkoutSession) => s.finishedAt)
  const workout = lastFinished
    ? await computeSessionWorkoutScore(lastFinished.id)
    : { value: null, reliability: 'insufficiente' as const, note: 'Nessuna seduta conclusa.' }

  // Performance: phase-aware, calcolato dai dati (insufficiente se manca fase/storico).
  const performance = await computePerformanceFromDB()

  // Ultima seduta (riepilogo).
  const last = sessions[sessions.length - 1]
  let lastSession: HomeData['lastSession'] = null
  if (last) {
    const sets = await setsOfSession(last.id)
    lastSession = { date: last.date, type: last.type, tonnage: tonnage(sets), volume: volume(sets) }
  }

  // Peso corporeo (ultimo + variazione).
  const meas = (await db.bodyMeasurements.where('userId').equals(U).sortBy('date'))
  let bodyWeight: HomeData['bodyWeight'] = null
  if (meas.length) {
    const lm = meas[meas.length - 1]
    const pm = meas[meas.length - 2]
    bodyWeight = { weight: lm.weight, delta: pm ? +(lm.weight - pm.weight).toFixed(1) : null }
  }

  return { readiness, workout, performance, consistency, lastSession, bodyWeight }
}

// Glue: calcola il Workout Score di una seduta a partire dai grezzi nel DB (derivato, non salvato).
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { tonnage, bestE1rm, rirCoverage, clamp } from '../metrics/metrics'
import { computeWorkout } from './workout'
import type { ScoreResult } from './types'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID

async function sessionSets(sessionId: string): Promise<{ sets: SetEntry[]; byExercise: Map<string, SetEntry[]> }> {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  const byExercise = new Map<string, SetEntry[]>()
  let all: SetEntry[] = []
  for (const e of entries) {
    const s = await db.sets.where({ entryId: e.id }).toArray()
    all = all.concat(s)
    byExercise.set(e.exerciseId, (byExercise.get(e.exerciseId) ?? []).concat(s))
  }
  return { sets: all, byExercise }
}

/** e1RM storico massimo per un esercizio, escludendo la seduta corrente. */
async function historicalBestE1rm(exerciseId: string, exceptSessionId: string): Promise<number> {
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()
  let best = 0
  for (const e of entries) {
    if (e.sessionId === exceptSessionId) continue
    const s = await db.sets.where({ entryId: e.id }).toArray()
    best = Math.max(best, bestE1rm(s))
  }
  return best
}

export async function computeSessionWorkoutScore(sessionId: string): Promise<ScoreResult> {
  const session = await db.sessions.get(sessionId)
  if (!session) return { value: null, reliability: 'insufficiente', note: 'Seduta non trovata.' }

  const { sets, byExercise } = await sessionSets(sessionId)
  const sessionLoad = tonnage(sets)

  // Baseline: tonnellaggio mediano delle sedute precedenti dello stesso tipo (concluse).
  const prior = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s: WorkoutSession) => s.type === session.type && s.finishedAt && s.id !== sessionId)
  const priorLoads: number[] = []
  for (const p of prior) {
    const ps = await sessionSets(p.id)
    priorLoads.push(tonnage(ps.sets))
  }
  priorLoads.sort((a, b) => a - b)
  const baselineLoad = priorLoads.length
    ? priorLoads[Math.floor(priorLoads.length / 2)]
    : sessionLoad || 1
  const baselineCount = priorLoads.length

  // Intensità: da RIR se coperto (più vicino al cedimento = più intenso), altrimenti neutro.
  const cov = rirCoverage(sets)
  let intensitySignal = 0
  if (cov > 0) {
    const withRir = sets.filter((s) => typeof s.rir === 'number')
    const avg = withRir.reduce((a, s) => a + (s.rir as number), 0) / withRir.length
    // RIR 0 → +1 (max intensità), RIR 4 → 0, RIR 8 → −1.
    intensitySignal = clamp((4 - avg) / 4, -1, 1)
  }

  // PR: esercizi il cui e1RM di oggi supera il massimo storico.
  let prCount = 0
  for (const [exerciseId, exSets] of byExercise) {
    const todayBest = bestE1rm(exSets)
    if (todayBest <= 0) continue
    const hist = await historicalBestE1rm(exerciseId, sessionId)
    if (todayBest > hist && hist > 0) prCount++
  }

  return computeWorkout({
    sessionLoad, baselineLoad, baselineCount,
    intensitySignal, rirCoverage: cov, prCount,
  })
}

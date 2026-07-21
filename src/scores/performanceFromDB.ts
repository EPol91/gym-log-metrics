// Calcolo del Performance Score dai grezzi nel DB (phase-aware). Vedi SCORE_FORMULE.md §3.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { bestE1rm, tonnage } from '../metrics/metrics'
import { computePerformance } from './performance'
import type { ScoreResult } from './types'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID
const DAY = 86_400_000
const WINDOW_DAYS = 42 // ~6 settimane

function ms(dateISO: string): number { return new Date(dateISO + 'T00:00:00').getTime() }
function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export async function computePerformanceFromDB(): Promise<ScoreResult> {
  const phase = await db.phases.where('userId').equals(U).filter((p) => p.endDate === null).first()
  if (!phase) {
    return { value: null, reliability: 'insufficiente', note: 'Nessuna fase impostata (cut/bulk/recomp/mant.).' }
  }

  const nowMs = ms(new Date().toISOString().slice(0, 10))
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s: WorkoutSession) => s.finishedAt)
    .sort((a, b) => a.date.localeCompare(b.date))

  const inWindow = sessions.filter((s) => ms(s.date) > nowMs - WINDOW_DAYS * DAY)

  // Serie temporale e1RM per esercizio (dentro la finestra).
  const perEx = new Map<string, { t: number; e1: number }[]>()
  const dailyTon: { t: number; ton: number }[] = []
  for (const s of inWindow) {
    const entries = await db.exerciseEntries.where({ sessionId: s.id }).toArray()
    let sessionSets: SetEntry[] = []
    for (const e of entries) {
      const sets = await db.sets.where({ entryId: e.id }).toArray()
      sessionSets = sessionSets.concat(sets)
      const e1 = bestE1rm(sets)
      if (e1 > 0) perEx.set(e.exerciseId, (perEx.get(e.exerciseId) ?? []).concat({ t: ms(s.date), e1 }))
    }
    dailyTon.push({ t: ms(s.date), ton: tonnage(sessionSets) })
  }

  // Nessun dato di allenamento nella finestra → non calcolabile (evita 74 fantasma post-onboarding).
  if (perEx.size === 0) {
    return { value: null, reliability: 'insufficiente', note: 'Nessun allenamento registrato: registra qualche seduta.' }
  }

  // Trend forza: variazione % (primo→ultimo) per esercizio con ≥2 punti a ≥10 giorni di distanza.
  const changes: number[] = []
  for (const pts of perEx.values()) {
    if (pts.length < 2) continue
    pts.sort((a, b) => a.t - b.t)
    const first = pts[0], last = pts[pts.length - 1]
    if (last.t - first.t < 10 * DAY || first.e1 <= 0) continue
    changes.push(((last.e1 - first.e1) / first.e1) * 100)
  }
  const strengthPctChange = median(changes)

  // Trend volume: tonnellaggio ultimi 21 giorni vs 21 precedenti.
  const sumTon = (fromDays: number, toDays: number) =>
    dailyTon.filter((d) => d.t <= nowMs - toDays * DAY && d.t > nowMs - fromDays * DAY)
      .reduce((a, d) => a + d.ton, 0)
  const recent = sumTon(21, 0), prev = sumTon(42, 21)
  const volumePctChange = prev > 0 ? ((recent - prev) / prev) * 100 : 0

  // PR nel periodo: esercizi il cui miglior e1RM nella finestra supera il record precedente.
  const windowStart = nowMs - WINDOW_DAYS * DAY
  const preBest = new Map<string, number>()
  for (const s of sessions) {
    if (ms(s.date) > windowStart) continue // solo sedute PRIMA della finestra
    const entries = await db.exerciseEntries.where({ sessionId: s.id }).toArray()
    for (const e of entries) {
      const sets = await db.sets.where({ entryId: e.id }).toArray()
      const e1 = bestE1rm(sets)
      if (e1 > 0) preBest.set(e.exerciseId, Math.max(preBest.get(e.exerciseId) ?? 0, e1))
    }
  }
  let prCount = 0
  for (const [exId, pts] of perEx) {
    const windowBest = Math.max(...pts.map((p) => p.e1))
    const before = preBest.get(exId) ?? 0
    if (before > 0 && windowBest > before) prCount++ // record battuto nel periodo
  }

  const weeksInPhase = Math.floor((nowMs - ms(phase.startDate)) / (7 * DAY))

  return computePerformance({
    phase: phase.phase,
    strengthPctChange,
    volumePctChange,
    prCount,
    weeksInPhase,
    weeksSincePhaseChange: weeksInPhase, // la fase inizia al cambio
  })
}

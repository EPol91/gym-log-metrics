// Metric Engine (helper puri). Derivati dai grezzi, nessuna duplicazione su disco.
import type { SetEntry } from '../db/schema'

/** Serie di lavoro = non riscaldamento e con carico/reps validi. */
export function isWorkingSet(s: SetEntry): boolean {
  return !s.isWarmup && s.reps > 0 && s.weight >= 0
}

/** e1RM stimato (Epley). */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Volume = numero totale di ripetizioni delle serie di lavoro. */
export function volume(sets: SetEntry[]): number {
  return sets.filter(isWorkingSet).reduce((acc, s) => acc + s.reps, 0)
}

/**
 * Tonnellaggio = somma di peso × ripetizioni (carico totale sollevato).
 * Arrotondato a 1 decimale: con carichi tipo 6.8 kg la somma in virgola mobile
 * lascia code assurde (156.39999999999998 invece di 156.4).
 */
export function tonnage(sets: SetEntry[]): number {
  const raw = sets.filter(isWorkingSet).reduce((acc, s) => acc + s.weight * s.reps, 0)
  return Math.round(raw * 10) / 10
}

/** Miglior e1RM tra le serie di lavoro. */
export function bestE1rm(sets: SetEntry[]): number {
  return sets.filter(isWorkingSet).reduce((max, s) => Math.max(max, e1rm(s.weight, s.reps)), 0)
}

/** Copertura RIR = frazione di serie di lavoro con RIR compilato (0-1). */
export function rirCoverage(sets: SetEntry[]): number {
  const working = sets.filter(isWorkingSet)
  if (working.length === 0) return 0
  const withRir = working.filter((s) => typeof s.rir === 'number').length
  return withRir / working.length
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

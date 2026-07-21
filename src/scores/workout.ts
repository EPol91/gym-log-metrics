// Workout Score — qualità della seduta appena finita vs baseline personale. SCORE_FORMULE.md §2.
// 50 = giornata normale. Workout = 50 + volume(±25) + intensità(±15) + PR(+10 max).
import { clamp } from '../metrics/metrics'
import type { ScoreResult } from './types'

export interface WorkoutInput {
  /** tonnellaggio della seduta */
  sessionLoad: number
  /** tonnellaggio mediano delle ultime sedute dello stesso tipo (baseline) */
  baselineLoad: number
  /** numero di sedute di baseline disponibili per quel tipo */
  baselineCount: number
  /** segnale intensità in [-1, +1]: da e1RM vs recente, o da RIR se coperto */
  intensitySignal: number
  /** copertura RIR 0-1 (per dichiarare l'affidabilità dell'intensità) */
  rirCoverage: number
  /** numero di PR battuti nella seduta */
  prCount: number
}

export function computeWorkout(inp: WorkoutInput): ScoreResult {
  // Volume: ±25% rispetto alla baseline → ±25 punti pieni.
  const volumeSignal = inp.baselineLoad > 0
    ? clamp((inp.sessionLoad / inp.baselineLoad - 1) / 0.25, -1, 1)
    : 0
  const volumePts = 25 * volumeSignal
  const intensityPts = 15 * clamp(inp.intensitySignal, -1, 1)
  const prPts = Math.min(10, inp.prCount * 5)

  const value = clamp(50 + volumePts + intensityPts + prPts, 0, 100)

  let reliability: ScoreResult['reliability'] = 'alta'
  let note: string | undefined
  if (inp.baselineCount < 4) {
    reliability = 'media'
    note = 'Baseline in costruzione (< 4 sedute dello stesso tipo).'
  }
  if (inp.rirCoverage < 0.5) {
    note = (note ? note + ' ' : '') + 'Intensità stimata su e1RM (RIR < 50% delle serie).'
  }

  return { value: Math.round(value), reliability, note }
}

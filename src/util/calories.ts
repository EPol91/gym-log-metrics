// Stima calorica teorica basata sulla frequenza cardiaca (Keytel et al. 2005).
// Usa FC media, peso, età e sesso: la più accurata senza VO2max/metabolimetro.

import type { CardioType, KcalMethod } from '../db/schema'

export interface CalorieInput {
  avgHr?: number | null
  weightKg?: number | null
  age?: number
  sex?: 'm' | 'f'
  durationMin: number
}

/** kcal totali stimate, o null se mancano i dati indispensabili (FC media + peso). */
export function estimateCalories({ avgHr, weightKg, age = 30, sex = 'm', durationMin }: CalorieInput): number | null {
  if (!avgHr || !weightKg || durationMin <= 0) return null
  const perMin = sex === 'f'
    ? (-20.4022 + 0.4472 * avgHr - 0.1263 * weightKg + 0.074 * age) / 4.184
    : (-55.0969 + 0.6309 * avgHr + 0.1988 * weightKg + 0.2017 * age) / 4.184
  const kcal = perMin * durationMin
  return kcal > 0 ? Math.round(kcal) : null
}

// --- Kcal dai watt -------------------------------------------------------------
//
// Il battito a parità di sforzo cambia con sonno, caldo, caffè e stanchezza; i
// watt della macchina no. Il lavoro fatto (watt × secondi = joule) diviso per
// il rendimento del corpo dà l'energia spesa: errore intorno al ±10%.

/** Quanta dell'energia spesa finisce nei pedali (o nella catena, o nel volano). */
const RENDIMENTO: Partial<Record<CardioType, number>> = { cyclette: 0.24, assaultbike: 0.24, vogatore: 0.20 }
/** Ellittica e tutto il resto. */
const RENDIMENTO_ALTRO = 0.22

export function kcalDaWatt(watt: number, durationMin: number, tipo?: CardioType): number | null {
  if (!watt || watt <= 0 || durationMin <= 0) return null
  const r = (tipo && RENDIMENTO[tipo]) || RENDIMENTO_ALTRO
  return Math.round((watt * durationMin * 60) / 4184 / r)
}

/** Watt per battito: se sale, a parità di cuore spingi di più. */
export const efficienza = (watt?: number, bpm?: number) => (watt && bpm ? watt / bpm : null)

/**
 * Le kcal di un cardio e da dove vengono: dai watt se ci sono, se no dal
 * battito (Keytel), come sempre.
 */
export function kcalCardio(inp: CalorieInput & { watt?: number; tipo?: CardioType }): { kcal?: number; kcalMethod?: KcalMethod } {
  const w = inp.watt ? kcalDaWatt(inp.watt, inp.durationMin, inp.tipo) : null
  if (w != null) return { kcal: w, kcalMethod: 'watt' }
  const k = estimateCalories(inp)
  return k != null ? { kcal: k, kcalMethod: 'keytel' } : {}
}

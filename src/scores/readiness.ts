// Readiness Score — chiesto a inizio workout. Vedi SCORE_FORMULE.md §1.
// Base = 35% sonno + 25% stanchezza + 20% indolenzimento + 20% energia, poi × aggiustamento carico (ACWR).
// Sedute vecchie senza indolenzimento → vecchia formula 40/35/25 (nessun ricalcolo che sposti lo storico).
import { clamp } from '../metrics/metrics'
import type { ReadinessCheck } from '../db/schema'
import type { ScoreResult } from './types'

export interface LoadContext {
  /** carico giornaliero medio ultimi 7 giorni (tonnellaggio) */
  acute: number
  /** carico giornaliero medio ultimi 28 giorni (tonnellaggio) */
  chronic: number
  /** giorni di storico disponibili */
  historyDays: number
}

/** Fattore carico da ACWR = acuto/cronico. */
function loadFactor(acute: number, chronic: number): number {
  if (chronic <= 0) return 1
  const acwr = acute / chronic
  if (acwr < 0.8) return 0.97 // molto scarico
  if (acwr <= 1.3) return 1.0 // zona ok
  if (acwr >= 1.6) return 0.9 // picco/sovraccarico (floor)
  // da 1.3 a 1.6 → da 1.00 a 0.90 lineare
  return 1.0 - ((acwr - 1.3) / (1.6 - 1.3)) * 0.1
}

export function computeReadiness(
  check: ReadinessCheck | null,
  load: LoadContext | null,
): ScoreResult {
  if (!check) {
    return { value: null, reliability: 'insufficiente', note: 'Check pre-workout non compilato.' }
  }
  const base = check.soreness == null
    ? 0.4 * check.sleep + 0.35 * check.fatigue + 0.25 * check.energy // sedute vecchie: formula originale
    : 0.35 * check.sleep + 0.25 * check.fatigue + 0.2 * check.soreness + 0.2 * check.energy

  const parts = check.soreness == null
    ? [
      { label: 'Sonno', value: check.sleep, weight: 0.4 },
      { label: 'Stanchezza', value: check.fatigue, weight: 0.35 },
      { label: 'Energia', value: check.energy, weight: 0.25 },
    ]
    : [
      { label: 'Sonno', value: check.sleep, weight: 0.35 },
      { label: 'Stanchezza', value: check.fatigue, weight: 0.25 },
      { label: 'Indolenzimento', value: check.soreness, weight: 0.2 },
      { label: 'Energia', value: check.energy, weight: 0.2 },
    ]

  // Aggiustamento carico solo con almeno 14 giorni di storico.
  if (load && load.historyDays >= 14) {
    const f = loadFactor(load.acute, load.chronic)
    const value = clamp(base * f, 0, 100)
    const acwr = load.chronic > 0 ? load.acute / load.chronic : 1
    return {
      value: Math.round(value), reliability: 'alta', parts,
      facts: [
        { label: 'Base dal check', value: String(Math.round(base)) },
        { label: 'Carico recente', value: `×${f.toFixed(2)} · ${acwr > 1.3 ? 'sopra la media' : acwr < 0.8 ? 'sotto la media' : 'in linea'}` },
      ],
    }
  }
  return {
    value: Math.round(clamp(base, 0, 100)),
    reliability: 'media',
    note: 'Aggiustamento carico spento: storico < 14 giorni.',
    parts,
    facts: [{ label: 'Base dal check', value: String(Math.round(base)) }],
  }
}

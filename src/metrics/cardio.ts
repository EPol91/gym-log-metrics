// Zone cardio (funzioni pure). Formula standard (% FC max) e HRR / Karvonen.
import type { CardioMethod } from '../db/schema'

export interface ZoneResult {
  pct: number // % di intensità (FCmax o HRR)
  zone: 1 | 2 | 3 | 4 | 5
  label: string
  method: CardioMethod
}

const ZONE_LABELS: Record<number, string> = {
  1: 'Z1 · Recupero',
  2: 'Z2 · Fondo',
  3: 'Z3 · Aerobico',
  4: 'Z4 · Soglia',
  5: 'Z5 · Anaerobico',
}

function zoneFromPct(pct: number): 1 | 2 | 3 | 4 | 5 {
  if (pct < 60) return 1
  if (pct < 70) return 2
  if (pct < 80) return 3
  if (pct < 90) return 4
  return 5
}

export function hrMax(age: number): number {
  return 220 - age
}

export interface ZoneInput {
  avgBpm: number
  age: number
  restingHr?: number
  method: CardioMethod
  /** FC max misurata: se presente, ha priorità su 220−età. */
  maxHr?: number
}

/** Calcola la zona cardio. HRR usa la FC a riposo (Karvonen); standard usa % FCmax.
 *  Usa la FCmax misurata se fornita, altrimenti 220−età. */
export function computeCardioZone(inp: ZoneInput): ZoneResult | null {
  const max = inp.maxHr && inp.maxHr > 0 ? inp.maxHr : (inp.age ? hrMax(inp.age) : 0)
  if (!inp.avgBpm || !max) return null
  let pct: number
  let method: CardioMethod = inp.method
  if (inp.method === 'hrr' && inp.restingHr && inp.restingHr < max) {
    pct = ((inp.avgBpm - inp.restingHr) / (max - inp.restingHr)) * 100
  } else {
    pct = (inp.avgBpm / max) * 100
    method = 'standard' // fallback se manca la FC a riposo
  }
  pct = Math.max(0, Math.min(100, Math.round(pct)))
  const zone = zoneFromPct(pct)
  return { pct, zone, label: ZONE_LABELS[zone], method }
}

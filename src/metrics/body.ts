// Metriche corporee. FFMI (Fat-Free Mass Index) — la Bible preferisce FFMI al BMI.

export interface FfmiResult {
  ffmi: number
  normalized: number // corretto per altezza (riferito a 1.80 m)
  ffmKg: number // massa magra
}

/** FFMI = massa magra / altezza². Richiede peso, % grasso e altezza. */
export function computeFfmi(weightKg: number, bodyFatPct: number, heightCm: number): FfmiResult | null {
  if (!weightKg || !heightCm || bodyFatPct == null) return null
  const h = heightCm / 100
  const ffm = weightKg * (1 - bodyFatPct / 100)
  const ffmi = ffm / (h * h)
  const normalized = ffmi + 6.1 * (1.8 - h)
  return { ffmi: +ffmi.toFixed(1), normalized: +normalized.toFixed(1), ffmKg: +ffm.toFixed(1) }
}

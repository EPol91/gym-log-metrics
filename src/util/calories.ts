// Stima calorica teorica basata sulla frequenza cardiaca (Keytel et al. 2005).
// Usa FC media, peso, età e sesso: la più accurata senza VO2max/metabolimetro.

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

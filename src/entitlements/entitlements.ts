// Gate Light / Premium — un unico punto (decisione 8).
// Oggi: utente sempre Premium. Domani: canUse() leggerà l'abbonamento reale, senza toccare le feature.

export type Plan = 'light' | 'premium'

/** Elenco feature gated. Le feature Light sono sempre disponibili. */
export type Feature =
  | 'advanced-dashboards'
  | 'exercise-intelligence-full'
  | 'ai-reports'
  | 'multi-period-analysis'
  | 'auto-correlations'
  | 'advanced-metrics'
  | 'advanced-charts'
  | 'comparative-analysis'

/** Feature che richiedono Premium. Tutto ciò che non è qui è Light (sempre attivo). */
const PREMIUM_ONLY: ReadonlySet<Feature> = new Set<Feature>([
  'advanced-dashboards',
  'exercise-intelligence-full',
  'ai-reports',
  'multi-period-analysis',
  'auto-correlations',
  'advanced-metrics',
  'advanced-charts',
  'comparative-analysis',
])

// Sorgente del piano corrente. Oggi hardcoded Premium (single-user).
// Domani: sostituire con lettura da account/abbonamento.
let currentPlan: Plan = 'premium'

export function setPlan(plan: Plan): void {
  currentPlan = plan
}

export function getPlan(): Plan {
  return currentPlan
}

/** UNICO punto di verifica. Ogni feature Premium chiama qui. */
export function canUse(feature: Feature): boolean {
  if (!PREMIUM_ONLY.has(feature)) return true // feature Light
  return currentPlan === 'premium'
}

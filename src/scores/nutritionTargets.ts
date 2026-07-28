// Obiettivi calorici e macro. Proposta automatica, sempre correggibile a mano:
// nessuna formula conosce il tuo metabolismo meglio della bilancia.
import type { Phase } from '../db/schema'

export interface TargetInput {
  weightKg: number
  heightCm: number
  age: number
  sex: 'm' | 'f'
  /** sedute a settimana: stima il livello di attività */
  weeklySessions: number
  phase: Phase | null
}

export interface MacroTargets { kcal: number; protein: number; carbs: number; fat: number }

/** Metabolismo basale — Mifflin-St Jeor, la più affidabile sulle persone normopeso e allenate. */
export function bmr(i: Pick<TargetInput, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age
  return i.sex === 'm' ? base + 5 : base - 161
}

/** Fattore di attività dalle sedute settimanali (include vita quotidiana media). */
export function activityFactor(weeklySessions: number): number {
  if (weeklySessions <= 0) return 1.2
  if (weeklySessions <= 2) return 1.375
  if (weeklySessions <= 4) return 1.55
  if (weeklySessions <= 6) return 1.725
  return 1.9
}

/** Scostamento calorico della fase rispetto al mantenimento. */
const PHASE_DELTA: Record<Phase, number> = {
  cut: -0.18,        // −18%: perdita sostenibile senza bruciare massa magra
  bulk: +0.12,       // +12%: crescita con poco grasso
  recomp: 0,
  maintenance: 0,
}

/**
 * Obiettivi per una giornata.
 * `carbShift` sposta i carboidrati per tipo giornata (ON +, OFF −) mantenendo
 * proteine fisse e compensando con i grassi: è così che si imposta una ciclizzazione.
 */
export function computeTargets(i: TargetInput, carbShift = 0): MacroTargets {
  const tdee = bmr(i) * activityFactor(i.weeklySessions)
  const kcal = Math.round(tdee * (1 + (i.phase ? PHASE_DELTA[i.phase] : 0)) + carbShift * 4)

  // Proteine: 2 g/kg (2.2 in definizione, dove proteggono la massa magra).
  const protein = Math.round(i.weightKg * (i.phase === 'cut' ? 2.2 : 2))
  // Grassi: 25% delle calorie, mai sotto 0.7 g/kg (ormoni).
  const fat = Math.max(Math.round((kcal * 0.25) / 9), Math.round(i.weightKg * 0.7))
  // Carboidrati: quello che resta.
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))

  return { kcal, protein, carbs, fat }
}

/** Calorie di una combinazione di macro (utile per ricalcoli e controlli). */
export function kcalOf(m: { protein: number; carbs: number; fat: number }): number {
  return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9)
}

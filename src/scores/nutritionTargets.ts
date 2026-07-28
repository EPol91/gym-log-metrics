// Obiettivi calorici e macro. Proposta automatica, sempre correggibile a mano:
// nessuna formula conosce il tuo metabolismo meglio della bilancia.
import type { ActivityLevel, BmrFormula, Phase } from '../db/schema'

export interface TargetInput {
  weightKg: number
  heightCm: number
  age: number
  sex: 'm' | 'f'
  /** sedute a settimana: stima il livello di attività quando non lo dichiari */
  weeklySessions: number
  phase: Phase | null
  /** livello di attività scelto a mano: se c'è, vince sulle sedute */
  activityLevel?: ActivityLevel
  /** formula del metabolismo basale (default Mifflin-St Jeor) */
  formula?: BmrFormula
  /** % di massa grassa: serve solo a Katch-McArdle */
  bodyFatPct?: number
}

export interface MacroTargets { kcal: number; protein: number; carbs: number; fat: number }

export interface FormulaInfo { key: BmrFormula; name: string; note: string }
export const BMR_FORMULAS: FormulaInfo[] = [
  { key: 'mifflin', name: 'Mifflin-St Jeor', note: 'La più validata sulla popolazione generale.' },
  { key: 'harris', name: 'Harris-Benedict', note: 'Del 1919, rivista nel 1984: tende a sovrastimare di circa il 5%.' },
  { key: 'katch', name: 'Katch-McArdle', note: 'Lavora sulla massa magra: più precisa, ma solo con una % di grasso attendibile.' },
]

/** Metabolismo basale con la formula scelta. Senza % di grasso, Katch non è calcolabile. */
export function bmr(
  i: Pick<TargetInput, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'bodyFatPct'>,
  formula: BmrFormula = 'mifflin',
): number | null {
  if (formula === 'harris') {
    // Revisione Roza & Shizgal (1984).
    return i.sex === 'm'
      ? 88.362 + 13.397 * i.weightKg + 4.799 * i.heightCm - 5.677 * i.age
      : 447.593 + 9.247 * i.weightKg + 3.098 * i.heightCm - 4.330 * i.age
  }
  if (formula === 'katch') {
    if (i.bodyFatPct == null || i.bodyFatPct <= 0 || i.bodyFatPct >= 70) return null
    const lean = i.weightKg * (1 - i.bodyFatPct / 100)
    return 370 + 21.6 * lean
  }
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age
  return i.sex === 'm' ? base + 5 : base - 161
}

export interface ActivityInfo { key: ActivityLevel; name: string; factor: number; note: string }
export const ACTIVITY_LEVELS: ActivityInfo[] = [
  { key: 'sedentary', name: 'Sedentario', factor: 1.2, note: 'lavoro da seduto, niente allenamenti' },
  { key: 'light', name: 'Leggero', factor: 1.375, note: '1-2 allenamenti a settimana' },
  { key: 'moderate', name: 'Moderato', factor: 1.55, note: '3-4 allenamenti a settimana' },
  { key: 'high', name: 'Alto', factor: 1.725, note: '5-6 allenamenti a settimana' },
  { key: 'veryHigh', name: 'Molto alto', factor: 1.9, note: 'allenamenti quotidiani o lavoro fisico' },
]

/** Fattore di attività: quello dichiarato se c'è, altrimenti dedotto dalle sedute. */
export function activityFactor(weeklySessions: number, level?: ActivityLevel): number {
  if (level) return ACTIVITY_LEVELS.find((l) => l.key === level)!.factor
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
  // Se Katch non è calcolabile (manca la % di grasso) si ripiega su Mifflin:
  // meglio una stima valida che nessun obiettivo.
  const base = bmr(i, i.formula) ?? bmr(i, 'mifflin')!
  const tdee = base * activityFactor(i.weeklySessions, i.activityLevel)
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

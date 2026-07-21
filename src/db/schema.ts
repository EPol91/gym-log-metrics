// Modello dati EP - GYM LOG & METRICS
// Principi (Project Bible + Architettura v0):
// - Single source of truth: si salvano SOLO i dati grezzi. Metriche/score derivati a runtime.
// - Multi-tenant-ready: ogni record porta userId + timestamp, formato "sync-ready".
// - Nessun dato derivato su disco (gli Score NON hanno tabella).

export type ID = string
export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // ISO 8601 completo

/** Campi comuni a ogni record: identità, proprietario, tracciamento per il sync futuro. */
export interface BaseRecord {
  id: ID
  userId: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** true = eliminato logicamente (tombstone per sync); i grezzi non si cancellano fisicamente. */
  deleted?: boolean
}

export type Unit = 'kg' | 'lb'

export interface User extends BaseRecord {
  name: string
  unit: Unit
  /** obiettivo sedute/settimana → alimenta il Consistency Score */
  weeklyTarget: number
  locale: string // es. 'it'
  /** anno di nascita → età per le zone cardio (FCmax). Opzionale. */
  birthYear?: number
  /** frequenza cardiaca a riposo → zone cardio con formula HRR (Karvonen). Opzionale. */
  restingHr?: number
  /** FC max MISURATA (test reale). Se presente, usata al posto di 220−età per le zone. Opzionale. */
  hrMaxMeasured?: number
  /** altezza in cm → per l'FFMI. Opzionale. */
  heightCm?: number
  /** durata predefinita del timer di recupero (secondi). */
  restDefaultSec?: number
  /** true dopo il primo avvio guidato (onboarding). */
  onboarded?: boolean
  /** target giornalieri opzionali per il contesto nutrizione */
  waterTarget?: number
  saltTarget?: number
}

export interface Gym extends BaseRecord {
  name: string
  isDefault: boolean
  lat?: number
  lng?: number
}

export type MuscleGroup =
  | 'petto' | 'schiena' | 'spalle' | 'bicipiti' | 'tricipiti'
  | 'quadricipiti' | 'femorali' | 'glutei' | 'polpacci' | 'core' | 'altro'

/** Catalogo esercizi: libreria integrata (isCustom=false) + custom utente (isCustom=true).
 *  `aliases` serve all'anti-duplicato (identità stabile per Exercise Intelligence/PR). */
export interface Exercise extends BaseRecord {
  name: string
  muscle: MuscleGroup
  isCustom: boolean
  aliases: string[]
  /** recupero predefinito per questo esercizio (secondi), ricordato tra le sedute */
  restSec?: number
}

export type WorkoutType =
  | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'fullbody' | 'brosplit' | 'custom'

/** Risposte del check pre-workout (scale 0-100, vedi SCORE_FORMULE.md). Dato grezzo. */
export interface ReadinessCheck {
  sleep: number // 0-100
  fatigue: number // 0-100 (già invertito: 100 = nessuna stanchezza)
  energy: number // 0-100
}

export interface WorkoutSession extends BaseRecord {
  gymId: ID | null
  date: ISODate
  type: WorkoutType
  startedAt: ISODateTime
  finishedAt: ISODateTime | null
  /** snapshot della fase attiva al momento della seduta (per Performance phase-aware) */
  phaseId: ID | null
  readiness: ReadinessCheck | null
  notes: string
}

/** Un esercizio dentro una seduta (contiene i suoi set). */
export interface ExerciseEntry extends BaseRecord {
  sessionId: ID
  exerciseId: ID
  order: number
}

/** Una serie. RPE opzionale (fallback su e1RM). PR è derivato → NON salvato qui, calcolato. */
export interface SetEntry extends BaseRecord {
  entryId: ID
  order: number
  weight: number
  reps: number
  rir?: number // Reps In Reserve (0 = cedimento). Opzionale.
  restSec?: number
  isWarmup?: boolean
}

export interface BodyMeasurement extends BaseRecord {
  date: ISODate
  weight: number
  bodyFat?: number
  /** circonferenze (cm), opzionali */
  waist?: number
  arm?: number
  thigh?: number
  chest?: number
  note?: string
}

export type NutritionDayType = 'on' | 'off' | 'reload'
export type NutritionStatus = 'seguito' | 'parziale' | 'no'

/** SOLO contesto per l'AI. NON entra nei calcoli degli Score (decisione 2026-07-19). */
export interface NutritionContext extends BaseRecord {
  date: ISODate
  dayType?: NutritionDayType | null // null = deselezionato
  water?: number
  salt?: number
  status?: NutritionStatus | null // null = deselezionato
}

export type CardioMethod = 'standard' | 'hrr'
export type CardioType =
  | 'corsa' | 'camminata' | 'cyclette' | 'ellittica' | 'vogatore'
  | 'hiit' | 'tabata' | 'liss' | 'intervalli' | 'altro'

export interface CardioSession extends BaseRecord {
  sessionId: ID | null // se collegato a un workout
  date: ISODate
  durationMin: number
  avgBpm?: number
  method?: CardioMethod
  cardioType?: CardioType
}

export type Phase = 'cut' | 'bulk' | 'recomp' | 'maintenance'

/** Fase di allenamento. Impostata una volta, resta fino al cambio.
 *  endDate=null → fase attualmente in corso. Alimenta il Performance Score. */
export interface TrainingPhase extends BaseRecord {
  phase: Phase
  startDate: ISODate
  endDate: ISODate | null
  note?: string
}

export interface TemplateItem {
  exerciseId: ID
  order: number
}

/** Template = struttura di una seduta (solo esercizi ordinati, nessun carico). */
export interface WorkoutTemplate extends BaseRecord {
  name: string
  type: WorkoutType
  items: TemplateItem[]
}

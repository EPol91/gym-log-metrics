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
  /** sesso biologico → migliora la stima calorica (formula Keytel). Opzionale. */
  sex?: 'm' | 'f'
  /** livello di attivita dichiarato: se assente si deduce dalle sedute settimanali. */
  activityLevel?: ActivityLevel
  /** formula per il metabolismo basale. Default: Mifflin-St Jeor. */
  bmrFormula?: BmrFormula
  /** durata predefinita del timer di recupero (secondi). */
  restDefaultSec?: number
  /** true dopo il primo avvio guidato (onboarding). */
  onboarded?: boolean
  /** target giornalieri opzionali per il contesto nutrizione */
  waterTarget?: number
  saltTarget?: number
}

/** Livello di attivita quotidiana: moltiplica il metabolismo basale. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh'
/** Formula per il metabolismo basale. */
export type BmrFormula = 'mifflin' | 'harris' | 'katch'

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
  /** regolazioni macchina (sellino, poggiapetto, schienale…), testo libero ricordato tra le sedute */
  settings?: string
}

export type WorkoutType =
  | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'fullbody' | 'brosplit' | 'custom'

/** Risposte del check pre-workout (scale 0-100, vedi SCORE_FORMULE.md). Dato grezzo. */
export interface ReadinessCheck {
  sleep: number // 0-100
  fatigue: number // 0-100 (già invertito: 100 = nessuna stanchezza sistemica)
  soreness?: number // 0-100 (già invertito: 100 = nessun indolenzimento/DOMS). Assente nelle sedute pre-2026-07.
  energy: number // 0-100
}

/**
 * Storico dell'obiettivo settimanale: ogni cambio è registrato con la data.
 * Serve al Consistency per giudicare ogni settimana con l'obiettivo valido ALLORA,
 * invece di applicare retroattivamente quello di oggi.
 */
export interface WeeklyGoalChange extends BaseRecord {
  date: ISODate
  target: number
}

/** Check del giorno fatto dalla Home, senza allenamento. Una voce per data. */
export interface DailyReadiness extends BaseRecord {
  date: ISODate
  check: ReadinessCheck
}

export interface WorkoutSession extends BaseRecord {
  gymId: ID | null
  date: ISODate
  type: WorkoutType
  startedAt: ISODateTime
  finishedAt: ISODateTime | null
  /** Secondi da NON contare nella durata: tempo trascorso mentre la seduta era chiusa
   *  (riaperta dopo). Senza, riaprendo il giorno dopo il cronometro segnerebbe ore. */
  pausedSec?: number
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
  /**
   * Superset / triset: gli esercizi con lo stesso `groupId` si eseguono di fila,
   * senza recupero in mezzo. Il recupero parte a fine giro. Assente = esercizio singolo.
   */
  groupId?: ID
  /** Posizione dentro il gruppo: 0 = A, 1 = B, 2 = C. */
  groupOrder?: number
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

// --- Dieta / macro -----------------------------------------------------------

/** Valori nutrizionali per 100 g (o 100 ml per i liquidi). */
export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugar?: number
  salt?: number
}

/** Da dove arriva l'alimento. `mine` = creato a mano dall'utente. */
export type FoodSource = 'base' | 'off' | 'mine'

/**
 * Alimento in libreria. SEMPRE modificabile, anche se arrivato da un database:
 * i valori dei database sono spesso approssimativi o non aggiornati, quelli sulla
 * confezione comandano. `edited` marca le correzioni dell'utente, che non vengono
 * MAI sovrascritte da un aggiornamento esterno.
 */
export interface Food extends BaseRecord {
  name: string
  brand?: string
  barcode?: string
  per100: Macros
  /** Porzione tipica in grammi (es. 1 uovo = 55 g), per l'inserimento rapido. */
  servingG?: number
  servingLabel?: string
  source: FoodSource
  edited?: boolean
  favorite?: boolean
  /** Ultimo utilizzo: alimenta l'elenco "Recenti". */
  lastUsedAt?: ISODateTime
}

export type MealKey = 'colazione' | 'pranzo' | 'cena' | 'spuntino'

/**
 * Pasto di una giornata. È un record, non una voce fissa nel codice: puoi
 * aggiungerne, rinominarli, eliminarli e riordinarli giorno per giorno.
 */
export interface Meal extends BaseRecord {
  date: ISODate
  name: string
  order: number
}

/** Una riga del diario: alimento + quantità dentro un pasto. */
export interface FoodLog extends BaseRecord {
  date: ISODate
  mealId: ID
  foodId: ID
  grams: number
  order: number
}

/** Combinazione riutilizzabile di alimenti (es. "colazione tipo"). */
export interface SavedMeal extends BaseRecord {
  name: string
  items: { foodId: ID; grams: number }[]
}

/**
 * Tipo di giornata con i suoi obiettivi (ON / OFF / Reload di partenza, altri
 * aggiungibili). `builtin` marca i tre iniziali: si possono modificare ma non eliminare.
 */
export interface DayType extends BaseRecord {
  key: string
  name: string
  targets: { kcal: number; protein: number; carbs: number; fat: number }
  /** true se gli obiettivi sono stati scritti a mano: il ricalcolo automatico non li tocca. */
  manual?: boolean
  order: number
  builtin?: boolean
}

/**
 * Da dove arriva il valore di un'abitudine. Oggi si scrive solo a mano, ma il campo
 * c'è dal primo giorno: quando l'app girerà dentro un wrap nativo, Health Connect
 * scriverà qui i passi senza nessuna migrazione dei dati.
 */
export type HabitSource = 'manual' | 'healthConnect' | 'whoop'

/** Abitudine da seguire nel tempo: oggi solo i passi, la tabella è già generica. */
export interface Habit extends BaseRecord {
  /** chiave stabile: 'steps', domani 'water', 'sonno'… */
  key: string
  name: string
  /** obiettivo giornaliero, nell'unità dell'abitudine */
  target: number
  unit: string
  /** sorgente da cui ci si aspetta il dato: decide cosa mostrare finché non arriva */
  source: HabitSource
  active: boolean
  order: number
}

/** Valore di un'abitudine in un giorno: una riga per abitudine e data. */
export interface HabitEntry extends BaseRecord {
  habitKey: string
  date: ISODate
  value: number
  /** chi ha scritto il valore: un dato automatico non va sovrascritto da uno a mano */
  source: HabitSource
}

export type CardioMethod = 'standard' | 'hrr'
export type CardioType =
  | 'corsa' | 'camminata' | 'cyclette' | 'ellittica' | 'vogatore' | 'assaultbike'
  | 'hiit' | 'tabata' | 'liss' | 'intervalli' | 'altro'

export interface CardioSession extends BaseRecord {
  sessionId: ID | null // se collegato a un workout
  date: ISODate
  durationMin: number
  avgBpm?: number
  maxBpm?: number
  calories?: number // stima teorica (Keytel)
  method?: CardioMethod
  cardioType?: CardioType
}

/** Template cardio salvato: protocollo a intervalli o steady (countdown/cronometro), con tipo e formula zona.
 *  I campi extra sono opzionali per compatibilità con i vecchi preset (solo intervalli). */
export interface CardioPreset extends BaseRecord {
  name: string
  rounds: number
  workSec: number
  restSec: number
  cardioType?: CardioType
  method?: CardioMethod
  mode?: 'interval' | 'countdown' | 'chrono'
  targetMin?: number
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

// Modello dati ETP HEALTH
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
  /**
   * Obiettivo sedute/settimana. Resta per le stime che ragionano davvero a
   * settimane (fabbisogno, livello di attivita') e viene tenuto allineato al
   * ciclo qui sotto.
   */
  weeklyTarget: number
  /**
   * Il ciclo di allenamento vero: N sedute ogni M giorni, da una certa data.
   *
   * La settimana e' una griglia comoda, non la tua: 5 sedute ogni 8 giorni non
   * stanno in sette caselle. Giudicate a settimane danno 5 e poi 4, e la
   * continuita' si spezzava a ogni ciclo pur avendo fatto tutto.
   */
  cicloSedute?: number
  cicloGiorni?: number
  cicloInizio?: ISODate
  /**
   * Da quale app leggere i passi (il suo nome tecnico in Health Connect).
   * Vuoto = tutte sommate. Serve a far combaciare i numeri con quelli che vedi
   * nell app di chi li conta: Health Connect somma tutte le sorgenti, e due
   * conteggi diversi dello stesso giorno non si possono sommare senza mentire.
   */
  passiSorgente?: string
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
  /** blocchi del Coach attivi. Assente = tutti tranne la nutrizione. */
  coachBlocks?: CoachBlock[]
  /** durata predefinita del timer di recupero (secondi). */
  restDefaultSec?: number
  /** true dopo il primo avvio guidato (onboarding). */
  onboarded?: boolean
  /** target giornalieri opzionali per il contesto nutrizione */
  waterTarget?: number
  saltTarget?: number
  /**
   * Ordine dei riquadri in Oggi. Sta qui e non nella memoria di sessione perche'
   * e' una scelta tua, non uno stato temporaneo: deve sopravvivere alla chiusura
   * dell'app e viaggiare nel backup insieme al resto.
   */
  todayCards?: string[]
  /** 🦠RS acceso. Assente = acceso: e' il comportamento voluto, si spegne apposta. */
  rsActive?: boolean
  /** Data d'inizio della settimana 1 del protocollo del coach. */
  rsStart?: ISODate
  /** Chiedere conferma di RS al primo rientro della giornata. */
  rsAskDaily?: boolean
  /**
   * La ciclizzazione dei carboidrati, sette lettere da lunedi' a domenica:
   * L = giornata LOW, H = giornata HIGH. Vive qui e non nel codice perche' il
   * coach la cambia, e cambiarla deve costare dieci secondi.
   */
  rsCiclo?: string
  /**
   * Schermo acceso durante l'allenamento. Non e' comodita': col telefono in
   * standby Android sospende la pagina e la fascia smette di consegnare
   * battiti — meta' seduta senza cuore registrato. Default acceso.
   */
  schermoAcceso?: boolean
}

/**
 * Una giornata di 🦠RS.
 *
 * Dentro ci stanno SOLO i valori che hai scritto tu: il resto si ricalcola dai
 * tuoi dati a ogni apertura. Salvare anche i valori automatici significherebbe
 * avere due verita' sullo stesso dato, e non sapere piu' quale guardare.
 */
export interface RsDay extends BaseRecord {
  date: ISODate
  /** I campi corretti a mano: vincono sul calcolo finche' non li rimetti in automatico. */
  overrides: Record<string, string>
  /** La riga che aggiungi tu alla nota composta dai fatti. */
  nota?: string
  /** Stato verso il coach. Serve dal passo dell'invio, ma nasce con la riga. */
  stato?: 'da-inviare' | 'inviato' | 'modificato'
  inviatoAt?: ISODateTime
}

/**
 * Il check settimanale per il coach: il testo (composto e poi corretto da te),
 * le foto e lo stato verso di lui.
 */
export interface RsCheck extends BaseRecord {
  settimana: number
  testo: string
  stato: 'da-inviare' | 'inviato' | 'modificato'
  inviatoAt?: ISODateTime
  /** foto scelte da te, tenute qui finche' non partono */
  foto: string[]
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
  /** inclinazione dello schienale in gradi, misurata col telefono: 0 = piano, 90 = verticale */
  inclinazione?: number
  /** una tua foto della macchina (dataURL ridotta): il piede sulla pedana si spiega male a parole */
  foto?: string
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
  /**
   * Le letture della fascia durante TUTTA la seduta, campionate: istante della
   * prima, passo in secondi, battiti in fila. Senza l'orario di ogni lettura non
   * si potrebbe distinguere il cuore della seduta da quello del solo cardio.
   */
  hr?: { t0: ISODateTime; step: number; bpm: number[] }
  /**
   * Il template da cui e''' partita la seduta. E''' l'''unica prova certa di CHI ha
   * scritto l'''allenamento: indovinarlo dai nomi degli esercizi marcava come
   * "del coach" sedute mie che usavano gli stessi attrezzi.
   */
  srcTemplateId?: ID | null
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
  /** Dettaglio dei grassi, come sta scritto sulla confezione. Tutti facoltativi. */
  satFat?: number
  monoFat?: number
  polyFat?: number
  transFat?: number
  fiber?: number
  sugar?: number
  /** Sale in g. Il sodio sta a parte perché molte etichette danno solo quello. */
  salt?: number
  sodium?: number
  cholesterol?: number
  potassium?: number
  calcium?: number
  iron?: number
  /** Vitamine in % del valore giornaliero, come le danno le etichette. */
  vitA?: number
  vitC?: number
  vitD?: number
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

/**
 * Giornata tipo: una giornata alimentare intera salvata come modello, pasti
 * compresi. Serve ai giorni che si ripetono uguali - ON e OFF di uno split -
 * per non ricompilarli da capo ogni volta.
 *
 * Le righe portano una copia dei macro come le righe del diario: se domani
 * correggi un alimento, le giornate gia applicate non cambiano da sole.
 */
export interface DayTemplateItem {
  foodId: ID
  grams: number
  recipeId?: ID
  portions?: number
  macrosSnapshot?: Macros
  nameSnapshot?: string
  /**
   * 🦠RS: cosa aveva prescritto il coach su questa riga, prima delle tue
   * correzioni. Resta qui anche se cambi alimento o grammi: senza, dopo una
   * sostituzione il report direbbe che hai seguito il piano alla lettera.
   */
  rsOriginale?: { nome: string; g: number }
}

export interface DayTemplateMeal {
  name: string
  order: number
  items: DayTemplateItem[]
}

export interface DayTemplate extends BaseRecord {
  name: string
  meals: DayTemplateMeal[]
  /** ultimo utilizzo: i modelli che usi davvero stanno in cima */
  lastUsedAt?: ISODateTime
  /**
   * 🦠RS: l'hai corretta a mano. Reimportare il protocollo non la sovrascrive:
   * le tue correzioni valgono piu' di una copia fresca del piano.
   */
  modificata?: boolean
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

/**
 * Una riga del diario: alimento + quantità dentro un pasto.
 *
 * Una riga può anche essere una RICETTA intera invece di un singolo alimento.
 * In quel caso `recipeId` è valorizzato e `foodId` resta vuoto: la riga porta con sé
 * i macro del momento in cui l'hai aggiunta (`macrosSnapshot`) e il nome di allora
 * (`nameSnapshot`). Congelarli è voluto — se domani correggi la ricetta, il diario
 * di ieri deve restare quello che hai davvero mangiato.
 */
export interface FoodLog extends BaseRecord {
  date: ISODate
  mealId: ID
  foodId: ID
  /** grammi dell'alimento; per una ricetta a grammi è il peso di piatto pesato. 0 per le ricette a porzioni. */
  grams: number
  order: number
  /** riga-ricetta: id della ricetta di provenienza */
  recipeId?: ID
  /** riga-ricetta a porzioni: quante porzioni (anche 0,5) */
  portions?: number
  /** riga-ricetta: macro congelati all'inserimento */
  macrosSnapshot?: Macros
  /** riga-ricetta: nome di allora, così la riga resta leggibile anche se la ricetta sparisce */
  nameSnapshot?: string

  // --- 🦠RS ---------------------------------------------------------------
  /**
   * Questa riga viene dal piano del coach: nome e grammi come li ha prescritti.
   * Se l'alimento poi cambia (riso → patate) qui resta scritto cosa c'era,
   * perche' una sostituzione e' piano seguito, non piano disatteso.
   */
  rsPlanned?: { nome: string; g: number }
  /**
   * Spuntata: mangiata davvero. Solo le righe spuntate finiscono nei totali che
   * vanno al coach; nel TUO diario conta tutto, spuntato o no.
   */
  rsDone?: boolean
}

/**
 * Combinazione riutilizzabile di alimenti (es. "colazione tipo").
 * @deprecated Assorbita dalle ricette nella v11: un pasto salvato è una ricetta
 * a 1 porzione senza procedimento. La tabella resta solo per la migrazione.
 */
export interface SavedMeal extends BaseRecord {
  name: string
  items: { foodId: ID; grams: number }[]
}

// --- Ricette -----------------------------------------------------------------

/**
 * Come si conta una ricetta. Deciso una volta nell'editor, comanda tutto il resto:
 * la scalatura nel dettaglio, cosa chiede l'aggiunta al diario, come si legge la riga.
 * - `servings` — la ricetta fa N porzioni; nel diario aggiungi «1 porzione».
 * - `grams`    — la ricetta rende N grammi di piatto finito; nel diario pesi e aggiungi «180 g».
 */
export type RecipeMode = 'servings' | 'grams'

/**
 * Quantità che non si pesano: sale, spezie, dolcificante. Metterci dei grammi
 * sarebbe inventarli, e i loro macro sono comunque zero — ma nella lista degli
 * ingredienti devono comparire lo stesso.
 */
export type RecipeQta = 'pizzico' | 'qb'

/** Un ingrediente: punta alla libreria alimenti, così una correzione lì ricalcola le ricette. */
export interface RecipeItem { foodId: ID; grams: number; qta?: RecipeQta }

/** Sezione della ricetta (Base, Crema, Finitura…). Una ricetta semplice ne ha una sola. */
export interface RecipeGroup { name: string; items: RecipeItem[] }

export interface Recipe extends BaseRecord {
  name: string
  mode: RecipeMode
  /** se mode = 'servings': porzioni di riferimento della dose scritta */
  servings?: number
  /** se mode = 'grams': peso del piatto FINITO (in cottura si perde acqua, è meno del crudo) */
  yieldG?: number
  groups: RecipeGroup[]
  steps: string[]
  /** foto del piatto (dataURL, ridimensionata): copertina delle slide da postare */
  photo?: string
  note?: string
  timeMin?: number
  tags?: string[]
  favorite?: boolean
  lastUsedAt?: ISODateTime
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
/**
 * Blocchi del Coach. Sono acceso/spento perche' cosa vale la pena guardare
 * lo decide chi si allena, non chi scrive l'app.
 */
export type CoachBlock = 'salute' | 'nutrizione' | 'carico' | 'allenamento' | 'riconoscimenti'

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

/**
 * Una giornata come la vede WHOOP. Copia locale di un dato altrui: si può
 * ricostruire in qualsiasi momento risincronizzando, quindi non entra nei backup
 * come verità e non sovrascrive mai quello che scrivi tu nel Check.
 */
export interface WhoopDay extends BaseRecord {
  date: ISODate
  /** 0-100 */
  recovery?: number
  /** HRV in millisecondi (rMSSD) */
  hrv?: number
  restingHr?: number
  spo2?: number
  skinTempC?: number
  /** 0-100 */
  sleepPerf?: number
  sleepHours?: number
  /** Quando sei andato a letto e quando ti sei svegliato: il coach li chiede. */
  sleepStart?: ISODateTime
  sleepEnd?: ISODateTime
  sleepEfficiency?: number
  respiratoryRate?: number
  /** 0-21 */
  strain?: number
  kcal?: number
  avgHr?: number
  maxHr?: number
  syncedAt: ISODateTime
}

/** Un allenamento registrato da WHOOP (anche quelli fatti fuori dall'app). */
export interface WhoopWorkout extends BaseRecord {
  whoopId: string
  date: ISODate
  sport?: string
  start: ISODateTime
  end: ISODateTime
  strain?: number
  kcal?: number
  avgHr?: number
  maxHr?: number
  distanceM?: number
}

export type CardioMethod = 'standard' | 'hrr'
export type CardioType =
  | 'corsa' | 'camminata' | 'cyclette' | 'ellittica' | 'vogatore' | 'assaultbike'
  | 'hiit' | 'tabata' | 'liss' | 'intervalli' | 'altro'

export interface CardioSession extends BaseRecord {
  sessionId: ID | null // se collegato a un workout
  date: ISODate
  durationMin: number
  /** Quando e' cominciato e finito: e' cio' che permette di ritagliare il cuore
   *  del SOLO cardio dentro le letture di tutta la seduta. */
  startedAt?: ISODateTime
  endedAt?: ISODateTime
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
  /**
   * Seduta di solo cardio: sta in un elenco suo, non fra gli allenamenti.
   * Un template senza esercizi puo' essere sia un cardio sia un allenamento che
   * stai ancora costruendo — solo tu sai quale, quindi lo dici tu.
   */
  cardio?: boolean
}

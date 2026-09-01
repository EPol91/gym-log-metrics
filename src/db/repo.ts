// Repository: operazioni sui grezzi. Nessun dato derivato salvato.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { normalizeName } from './catalog'
import { todayLocal } from '../util/date'
import { bestE1rm } from '../metrics/metrics'
import { snapshotAndDelete, type Trash } from './trash'
import type {
  WorkoutSession, WorkoutType, ExerciseEntry, SetEntry, Exercise,
  ReadinessCheck, MuscleGroup, TrainingPhase, Phase, Unit, WorkoutTemplate,
  CardioSession, CardioMethod, CardioType, NutritionContext, NutritionDayType, NutritionStatus,
  ActivityLevel, BmrFormula, CoachBlock,
} from './schema'

const U = LOCAL_USER_ID
const today = (): string => todayLocal()

// --- Sessioni ---
export async function startSession(type: WorkoutType, readiness: ReadinessCheck | null): Promise<string> {
  const ts = nowISO()
  const gyms = await db.gyms.where('userId').equals(U).toArray()
  const gym = gyms.find((g) => g.isDefault) ?? gyms[0]
  const phase = await currentPhaseId()
  const s: WorkoutSession = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    gymId: gym?.id ?? null, date: today(), type,
    startedAt: ts, finishedAt: null, phaseId: phase, readiness, notes: '',
  }
  await db.sessions.add(s)
  return s.id
}

export async function finishSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { finishedAt: nowISO(), updatedAt: nowISO() })
}

/**
 * Riapre una seduta chiusa (anche per sbaglio) e riprende il cronometro da dov'era:
 * il tempo passato da chiusa finisce in `pausedSec` e non viene conteggiato.
 */
export async function reopenSession(sessionId: string): Promise<void> {
  const s = await db.sessions.get(sessionId)
  if (!s || !s.finishedAt) return
  const closedForSec = Math.max(0, Math.round((Date.now() - new Date(s.finishedAt).getTime()) / 1000))
  await db.sessions.update(sessionId, {
    finishedAt: null,
    pausedSec: (s.pausedSec ?? 0) + closedForSec,
    updatedAt: nowISO(),
  })
}

/** Durata effettiva in secondi, al netto del tempo in cui la seduta è rimasta chiusa. */
export function sessionElapsedSec(s: { startedAt: string; finishedAt: string | null; pausedSec?: number }, nowMs = Date.now()): number {
  const end = s.finishedAt ? new Date(s.finishedAt).getTime() : nowMs
  return Math.max(0, Math.round((end - new Date(s.startedAt).getTime()) / 1000) - (s.pausedSec ?? 0))
}

export function getSession(sessionId: string) {
  return db.sessions.get(sessionId)
}

/** Seduta attualmente aperta (finishedAt vuoto), la più recente. Per riprenderla dopo essere usciti. */
export async function getOngoingSession(): Promise<WorkoutSession | undefined> {
  const open = await db.sessions.where('userId').equals(U).filter((s) => s.finishedAt === null).toArray()
  open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return open[0]
}

export async function updateSessionNotes(sessionId: string, notes: string): Promise<void> {
  await db.sessions.update(sessionId, { notes, updatedAt: nowISO() })
}

/** Cambia il tipo di una seduta (es. correggere Push→Custom dopo la chiusura). */
export async function setSessionType(sessionId: string, type: WorkoutType): Promise<void> {
  await db.sessions.update(sessionId, { type, updatedAt: nowISO() })
}

/**
 * Da quale scheda viene questa seduta: lo dici tu.
 *
 * Le sedute nuove se lo scrivono da sole all'avvio, ma quelle vecchie no, e
 * indovinarlo dagli esercizi ha gia' sbagliato abbastanza. null = e' tua.
 */
export async function setSessionSource(sessionId: string, templateId: string | null): Promise<void> {
  await db.sessions.update(sessionId, { srcTemplateId: templateId, updatedAt: nowISO() })
}

/** Elimina una seduta e tutto il suo contenuto (esercizi, set, cardio). */
export async function deleteSession(sessionId: string): Promise<Trash> {
  const session = await db.sessions.get(sessionId)
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  const sets: unknown[] = []
  for (const e of entries) {
    sets.push(...await db.sets.where({ entryId: e.id }).toArray())
    await db.sets.where({ entryId: e.id }).delete()
  }
  const cardio = await db.cardio.where({ sessionId }).toArray()
  await db.exerciseEntries.where({ sessionId }).delete()
  await db.cardio.where({ sessionId }).delete()
  await db.sessions.delete(sessionId)
  return [
    { table: 'sessions', rows: session ? [session] : [] },
    { table: 'exerciseEntries', rows: entries },
    { table: 'sets', rows: sets },
    { table: 'cardio', rows: cardio },
  ]
}

// --- Palestre (location manuale) ---
export function listGyms() {
  return db.gyms.where('userId').equals(U).toArray()
}
export async function addGym(name: string): Promise<void> {
  const ts = nowISO()
  const existing = await listGyms()
  await db.gyms.add({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: name.trim() || 'Palestra', isDefault: existing.length === 0,
  })
}
export async function setDefaultGym(id: string): Promise<void> {
  const gyms = await listGyms()
  for (const g of gyms) {
    if (g.isDefault !== (g.id === id)) await db.gyms.update(g.id, { isDefault: g.id === id, updatedAt: nowISO() })
  }
}
export async function deleteGym(id: string): Promise<Trash> {
  return snapshotAndDelete('gyms', id)
}
export async function renameGym(id: string, name: string): Promise<void> {
  await db.gyms.update(id, { name: name.trim() || 'Palestra', updatedAt: nowISO() })
}
/** Memorizza (o cancella) la posizione di una palestra. */
export async function setGymPosition(id: string, pos: { lat: number; lng: number } | null): Promise<void> {
  await db.gyms.update(id, { lat: pos?.lat, lng: pos?.lng, updatedAt: nowISO() })
}
/** Cambia la palestra di una seduta già iniziata. */
export async function setSessionGym(sessionId: string, gymId: string | null): Promise<void> {
  await db.sessions.update(sessionId, { gymId, updatedAt: nowISO() })
}

async function currentPhaseId(): Promise<string | null> {
  const p = await db.phases.where('userId').equals(U).filter((x) => x.endDate === null).first()
  return p?.id ?? null
}

// --- Fase di allenamento ---
export function getCurrentPhase(): Promise<TrainingPhase | undefined> {
  return db.phases.where('userId').equals(U).filter((p) => p.endDate === null).first()
}

/** Imposta una nuova fase: chiude quella corrente (endDate oggi) e ne apre una nuova. */
export async function setPhase(phase: Phase): Promise<void> {
  const t = today()
  const ts = nowISO()
  const current = await getCurrentPhase()
  if (current) {
    if (current.phase === phase) return // già in quella fase
    await db.phases.update(current.id, { endDate: t, updatedAt: ts })
  }
  const p: TrainingPhase = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    phase, startDate: t, endDate: null,
  }
  await db.phases.add(p)
}

/** Chiude la fase corrente senza aprirne una nuova (deseleziona). */
export async function clearPhase(): Promise<void> {
  const current = await getCurrentPhase()
  if (current) await db.phases.update(current.id, { endDate: today(), updatedAt: nowISO() })
}

/** Corregge la data d'inizio della fase corrente (se il riconoscimento è sbagliato). */
export async function setPhaseStartDate(phaseId: string, startDate: string): Promise<void> {
  await db.phases.update(phaseId, { startDate, updatedAt: nowISO() })
}

// --- Template ---
export function listTemplates() {
  return db.templates.where('userId').equals(U).toArray()
}
export function getTemplate(id: string) {
  return db.templates.get(id)
}

/** Crea un template vuoto (da editare). */
export async function createTemplate(name: string, type: WorkoutType = 'custom'): Promise<string> {
  const ts = nowISO()
  const tpl: WorkoutTemplate = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: name.trim() || 'Template', type, items: [],
  }
  await db.templates.add(tpl)
  return tpl.id
}

export async function updateTemplate(id: string, patch: { name?: string; type?: WorkoutType; cardio?: boolean; items?: { exerciseId: string; order: number }[] }): Promise<void> {
  await db.templates.update(id, { ...patch, updatedAt: nowISO() })
}

/** Crea un template dalla struttura (solo esercizi) di una seduta esistente. */
export async function createTemplateFromSession(sessionId: string, name: string): Promise<string> {
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('Seduta non trovata')
  const entries = await db.exerciseEntries.where({ sessionId }).sortBy('order')
  const ts = nowISO()
  const tpl: WorkoutTemplate = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: name.trim() || 'Template', type: session.type,
    items: entries.map((e, i) => ({ exerciseId: e.exerciseId, order: i })),
  }
  await db.templates.add(tpl)
  return tpl.id
}

/** Avvia una seduta da un template: crea la sessione e pre-carica gli esercizi (senza set). */
export async function startFromTemplate(templateId: string, readiness: ReadinessCheck | null): Promise<string> {
  const tpl = await db.templates.get(templateId)
  if (!tpl) throw new Error('Template non trovato')
  const sessionId = await startSession(tpl.type, readiness)
  // Da dove viene la seduta lo si sa solo adesso: dopo, restano gli esercizi, e
  // quelli non dicono chi ha scritto l'allenamento.
  await db.sessions.update(sessionId, { srcTemplateId: tpl.id })
  const ordered = [...tpl.items].sort((a, b) => a.order - b.order)
  const nati: { entryId: string; coppia?: string }[] = []
  for (const it of ordered) {
    const entryId = await addExerciseEntry(sessionId, it.exerciseId)
    nati.push({ entryId, ...(it.coppia ? { coppia: it.coppia } : {}) })
  }

  /*
   * I superset nascono gia' fatti.
   *
   * Il coach il superset lo scrive — «6A e 6B insieme» — e prima arrivavano
   * come due esercizi sciolti, da riabbinare a mano ogni volta che facevi
   * quella seduta. Se la scheda dice che vanno in coppia, la seduta parte
   * accoppiata; scioglierla resta un tocco.
   */
  const coppie = new Map<string, string[]>()
  for (const n of nati) {
    if (!n.coppia) continue
    coppie.set(n.coppia, [...(coppie.get(n.coppia) ?? []), n.entryId])
  }
  for (const ids of coppie.values()) if (ids.length > 1) await groupEntries(ids)

  return sessionId
}

export async function deleteTemplate(id: string): Promise<Trash> {
  return snapshotAndDelete('templates', id)
}

// --- Cardio ---
export interface CardioInput { durationMin: number; avgBpm?: number; maxBpm?: number; calories?: number; method?: CardioMethod; cardioType?: CardioType; startedAt?: string; endedAt?: string }

export async function addCardio(sessionId: string | null, inp: CardioInput): Promise<void> {
  const ts = nowISO()
  const c: CardioSession = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    sessionId, date: today(), durationMin: inp.durationMin,
    ...(inp.avgBpm != null ? { avgBpm: inp.avgBpm } : {}),
    ...(inp.maxBpm != null ? { maxBpm: inp.maxBpm } : {}),
    ...(inp.calories != null ? { calories: inp.calories } : {}),
    ...(inp.method != null ? { method: inp.method } : {}),
    ...(inp.cardioType != null ? { cardioType: inp.cardioType } : {}),
    // Gli estremi del cardio: senza, il suo cuore non si puo' ritagliare da
    // quello della seduta intera.
    ...(inp.startedAt ? { startedAt: inp.startedAt } : {}),
    ...(inp.endedAt ? { endedAt: inp.endedAt } : {}),
  }
  await db.cardio.add(c)
}

export async function updateCardio(id: string, patch: Partial<CardioInput>): Promise<void> {
  await db.cardio.update(id, { ...patch, updatedAt: nowISO() })
}

export function cardioOf(sessionId: string) {
  return db.cardio.where({ sessionId }).toArray()
}

export async function deleteCardio(id: string): Promise<Trash> {
  return snapshotAndDelete('cardio', id)
}

// --- Preset cardio a intervalli (custom) ---
export function listCardioPresets() {
  return db.cardioPresets.where('userId').equals(U).toArray()
}
export async function addCardioPreset(name: string, rounds: number, workSec: number, restSec: number): Promise<void> {
  const ts = nowISO()
  await db.cardioPresets.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: name.trim() || 'Preset', rounds, workSec, restSec })
}

export interface CardioTemplateInput {
  rounds: number; workSec: number; restSec: number
  cardioType: CardioType; method: CardioMethod; mode: 'interval' | 'countdown' | 'chrono'; targetMin: number
}
/** Salva un template cardio completo (tipo + formula + modalità + parametri). */
export async function addCardioTemplate(name: string, t: CardioTemplateInput): Promise<void> {
  const ts = nowISO()
  await db.cardioPresets.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: name.trim() || 'Template', ...t })
}
export async function deleteCardioPreset(id: string): Promise<Trash> {
  return snapshotAndDelete('cardioPresets', id)
}

// --- Body Metrics ---
export interface MeasurementInput {
  weight: number; bodyFat?: number; waist?: number; arm?: number; thigh?: number; chest?: number; note?: string
}

/** Registra/aggiorna la misura per una data (una per data). */
export async function upsertMeasurement(date: string, inp: MeasurementInput): Promise<void> {
  const ts = nowISO()
  const clean = Object.fromEntries(Object.entries(inp).filter(([, v]) => v != null && v !== '' && !Number.isNaN(v)))
  const existing = await db.bodyMeasurements.where('date').equals(date).filter((m) => m.userId === U).first()
  if (existing) {
    await db.bodyMeasurements.update(existing.id, { ...clean, updatedAt: ts })
  } else {
    await db.bodyMeasurements.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, ...(clean as MeasurementInput) })
  }
}

export function todayISO(): string { return today() }

// --- Check del giorno (dalla Home, senza allenamento) ---

/** Salva/aggiorna il check di una data. */
export async function saveDailyReadiness(check: ReadinessCheck, date = today()): Promise<void> {
  const ts = nowISO()
  const existing = await db.readinessChecks.where('date').equals(date).filter((r) => r.userId === U).first()
  if (existing) await db.readinessChecks.update(existing.id, { check, updatedAt: ts })
  else await db.readinessChecks.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, check })
}

/** Check di una data (default: oggi), se esiste. */
export async function getDailyReadiness(date = today()): Promise<ReadinessCheck | null> {
  const row = await db.readinessChecks.where('date').equals(date).filter((r) => r.userId === U).first()
  return row?.check ?? null
}

/**
 * Check di oggi da qualunque fonte: quello fatto dalla Home o quello di una seduta odierna,
 * il più recente dei due. Serve a precompilare le domande invece di ripartire da zero.
 */
export async function getTodayReadiness(): Promise<ReadinessCheck | null> {
  const d = today()
  const standalone = await db.readinessChecks.where('date').equals(d).filter((r) => r.userId === U).first()
  const session = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.date === d && s.readiness)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (standalone && session) {
    return standalone.updatedAt >= session.startedAt ? standalone.check : session.readiness
  }
  return standalone?.check ?? session?.readiness ?? null
}

export function listMeasurements() {
  return db.bodyMeasurements.where('userId').equals(U).sortBy('date')
}

export async function deleteMeasurement(id: string): Promise<Trash> {
  return snapshotAndDelete('bodyMeasurements', id)
}

// --- Nutrition (contesto giornaliero; NON entra negli Score) ---
export function getNutrition(date: string) {
  return db.nutrition.where('date').equals(date).filter((n) => n.userId === U).first()
}

export function getNutritionToday() {
  return getNutrition(today())
}

export interface NutritionPatch {
  dayType?: NutritionDayType | null
  status?: NutritionStatus | null
  water?: number
  salt?: number
}

/** Crea o aggiorna il contesto nutrizionale di oggi. */
export function upsertNutritionToday(patch: NutritionPatch): Promise<void> {
  return upsertNutrition(today(), patch)
}

/** Crea o aggiorna il contesto nutrizionale di una data specifica. (null = deseleziona) */
export async function upsertNutrition(date: string, patch: NutritionPatch): Promise<void> {
  const existing = await getNutrition(date)
  const ts = nowISO()
  if (existing) {
    await db.nutrition.update(existing.id, { ...patch, updatedAt: ts })
  } else {
    const n: NutritionContext = {
      id: newId(), userId: U, createdAt: ts, updatedAt: ts,
      date,
      ...(patch.dayType != null ? { dayType: patch.dayType } : {}),
      ...(patch.status != null ? { status: patch.status } : {}),
      ...(patch.water != null ? { water: patch.water } : {}),
      ...(patch.salt != null ? { salt: patch.salt } : {}),
    }
    await db.nutrition.add(n)
  }
}

// --- Impostazioni utente ---
export function getUser() {
  return db.users.get(U)
}
export async function updateUser(
  patch: {
    name?: string; weeklyTarget?: number; unit?: Unit; birthYear?: number
    restingHr?: number; hrMaxMeasured?: number; heightCm?: number; restDefaultSec?: number
    onboarded?: boolean; waterTarget?: number; saltTarget?: number; sex?: 'm' | 'f'
    activityLevel?: ActivityLevel; bmrFormula?: BmrFormula; coachBlocks?: CoachBlock[]
    todayCards?: string[]; rsActive?: boolean; rsStart?: string; rsAskDaily?: boolean
    suonoTimer?: string; volumeBip?: number; cicliChiusiAMano?: string[]
    /** ciclizzazione carbo, sette lettere L/H da lunedi' */
    rsCiclo?: string
    cicloSedute?: number; cicloGiorni?: number; cicloInizio?: string
    /** da quale app leggere i passi; undefined = tutte sommate */
    passiSorgente?: string
    schermoAcceso?: boolean
  },
): Promise<void> {
  // Il cambio di obiettivo settimanale va tracciato: il Consistency giudica ogni settimana
  // con l'obiettivo valido allora, non con quello di oggi.
  if (patch.weeklyTarget != null) {
    const current = await db.users.get(U)
    if (current?.weeklyTarget !== patch.weeklyTarget) await recordWeeklyGoal(patch.weeklyTarget, current?.weeklyTarget)
  }
  await db.users.update(U, { ...patch, updatedAt: nowISO() })
}

/**
 * Registra l'obiettivo settimanale valido da oggi (un solo record per data).
 * Al primo cambio salva anche una riga d'apertura con il valore PRECEDENTE, datata
 * all'inizio dello storico: senza, il nuovo obiettivo verrebbe applicato all'indietro.
 */
async function recordWeeklyGoal(target: number, previous?: number): Promise<void> {
  const ts = nowISO()
  const d = today()
  const count = await db.goalHistory.where('userId').equals(U).count()
  if (count === 0 && previous != null && previous > 0) {
    const firstSession = (await db.sessions.where('userId').equals(U).toArray())
      .map((s) => s.date).sort()[0]
    const user = await db.users.get(U)
    const baseline = [firstSession, user?.createdAt?.slice(0, 10), d].filter(Boolean).sort()[0] as string
    if (baseline < d) {
      await db.goalHistory.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, date: baseline, target: previous })
    }
  }
  const existing = await db.goalHistory.where('date').equals(d).filter((g) => g.userId === U).first()
  if (existing) await db.goalHistory.update(existing.id, { target, updatedAt: ts })
  else await db.goalHistory.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, date: d, target })
}

/** Storico obiettivi in ordine cronologico. */
export async function listGoalHistory(): Promise<{ date: string; target: number }[]> {
  const rows = await db.goalHistory.where('userId').equals(U).sortBy('date')
  return rows.map((r) => ({ date: r.date, target: r.target }))
}

// --- Superset / triset ---

/**
 * Unisce 2-3 esercizi in un gruppo: si eseguono di fila e il recupero parte a fine giro.
 * Gli esercizi vengono resi contigui nell'ordine della seduta.
 */
export async function groupEntries(entryIds: string[]): Promise<string | null> {
  if (entryIds.length < 2 || entryIds.length > 3) return null
  const rows = (await db.exerciseEntries.bulkGet(entryIds)).filter(Boolean) as ExerciseEntry[]
  if (rows.length !== entryIds.length) return null

  const groupId = newId()
  const ts = nowISO()
  const all = (await db.exerciseEntries.where({ sessionId: rows[0].sessionId }).toArray())
    .sort((a, b) => a.order - b.order)
  const anchor = Math.min(...rows.map((r) => r.order))
  const others = all.filter((e) => !entryIds.includes(e.id))

  // Il gruppo prende il posto del primo dei suoi esercizi; gli altri scorrono.
  const before = others.filter((e) => e.order < anchor).map((e) => e.id)
  const after = others.filter((e) => e.order > anchor).map((e) => e.id)
  const seq = [...before, ...entryIds, ...after]

  for (let i = 0; i < seq.length; i++) {
    const id = seq[i]
    const k = entryIds.indexOf(id)
    await db.exerciseEntries.update(id, {
      order: i, updatedAt: ts,
      ...(k >= 0 ? { groupId, groupOrder: k } : {}),
    })
  }
  return groupId
}

/** Scioglie il gruppo: gli esercizi restano al loro posto ma tornano indipendenti. */
export async function ungroupEntries(groupId: string): Promise<void> {
  const rows = await db.exerciseEntries.where('groupId').equals(groupId).toArray()
  const ts = nowISO()
  for (const r of rows) {
    await db.exerciseEntries.update(r.id, { groupId: undefined, groupOrder: undefined, updatedAt: ts })
  }
}

// --- Esercizi nella seduta ---
export async function addExerciseEntry(sessionId: string, exerciseId: string): Promise<string> {
  const ts = nowISO()
  const order = await db.exerciseEntries.where({ sessionId }).count()
  const e: ExerciseEntry = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    sessionId, exerciseId, order,
  }
  await db.exerciseEntries.add(e)
  return e.id
}

export function entriesOf(sessionId: string) {
  return db.exerciseEntries.where({ sessionId }).sortBy('order')
}

/** Elimina un esercizio dalla seduta e tutti i suoi set. */
export async function deleteExerciseEntry(entryId: string): Promise<Trash> {
  const entry = await db.exerciseEntries.get(entryId)
  const sets = await db.sets.where({ entryId }).toArray()
  await db.sets.where({ entryId }).delete()
  await db.exerciseEntries.delete(entryId)
  return [
    { table: 'exerciseEntries', rows: entry ? [entry] : [] },
    { table: 'sets', rows: sets },
  ]
}

/** Sposta un esercizio su/giù nella seduta (scambio di order). */
export async function moveExerciseEntry(entryId: string, dir: -1 | 1): Promise<void> {
  const e = await db.exerciseEntries.get(entryId)
  if (!e) return
  const siblings = await db.exerciseEntries.where({ sessionId: e.sessionId }).sortBy('order')
  const i = siblings.findIndex((x) => x.id === entryId)
  const j = i + dir
  if (j < 0 || j >= siblings.length) return
  const other = siblings[j]
  await db.exerciseEntries.update(e.id, { order: other.order, updatedAt: nowISO() })
  await db.exerciseEntries.update(other.id, { order: e.order, updatedAt: nowISO() })
}

/**
 * Stacca UN esercizio dal superset, lasciando in piedi gli altri.
 *
 * Se dopo l'uscita ne resta uno solo, il gruppo non ha piu' senso e si scioglie
 * da se': un superset di un esercizio e' un esercizio.
 */
export async function staccaDalGruppo(entryId: string): Promise<void> {
  const e = await db.exerciseEntries.get(entryId)
  if (!e?.groupId) return
  const ts = nowISO()
  await db.exerciseEntries.update(e.id, { groupId: undefined, groupOrder: undefined, updatedAt: ts })
  const restano = (await db.exerciseEntries.where('groupId').equals(e.groupId).toArray())
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
  if (restano.length <= 1) {
    for (const r of restano) await db.exerciseEntries.update(r.id, { groupId: undefined, groupOrder: undefined, updatedAt: ts })
    return
  }
  // I posti si richiudono: A, B, C senza buchi.
  for (let i = 0; i < restano.length; i++) await db.exerciseEntries.update(restano[i].id, { groupOrder: i, updatedAt: ts })
}

/**
 * Sposta un esercizio DENTRO il suo superset: A diventa B e viceversa.
 *
 * Nel giro l'ordine conta — e' quello in cui li fai — e senza questo l'unico
 * modo per cambiarlo era sciogliere il gruppo e rifarlo.
 */
export async function moveInGroup(entryId: string, dir: -1 | 1): Promise<void> {
  const e = await db.exerciseEntries.get(entryId)
  if (!e?.groupId) return
  const gruppo = (await db.exerciseEntries.where({ sessionId: e.sessionId }).toArray())
    .filter((x) => x.groupId === e.groupId)
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
  const i = gruppo.findIndex((x) => x.id === entryId)
  const j = i + dir
  if (j < 0 || j >= gruppo.length) return
  const altro = gruppo[j]
  const ts = nowISO()
  await db.exerciseEntries.update(e.id, { groupOrder: altro.groupOrder ?? j, updatedAt: ts })
  await db.exerciseEntries.update(altro.id, { groupOrder: e.groupOrder ?? i, updatedAt: ts })
}

// --- Set ---
export interface SetInput { weight: number; reps: number; rir?: number; isWarmup?: boolean; restSec?: number }

export async function addSet(entryId: string, inp: SetInput): Promise<string> {
  const ts = nowISO()
  const order = await db.sets.where({ entryId }).count()
  const s: SetEntry = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    entryId, order, weight: inp.weight, reps: inp.reps,
    ...(inp.rir != null ? { rir: inp.rir } : {}),
    ...(inp.isWarmup ? { isWarmup: true } : {}),
    ...(inp.restSec != null ? { restSec: inp.restSec } : {}),
  }
  await db.sets.add(s)
  return s.id
}

/** Storico recente di un esercizio: ultime sedute (solo serie di lavoro) per confronto durante l'allenamento. */
export async function exerciseHistory(exerciseId: string, exceptSessionId: string, limit = 5): Promise<{ date: string; sets: SetEntry[] }[]> {
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()
  const rows: { date: string; startedAt: string; sets: SetEntry[] }[] = []
  for (const e of entries) {
    if (e.sessionId === exceptSessionId) continue
    const session = await db.sessions.get(e.sessionId)
    if (!session) continue
    const sets = (await db.sets.where({ entryId: e.id }).sortBy('order')).filter((s) => !s.isWarmup)
    if (sets.length) rows.push({ date: session.date, startedAt: session.startedAt, sets })
  }
  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return rows.slice(0, limit).map(({ date, sets }) => ({ date, sets }))
}

export async function updateSet(id: string, patch: Partial<SetInput>): Promise<void> {
  await db.sets.update(id, { ...patch, updatedAt: nowISO() })
}

export function setsOf(entryId: string) {
  return db.sets.where({ entryId }).sortBy('order')
}

export async function deleteSet(id: string): Promise<Trash> {
  return snapshotAndDelete('sets', id)
}

/** Miglior e1RM storico di un esercizio (per rilevare i PR), escludendo una seduta. */
export async function historicalBestE1rm(exerciseId: string, exceptSessionId?: string): Promise<number> {
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()
  let best = 0
  for (const e of entries) {
    if (exceptSessionId && e.sessionId === exceptSessionId) continue
    const sets = await db.sets.where({ entryId: e.id }).toArray()
    best = Math.max(best, bestE1rm(sets))
  }
  return best
}

/** Ultima serie di lavoro registrata per un esercizio (per autofill). */
export async function lastWorkingSet(exerciseId: string, exceptSessionId?: string): Promise<SetEntry | null> {
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()
  let best: { s: SetEntry; ts: string } | null = null
  for (const e of entries) {
    if (exceptSessionId && e.sessionId === exceptSessionId) continue
    const sets = await db.sets.where({ entryId: e.id }).toArray()
    for (const s of sets) {
      if (s.isWarmup) continue
      if (!best || s.createdAt > best.ts) best = { s, ts: s.createdAt }
    }
  }
  return best?.s ?? null
}

// --- Catalogo esercizi + anti-duplicato ---
export function allExercises() {
  return db.exercises.where('userId').equals(U).toArray()
}

/** Imposta il recupero predefinito di un esercizio (ricordato tra le sedute). */
export async function setExerciseRest(exerciseId: string, restSec: number): Promise<void> {
  await db.exercises.update(exerciseId, { restSec, updatedAt: nowISO() })
}

/** Regolazioni macchina di un esercizio (sellino, poggiapetto…), testo libero. */
export async function setExerciseSettings(exerciseId: string, settings: string): Promise<void> {
  await db.exercises.update(exerciseId, { settings: settings.trim(), updatedAt: nowISO() })
}

/**
 * L'inclinazione dello schienale, ricordata come le altre regolazioni: la
 * misuri una volta e alla seduta dopo sai a quanti gradi eri.
 */
export async function setExerciseInclinazione(exerciseId: string, gradi: number | undefined): Promise<void> {
  await db.exercises.update(exerciseId, { inclinazione: gradi, updatedAt: nowISO() })
}

/**
 * La foto della macchina, ricordata come le altre regolazioni.
 * «Piede a metà pedana, punta leggermente in fuori» in una foto si vede subito;
 * scritto, la settimana dopo vuol dire un'altra cosa.
 */
export async function setExerciseFoto(exerciseId: string, foto: string | undefined): Promise<void> {
  await db.exercises.update(exerciseId, { foto, updatedAt: nowISO() })
}

/** Cerca un esercizio esistente per nome o alias (anti-duplicato). */
export async function findExercise(name: string): Promise<Exercise | undefined> {
  const n = normalizeName(name)
  const all = await allExercises()
  return all.find(
    (e) => normalizeName(e.name) === n || e.aliases.some((a) => normalizeName(a) === n),
  )
}

/** Crea un esercizio custom se non esiste già (altrimenti ritorna l'esistente). */
/** Correzione di un esercizio: nome e/o gruppo muscolare. */
export async function updateExercise(id: string, patch: { name?: string; muscle?: MuscleGroup }): Promise<void> {
  const clean: { name?: string; muscle?: MuscleGroup; updatedAt: string } = { updatedAt: nowISO() }
  if (patch.name != null && patch.name.trim()) clean.name = patch.name.trim()
  if (patch.muscle) clean.muscle = patch.muscle
  await db.exercises.update(id, clean)
}

export async function getOrCreateExercise(name: string, muscle: MuscleGroup = 'altro'): Promise<Exercise> {
  const existing = await findExercise(name)
  if (existing) return existing
  const ts = nowISO()
  const e: Exercise = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: name.trim(), muscle, isCustom: true, aliases: [],
  }
  await db.exercises.add(e)
  return e
}

/**
 * Corregge a mano l'orario di inizio e fine di una seduta.
 *
 * L'app li registra da sola, ma capita di far partire il cronometro tardi o di
 * chiudere la seduta mentre sei ancora in doccia: senza poterli correggere, la
 * durata resta sbagliata per sempre e con lei ogni confronto.
 *
 * `pausedSec` torna a zero: se dichiari tu l'intervallo, quello E' la durata —
 * tenere anche le pause vecchie darebbe un totale che non torna con gli orari
 * scritti sopra.
 */
export async function setSessionTimes(sessionId: string, startedAt: string, finishedAt: string | null): Promise<void> {
  await db.sessions.update(sessionId, { startedAt, finishedAt, pausedSec: 0, updatedAt: nowISO() })
}

/** Scrive le letture della fascia dentro la seduta. Chiamata dal registratore. */
export async function salvaLettureCuore(sessionId: string, serie: { t0: string; step: number; bpm: number[] }): Promise<void> {
  await db.sessions.update(sessionId, { hr: serie, updatedAt: nowISO() })
}

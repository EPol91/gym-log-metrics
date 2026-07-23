// Repository: operazioni sui grezzi. Nessun dato derivato salvato.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { normalizeName } from './catalog'
import { bestE1rm } from '../metrics/metrics'
import type {
  WorkoutSession, WorkoutType, ExerciseEntry, SetEntry, Exercise,
  ReadinessCheck, MuscleGroup, TrainingPhase, Phase, Unit, WorkoutTemplate,
  CardioSession, CardioMethod, CardioType, NutritionContext, NutritionDayType, NutritionStatus,
} from './schema'

const U = LOCAL_USER_ID
const today = (): string => new Date().toISOString().slice(0, 10)

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

/** Elimina una seduta e tutto il suo contenuto (esercizi, set, cardio). */
export async function deleteSession(sessionId: string): Promise<void> {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  for (const e of entries) await db.sets.where({ entryId: e.id }).delete()
  await db.exerciseEntries.where({ sessionId }).delete()
  await db.cardio.where({ sessionId }).delete()
  await db.sessions.delete(sessionId)
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
export async function deleteGym(id: string): Promise<void> {
  await db.gyms.delete(id)
}
export async function renameGym(id: string, name: string): Promise<void> {
  await db.gyms.update(id, { name: name.trim() || 'Palestra', updatedAt: nowISO() })
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

export async function updateTemplate(id: string, patch: { name?: string; type?: WorkoutType; items?: { exerciseId: string; order: number }[] }): Promise<void> {
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
  const ordered = [...tpl.items].sort((a, b) => a.order - b.order)
  for (const it of ordered) await addExerciseEntry(sessionId, it.exerciseId)
  return sessionId
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id)
}

// --- Cardio ---
export interface CardioInput { durationMin: number; avgBpm?: number; method?: CardioMethod; cardioType?: CardioType }

export async function addCardio(sessionId: string | null, inp: CardioInput): Promise<void> {
  const ts = nowISO()
  const c: CardioSession = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    sessionId, date: today(), durationMin: inp.durationMin,
    ...(inp.avgBpm != null ? { avgBpm: inp.avgBpm } : {}),
    ...(inp.method != null ? { method: inp.method } : {}),
    ...(inp.cardioType != null ? { cardioType: inp.cardioType } : {}),
  }
  await db.cardio.add(c)
}

export async function updateCardio(id: string, patch: Partial<CardioInput>): Promise<void> {
  await db.cardio.update(id, { ...patch, updatedAt: nowISO() })
}

export function cardioOf(sessionId: string) {
  return db.cardio.where({ sessionId }).toArray()
}

export async function deleteCardio(id: string): Promise<void> {
  await db.cardio.delete(id)
}

// --- Preset cardio a intervalli (custom) ---
export function listCardioPresets() {
  return db.cardioPresets.where('userId').equals(U).toArray()
}
export async function addCardioPreset(name: string, rounds: number, workSec: number, restSec: number): Promise<void> {
  const ts = nowISO()
  await db.cardioPresets.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: name.trim() || 'Preset', rounds, workSec, restSec })
}
export async function deleteCardioPreset(id: string): Promise<void> {
  await db.cardioPresets.delete(id)
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

export function listMeasurements() {
  return db.bodyMeasurements.where('userId').equals(U).sortBy('date')
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.bodyMeasurements.delete(id)
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
    onboarded?: boolean; waterTarget?: number; saltTarget?: number
  },
): Promise<void> {
  await db.users.update(U, { ...patch, updatedAt: nowISO() })
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
export async function deleteExerciseEntry(entryId: string): Promise<void> {
  await db.sets.where({ entryId }).delete()
  await db.exerciseEntries.delete(entryId)
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

// --- Set ---
export interface SetInput { weight: number; reps: number; rir?: number; isWarmup?: boolean; restSec?: number }

export async function addSet(entryId: string, inp: SetInput): Promise<void> {
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

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id)
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

/** Cerca un esercizio esistente per nome o alias (anti-duplicato). */
export async function findExercise(name: string): Promise<Exercise | undefined> {
  const n = normalizeName(name)
  const all = await allExercises()
  return all.find(
    (e) => normalizeName(e.name) === n || e.aliases.some((a) => normalizeName(a) === n),
  )
}

/** Crea un esercizio custom se non esiste già (altrimenti ritorna l'esistente). */
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

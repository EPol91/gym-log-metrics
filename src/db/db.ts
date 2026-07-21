// Database locale IndexedDB via Dexie.
// Versionamento schema dal giorno zero (Dexie migrations) → aggiornamenti senza rompere i dati.
// NOTA: gli Score NON hanno tabella: sono derivati a runtime e memoizzati in memoria.

import Dexie, { type Table } from 'dexie'
import type {
  User, Gym, Exercise, WorkoutSession, ExerciseEntry, SetEntry,
  BodyMeasurement, NutritionContext, CardioSession, TrainingPhase, WorkoutTemplate, CardioPreset,
} from './schema'

export class GymLogDB extends Dexie {
  users!: Table<User, string>
  gyms!: Table<Gym, string>
  exercises!: Table<Exercise, string>
  sessions!: Table<WorkoutSession, string>
  exerciseEntries!: Table<ExerciseEntry, string>
  sets!: Table<SetEntry, string>
  bodyMeasurements!: Table<BodyMeasurement, string>
  nutrition!: Table<NutritionContext, string>
  cardio!: Table<CardioSession, string>
  phases!: Table<TrainingPhase, string>
  templates!: Table<WorkoutTemplate, string>
  cardioPresets!: Table<CardioPreset, string>

  constructor() {
    super('gym-log-metrics')
    // Ogni indice include userId in testa: query sempre filtrate per utente (multi-tenant-ready).
    this.version(1).stores({
      users: 'id',
      gyms: 'id, userId',
      exercises: 'id, userId, name, muscle, isCustom',
      sessions: 'id, userId, date, type, phaseId',
      exerciseEntries: 'id, userId, sessionId, exerciseId',
      sets: 'id, userId, entryId',
      bodyMeasurements: 'id, userId, date',
      nutrition: 'id, userId, date',
      cardio: 'id, userId, date, sessionId',
      phases: 'id, userId, startDate, endDate',
    })
    // v2: template di allenamento (Dexie eredita le tabelle precedenti, aggiunge solo la nuova).
    this.version(2).stores({
      templates: 'id, userId, type',
    })
    // v3: preset cardio a intervalli personalizzati.
    this.version(3).stores({
      cardioPresets: 'id, userId',
    })
  }
}

export const db = new GymLogDB()

/** ID stabile e sync-ready. */
export function newId(): string {
  return crypto.randomUUID()
}

export function nowISO(): string {
  return new Date().toISOString()
}

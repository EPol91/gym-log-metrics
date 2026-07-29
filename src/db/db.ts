// Database locale IndexedDB via Dexie.
// Versionamento schema dal giorno zero (Dexie migrations) → aggiornamenti senza rompere i dati.
// NOTA: gli Score NON hanno tabella: sono derivati a runtime e memoizzati in memoria.

import Dexie, { type Table } from 'dexie'
import type {
  User, Gym, Exercise, WorkoutSession, ExerciseEntry, SetEntry,
  BodyMeasurement, NutritionContext, CardioSession, TrainingPhase, WorkoutTemplate, CardioPreset,
  DailyReadiness, WeeklyGoalChange, Food, FoodLog, SavedMeal, DayType, Meal,
  Habit, HabitEntry,
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
  readinessChecks!: Table<DailyReadiness, string>
  goalHistory!: Table<WeeklyGoalChange, string>
  foods!: Table<Food, string>
  foodLogs!: Table<FoodLog, string>
  savedMeals!: Table<SavedMeal, string>
  dayTypes!: Table<DayType, string>
  meals!: Table<Meal, string>
  habits!: Table<Habit, string>
  habitEntries!: Table<HabitEntry, string>

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
    // v4: check pre-workout del giorno, slegato dalla seduta (si può fare anche a riposo).
    this.version(4).stores({
      readinessChecks: 'id, userId, date',
    })
    // v5: storico dell'obiettivo settimanale (Consistency giudica ogni settimana con il suo obiettivo).
    this.version(5).stores({
      goalHistory: 'id, userId, date',
    })
    // v6: dieta e macro. `foods` indicizza barcode e nome per ricerca e scansione.
    this.version(6).stores({
      foods: 'id, userId, name, barcode, source, lastUsedAt',
      foodLogs: 'id, userId, date, foodId, [date+meal]',
      savedMeals: 'id, userId, name',
      dayTypes: 'id, userId, key, order',
    })
    // v7: i pasti diventano record modificabili (aggiungi/rinomina/elimina/riordina).
    // Le righe di diario esistenti vengono agganciate ai pasti creati qui: nessun dato perso.
    this.version(7).stores({
      meals: 'id, userId, date, order',
      foodLogs: 'id, userId, date, foodId, mealId, [date+mealId]',
    }).upgrade(async (tx) => {
      const NAMES: Record<string, string> = {
        colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena', spuntino: 'Spuntini',
      }
      const ORDER: Record<string, number> = { colazione: 0, pranzo: 1, cena: 2, spuntino: 3 }
      const logs = await tx.table('foodLogs').toArray()
      const created = new Map<string, string>() // "data|chiaveVecchia" → id nuovo pasto
      const ts = new Date().toISOString()
      for (const l of logs) {
        const oldKey = (l as { meal?: string }).meal ?? 'colazione'
        const cacheKey = `${l.date}|${oldKey}`
        let mealId = created.get(cacheKey)
        if (!mealId) {
          mealId = crypto.randomUUID()
          created.set(cacheKey, mealId)
          await tx.table('meals').add({
            id: mealId, userId: l.userId, createdAt: ts, updatedAt: ts,
            date: l.date, name: NAMES[oldKey] ?? 'Pasto', order: ORDER[oldKey] ?? 0,
          })
        }
        await tx.table('foodLogs').update(l.id, { mealId })
      }
    })
    // v8: superset/triset — indice sul gruppo per raccogliere gli esercizi abbinati.
    // Nessuna trasformazione dei dati: chi non ha groupId resta un esercizio singolo.
    this.version(8).stores({
      exerciseEntries: 'id, userId, sessionId, exerciseId, groupId',
    })

    // v9: livello di attivita e formula BMR sul profilo. Campi opzionali,
    // nessuna migrazione dei dati: chi non li imposta resta com'era.
    this.version(9).stores({})

    // v10: abitudini. Il valore giornaliero ha una sorgente (manuale oggi,
    // Health Connect col wrap nativo): la tabella non cambierà quando arriverà.
    this.version(10).stores({
      habits: 'id, userId, key, order',
      habitEntries: 'id, userId, habitKey, date, [habitKey+date]',
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

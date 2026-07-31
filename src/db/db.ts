// Database locale IndexedDB via Dexie.
// Versionamento schema dal giorno zero (Dexie migrations) → aggiornamenti senza rompere i dati.
// NOTA: gli Score NON hanno tabella: sono derivati a runtime e memoizzati in memoria.

import Dexie, { type Table } from 'dexie'
import type {
  User, Gym, Exercise, WorkoutSession, ExerciseEntry, SetEntry,
  BodyMeasurement, NutritionContext, CardioSession, TrainingPhase, WorkoutTemplate, CardioPreset,
  DailyReadiness, WeeklyGoalChange, Food, FoodLog, SavedMeal, DayType, Meal,
  Habit, HabitEntry, Recipe, WhoopDay, WhoopWorkout, DayTemplate, RsDay, RsCheck,
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
  recipes!: Table<Recipe, string>
  whoopDays!: Table<WhoopDay, string>
  whoopWorkouts!: Table<WhoopWorkout, string>
  dayTemplates!: Table<DayTemplate, string>
  rsDays!: Table<RsDay, string>
  rsChecks!: Table<RsCheck, string>

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

    // v11: ricette. I "pasti salvati" ci finiscono dentro: erano già una ricetta
    // senza porzioni e senza procedimento, tenerli separati significava due posti
    // dove salvare la stessa cosa. La vecchia tabella resta vuota, non si tocca.
    // `foodLogs` non cambia indici: i campi della riga-ricetta sono opzionali.
    this.version(11).stores({
      recipes: 'id, userId, name, lastUsedAt',
    }).upgrade(async (tx) => {
      const saved = await tx.table('savedMeals').toArray()
      if (!saved.length) return
      const ts = new Date().toISOString()
      await tx.table('recipes').bulkAdd(saved.map((m) => ({
        id: crypto.randomUUID(), userId: m.userId,
        createdAt: m.createdAt ?? ts, updatedAt: ts,
        name: m.name, mode: 'servings' as const, servings: 1,
        groups: [{ name: 'Ingredienti', items: (m.items ?? []).map((it: { foodId: string; grams: number }) => ({ foodId: it.foodId, grams: it.grams })) }],
        steps: [] as string[],
      })))
    })

    // v12: copia locale dei dati WHOOP. Sono un dato altrui: si ricostruiscono
    // risincronizzando, quindi nessuna migrazione e nessun dramma se un giorno manca.
    this.version(12).stores({
      whoopDays: 'id, userId, date',
      whoopWorkouts: 'id, userId, date, whoopId',
    })

    // v13: giornate tipo. Nessuna migrazione: chi non ne salva nessuna non
    // vede niente di diverso.
    this.version(13).stores({
      dayTemplates: 'id, userId, name, lastUsedAt',
    })

    // v14 — 🦠RS: una riga per giornata, con dentro SOLO i valori scritti da te.
    // Il resto si ricalcola dai tuoi dati: salvare anche i valori automatici
    // vorrebbe dire avere due verita' sullo stesso dato e non sapere quale vale.
    this.version(14).stores({
      rsDays: 'id, userId, date',
    })

    // v15 — il check settimanale: uno per settimana del protocollo, col testo
    // che correggi tu, le foto e lo stato verso il coach.
    this.version(15).stores({
      rsChecks: 'id, userId, settimana',
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

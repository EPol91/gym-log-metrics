// Abitudini: per ora solo l'obiettivo passi.
// Il valore giornaliero NON si compila a mano ogni giorno — arriverà da Health
// Connect quando l'app girerà dentro un wrap nativo. Qui c'è tutto il necessario
// perché quel giorno basti scrivere le righe: modello, sorgente, letture.

import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { todayLocal } from '../util/date'
import type { Habit, HabitEntry, HabitSource } from './schema'

const U = LOCAL_USER_ID

/** Chiave dell'abitudine passi: stabile, ci si appoggia la sorgente automatica. */
export const STEPS = 'steps'
const STEPS_DEFAULT_TARGET = 10000

export function listHabits() {
  return db.habits.where('userId').equals(U).sortBy('order')
}

export function getHabit(key: string) {
  return db.habits.where('key').equals(key).filter((h) => h.userId === U).first()
}

/**
 * Crea l'abitudine passi la prima volta. Id deterministico: due avvii ravvicinati
 * (StrictMode in sviluppo) non ne creano due.
 */
export async function ensureHabits(): Promise<void> {
  const id = `habit-${STEPS}`
  if (await db.habits.get(id)) return
  const ts = nowISO()
  await db.habits.put({
    id, userId: U, createdAt: ts, updatedAt: ts,
    key: STEPS, name: 'Passi', target: STEPS_DEFAULT_TARGET, unit: 'passi',
    source: 'healthConnect', active: true, order: 0,
  })
}

export async function setHabitTarget(key: string, target: number): Promise<void> {
  const h = await getHabit(key)
  if (h) await db.habits.update(h.id, { target, updatedAt: nowISO() })
}

/**
 * Sposta l'obiettivo di un passo leggendo il valore dal database, non da quello
 * disegnato: due tocchi rapidi contano due, non uno.
 */
export async function adjustHabitTarget(key: string, delta: number, min = 1000, max = 50000): Promise<void> {
  // Transazione: leggere e scrivere devono essere un'operazione sola, altrimenti
  // tre tocchi rapidi leggono tutti lo stesso valore e ne contano uno.
  await db.transaction('rw', db.habits, async () => {
    const h = await db.habits.where('key').equals(key).filter((x) => x.userId === U).first()
    if (!h) return
    const next = Math.max(min, Math.min(max, h.target + delta))
    if (next !== h.target) await db.habits.update(h.id, { target: next, updatedAt: nowISO() })
  })
}

export async function setHabitActive(key: string, active: boolean): Promise<void> {
  const h = await getHabit(key)
  if (h) await db.habits.update(h.id, { active, updatedAt: nowISO() })
}

/**
 * Scrive il valore di un giorno. Una riga per abitudine e data: se esiste, si aggiorna.
 * Un valore automatico non viene mai sovrascritto da uno inserito a mano — quando
 * arriverà Health Connect, sarà lui la verità.
 */
export async function setHabitValue(
  habitKey: string, date: string, value: number, source: HabitSource = 'manual',
): Promise<void> {
  const ts = nowISO()
  const existing = await db.habitEntries.where('[habitKey+date]').equals([habitKey, date]).first()
  if (existing) {
    if (source === 'manual' && existing.source !== 'manual') return
    await db.habitEntries.update(existing.id, { value, source, updatedAt: ts })
    return
  }
  await db.habitEntries.add({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    habitKey, date, value, source,
  })
}

export function getHabitValue(habitKey: string, date: string = todayLocal()) {
  return db.habitEntries.where('[habitKey+date]').equals([habitKey, date]).first()
}

/** Ultimi giorni registrati, dal più recente: serve a capire se una sorgente sta scrivendo. */
export async function recentHabitEntries(habitKey: string, limit = 7): Promise<HabitEntry[]> {
  const rows = await db.habitEntries.where('habitKey').equals(habitKey).toArray()
  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

export type { Habit, HabitEntry }

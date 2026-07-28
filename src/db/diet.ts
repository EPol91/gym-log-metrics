// Dieta: libreria alimenti, pasti, diario giornaliero, tipi giornata con obiettivi.
// Regola di fondo: i valori di QUALSIASI alimento sono modificabili e la correzione
// dell'utente (`edited`) non viene mai sovrascritta da una fonte esterna.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { todayLocal } from '../util/date'
import { snapshotAndDelete, type Trash } from './trash'
import type { DayType, Food, FoodLog, Macros, Meal, SavedMeal } from './schema'

const U = LOCAL_USER_ID
const today = (): string => todayLocal()

/** Pasti creati per una giornata nuova. Da qui in poi li gestisci tu. */
const DEFAULT_MEALS = ['Colazione', 'Pranzo', 'Cena', 'Spuntini']

// --- Alimenti ---------------------------------------------------------------

export function listFoods() {
  return db.foods.where('userId').equals(U).toArray()
}

/** Preferiti e usati di recente in cima: sono il 90% degli inserimenti. */
export async function listFoodsRanked(): Promise<Food[]> {
  const all = await listFoods()
  return all.sort((a, b) => {
    if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1
    return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '')
  })
}

export async function findFoodByBarcode(barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).filter((f) => f.userId === U).first()
}

export async function addFood(inp: {
  name: string; per100: Macros; brand?: string; barcode?: string
  source?: Food['source']; servingG?: number; servingLabel?: string; edited?: boolean
}): Promise<string> {
  const ts = nowISO()
  const f: Food = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: inp.name.trim(), per100: inp.per100, source: inp.source ?? 'mine',
    ...(inp.brand ? { brand: inp.brand.trim() } : {}),
    ...(inp.barcode ? { barcode: inp.barcode } : {}),
    ...(inp.servingG ? { servingG: inp.servingG } : {}),
    ...(inp.servingLabel ? { servingLabel: inp.servingLabel } : {}),
    ...(inp.edited ? { edited: true } : {}),
  }
  await db.foods.add(f)
  return f.id
}

/** Correzione dei valori: da qui in poi l'alimento è "tuo" e resta com'è. */
export async function updateFood(id: string, patch: Partial<Pick<Food, 'name' | 'brand' | 'per100' | 'servingG' | 'servingLabel' | 'favorite' | 'barcode'>>): Promise<void> {
  await db.foods.update(id, { ...patch, edited: true, updatedAt: nowISO() })
}

export async function deleteFood(id: string): Promise<Trash> {
  const food = await db.foods.get(id)
  const logs = await db.foodLogs.where('foodId').equals(id).toArray()
  await db.foodLogs.where('foodId').equals(id).delete()
  await db.foods.delete(id)
  return [{ table: 'foods', rows: food ? [food] : [] }, { table: 'foodLogs', rows: logs }]
}

// --- Pasti ------------------------------------------------------------------

export function mealsOfDate(date: string) {
  return db.meals.where('date').equals(date).filter((m) => m.userId === U).toArray()
}

/** Pasti del giorno, creandoli alla prima apertura di una data mai usata. */
export async function ensureMeals(date: string): Promise<Meal[]> {
  const existing = (await mealsOfDate(date)).sort((a, b) => a.order - b.order)
  if (existing.length) return existing
  const ts = nowISO()
  const rows: Meal[] = DEFAULT_MEALS.map((name, i) => ({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, name, order: i,
  }))
  await db.meals.bulkAdd(rows)
  return rows
}

export async function addMeal(date: string, name = 'Nuovo pasto'): Promise<string> {
  const ts = nowISO()
  const count = (await mealsOfDate(date)).length
  const id = newId()
  await db.meals.add({ id, userId: U, createdAt: ts, updatedAt: ts, date, name, order: count })
  return id
}

export async function renameMeal(id: string, name: string): Promise<void> {
  await db.meals.update(id, { name: name.trim() || 'Pasto', updatedAt: nowISO() })
}

/** Elimina il pasto e le sue righe. Restituisce cosa serve per annullare. */
export async function deleteMeal(id: string): Promise<{ meal: Meal; logs: FoodLog[] } | null> {
  const meal = await db.meals.get(id)
  if (!meal) return null
  const logs = await db.foodLogs.where('mealId').equals(id).toArray()
  await db.foodLogs.bulkDelete(logs.map((l) => l.id))
  await db.meals.delete(id)
  return { meal, logs }
}

export async function moveMeal(id: string, dir: -1 | 1): Promise<void> {
  const meal = await db.meals.get(id)
  if (!meal) return
  const all = (await mealsOfDate(meal.date)).sort((a, b) => a.order - b.order)
  const i = all.findIndex((m) => m.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  await db.meals.update(all[i].id, { order: j, updatedAt: nowISO() })
  await db.meals.update(all[j].id, { order: i, updatedAt: nowISO() })
}

/** Riscrive l'ordine dei pasti del giorno: serve al trascinamento della card. */
export async function reorderMeals(orderedIds: string[]): Promise<void> {
  const ts = nowISO()
  for (let i = 0; i < orderedIds.length; i++) {
    await db.meals.update(orderedIds[i], { order: i, updatedAt: ts })
  }
}

/** Duplica un pasto con tutto il contenuto (stesso giorno o su un'altra data). */
export async function duplicateMeal(id: string, toDate?: string): Promise<string | null> {
  const meal = await db.meals.get(id)
  if (!meal) return null
  const date = toDate ?? meal.date
  const logs = (await db.foodLogs.where('mealId').equals(id).toArray()).sort((a, b) => a.order - b.order)
  const newMealId = await addMeal(date, toDate ? meal.name : `${meal.name} (copia)`)
  const ts = nowISO()
  await db.foodLogs.bulkAdd(logs.map((l, i) => ({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    date, mealId: newMealId, foodId: l.foodId, grams: l.grams, order: i,
  })))
  return newMealId
}

/** Incolla il contenuto di un pasto dentro un altro (in coda). */
export async function pasteIntoMeal(sourceMealId: string, targetMealId: string): Promise<string[]> {
  const target = await db.meals.get(targetMealId)
  if (!target) return []
  const logs = (await db.foodLogs.where('mealId').equals(sourceMealId).toArray()).sort((a, b) => a.order - b.order)
  const base = await db.foodLogs.where('mealId').equals(targetMealId).count()
  const ts = nowISO()
  const rows: FoodLog[] = logs.map((l, i) => ({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    date: target.date, mealId: targetMealId, foodId: l.foodId, grams: l.grams, order: base + i,
  }))
  await db.foodLogs.bulkAdd(rows)
  return rows.map((r) => r.id)
}

// --- Diario -----------------------------------------------------------------

export function logsOfDate(date: string) {
  return db.foodLogs.where('date').equals(date).filter((l) => l.userId === U).toArray()
}

export async function addFoodLog(date: string, mealId: string, foodId: string, grams: number): Promise<string> {
  const ts = nowISO()
  const order = await db.foodLogs.where('mealId').equals(mealId).count()
  const log: FoodLog = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, mealId, foodId, grams, order }
  await db.foodLogs.add(log)
  await db.foods.update(foodId, { lastUsedAt: ts }) // alimenta i "Recenti"
  return log.id
}

export async function updateFoodLog(id: string, patch: { grams?: number; mealId?: string }): Promise<void> {
  await db.foodLogs.update(id, { ...patch, updatedAt: nowISO() })
}

/** Elimina righe e restituisce i record originali, per poter annullare. */
export async function deleteFoodLogs(ids: string[]): Promise<FoodLog[]> {
  const rows = (await db.foodLogs.bulkGet(ids)).filter(Boolean) as FoodLog[]
  await db.foodLogs.bulkDelete(ids)
  return rows
}

export async function restoreFoodLogs(rows: FoodLog[]): Promise<void> {
  if (rows.length) await db.foodLogs.bulkAdd(rows)
}

/** Sposta righe in un altro pasto (in coda). */
export async function moveLogsToMeal(ids: string[], mealId: string): Promise<void> {
  const target = await db.meals.get(mealId)
  if (!target) return
  let order = await db.foodLogs.where('mealId').equals(mealId).count()
  for (const id of ids) {
    await db.foodLogs.update(id, { mealId, date: target.date, order: order++, updatedAt: nowISO() })
  }
}

/** Riordina le righe dentro un pasto secondo la sequenza di id passata. */
export async function reorderLogs(mealId: string, orderedIds: string[]): Promise<void> {
  const ts = nowISO()
  for (let i = 0; i < orderedIds.length; i++) {
    await db.foodLogs.update(orderedIds[i], { order: i, mealId, updatedAt: ts })
  }
}

/** Macro di una quantità: i valori sono per 100 g. */
export function macrosFor(per100: Macros, grams: number): Macros {
  const k = grams / 100
  const r = (n: number | undefined) => (n == null ? undefined : Math.round(n * k * 10) / 10)
  return {
    kcal: Math.round(per100.kcal * k),
    protein: Math.round(per100.protein * k * 10) / 10,
    carbs: Math.round(per100.carbs * k * 10) / 10,
    fat: Math.round(per100.fat * k * 10) / 10,
    ...(per100.fiber != null ? { fiber: r(per100.fiber)! } : {}),
    ...(per100.sugar != null ? { sugar: r(per100.sugar)! } : {}),
    ...(per100.salt != null ? { salt: r(per100.salt)! } : {}),
  }
}

export interface DiaryEntry { log: FoodLog; food: Food; macros: Macros }
export interface DiaryMeal { meal: Meal; entries: DiaryEntry[]; totals: Macros }
export interface DiaryDay { meals: DiaryMeal[]; totals: Macros }

const ZERO = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: Math.round((a.protein + b.protein) * 10) / 10,
    carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
    fat: Math.round((a.fat + b.fat) * 10) / 10,
  }
}

/**
 * Il diario di un giorno: pasti in ordine, con totali per pasto e del giorno.
 * SOLO LETTURA: la creazione dei pasti di default sta in `ensureMeals`, chiamata
 * dalla schermata. Scrivere qui dentro romperebbe la query reattiva di Dexie.
 */
export async function computeDiary(date: string): Promise<DiaryDay> {
  const meals = await mealsOfDate(date)
  const logs = (await logsOfDate(date)).sort((a, b) => a.order - b.order)
  const foods = new Map((await listFoods()).map((f) => [f.id, f]))

  let totals = ZERO()
  const out: DiaryMeal[] = meals.sort((a, b) => a.order - b.order).map((meal) => {
    const entries: DiaryEntry[] = []
    let mt = ZERO()
    for (const log of logs.filter((l) => l.mealId === meal.id)) {
      const food = foods.get(log.foodId)
      if (!food) continue // alimento eliminato: la riga sparisce
      const macros = macrosFor(food.per100, log.grams)
      entries.push({ log, food, macros })
      mt = add(mt, macros)
    }
    totals = add(totals, mt)
    return { meal, entries, totals: mt }
  })
  return { meals: out, totals }
}

/** Giorni con almeno una riga registrata, per i pallini del calendario. */
export async function loggedDates(from: string, to: string): Promise<Set<string>> {
  const rows = await db.foodLogs.where('date').between(from, to, true, true).filter((l) => l.userId === U).toArray()
  return new Set(rows.map((r) => r.date))
}

// --- Tipi giornata e obiettivi ----------------------------------------------

export function listDayTypes() {
  return db.dayTypes.where('userId').equals(U).sortBy('order')
}

export async function addDayType(name: string, targets: DayType['targets']): Promise<string> {
  const ts = nowISO()
  const existing = await listDayTypes()
  const id = newId()
  await db.dayTypes.add({
    id, userId: U, createdAt: ts, updatedAt: ts,
    key: name.trim().toLowerCase().replace(/\s+/g, '-'),
    name: name.trim(), targets, order: existing.length, manual: true,
  })
  return id
}

export async function updateDayType(id: string, patch: Partial<Pick<DayType, 'name' | 'targets' | 'manual'>>): Promise<void> {
  await db.dayTypes.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteDayType(id: string): Promise<Trash> {
  const d = await db.dayTypes.get(id)
  if (d?.builtin) return [] // i tre di partenza si modificano, non si eliminano
  return snapshotAndDelete('dayTypes', id)
}

// --- Pasti salvati (modelli riutilizzabili) ---------------------------------

export function listSavedMeals() {
  return db.savedMeals.where('userId').equals(U).toArray()
}

export async function saveMealAsTemplate(mealId: string, name: string): Promise<void> {
  const logs = (await db.foodLogs.where('mealId').equals(mealId).toArray()).sort((a, b) => a.order - b.order)
  const ts = nowISO()
  await db.savedMeals.add({
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    name: name.trim(), items: logs.map((l) => ({ foodId: l.foodId, grams: l.grams })),
  })
}

export async function deleteSavedMeal(id: string): Promise<Trash> {
  return snapshotAndDelete('savedMeals', id)
}

/** Aggiunge tutti gli alimenti di un modello dentro un pasto. */
export async function applySavedMeal(savedId: string, date: string, mealId: string): Promise<string[]> {
  const m = await db.savedMeals.get(savedId)
  if (!m) return []
  const ids: string[] = []
  for (const it of m.items) ids.push(await addFoodLog(date, mealId, it.foodId, it.grams))
  return ids
}

export type { SavedMeal }
export { today as todayDiet }

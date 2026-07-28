// Dieta: libreria alimenti, diario giornaliero, tipi giornata con obiettivi.
// Regola di fondo: i valori di QUALSIASI alimento sono modificabili e la correzione
// dell'utente (`edited`) non viene mai sovrascritta da una fonte esterna.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import type { DayType, Food, FoodLog, Macros, MealKey, SavedMeal } from './schema'

const U = LOCAL_USER_ID
const today = (): string => new Date().toISOString().slice(0, 10)

export const MEALS: { key: MealKey; label: string }[] = [
  { key: 'colazione', label: 'Colazione' },
  { key: 'pranzo', label: 'Pranzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'spuntino', label: 'Spuntini' },
]

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

export async function deleteFood(id: string): Promise<void> {
  await db.foodLogs.where('foodId').equals(id).delete()
  await db.foods.delete(id)
}

// --- Diario -----------------------------------------------------------------

export function logsOfDate(date: string) {
  return db.foodLogs.where('date').equals(date).filter((l) => l.userId === U).toArray()
}

export async function addFoodLog(date: string, meal: MealKey, foodId: string, grams: number): Promise<string> {
  const ts = nowISO()
  const order = await db.foodLogs.where('date').equals(date).filter((l) => l.userId === U && l.meal === meal).count()
  const log: FoodLog = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, meal, foodId, grams, order }
  await db.foodLogs.add(log)
  await db.foods.update(foodId, { lastUsedAt: ts }) // alimenta i "Recenti"
  return log.id
}

export async function updateFoodLog(id: string, patch: { grams?: number; meal?: MealKey }): Promise<void> {
  await db.foodLogs.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteFoodLog(id: string): Promise<void> {
  await db.foodLogs.delete(id)
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
export interface DiaryDay {
  entries: DiaryEntry[]
  byMeal: Record<MealKey, DiaryEntry[]>
  totals: Macros
  mealTotals: Record<MealKey, Macros>
}

const ZERO = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: Math.round((a.protein + b.protein) * 10) / 10,
    carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
    fat: Math.round((a.fat + b.fat) * 10) / 10,
  }
}

/** Il diario di un giorno, già sommato per pasto e in totale. */
export async function computeDiary(date: string): Promise<DiaryDay> {
  const logs = (await logsOfDate(date)).sort((a, b) => a.order - b.order)
  const foods = new Map((await listFoods()).map((f) => [f.id, f]))
  const byMeal = { colazione: [], pranzo: [], cena: [], spuntino: [] } as Record<MealKey, DiaryEntry[]>
  const mealTotals = { colazione: ZERO(), pranzo: ZERO(), cena: ZERO(), spuntino: ZERO() } as Record<MealKey, Macros>
  const entries: DiaryEntry[] = []
  let totals = ZERO()

  for (const log of logs) {
    const food = foods.get(log.foodId)
    if (!food) continue // alimento eliminato: la riga sparisce
    const macros = macrosFor(food.per100, log.grams)
    const e = { log, food, macros }
    entries.push(e)
    byMeal[log.meal].push(e)
    mealTotals[log.meal] = add(mealTotals[log.meal], macros)
    totals = add(totals, macros)
  }
  return { entries, byMeal, totals, mealTotals }
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

export async function deleteDayType(id: string): Promise<void> {
  const d = await db.dayTypes.get(id)
  if (d?.builtin) return // i tre di partenza si modificano, non si eliminano
  await db.dayTypes.delete(id)
}

// --- Pasti salvati ----------------------------------------------------------

export function listSavedMeals() {
  return db.savedMeals.where('userId').equals(U).toArray()
}

export async function addSavedMeal(name: string, items: SavedMeal['items']): Promise<void> {
  const ts = nowISO()
  await db.savedMeals.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: name.trim(), items })
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await db.savedMeals.delete(id)
}

/** Aggiunge tutti gli alimenti di un pasto salvato in un colpo solo. */
export async function applySavedMeal(mealId: string, date: string, meal: MealKey): Promise<void> {
  const m = await db.savedMeals.get(mealId)
  if (!m) return
  for (const it of m.items) await addFoodLog(date, meal, it.foodId, it.grams)
}

export { today as todayDiet }

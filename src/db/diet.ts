// Dieta: libreria alimenti, pasti, diario giornaliero, tipi giornata con obiettivi.
// Regola di fondo: i valori di QUALSIASI alimento sono modificabili e la correzione
// dell'utente (`edited`) non viene mai sovrascritta da una fonte esterna.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { todayLocal } from '../util/date'
import { snapshotAndDelete, type Trash } from './trash'
import type { DayTemplateMeal, DayType, Food, FoodLog, Macros, Meal } from './schema'

const U = LOCAL_USER_ID
const today = (): string => todayLocal()

/** Pasti creati per una giornata nuova. Da qui in poi li gestisci tu. */
const DEFAULT_MEALS = ['Colazione', 'Pranzo', 'Cena', 'Spuntini']

// --- Alimenti ---------------------------------------------------------------

export function listFoods() {
  return db.foods.where('userId').equals(U).toArray()
}

/**
 * Ordine alfabetico, con i preferiti in cima: un elenco che si sfoglia deve
 * stare dove te lo aspetti. Per ritrovare in fretta c e la ricerca, che e piu
 * veloce di qualsiasi lista di recenti.
 */
export async function listFoodsRanked(): Promise<Food[]> {
  const all = await listFoods()
  const perNome = (a: Food, b: Food) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
  return all.sort((a, b) => {
    if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1
    return perNome(a, b)
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

/**
 * Chiamate in volo per data. Due schermate che aprono lo stesso giorno nello stesso
 * istante devono creare i pasti UNA volta: senza questo, la seconda leggeva ancora
 * "nessun pasto" e ne creava altri quattro, con il diario sdoppiato.
 */
const mealsInFlight = new Map<string, Promise<Meal[]>>()

/** Pasti del giorno, creandoli alla prima apertura di una data mai usata. */
export function ensureMeals(date: string): Promise<Meal[]> {
  const running = mealsInFlight.get(date)
  if (running) return running

  const run = db.transaction('rw', db.meals, async () => {
    const existing = (await mealsOfDate(date)).sort((a, b) => a.order - b.order)
    if (existing.length) return existing
    const ts = nowISO()
    const rows: Meal[] = DEFAULT_MEALS.map((name, i) => ({
      id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, name, order: i,
    }))
    await db.meals.bulkAdd(rows)
    return rows
  }).finally(() => { mealsInFlight.delete(date) })

  mealsInFlight.set(date, run)
  return run
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
    ...copyOf(l), id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    date, mealId: newMealId, order: i,
  })))
  return newMealId
}

/**
 * Parte copiabile di una riga: quantità e provenienza, niente identità né posizione.
 * Passa da qui anche la riga-ricetta, che senza i suoi campi diventerebbe una riga vuota.
 */
function copyOf(l: FoodLog) {
  return {
    foodId: l.foodId, grams: l.grams,
    ...(l.recipeId ? {
      recipeId: l.recipeId, nameSnapshot: l.nameSnapshot, macrosSnapshot: l.macrosSnapshot,
      ...(l.portions != null ? { portions: l.portions } : {}),
    } : {}),
  }
}

/** Incolla il contenuto di un pasto dentro un altro (in coda). */
export async function pasteIntoMeal(sourceMealId: string, targetMealId: string): Promise<string[]> {
  const target = await db.meals.get(targetMealId)
  if (!target) return []
  const logs = (await db.foodLogs.where('mealId').equals(sourceMealId).toArray()).sort((a, b) => a.order - b.order)
  const base = await db.foodLogs.where('mealId').equals(targetMealId).count()
  const ts = nowISO()
  const rows: FoodLog[] = logs.map((l, i) => ({
    ...copyOf(l), id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    date: target.date, mealId: targetMealId, order: base + i,
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

/**
 * Duplica le righe scelte dentro il loro stesso pasto. Torna gli id creati,
 * cosi l annulla puo toglierli senza toccare gli originali.
 */
export async function duplicateLogs(ids: string[]): Promise<string[]> {
  const righe = (await db.foodLogs.bulkGet(ids)).filter((l): l is FoodLog => !!l)
  const ts = nowISO()
  const creati: FoodLog[] = []
  for (const l of righe) {
    const coda = await db.foodLogs.where('mealId').equals(l.mealId).count()
    creati.push({ ...copyOf(l), id: newId(), userId: U, createdAt: ts, updatedAt: ts, date: l.date, mealId: l.mealId, order: coda })
  }
  if (creati.length) await db.foodLogs.bulkAdd(creati)
  return creati.map((r) => r.id)
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
    ...(per100.satFat != null ? { satFat: r(per100.satFat)! } : {}),
    ...(per100.monoFat != null ? { monoFat: r(per100.monoFat)! } : {}),
    ...(per100.polyFat != null ? { polyFat: r(per100.polyFat)! } : {}),
    ...(per100.transFat != null ? { transFat: r(per100.transFat)! } : {}),
    ...(per100.fiber != null ? { fiber: r(per100.fiber)! } : {}),
    ...(per100.sugar != null ? { sugar: r(per100.sugar)! } : {}),
    ...(per100.salt != null ? { salt: r(per100.salt)! } : {}),
    ...(per100.sodium != null ? { sodium: r(per100.sodium)! } : {}),
    ...(per100.cholesterol != null ? { cholesterol: r(per100.cholesterol)! } : {}),
    ...(per100.potassium != null ? { potassium: r(per100.potassium)! } : {}),
    ...(per100.calcium != null ? { calcium: r(per100.calcium)! } : {}),
    ...(per100.iron != null ? { iron: r(per100.iron)! } : {}),
    ...(per100.vitA != null ? { vitA: r(per100.vitA)! } : {}),
    ...(per100.vitC != null ? { vitC: r(per100.vitC)! } : {}),
    ...(per100.vitD != null ? { vitD: r(per100.vitD)! } : {}),
  }
}

/**
 * Una riga del diario pronta da mostrare. `food` c'è sempre, anche per le righe-ricetta:
 * lì è un alimento finto costruito dallo snapshot, così tutto ciò che disegna una riga
 * continua a funzionare senza sapere niente delle ricette.
 */
export interface DiaryEntry { log: FoodLog; food: Food; macros: Macros }

/**
 * Alimento finto per una riga-ricetta. Non finisce mai nel database: serve solo
 * a dare una forma nota a chi disegna. L'id `recipe:<id>` è riconoscibile a colpo
 * d'occhio se compare per sbaglio da qualche parte.
 */
function recipeAsFood(log: FoodLog): Food {
  const m = log.macrosSnapshot ?? ZERO()
  // per100 sensato solo per le ricette pesate; per quelle a porzioni non vuol dire nulla.
  const k = log.grams > 0 ? 100 / log.grams : 0
  return {
    id: `recipe:${log.recipeId}`, userId: log.userId,
    createdAt: log.createdAt, updatedAt: log.updatedAt,
    name: log.nameSnapshot ?? 'Ricetta',
    per100: {
      kcal: Math.round(m.kcal * k), protein: Math.round(m.protein * k * 10) / 10,
      carbs: Math.round(m.carbs * k * 10) / 10, fat: Math.round(m.fat * k * 10) / 10,
    },
    source: 'mine',
  }
}
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
      // Riga-ricetta: i macro sono quelli congelati all'inserimento, non si ricalcolano.
      // Resta leggibile anche se la ricetta nel frattempo è stata eliminata.
      if (log.recipeId) {
        const macros = log.macrosSnapshot ?? ZERO()
        entries.push({ log, food: recipeAsFood(log), macros })
        mt = add(mt, macros)
        continue
      }
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

// --- Pasti salvati ----------------------------------------------------------
// Assorbiti dalle ricette nella v11: un pasto salvato è una ricetta a 1 porzione
// senza procedimento. Vedi `saveMealAsRecipe` in db/recipes.ts.

export { today as todayDiet }

// --- Giornate tipo -----------------------------------------------------------

export function listDayTemplates() {
  return db.dayTemplates.where('userId').equals(U).toArray()
    .then((r) => r.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name, 'it')))
}

/** Fotografa una giornata intera - pasti, ordine e righe - e la salva come modello. */
export async function saveDayAsTemplate(date: string, name: string): Promise<string | null> {
  const pasti = (await mealsOfDate(date)).sort((a, b) => a.order - b.order)
  if (!pasti.length) return null
  const logs = await db.foodLogs.where('date').equals(date).filter((l) => l.userId === U).toArray()
  const ts = nowISO()
  const meals: DayTemplateMeal[] = pasti.map((m) => ({
    name: m.name,
    order: m.order,
    items: logs.filter((l) => l.mealId === m.id).sort((a, b) => a.order - b.order).map((l) => ({
      foodId: l.foodId, grams: l.grams,
      ...(l.recipeId ? { recipeId: l.recipeId, nameSnapshot: l.nameSnapshot, macrosSnapshot: l.macrosSnapshot } : {}),
      ...(l.portions != null ? { portions: l.portions } : {}),
    })),
  }))
  const id = newId()
  await db.dayTemplates.add({ id, userId: U, createdAt: ts, updatedAt: ts, name: name.trim() || 'Giornata', meals })
  return id
}

export async function renameDayTemplate(id: string, name: string): Promise<void> {
  await db.dayTemplates.update(id, { name: name.trim() || 'Giornata', updatedAt: nowISO() })
}

export async function deleteDayTemplate(id: string): Promise<Trash> {
  return snapshotAndDelete('dayTemplates', id)
}

/**
 * Riempie una giornata con un modello. sostituisci cancella quello che c'era:
 * senza, il modello si aggiunge in coda ai pasti esistenti.
 *
 * Restituisce cosa serve per annullare: le righe create e quelle cancellate.
 */
export async function applyDayTemplate(
  templateId: string, date: string, sostituisci: boolean,
): Promise<{ creati: string[]; rimossi: FoodLog[]; pastiRimossi: Meal[] }> {
  const t = await db.dayTemplates.get(templateId)
  if (!t) return { creati: [], rimossi: [], pastiRimossi: [] }
  const ts = nowISO()

  const rimossi: FoodLog[] = []
  const pastiRimossi: Meal[] = []
  if (sostituisci) {
    const vecchiLog = await db.foodLogs.where('date').equals(date).filter((l) => l.userId === U).toArray()
    const vecchiPasti = await mealsOfDate(date)
    rimossi.push(...vecchiLog)
    pastiRimossi.push(...vecchiPasti)
    await db.foodLogs.bulkDelete(vecchiLog.map((l) => l.id))
    await db.meals.bulkDelete(vecchiPasti.map((m) => m.id))
  }

  const base = sostituisci ? 0 : (await mealsOfDate(date)).length
  const creati: string[] = []
  for (const m of [...t.meals].sort((a, b) => a.order - b.order)) {
    const mealId = newId()
    await db.meals.add({ id: mealId, userId: U, createdAt: ts, updatedAt: ts, date, name: m.name, order: base + m.order })
    const righe: FoodLog[] = m.items.map((it, i) => ({
      id: newId(), userId: U, createdAt: ts, updatedAt: ts,
      date, mealId, foodId: it.foodId, grams: it.grams, order: i,
      ...(it.recipeId ? { recipeId: it.recipeId, nameSnapshot: it.nameSnapshot, macrosSnapshot: it.macrosSnapshot } : {}),
      ...(it.portions != null ? { portions: it.portions } : {}),
    }))
    if (righe.length) await db.foodLogs.bulkAdd(righe)
    creati.push(...righe.map((r) => r.id))
  }

  await db.dayTemplates.update(templateId, { lastUsedAt: ts })
  return { creati, rimossi, pastiRimossi }
}

/** Copia una giornata su un'altra data, senza passare da un modello salvato. */
export async function copyDayTo(from: string, to: string, sostituisci: boolean): Promise<{ creati: string[]; rimossi: FoodLog[]; pastiRimossi: Meal[] }> {
  const pasti = (await mealsOfDate(from)).sort((a, b) => a.order - b.order)
  const logs = await db.foodLogs.where('date').equals(from).filter((l) => l.userId === U).toArray()
  const ts = nowISO()

  const rimossi: FoodLog[] = []
  const pastiRimossi: Meal[] = []
  if (sostituisci) {
    const vecchiLog = await db.foodLogs.where('date').equals(to).filter((l) => l.userId === U).toArray()
    const vecchiPasti = await mealsOfDate(to)
    rimossi.push(...vecchiLog)
    pastiRimossi.push(...vecchiPasti)
    await db.foodLogs.bulkDelete(vecchiLog.map((l) => l.id))
    await db.meals.bulkDelete(vecchiPasti.map((m) => m.id))
  }

  const base = sostituisci ? 0 : (await mealsOfDate(to)).length
  const creati: string[] = []
  for (const m of pasti) {
    const mealId = newId()
    await db.meals.add({ id: mealId, userId: U, createdAt: ts, updatedAt: ts, date: to, name: m.name, order: base + m.order })
    const righe: FoodLog[] = logs.filter((l) => l.mealId === m.id).sort((a, b) => a.order - b.order).map((l, i) => ({
      ...copyOf(l), id: newId(), userId: U, createdAt: ts, updatedAt: ts, date: to, mealId, order: i,
    }))
    if (righe.length) await db.foodLogs.bulkAdd(righe)
    creati.push(...righe.map((r) => r.id))
  }
  return { creati, rimossi, pastiRimossi }
}

/** Rimette una giornata com'era prima di applicare un modello. */
export async function undoDayApply(x: { creati: string[]; rimossi: FoodLog[]; pastiRimossi: Meal[] }, date: string): Promise<void> {
  await db.foodLogs.bulkDelete(x.creati)
  if (x.pastiRimossi.length) {
    const nuovi = await mealsOfDate(date)
    await db.meals.bulkDelete(nuovi.map((m) => m.id))
    await db.meals.bulkAdd(x.pastiRimossi)
  }
  if (x.rimossi.length) await db.foodLogs.bulkAdd(x.rimossi)
}


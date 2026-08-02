// Ricette: ingredienti raggruppati, procedimento, scalatura e aggiunta al diario.
//
// Due regole di fondo:
// - Gli ingredienti puntano a `foods.id`. Correggi un alimento in libreria e TUTTE
//   le ricette che lo usano si ricalcolano da sole: nessun valore duplicato.
// - Nel diario la ricetta entra come UNA riga con i macro CONGELATI. Se domani
//   cambi la dose di whey, il diario di ieri resta quello che hai mangiato ieri.
import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { snapshotAndDelete, type Trash } from './trash'
import type { Food, FoodLog, Macros, Recipe, RecipeGroup } from './schema'

const U = LOCAL_USER_ID

// --- Macro ------------------------------------------------------------------

const ZERO = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
const r1 = (n: number) => Math.round(n * 10) / 10

function plus(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }
}

/** Arrotondamento finale, uguale a quello del diario: kcal intere, macro a un decimale. */
export function roundMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) }
}

export function scaleMacros(m: Macros, k: number): Macros {
  return roundMacros({ kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k })
}

/** Tutto quello che serve per mostrare una ricetta, calcolato una volta sola. */
export interface RecipeCalc {
  /** macro della dose intera scritta nella ricetta (somma degli ingredienti, non arrotondata per strada) */
  totals: Macros
  /** peso degli ingredienti crudi: è il punto di partenza per proporre la resa */
  rawG: number
  /** macro di una porzione — solo mode 'servings' */
  perServing: Macros | null
  /** macro di 100 g di piatto finito — solo mode 'grams' con resa impostata */
  per100: Macros | null
  /** ingredienti il cui alimento non esiste più in libreria */
  missing: number
}

/**
 * Somma la ricetta a partire dalla libreria alimenti.
 * Gli ingredienti orfani (alimento eliminato) vengono saltati e contati:
 * la ricetta resta leggibile e dice quanto le manca, invece di mentire sui totali.
 */
export function computeRecipe(recipe: Recipe, foodsById: Map<string, Food>): RecipeCalc {
  let totals = ZERO()
  let rawG = 0
  let missing = 0
  for (const g of recipe.groups ?? []) {
    for (const it of g.items ?? []) {
      const f = foodsById.get(it.foodId)
      if (!f) { missing++; continue }
      const k = (Number(it.grams) || 0) / 100
      totals = plus(totals, {
        kcal: f.per100.kcal * k, protein: f.per100.protein * k,
        carbs: f.per100.carbs * k, fat: f.per100.fat * k,
      })
      rawG += Number(it.grams) || 0
    }
  }
  const servings = Math.max(1, Number(recipe.servings) || 1)
  const yieldG = Number(recipe.yieldG) || 0
  return {
    totals: roundMacros(totals),
    rawG: r1(rawG),
    perServing: recipe.mode === 'servings' ? scaleMacros(totals, 1 / servings) : null,
    per100: recipe.mode === 'grams' && yieldG > 0 ? scaleMacros(totals, 100 / yieldG) : null,
    missing,
  }
}

/**
 * Quanto moltiplicare le quantità scritte per ottenere quelle da pesare.
 * Solo le ricette a porzioni si riscalano: quelle a grammi hanno una dose sola,
 * e a cambiare è il quanto ne mangi, non il quanto ne fai.
 */
export function scaleFactor(recipe: Recipe, wantedServings: number): number {
  if (recipe.mode !== 'servings') return 1
  const base = Math.max(1, Number(recipe.servings) || 1)
  const want = Math.max(1, Number(wantedServings) || base)
  return want / base
}

// --- Lettura ----------------------------------------------------------------

export function listRecipes() {
  return db.recipes.where('userId').equals(U).toArray()
}

/** Preferite in cima, poi le usate di recente: è l'ordine in cui le cerchi davvero. */
export async function listRecipesRanked(): Promise<Recipe[]> {
  const all = await listRecipes()
  return all.sort((a, b) => {
    if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1
    const t = (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '')
    return t !== 0 ? t : a.name.localeCompare(b.name)
  })
}

export function getRecipe(id: string) {
  return db.recipes.get(id)
}

/** Tutti i tag usati, per i filtri della lista. */
export async function listRecipeTags(): Promise<string[]> {
  const all = await listRecipes()
  const s = new Set<string>()
  for (const r of all) for (const t of r.tags ?? []) s.add(t)
  return [...s].sort((a, b) => a.localeCompare(b))
}

// --- Scrittura --------------------------------------------------------------

export type RecipeDraft = Pick<Recipe, 'name' | 'mode' | 'groups' | 'steps'> &
  Partial<Pick<Recipe, 'servings' | 'yieldG' | 'note' | 'timeMin' | 'tags' | 'favorite' | 'photo'>>

export async function addRecipe(inp: RecipeDraft): Promise<string> {
  const ts = nowISO()
  const id = newId()
  await db.recipes.add({ ...normalize(inp), id, userId: U, createdAt: ts, updatedAt: ts })
  return id
}

/**
 * Riscrive la ricetta per intero (put, non update): passando da porzioni a grammi
 * il campo che non serve più deve sparire davvero, non restare lì a confondere.
 */
export async function updateRecipe(id: string, patch: Partial<RecipeDraft>): Promise<void> {
  const cur = await db.recipes.get(id)
  if (!cur) return
  const draft = normalize({ ...cur, ...patch } as RecipeDraft)
  await db.recipes.put({
    id, userId: cur.userId, createdAt: cur.createdAt, updatedAt: nowISO(),
    ...(cur.lastUsedAt ? { lastUsedAt: cur.lastUsedAt } : {}),
    ...(cur.favorite ? { favorite: true } : {}),
    ...draft,
  } as Recipe)
}

export async function toggleRecipeFavorite(id: string): Promise<void> {
  const r = await db.recipes.get(id)
  if (!r) return
  await db.recipes.update(id, { favorite: !r.favorite, updatedAt: nowISO() })
}

/**
 * Elimina la ricetta. Le righe di diario NON vengono toccate: portano già dentro
 * nome e macro di quel giorno, quindi lo storico resta intatto e leggibile.
 */
export async function deleteRecipe(id: string): Promise<Trash> {
  return snapshotAndDelete('recipes', id)
}

export async function duplicateRecipe(id: string): Promise<string | null> {
  const r = await db.recipes.get(id)
  if (!r) return null
  return addRecipe({
    name: `${r.name} (copia)`, mode: r.mode, servings: r.servings, yieldG: r.yieldG,
    groups: JSON.parse(JSON.stringify(r.groups)), steps: [...r.steps],
    note: r.note, timeMin: r.timeMin, tags: r.tags ? [...r.tags] : undefined, photo: r.photo,
  })
}

/** Ripulisce la bozza: numeri validi, niente sezioni vuote, campi coerenti col modo. */
function normalize(inp: RecipeDraft): RecipeDraft {
  const mode = inp.mode === 'grams' ? 'grams' : 'servings'
  const groups: RecipeGroup[] = (inp.groups ?? [])
    .map((g) => ({
      name: (g.name ?? '').trim() || 'Ingredienti',
      // Un pizzico o un «qb» non ha grammi: si azzerano, così non entra nei totali
      // e non finisce nel diario quando la ricetta viene esplosa in ingredienti.
      items: (g.items ?? []).filter((it) => it.foodId).map((it) => (
        it.qta === 'pizzico' || it.qta === 'qb'
          ? { foodId: it.foodId, grams: 0, qta: it.qta }
          : { foodId: it.foodId, grams: Math.max(0, Number(it.grams) || 0) })),
    }))
  return {
    name: (inp.name ?? '').trim() || 'Ricetta',
    mode,
    groups: groups.length ? groups : [{ name: 'Ingredienti', items: [] }],
    steps: (inp.steps ?? []).map((s) => s.trim()).filter(Boolean),
    // I due campi si escludono: tenere quello inutile in giro confonde alla riapertura.
    ...(mode === 'servings' ? { servings: Math.max(1, Math.round(Number(inp.servings) || 1)) } : {}),
    ...(mode === 'grams' && Number(inp.yieldG) > 0 ? { yieldG: Math.round(Number(inp.yieldG)) } : {}),
    ...(inp.photo ? { photo: inp.photo } : {}),
    ...(inp.note?.trim() ? { note: inp.note.trim() } : {}),
    ...(Number(inp.timeMin) > 0 ? { timeMin: Math.round(Number(inp.timeMin)) } : {}),
    ...(inp.tags?.length ? { tags: [...new Set(inp.tags.map((t) => t.trim()).filter(Boolean))] } : {}),
    ...(inp.favorite ? { favorite: true } : {}),
  }
}

// --- Dal diario alle ricette e viceversa ------------------------------------

/**
 * Quanto di una ricetta stai aggiungendo: porzioni oppure grammi di piatto,
 * secondo il modo della ricetta. Un solo tipo, così la chiamata non può sbagliarsi.
 */
export type RecipeAmount = { portions: number } | { grams: number }

/** Macro di quella quantità, a partire dai totali della dose intera. */
export function macrosForAmount(recipe: Recipe, calc: RecipeCalc, amount: RecipeAmount): Macros {
  if ('portions' in amount) {
    const base = Math.max(1, Number(recipe.servings) || 1)
    return scaleMacros(calc.totals, (Number(amount.portions) || 0) / base)
  }
  const y = Number(recipe.yieldG) || 0
  if (y <= 0) return ZERO()
  return scaleMacros(calc.totals, (Number(amount.grams) || 0) / y)
}

/**
 * Scrive la ricetta nel diario come una riga sola.
 * I macro vengono congelati qui dentro: è la differenza fra un diario e una stima.
 */
export async function addRecipeToDiary(
  recipeId: string, date: string, mealId: string, amount: RecipeAmount,
): Promise<string | null> {
  const recipe = await db.recipes.get(recipeId)
  if (!recipe) return null
  const foods = new Map((await db.foods.where('userId').equals(U).toArray()).map((f) => [f.id, f]))
  const calc = computeRecipe(recipe, foods)
  const macros = macrosForAmount(recipe, calc, amount)

  const ts = nowISO()
  const order = await db.foodLogs.where('mealId').equals(mealId).count()
  const log: FoodLog = {
    id: newId(), userId: U, createdAt: ts, updatedAt: ts,
    date, mealId, foodId: '', order,
    grams: 'grams' in amount ? Math.max(0, Number(amount.grams) || 0) : 0,
    recipeId, macrosSnapshot: macros, nameSnapshot: recipe.name,
    ...('portions' in amount ? { portions: Number(amount.portions) || 0 } : {}),
  }
  await db.foodLogs.add(log)
  await db.recipes.update(recipeId, { lastUsedAt: ts })
  return log.id
}

/** Cambia la quantità di una riga-ricetta già nel diario, ricalcolando i macro. */
export async function updateRecipeLog(logId: string, amount: RecipeAmount): Promise<void> {
  const log = await db.foodLogs.get(logId)
  if (!log?.recipeId) return
  const recipe = await db.recipes.get(log.recipeId)
  if (!recipe) return
  const foods = new Map((await db.foods.where('userId').equals(U).toArray()).map((f) => [f.id, f]))
  const macros = macrosForAmount(recipe, computeRecipe(recipe, foods), amount)
  await db.foodLogs.update(logId, {
    grams: 'grams' in amount ? Math.max(0, Number(amount.grams) || 0) : 0,
    // `portions` si scrive solo dove ha senso: la chiave assente vale "non pertinente".
    ...('portions' in amount ? { portions: Number(amount.portions) || 0 } : {}),
    macrosSnapshot: macros, updatedAt: nowISO(),
  })
}

/**
 * Scioglie una riga-ricetta nei suoi ingredienti scalati.
 * Serve quando quella sera hai messo mezzo cucchiaio di olio in più: da riga unica
 * non lo correggi, da righe normali sì. Restituisce gli id creati per l'annulla.
 */
export async function explodeRecipeLog(logId: string): Promise<{ created: string[]; removed: FoodLog } | null> {
  const log = await db.foodLogs.get(logId)
  if (!log?.recipeId) return null
  const recipe = await db.recipes.get(log.recipeId)
  if (!recipe) return null

  // Quanta parte della dose intera è finita nel piatto.
  const k = log.portions != null
    ? log.portions / Math.max(1, Number(recipe.servings) || 1)
    : (Number(recipe.yieldG) || 0) > 0 ? log.grams / Number(recipe.yieldG) : 0
  if (!(k > 0)) return null

  const ts = nowISO()
  let order = log.order
  const rows: FoodLog[] = []
  for (const g of recipe.groups ?? []) {
    for (const it of g.items ?? []) {
      const grams = r1((Number(it.grams) || 0) * k)
      if (grams <= 0) continue
      rows.push({
        id: newId(), userId: U, createdAt: ts, updatedAt: ts,
        date: log.date, mealId: log.mealId, foodId: it.foodId, grams, order: order++,
      })
    }
  }
  if (!rows.length) return null
  await db.foodLogs.bulkAdd(rows)
  await db.foodLogs.delete(logId)
  return { created: rows.map((r) => r.id), removed: log }
}

/**
 * Salva un pasto del diario come ricetta riutilizzabile.
 * È l'erede dei "pasti salvati": stessa comodità, ma dentro le ricette.
 * Le righe che sono già ricette vengono saltate (non si annida una ricetta in un'altra).
 */
export async function saveMealAsRecipe(mealId: string, name: string): Promise<string | null> {
  const logs = (await db.foodLogs.where('mealId').equals(mealId).toArray())
    .filter((l) => !l.recipeId && l.foodId)
    .sort((a, b) => a.order - b.order)
  if (!logs.length) return null
  return addRecipe({
    name, mode: 'servings', servings: 1, steps: [],
    groups: [{ name: 'Ingredienti', items: logs.map((l) => ({ foodId: l.foodId, grams: l.grams })) }],
  })
}

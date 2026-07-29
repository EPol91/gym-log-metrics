// Inizializzazione al primo avvio: utente locale, palestra default, catalogo esercizi.
import { db, newId, nowISO } from './db'
import { EXERCISE_CATALOG } from './catalog'
import { BASE_FOODS } from './baseFoods'
import { ensureRecipeSeed } from './recipeSeed'
import type { User, Gym, Exercise } from './schema'

/** Utente unico locale (single-user ora; è comunque un userId, multi-tenant-ready). */
export const LOCAL_USER_ID = 'local-user'

export async function ensureSeed(): Promise<User> {
  let user = await db.users.get(LOCAL_USER_ID)
  if (!user) {
    const ts = nowISO()
    user = {
      id: LOCAL_USER_ID, userId: LOCAL_USER_ID,
      createdAt: ts, updatedAt: ts,
      name: 'Emanuel', unit: 'kg', weeklyTarget: 4, locale: 'it',
    }
    await db.users.add(user)
  }

  const gymCount = await db.gyms.where('userId').equals(LOCAL_USER_ID).count()
  if (gymCount === 0) {
    const ts = nowISO()
    const gym: Gym = {
      id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts,
      name: 'Palestra', isDefault: true,
    }
    await db.gyms.add(gym)
  }

  const exCount = await db.exercises.where('userId').equals(LOCAL_USER_ID).count()
  if (exCount === 0) {
    const ts = nowISO()
    const rows: Exercise[] = EXERCISE_CATALOG.map((c) => ({
      id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts,
      name: c.name, muscle: c.muscle, isCustom: false, aliases: c.aliases,
    }))
    await db.exercises.bulkAdd(rows)
  }

  // Tipi giornata e alimenti base usano ID DETERMINISTICI: due avvii ravvicinati
  // (o due schede aperte) non possono duplicarli, e chi c'è già non viene toccato
  // — le correzioni dell'utente restano intatte.
  const ts2 = nowISO()
  const zero = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const builtinTypes = [
    { key: 'on', name: 'ON' }, { key: 'off', name: 'OFF' }, { key: 'reload', name: 'Reload' },
  ].map((t, i) => ({
    id: `daytype-${t.key}`, userId: LOCAL_USER_ID, createdAt: ts2, updatedAt: ts2,
    key: t.key, name: t.name, targets: { ...zero }, order: i, builtin: true,
  }))
  const existingTypes = new Set((await db.dayTypes.bulkGet(builtinTypes.map((t) => t.id))).filter(Boolean).map((t) => t!.id))
  const newTypes = builtinTypes.filter((t) => !existingTypes.has(t.id))
  if (newTypes.length) await db.dayTypes.bulkPut(newTypes)

  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')
  const baseRows = BASE_FOODS.map((f) => ({
    id: `base-${slug(f.name)}`, userId: LOCAL_USER_ID, createdAt: ts2, updatedAt: ts2,
    name: f.name, per100: f.per100, source: 'base' as const,
    ...(f.servingG ? { servingG: f.servingG, servingLabel: f.servingLabel } : {}),
  }))
  const existingFoods = new Set((await db.foods.bulkGet(baseRows.map((f) => f.id))).filter(Boolean).map((f) => f!.id))
  const newFoods = baseRows.filter((f) => !existingFoods.has(f.id))
  if (newFoods.length) await db.foods.bulkPut(newFoods)

  await dedupeSeeded()
  await ensureRecipeSeed()

  return user
}

/**
 * Ripara i duplicati creati dalle versioni precedenti (inizializzazione doppia).
 * Non elimina nulla di tuo: tra due copie tiene quella che hai corretto, e le righe
 * di diario che puntavano alla copia scartata vengono riagganciate a quella tenuta.
 */
async function dedupeSeeded(): Promise<void> {
  // --- Tipi giornata: uno per chiave (on/off/reload/…) ---
  const types = await db.dayTypes.where('userId').equals(LOCAL_USER_ID).toArray()
  const byKey = new Map<string, typeof types>()
  for (const t of types) {
    if (!byKey.has(t.key)) byKey.set(t.key, [])
    byKey.get(t.key)!.push(t)
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    // Tengo quello con obiettivi impostati, altrimenti quello con id stabile.
    const keep = group.find((t) => t.targets.kcal > 0) ?? group.find((t) => t.id.startsWith('daytype-')) ?? group[0]
    await db.dayTypes.bulkDelete(group.filter((t) => t.id !== keep.id).map((t) => t.id))
  }

  // --- Alimenti base: uno per nome ---
  const foods = await db.foods.where('userId').equals(LOCAL_USER_ID).filter((f) => f.source === 'base').toArray()
  const byName = new Map<string, typeof foods>()
  for (const f of foods) {
    const k = f.name.toLowerCase()
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(f)
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue
    const keep = group.find((f) => f.edited) ?? group.find((f) => f.id.startsWith('base-')) ?? group[0]
    const drop = group.filter((f) => f.id !== keep.id)
    for (const d of drop) {
      // Le righe di diario che usavano la copia scartata puntano ora a quella tenuta.
      const logs = await db.foodLogs.where('foodId').equals(d.id).toArray()
      for (const l of logs) await db.foodLogs.update(l.id, { foodId: keep.id })
    }
    await db.foods.bulkDelete(drop.map((f) => f.id))
  }
}

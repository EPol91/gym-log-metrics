// Inizializzazione al primo avvio: utente locale, palestra default, catalogo esercizi.
import { db, newId, nowISO } from './db'
import { EXERCISE_CATALOG } from './catalog'
import { BASE_FOODS } from './baseFoods'
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

  // Tipi giornata: i tre di partenza. Gli obiettivi restano a 0 finché non si
  // apre la Dieta, dove vengono proposti dai dati dell'utente (o scritti a mano).
  const dayTypeCount = await db.dayTypes.where('userId').equals(LOCAL_USER_ID).count()
  if (dayTypeCount === 0) {
    const ts = nowISO()
    const zero = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    await db.dayTypes.bulkAdd([
      { id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts, key: 'on', name: 'ON', targets: { ...zero }, order: 0, builtin: true },
      { id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts, key: 'off', name: 'OFF', targets: { ...zero }, order: 1, builtin: true },
      { id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts, key: 'reload', name: 'Reload', targets: { ...zero }, order: 2, builtin: true },
    ])
  }

  // Alimenti base: inclusi una volta sola, poi sono modificabili come gli altri.
  const foodCount = await db.foods.where('userId').equals(LOCAL_USER_ID).count()
  if (foodCount === 0) {
    const ts = nowISO()
    await db.foods.bulkAdd(BASE_FOODS.map((f) => ({
      id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts,
      name: f.name, per100: f.per100, source: 'base' as const,
      ...(f.servingG ? { servingG: f.servingG, servingLabel: f.servingLabel } : {}),
    })))
  }

  return user
}

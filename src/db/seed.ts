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

  return user
}

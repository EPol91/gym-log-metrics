// Inizializzazione al primo avvio: utente locale, palestra default, catalogo esercizi.
import { db, newId, nowISO } from './db'
import { EXERCISE_CATALOG } from './catalog'
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

  return user
}

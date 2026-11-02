// Nota del giorno e circonferenze: stanno sulla misura del giorno
// (bodyMeasurements), così finiscono nel backup senza niente di speciale.
//
// I tag sono una lista tua, nel profilo: la parti con quelli qui sotto e la
// cambi come vuoi. Ogni giorno salva il nome del tag, quindi rinominare vuol
// dire riscriverlo anche nei giorni passati; eliminare no, lo storico resta.

import { db, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { updateUser } from './repo'
import type { BodyMeasurement, TagNota, WhoopDay } from './schema'

const U = LOCAL_USER_ID

export const TAG_BASE = [
  'sushi/AYCE', 'ristorante', 'pasto libero', 'molto salato', 'piccante', 'alcol', 'serata',
  'intestino', 'malattia', 'viaggio', 'stress', 'seduta saltata',
]

// --- Tag automatici: si deducono dai dati, non si salvano ---------------------

/** Sotto le 6 ore di sonno (circa 4 cicli da 90'). */
export const POCO_SONNO = 'poco sonno'
const ORE_MIN = 6
/** I nomi dei tag automatici: dai tasti manuali spariscono. */
export const TAG_AUTO = [POCO_SONNO]

export interface TagAuto { t: string; dato: string }

const ore = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` }

/**
 * I tag automatici di un giorno. Il sonno WHOOP è segnato sul giorno del
 * risveglio: quello della pesata del mattino è la notte appena passata.
 */
export function tagAuto(w?: WhoopDay | null): TagAuto[] {
  const out: TagAuto[] = []
  const h = w?.sleepHours
  if (h != null && h > 0 && h < ORE_MIN) out.push({ t: POCO_SONNO, dato: ore(h) })
  return out
}

/** Quelli che valgono davvero quel giorno: gli automatici meno quelli che hai tolto. */
export const autoAttivi = (auto: TagAuto[], m?: BodyMeasurement | null) => auto.filter((a) => !m?.tagNo?.includes(a.t))

export function whoopDel(date: string) {
  return db.whoopDays.where('date').equals(date).filter((d) => d.userId === U).first()
}

/** Tutte le giornate WHOOP per data: lo storico ne ha bisogno riga per riga. */
export async function whoopPerData(): Promise<Map<string, WhoopDay>> {
  return new Map((await db.whoopDays.where('userId').equals(U).toArray()).map((d) => [d.date, d]))
}

/** Le circonferenze, in ordine di schermata, con dove si misura. */
export const CIRC = [
  { k: 'waist', nome: 'Vita ombelico', corto: 'Vita omb.', col: '#8e9be0',
    come: "Esattamente sull'ombelico, metro orizzontale. A fine espirazione." },
  { k: 'waistNarrow', nome: 'Vita stretta', corto: 'Vita str.', col: '#5bc27a',
    come: "Il punto più stretto del busto, tra l'ultima costola e l'ombelico (di solito 2-4 cm sopra). Pancia rilassata, non tirarla in dentro. Più bassa e più larga c'è la vita all'ombelico, che si gonfia di più." },
  { k: 'chest', nome: 'Petto', corto: 'Petto', col: '#d4af37',
    come: 'Sotto le ascelle, sul punto più largo dei pettorali. Braccia giù, a fine espirazione normale.' },
  { k: 'arm', nome: 'Braccio dx contr.', corto: 'Braccio', col: '#e0a030',
    come: 'Gomito a 90°, bicipite contratto, sul punto più grosso.' },
  { k: 'thigh', nome: 'Coscia dx metà', corto: 'Coscia', col: '#e57373',
    come: "In piedi, peso su tutte e due le gambe, a metà tra la piega dell'inguine e il bordo alto della rotula." },
] as const

export type CircKey = typeof CIRC[number]['k']

export const haCirc = (m: BodyMeasurement) => CIRC.some((c) => m[c.k] != null)
export const haNota = (m: BodyMeasurement) => !!m.note?.trim() || (m.tags?.length ?? 0) > 0

/** I tuoi tag, nell'ordine tuo. */
export async function listaTag(): Promise<string[]> {
  return ((await db.users.get(U))?.tagNote ?? TAG_BASE).filter((t) => !TAG_AUTO.includes(t))
}

export async function salvaListaTag(lista: string[]): Promise<void> {
  await updateUser({ tagNote: lista })
}

/** Aggiunge un tag in fondo. Restituisce il nome com'è nella lista (se c'era già, quello). */
export async function aggiungiTag(nome: string): Promise<string | null> {
  const n = nome.trim()
  if (!n) return null
  const lista = await listaTag()
  const gia = lista.find((t) => t.toLowerCase() === n.toLowerCase())
  if (gia) return gia
  await salvaListaTag([...lista, n])
  return n
}

/** Rinomina nella lista e in tutti i giorni dove c'era. */
export async function rinominaTag(vecchio: string, nuovo: string): Promise<boolean> {
  const n = nuovo.trim()
  if (!n || n === vecchio) return false
  const lista = await listaTag()
  if (lista.some((t) => t !== vecchio && t.toLowerCase() === n.toLowerCase())) return false
  await db.transaction('rw', db.users, db.bodyMeasurements, async () => {
    await salvaListaTag(lista.map((t) => (t === vecchio ? n : t)))
    const ts = nowISO()
    const giorni = await db.bodyMeasurements.where('userId').equals(U).filter((m) => !!m.tags?.some((x) => x.t === vecchio)).toArray()
    for (const m of giorni) {
      await db.bodyMeasurements.update(m.id, { tags: m.tags!.map((x) => (x.t === vecchio ? { ...x, t: n } : x)), updatedAt: ts })
    }
  })
  return true
}

/** Toglie dalla lista. I giorni passati lo tengono. Restituisce la lista di prima, per l'annulla. */
export async function eliminaTag(nome: string): Promise<string[]> {
  const lista = await listaTag()
  await salvaListaTag(lista.filter((t) => t !== nome))
  return lista
}

/** In quanti giorni c'è ogni tag. */
export async function usoTag(): Promise<Record<string, number>> {
  const uso: Record<string, number> = {}
  for (const m of await db.bodyMeasurements.where('userId').equals(U).toArray()) {
    for (const x of m.tags ?? []) uso[x.t] = (uso[x.t] ?? 0) + 1
  }
  return uso
}

/**
 * Corregge una misura già salvata. A differenza di upsertMeasurement qui un
 * campo vuoto (undefined) cancella davvero: dalla riga dello storico devi
 * poter togliere una nota o una circonferenza sbagliata.
 */
export async function correggiMisura(id: string, patch: Partial<Pick<BodyMeasurement,
  'weight' | 'bodyFat' | 'note' | 'tags' | 'tagNo' | CircKey>>): Promise<void> {
  const pulito: Record<string, unknown> = { updatedAt: nowISO() }
  for (const [k, v] of Object.entries(patch)) {
    const vuoto = v == null || v === '' || (Array.isArray(v) && v.length === 0)
    pulito[k] = vuoto ? undefined : v
  }
  await db.bodyMeasurements.update(id, pulito as Partial<BodyMeasurement>)
}

export function misuraDel(date: string) {
  return db.bodyMeasurements.where('date').equals(date).filter((m) => m.userId === U).first()
}

/** Nota e tag sulla misura del giorno, che deve esserci (la nota va col peso). */
export async function salvaNota(date: string, note: string, tags: TagNota[], tagNo: string[] = []): Promise<boolean> {
  const m = await misuraDel(date)
  if (!m) return false
  await correggiMisura(m.id, { note: note.trim(), tags, tagNo })
  return true
}

/** Come si scrivono i tag in una riga: «↶ sushi/AYCE · poco sonno». */
export const testoTag = (tags?: TagNota[]) => (tags ?? []).map((x) => (x.ieri ? '↶ ' : '') + x.t).join(' · ')

// Il confronto con la volta scorsa: «sono andato meglio dell'ultima volta?».
//
// La volta scorsa e' l'ultima seduta della STESSA scheda prima di questa: la D1
// di oggi si mette accanto alla D1 scorsa, non alla D5 di ieri. Se la seduta non
// viene da una scheda, vale l'ultima dello stesso tipo. Si legge e basta.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { isWorkingSet, bestE1rm, tonnage } from '../metrics/metrics'
import { sessionElapsedSec } from '../db/repo'
import { computeSessionWorkoutScore } from './sessionScore'
import type { SetEntry, WorkoutSession } from '../db/schema'

const U = LOCAL_USER_ID

export type Verso = 'su' | 'pari' | 'giu' | 'nuovo'
export interface Delta { testo: string; verso: Verso }

const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** Le sedute chiuse prima di questa, dalla piu' recente. */
async function primaDi(s: WorkoutSession): Promise<WorkoutSession[]> {
  return (await db.sessions.where('userId').equals(U).toArray())
    .filter((x) => x.id !== s.id && x.finishedAt && x.startedAt < s.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** L'ultima seduta della stessa scheda (o dello stesso tipo, se non viene da una scheda). */
export async function sedutaPrecedente(sessionId: string): Promise<WorkoutSession | null> {
  const s = await db.sessions.get(sessionId)
  if (!s) return null
  const prima = await primaDi(s)
  return (s.srcTemplateId
    ? prima.find((x) => x.srcTemplateId === s.srcTemplateId)
    : prima.find((x) => !x.srcTemplateId && x.type === s.type)) ?? null
}

/**
 * Le serie di lavoro di un esercizio la volta prima di questa seduta: della
 * stessa scheda se c'e', altrimenti l'ultima volta qualsiasi.
 */
export async function serieDiPrima(exerciseId: string, s: WorkoutSession): Promise<{ data: string; sets: SetEntry[] } | null> {
  const entries = await db.exerciseEntries.where({ exerciseId }).toArray()
  type Riga = { startedAt: string; data: string; sets: SetEntry[] }
  let stessa: Riga | null = null
  let qualsiasi: Riga | null = null
  for (const e of entries) {
    if (e.sessionId === s.id) continue
    const x = await db.sessions.get(e.sessionId)
    if (!x || !x.finishedAt || x.startedAt >= s.startedAt) continue
    const sets = (await db.sets.where({ entryId: e.id }).sortBy('order')).filter(isWorkingSet)
    if (!sets.length) continue
    const riga = { startedAt: x.startedAt, data: x.date, sets }
    if (!qualsiasi || riga.startedAt > qualsiasi.startedAt) qualsiasi = riga
    if (s.srcTemplateId && x.srcTemplateId === s.srcTemplateId && (!stessa || riga.startedAt > stessa.startedAt)) stessa = riga
  }
  const r = stessa ?? qualsiasi
  return r ? { data: r.data, sets: r.sets } : null
}

/**
 * Meglio, uguale o peggio: prima il carico piu' alto, a parita' di carico le
 * ripetizioni totali.
 */
export function deltaSerie(ora: SetEntry[], prima: SetEntry[] | null): Delta {
  const o = ora.filter(isWorkingSet), p = (prima ?? []).filter(isWorkingSet)
  if (!p.length) return { testo: 'prima volta', verso: 'nuovo' }
  if (!o.length) return { testo: '—', verso: 'pari' }
  const topO = Math.max(...o.map((s) => s.weight)), topP = Math.max(...p.map((s) => s.weight))
  const dk = Math.round((topO - topP) * 10) / 10
  if (dk !== 0) return { testo: `${dk > 0 ? '+' : '−'}${kg(Math.abs(dk))} kg`, verso: dk > 0 ? 'su' : 'giu' }
  const dr = o.reduce((a, s) => a + s.reps, 0) - p.reduce((a, s) => a + s.reps, 0)
  if (dr === 0) return { testo: 'uguale', verso: 'pari' }
  return { testo: `${dr > 0 ? '+' : '−'}${Math.abs(dr)} rip`, verso: dr > 0 ? 'su' : 'giu' }
}

/** Le serie in fila: «35 × 10 · 9 · 8» se il carico non cambia, altrimenti «81,5 × 9 · 66 × 11». */
export function serieInFila(sets: SetEntry[]): string {
  const w = sets.filter(isWorkingSet)
  if (!w.length) return ''
  if (w.every((s) => s.weight === w[0].weight)) return `${kg(w[0].weight)} × ${w.map((s) => s.reps).join(' · ')}`
  return w.map((s) => `${kg(s.weight)} × ${s.reps}`).join(' · ')
}

/**
 * Quante serie prevede la riga del coach di quella giornata: «🦠 D1 · @A|B|C …»
 * sono tre. Null se la riga non c'e'.
 */
export function serieAttese(settings: string | undefined, codice: string | null): number | null {
  if (!codice) return null
  const riga = (settings ?? '').split('\n').find((r) => r.trimStart().startsWith(`🦠 ${codice} ·`))
  const m = riga?.match(/@([A-Z](?:\|[A-Z])*)/)
  return m ? m[1].split('|').length : null
}

/** Il codice D1…D5 di un nome di scheda, se c'e'. */
export const codiceScheda = (nome?: string | null) => nome?.match(/\bD[1-9]\b/)?.[0] ?? null

/** Il nome da mostrare: senza il 🦠 davanti. */
export const nomeScheda = (nome: string) => nome.replace(/^\s*🦠\s*/, '')

export interface RigaConfronto {
  entryId: string; exerciseId: string; nome: string
  sets: SetEntry[]; delta: Delta; pr: boolean
}

export interface ConfrontoSeduta {
  scheda: string | null
  precedente: WorkoutSession | null
  durata: { ora: number | null; prima: number | null }
  serie: { ora: number; prima: number | null }
  kg: { ora: number; prima: number | null }
  righe: RigaConfronto[]
  /** media del voto nelle ultime sedute della stessa scheda (almeno due) */
  mediaScheda: number | null
}

async function serieDiSeduta(sessionId: string) {
  const entries = await db.exerciseEntries.where({ sessionId }).sortBy('order')
  const out: { entryId: string; exerciseId: string; sets: SetEntry[] }[] = []
  for (const e of entries) out.push({ entryId: e.id, exerciseId: e.exerciseId, sets: (await db.sets.where({ entryId: e.id }).sortBy('order')).filter(isWorkingSet) })
  return out
}

const minuti = (s: WorkoutSession | null) => (s?.startedAt && s.finishedAt ? Math.round(sessionElapsedSec(s) / 60) : null)

/** Tutto il confronto di una seduta con la volta scorsa, per la fine seduta e il dettaglio. */
export async function confrontoSeduta(sessionId: string): Promise<ConfrontoSeduta | null> {
  const s = await db.sessions.get(sessionId)
  if (!s) return null
  const scheda = s.srcTemplateId ? (await db.templates.get(s.srcTemplateId))?.name ?? null : null
  const prec = await sedutaPrecedente(sessionId)
  const nomi = new Map((await db.exercises.where('userId').equals(U).toArray()).map((e) => [e.id, e.name]))

  const ora = await serieDiSeduta(sessionId)
  const prima = prec ? await serieDiSeduta(prec.id) : null

  const righe: RigaConfronto[] = []
  for (const r of ora) {
    const p = await serieDiPrima(r.exerciseId, s)
    // Record: il miglior e1RM di oggi batte tutto quello che c'era prima.
    let record = 0
    for (const e of await db.exerciseEntries.where({ exerciseId: r.exerciseId }).toArray()) {
      if (e.sessionId === sessionId) continue
      const x = await db.sessions.get(e.sessionId)
      if (!x || x.startedAt >= s.startedAt) continue
      record = Math.max(record, bestE1rm(await db.sets.where({ entryId: e.id }).toArray()))
    }
    const oggi = bestE1rm(r.sets)
    righe.push({
      entryId: r.entryId, exerciseId: r.exerciseId, nome: nomi.get(r.exerciseId) ?? '—',
      sets: r.sets, delta: deltaSerie(r.sets, p?.sets ?? null), pr: record > 0 && oggi > record,
    })
  }

  // La media del voto della scheda: le ultime cinque prima di questa.
  let mediaScheda: number | null = null
  if (s.srcTemplateId) {
    const stesse = (await primaDi(s)).filter((x) => x.srcTemplateId === s.srcTemplateId).slice(0, 5)
    const voti: number[] = []
    for (const x of stesse) { const v = (await computeSessionWorkoutScore(x.id)).value; if (v != null) voti.push(v) }
    if (voti.length >= 2) mediaScheda = Math.round(voti.reduce((a, b) => a + b, 0) / voti.length)
  }

  const tutte = (x: typeof ora) => x.flatMap((r) => r.sets)
  return {
    scheda, precedente: prec,
    durata: { ora: minuti(s), prima: minuti(prec) },
    serie: { ora: tutte(ora).length, prima: prima ? tutte(prima).length : null },
    kg: { ora: tonnage(tutte(ora)), prima: prima ? tonnage(tutte(prima)) : null },
    righe, mediaScheda,
  }
}

/** Prima i record, poi chi e' salito, poi uguali e nuovi, in fondo chi e' sceso. */
export function ordinaRighe(r: RigaConfronto[]): RigaConfronto[] {
  const peso = (x: RigaConfronto) => (x.pr ? 0 : { su: 1, pari: 2, nuovo: 3, giu: 4 }[x.delta.verso])
  return [...r].sort((a, b) => peso(a) - peso(b))
}

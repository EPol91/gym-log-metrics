// Collegamento con WHOOP.
//
// L'app non vede mai i token: parla con un Worker Cloudflare che custodisce il
// segreto e fa da tramite. Qui dentro c'è solo l'identificativo del dispositivo
// (una chiave casuale) e la traduzione dei dati WHOOP nel nostro modello.
//
// Regola: i dati WHOOP sono FATTI, non verdetti. Non sovrascrivono mai quello che
// scrivi tu nel Check del giorno — al massimo lo propongono.

import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { todayLocal } from '../util/date'
import type { WhoopDay, WhoopWorkout } from './schema'

const U = LOCAL_USER_ID
const WORKER = 'https://etp-health-whoop.emanuel-pol91.workers.dev'
const DEVICE_KEY = 'whoop-device'

/** Chiave casuale del dispositivo: è ciò che lega questo telefono ai suoi token. */
export function deviceId(): string {
  let d = localStorage.getItem(DEVICE_KEY)
  if (!d) {
    d = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    localStorage.setItem(DEVICE_KEY, d)
  }
  return d
}

/** Indirizzo a cui mandare l'utente per dare il consenso a WHOOP. */
export function connectUrl(): string {
  const ritorno = location.origin + location.pathname
  return `${WORKER}/auth?d=${deviceId()}&r=${encodeURIComponent(ritorno)}`
}

export interface WhoopStatus { collegato: boolean; aggiornato: string | null }

export async function whoopStatus(): Promise<WhoopStatus> {
  try {
    const r = await fetch(`${WORKER}/stato`, { headers: { 'x-device': deviceId() } })
    return await r.json()
  } catch {
    return { collegato: false, aggiornato: null }
  }
}

export async function whoopDisconnect(): Promise<void> {
  try { await fetch(`${WORKER}/scollega`, { headers: { 'x-device': deviceId() } }) } catch { /* offline: i token restano, si riprova */ }
}

/** Chiamata all'API WHOOP passando dal Worker. */
async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams(params)
  const r = await fetch(`${WORKER}/api${path}${q.toString() ? '?' + q : ''}`, { headers: { 'x-device': deviceId() } })
  if (!r.ok) throw new Error(`WHOOP ${path}: ${r.status}`)
  return r.json() as Promise<T>
}

interface Paged<T> { records: T[]; next_token?: string }

/**
 * Scorre tutte le pagine di una collezione. `maxPagine` tiene il conto delle
 * chiamate: il limite WHOOP è 100 al minuto e non ha senso avvicinarcisi.
 */
async function tutte<T>(path: string, start: string, maxPagine = 60): Promise<{ righe: T[]; troncato: boolean }> {
  const out: T[] = []
  let token: string | undefined
  for (let i = 0; i < maxPagine; i++) {
    const p: Record<string, string> = { limit: '25', start }
    if (token) p.nextToken = token
    const page = await api<Paged<T>>(path, p)
    out.push(...(page.records ?? []))
    token = page.next_token
    if (!token) return { righe: out, troncato: false }
    // Il limite WHOOP è 100 chiamate al minuto: una pausa breve e non lo sfioriamo.
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 1200))
  }
  // Pagine finite ma WHOOP ne aveva altre: meglio dirlo che far finta di niente.
  return { righe: out, troncato: true }
}

// --- Traduzione -------------------------------------------------------------

/** Giorno locale di un istante ISO: WHOOP ragiona in UTC, noi in giorni tuoi. */
const giorno = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface CycleRec { id: number; start: string; end?: string; score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number } }
interface RecoveryRec { cycle_id: number; score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number; spo2_percentage?: number; skin_temp_celsius?: number } }
interface SleepRec { id: string; start: string; end: string; nap?: boolean; score?: { respiratory_rate?: number; sleep_performance_percentage?: number; sleep_efficiency_percentage?: number; stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number } } }
interface WorkoutRec { id: string; start: string; end: string; sport_name?: string; score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number; distance_meter?: number } }

const kcalDa = (kj?: number) => (kj != null ? Math.round(kj / 4.184) : undefined)
const arrotonda = (v: number | undefined, d = 1) => (v != null ? Math.round(v * 10 ** d) / 10 ** d : undefined)

/**
 * Sincronizza gli ultimi `giorni` di dati. Restituisce quante giornate e quanti
 * allenamenti sono arrivati, così l'interfaccia può dirlo invece di far finta.
 */
export async function syncWhoop(giorni = 30): Promise<{ giorni: number; allenamenti: number; troncato: boolean }> {
  const start = new Date(Date.now() - giorni * 86400_000).toISOString()

  // In sequenza, non in parallelo: quattro raffiche insieme avvicinano il limite al minuto.
  const c1 = await tutte<CycleRec>('/v2/cycle', start)
  const r1 = await tutte<RecoveryRec>('/v2/recovery', start)
  const s1 = await tutte<SleepRec>('/v2/activity/sleep', start)
  const w1 = await tutte<WorkoutRec>('/v2/activity/workout', start)
  const cicli = c1.righe, recuperi = r1.righe, sonni = s1.righe, allenamenti = w1.righe
  const troncato = c1.troncato || r1.troncato || s1.troncato || w1.troncato

  // Il recupero è legato al ciclo, non alla data: si aggancia lì.
  const recPerCiclo = new Map(recuperi.map((r) => [r.cycle_id, r]))
  const perGiorno = new Map<string, Partial<WhoopDay>>()
  const prendi = (data: string) => {
    if (!perGiorno.has(data)) perGiorno.set(data, { date: data })
    return perGiorno.get(data)!
  }

  for (const c of cicli) {
    const g = prendi(giorno(c.start))
    g.strain = arrotonda(c.score?.strain)
    g.kcal = kcalDa(c.score?.kilojoule)
    g.avgHr = c.score?.average_heart_rate
    g.maxHr = c.score?.max_heart_rate
    const r = recPerCiclo.get(c.id)
    if (r?.score) {
      g.recovery = r.score.recovery_score
      g.hrv = arrotonda(r.score.hrv_rmssd_milli)
      g.restingHr = r.score.resting_heart_rate
      g.spo2 = arrotonda(r.score.spo2_percentage)
      g.skinTempC = arrotonda(r.score.skin_temp_celsius)
    }
  }

  // Il sonno appartiene alla mattina in cui ti svegli, non alla sera in cui vai a letto.
  for (const s of sonni) {
    if (s.nap) continue
    const g = prendi(giorno(s.end))
    const inLetto = s.score?.stage_summary?.total_in_bed_time_milli
    const sveglio = s.score?.stage_summary?.total_awake_time_milli ?? 0
    if (inLetto != null) g.sleepHours = arrotonda((inLetto - sveglio) / 3_600_000, 2)
    g.sleepPerf = arrotonda(s.score?.sleep_performance_percentage, 0)
    g.sleepEfficiency = arrotonda(s.score?.sleep_efficiency_percentage, 0)
    g.respiratoryRate = arrotonda(s.score?.respiratory_rate)
  }

  const ts = nowISO()
  const esistenti = await db.whoopDays.where('userId').equals(U).toArray()
  const perData = new Map(esistenti.map((d) => [d.date, d]))
  const righe: WhoopDay[] = []
  for (const [data, val] of perGiorno) {
    const vecchia = perData.get(data)
    righe.push({
      ...(vecchia ?? { id: newId(), userId: U, createdAt: ts }),
      ...val, date: data, userId: U, updatedAt: ts, syncedAt: ts,
    } as WhoopDay)
  }
  if (righe.length) await db.whoopDays.bulkPut(righe)

  const esistentiW = await db.whoopWorkouts.where('userId').equals(U).toArray()
  const perWhoopId = new Map(esistentiW.map((w) => [w.whoopId, w]))
  const righeW: WhoopWorkout[] = allenamenti.map((w) => ({
    ...(perWhoopId.get(w.id) ?? { id: newId(), userId: U, createdAt: ts }),
    userId: U, updatedAt: ts,
    whoopId: w.id, date: giorno(w.start), start: w.start, end: w.end,
    sport: w.sport_name,
    strain: arrotonda(w.score?.strain),
    kcal: kcalDa(w.score?.kilojoule),
    avgHr: w.score?.average_heart_rate,
    maxHr: w.score?.max_heart_rate,
    distanceM: w.score?.distance_meter != null ? Math.round(w.score.distance_meter) : undefined,
  }) as WhoopWorkout)
  if (righeW.length) await db.whoopWorkouts.bulkPut(righeW)

  return { giorni: righe.length, allenamenti: righeW.length, troncato }
}

// --- Letture ----------------------------------------------------------------

export function whoopDay(date: string = todayLocal()) {
  return db.whoopDays.where('date').equals(date).filter((d) => d.userId === U).first()
}

export function whoopDaysRecent(limit = 14) {
  return db.whoopDays.where('userId').equals(U).reverse().sortBy('date').then((r) => r.slice(0, limit))
}

export function whoopWorkoutsOf(date: string) {
  return db.whoopWorkouts.where('date').equals(date).filter((w) => w.userId === U).toArray()
}

/** Cancella la copia locale: si usa quando scolleghi, per non lasciare dati orfani. */
export async function clearWhoopData(): Promise<void> {
  await db.whoopDays.where('userId').equals(U).delete()
  await db.whoopWorkouts.where('userId').equals(U).delete()
}

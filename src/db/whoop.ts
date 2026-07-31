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

/**
 * Come `tutte`, più una chiamata secca ai record più recenti SENZA filtro di data.
 * Il ciclo di oggi non è ancora finito e il recupero appena calcolato può non
 * rientrare in una collezione filtrata per data: chiedere esplicitamente gli
 * ultimi costa una chiamata e toglie di mezzo il dubbio.
 */
async function ultimiPiu<T>(path: string, start: string, chiave: (r: T) => string): Promise<{ righe: T[]; troncato: boolean }> {
  const base = await tutte<T>(path, start)
  let recenti: T[] = []
  try {
    const r = await api<Paged<T>>(path, { limit: '10' })
    recenti = r.records ?? []
  } catch { /* il di più non deve far fallire il resto */ }
  const per = new Map(base.righe.map((r) => [chiave(r), r]))
  for (const r of recenti) per.set(chiave(r), r)
  return { righe: [...per.values()], troncato: base.troncato }
}

// --- Traduzione -------------------------------------------------------------

/** Giorno locale di un istante ISO: WHOOP ragiona in UTC, noi in giorni tuoi. */
const giorno = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface CycleRec { id: number; start: string; end?: string; score_state?: string; score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number } }
interface RecoveryRec { cycle_id: number; sleep_id?: string; score_state?: string; score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number; spo2_percentage?: number; skin_temp_celsius?: number } }
interface SleepRec { id: string; start: string; end: string; nap?: boolean; score_state?: string; score?: { respiratory_rate?: number; sleep_performance_percentage?: number; sleep_efficiency_percentage?: number; stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number } } }
interface WorkoutRec { id: string; start: string; end: string; sport_name?: string; score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number; distance_meter?: number } }

/** Toglie i campi vuoti, così un dato che non c'è non cancella quello che c'era. */
const senzaVuoti = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

const kcalDa = (kj?: number) => (kj != null ? Math.round(kj / 4.184) : undefined)
const arrotonda = (v: number | undefined, d = 1) => (v != null ? Math.round(v * 10 ** d) / 10 ** d : undefined)

/**
 * Sincronizza gli ultimi `giorni` di dati. Restituisce quante giornate e quanti
 * allenamenti sono arrivati, così l'interfaccia può dirlo invece di far finta.
 */
export async function syncWhoop(giorni = 30): Promise<{ giorni: number; allenamenti: number; troncato: boolean }> {
  const start = new Date(Date.now() - giorni * 86400_000).toISOString()

  // In sequenza, non in parallelo: quattro raffiche insieme avvicinano il limite al minuto.
  const c1 = await ultimiPiu<CycleRec>('/v2/cycle', start, (c) => String(c.id))
  const r1 = await ultimiPiu<RecoveryRec>('/v2/recovery', start, (r) => String(r.cycle_id))
  const s1 = await tutte<SleepRec>('/v2/activity/sleep', start)
  const w1 = await tutte<WorkoutRec>('/v2/activity/workout', start)
  const cicli = c1.righe, recuperi = r1.righe, sonni = s1.righe, allenamenti = w1.righe
  const troncato = c1.troncato || r1.troncato || s1.troncato || w1.troncato

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
  }

  // Il recupero appartiene alla mattina in cui ti svegli: si aggancia al sonno che
  // lo ha prodotto, non al ciclo. Passare dal ciclo voleva dire perderlo ogni volta
  // che WHOOP mandava il recupero prima del ciclo a cui appartiene.
  const sonnoPerId = new Map(sonni.map((s) => [s.id, s]))
  const cicloPerId = new Map(cicli.map((c) => [c.id, c]))
  for (const r of recuperi) {
    if (!r.score) continue
    const s = r.sleep_id ? sonnoPerId.get(r.sleep_id) : undefined
    const c = cicloPerId.get(r.cycle_id)
    const data = s ? giorno(s.end) : c ? giorno(c.start) : null
    if (!data) continue
    const g = prendi(data)
    g.recovery = r.score.recovery_score
    g.hrv = arrotonda(r.score.hrv_rmssd_milli)
    g.restingHr = r.score.resting_heart_rate
    g.spo2 = arrotonda(r.score.spo2_percentage)
    g.skinTempC = arrotonda(r.score.skin_temp_celsius)
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
      // Solo i campi davvero arrivati: una sincronizzazione fatta mentre WHOOP
      // ha ancora mezza giornata da elaborare non deve cancellare quello che
      // era gia' qui. I vuoti si sovrascriverebbero sopra i pieni.
      ...senzaVuoti(val), date: data, userId: U, updatedAt: ts, syncedAt: ts,
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

/**
 * Giornate WHOOP di un periodo, in ordine cronologico, con le date in cui ti sei
 * allenato. Serve a incrociare i due mondi: allenarsi da scarichi si vede solo qui.
 */
export async function whoopTrend(giorni: number): Promise<{ righe: WhoopDay[]; sedute: Set<string> }> {
  const da = new Date(Date.now() - giorni * 86400_000).toISOString().slice(0, 10)
  const righe = (await db.whoopDays.where('userId').equals(U).toArray())
    .filter((d) => d.date >= da)
    .sort((a, b) => a.date.localeCompare(b.date))
  const sessioni = await db.sessions.where('userId').equals(U).toArray()
  const sedute = new Set(sessioni.filter((s) => s.date >= da && s.finishedAt).map((s) => s.date))
  return { righe, sedute }
}

/**
 * FC a riposo da usare per le zone HRR: la media WHOOP degli ultimi 7 giorni.
 * Media e non valore di ieri, perché la FC a riposo oscilla di qualche battito
 * e le zone non devono ballare da un giorno all'altro.
 * Null se WHOOP non ha dati: chi chiama ripiega sul valore scritto nel Profilo.
 */
export async function restingHrFromWhoop(giorni = 7): Promise<number | null> {
  const da = new Date(Date.now() - giorni * 86400_000).toISOString().slice(0, 10)
  const v = (await db.whoopDays.where('userId').equals(U).toArray())
    .filter((d) => d.date >= da)
    .map((d) => d.restingHr)
    .filter((x): x is number => x != null)
  return v.length >= 3 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/**
 * Sincronizza da sola, al massimo una volta al giorno, quando apri l'app.
 * In silenzio: se non c'e' rete o WHOOP non risponde, riprova alla prossima
 * apertura senza disturbare. Senza questo, i dati sono vecchi proprio nei
 * giorni in cui ti dimentichi di premere Aggiorna.
 */
const AUTO_AT = 'whoop-auto-at'
const AUTO_TRY = 'whoop-auto-try'

/** Quando è andata a buon fine l'ultima sincronizzazione automatica. */
export function lastAutoSync(): string | null {
  return localStorage.getItem(AUTO_AT)
}

/**
 * La giornata di oggi è arrivata intera?
 * Il metro è il recupero, non il sonno: WHOOP pubblica il sonno appena ti alzi
 * e il recupero più tardi. Accontentarsi del sonno voleva dire fermarsi alle
 * sei del mattino con recupero, sforzo e HRV ancora vuoti per tutto il giorno.
 */
async function oggiCompleto(): Promise<boolean> {
  const d = await whoopDay()
  return d?.recovery != null
}

/**
 * Sincronizza da sola, al ritorno nell'app.
 *
 * Due ritmi, non un interruttore "fatto per oggi": finché il recupero di oggi
 * manca riprova ogni quarto d'ora, perché è lì che i dati stanno ancora
 * arrivando; quando c'è rallenta a ogni tre ore, quel tanto che basta a tenere
 * fresco lo sforzo, che invece cresce per tutta la giornata.
 */
const ATTESA_INCOMPLETO = 15 * 60_000
const ATTESA_COMPLETO = 3 * 60 * 60_000

export async function autoSyncWhoop(): Promise<boolean> {
  const attesa = (await oggiCompleto()) ? ATTESA_COMPLETO : ATTESA_INCOMPLETO
  const ultimoTentativo = Number(localStorage.getItem(AUTO_TRY) ?? 0)
  if (Date.now() - ultimoTentativo < attesa) return false
  localStorage.setItem(AUTO_TRY, String(Date.now()))

  const st = await whoopStatus()
  if (!st.collegato) return false
  try {
    await syncWhoop(14)
    localStorage.setItem(AUTO_AT, nowISO())
    return true
  } catch {
    // Niente rumore: e' un aggiornamento di cortesia, non un'azione che hai chiesto.
    return false
  }
}

/**
 * Aggancia la sincronizzazione al RITORNO nell'app, non solo all'avvio.
 * Sul telefono la PWA resta in memoria: riaprendola il codice di avvio non gira
 * piu', e senza questo la sincronizzazione non partiva mai davvero.
 */
export function watchAutoSync(): () => void {
  const prova = () => { if (document.visibilityState === 'visible') autoSyncWhoop() }
  prova()
  document.addEventListener('visibilitychange', prova)
  window.addEventListener('focus', prova)
  return () => {
    document.removeEventListener('visibilitychange', prova)
    window.removeEventListener('focus', prova)
  }
}
/**
 * Cosa manda WHOOP, in chiaro.
 *
 * Quando un valore non compare le ipotesi sono due — WHOOP non l'ha ancora
 * pubblicato, oppure l'app lo sta buttando via — e da fuori si somigliano.
 * Questo elenca i record grezzi degli ultimi giorni con la data che l'app
 * assegna a ciascuno: la differenza si legge in un colpo d'occhio.
 */
export async function whoopDiag(giorni = 3): Promise<string> {
  const ora = new Date()
  const hhmm = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const out: string[] = []
  out.push(`WHOOP · cosa arriva davvero — ultimi ${giorni} giorni`)
  out.push(`adesso: ${hhmm(ora.toISOString())} (fuso ${-ora.getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-ora.getTimezoneOffset() / 60})`)

  const start = new Date(Date.now() - giorni * 86400_000).toISOString()
  try {
    const cicli = await ultimiPiu<CycleRec>('/v2/cycle', start, (c) => String(c.id))
    out.push('', `CICLI (${cicli.righe.length})`)
    for (const c of cicli.righe.sort((a, b) => b.start.localeCompare(a.start))) {
      out.push(`  ${c.id} · inizio ${hhmm(c.start)} → giorno ${giorno(c.start)} · ${c.score_state ?? 'stato?'} · sforzo ${c.score?.strain ?? '—'}`)
    }

    const rec = await ultimiPiu<RecoveryRec>('/v2/recovery', start, (r) => String(r.cycle_id))
    out.push('', `RECUPERI (${rec.righe.length})`)
    for (const r of rec.righe) {
      out.push(`  ciclo ${r.cycle_id} · sonno ${r.sleep_id ? r.sleep_id.slice(0, 8) : '—'} · ${r.score_state ?? 'stato?'} · recupero ${r.score?.recovery_score ?? '—'} · HRV ${arrotonda(r.score?.hrv_rmssd_milli) ?? '—'}`)
    }

    const son = await tutte<SleepRec>('/v2/activity/sleep', start)
    out.push('', `SONNI (${son.righe.length})`)
    for (const s of son.righe.sort((a, b) => b.end.localeCompare(a.end))) {
      const inLetto = s.score?.stage_summary?.total_in_bed_time_milli
      out.push(`  ${s.id.slice(0, 8)} · sveglia ${hhmm(s.end)} → giorno ${giorno(s.end)} · ${s.nap ? 'pisolino' : 'notte'} · ${s.score_state ?? 'stato?'} · ore ${arrotonda(inLetto != null ? inLetto / 3_600_000 : undefined, 2) ?? '—'}`)
    }
  } catch (e) {
    out.push('', `ERRORE: ${e instanceof Error ? e.message : String(e)}`)
  }

  out.push('', 'NEL DATABASE DELL\'APP')
  for (const d of await whoopDaysRecent(giorni)) {
    out.push(`  ${d.date} · recupero ${d.recovery ?? '—'} · sonno ${d.sleepHours ?? '—'} · sforzo ${d.strain ?? '—'} · HRV ${d.hrv ?? '—'}`)
  }
  return out.join('\n')
}

/** Cancella la copia locale: si usa quando scolleghi, per non lasciare dati orfani. */
export async function clearWhoopData(): Promise<void> {
  await db.whoopDays.where('userId').equals(U).delete()
  await db.whoopWorkouts.where('userId').equals(U).delete()
}

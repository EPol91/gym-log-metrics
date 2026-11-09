// Invio ad Autogestione: il backup completo va al Worker, che lo tiene nel suo
// KV (un backup al giorno: un secondo invio nello stesso giorno sostituisce il
// primo). Sul PC lo script dell'autogestione lo scarica in Autogestione/ETP/.
//
// Il Worker accetta solo questo telefono: quello collegato a WHOOP, con il suo
// codice dispositivo. Nessuna chiave nuova da tenere qui.

import { exportAll, type BackupFile } from './backup'
import { WORKER, deviceId } from './whoop'
import { db } from './db'
import { LOCAL_USER_ID } from './seed'
import { targetsAl } from './targetStorico'
import { tagAuto, autoAttivi } from './noteCorpo'
import { PASSI_AL_MINUTO } from '../rs/passiEquivalenti'
import type { CardioType } from './schema'
import { todayLocal } from '../util/date'

const INVII = 'autog-invii'
const DOMENICA = 'autog-domenica'
/** Dall'ora in poi, la domenica, alla prima apertura parte da solo. */
export const ORA_DOMENICA = '23:00'

export interface Invio { at: string; ok: boolean; testo: string; bytes?: number; auto?: boolean }
export interface Calo { tabella: string; prima: number; ora: number }
export type Esito =
  | { tipo: 'ok'; invio: Invio }
  | { tipo: 'calo'; calo: Calo[]; ultimo: { at: string; data: string } | null }
  | { tipo: 'collega' }
  | { tipo: 'errore'; testo: string }

const leggi = <T>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v) as T } catch { return def } }
const scrivi = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage pieno o assente */ } }

/** Collegato a WHOOP = il Worker conosce questo telefono. */
export const collegato = (): boolean => { try { return !!localStorage.getItem('whoop-device') } catch { return false } }
export const invii = (): Invio[] => leggi<Invio[]>(INVII, [])
export const domenicaAttiva = (): boolean => leggi(DOMENICA, true)
export const setDomenica = (on: boolean) => scrivi(DOMENICA, on)

function registra(i: Invio) {
  scrivi(INVII, [i, ...invii()].slice(0, 12))
  window.dispatchEvent(new Event('autog'))
}

async function sha1(testo: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(testo))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Il backup da inviare: quello di sempre, senza la chiave AI (all'autogestione non serve). */
async function preparaBackup(): Promise<{ testo: string; conti: Record<string, number> }> {
  const b: BackupFile = await exportAll()
  if (b.preferenze) delete b.preferenze['gymlog.ai.apiKey']
  const testo = JSON.stringify(b)
  // Si rilegge prima di partire: se non torna identico, non si manda niente.
  const riletto = JSON.parse(testo) as BackupFile
  if (riletto.format !== 'gymlog-backup' || !riletto.data) throw new Error('backup non valido')
  const conti = Object.fromEntries(Object.entries(riletto.data).map(([t, r]) => [t, Array.isArray(r) ? r.length : 0]))
  return { testo, conti }
}

const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.round(n / 1e3)} kB`)

// --- Riepilogo dei giorni per il Cockpit ---------------------------------------
//
// Il Cockpit non legge il backup intero: riceve un giorno per riga con quello
// che serve a Body Metrics (peso, tipo, target, nota). `altro` porta le
// abitudini per chiave: un tracker nuovo ci arriva da solo, senza cambiare formato.

/** Da qui parte ETP Health: prima il Cockpit ha già il suo storico e non si tocca. */
const DAL = '2026-07-21'
const CIRC_NOMI = { waist: 'vita_ombelico', waistNarrow: 'vita_stretta', chest: 'petto', arm: 'braccio', thigh: 'coscia' } as const

export interface GiornoRiepilogo {
  data: string
  peso?: number
  /** il nome della giornata tipo senza l'icona: «LOW ON» */
  tipo?: string
  /** gli obiettivi in vigore quel giorno per quel tipo */
  target?: { kcal: number; C: number; P: number; G: number }
  tag?: string[]
  nota?: string
  circonferenze?: Record<string, number>
  altro?: Record<string, number>
  /** il cardio del giorno per tipo, con i passi equivalenti per RS (stessa regola della scheda RS) */
  cardio?: { tipo: string; minuti: number; passi: number }[]
  passiEquivalenti?: number
}

export async function riepilogoGiorni(): Promise<GiornoRiepilogo[]> {
  const U = LOCAL_USER_ID
  const tieni = <T extends { userId: string; deleted?: boolean; date: string }>(r: T[]) => r.filter((x) => x.userId === U && !x.deleted && x.date >= DAL)
  const [misure, nutri, tipi, abitudini, whoop, cardio] = await Promise.all([
    db.bodyMeasurements.where('userId').equals(U).toArray(),
    db.nutrition.where('userId').equals(U).toArray(),
    db.dayTypes.where('userId').equals(U).toArray(),
    db.habitEntries.where('userId').equals(U).toArray(),
    db.whoopDays.where('userId').equals(U).toArray(),
    db.cardio.where('userId').equals(U).toArray(),
  ])
  const giorni = new Map<string, GiornoRiepilogo>()
  const g = (data: string) => { let x = giorni.get(data); if (!x) { x = { data }; giorni.set(data, x) } return x }
  const whoopDi = new Map(whoop.filter((w) => !w.deleted).map((w) => [w.date, w]))

  // Una misura al giorno; se ce ne fossero due, vale l'ultima scritta.
  for (const m of tieni(misure).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const x = g(m.date)
    if (m.weight) x.peso = m.weight
    const tag = (m.tags ?? []).filter((t) => t?.t).map((t) => t.t + (t.ieri ? ' (ieri)' : ''))
    for (const a of autoAttivi(tagAuto(whoopDi.get(m.date)), m)) if (!tag.includes(a.t)) tag.push(a.t)
    x.tag = tag.length ? tag : undefined
    x.nota = m.note?.trim() || undefined
    const circ = Object.fromEntries(Object.entries(CIRC_NOMI).filter(([k]) => m[k as keyof typeof CIRC_NOMI] != null).map(([k, nome]) => [nome, m[k as keyof typeof CIRC_NOMI] as number]))
    x.circonferenze = Object.keys(circ).length ? circ : undefined
  }

  const perChiave = new Map(tipi.map((t) => [t.key, t]))
  for (const n of tieni(nutri)) {
    const t = n.dayType ? perChiave.get(n.dayType) : undefined
    if (!t) continue
    const x = g(n.date)
    x.tipo = t.name.replace(/^[^\p{L}\p{N}]+/u, '').trim()
    const v = targetsAl(t, n.date)
    x.target = { kcal: v.kcal, C: v.carbs, P: v.protein, G: v.fat }
  }

  for (const h of tieni(abitudini)) {
    if (h.value == null) continue
    const x = g(h.date)
    x.altro = { ...x.altro, [h.habitKey]: h.value }
  }

  // Cardio per tipo e passi equivalenti: il Cockpit ci fa i «passi per RS» (camminata + cardio).
  const perGiorno = new Map<string, Map<string, number>>()
  for (const c of tieni(cardio)) {
    const t = c.cardioType ?? 'altro', m = perGiorno.get(c.date) ?? new Map<string, number>()
    m.set(t, (m.get(t) ?? 0) + (c.durationMin || 0)); perGiorno.set(c.date, m)
  }
  for (const [data, m] of perGiorno) {
    const x = g(data)
    x.cardio = [...m].map(([tipo, minuti]) => ({ tipo, minuti: Math.round(minuti), passi: Math.round(minuti * (PASSI_AL_MINUTO[tipo as CardioType] ?? 0)) }))
    x.passiEquivalenti = x.cardio.reduce((s, v) => s + v.passi, 0)
  }

  return [...giorni.values()].sort((a, b) => a.data.localeCompare(b.data))
}

/** Manda il riepilogo dopo il backup. Se non passa, il backup resta buono lo stesso. */
async function inviaRiepilogo(): Promise<boolean> {
  try {
    const r = await fetch(`${WORKER}/autogestione/giorni`, {
      method: 'POST',
      headers: { 'x-device': deviceId(), 'content-type': 'application/json' },
      body: JSON.stringify({ giorni: await riepilogoGiorni() }),
    })
    return r.ok
  } catch { return false }
}

/** Manda il backup. `forza` = salva anche se ha molte meno righe dell'ultimo. */
export async function invia({ forza = false, auto = false } = {}): Promise<Esito> {
  if (!collegato()) return { tipo: 'collega' }
  const at = new Date().toISOString()
  // «Il Worker non risponde» solo se si era davvero arrivati a chiamarlo.
  let chiamato = false
  try {
    const { testo, conti } = await preparaBackup()
    const impronta = await sha1(testo)
    chiamato = true
    const r = await fetch(`${WORKER}/autogestione/backup?data=${todayLocal()}${forza ? '&forza=1' : ''}`, {
      method: 'POST',
      headers: { 'x-device': deviceId(), 'content-type': 'application/json', 'x-sha1': impronta, 'x-conti': JSON.stringify(conti) },
      body: testo,
    })
    const j = await r.json().catch(() => ({}))
    if (r.status === 409 && j.calo) {
      registra({ at, ok: false, testo: 'non salvato: backup sospetto', auto })
      return { tipo: 'calo', calo: j.calo, ultimo: j.ultimo ?? null }
    }
    if (r.status === 401) {
      registra({ at, ok: false, testo: 'WHOOP non collegato', auto })
      return { tipo: 'collega' }
    }
    if (!r.ok || !j.ok) {
      const testo = j.errore ?? `errore ${r.status}`
      registra({ at, ok: false, testo, auto })
      return { tipo: 'errore', testo }
    }
    // Oltre i 20 MB il Worker avvisa: il limite di un backup nel KV è 25.
    const cockpit = await inviaRiepilogo()
    const invio = { at, ok: true, testo: `ok · ${kb(j.bytes)}${j.avviso ? ' · vicino al limite' : ''}${cockpit ? '' : ' · Cockpit non aggiornato'}`, bytes: j.bytes, auto }
    registra(invio)
    return { tipo: 'ok', invio }
  } catch (e) {
    const testo = chiamato
      ? 'rete: il Worker non risponde'
      : e instanceof Error && e.message === 'backup non valido' ? 'backup non valido' : `backup non preparato: ${e instanceof Error ? e.message : String(e)}`
    registra({ at, ok: false, testo, auto })
    return { tipo: 'errore', testo }
  }
}

/**
 * Domenica dalle 23:00: se quel giorno dopo quell'ora non è ancora partito
 * niente, parte da solo. Il calo sospetto non si forza mai da solo.
 */
export function toccaAutomatico(ora = new Date()): boolean {
  if (!domenicaAttiva() || !collegato() || ora.getDay() !== 0) return false
  const hm = `${String(ora.getHours()).padStart(2, '0')}:${String(ora.getMinutes()).padStart(2, '0')}`
  if (hm < ORA_DOMENICA) return false
  const oggi = todayLocal()
  return !invii().some((i) => {
    const d = new Date(i.at)
    const g = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const h = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    // Un tentativo automatico conta anche se fallito: non si riprova a ogni minuto.
    return (i.auto || i.ok) && g === oggi && h >= ORA_DOMENICA
  })
}

/** Nomi leggibili delle tabelle del controllo calo. */
export const NOMI_CALO: Record<string, string> = {
  sessions: 'sedute', sets: 'serie', bodyMeasurements: 'pesate', foodLogs: 'diario alimentare', whoopDays: 'giornate WHOOP',
}

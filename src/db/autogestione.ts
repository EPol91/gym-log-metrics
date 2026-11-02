// Invio ad Autogestione: il backup completo va al Worker, che lo tiene nel suo
// KV (un backup al giorno: un secondo invio nello stesso giorno sostituisce il
// primo). Sul PC lo script dell'autogestione lo scarica in Autogestione/ETP/.
//
// Il Worker accetta solo questo telefono: quello collegato a WHOOP, con il suo
// codice dispositivo. Nessuna chiave nuova da tenere qui.

import { exportAll, type BackupFile } from './backup'
import { WORKER, deviceId } from './whoop'
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

/** Manda il backup. `forza` = salva anche se ha molte meno righe dell'ultimo. */
export async function invia({ forza = false, auto = false } = {}): Promise<Esito> {
  if (!collegato()) return { tipo: 'collega' }
  const at = new Date().toISOString()
  try {
    const { testo, conti } = await preparaBackup()
    const r = await fetch(`${WORKER}/autogestione/backup?data=${todayLocal()}${forza ? '&forza=1' : ''}`, {
      method: 'POST',
      headers: { 'x-device': deviceId(), 'content-type': 'application/json', 'x-sha1': await sha1(testo), 'x-conti': JSON.stringify(conti) },
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
    const invio = { at, ok: true, testo: `ok · ${kb(j.bytes)}${j.avviso ? ' · vicino al limite' : ''}`, bytes: j.bytes, auto }
    registra(invio)
    return { tipo: 'ok', invio }
  } catch (e) {
    const testo = e instanceof Error && e.message === 'backup non valido' ? 'backup non valido' : 'rete: il Worker non risponde'
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

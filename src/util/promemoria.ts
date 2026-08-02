// I promemoria: le poche cose che vale la pena farsi ricordare.
//
// Regola di fondo: una notifica arriva solo se c'e' qualcosa DA FARE. Un
// promemoria che parte tutti i giorni comunque diventa rumore, e il rumore si
// silenzia — perdendo anche quelle che servivano.
//
// Le decisioni si prendono qui, sui dati; il telefono le consegna e basta.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal, shiftDate } from '../util/date'
import { cicloDi } from '../scores/consistency'
import { getUser } from '../db/repo'
import { ultimoBackup } from '../db/backupAuto'

const U = LOCAL_USER_ID
const SPENTE = 'gymlog.promemoria.spente'
const VISTE = 'gymlog.promemoria.viste'
// Consegnato dal telefono e «messo via» dentro l'app sono due cose diverse:
// una notifica letta nella tendina non deve far sparire la card, e viceversa.
const VIA = 'gymlog.promemoria.via'

export type Tipo = 'ciclo' | 'recupero' | 'peso' | 'whoop' | 'backup'

export const PROMEMORIA: { tipo: Tipo; nome: string; nota: string }[] = [
  { tipo: 'ciclo', nome: 'Ciclo a rischio', nota: 'Quando restano meno giorni delle sedute che ti mancano.' },
  { tipo: 'recupero', nome: 'Recupero alto', nota: 'Al mattino, se il WHOOP è sopra la tua media e non ti alleni da due giorni.' },
  { tipo: 'peso', nome: 'Pesata', nota: 'Se non ti pesi da quattro giorni.' },
  { tipo: 'whoop', nome: 'WHOOP fermo', nota: 'Se non sincronizza da due giorni.' },
  { tipo: 'backup', nome: 'Backup vecchio', nota: 'Se l’ultimo ha più di quattordici giorni.' },
]

function spente(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SPENTE) ?? '[]') as string[]) } catch { return new Set() }
}
export function attivo(t: Tipo): boolean { return !spente().has(t) }
export function accendi(t: Tipo, on: boolean): void {
  const s = spente()
  if (on) s.delete(t); else s.add(t)
  try { localStorage.setItem(SPENTE, JSON.stringify([...s])) } catch { /* ignore */ }
}

/** Cosa e' gia' stato detto oggi: la stessa notizia non si ripete due volte. */
function viste(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VISTE) ?? '{}') as Record<string, string> } catch { return {} }
}
function giaDetto(t: Tipo, oggi: string): boolean { return viste()[t] === oggi }

function letti(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VIA) ?? '{}') as Record<string, string> } catch { return {} }
}
function messoVia(t: Tipo, oggi: string): boolean { return letti()[t] === oggi }
function segna(t: Tipo, oggi: string): void {
  try { localStorage.setItem(VISTE, JSON.stringify({ ...viste(), [t]: oggi })) } catch { /* ignore */ }
}

interface Plugin {
  requestPermissions(): Promise<{ display?: string }>
  schedule(o: { notifications: { id: number; title: string; body: string }[] }): Promise<unknown>
}

function plugin(): Plugin | null {
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, Plugin> }
  }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.LocalNotifications ?? null
}

export function promemoriaDisponibili(): boolean { return !!plugin() }

/** Un messaggio da consegnare, se c'e' davvero qualcosa da dire. */
export interface Avviso { tipo: Tipo; titolo: string; testo: string }

/**
 * Gli avvisi di oggi, per chi li vuole mostrare dentro l'app.
 *
 * Nella tendina di Android arrivano solo nell'app installata e solo se hai dato
 * il permesso: gli stessi avvisi valgono anche a notifiche spente, quindi la
 * lista si puo' chiedere e basta.
 */
export async function avvisiDiOggi(): Promise<Avviso[]> {
  const oggi = todayLocal()
  return (await tutti()).filter((a) => attivo(a.tipo) && !messoVia(a.tipo, oggi))
}

/** Mettilo via fino a domani: oggi l'hai letto. */
export function mettiVia(t: Tipo): void {
  try { localStorage.setItem(VIA, JSON.stringify({ ...letti(), [t]: todayLocal() })) } catch { /* ignore */ }
}

async function tutti(): Promise<Avviso[]> {
  const oggi = todayLocal()
  const out: Avviso[] = []
  const user = await getUser()
  const sedute = (await db.sessions.where('userId').equals(U).toArray()).filter((s) => s.finishedAt)
  const ultimaSeduta = sedute.map((s) => s.date).sort().pop() ?? null

  // Ciclo a rischio: solo quando i giorni che restano non bastano piu' a
  // starci comodi. Prima e' un allarme inutile.
  const sedutePerCiclo = user?.cicloSedute ?? 5
  const giorniCiclo = user?.cicloGiorni ?? 8
  const c = cicloDi(oggi, { sedute: sedutePerCiclo, giorni: giorniCiclo, inizio: user?.cicloInizio ?? undefined })
  const dal = shiftDate(oggi, -(c.giorno - 1))
  const fatte = sedute.filter((s) => s.date >= dal && s.date <= oggi).length
  const mancano = sedutePerCiclo - fatte
  const restano = giorniCiclo - c.giorno + 1
  if (mancano > 0 && restano <= mancano) {
    out.push({
      tipo: 'ciclo',
      titolo: 'Ciclo a rischio',
      testo: `Giorno ${c.giorno} di ${giorniCiclo}: ti mancano ${mancano} sedute in ${restano} giorni.`,
    })
  }

  // Recupero alto sprecato: il WHOOP dice che oggi reggeresti, e sono due
  // giorni che non ti alleni.
  const giorni = await db.whoopDays.where('userId').equals(U).toArray()
  const oggiW = giorni.find((g) => g.date === oggi)
  const conRec = giorni.filter((g) => g.recovery != null)
  const media = conRec.length ? conRec.reduce((a, g) => a + (g.recovery ?? 0), 0) / conRec.length : null
  const fermoDa = ultimaSeduta ? Math.round((Date.parse(oggi) - Date.parse(ultimaSeduta)) / 86_400_000) : 99
  if (oggiW?.recovery != null && media != null && oggiW.recovery > media && fermoDa >= 2) {
    out.push({
      tipo: 'recupero',
      titolo: `Recupero ${oggiW.recovery}%`,
      testo: `Sopra la tua media di ${Math.round(media)}% e sono ${fermoDa} giorni che non ti alleni.`,
    })
  }

  // Pesata: il peso e' il dato che regge meta' degli Score, e si perde in fretta.
  const pesate = await db.bodyMeasurements.where('userId').equals(U).toArray()
  const ultimaPesata = pesate.map((m) => m.date).sort().pop()
  if (!ultimaPesata || Date.parse(oggi) - Date.parse(ultimaPesata) >= 4 * 86_400_000) {
    out.push({ tipo: 'peso', titolo: 'Pesata', testo: ultimaPesata ? `Ultima il ${ultimaPesata}.` : 'Non ti sei mai pesato.' })
  }

  // WHOOP fermo: se non sincronizza, gli Score girano su dati di ieri l'altro.
  const ultimoW = giorni.map((g) => g.date).sort().pop()
  if (ultimoW && Date.parse(oggi) - Date.parse(ultimoW) >= 2 * 86_400_000) {
    out.push({ tipo: 'whoop', titolo: 'WHOOP fermo', testo: `Ultimi dati del ${ultimoW}.` })
  }

  const b = ultimoBackup()
  if (!b || Date.now() - Date.parse(b.quando) > 14 * 86_400_000) {
    out.push({ tipo: 'backup', titolo: 'Backup vecchio', testo: 'I tuoi dati stanno su un telefono solo.' })
  }

  return out
}

/**
 * Guarda se c'e' qualcosa da dire e lo consegna.
 *
 * Si chiama all'avvio: senza un servizio in background non si puo' svegliare
 * il telefono da soli, ma aprire l'app e trovarsi l'avviso vale comunque —
 * e la notifica resta li' anche quando l'app la chiudi.
 */
export async function controllaPromemoria(): Promise<void> {
  const p = plugin()
  if (!p) return
  const oggiD = todayLocal()
  const avvisi = (await tutti()).filter((a) => attivo(a.tipo) && !giaDetto(a.tipo, oggiD))
  if (!avvisi.length) return

  try {
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') return
    const oggi = todayLocal()
    await p.schedule({
      notifications: avvisi.map((a, i) => ({ id: Date.now() % 100000 + i, title: a.titolo, body: a.testo })),
    })
    avvisi.forEach((a) => segna(a.tipo, oggi))
  } catch { /* niente permesso o niente plugin: pazienza, non e' un guasto */ }
}

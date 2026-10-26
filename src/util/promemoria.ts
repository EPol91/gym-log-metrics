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
import { orariDi, fasceDeiPasti, minuti, oraAdesso } from '../tempo/orari'

const U = LOCAL_USER_ID
const SPENTE = 'gymlog.promemoria.spente'
const VISTE = 'gymlog.promemoria.viste'
// Consegnato dal telefono e «messo via» dentro l'app sono due cose diverse:
// una notifica letta nella tendina non deve far sparire la card, e viceversa.
const VIA = 'gymlog.promemoria.via'

export type Tipo = 'ciclo' | 'recupero' | 'peso' | 'whoop' | 'backup' | 'pasto' | 'uscita'

export const PROMEMORIA: { tipo: Tipo; nome: string; nota: string }[] = [
  { tipo: 'ciclo', nome: 'Ciclo a rischio', nota: 'Quando restano meno giorni delle sedute che ti mancano.' },
  { tipo: 'recupero', nome: 'Recupero alto', nota: 'Al mattino, se il WHOOP è sopra la tua media e non ti alleni da due giorni.' },
  { tipo: 'peso', nome: 'Pesata', nota: 'Se non ti pesi da quattro giorni.' },
  { tipo: 'whoop', nome: 'WHOOP fermo', nota: 'Se non sincronizza da due giorni.' },
  { tipo: 'backup', nome: 'Backup vecchio', nota: 'Se l’ultimo ha più di quattordici giorni.' },
  { tipo: 'pasto', nome: 'Ora dei pasti', nota: 'Un quarto d’ora dopo la fine della fascia, se il pasto non ha l’ora. Arriva anche ad app chiusa.' },
  { tipo: 'uscita', nome: 'Uscita dall’ufficio', nota: 'Nei giorni di lavoro, dopo l’orario d’uscita: un tocco se esci più tardi.' },
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
  schedule(o: { notifications: { id: number; title: string; body: string; schedule?: { at: Date; allowWhileIdle?: boolean } }[] }): Promise<unknown>
  cancel(o: { notifications: { id: number }[] }): Promise<unknown>
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
export interface Avviso {
  tipo: Tipo; titolo: string; testo: string
  /** per «Ora dei pasti»: quali pasti sono senza ora */
  pasti?: string[]
}

/**
 * Gli avvisi di oggi, per chi li vuole mostrare dentro l'app.
 *
 * Nella tendina di Android arrivano solo nell'app installata e solo se hai dato
 * il permesso: gli stessi avvisi valgono anche a notifiche spente, quindi la
 * lista si puo' chiedere e basta.
 */
export async function avvisiDiOggi(): Promise<Avviso[]> {
  const oggi = todayLocal()
  const via = pastiMessiVia(oggi)
  return (await tutti())
    .filter((a) => attivo(a.tipo) && (a.tipo === 'pasto' ? (a.pasti ?? []).some((id) => !via.has(id)) : !messoVia(a.tipo, oggi)))
}

/** Mettilo via fino a domani: oggi l'hai letto. Per i pasti, solo quelli che c'erano. */
export function mettiVia(t: Tipo, a?: Avviso): void {
  const oggi = todayLocal()
  if (t === 'pasto') {
    const via = pastiMessiVia(oggi)
    for (const id of a?.pasti ?? []) via.add(id)
    try { localStorage.setItem(PASTI_VIA, JSON.stringify({ data: oggi, ids: [...via] })) } catch { /* ignore */ }
    return
  }
  try { localStorage.setItem(VIA, JSON.stringify({ ...letti(), [t]: oggi })) } catch { /* ignore */ }
}

const PASTI_VIA = 'gymlog.promemoria.pasti.via'
function pastiMessiVia(oggi: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(PASTI_VIA) ?? 'null') as { data: string; ids: string[] } | null
    return new Set(v && v.data === oggi ? v.ids : [])
  } catch { return new Set() }
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

  // Ora dei pasti: fascia finita da un quarto d'ora e il pasto non ha l'ora.
  // Nei giorni col diario vuoto non si chiede niente.
  const orari = orariDi(user)
  const pasti = (await db.meals.where('date').equals(oggi).toArray()).filter((m) => m.userId === U)
  const righe = await db.foodLogs.where('date').equals(oggi).count()
  if (righe > 0) {
    const adesso = minuti(oraAdesso())
    const senza = [...fasceDeiPasti(pasti, orari.pasti)]
      .map(([id, { fascia }]) => ({ m: pasti.find((x) => x.id === id)!, fascia }))
      .filter(({ m, fascia }) => !m.ora && !m.saltato && adesso >= minuti(fascia.alle) + 15)
    if (senza.length) {
      out.push({
        tipo: 'pasto',
        titolo: senza.length === 1 ? `${senza[0].m.name}: a che ora?` : 'Pasti senza ora',
        testo: senza.length === 1
          ? `La fascia è finita alle ${senza[0].fascia.alle}. Segna l'ora, o che l'hai saltato.`
          : `${senza.map((x) => x.m.name).join(', ')}: segna l'ora, o che li hai saltati.`,
        pasti: senza.map((x) => x.m.id),
      })
    }
  }

  // Uscita dall'ufficio: nei giorni di lavoro, da quando dovresti uscire fino a
  // mezz'ora dopo la fine della finestra. Ignorarla vuol dire «all'orario solito».
  const l = orari.lavoro
  const giorno = new Date(oggi + 'T12:00:00').getDay()
  if (l && l.giorni.includes(giorno) && !user?.uscite?.[oggi]) {
    const adesso = minuti(oraAdesso())
    if (adesso >= minuti(l.uscita) && adesso <= minuti(l.uscitaFinoA ?? l.uscita) + 30) {
      out.push({ tipo: 'uscita', titolo: 'Uscito dall’ufficio?', testo: `Se esci dopo le ${l.uscita}, tocca «Esco ora».` })
    }
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
  const avvisi = (await tutti()).filter((a) => a.tipo !== 'pasto' && a.tipo !== 'uscita' && attivo(a.tipo) && !giaDetto(a.tipo, oggiD))
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

/** Le notifiche dei pasti: un numero per fascia, sempre lo stesso, cosi' si sostituiscono. */
const ID_PASTO = 7000

/**
 * Programma sul telefono i promemoria dei pasti di oggi.
 *
 * A fine fascia piu' un quarto d'ora, per ogni pasto ancora senza ora. Li
 * consegna il telefono anche ad app chiusa; quando segni l'ora (o che l'hai
 * saltato) quello del pasto si toglie. Si richiama all'avvio, a ogni ora
 * segnata e a ogni cambio del diario di oggi.
 */
export async function programmaPromemoriaPasti(): Promise<void> {
  const p = plugin()
  if (!p) return
  const oggi = todayLocal()
  const user = await getUser()
  const orari = orariDi(user)
  const tutti = orari.pasti.map((_, i) => ({ id: ID_PASTO + i }))
  try {
    await p.cancel({ notifications: tutti })
    if (!attivo('pasto')) return
    const righe = await db.foodLogs.where('date').equals(oggi).count()
    if (!righe) return // diario vuoto: niente da chiedere
    const pasti = (await db.meals.where('date').equals(oggi).toArray()).filter((m) => m.userId === U)
    const adesso = Date.now()
    const da: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[] = []
    for (const [id, { fascia, indice }] of fasceDeiPasti(pasti, orari.pasti)) {
      const m = pasti.find((x) => x.id === id)!
      if (m.ora || m.saltato) continue
      const quando = new Date(`${oggi}T${fascia.alle}:00`).getTime() + 15 * 60_000
      if (quando <= adesso) continue // gia' passata: c'e' l'avviso in Oggi
      da.push({
        id: ID_PASTO + indice,
        title: `${m.name}: a che ora?`,
        body: `Segna l'ora in Cibo, o che l'hai saltato.`,
        schedule: { at: new Date(quando), allowWhileIdle: true },
      })
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') return
    await p.schedule({ notifications: da })
  } catch { /* niente permesso o niente plugin: restano gli avvisi in Oggi */ }
}

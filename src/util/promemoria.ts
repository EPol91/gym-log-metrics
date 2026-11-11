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
import { domenicaDa, haCirc, prossimeCirc } from '../db/noteCorpo'

const U = LOCAL_USER_ID
const SPENTE = 'gymlog.promemoria.spente'
const VISTE = 'gymlog.promemoria.viste'
// Consegnato dal telefono e «messo via» dentro l'app sono due cose diverse:
// una notifica letta nella tendina non deve far sparire la card, e viceversa.
const VIA = 'gymlog.promemoria.via'

export type Tipo = 'mattino' | 'check' | 'ciclo' | 'recupero' | 'peso' | 'whoop' | 'backup' | 'pasto' | 'uscita'

export const PROMEMORIA: { tipo: Tipo; nome: string; nota: string }[] = [
  { tipo: 'mattino', nome: 'Pesata del mattino', nota: 'Ogni mattina all’ora che scegli, se il peso di oggi non c’è.' },
  { tipo: 'check', nome: 'Giorno del check', nota: 'La domenica all’ora della pesata: peso a digiuno, foto delle 4 pose e le circonferenze quando toccano. Alle 11:00 di nuovo, se le circonferenze mancano ancora.' },
  { tipo: 'pasto', nome: 'Ora dei pasti', nota: '15′ dopo la fine della fascia, se il pasto non ha l’ora. Solo nei giorni in cui hai segnato del cibo.' },
  { tipo: 'uscita', nome: 'Uscita dall’ufficio', nota: 'Nei giorni di lavoro, all’ora d’uscita dei tuoi orari, se non l’hai già segnata.' },
  { tipo: 'ciclo', nome: 'Ciclo a rischio', nota: 'Alle 9:00 del giorno in cui i giorni che restano non bastano più per le sedute che mancano.' },
  { tipo: 'peso', nome: 'Pesata dimenticata', nota: 'Alle 9:00, dopo quattro giorni senza peso. Solo con la pesata del mattino spenta.' },
  { tipo: 'whoop', nome: 'WHOOP fermo', nota: 'Alle 9:00, dopo due giorni senza dati nuovi dal WHOOP.' },
  { tipo: 'backup', nome: 'Backup vecchio', nota: 'Alle 9:00, quando l’ultimo backup ha più di quattordici giorni.' },
  { tipo: 'recupero', nome: 'Recupero alto', nota: 'Solo in Oggi: il recupero di oggi c’è solo dopo che l’app ha sincronizzato il WHOOP, quindi ad app chiusa non si può sapere.' },
]

/** Quelle che il telefono consegna da solo, anche ad app chiusa. */
export const AD_APP_CHIUSA: Tipo[] = ['mattino', 'check', 'pasto', 'uscita', 'ciclo', 'peso', 'whoop', 'backup']

/** L'ora della pesata del mattino: la scegli tu in Promemoria. */
const ORA_MATTINO = 'gymlog.promemoria.mattino.ora'
export function oraPesata(): string {
  try { return localStorage.getItem(ORA_MATTINO) || '07:30' } catch { return '07:30' }
}
export function impostaOraPesata(ora: string): void {
  try { localStorage.setItem(ORA_MATTINO, ora) } catch { /* ignore */ }
}

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
  checkPermissions?(): Promise<{ display?: string }>
  checkExactNotificationSetting?(): Promise<{ exact_alarm?: string }>
  getPending?(): Promise<{ notifications: { id: number; title?: string; schedule?: { at?: string } }[] }>
  schedule(o: { notifications: { id: number; title: string; body: string; schedule?: { at: Date; allowWhileIdle?: boolean } }[] }): Promise<unknown>
  cancel(o: { notifications: { id: number }[] }): Promise<unknown>
}

/** L'ultimo guasto, per il controllo in Notifiche: prima si buttava via e basta. */
const ERRORE = 'gymlog.promemoria.errore'
function annotaErrore(dove: string, e: unknown): void {
  const testo = e instanceof Error ? e.message : String(e)
  try { localStorage.setItem(ERRORE, JSON.stringify({ dove, testo, quando: new Date().toISOString() })) } catch { /* ignore */ }
}

export interface Diagnosi {
  plugin: boolean
  permesso: string
  esatti: string
  inCoda: { id: number; titolo: string; quando: string | null }[]
  errore: { dove: string; testo: string; quando: string } | null
}

/** Come stanno le notifiche sul telefono, per capire perche' non arrivano. */
export async function diagnosiNotifiche(): Promise<Diagnosi> {
  let errore: Diagnosi['errore'] = null
  try { errore = JSON.parse(localStorage.getItem(ERRORE) ?? 'null') } catch { /* ignore */ }
  const p = plugin()
  if (!p) return { plugin: false, permesso: '—', esatti: '—', inCoda: [], errore }
  const prova = async <T,>(f: () => Promise<T> | undefined, ko: T): Promise<T> => {
    try { return (await f()) ?? ko } catch { return ko }
  }
  const perm = await prova(() => p.checkPermissions?.(), { display: 'sconosciuto' })
  const es = await prova(() => p.checkExactNotificationSetting?.(), { exact_alarm: 'sconosciuto' })
  const coda = await prova(() => p.getPending?.(), { notifications: [] })
  return {
    plugin: true,
    permesso: perm.display ?? 'sconosciuto',
    esatti: es.exact_alarm ?? 'sconosciuto',
    inCoda: coda.notifications.map((n) => ({ id: n.id, titolo: n.title ?? '', quando: n.schedule?.at ?? null })),
    errore,
  }
}

/** Una notifica di prova fra un minuto, con l'app aperta o chiusa. */
export async function notificaDiProva(): Promise<string> {
  const p = plugin()
  if (!p) return 'Qui non c’è il plugin delle notifiche (sei nel browser?).'
  try {
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') return `Permesso notifiche: ${perm.display}.`
    await p.schedule({
      notifications: [{ id: 7999, title: 'Prova ETP HEALTH', body: 'Se la leggi, le notifiche funzionano.', schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true } }],
    })
    return 'Programmata fra un minuto: puoi anche chiudere l’app.'
  } catch (e) {
    annotaErrore('prova', e)
    return `Errore: ${e instanceof Error ? e.message : String(e)}`
  }
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
  // Quella del mattino, passata l'ora: finche' il peso di oggi non c'e'. Se c'e'
  // lei, quella dei quattro giorni direbbe la stessa cosa due volte.
  const domenicaDelCheck = attivo('check') && new Date(oggi + 'T12:00:00').getDay() === 0
  const mattino = attivo('mattino') && !domenicaDelCheck && ultimaPesata !== oggi && minuti(oraAdesso()) >= minuti(oraPesata())
  if (mattino) {
    out.push({ tipo: 'mattino', titolo: 'Registra il peso di oggi', testo: 'Appena sveglio, prima di bere e mangiare.' })
  } else if (!ultimaPesata || Date.parse(oggi) - Date.parse(ultimaPesata) >= 4 * 86_400_000) {
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
        titolo: senza.length === 1 ? `${senza[0].m.name}: a che ora hai finito?` : 'Pasti senza ora',
        testo: senza.length === 1
          ? `La fascia è finita alle ${senza[0].fascia.alle}. Segna quando hai finito, o che l'hai saltato.`
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
      out.push({ tipo: 'uscita', titolo: 'Uscito dall’ufficio?', testo: `Di solito alle ${l.uscita}: se è più tardi, segnalo.` })
    }
  }

  if (domenicaDelCheck) {
    out.push({ tipo: 'check', titolo: 'Giorno del check', testo: testoCheck(await cosaDelCheck(oggi)) })
  }

  const b = ultimoBackup()
  if (!b || Date.now() - Date.parse(b.quando) > 14 * 86_400_000) {
    out.push({ tipo: 'backup', titolo: 'Backup vecchio', testo: 'I tuoi dati stanno su un telefono solo.' })
  }

  return out
}

type DaProgrammare = { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }

/** Le 9:00 a partire da quel momento: oggi se non sono ancora passate, se no domani. */
function alleNove(ms: number): number {
  const d = new Date(ms)
  d.setHours(9, 0, 0, 0)
  if (d.getTime() < ms) d.setDate(d.getDate() + 1)
  return d.getTime()
}
const inizioGiorno = (iso: string) => new Date(`${iso}T00:00:00`).getTime()

/** Un numero fisso per avviso, cosi' riprogrammare sostituisce invece di accumulare. */
const ID_AVVISO: Partial<Record<Tipo, number>> = { ciclo: 7301, peso: 7302, whoop: 7303, backup: 7304 }
const ID_USCITA = 7200
const GIORNI_USCITA = 7

/**
 * Programma sul telefono gli avvisi «quando serve»: ciclo, pesata dimenticata,
 * WHOOP fermo, backup vecchio.
 *
 * Dai dati si sa in anticipo il giorno in cui scatterebbero se non fai niente:
 * li si mette alle 9:00 di quel giorno, e il telefono li consegna anche ad app
 * chiusa. Si ricalcolano a ogni seduta, pesata, sincronizzazione e rientro
 * nell'app: se nel frattempo l'hai fatto, la notifica sparisce prima di partire.
 * Se il giorno e' gia' passato arriva subito, una volta al giorno.
 */
export async function programmaAvvisi(): Promise<void> {
  const p = plugin()
  if (!p) return
  const oggi = todayLocal()
  const adesso = Date.now()
  try {
    await p.cancel({ notifications: Object.values(ID_AVVISO).map((id) => ({ id: id! })) })
    const user = await getUser()
    const scatti: { tipo: Tipo; da: number; titolo: string; testo: string }[] = []

    // Ciclo: con le sedute fatte finora, il giorno in cui i giorni che restano
    // diventano pochi quanto le sedute che mancano.
    const sedute = (await db.sessions.where('userId').equals(U).toArray()).filter((s) => s.finishedAt)
    const perCiclo = user?.cicloSedute ?? 5
    const giorniCiclo = user?.cicloGiorni ?? 8
    const c = cicloDi(oggi, { sedute: perCiclo, giorni: giorniCiclo, inizio: user?.cicloInizio ?? undefined })
    const dal = shiftDate(oggi, -(c.giorno - 1))
    const fatte = sedute.filter((s) => s.date >= dal && s.date <= oggi).length
    const mancano = perCiclo - fatte
    if (mancano > 0 && mancano <= giorniCiclo) {
      // Quel giorno restano esattamente tanti giorni quante sedute.
      const g = giorniCiclo - mancano + 1
      scatti.push({ tipo: 'ciclo', da: inizioGiorno(shiftDate(dal, g - 1)), titolo: 'Ciclo a rischio', testo: `Ti mancano ${mancano} ${mancano === 1 ? 'seduta' : 'sedute'} in ${mancano} ${mancano === 1 ? 'giorno' : 'giorni'}.` })
    }

    // Pesata dimenticata: quattro giorni dopo l'ultima. Con quella del mattino
    // accesa direbbe la stessa cosa due volte.
    if (!attivo('mattino')) {
      const ultima = (await db.bodyMeasurements.where('userId').equals(U).toArray()).map((m) => m.date).sort().pop()
      scatti.push({ tipo: 'peso', da: ultima ? inizioGiorno(shiftDate(ultima, 4)) : adesso, titolo: 'Pesata', testo: ultima ? `Ultima il ${ultima}.` : 'Non ti sei mai pesato.' })
    }

    // WHOOP fermo: due giorni dopo gli ultimi dati.
    const ultimoW = (await db.whoopDays.where('userId').equals(U).toArray()).map((g) => g.date).sort().pop()
    if (ultimoW) scatti.push({ tipo: 'whoop', da: inizioGiorno(shiftDate(ultimoW, 2)), titolo: 'WHOOP fermo', testo: `Ultimi dati del ${ultimoW}. Apri l’app per sincronizzare.` })

    // Backup: quattordici giorni dopo l'ultimo.
    const b = ultimoBackup()
    scatti.push({ tipo: 'backup', da: b ? Date.parse(b.quando) + 14 * 86_400_000 : adesso, titolo: 'Backup vecchio', testo: 'I tuoi dati stanno su un telefono solo.' })

    const da: DaProgrammare[] = []
    for (const s of scatti) {
      if (!attivo(s.tipo)) continue
      let quando = alleNove(s.da)
      // Gia' vero adesso: aspetta le 9 solo se sono le 9 di oggi, se no subito.
      const oggiAlleNove = quando > adesso && new Date(quando).toDateString() === new Date(adesso).toDateString()
      if (s.da <= adesso && !oggiAlleNove) {
        // Gia' scattato: subito, ma una volta al giorno. Detto oggi → domani alle 9.
        quando = giaDetto(s.tipo, oggi) ? alleNove(inizioGiorno(shiftDate(oggi, 1))) : adesso + 3000
      }
      // Se parte oggi conta come detto: riaprendo l'app dopo, non si ripete.
      if (new Date(quando).toDateString() === new Date(adesso).toDateString()) segna(s.tipo, oggi)
      da.push({ id: ID_AVVISO[s.tipo]!, title: s.titolo, body: s.testo, schedule: { at: new Date(quando), allowWhileIdle: true } })
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') { annotaErrore('avvisi', `permesso ${perm.display}`); return }
    await p.schedule({ notifications: da })
  } catch (e) { annotaErrore('avvisi', e) }
}

/**
 * L'uscita dall'ufficio: nei prossimi giorni di lavoro, all'ora d'uscita dei
 * tuoi orari. Quella di oggi non parte se l'hai gia' segnata.
 */
export async function programmaUscita(): Promise<void> {
  const p = plugin()
  if (!p) return
  const oggi = todayLocal()
  try {
    await p.cancel({ notifications: Array.from({ length: GIORNI_USCITA }, (_, k) => ({ id: ID_USCITA + k })) })
    if (!attivo('uscita')) return
    const user = await getUser()
    const l = orariDi(user).lavoro
    if (!l) return
    const adesso = Date.now()
    const da: DaProgrammare[] = []
    for (let k = 0; k < GIORNI_USCITA; k++) {
      const giorno = shiftDate(oggi, k)
      if (!l.giorni.includes(new Date(giorno + 'T12:00:00').getDay())) continue
      if (user?.uscite?.[giorno]) continue
      const quando = new Date(`${giorno}T${l.uscita}:00`)
      if (quando.getTime() <= adesso) continue
      da.push({
        id: ID_USCITA + k,
        title: 'Uscito dall’ufficio?',
        body: `Di solito alle ${l.uscita}: se esci più tardi, segnalo in Oggi.`,
        schedule: { at: quando, allowWhileIdle: true },
      })
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') { annotaErrore('uscita', `permesso ${perm.display}`); return }
    await p.schedule({ notifications: da })
  } catch (e) { annotaErrore('uscita', e) }
}

/** Le pose delle foto, nell'ordine di RS. */
const POSE = 'frontale, retro, doppio bicipite, laterale'
const ORA_CIRC = '11:00'

/**
 * Cosa resta da fare la domenica del check. Le foto non si sanno: stanno
 * nell'app di RS, quindi si ricordano sempre.
 */
export async function cosaDelCheck(domenica: string): Promise<{ peso: boolean; circ: boolean }> {
  const misure = await db.bodyMeasurements.where('userId').equals(U).toArray()
  const ultimaPrima = misure.filter((m) => m.date < domenica && haCirc(m)).map((m) => m.date).sort().pop() ?? null
  const dovute = prossimeCirc(ultimaPrima, domenica) === domenica
  return {
    peso: !misure.some((m) => m.date === domenica),
    circ: dovute && !misure.some((m) => m.date === domenica && haCirc(m)),
  }
}

export function testoCheck(c: { peso: boolean; circ: boolean }): string {
  const voci = [c.peso ? 'peso a digiuno' : '', `foto delle 4 pose (${POSE})`, c.circ ? 'circonferenze' : ''].filter(Boolean)
  const t = voci.join(', ')
  return t.charAt(0).toUpperCase() + t.slice(1) + '.'
}

/** Due domeniche alla volta (questa e la prossima), cosi' arriva anche se l'app resta chiusa una settimana. */
const ID_CHECK = 7400

/**
 * La domenica del check: all'ora della pesata la lista di cosa fare, alle 11
 * di nuovo se le circonferenze dovute mancano. Si ricalcola a ogni pesata e
 * misura: fatte le circonferenze, quella delle 11 sparisce.
 */
export async function programmaCheck(): Promise<void> {
  const p = plugin()
  if (!p) return
  try {
    await p.cancel({ notifications: [0, 1, 2, 3].map((k) => ({ id: ID_CHECK + k })) })
    if (!attivo('check')) return
    const prima = domenicaDa(todayLocal())
    const adesso = Date.now()
    const da: DaProgrammare[] = []
    for (const [n, domenica] of [prima, shiftDate(prima, 7)].entries()) {
      const c = await cosaDelCheck(domenica)
      const mattina = new Date(`${domenica}T${oraPesata()}:00`)
      if (mattina.getTime() > adesso) {
        da.push({ id: ID_CHECK + n * 2, title: 'Giorno del check', body: testoCheck(c), schedule: { at: mattina, allowWhileIdle: true } })
      }
      const undici = new Date(`${domenica}T${ORA_CIRC}:00`)
      if (c.circ && undici.getTime() > adesso && undici > mattina) {
        da.push({ id: ID_CHECK + n * 2 + 1, title: 'Circonferenze', body: 'Oggi toccano e non ci sono ancora: segnale in Salute → Corpo.', schedule: { at: undici, allowWhileIdle: true } })
      }
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') { annotaErrore('check', `permesso ${perm.display}`); return }
    await p.schedule({ notifications: da })
  } catch (e) { annotaErrore('check', e) }
}

/** Tutto quello che il telefono deve consegnare da solo, riprogrammato in un colpo. */
export async function programmaTutto(): Promise<void> {
  await programmaPesataMattino()
  await programmaCheck()
  await programmaUscita()
  await programmaAvvisi()
  await programmaPromemoriaPasti()
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
        title: `${m.name}: a che ora hai finito?`,
        body: `Segna in Cibo quando hai finito, o che l'hai saltato.`,
        schedule: { at: new Date(quando), allowWhileIdle: true },
      })
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') return
    await p.schedule({ notifications: da })
  } catch (e) { annotaErrore('pasti', e) }
}

/** La pesata del mattino: un numero per giorno, sempre gli stessi, cosi' si sostituiscono. */
const ID_MATTINO = 7100
const GIORNI_MATTINO = 7

/**
 * Programma sul telefono la pesata del mattino per i prossimi sette giorni.
 *
 * Le consegna il telefono anche ad app chiusa: se non la apri per giorni,
 * arrivano lo stesso. Quella di oggi non parte se il peso c'e' gia' o se l'ora
 * e' passata. Si richiama all'avvio, a ogni pesata e a ogni cambio d'ora.
 */
export async function programmaPesataMattino(): Promise<void> {
  const p = plugin()
  if (!p) return
  const oggi = todayLocal()
  try {
    await p.cancel({ notifications: Array.from({ length: GIORNI_MATTINO }, (_, k) => ({ id: ID_MATTINO + k })) })
    if (!attivo('mattino')) return
    const pesatoOggi = (await db.bodyMeasurements.where('date').equals(oggi).filter((m) => m.userId === U).count()) > 0
    const ora = oraPesata()
    const adesso = Date.now()
    const da: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[] = []
    for (let k = 0; k < GIORNI_MATTINO; k++) {
      const giorno = shiftDate(oggi, k)
      if (k === 0 && pesatoOggi) continue
      if (attivo('check') && new Date(giorno + 'T12:00:00').getDay() === 0) continue // la dice il check
      const quando = new Date(`${giorno}T${ora}:00`)
      if (quando.getTime() <= adesso) continue
      da.push({
        id: ID_MATTINO + k,
        title: 'Registra il peso di oggi',
        body: 'Appena sveglio, prima di bere e mangiare.',
        schedule: { at: quando, allowWhileIdle: true },
      })
    }
    if (!da.length) return
    const perm = await p.requestPermissions()
    if (perm?.display && perm.display !== 'granted') { annotaErrore('pesata', `permesso ${perm.display}`); return }
    await p.schedule({ notifications: da })
  } catch (e) { annotaErrore('pesata', e) }
}

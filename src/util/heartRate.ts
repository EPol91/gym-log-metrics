import { isNativo, connettiNativo, annullaCollegamento } from './fasciaNativa'
import { accendiSeduta, spegniSeduta } from './sedutaViva'

// Live BPM via Web Bluetooth — standard Heart Rate Service (0x180D / 0x2A37).
// Solo browser che supportano Web Bluetooth (Android Chrome, desktop Chrome). iOS/Safari: non supportato.
// Nessun cloud, nessun account: connessione diretta locale alla fascia.

/** Handle di una connessione attiva: nome dispositivo + funzione di chiusura. */
export interface HeartRateHandle { deviceName: string; disconnect: () => void }

// Web Bluetooth non è in lib.dom di default → tipi minimi.
interface BleChar {
  startNotifications(): Promise<BleChar>
  addEventListener(t: 'characteristicvaluechanged', cb: (e: Event) => void): void
  removeEventListener(t: 'characteristicvaluechanged', cb: (e: Event) => void): void
}
interface BleService { getCharacteristic(uuid: string): Promise<BleChar> }
interface BleServer { connect(): Promise<BleServer>; getPrimaryService(uuid: string): Promise<BleService>; disconnect(): void }
interface BleDevice {
  name?: string
  gatt?: BleServer
  addEventListener(t: 'gattserverdisconnected', cb: () => void): void
  removeEventListener(t: 'gattserverdisconnected', cb: () => void): void
}
interface BleNavigator { bluetooth?: { requestDevice(opts: unknown): Promise<BleDevice>; getDevices?(): Promise<BleDevice[]> } }

function ble(): BleNavigator['bluetooth'] | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as BleNavigator).bluetooth
}

export function isHeartRateSupported(): boolean {
  // Nel guscio nativo Web Bluetooth non esiste, ma la fascia si collega lo
  // stesso passando dal plugin: dire "non supportato" li' sarebbe una bugia.
  return ble() != null || isNativo()
}

/** Parsing della misura FC (spec Bluetooth): flag bit0 = valore a 16 bit. */
function parseHeartRate(dv: DataView): number {
  const flags = dv.getUint8(0)
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1)
}

/**
 * La fascia che il telefono si ricorda gia'.
 *
 * Il permesso Bluetooth si da' una volta sola: da li' in poi l'app puo'
 * riattaccarsi a QUEL dispositivo quante volte vuole, senza selettore e senza
 * un tocco tuo. E' questo che permette di riagganciare da soli quando il
 * segnale cade — e senza, meta' seduta resta senza battiti.
 */
export async function knownHeartRateDevice(): Promise<BleDevice | null> {
  const bt = ble()
  if (!bt?.getDevices) return null
  try {
    const noti = await bt.getDevices()
    return noti.find((d) => d.gatt != null) ?? null
  } catch { return null }
}

/** Apre il selettore (serve un gesto tuo) e restituisce la fascia scelta. */
export async function pickHeartRateDevice(): Promise<BleDevice> {
  const bt = ble()
  if (!bt) throw new Error('Web Bluetooth non supportato')
  return bt.requestDevice({ filters: [{ services: ['heart_rate'] }] })
}

/**
 * Attacca le notifiche BPM a una fascia gia' scelta.
 * @param onBpm chiamata a ogni battito ricevuto
 * @param onDisconnect chiamata se la fascia si disconnette da sola
 */
export async function connectHeartRate(
  device: BleDevice,
  onBpm: (bpm: number) => void,
  onDisconnect?: () => void,
): Promise<HeartRateHandle> {
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService('heart_rate')
  const ch = await service.getCharacteristic('heart_rate_measurement')

  const handler = (e: Event) => {
    const dv = (e.target as unknown as { value?: DataView }).value
    if (dv) { const bpm = parseHeartRate(dv); if (bpm > 0) onBpm(bpm) }
  }
  const onGattLost = () => onDisconnect?.()

  ch.addEventListener('characteristicvaluechanged', handler)
  device.addEventListener('gattserverdisconnected', onGattLost)
  await ch.startNotifications()

  return {
    deviceName: device.name?.trim() || 'Fascia',
    disconnect() {
      try {
        ch.removeEventListener('characteristicvaluechanged', handler)
        device.removeEventListener('gattserverdisconnected', onGattLost)
        device.gatt?.disconnect()
      } catch { /* già disconnesso */ }
    },
  }
}

// --- Store singleton: la connessione vive fuori dai componenti React ---
// così la fascia NON si scollega quando esci dal cardio o cambi schermata.
export interface HeartRateState {
  connected: boolean; connecting: boolean
  /** il segnale e' caduto e si sta riprovando da soli */
  retrying: boolean
  bpm: number | null; avgBpm: number | null; maxBpm: number | null; minBpm: number | null; deviceName: string; error: string | null
  /** quando e' arrivato l'ultimo battito (ms) — per sapere se il flusso e' vivo */
  ultimoBattitoMs: number | null
  /** quanti battiti sono arrivati da quando ti sei collegato */
  battitiRicevuti: number
  /** quando il plugin ha annunciato l'ultima disconnessione (ms) */
  ultimaCadutaMs: number | null
}
let hrState: HeartRateState = {
  connected: false, connecting: false, retrying: false, bpm: null, avgBpm: null, maxBpm: null, minBpm: null,
  deviceName: '', error: null, ultimoBattitoMs: null, battitiRicevuti: 0, ultimaCadutaMs: null,
}
let hrHandle: HeartRateHandle | null = null
let hrAcc = { sum: 0, count: 0 }
const hrSubs = new Set<() => void>()
// La fascia di questa sessione: si ricorda per poterla riagganciare da soli.
let hrDevice: BleDevice | null = null
// Staccata da te o caduta da sola? Solo nel secondo caso si riprova: se hai
// premuto Scollega, riattaccarsi ogni tre secondi sarebbe una molestia.
let hrVoluto = false

/**
 * Chi guarda viene avvisato al massimo quattro volte al secondo.
 *
 * Ogni battito faceva ridisegnare l'intera schermata di allenamento. A cuore
 * alto sono tre volte al secondo per tutta la seduta, e soprattutto: se il
 * telefono ha tenuto da parte l'arretrato mentre eri fuori dall'app, al rientro
 * quei ridisegni arrivano tutti in fila e il filo dell'interfaccia non fa
 * altro. Il numero a schermo non ha bisogno di piu' di quattro aggiornamenti al
 * secondo — l'occhio non li vede comunque.
 */
let avvisoTimer: number | null = null
function avvisa(subito: boolean) {
  if (subito) {
    if (avvisoTimer != null) { clearTimeout(avvisoTimer); avvisoTimer = null }
    hrSubs.forEach((f) => f())
    return
  }
  if (avvisoTimer != null) return
  avvisoTimer = setTimeout(() => { avvisoTimer = null; hrSubs.forEach((f) => f()) }, 250) as unknown as number
}

/** `subito` false = aggiornamento di routine (un battito), si puo' raggruppare. */
function hrSet(patch: Partial<HeartRateState>, subito = true) { hrState = { ...hrState, ...patch }; avvisa(subito) }

export function hrSubscribe(cb: () => void): () => void { hrSubs.add(cb); return () => { hrSubs.delete(cb) } }
export function hrGetState(): HeartRateState { return hrState }

function onBattito(v: number) {
  registra(v)
  hrAcc.sum += v; hrAcc.count++
  hrSet({
    bpm: v, avgBpm: Math.round(hrAcc.sum / hrAcc.count),
    maxBpm: Math.max(hrState.maxBpm ?? 0, v), minBpm: Math.min(hrState.minBpm ?? 999, v),
    ultimoBattitoMs: Date.now(), battitiRicevuti: hrState.battitiRicevuti + 1,
  }, false)
}

/** Il segnale e' caduto: si riprova da soli finche' non torna. */
function onPerso() {
  hrHandle = null
  hrSet({ connected: false, bpm: null, retrying: !hrVoluto, ultimaCadutaMs: Date.now() })
  if (!hrVoluto) riprova(true)
}

/**
 * Un tentativo per volta. Sul serio, questa volta.
 *
 * Prima il posto si liberava allo scadere di un cronometro di dodici secondi —
 * ma la chiamata al Bluetooth, scaduta o no, restava viva nel nativo. Ogni
 * dodici secondi ne partiva un'altra sopra la precedente: un quarto d'ora fuori
 * dall'app e sul ponte c'erano decine di connessioni appese. Il ponte gira
 * sullo stesso filo dell'interfaccia, e al rientro te le scaricava tutte
 * addosso: app bloccata, con lo scorrimento ancora vivo. Era questo.
 *
 * Adesso il posto lo libera la RISPOSTA del Bluetooth, non l'orologio. Il
 * cronometro resta solo come ultima spiaggia: se un tentativo non risponde piu'
 * per tre quarti di minuto si sgancia la linea e si riparte puliti — mai due
 * chiamate vive insieme.
 */
let inCorso: Promise<HeartRateHandle> | null = null
let inCorsoDa = 0

/** Le attese fra un tentativo e l'altro: crescono, cosi' non e' mai una raffica. */
const ATTESE_MS = [3_000, 6_000, 12_000, 30_000, 60_000]
let passo = 0

/** Oltre questo, il tentativo appeso si considera perso e la linea si sgancia. */
const APPESO_MS = 45_000

let attesaTimer: number | null = null
let appesoTimer: number | null = null
/** Il numero del tentativo in corso: uno che risponde in ritardo non deve sorpassare quello nuovo. */
let gen = 0

/**
 * Si riprova anche con l'app in secondo piano: cambiare canzone su Spotify non
 * e' un motivo per smettere di registrare il cuore. A tenere sveglia l'app
 * mentre sei fuori ci pensa il servizio in primo piano (vedi sedutaViva.ts):
 * senza quello Android congela tutto e questi tentativi non servirebbero a
 * niente.
 */
function riprova(subito = false) {
  if (hrVoluto || hrState.connected) return
  if (!hrDevice && !isNativo()) return
  if (attesaTimer != null) return
  // Una chiamata e' ancora viva: si aspetta lei, non se ne apre un'altra.
  if (inCorso && Date.now() - inCorsoDa < APPESO_MS) return

  // Il primo tentativo dopo la caduta e' immediato: quello non conta come
  // fallimento, quindi le attese partono dalla prima della lista.
  const attesa = subito ? 0 : ATTESE_MS[Math.min(Math.max(passo - 1, 0), ATTESE_MS.length - 1)]
  attesaTimer = setTimeout(() => { attesaTimer = null; void tenta() }, attesa) as unknown as number
}

async function tenta(): Promise<void> {
  if (hrVoluto || hrState.connected) return
  // Rimasta appesa dalla volta prima: prima si chiude, o la linea resta occupata.
  if (inCorso) { inCorso = null; await annullaCollegamento() }
  if (hrVoluto || hrState.connected) return

  const mio = ++gen
  const p = isNativo() || !hrDevice
    ? connettiNativo(onBattito, onPerso, true)
    : connectHeartRate(hrDevice, onBattito, onPerso)
  inCorso = p
  inCorsoDa = Date.now()

  // Se non risponde piu' nessuno, qualcuno deve pur svegliare la riprova: la
  // promessa appesa non chiama nemmeno il proprio `finally`, e senza questo la
  // fascia resterebbe giu' per tutta la seduta.
  if (appesoTimer != null) clearTimeout(appesoTimer)
  appesoTimer = setTimeout(() => {
    appesoTimer = null
    if (mio === gen && !hrState.connected && !hrVoluto) riprova(true)
  }, APPESO_MS) as unknown as number

  try {
    const h = await p
    // Arrivata tardi, quando ne era gia' partita un'altra: si chiude e si fa
    // finta di niente, altrimenti restano due collegamenti vivi sulla stessa fascia.
    if (mio !== gen) { h.disconnect(); return }
    hrHandle = h
    passo = 0
    hrSet({ connected: true, connecting: false, retrying: false, deviceName: h.deviceName, error: null, ultimoBattitoMs: Date.now() })
  } catch {
    if (mio === gen) passo++ // ancora fuori portata: si riprova, ma piu' piano
  } finally {
    if (mio === gen) {
      if (appesoTimer != null) { clearTimeout(appesoTimer); appesoTimer = null }
      if (inCorso === p) inCorso = null
      if (!hrState.connected && !hrVoluto) riprova()
    }
  }
}

/**
 * Rientri nell'app: si riprova subito, senza aspettare il giro lungo.
 *
 * Le riprove vanno avanti anche mentre sei fuori — il servizio in primo piano
 * serve a questo — ma se la fascia era fuori portata le attese si sono allungate
 * fino a un minuto. Nel momento in cui torni a guardare lo schermo, un minuto di
 * cuore vuoto si vede: qui si riparte dalla prima attesa e si tenta all'istante.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (hrState.connected || hrVoluto || (!hrDevice && !isNativo())) return
    fermaRiprove()
    riprova(true)
  })
}

function fermaRiprove() {
  if (attesaTimer != null) { clearTimeout(attesaTimer); attesaTimer = null }
  if (appesoTimer != null) { clearTimeout(appesoTimer); appesoTimer = null }
  gen++
  passo = 0
}

/** Collega la fascia. Il selettore si apre solo se il telefono non ne conosce gia' una. */
export async function hrConnect(): Promise<void> {
  if (hrState.connecting || hrState.connected) return
  hrSet({ connecting: true, error: null })
  try {
    hrVoluto = false
    if (isNativo()) {
      // Dentro l'app installata il collegamento passa dal plugin nativo.
      hrHandle = await connettiNativo(onBattito, onPerso)
      hrDevice = null
    } else {
      hrDevice = (await knownHeartRateDevice()) ?? (await pickHeartRateDevice())
      hrHandle = await connectHeartRate(hrDevice, onBattito, onPerso)
    }
    hrSet({ connected: true, connecting: false, retrying: false, deviceName: hrHandle.deviceName, ultimoBattitoMs: Date.now() })
  } catch (e) {
    // L'errore vero, non un generico «fallita»: senza, un permesso negato e un
    // plugin che non risponde sono lo stesso messaggio e non si capisce cosa fare.
    const msg = ((e as Error)?.message ?? '').trim()
    hrSet({
      connecting: false,
      error: /cancel|annull/i.test(msg) ? null : msg ? `Fascia: ${msg}` : 'Connessione fascia fallita.',
    })
  }
}

/**
 * Collegamento silenzioso: solo se il telefono conosce gia' la fascia.
 *
 * Serve dopo un ricarico della pagina, dove la connessione muore ma il permesso
 * resta: riattacca senza chiederti niente. Se non c'e' niente da riattaccare
 * non fa nulla e non disturba.
 */
export async function hrReconnectKnown(): Promise<boolean> {
  if (hrState.connected || hrState.connecting) return true
  if (isNativo()) {
    hrSet({ connecting: true, error: null })
    try {
      hrVoluto = false
      hrHandle = await connettiNativo(onBattito, onPerso, true)
      hrSet({ connected: true, connecting: false, retrying: false, deviceName: hrHandle.deviceName, ultimoBattitoMs: Date.now() })
      return true
    } catch { hrSet({ connecting: false }); return false }
  }
  const d = await knownHeartRateDevice()
  if (!d) return false
  hrSet({ connecting: true, error: null })
  try {
    hrVoluto = false
    hrDevice = d
    hrHandle = await connectHeartRate(d, onBattito, onPerso)
    hrSet({ connected: true, connecting: false, retrying: false, deviceName: hrHandle.deviceName })
    return true
  } catch {
    hrSet({ connecting: false })
    return false
  }
}

export function hrDisconnect(): void {
  hrVoluto = true
  fermaRiprove()
  inCorso = null
  hrHandle?.disconnect(); hrHandle = null; hrDevice = null
  hrSet({ connected: false, retrying: false, bpm: null })
}
export function hrResetAvg(): void { hrAcc = { sum: 0, count: 0 }; hrSet({ avgBpm: null, maxBpm: null, minBpm: null }) }

// --- Registrazione per la seduta ---------------------------------------------
//
// La media da sola non basta: senza sapere QUANDO e' stata letta, non si puo'
// distinguere il cuore di tutta la seduta da quello del solo cardio finale.
// Qui si tiene una lettura ogni cinque secondi, che su novanta minuti fa circa
// mille numeri — leggeri da salvare, abbastanza fitti da non perdere i picchi.

const PASSO_SEC = 5

let rec: { sessionId: string; t0: number; bpm: number[]; ultimo: number } | null = null
let salva: ((sessionId: string, serie: { t0: string; step: number; bpm: number[] }) => void) | null = null
let timer: number | null = null

/** Chi salva le letture (il database) lo decide chi monta l'app, non questo file. */
export function hrOnSave(fn: typeof salva): void { salva = fn }

/** Comincia a registrare per questa seduta. Ripartire sulla stessa non azzera. */
export function hrStartRecording(sessionId: string, gia?: { t0: string; step: number; bpm: number[] }): void {
  // La notifica fissa: da qui in poi Android sa che questa app sta registrando
  // e smette di congelarla appena esci. E' la differenza fra "continua a
  // funzionare fuori dall'app" e "al rientro trovi tutto fermo".
  accendiSeduta()
  if (rec?.sessionId === sessionId) return
  rec = gia?.bpm?.length
    ? { sessionId, t0: new Date(gia.t0).getTime(), bpm: [...gia.bpm], ultimo: 0 }
    : { sessionId, t0: Date.now(), bpm: [], ultimo: 0 }
  // Ogni cinque secondi si scrive. Erano trenta, e un aggiornamento che ricarica
  // la pagina si portava via mezzo minuto di battiti: scrivere un array di
  // numeri costa niente, perderli costa una seduta.
  if (timer == null) timer = setInterval(() => hrFlush(), 15_000) as unknown as number
  // E comunque un'ultima volta prima che la pagina se ne vada: pagehide e'
  // l'unico evento che Android garantisce quando chiude o ricarica.
  if (typeof window !== 'undefined' && !attaccatoAllaChiusura) {
    window.addEventListener('pagehide', () => hrFlush(true))
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hrFlush(true) })
    attaccatoAllaChiusura = true
  }
}

let attaccatoAllaChiusura = false

/**
 * Scrive quello che c'e' adesso — ma solo se e' cambiato.
 *
 * Prima riscriveva l'intera serie ogni cinque secondi anche quando non era
 * arrivato nessun battito nuovo: su una seduta lunga sono migliaia di numeri
 * riserializzati di continuo, sul filo che serve a rispondere ai tocchi.
 */
let ultimoScritto = -1
let ultimoScrittoMs = 0

export function hrFlush(forza = false): void {
  if (!rec || !salva || !rec.bpm.length) return
  const ora = Date.now()
  if (!forza && rec.bpm.length === ultimoScritto && ora - ultimoScrittoMs < 60_000) return
  if (!forza && ora - ultimoScrittoMs < 15_000) return
  ultimoScritto = rec.bpm.length
  ultimoScrittoMs = ora
  salva(rec.sessionId, { t0: new Date(rec.t0).toISOString(), step: PASSO_SEC, bpm: rec.bpm })
}

/** Chiude la registrazione della seduta e scrive l'ultima volta. */
export function hrStopRecording(): void {
  hrFlush(true)
  spegniSeduta()
  // Seduta chiusa e fascia gia' caduta: non c'e' piu' niente da registrare, e
  // continuare a cercarla per ore non serve a nessuno.
  if (!hrState.connected) { hrVoluto = true; fermaRiprove(); inCorso = null }
  rec = null
  if (timer != null) { clearInterval(timer); timer = null }
}

export function hrRecordingFor(): string | null { return rec?.sessionId ?? null }

/**
 * Mette la lettura nella casella giusta secondo il tempo passato: se la fascia
 * tace per un minuto restano buchi, e i buchi sono la verita' — riempirli
 * inventerebbe battiti che non ci sono stati.
 */
/**
 * Il tetto della serie: sei ore a una lettura ogni cinque secondi.
 *
 * Senza, una seduta lasciata aperta per giorni fa crescere l'array all'infinito
 * — e ogni cinque secondi viene riscritto per intero nel database. Piu' cresce,
 * piu' quella scrittura costa, finche' il filo principale non fa altro: da
 * fuori, l'app bloccata. Nessun allenamento dura sei ore; se le supera, il
 * cuore smette di allungarsi invece di trascinare giu' tutto.
 */
const MAX_LETTURE = (6 * 3600) / PASSO_SEC

function registra(v: number): void {
  if (!rec) return
  const i = Math.floor((Date.now() - rec.t0) / (PASSO_SEC * 1000))
  if (i < 0 || i >= MAX_LETTURE) return
  // Le caselle saltate restano vuote, segnate con 0: nessun cuore batte a zero,
  // e chi legge sa che li' la fascia taceva. Riempirle con l'ultimo battito
  // buono — come faceva prima, al contrario di quanto diceva questo commento —
  // inventa minuti interi di sforzo che non hai fatto.
  // I buchi restano zeri — nessun cuore batte a zero, e chi legge sa che li' la
  // fascia taceva — ma si scrivono in blocco: uno per uno, dopo una pausa lunga,
  // sarebbero migliaia di passaggi a mano.
  if (rec.bpm.length < i) {
    const da = rec.bpm.length
    rec.bpm.length = i
    rec.bpm.fill(0, da)
  }
  rec.bpm[i] = v
  rec.ultimo = v
}

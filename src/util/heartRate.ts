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
  return ble() != null
}

/** Parsing della misura FC (spec Bluetooth): flag bit0 = valore a 16 bit. */
function parseHeartRate(dv: DataView): number {
  const flags = dv.getUint8(0)
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1)
}

/**
 * Apre il selettore fascia (richiede un gesto utente), si connette e avvia le notifiche BPM.
 * @param onBpm chiamata a ogni battito ricevuto
 * @param onDisconnect chiamata se la fascia si disconnette da sola
 */
export async function connectHeartRate(
  onBpm: (bpm: number) => void,
  onDisconnect?: () => void,
): Promise<HeartRateHandle> {
  const bt = ble()
  if (!bt) throw new Error('Web Bluetooth non supportato')

  // Se il telefono si ricorda gia' la tua fascia, si riaggancia quella e basta:
  // il selettore e' un passaggio in piu' per scegliere l'unica cosa che hai
  // addosso. Dove getDevices non c'e' (o non ha ricordi) si torna al selettore.
  let device: BleDevice | undefined
  try {
    const noti = (await bt.getDevices?.()) ?? []
    device = noti.find((d) => d.gatt != null)
  } catch { /* niente ricordi: si chiede */ }
  if (!device) device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] })
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
  connected: boolean; connecting: boolean; bpm: number | null; avgBpm: number | null; maxBpm: number | null; minBpm: number | null; deviceName: string; error: string | null
}
let hrState: HeartRateState = { connected: false, connecting: false, bpm: null, avgBpm: null, maxBpm: null, minBpm: null, deviceName: '', error: null }
let hrHandle: HeartRateHandle | null = null
let hrAcc = { sum: 0, count: 0 }
const hrSubs = new Set<() => void>()

function hrSet(patch: Partial<HeartRateState>) { hrState = { ...hrState, ...patch }; hrSubs.forEach((f) => f()) }

export function hrSubscribe(cb: () => void): () => void { hrSubs.add(cb); return () => { hrSubs.delete(cb) } }
export function hrGetState(): HeartRateState { return hrState }

export async function hrConnect(): Promise<void> {
  if (hrState.connecting || hrState.connected) return
  hrSet({ connecting: true, error: null })
  try {
    hrHandle = await connectHeartRate(
      (v) => {
        registra(v)
        hrAcc.sum += v; hrAcc.count++
        hrSet({ bpm: v, avgBpm: Math.round(hrAcc.sum / hrAcc.count), maxBpm: Math.max(hrState.maxBpm ?? 0, v), minBpm: Math.min(hrState.minBpm ?? 999, v) })
      },
      () => { hrHandle = null; hrSet({ connected: false, bpm: null }) },
    )
    hrSet({ connected: true, connecting: false, deviceName: hrHandle.deviceName })
  } catch (e) {
    const msg = (e as Error)?.message ?? ''
    hrSet({ connecting: false, error: /cancel/i.test(msg) ? null : 'Connessione fascia fallita.' })
  }
}

export function hrDisconnect(): void { hrHandle?.disconnect(); hrHandle = null; hrSet({ connected: false, bpm: null }) }
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
  if (rec?.sessionId === sessionId) return
  rec = gia?.bpm?.length
    ? { sessionId, t0: new Date(gia.t0).getTime(), bpm: [...gia.bpm], ultimo: 0 }
    : { sessionId, t0: Date.now(), bpm: [], ultimo: 0 }
  // Ogni trenta secondi si scrive: se l'app muore a meta' seduta non perdi tutto.
  if (timer == null) timer = setInterval(() => hrFlush(), 30_000) as unknown as number
}

/** Scrive quello che c'e' adesso. */
export function hrFlush(): void {
  if (!rec || !salva || !rec.bpm.length) return
  salva(rec.sessionId, { t0: new Date(rec.t0).toISOString(), step: PASSO_SEC, bpm: rec.bpm })
}

/** Chiude la registrazione della seduta e scrive l'ultima volta. */
export function hrStopRecording(): void {
  hrFlush()
  rec = null
  if (timer != null) { clearInterval(timer); timer = null }
}

export function hrRecordingFor(): string | null { return rec?.sessionId ?? null }

/**
 * Mette la lettura nella casella giusta secondo il tempo passato: se la fascia
 * tace per un minuto restano buchi, e i buchi sono la verita' — riempirli
 * inventerebbe battiti che non ci sono stati.
 */
function registra(v: number): void {
  if (!rec) return
  const i = Math.floor((Date.now() - rec.t0) / (PASSO_SEC * 1000))
  if (i < 0) return
  // Le caselle saltate restano vuote, segnate con 0: nessun cuore batte a zero,
  // e chi legge sa che li' la fascia taceva. Riempirle con l'ultimo battito
  // buono — come faceva prima, al contrario di quanto diceva questo commento —
  // inventa minuti interi di sforzo che non hai fatto.
  while (rec.bpm.length < i) rec.bpm.push(0)
  rec.bpm[i] = v
  rec.ultimo = v
}

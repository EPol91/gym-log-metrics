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
interface BleNavigator { bluetooth?: { requestDevice(opts: unknown): Promise<BleDevice> } }

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

  const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] })
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
  connected: boolean; connecting: boolean; bpm: number | null; avgBpm: number | null; maxBpm: number | null; deviceName: string; error: string | null
}
let hrState: HeartRateState = { connected: false, connecting: false, bpm: null, avgBpm: null, maxBpm: null, deviceName: '', error: null }
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
        hrAcc.sum += v; hrAcc.count++
        hrSet({ bpm: v, avgBpm: Math.round(hrAcc.sum / hrAcc.count), maxBpm: Math.max(hrState.maxBpm ?? 0, v) })
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
export function hrResetAvg(): void { hrAcc = { sum: 0, count: 0 }; hrSet({ avgBpm: null, maxBpm: null }) }

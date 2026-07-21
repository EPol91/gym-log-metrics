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

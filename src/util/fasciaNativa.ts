// La fascia cardio quando l'app gira dentro il guscio nativo.
//
// Nel telefono l'app non e' piu' dentro Chrome ma dentro una WebView, e la
// WebView **non ha Web Bluetooth**: senza questo ponte, nell'app installata il
// battito non si collegherebbe piu' — una funzione che oggi funziona sarebbe
// sparita passando alla nativa.
//
// Qui si parla lo stesso linguaggio del modulo web (stesso servizio 0x180D,
// stessa caratteristica 0x2A37, stesso parsing), solo attraverso il plugin
// nativo. Il resto dell'app non sa niente di tutto questo e non deve saperlo.

import type { HeartRateHandle } from './heartRate'

const SERVIZIO = '0000180d-0000-1000-8000-00805f9b34fb'
const MISURA = '00002a37-0000-1000-8000-00805f9b34fb'

interface Ble {
  initialize(): Promise<void>
  requestDevice(o: { services: string[] }): Promise<{ deviceId: string; name?: string }>
  connect(id: string, onDisconnect?: (id: string) => void): Promise<void>
  disconnect(id: string): Promise<void>
  startNotifications(id: string, s: string, c: string, cb: (v: DataView) => void): Promise<void>
  stopNotifications(id: string, s: string, c: string): Promise<void>
  getDevices(ids: string[]): Promise<{ deviceId: string; name?: string }[]>
}

/** Gira dentro il guscio nativo? Se no, si usa Web Bluetooth come sempre. */
export function isNativo(): boolean {
  const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/**
 * Il plugin preso dal ponte iniettato dal guscio, non da quello impacchettato
 * con l'app.
 *
 * Nella pagina convivono due Capacitor: quello che il guscio inietta — l'unico
 * collegato ad Android — e quello che finisce nel bundle con `import`. Il
 * secondo risponde «non implementato» e il collegamento falliva subito: e' lo
 * stesso inganno gia' visto con i passi di Health Connect.
 */
interface Grezzo {
  initialize(o: Record<string, unknown>): Promise<unknown>
  requestDevice(o: { services: string[] }): Promise<{ deviceId: string; name?: string }>
  getDevices(o: { deviceIds: string[] }): Promise<{ devices: { deviceId: string; name?: string }[] }>
  connect(o: { deviceId: string }): Promise<unknown>
  disconnect(o: { deviceId: string }): Promise<unknown>
  startNotifications(o: { deviceId: string; service: string; characteristic: string }): Promise<unknown>
  stopNotifications(o: { deviceId: string; service: string; characteristic: string }): Promise<unknown>
  addListener(evento: string, cb: (e: { value?: string }) => void): Promise<{ remove(): Promise<void> }>
}

function grezzo(): Grezzo | null {
  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, Grezzo> } }).Capacitor
  return cap?.Plugins?.BluetoothLe ?? null
}

/** Il valore delle notifiche arriva come stringa esadecimale: «3c 48». */
function aDataView(hex?: string): DataView {
  const byte = (hex ?? '').match(/[0-9a-f]{2}/gi) ?? []
  return new DataView(Uint8Array.from(byte.map((b) => parseInt(b, 16))).buffer)
}

/** Il ponte vero, con la stessa forma del client del pacchetto. */
function ponte(p: Grezzo): Ble {
  const ascolti = new Map<string, { remove(): Promise<void> }>()
  const chiave = (id: string, s: string, c: string) => `notification|${id}|${s}|${c}`

  return {
    // androidNeverForLocation: la fascia non serve a capire dove sei, e nel
    // manifest il permesso di posizione precisa si ferma ad Android 11. Senza
    // questa riga il plugin lo pretende e si rifiuta di partire.
    initialize: () => p.initialize({ androidNeverForLocation: true }).then(() => undefined),
    requestDevice: (o) => p.requestDevice(o),
    getDevices: async (ids) => (await p.getDevices({ deviceIds: ids })).devices,
    async connect(id, onDisconnect) {
      if (onDisconnect) {
        const k = `disconnected|${id}`
        await ascolti.get(k)?.remove()
        ascolti.set(k, await p.addListener(k, () => onDisconnect(id)))
      }
      await p.connect({ deviceId: id })
    },
    disconnect: (id) => p.disconnect({ deviceId: id }).then(() => undefined),
    async startNotifications(id, s, c, cb) {
      const k = chiave(id, s, c)
      await ascolti.get(k)?.remove()
      ascolti.set(k, await p.addListener(k, (e) => cb(aDataView(e?.value))))
      await p.startNotifications({ deviceId: id, service: s, characteristic: c })
    },
    async stopNotifications(id, s, c) {
      const k = chiave(id, s, c)
      await ascolti.get(k)?.remove()
      ascolti.delete(k)
      await p.stopNotifications({ deviceId: id, service: s, characteristic: c })
    },
  }
}

let ble: Ble | null = null
async function plugin(): Promise<Ble> {
  if (ble) return ble
  const p = grezzo()
  if (!p) throw new Error('Ponte Bluetooth assente: chiudi e riapri l’app.')
  const b = ponte(p)
  await b.initialize()
  ble = b
  return b
}

/** L'ultima fascia usata: ricollegarsi non deve rifare il giro della scelta. */
const RICORDO = 'fascia-nativa-id'

/**
 * Apre il selettore nativo, si collega e avvia le notifiche.
 * Stessa firma di `connectHeartRate`, cosi' lo store non cambia di una riga.
 */
export async function connettiNativo(
  onBpm: (bpm: number) => void,
  onDisconnect?: () => void,
  soloRicordata = false,
): Promise<HeartRateHandle> {
  const b = await plugin()

  let deviceId: string | null = null
  let nome = 'Fascia'
  const ricordata = localStorage.getItem(RICORDO)
  if (ricordata) {
    // Gia' vista: ci si riattacca senza chiedere niente, come su Chrome.
    const noti = await b.getDevices([ricordata]).catch(() => [])
    if (noti.length) { deviceId = noti[0].deviceId; nome = noti[0].name?.trim() || nome }
    else if (soloRicordata) deviceId = ricordata
  }
  if (!deviceId) {
    if (soloRicordata) throw new Error('Nessuna fascia da riagganciare')
    const scelta = await b.requestDevice({ services: [SERVIZIO] })
    deviceId = scelta.deviceId
    nome = scelta.name?.trim() || nome
    localStorage.setItem(RICORDO, deviceId)
  }

  await b.connect(deviceId, () => onDisconnect?.())
  await b.startNotifications(deviceId, SERVIZIO, MISURA, (dv) => {
    // Spec Bluetooth: bit 0 del flag = valore a 16 bit. Identico al modulo web.
    const flags = dv.getUint8(0)
    const bpm = flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1)
    if (bpm > 0) onBpm(bpm)
  })

  const id = deviceId
  return {
    deviceName: nome,
    disconnect() {
      void b.stopNotifications(id, SERVIZIO, MISURA).catch(() => {})
      void b.disconnect(id).catch(() => {})
    },
  }
}

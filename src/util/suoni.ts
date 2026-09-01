// I suoni dei timer, scritti nota per nota.
//
// Non sono file: sono sequenze di note che l'app genera al volo. Vuol dire
// nessun peso nell'APK, nessuna licenza da rispettare — e la stessa tabella
// vale dentro e fuori dall'app, perche' viaggia col comando dei bip fino al
// servizio nativo. Un posto solo: due liste separate col tempo divergono, e ti
// ritroveresti un suono in palestra e un altro col telefono in mano.
//
// Le voci sono quattro, una per momento:
//   tic     il conto alla rovescia, l'ultimo secondo prima che scada
//   via     il recupero e' finito, si riparte
//   riposo  il lavoro e' finito, si respira
//   fine    la seduta o il cardio sono chiusi
//
// Quali suoni: nei timer da palestra ricorrono sempre gli stessi — beep,
// campanella da ring, cicalino, gong. Campanella e gong qui sono imitazioni:
// il suono vero e' un campione registrato, e questo e' un'onda costruita.

export type Onda = 'square' | 'sine' | 'triangle'

/** `hz` a 0 e' silenzio: serve a distanziare le note. */
export type Nota = [hz: number, ms: number]

export interface Voce {
  note: Nota[]
  onda: Onda
  /**
   * La coda si spegne da sola invece di tagliarsi netta. E' quello che
   * distingue una campana da un beep: la stessa nota, con o senza il decadimento.
   */
  decadi?: boolean
  /** Vibrazione che accompagna, in millisecondi (pausa, durata, pausa…). */
  vibra?: number[]
}

export interface Suono {
  key: string
  nome: string
  /** Una riga per capire cosa stai scegliendo senza doverlo per forza sentire. */
  descrizione: string
  voci: Record<'tic' | 'via' | 'riposo' | 'fine', Voce>
}

export const SUONI: Suono[] = [
  {
    key: 'beep',
    nome: 'Beep',
    descrizione: 'Tre tic acuti e un tono lungo. Lo standard dei timer a intervalli: squadrato, buca la musica.',
    voci: {
      tic: { note: [[1000, 90]], onda: 'square', vibra: [0, 30] },
      via: { note: [[1320, 160], [0, 70], [1320, 160], [0, 70], [1320, 160], [0, 70], [1600, 520]], onda: 'square', vibra: [0, 200, 80, 200, 80, 200] },
      riposo: { note: [[660, 170], [0, 30], [480, 300]], onda: 'square', vibra: [0, 140] },
      fine: { note: [[784, 180], [988, 180], [1175, 180], [0, 60], [1568, 550]], onda: 'square', vibra: [0, 150, 70, 250, 70, 250] },
    },
  },
  {
    key: 'campana',
    nome: 'Campanella da ring',
    descrizione: 'Il colpo metallico che chiude la ripresa. Squillante, si spegne risuonando.',
    voci: {
      tic: { note: [[1480, 70]], onda: 'triangle', decadi: true, vibra: [0, 30] },
      via: { note: [[1180, 450], [0, 60], [1180, 900]], onda: 'triangle', decadi: true, vibra: [0, 200, 80, 200] },
      riposo: { note: [[880, 700]], onda: 'triangle', decadi: true, vibra: [0, 140] },
      fine: { note: [[1180, 400], [0, 80], [1180, 400], [0, 80], [1180, 1100]], onda: 'triangle', decadi: true, vibra: [0, 150, 70, 250, 70, 250] },
    },
  },
  {
    key: 'cicalino',
    nome: 'Cicalino',
    descrizione: 'Ronzio basso e ruvido, come la sirena di fine tempo. Il piu’ difficile da non sentire.',
    voci: {
      tic: { note: [[420, 80]], onda: 'square', vibra: [0, 30] },
      via: { note: [[230, 260], [0, 90], [230, 700]], onda: 'square', vibra: [0, 200, 80, 200, 80, 200] },
      riposo: { note: [[300, 320]], onda: 'square', vibra: [0, 140] },
      fine: { note: [[230, 300], [0, 100], [230, 300], [0, 100], [180, 900]], onda: 'square', vibra: [0, 150, 70, 250, 70, 250] },
    },
  },
  {
    key: 'gong',
    nome: 'Gong',
    descrizione: 'Nota bassa che si spegne piano. Avvisa senza farti sobbalzare: per chi non vuole essere aggredito.',
    voci: {
      tic: { note: [[520, 120]], onda: 'sine', decadi: true, vibra: [0, 25] },
      via: { note: [[300, 1100]], onda: 'sine', decadi: true, vibra: [0, 200, 80, 200] },
      riposo: { note: [[220, 900]], onda: 'sine', decadi: true, vibra: [0, 140] },
      fine: { note: [[300, 700], [0, 120], [200, 1400]], onda: 'sine', decadi: true, vibra: [0, 150, 70, 250] },
    },
  },
  {
    key: 'fischietto',
    nome: 'Fischietto',
    descrizione: 'Due note acute alternate, come l’arbitro. Netto e corto, non resta addosso.',
    voci: {
      tic: { note: [[2600, 70]], onda: 'sine', vibra: [0, 30] },
      via: { note: [[2600, 130], [3100, 130], [2600, 130], [3100, 420]], onda: 'sine', vibra: [0, 200, 80, 200, 80, 200] },
      riposo: { note: [[2200, 150], [0, 50], [1800, 250]], onda: 'sine', vibra: [0, 140] },
      fine: { note: [[2600, 150], [3100, 150], [2600, 150], [3100, 150], [2600, 600]], onda: 'sine', vibra: [0, 150, 70, 250, 70, 250] },
    },
  },
]

export const SUONO_DEFAULT = 'beep'
/** Quanto forte in cuffia, in centesimi. Dentro l'orecchio il pieno fa male. */
export const VOLUME_DEFAULT = 35

export function suonoDi(key?: string | null): Suono {
  return SUONI.find((s) => s.key === key) ?? SUONI[0]
}

// --- La scelta di adesso ----------------------------------------------------
//
// Vive qui perche' la usano in due: l'audio della pagina e il comando che va al
// servizio nativo. Chi legge il profilo la imposta all'avvio e a ogni cambio;
// nessuno dei due tocca il database.

let sceltaSuono = SUONO_DEFAULT
let sceltaVolume = VOLUME_DEFAULT

export function impostaScelta(key?: string | null, volume?: number | null): void {
  if (key && SUONI.some((s) => s.key === key)) sceltaSuono = key
  if (volume != null && volume >= 0 && volume <= 100) sceltaVolume = Math.round(volume)
}

export function sceltaCorrente(): { suono: Suono; volume: number } {
  return { suono: suonoDi(sceltaSuono), volume: sceltaVolume }
}

/** Legge dal profilo la scelta salvata. All'avvio, una volta. */
export async function caricaSceltaSuoni(): Promise<void> {
  try {
    const { getUser } = await import('../db/repo')
    const u = await getUser()
    impostaScelta(u?.suonoTimer, u?.volumeBip)
  } catch { /* al primo avvio il profilo non c'e' ancora: restano quelli di fabbrica */ }
}

// Importazione una tantum dello storico del peso (POL IN ONE fino al 30.03.2023,
// Cockpit fino al 20.07.2026).
//
// REGOLA DI EMANUEL: l'importazione aggiunge e basta. Se in ETP quella data ha
// già una riga, la riga resta com'è: peso, nota, tag, circonferenze. Per questo
// qui si usa solo bulkAdd, mai update o put, e le date occupate si rileggono
// dentro la stessa transazione della scrittura.

import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'

const U = LOCAL_USER_ID

/** Dal giorno dopo le pesate sono nate in ETP: l'importazione non ci arriva mai. */
export const ULTIMO_GIORNO_IMPORTABILE = '2026-07-20'

export interface RigaStorico {
  d: string
  p: number
  f: 'cockpit' | 'pol'
  n?: string
  /** La nota dice solo il tipo di giornata o di seduta. */
  g?: 1
}

const valida = (x: unknown): x is RigaStorico => {
  const r = x as RigaStorico
  return !!r && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && typeof r.p === 'number' && r.p >= 20 && r.p <= 400
    && (r.f === 'cockpit' || r.f === 'pol') && (r.n == null || typeof r.n === 'string')
}

/** Un file sbagliato o con una riga storta si rifiuta tutto: niente importazioni a metà. */
export function leggiFileStorico(testo: string): RigaStorico[] {
  let j: { tipo?: string; righe?: unknown[] }
  try { j = JSON.parse(testo) } catch { throw new Error('Questo file non si legge: non è lo storico del peso.') }
  if (j?.tipo !== 'etp-storico-peso' || !Array.isArray(j.righe) || j.righe.length === 0) {
    throw new Error('Questo file non è lo storico del peso.')
  }
  if (!j.righe.every(valida)) throw new Error('Nel file c’è una riga non valida: non importo niente.')
  return j.righe as RigaStorico[]
}

function daAggiungere(righe: RigaStorico[], occupate: Set<string>): RigaStorico[] {
  const viste = new Set<string>()
  return righe.filter((r) => {
    if (r.d > ULTIMO_GIORNO_IMPORTABILE || occupate.has(r.d) || viste.has(r.d)) return false
    viste.add(r.d)
    return true
  })
}

const dateOccupate = async () =>
  new Set((await db.bodyMeasurements.where('userId').equals(U).toArray()).map((m) => m.date))

export interface AnteprimaStorico { entrano: number; saltate: number; dal: string | null; al: string | null }

export async function anteprimaStorico(righe: RigaStorico[]): Promise<AnteprimaStorico> {
  const nuove = daAggiungere(righe, await dateOccupate())
  const date = nuove.map((r) => r.d).sort()
  return { entrano: nuove.length, saltate: righe.length - nuove.length, dal: date[0] ?? null, al: date[date.length - 1] ?? null }
}

/** Aggiunge solo i giorni liberi. Rilanciarla non fa niente: i giorni aggiunti ora sono occupati. */
export async function importaStorico(righe: RigaStorico[]): Promise<number> {
  return db.transaction('rw', db.bodyMeasurements, async () => {
    const nuove = daAggiungere(righe, await dateOccupate())
    const ts = nowISO()
    await db.bodyMeasurements.bulkAdd(nuove.map((r) => ({
      id: newId(), userId: U, createdAt: ts, updatedAt: ts,
      date: r.d, weight: r.p, importato: r.f,
      ...(r.n ? { note: r.n } : {}),
      ...(r.g ? { soloGiornata: true } : {}),
    })))
    return nuove.length
  })
}

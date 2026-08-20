// 🦠RS — quale giornata tocca oggi.
//
// La ciclizzazione dei carboidrati va a settimana fissa, da lunedì a domenica:
// L L L H L H L. Il basso e l'alto li decide il calendario; ON e OFF li decidi
// tu, perché dipendono dal fatto che ti alleni o no — e quello lo sai solo tu.
//
// Sceglierla a mente ogni mattina è un errore che aspetta di succedere: basta
// un giorno saltato e per il resto della settimana sei sfasato di uno.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'

const U = LOCAL_USER_ID

/** La ciclizzazione attuale del coach, da lunedì a domenica. */
export const CICLO_DEFAULT = 'LLLHLHL'

export type Carbo = 'L' | 'H'

/** Lunedì = 0. Il protocollo conta le settimane da lunedì, non da domenica. */
export function indiceGiorno(date: string): number {
  return (new Date(date + 'T00:00:00').getDay() + 6) % 7
}

export const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

/** Pulisce quello che c'è scritto: sette lettere, solo L o H. */
export function cicloValido(c: string | undefined): string {
  const s = (c ?? '').toUpperCase().replace(/[^LH]/g, '')
  return s.length === 7 ? s : CICLO_DEFAULT
}

export function carboDelGiorno(date: string, ciclo?: string): Carbo {
  return cicloValido(ciclo)[indiceGiorno(date)] === 'H' ? 'H' : 'L'
}

export interface Consiglio {
  /** basso o alto, dal calendario */
  carbo: Carbo
  /** quel giorno risulta una seduta: allora ON è già la risposta giusta */
  allenato: boolean
  /** la chiave della giornata da applicare, con l'ON/OFF scelto */
  chiave: (on: boolean) => string
  /** il nome della giornata tipo, con l'ON/OFF scelto */
  nome: (on: boolean) => string
  /** giorno della settimana, per scriverlo a schermo */
  giorno: string
  /** hai già scelto la giornata per questa data */
  giaScelta: string | null
}

/**
 * Il consiglio per una data. `null` quando non c'è niente da consigliare:
 * RS spento, oppure il protocollo non è ancora stato importato — meglio tacere
 * che suggerire una giornata che non esiste.
 */
export async function consiglioGiornata(date: string): Promise<Consiglio | null> {
  const u = await db.users.get(U)
  if (u?.rsActive === false) return null

  const modelli = await db.dayTemplates.where('userId').equals(U).toArray()
  const rs = modelli.filter((m) => m.name.startsWith('🦠'))
  if (rs.length < 4) return null

  const carbo = carboDelGiorno(date, u?.rsCiclo)
  // Una seduta quel giorno — anche solo aperta — è un fatto: ON è già deciso.
  const sedute = await db.sessions.where('userId').equals(U).toArray()
  const allenato = sedute.some((s) => s.date === date)

  const nutri = await db.nutrition.where('userId').equals(U).toArray()
  const scelta = nutri.find((n) => n.date === date)?.dayType ?? null

  const parte = carbo === 'H' ? 'HIGH' : 'LOW'
  return {
    carbo,
    allenato,
    chiave: (on) => `rs_${parte.toLowerCase()}_${on ? 'on' : 'off'}`,
    nome: (on) => `🦠 ${parte} ${on ? 'ON' : 'OFF'}`,
    giorno: GIORNI[indiceGiorno(date)],
    giaScelta: scelta && String(scelta).startsWith('rs_') ? String(scelta) : null,
  }
}

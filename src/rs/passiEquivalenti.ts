// 🦠RS — i passi equivalenti del cardio.
//
// I passi veri sono solo la camminata contata da WHOOP e non si toccano mai.
// Il target passi di RS invece comprende il cardio: prima li correggevi a mano
// dopo la cyclette. Qui il conto lo fa l'app, solo per quello che va a lui.
//
// L'equivalenza e' a tempo, non a energia: minuti × 100, la soglia della
// camminata moderata. I watt non c'entrano.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { getHabitValue, STEPS } from '../db/habits'
import type { CardioType } from '../db/schema'

const U = LOCAL_USER_ID

/**
 * Passi al minuto per tipo. Lo spin si registra come cyclette.
 * Camminata, tapis e corsa: 0 perche' i passi li conta gia' WHOOP.
 * Ellittica 0 per ora (da rivedere); i tipi non decisi restano a 0.
 */
export const PASSI_AL_MINUTO: Record<CardioType, number> = {
  cyclette: 100, assaultbike: 100,
  camminata: 0, tapis: 0, corsa: 0,
  ellittica: 0,
  vogatore: 0, hiit: 0, tabata: 0, liss: 0, intervalli: 0, altro: 0,
}
/** Questi a 0 non sono «non convertiti»: sono gia' dentro i passi di WHOOP. */
const GIA_NEI_PASSI: CardioType[] = ['camminata', 'tapis', 'corsa']

/** Come si dice nella riga: minuscolo, le sigle restano sigle. */
const NOME: Record<CardioType, string> = {
  corsa: 'corsa', camminata: 'camminata', tapis: 'tapis roulant', cyclette: 'cyclette', ellittica: 'ellittica',
  vogatore: 'vogatore', assaultbike: 'assault bike', hiit: 'HIIT', tabata: 'tabata', liss: 'LISS',
  intervalli: 'intervalli', altro: 'altro',
}

export interface VocePassi {
  tipo: CardioType
  nome: string
  minuti: number
  passi: number
  esito: 'convertita' | 'nei-passi' | 'non-convertita'
}

export interface PassiRs {
  /** la camminata di WHOOP, null se quel giorno non c'e' */
  reali: number | null
  equivalenti: number
  /** quello che va a RS; null se non c'e' niente da dire */
  totale: number | null
  /** una voce per tipo, nell'ordine delle sedute */
  voci: VocePassi[]
}

/** I passi del giorno per RS: camminata + equivalenti del cardio. Non scrive niente. */
export async function passiRs(date: string): Promise<PassiRs> {
  const passi = await getHabitValue(STEPS, date)
  const reali = passi?.value ?? null

  const cardio = (await db.cardio.where('date').equals(date).filter((c) => c.userId === U).toArray())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const perTipo = new Map<CardioType, number>()
  for (const c of cardio) {
    const t = c.cardioType ?? 'altro'
    perTipo.set(t, (perTipo.get(t) ?? 0) + (c.durationMin || 0))
  }

  const voci: VocePassi[] = [...perTipo].map(([tipo, minuti]) => {
    const passi = Math.round(minuti * PASSI_AL_MINUTO[tipo])
    const esito = passi > 0 ? 'convertita' : GIA_NEI_PASSI.includes(tipo) ? 'nei-passi' : 'non-convertita'
    return { tipo, nome: NOME[tipo], minuti, passi, esito }
  })
  const equivalenti = voci.reduce((s, v) => s + v.passi, 0)
  const totale = reali == null && equivalenti === 0 ? null : (reali ?? 0) + equivalenti
  return { reali, equivalenti, totale, voci }
}

const minuti = (m: number) => `${Math.round(m)}'`
/** Col punto anche sotto i 10.000: in italiano «8734» non lo prenderebbe. */
export const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** «2.500 da cyclette (25')» */
export const voceConvertita = (v: VocePassi) => `${migliaia(v.passi)} da ${v.nome} (${minuti(v.minuti)})`

/** «ellittica 15': non convertita · corsa 20': già nei passi» */
export function testoEsclusi(p: PassiRs): string {
  return p.voci.filter((v) => v.esito !== 'convertita')
    .map((v) => `${v.nome} ${minuti(v.minuti)}: ${v.esito === 'nei-passi' ? 'già nei passi' : 'non convertita'}`)
    .join(' · ')
}

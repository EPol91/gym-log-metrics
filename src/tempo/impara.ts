// Cosa sta imparando: le sere degli ultimi 90 giorni, messe a confronto.
//
// Per ogni sera: quando hai finito di allenarti, quando hai finito di cenare,
// quando sei andato a letto (WHOOP) e come hai recuperato la notte dopo. Le
// sere si dividono in fasce e si confrontano. Una fascia conta solo con almeno
// MINIMO sere: sotto, lo si dice e basta. E la proposta per stasera tocca solo
// cena e letto, mai l'allenamento.
//
// Solo lettura.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { shiftDate, todayLocal } from '../util/date'
import { getUser } from '../db/repo'
import { orariDi, fasceDeiPasti, minuti } from './orari'
import type { Meal } from '../db/schema'
import { SEDUTE_RS } from '../rs/protocollo'

const U = LOCAL_USER_ID
const GIORNI = 90
/** Sere che servono in una fascia perche' dica qualcosa. */
export const MINIMO = 5

export interface Sera {
  data: string
  /** minuti dalla mezzanotte di `data`; dopo mezzanotte oltre 1440 */
  fineAllena?: number
  cena?: number
  letto?: number
  recupero?: number
  hrv?: number
}

export interface Fascia {
  etichetta: string
  /** in minuti: da (compreso) a (escluso) */
  da: number
  a: number
  sere: number
  recupero?: number
  hrv?: number
  /** ora media del letto, in minuti dalla mezzanotte del giorno */
  letto?: number
}

export interface Scoperta {
  fasce: Fascia[]
  /** sere che hanno tutti i dati per questo confronto */
  sere: number
  /** almeno due fasce con MINIMO sere */
  regge: boolean
  /** la fascia col recupero piu' alto e quella col piu' basso, fra quelle che reggono */
  meglio?: Fascia
  peggio?: Fascia
}

export interface Imparato {
  cenaLetto: Scoperta
  allenaCena: Scoperta
  /** la fine allenamento di solito (mediana), per la proposta quando oggi non hai ancora finito */
  fineDiSolito?: number
  /** oggi: l'allenamento finito (e quale), la cena gia' segnata */
  oggi: { fineAllena?: number; cena?: number; codice?: string }
}

/** Un istante (ISO) in minuti dalla mezzanotte di `data`, nell'ora di qui. */
function minDa(data: string, iso: string): number {
  return Math.round((new Date(iso).getTime() - new Date(data + 'T00:00:00').getTime()) / 60_000)
}

/** L'ora di cena: prima delle 6 vuol dire dopo mezzanotte. */
const oraSera = (hhmm: string) => {
  const m = minuti(hhmm)
  return m < 360 ? m + 1440 : m
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const mediana = (xs: number[]) => {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Le sere dal `dal` a ieri (la notte di oggi WHOOP non l'ha ancora). */
export async function sere(oggi = todayLocal()): Promise<Sera[]> {
  const dal = shiftDate(oggi, -GIORNI)
  const orari = orariDi(await getUser())
  const ultima = orari.pasti.length - 1

  const pasti = (await db.meals.where('date').between(dal, oggi, true, false).toArray()).filter((m) => m.userId === U)
  const sedute = (await db.sessions.where('date').between(dal, oggi, true, true).toArray()).filter((s) => s.userId === U && s.finishedAt)
  const notti = (await db.whoopDays.where('date').between(dal, oggi, true, true).toArray()).filter((d) => d.userId === U)

  const pastiDi = new Map<string, Meal[]>()
  for (const m of pasti) pastiDi.set(m.date, [...(pastiDi.get(m.date) ?? []), m])
  const nottePer = new Map(notti.map((n) => [n.date, n]))

  const out: Sera[] = []
  for (let d = dal; d < oggi; d = shiftDate(d, 1)) {
    const s: Sera = { data: d }
    const fini = sedute.filter((x) => x.date === d).map((x) => minDa(d, x.finishedAt!))
    if (fini.length) s.fineAllena = Math.max(...fini)
    const del = pastiDi.get(d) ?? []
    const fasce = fasceDeiPasti(del, orari.pasti)
    const cena = del.find((m) => fasce.get(m.id)?.indice === ultima && m.ora && !m.saltato)
    if (cena?.ora) s.cena = oraSera(cena.ora)
    // La notte dopo sta nel giorno dopo: e' li' che WHOOP mette il risveglio.
    const n = nottePer.get(shiftDate(d, 1))
    if (n?.sleepStart) s.letto = minDa(d, n.sleepStart)
    if (n?.recovery != null) s.recupero = n.recovery
    if (n?.hrv != null) s.hrv = n.hrv
    out.push(s)
  }
  return out
}

function confronta(righe: { valore: number; s: Sera }[], limiti: { etichetta: string; da: number; a: number }[]): Scoperta {
  const fasce: Fascia[] = limiti.map((l) => {
    const dentro = righe.filter((r) => r.valore >= l.da && r.valore < l.a).map((r) => r.s)
    const rec = media(dentro.map((s) => s.recupero!).filter((x) => x != null))
    const hrv = media(dentro.map((s) => s.hrv!).filter((x) => x != null))
    const letto = media(dentro.map((s) => s.letto!).filter((x) => x != null))
    return {
      ...l, sere: dentro.length,
      ...(rec != null ? { recupero: Math.round(rec) } : {}),
      ...(hrv != null ? { hrv: Math.round(hrv) } : {}),
      ...(letto != null ? { letto: Math.round(letto) } : {}),
    }
  })
  const buone = fasce.filter((f) => f.sere >= MINIMO && f.recupero != null)
  const regge = buone.length >= 2
  const ord = [...buone].sort((a, b) => b.recupero! - a.recupero!)
  return {
    fasce, sere: righe.length, regge,
    ...(regge ? { meglio: ord[0], peggio: ord[ord.length - 1] } : {}),
  }
}

export async function imparato(oggi = todayLocal()): Promise<Imparato> {
  const tutte = await sere(oggi)

  // Cena → letto: le sere con cena, letto e recupero.
  const cl = tutte
    .filter((s) => s.cena != null && s.letto != null && s.letto > s.cena && s.recupero != null)
    .map((s) => ({ valore: s.letto! - s.cena!, s }))
  const cenaLetto = confronta(cl, [
    { etichetta: 'meno di 1h30', da: 0, a: 90 },
    { etichetta: '1h30 – 2h', da: 90, a: 120 },
    { etichetta: '2h e oltre', da: 120, a: Infinity },
  ])

  // Allenamento → cena: le sere con allenamento, cena dopo, letto e recupero.
  const ac = tutte
    .filter((s) => s.fineAllena != null && s.cena != null && s.cena >= s.fineAllena && s.letto != null && s.recupero != null)
    .map((s) => ({ valore: s.cena! - s.fineAllena!, s }))
  const allenaCena = confronta(ac, [
    { etichetta: 'entro 45′', da: 0, a: 46 },
    { etichetta: '45′ – 1h', da: 46, a: 61 },
    { etichetta: 'oltre 1h', da: 61, a: Infinity },
  ])

  const fineDiSolito = mediana(tutte.slice(-30).map((s) => s.fineAllena!).filter((x) => x != null))
  // Oggi: la seduta chiusa piu' tardi e la cena, se l'hai gia' segnata.
  const orari = orariDi(await getUser())
  const sedOggi = (await db.sessions.where('date').equals(oggi).toArray()).filter((s) => s.userId === U && s.finishedAt)
    .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
  const ultimaSed = sedOggi[sedOggi.length - 1]
  const nomeScheda = ultimaSed?.srcTemplateId ? (await db.templates.get(ultimaSed.srcTemplateId))?.name : undefined
  const codice = nomeScheda ? SEDUTE_RS.find((x) => x.nome === nomeScheda)?.codice : undefined
  const pastiOggi = (await db.meals.where('date').equals(oggi).toArray()).filter((m) => m.userId === U)
  const fasce = fasceDeiPasti(pastiOggi, orari.pasti)
  const cena = pastiOggi.find((m) => fasce.get(m.id)?.indice === orari.pasti.length - 1 && m.ora && !m.saltato)
  const oggiSera = {
    ...(ultimaSed ? { fineAllena: minDa(oggi, ultimaSed.finishedAt!) } : {}),
    ...(cena?.ora ? { cena: oraSera(cena.ora) } : {}),
    ...(codice ? { codice } : {}),
  }

  return { cenaLetto, allenaCena, ...(fineDiSolito != null ? { fineDiSolito } : {}), oggi: oggiSera }
}

// Gli orari della giornata: quelli che metti tu e quelli che l'app impara.
//
// Il lavoro e le fasce dei pasti li scrivi una volta in Profilo → I tuoi orari.
// Sonno, allenamento e pasti arrivano da soli: da WHOOP, dalle sedute, dall'ora
// che segni in Cibo. Qui sta il pezzo in mezzo: quale pasto del diario cade in
// quale fascia, e a che ora lo mangi di solito.
//
// Niente qui tocca il diario o RS: si legge e basta.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { shiftDate, todayLocal } from '../util/date'
import type { FasciaPasto, Meal, OrariUtente, User } from '../db/schema'

const U = LOCAL_USER_ID

/** Quelli di partenza: lavoro 9–17:30 (a volte fino alle 18:30, pausa 12–14) e le cinque fasce dei pasti. */
export const ORARI_DEFAULT: OrariUtente = {
  lavoro: {
    giorni: [1, 2, 3, 4, 5],
    entrata: '09:00',
    uscita: '17:30',
    uscitaFinoA: '18:30',
    pausa: { dalle: '12:00', alle: '14:00' },
  },
  pasti: [
    { nome: 'Colazione', dalle: '08:00', alle: '08:30' },
    { nome: 'Spuntino mattino', dalle: '10:30', alle: '11:00' },
    { nome: 'Pranzo', dalle: '12:30', alle: '13:30' },
    { nome: 'Spuntino pre-workout', dalle: '17:00', alle: '17:30' },
    { nome: 'Cena post-workout', dalle: '22:00', alle: '23:00' },
  ],
}

export function orariDi(u?: User | null): OrariUtente {
  return u?.orari?.pasti?.length ? u.orari : ORARI_DEFAULT
}

/** «13:20» → 800 minuti dalla mezzanotte. */
export function minuti(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 800 → «13:20». Oltre la mezzanotte si gira: 1500 → «01:00». */
export function hhmm(min: number): string {
  const t = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function oraAdesso(): string {
  const d = new Date()
  return hhmm(d.getHours() * 60 + d.getMinutes())
}

/**
 * Che ora proporre nel foglio «a che ora?».
 *
 * «Adesso» se sei vicino alla fascia di quel pasto — da un'ora prima a due ore
 * dopo: hai appena mangiato. Lontano dalla fascia stai segnando a posteriori, e
 * «adesso» sarebbe sbagliato: vale l'ora a cui lo mangi di solito.
 */
export function propostaOra(oggi: boolean, fascia?: FasciaPasto, diSolito?: string): string {
  const ora = oraAdesso()
  if (!oggi) return diSolito ?? (fascia ? fascia.dalle : '12:00')
  if (!fascia) return ora
  const m = minuti(ora)
  return m >= minuti(fascia.dalle) - 60 && m <= minuti(fascia.alle) + 120 ? ora : (diSolito ?? fascia.dalle)
}

/** L'intra-workout lo mangi mentre ti alleni: non ha una fascia sua. */
const senzaFascia = (m: Meal) => /intra/i.test(m.name)

/**
 * Quale fascia tocca a ciascun pasto del giorno.
 *
 * I pasti si prendono in ordine, l'intra-workout escluso. Il primo prende la
 * prima fascia, il secondo la seconda e cosi' via; l'ULTIMO pasto prende sempre
 * l'ultima fascia, la cena — anche nei giorni con un pasto in meno. Se i pasti
 * sono piu' delle fasce, quelli in mezzo restano senza.
 */
export function fasceDeiPasti(pasti: Meal[], fasce: FasciaPasto[]): Map<string, { fascia: FasciaPasto; indice: number }> {
  const out = new Map<string, { fascia: FasciaPasto; indice: number }>()
  const ordinati = [...pasti].sort((a, b) => a.order - b.order).filter((m) => !senzaFascia(m))
  if (!ordinati.length || !fasce.length) return out
  const ultima = fasce.length - 1
  ordinati.forEach((m, i) => {
    if (i === ordinati.length - 1) out.set(m.id, { fascia: fasce[ultima], indice: ultima })
    else if (i < ultima) out.set(m.id, { fascia: fasce[i], indice: i })
  })
  return out
}

/**
 * A che ora mangi di solito ogni fascia: la mediana degli ultimi 30 giorni.
 *
 * Finche' non hai segnato almeno tre volte quella fascia vale il suo centro:
 * con uno o due giorni un'abitudine non c'e' ancora. Piu' segni, piu' si
 * stringe sulla tua.
 */
export async function oreDiSolito(orari: OrariUtente, oggi = todayLocal()): Promise<string[]> {
  const dal = shiftDate(oggi, -30)
  const pasti = (await db.meals.where('date').between(dal, oggi, true, false).toArray()).filter((m) => m.userId === U)
  const perGiorno = new Map<string, Meal[]>()
  for (const m of pasti) perGiorno.set(m.date, [...(perGiorno.get(m.date) ?? []), m])

  const viste: number[][] = orari.pasti.map(() => [])
  for (const giorno of perGiorno.values()) {
    for (const [id, { indice }] of fasceDeiPasti(giorno, orari.pasti)) {
      const m = giorno.find((x) => x.id === id)
      if (m?.ora) viste[indice].push(minuti(m.ora))
    }
  }
  return orari.pasti.map((f, i) => {
    const v = viste[i].sort((a, b) => a - b)
    if (v.length < 3) return hhmm((minuti(f.dalle) + minuti(f.alle)) / 2)
    return hhmm(v[Math.floor(v.length / 2)])
  })
}

// 🦠RS — la seduta nel formato del coach.
//
// Tu registri qui carichi e ripetizioni, una volta sola. Questo modulo prende la
// seduta del giorno, capisce a quale delle sue cinque giornate corrisponde e
// incolonna le serie sotto l'esercizio giusto — usando i nomi TUOI, che sono
// gia' agganciati ai suoi.
//
// Quello che resta tuo: stimolo, pump, tecnica, compensi, feedback di seduta.
// Sono giudizi, e inventarli vorrebbe dire far decidere il coach su un dato falso.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { SEDUTE_RS, RINOMINE } from './protocollo'

const U = LOCAL_USER_ID

export interface SerieRs { kg: number; reps: number; rir?: number }
export interface EsercizioSeduta {
  nome: string
  /** la prescrizione del coach, se questo esercizio e' nella sua scheda */
  prescrizione?: string
  serie: SerieRs[]
  /** era previsto dalla sua giornata? */
  previsto: boolean
}
export interface SedutaRs {
  /** la giornata del coach a cui somiglia di piu' (D1…D5), se ne ha una */
  codice: string | null
  nome: string | null
  esercizi: EsercizioSeduta[]
  /** quanti esercizi previsti hai davvero fatto, in percentuale */
  aderenzaLogistica: number | null
  serieTotali: number
}

/**
 * A quale giornata del coach somiglia questa seduta.
 *
 * Si guarda quanti dei suoi esercizi ritrovi in quello che hai fatto: e' piu'
 * solido del nome della seduta, che puo' essere qualsiasi cosa, e del tipo
 * (push/pull), che da solo non distingue D4 da D5.
 */
function riconosci(nomiFatti: string[]): { codice: string; nome: string; previsti: string[] } | null {
  const norm = (s: string) => s.trim().toLowerCase()
  const fatti = new Set(nomiFatti.map(norm))
  let migliore: { codice: string; nome: string; previsti: string[]; punti: number } | null = null

  for (const s of SEDUTE_RS) {
    // Il confronto va fatto sui nomi TUOI: l'import li ha rinominati, e senza la
    // stessa traduzione qui non si riconoscerebbe mai nessuna seduta.
    const previsti = s.esercizi.map((e) => {
      const r = RINOMINE[e.nome]
      return r == null ? e.nome : Array.isArray(r) ? r[0] : r
    })
    const punti = previsti.filter((p) => fatti.has(norm(p))).length
    if (punti > 0 && (!migliore || punti > migliore.punti)) {
      migliore = { codice: s.codice, nome: s.nome, previsti, punti }
    }
  }
  return migliore
}

/** La seduta del giorno, pronta per il coach. */
export async function sedutaRs(date: string): Promise<SedutaRs | null> {
  const sessioni = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.date === date && s.finishedAt)
  if (!sessioni.length) return null

  const esercizi: EsercizioSeduta[] = []
  const tuttiEsercizi = await db.exercises.where('userId').equals(U).toArray()

  for (const sess of sessioni) {
    const entrate = (await db.exerciseEntries.where('userId').equals(U).toArray())
      .filter((e) => e.sessionId === sess.id)
      .sort((a, b) => a.order - b.order)
    for (const e of entrate) {
      const ex = tuttiEsercizi.find((x) => x.id === e.exerciseId)
      if (!ex) continue
      const sets = (await db.sets.where('entryId').equals(e.id).toArray())
        .filter((s) => !s.isWarmup)
        .sort((a, b) => a.order - b.order)
      // La prescrizione sta nelle note dell'esercizio, dove l'ha messa l'import.
      const riga = (ex.settings ?? '').split('\n').find((r) => r.trimStart().startsWith('🦠'))
      esercizi.push({
        nome: ex.name,
        prescrizione: riga?.replace(/^🦠\s*/, ''),
        serie: sets.map((s) => ({ kg: s.weight, reps: s.reps, ...(s.rir != null ? { rir: s.rir } : {}) })),
        previsto: false,
      })
    }
  }

  const g = riconosci(esercizi.map((e) => e.nome))
  if (g) {
    const previsti = new Set(g.previsti.map((p) => p.trim().toLowerCase()))
    for (const e of esercizi) e.previsto = previsti.has(e.nome.trim().toLowerCase())
  }

  const fattiPrevisti = esercizi.filter((e) => e.previsto && e.serie.length > 0).length
  return {
    codice: g?.codice ?? null,
    nome: g?.nome ?? null,
    esercizi,
    aderenzaLogistica: g ? Math.round((fattiPrevisti / g.previsti.length) * 100) : null,
    serieTotali: esercizi.reduce((s, e) => s + e.serie.length, 0),
  }
}

/** Una riga di testo per seduta: serve alla nota e all'anteprima. */
export function riassunto(s: SedutaRs): string {
  const parti = s.esercizi
    .filter((e) => e.serie.length)
    .map((e) => `${e.nome}: ${e.serie.map((x) => `${x.kg}×${x.reps}`).join(', ')}`)
  return parti.join(' · ')
}

export interface GiornoCalendario {
  date: string
  /** nome della seduta: quella del coach se riconosciuta, altrimenti la tua */
  nome: string
  /** viene dal protocollo del coach */
  delCoach: boolean
  serie: number
}

/**
 * Le sedute di un periodo, con dentro cosa hai fatto.
 *
 * Una passata sola su tutte le tabelle invece di una interrogazione per giorno:
 * il calendario copre un mese e chiedere trenta volte le stesse cose lo
 * renderebbe lento proprio dove deve solo apparire.
 */
export async function calendario(da: string, a: string): Promise<GiornoCalendario[]> {
  const sessioni = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.date >= da && s.date <= a && s.finishedAt)
  if (!sessioni.length) return []

  const ids = new Set(sessioni.map((s) => s.id))
  const entrate = (await db.exerciseEntries.where('userId').equals(U).toArray()).filter((e) => ids.has(e.sessionId))
  const esercizi = await db.exercises.where('userId').equals(U).toArray()
  const perId = new Map(esercizi.map((e) => [e.id, e.name]))
  const sets = await db.sets.where('userId').equals(U).toArray()
  const serieDi = new Map<string, number>()
  for (const s of sets) serieDi.set(s.entryId, (serieDi.get(s.entryId) ?? 0) + 1)

  const TIPI: Record<string, string> = {
    push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
    lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
  }

  return sessioni.map((s) => {
    const mie = entrate.filter((e) => e.sessionId === s.id)
    const nomi = mie.map((e) => perId.get(e.exerciseId) ?? '')
    const g = riconosci(nomi)
    return {
      date: s.date,
      nome: g?.nome ?? TIPI[s.type] ?? s.type,
      delCoach: !!g,
      serie: mie.reduce((n, e) => n + (serieDi.get(e.id) ?? 0), 0),
    }
  }).sort((x, y) => x.date.localeCompare(y.date))
}

// Il registro delle serie non ancora confermate.
//
// Registrare una serie e' un gesto che non si puo' perdere: succedeva invece
// che la terza serie di un esercizio comparisse con la spunta e il giorno dopo
// non ci fosse piu'. La riga veniva scritta nel database e la scrittura non
// arrivava mai al disco, senza un errore e senza che nessuno controllasse.
//
// Da qui in poi la serie esiste in due posti: prima qui — localStorage, scritto
// subito e senza attese — e poi nel database. La copia si cancella solo quando
// la riga e' stata riletta da dentro il database. Quello che resta qui al
// riavvio e' un tuo gesto interrotto: si porta a termine. Non si inventa nulla.

import { db } from './db'
import type { SetEntry } from './schema'

const CHIAVE = 'etp.serie.insospeso'
/** Il registro non deve crescere all'infinito: e' una rete, non un archivio. */
const MAX = 100
/** Oltre un mese non si rimette piu' niente: non e' piu' «la serie di prima». */
const GIORNI = 30

function leggi(): SetEntry[] {
  try {
    const s = localStorage.getItem(CHIAVE)
    const v = s ? JSON.parse(s) : []
    return Array.isArray(v) ? (v as SetEntry[]) : []
  } catch {
    return []
  }
}

function scrivi(righe: SetEntry[]): void {
  try {
    if (righe.length) localStorage.setItem(CHIAVE, JSON.stringify(righe.slice(-MAX)))
    else localStorage.removeItem(CHIAVE)
  } catch { /* niente spazio: resta il database, che e' il posto giusto comunque */ }
}

/** Prima della scrittura nel database: da qui la serie non si perde. */
export function annota(s: SetEntry): void {
  scrivi([...leggi().filter((x) => x.id !== s.id), s])
}

/** Riletta dal database: la copia di sicurezza ha finito il suo lavoro. */
export function conferma(id: string): void {
  scrivi(leggi().filter((x) => x.id !== id))
}

/** Quante serie sono ancora senza conferma (per dirlo, se serve). */
export function quanteInSospeso(): number {
  return leggi().length
}

/**
 * Al riavvio: le serie che non sono mai arrivate nel database ci tornano.
 *
 * Se l'esercizio o la seduta non ci sono piu' — li hai cancellati tu — la riga
 * si butta: rimetterla vorrebbe dire far ricomparire qualcosa che hai eliminato.
 */
export async function recuperaSerieInSospeso(): Promise<number> {
  const righe = leggi()
  if (!righe.length) return 0
  const limite = Date.now() - GIORNI * 86_400_000
  const restano: SetEntry[] = []
  let rimesse = 0
  for (const s of righe) {
    try {
      if (await db.sets.get(s.id)) continue // c'era: mancava solo la conferma
      if (new Date(s.createdAt).getTime() < limite) continue
      if (!(await db.exerciseEntries.get(s.entryId))) continue
      // Il posto si ricalcola adesso: quello di prima non e' mai stato
      // assegnato, e rimetterlo creerebbe di nuovo due serie nello stesso punto.
      // Era l'ultima che avevi fatto, e li' torna.
      await db.transaction('rw', db.sets, async () => {
        const posti = (await db.sets.where({ entryId: s.entryId }).toArray()).map((x) => x.order ?? 0)
        await db.sets.put({ ...s, order: posti.length ? Math.max(...posti) + 1 : 0 })
      })
      rimesse++
    } catch {
      restano.push(s) // database non disponibile: si riprova al prossimo avvio
    }
  }
  scrivi(restano)
  return rimesse
}

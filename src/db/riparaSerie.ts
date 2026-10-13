// Le serie finite nello stesso posto, rimesse in fila.
//
// Il posto di una serie dentro l'esercizio (`order`) si calcolava leggendo
// quante serie c'erano e scrivendo subito dopo: due tocchi ravvicinati su
// «Registra serie» leggevano lo stesso numero e nascevano due serie col posto
// uguale. Da quel momento la tabella dell'allenamento smetteva di mostrare le
// serie nuove — c'erano nel database ma non a schermo — e la stessa coppia di
// numeri uguali rendeva incerto l'ordine di lettura.
//
// Adesso il posto si assegna dentro la transazione (vedi `addSet`), quindi non
// si creano piu'. Quelli di prima restano pero' scritti: qui si rinumerano una
// volta, senza toccare un solo kg, una rep o un recupero. L'ordine scelto e'
// quello in cui le serie sono nate.

import { db, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import type { SetEntry } from './schema'

const CHIAVE = 'etp.serie.ordini.riparati'

/**
 * Rinumera le serie degli esercizi che hanno posti doppi. Gira una volta sola:
 * finito il giro lascia un segno e non ci torna piu'.
 */
export async function riparaOrdiniSerie(): Promise<number> {
  try {
    if (localStorage.getItem(CHIAVE)) return 0
  } catch { /* senza localStorage si riprova: costa una lettura */ }

  let sistemate = 0
  try {
    const tutte = await db.sets.where('userId').equals(LOCAL_USER_ID).toArray()
    const perEsercizio = new Map<string, SetEntry[]>()
    for (const s of tutte) perEsercizio.set(s.entryId, [...(perEsercizio.get(s.entryId) ?? []), s])

    for (const serie of perEsercizio.values()) {
      const posti = serie.map((s) => s.order ?? 0)
      if (new Set(posti).size === posti.length) continue // nessun doppione
      // Prima il posto che avevano, poi quando sono nate: un pari merito lo
      // decide l'orologio, che e' l'ordine in cui le hai fatte davvero.
      const inFila = [...serie].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt))
      const ts = nowISO()
      await db.transaction('rw', db.sets, async () => {
        for (let i = 0; i < inFila.length; i++) {
          if (inFila[i].order === i) continue
          await db.sets.update(inFila[i].id, { order: i, updatedAt: ts })
          sistemate++
        }
      })
    }
    try { localStorage.setItem(CHIAVE, nowISO()) } catch { /* ignore */ }
  } catch {
    return sistemate // database non pronto: si riprova al prossimo avvio
  }
  return sistemate
}

import { db } from './db'
import { pushUndo } from '../util/undo'

/**
 * Fotografia di ciò che un'eliminazione ha rimosso, tabella per tabella.
 * Serve a rimettere tutto com'era: cancellare una seduta porta via anche
 * esercizi, serie e cardio, e l'annulla deve riportare indietro pure quelli.
 */
export type Trash = { table: string; rows: unknown[] }[]

/** Elimina una riga per id restituendo la sua copia. */
export async function snapshotAndDelete(table: string, id: string): Promise<Trash> {
  const t = (db as unknown as Record<string, { get: (id: string) => Promise<unknown>; delete: (id: string) => Promise<void> }>)[table]
  const row = await t.get(id)
  await t.delete(id)
  return [{ table, rows: row ? [row] : [] }]
}

/**
 * Esegue un'eliminazione e offre l'annulla: un unico punto, così ogni
 * cancellazione dell'app si comporta allo stesso modo.
 */
export async function deleteWithUndo(label: string, run: () => Promise<Trash>): Promise<void> {
  const trash = await run()
  if (trash.some((t) => t.rows.length)) pushUndo(label, () => restoreTrash(trash))
}

/** Rimette in piedi tutto quello che lo snapshot conteneva. */
export async function restoreTrash(trash: Trash): Promise<void> {
  for (const { table, rows } of trash) {
    if (!rows.length) continue
    const t = (db as unknown as Record<string, { bulkPut: (rows: unknown[]) => Promise<unknown> }>)[table]
    await t.bulkPut(rows)
  }
}

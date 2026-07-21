// Export / Import completo dei dati (Bible: controllo totale, migrazione dispositivi).
import { db, nowISO } from './db'

const TABLES = [
  'users', 'gyms', 'exercises', 'sessions', 'exerciseEntries', 'sets',
  'bodyMeasurements', 'nutrition', 'cardio', 'phases', 'templates',
] as const

export interface BackupFile {
  format: 'gymlog-backup'
  version: 1
  exportedAt: string
  data: Record<string, unknown[]>
}

/** Raccoglie tutti i dati in un oggetto backup. */
export async function exportAll(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    data[t] = await db.table(t).toArray()
  }
  return { format: 'gymlog-backup', version: 1, exportedAt: nowISO(), data }
}

/** Scarica il backup come file JSON. */
export async function downloadBackup(): Promise<void> {
  const backup = await exportAll()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gymlog-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Importa un backup: merge non distruttivo (bulkPut per id → aggiorna/aggiunge, non cancella). */
export async function importBackup(json: string): Promise<{ ok: boolean; message: string }> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, message: 'File non valido (JSON non leggibile).' }
  }
  if (parsed?.format !== 'gymlog-backup' || !parsed.data) {
    return { ok: false, message: 'Non è un backup di GYM LOG.' }
  }
  let count = 0
  for (const t of TABLES) {
    const rows = parsed.data[t]
    if (Array.isArray(rows) && rows.length) {
      await db.table(t).bulkPut(rows as never[])
      count += rows.length
    }
  }
  return { ok: true, message: `Import completato: ${count} record uniti.` }
}

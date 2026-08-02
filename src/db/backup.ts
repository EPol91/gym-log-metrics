// Export / Import completo dei dati (Bible: controllo totale, migrazione dispositivi).
import { db, nowISO } from './db'

/**
 * Le tabelle da salvare NON si scrivono a mano.
 *
 * Prima erano un elenco fisso, e ogni tabella nata dopo restava fuori in
 * silenzio: lo storico WHOOP e le giornate tipo non finivano nel file, mentre
 * l'import rispondeva "completato" come se nulla fosse. Un backup che si
 * dimentica qualcosa senza dirlo e' peggio di uno che fallisce.
 *
 * Chiedendole al database, ogni tabella futura e' dentro per costruzione.
 */
const tabelle = (): string[] => db.tables.map((t) => t.name)

/** Nomi leggibili: il resoconto deve dire cosa e' tornato, non sigle. */
const NOMI: Record<string, string> = {
  users: 'profilo', gyms: 'palestre', exercises: 'esercizi', sessions: 'sedute',
  exerciseEntries: 'esercizi delle sedute', sets: 'serie', bodyMeasurements: 'misure',
  nutrition: 'contesto alimentare', cardio: 'sessioni cardio', phases: 'fasi',
  templates: 'template allenamento', cardioPresets: 'preset cardio',
  readinessChecks: 'check del giorno', goalHistory: 'obiettivi settimanali',
  foods: 'alimenti', foodLogs: 'diario alimentare', savedMeals: 'pasti salvati',
  dayTypes: 'tipi di giornata', meals: 'pasti', habits: 'abitudini',
  habitEntries: 'abitudini svolte', recipes: 'ricette',
  whoopDays: 'giornate WHOOP', whoopWorkouts: 'allenamenti WHOOP',
  dayTemplates: 'giornate tipo',
}
const nome = (t: string) => NOMI[t] ?? t

/**
 * Le poche cose che NON stanno nel database.
 *
 * Il collegamento WHOOP e' la piu' importante: il codice del dispositivo e'
 * quello che il Worker riconosce per darti i tuoi dati, e senza, su un telefono
 * nuovo dovresti rifare tutto l'accesso a WHOOP. I dati gia' scaricati sarebbero
 * salvi lo stesso — ma "salvi lo stesso" non e' quello che ti ho promesso.
 *
 * Fuori restano di proposito le cose che valgono per oggi e basta (la domanda RS
 * gia' fatta, la scheda aperta l'ultima volta): rimetterle in piedi non
 * ripristina niente, semmai riporta indietro uno stato che non ti serve.
 */
const CHIAVI_FUORI = [
  'whoop-device',        // chi sei per il Worker WHOOP: senza, tocca ricollegare
  'whoop-auto-at',       // quando e' andata l'ultima sincronizzazione
  'whoop-auto-try',
  'etp:recipe-seed:v1',  // ricettario gia' installato
  'gymlog.ai.apiKey',    // la tua chiave AI: e' tua e sta nel tuo file
  'gymlog.ai.coachHome',
  'gymlog.ai.consumo',   // quanto hai speso finora: ripartire da zero mentirebbe
  'gymlog.ai.memoria',   // didascalie e traduzioni gia' pagate
  'etp:ig-handle',       // la firma delle slide
  'etp:slide-lingua',
]

export interface BackupFile {
  format: 'gymlog-backup'
  /** 1 = elenco fisso di tabelle. 2 = tutte le tabelle. 3 = + preferenze fuori dal DB. */
  version: 1 | 2 | 3
  exportedAt: string
  data: Record<string, unknown[]>
  /** Le chiavi che vivono fuori dal database (vedi CHIAVI_FUORI). */
  preferenze?: Record<string, string>
}

/** Raccoglie tutti i dati in un oggetto backup. */
export async function exportAll(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}
  for (const t of tabelle()) {
    data[t] = await db.table(t).toArray()
  }
  const preferenze: Record<string, string> = {}
  for (const k of CHIAVI_FUORI) {
    try { const v = localStorage.getItem(k); if (v != null) preferenze[k] = v } catch { /* storage assente */ }
  }
  return { format: 'gymlog-backup', version: 3, exportedAt: nowISO(), data, preferenze }
}

/** Cosa contiene un backup, senza importarlo: serve a guardare prima di agire. */
export function contenuto(file: BackupFile): { tabella: string; righe: number }[] {
  return Object.entries(file.data ?? {})
    .filter(([, r]) => Array.isArray(r) && r.length)
    .map(([t, r]) => ({ tabella: nome(t), righe: (r as unknown[]).length }))
    .sort((a, b) => b.righe - a.righe)
}

/** Scarica il backup come file JSON. */
export async function downloadBackup(): Promise<void> {
  const backup = await exportAll()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `etp-health-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface EsitoImport {
  ok: boolean
  message: string
  /** Quante righe per tabella sono entrate davvero. */
  dettaglio: { tabella: string; righe: number }[]
  /** Tabelle nel file che questa versione dell'app non conosce. */
  ignorate: string[]
}

/**
 * Importa un backup.
 * - `modo: 'unisci'` (predefinito) → aggiorna e aggiunge, non cancella niente.
 * - `modo: 'sostituisci'` → svuota prima le tabelle presenti nel file: serve
 *   quando rimetti in piedi un telefono e vuoi esattamente quel backup, senza
 *   che restino in mezzo righe piu' recenti.
 */
export async function importBackup(json: string, modo: 'unisci' | 'sostituisci' = 'unisci'): Promise<EsitoImport> {
  const vuoto = { dettaglio: [], ignorate: [] }
  let parsed: BackupFile
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, message: 'File non valido (JSON non leggibile).', ...vuoto }
  }
  if (parsed?.format !== 'gymlog-backup' || !parsed.data) {
    return { ok: false, message: 'Non e\' un backup di ETP HEALTH.', ...vuoto }
  }

  const note = new Set(tabelle())
  const dettaglio: { tabella: string; righe: number }[] = []
  const ignorate: string[] = []

  for (const [t, rows] of Object.entries(parsed.data)) {
    if (!Array.isArray(rows) || !rows.length) continue
    // Il file viene da una versione piu' nuova dell'app: meglio dirlo che tacere.
    if (!note.has(t)) { ignorate.push(t); continue }
    if (modo === 'sostituisci') await db.table(t).clear()
    await db.table(t).bulkPut(rows as never[])
    dettaglio.push({ tabella: nome(t), righe: rows.length })
  }

  // Le preferenze fuori dal database: solo quelle previste, mai chiavi arbitrarie
  // che arrivano da un file.
  let preferenze = 0
  for (const k of CHIAVI_FUORI) {
    const v = parsed.preferenze?.[k]
    if (typeof v !== 'string') continue
    try { localStorage.setItem(k, v); preferenze++ } catch { /* storage assente */ }
  }

  if (!dettaglio.length) {
    return { ok: false, message: 'Il file non conteneva nessun dato riconoscibile.', dettaglio, ignorate }
  }

  const totale = dettaglio.reduce((s, d) => s + d.righe, 0)
  return {
    ok: true,
    message: `${totale} record in ${dettaglio.length} tabelle${preferenze ? `, piu' ${preferenze} preferenze (WHOOP compreso)` : ''}.`,
    dettaglio: [...dettaglio].sort((a, b) => b.righe - a.righe),
    ignorate,
  }
}

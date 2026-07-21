// Import CSV universale: accetta l'export di qualsiasi app di gym log (Strong, Hevy, ecc.).
// Pipeline: parseCSV → mapping colonne (auto-detect o manuale) → buildPreview → runImport.
// Non salva nulla di derivato: crea solo grezzi (sessioni, esercizi, entries, set).

import { db, newId, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { normalizeName } from './catalog'
import { parseNum } from '../util/validate'
import type {
  WorkoutSession, WorkoutType, ExerciseEntry, SetEntry, Exercise, Unit,
} from './schema'

const U = LOCAL_USER_ID

// --- Campi canonici a cui l'utente mappa le colonne del suo CSV ---
export type CsvField =
  | 'date' | 'workout' | 'exercise' | 'setType' | 'weight' | 'reps' | 'rir' | 'rpe' | 'notes'

export const FIELD_LABELS: Record<CsvField, string> = {
  date: 'Data',
  workout: 'Nome allenamento',
  exercise: 'Esercizio',
  setType: 'Tipo serie (warmup)',
  weight: 'Peso',
  reps: 'Ripetizioni',
  rir: 'RIR',
  rpe: 'RPE',
  notes: 'Note',
}

/** Campi obbligatori per poter importare. */
export const REQUIRED_FIELDS: CsvField[] = ['date', 'exercise', 'weight', 'reps']

/** Alias header (lowercase) → campo canonico, per l'auto-detect di Strong/Hevy/altri. */
const HEADER_ALIASES: Record<CsvField, string[]> = {
  date: ['date', 'data', 'start_time', 'starttime', 'datetime', 'workout date', 'day', 'giorno'],
  workout: ['workout name', 'workout_name', 'workout', 'title', 'name', 'nome', 'routine', 'session'],
  exercise: ['exercise name', 'exercise_title', 'exercise_name', 'exercise', 'esercizio', 'movimento'],
  setType: ['set_type', 'set type', 'set order', 'set_order', 'type', 'tipo'],
  weight: ['weight', 'weight_kg', 'weight (kg)', 'weight (lbs)', 'kg', 'lbs', 'peso', 'carico', 'load'],
  reps: ['reps', 'rep', 'repetitions', 'ripetizioni', 'reps_done', 'ripetute'],
  rir: ['rir', 'reps in reserve'],
  rpe: ['rpe'],
  notes: ['notes', 'note', 'exercise_notes', 'workout notes', 'commento', 'comment'],
}

export type ColumnMap = Partial<Record<number, CsvField>> // indice colonna → campo

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  delimiter: string
}

// --- Parser CSV robusto (state machine: gestisce virgolette, delimitatori nel testo, newline) ---
export function parseCSV(input: string): ParsedCsv {
  let text = input.replace(/^﻿/, '') // togli BOM
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const delimiter = detectDelimiter(text)

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // virgoletta escapata
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      record.push(field); field = ''
    } else if (c === '\n') {
      record.push(field); field = ''
      if (record.some((v) => v.trim() !== '')) records.push(record)
      record = []
    } else field += c
  }
  // ultimo campo/record
  if (field !== '' || record.length) {
    record.push(field)
    if (record.some((v) => v.trim() !== '')) records.push(record)
  }

  const headers = (records.shift() ?? []).map((h) => h.trim())
  return { headers, rows: records, delimiter }
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1
    if (count > bestCount) { bestCount = count; best = d }
  }
  return best
}

/** Auto-detect del mapping dalle intestazioni note. Ritorna anche l'unità dedotta se presente. */
export function autoDetectMapping(headers: string[]): { map: ColumnMap; unit: Unit | null } {
  const map: ColumnMap = {}
  const used = new Set<CsvField>()
  let unit: Unit | null = null

  headers.forEach((h, i) => {
    const n = h.trim().toLowerCase()
    if (/\bkg\b/.test(n)) unit = unit ?? 'kg'
    else if (/\blbs?\b/.test(n)) unit = unit ?? 'lb'

    for (const field of Object.keys(HEADER_ALIASES) as CsvField[]) {
      if (used.has(field)) continue
      if (HEADER_ALIASES[field].some((a) => a === n)) {
        map[i] = field; used.add(field); break
      }
    }
  })
  return { map, unit }
}

// --- Normalizzazione valori ---
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12, // varianti IT
}
const pad = (n: number) => String(n).padStart(2, '0')

/** Converte una data in molti formati comuni a 'YYYY-MM-DD'. Null se non riconosciuta. */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // ISO: 2024-01-21 (con eventuale ora)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  // "21 Jan 2024" / "21 gen 2024" (Hevy)
  m = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{4})/)
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}` }
  // "Jan 21, 2024"
  m = s.match(/^([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[2])}` }
  // DD/MM/YYYY o MM/DD/YYYY o con - o . (assunzione europea DD/MM salvo giorno>12)
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
  if (m) {
    const a = +m[1], b = +m[2]; let y = +m[3]
    if (y < 100) y += 2000
    let day = a, mon = b
    if (a > 12 && b <= 12) { day = a; mon = b }
    else if (b > 12 && a <= 12) { day = b; mon = a }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return `${y}-${pad(mon)}-${pad(day)}`
  }
  return null
}

const KEYWORDS: [RegExp, WorkoutType][] = [
  [/full\s*body|total/i, 'fullbody'],
  [/upper|superiore/i, 'upper'],
  [/lower|inferiore/i, 'lower'],
  [/leg|gambe/i, 'legs'],
  [/push|spint/i, 'push'],
  [/pull|tir/i, 'pull'],
  [/bro\s*split/i, 'brosplit'],
]

export function inferWorkoutType(name: string): WorkoutType {
  for (const [re, t] of KEYWORDS) if (re.test(name)) return t
  return 'custom'
}

const isWarmupToken = (v: string) => /warm|risc|^w$/i.test(v.trim())

const LB_TO_KG = 0.453592
const KG_TO_LB = 2.20462
function convertWeight(w: number, from: Unit, to: Unit): number {
  if (from === to) return w
  const kg = from === 'lb' ? w * LB_TO_KG : w
  return to === 'lb' ? kg * KG_TO_LB : kg
}

// --- Anteprima ---
export interface PreviewSet { weight: number; reps: number; rir?: number; isWarmup?: boolean }
export interface PreviewEntry { exerciseName: string; isNew: boolean; sets: PreviewSet[] }
export interface PreviewSession { date: string; type: WorkoutType; name: string; entries: PreviewEntry[] }
export interface ImportPreview {
  sessions: PreviewSession[]
  totalRows: number
  recognizedRows: number
  skipped: { line: number; reason: string }[]
  newExercises: string[]
  sets: number
}

const cell = (row: string[], map: ColumnMap, field: CsvField): string => {
  const idx = Object.keys(map).map(Number).find((i) => map[i] === field)
  return idx == null ? '' : (row[idx] ?? '')
}

/**
 * Costruisce l'anteprima strutturata dai grezzi CSV.
 * @param fromUnit unità in cui sono espressi i pesi nel file
 * @param toUnit   unità dell'utente (destinazione)
 * @param known    nomi (normalizzati) degli esercizi già esistenti → per marcare i "nuovi"
 */
export function buildPreview(
  parsed: ParsedCsv, map: ColumnMap, fromUnit: Unit, toUnit: Unit, known: Set<string>,
): ImportPreview {
  const skipped: { line: number; reason: string }[] = []
  const byKey = new Map<string, PreviewSession>()
  const newExSet = new Set<string>()
  const seenKnown = new Set(known)
  let recognized = 0, setCount = 0

  parsed.rows.forEach((row, r) => {
    const line = r + 2 // +1 header, +1 base-1
    const exName = cell(row, map, 'exercise').trim()
    if (!exName) { skipped.push({ line, reason: 'esercizio mancante' }); return }

    const dateRaw = cell(row, map, 'date')
    const date = parseDate(dateRaw)
    if (!date) { skipped.push({ line, reason: `data non riconosciuta ("${dateRaw.slice(0, 20)}")` }); return }

    const reps = parseNum(cell(row, map, 'reps'), { min: 1, max: 1000, int: true })
    if (reps == null) { skipped.push({ line, reason: 'ripetizioni mancanti/non valide' }); return }

    const wRaw = cell(row, map, 'weight').trim()
    const wNum = wRaw === '' ? 0 : parseNum(wRaw, { min: 0, max: 10000 })
    if (wNum == null) { skipped.push({ line, reason: 'peso non valido' }); return }
    const weight = +convertWeight(wNum, fromUnit, toUnit).toFixed(2)

    // RIR diretto, o derivato da RPE (rir = 10 − rpe)
    let rir = map && cell(row, map, 'rir') !== '' ? parseNum(cell(row, map, 'rir'), { min: 0, max: 10, int: true }) : null
    if (rir == null) {
      const rpe = cell(row, map, 'rpe') !== '' ? parseNum(cell(row, map, 'rpe'), { min: 0, max: 10 }) : null
      if (rpe != null) rir = Math.max(0, Math.min(10, Math.round(10 - rpe)))
    }

    const isWarmup = isWarmupToken(cell(row, map, 'setType'))
    const workoutName = cell(row, map, 'workout').trim() || 'Allenamento importato'
    const key = `${date}||${workoutName.toLowerCase()}`

    let session = byKey.get(key)
    if (!session) { session = { date, type: inferWorkoutType(workoutName), name: workoutName, entries: [] }; byKey.set(key, session) }

    let entry = session.entries.find((e) => normalizeName(e.exerciseName) === normalizeName(exName))
    if (!entry) {
      const norm = normalizeName(exName)
      const isNew = !seenKnown.has(norm)
      if (isNew) { newExSet.add(exName); seenKnown.add(norm) }
      entry = { exerciseName: exName, isNew, sets: [] }
      session.entries.push(entry)
    }

    entry.sets.push({ weight, reps, ...(rir != null ? { rir } : {}), ...(isWarmup ? { isWarmup: true } : {}) })
    recognized++; setCount++
  })

  const sessions = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { sessions, totalRows: parsed.rows.length, recognizedRows: recognized, skipped, newExercises: [...newExSet], sets: setCount }
}

// --- Scrittura ---
export interface ImportResult { ok: boolean; message: string; sessions: number; sets: number; newExercises: number }

/** Scrive l'anteprima nel DB: crea esercizi mancanti, sessioni, entries e set (bulk). */
export async function runImport(preview: ImportPreview): Promise<ImportResult> {
  if (preview.sessions.length === 0) return { ok: false, message: 'Niente da importare.', sessions: 0, sets: 0, newExercises: 0 }

  // 1) Risolvi esercizi (per nome/alias); crea i mancanti.
  const existing = await db.exercises.where('userId').equals(U).toArray()
  const byNorm = new Map<string, Exercise>()
  for (const e of existing) {
    byNorm.set(normalizeName(e.name), e)
    for (const a of e.aliases) byNorm.set(normalizeName(a), e)
  }

  const ts = nowISO()
  const newExercises: Exercise[] = []
  const resolveId = (name: string): string => {
    const norm = normalizeName(name)
    const hit = byNorm.get(norm)
    if (hit) return hit.id
    const ex: Exercise = {
      id: newId(), userId: U, createdAt: ts, updatedAt: ts,
      name: name.trim(), muscle: 'altro', isCustom: true, aliases: [],
    }
    newExercises.push(ex); byNorm.set(norm, ex)
    return ex.id
  }

  const gyms = await db.gyms.where('userId').equals(U).toArray()
  const gymId = (gyms.find((g) => g.isDefault) ?? gyms[0])?.id ?? null

  const sessions: WorkoutSession[] = []
  const entries: ExerciseEntry[] = []
  const sets: SetEntry[] = []
  let clock = 0 // per timestamp createdAt crescenti → ordine cronologico stabile

  for (const s of preview.sessions) {
    const base = Date.parse(`${s.date}T12:00:00Z`)
    const startedAt = new Date(base + clock++ * 1000).toISOString()
    const sessionId = newId()
    sessions.push({
      id: sessionId, userId: U, createdAt: startedAt, updatedAt: startedAt,
      gymId, date: s.date, type: s.type, startedAt, finishedAt: startedAt,
      phaseId: null, readiness: null, notes: 'Importato da CSV',
    })
    s.entries.forEach((e, ei) => {
      const entryId = newId()
      entries.push({ id: entryId, userId: U, createdAt: startedAt, updatedAt: startedAt, sessionId, exerciseId: resolveId(e.exerciseName), order: ei })
      e.sets.forEach((st, si) => {
        const setTs = new Date(base + clock++ * 1000).toISOString()
        sets.push({
          id: newId(), userId: U, createdAt: setTs, updatedAt: setTs,
          entryId, order: si, weight: st.weight, reps: st.reps,
          ...(st.rir != null ? { rir: st.rir } : {}),
          ...(st.isWarmup ? { isWarmup: true } : {}),
        })
      })
    })
  }

  await db.transaction('rw', db.exercises, db.sessions, db.exerciseEntries, db.sets, async () => {
    if (newExercises.length) await db.exercises.bulkAdd(newExercises)
    await db.sessions.bulkAdd(sessions)
    await db.exerciseEntries.bulkAdd(entries)
    await db.sets.bulkAdd(sets)
  })

  return {
    ok: true,
    message: `Import completato: ${sessions.length} sedute, ${sets.length} serie${newExercises.length ? `, ${newExercises.length} esercizi nuovi` : ''}.`,
    sessions: sessions.length, sets: sets.length, newExercises: newExercises.length,
  }
}

// Statistiche cardio: medie durata e BPM su periodo selezionabile + serie settimanale.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal } from '../util/date'
import type { CardioType } from '../db/schema'

const U = LOCAL_USER_ID
const DAY = 86_400_000
const ms = (d: string) => new Date(d + 'T00:00:00').getTime()

export interface CardioAverages {
  count: number
  avgDurationMin: number | null
  avgBpm: number | null
}

/** Medie cardio sugli ultimi `days` giorni (durata sempre, BPM solo se presente). */
export async function computeCardioAverages(days: number): Promise<CardioAverages> {
  const nowMs = ms(todayLocal())
  const rows = (await db.cardio.where('userId').equals(U).toArray())
    .filter((c) => ms(c.date) > nowMs - days * DAY)
  if (rows.length === 0) return { count: 0, avgDurationMin: null, avgBpm: null }
  const avgDur = rows.reduce((a, c) => a + c.durationMin, 0) / rows.length
  const withBpm = rows.filter((c) => typeof c.avgBpm === 'number')
  const avgBpm = withBpm.length ? withBpm.reduce((a, c) => a + (c.avgBpm as number), 0) / withBpm.length : null
  return {
    count: rows.length,
    avgDurationMin: +avgDur.toFixed(1),
    avgBpm: avgBpm != null ? Math.round(avgBpm) : null,
  }
}

export interface Point { label: string; value: number }

export interface PuntoEfficienza { date: string; watt: number; bpm: number; eff: number }

/**
 * Watt per battito, seduta per seduta, divisi per tipo (servono watt e BPM).
 * Se la linea sale, a parità di cuore spingi di più: il cardio ti allena.
 */
export async function computeEfficienza(): Promise<Partial<Record<CardioType, PuntoEfficienza[]>>> {
  const rows = (await db.cardio.where('userId').equals(U).toArray())
    .filter((c) => c.watt && c.avgBpm)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const out: Partial<Record<CardioType, PuntoEfficienza[]>> = {}
  for (const c of rows) {
    const t = c.cardioType ?? 'altro'
    ;(out[t] ??= []).push({ date: c.date, watt: c.watt!, bpm: c.avgBpm!, eff: c.watt! / c.avgBpm! })
  }
  return out
}

/** Minuti totali di cardio per settimana (ultime N settimane) — per Analytics. */
export async function computeCardioWeekly(weeks = 8): Promise<Point[]> {
  const nowMs = ms(todayLocal())
  const rows = await db.cardio.where('userId').equals(U).toArray()
  const out: Point[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const hi = nowMs - w * 7 * DAY
    const lo = hi - 7 * DAY
    const mins = rows.filter((c) => ms(c.date) <= hi && ms(c.date) > lo).reduce((a, c) => a + c.durationMin, 0)
    const d = new Date(lo + DAY)
    out.push({ label: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, value: Math.round(mins) })
  }
  return out
}

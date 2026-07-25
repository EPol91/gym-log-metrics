// Consistency Score — costanza sulle date. SCORE_FORMULE.md §4.
// 100 × (0.60 aderenza + 0.25 regolarità + 0.15 streak). Finestra 4 settimane. Affidabilità ALTA.
import { clamp } from '../metrics/metrics'
import type { ISODate } from '../db/schema'
import type { ScoreResult } from './types'

function toDate(d: ISODate): number {
  return new Date(d + 'T00:00:00').getTime()
}
const DAY = 86_400_000

/** Cambio di obiettivo: da `date` in poi vale `target`. */
export interface GoalChange { date: ISODate; target: number }

export function computeConsistency(
  sessionDates: ISODate[],
  weeklyTarget: number,
  referenceDate: ISODate,
  windowWeeks = 4,
  /** Storico dei cambi: ogni settimana viene giudicata con l'obiettivo valido allora. */
  goalHistory: GoalChange[] = [],
): ScoreResult {
  if (weeklyTarget <= 0) {
    return { value: null, reliability: 'insufficiente', note: 'Obiettivo settimanale non impostato.' }
  }
  const refMs = toDate(referenceDate)
  const windowMs = windowWeeks * 7 * DAY
  const inWindow = sessionDates
    .map(toDate)
    .filter((t) => t <= refMs && t > refMs - windowMs)
    .sort((a, b) => a - b)

  // Obiettivo in vigore a una certa data. Prima del primo cambio registrato usiamo
  // quello attuale: del passato non tracciato non possiamo sapere nulla.
  const changes = [...goalHistory].sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ t: toDate(g.date), target: g.target }))
  const targetAt = (ms: number): number => {
    let v = changes.length ? changes[0].target : weeklyTarget
    for (const c of changes) { if (c.t <= ms) v = c.target; else break }
    return v > 0 ? v : weeklyTarget
  }

  // Settimane della finestra, dalla più vecchia: [inizio, fine) + obiettivo di allora.
  const weeks = Array.from({ length: windowWeeks }, (_, i) => {
    const hi = refMs - (windowWeeks - 1 - i) * 7 * DAY
    const lo = hi - 7 * DAY
    return { lo, hi, target: targetAt(hi), count: inWindow.filter((t) => t <= hi && t > lo).length }
  })
  const targetSum = weeks.reduce((a, w) => a + w.target, 0)
  const goalChangedInWindow = new Set(weeks.map((w) => w.target)).size > 1

  // 1. Aderenza (60%) — sedute fatte su sedute richieste, settimana per settimana.
  const adherence = targetSum > 0 ? clamp(inWindow.length / targetSum, 0, 1) : 0

  // 2. Regolarità (25%): penalizza il buco più grosso rispetto al ritmo previsto.
  const avgTarget = targetSum / windowWeeks || weeklyTarget
  const expectedGapDays = 7 / avgTarget
  let regularity = 1
  if (inWindow.length >= 2) {
    let maxGap = 0
    for (let i = 1; i < inWindow.length; i++) {
      maxGap = Math.max(maxGap, (inWindow[i] - inWindow[i - 1]) / DAY)
    }
    regularity = clamp(1 - (maxGap - expectedGapDays) / (2 * expectedGapDays), 0, 1)
  } else {
    regularity = adherence // troppo pochi dati per valutare la spaziatura
  }

  // 3. Streak (15%): settimane consecutive (indietro da ref) che centrano l'obiettivo, cap 8.
  let streakWeeks = 0
  for (let w = 0; w < 8; w++) {
    const hi = refMs - w * 7 * DAY
    const lo = hi - 7 * DAY
    const count = sessionDates.map(toDate).filter((t) => t <= hi && t > lo).length
    if (count >= targetAt(hi)) streakWeeks++ // obiettivo di QUELLA settimana
    else break
  }
  const streak = streakWeeks / 8

  const value = 100 * (0.6 * adherence + 0.25 * regularity + 0.15 * streak)

  // Affidabilità ALTA (matematica sulle date); provvisorio solo con pochissimo storico.
  const reliability: ScoreResult['reliability'] = inWindow.length >= 2 ? 'alta' : 'media'
  const note = inWindow.length < 2 ? 'Poche sedute nella finestra: provvisorio.' : undefined

  let maxGapDays = 0
  for (let i = 1; i < inWindow.length; i++) maxGapDays = Math.max(maxGapDays, (inWindow[i] - inWindow[i - 1]) / DAY)

  return {
    value: Math.round(value), reliability, note,
    parts: [
      { label: 'Aderenza', value: Math.round(adherence * 100), weight: 0.6 },
      { label: 'Regolarità', value: Math.round(regularity * 100), weight: 0.25 },
      { label: 'Continuità', value: Math.round(streak * 100), weight: 0.15 },
    ],
    facts: [
      { label: `Sedute in ${windowWeeks} settimane`, value: `${inWindow.length} su ${targetSum}` },
      { label: 'Pausa più lunga', value: inWindow.length >= 2 ? `${Math.round(maxGapDays)} giorni` : '—' },
      { label: 'Settimane a obiettivo', value: `${streakWeeks} di fila` },
      ...(goalChangedInWindow
        ? [{ label: 'Obiettivo per settimana', value: weeks.map((w) => w.target).join(' → ') }]
        : []),
    ],
  }
}

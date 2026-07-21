// Consistency Score — costanza sulle date. SCORE_FORMULE.md §4.
// 100 × (0.60 aderenza + 0.25 regolarità + 0.15 streak). Finestra 4 settimane. Affidabilità ALTA.
import { clamp } from '../metrics/metrics'
import type { ISODate } from '../db/schema'
import type { ScoreResult } from './types'

function toDate(d: ISODate): number {
  return new Date(d + 'T00:00:00').getTime()
}
const DAY = 86_400_000

export function computeConsistency(
  sessionDates: ISODate[],
  weeklyTarget: number,
  referenceDate: ISODate,
  windowWeeks = 4,
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

  // 1. Aderenza (60%)
  const adherence = clamp(inWindow.length / (weeklyTarget * windowWeeks), 0, 1)

  // 2. Regolarità (25%): penalizza il buco più grosso rispetto al ritmo previsto.
  const expectedGapDays = 7 / weeklyTarget
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
    if (count >= weeklyTarget) streakWeeks++
    else break
  }
  const streak = streakWeeks / 8

  const value = 100 * (0.6 * adherence + 0.25 * regularity + 0.15 * streak)

  // Affidabilità ALTA (matematica sulle date); provvisorio solo con pochissimo storico.
  const reliability: ScoreResult['reliability'] = inWindow.length >= 2 ? 'alta' : 'media'
  const note = inWindow.length < 2 ? 'Poche sedute nella finestra: provvisorio.' : undefined

  return { value: Math.round(value), reliability, note }
}

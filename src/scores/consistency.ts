// Consistency Score — costanza sulle date. SCORE_FORMULE.md §4.
// 100 × (0.60 aderenza + 0.25 regolarità + 0.15 streak). Finestra 4 cicli. Affidabilità ALTA.
//
// Il ciclo e' N sedute ogni M giorni, non per forza una settimana. Chi si
// allena 5 volte ogni 8 giorni, giudicato a settimane, fa 5 e poi 4: l'aderenza
// oscilla e la continuita' si spezza a ogni ciclo pur avendo fatto tutto quello
// che c'era da fare. La settimana e' una griglia comoda, non un fatto.
import { clamp } from '../metrics/metrics'
import type { ISODate } from '../db/schema'
import type { ScoreResult } from './types'

function toDate(d: ISODate): number {
  return new Date(d + 'T00:00:00').getTime()
}
const DAY = 86_400_000

/** Cambio di obiettivo: da `date` in poi vale `target`. */
export interface GoalChange { date: ISODate; target: number }

/** Il tuo obiettivo: N sedute ogni M giorni, a partire da una data. */
export interface Ciclo { sedute: number; giorni: number; inizio?: ISODate }

/**
 * I confini del ciclo che contiene una certa data, contati dalla data di
 * partenza che hai scelto tu: senza un'ancora i cicli scivolerebbero a ogni
 * ricalcolo e "giorno 6 di 8" non vorrebbe dire niente.
 */
export function cicloDi(date: ISODate, c: Ciclo): { inizio: number; fine: number; giorno: number } {
  const ms = toDate(date)
  const zero = c.inizio ? toDate(c.inizio) : ms
  const passati = Math.floor((ms - zero) / (c.giorni * DAY))
  const inizio = zero + passati * c.giorni * DAY
  return { inizio, fine: inizio + c.giorni * DAY, giorno: Math.round((ms - inizio) / DAY) + 1 }
}

export function computeConsistency(
  sessionDates: ISODate[],
  ciclo: Ciclo,
  referenceDate: ISODate,
  windowCicli = 4,
  /** Storico dei cambi: ogni ciclo viene giudicato con l'obiettivo valido allora. */
  goalHistory: GoalChange[] = [],
): ScoreResult {
  const perCiclo = ciclo.sedute
  const giorniCiclo = ciclo.giorni
  if (perCiclo <= 0 || giorniCiclo <= 0) {
    return { value: null, reliability: 'insufficiente', note: 'Obiettivo di allenamento non impostato.' }
  }
  // La finestra finisce alla fine del ciclo in corso: cosi' i confini sono
  // sempre quelli veri del tuo ciclo, non gli ultimi 32 giorni a caso.
  const corrente = cicloDi(referenceDate, ciclo)
  const refMs = toDate(referenceDate)
  const windowMs = windowCicli * giorniCiclo * DAY
  const inWindow = sessionDates
    .map(toDate)
    .filter((t) => t <= refMs && t > refMs - windowMs)
    .sort((a, b) => a - b)

  // Obiettivo in vigore a una certa data. Prima del primo cambio registrato usiamo
  // quello attuale: del passato non tracciato non possiamo sapere nulla.
  const changes = [...goalHistory].sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ t: toDate(g.date), target: g.target }))
  const targetAt = (ms: number): number => {
    let v = changes.length ? changes[0].target : perCiclo
    for (const c of changes) { if (c.t <= ms) v = c.target; else break }
    return v > 0 ? v : perCiclo
  }

  // I cicli della finestra, dal più vecchio: [inizio, fine) + obiettivo di allora.
  // Il ciclo in corso e' l'ultimo, ed e' ancora aperto: conta com'e' adesso.
  const cicli = Array.from({ length: windowCicli }, (_, i) => {
    const lo = corrente.inizio - (windowCicli - 1 - i) * giorniCiclo * DAY
    const hi = lo + giorniCiclo * DAY
    return { lo, hi, target: targetAt(lo), count: inWindow.filter((t) => t >= lo && t < hi).length }
  })
  const targetSum = cicli.reduce((a, c) => a + c.target, 0)
  const goalChangedInWindow = new Set(cicli.map((c) => c.target)).size > 1

  // 1. Aderenza (60%) — sedute fatte su sedute richieste, ciclo per ciclo.
  const fatte = cicli.reduce((a, c) => a + c.count, 0)
  const adherence = targetSum > 0 ? clamp(fatte / targetSum, 0, 1) : 0

  // 2. Regolarità (25%): penalizza il buco più grosso rispetto al ritmo previsto.
  const avgTarget = targetSum / windowCicli || perCiclo
  const expectedGapDays = giorniCiclo / avgTarget
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

  // 3. Streak (15%): cicli CHIUSI consecutivi a obiettivo, all'indietro, cap 8.
  // Il ciclo in corso non entra: e' ancora aperto, e bocciarlo a meta' strada
  // vorrebbe dire azzerare la striscia ogni volta che ne comincia uno.
  const tutte = sessionDates.map(toDate)
  let streakCicli = 0
  for (let k = 1; k <= 8; k++) {
    const lo = corrente.inizio - k * giorniCiclo * DAY
    const hi = lo + giorniCiclo * DAY
    const count = tutte.filter((t) => t >= lo && t < hi).length
    if (count >= targetAt(lo)) streakCicli++
    else break
  }
  const streak = streakCicli / 8

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
      { label: `Sedute in ${windowCicli} cicli`, value: `${fatte} su ${targetSum}` },
      { label: 'Ciclo in corso', value: `${cicli[cicli.length - 1].count} su ${perCiclo} · giorno ${corrente.giorno} di ${giorniCiclo}` },
      { label: 'Pausa più lunga', value: inWindow.length >= 2 ? `${Math.round(maxGapDays)} giorni` : '—' },
      { label: 'Cicli a obiettivo', value: `${streakCicli} di fila` },
      ...(goalChangedInWindow
        ? [{ label: 'Obiettivo per ciclo', value: cicli.map((c) => c.target).join(' → ') }]
        : []),
    ],
  }
}

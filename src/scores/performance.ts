// Performance Score — progresso nel tempo, phase-aware. SCORE_FORMULE.md §3.
// 50 = fermo (il "fermo" è ricalibrato dalla fase). Performance = 50 + forza(±30) + volume(±var) + PR(+5).
import { clamp } from '../metrics/metrics'
import type { Phase } from '../db/schema'
import type { ScoreResult } from './types'

interface PhaseCalibration {
  /** % variazione e1RM che mappa a 0 punti (il "plateau" della fase) */
  strengthNeutralPct: number
  /** % variazione e1RM che mappa a +30 punti pieni */
  strengthFullPct: number
  /** peso massimo del contributo volume (± punti) */
  volumeWeight: number
}

const PHASE_CAL: Record<Phase, PhaseCalibration> = {
  bulk: { strengthNeutralPct: 0, strengthFullPct: 5, volumeWeight: 15 },
  cut: { strengthNeutralPct: -4, strengthFullPct: 1, volumeWeight: 8 },
  recomp: { strengthNeutralPct: 0, strengthFullPct: 3, volumeWeight: 12 },
  maintenance: { strengthNeutralPct: 0, strengthFullPct: 2, volumeWeight: 10 },
}

export interface PerformanceInput {
  phase: Phase
  /** variazione % mediana e1RM dei fondamentali sulla finestra (~6 settimane) */
  strengthPctChange: number
  /** variazione % del volume/tonnellaggio sulla finestra */
  volumePctChange: number
  /** numero di PR nel periodo */
  prCount: number
  /** settimane di dati dentro la fase corrente */
  weeksInPhase: number
  /** settimane dall'ultimo cambio di fase */
  weeksSincePhaseChange: number
}

export function computePerformance(inp: PerformanceInput): ScoreResult {
  const cal = PHASE_CAL[inp.phase]

  // Forza: da neutral(0pt) a full(+30pt), lineare, clamp ±30.
  const span = cal.strengthFullPct - cal.strengthNeutralPct
  const strengthPts = span !== 0
    ? clamp(((inp.strengthPctChange - cal.strengthNeutralPct) / span) * 30, -30, 30)
    : 0

  // Volume: 10% sulla finestra → contributo pieno della fase.
  const volumePts = cal.volumeWeight * clamp(inp.volumePctChange / 10, -1, 1)

  const prPts = Math.min(5, inp.prCount * 2.5)

  const value = clamp(50 + strengthPts + volumePts + prPts, 0, 100)

  // Affidabilità + gestione transizione di fase.
  let reliability: ScoreResult['reliability']
  let note: string | undefined
  if (inp.weeksSincePhaseChange < 3) {
    reliability = 'inferenziale'
    note = 'Transizione di fase recente: punteggio provvisorio, calo iniziale atteso.'
  } else if (inp.weeksInPhase < 3) {
    reliability = 'inferenziale'
    note = 'Dati insufficienti nella fase (< 3 settimane): preliminare.'
  } else if (inp.weeksInPhase < 6) {
    reliability = 'media'
  } else {
    reliability = 'alta'
  }

  return { value: Math.round(value), reliability, note }
}

// Tipi comuni degli Score. Ogni Score dichiara la propria affidabilità (Bible principio #9).

export type Reliability = 'alta' | 'media' | 'inferenziale' | 'insufficiente'

/** Un ingrediente del punteggio: quanto vale (0-100) e quanto pesa nella formula (0-1). */
export interface ScorePart {
  label: string
  value: number
  weight: number
}

/** Dato grezzo dietro il punteggio, mostrato com'è ("13 su 16", "5 giorni"). */
export interface ScoreFact { label: string; value: string }

export interface ScoreResult {
  /** 0-100, oppure null se non calcolabile (dati insufficienti). */
  value: number | null
  reliability: Reliability
  /** breve spiegazione/dichiarazione (es. "aggiustamento carico spento: poco storico"). */
  note?: string
  /** Scomposizione per il dettaglio del KPI. Descrittiva: non entra nel calcolo. */
  parts?: ScorePart[]
  facts?: ScoreFact[]
}

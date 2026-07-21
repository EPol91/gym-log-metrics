// Tipi comuni degli Score. Ogni Score dichiara la propria affidabilità (Bible principio #9).

export type Reliability = 'alta' | 'media' | 'inferenziale' | 'insufficiente'

export interface ScoreResult {
  /** 0-100, oppure null se non calcolabile (dati insufficienti). */
  value: number | null
  reliability: Reliability
  /** breve spiegazione/dichiarazione (es. "aggiustamento carico spento: poco storico"). */
  note?: string
}

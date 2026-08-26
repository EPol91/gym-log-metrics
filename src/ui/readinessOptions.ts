// Scale del check pre-workout (vedi SCORE_FORMULE.md). Ogni opzione mappa a 0-100.
export interface OptScale {
  key: 'sleep' | 'fatigue' | 'soreness' | 'energy' | 'stress' | 'motivation'
  label: string
  /**
   * Cosa misura davvero, in una riga.
   *
   * Stanchezza ed energia sembrano la stessa domanda finche' non ti dicono che
   * una guarda indietro e l'altra avanti: si puo' essere distrutti e carichi, o
   * riposati e spenti — ed e' proprio quando le due non coincidono che il check
   * dice qualcosa invece di ripetersi.
   */
  aiuto: string
  options: { text: string; value: number }[]
}

export const READINESS_QUESTIONS: OptScale[] = [
  {
    key: 'sleep', label: '😴 Come hai dormito?',
    aiuto: 'La notte appena passata: quanto e come, non come ti senti adesso.',
    options: [
      { text: 'Pessimo', value: 0 }, { text: 'Scarso', value: 25 },
      { text: 'Ok', value: 50 }, { text: 'Buono', value: 75 }, { text: 'Ottimo', value: 100 },
    ],
  },
  {
    key: 'fatigue', label: '🥵 Quanto sei stanco? (fatica generale)',
    aiuto: 'Quanto sei consumato. Guarda indietro: notti corte, giornata pesante, allenamenti accumulati.',
    options: [
      { text: 'Per niente', value: 100 }, { text: 'Poco', value: 75 },
      { text: 'Medio', value: 50 }, { text: 'Molto', value: 25 }, { text: 'Distrutto', value: 0 },
    ],
  },
  {
    key: 'soreness', label: '💪 Quanto sei indolenzito? (DOMS muscolari)',
    aiuto: 'I muscoli che tirano dalle sedute dei giorni scorsi. Solo il corpo, non la testa.',
    options: [
      { text: 'Per niente', value: 100 }, { text: 'Poco', value: 75 },
      { text: 'Medio', value: 50 }, { text: 'Molto', value: 25 }, { text: 'Estremo', value: 0 },
    ],
  },
  {
    key: 'energy', label: '⚡ Quanta energia hai?',
    aiuto: 'La spinta che hai adesso. Guarda avanti: puoi essere distrutto e carico, o riposato e spento.',
    options: [
      { text: 'Scarica', value: 0 }, { text: 'Poca', value: 25 },
      { text: 'Media', value: 50 }, { text: 'Buona', value: 75 }, { text: 'Al massimo', value: 100 },
    ],
  },
  {
    key: 'stress', label: '🧠 Quanto sei sotto stress?',
    aiuto: 'Testa e vita fuori dalla palestra: lavoro, casa, pensieri. Pesa sul recupero come una notte storta.',
    options: [
      { text: 'Per niente', value: 100 }, { text: 'Poco', value: 75 },
      { text: 'Medio', value: 50 }, { text: 'Molto', value: 25 }, { text: 'Sotto pressione', value: 0 },
    ],
  },
  {
    key: 'motivation', label: '🔥 Quanta voglia di allenarti hai?',
    aiuto: 'La voglia, non la forza. Non tocca il Readiness — è spinta, non recupero — ma al coach interessa.',
    options: [
      { text: 'Nessuna', value: 0 }, { text: 'Poca', value: 25 },
      { text: 'Media', value: 50 }, { text: 'Buona', value: 75 }, { text: 'Carichissimo', value: 100 },
    ],
  },
]

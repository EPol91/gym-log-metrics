// Scale del check pre-workout (vedi SCORE_FORMULE.md). Ogni opzione mappa a 0-100.
export interface OptScale {
  key: 'sleep' | 'fatigue' | 'energy'
  label: string
  options: { text: string; value: number }[]
}

export const READINESS_QUESTIONS: OptScale[] = [
  {
    key: 'sleep', label: '😴 Come hai dormito?',
    options: [
      { text: 'Pessimo', value: 0 }, { text: 'Scarso', value: 25 },
      { text: 'Ok', value: 50 }, { text: 'Buono', value: 75 }, { text: 'Ottimo', value: 100 },
    ],
  },
  {
    key: 'fatigue', label: '🥵 Quanto sei stanco/indolenzito?',
    options: [
      { text: 'Nessuna', value: 100 }, { text: 'Poca', value: 75 },
      { text: 'Media', value: 50 }, { text: 'Alta', value: 25 }, { text: 'Estrema', value: 0 },
    ],
  },
  {
    key: 'energy', label: '⚡ Quanta energia hai?',
    options: [
      { text: 'Scarica', value: 0 }, { text: 'Poca', value: 25 },
      { text: 'Media', value: 50 }, { text: 'Buona', value: 75 }, { text: 'Al massimo', value: 100 },
    ],
  },
]

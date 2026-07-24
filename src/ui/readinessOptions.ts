// Scale del check pre-workout (vedi SCORE_FORMULE.md). Ogni opzione mappa a 0-100.
export interface OptScale {
  key: 'sleep' | 'fatigue' | 'soreness' | 'energy'
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
    key: 'fatigue', label: '🥵 Quanto sei stanco? (fatica generale)',
    options: [
      { text: 'Per niente', value: 100 }, { text: 'Poco', value: 75 },
      { text: 'Medio', value: 50 }, { text: 'Molto', value: 25 }, { text: 'Distrutto', value: 0 },
    ],
  },
  {
    key: 'soreness', label: '💪 Quanto sei indolenzito? (DOMS muscolari)',
    options: [
      { text: 'Per niente', value: 100 }, { text: 'Poco', value: 75 },
      { text: 'Medio', value: 50 }, { text: 'Molto', value: 25 }, { text: 'Estremo', value: 0 },
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

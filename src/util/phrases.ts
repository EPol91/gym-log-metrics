// Frasi motivazionali. Ne cambia una al giorno (stabile nella giornata).

const DAILY = [
  'Oggi si costruisce.',
  'Un mattone alla volta.',
  'La costanza batte il talento.',
  'Il migliore di ieri è il minimo di oggi.',
  'Presentati. Il resto viene.',
  'Piccoli progressi, ogni giorno.',
  'Disciplina = libertà.',
  'Fai la fatica che gli altri evitano.',
  'I risultati amano chi insiste.',
  'Nessuna scusa, solo lavoro.',
]

const WORKOUT = [
  'Spacca tutto. 💥',
  'Una serie in più di ieri.',
  'Tecnica pulita, testa dentro.',
  'Ogni rep conta.',
  'Oggi il ferro ti rispetta.',
  'Concentrazione, poi cedimento.',
  'Sei qui: metà del lavoro è fatta.',
  'Vai a prendertelo.',
]

function pick(arr: string[]): string {
  const d = new Date()
  const day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
  return arr[day % arr.length]
}

export const dailyPhrase = (): string => pick(DAILY)
export const workoutPhrase = (): string => pick(WORKOUT)

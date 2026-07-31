// Il cuore di una finestra di tempo.
//
// La stessa funzione serve due domande diverse: com'e' andato il cuore in TUTTA
// la seduta, e com'e' andato nel solo cardio finale. Cambia solo l'intervallo
// che le passi — e senza l'orario di ogni lettura non si potrebbe fare nessuna
// delle due, perche' una media sola non si taglia a fette.

import { computeCardioZone } from './cardio'
type CardioZone = 1 | 2 | 3 | 4 | 5
import type { CardioMethod } from '../db/schema'

/**
 * Le letture di una seduta, in forma compatta: l'istante della prima, il passo
 * in secondi e i battiti in fila. Novanta minuti a cinque secondi sono circa
 * mille numeri — una manciata di caratteri, non un archivio.
 */
export interface SerieCuore {
  t0: string
  step: number
  bpm: number[]
}

export interface MetricheCuore {
  min: number
  media: number
  max: number
  /** secondi passati in ciascuna zona, dalla 1 alla 5 */
  zone: Record<CardioZone, number>
  /** la zona in cui hai passato piu' tempo */
  zonaPrevalente: CardioZone | null
  /** quanto e' durata la finestra, in minuti */
  minuti: number
  letture: number
}

export interface ProfiloCuore {
  age: number
  restingHr?: number
  maxHr?: number
  method?: CardioMethod
}

/** L'istante di una lettura, ricavato dalla posizione. */
export const istanteDi = (s: SerieCuore, i: number): number =>
  new Date(s.t0).getTime() + i * s.step * 1000

/**
 * Metriche del cuore fra due istanti. `da`/`a` assenti = tutta la serie.
 * Fuori dalla finestra non si guarda: e' esattamente cosi' che il cardio finale
 * resta separato dal resto della seduta.
 */
export function metricheCuore(
  s: SerieCuore | undefined,
  profilo: ProfiloCuore,
  da?: string | null,
  a?: string | null,
): MetricheCuore | null {
  if (!s?.bpm?.length) return null
  const inizio = da ? new Date(da).getTime() : -Infinity
  const fine = a ? new Date(a).getTime() : Infinity

  const dentro: number[] = []
  for (let i = 0; i < s.bpm.length; i++) {
    const t = istanteDi(s, i)
    if (t >= inizio && t <= fine) dentro.push(s.bpm[i])
  }
  if (!dentro.length) return null

  const zone: Record<CardioZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const v of dentro) {
    const z = computeCardioZone({
      avgBpm: v, age: profilo.age, restingHr: profilo.restingHr,
      method: profilo.method ?? 'standard', maxHr: profilo.maxHr,
    })
    if (z) zone[z.zone] += s.step
  }
  const prevalente = (Object.entries(zone) as [string, number][])
    .filter(([, sec]) => sec > 0)
    .sort((x, y) => y[1] - x[1])[0]

  return {
    min: Math.min(...dentro),
    max: Math.max(...dentro),
    media: Math.round(dentro.reduce((x, y) => x + y, 0) / dentro.length),
    zone,
    zonaPrevalente: prevalente ? (Number(prevalente[0]) as CardioZone) : null,
    minuti: Math.round((dentro.length * s.step) / 60),
    letture: dentro.length,
  }
}

/**
 * Calorie stimate dalla frequenza media (Keytel), la stessa formula gia' usata
 * per il cardio: cosi' i due numeri non possono contraddirsi.
 */
export function kcalDaCuore(m: MetricheCuore, peso: number | null, eta: number, sesso?: 'm' | 'f'): number | null {
  if (!peso || !eta || !m.minuti) return null
  const kcalMin = sesso === 'f'
    ? (-20.4022 + 0.4472 * m.media - 0.1263 * peso + 0.074 * eta) / 4.184
    : (-55.0969 + 0.6309 * m.media + 0.1988 * peso + 0.2017 * eta) / 4.184
  return kcalMin > 0 ? Math.round(kcalMin * m.minuti) : null
}

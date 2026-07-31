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
    // Lo zero non e' un battito: e' la fascia che taceva, e non deve entrare
    // in nessuna media.
    if (t >= inizio && t <= fine && s.bpm[i] > 0) dentro.push(s.bpm[i])
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

/**
 * Quanto scende il cuore nel minuto dopo il picco.
 *
 * E' l'indicatore piu' onesto di come stai messo a livello cardiaco: due
 * persone con la stessa media possono avere recuperi opposti, e chi scende in
 * fretta e' quello allenato. Si misura dal massimo della finestra, perche' e'
 * li' che lo sforzo e' finito davvero — non alla fine dell'orologio.
 *
 * Null se dopo il picco non c'e' un minuto di letture: meglio niente che un
 * numero costruito su tre battiti.
 */
export function recuperoCuore(s: SerieCuore | undefined, da?: string | null, a?: string | null, secondi = 60): { caduta: number; da: number; a: number; secondi: number } | null {
  if (!s?.bpm?.length) return null
  const inizio = da ? new Date(da).getTime() : -Infinity
  const fine = a ? new Date(a).getTime() : Infinity

  let iPicco = -1, picco = -1
  for (let i = 0; i < s.bpm.length; i++) {
    const t = istanteDi(s, i)
    if (t < inizio || t > fine) continue
    if (s.bpm[i] > picco) { picco = s.bpm[i]; iPicco = i }
  }
  if (iPicco < 0) return null

  const passi = Math.round(secondi / s.step)
  const iDopo = iPicco + passi
  if (iDopo >= s.bpm.length || istanteDi(s, iDopo) > fine) return null

  // Il minimo nella finestra dopo il picco, non il valore esatto al minuto:
  // un battito isolato piu' alto falserebbe la lettura.
  let minDopo = Infinity
  for (let i = iPicco + 1; i <= iDopo; i++) if (s.bpm[i] > 0) minDopo = Math.min(minDopo, s.bpm[i])
  if (!Number.isFinite(minDopo)) return null

  return { caduta: picco - minDopo, da: picco, a: minDopo, secondi }
}

/** I punti della finestra, per disegnare l'andamento. */
export function puntiCuore(s: SerieCuore | undefined, da?: string | null, a?: string | null): number[] {
  if (!s?.bpm?.length) return []
  const inizio = da ? new Date(da).getTime() : -Infinity
  const fine = a ? new Date(a).getTime() : Infinity
  const out: number[] = []
  for (let i = 0; i < s.bpm.length; i++) {
    const t = istanteDi(s, i)
    if (t >= inizio && t <= fine && s.bpm[i] > 0) out.push(s.bpm[i])
  }
  return out
}

// L'analisi del peso di Salute → Corpo: la logica di POL IN ONE.
// Solo conti, niente interfaccia: tutto si ferma alla data scelta.

export interface Pesata { date: string; weight: number }
export type Periodo = '1W' | '3M' | '6M' | 'YTD' | 'Tutto' | 'Range'
export type Mobile = 7 | 14 | 30

const MS = 86_400_000
export const numGiorno = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS
export const isoGiorno = (n: number) => new Date(n * MS).toISOString().slice(0, 10)
export const piuGiorni = (s: string, n: number) => isoGiorno(numGiorno(s) + n)
export const lunedi = (s: string) => piuGiorni(s, -((new Date(numGiorno(s) * MS).getUTCDay() + 6) % 7))

const media = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length

/** Sotto queste pesate la settimana non si confronta alla pari con una intera. */
export const PESATE_PER_SETTIMANA_SOLIDA = 3

export interface Situazione {
  lun: string; dom: string; lunPrec: string; domPrec: string
  mediaCor: number | null; mediaPrec: number | null
  nCor: number; nPrec: number
  /** Δ media contro la settimana scorsa, intera. */
  delta: number | null
  provvisorio: boolean
  odierno: number | null
  /** La pesata prima di quella del giorno, anche se è di giorni prima. */
  precedente: string | null
  deltaGiorno: number | null
  ultima: Pesata | null
}

export function situazione(righe: Pesata[], D: string): Situazione {
  const lun = lunedi(D), dom = piuGiorni(lun, 6), lunPrec = piuGiorni(lun, -7), domPrec = piuGiorni(lun, -1)
  const fino = righe.filter((r) => r.date <= D).sort((a, b) => (a.date < b.date ? -1 : 1))
  const cor = fino.filter((r) => r.date >= lun).map((r) => r.weight)
  const pre = fino.filter((r) => r.date >= lunPrec && r.date <= domPrec).map((r) => r.weight)
  const mediaCor = cor.length ? media(cor) : null
  const mediaPrec = pre.length ? media(pre) : null
  const delta = mediaCor != null && mediaPrec != null ? mediaCor - mediaPrec : null

  const ultima = fino[fino.length - 1] ?? null
  const odierno = ultima?.date === D ? ultima.weight : null
  const prima = odierno != null ? fino[fino.length - 2] ?? null : null

  return {
    lun, dom, lunPrec, domPrec, mediaCor, mediaPrec, nCor: cor.length, nPrec: pre.length, delta,
    provvisorio: delta != null && cor.length < PESATE_PER_SETTIMANA_SOLIDA,
    odierno, precedente: prima?.date ?? null,
    deltaGiorno: odierno != null && prima ? odierno - prima.weight : null,
    ultima,
  }
}

/** Il primo giorno del periodo; finisce sempre alla data scelta (Range a parte). */
export function inizioPeriodo(per: Exclude<Periodo, 'Range'>, D: string, primo: string): string {
  if (per === '1W') return piuGiorni(D, -6)
  if (per === 'YTD') return D.slice(0, 4) + '-01-01'
  if (per === 'Tutto') return primo < D ? primo : D
  const d = new Date(numGiorno(D) * MS)
  d.setUTCMonth(d.getUTCMonth() - (per === '3M' ? 3 : 6))
  return d.toISOString().slice(0, 10)
}

/** Lo zoom non scende sotto una settimana visibile. */
export const GIORNI_MINIMI_ZOOM = 7

interface Finestra { ini: number; fine: number }

function chiudiFinestra(base: Finestra, ini: number, ampiezza: number): Finestra {
  const giorni = Math.round(ampiezza)
  const inizio = Math.max(base.ini, Math.min(base.fine - giorni, Math.round(ini)))
  return { ini: inizio, fine: inizio + giorni }
}

/**
 * Il tratto visibile dopo un pizzico: il giorno sotto le dita all'inizio resta
 * sotto le dita. `f0` e `f` sono la posizione delle dita da 0 a 1, `rapporto`
 * è distanza attuale / distanza iniziale. null = si è tornati al periodo intero.
 */
export function finestraPinch(base: Finestra, partenza: Finestra, f0: number, f: number, rapporto: number): Finestra | null {
  const totale = base.fine - base.ini
  const ampiezza0 = partenza.fine - partenza.ini
  const ampiezza = Math.max(GIORNI_MINIMI_ZOOM - 1, Math.min(totale, ampiezza0 / rapporto))
  if (ampiezza >= totale) return null
  const perno = partenza.ini + f0 * ampiezza0
  return chiudiFinestra(base, perno - f * ampiezza, ampiezza)
}

/** Il tratto visibile spostato di `giorni`, senza uscire dal periodo. */
export function finestraSpostata(base: Finestra, partenza: Finestra, giorni: number): Finestra {
  return chiudiFinestra(base, partenza.ini + giorni, partenza.fine - partenza.ini)
}

/** Quante pesate servono nella finestra perché la media mobile valga. */
export const MINIMO_MOBILE: Record<Mobile, number> = { 7: 3, 14: 5, 30: 10 }

/** Media mobile sui giorni di calendario; dove le pesate sono troppo poche, `v` è null e la linea si interrompe. */
export function mediaMobile(righe: Pesata[], n: Mobile, da: string, a: string): { date: string; v: number | null }[] {
  const pesi = new Map(righe.map((r) => [numGiorno(r.date), r.weight]))
  const ini = numGiorno(da), fine = numGiorno(a)
  const out: { date: string; v: number | null }[] = []
  let somma = 0, conta = 0
  const partenza = ini - n + 1
  for (let g = partenza; g <= fine; g++) {
    const entra = pesi.get(g)
    if (entra != null) { somma += entra; conta++ }
    // Esce solo ciò che era entrato: prima della partenza non è stato sommato niente.
    const esce = g - n >= partenza ? pesi.get(g - n) : undefined
    if (esce != null) { somma -= esce; conta-- }
    if (g >= ini) out.push({ date: isoGiorno(g), v: conta >= MINIMO_MOBILE[n] ? somma / conta : null })
  }
  return out
}

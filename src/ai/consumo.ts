// Quanto ti costa l'AI.
//
// Ogni risposta dell'API dice quanti token sono entrati e usciti: erano dati
// buttati via. Sommarli qui e' l'unico modo di sapere quanto stai spendendo
// senza aprire la console Anthropic — e di accorgersi subito se una funzione
// consuma piu' del previsto.

const CHIAVE = 'gymlog.ai.consumo'

/** Chi ha chiesto: serve a capire quale funzione consuma. */
export type Voce = 'coach' | 'slide' | 'didascalia'

/**
 * Prezzi Opus per milione di token, in dollari. Sono scritti qui in chiaro
 * apposta: se Anthropic li cambia, si correggono in un punto solo — e la cifra
 * mostrata resta una stima, non una fattura.
 */
export const PREZZO = { ingresso: 15, uscita: 75 }

export interface Consumo {
  richieste: number
  ingresso: number
  uscita: number
  /** quando e' partita l'ultima richiesta */
  ultima?: string
  /** lo stesso conto, spezzato per funzione */
  per: Partial<Record<Voce, { richieste: number; ingresso: number; uscita: number }>>
}

const VUOTO = (): Consumo => ({ richieste: 0, ingresso: 0, uscita: 0, per: {} })

export function leggiConsumo(): Consumo {
  try {
    const s = localStorage.getItem(CHIAVE)
    if (!s) return VUOTO()
    const c = JSON.parse(s) as Consumo
    return { ...VUOTO(), ...c, per: c.per ?? {} }
  } catch { return VUOTO() }
}

/** Registra una risposta. `usage` e' quello che torna dall'API, cosi' com'e'. */
export function segnaConsumo(voce: Voce, usage: { input_tokens?: number; output_tokens?: number } | null | undefined): void {
  const dentro = Number(usage?.input_tokens) || 0
  const fuori = Number(usage?.output_tokens) || 0
  // Senza numeri non si inventa niente: la richiesta si conta e basta.
  const c = leggiConsumo()
  const p = c.per[voce] ?? { richieste: 0, ingresso: 0, uscita: 0 }
  const agg: Consumo = {
    richieste: c.richieste + 1,
    ingresso: c.ingresso + dentro,
    uscita: c.uscita + fuori,
    ultima: new Date().toISOString(),
    per: { ...c.per, [voce]: { richieste: p.richieste + 1, ingresso: p.ingresso + dentro, uscita: p.uscita + fuori } },
  }
  try { localStorage.setItem(CHIAVE, JSON.stringify(agg)) } catch { /* storage pieno: pazienza */ }
}

export function azzeraConsumo(): void {
  try { localStorage.removeItem(CHIAVE) } catch { /* ignore */ }
}

/** Dollari spesi, stimati dai token. */
export function costo(x: { ingresso: number; uscita: number }): number {
  return (x.ingresso / 1e6) * PREZZO.ingresso + (x.uscita / 1e6) * PREZZO.uscita
}

/** «$0,18» — due decimali finche' bastano, quattro quando la cifra e' minuscola. */
export function inDollari(v: number): string {
  const dec = v > 0 && v < 0.01 ? 4 : 2
  return '$' + v.toFixed(dec).replace('.', ',')
}

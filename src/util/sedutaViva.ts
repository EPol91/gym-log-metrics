// La seduta continua a vivere anche quando esci dall'app.
//
// Android congela un'app appena la lasci: la pagina smette di girare, la fascia
// smette di consegnare battiti, i timer si fermano e i tentativi di riaggancio
// restano appesi sul ponte nativo. Al rientro arriva tutto insieme e l'app si
// blocca — e' esattamente il difetto che si vedeva uscendo durante il recupero
// o una seduta cardio.
//
// Le app che registrano davvero — WHOOP, Polar, Strava — hanno tutte la stessa
// cosa: un servizio in primo piano, cioe' quella notifica fissa che vedi mentre
// stanno registrando. E' il modo, l'unico che Android accetta, di dire «non
// congelarmi». Qui si accende quando comincia la registrazione della seduta e
// si spegne quando la chiudi.
//
// Fuori dal guscio nativo (browser) non c'e' niente da accendere: le funzioni
// non fanno nulla e nessuno se ne accorge.

/**
 * Un segnale sonoro programmato.
 * `ms` = fra quanto, da adesso. `tick` = quanti tic prima.
 */
export interface Bip { ms: number; tipo: 'via' | 'riposo' | 'fine'; tick?: number }

import { sceltaCorrente } from './suoni'

interface Servizio {
  accendi(o: { testo?: string }): Promise<void>
  spegni(): Promise<void>
  programmaBip(o: { bip: Bip[]; suono?: string; volume?: number }): Promise<void>
  annullaBip(): Promise<void>
}

/**
 * Il plugin preso dal ponte iniettato dal guscio.
 * Nella pagina convivono due Capacitor e solo quello iniettato parla col
 * nativo: e' la stessa trappola gia' vista con Health Connect e col Bluetooth.
 */
function plugin(): Servizio | null {
  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, Servizio> } }).Capacitor
  return cap?.Plugins?.SedutaViva ?? null
}

let accesa = false

/** Accende la notifica fissa. Chiamarla due volte non fa niente di male. */
export function accendiSeduta(testo = 'Seduta in corso · cuore e tempi continuano a girare'): void {
  if (accesa) return
  const p = plugin()
  if (!p?.accendi) return
  accesa = true
  void p.accendi({ testo }).catch(() => { accesa = false })
}

/** Spegne la notifica: la seduta e' chiusa, non c'e' piu' niente da tenere sveglio. */
export function spegniSeduta(): void {
  if (!accesa) return
  accesa = false
  const p = plugin()
  if (!p?.spegni) return
  void p.spegni().catch(() => { /* gia' spento */ })
}

/**
 * Affida al servizio i segnali del conto alla rovescia.
 *
 * Da chiamare quando esci dall'app con un timer che gira: fuori di li' la
 * pagina viene rallentata a un battito al minuto e i suoi beep arrivano tardi o
 * non arrivano. Rientrando si annulla, e a suonare torna la pagina — altrimenti
 * si sentirebbe tutto doppio.
 */
/**
 * Chi ha programmato cosa.
 *
 * Il servizio tiene UNA lista sola, e chi parla per ultimo la riscrive: il
 * recupero cancellava i bip del cardio e viceversa. Qui ognuno tiene la sua
 * parte e al servizio si manda sempre il quadro completo.
 */
export type Fonte = 'recupero' | 'cardio'
const fonti = new Map<Fonte, Bip[]>()

function invia(): void {
  // Solo a servizio gia' acceso: chiedere un bip quando la seduta e' chiusa lo
  // farebbe ripartire, e ti resterebbe addosso una notifica fissa per niente.
  if (!accesa) return
  const p = plugin()
  if (!p?.programmaBip) return
  const tutti = [...fonti.values()].flat().filter((b) => b.ms > 0)
  // Le note viaggiano col comando: il servizio non ha una sua lista di suoni, e
  // cosi' non puo' esistere il caso «in palestra ne senti uno, in mano un altro».
  const { suono, volume } = sceltaCorrente()
  if (tutti.length) void p.programmaBip({ bip: tutti, suono: JSON.stringify(suono.voci), volume }).catch(() => { /* pazienza */ })
  else void p.annullaBip?.().catch(() => { /* pazienza */ })
}

export function programmaBip(chi: Fonte, bip: Bip[]): void {
  fonti.set(chi, bip)
  invia()
}

/** Butta via i segnali di questa fonte. Gli altri restano dove sono. */
export function annullaBip(chi: Fonte): void {
  if (!fonti.has(chi)) return
  fonti.delete(chi)
  invia()
}

/** Serve alla schermata di profilo: dire se il guscio sa tenere viva la seduta. */
export function sedutaVivaDisponibile(): boolean {
  return plugin()?.accendi != null
}

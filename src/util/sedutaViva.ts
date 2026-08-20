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

interface Servizio {
  accendi(o: { testo?: string }): Promise<void>
  spegni(): Promise<void>
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

/** Serve alla schermata di profilo: dire se il guscio sa tenere viva la seduta. */
export function sedutaVivaDisponibile(): boolean {
  return plugin()?.accendi != null
}

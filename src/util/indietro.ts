// Il tasto indietro del telefono, dentro l'app.
//
// Le finestre dell'app — modali, schede a tutto schermo, pannelli — non sono
// pagine: vivono nello stato dei componenti, e la cronologia del browser non ne
// sa niente. Il tasto fisico quindi non le chiudeva: per tornare indietro
// bisognava per forza arrivare col pollice alla ✕ in alto.
//
// Qui c'e' l'elenco di quelle aperte, l'ultima sopra. Indietro chiude quella, e
// solo quella. Quando non ce n'e' piu' nessuna il tasto torna a fare il suo
// mestiere: la cronologia dell'app, e in cima l'uscita.

type Chiusura = () => void

const strati: Chiusura[] = []

/**
 * Dichiara che una finestra e' aperta, e come si chiude. Il ritorno la toglie
 * dall'elenco — va chiamato quando la finestra sparisce, altrimenti il tasto
 * indietro proverebbe a chiudere qualcosa che non c'e' piu'.
 */
export function registraStrato(chiudi: Chiusura): () => void {
  strati.push(chiudi)
  return () => {
    const i = strati.lastIndexOf(chiudi)
    if (i >= 0) strati.splice(i, 1)
  }
}

/** Chiude la finestra piu' in alto. Falso se non ce n'era nessuna. */
export function chiudiUltimoStrato(): boolean {
  const chiudi = strati.pop()
  if (!chiudi) return false
  chiudi()
  return true
}

/** Quante finestre sono aperte adesso: serve ai test, non all'app. */
export function stratiAperti(): number {
  return strati.length
}

interface PluginApp {
  addListener(nome: 'backButton', cb: (e: { canGoBack: boolean }) => void): Promise<unknown>
  minimizeApp(): Promise<void>
}

/**
 * Collega il tasto fisico. Da chiamare una volta sola, all'avvio.
 *
 * Il plugin si prende da `window.Capacitor.Plugins`: nella pagina ci sono due
 * istanze di Capacitor e importarlo dal pacchetto darebbe quella sbagliata,
 * senza plugin nativi attaccati.
 */
export function ascoltaIndietro(): void {
  const app = (globalThis as { Capacitor?: { Plugins?: { App?: PluginApp } } }).Capacitor?.Plugins?.App
  if (!app) return // nel browser il tasto indietro e' gia' quello del browser

  void app.addListener('backButton', ({ canGoBack }) => {
    // Prima le finestre aperte, una per volta.
    if (chiudiUltimoStrato()) return
    // Poi la cronologia dell'app: schede, sezioni, allenamento aperto.
    if (canGoBack || history.length > 1) { history.back(); return }
    // In cima non si chiude l'app: si mette da parte, come fanno le altre.
    void app.minimizeApp()
  })
}

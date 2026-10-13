import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdate } from './util/pwaUpdate'
import { initViewportVars } from './util/viewport'
import { allineaCoppieRs } from './rs/coppie'
import { ascoltaIndietro } from './util/indietro'
import { caricaSceltaSuoni } from './util/suoni'
import { recuperaSerieInSospeso } from './db/serieInSospeso'
import { riparaOrdiniSerie } from './db/riparaSerie'
import { pushAvviso } from './util/undo'

// Dentro il guscio nativo le barre di sistema le compensa gia' l'activity:
// se le compensasse anche la pagina, il margine finirebbe contato due volte
// — ed e' esattamente il centimetro morto sotto la barra dei tab.
if ((globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  document.documentElement.dataset.nativo = '1'
}
initViewportVars() // le modali stanno sopra la tastiera
initPwaUpdate() // controlla e applica gli aggiornamenti da solo
// Le schede 🦠 importate prima che la coppia fosse un dato: gliela stampiamo
// noi, cosi' i superset del coach partono uniti senza reimportare niente.
void allineaCoppieRs()
// Il tasto indietro del telefono chiude l'ultima finestra aperta, come in
// qualsiasi altra app: prima non arrivava alla pagina e restavi col pollice
// costretto alla ✕ in alto.
ascoltaIndietro()
// Il suono e il volume che hai scelto valgono dal primo bip, non dal secondo.
void caricaSceltaSuoni()
// Una serie registrata che non e' arrivata nel database torna al suo posto
// adesso, e te lo diciamo: e' un tuo gesto rimasto a meta', non un dato nuovo.
// Poi le serie che erano finite nello stesso posto tornano in fila.
void recuperaSerieInSospeso()
  .then(async (n) => {
    if (n) pushAvviso(`✓ ${n} ${n === 1 ? 'serie recuperata' : 'serie recuperate'} dall'ultima seduta`)
    const sistemate = await riparaOrdiniSerie()
    if (sistemate && !n) pushAvviso(`✓ ${sistemate} serie rimesse in ordine nello storico`)
  })
  .catch(() => { /* il database parla alla prossima apertura */ })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

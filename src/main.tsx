import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdate } from './util/pwaUpdate'
import { initViewportVars } from './util/viewport'
import { allineaCoppieRs } from './rs/coppie'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

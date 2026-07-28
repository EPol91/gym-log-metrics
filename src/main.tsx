import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdate } from './util/pwaUpdate'
import { initViewportVars } from './util/viewport'

initViewportVars() // le modali stanno sopra la tastiera
initPwaUpdate() // controlla e applica gli aggiornamenti da solo

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

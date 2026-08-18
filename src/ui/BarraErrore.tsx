import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ultimaTraccia, scordaTraccia } from '../util/blocco'

/**
 * L'errore che l'app si teneva per sé.
 *
 * Quando qualcosa esplode fuori da un gestore — una promessa rifiutata, un
 * errore dentro un intervallo — la schermata resta lì ferma e sembra bloccata:
 * dal telefono non c'è modo di sapere cosa sia successo, e senza quel testo si
 * tira a indovinare. Qui compare, si può leggere e si chiude col dito.
 *
 * Non ferma niente e non tocca il resto dell'app: è una spia, non un guardiano.
 */
export function BarraErrore() {
  const [messaggi, setMessaggi] = useState<string[]>([])

  useEffect(() => {
    const aggiungi = (testo: string) => {
      const t = testo.trim().slice(0, 300)
      if (!t) return
      // Lo stesso errore ripetuto cento volte riempirebbe lo schermo e
      // nasconderebbe proprio quello che serve leggere.
      setMessaggi((p) => (p.includes(t) ? p : [...p, t].slice(-3)))
    }
    const suErrore = (e: ErrorEvent) => aggiungi(`${e.message}${e.filename ? ` · ${e.filename.split('/').pop()}:${e.lineno}` : ''}`)
    const suPromessa = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined
      aggiungi(typeof r === 'string' ? r : r?.message ?? 'promessa rifiutata')
    }
    // E se la volta scorsa si e' piantata del tutto, il battito non e' mai
    // arrivato: resta solo la traccia scritta su disco al momento del tocco.
    const t = ultimaTraccia()
    if (t) {
      const q = new Date(t.quando)
      aggiungi(`Ultimo tocco prima della chiusura: «${t.cosa}» alle ${q.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
      scordaTraccia()
    }
    window.addEventListener('error', suErrore)
    window.addEventListener('unhandledrejection', suPromessa)
    return () => {
      window.removeEventListener('error', suErrore)
      window.removeEventListener('unhandledrejection', suPromessa)
    }
  }, [])

  if (!messaggi.length) return null

  return createPortal(
    <div style={{
      position: 'fixed', left: 8, right: 8, bottom: 'calc(62px + var(--sicuro-basso))', zIndex: 2000,
      background: '#2a0f0f', border: '1px solid #e5484d', borderRadius: 10, padding: '8px 10px',
    }}>
      {messaggi.map((m, i) => (
        <p key={i} style={{ margin: i ? '6px 0 0' : 0, fontSize: 11, color: '#ffb4b4', wordBreak: 'break-word' }}>{m}</p>
      ))}
      <button className="chip" style={{ marginTop: 6, padding: '3px 10px' }} onClick={() => setMessaggi([])}>Chiudi</button>
    </div>,
    document.body,
  )
}

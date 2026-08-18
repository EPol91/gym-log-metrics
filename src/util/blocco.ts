// Il misuratore di blocco.
//
// Quando l'app «si impalla» ma lo scorrimento continua a funzionare, non e' un
// errore: e' il filo principale occupato da codice che non finisce. Un errore
// lascia un messaggio, questo no — e da un telefono non c'e' console da
// guardare. Qui si tiene un battito al secondo: se arriva molto in ritardo,
// quel ritardo E' la durata del blocco, e insieme si sa cosa stavi toccando.

let ultimoTocco = '—'
let ultimoQuando = 0

/** Cosa hai toccato per ultimo: serve a dare un nome al blocco. */
function segnaTocco(e: Event) {
  const t = e.target as HTMLElement | null
  const el = t?.closest('button, a, [role="button"], input, select, textarea') as HTMLElement | null
  const testo = (el?.getAttribute('aria-label') || el?.innerText || el?.tagName || 'schermo').trim()
  ultimoTocco = testo.replace(/\s+/g, ' ').slice(0, 40)
  ultimoQuando = Date.now()
}

/**
 * Avvia la sorveglianza. `onBlocco` viene chiamata col racconto del blocco.
 * Soglia alta apposta: sotto il secondo e mezzo sono normali attese di lavoro,
 * e un avviso a ogni respiro sarebbe rumore.
 */
export function sorvegliaBlocchi(onBlocco: (testo: string) => void): () => void {
  const PASSO = 1000
  const SOGLIA = 2500
  let atteso = Date.now() + PASSO

  const t = setInterval(() => {
    const ora = Date.now()
    const ritardo = ora - atteso
    atteso = ora + PASSO
    if (ritardo < SOGLIA) return
    // Con lo schermo spento o l'app dietro, il telefono ferma i timer da solo:
    // non e' un blocco, e chiamarlo cosi' sarebbe una falsa accusa.
    if (document.visibilityState !== 'visible') return
    const da = ultimoQuando ? Math.round((ora - ultimoQuando) / 1000) : null
    onBlocco(`Bloccata ${(ritardo / 1000).toFixed(1)}s · ultimo tocco: ${ultimoTocco}${da != null ? ` (${da}s prima)` : ''}`)
  }, PASSO) as unknown as number

  document.addEventListener('pointerdown', segnaTocco, { capture: true, passive: true })
  return () => {
    clearInterval(t)
    document.removeEventListener('pointerdown', segnaTocco, { capture: true } as EventListenerOptions)
  }
}

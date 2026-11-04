import { useEffect, useRef } from 'react'

/**
 * Il foglio dal basso si chiude trascinandolo giu', come promette la lineetta
 * in alto. Segue il dito; oltre un terzo della sua altezza, o con un colpo
 * veloce, si chiude, altrimenti torna su.
 *
 * Parte solo con la lista in cima: se dentro hai scrollato, il dito scorre la
 * lista e basta. Ascoltatori nativi e non passivi: con quelli di React il
 * preventDefault non ferma lo scorrimento della pagina sotto.
 */
export function useTrascinaGiu<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const chiudi = useRef(onClose)
  chiudi.current = onClose

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let y0 = 0, t0 = 0, dy = 0
    let possibile = false, attivo = false

    const inizio = (e: TouchEvent) => {
      if (e.touches.length !== 1) { possibile = false; return }
      possibile = el.scrollTop <= 0
      attivo = false
      y0 = e.touches[0].clientY
      t0 = e.timeStamp
      dy = 0
    }
    const muovi = (e: TouchEvent) => {
      if (!possibile) return
      const d = e.touches[0].clientY - y0
      if (!attivo) {
        // Verso l'alto e' scorrere la lista, non chiudere.
        if (d < -4) { possibile = false; return }
        if (d < 8) return
        attivo = true
        el.style.transition = 'none'
      }
      e.preventDefault()
      dy = Math.max(0, d - 8)
      el.style.transform = `translateY(${dy}px)`
    }
    const fine = (e: TouchEvent) => {
      if (!attivo) return
      attivo = false
      possibile = false
      const veloce = dy / Math.max(1, e.timeStamp - t0) > 0.6 // px al millisecondo
      el.style.transition = 'transform .2s ease'
      if (dy > el.offsetHeight / 3 || (veloce && dy > 30)) {
        el.style.transform = `translateY(${el.offsetHeight}px)`
        window.setTimeout(() => chiudi.current(), 180)
      } else {
        el.style.transform = ''
      }
    }

    el.addEventListener('touchstart', inizio, { passive: true })
    el.addEventListener('touchmove', muovi, { passive: false })
    el.addEventListener('touchend', fine)
    el.addEventListener('touchcancel', fine)
    return () => {
      el.removeEventListener('touchstart', inizio)
      el.removeEventListener('touchmove', muovi)
      el.removeEventListener('touchend', fine)
      el.removeEventListener('touchcancel', fine)
    }
  }, [])

  return ref
}

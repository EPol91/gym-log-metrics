// Le finestre a comparsa devono stare sopra la TASTIERA, non sotto.
//
// `position: fixed` si riferisce allo schermo intero: quando la tastiera si apre,
// il fondo della finestra resta nascosto sotto di essa. L'unica misura affidabile
// dell'area davvero visibile è visualViewport, che qui pubblichiamo come variabili
// CSS (--vvh, --vvtop) usate da tutte le modali.

export function initViewportVars(): void {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport

  const apply = () => {
    const h = vv?.height ?? window.innerHeight
    const top = vv?.offsetTop ?? 0
    const root = document.documentElement
    // Altezza non plausibile (scheda in background, misura non pronta): tolgo le
    // variabili e lascio valere il fallback, invece di far collassare le finestre.
    if (!h || h < 120) {
      root.style.removeProperty('--vvh')
      root.style.removeProperty('--vvtop')
      return
    }
    root.style.setProperty('--vvh', `${Math.round(h)}px`)
    root.style.setProperty('--vvtop', `${Math.round(top)}px`)
  }

  apply()
  vv?.addEventListener('resize', apply)
  vv?.addEventListener('scroll', apply)
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)

  // Il campo su cui stai scrivendo deve restare visibile: se la tastiera lo copre,
  // lo riporto in vista. Ritardo minimo per aspettare l'animazione della tastiera.
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      const bottom = (vv?.height ?? window.innerHeight) + (vv?.offsetTop ?? 0)
      if (r.bottom > bottom - 8 || r.top < (vv?.offsetTop ?? 0) + 8) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 300)
  })
}

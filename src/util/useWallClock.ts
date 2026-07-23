import { useEffect, useState } from 'react'

/**
 * Forza un re-render ~2 volte/sec e al ritorno in foreground.
 * Per timer che calcolano il tempo da Date.now() (accurati anche se il tab è in background,
 * dove setInterval viene rallentato/fermato da Android).
 */
export function useWallTick(active = true): void {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const bump = () => setN((x) => (x + 1) % 1e9)
    const t = setInterval(bump, 500)
    document.addEventListener('visibilitychange', bump)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', bump) }
  }, [active])
}

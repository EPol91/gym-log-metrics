// Schermo sempre acceso mentre cucini: con le mani sporche non si sblocca il telefono.
import { useEffect, useState } from 'react'

interface Sentinel { released: boolean; release: () => Promise<void> }
type WakeNavigator = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }

export const isWakeLockSupported = (): boolean => 'wakeLock' in navigator

/**
 * Tiene acceso lo schermo finché `on` è true.
 * Il permesso decade quando l'app va in secondo piano: al ritorno si richiede da sé,
 * altrimenti lo schermo si spegnerebbe dopo la prima notifica.
 */
export function useWakeLock(on: boolean): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!on || !isWakeLockSupported()) { setActive(false); return }
    let sentinel: Sentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await (navigator as WakeNavigator).wakeLock!.request('screen')
        if (cancelled) { await sentinel.release(); return }
        setActive(true)
      } catch { setActive(false) } // batteria scarica o permesso negato: pazienza
    }
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => { /* già rilasciato */ })
      setActive(false)
    }
  }, [on])

  return active
}

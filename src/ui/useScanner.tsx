import { useState } from 'react'
import { BarcodeScanner, isScanSupported } from './BarcodeScanner'

/**
 * Lettore di codici a barre a richiesta: `scan()` apre la fotocamera e restituisce
 * il codice letto (o null se annulli). Serve a chiamarlo da dentro un form senza
 * portarsi dietro tre pezzi di stato ogni volta.
 */
export function useScanner() {
  const [pending, setPending] = useState<((code: string | null) => void) | null>(null)

  const scan = isScanSupported()
    ? () => new Promise<string | null>((resolve) => setPending(() => resolve))
    : undefined

  const overlay = pending ? (
    <BarcodeScanner
      onDetected={(code) => { pending(code); setPending(null) }}
      onCancel={() => { pending(null); setPending(null) }}
    />
  ) : null

  return { scan, overlay, scanning: pending != null }
}

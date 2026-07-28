import { useEffect, useRef, useState } from 'react'

// Scansione codice a barre con la fotocamera, senza librerie esterne:
// usa BarcodeDetector, supportato da Chrome su Android. Dove manca, si inserisce
// il codice a mano — la funzione resta utilizzabile ovunque.
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

const getCtor = (): BarcodeDetectorCtor | null =>
  (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null

export const isScanSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function BarcodeScanner({ onDetected, onCancel }: { onDetected: (code: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [noDetector, setNoDetector] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false

    async function start() {
      const Ctor = getCtor()
      if (!Ctor) { setNoDetector(true); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        const tick = async () => {
          if (stopped || !videoRef.current) return
          try {
            const hits = await detector.detect(videoRef.current)
            if (hits.length && hits[0].rawValue) { onDetected(hits[0].rawValue); return }
          } catch { /* frame non leggibile: si riprova */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        const err = e as { name?: string }
        setError(err.name === 'NotAllowedError' ? 'Permesso fotocamera negato.' : 'Fotocamera non disponibile.')
      }
    }
    start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetected])

  const fallback = noDetector || error
  return (
    <div>
      {!fallback ? (
        <>
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', maxHeight: '46vh', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: '28% 12%', border: '2px solid var(--gold)', borderRadius: 10, pointerEvents: 'none' }} />
          </div>
          <p className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>Inquadra il codice a barre</p>
        </>
      ) : (
        <p className="muted small">
          {error ?? 'Questo browser non legge i codici a barre.'} Puoi digitare il codice che trovi sulla confezione.
        </p>
      )}

      <label className="fl" style={{ marginTop: 10 }}>Codice a barre a mano</label>
      <div className="row" style={{ gap: 6 }}>
        <input inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="8001234567890" style={{ flex: 1 }} />
        <button className="primary" disabled={manual.trim().length < 6} onClick={() => onDetected(manual.trim())}>Cerca</button>
      </div>

      <button className="ghost" style={{ width: '100%', marginTop: 10 }} onClick={onCancel}>Annulla</button>
    </div>
  )
}

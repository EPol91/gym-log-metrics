import { useEffect, useRef, useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { createPortal } from 'react-dom'

/**
 * Quanto e' inclinato lo schienale.
 *
 * «Panca a 80°» scritto in una scheda non serve a niente se poi la regoli a
 * occhio: fra un 70 e un 80 cambia il muscolo che lavora, e la settimana dopo
 * non stai rifacendo lo stesso esercizio. Il telefono ha gia' l'accelerometro:
 * lo appoggi allo schienale e legge i gradi.
 *
 * Zero = piano, 90 = schienale verticale.
 */

/** L'angolo dal vettore di gravita': quanto il telefono e' alzato dal piano. */
function gradiDa(x: number, y: number, z: number): number {
  const g = Math.hypot(x, y, z)
  if (!g) return 0
  // L'asse Z e' quello che esce dallo schermo: appoggiato al piano vale 1g,
  // in verticale zero. Il resto e' l'angolo fra i due.
  const cos = Math.min(1, Math.max(-1, Math.abs(z) / g))
  return Math.round((Math.acos(cos) * 180) / Math.PI)
}

export function Inclinometro({ valore, onSalva, onClose }: {
  /** l'angolo gia' salvato per questo esercizio, se c'e' */
  valore?: number
  onSalva: (gradi: number | undefined) => void
  onClose: () => void
}) {
  useIndietro(onClose)
  const [gradi, setGradi] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [fermo, setFermo] = useState(false)
  // Il valore grezzo balla di un paio di gradi: si tiene una media corta,
  // altrimenti il numero non sta fermo abbastanza da poterlo leggere.
  const storia = useRef<number[]>([])

  useEffect(() => {
    if (fermo) return
    let vivo = true

    const leggi = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x == null || a.y == null || a.z == null) return
      const g = gradiDa(a.x, a.y, a.z)
      storia.current = [...storia.current.slice(-9), g]
      if (vivo) setGradi(Math.round(storia.current.reduce((s, v) => s + v, 0) / storia.current.length))
    }

    async function avvia() {
      const M = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
      try {
        // iOS chiede il permesso; Android no. Se lo nega si dice, invece di
        // mostrare uno zero che sembra una misura.
        if (typeof M.requestPermission === 'function') {
          const r = await M.requestPermission()
          if (r !== 'granted') { setErrore('Permesso ai sensori negato.'); return }
        }
        window.addEventListener('devicemotion', leggi)
        // Se in un secondo non arriva niente, il sensore non c'e' o non parla.
        setTimeout(() => { if (vivo && storia.current.length === 0) setErrore('Nessun sensore di movimento su questo dispositivo.') }, 1200)
      } catch { setErrore('Sensori non disponibili.') }
    }
    void avvia()

    return () => { vivo = false; window.removeEventListener('devicemotion', leggi) }
  }, [fermo])

  const mostrato = gradi ?? valore ?? 0

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)', background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 16, padding: '16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 4 }}>
          <strong>Inclinazione</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          Appoggia il telefono di piatto allo schienale, schermo verso di te.
        </p>

        {errore ? (
          <p className="small" style={{ color: '#e57373', margin: 0 }}>{errore}</p>
        ) : (
          <>
            {/* Il numero grande e una tacca che si inclina con lui: il numero
                dice quanto, la tacca dice se sei dritto. */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 64, color: 'var(--gold)', lineHeight: 1 }}>
                {gradi == null ? '—' : `${mostrato}°`}
              </div>
              <svg viewBox="0 0 200 90" width="180" height="81" style={{ marginTop: 6 }}>
                <line x1="10" y1="80" x2="190" y2="80" stroke="var(--line)" strokeWidth="2" />
                <line x1="20" y1="80" x2={20 + 150 * Math.cos((mostrato * Math.PI) / 180)}
                  y2={80 - 150 * Math.sin((mostrato * Math.PI) / 180)}
                  stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button className={fermo ? 'chip on' : 'chip'} style={{ flex: 1 }} onClick={() => setFermo((f) => !f)}>
                {fermo ? 'Riprendi' : 'Blocca il numero'}
              </button>
              <button className="primary" style={{ flex: 1 }} disabled={gradi == null}
                onClick={() => { onSalva(mostrato); onClose() }}>
                Salva {gradi == null ? '' : `${mostrato}°`}
              </button>
            </div>
          </>
        )}

        {valore != null && (
          <div className="row spread" style={{ marginTop: 10, alignItems: 'center' }}>
            <span className="muted small">Salvato per questo esercizio: {valore}°</span>
            <button className="chip" style={{ color: '#e57373' }} onClick={() => { onSalva(undefined); onClose() }}>Togli</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

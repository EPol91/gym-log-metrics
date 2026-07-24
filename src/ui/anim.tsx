import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Icona informativa: tap/click mostra una bolla renderizzata in un portal (sempre sopra tutto). */
export function Info({ text }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const W = 240

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
      setPos({ top: r.bottom + 6, left })
    }
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        title={text}
        onClick={toggle}
        aria-label="Informazioni"
        style={{ background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1 }}
      >ⓘ</button>
      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: W,
            background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '10px 12px', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45,
            boxShadow: '0 10px 30px rgba(0,0,0,.5)', fontWeight: 400,
          }}>{text}</div>
        </>,
        document.body,
      )}
    </>
  )
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

/** Numero che sale da valore precedente a target. */
export function CountUp({ value, dur = 650 }: { value: number | null; dur?: number }) {
  const [disp, setDisp] = useState(value ?? 0)
  const prev = useRef(value ?? 0)

  useEffect(() => {
    if (value == null) return
    if (reduced()) { setDisp(value); prev.current = value; return }
    const from = prev.current, to = value, start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setDisp(Math.round(from + (to - from) * easeOut(p)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, dur])

  if (value == null) return <>—</>
  return <>{disp}</>
}

function ringColor(v: number): string {
  if (v < 40) return '#e5484d'
  if (v < 70) return '#e0a030'
  return '#3fb950'
}

/** Anello di progresso 0-100 con numero animato al centro. */
export function ScoreRing({ value, size = 66 }: { value: number | null; size?: number }) {
  const sw = size < 44 ? 3.5 : 5
  const r = (size - sw) / 2 - 1
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value ?? 0))
  const target = c * (1 - v / 100)
  const col = value == null ? 'var(--line)' : ringColor(v)
  const [off, setOff] = useState(reduced() ? target : c)

  useEffect(() => {
    if (reduced()) { setOff(target); return }
    const id = requestAnimationFrame(() => setOff(target))
    return () => cancelAnimationFrame(id)
  }, [target])

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: "'Playfair Display', serif", fontSize: Math.round(size * 0.42), color: col }}>
        <CountUp value={value} />
      </div>
    </div>
  )
}

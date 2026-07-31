import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ScoreRing } from './anim'
import type { ScoreResult } from '../scores/types'

const RELIABILITY_COLOR: Record<string, string> = {
  alta: 'var(--good)', media: '#e0a030', inferenziale: '#e0a030', insufficiente: 'var(--muted)',
}

/** Dettaglio di un KPI: da cosa nasce il numero e quali dati ci stanno dietro. */
export function ScoreDetail({ title, subtitle, score, footer, onClose }: {
  title: string; subtitle: string; score: ScoreResult; footer?: string; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: 16, margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 12 }}>
            <ScoreRing value={score.value} size={54} />
            <div>
              <h2 style={{ fontSize: 19, margin: 0 }}>{title}</h2>
              <div className="muted" style={{ fontSize: 11 }}>
                affidabilità <span style={{ color: RELIABILITY_COLOR[score.reliability] }}>{score.reliability}</span>
              </div>
            </div>
          </div>
          <button className="ghost" style={{ width: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        <p className="small" style={{ color: 'var(--muted)', lineHeight: 1.5, marginTop: 12 }}>{subtitle}</p>

        {score.parts && score.parts.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>Da cosa nasce</div>
            {score.parts.map((p) => (
              <div key={p.label} className="row" style={{ gap: 8, marginBottom: 9 }}>
                <span style={{ fontSize: 12, flex: '0 0 88px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                <span style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, p.value))}%`, borderRadius: 999, background: p.value < 35 ? '#e57373' : 'var(--gold)' }} />
                </span>
                <span className="muted" style={{ fontSize: 11, flex: '0 0 62px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(p.value)}% · p.{Math.round(p.weight * 100)}%
                </span>
              </div>
            ))}
          </>
        )}

        {score.facts && score.facts.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>I tuoi numeri</div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
              {score.facts.map((f, i) => (
                <div key={f.label} className="row spread" style={{ fontSize: 12, padding: '4px 0', borderBottom: i < score.facts!.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span className="muted">{f.label}</span>
                  <span style={{ textAlign: 'right' }}>{f.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {score.note && <p className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>{score.note}</p>}
        {footer && <p className="muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>{footer}</p>}
      </div>
    </div>,
    document.body,
  )
}

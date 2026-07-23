import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tick, goSound, restCue, finishCue } from '../util/sound'
import { useWallTick } from '../util/useWallClock'
import { CardioViz } from './CardioViz'

type Mode = 'interval' | 'countdown' | 'chrono'
interface Phase { type: 'prep' | 'work' | 'rest'; dur: number; round: number }

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toString().padStart(2, '0')}`

/** Timer cardio: intervalli (work/rest a round), countdown (durata target) o cronometro libero.
 *  onComplete riceve la durata in minuti. */
export function CardioRunner({ mode, rounds = 8, workSec = 20, restSec = 10, targetSec = 1200, bpm, zone, zonePct, onComplete, onCancel }: {
  mode: Mode; rounds?: number; workSec?: number; restSec?: number; targetSec?: number
  bpm?: number | null; zone?: number; zonePct?: number
  onComplete: (durationMin: number) => void; onCancel: () => void
}) {
  const [running, setRunning] = useState(true)
  const startRef = useRef(Date.now()) // ms di inizio del segmento in corso
  const baseRef = useRef(0)            // secondi accumulati prima dell'ultima pausa
  const prevPhase = useRef('')
  const doneRef = useRef(false)
  useWallTick(running)
  // Tempo trascorso calcolato sull'orario reale → resta corretto anche uscendo dall'app.
  const elapsed = Math.floor(baseRef.current + (running ? (Date.now() - startRef.current) / 1000 : 0))

  function toggleRun() {
    setRunning((r) => {
      if (r) { baseRef.current += (Date.now() - startRef.current) / 1000; return false }
      startRef.current = Date.now(); return true
    })
  }

  const phases = useMemo<Phase[]>(() => {
    if (mode !== 'interval') return []
    const ph: Phase[] = [{ type: 'prep', dur: 3, round: 0 }]
    for (let r = 1; r <= rounds; r++) {
      ph.push({ type: 'work', dur: workSec, round: r })
      if (r < rounds) ph.push({ type: 'rest', dur: restSec, round: r })
    }
    return ph
  }, [mode, rounds, workSec, restSec])
  const totalInterval = phases.reduce((a, p) => a + p.dur, 0)

  // Stato derivato
  let phaseType = '', round = 0, secLeft = 0, finished = false
  if (mode === 'interval') {
    if (elapsed >= totalInterval) { finished = true } else {
      let acc = 0
      for (const p of phases) { if (elapsed < acc + p.dur) { phaseType = p.type; round = p.round; secLeft = acc + p.dur - elapsed; break } acc += p.dur }
    }
  } else if (mode === 'countdown') {
    secLeft = Math.max(0, targetSec - elapsed); if (secLeft === 0) finished = true
  } else { secLeft = elapsed }

  // Segnali sonori
  useEffect(() => {
    if (finished || mode === 'chrono') return
    if (secLeft > 0 && secLeft <= 3) tick()
    if (mode === 'interval' && phaseType !== prevPhase.current) {
      if (phaseType === 'work') goSound()
      else if (phaseType === 'rest') restCue()
      prevPhase.current = phaseType
    }
  }, [elapsed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fine automatica (intervalli / countdown)
  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true; setRunning(false); finishCue(); navigator.vibrate?.([120, 60, 220])
      const min = (mode === 'countdown' ? targetSec : totalInterval) / 60
      onComplete(+Math.max(0.1, min).toFixed(1))
    }
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const color = phaseType === 'work' ? '#22c55e' : phaseType === 'rest' ? '#3b82f6' : phaseType === 'prep' ? 'var(--gold)' : 'var(--gold)'
  const label = phaseType === 'prep' ? 'PRONTI' : phaseType === 'work' ? 'LAVORO' : phaseType === 'rest' ? 'RECUPERO' : mode === 'countdown' ? 'IN CORSO' : 'CRONOMETRO'
  const bigLeft = mode === 'chrono' ? elapsed : secLeft

  function stopSave() { onComplete(+Math.max(0.1, elapsed / 60).toFixed(1)) }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520, margin: '0 auto',
      padding: '20px 18px calc(20px + env(safe-area-inset-bottom))',
    }}>
      <div className="row spread">
        <span className="small" style={{ color, fontWeight: 700, letterSpacing: '.06em' }}>
          {label}{mode === 'interval' ? ` · round ${round}/${rounds}` : ''}
        </span>
        <button className="ghost small" onClick={onCancel}>Annulla ✕</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(64px,22vw,120px)', lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
          {fmt(bigLeft)}
        </div>
        {mode !== 'chrono' && <div className="muted small">totale {fmt(elapsed)}</div>}
        {bpm != null && (
          <div style={{ width: 'min(420px,100%)', marginTop: 20 }}>
            <CardioViz bpm={bpm} pct={zonePct} zone={zone} live={running} />
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button style={{ flex: 1, padding: '16px' }} onClick={toggleRun}>{running ? '⏸ Pausa' : '▶ Riprendi'}</button>
        <button className="primary" style={{ flex: 2, padding: '16px', fontSize: 16 }} onClick={stopSave}>⏹ Stop e salva</button>
      </div>
    </div>,
    document.body,
  )
}

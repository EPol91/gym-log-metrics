import { useEffect, useMemo, useRef, useState } from 'react'
import { tick, goSound, restCue, finishCue } from '../util/sound'
import { useWallTick } from '../util/useWallClock'

type Mode = 'interval' | 'countdown' | 'chrono'
interface Phase { type: 'prep' | 'work' | 'rest'; dur: number; round: number }

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toString().padStart(2, '0')}`

/** Timer cardio: intervalli (work/rest a round), countdown (durata target) o cronometro libero.
 *  onComplete riceve la durata in minuti. */
export function CardioRunner({ mode, rounds = 8, workSec = 20, restSec = 10, targetSec = 1200, onComplete, onCancel }: {
  mode: Mode; rounds?: number; workSec?: number; restSec?: number; targetSec?: number
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

  return (
    <div className="card" style={{ borderColor: color, transition: 'border-color .3s' }}>
      <div className="row spread">
        <span className="muted small" style={{ color }}>{label}{mode === 'interval' ? ` · round ${round}/${rounds}` : ''}</span>
        <button className="ghost small" onClick={onCancel}>Annulla ✕</button>
      </div>
      <div className="timer" style={{ color, fontSize: 56 }}>{fmt(bigLeft)}</div>
      {mode !== 'chrono' && <div className="muted small" style={{ textAlign: 'center', marginTop: -4 }}>totale {fmt(elapsed)}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button style={{ flex: 1 }} onClick={toggleRun}>{running ? '⏸ Pausa' : '▶ Riprendi'}</button>
        <button className="primary" style={{ flex: 2 }} onClick={stopSave}>⏹ Stop e salva</button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tick, goSound, restCue, finishCue } from '../util/sound'
import { useWallTick } from '../util/useWallClock'

type Mode = 'interval' | 'countdown' | 'chrono'
interface Phase { type: 'prep' | 'work' | 'rest'; dur: number; round: number }
const ZONE_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toString().padStart(2, '0')}`

/** Timer cardio: intervalli (work/rest a round), countdown (durata target) o cronometro libero.
 *  onComplete riceve la durata in minuti. */
export function CardioRunner({ mode, rounds = 8, workSec = 20, restSec = 10, targetSec = 1200, bpm, avgBpm, zone, pct, startedAtMs, onComplete, onCancel }: {
  mode: Mode; rounds?: number; workSec?: number; restSec?: number; targetSec?: number
  bpm?: number | null; avgBpm?: number | null; zone?: number; pct?: number; startedAtMs?: number
  onComplete: (durationMin: number) => void; onCancel: () => void
}) {
  const [running, setRunning] = useState(true)
  const startRef = useRef(startedAtMs ?? Date.now()) // ms di inizio; da storage se si riprende dopo refresh
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

  const color = phaseType === 'work' ? '#22c55e' : phaseType === 'rest' ? '#3b82f6' : 'var(--gold)'
  const label = phaseType === 'prep' ? 'PRONTI' : phaseType === 'work' ? 'LAVORO' : phaseType === 'rest' ? 'RECUPERO' : mode === 'countdown' ? 'IN CORSO' : 'CRONOMETRO'
  const bigLeft = mode === 'chrono' ? elapsed : secLeft
  const zoneColor = zone ? ZONE_COLORS[zone - 1] : color

  // Anello: avanzamento sul totale (interval/countdown) o sweep al minuto (cronometro)
  let ringPct = mode === 'interval' ? (totalInterval ? elapsed / totalInterval : 0)
    : mode === 'countdown' ? (targetSec ? elapsed / targetSec : 0)
      : (elapsed % 60) / 60
  ringPct = Math.max(0, Math.min(1, ringPct))
  const R = 120, CIRC = 2 * Math.PI * R

  // Posizione dell'indicatore sulla barra zone (dentro il segmento della zona corrente)
  const ZLO = [0, 60, 70, 80, 90], ZHI = [60, 70, 80, 90, 100]
  let markerLeft: number | null = null
  if (bpm != null && zone) {
    const i = zone - 1
    const frac = Math.max(0, Math.min(1, ((pct ?? ZLO[i]) - ZLO[i]) / ((ZHI[i] - ZLO[i]) || 1)))
    markerLeft = (i + frac) * 20
  }

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        {/* Anello circolare con il timer al centro */}
        <div style={{ position: 'relative', width: 'min(300px,78vw)', aspectRatio: '1' }}>
          <svg viewBox="0 0 280 280" style={{ width: '100%', height: '100%', display: 'block' }}>
            <circle cx={140} cy={140} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={16} />
            <circle cx={140} cy={140} r={R} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - ringPct)} transform="rotate(-90 140 140)"
              style={{ transition: 'stroke-dashoffset .5s linear, stroke .3s' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(52px,15vw,76px)', lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(bigLeft)}</div>
            {mode !== 'chrono' && <div className="muted small" style={{ marginTop: 6 }}>totale {fmt(elapsed)}</div>}
          </div>
        </div>

        {/* Frequenza cardiaca dominante + zone (stile Whoop) */}
        {bpm != null && (
          <div style={{ width: 'min(440px,100%)', textAlign: 'center' }}>
            <div className="muted small" style={{ letterSpacing: '.12em' }}>FREQUENZA CARDIACA</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 2 }}>
              <span style={{ fontSize: 28, color: '#ef4444', animation: running ? `heartBeat ${(60 / (bpm || 60)).toFixed(2)}s ease-in-out infinite` : 'none' }}>♥</span>
              <strong style={{ fontSize: 52, color: zoneColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{bpm}</strong>
              <span className="muted small">bpm{zone ? ` · Z${zone}` : ''}</span>
            </div>
            {avgBpm != null && <div className="muted small" style={{ marginTop: 2 }}>media sessione <strong style={{ color: 'var(--gold)' }}>{avgBpm}</strong> bpm</div>}
            <div style={{ position: 'relative', marginTop: 12 }}>
              <div style={{ display: 'flex', height: 9, borderRadius: 999, overflow: 'hidden' }}>
                {ZONE_COLORS.map((c, i) => <div key={i} style={{ flex: 1, background: c, opacity: zone ? (i === zone - 1 ? 1 : 0.3) : 0.5 }} />)}
              </div>
              {markerLeft != null && (
                <div style={{ position: 'absolute', top: -4, left: `${markerLeft}%`, width: 4, height: 17, background: '#fff', borderRadius: 2, transform: 'translateX(-50%)', boxShadow: '0 0 5px rgba(0,0,0,.7)', transition: 'left .5s ease' }} />
              )}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              {['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map((z, i) => <span key={z} className="muted" style={{ fontSize: 10, color: zone === i + 1 ? zoneColor : undefined }}>{z}</span>)}
            </div>
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

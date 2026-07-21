import { useState } from 'react'
import { updateUser, setPhase } from '../db/repo'
import { parseNum } from '../util/validate'
import type { Phase } from '../db/schema'

const PHASES: { key: Phase; label: string }[] = [
  { key: 'cut', label: 'Cut' }, { key: 'bulk', label: 'Bulk' },
  { key: 'recomp', label: 'Recomp' }, { key: 'maintenance', label: 'Mant.' },
]
const REST_PRESETS = [60, 90, 120, 150, 180]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState('')
  const [height, setHeight] = useState('')
  const [weekly, setWeekly] = useState(4)
  const [rest, setRest] = useState(90)
  const [phase, setPh] = useState<Phase | null>(null)

  async function finish(skip = false) {
    if (!skip) {
      const patch: Parameters<typeof updateUser>[0] = { onboarded: true, weeklyTarget: weekly, restDefaultSec: rest }
      if (name.trim()) patch.name = name.trim()
      const y = parseNum(year, { min: 1920, max: 2020, int: true }); if (y != null) patch.birthYear = y
      const h = parseNum(height, { min: 120, max: 230, int: true }); if (h != null) patch.heightCm = h
      await updateUser(patch)
      if (phase) await setPhase(phase)
    } else {
      await updateUser({ onboarded: true })
    }
    onDone()
  }

  return (
    <div className="col">
      <div>
        <h1>Benvenuto in <span className="brand">GYM LOG</span></h1>
        <p className="muted small">Due dati veloci per personalizzare l'app. Puoi cambiarli dopo nel Profilo.</p>
      </div>

      <div className="card">
        <label className="fl">Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Come ti chiami" />
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }}><label className="fl">Anno di nascita</label><input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="es. 1991" /></div>
          <div style={{ flex: 1 }}><label className="fl">Altezza (cm)</label><input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="es. 180" /></div>
        </div>
      </div>

      <div className="card">
        <label className="fl">Obiettivo allenamenti / settimana</label>
        <div className="row">
          <button onClick={() => setWeekly((w) => Math.max(1, w - 1))}>−</button>
          <strong style={{ minWidth: 40, textAlign: 'center', fontSize: 20 }}>{weekly}</strong>
          <button onClick={() => setWeekly((w) => Math.min(14, w + 1))}>＋</button>
        </div>
      </div>

      <div className="card">
        <label className="fl">Recupero predefinito</label>
        <div className="opts" style={{ gridTemplateColumns: `repeat(${REST_PRESETS.length}, 1fr)` }}>
          {REST_PRESETS.map((s) => <button key={s} className={rest === s ? 'sel' : ''} onClick={() => setRest(s)}>{s}s</button>)}
        </div>
      </div>

      <div className="card">
        <label className="fl">Fase attuale (opz.)</label>
        <div className="grid2">
          {PHASES.map((p) => <button key={p.key} className={phase === p.key ? 'sel' : ''} onClick={() => setPh(p.key)}>{p.label}</button>)}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 90 }}>
        <button className="ghost" style={{ flex: 1 }} onClick={() => finish(true)}>Salta</button>
        <button className="primary" style={{ flex: 2 }} onClick={() => finish(false)}>Inizia</button>
      </div>
    </div>
  )
}

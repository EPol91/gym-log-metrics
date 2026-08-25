import { useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { deleteWithUndo } from '../db/trash'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDayTypes, updateDayType, addDayType, deleteDayType } from '../db/diet'
import { kcalOf, type MacroTargets } from '../scores/nutritionTargets'
import { parseNum } from '../util/validate'
import type { DayType } from '../db/schema'

/** Scostamento carboidrati per tipo giornata: ON carica, OFF scarica. */
const PRESET_SHIFT: Record<string, number> = { on: 0.15, off: -0.15, reload: 0.35 }

function TargetEditor({ d, suggested }: { d: DayType; suggested: MacroTargets | null }) {
  const [open, setOpen] = useState(false)
  const [p, setP] = useState(String(d.targets.protein || ''))
  const [c, setC] = useState(String(d.targets.carbs || ''))
  const [f, setF] = useState(String(d.targets.fat || ''))

  const pn = parseNum(p, { min: 0, max: 600 }) ?? 0
  const cn = parseNum(c, { min: 0, max: 1200 }) ?? 0
  const fn = parseNum(f, { min: 0, max: 400 }) ?? 0
  const kcal = kcalOf({ protein: pn, carbs: cn, fat: fn })

  /** Proposta per QUESTO tipo giornata: stesse proteine, carboidrati spostati. */
  function applySuggestion() {
    if (!suggested) return
    const shift = PRESET_SHIFT[d.key] ?? 0
    const carbs = Math.round(suggested.carbs * (1 + shift))
    setP(String(suggested.protein)); setC(String(carbs)); setF(String(suggested.fat))
  }

  const set = d.targets
  return (
    <div className="card">
      <button className="row spread" style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
        onClick={() => setOpen((v) => !v)}>
        <span>
          <strong>{d.name}</strong>
          {!d.builtin && <span className="muted small"> · personalizzato</span>}
        </span>
        <span className="muted small">
          {set.kcal > 0 ? `${set.kcal} kcal · C: ${set.carbs}, P: ${set.protein}, G: ${set.fat}` : 'da impostare'} {open ? '▾' : '›'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ flex: 1 }}><label className="fl" style={{ color: 'var(--carb)' }}>Carbo (g)</label><input inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} style={{ textAlign: 'center' }} /></div>
            <div style={{ flex: 1 }}><label className="fl" style={{ color: 'var(--prot)' }}>Proteine (g)</label><input inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} style={{ textAlign: 'center' }} /></div>
            <div style={{ flex: 1 }}><label className="fl" style={{ color: 'var(--fat)' }}>Grassi (g)</label><input inputMode="numeric" value={f} onChange={(e) => setF(e.target.value)} style={{ textAlign: 'center' }} /></div>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            = <strong style={{ color: 'var(--gold)' }}>{kcal}</strong> kcal · le calorie si ricavano dai macro, non si impostano a parte.
          </p>

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {suggested && <button className="ghost" style={{ flex: 1 }} onClick={applySuggestion}>Proponi</button>}
            {!d.builtin && <button className="ghost" style={{ flex: 'none' }} onClick={() => { if (confirm(`Eliminare "${d.name}"?`)) deleteWithUndo(`"${d.name}" eliminato`, () => deleteDayType(d.id)) }}>🗑</button>}
            <button className="primary" style={{ flex: 2 }}
              onClick={() => updateDayType(d.id, { targets: { kcal, protein: pn, carbs: cn, fat: fn }, manual: true })}>
              Salva
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DietTargets({ onBack, suggested }: { onBack: () => void; suggested: MacroTargets | null }) {
  useIndietro(onBack)
  const dayTypes = useLiveQuery(listDayTypes, []) ?? []

  return (
    <div className="col">
      <div className="row spread">
        <button className="ghost small" onClick={onBack}>← Dieta</button>
      </div>
      <h1>Obiettivi</h1>

      {suggested ? (
        <div className="card" style={{ borderColor: 'var(--gold-dim)' }}>
          <div className="muted small">Proposta dai tuoi dati</div>
          <div className="small" style={{ marginTop: 4 }}>
            <strong style={{ color: 'var(--gold)' }}>{suggested.kcal} kcal</strong> · C: {suggested.carbs}, P: {suggested.protein}, G: {suggested.fat}
          </div>
          <p className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
            Da peso, altezza, età, sedute a settimana e fase. È una stima di partenza:
            comanda la bilancia, correggi dopo due settimane di dati.
          </p>
        </div>
      ) : (
        <p className="muted small">
          Per la proposta automatica servono peso (Corpo), altezza e anno di nascita (Profilo).
          Puoi comunque scrivere gli obiettivi a mano.
        </p>
      )}

      {dayTypes.map((d) => <TargetEditor key={d.id} d={d} suggested={suggested} />)}

      <button className="ghost" onClick={async () => {
        const name = prompt('Nome del nuovo tipo di giornata (es. Refeed, Gara)')?.trim()
        if (name) await addDayType(name, { kcal: 0, protein: 0, carbs: 0, fat: 0 })
      }}>＋ Nuovo tipo di giornata</button>
    </div>
  )
}

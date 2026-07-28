import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  MEALS, computeDiary, listDayTypes, deleteFoodLog, updateFoodLog, todayDiet,
} from '../db/diet'
import { getNutrition, upsertNutrition, getUser, listMeasurements, getCurrentPhase } from '../db/repo'
import { computeTargets } from '../scores/nutritionTargets'
import { DietTargets } from './DietTargets'
import { FoodPicker } from './FoodPicker'
import type { MealKey } from '../db/schema'

const shortDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]
  return `${gg} ${d.getDate()}/${d.getMonth() + 1}`
}
const shift = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Barra di un macro: quanto ne hai preso rispetto all'obiettivo. */
function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="row spread" style={{ fontSize: 11 }}>
        <span className="muted">{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}{target > 0 ? `/${target}` : ''}</span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', marginTop: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

export function DietScreen() {
  const [date, setDate] = useState(todayDiet())
  const [picking, setPicking] = useState<MealKey | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [editLog, setEditLog] = useState<string | null>(null)

  const diary = useLiveQuery(() => computeDiary(date), [date])
  const dayTypes = useLiveQuery(listDayTypes, []) ?? []
  const nutri = useLiveQuery(() => getNutrition(date), [date])
  const user = useLiveQuery(getUser, [])
  const meas = useLiveQuery(listMeasurements, []) ?? []
  const phase = useLiveQuery(getCurrentPhase, [])

  const activeType = dayTypes.find((d) => d.key === nutri?.dayType) ?? dayTypes[0]
  // Obiettivi: quelli salvati sul tipo giornata; se non impostati, la proposta dai tuoi dati.
  const weight = meas.length ? meas[meas.length - 1].weight : 0
  const suggested = weight && user?.heightCm && user?.birthYear
    ? computeTargets({
      weightKg: weight, heightCm: user.heightCm,
      age: new Date().getFullYear() - user.birthYear,
      sex: user.sex ?? 'm', weeklySessions: user.weeklyTarget ?? 4,
      phase: phase?.phase ?? null,
    })
    : null
  const t = activeType && activeType.targets.kcal > 0 ? activeType.targets : suggested
  const totals = diary?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const kcalPct = t && t.kcal > 0 ? Math.min(100, (totals.kcal / t.kcal) * 100) : 0
  const R = 32, CIRC = 2 * Math.PI * R

  if (showTargets) return <DietTargets onBack={() => setShowTargets(false)} suggested={suggested} />

  return (
    <div className="col" style={{ gap: 12 }}>
      {/* Giorno */}
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" onClick={() => setDate((d) => shift(d, -1))}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Dieta</h1>
          <button className="chip" style={{ marginTop: 2 }} onClick={() => setDate(todayDiet())}>
            {date === todayDiet() ? 'oggi' : shortDay(date)}
          </button>
        </div>
        <button className="ghost small" disabled={date >= todayDiet()} onClick={() => setDate((d) => shift(d, 1))}>›</button>
      </div>

      {/* Tipo giornata */}
      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {dayTypes.map((d) => (
          <button key={d.id} className={nutri?.dayType === d.key ? 'chip on' : 'chip'}
            onClick={() => upsertNutrition(date, { dayType: nutri?.dayType === d.key ? null : d.key as never })}>
            {d.name}
          </button>
        ))}
        <button className="chip" onClick={() => setShowTargets(true)}>⚙ Obiettivi</button>
      </div>

      {/* Riepilogo */}
      <div className="card">
        <div className="row spread" style={{ alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 74, height: 74, flex: 'none' }}>
            <svg width="74" height="74" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="37" cy="37" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              <circle cx="37" cy="37" r={R} fill="none" stroke="var(--gold)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - kcalPct / 100)} style={{ transition: 'stroke-dashoffset .5s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.1 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: 'var(--gold)' }}>{totals.kcal}</div>
                <div className="muted" style={{ fontSize: 9 }}>{t ? `/ ${t.kcal}` : 'kcal'}</div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, marginLeft: 12 }}>
            {t ? (
              <div className="row" style={{ gap: 8 }}>
                <MacroBar label="Prot." value={totals.protein} target={t.protein} color="var(--good)" />
                <MacroBar label="Carbo" value={totals.carbs} target={t.carbs} color="var(--gold)" />
                <MacroBar label="Grassi" value={totals.fat} target={t.fat} color="#e0a030" />
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Imposta gli obiettivi (⚙) oppure completa peso, altezza e anno di nascita nel Profilo.
              </p>
            )}
            {t && (
              <div className="muted small" style={{ marginTop: 6 }}>
                Restano <strong style={{ color: 'var(--text)' }}>{Math.max(0, t.kcal - totals.kcal)}</strong> kcal
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pasti */}
      {MEALS.map((m) => {
        const entries = diary?.byMeal[m.key] ?? []
        const mt = diary?.mealTotals[m.key]
        return (
          <div className="card" key={m.key}>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{m.label}</span>
              <span className="small">{mt?.kcal ?? 0} kcal</span>
            </div>

            {entries.map((e) => (
              <div key={e.log.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 7, marginTop: 7 }}>
                {editLog === e.log.id ? (
                  <div>
                    <label className="fl">{e.food.name} — quantità (g)</label>
                    <div className="row" style={{ gap: 6 }}>
                      <input inputMode="decimal" defaultValue={String(e.log.grams)} autoFocus
                        onBlur={(ev) => { const n = parseFloat(ev.target.value); if (n > 0) updateFoodLog(e.log.id, { grams: n }); setEditLog(null) }}
                        style={{ flex: 1, textAlign: 'center' }} />
                      <button className="ghost" onClick={() => { deleteFoodLog(e.log.id); setEditLog(null) }}>🗑</button>
                    </div>
                  </div>
                ) : (
                  <div className="row spread" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setEditLog(e.log.id)}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.food.name} <span className="muted small">{e.log.grams} g</span>
                    </span>
                    <span className="muted small" style={{ flex: 'none', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
                      {e.macros.kcal} · P{e.macros.protein} C{e.macros.carbs} G{e.macros.fat}
                    </span>
                  </div>
                )}
              </div>
            ))}

            <button className="chip" style={{ marginTop: 9 }} onClick={() => setPicking(m.key)}>＋ Aggiungi</button>
          </div>
        )
      })}

      {picking && (
        <FoodPicker date={date} meal={picking} onClose={() => setPicking(null)} />
      )}
    </div>
  )
}

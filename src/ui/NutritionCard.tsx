import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getNutrition, upsertNutrition, getUser, todayISO } from '../db/repo'
import type { NutritionDayType, NutritionStatus } from '../db/schema'

const DAY_TYPES: { key: NutritionDayType; label: string }[] = [
  { key: 'on', label: 'ON' }, { key: 'off', label: 'OFF' }, { key: 'reload', label: 'Reload' },
]
const STATUSES: { key: NutritionStatus; label: string }[] = [
  { key: 'seguito', label: 'Seguito' }, { key: 'parziale', label: 'Parziale' }, { key: 'no', label: 'No' },
]

function shift(date: string, days: number): string {
  // UTC-consistente con todayISO() (che usa toISOString): evita l'off-by-one nei fusi orari.
  const t = new Date(date + 'T00:00:00Z').getTime() + days * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

export function NutritionCard() {
  const [date, setDate] = useState(todayISO())
  const n = useLiveQuery(() => getNutrition(date), [date])
  const user = useLiveQuery(getUser, [])
  const water = n?.water ?? 0
  const salt = n?.salt ?? 0
  const wt = user?.waterTarget
  const st = user?.saltTarget
  const isToday = date === todayISO()

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 8 }}>
        <span className="muted small">Nutrizione</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="ghost small" onClick={() => setDate(shift(date, -1))}>‹</button>
          <span className="small">{isToday ? 'oggi' : date}</span>
          <button className="ghost small" disabled={isToday} onClick={() => setDate(shift(date, 1))}>›</button>
        </span>
      </div>

      <label className="fl">Tipo giornata</label>
      <div className="row" style={{ marginBottom: 10 }}>
        {DAY_TYPES.map((d) => (
          <button key={d.key} className={n?.dayType === d.key ? 'sel' : ''} style={{ flex: 1 }}
            onClick={() => upsertNutrition(date, { dayType: n?.dayType === d.key ? null : d.key })}>{d.label}</button>
        ))}
      </div>

      <label className="fl">Stato</label>
      <div className="row" style={{ marginBottom: 10 }}>
        {STATUSES.map((s) => (
          <button key={s.key} className={n?.status === s.key ? 'sel' : ''} style={{ flex: 1 }}
            onClick={() => upsertNutrition(date, { status: n?.status === s.key ? null : s.key })}>{s.label}</button>
        ))}
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <label className="fl">Acqua (L){wt ? ` · target ${wt}` : ''}</label>
          <div className="row">
            <button onClick={() => upsertNutrition(date, { water: Math.max(0, +(water - 0.25).toFixed(2)) })}>−</button>
            <strong style={{ minWidth: 44, textAlign: 'center', color: wt && water >= wt ? 'var(--good)' : undefined }}>{water.toFixed(2)}</strong>
            <button onClick={() => upsertNutrition(date, { water: +(water + 0.25).toFixed(2) })}>＋</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl">Sale (g){st ? ` · target ${st}` : ''}</label>
          <div className="row">
            <button onClick={() => upsertNutrition(date, { salt: Math.max(0, +(salt - 0.5).toFixed(1)) })}>−</button>
            <strong style={{ minWidth: 44, textAlign: 'center', color: st && salt >= st ? 'var(--good)' : undefined }}>{salt.toFixed(1)}</strong>
            <button onClick={() => upsertNutrition(date, { salt: +(salt + 0.5).toFixed(1) })}>＋</button>
          </div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Contesto per l'AI · non influenza gli Score.</p>
    </div>
  )
}

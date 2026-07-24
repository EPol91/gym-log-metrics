import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listMeasurements, deleteMeasurement, upsertMeasurement, getUser, todayISO } from '../db/repo'
import { computeFfmi } from '../metrics/body'
import { parseNum } from '../util/validate'
import { LineChart } from './LineChart'
import { Info } from './anim'

export function BodyScreen() {
  const rows = useLiveQuery(listMeasurements, []) ?? []
  const user = useLiveQuery(getUser, [])
  const [date, setDate] = useState(todayISO())
  const [w, setW] = useState('')
  const [bf, setBf] = useState('')
  const [chart, setChart] = useState<'weight' | 'bf'>('weight')

  const latest = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const delta = latest && prev ? +(latest.weight - prev.weight).toFixed(1) : null
  const ffmi = latest?.bodyFat != null && user?.heightCm ? computeFfmi(latest.weight, latest.bodyFat, user.heightCm) : null
  const bfRows = rows.filter((m) => m.bodyFat != null)

  const wn = parseNum(w, { min: 20, max: 400 })
  const opt = (v: string, max: number) => (v === '' ? undefined : (parseNum(v, { min: 1, max }) ?? undefined))

  async function save() {
    if (wn == null) return
    await upsertMeasurement(date, { weight: wn, bodyFat: opt(bf, 70) })
    setW(''); setBf('')
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <h1>Corpo</h1>

      {/* Peso in evidenza + andamento */}
      <div className="card">
        <div className="row spread">
          <span className="muted small">Peso attuale</span>
          {delta != null && <span className="small" style={{ color: delta < 0 ? 'var(--good)' : delta > 0 ? '#e0a030' : 'var(--muted)' }}>{delta < 0 ? '▼' : delta > 0 ? '▲' : ''}{Math.abs(delta)} kg vs prec.</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{latest ? latest.weight : '—'}</span>
          <span className="muted small">kg</span>
          {latest?.bodyFat != null && <span className="muted small" style={{ marginLeft: 8 }}>· BF {latest.bodyFat}%</span>}
        </div>
        {(rows.length >= 2 || bfRows.length >= 2) && (
          <>
            <div className="row spread" style={{ margin: '8px 0 6px' }}>
              <span className="muted small">Andamento</span>
              <span className="row" style={{ gap: 4 }}>
                <button className={chart === 'weight' ? 'chip on' : 'chip'} onClick={() => setChart('weight')}>Peso</button>
                <button className={chart === 'bf' ? 'chip on' : 'chip'} onClick={() => setChart('bf')} disabled={bfRows.length < 2}>% grasso</button>
              </span>
            </div>
            {chart === 'weight'
              ? <LineChart points={rows.map((m) => ({ label: m.date, value: m.weight }))} />
              : <LineChart points={bfRows.map((m) => ({ label: m.date, value: m.bodyFat as number }))} />}
          </>
        )}
      </div>

      {/* FFMI */}
      {latest && (
        <div className="card">
          <div className="muted small">FFMI {ffmi ? '(norm.)' : ''}<Info text="FFMI = indice di massa magra: peso × (1−%grasso) / altezza². Migliore del BMI per chi ha muscoli. Serve % grasso + altezza (Profilo)." /></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{ffmi ? ffmi.normalized : '—'}</span>
            <span className="muted small">{ffmi ? `massa magra ${ffmi.ffmKg} kg` : 'serve % grasso + altezza'}</span>
          </div>
        </div>
      )}

      {/* Log rapido */}
      <div className="card">
        <label className="fl">Registra misura</label>
        <div style={{ marginBottom: 8 }}>
          <label className="fl">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}><label className="fl">Peso (kg)</label><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="fl">% grasso (opz.)</label><input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} /></div>
        </div>
        <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={wn == null} onClick={save}>Salva</button>
      </div>

      {/* Storico */}
      <div className="card">
        <div className="muted small" style={{ marginBottom: 6 }}>Storico</div>
        {rows.length === 0 ? <p className="muted small">Nessuna misura.</p> : [...rows].reverse().map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="muted small" style={{ flex: '0 0 84px', fontVariantNumeric: 'tabular-nums' }}>{m.date}</span>
            <span style={{ flex: 1 }}>{m.weight} kg{m.bodyFat != null ? ` · ${m.bodyFat}%` : ''}</span>
            <button className="ghost small" style={{ flex: 'none', padding: '4px 10px' }} onClick={() => { if (confirm('Eliminare la misura?')) deleteMeasurement(m.id) }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

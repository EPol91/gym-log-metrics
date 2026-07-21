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
  const [more, setMore] = useState(false)
  const [waist, setWaist] = useState('')
  const [arm, setArm] = useState('')
  const [thigh, setThigh] = useState('')
  const [chest, setChest] = useState('')
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
    await upsertMeasurement(date, {
      weight: wn,
      bodyFat: opt(bf, 70),
      waist: opt(waist, 250), arm: opt(arm, 100), thigh: opt(thigh, 150), chest: opt(chest, 250),
    })
    setW(''); setBf(''); setWaist(''); setArm(''); setThigh(''); setChest(''); setMore(false)
  }

  return (
    <div className="col">
      <h1>Corpo</h1>

      <div className="card">
        <label className="fl">Registra misura</label>
        <div style={{ marginBottom: 8 }}>
          <label className="fl">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="row">
          <div style={{ flex: 1 }}><label className="fl">Peso (kg)</label><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="fl">% grasso (opz.)</label><input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} /></div>
        </div>
        {more ? (
          <div className="row wrap" style={{ marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 110 }}><label className="fl">Vita (cm)</label><input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 110 }}><label className="fl">Braccio</label><input inputMode="decimal" value={arm} onChange={(e) => setArm(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 110 }}><label className="fl">Coscia</label><input inputMode="decimal" value={thigh} onChange={(e) => setThigh(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 110 }}><label className="fl">Petto</label><input inputMode="decimal" value={chest} onChange={(e) => setChest(e.target.value)} /></div>
          </div>
        ) : (
          <button className="ghost small" style={{ marginTop: 8 }} onClick={() => setMore(true)}>＋ Circonferenze</button>
        )}
        <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={wn == null} onClick={save}>Salva</button>
      </div>

      {latest && (
        <div className="grid2">
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">Peso attuale</div>
            <div className="score"><span className="val">{latest.weight}</span><span className="muted small">kg</span></div>
            {delta != null && <div className="small" style={{ color: delta < 0 ? 'var(--good)' : delta > 0 ? '#e0a030' : 'var(--muted)' }}>{delta > 0 ? '+' : ''}{delta} kg vs prec.</div>}
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted small">FFMI {ffmi ? '(norm.)' : ''}<Info align="right" text="FFMI = indice di massa magra: peso × (1−%grasso) / altezza². Migliore del BMI per chi ha muscoli. 'Norm.' = corretto per l'altezza. Serve % grasso + altezza." /></div>
            <div className="score"><span className="val">{ffmi ? ffmi.normalized : '—'}</span></div>
            <div className="muted small">{ffmi ? `magra ${ffmi.ffmKg} kg` : 'serve % grasso + altezza'}</div>
          </div>
        </div>
      )}

      {(rows.length >= 2 || bfRows.length >= 2) && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="muted small">Andamento</span>
            <span className="row" style={{ gap: 4 }}>
              <button className={chart === 'weight' ? 'sel small' : 'ghost small'} onClick={() => setChart('weight')}>Peso</button>
              <button className={chart === 'bf' ? 'sel small' : 'ghost small'} onClick={() => setChart('bf')} disabled={bfRows.length < 2}>% grasso</button>
            </span>
          </div>
          {chart === 'weight'
            ? <LineChart points={rows.map((m) => ({ label: m.date, value: m.weight }))} />
            : <LineChart points={bfRows.map((m) => ({ label: m.date, value: m.bodyFat as number }))} />}
        </div>
      )}

      <div className="card">
        <div className="muted small" style={{ marginBottom: 6 }}>Storico</div>
        {rows.length === 0 ? <p className="muted small">Nessuna misura.</p> : [...rows].reverse().map((m) => (
          <div className="setline" key={m.id}>
            <span className="muted small">{m.date}</span>
            <span>{m.weight} kg{m.bodyFat != null ? ` · ${m.bodyFat}%` : ''}{m.waist != null ? ` · vita ${m.waist}` : ''}</span>
            <button className="ghost small" onClick={() => { if (confirm('Eliminare la misura?')) deleteMeasurement(m.id) }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

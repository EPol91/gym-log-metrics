import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addCardio, cardioOf, deleteCardio, updateCardio, getUser } from '../db/repo'
import { computeCardioZone } from '../metrics/cardio'
import { parseNum } from '../util/validate'
import { CardioViz } from './CardioViz'
import { Info } from './anim'
import type { CardioMethod, CardioType, CardioSession } from '../db/schema'

const TYPES: CardioType[] = ['corsa', 'cyclette', 'ellittica', 'vogatore', 'camminata', 'altro']

function CardioRow({ c, age, restingHr, maxHr }: { c: CardioSession; age: number; restingHr?: number; maxHr?: number }) {
  const [edit, setEdit] = useState(false)
  const [dur, setDur] = useState(String(c.durationMin))
  const [bpm, setBpm] = useState(c.avgBpm != null ? String(c.avgBpm) : '')
  const z = c.avgBpm && (age || maxHr) ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr, method: c.method ?? 'standard', maxHr }) : null

  if (edit) {
    return (
      <div className="card" style={{ background: 'var(--surface-2)', margin: '6px 0' }}>
        <div className="row">
          <div style={{ flex: 1 }}><label className="fl">Durata</label><input inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="fl">BPM</label><input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={() => setEdit(false)}>Annulla</button>
          <button className="primary" style={{ flex: 2 }} onClick={async () => { const dn = parseNum(dur, { min: 1, max: 600 }); if (dn == null) return; await updateCardio(c.id, { durationMin: dn, avgBpm: bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined) }); setEdit(false) }}>Salva</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="setline">
        <span className="muted small">🏃</span>
        <span onClick={() => setEdit(true)} style={{ cursor: 'pointer' }}>
          {c.cardioType ? `${c.cardioType} · ` : ''}{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{z ? ` · ${z.label} · ${z.method === 'hrr' ? 'HRR' : 'Std'}` : ''} <span className="muted small">✎</span>
        </span>
        <button className="ghost small" onClick={() => { if (confirm('Eliminare il cardio?')) deleteCardio(c.id) }}>✕</button>
      </div>
      {z && <CardioViz bpm={c.avgBpm} pct={z.pct} zone={z.zone} />}
    </div>
  )
}

export function CardioBlock({ sessionId }: { sessionId: string }) {
  const list = useLiveQuery(() => cardioOf(sessionId), [sessionId]) ?? []
  const user = useLiveQuery(getUser, [])
  const [open, setOpen] = useState(false)
  const [dur, setDur] = useState('')
  const [bpm, setBpm] = useState('')
  const [method, setMethod] = useState<CardioMethod>('standard')
  const [ctype, setCtype] = useState<CardioType>('corsa')
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0

  const durN = parseNum(dur, { min: 1, max: 600 })
  async function add() {
    if (durN == null) return
    await addCardio(sessionId, { durationMin: durN, avgBpm: bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined), method, cardioType: ctype })
    setDur(''); setBpm(''); setOpen(false)
  }

  return (
    <div className="card">
      <div className="row spread">
        <strong>Cardio</strong>
        {!open && <button className="ghost small" onClick={() => setOpen(true)}>＋ Aggiungi</button>}
      </div>

      {list.map((c) => <CardioRow key={c.id} c={c} age={age} restingHr={user?.restingHr} maxHr={user?.hrMaxMeasured} />)}

      {open && (
        <div className="col" style={{ marginTop: 10 }}>
          <div>
            <label className="fl">Tipo</label>
            <select value={ctype} onChange={(e) => setCtype(e.target.value as CardioType)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label className="fl">Durata (min)</label><input inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="fl">BPM medio (opz.)</label><input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></div>
          </div>
          <div>
            <label className="fl">Formula zona<Info text="Zone cardio Z1-Z5 (recupero→anaerobico). Standard = % della FC max (220−età). HRR/Karvonen = tiene conto anche della FC a riposo, più preciso ma serve quel dato." /></label>
            <div className="row">
              <button className={method === 'standard' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('standard')}>
                Standard
                <span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FCmax {user?.hrMaxMeasured ?? (age ? 220 - age : '—')}{user?.hrMaxMeasured ? ' (mis.)' : ''}</span>
              </button>
              <button className={method === 'hrr' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('hrr')}>
                HRR (Karvonen)
                <span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FC riposo {user?.restingHr ?? '—'}</span>
              </button>
            </div>
            {method === 'hrr' && !user?.restingHr && (
              <p className="small" style={{ marginTop: 6, color: '#e0a030' }}>
                ⚠ HRR richiede la FC a riposo (Profilo). Senza, uso Standard.
              </p>
            )}
          </div>
          {(() => {
            const live = bpm !== '' && (age || user?.hrMaxMeasured) ? computeCardioZone({ avgBpm: Number(bpm), age, restingHr: user?.restingHr, method, maxHr: user?.hrMaxMeasured }) : null
            return <CardioViz bpm={bpm === '' ? undefined : Number(bpm)} pct={live?.pct} zone={live?.zone} />
          })()}
          <div className="row">
            <button className="ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>Annulla</button>
            <button className="primary" style={{ flex: 2 }} disabled={durN == null} onClick={add}>Aggiungi cardio</button>
          </div>
        </div>
      )}
    </div>
  )
}

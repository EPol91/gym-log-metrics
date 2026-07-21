import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addCardio, cardioOf, deleteCardio, updateCardio, getUser, listCardioPresets, addCardioPreset, deleteCardioPreset } from '../db/repo'
import { computeCardioZone } from '../metrics/cardio'
import { computeCardioAverages } from '../scores/cardioStats'
import { parseNum } from '../util/validate'
import { isHeartRateSupported, connectHeartRate, type HeartRateHandle } from '../util/heartRate'
import { CardioViz } from './CardioViz'
import { CardioRunner } from './CardioRunner'
import { Info } from './anim'
import type { CardioMethod, CardioType, CardioSession } from '../db/schema'

/** Live BPM da fascia Bluetooth: connessione, valore corrente e media dei campioni. */
function useHeartRate() {
  const [supported] = useState(isHeartRateSupported())
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [bpm, setBpm] = useState<number | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [avgBpm, setAvgBpm] = useState<number | null>(null)
  const handleRef = useRef<HeartRateHandle | null>(null)
  const acc = useRef({ sum: 0, count: 0 })

  async function connect() {
    if (connecting || connected) return
    setError(null); setConnecting(true)
    try {
      const h = await connectHeartRate(
        (v) => { setBpm(v); acc.current.sum += v; acc.current.count++; setAvgBpm(Math.round(acc.current.sum / acc.current.count)) },
        () => { setConnected(false); setBpm(null); handleRef.current = null },
      )
      handleRef.current = h; setDeviceName(h.deviceName); setConnected(true)
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (!/cancel/i.test(msg)) setError('Connessione fascia fallita.')
    } finally { setConnecting(false) }
  }
  function disconnect() { handleRef.current?.disconnect(); handleRef.current = null; setConnected(false); setBpm(null) }
  function resetAvg() { acc.current = { sum: 0, count: 0 }; setAvgBpm(null) }

  useEffect(() => () => handleRef.current?.disconnect(), [])

  return { supported, connected, connecting, bpm, deviceName, error, avgBpm, connect, disconnect, resetAvg }
}

const TYPE_LABEL: Record<CardioType, string> = {
  corsa: 'Corsa', camminata: 'Camminata', cyclette: 'Cyclette', ellittica: 'Ellittica', vogatore: 'Vogatore',
  hiit: 'HIIT', tabata: 'Tabata', liss: 'LISS', intervalli: 'Intervalli', altro: 'Altro',
}
const TYPES = Object.keys(TYPE_LABEL) as CardioType[]
const INTERVAL_TYPES: CardioType[] = ['hiit', 'tabata', 'intervalli']
const isInterval = (t: CardioType) => INTERVAL_TYPES.includes(t)
const DEFAULTS: Record<string, { rounds: number; work: number; rest: number }> = {
  tabata: { rounds: 8, work: 20, rest: 10 },
  hiit: { rounds: 10, work: 30, rest: 30 },
  intervalli: { rounds: 8, work: 30, rest: 30 },
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

function NumStep({ label, value, set, step, min }: { label: string; value: number; set: (v: number) => void; step: number; min: number }) {
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <label className="fl" style={{ display: 'block', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</label>
      <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
        <button style={{ padding: '8px 0', flex: 1, minWidth: 0 }} onClick={() => set(Math.max(min, value - step))}>−</button>
        <strong style={{ minWidth: 26, fontSize: 18 }}>{value}</strong>
        <button style={{ padding: '8px 0', flex: 1, minWidth: 0 }} onClick={() => set(value + step)}>＋</button>
      </div>
    </div>
  )
}

function CardioRow({ c, age, restingHr, maxHr }: { c: CardioSession; age: number; restingHr?: number; maxHr?: number }) {
  const [edit, setEdit] = useState(false)
  const [dur, setDur] = useState(String(c.durationMin))
  const [bpm, setBpm] = useState(c.avgBpm != null ? String(c.avgBpm) : '')
  const z = c.avgBpm && (age || maxHr) ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr, method: c.method ?? 'standard', maxHr }) : null
  if (edit) {
    return (
      <div className="card" style={{ background: 'var(--surface-2)', margin: '6px 0' }}>
        <div className="row">
          <div style={{ flex: 1 }}><label className="fl">Durata</label><input inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="fl">BPM</label><input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={() => setEdit(false)}>Annulla</button>
          <button className="primary" style={{ flex: 2 }} onClick={async () => { const dn = parseNum(dur, { min: 0.1, max: 600 }); if (dn == null) return; await updateCardio(c.id, { durationMin: dn, avgBpm: bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined) }); setEdit(false) }}>Salva</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="setline">
        <span className="muted small">🏃</span>
        <span onClick={() => setEdit(true)} style={{ cursor: 'pointer' }}>
          {c.cardioType ? `${TYPE_LABEL[c.cardioType]} · ` : ''}{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{z ? ` · ${z.label} · ${z.method === 'hrr' ? 'HRR' : 'Std'}` : ''} <span className="muted small">✎</span>
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
  const presets = useLiveQuery(listCardioPresets, []) ?? []
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const hr = useHeartRate()
  const liveZone = hr.bpm && (age || user?.hrMaxMeasured)
    ? computeCardioZone({ avgBpm: hr.bpm, age, restingHr: user?.restingHr, method: 'standard', maxHr: user?.hrMaxMeasured })
    : null

  const [phase, setPhase] = useState<'idle' | 'setup' | 'running'>('idle')
  const [open, setOpen] = useState(false)
  const [dur, setDur] = useState('')
  const [bpm, setBpm] = useState('')
  const [method, setMethod] = useState<CardioMethod>('standard')
  const [ctype, setCtype] = useState<CardioType>('corsa')

  // setup timer
  const [rounds, setRounds] = useState(8)
  const [work, setWork] = useState(20)
  const [rest, setRest] = useState(10)
  const [steadyMode, setSteadyMode] = useState<'chrono' | 'countdown'>('chrono')
  const [targetMin, setTargetMin] = useState(20)

  const [period, setPeriod] = useState(7)
  const avg = useLiveQuery(() => computeCardioAverages(period), [period])

  function chooseType(t: CardioType) {
    setCtype(t)
    if (isInterval(t) && DEFAULTS[t]) { setRounds(DEFAULTS[t].rounds); setWork(DEFAULTS[t].work); setRest(DEFAULTS[t].rest) }
  }
  const intervalTotal = rounds * work + Math.max(0, rounds - 1) * rest + 3

  function onRunnerComplete(min: number) {
    setDur(String(min))
    if (hr.avgBpm != null) setBpm(String(hr.avgBpm)) // prefill BPM medio dalla fascia
    setPhase('idle'); setOpen(true)
  }
  function startRun() { hr.resetAvg(); setPhase('running') } // azzera la media per la nuova sessione

  const durN = parseNum(dur, { min: 0.1, max: 600 })
  async function add() {
    if (durN == null) return
    await addCardio(sessionId, { durationMin: durN, avgBpm: bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined), method, cardioType: ctype })
    setDur(''); setBpm(''); setOpen(false)
  }

  return (
    <div className="card">
      <div className="row spread">
        <strong>Cardio</strong>
        {phase === 'idle' && !open && (
          <span className="row" style={{ gap: 6 }}>
            <button className="ghost small" onClick={() => setPhase('setup')}>▶ Avvia</button>
            <button className="ghost small" onClick={() => setOpen(true)}>＋ Manuale</button>
          </span>
        )}
      </div>

      {/* Live BPM da fascia Bluetooth (solo browser che lo supportano; iOS nascosto) */}
      {hr.supported && (
        <>
          <div className="row spread" style={{ marginTop: 8 }}>
            {hr.connected ? (
              <>
                <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 18, color: '#e5484d', animation: hr.bpm ? 'heartBeat 1.2s ease-in-out infinite' : 'none' }}>❤️</span>
                  <strong style={{ fontSize: 22, color: 'var(--gold)' }}>{hr.bpm ?? '—'}</strong>
                  <span className="muted small">bpm{liveZone ? ` · ${liveZone.label}` : ''}</span>
                </span>
                <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="muted small" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hr.deviceName}</span>
                  <button className="ghost small" onClick={hr.disconnect}>Disconnetti</button>
                </span>
              </>
            ) : (
              <button className="ghost small" onClick={hr.connect} disabled={hr.connecting}>
                {hr.connecting ? 'Connessione…' : '❤️ Connetti fascia'}
              </button>
            )}
          </div>
          {hr.error && <p className="small" style={{ color: '#e57373', marginTop: 4 }}>{hr.error}</p>}
        </>
      )}

      {avg && avg.count > 0 && phase === 'idle' && !open && (
        <div className="row spread" style={{ marginTop: 6 }}>
          <span className="muted small">
            Media {period === 7 ? 'settimana' : 'mese'}: <strong style={{ color: 'var(--gold)' }}>{avg.avgDurationMin} min</strong>
            {avg.avgBpm != null ? <> · <strong style={{ color: 'var(--gold)' }}>{avg.avgBpm} bpm</strong></> : ''} <span className="muted">({avg.count})</span>
          </span>
          <span className="row" style={{ gap: 4 }}>
            <button className={period === 7 ? 'sel small' : 'ghost small'} onClick={() => setPeriod(7)}>7g</button>
            <button className={period === 30 ? 'sel small' : 'ghost small'} onClick={() => setPeriod(30)}>30g</button>
          </span>
        </div>
      )}

      {/* Setup timer */}
      {phase === 'setup' && (
        <div className="col" style={{ marginTop: 10 }}>
          <div>
            <label className="fl">Tipo</label>
            <select value={ctype} onChange={(e) => chooseType(e.target.value as CardioType)}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          {isInterval(ctype) ? (
            <>
              {presets.length > 0 && (
                <div>
                  <label className="fl">I tuoi preset</label>
                  <div className="col">
                    {presets.map((p) => (
                      <div className="row spread" key={p.id}>
                        <button className="ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => { setRounds(p.rounds); setWork(p.workSec); setRest(p.restSec) }}>
                          {p.name} <span className="muted small">· {p.rounds}× {p.workSec}/{p.restSec}s</span>
                        </button>
                        <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${p.name}?`)) deleteCardioPreset(p.id) }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <NumStep label="Round" value={rounds} set={setRounds} step={1} min={1} />
                <NumStep label="Lavoro (s)" value={work} set={setWork} step={5} min={5} />
                <NumStep label="Rec. (s)" value={rest} set={setRest} step={5} min={0} />
              </div>
              <p className="muted small">Totale stimato: <strong style={{ color: 'var(--gold)' }}>{fmt(intervalTotal)}</strong></p>
              <button className="ghost small" onClick={async () => { const n = prompt('Nome preset:'); if (n) await addCardioPreset(n, rounds, work, rest) }}>☆ Salva come preset</button>
            </>
          ) : (
            <>
              <div>
                <label className="fl">Modalità</label>
                <div className="row">
                  <button className={steadyMode === 'chrono' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => setSteadyMode('chrono')}>Cronometro</button>
                  <button className={steadyMode === 'countdown' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => setSteadyMode('countdown')}>Countdown</button>
                </div>
              </div>
              {steadyMode === 'countdown' && (
                <div style={{ maxWidth: 160 }}><NumStep label="Durata target (min)" value={targetMin} set={setTargetMin} step={5} min={1} /></div>
              )}
            </>
          )}

          <div className="row">
            <button className="ghost" style={{ flex: 1 }} onClick={() => setPhase('idle')}>Annulla</button>
            <button className="primary" style={{ flex: 2 }} onClick={startRun}>▶ Avvia</button>
          </div>
        </div>
      )}

      {/* Timer in corso */}
      {phase === 'running' && (
        isInterval(ctype)
          ? <CardioRunner mode="interval" rounds={rounds} workSec={work} restSec={rest} onComplete={onRunnerComplete} onCancel={() => setPhase('idle')} />
          : steadyMode === 'countdown'
            ? <CardioRunner mode="countdown" targetSec={targetMin * 60} onComplete={onRunnerComplete} onCancel={() => setPhase('idle')} />
            : <CardioRunner mode="chrono" onComplete={onRunnerComplete} onCancel={() => setPhase('idle')} />
      )}

      {list.map((c) => <CardioRow key={c.id} c={c} age={age} restingHr={user?.restingHr} maxHr={user?.hrMaxMeasured} />)}

      {open && (
        <div className="col" style={{ marginTop: 10 }}>
          <div>
            <label className="fl">Tipo</label>
            <select value={ctype} onChange={(e) => setCtype(e.target.value as CardioType)}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label className="fl">Durata (min)</label><input inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="fl">BPM medio (opz.)</label><input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></div>
          </div>
          <div>
            <label className="fl">Formula zona<Info text="Zone cardio Z1-Z5. Standard = % FC max (220−età o misurata). HRR/Karvonen = tiene conto anche della FC a riposo, più preciso ma serve quel dato." /></label>
            <div className="row">
              <button className={method === 'standard' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('standard')}>
                Standard<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FCmax {user?.hrMaxMeasured ?? (age ? 220 - age : '—')}{user?.hrMaxMeasured ? ' (mis.)' : ''}</span>
              </button>
              <button className={method === 'hrr' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('hrr')}>
                HRR (Karvonen)<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FC riposo {user?.restingHr ?? '—'}</span>
              </button>
            </div>
            {method === 'hrr' && !user?.restingHr && <p className="small" style={{ marginTop: 6, color: '#e0a030' }}>⚠ HRR richiede la FC a riposo (Profilo). Senza, uso Standard.</p>}
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

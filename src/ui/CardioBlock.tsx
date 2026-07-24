import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addCardio, cardioOf, deleteCardio, updateCardio, getUser, listCardioPresets, addCardioTemplate, deleteCardioPreset, listMeasurements } from '../db/repo'
import { computeCardioZone } from '../metrics/cardio'
import { estimateCalories } from '../util/calories'
import { computeCardioAverages } from '../scores/cardioStats'
import { parseNum } from '../util/validate'
import { isHeartRateSupported, hrSubscribe, hrGetState, hrConnect, hrDisconnect, hrResetAvg } from '../util/heartRate'
import { CardioViz } from './CardioViz'
import { CardioRunner } from './CardioRunner'
import { Info } from './anim'
import type { CardioMethod, CardioType, CardioSession, CardioPreset } from '../db/schema'

/** Live BPM da fascia Bluetooth. La connessione vive in un singleton (heartRate.ts):
 *  resta attiva anche uscendo dal cardio/cambiando schermata. Qui ci si limita a leggerlo. */
function useHeartRate() {
  const [, force] = useState(0)
  useEffect(() => hrSubscribe(() => force((x) => x + 1)), [])
  const s = hrGetState()
  return {
    supported: isHeartRateSupported(),
    connected: s.connected, connecting: s.connecting, bpm: s.bpm, avgBpm: s.avgBpm, maxBpm: s.maxBpm, deviceName: s.deviceName, error: s.error,
    connect: hrConnect, disconnect: hrDisconnect, resetAvg: hrResetAvg,
  }
}

const TYPE_LABEL: Record<CardioType, string> = {
  corsa: 'Corsa', camminata: 'Camminata', cyclette: 'Cyclette', ellittica: 'Ellittica', vogatore: 'Vogatore', assaultbike: 'Assault Bike',
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
          {c.cardioType ? `${TYPE_LABEL[c.cardioType]} · ` : ''}{c.durationMin} min{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}{c.maxBpm ? ` · max ${c.maxBpm}` : ''}{c.calories ? ` · ${c.calories} kcal` : ''}{z ? ` · ${z.label}` : ''} <span className="muted small">✎</span>
        </span>
        <button className="ghost small" onClick={() => { if (confirm('Eliminare il cardio?')) deleteCardio(c.id) }}>✕</button>
      </div>
      {z && <CardioViz bpm={c.avgBpm} pct={z.pct} zone={z.zone} />}
    </div>
  )
}

export function CardioBlock({ sessionId, flushRef }: { sessionId: string; flushRef?: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const list = useLiveQuery(() => cardioOf(sessionId), [sessionId]) ?? []
  const user = useLiveQuery(getUser, [])
  const presets = useLiveQuery(listCardioPresets, []) ?? []
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const measurements = useLiveQuery(listMeasurements, []) ?? []
  const weightKg = measurements.length ? measurements[measurements.length - 1].weight : null
  const hr = useHeartRate()

  const [phase, setPhase] = useState<'idle' | 'setup' | 'running'>('idle')
  const [open, setOpen] = useState(false)
  const [dur, setDur] = useState('')
  const [bpm, setBpm] = useState('')
  const [method, setMethod] = useState<CardioMethod>('hrr') // HRR default (blueprint); fallback a Standard se manca FC riposo
  const [ctype, setCtype] = useState<CardioType>('corsa')

  const liveZone = hr.bpm && (age || user?.hrMaxMeasured)
    ? computeCardioZone({ avgBpm: hr.bpm, age, restingHr: user?.restingHr, method, maxHr: user?.hrMaxMeasured })
    : null

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
  function applyTemplate(p: CardioPreset) {
    if (p.cardioType) setCtype(p.cardioType)
    if (p.method) setMethod(p.method)
    const m = p.mode ?? 'interval'
    if (m === 'interval') { setRounds(p.rounds); setWork(p.workSec); setRest(p.restSec) }
    else { setSteadyMode(m); if (p.targetMin) setTargetMin(p.targetMin) }
  }
  async function saveTemplate() {
    const n = prompt('Nome template:'); if (!n) return
    const m = isInterval(ctype) ? 'interval' as const : steadyMode
    await addCardioTemplate(n, { rounds, workSec: work, restSec: rest, cardioType: ctype, method, mode: m, targetMin })
  }
  const tplDesc = (p: CardioPreset) => {
    const m = p.mode ?? 'interval'
    return `${TYPE_LABEL[p.cardioType ?? 'intervalli']} · ${m === 'interval' ? `${p.rounds}× ${p.workSec}/${p.restSec}s` : m === 'countdown' ? `${p.targetMin ?? 20} min` : 'crono'}`
  }
  const intervalTotal = rounds * work + Math.max(0, rounds - 1) * rest + 3

  const [runStartMs, setRunStartMs] = useState<number | null>(null)
  const [pendingMax, setPendingMax] = useState<number | null>(null)
  function clearRun() { try { sessionStorage.removeItem('cardioRun') } catch { /* ignore */ } setRunStartMs(null) }

  // Ripristina un cardio in corso dopo un refresh (il timer riparte dall'orario reale).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('cardioRun')
      if (!raw) return
      const r = JSON.parse(raw)
      setCtype(r.ctype); setMethod(r.method); setSteadyMode(r.steadyMode)
      setRounds(r.rounds); setWork(r.work); setRest(r.rest); setTargetMin(r.targetMin)
      setRunStartMs(r.startMs); setPhase('running')
    } catch { /* ignore */ }
  }, [])

  function onRunnerComplete(min: number) {
    clearRun()
    setDur(String(min))
    if (hr.avgBpm != null) setBpm(String(hr.avgBpm)) // prefill BPM medio dalla fascia
    setPendingMax(hr.maxBpm) // FC max da salvare
    setPhase('idle'); setOpen(true)
  }
  function startRun() {
    hr.resetAvg()
    const startMs = Date.now()
    setRunStartMs(startMs)
    try { sessionStorage.setItem('cardioRun', JSON.stringify({ ctype, method, steadyMode, rounds, work, rest, targetMin, startMs })) } catch { /* ignore */ }
    setPhase('running')
  }

  const durN = parseNum(dur, { min: 0.1, max: 600 })
  async function add() {
    if (durN == null) return
    const avgN = bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined)
    const cal = estimateCalories({ avgHr: avgN, weightKg, age, sex: user?.sex, durationMin: durN }) ?? undefined
    await addCardio(sessionId, { durationMin: durN, avgBpm: avgN, maxBpm: pendingMax ?? undefined, calories: cal, method, cardioType: ctype })
    setDur(''); setBpm(''); setOpen(false); setPendingMax(null)
  }

  // Salvataggio automatico del cardio ancora nel form aperto quando si chiude l'allenamento (niente dati persi).
  useEffect(() => {
    if (flushRef) flushRef.current = async () => { if (open && durN != null) await add() }
  })

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
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {hr.connected ? (
              <>
                <span className="row" style={{ gap: 8, alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 18, color: '#e5484d', animation: hr.bpm ? 'heartBeat 1.2s ease-in-out infinite' : 'none' }}>❤️</span>
                  <strong style={{ fontSize: 22, color: 'var(--gold)' }}>{hr.bpm ?? '—'}</strong>
                  <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    bpm{liveZone ? ` · Z${liveZone.zone}` : ''}{hr.avgBpm ? ` · media ${hr.avgBpm}` : ''} · {hr.deviceName}
                  </span>
                </span>
                <button className="ghost small" style={{ flex: '0 0 auto' }} onClick={hr.disconnect}>Disconnetti</button>
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

          <div>
            <label className="fl">Formula zona</label>
            <div className="row">
              <button className={method === 'standard' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('standard')}>
                Standard<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FCmax {user?.hrMaxMeasured ?? (age ? 220 - age : '—')}</span>
              </button>
              <button className={method === 'hrr' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('hrr')}>
                HRR (Karvonen)<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FC riposo {user?.restingHr ?? '—'}</span>
              </button>
            </div>
            {method === 'hrr' && !user?.restingHr && <p className="small" style={{ marginTop: 6, color: '#e0a030' }}>⚠ HRR richiede la FC a riposo (Profilo). Senza, uso Standard.</p>}
          </div>

          {presets.length > 0 && (
            <div>
              <label className="fl">I tuoi template</label>
              <div className="col">
                {presets.map((p) => (
                  <div className="row spread" key={p.id}>
                    <button className="ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => applyTemplate(p)}>
                      {p.name} <span className="muted small">· {tplDesc(p)}</span>
                    </button>
                    <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${p.name}?`)) deleteCardioPreset(p.id) }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isInterval(ctype) ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <NumStep label="Round" value={rounds} set={setRounds} step={1} min={1} />
                <NumStep label="Lavoro (s)" value={work} set={setWork} step={5} min={5} />
                <NumStep label="Rec. (s)" value={rest} set={setRest} step={5} min={0} />
              </div>
              <p className="muted small">Totale stimato: <strong style={{ color: 'var(--gold)' }}>{fmt(intervalTotal)}</strong></p>
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

          <button className="ghost small" onClick={saveTemplate}>⭐ Salva come template</button>
          <div className="row">
            <button className="ghost" style={{ flex: 1 }} onClick={() => setPhase('idle')}>Annulla</button>
            <button className="primary" style={{ flex: 2 }} onClick={startRun}>▶ Avvia</button>
          </div>
        </div>
      )}

      {/* Timer in corso */}
      {phase === 'running' && (
        isInterval(ctype)
          ? <CardioRunner mode="interval" rounds={rounds} workSec={work} restSec={rest} bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
          : steadyMode === 'countdown'
            ? <CardioRunner mode="countdown" targetSec={targetMin * 60} bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
            : <CardioRunner mode="chrono" bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
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
            <button className="primary" style={{ flex: 2 }} disabled={durN == null} onClick={add}>✓ Salva cardio</button>
          </div>
          <p className="muted small" style={{ marginTop: 4, textAlign: 'center' }}>Premi Salva per registrarlo nella seduta.</p>
        </div>
      )}
    </div>
  )
}

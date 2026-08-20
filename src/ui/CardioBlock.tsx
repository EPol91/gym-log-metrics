import { useState, useEffect } from 'react'
import { getSession } from '../db/repo'
import { Cuore } from './Cuore'
import { deleteWithUndo } from '../db/trash'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { restingHrFromWhoop } from '../db/whoop'
import { addCardio, cardioOf, deleteCardio, updateCardio, getUser, listCardioPresets, addCardioTemplate, deleteCardioPreset, listMeasurements } from '../db/repo'
import { computeCardioZone } from '../metrics/cardio'
import { estimateCalories } from '../util/calories'
import { computeCardioAverages } from '../scores/cardioStats'
import { parseNum } from '../util/validate'
import { useHeartRate } from './fascia'
import { useWallTick } from '../util/useWallClock'
import { CardioViz } from './CardioViz'
import { CardioRunner } from './CardioRunner'
import type { CardioMethod, CardioType, CardioSession, CardioPreset } from '../db/schema'


/**
 * Quanto e' fresco il battito che stai guardando.
 *
 * Un numero fermo sembra un numero vivo: senza questa riga non c'era modo di
 * accorgersi che la fascia aveva smesso di parlare, e la seduta finiva con la
 * media vuota. Dice anche quanti battiti sono arrivati in tutto e quando e'
 * caduta l'ultima volta: sono i tre dati che distinguono «Android ha sospeso le
 * notifiche» da «la fascia ha smesso di trasmettere».
 */
function Freschezza({ ms, n, caduta }: { ms: number | null; n: number; caduta: number | null }) {
  useWallTick(true)
  if (ms == null) return null
  const eta = Math.round((Date.now() - ms) / 1000)
  const ora = (t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return (
    <span className="muted" style={{ fontSize: 10, color: eta > 10 ? 'var(--fat)' : undefined }}>
      {eta <= 3 ? 'in diretta' : `fermo da ${eta}s`} · {n} battiti{caduta ? ` · caduta ${ora(caduta)}` : ''}
    </span>
  )
}

const TYPE_LABEL: Record<CardioType, string> = {
  corsa: 'Corsa', camminata: 'Camminata', cyclette: 'Cyclette', ellittica: 'Ellittica', vogatore: 'Vogatore', assaultbike: 'Assault Bike',
  hiit: 'HIIT', tabata: 'Tabata', liss: 'LISS', intervalli: 'Intervalli', altro: 'Altro',
}
const TYPES = Object.keys(TYPE_LABEL) as CardioType[]
const TYPE_ICON: Record<CardioType, string> = {
  corsa: '🏃', camminata: '🚶', cyclette: '🚴', ellittica: '🌀', vogatore: '🚣', assaultbike: '💨',
  hiit: '🔥', tabata: '⚡', liss: '🌊', intervalli: '⏱', altro: '•',
}
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

function CardioRow({ c, age, restingHr, maxHr, hrSeduta }: { c: CardioSession; age: number; restingHr?: number; maxHr?: number; hrSeduta?: { t0: string; step: number; bpm: number[] } }) {
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
        <button className="ghost small" onClick={() => { if (confirm('Eliminare il cardio?')) deleteWithUndo('Cardio eliminato', () => deleteCardio(c.id)) }}>✕</button>
      </div>
      {z && <CardioViz bpm={c.avgBpm} pct={z.pct} zone={z.zone} />}
      {/* Il cuore del SOLO cardio: stessa lettura della seduta, finestra diversa. */}
      <Cuore hr={hrSeduta} da={c.startedAt} a={c.endedAt} titolo="Cuore del cardio" />
    </div>
  )
}

export function CardioBlock({ sessionId, flushRef, open, onOpenChange }: {
  sessionId: string; flushRef?: React.MutableRefObject<(() => Promise<void>) | null>
  open: boolean; onOpenChange: (b: boolean) => void
}) {
  const list = useLiveQuery(() => cardioOf(sessionId), [sessionId]) ?? []
  // Le letture stanno sulla seduta: il cardio ci pesca dentro la sua finestra.
  const seduta = useLiveQuery(() => getSession(sessionId), [sessionId])
  const user = useLiveQuery(getUser, [])
  // Media WHOOP degli ultimi 7 giorni: se c e, comanda lei.
  const fcWhoop = useLiveQuery(() => restingHrFromWhoop(), [])
  const fcRiposo = fcWhoop ?? user?.restingHr
  const presets = useLiveQuery(listCardioPresets, []) ?? []
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const measurements = useLiveQuery(listMeasurements, []) ?? []
  const weightKg = measurements.length ? measurements[measurements.length - 1].weight : null
  const hr = useHeartRate()

  const [phase, setPhase] = useState<'idle' | 'setup' | 'running'>('idle')
  const [manual, setManual] = useState(false)
  const [dur, setDur] = useState('')
  const [bpm, setBpm] = useState('')
  const [method, setMethod] = useState<CardioMethod>('hrr') // HRR default (blueprint); fallback a Standard se manca FC riposo
  const [ctype, setCtype] = useState<CardioType>('corsa')

  const liveZone = hr.bpm && (age || user?.hrMaxMeasured)
    ? computeCardioZone({ avgBpm: hr.bpm, age, restingHr: fcRiposo, method, maxHr: user?.hrMaxMeasured })
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
  function clearRun() { try { localStorage.removeItem('cardioRun') } catch { /* ignore */ } setRunStartMs(null) }

  /**
   * Un cardio in corso si riprende sempre, anche dopo che l'app e' stata chiusa.
   *
   * Stava in sessionStorage, che muore insieme all'app: chiudere e riaprire —
   * l'unica cosa da fare quando l'app si impallava — si portava via la seduta
   * cardio intera. Ora sta in localStorage, che resta su disco: il cronometro
   * riparte dall'orario vero e non hai perso niente.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cardioRun') ?? sessionStorage.getItem('cardioRun')
      if (!raw) return
      const r = JSON.parse(raw)
      // Roba di un'altra seduta o di ore fa: non si riapre da sola.
      if (r.sessionId && r.sessionId !== sessionId) return
      if (!r.startMs || Date.now() - r.startMs > 6 * 3600_000) { localStorage.removeItem('cardioRun'); return }
      setCtype(r.ctype); setMethod(r.method); setSteadyMode(r.steadyMode)
      setRounds(r.rounds); setWork(r.work); setRest(r.rest); setTargetMin(r.targetMin)
      setRunStartMs(r.startMs); setPhase('running')
    } catch { /* ignore */ }
  }, [sessionId])

  function onRunnerComplete(min: number) {
    clearRun()
    setDur(String(min))
    if (hr.avgBpm != null) setBpm(String(hr.avgBpm)) // prefill BPM medio dalla fascia
    setPendingMax(hr.maxBpm) // FC max da salvare
    setPhase('idle'); setManual(true); onOpenChange(true)
  }
  function startRun() {
    hr.resetAvg()
    const startMs = Date.now()
    setRunStartMs(startMs)
    try { localStorage.setItem('cardioRun', JSON.stringify({ sessionId, ctype, method, steadyMode, rounds, work, rest, targetMin, startMs })) } catch { /* ignore */ }
    setPhase('running')
  }

  const durN = parseNum(dur, { min: 0.1, max: 600 })
  async function add() {
    if (durN == null) return
    const avgN = bpm === '' ? undefined : (parseNum(bpm, { min: 30, max: 230, int: true }) ?? undefined)
    const cal = estimateCalories({ avgHr: avgN, weightKg, age, sex: user?.sex, durationMin: durN }) ?? undefined
    // Gli estremi del blocco: la fine e' adesso, l'inizio e' la fine meno la
    // durata. Servono a ritagliare il cuore del SOLO cardio dentro le letture
    // di tutta la seduta — senza, le due finestre coinciderebbero.
    const fineCardio = new Date()
    const inizioCardio = new Date(fineCardio.getTime() - durN * 60_000)
    await addCardio(sessionId, {
      durationMin: durN, avgBpm: avgN, maxBpm: pendingMax ?? undefined, calories: cal, method, cardioType: ctype,
      startedAt: inizioCardio.toISOString(), endedAt: fineCardio.toISOString(),
    })
    setDur(''); setBpm(''); setManual(false); setPendingMax(null)
  }

  // Salvataggio automatico del cardio ancora nel form aperto quando si chiude l'allenamento (niente dati persi).
  useEffect(() => {
    if (flushRef) flushRef.current = async () => { if (manual && durN != null) await add() }
  })

  const FasciaBar = hr.supported ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {hr.connected ? (
        <>
          <span className="row" style={{ gap: 8, alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ fontSize: 18, color: '#e5484d', animation: hr.bpm ? 'heartBeat 1.2s ease-in-out infinite' : 'none' }}>❤️</span>
            <strong style={{ fontSize: 22, color: 'var(--gold)' }}>{hr.bpm ?? '—'}</strong>
            <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>bpm{liveZone ? ` · Z${liveZone.zone}` : ''}{hr.avgBpm ? ` · media ${hr.avgBpm}` : ''} · {hr.deviceName}</span>
            {/* Quanto e' vecchio l'ultimo battito: un numero fermo da mezzo
                minuto non e' una misura, e prima non c'era modo di saperlo. */}
            <Freschezza ms={hr.ultimoBattitoMs} n={hr.battitiRicevuti} caduta={hr.ultimaCadutaMs} />
          </span>
          <button className="ghost small" onClick={hr.disconnect}>Disconnetti</button>
        </>
      ) : (
        <button className="chip" style={{ borderColor: '#7a2a2a' }} onClick={hr.connect} disabled={hr.connecting}>{hr.connecting ? 'Connessione…' : '❤️ Connetti fascia'}</button>
      )}
    </div>
  ) : null

  const FormulaToggle = (
    <div>
      <label className="fl">Formula zona</label>
      <div className="row">
        <button className={method === 'standard' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('standard')}>Standard<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FCmax {user?.hrMaxMeasured ?? (age ? 220 - age : '—')}</span></button>
        <button className={method === 'hrr' ? 'sel' : ''} style={{ flex: 1, lineHeight: 1.25 }} onClick={() => setMethod('hrr')}>HRR (Karvonen)<span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>FC riposo {fcRiposo ?? '—'}{fcWhoop != null ? ' · WHOOP' : ''}</span></button>
      </div>
      {method === 'hrr' && !fcRiposo && <p className="small" style={{ marginTop: 6, color: '#e0a030' }}>⚠ HRR richiede la FC a riposo: collega WHOOP o scrivila nel Profilo. Senza, uso Standard.</p>}
    </div>
  )

  return (
    <>
      {/* Cardio in corso: schermo intero (portal), sopra tutto */}
      {phase === 'running' && (
        isInterval(ctype)
          ? <CardioRunner mode="interval" rounds={rounds} workSec={work} restSec={rest} bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
          : steadyMode === 'countdown'
            ? <CardioRunner mode="countdown" targetSec={targetMin * 60} bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
            : <CardioRunner mode="chrono" bpm={hr.bpm} avgBpm={hr.avgBpm} maxBpm={hr.maxBpm} zone={liveZone?.zone} pct={liveZone?.pct} weightKg={weightKg} age={age} sex={user?.sex} startedAtMs={runStartMs ?? undefined} onComplete={onRunnerComplete} onCancel={() => { clearRun(); setPhase('idle') }} />
      )}

      {/* Modale Cardio (portal a schermo intero) */}
      {open && phase !== 'running' && createPortal(
        <div style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 120, background: 'var(--bg)', overflowY: 'auto' }}>
          <div className="col" style={{ maxWidth: 520, margin: '0 auto', padding: '14px 16px calc(20px + env(safe-area-inset-bottom))', gap: 9 }}>
            <div className="row spread">
              <h2 style={{ margin: 0 }}>🏃 Cardio</h2>
              <button className="ghost small" onClick={() => { setManual(false); onOpenChange(false) }}>✕</button>
            </div>

            {FasciaBar}
            {hr.error && <p className="small" style={{ color: '#e57373' }}>{hr.error}</p>}

            {manual ? (
              <>
                <div>
                  <label className="fl">Tipo</label>
                  <select value={ctype} onChange={(e) => setCtype(e.target.value as CardioType)}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}><label className="fl">Durata (min)</label><input inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
                  <div style={{ flex: 1 }}><label className="fl">BPM medio (opz.)</label><input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></div>
                </div>
                {FormulaToggle}
                {(() => {
                  const live = bpm !== '' && (age || user?.hrMaxMeasured) ? computeCardioZone({ avgBpm: Number(bpm), age, restingHr: fcRiposo, method, maxHr: user?.hrMaxMeasured }) : null
                  return <CardioViz bpm={bpm === '' ? undefined : Number(bpm)} pct={live?.pct} zone={live?.zone} />
                })()}
                <div className="row">
                  <button className="ghost" style={{ flex: 1 }} onClick={() => setManual(false)}>Annulla</button>
                  <button className="primary" style={{ flex: 2 }} disabled={durN == null} onClick={add}>✓ Salva cardio</button>
                </div>
              </>
            ) : (
              <>
                {/* Tipo — griglia di icone compatta */}
                <label className="fl">Tipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {TYPES.map((t) => (
                    <button key={t} onClick={() => chooseType(t)} style={{ padding: '5px 2px', textAlign: 'center', fontSize: 11.5, lineHeight: 1.2, borderRadius: 10, border: `1px solid ${ctype === t ? 'var(--gold)' : 'var(--line)'}`, color: ctype === t ? 'var(--gold)' : 'var(--text)', background: ctype === t ? 'rgba(217,178,74,.08)' : 'var(--surface)' }}>
                      <span style={{ fontSize: 17, display: 'block', marginBottom: 1 }}>{TYPE_ICON[t]}</span>{TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>

                {FormulaToggle}

                {presets.length > 0 && (
                  <div>
                    <label className="fl">I tuoi template</label>
                    <div className="col">
                      {presets.map((p) => (
                        <div className="row spread" key={p.id}>
                          <button className="ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => applyTemplate(p)}>{p.name} <span className="muted small">· {tplDesc(p)}</span></button>
                          <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${p.name}?`)) deleteWithUndo(`Template "${p.name}" eliminato`, () => deleteCardioPreset(p.id)) }}>✕</button>
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
                    {steadyMode === 'countdown' && <div style={{ maxWidth: 160 }}><NumStep label="Durata target (min)" value={targetMin} set={setTargetMin} step={5} min={1} /></div>}
                  </>
                )}

                <button className="ghost small" onClick={saveTemplate}>⭐ Salva come template</button>

                <div className="row" style={{ gap: 8 }}>
                  <button className="ghost" style={{ flex: 1 }} onClick={() => setManual(true)}>＋ Manuale</button>
                  <button className="primary" style={{ flex: 2, padding: '15px' }} onClick={startRun}>▶ Avvia cardio</button>
                </div>

                {avg && avg.count > 0 && (
                  <div className="row spread">
                    <span className="muted small">Media {period === 7 ? 'settimana' : 'mese'}: <strong style={{ color: 'var(--gold)' }}>{avg.avgDurationMin} min</strong>{avg.avgBpm != null ? <> · <strong style={{ color: 'var(--gold)' }}>{avg.avgBpm} bpm</strong></> : ''} <span className="muted">({avg.count})</span></span>
                    <span className="row" style={{ gap: 4 }}><button className={period === 7 ? 'sel small' : 'ghost small'} onClick={() => setPeriod(7)}>7g</button><button className={period === 30 ? 'sel small' : 'ghost small'} onClick={() => setPeriod(30)}>30g</button></span>
                  </div>
                )}

                {list.length > 0 && <label className="fl">In questa seduta</label>}
                {list.map((c) => <CardioRow key={c.id} c={c} age={age} restingHr={user?.restingHr} maxHr={user?.hrMaxMeasured} hrSeduta={seduta?.hr} />)}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

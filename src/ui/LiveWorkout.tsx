import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  entriesOf, setsOf, addSet, updateSet, deleteSet, addExerciseEntry,
  deleteExerciseEntry, moveExerciseEntry, allExercises, getOrCreateExercise,
  lastWorkingSet, getUser, getSession, updateSessionNotes, setExerciseRest, historicalBestE1rm, exerciseHistory, setExerciseSettings,
} from '../db/repo'
import { normalizeName } from '../db/catalog'
import { e1rm } from '../metrics/metrics'
import { parseNum } from '../util/validate'
import { tick, goSound } from '../util/sound'
import { isVoiceSupported, startRecognition, parseVoiceSet, type VoiceSet } from '../util/voice'
import { useWallTick } from '../util/useWallClock'
import { Info } from './anim'
import { CardioBlock } from './CardioBlock'
import type { Exercise, ExerciseEntry, SetEntry } from '../db/schema'

const REST_PRESETS = [60, 90, 120, 150, 180]

// --- Timer recupero: tap su un preset e parte quel recupero ---
function RestTimer({ defaultSec, presets, onPick, onClose }: {
  defaultSec: number; presets: number[]; onPick: (sec: number) => void; onClose: () => void
}) {
  const [total, setTotal] = useState(defaultSec)
  const [running, setRunning] = useState(true)
  const [pausedLeft, setPausedLeft] = useState(defaultSec)
  const endRef = useRef(Date.now() + defaultSec * 1000) // orario reale di fine
  const [, force] = useState(0)
  useWallTick(running)
  // Secondi rimasti calcolati sull'orario reale → il recupero non si ferma uscendo dall'app.
  const left = Math.max(0, Math.ceil(running ? (endRef.current - Date.now()) / 1000 : pausedLeft))
  const done = left <= 0
  const warn = left > 0 && left <= 5 // ultimi 5 secondi

  useEffect(() => {
    if (warn) { navigator.vibrate?.(30); tick() }                    // tick negli ultimi 5s
    if (left === 0) { navigator.vibrate?.([120, 60, 200]); goSound() } // fine = suono "GO"
  }, [left, warn])

  function pick(sec: number) { setTotal(sec); endRef.current = Date.now() + sec * 1000; setPausedLeft(sec); setRunning(true); onPick(sec) }
  function toggle() {
    setRunning((r) => {
      if (r) { setPausedLeft(Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))); return false }
      endRef.current = Date.now() + pausedLeft * 1000; return true
    })
  }
  function adjust(delta: number) {
    if (running) { endRef.current += delta * 1000; force((x) => x + 1) }
    else setPausedLeft((l) => Math.max(0, l + delta))
  }
  function reset() { setRunning(false); setPausedLeft(total) }
  const mm = Math.floor(Math.max(0, left) / 60)
  const ss = Math.max(0, left) % 60

  const ctrl = { flex: 1, padding: '7px 0', fontSize: 13 }
  return (
    <div className="card" style={{ borderColor: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--line)', transition: 'border-color .2s', padding: '8px 12px', margin: '6px 0 0' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <span className="muted small">Rec.</span>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, lineHeight: 1, whiteSpace: 'nowrap', color: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--gold)' }}>
          {done ? 'Vai!' : `${mm}:${ss.toString().padStart(2, '0')}`}
        </span>
        <div style={{ flex: 1, minWidth: 24, height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, width: `${Math.max(0, Math.min(100, (left / total) * 100))}%`, background: warn ? '#e5484d' : 'var(--gold)', transition: 'width 1s linear, background .2s' }} />
        </div>
        <button className="ghost small" onClick={onClose}>✕</button>
      </div>
      <div className="row" style={{ gap: 4, marginTop: 6, alignItems: 'center' }}>
        <button style={ctrl} onClick={() => adjust(-15)}>−15</button>
        <button style={ctrl} onClick={() => adjust(15)}>+15</button>
        <button style={ctrl} onClick={toggle}>{running ? '⏸' : '▶'}</button>
        <button style={ctrl} onClick={reset}>↺</button>
        <select value={total} onChange={(e) => pick(Number(e.target.value))} style={{ flex: 1, padding: '6px 2px', fontSize: 13 }}>
          {presets.map((s) => <option key={s} value={s}>{s}s</option>)}
        </select>
      </div>
    </div>
  )
}

// --- Cronometro seduta ---
function WorkoutClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const mm = Math.floor(sec / 60), ss = sec % 60
  return <span className="muted small">⏱ {mm}:{ss.toString().padStart(2, '0')}</span>
}

// Dettatura vocale della serie: "100 per 8 RIR 2" → riempie i campi.
function VoiceButton({ onFill }: { onFill: (f: VoiceSet) => void }) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const clearRef = useRef<number | null>(null)
  useEffect(() => () => { if (clearRef.current) clearTimeout(clearRef.current) }, [])
  if (!isVoiceSupported()) return null

  function toggle() {
    if (listening) { stopRef.current?.(); return }
    if (clearRef.current) clearTimeout(clearRef.current)
    setHeard(''); setListening(true)
    stopRef.current = startRecognition(
      ({ transcript, final }) => {
        setHeard(transcript)
        if (final) {
          onFill(parseVoiceSet(transcript))
          clearRef.current = window.setTimeout(() => setHeard(''), 4000) // il testo sparisce dopo la lettura
        }
      },
      () => { setListening(false); stopRef.current = null },
      () => { setListening(false); stopRef.current = null },
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button className={listening ? 'sel' : 'ghost'} style={{ width: '100%' }} onClick={toggle}>
        {listening ? '● In ascolto… tocca per fermare' : '🎤 Detta la serie'}
        <Info text="Dillo così: «100 per 8» oppure «102,5 per 6 RIR 2». Aggiungi «riscaldamento» per marcarla. La voce riempie i campi: controlli e premi Aggiungi set." />
      </button>
      {heard ? <p className="muted small" style={{ marginTop: 4 }}>Sentito: “{heard}”</p>
        : listening && <p className="muted small" style={{ marginTop: 4 }}>Es: «100 per 8 RIR 2»</p>}
    </div>
  )
}

function ExercisePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = useLiveQuery(allExercises, []) ?? []
  const nq = normalizeName(q)
  const filtered = nq
    ? list.filter((e) => normalizeName(e.name).includes(nq) || e.aliases.some((a) => normalizeName(a).includes(nq)))
    : list
  const exactExists = list.some((e) => normalizeName(e.name) === nq || e.aliases.some((a) => normalizeName(a) === nq))
  return (
    <div className="card">
      <div className="row spread"><strong>Aggiungi esercizio</strong><button className="ghost small" onClick={onClose}>✕</button></div>
      <input placeholder="Cerca o scrivi un nome…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '10px 0' }} />
      <div className="col" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {q && !exactExists && (
          <button className="sel" onClick={async () => { const ex = await getOrCreateExercise(q); onPick(ex.id) }}>＋ Crea “{q.trim()}”</button>
        )}
        {filtered.map((e: Exercise) => (
          <button key={e.id} className="ghost" style={{ textAlign: 'left' }} onClick={() => onPick(e.id)}>
            {e.name} <span className="muted small">· {e.muscle}{e.isCustom ? ' · custom' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Card numerica grande con − / ＋ (stile mockup Workout B).
function StepCard({ label, value, onStep }: { label: string; value: string; onStep: (dir: number) => void }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, padding: '8px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value === '' ? '0' : value}</div>
      <div className="muted" style={{ fontSize: 10 }}>{label}</div>
      <div className="row" style={{ gap: 4, marginTop: 6 }}>
        <button style={{ flex: 1, padding: '5px 0' }} onClick={() => onStep(-1)}>−</button>
        <button style={{ flex: 1, padding: '5px 0' }} onClick={() => onStep(1)}>＋</button>
      </div>
    </div>
  )
}

const SROW = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 22px', gap: 6, alignItems: 'center', padding: '7px 2px', borderTop: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' } as const

// Riga della tabella set: tap per modificare kg/reps, ✕ per eliminare.
function SetRowT({ s, index, prev, isPR }: { s: SetEntry; index: number; prev: string; isPR: boolean }) {
  const [ed, setEd] = useState(false)
  const [w, setW] = useState(String(s.weight))
  const [r, setR] = useState(String(s.reps))
  if (ed) return (
    <div style={{ ...SROW, gridTemplateColumns: '26px 1fr 1fr auto' }}>
      <span className="muted small">{s.isWarmup ? 'W' : index}</span>
      <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ padding: '6px 4px', textAlign: 'center' }} />
      <input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ padding: '6px 4px', textAlign: 'center' }} />
      <span className="row" style={{ gap: 4 }}>
        <button className="primary" style={{ padding: '6px 9px' }} onClick={async () => { const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true }); if (wn != null && rn != null) { await updateSet(s.id, { weight: wn, reps: rn }); setEd(false) } }}>✓</button>
        <button className="ghost small" onClick={() => { if (confirm('Eliminare la serie?')) deleteSet(s.id) }}>🗑</button>
        <button className="ghost small" onClick={() => setEd(false)}>✕</button>
      </span>
    </div>
  )
  return (
    <div style={SROW} onClick={() => setEd(true)}>
      <span className="muted small">{s.isWarmup ? 'W' : index}</span>
      <span className="muted small">{prev}</span>
      <span className="strong">{s.weight}</span>
      <span className="strong">{s.reps}{isPR && <span style={{ color: 'var(--gold)' }}> PR</span>}</span>
      <span style={{ textAlign: 'center', color: 'var(--good)' }}>✓</span>
    </div>
  )
}

function EntryCard({ entry, name, settings, sessionId, restSec, pos, total, restNode, isFirst, isLast, onLogged }: {
  entry: ExerciseEntry; name: string; settings: string; sessionId: string; restSec: number
  pos: number; total: number; restNode: React.ReactNode; isFirst: boolean; isLast: boolean; onLogged: (sec: number, exerciseId: string) => void
}) {
  const sets = useLiveQuery(() => setsOf(entry.id), [entry.id]) ?? []
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [rir, setRir] = useState<number | null>(null)
  const [warmup, setWarmup] = useState(false)
  const [hint, setHint] = useState<SetEntry | null>(null)
  const [histBest, setHistBest] = useState(0)
  const [prevSets, setPrevSets] = useState<SetEntry[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [history, setHistory] = useState<{ date: string; sets: SetEntry[] }[]>([])
  const prefilled = useRef(false)
  const lastSetAtRef = useRef<number | null>(null) // recupero reale tra le serie

  useEffect(() => { if (showHist && history.length === 0) exerciseHistory(entry.exerciseId, sessionId).then(setHistory) }, [showHist]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lastWorkingSet(entry.exerciseId, sessionId).then(setHint) }, [entry.exerciseId, sessionId])
  useEffect(() => { historicalBestE1rm(entry.exerciseId, sessionId).then(setHistBest) }, [entry.exerciseId, sessionId])
  useEffect(() => { exerciseHistory(entry.exerciseId, sessionId, 1).then((h) => setPrevSets(h[0]?.sets ?? [])) }, [entry.exerciseId, sessionId])
  useEffect(() => {
    if (prefilled.current) return
    const src = sets.length ? sets[sets.length - 1] : hint
    if (src) { setW(String(src.weight)); setR(String(src.reps)); prefilled.current = true }
  }, [hint, sets])

  const canAdd = parseNum(w, { min: 0 }) != null && parseNum(r, { min: 1, int: true }) != null
  const stepKg = (d: number) => setW((v) => String(Math.max(0, +(((v === '' ? 0 : +v) + d * 2.5)).toFixed(2))))
  const stepRep = (d: number) => setR((v) => String(Math.max(1, (v === '' ? 0 : +v) + d)))
  const stepRir = (d: number) => setRir((v) => d > 0 ? (v == null ? 0 : Math.min(6, v + 1)) : (v == null || v <= 0 ? null : v - 1))

  function fillFromVoice(f: VoiceSet) {
    if (f.weight != null) setW(String(f.weight))
    if (f.reps != null) setR(String(f.reps))
    if (f.rir != null) setRir(f.rir)
    if (f.warmup) setWarmup(true)
  }
  async function add() {
    const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true })
    if (wn == null || rn == null) return
    const now = Date.now()
    const restTaken = !warmup && lastSetAtRef.current != null ? Math.min(3600, Math.max(0, Math.round((now - lastSetAtRef.current) / 1000))) : undefined
    await addSet(entry.id, { weight: wn, reps: rn, rir: rir ?? undefined, isWarmup: warmup, restSec: restTaken })
    if (!warmup) lastSetAtRef.current = now
    setRir(null); setWarmup(false)
    if (!warmup) onLogged(restSec, entry.exerciseId)
  }

  let wIdx = 0
  return (
    <div className="col" style={{ gap: 10 }}>
      {/* Header centrato */}
      <div style={{ textAlign: 'center' }}>
        <div className="muted small" style={{ letterSpacing: '.12em' }}>ESERCIZIO {pos} / {total}</div>
        <h2 style={{ margin: '2px 0' }}>{name}</h2>
        <div className="muted small">{hint ? `Ultima: ${hint.weight}×${hint.reps}` : 'Prima volta'}{histBest > 0 ? ` · PR ${Math.round(histBest)}` : ''}</div>
      </div>

      {/* Controlli secondari */}
      <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="ghost small" onClick={() => setShowHist((v) => !v)}>📊 Storico</button>
        <button className="ghost small" onClick={() => setShowSettings((v) => !v)}>⚙ Regolazioni</button>
        <button className="ghost small" disabled={isFirst} onClick={() => moveExerciseEntry(entry.id, -1)}>↑</button>
        <button className="ghost small" disabled={isLast} onClick={() => moveExerciseEntry(entry.id, 1)}>↓</button>
        <button className="ghost small" onClick={() => { if (confirm(`Rimuovere ${name}?`)) deleteExerciseEntry(entry.id) }}>🗑</button>
      </div>
      {!showSettings && settings && <div className="muted small" style={{ textAlign: 'center' }}>⚙ {settings}</div>}
      {showSettings && <textarea defaultValue={settings} rows={2} placeholder="Regolazioni macchina: sellino, poggiapetto…" style={{ width: '100%' }} onBlur={(e) => setExerciseSettings(entry.exerciseId, e.target.value)} />}
      {showHist && (
        <div className="col" style={{ gap: 3, paddingLeft: 4, borderLeft: '2px solid var(--line)' }}>
          {history.length === 0 ? <p className="muted small">Nessuna seduta precedente.</p> : history.map((h, i) => (
            <div key={i} className="muted small"><strong>{h.date}</strong>: {h.sets.map((s) => `${s.weight}×${s.reps}${s.restSec != null ? ` (⏱${s.restSec}s)` : ''}`).join(', ')}</div>
          ))}
        </div>
      )}

      {/* Tabella set */}
      <div className="card" style={{ padding: '4px 12px 8px' }}>
        <div style={{ ...SROW, borderTop: 'none', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          <span>Set</span><span>Prec.</span><span>Kg</span><span>Reps</span><span />
        </div>
        {sets.map((s) => {
          if (!s.isWarmup) wIdx++
          const idx = s.isWarmup ? 0 : wIdx
          const prev = s.isWarmup ? '—' : (prevSets[idx - 1] ? `${prevSets[idx - 1].weight}×${prevSets[idx - 1].reps}` : '—')
          return <SetRowT key={s.id} s={s} index={idx} prev={prev} isPR={!s.isWarmup && histBest > 0 && e1rm(s.weight, s.reps) > histBest} />
        })}
        <div style={{ ...SROW, color: 'var(--gold)' }}>
          <span className="muted small">{sets.filter((x) => !x.isWarmup).length + 1}</span>
          <span className="muted small">{hint ? `${hint.weight}×${hint.reps}` : '—'}</span>
          <span className="strong">{w === '' ? '—' : w}</span>
          <span className="strong">{r === '' ? '—' : r}</span>
          <span style={{ textAlign: 'center' }}>○</span>
        </div>
      </div>

      {/* Card numeriche grandi */}
      <div className="row" style={{ gap: 8 }}>
        <StepCard label="kg" value={w} onStep={stepKg} />
        <StepCard label="reps" value={r} onStep={stepRep} />
        <StepCard label="RIR" value={rir == null ? '—' : String(rir)} onStep={stepRir} />
      </div>

      {/* Barra recupero (sotto le card, come nel mockup) */}
      {restNode}

      {/* Voce + riscaldamento */}
      <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <button className={warmup ? 'sel' : 'ghost'} style={{ flex: '0 0 auto' }} onClick={() => setWarmup((v) => !v)}>Risc.</button>
        <div style={{ flex: 1 }}><VoiceButton onFill={fillFromVoice} /></div>
      </div>

      {/* Registra serie */}
      <button className="primary" style={{ width: '100%', padding: '15px', fontSize: 15 }} disabled={!canAdd} onClick={add}>✓ Registra serie</button>
    </div>
  )
}

export function LiveWorkout({ sessionId, onFinish, onHome }: { sessionId: string; onFinish: () => void; onHome?: () => void }) {
  const entries = useLiveQuery(() => entriesOf(sessionId), [sessionId]) ?? []
  const exercises = useLiveQuery(allExercises, []) ?? []
  const session = useLiveQuery(() => getSession(sessionId), [sessionId])
  const user = useLiveQuery(getUser, [])
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—'
  const [picking, setPicking] = useState(false)
  const [rest, setRest] = useState<number | null>(null)
  const [restExId, setRestExId] = useState<string | null>(null)
  const [restNonce, setRestNonce] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const [cur, setCur] = useState(0) // esercizio corrente (vista a focus)
  const current = entries.length ? Math.min(cur, entries.length - 1) : 0

  const cardioFlush = useRef<(() => Promise<void>) | null>(null)
  async function finishAll() { await cardioFlush.current?.(); onFinish() } // salva il cardio in sospeso, poi chiudi

  const restDefault = user?.restDefaultSec ?? 90
  const restOf = (id: string) => exercises.find((e) => e.id === id)?.restSec ?? restDefault
  const startRest = (sec: number, exId: string | null) => { setRest(sec); setRestExId(exId); setRestNonce((n) => n + 1) }
  const restPresets = rest != null
    ? Array.from(new Set([rest, 60, 90, 120, 150, 180])).sort((a, b) => a - b)
    : REST_PRESETS

  return (
    <div className="col">
      {/* Barra fissa in alto: Home · pallini esercizi · Recupero + durata */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', margin: '-16px -16px 0', padding: '12px 16px 8px' }}>
        <div className="row spread">
          {onHome ? <button className="ghost small" onClick={onHome}>‹ Home</button> : <span />}
          <span className="row" style={{ gap: 5 }}>
            {entries.map((e, i) => (
              <span key={e.id} onClick={() => setCur(i)} style={{ width: 8, height: 8, borderRadius: 999, cursor: 'pointer', background: i === current ? 'var(--gold)' : 'var(--surface-2)', border: '1px solid var(--line)' }} />
            ))}
          </span>
          <span className="row" style={{ gap: 8, alignItems: 'center' }}>
            {rest == null && <button className="ghost small" onClick={() => startRest(restDefault, null)}>⏱</button>}
            {session && <WorkoutClock startedAt={session.startedAt} />}
          </span>
        </div>
      </div>

      {entries.length > 0 && (
        <>
          <EntryCard key={entries[current].id} entry={entries[current]} name={nameOf(entries[current].exerciseId)}
            settings={exercises.find((x) => x.id === entries[current].exerciseId)?.settings ?? ''}
            sessionId={sessionId} restSec={restOf(entries[current].exerciseId)}
            pos={current + 1} total={entries.length}
            restNode={rest != null ? (
              <RestTimer key={restNonce} defaultSec={rest} presets={restPresets}
                onPick={(s) => { if (restExId) setExerciseRest(restExId, s) }}
                onClose={() => setRest(null)} />
            ) : null}
            isFirst={current === 0} isLast={current === entries.length - 1} onLogged={startRest} />

          {/* Navigazione tra esercizi */}
          <div className="row" style={{ gap: 8 }}>
            <button className="ghost" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} disabled={current === 0}
              onClick={() => setCur(current - 1)}>‹ {current > 0 ? nameOf(entries[current - 1].exerciseId) : ''}</button>
            <button className="ghost" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} disabled={current >= entries.length - 1}
              onClick={() => setCur(current + 1)}>{current < entries.length - 1 ? nameOf(entries[current + 1].exerciseId) : ''} ›</button>
          </div>
        </>
      )}

      {picking ? (
        <ExercisePicker onPick={async (id) => { await addExerciseEntry(sessionId, id); setCur(entries.length); setPicking(false) }} onClose={() => setPicking(false)} />
      ) : (
        <button onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
      )}

      <CardioBlock sessionId={sessionId} flushRef={cardioFlush} />

      {notesOpen ? (
        <div className="card">
          <label className="fl">Note seduta</label>
          <textarea defaultValue={session?.notes ?? ''} rows={3} style={{ width: '100%' }}
            onBlur={(e) => updateSessionNotes(sessionId, e.target.value)} />
        </div>
      ) : (
        <button className="ghost" onClick={() => setNotesOpen(true)}>＋ Note seduta</button>
      )}

      <button className="fab primary" onClick={finishAll}>Fine allenamento</button>
    </div>
  )
}

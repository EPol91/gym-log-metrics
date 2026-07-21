import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  entriesOf, setsOf, addSet, updateSet, deleteSet, addExerciseEntry,
  deleteExerciseEntry, moveExerciseEntry, allExercises, getOrCreateExercise,
  lastWorkingSet, getUser, getSession, updateSessionNotes, setExerciseRest, historicalBestE1rm,
} from '../db/repo'
import { normalizeName } from '../db/catalog'
import { e1rm } from '../metrics/metrics'
import { parseNum } from '../util/validate'
import { tick, goSound } from '../util/sound'
import { isVoiceSupported, startRecognition, parseVoiceSet, type VoiceSet } from '../util/voice'
import { Info } from './anim'
import { CardioBlock } from './CardioBlock'
import type { Exercise, ExerciseEntry, SetEntry } from '../db/schema'

const REST_PRESETS = [60, 90, 120, 150, 180]

// --- Timer recupero: tap su un preset e parte quel recupero ---
function RestTimer({ defaultSec, presets, onPick, onClose }: {
  defaultSec: number; presets: number[]; onPick: (sec: number) => void; onClose: () => void
}) {
  const [total, setTotal] = useState(defaultSec)
  const [left, setLeft] = useState(defaultSec)
  const [running, setRunning] = useState(true)
  const done = left <= 0
  const warn = left > 0 && left <= 5 // ultimi 5 secondi

  useEffect(() => {
    if (!running || left <= 0) return
    const t = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(t)
  }, [running, left])

  useEffect(() => {
    if (warn) { navigator.vibrate?.(30); tick() }                    // tick negli ultimi 5s
    if (left === 0) { navigator.vibrate?.([120, 60, 200]); goSound() } // fine = suono "GO"
  }, [left, warn])

  function pick(sec: number) { setTotal(sec); setLeft(sec); setRunning(true); onPick(sec) }
  const mm = Math.floor(Math.max(0, left) / 60)
  const ss = Math.max(0, left) % 60

  return (
    <div className="card" style={{ borderColor: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--line)', transition: 'border-color .2s' }}>
      <div className="row spread">
        <span className="muted small">Recupero — tocca un tempo per farlo partire</span>
        <button className="ghost small" onClick={onClose}>Chiudi ✕</button>
      </div>
      <div className={'timer' + (warn ? ' pulse' : '')} style={{ color: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--gold)' }}>
        {done ? 'Vai! 💪' : `${mm}:${ss.toString().padStart(2, '0')}`}
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', margin: '4px 0 8px' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          width: `${Math.max(0, Math.min(100, (left / total) * 100))}%`,
          background: warn ? '#e5484d' : 'var(--gold)', transition: 'width 1s linear, background .2s',
        }} />
      </div>
      <div className="opts" style={{ gridTemplateColumns: `repeat(${presets.length}, 1fr)` }}>
        {presets.map((s) => (
          <button key={s} className={total === s ? 'sel' : ''} onClick={() => pick(s)}>{s}s</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button style={{ flex: 1 }} onClick={() => setLeft((l) => Math.max(0, l - 15))}>−15s</button>
        <button style={{ flex: 1 }} onClick={() => setLeft((l) => l + 15)}>+15s</button>
        <button style={{ flex: 1 }} onClick={() => setRunning((r) => !r)}>{running ? '⏸' : '▶'}</button>
        <button style={{ flex: 1 }} onClick={() => { setLeft(total); setRunning(false) }}>Reset</button>
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

// Stepper numerico compatto.
function Stepper({ label, value, set, step, min = 0 }: { label: string; value: string; set: (v: string) => void; step: number; min?: number }) {
  const n = value === '' ? 0 : Number(value)
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="fl">{label}</label>
      <div className="row" style={{ gap: 4 }}>
        <button style={{ padding: '11px 12px', flex: '0 0 auto' }} onClick={() => set(String(Math.max(min, +(n - step).toFixed(2))))}>−</button>
        <input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)}
          style={{ textAlign: 'center', padding: '11px 2px', flex: 1, minWidth: 0 }} />
        <button style={{ padding: '11px 12px', flex: '0 0 auto' }} onClick={() => set(String(+(n + step).toFixed(2)))}>＋</button>
      </div>
    </div>
  )
}

// Selettore RIR guidato (0 = cedimento).
function RirPicker({ value, set }: { value: number | null; set: (v: number | null) => void }) {
  return (
    <div>
      <label className="fl">RIR — reps in riserva (opz.)<Info text="RIR = quante ripetizioni potevi ancora fare a fine serie. 0 = cedimento totale, 2 = te ne restavano 2. Misura lo sforzo, indipendente da quante reps fai." /></label>
      <div className="opts" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <button className={value === null ? 'sel' : ''} onClick={() => set(null)}>—</button>
        {[0, 1, 2, 3, 4].map((r) => (
          <button key={r} className={value === r ? 'sel' : ''} onClick={() => set(r)}>{r}</button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>Quante ne avevi ancora in canna. 0 = cedimento.</p>
    </div>
  )
}

// Dettatura vocale della serie: "100 per 8 RIR 2" → riempie i campi (poi si conferma con "Aggiungi set").
function VoiceButton({ onFill }: { onFill: (f: VoiceSet) => void }) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  if (!isVoiceSupported()) return null

  function toggle() {
    if (listening) { stopRef.current?.(); return }
    setHeard(''); setListening(true)
    stopRef.current = startRecognition(
      ({ transcript, final }) => { setHeard(transcript); if (final) onFill(parseVoiceSet(transcript)) },
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

function SetRow({ s, index, isPR, onDelete }: { s: SetEntry; index: number; isPR: boolean; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [w, setW] = useState(String(s.weight))
  const [r, setR] = useState(String(s.reps))
  const [rir, setRir] = useState<number | null>(s.rir ?? null)

  if (editing) {
    return (
      <div className="card" style={{ background: 'var(--surface-2)', margin: '6px 0' }}>
        <div className="row"><Stepper label="kg" value={w} set={setW} step={2.5} /><Stepper label="reps" value={r} set={setR} step={1} /></div>
        <RirPicker value={rir} set={setRir} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Annulla</button>
          <button className="primary" style={{ flex: 2 }} onClick={async () => {
            const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true })
            if (wn == null || rn == null) return
            await updateSet(s.id, { weight: wn, reps: rn, rir: rir ?? undefined }); setEditing(false)
          }}>Salva</button>
        </div>
      </div>
    )
  }
  return (
    <div className="setline">
      <span className="muted">{s.isWarmup ? 'W' : index}</span>
      <span onClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>
        {s.weight} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''} <span className="muted small">✎</span>
        {isPR && <span className="pr-badge">PR</span>}
      </span>
      <button className="ghost small" onClick={onDelete}>✕</button>
    </div>
  )
}

function EntryCard({ entry, name, sessionId, restSec, isFirst, isLast, onLogged }: {
  entry: ExerciseEntry; name: string; sessionId: string; restSec: number; isFirst: boolean; isLast: boolean; onLogged: (sec: number, exerciseId: string) => void
}) {
  const sets = useLiveQuery(() => setsOf(entry.id), [entry.id]) ?? []
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [rir, setRir] = useState<number | null>(null)
  const [warmup, setWarmup] = useState(false)
  const [hint, setHint] = useState<SetEntry | null>(null)
  const [histBest, setHistBest] = useState(0)
  const prefilled = useRef(false)

  useEffect(() => { lastWorkingSet(entry.exerciseId, sessionId).then(setHint) }, [entry.exerciseId, sessionId])
  useEffect(() => { historicalBestE1rm(entry.exerciseId, sessionId).then(setHistBest) }, [entry.exerciseId, sessionId])
  useEffect(() => {
    if (prefilled.current) return
    const src = sets.length ? sets[sets.length - 1] : hint
    if (src) { setW(String(src.weight)); setR(String(src.reps)); prefilled.current = true }
  }, [hint, sets])

  const canAdd = parseNum(w, { min: 0 }) != null && parseNum(r, { min: 1, int: true }) != null

  function fillFromVoice(f: VoiceSet) {
    if (f.weight != null) setW(String(f.weight))
    if (f.reps != null) setR(String(f.reps))
    if (f.rir != null) setRir(f.rir)
    if (f.warmup) setWarmup(true)
  }

  async function add() {
    const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true })
    if (wn == null || rn == null) return
    await addSet(entry.id, { weight: wn, reps: rn, rir: rir ?? undefined, isWarmup: warmup })
    setRir(null); setWarmup(false)
    if (!warmup) onLogged(restSec, entry.exerciseId)
  }

  return (
    <div className="card">
      <div className="row spread">
        <strong>{name}</strong>
        <span className="row" style={{ gap: 4 }}>
          <button className="ghost small" disabled={isFirst} onClick={() => moveExerciseEntry(entry.id, -1)}>↑</button>
          <button className="ghost small" disabled={isLast} onClick={() => moveExerciseEntry(entry.id, 1)}>↓</button>
          <button className="ghost small" onClick={() => { if (confirm(`Rimuovere ${name} dalla seduta?`)) deleteExerciseEntry(entry.id) }}>🗑</button>
        </span>
      </div>
      {hint && <div className="muted small" style={{ marginTop: 2 }}>Ultima volta: {hint.weight} kg × {hint.reps}{hint.rir != null ? ` · RIR ${hint.rir}` : ''} · recupero {restSec}s</div>}

      {sets.map((s, i) => (
        <SetRow key={s.id} s={s} index={sets.slice(0, i + 1).filter((x) => !x.isWarmup).length}
          isPR={!s.isWarmup && histBest > 0 && e1rm(s.weight, s.reps) > histBest}
          onDelete={() => { if (confirm('Eliminare la serie?')) deleteSet(s.id) }} />
      ))}

      <div className="row" style={{ marginTop: 10 }}>
        <Stepper label="kg" value={w} set={setW} step={2.5} />
        <Stepper label="reps" value={r} set={setR} step={1} />
      </div>
      <div style={{ marginTop: 8 }}><RirPicker value={rir} set={setRir} /></div>
      <VoiceButton onFill={fillFromVoice} />
      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="row" style={{ alignItems: 'center' }}>
          <button className={warmup ? 'sel' : 'ghost'} onClick={() => setWarmup((v) => !v)}>Riscaldamento</button>
          <Info text="Le serie di riscaldamento NON contano nelle metriche (volume, tonnellaggio, e1RM, PR, Score) e NON fanno partire il timer di recupero. Servono solo a tracciare l'avvicinamento ai carichi di lavoro." />
        </span>
        <button className="primary" style={{ flex: 1, marginLeft: 8 }} disabled={!canAdd} onClick={add}>Aggiungi set</button>
      </div>
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

  const restDefault = user?.restDefaultSec ?? 90
  const restOf = (id: string) => exercises.find((e) => e.id === id)?.restSec ?? restDefault
  const startRest = (sec: number, exId: string) => { setRest(sec); setRestExId(exId); setRestNonce((n) => n + 1) }
  const restPresets = rest != null
    ? Array.from(new Set([rest, 60, 90, 120, 150, 180])).sort((a, b) => a - b)
    : REST_PRESETS

  return (
    <div className="col">
      <div className="row spread">
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          {onHome && <button className="ghost small" onClick={onHome}>‹ Home</button>}
          <h2 style={{ margin: 0 }}>Workout live</h2>
        </span>
        {session && <WorkoutClock startedAt={session.startedAt} />}
      </div>

      {rest != null && (
        <RestTimer key={restNonce} defaultSec={rest} presets={restPresets}
          onPick={(s) => { if (restExId) setExerciseRest(restExId, s) }}
          onClose={() => setRest(null)} />
      )}

      {entries.map((e, i) => (
        <EntryCard key={e.id} entry={e} name={nameOf(e.exerciseId)} sessionId={sessionId} restSec={restOf(e.exerciseId)}
          isFirst={i === 0} isLast={i === entries.length - 1} onLogged={startRest} />
      ))}

      {picking ? (
        <ExercisePicker onPick={async (id) => { await addExerciseEntry(sessionId, id); setPicking(false) }} onClose={() => setPicking(false)} />
      ) : (
        <button onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
      )}

      <CardioBlock sessionId={sessionId} />

      {notesOpen ? (
        <div className="card">
          <label className="fl">Note seduta</label>
          <textarea defaultValue={session?.notes ?? ''} rows={3} style={{ width: '100%' }}
            onBlur={(e) => updateSessionNotes(sessionId, e.target.value)} />
        </div>
      ) : (
        <button className="ghost" onClick={() => setNotesOpen(true)}>＋ Note seduta</button>
      )}

      <button className="fab primary" onClick={onFinish}>Fine allenamento</button>
    </div>
  )
}

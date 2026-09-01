import { useEffect, useRef, useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { hrStartRecording, hrFlush } from '../util/heartRate'
import { TastoFascia, ChiediFascia } from './fascia'
import { Inclinometro } from './Inclinometro'
import { Dischi } from './Dischi'
import { fotoRidotta } from '../util/immagine'
import { deleteWithUndo } from '../db/trash'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  entriesOf, setsOf, addSet, updateSet, deleteSet, addExerciseEntry,
  deleteExerciseEntry, moveExerciseEntry, moveInGroup, staccaDalGruppo, allExercises, groupEntries, ungroupEntries,
  lastWorkingSet, getUser, getSession, updateSessionNotes, setExerciseRest, historicalBestE1rm, exerciseHistory, setExerciseSettings,
  setExerciseInclinazione, setExerciseFoto,
} from '../db/repo'
import { e1rm, bestE1rm } from '../metrics/metrics'
import { parseNum } from '../util/validate'
import { tick, goSound } from '../util/sound'
import { isVoiceSupported, startRecognition, parseVoiceSet, type VoiceSet } from '../util/voice'
import { useWallTick } from '../util/useWallClock'
import { programmaBip, annullaBip } from '../util/sedutaViva'
import { useWakeLock } from '../util/wakeLock'
import { Info } from './anim'
import { CardioBlock } from './CardioBlock'
import { ExercisePicker } from './ExercisePicker'
import { fmtRest } from '../util/format'
import type { ExerciseEntry, SetEntry } from '../db/schema'

const REST_PRESETS = [60, 90, 120, 150, 180]

// Stato del timer tenuto FUORI dai componenti.
//
// Prima viveva nella schermata di allenamento: bastava andare al Riepilogo per
// smontarla, e il recupero moriva li'. Ora sta in un modulo e viene scritto
// anche su sessionStorage, cosi' regge sia il giro al Riepilogo sia un ricarico
// della pagina — i secondi si contano sull'orario reale, non su un componente
// che puo' sparire.
export interface RestState {
  endAt: number; total: number; running: boolean; pausedLeft: number; fired: boolean
  /** su quale esercizio/serie sta correndo: serve per scrivere il recupero sulla serie */
  exId?: string | null; setId?: string | null
}

const restCache = new Map<string, { current: RestState | null }>()
const restKey = (sessionId: string) => `rest-${sessionId}`

function leggiRecupero(sessionId: string): RestState | null {
  try {
    // localStorage e non sessionStorage: il secondo muore quando l'app si
    // chiude, e il recupero in corso spariva insieme a lei.
    const s = localStorage.getItem(restKey(sessionId)) ?? sessionStorage.getItem(restKey(sessionId))
    if (!s) return null
    const st = JSON.parse(s) as RestState
    // Un recupero finito da piu' di dieci minuti e' roba di ieri, non si riapre.
    if (!st.running && st.pausedLeft <= 0) return null
    if (st.running && Date.now() - st.endAt > 10 * 60_000) return null
    return st
  } catch { return null }
}

export function salvaRecupero(sessionId: string, st: RestState | null): void {
  try {
    if (st) localStorage.setItem(restKey(sessionId), JSON.stringify(st))
    else { localStorage.removeItem(restKey(sessionId)); sessionStorage.removeItem(restKey(sessionId)) }
  } catch { /* ignore */ }
}

/** I recuperi delle sedute vecchie: restavano li' per sempre, uno per seduta. */
function pulisciVecchi(sessionId: string): void {
  try {
    const mio = restKey(sessionId)
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('rest-') && k !== mio) localStorage.removeItem(k)
    }
  } catch { /* ignore */ }
}

/** Lo store del recupero di questa seduta: sopravvive allo smontaggio. */
function storeRecupero(sessionId: string): { current: RestState | null } {
  let s = restCache.get(sessionId)
  if (!s) { pulisciVecchi(sessionId); s = { current: leggiRecupero(sessionId) }; restCache.set(sessionId, s) }
  return s
}

// --- Timer recupero: tap su un preset e parte quel recupero ---
function RestTimer({ defaultSec, presets, store, sessionId, onPick, onClose }: {
  defaultSec: number; presets: number[]; store: { current: RestState | null }; sessionId: string
  onPick: (sec: number) => void; onClose: () => void
}) {
  if (!store.current) store.current = { endAt: Date.now() + defaultSec * 1000, total: defaultSec, running: true, pausedLeft: defaultSec, fired: false }
  const st = store.current
  const [total, setTotalState] = useState(st.total)
  const [running, setRunningState] = useState(st.running)
  const [pausedLeft, setPausedLeftState] = useState(st.pausedLeft)
  const [, force] = useState(0)
  // Ogni set scrive anche nello store, così il valore sopravvive al rimontaggio.
  const setTotal = (v: number) => { st.total = v; setTotalState(v); salvaRecupero(sessionId, st) }
  const setRunning = (v: boolean) => { st.running = v; setRunningState(v); salvaRecupero(sessionId, st) }
  const setPausedLeft = (v: number) => { st.pausedLeft = v; setPausedLeftState(v); salvaRecupero(sessionId, st) }

  // Scritto anche a ogni secondo: se la pagina si ricarica di colpo, il
  // recupero riparte da dov'era invece che da zero.
  useEffect(() => { salvaRecupero(sessionId, st) })

  useWallTick(running)
  // Secondi rimasti calcolati sull'orario reale → il recupero non si ferma uscendo dall'app.
  const left = Math.max(0, Math.ceil(running ? (st.endAt - Date.now()) / 1000 : pausedLeft))
  const done = left <= 0
  const warn = left > 0 && left <= 5 // ultimi 5 secondi

  useEffect(() => {
    const visibile = document.visibilityState === 'visible'
    if (left === 0 && !st.fired) {
      st.fired = true
      // Il «Vai!» una volta sola. Se e' scaduto mentre eri fuori dall'app l'ha
      // gia' suonato il servizio: rientrando non si ripete a freddo.
      if (visibile && Date.now() - st.endAt < 2000) goSound()
    }
    if (!visibile) return // fuori dall'app suona il servizio, non la pagina
    if (warn) { navigator.vibrate?.(30); tick() } // tick negli ultimi 5s
  }, [left, warn, st])

  /**
   * Il conto alla rovescia si sente anche fuori dall'app.
   *
   * Uscendo, Android rallenta la pagina a un battito al minuto: i tic e il
   * «Vai!» arrivavano tardi o non arrivavano proprio. Allora quando esci il
   * compito passa al servizio, che ha il suo orologio e suona sul canale della
   * sveglia; quando rientri glielo si toglie, o si sentirebbe doppio.
   */
  useEffect(() => {
    const passaIlTestimone = () => {
      if (document.visibilityState === 'hidden' && running && !st.fired) {
        programmaBip('recupero', [{ ms: st.endAt - Date.now(), tipo: 'via', tick: 5 }])
      } else {
        annullaBip('recupero')
      }
    }
    passaIlTestimone()
    document.addEventListener('visibilitychange', passaIlTestimone)
    return () => { document.removeEventListener('visibilitychange', passaIlTestimone); annullaBip('recupero') }
  }, [running, st.endAt, st])

  function pick(sec: number) { setTotal(sec); st.endAt = Date.now() + sec * 1000; st.fired = false; setPausedLeft(sec); setRunning(true); onPick(sec) }
  function toggle() {
    if (running) { setPausedLeft(Math.max(0, Math.ceil((st.endAt - Date.now()) / 1000))); setRunning(false) }
    else { st.endAt = Date.now() + pausedLeft * 1000; setRunning(true) }
  }
  function adjust(delta: number) {
    if (running) { st.endAt += delta * 1000; st.fired = false; force((x) => x + 1) }
    else setPausedLeft(Math.max(0, pausedLeft + delta))
  }
  function reset() { setRunning(false); setPausedLeft(total); st.fired = false }
  const mm = Math.floor(Math.max(0, left) / 60)
  const ss = Math.max(0, left) % 60

  const ctrl = { flex: 1, padding: '7px 0', fontSize: 13 }
  const pct = Math.max(0, Math.min(100, (left / total) * 100))
  return (
    <div className="card" style={{ borderColor: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--gold-dim)', transition: 'border-color .2s', padding: '9px 12px', margin: 0 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <span className="muted small" style={{ letterSpacing: '.08em' }}>⏱ RECUPERO</span>
        <span className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, lineHeight: 1, whiteSpace: 'nowrap', color: warn ? '#e5484d' : done ? 'var(--good)' : 'var(--gold)' }}>
            {done ? 'Vai! 💪' : `${mm}:${ss.toString().padStart(2, '0')}`}
          </span>
          <button className="ghost small" onClick={onClose}>✕</button>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', margin: '8px 0' }}>
        <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: warn ? '#e5484d' : 'var(--gold)', transition: 'width 1s linear, background .2s' }} />
      </div>
      <div className="row" style={{ gap: 4, alignItems: 'center' }}>
        <button style={ctrl} onClick={() => adjust(-15)}>−15</button>
        <button style={ctrl} onClick={() => adjust(15)}>+15</button>
        <button style={ctrl} onClick={toggle}>{running ? '⏸' : '▶'}</button>
        <button style={ctrl} onClick={reset}>↺</button>
        <select value={total} onChange={(e) => pick(Number(e.target.value))} style={{ flex: 1, padding: '6px 2px', fontSize: 13 }}>
          {presets.map((s) => <option key={s} value={s}>{fmtRest(s)}</option>)}
        </select>
      </div>
    </div>
  )
}

// --- Cronometro seduta ---
// pausedSec = tempo in cui la seduta è rimasta chiusa (riaperta dopo): non va contato.
function WorkoutClock({ startedAt, pausedSec = 0 }: { startedAt: string; pausedSec?: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000) - pausedSec)
  const mm = Math.floor(sec / 60), ss = sec % 60
  // Oltre l'ora "130:54" è largo e poco leggibile: diventa "2h10".
  const label = mm >= 60 ? `${Math.floor(mm / 60)}h${(mm % 60).toString().padStart(2, '0')}` : `${mm}:${ss.toString().padStart(2, '0')}`
  return <span className="muted small" style={{ flex: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>⏱ {label}</span>
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

  // Solo il microfono: la scritta occupava una riga intera per una cosa che si
  // capisce dall'icona. Lo spazio liberato resta libero per i tasti nuovi.
  return (
    <>
      <button className={listening ? 'sel' : 'ghost'} style={{ flex: '0 0 auto', padding: '10px 12px' }}
        onClick={toggle} aria-label={listening ? 'Sto ascoltando, tocca per fermare' : 'Detta la serie'}>
        {listening ? '●' : '🎤'}
      </button>
      {/* Quello che ha capito va detto: e' l'unico modo per accorgerti che ha
          sentito 30 invece di 13. Va a capo da sola, non stringe i tasti. */}
      {(heard || listening) && (
        <p className="muted small" style={{ flexBasis: '100%', margin: '2px 0 0' }}>
          {heard ? `Sentito: “${heard}”` : 'Es: «100 per 8 RIR 2»'}
          <Info text="Dillo così: «100 per 8» oppure «102,5 per 6 RIR 2». Aggiungi «riscaldamento» per marcarla. La voce riempie i campi: controlli e premi Registra serie." />
        </p>
      )}
    </>
  )
}

// Card numerica grande: input scrivibile a mano + tasti − / ＋.
// `hint` chiarisce cosa vuol dire lasciare il campo vuoto (es. RIR vuoto = 0 = a esaurimento).
function StepCard({ label, value, onSet, onStep, placeholder = '—', info }: {
  label: string; value: string; onSet: (v: string) => void; onStep: (dir: number) => void
  placeholder?: string; info?: string
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, padding: '6px 6px 8px', textAlign: 'center' }}>
      <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onSet(e.target.value)}
        style={{ width: '100%', fontSize: 22, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '4px 0' }} />
      {/* La spiegazione sta in un tooltip inline: aggiungere una riga alzerebbe solo questa card. */}
      <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{label}{info && <Info text={info} />}</div>
      <div className="row" style={{ gap: 4, marginTop: 5 }}>
        <button style={{ flex: 1, padding: '5px 0' }} onClick={() => onStep(-1)}>−</button>
        <button style={{ flex: 1, padding: '5px 0' }} onClick={() => onStep(1)}>＋</button>
      </div>
    </div>
  )
}

const SROW = { display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 22px', gap: 6, alignItems: 'center', padding: '7px 2px', borderTop: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' } as const

// --- Back off -----------------------------------------------------------------
//
// Scarichi del 20% e continui. Il conto e' banale, ma farlo a mente fra una
// serie e l'altra e' il momento in cui ti sbagli.

const BACK_OFF = 0.8

/** Il -20%, arrotondato a mezzo chilo: 87,5 diventa 70, non 70,000001. */
const scarico = (kg: number) => Math.round(kg * BACK_OFF * 2) / 2

/**
 * Da che carico si scala.
 *
 * L'ultima serie di LAVORO di oggi: il riscaldamento non e' il riferimento di
 * niente. Se oggi non hai ancora registrato nulla vale l'ultima volta che hai
 * fatto questo esercizio, e in mancanza anche di quella il numero che hai nel
 * campo — cosi' il tasto funziona sempre, ma non inventa mai un carico.
 */
function baseScarico(sets: SetEntry[], ultima: SetEntry | null, campo: string): number | null {
  const lavoro = [...sets].reverse().find((s) => !s.isWarmup)
  if (lavoro) return lavoro.weight
  if (ultima) return ultima.weight
  const n = parseNum(campo, { min: 0 })
  return n && n > 0 ? n : null
}

/** Il tasto: dice sempre da quale carico sta scalando, cosi' non devi fidarti. */
function TastoScarico({ base, onSet }: { base: number | null; onSet: (kg: string) => void }) {
  if (base == null) return null
  return (
    <button className="ghost" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
      onClick={() => onSet(String(scarico(base)))}
      aria-label={`Back off: -20% da ${base} kg`}>
      −20% <span className="muted" style={{ fontSize: 10 }}>da {base}</span>
    </button>
  )
}

/** Data breve "22 lug" — nello storico la colonna deve restare stretta e su una riga. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${Number(d)} ${mesi[Number(m) - 1] ?? ''}`
}

/** Storico esercizio dentro il workout: andamento e1RM + sedute precedenti incolonnate. */
function HistoryPanel({ history }: { history: { date: string; sets: SetEntry[] }[] }) {
  if (history.length === 0) return <p className="muted small">Nessuna seduta precedente.</p>

  // history arriva dalla più recente: per il grafico serve l'ordine cronologico.
  const chrono = [...history].reverse().map((h) => ({ date: h.date, v: bestE1rm(h.sets) })).filter((p) => p.v > 0)
  const first = chrono[0]?.v ?? 0
  const last = chrono[chrono.length - 1]?.v ?? 0
  const trend = first > 0 ? ((last - first) / first) * 100 : 0
  const trendColor = trend > 1 ? 'var(--good)' : trend < -1 ? '#e57373' : 'var(--muted)'

  const W = 300, H = 46, PAD = 6
  const vals = chrono.map((p) => p.v)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || 1
  const pt = (i: number, v: number) => {
    const x = chrono.length === 1 ? W / 2 : PAD + (i / (chrono.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - lo) / span) * (H - PAD * 2)
    return [x, y] as const
  }

  return (
    <div className="card" style={{ padding: '10px 12px', margin: 0 }}>
      {chrono.length >= 2 && (
        <>
          <div className="row spread" style={{ alignItems: 'baseline' }}>
            <span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>Andamento e1RM</span>
            <span style={{ fontSize: 11, color: trendColor }}>{trend > 0 ? '+' : ''}{trend.toFixed(1)}%</span>
          </div>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 4, display: 'block' }}>
            <polyline fill="none" stroke="var(--gold)" strokeWidth="2"
              points={chrono.map((p, i) => pt(i, p.v).join(',')).join(' ')} />
            {chrono.map((p, i) => {
              const [x, y] = pt(i, p.v)
              const isLast = i === chrono.length - 1
              return <circle key={i} cx={x} cy={y} r={isLast ? 3.5 : 2.5} fill={isLast ? '#e9cf72' : 'var(--gold)'} />
            })}
          </svg>
        </>
      )}

      <div style={{ borderTop: chrono.length >= 2 ? '1px solid var(--line)' : 'none', marginTop: chrono.length >= 2 ? 6 : 0, paddingTop: 6 }}>
        {history.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < history.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <span className="muted" style={{ fontSize: 11, flex: '0 0 44px', fontVariantNumeric: 'tabular-nums' }}>{shortDate(h.date)}</span>
            <span style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
              {h.sets.map((s) => (
                <span key={s.id} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--surface-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.weight}×{s.reps}
                </span>
              ))}
            </span>
            <span style={{ fontSize: 11, flex: 'none', color: i === 0 ? 'var(--gold)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(bestE1rm(h.sets))}
            </span>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 10, textAlign: 'right', marginTop: 6 }}>ultima colonna = e1RM</div>
      </div>
    </div>
  )
}

// Riga della tabella set. Tap = editor completo (kg/reps/RIR/recupero). Mostra RIR e recupero salvati.
function SetRowT({ s, index, prev, isPR }: { s: SetEntry; index: number; prev: string; isPR: boolean }) {
  const [ed, setEd] = useState(false)
  const [w, setW] = useState(String(s.weight))
  const [r, setR] = useState(String(s.reps))
  const [rir, setRir] = useState<number | null>(s.rir ?? null)
  const [rest, setRest] = useState(s.restSec != null ? String(s.restSec) : '')
  if (ed) return (
    <div className="card" style={{ background: 'var(--surface-2)', margin: '4px 0', padding: '8px 10px' }}>
      <div className="row" style={{ gap: 6 }}>
        <div style={{ flex: 1 }}><label className="fl">kg</label><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ width: '100%', textAlign: 'center' }} /></div>
        <div style={{ flex: 1 }}><label className="fl">reps</label><input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ width: '100%', textAlign: 'center' }} /></div>
      </div>
      <div style={{ marginTop: 6 }}>
        <label className="fl">RIR</label>
        <div className="opts" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <button className={rir === null ? 'sel' : ''} onClick={() => setRir(null)}>—</button>
          {[0, 1, 2, 3, 4].map((v) => <button key={v} className={rir === v ? 'sel' : ''} onClick={() => setRir(v)}>{v}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <label className="fl">Recupero (s) — correggi se il timer ha sbagliato</label>
        <div className="row" style={{ gap: 4 }}>
          <button style={{ padding: '8px 12px' }} onClick={() => setRest(String(Math.max(0, (parseNum(rest, { int: true }) ?? 0) - 15)))}>−15</button>
          <input inputMode="numeric" value={rest} placeholder="—" onChange={(e) => setRest(e.target.value)} style={{ flex: 1, minWidth: 0, textAlign: 'center' }} />
          <button style={{ padding: '8px 12px' }} onClick={() => setRest(String((parseNum(rest, { int: true }) ?? 0) + 15))}>＋15</button>
        </div>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="ghost" style={{ flex: 1 }} onClick={() => { if (confirm('Eliminare la serie?')) deleteWithUndo('Serie eliminata', () => deleteSet(s.id)) }}>🗑</button>
        <button className="ghost" style={{ flex: 1 }} onClick={() => setEd(false)}>Annulla</button>
        <button className="primary" style={{ flex: 2 }} onClick={async () => {
          const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true })
          if (wn == null || rn == null) return
          const restN = rest.trim() === '' ? undefined : (parseNum(rest, { min: 0, max: 3600, int: true }) ?? undefined)
          await updateSet(s.id, { weight: wn, reps: rn, rir: rir ?? undefined, restSec: restN }); setEd(false)
        }}>Salva</button>
      </div>
    </div>
  )
  return (
    <div style={SROW} onClick={() => setEd(true)}>
      <span className="muted small">{s.isWarmup ? 'W' : index}</span>
      <span className="muted small">{prev}</span>
      <span className="strong">{s.weight}</span>
      <span className="strong">{s.reps}{isPR && <span style={{ color: 'var(--gold)' }}> PR</span>}
        <span className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{s.rir != null ? ` R${s.rir}` : ''}{s.restSec != null && !s.isWarmup ? ` ⏱${fmtRest(s.restSec)}` : ''}</span>
      </span>
      <span style={{ textAlign: 'center', color: 'var(--good)' }}>✓</span>
    </div>
  )
}

/** I tasti secondari: stretti quanto basta a starci tutti in fila. */
const MINI: React.CSSProperties = { padding: '6px 10px', flex: 'none' }

/**
 * Lo storico dell'esercizio: lo stato sta qui, il tasto lo disegna chi lo usa.
 *
 * Sta fuori dalla fila dei tasti perche' li' erano nove icone e sul telefono
 * uscivano dallo schermo: questo va accanto al PR, in alto, dove c'e' posto.
 */
function useStorico(exerciseId: string, sessionId: string) {
  const [aperto, setAperto] = useState(false)
  const [righe, setRighe] = useState<{ date: string; sets: SetEntry[] }[]>([])
  useEffect(() => {
    if (aperto && righe.length === 0) exerciseHistory(exerciseId, sessionId).then(setRighe)
  }, [aperto]) // eslint-disable-line react-hooks/exhaustive-deps
  return { aperto, cambia: () => setAperto((v) => !v), righe }
}

/**
 * Gli strumenti di un esercizio: storico, regolazioni, scheda del coach,
 * inclinazione, dischi, spostamenti, elimina.
 *
 * Stanno qui e non dentro la scheda dell'esercizio singolo perche' servono
 * uguali dentro un superset: li' un esercizio resta un esercizio, e prima
 * perdeva tutto — storico, foto della macchina, prescrizione, tutto.
 */
function StrumentiEsercizio({ entry, name, settings, inclinazione, foto, peso, isFirst, isLast, nelGruppo, onGroup, onUngroup }: {
  entry: ExerciseEntry; name: string; settings: string
  inclinazione?: number; foto?: string
  /** il carico scritto adesso: serve al calcolo dei dischi */
  peso: number
  isFirst: boolean; isLast: boolean
  /** dentro un superset i tasti su/giu' spostano nel giro, non nella seduta */
  nelGruppo?: boolean
  onGroup?: () => void
  /** stacca questo esercizio dal superset */
  onUngroup?: () => void
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [showCoach, setShowCoach] = useState(false)
  const [inclina, setInclina] = useState(false)
  const [dischi, setDischi] = useState(false)
  const [fotoGrande, setFotoGrande] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)
  // Le note stanno in un campo solo, ma sono di due mani diverse: quelle del
  // coach cominciano col 🦠 e le scrive l'import, le altre le scrivi tu.
  const righe = (settings ?? '').split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean)
  const righeCoach = righe.filter((x) => x.startsWith('🦠'))
  const mieNote = righe.filter((x) => !x.startsWith('🦠')).join(String.fromCharCode(10))


  return (
    <>
      {/* Controlli secondari: una riga sola. A capo occupavano due righe di
          schermo per sei icone; qui restano in fila e, se proprio non ci stanno,
          scorrono di lato. */}
      <div className="row" style={{ gap: 5, justifyContent: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
        {/* Due taccuini diversi: quello che ha prescritto lui e quello che hai
            capito tu della macchina. In un campo solo, per rileggere l'altezza
            del sellino toccava scorrere mezza scheda del coach. */}
        <button className={showSettings ? 'chip on' : 'chip'} style={MINI} onClick={() => { setShowSettings((v) => !v); setShowCoach(false) }}
          aria-label="Le tue regolazioni">⚙</button>
        {righeCoach.length > 0 && (
          <button className={showCoach ? 'chip on' : 'chip'} style={MINI} onClick={() => { setShowCoach((v) => !v); setShowSettings(false) }}
            aria-label="La scheda del coach">🦠</button>
        )}
        {/* L'inclinazione dello schienale: «panca a 80°» regolata a occhio non e'
            lo stesso esercizio della settimana prima. */}
        <button className={inclinazione != null ? 'chip on' : 'chip'} style={MINI} onClick={() => setInclina(true)}
          aria-label="Misura l'inclinazione">📐{inclinazione != null ? ` ${inclinazione}°` : ''}</button>
        {/* I dischi da caricare: 82,5 kg col bilanciere da 20 sono 31,25 per
            lato, e farlo a mente fra due serie e' come si sbaglia carico. */}
        <button className="chip" style={MINI} onClick={() => setDischi(true)} aria-label="Che dischi caricare">⚖</button>
        {onGroup && <button className="chip" style={MINI} onClick={onGroup} aria-label="Abbina in superset">🔗</button>}
        {/* Dentro un giro «stacca» toglie questo esercizio dal superset; le
            frecce spostano dentro il giro (A↔B), non dentro la seduta. */}
        {onUngroup && <button className="chip" style={MINI} onClick={onUngroup} aria-label="Stacca dal superset">✂</button>}
        <button className="chip" style={MINI} disabled={isFirst}
          onClick={() => (nelGruppo ? moveInGroup(entry.id, -1) : moveExerciseEntry(entry.id, -1))} aria-label="Sposta su">↑</button>
        <button className="chip" style={MINI} disabled={isLast}
          onClick={() => (nelGruppo ? moveInGroup(entry.id, 1) : moveExerciseEntry(entry.id, 1))} aria-label="Sposta giù">↓</button>
        <button className="chip" style={MINI} aria-label="Rimuovi esercizio" onClick={() => { if (confirm(`Rimuovere ${name}?`)) deleteWithUndo(`${name} rimosso dalla seduta`, () => deleteExerciseEntry(entry.id)) }}>🗑</button>
      </div>
      {/* Chiuse, si vedono lo stesso: sono due righe, e servono mentre carichi. */}
      {!showSettings && (mieNote || foto) && (
        <div className="row" style={{ gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          {foto && (
            <img src={foto} alt="" onClick={() => setFotoGrande(true)}
              style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 7, display: 'block', flex: 'none', cursor: 'pointer' }} />
          )}
          {mieNote && <span className="muted small">⚙ {mieNote}</span>}
        </div>
      )}
      {!showCoach && righeCoach.length > 0 && (
        <div className="muted small" style={{ textAlign: 'center' }}>{righeCoach.join(' · ')}</div>
      )}
      {showSettings && (
        <textarea defaultValue={mieNote} rows={2} placeholder="Regolazioni macchina: sellino, poggiapetto…" style={{ width: '100%' }}
          // Si riscrivono solo le tue righe: quelle del coach si rimettono
          // com'erano, altrimenti scrivere «sellino 4» cancellerebbe la scheda.
          onBlur={(e) => setExerciseSettings(entry.exerciseId, [e.target.value.trim(), ...righeCoach].filter(Boolean).join('\n'))} />
      )}

      {/* La foto sta con le TUE regolazioni: «piede a metà pedana, punta in
          fuori» in una foto si vede, scritto la settimana dopo vuol dire
          un'altra cosa. */}
      {showSettings && (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {foto && (
            <img src={foto} alt="Come si sta sulla macchina" onClick={() => setFotoGrande(true)}
              style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, display: 'block', cursor: 'pointer' }} />
          )}
          <button className="chip" onClick={() => fotoRef.current?.click()}>{foto ? 'Cambia foto' : '＋ Foto'}</button>
          {foto && (
            <button className="chip" style={{ color: '#e57373' }}
              onClick={() => setExerciseFoto(entry.exerciseId, undefined)}>Togli</button>
          )}
          <input ref={fotoRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try { await setExerciseFoto(entry.exerciseId, await fotoRidotta(f, 1100)) } catch { alert('Foto non leggibile.') }
          }} />
        </div>
      )}

      {fotoGrande && foto && createPortal(
        <div onClick={() => setFotoGrande(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={foto} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>,
        document.body,
      )}
      {showCoach && (
        <div className="card" style={{ padding: '10px 12px', borderColor: 'var(--rs)' }}>
          {righeCoach.map((r, i) => <p key={i} className="small" style={{ margin: i ? '6px 0 0' : 0 }}>{r}</p>)}
          <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>Scritte dal protocollo: si aggiornano da sole, non si modificano qui.</p>
        </div>
      )}
      {dischi && <Dischi peso={peso} onClose={() => setDischi(false)} />}
      {inclina && (
        <Inclinometro valore={inclinazione}
          onSalva={(g) => setExerciseInclinazione(entry.exerciseId, g)}
          onClose={() => setInclina(false)} />
      )}
    </>
  )
}

function EntryCard({ entry, name, settings, inclinazione, foto, sessionId, restSec, pos, total, restNode, isFirst, isLast, onLogged, onPrev, onNext, onGroup }: {
  entry: ExerciseEntry; name: string; settings: string; inclinazione?: number; foto?: string; sessionId: string; restSec: number
  pos: number; total: number; restNode: React.ReactNode; isFirst: boolean; isLast: boolean
  onLogged: (sec: number, exerciseId: string, setId?: string) => void; onPrev?: () => void; onNext?: () => void
  onGroup?: () => void
}) {
  const sets = useLiveQuery(() => setsOf(entry.id), [entry.id]) ?? []
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [rir, setRir] = useState<number | null>(null)
  const [warmup, setWarmup] = useState(false)
  const [hint, setHint] = useState<SetEntry | null>(null)
  const [histBest, setHistBest] = useState(0)
  const [prevSets, setPrevSets] = useState<SetEntry[]>([])
  // Finche' lo storico non e' arrivato non si precompila niente: riempire coi
  // dati sbagliati e poi non correggerli piu' e' peggio che aspettare un istante.
  const [prevPronti, setPrevPronti] = useState(false)
  const prefilled = useRef(false)
  const storico = useStorico(entry.exerciseId, sessionId)

  useEffect(() => { lastWorkingSet(entry.exerciseId, sessionId).then(setHint) }, [entry.exerciseId, sessionId])
  useEffect(() => { historicalBestE1rm(entry.exerciseId, sessionId).then(setHistBest) }, [entry.exerciseId, sessionId])
  useEffect(() => { exerciseHistory(entry.exerciseId, sessionId, 1).then((h) => { setPrevSets(h[0]?.sets ?? []); setPrevPronti(true) }) }, [entry.exerciseId, sessionId])
  /*
   * Il riferimento della serie che stai per fare e' la serie di PARI NUMERO
   * della volta scorsa: la prima con la prima, la seconda con la seconda.
   *
   * Prima si copiava l'ultima serie in assoluto, che e' quasi sempre la piu'
   * scarica della giornata: aprivi l'esercizio e la prima serie partiva dal peso
   * con cui l'avevi chiuso. Se la scorsa volta ne avevi fatte meno, vale
   * l'ultima che c'era.
   */
  const fatte = sets.filter((s) => !s.isWarmup).length
  const daFare = prevSets[fatte] ?? prevSets[prevSets.length - 1] ?? hint

  useEffect(() => {
    if (prefilled.current || !prevPronti) return
    if (daFare) { setW(String(daFare.weight)); setR(String(daFare.reps)); prefilled.current = true }
  }, [daFare, prevPronti])

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
    // Il recupero salvato sulla serie = il timer scelto per questo esercizio (non il tempo misurato).
    // Se durante il recupero cambi preset, il parent aggiorna questa serie via l'id qui sotto.
    // RIR lasciato vuoto su una serie di lavoro = 0 (a esaurimento); sul riscaldamento resta assente.
    const rirToSave = warmup ? (rir ?? undefined) : (rir ?? 0)
    const id = await addSet(entry.id, { weight: wn, reps: rn, rir: rirToSave, isWarmup: warmup, restSec: warmup ? undefined : restSec })
    setRir(null); setWarmup(false)
    if (!warmup) onLogged(restSec, entry.exerciseId, id)
  }

  let wIdx = 0
  return (
    <div className="col" style={{ gap: 10 }}>
      {/* Header centrato con ‹ prev / next › ai lati del titolo (sempre visibili) */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button className="ghost" style={{ padding: '10px 12px', visibility: onPrev ? 'visible' : 'hidden' }} onClick={onPrev} aria-label="Esercizio precedente">‹</button>
        <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
          <div className="muted small" style={{ letterSpacing: '.12em' }}>ESERCIZIO {pos} / {total}</div>
          <h2 style={{ margin: '2px 0' }}>{name}</h2>
          <div className="row" style={{ gap: 6, justifyContent: 'center', marginTop: 4 }}>
            <span className="chip" style={{ padding: '3px 10px', color: 'var(--text)' }}>
              {/* Non «l'ultima serie» ma quella che stai per rifare: la stessa
                  serie della volta scorsa. */}
              {daFare ? `${fatte + 1}ª volta scorsa ${daFare.weight}×${daFare.reps}` : 'Prima volta'}
            </span>
            {histBest > 0 && <span className="chip on" style={{ padding: '3px 10px' }}>PR {Math.round(histBest)}</span>}
            {/* Lo storico sta qui e non in fila coi tasti: li' erano nove icone
                e sul telefono uscivano dallo schermo. */}
            <button className={storico.aperto ? 'chip on' : 'chip'} aria-label="Storico"
              style={{ padding: '3px 10px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
              onClick={storico.cambia}>📊</button>
          </div>
        </div>
        <button className="ghost" style={{ padding: '10px 12px', visibility: onNext ? 'visible' : 'hidden' }} onClick={onNext} aria-label="Esercizio successivo">›</button>
      </div>

      {/* Gli strumenti dell'esercizio: stanno in un componente solo, perche
          servono uguali dentro un superset. */}
      <StrumentiEsercizio entry={entry} name={name} settings={settings}
        inclinazione={inclinazione} foto={foto}
        peso={parseNum(w, { min: 0, max: 1000 }) ?? 0}
        isFirst={isFirst} isLast={isLast} onGroup={onGroup} />
      {storico.aperto && <HistoryPanel history={storico.righe} />}

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
          {/* La riga che stai per registrare: il precedente e' la serie di pari
              numero della volta scorsa, come nelle righe gia' fatte sopra. */}
          <span className="muted small">{daFare ? `${daFare.weight}×${daFare.reps}` : '—'}</span>
          <span className="strong">{w === '' ? '—' : w}</span>
          <span className="strong">{r === '' ? '—' : r}</span>
          <span style={{ textAlign: 'center' }}>○</span>
        </div>
      </div>

      {/* Card numeriche grandi: scrivibili + tasti */}
      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
        <StepCard label="kg" value={w} onSet={setW} onStep={stepKg} />
        <StepCard label="reps" value={r} onSet={setR} onStep={stepRep} />
        <StepCard label="RIR" value={rir == null ? '' : String(rir)} onStep={stepRir}
          placeholder="0" info="RIR = ripetizioni che ti restavano nel serbatoio. Se lo lasci vuoto vale 0, cioè serie portata a esaurimento."
          onSet={(v) => { const n = parseNum(v, { min: 0, max: 10, int: true }); setRir(v.trim() === '' ? null : (n ?? rir)) }} />
      </div>

      {/* Barra recupero (sotto le card, come nel mockup) */}
      {restNode}

      {/* Riscaldamento · back off · voce. Tasti piccoli in fila: il resto della
          riga resta libero per quello che verra' dopo. */}
      <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={warmup ? 'sel' : 'ghost'} style={{ flex: '0 0 auto' }} onClick={() => setWarmup((v) => !v)}>Risc.</button>
        <TastoScarico base={baseScarico(sets, daFare, w)} onSet={setW} />
        <VoiceButton onFill={fillFromVoice} />
      </div>

      {/* Registra serie */}
      <button className="primary" style={{ width: '100%', padding: '15px', fontSize: 15 }} disabled={!canAdd} onClick={add}>✓ Registra serie</button>
    </div>
  )
}

type Block =
  | { kind: 'single'; entry: ExerciseEntry }
  | { kind: 'group'; id: string; entries: ExerciseEntry[] }

/** Scelta degli esercizi da abbinare: 1 o 2 in più, per superset o triset. */
function GroupPicker({ fromEntryId, entries, nameOf, onClose }: {
  sessionId: string; fromEntryId: string; entries: ExerciseEntry[]
  nameOf: (id: string) => string; onClose: () => void
}) {
  useIndietro(onClose)
  const [sel, setSel] = useState<string[]>([])
  const others = entries.filter((e) => e.id !== fromEntryId && !e.groupId)
  const from = entries.find((e) => e.id === fromEntryId)

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', margin: '0 8px' }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 8 }}>
          <strong>Abbina a {from ? nameOf(from.exerciseId) : ''}</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Scegline uno (superset) o due (triset): si eseguono di fila, il recupero parte a fine giro.
        </p>

        {others.length === 0 && <p className="muted small">Nessun altro esercizio libero in questa seduta.</p>}
        {others.map((e) => {
          const on = sel.includes(e.id)
          return (
            <div key={e.id} onClick={() => setSel((s) => on ? s.filter((x) => x !== e.id) : s.length >= 2 ? s : [...s, e.id])}
              className="row spread"
              style={{ alignItems: 'center', padding: '10px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
              <span>{nameOf(e.exerciseId)}</span>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: '1px solid var(--line)', background: on ? 'var(--gold)' : 'transparent', color: '#1a1400', display: 'grid', placeItems: 'center', fontSize: 13 }}>{on ? '✓' : ''}</span>
            </div>
          )
        })}

        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Annulla</button>
          <button className="primary" style={{ flex: 2 }} disabled={sel.length === 0}
            onClick={async () => { await groupEntries([fromEntryId, ...sel]); onClose() }}>
            {sel.length === 2 ? 'Crea triset' : 'Crea superset'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const GROUP_LABEL = ['A', 'B', 'C']

/**
 * Un esercizio dentro un superset. Le serie già fatte stanno nella STESSA tabella
 * dell'esercizio singolo: si toccano per correggere kg/reps/RIR/recupero o eliminarle.
 */
function GroupExercise({ entry, name, settings, inclinazione, foto, values, onChange, isFirst, isLast, onUngroup }: {
  entry: ExerciseEntry; name: string
  settings: string; inclinazione?: number; foto?: string
  values: { w: string; r: string; rir: number | null }
  onChange: (v: { w: string; r: string; rir: number | null }) => void
  isFirst: boolean; isLast: boolean
  onUngroup: () => void
}) {
  const label = GROUP_LABEL[entry.groupOrder ?? 0] ?? '?'
  // Reattivo: correggendo o eliminando una serie la tabella si aggiorna da sola.
  const sets = useLiveQuery(() => setsOf(entry.id), [entry.id]) ?? []
  const [prevSets, setPrevSets] = useState<SetEntry[]>([])
  const [histBest, setHistBest] = useState(0)
  const storico = useStorico(entry.exerciseId, entry.sessionId)

  useEffect(() => { exerciseHistory(entry.exerciseId, entry.sessionId, 1).then((h) => setPrevSets(h[0]?.sets ?? [])) }, [entry.exerciseId, entry.sessionId])
  useEffect(() => { historicalBestE1rm(entry.exerciseId, entry.sessionId).then(setHistBest) }, [entry.exerciseId, entry.sessionId])

  // Il riferimento della serie che stai per fare: la serie di PARI NUMERO della
  // volta scorsa. Se la scorsa volta ne avevi fatte meno, vale l'ultima che c'era.
  const fatte = sets.filter((s) => !s.isWarmup).length
  const prev = prevSets[fatte] ?? prevSets[prevSets.length - 1] ?? null

  let wIdx = 0
  return (
    <div className="card" style={{ margin: 0, padding: '10px 12px' }}>
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--gold)', fontWeight: 700, marginRight: 6 }}>{label}</span>{name}
        </span>
        <span className="row" style={{ gap: 6, alignItems: 'center', flex: 'none', marginLeft: 8 }}>
          <span className="muted small">
            {prev ? `${fatte + 1}ª volta scorsa ${prev.weight}×${prev.reps}` : 'prima volta'}
          </span>
          <button className={storico.aperto ? 'chip on' : 'chip'} aria-label="Storico"
            style={{ padding: '2px 8px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
            onClick={storico.cambia}>📊</button>
        </span>
      </div>
      {storico.aperto && <HistoryPanel history={storico.righe} />}

      {/* Gli stessi strumenti dell'esercizio singolo: dentro un giro un
          esercizio resta un esercizio. */}
      <div style={{ marginTop: 6 }}>
        <StrumentiEsercizio entry={entry} name={name} settings={settings}
          inclinazione={inclinazione} foto={foto}
          peso={parseNum(values.w, { min: 0, max: 1000 }) ?? 0}
          isFirst={isFirst} isLast={isLast} nelGruppo onUngroup={onUngroup} />
      </div>

      {sets.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ ...SROW, borderTop: 'none', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>Set</span><span>Prec.</span><span>Kg</span><span>Reps</span><span />
          </div>
          {sets.map((s) => {
            if (!s.isWarmup) wIdx++
            const idx = s.isWarmup ? 0 : wIdx
            const p = s.isWarmup ? '—' : (prevSets[idx - 1] ? `${prevSets[idx - 1].weight}×${prevSets[idx - 1].reps}` : '—')
            return <SetRowT key={s.id} s={s} index={idx} prev={p} isPR={!s.isWarmup && histBest > 0 && e1rm(s.weight, s.reps) > histBest} />
          })}
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          {/* Nel superset lo spazio e' quello che e': il tasto sta appeso
              all'etichetta del kg, non aggiunge una riga al giro. */}
          <div className="row spread" style={{ alignItems: 'baseline', gap: 4 }}>
            <label className="fl" style={{ margin: 0 }}>kg</label>
            <TastoScarico base={baseScarico(sets, prev, values.w)} onSet={(kg) => onChange({ ...values, w: kg })} />
          </div>
          <input inputMode="decimal" value={values.w} onChange={(e) => onChange({ ...values, w: e.target.value })}
            style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '8px 4px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl">reps</label>
          <input inputMode="numeric" value={values.r} onChange={(e) => onChange({ ...values, r: e.target.value })}
            style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '8px 4px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl">RIR</label>
          <input inputMode="numeric" value={values.rir == null ? '' : String(values.rir)} placeholder="0"
            onChange={(e) => {
              const n = parseNum(e.target.value, { min: 0, max: 10, int: true })
              onChange({ ...values, rir: e.target.value.trim() === '' ? null : (n ?? values.rir) })
            }}
            style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '8px 4px' }} />
        </div>
      </div>
    </div>
  )
}

/**
 * Blocco superset/triset: compili tutti gli esercizi e chiudi il giro con un tocco.
 * Il recupero parte solo a fine giro — è il senso stesso del superset.
 */
function GroupCard({ entries, nameOf, datiOf, restSec, pos, total, restNode, onLogged, onPrev, onNext, onUngroup, onStacca }: {
  entries: ExerciseEntry[]
  nameOf: (id: string) => string
  /** regolazioni, inclinazione e foto dell'esercizio: servono ai suoi strumenti */
  datiOf: (id: string) => { settings: string; inclinazione?: number; foto?: string }
  restSec: number
  pos: number; total: number
  restNode: React.ReactNode
  onLogged: (sec: number, exerciseId: string) => void
  onPrev?: () => void; onNext?: () => void
  onUngroup: () => void
  /** stacca UN esercizio dal giro, lasciando in piedi gli altri */
  onStacca: (entryId: string) => void
}) {
  const sorted = [...entries].sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
  const [vals, setVals] = useState<Record<string, { w: string; r: string; rir: number | null }>>({})
  const [prevByEntry, setPrevByEntry] = useState<Record<string, SetEntry[]>>({})
  const ids = sorted.map((e) => e.id).join(',')
  // Serie di tutti gli esercizi del gruppo, reattive: giri e precompilazione restano allineati.
  const setsByEntry = useLiveQuery(async () => {
    const m: Record<string, SetEntry[]> = {}
    for (const e of sorted) m[e.id] = await setsOf(e.id)
    return m
  }, [ids]) ?? {}

  // Le serie della volta scorsa, per ogni esercizio del gruppo: servono INTERE,
  // perche' il riferimento e' la serie di pari numero, non l'ultima.
  useEffect(() => {
    let alive = true
    Promise.all(sorted.map(async (e) => ({ id: e.id, sets: (await exerciseHistory(e.exerciseId, e.sessionId, 1))[0]?.sets ?? [] })))
      .then((rows) => {
        if (!alive) return
        const p: Record<string, SetEntry[]> = {}
        for (const r of rows) p[r.id] = r.sets
        setPrevByEntry(p)
      })
    return () => { alive = false }
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Precompilazione: la serie di PARI NUMERO della volta scorsa.
   *
   * Prima si copiava l'ultima serie fatta — oggi o la volta scorsa — e cosi' la
   * prima serie partiva dal peso dell'ultima, che e' quasi sempre il piu' basso
   * della giornata. Se la scorsa volta ne avevi fatte meno, vale l'ultima che c'era.
   */
  useEffect(() => {
    setVals((old) => {
      const next = { ...old }
      for (const e of sorted) {
        if (next[e.id]) continue
        const fatte = (setsByEntry[e.id] ?? []).filter((s) => !s.isWarmup).length
        const scorsa = prevByEntry[e.id] ?? []
        const src = scorsa[fatte] ?? scorsa[scorsa.length - 1]
        if (!src) continue
        next[e.id] = { w: String(src.weight), r: String(src.reps), rir: null }
      }
      return next
    })
  }, [ids, setsByEntry, prevByEntry]) // eslint-disable-line react-hooks/exhaustive-deps

  const rounds = Math.min(...sorted.map((e) => (setsByEntry[e.id] ?? []).filter((s) => !s.isWarmup).length))
  const ready = sorted.every((e) => {
    const v = vals[e.id]
    return v && parseNum(v.w, { min: 0 }) != null && parseNum(v.r, { min: 1, int: true }) != null
  })

  /** Chiude il giro: una serie per ogni esercizio del gruppo, poi parte il recupero. */
  async function closeRound() {
    for (const [i, e] of sorted.entries()) {
      const v = vals[e.id]
      const wn = parseNum(v.w, { min: 0 }), rn = parseNum(v.r, { min: 1, int: true })
      if (wn == null || rn == null) continue
      // Il recupero sta solo sull'ULTIMO esercizio del giro: fra A e B non ti
      // fermi — e' il senso del superset. Scriverlo su tutti metteva nel report
      // un recupero che non hai mai fatto.
      const ultimo = i === sorted.length - 1
      await addSet(e.id, { weight: wn, reps: rn, rir: v.rir ?? 0, restSec: ultimo ? restSec : 0 })
    }
    setVals((old) => {
      const next = { ...old }
      for (const e of sorted) next[e.id] = { ...next[e.id], rir: null }
      return next
    })
    onLogged(restSec, sorted[0].exerciseId)
  }

  const kind = sorted.length === 3 ? 'TRISET' : 'SUPERSET'

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button className="ghost" style={{ padding: '10px 12px', visibility: onPrev ? 'visible' : 'hidden' }} onClick={onPrev} aria-label="Blocco precedente">‹</button>
        <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
          <div className="muted small" style={{ letterSpacing: '.12em' }}>{kind} {pos} / {total}</div>
          <h2 style={{ margin: '2px 0', fontSize: 18 }}>
            {sorted.map((e) => nameOf(e.exerciseId)).join(' + ')}
          </h2>
          <div className="row" style={{ gap: 6, justifyContent: 'center', marginTop: 4 }}>
            <span className="chip on" style={{ padding: '3px 10px' }}>Giro {rounds + 1}</span>
            <button className="chip" style={{ padding: '3px 10px' }} onClick={onUngroup}>⛓ Sciogli</button>
          </div>
        </div>
        <button className="ghost" style={{ padding: '10px 12px', visibility: onNext ? 'visible' : 'hidden' }} onClick={onNext} aria-label="Blocco successivo">›</button>
      </div>

      {sorted.map((e, i) => (
        <GroupExercise key={e.id} entry={e} name={nameOf(e.exerciseId)}
          settings={datiOf(e.exerciseId).settings}
          inclinazione={datiOf(e.exerciseId).inclinazione}
          foto={datiOf(e.exerciseId).foto}
          values={vals[e.id] ?? { w: '', r: '', rir: null }}
          onChange={(v) => setVals((old) => ({ ...old, [e.id]: v }))}
          isFirst={i === 0} isLast={i === sorted.length - 1}
          onUngroup={() => onStacca(e.id)} />
      ))}

      {restNode}

      <button className="primary" style={{ width: '100%', padding: '15px', fontSize: 15 }} disabled={!ready} onClick={closeRound}>
        ✓ Chiudi giro {rounds + 1}
      </button>
      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
        Nessun recupero tra gli esercizi: parte a fine giro.
      </p>
    </div>
  )
}

export function LiveWorkout({ sessionId, onFinish, onHome, jumpTo }: {
  sessionId: string; onFinish: () => void; onHome?: () => void
  /** Blocco su cui posizionarsi tornando dalla panoramica. */
  jumpTo?: { index: number; nonce: number } | null
}) {
  const entries = useLiveQuery(() => entriesOf(sessionId), [sessionId]) ?? []
  const exercises = useLiveQuery(allExercises, []) ?? []
  const session = useLiveQuery(() => getSession(sessionId), [sessionId])

  // Il cuore si registra per TUTTA la seduta, non solo nel cardio: un
  // allenamento coi pesi ha un costo cardiaco, e finora spariva. Parte da solo
  // se la fascia e' collegata; se la colleghi a meta' riprende da li'.
  useEffect(() => {
    if (!session) return
    hrStartRecording(sessionId, session.hr)
    return () => { hrFlush(true) }
  }, [sessionId, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const user = useLiveQuery(getUser, [])
  // Schermo acceso mentre ti alleni: col telefono in standby Android sospende
  // la pagina, il Bluetooth smette di consegnare e la registrazione si buca.
  // Riagganciarsi da soli non serve a niente se e' tutto in pausa.
  useWakeLock(user?.schermoAcceso !== false)
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—'
  const [picking, setPicking] = useState(false)
  // Rientrando dal Riepilogo il recupero dev'essere ancora li' dov'era.
  const ripreso = storeRecupero(sessionId).current
  const [rest, setRest] = useState<number | null>(ripreso?.total ?? null)
  const [restExId, setRestExId] = useState<string | null>(ripreso?.exId ?? null)
  const [restSetId, setRestSetId] = useState<string | null>(ripreso?.setId ?? null)
  const [restNonce, setRestNonce] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  // Esercizio corrente (vista a focus): persistito per-sessione → il refresh non ti riporta al primo.
  const curKey = `wo-cur-${sessionId}`
  const [cur, setCur] = useState(() => { try { return Number(sessionStorage.getItem(curKey)) || 0 } catch { return 0 } })
  useEffect(() => { try { sessionStorage.setItem(curKey, String(cur)) } catch { /* ignore */ } }, [cur, curKey])
  const [cardioOpen, setCardioOpen] = useState(false)

  const [grouping, setGrouping] = useState<string | null>(null)

  // Torno dalla panoramica: mi posiziono sul blocco che ho toccato.
  useEffect(() => { if (jumpTo) setCur(jumpTo.index) }, [jumpTo?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // La vista scorre per BLOCCHI: un esercizio singolo o un superset/triset intero.
  const blocks: Block[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (!e.groupId) { blocks.push({ kind: 'single', entry: e }); continue }
    if (seen.has(e.groupId)) continue
    seen.add(e.groupId)
    blocks.push({ kind: 'group', id: e.groupId, entries: entries.filter((x) => x.groupId === e.groupId) })
  }
  const current = blocks.length ? Math.min(cur, blocks.length - 1) : 0
  const block = blocks[current]

  const cardioFlush = useRef<(() => Promise<void>) | null>(null)
  async function finishAll() { await cardioFlush.current?.(); onFinish() } // salva il cardio in sospeso, poi chiudi

  const restDefault = user?.restDefaultSec ?? 90
  const restOf = (id: string) => exercises.find((e) => e.id === id)?.restSec ?? restDefault
  // Store del timer: vive nel modulo, quindi regge sia il cambio esercizio sia
  // il giro al Riepilogo, che smonta tutta questa schermata.
  const restStore = storeRecupero(sessionId)
  const startRest = (sec: number, exId: string | null, setId?: string) => {
    restStore.current = { endAt: Date.now() + sec * 1000, total: sec, running: true, pausedLeft: sec, fired: false, exId, setId: setId ?? null }
    salvaRecupero(sessionId, restStore.current)
    setRest(sec); setRestExId(exId); setRestSetId(setId ?? null); setRestNonce((n) => n + 1)
  }
  const restPresets = rest != null
    ? Array.from(new Set([rest, 60, 90, 120, 150, 180])).sort((a, b) => a - b)
    : REST_PRESETS

  // Un solo timer, mostrato dentro il blocco corrente (singolo o superset).
  const restNode = rest != null ? (
    <RestTimer key={restNonce} defaultSec={rest} presets={restPresets} store={restStore} sessionId={sessionId}
      onPick={(s) => { if (restExId) setExerciseRest(restExId, s); if (restSetId) updateSet(restSetId, { restSec: s }) }}
      onClose={() => { restStore.current = null; salvaRecupero(sessionId, null); setRest(null) }} />
  ) : null

  return (
    <div className="col">
      {/* La fascia si chiede all'inizio, quando puoi ancora indossarla. */}
      <ChiediFascia sessionId={sessionId} />

      {/* Barra fissa in alto: Home · pallini esercizi · Recupero + durata */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', margin: '-16px -16px 0', padding: '12px 16px 8px' }}>
        <div className="row spread" style={{ gap: 6 }}>
          {onHome ? <button className="ghost small" style={{ flex: 'none', padding: '8px 10px' }} onClick={onHome} aria-label="Panoramica allenamento">‹ Riepilogo</button> : <span />}
          {/* I pallini cedono spazio: con molti esercizi non devono spingere fuori l'orologio. */}
          <span className="row" style={{ gap: 5, flex: 1, minWidth: 0, justifyContent: 'center', overflow: 'hidden' }}>
            {entries.map((e, i) => (
              <span key={e.id} onClick={() => setCur(i)} style={{ width: 8, height: 8, flex: 'none', borderRadius: 999, cursor: 'pointer', background: i === current ? 'var(--gold)' : 'var(--surface-2)', border: '1px solid var(--line)' }} />
            ))}
          </span>
          <span className="row" style={{ gap: 6, alignItems: 'center', flex: 'none' }}>
            <button className="ghost small" style={{ padding: '8px 10px' }} onClick={() => setCardioOpen(true)} aria-label="Cardio">🏃</button>
            <TastoFascia />
            {rest == null && <button className="ghost small" style={{ padding: '8px 10px' }} onClick={() => startRest(restDefault, null)} aria-label="Recupero">⏱</button>}
            {session && <WorkoutClock startedAt={session.startedAt} pausedSec={session.pausedSec} />}
          </span>
        </div>
      </div>

      {blocks.length > 0 && (block.kind === 'group' ? (
        <GroupCard entries={block.entries} nameOf={nameOf}
          datiOf={(id) => {
            const x = exercises.find((e) => e.id === id)
            return { settings: x?.settings ?? '', inclinazione: x?.inclinazione, foto: x?.foto }
          }}
          onStacca={(entryId) => { void staccaDalGruppo(entryId) }}
          restSec={restOf(block.entries[0].exerciseId)}
          pos={current + 1} total={blocks.length}
          restNode={restNode}
          onLogged={startRest}
          onPrev={current > 0 ? () => setCur(current - 1) : undefined}
          onNext={current < blocks.length - 1 ? () => setCur(current + 1) : undefined}
          onUngroup={() => ungroupEntries(block.id)} />
      ) : (
        <EntryCard key={block.entry.id} entry={block.entry} name={nameOf(block.entry.exerciseId)}
          settings={exercises.find((x) => x.id === block.entry.exerciseId)?.settings ?? ''}
          inclinazione={exercises.find((x) => x.id === block.entry.exerciseId)?.inclinazione}
          foto={exercises.find((x) => x.id === block.entry.exerciseId)?.foto}
          sessionId={sessionId} restSec={restOf(block.entry.exerciseId)}
          pos={current + 1} total={blocks.length}
          restNode={restNode}
          isFirst={current === 0} isLast={current === blocks.length - 1} onLogged={startRest}
          onGroup={entries.length > 1 ? () => setGrouping(block.entry.id) : undefined}
          onPrev={current > 0 ? () => setCur(current - 1) : undefined}
          onNext={current < blocks.length - 1 ? () => setCur(current + 1) : undefined} />
      ))}

      <button onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
      {picking && (
        <ExercisePicker onPick={async (id) => { await addExerciseEntry(sessionId, id); setCur(blocks.length); setPicking(false) }} onClose={() => setPicking(false)} />
      )}
      {grouping && (
        <GroupPicker sessionId={sessionId} fromEntryId={grouping} entries={entries} nameOf={nameOf}
          onClose={() => setGrouping(null)} />
      )}

      <CardioBlock sessionId={sessionId} flushRef={cardioFlush} open={cardioOpen} onOpenChange={setCardioOpen} onFine={finishAll} />

      {notesOpen ? (
        <div className="card">
          {/* Aperte, si richiudono: prima non c'era nessun modo di farlo e
              restavano li' per tutta la seduta. */}
          <div className="row spread" style={{ alignItems: 'baseline' }}>
            <label className="fl" style={{ margin: 0 }}>Note seduta</label>
            <button className="ghost small" aria-label="Chiudi le note" onClick={() => setNotesOpen(false)}>✕</button>
          </div>
          <textarea defaultValue={session?.notes ?? ''} rows={3} style={{ width: '100%' }}
            onBlur={(e) => updateSessionNotes(sessionId, e.target.value)} />
        </div>
      ) : (
        <button className="ghost" onClick={() => setNotesOpen(true)}>
          {session?.notes?.trim() ? '✎ Note seduta' : '＋ Note seduta'}
        </button>
      )}

      <button className="fab primary" onClick={finishAll}>Fine allenamento</button>
    </div>
  )
}

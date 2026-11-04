import { useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { OrarioSeduta } from './OrarioSeduta'
import { Cuore } from './Cuore'
import { deleteWithUndo } from '../db/trash'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { cardioOf, deleteSession, finishSession, reopenSession, sessionElapsedSec, setSessionType, setSessionSource, addSet, updateSet, deleteSet, addExerciseEntry, deleteExerciseEntry } from '../db/repo'
import { computeSessionWorkoutScore } from '../scores/sessionScore'
import { computeCardioZone } from '../metrics/cardio'
import { LOCAL_USER_ID } from '../db/seed'
import { volume, tonnage } from '../metrics/metrics'
import { parseNum } from '../util/validate'
import { confrontoSeduta, nomeScheda, codiceScheda } from '../scores/confronto'
import { restingHrFromWhoop } from '../db/whoop'
import { ExercisePicker } from './ExercisePicker'
import type { SetEntry, WorkoutType } from '../db/schema'

// Riga serie modificabile in-place (dettaglio storico).
function SetEditRow({ s }: { s: SetEntry }) {
  const [ed, setEd] = useState(false)
  const [w, setW] = useState(String(s.weight))
  const [r, setR] = useState(String(s.reps))
  if (ed) return (
    <div className="row" style={{ gap: 6, margin: '4px 0' }}>
      <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 64 }} />
      <input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 52 }} />
      <button className="primary small" onClick={async () => { const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true }); if (wn != null && rn != null) { await updateSet(s.id, { weight: wn, reps: rn }); setEd(false) } }}>✓</button>
      <button className="ghost small" onClick={() => setEd(false)}>annulla</button>
    </div>
  )
  return (
    <div className="setline">
      <span className="muted">{s.isWarmup ? 'W' : ''}</span>
      <span onClick={() => setEd(true)} style={{ cursor: 'pointer' }}>{s.weight} kg × {s.reps}{s.rir != null ? ` · RIR ${s.rir}` : ''} <span className="muted small">✎</span></span>
      <button className="ghost small" onClick={() => { if (confirm('Eliminare la serie?')) deleteWithUndo('Serie eliminata', () => deleteSet(s.id)) }}>✕</button>
    </div>
  )
}

function AddSetRow({ entryId }: { entryId: string }) {
  const [w, setW] = useState('')
  const [r, setR] = useState('')
  const [guasto, setGuasto] = useState<string | null>(null)
  // Anche qui la serie o entra o te lo dice: i campi restano pieni per riprovare.
  const aggiungi = async () => {
    const wn = parseNum(w, { min: 0 }), rn = parseNum(r, { min: 1, int: true })
    if (wn == null || rn == null) return
    try {
      await addSet(entryId, { weight: wn, reps: rn })
      setGuasto(null); setW(''); setR('')
    } catch (e) {
      setGuasto((e as Error).message)
    }
  }
  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <input placeholder="kg" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 64 }} />
        <input placeholder="reps" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 56 }} />
        <button className="ghost small" onClick={aggiungi}>＋ set</button>
      </div>
      {guasto && <p className="small" style={{ margin: '4px 0 0', color: '#e57373' }}>⚠ {guasto} Riprova.</p>}
    </>
  )
}

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full body', brosplit: 'Bro split', custom: 'Libera',
}
const TYPES = Object.keys(TYPE_LABEL) as WorkoutType[]

async function load(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session) return null
  const exNames = new Map((await db.exercises.where('userId').equals(LOCAL_USER_ID).toArray()).map((e) => [e.id, e.name]))
  const entries = await db.exerciseEntries.where({ sessionId }).sortBy('order')
  const items = []
  let allSets: SetEntry[] = []
  for (const e of entries) {
    const sets = await db.sets.where({ entryId: e.id }).sortBy('order')
    allSets = allSets.concat(sets)
    items.push({ entryId: e.id, name: exNames.get(e.exerciseId) ?? '—', sets })
  }
  // Da quale scheda viene: e' il nome vero della seduta, e decide anche il
  // colore nel calendario. "Pull" e' il tipo, non come si chiama.
  const templates = await db.templates.where('userId').equals(LOCAL_USER_ID).toArray()
  const sorgente = session.srcTemplateId ? templates.find((t) => t.id === session.srcTemplateId) ?? null : null
  const cardioRows = await cardioOf(sessionId)
  const user = await db.users.get(LOCAL_USER_ID)
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  // La stessa FC a riposo di tutto il resto: quella di WHOOP, se c'e'.
  const fcRiposo = (await restingHrFromWhoop()) ?? user?.restingHr
  const cardio = cardioRows.map((c) => ({
    durationMin: c.durationMin, avgBpm: c.avgBpm,
    zone: c.avgBpm && (age || user?.hrMaxMeasured) ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr: fcRiposo, method: c.method ?? 'standard', maxHr: user?.hrMaxMeasured }) : null,
  }))
  const score = await computeSessionWorkoutScore(sessionId)
  const durationMin = session.startedAt && session.finishedAt
    ? Math.round(sessionElapsedSec(session) / 60)
    : null
  return { session, items, cardio, score, vol: volume(allSets), ton: tonnage(allSets), durationMin, templates, sorgente }
}

const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const ora = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '…')
const kgv = (n: number) => String(n).replace('.', ',')

type Pannello = null | 'orario' | 'scheda' | 'tipo'

/**
 * Il dettaglio di una seduta: i dati in etichette, le serie in fila e accanto a
 * ogni esercizio se e' andato meglio o peggio della volta prima. Le azioni stanno
 * nel «⋯» in alto.
 */
export function SessionDetail({ sessionId, onBack, onReopen }: {
  sessionId: string; onBack: () => void; onReopen?: (id: string) => void
}) {
  useIndietro(onBack)
  const d = useLiveQuery(() => load(sessionId), [sessionId])
  const confronto = useLiveQuery(() => confrontoSeduta(sessionId), [sessionId])
  const [menu, setMenu] = useState(false)
  const [pannello, setPannello] = useState<Pannello>(null)
  const [edit, setEdit] = useState(false)
  const [picking, setPicking] = useState(false)

  const barra = (
    <div className="barra-s">
      <button className="ind" onClick={onBack}>‹ Storico</button>
      <span className="tit" />
      {d && <button className="menu" aria-label="Altre azioni" onClick={() => setMenu((m) => !m)}>⋯</button>}
    </div>
  )
  if (!d) return <div className="col">{barra}<p className="muted">Carico…</p></div>

  const titolo = d.sorgente ? nomeScheda(d.sorgente.name) : TYPE_LABEL[d.session.type] ?? d.session.type
  const giorno = new Date(d.session.date + 'T12:00:00')
  const voto = d.score.value
  const deltaDi = new Map((confronto?.righe ?? []).map((r) => [r.entryId, r.delta]))
  const serieDiLavoro = d.items.reduce((a, it) => a + it.sets.filter((s) => !s.isWarmup).length, 0)

  const azione = (testo: string, fai: () => void, rosso = false) => (
    <button className="riga-s" style={{ color: rosso ? '#e57373' : undefined }} onClick={() => { setMenu(false); fai() }}>{testo}</button>
  )

  return (
    <div className="col" style={{ gap: 10 }}>
      {barra}

      {menu && (
        <div className="lista-p" style={{ marginTop: -6 }}>
          {azione(edit ? '✓ Fine modifica' : '✎ Modifica serie ed esercizi', () => { setEdit((v) => !v); setPicking(false) })}
          {azione('Cambia scheda', () => setPannello('scheda'))}
          {azione('Cambia tipo', () => setPannello('tipo'))}
          {azione('Correggi l’orario', () => setPannello('orario'))}
          {d.session.finishedAt && onReopen && azione('▶ Riapri allenamento', async () => { await reopenSession(sessionId); onReopen(sessionId) })}
          {!d.session.finishedAt && azione('Chiudi seduta', () => void finishSession(sessionId))}
          {azione('Elimina seduta', () => { if (confirm('Eliminare definitivamente questa seduta?')) { deleteWithUndo('Seduta eliminata', () => deleteSession(sessionId)); onBack() } }, true)}
        </div>
      )}

      <div className="row spread" style={{ alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>{titolo}</h1>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {GIORNI_LUNGHI[giorno.getDay()]} {giorno.getDate()} {MESI_LUNGHI[giorno.getMonth()]}{!d.session.finishedAt ? ' · in corso' : ''}
          </div>
        </div>
        {voto != null && <span className={`voto-s ${voto >= 70 ? 'alto' : voto >= 40 ? 'medio' : 'basso'}`} style={{ minWidth: 52, height: 40, fontSize: 24 }}>{voto}</span>}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="pill-p" onClick={() => setPannello(pannello === 'orario' ? null : 'orario')}>
          {ora(d.session.startedAt)} – {ora(d.session.finishedAt)}{d.durationMin != null ? ` · ${d.durationMin}′` : ''}
        </button>
        <span className="pill-p">{serieDiLavoro} serie</span>
        <span className="pill-p">{migliaia(d.ton)} kg</span>
        <button className={d.sorgente ? 'pill-p oro' : 'pill-p'} onClick={() => setPannello(pannello === 'scheda' ? null : 'scheda')}>
          {d.sorgente ? `scheda ${codiceScheda(d.sorgente.name) ?? nomeScheda(d.sorgente.name)}` : 'nessuna scheda'}
        </button>
      </div>

      {pannello === 'orario' && (
        <div className="card" style={{ margin: 0 }}>
          <OrarioSeduta sessionId={d.session.id} startedAt={d.session.startedAt} finishedAt={d.session.finishedAt} />
        </div>
      )}
      {/* Da quale scheda viene. Le sedute nuove se lo scrivono da sole, le
          vecchie no: qui lo correggi tu, e il calendario si adegua. */}
      {pannello === 'scheda' && (
        <div className="card" style={{ margin: 0 }}>
          <label className="fl">Da quale scheda</label>
          <select value={d.session.srcTemplateId ?? ''} style={{ width: '100%' }}
            onChange={(e) => { void setSessionSource(sessionId, e.target.value || null); setPannello(null) }}>
            <option value="">Mia — nessuna scheda</option>
            {d.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {pannello === 'tipo' && (
        <div className="card" style={{ margin: 0 }}>
          <label className="fl">Tipo di seduta</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {TYPES.map((t) => (
              <button key={t} className={d.session.type === t ? 'chip on' : 'chip'}
                onClick={() => { void setSessionType(sessionId, t); setPannello(null) }}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
        </div>
      )}

      <div className="lista-p">
        {d.items.map((it) => {
          const delta = deltaDi.get(it.entryId)
          return (
            <div key={it.entryId} style={{ padding: '10px 12px', borderTop: it === d.items[0] ? undefined : '1px solid var(--line-soft)' }}>
              <div className="row spread">
                <b style={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{it.name}</b>
                {edit
                  ? <button className="ghost small" onClick={() => { if (confirm(`Rimuovere ${it.name}?`)) deleteWithUndo(`${it.name} rimosso dalla seduta`, () => deleteExerciseEntry(it.entryId)) }}>🗑</button>
                  : delta && <span className={`verso-${delta.verso}`} style={{ fontSize: 11.5, fontWeight: 600, flex: 'none' }}>{delta.testo}</span>}
              </div>
              {edit ? (
                <>
                  {it.sets.map((s) => <SetEditRow key={s.id} s={s} />)}
                  <AddSetRow entryId={it.entryId} />
                </>
              ) : it.sets.length === 0 ? <p className="muted small" style={{ margin: '4px 0 0' }}>Nessuna serie.</p> : (
                <div className="serie-s">
                  {it.sets.map((s) => (
                    <span key={s.id} style={s.isWarmup ? { opacity: .55 } : undefined}>
                      {s.isWarmup ? 'W ' : ''}{kgv(s.weight)}×{s.reps}{s.rir != null && <em>R{s.rir}</em>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {edit && (picking
        ? <ExercisePicker onPick={async (id) => { await addExerciseEntry(sessionId, id); setPicking(false) }} onClose={() => setPicking(false)} />
        : <button className="ghost" onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
      )}

      {/* Il cuore di TUTTA la seduta, cardio compreso. Quello del solo cardio
          sta nel suo blocco: sono due domande diverse, e due riquadri. */}
      <Cuore hr={d.session.hr} da={d.session.startedAt} a={d.session.finishedAt} titolo="Cuore della seduta" />

      {d.cardio.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <div className="etichetta-p" style={{ marginBottom: 6 }}>Cardio</div>
          {d.cardio.map((c, i) => (
            <div className="row spread small" key={i} style={{ padding: '3px 0' }}>
              <span>{c.durationMin}′{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}</span>
              <span className="muted">{c.zone ? `${c.zone.label} (${c.zone.pct}%)` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {d.session.notes && (
        <div className="card" style={{ margin: 0 }}>
          <div className="etichetta-p" style={{ marginBottom: 4 }}>Note</div>
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.session.notes}</p>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', margin: '2px 0 0' }}>Modifica, riapri o elimina dal «⋯» in alto.</p>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Cuore } from './Cuore'
import { finishCue } from '../util/sound'
import { db } from '../db/db'
import { computeSessionWorkoutScore } from '../scores/sessionScore'
import { computeCardioZone } from '../metrics/cardio'
import { createTemplateFromSession, updateSessionNotes } from '../db/repo'
import { restingHrFromWhoop } from '../db/whoop'
import { LOCAL_USER_ID } from '../db/seed'
import { getApiKey } from '../ai/aiEngine'
import { confrontoSeduta, ordinaRighe, serieInFila, nomeScheda, type ConfrontoSeduta } from '../scores/confronto'
import { fmtData } from '../util/format'
import { AiInsight } from './AiInsight'
import { ScoreRing } from './anim'
import { PiedeFisso } from './PiedeFisso'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full body', brosplit: 'Bro split', custom: 'Libera',
}
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

async function riepilogo(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  const score = await computeSessionWorkoutScore(sessionId)
  const confronto = await confrontoSeduta(sessionId)
  const user = await db.users.get(LOCAL_USER_ID)
  const age = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  // La stessa FC a riposo di tutto il resto: quella di WHOOP, se c'e'.
  const fcRiposo = (await restingHrFromWhoop()) ?? user?.restingHr
  const cardio = (await db.cardio.where({ sessionId }).toArray()).map((c) => ({
    durationMin: c.durationMin, avgBpm: c.avgBpm,
    zone: c.avgBpm && (age || user?.hrMaxMeasured)
      ? computeCardioZone({ avgBpm: c.avgBpm, age, restingHr: fcRiposo, method: c.method ?? 'standard', maxHr: user?.hrMaxMeasured })
      : null,
  }))
  return { session, score, confronto, cardio }
}

/** «+3,1%» / «−4′» / «=»: quanto e' cambiato dalla volta scorsa. */
function variazione(ora: number | null, prima: number | null, modo: 'diff' | 'pct', unita = ''): { testo: string; classe: string } | null {
  if (ora == null || prima == null) return null
  if (modo === 'pct') {
    if (!prima) return null
    const p = Math.round(((ora - prima) / prima) * 1000) / 10
    if (p === 0) return { testo: '=', classe: 'verso-pari' }
    return { testo: `${p > 0 ? '+' : '−'}${String(Math.abs(p)).replace('.', ',')}%`, classe: p > 0 ? 'verso-su' : 'verso-giu' }
  }
  const d = ora - prima
  if (d === 0) return { testo: '=', classe: 'verso-pari' }
  return { testo: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unita}`, classe: 'verso-pari' }
}

/**
 * Fine seduta: il voto, tre numeri contro la volta scorsa della stessa scheda,
 * e per ogni esercizio se e' andato meglio o peggio — prima i record.
 */
export function FinishScreen({ sessionId, onHome }: { sessionId: string; onHome: () => void }) {
  const d = useLiveQuery(() => riepilogo(sessionId), [sessionId])
  const [note, setNote] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [salvata, setSalvata] = useState(false)
  useEffect(() => { finishCue() }, []) // suono di fine all'apertura del riepilogo

  if (!d) return <div className="col"><p className="muted">Calcolo…</p></div>
  const c: ConfrontoSeduta | null = d.confronto
  const titolo = c?.scheda ? nomeScheda(c.scheda) : TYPE_LABEL[d.session?.type ?? ''] ?? 'Seduta'
  const v = d.score.value

  return (
    <div className="col" style={{ gap: 10 }}>
      <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
        <div className="etichetta-p" style={{ color: 'var(--gold)', fontWeight: 600 }}>{titolo} · finita</div>
        <h2 style={{ fontSize: 25, margin: '4px 0 0', animation: 'popIn .5s ease .1s both' }}>Seduta chiusa</h2>
        <div style={{ display: 'grid', placeItems: 'center', margin: '10px 0 4px' }}>
          <ScoreRing value={v} size={118} />
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {c?.mediaScheda != null && v != null
            ? `${v >= c.mediaScheda ? 'sopra' : 'sotto'} la tua media della ${titolo.split(' ·')[0]} (${c.mediaScheda})`
            : `Workout Score · ${d.score.reliability}`}
        </div>
        {d.score.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{d.score.note}</div>}
      </div>

      {c && (
        <div className="card numeri-s" style={{ margin: 0 }}>
          {[
            { v: c.durata.ora != null ? `${c.durata.ora}′` : '—', l: 'durata', x: variazione(c.durata.ora, c.durata.prima, 'diff', '′') },
            { v: String(c.serie.ora), l: 'serie', x: variazione(c.serie.ora, c.serie.prima, 'diff') },
            { v: migliaia(c.kg.ora), l: 'kg totali', x: variazione(c.kg.ora, c.kg.prima, 'pct') },
          ].map((n) => (
            <div key={n.l}>
              <b>{n.v}</b><span>{n.l}</span>
              {n.x && <i className={n.x.classe}>{n.x.testo}</i>}
            </div>
          ))}
        </div>
      )}

      {c && c.righe.length > 0 && (
        <div className="lista-p">
          <div className="etichetta-p" style={{ padding: '10px 12px 2px' }}>
            {c.precedente ? `Contro l'ultima ${titolo.split(' ·')[0]} · ${fmtData(c.precedente.date).slice(0, 5)}` : 'Prima volta con questa scheda'}
          </div>
          {ordinaRighe(c.righe).map((r) => (
            <div key={r.entryId} className="riga-s">
              {r.pr && <span className="pr-s">PR</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                {r.nome}
                <span className="sotto">{serieInFila(r.sets) || 'nessuna serie'}</span>
              </span>
              <span className={`pill-p ${r.delta.verso === 'su' ? 'su' : r.delta.verso === 'giu' ? 'giu' : ''}`}>{r.delta.testo}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quanto ti e' costata davvero: il cuore, subito, non nello storico. */}
      <Cuore hr={d.session?.hr} da={d.session?.startedAt} a={d.session?.finishedAt ?? null} titolo="Cuore della seduta" />

      {d.cardio.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <div className="etichetta-p" style={{ marginBottom: 6 }}>Cardio</div>
          {d.cardio.map((x, i) => (
            <div className="row spread small" key={i} style={{ padding: '3px 0' }}>
              <span>{x.durationMin}′{x.avgBpm ? ` · ${x.avgBpm} bpm` : ''}</span>
              <span className="muted">{x.zone ? `${x.zone.label} (${x.zone.pct}%)` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {note != null && (
        <div className="card" style={{ margin: 0 }}>
          <label className="fl">Note della seduta</label>
          <textarea rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)}
            onBlur={() => void updateSessionNotes(sessionId, note)} style={{ width: '100%' }} />
        </div>
      )}

      {/* Il riquadro AI solo se la chiave c'e': niente scatole vuote. */}
      {getApiKey() && c && (
        <AiInsight
          label="Report AI della seduta"
          buildPrompt={() => {
            const cardio = d.cardio.map((x) => `${x.durationMin}min${x.avgBpm ? ` @${x.avgBpm}bpm` : ''}${x.zone ? ` ${x.zone.label}` : ''}`).join(', ')
            const righe = c.righe.map((r) => `${r.nome}: ${serieInFila(r.sets)} (${r.pr ? 'PR, ' : ''}${r.delta.testo})`).join('; ')
            return `Seduta appena conclusa (${titolo}).\nWorkout Score: ${v ?? 'n/d'} (${d.score.reliability}).\nSerie: ${c.serie.ora}, tonnellaggio: ${c.kg.ora} kg, durata ${c.durata.ora ?? '?'} min.\nEsercizi contro la volta scorsa: ${righe}.${cardio ? `\nCardio: ${cardio}.` : ''}\n\nCommenta la seduta in modo conciso: qualità, punti di forza, cosa migliorare. Se i dati sono pochi, dillo.`
          }}
        />
      )}

      {/* Una seduta libera si puo' tenere come scheda; una da scheda ce l'ha gia'. */}
      {!d.session?.srcTemplateId && (c?.righe.length ?? 0) > 0 && (
        salvata ? <p className="muted small" style={{ textAlign: 'center' }}>✓ Scheda salvata: la ritrovi in «Nuova seduta».</p>
          : salvando ? (
            <div className="card" style={{ margin: 0 }}>
              <label className="fl">Nome della scheda</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Push A" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="ghost" style={{ flex: 1 }} onClick={() => setSalvando(false)}>Annulla</button>
                <button className="primary" style={{ flex: 2 }} onClick={async () => { await createTemplateFromSession(sessionId, nome); setSalvata(true); setSalvando(false) }}>Salva</button>
              </div>
            </div>
          ) : (
            <button className="ghost small" style={{ alignSelf: 'center' }} onClick={() => setSalvando(true)}>☆ Salva come scheda</button>
          )
      )}

      <div className="spazio-piede" />
      <PiedeFisso>
        <button className="ghost" style={{ flex: '0 0 120px' }} onClick={() => setNote(note == null ? d.session?.notes ?? '' : note)}>Note</button>
        <button className="primary" onClick={onHome}>Fatto</button>
      </PiedeFisso>
    </div>
  )
}

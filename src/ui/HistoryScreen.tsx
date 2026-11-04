import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHistory, type SessionSummary } from '../scores/dashboardScores'
import { nomeScheda, codiceScheda } from '../scores/confronto'
import { todayLocal, shiftDate } from '../util/date'
import { SessionDetail } from './SessionDetail'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full body', brosplit: 'Bro split', custom: 'Libera',
}
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Il lunedi' della settimana di una data. */
function lunedi(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return shiftDate(iso, -((d.getDay() + 6) % 7))
}
const etichettaData = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()} ${MESI[d.getMonth()]}` }

const nomeDi = (s: SessionSummary) => (s.scheda ? nomeScheda(s.scheda) : TYPE_LABEL[s.type] ?? s.type)
const classeVoto = (v: number) => (v >= 70 ? 'alto' : v >= 40 ? 'medio' : 'basso')

/** L'andamento del voto, una media a settimana. */
function Andamento({ sedute }: { sedute: SessionSummary[] }) {
  const oggi = todayLocal()
  const settimane = Array.from({ length: 8 }, (_, k) => lunedi(shiftDate(oggi, -7 * (7 - k))))
  const medie = settimane.map((l) => {
    const v = sedute.filter((s) => s.score != null && lunedi(s.date) === l).map((s) => s.score!)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  })
  const punti = medie.map((m, i) => (m == null ? null : { x: (i / 7) * 330, y: 42 - (m / 100) * 38 })).filter(Boolean) as { x: number; y: number }[]
  if (punti.length < 2) return null
  const tutte = medie.filter((m): m is number => m != null)
  const media = Math.round(tutte.reduce((a, b) => a + b, 0) / tutte.length)
  const recenti = medie.slice(4).filter((m): m is number => m != null), prima = medie.slice(0, 4).filter((m): m is number => m != null)
  const delta = recenti.length && prima.length
    ? Math.round(recenti.reduce((a, b) => a + b, 0) / recenti.length - prima.reduce((a, b) => a + b, 0) / prima.length)
    : null
  const linea = punti.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const ultimo = punti[punti.length - 1]
  return (
    <div className="card" style={{ margin: 0, padding: '10px 12px 6px' }}>
      <div className="row spread">
        <span className="etichetta-p">Workout Score · 8 settimane</span>
        <span className={`pill-p ${delta != null && delta > 0 ? 'su' : delta != null && delta < 0 ? 'giu' : ''}`}>
          media {media}{delta ? ` · ${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : ''}
        </span>
      </div>
      <svg viewBox="0 0 330 46" preserveAspectRatio="none" style={{ width: '100%', height: 46, display: 'block' }}>
        <path d={`${linea} L${ultimo.x} 46 L${punti[0].x} 46Z`} fill="#5bc27a18" />
        <path d={linea} fill="none" stroke="#5bc27a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

/**
 * Lo storico: una riga per seduta, divise per settimana, filtro per scheda e in
 * cima l'andamento del voto.
 */
export function HistoryScreen({ onReopen, apri }: { onReopen?: (id: string) => void; apri?: string | null }) {
  // Arrivando dal calendario si apre gia' sulla seduta che hai toccato:
  // "apri la seduta" deve portarti a QUELLA seduta, non a un elenco.
  const [selected, setSelected] = useState<string | null>(apri ?? null)
  const [filtro, setFiltro] = useState<string | null>(null)
  const list = useLiveQuery(computeHistory, [])

  if (selected) return <SessionDetail sessionId={selected} onBack={() => setSelected(null)} onReopen={onReopen} />
  if (!list) return <p className="muted">Carico…</p>

  // I filtri: una chip per scheda (D1…D5 col codice), e «Mie» per le sedute senza scheda.
  const schede = new Map<string, string>()
  for (const s of list) if (s.schedaId && s.scheda && !schede.has(s.schedaId)) schede.set(s.schedaId, codiceScheda(s.scheda) ?? nomeScheda(s.scheda))
  const chips = [...schede].sort((a, b) => a[1].localeCompare(b[1], 'it'))
  const libere = list.some((s) => !s.schedaId)
  const visibili = list.filter((s) => filtro == null || (filtro === 'mie' ? !s.schedaId : s.schedaId === filtro))

  const inCorso = visibili.filter((s) => !s.finished)
  const chiuse = visibili.filter((s) => s.finished)
  const settimane: { lunedi: string; sedute: SessionSummary[] }[] = []
  for (const s of chiuse) {
    const l = lunedi(s.date)
    const g = settimane.find((x) => x.lunedi === l)
    if (g) g.sedute.push(s); else settimane.push({ lunedi: l, sedute: [s] })
  }
  const questa = lunedi(todayLocal())
  const titoloSettimana = (l: string) => l === questa ? 'Questa settimana'
    : l === shiftDate(questa, -7) ? 'Settimana scorsa'
      : `${etichettaData(l)} – ${etichettaData(shiftDate(l, 6))}`

  const riga = (s: SessionSummary) => {
    const d = new Date(s.date + 'T12:00:00')
    const cardio = s.cardio.reduce((a, c) => a + (c.durationMin || 0), 0)
    const sotto = s.finished
      ? [s.durataMin != null && `${s.durataMin}′`, `${s.sets} serie`, `${migliaia(s.tonnage)} kg`, cardio && `cardio ${Math.round(cardio)}′`].filter(Boolean).join(' · ')
      : `in corso · ${s.sets} serie`
    return (
      <button key={s.id} className="riga-s" onClick={() => setSelected(s.id)}>
        <span style={{ width: 38, flex: 'none', textAlign: 'center', lineHeight: 1.05 }}>
          <b className="num" style={{ fontSize: 21, display: 'block' }}>{String(d.getDate()).padStart(2, '0')}</b>
          <span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.finished ? GIORNI[d.getDay()] : MESI[d.getMonth()]}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontWeight: 600 }}>{nomeDi(s)}</b>
          <span className="sotto">{sotto}</span>
        </span>
        {s.finished
          ? s.score != null && <span className={`voto-s ${classeVoto(s.score)}`}>{s.score}</span>
          : onReopen && <span className="pill-p oro" onClick={(e) => { e.stopPropagation(); onReopen(s.id) }}>Riprendi</span>}
      </button>
    )
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      {(chips.length > 1 || (chips.length && libere)) && (
        <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <button className={filtro === null ? 'chip on' : 'chip'} onClick={() => setFiltro(null)}>Tutte</button>
          {chips.map(([id, nome]) => (
            <button key={id} className={filtro === id ? 'chip on' : 'chip'} onClick={() => setFiltro(id)}>{nome}</button>
          ))}
          {libere && <button className={filtro === 'mie' ? 'chip on' : 'chip'} onClick={() => setFiltro('mie')}>Mie</button>}
        </div>
      )}

      {visibili.length === 0 ? <p className="muted small">Nessuna seduta registrata.</p> : (
        <>
          <Andamento sedute={visibili} />
          {inCorso.length > 0 && (
            <div className="lista-p" style={{ borderColor: '#4a3e18', background: 'linear-gradient(180deg, #221c0c, #15120a)' }}>{inCorso.map(riga)}</div>
          )}
          {settimane.map((w) => (
            <div key={w.lunedi} className="col" style={{ gap: 6 }}>
              <div className="row spread" style={{ margin: '4px 4px 0', alignItems: 'baseline' }}>
                <span className="etichetta-p">{titoloSettimana(w.lunedi)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{w.sedute.length} {w.sedute.length === 1 ? 'seduta' : 'sedute'}</span>
              </div>
              <div className="lista-p">{w.sedute.map(riga)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

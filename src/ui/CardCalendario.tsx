// Quando ti sei allenato, e cosa hai fatto.
//
// Con un ciclo di cinque sedute ogni otto giorni non lo tieni a mente, e a
// occhio nudo nell'app non c'era da nessuna parte: c'era lo storico, che pero'
// e' un elenco, non un colpo d'occhio.
//
// Chiuso: le ultime due settimane. Aperto: il mese, con il nome della seduta.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { calendario } from '../rs/allenamento'
import { todayLocal, shiftDate } from '../util/date'
import { fmtData } from '../util/format'

const LBL: React.CSSProperties = { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }
const GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

/** Lunedi della settimana di una data: la griglia parte sempre da li'. */
const lunedi = (d: string) => shiftDate(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7))

export function CardCalendario({ onApri }: { onApri?: (date: string) => void }) {
  const [aperto, setAperto] = useState(false)
  const oggi = todayLocal()
  // Chiuso guarda due settimane, aperto sei: si carica solo quello che si vede.
  const da = lunedi(shiftDate(oggi, aperto ? -35 : -13))
  const giorni = useLiveQuery(() => calendario(da, oggi), [da, oggi])
  const perData = new Map((giorni ?? []).map((g) => [g.date, g]))

  const celle: string[] = []
  for (let d = da; d <= oggi; d = shiftDate(d, 1)) celle.push(d)

  const quadretto = (d: string, grande: boolean) => {
    const g = perData.get(d)
    const colore = g ? (g.delCoach ? 'var(--rs)' : 'var(--gold)') : 'transparent'
    return (
      <div key={d} onClick={(e) => { e.stopPropagation(); if (g && onApri) onApri(d) }}
        title={g ? `${fmtData(d)} · ${g.nome}` : fmtData(d)}
        style={{
          flex: grande ? '1 1 0' : '0 0 auto',
          width: grande ? undefined : 14, height: grande ? 30 : 14,
          borderRadius: 4, background: colore,
          border: '1px solid ' + (g ? colore : 'var(--line)'),
          display: 'grid', placeItems: 'center',
          fontSize: 9, color: g ? '#000' : 'var(--muted)',
          cursor: g ? 'pointer' : 'default',
          outline: d === oggi ? '1px solid var(--text)' : 'none', outlineOffset: 1,
        }}>
        {grande ? new Date(d + 'T00:00:00').getDate() : ''}
      </div>
    )
  }

  return (
    <div onClick={() => setAperto((v) => !v)} style={{ cursor: 'pointer' }}>
      <div className="row spread">
        <span style={LBL}>Calendario</span>
        <span className="muted small">≡</span>
      </div>

      {!aperto ? (
        <>
          <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'nowrap' }}>
            {celle.map((d) => quadretto(d, false))}
          </div>
          <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 5 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--rs)' }} />
              <span className="muted" style={{ fontSize: 10 }}>del coach</span>
            </span>
            <span className="row" style={{ gap: 5 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--gold)' }} />
              <span className="muted" style={{ fontSize: 10 }}>tua</span>
            </span>
            <span className="row" style={{ gap: 5 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, border: '1px solid var(--line)' }} />
              <span className="muted" style={{ fontSize: 10 }}>riposo</span>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 4, marginTop: 8 }}>
            {GIORNI.map((g, i) => (
              <span key={i} className="muted" style={{ flex: 1, textAlign: 'center', fontSize: 9 }}>{g}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 4 }}>
            {celle.map((d) => quadretto(d, true))}
          </div>

          <div style={{ marginTop: 10 }}>
            {[...(giorni ?? [])].reverse().slice(0, 8).map((g) => (
              <div key={g.date} onClick={(e) => { e.stopPropagation(); onApri?.(g.date) }}
                className="row spread"
                style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                <span className="small" style={{ color: g.delCoach ? 'var(--rs)' : 'var(--gold)' }}>{g.nome}</span>
                <span className="muted" style={{ fontSize: 11 }}>{fmtData(g.date).slice(0, 5)} · {g.serie} serie</span>
              </div>
            ))}
            {!giorni?.length && <p className="muted small" style={{ margin: 0 }}>Nessuna seduta in queste settimane.</p>}
          </div>
        </>
      )}
    </div>
  )
}

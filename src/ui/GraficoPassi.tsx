// L'andamento dei passi, solo quelli del WHOOP.
//
// Perche' solo suoi: e' l'unica sorgente che ti sta addosso tutto il giorno.
// Il telefono e l'orologio riempiono la giornata in corso, ma mescolarli nello
// storico farebbe un grafico dove ogni barra e' misurata da uno strumento
// diverso — e un confronto fra numeri non confrontabili non e' un andamento.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { STEPS, getHabit } from '../db/habits'
import { todayLocal, shiftDate } from '../util/date'
import { fmtData } from '../util/format'
import { sincronizzaPassi } from '../util/passi'

type Periodo = 'S' | 'M' | '3M' | '6M' | 'YTD'

const GIORNI: Record<Exclude<Periodo, 'YTD'>, number> = { S: 7, M: 30, '3M': 90, '6M': 180 }

/** Il primo giorno del periodo scelto. */
function inizioDi(p: Periodo): string {
  const oggi = todayLocal()
  if (p === 'YTD') return `${oggi.slice(0, 4)}-01-01`
  return shiftDate(oggi, -(GIORNI[p] - 1))
}

export function GraficoPassi() {
  const [periodo, setPeriodo] = useState<Periodo>('M')
  const [scarico, setScarico] = useState(false)
  /** La barra che stai guardando: un grafico senza numeri e' un disegno. */
  const [scelto, setScelto] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)

  const habit = useLiveQuery(() => getHabit(STEPS), [])
  const obiettivo = habit?.target ?? 10000
  const da = inizioDi(periodo)

  const righe = useLiveQuery(async () => {
    const tutte = await db.habitEntries.where('habitKey').equals(STEPS).toArray()
    return tutte
      .filter((r) => r.date >= da && r.source === 'whoop')
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [da])

  // Il periodo lungo puo' chiedere giorni mai scaricati: si scaricano una volta
  // sola e restano nel database — la sincronizzazione di ogni giorno tocca solo
  // i giorni recenti.
  useEffect(() => {
    if (!righe) return
    const giorniChiesti = periodo === 'YTD'
      ? Math.round((Date.parse(todayLocal()) - Date.parse(da)) / 86_400_000) + 1
      : GIORNI[periodo]
    const primo = righe[0]?.date
    if (righe.length && primo && primo <= shiftDate(da, 2)) return  // gia' coperto
    if (scarico) return
    setScarico(true)
    setNota('Scarico lo storico…')
    void sincronizzaPassi(Math.min(giorniChiesti, 400))
      .then((n) => setNota(n ? null : 'Non c’è altro storico da scaricare.'))
      .catch((e) => setNota((e as Error)?.message ?? null))
      .finally(() => setScarico(false))
  }, [periodo, righe?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!righe) return null

  const massimo = Math.max(obiettivo, ...righe.map((r) => r.value), 1)
  const media = righe.length ? Math.round(righe.reduce((s, r) => s + r.value, 0) / righe.length) : 0
  const centrati = righe.filter((r) => r.value >= obiettivo).length

  // Con sei mesi di barre non c'e' spazio per un rettangolo per giorno: sotto i
  // 3 px si vedrebbe una macchia. Sopra i 70 giorni le barre diventano una linea
  // sottile e si perde la spaziatura, che va bene per leggere l'andamento.
  const L = 320, H = 110
  const larghezza = Math.max(1, L / Math.max(righe.length, 1) - (righe.length > 70 ? 0.3 : 1.4))

  return (
    <div className="card">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <label className="fl" style={{ margin: 0 }}>Andamento · WHOOP</label>
        <div className="row" style={{ gap: 4 }}>
          {(['S', 'M', '3M', '6M', 'YTD'] as Periodo[]).map((p) => (
            <button key={p} className={periodo === p ? 'chip on' : 'chip'}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPeriodo(p)}>{p}</button>
          ))}
        </div>
      </div>

      {righe.length === 0 ? (
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          {scarico ? 'Scarico lo storico…' : 'Nessun giorno del WHOOP in questo periodo.'}
        </p>
      ) : (
        <>
          {/* Il giorno toccato, sopra il grafico: le barre dicono l'andamento,
              il numero dice quel giorno li'. */}
          <div className="row spread" style={{ marginTop: 10, minHeight: 18, alignItems: 'baseline' }}>
            {(() => {
              const r = righe.find((x) => x.id === scelto)
              if (!r) return <span className="muted small">Tocca una barra per il dettaglio.</span>
              return (
                <>
                  <span className="small">{fmtData(r.date)}</span>
                  <span className="small" style={{ color: r.value >= obiettivo ? 'var(--good)' : 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.value.toLocaleString('it-IT')} passi
                    {r.value >= obiettivo ? ' · obiettivo centrato' : ` · ${(obiettivo - r.value).toLocaleString('it-IT')} sotto`}
                  </span>
                </>
              )
            })()}
          </div>

          <svg viewBox={`0 0 ${L} ${H}`} width="100%" height={H} style={{ marginTop: 4, display: 'block', overflow: 'visible' }}>
            {/* La linea dell'obiettivo: senza, le barre dicono solo "tanto o poco". */}
            <line x1="0" y1={H - (obiettivo / massimo) * H} x2={L} y2={H - (obiettivo / massimo) * H}
              stroke="var(--gold)" strokeWidth="1" strokeDasharray="3 3" opacity=".55" />
            {righe.map((r, i) => {
              const h = Math.max(1, (r.value / massimo) * H)
              return (
                <g key={r.id} onClick={() => setScelto((p) => (p === r.id ? null : r.id))} style={{ cursor: 'pointer' }}>
                  {/* Con sei mesi di barre il dito e' piu' largo della barra:
                      l'area sensibile e' tutta la colonna, invisibile. */}
                  <rect x={(i * L) / righe.length} y={0} width={L / righe.length} height={H} fill="transparent" />
                  <rect x={(i * L) / righe.length} y={H - h} width={larghezza} height={h}
                    rx={larghezza > 4 ? 1.5 : 0}
                    fill={r.id === scelto ? 'var(--text)' : r.value >= obiettivo ? 'var(--good)' : 'var(--gold-dim)'} />
                </g>
              )
            })}
          </svg>

          <div className="row spread" style={{ marginTop: 8 }}>
            <span className="muted small">{fmtData(righe[0].date)} → {fmtData(righe[righe.length - 1].date)}</span>
            <span className="muted small">{righe.length} giorni</span>
          </div>
          <div className="row spread" style={{ marginTop: 2 }}>
            <span className="muted small">Media</span>
            <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{media.toLocaleString('it-IT')} passi</span>
          </div>
          <div className="row spread">
            <span className="muted small">Obiettivo centrato</span>
            <span className="small">{centrati} su {righe.length}</span>
          </div>
          {nota && <p className="muted small" style={{ margin: '6px 0 0' }}>{nota}</p>}
        </>
      )}
    </div>
  )
}

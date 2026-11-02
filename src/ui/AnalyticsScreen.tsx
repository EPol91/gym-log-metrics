import { useState, Fragment } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeAnalytics } from '../scores/analytics'
import { computeCardioAverages, computeCardioWeekly, computeEfficienza } from '../scores/cardioStats'
import { TYPE_LABEL, TYPE_ICON, fmtEff } from './CardioBlock'
import type { CardioType } from '../db/schema'
import { canUse } from '../entitlements/entitlements'
import { BarChart } from './BarChart'
import { LineChart } from './LineChart'

// onBack assente quando è una scheda dentro Progressi: lì si esce con la barra.
export function AnalyticsScreen({ onBack }: { onBack?: () => void }) {
  const data = useLiveQuery(() => computeAnalytics(8), [])
  const [cardioPeriod, setCardioPeriod] = useState(7)
  const cardioAvg = useLiveQuery(() => computeCardioAverages(cardioPeriod), [cardioPeriod])
  const cardioWeekly = useLiveQuery(() => computeCardioWeekly(8), [])
  const eff = useLiveQuery(computeEfficienza, [])
  const [tipoEff, setTipoEff] = useState<CardioType | null>(null)

  // Analisi avanzate = feature Premium.
  if (!canUse('advanced-charts')) {
    return (
      <div className="col">
        {onBack && <button className="ghost small" onClick={onBack}>← Home</button>}
        <h1>Analytics</h1>
        <div className="card"><p className="muted small">Funzione Premium.</p></div>
      </div>
    )
  }

  return (
    <div className="col">
      {onBack && <button className="ghost small" onClick={onBack}>← Home</button>}
      <h1>Analytics</h1>
      <p className="muted small">Ultime 8 settimane</p>

      {!data ? (
        <p className="muted">Calcolo…</p>
      ) : data.totalSessions === 0 ? (
        <div className="card"><p className="muted small">Nessun dato ancora.</p></div>
      ) : (
        <>
          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Tonnellaggio settimanale (kg)</div>
            <BarChart points={data.weeklyTonnage} />
          </div>
          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Sedute per settimana</div>
            <BarChart points={data.weeklySessions} />
          </div>
          {/* Le serie per gruppo sono il numero su cui si programma davvero: il
              tonnellaggio dice quanto hai spostato, non quante volte hai
              stimolato il dorso. Il riscaldamento non allena, e infatti non conta. */}
          {data.seriePerGruppo.length > 0 && (
            <div className="card">
              <div className="row spread" style={{ marginBottom: 4 }}>
                <span className="muted small">Serie per gruppo · 7 giorni</span>
                <span className="muted small">{data.seriePerGruppo.reduce((a, g) => a + g.value, 0)} in tutto</span>
              </div>
              {data.seriePerGruppo.map((g) => (
                <div key={g.label} style={{ marginTop: 7 }}>
                  <div className="row spread">
                    <span className="small" style={{ textTransform: 'capitalize' }}>{g.label}</span>
                    <span className="small" style={{ color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{g.value}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', marginTop: 3 }}>
                    <div style={{
                      height: '100%', borderRadius: 999, background: 'var(--gold)',
                      width: `${(g.value / (data.seriePerGruppo[0].value || 1)) * 100}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="muted small" style={{ marginBottom: 6 }}>Workout Score nel tempo</div>
            <LineChart points={data.workoutScores} />
          </div>
        </>
      )}

      {cardioAvg && cardioAvg.count > 0 && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="muted small">Cardio — media {cardioPeriod === 7 ? 'settimana' : 'mese'}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className={cardioPeriod === 7 ? 'sel small' : 'ghost small'} onClick={() => setCardioPeriod(7)}>7g</button>
              <button className={cardioPeriod === 30 ? 'sel small' : 'ghost small'} onClick={() => setCardioPeriod(30)}>30g</button>
            </span>
          </div>
          <div className="row spread"><span className="muted">Durata media</span><strong>{cardioAvg.avgDurationMin} min</strong></div>
          <div className="row spread"><span className="muted">BPM medio</span><strong>{cardioAvg.avgBpm ?? '—'}</strong></div>
          <div className="row spread"><span className="muted">Sessioni</span><strong>{cardioAvg.count}</strong></div>
          {cardioWeekly && cardioWeekly.some((p) => p.value > 0) && (
            <div style={{ marginTop: 8 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>Minuti cardio / settimana</div>
              <BarChart points={cardioWeekly} unit="′" />
            </div>
          )}
        </div>
      )}

      {eff && Object.keys(eff).length > 0 && <CardEfficienza eff={eff} tipo={tipoEff} setTipo={setTipoEff} />}
    </div>
  )
}

const gm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** Watt per battito nel tempo, un tipo di cardio alla volta. */
function CardEfficienza({ eff, tipo, setTipo }: {
  eff: Awaited<ReturnType<typeof computeEfficienza>>; tipo: CardioType | null; setTipo: (t: CardioType) => void
}) {
  const tipi = Object.keys(eff) as CardioType[]
  const t = tipo && tipi.includes(tipo) ? tipo : tipi[0]
  const punti = eff[t] ?? []
  const ult = punti[punti.length - 1]
  const primo = punti[0]
  const delta = punti.length > 1 ? Math.round((ult.eff / primo.eff - 1) * 100) : null
  return (
    <div className="card col" style={{ gap: 8 }}>
      <strong style={{ fontSize: 14 }}>Efficienza · W per battito</strong>
      <div className="row wrap" style={{ gap: 5 }}>
        {tipi.map((x) => <button key={x} className={x === t ? 'chip on' : 'chip'} onClick={() => setTipo(x)}>{TYPE_ICON[x]} {TYPE_LABEL[x]}</button>)}
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 34, lineHeight: 1, color: 'var(--cardio)' }}>{fmtEff(ult.eff)}</span>
        <span className="muted small">W/bpm · {gm(ult.date)}</span>
        {delta != null && <span className="small" style={{ marginLeft: 'auto', fontWeight: 600, color: delta >= 0 ? 'var(--good)' : 'var(--fat)' }}>{delta >= 0 ? '▲ +' : '▼ '}{delta}% dal {gm(primo.date)}</span>}
      </div>
      <LineChart points={punti.map((p) => ({ label: p.date, value: p.eff }))} colore="var(--cardio)" vuoto="Dalla seconda seduta coi watt nasce la linea." />
      {punti.length > 1 && <div className="row spread muted" style={{ fontSize: 10.5, marginTop: -4 }}><span>{gm(primo.date)}</span><span>{gm(ult.date)}</span></div>}
      <p className="muted small" style={{ margin: 0, lineHeight: 1.45 }}>Se sale, a parità di battito spingi di più: il cardio ti sta allenando.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {[...punti].reverse().slice(0, 3).map((p, i) => (
          <Fragment key={i}><span className="muted">{gm(p.date)}</span><span>{p.watt} W · {p.bpm} bpm</span><strong>{fmtEff(p.eff)}</strong></Fragment>
        ))}
      </div>
    </div>
  )
}

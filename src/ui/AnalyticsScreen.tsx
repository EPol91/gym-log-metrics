import { useState, Fragment } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeAnalytics } from '../scores/analytics'
import { computeCardioAverages, computeCardioWeekly, computeEfficienza } from '../scores/cardioStats'
import { getCurrentPhase } from '../db/repo'
import { todayLocal } from '../util/date'
import { TYPE_LABEL, TYPE_ICON, fmtEff } from './CardioBlock'
import type { CardioType } from '../db/schema'
import { canUse } from '../entitlements/entitlements'
import { BarChart } from './BarChart'
import { LineChart } from './LineChart'

type Periodo = 4 | 8 | 12 | 'fase'
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
/** «10-29» → «29.10». */
const ggmmDa = (mmdd: string) => `${mmdd.slice(3, 5)}.${mmdd.slice(0, 2)}`

/** Variazione in percentuale come etichetta: «+12%», verde se sale. */
function Variazione({ ora, prima, pct = true }: { ora: number; prima: number; pct?: boolean }) {
  if (!prima && pct) return null
  const v = pct ? Math.round(((ora - prima) / prima) * 100) : ora - prima
  if (v === 0) return <span className="pill-p">=</span>
  return <span className={`pill-p ${v > 0 ? 'su' : 'giu'}`}>{v > 0 ? '+' : '−'}{Math.abs(v)}{pct ? '%' : ''}</span>
}

/**
 * Barre per settimana: l'ultima in oro, le altre spente. Le settimane vuote in
 * testa non si disegnano: il grafico parte dalla prima seduta.
 */
function Barre({ punti }: { punti: { label: string; value: number }[] }) {
  const primo = punti.findIndex((p) => p.value > 0)
  const v = primo < 0 ? [] : punti.slice(primo)
  if (!v.length) return <p className="muted small">Nessun dato.</p>
  const max = Math.max(...v.map((p) => p.value), 1)
  const ogni = v.length > 8 ? 3 : 2
  return (
    <>
      <div style={{ height: 92, display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 10 }}>
        {v.map((p, i) => (
          <div key={i} title={String(p.value)} style={{
            flex: 1, height: `${Math.max(2, (p.value / max) * 100)}%`, borderRadius: '5px 5px 2px 2px',
            background: i === v.length - 1 ? 'linear-gradient(180deg, var(--gold-hi), var(--gold-dim))' : '#3a3220',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {v.map((p, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: i === v.length - 1 ? 'var(--gold)' : 'var(--faint)' }}>
            {i === v.length - 1 || (v.length - 1 - i) % ogni === 0 ? ggmmDa(p.label) : ''}
          </span>
        ))}
      </div>
    </>
  )
}

// onBack assente quando è una scheda dentro Allena: lì si esce con la barra.
export function AnalyticsScreen({ onBack }: { onBack?: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>(8)
  const fase = useLiveQuery(getCurrentPhase, [])
  const settimane = periodo === 'fase'
    ? Math.max(1, Math.min(52, Math.ceil((Date.parse(todayLocal()) - Date.parse(fase?.startDate ?? todayLocal())) / (7 * 86_400_000)) + 1))
    : periodo
  const data = useLiveQuery(() => computeAnalytics(settimane), [settimane])
  const [tuttiMuscoli, setTuttiMuscoli] = useState(false)
  const [cardioPeriod, setCardioPeriod] = useState(7)
  const cardioAvg = useLiveQuery(() => computeCardioAverages(cardioPeriod), [cardioPeriod])
  const cardioWeekly = useLiveQuery(() => computeCardioWeekly(8), [])
  const eff = useLiveQuery(computeEfficienza, [])
  const [tipoEff, setTipoEff] = useState<CardioType | null>(null)

  const testa = onBack && (
    <div className="barra-s">
      <button className="ind" onClick={onBack}>‹ Indietro</button>
      <span className="tit">Analisi</span>
      <span style={{ width: 70 }} />
    </div>
  )

  // Analisi avanzate = feature Premium.
  if (!canUse('advanced-charts')) {
    return (
      <div className="col">
        {testa}
        <div className="card"><p className="muted small">Funzione Premium.</p></div>
      </div>
    )
  }

  const ton = data?.weeklyTonnage ?? []
  const sed = data?.weeklySessions ?? []
  const ultimo = <T,>(a: T[]) => a[a.length - 1]
  const serie = data ? data.seriePerGruppo.reduce((a, g) => a + g.value, 0) : 0
  const voti = data?.workoutScores ?? []
  const mediaVoti = voti.length ? Math.round(voti.reduce((a, p) => a + p.value, 0) / voti.length) : null

  return (
    <div className="col" style={{ gap: 10 }}>
      {testa}
      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {([4, 8, 12] as const).map((w) => (
          <button key={w} className={periodo === w ? 'chip on' : 'chip'} onClick={() => setPeriodo(w)}>{w} sett</button>
        ))}
        {fase && <button className={periodo === 'fase' ? 'chip on' : 'chip'} onClick={() => setPeriodo('fase')}>Da inizio fase</button>}
      </div>

      {!data ? (
        <p className="muted">Calcolo…</p>
      ) : data.totalSessions === 0 ? (
        <div className="card"><p className="muted small">Nessun dato ancora.</p></div>
      ) : (
        <>
          <div className="card" style={{ margin: 0 }}>
            <div className="row spread">
              <span className="etichetta-p">Tonnellaggio a settimana</span>
              {ton.length > 1 && <Variazione ora={ultimo(ton).value} prima={ton[ton.length - 2].value} />}
            </div>
            <div style={{ marginTop: 4 }}>
              <b className="num" style={{ fontSize: 28 }}>{migliaia(ultimo(ton)?.value ?? 0)}</b>
              <span className="muted" style={{ fontSize: 12.5 }}> kg · ultima settimana</span>
            </div>
            <Barre punti={ton} />
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="row spread">
              <span className="etichetta-p">Sedute a settimana</span>
              {sed.length > 1 && <Variazione ora={ultimo(sed).value} prima={sed[sed.length - 2].value} pct={false} />}
            </div>
            <div style={{ marginTop: 4 }}>
              <b className="num" style={{ fontSize: 28 }}>{ultimo(sed)?.value ?? 0}</b>
              <span className="muted" style={{ fontSize: 12.5 }}> sedute · ultima settimana</span>
            </div>
            <Barre punti={sed} />
          </div>

          {/* Le serie per gruppo sono il numero su cui si programma davvero: il
              tonnellaggio dice quanto hai spostato, non quante volte hai
              stimolato il dorso. Il riscaldamento non allena, e infatti non conta. */}
          {data.seriePerGruppo.length > 0 && (
            <div className="card" style={{ margin: 0 }}>
              <div className="row spread">
                <span className="etichetta-p">Serie per muscolo · 7 giorni</span>
                <span className="muted" style={{ fontSize: 12 }}>{serie}{data.seriePrima ? ` · prima ${data.seriePrima}` : ''}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                {(tuttiMuscoli ? data.seriePerGruppo : data.seriePerGruppo.slice(0, 4)).map((g) => (
                  <div key={g.label} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 30px', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
                    <span style={{ textTransform: 'capitalize' }}>{g.label}</span>
                    <span style={{ height: 8, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', borderRadius: 99, background: 'var(--gold)', width: `${(g.value / (data.seriePerGruppo[0].value || 1)) * 100}%` }} />
                    </span>
                    <span className="num" style={{ textAlign: 'right', fontSize: 15 }}>{g.value}</span>
                  </div>
                ))}
                {data.seriePerGruppo.length > 4 && (
                  <button className="ghost small" style={{ padding: '4px 0', border: 0 }} onClick={() => setTuttiMuscoli((v) => !v)}>
                    {tuttiMuscoli ? 'meno' : `+ ${data.seriePerGruppo.length - 4} muscoli`}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ margin: 0 }}>
            <div className="row spread">
              <span className="etichetta-p">Workout Score</span>
              {mediaVoti != null && <span className="pill-p">media {mediaVoti}</span>}
            </div>
            {voti.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <b className="num" style={{ fontSize: 28 }}>{ultimo(voti).value}</b>
                <span className="muted" style={{ fontSize: 12.5 }}> · ultima seduta</span>
              </div>
            )}
            <LineChart points={voti} />
          </div>
        </>
      )}

      {cardioAvg && cardioAvg.count > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="etichetta-p">Cardio · media {cardioPeriod === 7 ? 'settimana' : 'mese'}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className={cardioPeriod === 7 ? 'chip on' : 'chip'} onClick={() => setCardioPeriod(7)}>7g</button>
              <button className={cardioPeriod === 30 ? 'chip on' : 'chip'} onClick={() => setCardioPeriod(30)}>30g</button>
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

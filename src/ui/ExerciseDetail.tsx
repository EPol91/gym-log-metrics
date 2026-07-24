import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeExerciseDetail } from '../scores/exerciseStats'
import { LineChart } from './LineChart'
import { AiInsight } from './AiInsight'
import { Info } from './anim'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
}

type Metric = 'e1rm' | 'volume' | 'weight'
const METRICS: { key: Metric; chip: string; title: string; unit: string }[] = [
  { key: 'e1rm', chip: 'e1RM', title: 'Andamento e1RM', unit: 'kg' },
  { key: 'volume', chip: 'Volume', title: 'Andamento volume', unit: 'reps' },
  { key: 'weight', chip: 'Peso top', title: 'Andamento peso top', unit: 'kg' },
]

export function ExerciseDetail({ exerciseId, onBack }: { exerciseId: string; onBack: () => void }) {
  const d = useLiveQuery(() => computeExerciseDetail(exerciseId), [exerciseId])
  const [metric, setMetric] = useState<Metric>('e1rm')

  if (!d) return <div className="col"><p className="muted">Carico…</p></div>

  const trendUp = d.trendPct > 1
  const trendDown = d.trendPct < -1
  const trendColor = trendUp ? 'var(--good)' : trendDown ? '#e57373' : 'var(--muted)'

  return (
    <div className="col">
      <div className="row spread">
        <button className="ghost small" onClick={onBack}>← Esercizi</button>
        <span className="muted small">{d.muscle}</span>
      </div>
      <h1>{d.name}</h1>

      <div className="grid2">
        <div className="card" style={{ margin: 0 }}>
          <div className="muted small">PR (e1RM)<Info text="e1RM = massimo su 1 ripetizione STIMATO dai tuoi set (formula Epley: peso × (1 + reps/30)). Permette di confrontare serie con reps diverse. PR = il tuo record." /></div>
          <div className="score"><span className="val">{d.prE1rm || '—'}</span><span className="muted small">kg</span></div>
          {d.prDate && <div className="muted small">il {d.prDate}</div>}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="muted small">Trend e1RM<Info align="right" text="Variazione % della forza stimata (e1RM) dalla prima all'ultima seduta di questo esercizio. Verde = in crescita, rosso = in calo." /></div>
          <div className="score">
            <span className="val" style={{ color: trendColor, fontSize: 32 }}>
              {d.trendPct > 0 ? '+' : ''}{d.trendPct.toFixed(1)}%
            </span>
          </div>
          <div className="muted small">{d.points.length} sedute</div>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {METRICS.map((m) => (
          <button key={m.key} className={metric === m.key ? 'sel small' : 'ghost small'} onClick={() => setMetric(m.key)}>{m.chip}</button>
        ))}
      </div>
      <div className="card">
        <div className="muted small" style={{ marginBottom: 6 }}>{METRICS.find((m) => m.key === metric)!.title}</div>
        <LineChart points={d.points.map((p) => ({
          label: p.date,
          value: metric === 'e1rm' ? p.bestE1rm : metric === 'volume' ? p.volume : p.topWeight,
        }))} />
      </div>

      <div className="card">
        <div className="muted small" style={{ marginBottom: 6 }}>Ultime sedute</div>
        {[...d.points].reverse().map((p, i) => (
          <div className="setline" key={i}>
            <span className="muted small">{p.date}</span>
            <span>{p.topWeight}kg × {p.topReps} · e1RM {p.bestE1rm}</span>
            <span className="muted small">{TYPE_LABEL[p.type] ?? p.type}</span>
          </div>
        ))}
      </div>

      <AiInsight
        label="Analizza questo esercizio"
        buildPrompt={() => {
          const rows = d.points.map((p) => `${p.date}: ${p.topWeight}kg×${p.topReps} (e1RM ${p.bestE1rm}), vol ${p.volume}, ${p.type}`).join('\n')
          return `Esercizio: ${d.name} (${d.muscle}).\nPR e1RM: ${d.prE1rm} kg${d.prDate ? ` il ${d.prDate}` : ''}.\nTrend e1RM: ${d.trendPct.toFixed(1)}% su ${d.points.length} sedute.\nStorico sedute:\n${rows}\n\nInterpreta l'andamento di questo esercizio: progresso, stallo o regresso? Suggerimenti concreti. Se i dati sono pochi, dillo.`
        }}
      />
    </div>
  )
}

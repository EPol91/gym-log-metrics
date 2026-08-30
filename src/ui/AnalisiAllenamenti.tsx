// Analisi: i quattro punteggi e i grafici delle sedute.
//
// Stava in Salute, che pero' e' il posto di come STAI — vitali, corpo,
// abitudini. Questi guardano come ti ALLENI, e li cercavi in Allena: adesso
// stanno li'. E' un file suo perche' due schermate lo usino senza copiarlo.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { AnalyticsScreen } from './AnalyticsScreen'
import { ScoreRing } from './anim'
import { ScoreDetail } from './ScoreDetail'

const SCORES = [
  { key: 'readiness', label: 'Readiness', tip: 'Readiness' },
  { key: 'workout', label: 'Workout', tip: 'Workout' },
  { key: 'performance', label: 'Perf.', tip: 'Performance' },
  { key: 'consistency', label: 'Constan.', tip: 'Consistency' },
] as const

const SCORE_TIPS: Record<string, string> = {
  Readiness: 'Quanto sei pronto oggi. Dal check pre-workout (sonno · stanchezza · indolenzimento · energia) e dal carico recente.',
  Workout: 'Qualità della seduta appena fatta rispetto ai TUOI standard: volume, intensità (RIR/e1RM), PR.',
  Performance: 'Stai progredendo? Trend di forza (e1RM) e volume su ~6 settimane, tarato sulla fase.',
  Consistency: 'Quanto sei costante: sedute vs obiettivo settimanale, regolarità e streak.',
}

const SCORE_FOOTER: Record<string, string> = {
  readiness: 'Dal check di oggi · rifallo toccando l’anello grande in Oggi.',
  workout: 'Riferito all’ultima seduta conclusa · il confronto è con le TUE sedute dello stesso tipo.',
  performance: 'Finestra ~6 settimane · la fase si imposta nel Profilo.',
  consistency: 'Finestra 4 settimane · l’obiettivo settimanale si cambia nel Profilo.',
}

/** I quattro Score: erano in Home, ma sono andamenti — il loro posto è qui. */
export function AnalisiAllenamenti() {
  const home = useLiveQuery(computeHome, [])
  // Ogni anello apre il suo dettaglio: senza, resta un numero che non spiega da dove viene.
  const [detail, setDetail] = useState<typeof SCORES[number]['key'] | null>(null)

  return (
    <>
      {home && (
        <div className="card">
          <div className="row" style={{ gap: 4 }}>
            {SCORES.map((s) => (
              <button key={s.key} onClick={() => setDetail(s.key)} aria-label={`Dettaglio ${s.tip}`}
                style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0 }}>
                <ScoreRing value={home[s.key].value} size={58} />
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{s.label} ›</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {home && detail && (
        <ScoreDetail
          title={SCORES.find((s) => s.key === detail)!.tip}
          subtitle={SCORE_TIPS[SCORES.find((s) => s.key === detail)!.tip]}
          score={home[detail]}
          footer={SCORE_FOOTER[detail]}
          onClose={() => setDetail(null)}
        />
      )}
      <AnalyticsScreen />
    </>
  )
}

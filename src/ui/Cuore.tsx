// Il riquadro del cuore, per una finestra di tempo.
//
// Lo stesso componente serve due domande diverse: com'e' andato il cuore in
// tutta la seduta, e com'e' andato nel solo cardio. Cambia l'intervallo, non
// il conto — cosi' i due numeri non possono contraddirsi.

import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, listMeasurements } from '../db/repo'
import { metricheCuore, kcalDaCuore, type SerieCuore } from '../metrics/cuore'

const ZONE_LABEL: Record<number, string> = {
  1: 'Z1 recupero', 2: 'Z2 fondo', 3: 'Z3 soglia', 4: 'Z4 intenso', 5: 'Z5 massimale',
}

export function Cuore({ hr, da, a, titolo }: {
  hr?: SerieCuore
  da?: string | null
  a?: string | null
  titolo: string
}) {
  const user = useLiveQuery(getUser, [])
  const misure = useLiveQuery(listMeasurements, [])

  if (!hr?.bpm?.length) return null
  const eta = user?.birthYear ? new Date().getFullYear() - user.birthYear : 0
  const m = metricheCuore(hr, { age: eta, restingHr: user?.restingHr, maxHr: user?.hrMaxMeasured }, da, a)
  if (!m) return null

  const peso = misure?.length ? misure[misure.length - 1].weight : null
  const kcal = kcalDaCuore(m, peso, eta, user?.sex)
  const secTot = Object.values(m.zone).reduce((x, y) => x + y, 0)

  const cella = (v: string | number, l: string) => (
    <div key={l} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ color: 'var(--gold)', fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div className="muted" style={{ fontSize: 10 }}>{l}</div>
    </div>
  )

  return (
    <div className="card">
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <label className="fl" style={{ margin: 0 }}>♥ {titolo}</label>
        <span className="muted small">{m.minuti} min · {m.letture} letture</span>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        {cella(m.min, 'minimo')}
        {cella(m.media, 'media')}
        {cella(m.max, 'massimo')}
        {kcal != null && cella(kcal, 'kcal')}
      </div>

      {/* Il tempo in zona dice cosa e' stato davvero quello sforzo: due sedute
          con la stessa media possono essere due allenamenti diversi. */}
      {secTot > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }}>
            {([1, 2, 3, 4, 5] as const).map((z) => {
              const pct = (m.zone[z] / secTot) * 100
              if (pct <= 0) return null
              const colori = ['#4caf50', '#8bc34a', '#FFC63D', '#ff9800', '#e74c3c']
              return <div key={z} style={{ width: `${pct}%`, background: colori[z - 1] }} title={ZONE_LABEL[z]} />
            })}
          </div>
          <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
            {([1, 2, 3, 4, 5] as const).filter((z) => m.zone[z] > 0).map((z) => (
              <span key={z} className="muted" style={{ fontSize: 10 }}>
                {ZONE_LABEL[z]} {Math.round(m.zone[z] / 60)}′
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

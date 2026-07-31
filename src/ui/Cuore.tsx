// Il riquadro del cuore, per una finestra di tempo.
//
// Lo stesso componente serve due domande diverse: com'e' andato il cuore in
// tutta la seduta, e com'e' andato nel solo cardio. Cambia l'intervallo, non
// il conto — cosi' i due numeri non possono contraddirsi.

import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, listMeasurements } from '../db/repo'
import { metricheCuore, kcalDaCuore, recuperoCuore, puntiCuore, type SerieCuore } from '../metrics/cuore'

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
  const rec = recuperoCuore(hr, da, a)
  const punti = puntiCuore(hr, da, a)

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
        {/* Quanto della seduta ha davvero un battito. Sotto il 90% lo si dice
            in chiaro: una media su meta' allenamento non e' la tua media. */}
        <span className="muted small">
          {m.copertura < 90 && m.minutiFinestra > m.minuti
            ? `${m.minuti} min su ${m.minutiFinestra} · ${m.copertura}%`
            : `${m.minuti} min · ${m.letture} letture`}
        </span>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        {cella(m.min, 'minimo')}
        {cella(m.media, 'media')}
        {cella(m.max, 'massimo')}
        {kcal != null && cella(kcal, 'kcal')}
      </div>

      {/* L'andamento: dove hai spinto e dove hai tirato il fiato. Una media da
          sola non distingue una salita costante da venti picchi. */}
      {punti.length > 3 && <Andamento punti={punti} min={m.min} max={m.max} />}

      {/* Quanto scende nel minuto dopo il picco: e' l'indicatore piu' onesto di
          come stai messo, e chi scende in fretta e' quello allenato. */}
      {rec && (
        <div className="row spread" style={{ marginTop: 8 }}>
          <span className="muted small">Recupero a {rec.secondi}″ dal picco</span>
          <span className="small" style={{ color: 'var(--gold)' }}>−{rec.caduta} bpm · {rec.da} → {rec.a}</span>
        </div>
      )}

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

/** L'andamento del cuore nella finestra: una linea, senza assi ne' fronzoli. */
function Andamento({ punti, min, max }: { punti: number[]; min: number; max: number }) {
  const W = 300, H = 54
  const span = Math.max(1, max - min)
  // Con mille letture non serve un punto per pixel: si assottiglia, e la forma
  // resta la stessa mentre il disegno diventa leggero.
  const passo = Math.max(1, Math.floor(punti.length / W))
  const p: string[] = []
  for (let i = 0; i < punti.length; i += passo) {
    const x = (i / (punti.length - 1)) * W
    const y = H - ((punti[i] - min) / span) * (H - 6) - 3
    p.push(`${p.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 10, display: 'block' }} aria-hidden="true">
      <path d={p.join(' ')} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

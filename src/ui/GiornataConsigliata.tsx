// 🦠RS — quale giornata tocca oggi.
//
// Questo riquadro SEGNALA, non compila. Il basso e l'alto li dice la
// ciclizzazione del coach (L L L H L H L da lunedì); ON e OFF li scegli tu,
// perché dipendono dal fatto che ti alleni. Scelto, quella diventa la giornata
// selezionata — cioè gli obiettivi del giorno — e finisce lì.
//
// Non tocca il diario: non aggiunge righe, non ne toglie, non sostituisce
// niente. Compilare la giornata è un'altra cosa e si fa da un'altra parte
// (🗓 Giornate tipo), con un gesto tuo.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consiglioGiornata } from '../rs/ciclo'
import { upsertNutrition } from '../db/repo'

export function GiornataConsigliata({ date }: { date: string }) {
  const consiglio = useLiveQuery(() => consiglioGiornata(date), [date])
  // Hai toccato il riquadro di una giornata già scelta: vuoi cambiarla.
  const [riapri, setRiapri] = useState(false)

  if (!consiglio) return null

  /** Sceglie la giornata del giorno. Nient'altro: il diario resta com'è. */
  async function scegli(on: boolean) {
    await upsertNutrition(date, { dayType: consiglio!.chiave(on) as never })
    setRiapri(false)
  }

  const parte = consiglio.carbo === 'H' ? 'HIGH' : 'LOW'
  const colore = consiglio.carbo === 'H' ? 'var(--carb)' : 'var(--gold)'
  const etichetta = { fontSize: 9, letterSpacing: '.06em', display: 'block', lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

  /**
   * Hai già scelto: resta il promemoria di cosa dice il calendario.
   *
   * Di suo non propone niente — se hai messo OFF a mano non deve essere l'app a
   * rimetterti ON perché risulta una seduta. Ma si tocca: allora, e solo allora,
   * tira fuori ON e OFF per cambiarla.
   */
  if (consiglio.giaScelta && !riapri) {
    const uguale = consiglio.giaScelta.startsWith(`rs_${parte.toLowerCase()}`)
    return (
      <button className="card" onClick={() => setRiapri(true)}
        aria-label={`Oggi tocca ${parte}. Tocca per cambiare la giornata`}
        style={{
          flex: 1.2, minWidth: 0, margin: 0, padding: '3px 8px 4px', textAlign: 'left',
          background: 'var(--surface)', borderColor: 'var(--line)', borderRadius: 14,
        }}>
        <span className="muted" style={etichetta}>OGGI TOCCA</span>
        <span className="row" style={{ gap: 5, alignItems: 'center', height: 24, flexWrap: 'nowrap' }}>
          <strong style={{ color: colore, fontSize: 12.5 }}>{parte}</strong>
          <span className="muted" style={{ fontSize: 10.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {uguale ? '· scelta' : '· diversa'}
          </span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>›</span>
        </span>
      </button>
    )
  }

  /**
   * I tasti sono alti quanto tutto il riquadro, non quanto la loro riga: un
   * bersaglio da ventitré pixel col pollice non lo prendi, e allungare la
   * pastiglia non costa un pixel in verticale.
   */
  const tasto = { padding: '0 4px', fontSize: 11.5, lineHeight: 1.1, alignSelf: 'stretch' } as const
  return (
    <div className="card" style={{
      flex: 1.5, minWidth: 0, margin: 0, padding: '3px 5px 4px', borderColor: 'var(--gold)',
      display: 'flex', alignItems: 'stretch', gap: 4,
    }}>
      <span style={{ minWidth: 0, flex: '0 1 auto' }}>
        <span className="muted" style={etichetta}>OGGI TOCCA</span>
        <strong style={{ color: colore, fontSize: 12.5, display: 'block', lineHeight: '24px' }}>{parte}</strong>
      </span>
      <button className="ghost" style={{ ...tasto, flex: 1, minWidth: 38 }} onClick={() => void scegli(true)}>ON</button>
      <button className="ghost" style={{ ...tasto, flex: 1, minWidth: 38 }} onClick={() => void scegli(false)}>OFF</button>
    </div>
  )
}

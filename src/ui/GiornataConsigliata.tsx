// 🦠RS — quale giornata tocca oggi.
//
// Un cartello, niente di più: dice HIGH o LOW secondo la ciclizzazione del
// coach (L L L H L H L da lunedì), così non devi ricordarti a mente a che punto
// sei della settimana — basta un giorno saltato e resti sfasato di uno.
//
// Non sceglie e non compila: la giornata la selezioni tu dalla tendina «DAL
// COACH», che è lì accanto, e i pasti li porti nel diario quando vuoi tu da
// 🗓 Giornate tipo. ON e OFF non li può sapere: dipendono dal fatto che ti
// alleni, e quello lo sai solo tu.

import { useLiveQuery } from 'dexie-react-hooks'
import { consiglioGiornata } from '../rs/ciclo'

export function GiornataConsigliata({ date }: { date: string }) {
  const consiglio = useLiveQuery(() => consiglioGiornata(date), [date])
  if (!consiglio) return null

  const parte = consiglio.carbo === 'H' ? 'HIGH' : 'LOW'
  const colore = consiglio.carbo === 'H' ? 'var(--carb)' : 'var(--gold)'

  return (
    <div className="card" style={{ flex: 0.9, minWidth: 0, margin: 0, padding: '3px 8px 4px' }}>
      <span className="muted" style={{
        fontSize: 9, letterSpacing: '.06em', display: 'block', lineHeight: '12px',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>OGGI TOCCA</span>
      <strong style={{ color: colore, fontSize: 12.5, display: 'block', lineHeight: '24px' }}>{parte}</strong>
    </div>
  )
}

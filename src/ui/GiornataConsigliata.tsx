// 🦠RS — la giornata che tocca oggi, a un tocco.
//
// Il basso e l'alto li dice il calendario (la ciclizzazione del coach, L L L H
// L H L da lunedì); ON e OFF li decidi tu, perché dipendono dal fatto che ti
// alleni. Se però quel giorno una seduta c'è già, ON non è un'opinione: la
// domanda sparisce e resta un tasto solo.
//
// Sparisce da sola appena hai scelto: un suggerimento che resta lì dopo che
// hai deciso non è un aiuto, è un ingombro.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { consiglioGiornata } from '../rs/ciclo'
import { listDayTemplates, applyDayTemplate, undoDayApply, computeDiary } from '../db/diet'
import { upsertNutrition } from '../db/repo'
import { pushUndo } from '../util/undo'

export function GiornataConsigliata({ date }: { date: string }) {
  const consiglio = useLiveQuery(() => consiglioGiornata(date), [date])
  const modelli = useLiveQuery(listDayTemplates, []) ?? []
  const diario = useLiveQuery(() => computeDiary(date), [date])
  const [busy, setBusy] = useState(false)

  if (!consiglio) return null

  const righe = diario?.meals.reduce((a, m) => a + m.entries.length, 0) ?? 0

  async function applica(on: boolean) {
    const nome = consiglio!.nome(on)
    const modello = modelli.find((m) => m.name === nome)
    if (!modello) return
    // Se la giornata ha già roba dentro, decidi tu: sovrascrivere il diario di
    // qualcuno senza chiedere è il modo più rapido per fargli perdere il lavoro.
    let sostituisci = righe === 0
    if (righe > 0) {
      sostituisci = confirm(`Questa giornata ha già ${righe} righe.\n\nOK = sostituisci tutto con "${nome}"\nAnnulla = aggiungi in coda`)
    }
    setBusy(true)
    try {
      const snap = await applyDayTemplate(modello.id, date, sostituisci)
      // Gli obiettivi della giornata seguono il piano: applicare i pasti e
      // lasciare i target di ieri farebbe leggere numeri sbagliati tutto il giorno.
      await upsertNutrition(date, { dayType: consiglio!.chiave(on) as never })
      pushUndo(`Giornata "${nome}" applicata`, () => undoDayApply(snap, date))
    } finally { setBusy(false) }
  }

  const parte = consiglio.carbo === 'H' ? 'HIGH' : 'LOW'
  const colore = consiglio.carbo === 'H' ? 'var(--carb)' : 'var(--gold)'

  /**
   * Hai già scelto: qui resta solo il promemoria di cosa dice il calendario.
   *
   * Niente tasti. Se hai messo OFF a mano e l'app ti riproponesse ON perché
   * risulta una seduta, ti starebbe contraddicendo su una cosa che decidi tu —
   * ed è esattamente quello che faceva prima.
   */
  if (consiglio.giaScelta) {
    const uguale = consiglio.giaScelta.startsWith(`rs_${parte.toLowerCase()}`)
    return (
      <div className="card" style={{ flex: 1.2, minWidth: 0, margin: 0, padding: '3px 8px 4px' }}>
        <span className="muted" style={{ fontSize: 9, letterSpacing: '.06em', display: 'block', lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>OGGI TOCCA</span>
        <span className="row" style={{ gap: 5, alignItems: 'center', height: 20, flexWrap: 'nowrap' }}>
          <strong style={{ color: colore, fontSize: 12.5 }}>{parte}</strong>
          <span className="muted" style={{ fontSize: 10.5 }}>{uguale ? '· scelta' : '· diversa'}</span>
        </span>
      </div>
    )
  }

  /**
   * Il terzo riquadro, alto come gli altri due: qui non si ruba spazio a niente.
   *
   * I tasti sono alti quanto tutto il riquadro, non quanto la loro riga: un
   * bersaglio da ventitré pixel col pollice non lo prendi, e allungare la
   * pastiglia non costa un solo pixel in verticale.
   */
  const tasto = { padding: '0 4px', fontSize: 11.5, lineHeight: 1.1, alignSelf: 'stretch' } as const
  return (
    <div className="card" style={{
      flex: 1.5, minWidth: 0, margin: 0, padding: '3px 5px 4px', borderColor: 'var(--gold)',
      display: 'flex', alignItems: 'stretch', gap: 4,
    }}>
      <span style={{ minWidth: 0, flex: '0 1 auto' }}>
        <span className="muted" style={{ fontSize: 9, letterSpacing: '.06em', display: 'block', lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>OGGI TOCCA</span>
        <strong style={{ color: colore, fontSize: 12.5, display: 'block', lineHeight: '24px' }}>{parte}</strong>
      </span>
      {consiglio.allenato ? (
        // Una seduta c'è: ON non è una domanda, si applica e basta.
        <button className="ghost" style={{ ...tasto, flex: 1, minWidth: 52 }}
          disabled={busy} onClick={() => applica(true)}>applica<br />ON</button>
      ) : (
        <>
          <button className="ghost" style={{ ...tasto, flex: 1, minWidth: 38 }}
            disabled={busy} onClick={() => applica(true)}>ON</button>
          <button className="ghost" style={{ ...tasto, flex: 1, minWidth: 38 }}
            disabled={busy} onClick={() => applica(false)}>OFF</button>
        </>
      )}
    </div>
  )
}

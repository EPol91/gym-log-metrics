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
  const [riapri, setRiapri] = useState(false)

  if (!consiglio) return null
  // Hai già scelto la giornata: niente da suggerire, solo il modo di cambiarla.
  if (consiglio.giaScelta && !riapri) {
    return (
      <p className="muted small" style={{ margin: '0 0 6px', textAlign: 'right' }}>
        <button className="ghost small" onClick={() => setRiapri(true)}>✎ cambia giornata</button>
      </p>
    )
  }

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
      setRiapri(false)
      pushUndo(`Giornata "${nome}" applicata`, () => undoDayApply(snap, date))
    } finally { setBusy(false) }
  }

  const parte = consiglio.carbo === 'H' ? 'HIGH' : 'LOW'
  const colore = consiglio.carbo === 'H' ? 'var(--carb)' : 'var(--gold)'

  return (
    <div className="card" style={{ padding: '9px 12px', borderColor: 'var(--rs)', margin: '0 0 8px' }}>
      <div className="row spread" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="muted small" style={{ letterSpacing: '.06em' }}>{consiglio.giorno.toUpperCase()} · TOCCA</span>
          <strong style={{ display: 'block', color: colore, fontSize: 15 }}>{parte}</strong>
        </span>

        {consiglio.allenato ? (
          // Una seduta c'è: ON non è una domanda.
          <button className="chip on" disabled={busy} onClick={() => applica(true)}>
            Applica {consiglio.nome(true)}
          </button>
        ) : (
          <span className="row" style={{ gap: 6, flex: 'none' }}>
            <span className="muted small">ti alleni?</span>
            <button className="chip on" disabled={busy} onClick={() => applica(true)}>ON</button>
            <button className="chip" disabled={busy} onClick={() => applica(false)}>OFF</button>
          </span>
        )}
      </div>
      {consiglio.allenato && (
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Oggi risulta una seduta: se non era allenamento, scegli la giornata a mano dalla tendina.
        </p>
      )}
    </div>
  )
}

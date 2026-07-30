import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listDayTemplates, saveDayAsTemplate, applyDayTemplate, deleteDayTemplate,
  renameDayTemplate, undoDayApply, computeDiary,
} from '../db/diet'
import { deleteWithUndo } from '../db/trash'
import { pushUndo } from '../util/undo'

/**
 * Giornate tipo: una giornata alimentare intera salvata come modello e
 * riapplicabile. Nasce per i giorni che nello split si ripetono uguali — ON e
 * OFF — dove ricompilare tutto a mano è lavoro buttato.
 *
 * Applicare è sempre annullabile: riempire un giorno per sbaglio si disfa in un tocco.
 */
export function DayTemplates({ date, onClose }: { date: string; onClose: () => void }) {
  const modelli = useLiveQuery(listDayTemplates, []) ?? []
  const diario = useLiveQuery(() => computeDiary(date), [date])
  const [esito, setEsito] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const righeOggi = diario?.meals.reduce((a, m) => a + m.entries.length, 0) ?? 0

  async function applica(id: string, nome: string) {
    // Se la giornata ha già roba dentro, chiedo: sovrascrivere il diario di
    // qualcuno senza avvisarlo è il modo più rapido per fargli perdere dati.
    // Giornata senza righe: i pasti che ci sono sono quelli creati d ufficio,
    // quindi il modello li sostituisce invece di accodarsi e lasciarne otto.
    let sostituisci = righeOggi === 0
    if (righeOggi > 0) {
      const r = confirm(`Questa giornata ha già ${righeOggi} righe.\n\nOK = sostituisci tutto con "${nome}"\nAnnulla = aggiungi in coda`)
      sostituisci = r
    }
    setBusy(true)
    const snap = await applyDayTemplate(id, date, sostituisci)
    setBusy(false)
    setEsito(`"${nome}" applicata: ${snap.creati.length} righe.`)
    pushUndo(`Giornata "${nome}" applicata`, () => undoDayApply(snap, date))
  }

  return (
    <div className="col">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" onClick={onClose}>‹ Dieta</button>
        <button className="chip on" disabled={busy || righeOggi === 0}
          onClick={async () => {
            const n = prompt('Nome della giornata tipo', 'ON')?.trim()
            if (!n) return
            setBusy(true)
            const id = await saveDayAsTemplate(date, n)
            setBusy(false)
            setEsito(id ? `Giornata salvata come "${n}".` : 'Questa giornata è vuota: non c\'è niente da salvare.')
          }}>
          ＋ Salva questa giornata
        </button>
      </div>

      <h1>Giornate tipo</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Compili una giornata una volta, la salvi, e da lì in avanti la riapplichi in un tocco.
        {righeOggi === 0 && ' Per salvarne una serve che la giornata aperta abbia almeno una riga.'}
      </p>

      {esito && <p className="small" style={{ color: 'var(--gold)', marginTop: 0 }}>{esito}</p>}

      {modelli.length === 0 ? (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            Nessuna giornata tipo. Compila un giorno come lo vuoi — per esempio un ON — poi torna
            qui e salvalo: i giorni uguali diventano un tocco.
          </p>
        </div>
      ) : (
        modelli.map((t) => {
          const righe = t.meals.reduce((a, m) => a + m.items.length, 0)
          return (
            <div className="card" key={t.id} style={{ padding: '11px 12px' }}>
              <div className="row spread" style={{ alignItems: 'center' }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{t.name}</strong>
                  <span className="muted small" style={{ display: 'block' }}>
                    {t.meals.length} pasti · {righe} righe
                    {t.lastUsedAt ? ` · usata il ${t.lastUsedAt.slice(0, 10)}` : ''}
                  </span>
                </span>
                <button className="chip on" style={{ flex: 'none' }} disabled={busy}
                  onClick={() => applica(t.id, t.name)}>Applica</button>
              </div>

              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <button className="chip" onClick={async () => {
                  const n = prompt('Nuovo nome', t.name)?.trim()
                  if (n) await renameDayTemplate(t.id, n)
                }}>✎ Rinomina</button>
                <button className="chip" style={{ color: '#e57373' }} onClick={async () => {
                  if (!confirm(`Eliminare la giornata tipo "${t.name}"?`)) return
                  await deleteWithUndo(`Giornata tipo "${t.name}" eliminata`, () => deleteDayTemplate(t.id))
                }}>🗑 Elimina</button>
              </div>

              {/* Cosa contiene, per non applicare a scatola chiusa */}
              <div className="muted small" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                {t.meals.map((m) => `${m.name} (${m.items.length})`).join(' · ')}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

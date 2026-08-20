import { useState } from 'react'
import { fmtData } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listDayTemplates, saveDayAsTemplate, applyDayTemplate, deleteDayTemplate,
  renameDayTemplate, undoDayApply, computeDiary,
} from '../db/diet'
import { deleteWithUndo } from '../db/trash'
import { pushUndo } from '../util/undo'
import { GiornataEditor } from './GiornataEditor'
import { consiglioGiornata } from '../rs/ciclo'

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
  const [modifica, setModifica] = useState<string | null>(null)
  // Le due giornate che tocca oggi: quella con l'allenamento e quella senza.
  // Fra ON e OFF non decide l'app — ma dire quale metà della settimana sei sì.
  const consiglio = useLiveQuery(() => consiglioGiornata(date), [date])
  const consigliate = consiglio ? [consiglio.nome(true), consiglio.nome(false)] : []

  const righeOggi = diario?.meals.reduce((a, m) => a + m.entries.length, 0) ?? 0

  async function applica(id: string, nome: string) {
    /*
     * Giornata già compilata: non si applica e basta.
     *
     * Niente sovrascrittura — quello che hai scritto vale più di un modello — e
     * niente aggiunta in coda, che vuol dire pasti doppi. Per rifarla la svuoti
     * tu dal diario col 🧹, che è un tocco ed è annullabile.
     */
    if (righeOggi > 0) {
      setEsito(`La giornata ha già ${righeOggi} righe: non ci scrivo sopra. Svuotala dal diario (🧹) e riapplica "${nome}".`)
      return
    }
    setBusy(true)
    // I pasti che ci sono sono quelli creati d'ufficio, vuoti: il modello
    // prende il loro posto invece di accodarsi e lasciarne otto.
    const snap = await applyDayTemplate(id, date, true)
    setBusy(false)
    setEsito(`"${nome}" applicata: ${snap.creati.length} righe.`)
    pushUndo(`Giornata "${nome}" applicata`, () => undoDayApply(snap, date))
  }

  // Una giornata aperta in correzione si prende tutta la schermata: qui dentro
  // si lavora riga per riga, e mezzo elenco sopra sarebbe solo rumore.
  if (modifica) return <GiornataEditor templateId={modifica} onClose={() => setModifica(null)} />

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
                  {/* Quale tocca oggi lo dice la ciclizzazione: entrando da qui
                      non devi ricordarti a che punto sei della settimana. */}
                  {consigliate.includes(t.name) && (
                    <span className="chip" style={{ marginLeft: 6, padding: '2px 7px', fontSize: 10, color: 'var(--rs)', borderColor: 'var(--rs)' }}>
                      consigliata oggi
                    </span>
                  )}
                  <span className="muted small" style={{ display: 'block' }}>
                    {t.meals.length} pasti · {righe} righe
                    {t.lastUsedAt ? ` · usata il ${fmtData(t.lastUsedAt)}` : ''}
                  </span>
                </span>
                <button className="chip on" style={{ flex: 'none' }} disabled={busy}
                  onClick={() => applica(t.id, t.name)}>Applica</button>
              </div>

              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {/* Correggerla PRIMA di applicarla: gli alimenti del coach non
                    sono sempre i tuoi, e rifare le stesse sostituzioni ogni
                    giorno in Cibo e' lavoro buttato. */}
                <button className="chip" onClick={() => setModifica(t.id)}>✎ Modifica</button>
                <button className="chip" onClick={async () => {
                  const n = prompt('Nuovo nome', t.name)?.trim()
                  if (n) await renameDayTemplate(t.id, n)
                }}>Rinomina</button>
                <button className="chip" style={{ color: '#e57373' }} onClick={async () => {
                  if (!confirm(`Eliminare la giornata tipo "${t.name}"?`)) return
                  await deleteWithUndo(`Giornata tipo "${t.name}" eliminata`, () => deleteDayTemplate(t.id))
                }}>🗑 Elimina</button>
              </div>

              {/* Cosa contiene, per non applicare a scatola chiusa */}
              <div className="muted small" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                {t.meals.map((m) => `${m.name} (${m.items.length})`).join(' · ')}
                {t.modificata && <span style={{ color: 'var(--rs)' }}> · ✎ corretta da te</span>}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

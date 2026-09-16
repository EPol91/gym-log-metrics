// Aggiornare il piano del coach, senza passare da nessuno.
//
// Incolli la sua pagina «Stampa la dieta», l'app ti fa vedere cosa cambia
// PRIMA di salvare, e salvi solo se ti torna. Cambia il piano del coach e
// l'obiettivo in Cibo; i tuoi pasti restano dove sono.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getUser } from '../db/repo'
import { fmtData } from '../util/format'
import { leggiPianoIncollato, confrontaPiano, applicaPiano, pianoDi, type ConfrontoGiornata } from '../rs/piano'
import type { GiornataPianoRs } from '../db/schema'

type Tot = ConfrontoGiornata['dopo']

const macro = (t: Tot) => `${Math.round(t.kcal)} kcal · C ${t.carbs}, P ${t.protein}, G ${t.fat}`
// Il meno tipografico: il trattino corto accanto a un numero si perde.
const segno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}`

export function AggiornaPiano() {
  const user = useLiveQuery(getUser, [])
  const [testo, setTesto] = useState('')
  const [problemi, setProblemi] = useState<string[]>([])
  const [letto, setLetto] = useState<GiornataPianoRs[] | null>(null)
  const [confronto, setConfronto] = useState<ConfrontoGiornata[] | null>(null)
  const [fatto, setFatto] = useState(false)

  const leggi = async () => {
    setFatto(false)
    const r = leggiPianoIncollato(testo, pianoDi(user))
    setProblemi(r.problemi)
    // Se qualcosa non torna non si confronta nemmeno: meglio niente che un
    // piano letto a meta' e salvato per buono.
    if (r.problemi.length) { setLetto(null); setConfronto(null); return }
    setLetto(r.giornate)
    setConfronto(await confrontaPiano(r.giornate))
  }

  const salva = async () => {
    if (!letto) return
    await applicaPiano(letto)
    setFatto(true)
    setLetto(null)
    setConfronto(null)
    setTesto('')
  }

  const cambiate = confronto?.filter((c) => c.cambiata) ?? []

  return (
    <div className="card">
      <label className="fl">Aggiorna dal coach</label>
      <p className="muted small" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
        Nella sua app: Alimentazione → «Stampa la dieta». Nella pagina che si apre seleziona tutto,
        copia e incolla qui. Si aggiornano solo i macro delle sue giornate: i tuoi pasti non si toccano.
      </p>
      {user?.rsPiano && (
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          Piano aggiornato il {fmtData(user.rsPiano.aggiornato)}.
        </p>
      )}

      <textarea value={testo} rows={4} placeholder="Incolla qui la pagina «Stampa la dieta»"
        onChange={(e) => { setTesto(e.target.value); setProblemi([]); setConfronto(null) }}
        style={{ width: '100%' }} />
      <button className="ghost" style={{ width: '100%', marginTop: 6 }} disabled={!testo.trim()} onClick={leggi}>
        Leggi e confronta
      </button>

      {problemi.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {problemi.map((p) => <p key={p} className="small" style={{ margin: '2px 0', color: 'var(--rs)' }}>{p}</p>)}
          <p className="muted small" style={{ margin: '4px 0 0' }}>Non ho salvato niente.</p>
        </div>
      )}

      {confronto && (
        <div style={{ marginTop: 10 }}>
          {cambiate.length === 0 && (
            <p className="small" style={{ margin: 0, color: 'var(--good)' }}>
              ✓ Il piano che hai incollato è uguale a quello che hai già.
            </p>
          )}

          {cambiate.map((c) => (
            <div key={c.nome} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
              <strong style={{ fontSize: 14 }}>{c.nome.replace('🦠 ', '')}</strong>
              <div className="small" style={{ marginTop: 4, lineHeight: 1.6 }}>
                <div className="muted">piano di prima · {macro(c.prima)}</div>
                <div>piano nuovo · <strong style={{ color: 'var(--gold)' }}>{macro(c.dopo)}</strong></div>
                {c.tua && c.mancano && (
                  <>
                    <div className="muted">la tua versione · {macro(c.tua)}</div>
                    {/* Quello che conta: di quanto devi spostarti per arrivarci. */}
                    <div>
                      per arrivarci ·{' '}
                      <strong>
                        {segno(c.mancano.kcal)} kcal · C {segno(c.mancano.carbs)}, P {segno(c.mancano.protein)}, G {segno(c.mancano.fat)}
                      </strong>
                    </div>
                  </>
                )}
              </div>
              {c.alimenti.length > 0 && (
                <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.55 }}>
                  Cosa ha cambiato lui (promemoria, non si applica):
                  {c.alimenti.map((a) => (
                    <div key={a.pasto + a.alimento}>
                      · {a.pasto}: {a.alimento}{' '}
                      {a.prima == null ? `nuovo, ${a.dopo} g`
                        : a.dopo == null ? `tolto (era ${a.prima} g)`
                          : `${a.prima} → ${a.dopo} g`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {cambiate.length > 0 && (
            <button className="primary" style={{ width: '100%', marginTop: 8 }} onClick={salva}>
              Aggiorna {cambiate.length === 1 ? 'la giornata' : `le ${cambiate.length} giornate`}
            </button>
          )}
        </div>
      )}

      {fatto && (
        <p className="small" style={{ margin: '8px 0 0', color: 'var(--good)' }}>
          ✓ Piano aggiornato. In Cibo l'obiettivo di quelle giornate è quello nuovo; i tuoi pasti sono com'erano.
        </p>
      )}
    </div>
  )
}

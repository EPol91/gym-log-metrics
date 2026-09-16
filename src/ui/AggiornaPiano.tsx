// Il piano del coach, letto direttamente dalla sua app.
//
// Prima ti colleghi (una volta: mail → copia link → incolla), poi «Aggiorna dal
// coach» legge il suo piano, ti fa vedere cosa cambia PRIMA di salvare, e
// salvi solo se ti torna. Cambiano il piano del coach e l'obiettivo in Cibo; i
// tuoi pasti restano dove sono.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getUser } from '../db/repo'
import { fmtData, fmtDataOra } from '../util/format'
import { confrontaPiano, applicaPiano, pianoDi, type ConfrontoGiornata } from '../rs/piano'
import {
  statoCollegamento, chiediMailDiAccesso, collegaConLink, scollega, pianoDalCoach, type Collegamento,
} from '../rs/coach'
import type { GiornataPianoRs } from '../db/schema'

type Tot = ConfrontoGiornata['dopo']

const macro = (t: Tot) => `${Math.round(t.kcal)} kcal · C ${t.carbs}, P ${t.protein}, G ${t.fat}`
// Il meno tipografico: il trattino corto accanto a un numero si perde.
const segno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}`

export function AggiornaPiano() {
  const user = useLiveQuery(getUser, [])
  const [collegamento, setCollegamento] = useState<Collegamento | null>(null)
  const [email, setEmail] = useState('')
  const [mailPartita, setMailPartita] = useState(false)
  const [link, setLink] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const [letto, setLetto] = useState<{ giornate: GiornataPianoRs[]; pubblicato: string | null } | null>(null)
  const [confronto, setConfronto] = useState<ConfrontoGiornata[] | null>(null)
  const [fatto, setFatto] = useState(false)

  useEffect(() => { void statoCollegamento().then(setCollegamento) }, [])

  /** Un'azione alla volta, e l'errore scritto per quello che e'. */
  const prova = async (fai: () => Promise<void>) => {
    setOccupato(true); setErrore(null)
    try { await fai() } catch (e) { setErrore((e as Error).message) } finally { setOccupato(false) }
  }

  const leggi = () => prova(async () => {
    setFatto(false)
    const p = await pianoDalCoach(pianoDi(user))
    setLetto(p)
    setConfronto(await confrontaPiano(p.giornate))
  })

  const salva = () => prova(async () => {
    if (!letto) return
    await applicaPiano(letto.giornate, letto.pubblicato)
    setFatto(true); setLetto(null); setConfronto(null)
  })

  const cambiate = confronto?.filter((c) => c.cambiata) ?? []

  return (
    <div className="card">
      <label className="fl">Piano del coach</label>

      {collegamento == null && <p className="muted small" style={{ margin: 0 }}>Controllo il collegamento…</p>}

      {/* --- Non collegato: la mail, poi il link incollato --- */}
      {collegamento && !collegamento.collegato && (
        <>
          <p className="muted small" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
            Collega l'app a quella del coach, una volta sola: da lì il suo piano si aggiorna con un tocco.
          </p>
          {!mailPartita ? (
            <>
              <input type="email" inputMode="email" autoComplete="email" value={email}
                placeholder="La tua email della sua app" onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%' }} />
              <button className="primary" style={{ width: '100%', marginTop: 6 }} disabled={occupato || !email.trim()}
                onClick={() => prova(async () => { await chiediMailDiAccesso(email); setMailPartita(true) })}>
                {occupato ? 'invio…' : 'Mandami la mail'}
              </button>
            </>
          ) : (
            <>
              {/* Il passo che sbaglia chiunque: toccare il pulsante consuma il link. */}
              <p className="small" style={{ margin: '0 0 6px', lineHeight: 1.5 }}>
                Ti è arrivata la mail del coach. Sul pulsante <strong>tieni premuto → «Copia link»</strong>{' '}
                — non toccarlo, altrimenti il link si consuma — e incollalo qui:
              </p>
              <input value={link} placeholder="https://…/auth/v1/verify?token=…"
                onChange={(e) => setLink(e.target.value)} style={{ width: '100%' }} />
              <button className="primary" style={{ width: '100%', marginTop: 6 }} disabled={occupato || !link.trim()}
                onClick={() => prova(async () => { setCollegamento(await collegaConLink(link)); setLink(''); setMailPartita(false) })}>
                {occupato ? 'collego…' : 'Collega'}
              </button>
              <button className="ghost small" style={{ marginTop: 6 }} disabled={occupato}
                onClick={() => { setMailPartita(false); setLink('') }}>
                ↺ Rimanda la mail
              </button>
            </>
          )}
        </>
      )}

      {/* --- Collegato: il tasto e il confronto --- */}
      {collegamento?.collegato && (
        <>
          <div className="row spread" style={{ alignItems: 'baseline', marginBottom: 8 }}>
            <span className="muted small">Collegato{collegamento.email ? ` come ${collegamento.email}` : ''}</span>
            <button className="ghost small" disabled={occupato}
              onClick={() => prova(async () => { await scollega(); setCollegamento({ collegato: false }); setConfronto(null) })}>
              Scollega
            </button>
          </div>
          {user?.rsPiano && (
            <p className="muted small" style={{ margin: '0 0 8px' }}>
              Piano in uso aggiornato il {fmtData(user.rsPiano.aggiornato)}
              {user.rsPiano.pubblicato && ` · versione del coach del ${fmtDataOra(user.rsPiano.pubblicato)}`}.
            </p>
          )}
          <button className="primary" style={{ width: '100%' }} disabled={occupato} onClick={leggi}>
            {occupato ? 'leggo il piano…' : '↻ Aggiorna dal coach'}
          </button>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Prima di salvare ti faccio vedere cosa cambia. Si aggiornano solo i macro: i tuoi pasti non si toccano.
          </p>
        </>
      )}

      {errore && <p className="small" style={{ margin: '8px 0 0', color: 'var(--rs)' }}>{errore}</p>}

      {confronto && (
        <div style={{ marginTop: 10 }}>
          {letto?.pubblicato && (
            <p className="muted small" style={{ margin: '0 0 6px' }}>
              Versione pubblicata dal coach il {fmtDataOra(letto.pubblicato)}.
            </p>
          )}
          {cambiate.length === 0 && (
            <p className="small" style={{ margin: 0, color: 'var(--good)' }}>
              ✓ Hai già il piano aggiornato: niente da cambiare.
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
            <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={occupato} onClick={salva}>
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

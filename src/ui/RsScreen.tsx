// 🦠RS — la giornata come la vuole il coach.
//
// Tutto quello che l'app sa gia' arriva qui da solo. Quello che tocchi tu resta
// tuo e non viene piu' sovrascritto. Quello che manca lo dice, invece di
// inventarlo: sono giudizi, e un giudizio finto e' peggio di una casella vuota.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, updateUser } from '../db/repo'
import { todayLocal, shiftDate } from '../util/date'
import { CAMPI, GRUPPI, DEF, type RsCampo, type RsGruppo } from '../rs/campi'
import {
  computeRs, conteggio, settimanaGiorno, setRs, resetRs, rsDay, setNotaRs,
  notaAutomatica, RS_START_DEFAULT, type RsValore,
} from '../rs/rs'

/** Icone dei gruppi: disegnate, non emoji — e il virus resta solo di RS. */
const ico = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ICONE: Record<RsGruppo, React.ReactNode> = {
  nutrizione: ico(<><path d="M7 3v6.5a2 2 0 0 0 4 0V3M9 11.5V21M17.5 3c1.8 2 1.8 6.5 0 8.5V21" /></>),
  // Intestino: la matassa avvolta. Il virus non si tocca, e' il segno di RS.
  digestione: ico(<path d="M8 3.5c3.5 0 3.5 3.2 0 3.2S4 9.9 8 9.9h8c3.5 0 3.5 3.2 0 3.2s-4 3.2 0 3.2h-6c-3 0-3 4.2 0 4.2" />),
  attivita: ico(<path d="M13 3.5l-1.5 5.5 4 2-1 3.5M9.5 21l2-6.5-4-2 1-3.5M17 8.5l3 1" />),
  biofeedback: ico(<path d="M3 12.5h4l2-5 3.5 10 2.5-6 1.5 3h4.5" />),
  sonno: ico(<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />),
}

export function RsScreen() {
  const user = useLiveQuery(getUser, [])
  const [date, setDate] = useState(todayLocal())
  const [impostazioni, setImpostazioni] = useState(false)
  const [inModifica, setInModifica] = useState<RsCampo | null>(null)

  const inizio = user?.rsStart ?? RS_START_DEFAULT
  const attivo = user?.rsActive ?? true
  const giornata = useLiveQuery(() => computeRs(date), [date])
  const riga = useLiveQuery(() => rsDay(date), [date])
  const nota = useLiveQuery(() => notaAutomatica(date), [date])

  const sg = settimanaGiorno(date, inizio)
  const conta = giornata ? conteggio(giornata) : null

  if (impostazioni) return <RsImpostazioni onClose={() => setImpostazioni(false)} />

  return (
    <div className="col rs-tema" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.06em' }}>ETP HEALTH · COACH</p>
          <h1>🦠RS</h1>
          <p className="muted small" style={{ marginTop: 2 }}>
            {sg.settimana < 1 ? `Il protocollo inizia il ${inizio}` : sg.label}
          </p>
        </div>
        <button className="ghost" aria-label="Impostazioni RS" onClick={() => setImpostazioni(true)}
          style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
          </svg>
        </button>
      </div>

      {!attivo && (
        <div className="card" style={{ marginBottom: 0 }}>
          <p className="small" style={{ margin: 0 }}>🦠RS è spento. La giornata si compila lo stesso, ma niente ti verrà chiesto.</p>
        </div>
      )}

      <div className="row spread" style={{ marginTop: 2 }}>
        <button className="chip" onClick={() => setDate(shiftDate(date, -1))}>‹ giorno prima</button>
        <span className="small">{date === todayLocal() ? 'oggi' : date}</span>
        <button className="chip" disabled={date >= todayLocal()} onClick={() => setDate(shiftDate(date, 1))}>giorno dopo ›</button>
      </div>

      {conta && (
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="pallino auto" />
            <span className="small">
              {conta.auto + conta.miei} su {CAMPI.length} compilati
              {conta.vuoti > 0 && <> · <strong>{conta.vuoti} aspettano te</strong></>}
            </span>
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 8 }}>
            <span className="row" style={{ gap: 5 }}><i className="pallino auto" /><span className="muted small">automatico</span></span>
            <span className="row" style={{ gap: 5 }}><i className="pallino mio" /><span className="muted small">tuo</span></span>
            <span className="row" style={{ gap: 5 }}><i className="pallino vuoto" /><span className="muted small">da compilare</span></span>
          </div>
        </div>
      )}

      {giornata && GRUPPI.map((g) => (
        <div key={g.key}>
          <div className="row" style={{ gap: 6, margin: '12px 0 2px', color: 'var(--muted)' }}>
            {ICONE[g.key]}
            <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{g.label}</span>
          </div>
          {CAMPI.filter((c) => c.gruppo === g.key).map((c) => (
            <Riga key={c.key} campo={c.key} v={giornata[c.key]} date={date}
              aperto={inModifica === c.key} onApri={() => setInModifica(inModifica === c.key ? null : c.key)} />
          ))}
        </div>
      ))}

      <div className="card" style={{ marginTop: 8 }}>
        <label className="fl">Nota della giornata</label>
        <p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{nota || '—'}</p>
        {riga?.nota && <p className="small" style={{ margin: '6px 0 0', lineHeight: 1.55 }}>{riga.nota}</p>}
        <NotaTua date={date} attuale={riga?.nota ?? ''} />
      </div>
    </div>
  )
}

/** Una riga: etichetta, valore, e da dove arriva. Si tocca per correggerla. */
function Riga({ campo, v, date, aperto, onApri }: {
  campo: RsCampo; v: RsValore; date: string; aperto: boolean; onApri: () => void
}) {
  const def = DEF.get(campo)!
  const [testo, setTesto] = useState('')

  const colore = v.fonte === 'auto' ? 'var(--gold)' : v.fonte === 'mio' ? 'var(--text)' : '#4a4a4a'

  return (
    <>
      <div className="row" onClick={onApri}
        style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
        <span className={'pallino ' + v.fonte} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {def.label}
        </span>
        {v.fonte === 'mio' && <span className="muted" style={{ fontSize: 10 }}>corretto</span>}
        <span style={{ fontSize: 15, color: colore, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 70 }}>
          {v.valore ?? '—'}
        </span>
      </div>

      {aperto && (
        <div className="card" style={{ marginTop: 6 }}>
          {def.tipo === 'scala5' ? (
            <div className="opts">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={v.valore === String(n) ? 'sel' : ''}
                  onClick={() => setRs(date, campo, String(n))}>{n}</button>
              ))}
            </div>
          ) : def.tipo === 'sinoo' ? (
            <div className="row" style={{ gap: 6 }}>
              {['S', 'N'].map((s) => (
                <button key={s} className={v.valore === s ? 'sel' : ''} style={{ flex: 1 }}
                  onClick={() => setRs(date, campo, s)}>{s === 'S' ? 'Sì' : 'No'}</button>
              ))}
            </div>
          ) : (
            <div className="row">
              <input inputMode={def.tipo === 'numero' ? 'decimal' : 'text'}
                placeholder={v.valore ?? ''} value={testo} onChange={(e) => setTesto(e.target.value)}
                style={{ flex: 1 }} />
              <button className="primary" style={{ flex: '0 0 auto' }} disabled={!testo.trim()}
                onClick={() => { setRs(date, campo, testo.trim()); setTesto('') }}>Salva</button>
            </div>
          )}
          {v.fonte === 'mio' && (
            <button className="chip" style={{ marginTop: 8 }} onClick={() => resetRs(date, campo)}>
              ↺ rimetti in automatico
            </button>
          )}
          {def.auto && v.fonte === 'vuoto' && (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Questo lo compila l'app da sola: adesso è vuoto perché il dato non c'è ancora.
            </p>
          )}
        </div>
      )}
    </>
  )
}

function NotaTua({ date, attuale }: { date: string; attuale: string }) {
  const [apri, setApri] = useState(false)
  const [testo, setTesto] = useState(attuale)
  if (!apri) return <button className="chip" style={{ marginTop: 10 }} onClick={() => setApri(true)}>✎ aggiungi la tua riga</button>
  return (
    <div style={{ marginTop: 10 }}>
      <textarea rows={3} value={testo} onChange={(e) => setTesto(e.target.value)}
        placeholder="Quello che i numeri non dicono…" />
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="primary" style={{ flex: 1 }} onClick={() => { setNotaRs(date, testo.trim()); setApri(false) }}>Salva</button>
        <button className="chip" onClick={() => setApri(false)}>annulla</button>
      </div>
    </div>
  )
}

/** Impostazioni: cosa comanda il calendario, e a che punto è il collegamento. */
function RsImpostazioni({ onClose }: { onClose: () => void }) {
  const user = useLiveQuery(getUser, [])
  const inizio = user?.rsStart ?? RS_START_DEFAULT
  const attivo = user?.rsActive ?? true
  const chiedi = user?.rsAskDaily ?? true
  const sg = settimanaGiorno(todayLocal(), inizio)

  const interruttore = (on: boolean, onClick: () => void) => (
    <span onClick={onClick} style={{
      width: 44, height: 26, borderRadius: 999, flex: '0 0 auto', cursor: 'pointer',
      background: on ? 'var(--gold-bg)' : 'var(--surface-2)',
      border: '1px solid ' + (on ? 'var(--gold)' : 'var(--line)'), position: 'relative', display: 'block',
    }}>
      <i style={{
        position: 'absolute', top: 2.5, [on ? 'right' : 'left']: 3, width: 19, height: 19,
        borderRadius: '50%', background: on ? 'var(--gold)' : 'var(--muted)',
      }} />
    </span>
  )

  return (
    <div className="col rs-tema" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.06em' }}>🦠RS</p>
          <h1>Impostazioni</h1>
        </div>
        <button className="ghost" onClick={onClose}
          style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }}>✕</button>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <div>
            <div>Modulo 🦠RS</div>
            <p className="muted small" style={{ margin: '2px 0 0' }}>Acceso di default. Spegnilo quando vuoi.</p>
          </div>
          {interruttore(attivo, () => updateUser({ rsActive: !attivo }))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <label className="fl">Inizio della settimana 1</label>
        <input type="date" value={inizio} onChange={(e) => updateUser({ rsStart: e.target.value })} />
        <p className="muted small" style={{ marginTop: 8 }}>
          Da qui l'app calcola settimana e giorno come li vuole il coach. Se il conteggio non torna,
          cambia questa data: comanda lei.
        </p>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <span className="chip on">oggi · {sg.settimana < 1 ? 'non ancora iniziato' : sg.label}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <label className="fl">Collegamento al coach</label>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <span className="small">Invio automatico</span>
          <span className="chip">in attesa</span>
        </div>
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          Tutto è già pronto. Manca solo il permesso di accesso dal suo sistema: quando arriva si
          accende qui, e le giornate partono da sole.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <span>Chiedi conferma a inizio giornata</span>
          {interruttore(chiedi, () => updateUser({ rsAskDaily: !chiedi }))}
        </div>
      </div>
    </div>
  )
}

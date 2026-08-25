// 🦠RS — la giornata come la vuole il coach.
//
// Tutto quello che l'app sa gia' arriva qui da solo. Quello che tocchi tu resta
// tuo e non viene piu' sovrascritto. Quello che manca lo dice, invece di
// inventarlo: sono giudizi, e un giudizio finto e' peggio di una casella vuota.

import { useState } from 'react'
import { fmtData } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, updateUser } from '../db/repo'
import { todayLocal, shiftDate, etichettaGiorno } from '../util/date'
import { CAMPI, GRUPPI, DEF, type RsCampo, type RsGruppo } from '../rs/campi'
import {
  computeRs, conteggio, settimanaGiorno, setRs, resetRs, rsDay, setNotaRs, dettagliRs,
  notaAutomatica, RS_START_DEFAULT, type RsValore,
} from '../rs/rs'
import { importaProtocolloRs, protocolloImportato, type EsitoImport } from '../rs/importa'
import { sedutaRs } from '../rs/allenamento'
import { cicloValido, indiceGiorno, GIORNI } from '../rs/ciclo'
import { DayCalendar } from './DayCalendar'
import { numeriSettimana, testoSettimana, periodo, checkSettimana, salvaCheck, aggiungiFoto, togliFoto, settimanaCorrente } from '../rs/settimana'

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
  const [sezione, setSezione] = useState<'giornata'|'allenamento'|'settimana'>('giornata')
  const [inModifica, setInModifica] = useState<RsCampo | null>(null)
  const [calendario, setCalendario] = useState(false)

  const inizio = user?.rsStart ?? RS_START_DEFAULT
  const attivo = user?.rsActive ?? true
  const giornata = useLiveQuery(() => computeRs(date), [date])
  const riga = useLiveQuery(() => rsDay(date), [date])
  const nota = useLiveQuery(() => notaAutomatica(date), [date])
  const dettagli = useLiveQuery(() => dettagliRs(date), [date]) ?? {}

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
            {sg.settimana < 1 ? `Il protocollo inizia il ${fmtData(inizio)}` : sg.label}
          </p>
        </div>
        <button className="ghost" aria-label="Impostazioni RS" onClick={() => setImpostazioni(true)}
          style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }}>
          {/* Un ingranaggio, non un sole: quello che li distingue e' il corpo
              tondo con i denti attaccati sopra — senza l'anello esterno restano
              otto raggi, e sembra la levetta del tema chiaro. */}
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="7.4" />
            <circle cx="12" cy="12" r="3.1" />
            <path strokeWidth="2.5" d="M19.4 12h1.9M12 19.4v1.9M4.6 12H2.7M12 4.6V2.7M17.2 17.2l1.4 1.4M6.8 17.2l-1.4 1.4M6.8 6.8 5.4 5.4M17.2 6.8l1.4-1.4" />
          </svg>
        </button>
      </div>

      {!attivo && (
        <div className="card" style={{ marginBottom: 0 }}>
          <p className="small" style={{ margin: 0 }}>🦠RS è spento. La giornata si compila lo stesso, ma niente ti verrà chiesto.</p>
        </div>
      )}

      {/* Tre cose diverse, tre sezioni: la giornata coi suoi campi, la seduta
          pronta per lui, e il check di fine settimana. */}
      <div className="row" style={{ gap: 6, marginTop: 2 }}>
        {([['giornata', 'Giornata'], ['allenamento', 'Allenamento'], ['settimana', 'Settimana']] as const).map(([k, et]) => (
          <button key={k} className={'chip' + (sezione === k ? ' on' : '')} style={{ flex: 1 }}
            onClick={() => setSezione(k)}>{et}</button>
        ))}
      </div>

      {calendario && (
        <DayCalendar date={date} onPick={(d) => { if (d <= todayLocal()) setDate(d); setCalendario(false) }}
          onClose={() => setCalendario(false)} />
      )}

      {sezione === 'settimana' && <CheckSettimanale inizio={inizio} />}

      {sezione !== 'settimana' && (
        <div className="row spread" style={{ marginTop: 2 }}>
          <button className="chip" onClick={() => setDate(shiftDate(date, -1))}>‹ giorno prima</button>
          {/* La data si tocca e apre il calendario, come in Cibo: per tornare a
              lunedi' scorso, un passo alla volta erano sei tocchi. */}
          <button className="chip" style={{ fontSize: 13 }} onClick={() => setCalendario(true)}>
            📅 {etichettaGiorno(date)}
          </button>
          <button className="chip" disabled={date >= todayLocal()} onClick={() => setDate(shiftDate(date, 1))}>giorno dopo ›</button>
        </div>
      )}

      {sezione === 'giornata' && conta && (
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

      {sezione === 'allenamento' && <SedutaCard date={date} />}

      {sezione === 'giornata' && giornata && GRUPPI.map((g) => (
        <div key={g.key}>
          <div className="row" style={{ gap: 6, margin: '12px 0 2px', color: 'var(--muted)' }}>
            {ICONE[g.key]}
            <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{g.label}</span>
          </div>
          {CAMPI.filter((c) => c.gruppo === g.key).map((c) => (
            <Riga key={c.key} campo={c.key} v={giornata[c.key]} date={date} dettaglio={dettagli[c.key]}
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

/**
 * Il valore come si legge.
 *
 * Al coach le ore di sonno servono in decimale — è il formato del suo foglio —
 * ma «6.89» non è un tempo che dica niente a chi lo guarda: sono 6h53. Si
 * spedisce il numero, si mostra l'orario.
 */
function leggibile(campo: RsCampo, valore: string | null | undefined): string {
  if (!valore) return '—'
  if (campo !== 'durata_sonno') return valore
  const ore = Number(valore)
  if (!Number.isFinite(ore) || ore <= 0) return valore
  const h = Math.floor(ore)
  const m = Math.round((ore - h) * 60)
  return m === 60 ? `${h + 1}h00` : `${h}h${String(m).padStart(2, '0')}`
}

/** Una riga: etichetta, valore, e da dove arriva. Si tocca per correggerla. */
function Riga({ campo, v, date, aperto, onApri, dettaglio }: {
  campo: RsCampo; v: RsValore; date: string; aperto: boolean; onApri: () => void
  /** il contorno del numero: chi l'ha contato, o quanto ne prevedeva la giornata */
  dettaglio?: string
}) {
  const def = DEF.get(campo)!
  const [testo, setTesto] = useState('')

  const colore = v.fonte === 'auto' ? 'var(--gold)' : v.fonte === 'mio' ? 'var(--text)' : '#4a4a4a'

  return (
    <>
      <div className="row" onClick={onApri}
        style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
        <span className={'pallino ' + v.fonte} />
        {/* Etichetta e contorno sulla stessa riga, divisi dal punto medio: e' il
            segno con cui il coach separa le sue prescrizioni. Se lo spazio non
            basta e' il contorno ad accorciarsi — l'etichetta dice cos'e'. */}
        <span className="row" style={{ flex: 1, minWidth: 0, gap: 5, alignItems: 'baseline' }}>
          <span style={{ flex: 'none', fontSize: 13.5, whiteSpace: 'nowrap' }}>{def.label}</span>
          {dettaglio && (
            <span className="muted" style={{ fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              · {dettaglio}
            </span>
          )}
        </span>
        {v.fonte === 'mio' && <span className="muted" style={{ fontSize: 10 }}>corretto</span>}
        <span style={{ fontSize: 15, color: colore, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 70 }}>
          {leggibile(campo, v.valore)}
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

/**
 * La ciclizzazione dei carboidrati, sette caselle da lunedì a domenica.
 *
 * Sta qui e non nel codice perché il coach la cambia: quando succede si tocca
 * il giorno e cambia, invece di aspettare una versione nuova dell'app. È da qui
 * che Cibo sa quale giornata consigliarti.
 */
function CiclizzazioneCard({ ciclo }: { ciclo: string }) {
  const oggi = indiceGiorno(todayLocal())
  const scambia = (i: number) => {
    const nuovo = ciclo.split('')
    nuovo[i] = nuovo[i] === 'H' ? 'L' : 'H'
    void updateUser({ rsCiclo: nuovo.join('') })
  }
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <label className="fl">Ciclizzazione dei carboidrati</label>
      <div className="row" style={{ gap: 4 }}>
        {ciclo.split('').map((c, i) => (
          <button key={i} className={c === 'H' ? 'chip on' : 'chip'} onClick={() => scambia(i)}
            style={{ flex: 1, padding: '8px 0', lineHeight: 1.2, ...(i === oggi ? { borderColor: 'var(--rs)' } : {}) }}
            aria-label={`${GIORNI[i]}: ${c === 'H' ? 'alto' : 'basso'}`}>
            <span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>{GIORNI[i].slice(0, 3)}</span>
            <span style={{ display: 'block', fontWeight: 700 }}>{c === 'H' ? 'HIGH' : 'LOW'}</span>
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Tocca un giorno per invertirlo. ON e OFF restano una tua scelta: dipendono dal fatto che ti alleni,
        e te lo chiede Cibo quando applichi la giornata.
      </p>
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

      <CiclizzazioneCard ciclo={cicloValido(user?.rsCiclo)} />

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

      <ImportProtocollo />
    </div>
  )
}

/**
 * Il protocollo del coach dentro l'app: le sue quattro giornate e le sue cinque
 * sedute, aggiunte alle tue senza toccare niente di quello che avevi.
 * Si puo' rifare quando lui cambia qualcosa: aggiorna, non duplica.
 */
function ImportProtocollo() {
  const gia = useLiveQuery(protocolloImportato, [])
  const [busy, setBusy] = useState(false)
  const [esito, setEsito] = useState<EsitoImport | null>(null)

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <label className="fl">Protocollo del coach</label>
      <p className="muted small" style={{ margin: '0 0 8px' }}>
        4 giornate alimentari coi grammi esatti e 5 sedute con le prescrizioni. Si aggiungono
        alle tue col 🦠 davanti: niente di tuo viene toccato.
      </p>
      <button className="primary" style={{ width: '100%' }} disabled={busy}
        onClick={async () => { setBusy(true); try { setEsito(await importaProtocolloRs()) } finally { setBusy(false) } }}>
        {busy ? 'importo…' : gia ? '↻ Aggiorna dal protocollo' : '⬇ Importa il protocollo'}
      </button>

      {esito && (
        <div style={{ marginTop: 10 }}>
          <p className="small" style={{ margin: 0, color: 'var(--good)' }}>
            ✓ {esito.giornate.length} giornate · {esito.sedute.length} sedute · {esito.eserciziCreati} esercizi nuovi
          </p>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Alimenti: {esito.alimentiCreati.length} creati, {esito.alimentiRiusati.length} già tuoi e riusati.
          </p>
          {esito.giornateTue.length > 0 && (
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              Corrette da te, lasciate come stanno: {esito.giornateTue.join(', ')}.
            </p>
          )}
          {esito.giornateCambiate.length > 0 && (
            <p className="small" style={{ margin: '6px 0 0', color: 'var(--gold)' }}>
              ⚠ Il coach ha cambiato {esito.giornateCambiate.join(', ')}, ma le hai corrette tu e non le
              ho toccate. Aprile da Cibo → Giornate tipo e allineale a mano, o eliminale e reimporta.
            </p>
          )}
          {esito.daCompletare.length > 0 && (
            <p className="small" style={{ margin: '6px 0 0', color: 'var(--gold)' }}>
              Da completare a mano ({esito.daCompletare.length}): {esito.daCompletare.join(', ')}. Sono a
              zero apposta: un valore inventato falserebbe i totali che vanno al coach.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** L'allenamento del giorno, nel formato del coach. */
function SedutaCard({ date }: { date: string }) {
  const s = useLiveQuery(() => sedutaRs(date), [date])
  if (!s) return null
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <label className="fl" style={{ margin: 0 }}>Allenamento</label>
        <span className="small" style={{ color: 'var(--gold)' }}>
          {s.nome ?? 'seduta tua'}{s.aderenzaLogistica != null ? ` · ${s.aderenzaLogistica}%` : ''}
        </span>
      </div>
      {s.esercizi.filter((e) => e.serie.length).map((e, i) => (
        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <div className="row spread">
            <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.nome}{!e.previsto && <span className="muted" style={{ fontSize: 11 }}> · fuori scheda</span>}
            </span>
            <span style={{ fontSize: 13, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
              {e.serie.map((x) => `${x.kg}×${x.reps}`).join('  ')}
            </span>
          </div>
          {e.prescrizione && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{e.prescrizione}</div>}
        </div>
      ))}
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        {s.serieTotali} serie. Stimolo, pump, tecnica e compensi restano tuoi: li scrivi tu.
      </p>
    </div>
  )
}

/** Il check settimanale: i numeri della settimana, il testo, le foto, lo stato. */
function CheckSettimanale({ inizio }: { inizio: string }) {
  const [n, setN] = useState(() => settimanaCorrente(inizio, todayLocal()))
  const numeri = useLiveQuery(() => numeriSettimana(inizio, n), [inizio, n])
  const salvato = useLiveQuery(() => checkSettimana(n), [n])
  const [testo, setTesto] = useState<string | null>(null)

  if (!numeri) return null
  const composto = testoSettimana(n, numeri)
  const attuale = testo ?? salvato?.testo ?? composto

  const riga = (et: string, v: string) => (
    <div className="row spread" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="small" style={{ flex: 1 }}>{et}</span>
      <span style={{ fontSize: 14, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="chip" disabled={n <= 1} onClick={() => { setN(n - 1); setTesto(null) }}>
          {n <= 1 ? '‹' : `‹ sett. ${n - 1}`}
        </button>
        <span className="small">Settimana {n} · {periodo(inizio, n)}</span>
        <button className="chip" onClick={() => { setN(n + 1); setTesto(null) }}>sett. {n + 1} ›</button>
      </div>

      {salvato?.stato === 'inviato' && (
        <div className="card" style={{ marginBottom: 0, borderColor: 'var(--good)' }}>
          <span className="small" style={{ color: 'var(--good)' }}>✓ Inviato</span>
        </div>
      )}
      {salvato?.stato === 'modificato' && (
        <div className="card" style={{ marginBottom: 0, borderColor: 'var(--gold)' }}>
          <p className="small" style={{ margin: 0 }}>Modificato dopo l'invio: il coach ha ancora la versione di prima.</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 0 }}>
        <label className="fl">La settimana, dai tuoi dati</label>
        {riga('Peso medio', numeri.pesoMedio != null ? `${numeri.pesoMedio} kg` : '—')}
        {riga('Variazione sulla scorsa', numeri.delta != null ? `${numeri.delta > 0 ? '+' : ''}${numeri.delta} kg` : '—')}
        {riga('Aderenza alimentare', numeri.aderenza != null ? `${numeri.aderenza}%` : '—')}
        {riga('Precisione sui macro', numeri.precisione != null ? `${numeri.precisione}%` : '—')}
        {riga('Sedute', String(numeri.sedute))}
        {riga('Passi al giorno', numeri.passiMedi != null ? numeri.passiMedi.toLocaleString('it-IT') : '—')}
        {riga('Sonno medio', numeri.sonnoMedio != null ? `${Math.floor(numeri.sonnoMedio)}h${String(Math.round((numeri.sonnoMedio % 1) * 60)).padStart(2, '0')}` : '—')}
        {riga('Recupero medio', numeri.recuperoMedio != null ? `${numeri.recuperoMedio}%` : '—')}
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <label className="fl">Testo per il coach</label>
        <textarea rows={6} value={attuale} onChange={(e) => setTesto(e.target.value)} />
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="chip" onClick={() => { setTesto(composto); salvaCheck(n, composto) }}>↺ Ricomponi</button>
          <button className="chip" onClick={() => salvaCheck(n, attuale)}>Salva</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <label className="fl">Foto</label>
        <input type="file" accept="image/*" multiple onChange={async (e) => {
          for (const f of Array.from(e.target.files ?? [])) {
            const dataUrl = await new Promise<string>((res) => {
              const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f)
            })
            await aggiungiFoto(n, dataUrl)
          }
          e.target.value = ''
        }} />
        {!!salvato?.foto?.length && (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {salvato.foto.map((f, i) => (
              <span key={i} style={{ position: 'relative' }}>
                <img src={f} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                <button className="chip" style={{ position: 'absolute', top: -6, right: -6, padding: '2px 7px' }}
                  onClick={() => togliFoto(n, i)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="primary" style={{ width: '100%' }} disabled
        title="Serve il collegamento al coach">
        Invia il check — in attesa del collegamento
      </button>
    </div>
  )
}

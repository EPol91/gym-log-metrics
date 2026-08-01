import { useEffect, useState } from 'react'
import { fmtData } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import { STEPS, ensureHabits, getHabit, adjustHabitTarget, recentHabitEntries } from '../db/habits'
import { statoPassi, chiediPermessoPassi, sincronizzaPassi, diagnosticaPonte, sorgentiPassi, type StatoPassi, type SorgentePassi } from '../util/passi'
import { getUser, updateUser } from '../db/repo'

const SECTION: React.CSSProperties = {
  fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)',
}

/**
 * Abitudini. Oggi c'è l'obiettivo passi: il conteggio quotidiano arriverà da Health
 * Connect quando l'app girerà come applicazione Android, non è una cosa da compilare
 * a mano ogni sera. Il modello dati è già pronto per riceverlo.
 */
export function HabitsScreen() {
  const habit = useLiveQuery(() => getHabit(STEPS), [])
  const recent = useLiveQuery(() => recentHabitEntries(STEPS, 7), [])
  // La scrittura sta in un effetto, mai dentro una query reattiva.
  useEffect(() => { ensureHabits() }, [])

  const target = habit?.target ?? 10000
  const ultimo = recent?.[0]
  const oggi = ultimo ? Math.min(100, (ultimo.value / target) * 100) : 0

  return (
    <div className="col">
      <h1>Abitudini</h1>

      <span style={SECTION}>Passi</span>
      <div className="card" style={{ marginTop: 0 }}>
        <label className="fl">Obiettivo al giorno</label>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <button onClick={() => adjustHabitTarget(STEPS, -1000)}>−</button>
          <strong style={{ flex: 1, textAlign: 'center', fontSize: 26, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
            {target.toLocaleString('it-IT')}
          </strong>
          <button onClick={() => adjustHabitTarget(STEPS, +1000)}>＋</button>
        </div>

        {ultimo ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${oggi}%`, background: 'var(--gold)', borderRadius: 999, transition: 'width .3s' }} />
            </div>
            <p className="muted small" style={{ marginTop: 6, marginBottom: 0, textAlign: 'center' }}>
              <strong style={{ color: 'var(--text)' }}>{ultimo.value.toLocaleString('it-IT')}</strong> passi il {fmtData(ultimo.date)}
              {ultimo.source === 'manual' ? ' · inseriti a mano' : ' · da Health Connect'}
            </p>
          </div>
        ) : null}

        {/* Health Connect esiste solo dentro l'app installata: dal browser
            questa porta non c'e' proprio, e prometterla sarebbe una bugia. */}
        <PassiHealthConnect senzaDati={!ultimo} />
      </div>

      {/* Storico: compare solo quando c'è qualcosa da mostrare. */}
      {recent && recent.length > 1 && (
        <>
          <span style={SECTION}>Ultimi giorni</span>
          <div className="card" style={{ marginTop: 0 }}>
            {recent.map((r) => (
              <div key={r.id} className="row spread small" style={{ padding: '5px 0' }}>
                <span className="muted">{fmtData(r.date)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: r.value >= target ? 'var(--good)' : 'var(--text)' }}>
                  {r.value.toLocaleString('it-IT')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted small">
        Qui arriveranno anche i check-in ricorrenti e le altre abitudini: per ora c'è quello che
        possiamo davvero misurare.
      </p>
    </div>
  )
}

/**
 * Il collegamento ai passi del telefono.
 *
 * Nell'app installata legge da Health Connect — dove finiscono i passi contati
 * dal telefono e quelli che ci scrive il WHOOP. Nel browser non compare nessun
 * tasto: quella porta non esiste, e un tasto che non puo' funzionare e' peggio
 * di nessun tasto.
 */
function PassiHealthConnect({ senzaDati }: { senzaDati: boolean }) {
  const [stato, setStato] = useState<StatoPassi | 'controllo'>('controllo')
  const [esito, setEsito] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState(false)

  const controlla = async () => {
    setStato('controllo')
    try { setStato(await statoPassi()) }
    catch (e) { setStato({ stato: 'assente', motivo: (e as Error)?.message ?? 'controllo fallito' }) }
  }
  useEffect(() => { void controlla() }, [])

  useEffect(() => {
    if (typeof stato === 'object' && stato.stato === 'collegato') void sincronizzaPassi(14)
  }, [stato])

  // Fuori dall'app installata non c'e' niente da collegare: si spiega e basta.
  if (typeof stato === 'object' && stato.stato === 'fuoriDallApp') {
    return (
      <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
        {senzaDati ? 'Nessun dato ancora. ' : ''}
        I passi automatici arrivano da <strong style={{ color: 'var(--text)' }}>Health Connect</strong>, che esiste solo
        nell'app installata: dal browser quel dato non è raggiungibile — WHOOP non lo espone nella sua API.
      </p>
    )
  }

  const collegato = typeof stato === 'object' && stato.stato === 'collegato'
  // Il tasto NON dipende dal controllo. Il controllo e' rimasto appeso davvero,
  // e con lui appesa restava tutta la sezione: chiedere il permesso e' l'unica
  // cosa che conta, e deve poter partire lo stesso.
  const nota = stato === 'controllo'
    ? 'Controllo Health Connect…'
    : stato.stato === 'assente' ? `Health Connect non risponde: ${stato.motivo}` : null

  return (
    <div style={{ marginTop: 12 }}>
      {collegato ? (
        <>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <span className="muted small">Passi da Health Connect · attivi</span>
          <button className="chip" disabled={lavoro} onClick={async () => {
            setLavoro(true)
            try { const n = await sincronizzaPassi(30); setEsito(n ? `${n} giornate aggiornate.` : 'Nessun passo trovato in Health Connect.') }
            catch (e) { setEsito((e as Error)?.message ?? 'Lettura non riuscita.') }
            finally { setLavoro(false) }
          }}>{lavoro ? '…' : '↻'}</button>
        </div>
        <SceltaSorgente onCambio={(n) => setEsito(n)} />
        </>
      ) : (
        <>
          {nota && <p className="muted small" style={{ margin: '0 0 8px' }}>{nota}</p>}
          <button className="primary" style={{ width: '100%' }} disabled={lavoro}
            onClick={async () => {
              setLavoro(true); setEsito(null)
              try {
                const r = await chiediPermessoPassi()
                if (r.ok) {
                  setStato({ stato: 'collegato' })
                  const n = await sincronizzaPassi(30)
                  setEsito(n ? `${n} giornate recuperate.` : 'Collegato, ma Health Connect non ha ancora passi da darmi.')
                } else setEsito(r.motivo ?? 'Permesso non concesso.')
              } catch (e) { setEsito((e as Error)?.message ?? 'Non riuscito.') }
              finally { setLavoro(false) }
            }}>
            {lavoro ? 'Chiedo il permesso…' : 'Collega i passi'}
          </button>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <button className="chip" disabled={lavoro} onClick={() => void controlla()}>Ricontrolla</button>
            {/* Quando non funziona, serve sapere COSA vede la pagina del ponte
                nativo: senza, si tira a indovinare. */}
            <button className="chip" onClick={() => setEsito(diagnosticaPonte())}>Diagnostica</button>
          </div>
        </>
      )}
      {esito && <p className="muted small" style={{ margin: '8px 0 0' }}>{esito}</p>}
    </div>
  )
}

/**
 * Il nome di una sorgente, in leggibile. "com.whoop.android" e "SM-S948B" sono
 * nomi tecnici: dicono poco quando devi scegliere al volo.
 */
function leggibile(s: SorgentePassi): string {
  const id = s.id.toLowerCase()
  if (id.includes('whoop')) return 'WHOOP'
  if (id.includes('samsung') || id.includes('shealth') || /^sm-/i.test(s.nome)) return 'Telefono'
  if (id.includes('fitbit')) return 'Fitbit'
  if (id.includes('garmin')) return 'Garmin'
  return s.nome
}

/**
 * Da quale app leggere i passi.
 *
 * Health Connect somma tutte le app che scrivono passi: se il telefono conta i
 * suoi e il WHOOP i suoi, il totale non corrisponde a nessuno dei due — ed e'
 * esattamente il motivo per cui i numeri non combaciavano. Qui si sceglie una
 * sorgente sola, e i nomi non li invento: li chiedo a Health Connect.
 */
function SceltaSorgente({ onCambio }: { onCambio: (msg: string) => void }) {
  const [lista, setLista] = useState<SorgentePassi[] | null>(null)
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [apri, setApri] = useState(false)
  const [lavoro, setLavoro] = useState(false)

  useEffect(() => { void getUser().then((u) => setScelta(u?.passiSorgente)) }, [])

  const carica = async () => {
    setLavoro(true)
    try { setLista(await sorgentiPassi(7)) }
    catch (e) { onCambio((e as Error)?.message ?? 'Non riesco a vedere le sorgenti.') }
    finally { setLavoro(false) }
  }

  const scegli = async (id?: string) => {
    setLavoro(true)
    try {
      await updateUser({ passiSorgente: id })
      setScelta(id)
      const n = await sincronizzaPassi(30)
      const t = id ? lista?.find((x) => x.id === id) : undefined
      onCambio(n ? `${n} giornate rilette da ${t ? leggibile(t) : id ?? 'tutte le sorgenti'}.` : 'Nessun passo da quella sorgente.')
    } catch (e) { onCambio((e as Error)?.message ?? 'Non riuscito.') }
    finally { setLavoro(false) }
  }

  const nomeScelto = scelta
    ? (() => { const t = lista?.find((x) => x.id === scelta); return t ? leggibile(t) : scelta })()
    : 'tutte le sorgenti'

  if (!apri) {
    return (
      <button className="chip" style={{ marginTop: 8 }} disabled={lavoro}
        onClick={() => { setApri(true); if (!lista) void carica() }}>
        Sorgente: {nomeScelto} ›
      </button>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <p className="muted small" style={{ margin: '0 0 6px' }}>
        Chi scrive i passi, negli ultimi 7 giorni. Sceglierne una sola fa combaciare i numeri con la sua app.
      </p>
      {lavoro && !lista && <p className="muted small" style={{ margin: 0 }}>Guardo chi scrive…</p>}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className={'chip' + (scelta ? '' : ' on')} disabled={lavoro} onClick={() => void scegli(undefined)}>
          Tutte
        </button>
        {(lista ?? []).map((s) => (
          <button key={s.id} className={'chip' + (scelta === s.id ? ' on' : '')} disabled={lavoro}
            onClick={() => void scegli(s.id)}>
            {leggibile(s)} <span className="muted">· {s.passi.toLocaleString('it-IT')}</span>
          </button>
        ))}
      </div>
      {lista && lista.length === 0 && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>Nessuna app ha scritto passi negli ultimi 7 giorni.</p>
      )}
      <button className="chip" style={{ marginTop: 6 }} onClick={() => setApri(false)}>Chiudi</button>
    </div>
  )
}

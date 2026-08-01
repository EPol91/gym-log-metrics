import { useEffect, useState } from 'react'
import { fmtData } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import { STEPS, ensureHabits, getHabit, adjustHabitTarget, recentHabitEntries } from '../db/habits'
import { statoPassi, chiediPermessoPassi, sincronizzaPassi, type StatoPassi } from '../util/passi'

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

  const controlla = async () => { setStato(await statoPassi()) }
  useEffect(() => { void controlla() }, [])

  // Collegato: i giorni si aggiornano da soli a ogni apertura.
  useEffect(() => {
    if (typeof stato === 'object' && stato.stato === 'collegato') void sincronizzaPassi(14)
  }, [stato])

  // Nessun ramo muto: anche mentre controlla, la riga c'e' e lo dice. Prima, se
  // il ponte col nativo non rispondeva, qui non compariva proprio niente.
  if (stato === 'controllo') {
    return <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>Controllo Health Connect…</p>
  }

  if (stato.stato === 'fuoriDallApp') {
    return (
      <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
        {senzaDati ? 'Nessun dato ancora. ' : ''}
        I passi automatici arrivano da <strong style={{ color: 'var(--text)' }}>Health Connect</strong>, che esiste solo
        nell'app installata: dal browser quel dato non è raggiungibile — WHOOP non lo espone nella sua API.
      </p>
    )
  }

  if (stato.stato === 'assente') {
    return (
      <div style={{ marginTop: 12 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Health Connect non risponde: <strong style={{ color: 'var(--text)' }}>{stato.motivo}</strong>
        </p>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Su Android 14+ è già nel telefono: Impostazioni → Sicurezza e privacy → Altre impostazioni → Health Connect.
          Sui più vecchi si installa dal Play Store.
        </p>
        <button className="chip" disabled={lavoro} onClick={async () => {
          setLavoro(true); try { await controlla() } finally { setLavoro(false) }
        }}>{lavoro ? 'Riprovo…' : 'Riprova'}</button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      {stato.stato === 'daCollegare' ? (
        <>
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            I passi possono arrivare da soli da Health Connect. Serve il tuo permesso, una volta.
          </p>
          <button className="primary" style={{ width: '100%' }} disabled={lavoro}
            onClick={async () => {
              setLavoro(true)
              try {
                const r = await chiediPermessoPassi()
                if (r.ok) {
                  setStato({ stato: 'collegato' })
                  const n = await sincronizzaPassi(30)
                  setEsito(n ? `${n} giornate recuperate.` : 'Collegato: i passi arriveranno col prossimo aggiornamento.')
                } else setEsito(r.motivo ?? 'Permesso non concesso.')
              } finally { setLavoro(false) }
            }}>
            {lavoro ? 'Collego…' : 'Collega i passi'}
          </button>
        </>
      ) : (
        <div className="row spread" style={{ alignItems: 'center' }}>
          <span className="muted small">Passi da Health Connect · attivi</span>
          <button className="chip" disabled={lavoro} onClick={async () => {
            setLavoro(true)
            try { const n = await sincronizzaPassi(30); setEsito(n ? `${n} giornate aggiornate.` : 'Nessun passo trovato.') }
            finally { setLavoro(false) }
          }}>{lavoro ? '…' : '↻'}</button>
        </div>
      )}
      {esito && <p className="muted small" style={{ margin: '6px 0 0' }}>{esito}</p>}
    </div>
  )
}

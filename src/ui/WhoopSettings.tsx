import { useEffect, useState } from 'react'
import { fmtOre } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  connectUrl, whoopStatus, whoopDisconnect, syncWhoop, whoopDaysRecent, clearWhoopData,
  lastAutoSync,
  type WhoopStatus,
} from '../db/whoop'

/**
 * Collegamento con WHOOP. I dati arrivano da lì solo se glielo chiedi tu:
 * niente sincronizzazioni a tua insaputa, e scollegare cancella davvero.
 */
export function WhoopSettings() {
  const [stato, setStato] = useState<WhoopStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const giorni = useLiveQuery(() => whoopDaysRecent(14), [])

  const aggiornaStato = () => whoopStatus().then(setStato)
  useEffect(() => { aggiornaStato() }, [])

  // Tornando dal consenso l'indirizzo porta #whoop=ok: si sincronizza subito.
  useEffect(() => {
    if (location.hash !== '#whoop=ok') return
    history.replaceState(null, '', location.pathname)
    ;(async () => {
      await aggiornaStato()
      await sincronizza(90)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sincronizza(quanti: number) {
    setBusy('sync'); setEsito(null)
    try {
      const r = await syncWhoop(quanti)
      setEsito(`${r.giorni} giornate e ${r.allenamenti} allenamenti aggiornati.`
        + (r.troncato ? ' WHOOP ne aveva altri: tocca di nuovo per continuare.' : ''))
      await aggiornaStato()
    } catch (e) {
      setEsito(e instanceof Error && e.message.includes('401')
        ? 'Collegamento scaduto: ricollega WHOOP.'
        : 'Non sono riuscito a leggere da WHOOP. Riprova più tardi.')
    } finally { setBusy(null) }
  }

  const ultimo = giorni?.[0]

  if (stato === null) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Controllo il collegamento…</p></div>

  return (
    <div className="card">
      {!stato.collegato ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            Collega il tuo WHOOP: recupero, sonno, sforzo e allenamenti entrano nell'app e nel
            Check del giorno, senza che tu li riscriva a mano.
          </p>
          <a href={connectUrl()} style={{ textDecoration: 'none' }}>
            <button className="primary" style={{ width: '100%' }}>Collega WHOOP</button>
          </a>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Ti porta sul sito di WHOOP per il consenso. I dati restano tuoi: puoi revocare quando vuoi.
          </p>
        </>
      ) : (
        <>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <span className="small">
              <strong style={{ color: 'var(--good)' }}>● collegato</strong>
            </span>
            <button className="chip" disabled={busy === 'sync'} onClick={() => sincronizza(30)}>
              {busy === 'sync' ? 'aggiorno…' : '↻ Aggiorna'}
            </button>
          </div>

          {ultimo ? (
            <div className="row" style={{ gap: 6, marginTop: 10, textAlign: 'center' }}>
              {[
                { v: ultimo.recovery != null ? `${ultimo.recovery}%` : '—', l: 'recupero' },
                { v: fmtOre(ultimo.sleepHours), l: 'sonno' },
                { v: ultimo.strain != null ? `${ultimo.strain}` : '—', l: 'sforzo' },
                { v: ultimo.hrv != null ? `${ultimo.hrv}` : '—', l: 'HRV' },
              ].map((x) => (
                <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--gold)', fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
                  <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              Nessun dato ancora scaricato. Tocca Aggiorna.
            </p>
          )}

          {ultimo && <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>Ultima giornata: {ultimo.date}</p>}
          {lastAutoSync() && (
            <p className="muted small" style={{ marginTop: 2, marginBottom: 0 }}>
              Aggiornato da solo il {lastAutoSync()!.slice(0, 10)} alle {lastAutoSync()!.slice(11, 16)}
            </p>
          )}

          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <button className="chip" disabled={busy === 'sync'} onClick={() => sincronizza(180)}>Scarica 6 mesi</button>
            <button className="chip" style={{ color: '#e57373' }} disabled={!!busy}
              onClick={async () => {
                if (!confirm('Scollegare WHOOP e cancellare i dati scaricati?')) return
                setBusy('off')
                await whoopDisconnect()
                await clearWhoopData()
                await aggiornaStato()
                setEsito('WHOOP scollegato.')
                setBusy(null)
              }}>Scollega</button>
          </div>
        </>
      )}

      {esito && <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>{esito}</p>}
    </div>
  )
}

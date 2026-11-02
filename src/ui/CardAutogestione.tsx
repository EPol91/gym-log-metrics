// Riquadro di Oggi: «Invia dati ad Autogestione».
//
// Una riga: il pulsante a sinistra, l'ultimo invio e l'esito a destra. Toccando
// l'esito si apre il dettaglio (invii, domenica automatica, scollega). Se il
// backup ha molte meno righe dell'ultimo, il Worker non salva e qui si chiede.

import { useEffect, useState } from 'react'
import { Foglio } from './NotaCorpo'
import {
  invia, invii, chiave, collegaUrl, scollega, domenicaAttiva, setDomenica, toccaAutomatico,
  ORA_DOMENICA, NOMI_CALO, type Esito, type Calo,
} from '../db/autogestione'

const quando = (iso: string) => {
  const d = new Date(iso)
  const due = (n: number) => String(n).padStart(2, '0')
  return `${due(d.getDate())}.${due(d.getMonth() + 1)} ${due(d.getHours())}:${due(d.getMinutes())}`
}
const migliaia = (n: number) => n.toLocaleString('it-IT')
const ROSSO = '#e57373'

export function CardAutogestione() {
  const [, setGiro] = useState(0)
  const [busy, setBusy] = useState(false)
  const [calo, setCalo] = useState<{ calo: Calo[]; ultimo: { at: string } | null } | null>(null)
  const [dettaglio, setDettaglio] = useState(false)
  const k = chiave()
  const lista = invii()
  const ultimo = lista[0]
  const ultimoOk = lista.find((i) => i.ok)

  // Si ridisegna quando un invio finisce (anche quello automatico).
  useEffect(() => {
    const f = () => setGiro((g) => g + 1)
    window.addEventListener('autog', f)
    return () => window.removeEventListener('autog', f)
  }, [])

  async function vai(forza = false, auto = false) {
    if (busy) return
    setBusy(true)
    const r: Esito = await invia({ forza, auto })
    setBusy(false)
    if (r.tipo === 'calo' && !auto) setCalo({ calo: r.calo, ultimo: r.ultimo })
    setGiro((g) => g + 1)
  }

  // Domenica dalle 23:00, alla prima apertura (o se l'app è già aperta a quell'ora).
  useEffect(() => {
    const prova = () => { if (document.visibilityState === 'visible' && toccaAutomatico()) void vai(false, true) }
    prova()
    const t = window.setInterval(prova, 60000)
    document.addEventListener('visibilitychange', prova)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', prova) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bottone: React.CSSProperties = { flex: 'none', padding: '9px 12px', fontSize: 13.5, fontWeight: 700, borderRadius: 11 }
  const scaduto = !k || (ultimo && !ultimo.ok && ultimo.testo === 'collegamento scaduto')

  return (
    <>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        {scaduto ? (
          <a href={collegaUrl()} style={{ textDecoration: 'none', flex: 'none' }}>
            <button className="ghost" style={{ ...bottone, borderColor: '#4a3e18', color: 'var(--gold)' }}>{k ? 'Ricollega OneDrive' : 'Collega OneDrive'}</button>
          </a>
        ) : (
          <button className="primary" style={{ ...bottone, opacity: busy ? 0.75 : 1 }} disabled={busy} onClick={() => vai()}>
            {busy ? 'Invio…' : ultimo && !ultimo.ok ? '⇪ Riprova' : '⇪ Invia ad Autogestione'}
          </button>
        )}
        <button onClick={() => setDettaglio(true)}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, fontSize: 11.5, lineHeight: 1.3 }}>
          {!k ? <span className="muted">Una volta sola: entri con il tuo account Microsoft.</span>
            : !ultimo ? <span className="muted">Nessun invio ancora.</span>
              : ultimo.ok ? (
                <><span className="muted">{ultimo.auto ? 'inviato in automatico' : 'ultimo invio'}</span><br />
                  <b className="num" style={{ fontSize: 14 }}>{quando(ultimo.at)}</b> <span style={{ color: 'var(--good)' }}>· ok</span></>
              ) : (
                <><span style={{ color: ROSSO }}>{ultimo.testo}</span><br />
                  <span className="muted">{ultimoOk ? `resta il file del ${quando(ultimoOk.at)}` : `${quando(ultimo.at)}`}</span></>
              )}
        </button>
      </div>

      {calo && (
        <Foglio onClose={() => setCalo(null)}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Questo backup ha molti meno dati</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#c9c4b9' }}>
            Il file di oggi <b>non è stato toccato</b>.{calo.ultimo ? ` Rispetto all'ultimo invio (${quando(calo.ultimo.at)}):` : ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              <tr className="muted"><td>tabella</td><td style={{ textAlign: 'right' }}>prima</td><td style={{ textAlign: 'right' }}>ora</td></tr>
              {calo.calo.map((c) => (
                <tr key={c.tabella} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: '5px 0' }}>{NOMI_CALO[c.tabella] ?? c.tabella}</td>
                  <td style={{ textAlign: 'right' }}>{migliaia(c.prima)}</td>
                  <td style={{ textAlign: 'right', color: ROSSO }}>{migliaia(c.ora)} · −{Math.round((1 - c.ora / c.prima) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--muted)' }}>
            Può succedere dopo un cambio di telefono o un ripristino non riuscito. Se non sai perché, non salvare.
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="ghost" style={{ flex: 1 }} onClick={() => setCalo(null)}>Non salvare</button>
            <button className="ghost" style={{ flex: 1, color: ROSSO, borderColor: '#4a2a22' }} disabled={busy}
              onClick={async () => { setCalo(null); await vai(true) }}>Salva lo stesso</button>
          </div>
        </Foglio>
      )}

      {dettaglio && (
        <Foglio onClose={() => setDettaglio(false)}>
          <div className="row spread">
            <span style={{ fontWeight: 700, fontSize: 15 }}>Invii ad Autogestione</span>
            <button className="ghost small" style={{ border: 'none', padding: '4px 0', color: 'var(--gold)', fontWeight: 600 }} onClick={() => setDettaglio(false)}>Fatto</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--muted)' }}>
            Il backup completo va in OneDrive › Autogestione › ETP, un file al giorno: un secondo invio nello stesso giorno sostituisce il primo.
            Si tengono gli ultimi 30 giorni più le domeniche. La chiave AI non viene inviata.
          </div>
          <label className="row" style={{ gap: 10, padding: '8px 0', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
            <span style={{ flex: 1, fontSize: 13 }}>Invio automatico la domenica
              <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Alla prima apertura dell'app dalle {ORA_DOMENICA}, se non è già partito.</span>
            </span>
            <input type="checkbox" checked={domenicaAttiva()} onChange={(e) => { setDomenica(e.target.checked); setGiro((g) => g + 1) }}
              style={{ width: 20, height: 20, flex: 'none', accentColor: 'var(--gold)' }} />
          </label>
          <div style={{ fontSize: 12 }}>
            {lista.length === 0 ? <div className="muted">Nessun invio ancora.</div> : lista.map((i) => (
              <div key={i.at} className="row spread" style={{ padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <span>{quando(i.at)}{i.auto ? <span className="muted"> · auto</span> : null}</span>
                <span style={{ color: i.ok ? 'var(--good)' : ROSSO }}>{i.testo}</span>
              </div>
            ))}
          </div>
          {k && (
            <button className="ghost" style={{ color: 'var(--muted)' }}
              onClick={async () => { if (confirm('Scollegare OneDrive? Per inviare di nuovo dovrai rifare l\'accesso Microsoft.')) { await scollega(); setDettaglio(false) } }}>
              Scollega OneDrive
            </button>
          )}
        </Foglio>
      )}
    </>
  )
}

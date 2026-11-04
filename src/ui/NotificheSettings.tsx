import { useEffect, useState } from 'react'
import { PROMEMORIA, attivo, accendi, promemoriaDisponibili, oraPesata, impostaOraPesata, programmaPesataMattino, diagnosiNotifiche, notificaDiProva, type Tipo, type Diagnosi } from '../util/promemoria'

/** Quelle che arrivano a un'ora precisa, anche ad app chiusa. Le altre solo se serve. */
const A_ORARIO: Tipo[] = ['mattino', 'pasto', 'uscita']

/** Quante sono accese, e a che ora la pesata: la riga del Profilo dice questo. */
export function riassuntoNotifiche(): string {
  const accese = PROMEMORIA.filter((p) => attivo(p.tipo)).length
  return attivo('mattino') ? `pesata ${oraPesata()} · ${accese} accese` : `${accese} accese`
}

/**
 * Le notifiche, tutte in un posto. Prima stavano sotto «Coach», dove nessuno
 * le andava a cercare.
 */
export function NotificheSettings() {
  const [accese, setAccese] = useState(() => new Set(PROMEMORIA.filter((p) => attivo(p.tipo)).map((p) => p.tipo)))
  const [ora, setOra] = useState(oraPesata)

  function cambia(t: Tipo) {
    accendi(t, !accese.has(t))
    setAccese(new Set(PROMEMORIA.filter((p) => attivo(p.tipo)).map((p) => p.tipo)))
    if (t === 'mattino') void programmaPesataMattino()
  }

  const riga = (r: (typeof PROMEMORIA)[number]) => {
    const on = accese.has(r.tipo)
    return (
      <div key={r.tipo} className="voce-n">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5 }}>{r.nome}</div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>{r.nota}</div>
          {r.tipo === 'mattino' && on && (
            <div className="row" style={{ gap: 8, marginTop: 8, fontSize: 13 }}>
              <span className="muted">alle</span>
              <input type="time" value={ora} style={{ width: 110, padding: '6px 10px' }}
                onChange={(e) => {
                  if (!e.target.value) return
                  setOra(e.target.value)
                  impostaOraPesata(e.target.value)
                  void programmaPesataMattino()
                }} />
            </div>
          )}
        </div>
        <button role="switch" aria-checked={on} aria-label={r.nome} className={on ? 'interruttore on' : 'interruttore'}
          onClick={() => cambia(r.tipo)} />
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="muted small" style={{ margin: 0, lineHeight: 1.45 }}>
        Arrivano solo quando c’è qualcosa da fare, e compaiono anche in Oggi finché non le metti via.
      </p>
      <div className="lista-p">{PROMEMORIA.filter((p) => A_ORARIO.includes(p.tipo)).map(riga)}</div>
      <span className="etichetta-p">Solo se serve</span>
      <div className="lista-p">{PROMEMORIA.filter((p) => !A_ORARIO.includes(p.tipo)).map(riga)}</div>
      {!promemoriaDisponibili() && (
        <p className="muted small" style={{ margin: 0 }}>
          Le notifiche arrivano solo nell’app installata: nel browser restano le righe in Oggi.
        </p>
      )}
      <Controllo />
    </div>
  )
}

const fmtQuando = (iso: string | null) => {
  if (!iso) return 'subito'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Lo stato vero sul telefono: permessi, cosa c'e' in coda, l'ultimo errore. */
function Controllo() {
  const [d, setD] = useState<Diagnosi | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const aggiorna = () => { void diagnosiNotifiche().then(setD) }
  useEffect(aggiorna, [])

  const voce = (nome: string, valore: string, ok: boolean) => (
    <div className="row spread" style={{ padding: '8px 12px', fontSize: 13 }}>
      <span className="muted">{nome}</span>
      <b style={{ fontWeight: 600, color: ok ? 'var(--good)' : '#e0614f' }}>{valore}</b>
    </div>
  )

  return (
    <>
      <span className="etichetta-p">Controllo</span>
      <div className="lista-p">
        {d && (
          <>
            {voce('Plugin notifiche', d.plugin ? 'presente' : 'assente', d.plugin)}
            {voce('Permesso notifiche', d.permesso, d.permesso === 'granted')}
            {voce('Allarmi esatti', d.esatti, d.esatti === 'granted')}
            <div style={{ padding: '8px 12px', fontSize: 13, borderTop: '1px solid var(--line-soft)' }}>
              <span className="muted">In coda: {d.inCoda.length}</span>
              {d.inCoda.map((n) => (
                <div key={n.id} style={{ fontSize: 12, marginTop: 3 }}>#{n.id} · {fmtQuando(n.quando)} · {n.titolo}</div>
              ))}
            </div>
            {d.errore && (
              <div style={{ padding: '8px 12px', fontSize: 12, borderTop: '1px solid var(--line-soft)', color: '#e0614f' }}>
                Ultimo errore ({d.errore.dove}, {fmtQuando(d.errore.quando)}): {d.errore.testo}
              </div>
            )}
          </>
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="primary" style={{ flex: 1 }}
          onClick={() => { setEsito('…'); void notificaDiProva().then((m) => { setEsito(m); aggiorna() }) }}>Prova fra 1 minuto</button>
        <button className="ghost" style={{ flex: '0 0 96px' }} onClick={aggiorna}>Aggiorna</button>
      </div>
      {esito && <p className="muted small" style={{ margin: 0 }}>{esito}</p>}
    </>
  )
}

import { useState } from 'react'
import { PROMEMORIA, attivo, accendi, promemoriaDisponibili, oraPesata, impostaOraPesata, programmaPesataMattino, type Tipo } from '../util/promemoria'

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
    </div>
  )
}

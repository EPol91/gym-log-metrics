// Profilo → I tuoi orari: il lavoro e le fasce dei pasti.
//
// Li metti una volta. Quello che l'app sa gia' da sola — sonno da WHOOP,
// allenamento dalle sedute, pasti dall'ora che segni in Cibo — non te lo chiede.

import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, updateUser } from '../db/repo'
import { orariDi, ORARI_DEFAULT } from '../tempo/orari'
import type { OrariUtente } from '../db/schema'

/** Lunedi' per primo, come li leggi. Il numero e' quello di Date.getDay(). */
const GIORNI: [string, number][] = [['Lu', 1], ['Ma', 2], ['Me', 3], ['Gi', 4], ['Ve', 5], ['Sa', 6], ['Do', 0]]

const ORA: React.CSSProperties = {
  width: 92, flex: 'none', textAlign: 'center', padding: '6px 4px',
  fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 17, color: 'var(--gold)',
}

export function OrariSettings() {
  const user = useLiveQuery(getUser, [])
  if (!user) return null
  const o = orariDi(user)
  const lavoro = o.lavoro ?? ORARI_DEFAULT.lavoro!
  // Si scrive tutto insieme: e' un oggetto solo, e gli orari di partenza
  // diventano tuoi alla prima modifica, non prima.
  const salva = (nuovo: OrariUtente) => { void updateUser({ orari: nuovo }) }
  const setLavoro = (p: Partial<NonNullable<OrariUtente['lavoro']>>) => salva({ ...o, lavoro: { ...lavoro, ...p } })
  const setFascia = (i: number, p: Partial<OrariUtente['pasti'][number]>) =>
    salva({ ...o, pasti: o.pasti.map((f, j) => (j === i ? { ...f, ...p } : f)) })

  const riga = (etichetta: React.ReactNode, campo: React.ReactNode) => (
    <div className="row spread" style={{ alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--line-soft)' }}>
      <span style={{ fontSize: 14, minWidth: 0 }}>{etichetta}</span>
      {campo}
    </div>
  )

  return (
    <div className="col" style={{ gap: 10 }}>
      <p className="muted small" style={{ margin: 0 }}>
        Sonno, allenamento e pasti non te li chiede: arrivano da WHOOP, dalle sedute e dall'ora che segni in Cibo.
      </p>

      <div className="card" style={{ margin: 0 }}>
        <span className="eyebrow">Lavoro</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, margin: '8px 0 4px' }}>
          {GIORNI.map(([l, g]) => {
            const on = lavoro.giorni.includes(g)
            return (
              <button key={l} className={on ? 'chip on' : 'chip'} style={{ padding: '5px 0', width: '100%' }}
                onClick={() => setLavoro({ giorni: on ? lavoro.giorni.filter((x) => x !== g) : [...lavoro.giorni, g] })}>{l}</button>
            )
          })}
        </div>
        {riga('Entrata', <input type="time" value={lavoro.entrata} style={ORA} onChange={(e) => e.target.value && setLavoro({ entrata: e.target.value })} />)}
        {riga('Uscita', <input type="time" value={lavoro.uscita} style={ORA} onChange={(e) => e.target.value && setLavoro({ uscita: e.target.value })} />)}
        {riga(<>A volte fino alle<br /><span className="muted" style={{ fontSize: 11.5 }}>la finestra in cui esci tardi</span></>,
          <input type="time" value={lavoro.uscitaFinoA ?? lavoro.uscita} style={ORA} onChange={(e) => e.target.value && setLavoro({ uscitaFinoA: e.target.value })} />)}
        {riga('Pausa pranzo', (
          <span className="row" style={{ gap: 4, flex: 'none' }}>
            <input type="time" value={lavoro.pausa?.dalle ?? '12:00'} style={{ ...ORA, width: 78 }}
              onChange={(e) => e.target.value && setLavoro({ pausa: { dalle: e.target.value, alle: lavoro.pausa?.alle ?? '14:00' } })} />
            <input type="time" value={lavoro.pausa?.alle ?? '14:00'} style={{ ...ORA, width: 78 }}
              onChange={(e) => e.target.value && setLavoro({ pausa: { dalle: lavoro.pausa?.dalle ?? '12:00', alle: e.target.value } })} />
          </span>
        ))}
      </div>

      <div className="card" style={{ margin: 0 }}>
        <span className="eyebrow">Pasti · le tue fasce</span>
        <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 2px', lineHeight: 1.45 }}>
          Vanno ai pasti del giorno in ordine, l'intra-workout escluso; l'ultimo pasto prende sempre l'ultima fascia.
          Se a fine fascia un pasto non ha l'ora, te la ricorda.
        </p>
        {o.pasti.map((f, i) => (
          <div key={i} className="row" style={{ gap: 4, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line-soft)' }}>
            <input defaultValue={f.nome} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== f.nome) setFascia(i, { nome: n }) }}
              style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 13.5 }} />
            <input type="time" value={f.dalle} style={{ ...ORA, width: 74, fontSize: 16 }} onChange={(e) => e.target.value && setFascia(i, { dalle: e.target.value })} />
            <input type="time" value={f.alle} style={{ ...ORA, width: 74, fontSize: 16 }} onChange={(e) => e.target.value && setFascia(i, { alle: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  )
}

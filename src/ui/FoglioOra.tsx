// «A che ora?»: il foglio dell'ora di un pasto.
//
// Si apre da solo alla prima spunta di un pasto senza ora, con la proposta
// «adesso»; si riapre toccando l'ora. Un tocco conferma, −5/+5/−15/+15
// spostano, e c'e' «Ho saltato il pasto» — che vale solo per l'analisi del
// tempo: diario, spunte e RS non cambiano.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import { impostaOraPasto, segnaPastoSaltato } from '../db/diet'
import { hhmm, minuti } from '../tempo/orari'

export function FoglioOra({ mealId, nome, proposta, diSolito, giaSegnato, onFatto, onClose }: {
  mealId: string
  nome: string
  /** l'ora da cui parte il foglio: «adesso», o quella gia' segnata */
  proposta: string
  /** l'ora a cui di solito mangi questo pasto, se si sa */
  diSolito?: string
  /** il pasto ha gia' un'ora o e' segnato saltato: si puo' togliere */
  giaSegnato: boolean
  /** dopo che hai scelto: chi ha aperto il foglio aggiorna i promemoria */
  onFatto?: () => void
  onClose: () => void
}) {
  useBloccoScroll()
  useIndietro(onClose)
  const [ora, setOra] = useState(proposta)
  const sposta = (d: number) => setOra((o) => hhmm(minuti(o) + d))
  const fatto = async (azione: () => Promise<void>) => { await azione(); onFatto?.(); onClose() }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', background: '#171613', borderTop: '1px solid var(--line)',
          borderRadius: '22px 22px 0 0', padding: '12px 18px calc(18px + var(--sicuro-basso))',
          boxShadow: '0 -18px 40px #000a',
        }}>
        <div style={{ width: 40, height: 4, borderRadius: 9, background: '#3a3730', margin: '0 auto 12px' }} />
        <div className="row spread" style={{ alignItems: 'baseline' }}>
          <span className="eyebrow">{nome} · a che ora?</span>
          {diSolito && <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>di solito {diSolito}</span>}
        </div>

        {/* L'ora grande si tocca anche per scriverla: si apre l'orologio del telefono. */}
        <input type="time" value={ora} onChange={(e) => { if (e.target.value) setOra(e.target.value) }}
          aria-label="Ora del pasto"
          style={{
            display: 'block', width: '100%', margin: '8px 0 0', padding: 0, border: 0, background: 'transparent',
            textAlign: 'center', fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 56, lineHeight: 1.05,
            color: 'var(--gold)', fontVariantNumeric: 'tabular-nums',
          }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginTop: 12 }}>
          {[-15, -5, 5, 15].map((d) => (
            <button key={d} style={{ padding: '9px 0', fontWeight: 600 }} onClick={() => sposta(d)}>
              {d > 0 ? `+${d}` : `−${-d}`}
            </button>
          ))}
        </div>

        <button className="primary" style={{ width: '100%', marginTop: 12, padding: 13, fontSize: 16 }}
          onClick={() => fatto(() => impostaOraPasto(mealId, ora))}>
          Va bene, {ora}
        </button>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={() => fatto(() => segnaPastoSaltato(mealId))}>
            Ho saltato il pasto
          </button>
          {giaSegnato && (
            <button className="ghost" style={{ flex: 1, color: 'var(--muted)' }} onClick={() => fatto(() => impostaOraPasto(mealId, null))}>
              Togli l'ora
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>
          Serve solo all'analisi del tempo: diario e RS non cambiano.
        </p>
      </div>
    </div>,
    document.body,
  )
}

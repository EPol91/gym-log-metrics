// «A che ora?»: il foglio di un'ora — quella di un pasto, o dell'uscita dall'ufficio.
//
// Per i pasti si apre da solo alla prima spunta di un pasto senza ora, con la
// proposta «adesso»; si riapre toccando l'ora. Un tocco conferma, −5/+5/−15/+15
// spostano, e c'e' «Ho saltato il pasto» — che vale solo per l'analisi del
// tempo: diario, spunte e RS non cambiano.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import { impostaOraPasto, segnaPastoSaltato } from '../db/diet'
import { hhmm, minuti } from '../tempo/orari'

export interface AltraScelta { testo: string; tenue?: boolean; fai: () => Promise<void> }

/** Il foglio nudo: l'ora grande, gli spostamenti, «Va bene» e le scelte sotto. */
export function FoglioOrario({ titolo, domanda = 'a che ora?', proposta, diSolito, onOra, altre = [], nota, onFatto, onClose }: {
  titolo: string
  domanda?: string
  /** l'ora da cui parte il foglio: «adesso», o quella gia' segnata */
  proposta: string
  /** l'ora solita, se si sa */
  diSolito?: string
  onOra: (ora: string) => Promise<void>
  /** i bottoni sotto «Va bene»: «Ho saltato il pasto», «Togli l'ora»… */
  altre?: AltraScelta[]
  nota?: string
  /** dopo che hai scelto: chi ha aperto il foglio aggiorna quello che serve */
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
          <span className="eyebrow">{titolo} · {domanda}</span>
          {diSolito && <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>di solito {diSolito}</span>}
        </div>

        {/* L'ora grande si tocca anche per scriverla: si apre l'orologio del telefono. */}
        <input type="time" value={ora} onChange={(e) => { if (e.target.value) setOra(e.target.value) }}
          aria-label={`Ora: ${titolo}`}
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
          onClick={() => fatto(() => onOra(ora))}>
          Va bene, {ora}
        </button>
        {altre.length > 0 && (
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {altre.map((a) => (
              <button key={a.testo} className="ghost" style={{ flex: 1, ...(a.tenue ? { color: 'var(--muted)' } : {}) }} onClick={() => fatto(a.fai)}>
                {a.testo}
              </button>
            ))}
          </div>
        )}
        {nota && (
          <p className="muted" style={{ fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>{nota}</p>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Il foglio dell'ora di un pasto, come lo apre Cibo. */
export function FoglioOra({ mealId, nome, proposta, diSolito, giaSegnato, onFatto, onClose }: {
  mealId: string
  nome: string
  proposta: string
  diSolito?: string
  /** il pasto ha gia' un'ora o e' segnato saltato: si puo' togliere */
  giaSegnato: boolean
  onFatto?: () => void
  onClose: () => void
}) {
  return (
    // L'ora che conta e' quella in cui hai finito: da li' si misura quanto
    // manca al letto. Ed e' anche la piu' comoda: la segni appena finisci.
    <FoglioOrario titolo={nome} domanda="a che ora hai finito?" proposta={proposta} diSolito={diSolito}
      onOra={(ora) => impostaOraPasto(mealId, ora)}
      altre={[
        { testo: 'Ho saltato il pasto', fai: () => segnaPastoSaltato(mealId) },
        ...(giaSegnato ? [{ testo: "Togli l'ora", tenue: true, fai: () => impostaOraPasto(mealId, null) }] : []),
      ]}
      nota="Serve solo all'analisi del tempo: diario e RS non cambiano."
      onFatto={onFatto} onClose={onClose} />
  )
}

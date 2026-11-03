// Lo scudo delle regole nella testata di Oggi, accanto al calendarietto.
//
// Il numero sono gli avvisi da vedere (fuori + da guardare): rosso se almeno uno
// è fuori, arancione se sono solo da guardare. Tutto ok = niente numero, scudo
// grigio. Se gli avvisi non sono mai arrivati, lo scudo non c'è.
// Il tocco apre il foglio con tutti gli avvisi, come il cruscotto del Cockpit.

import { useEffect, useState } from 'react'
import { Foglio } from './NotaCorpo'
import { avvisiSalvati, aggiornaAvvisi, daVedere, type AvvisiRegole, type AvvisoRegola, type Livello } from '../db/avvisiRegole'

/** Gli stessi colori del Cockpit. */
const COLORE: Record<Livello, string> = { fuori: '#e5484d', attenzione: '#f76b15', ok: '#30a46c', info: '#8fa7c4' }

const GRAVITA: Record<Livello, number> = { fuori: 0, attenzione: 1, ok: 2, info: 3 }

const ggmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

export function ScudoRegole() {
  const [a, setA] = useState<AvvisiRegole | null>(avvisiSalvati)
  const [aperto, setAperto] = useState(false)

  useEffect(() => {
    const f = () => setA(avvisiSalvati())
    const prova = () => { if (document.visibilityState === 'visible') void aggiornaAvvisi() }
    window.addEventListener('autog-avvisi', f)
    document.addEventListener('visibilitychange', prova)
    prova()
    return () => { window.removeEventListener('autog-avvisi', f); document.removeEventListener('visibilitychange', prova) }
  }, [])

  if (!a) return null
  const vedere = daVedere(a)
  const fuori = vedere.some((x) => x.livello === 'fuori')
  const n = vedere.length

  return (
    <>
      <button onClick={() => { setAperto(true); void aggiornaAvvisi(true) }} aria-label={n ? `Regole: ${n} avvisi da vedere` : 'Regole: tutto ok'}
        style={{
          position: 'relative', height: 64, width: 44, padding: 0, flex: '0 0 auto',
          background: 'linear-gradient(180deg, #181714, var(--surface) 60%)', border: '1px solid var(--line)', borderRadius: 12,
          boxShadow: 'inset 0 1px 0 #ffffff08',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
          color: n ? 'var(--gold)' : 'var(--faint)',
        }}>
        <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <span className="muted" style={{ fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>regole</span>
        {n > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99,
            background: fuori ? COLORE.fuori : COLORE.attenzione, color: '#fff', font: '700 11px/18px var(--f-testo)',
            boxShadow: '0 0 0 2px var(--bg)',
          }}>{n}</span>
        )}
      </button>
      {aperto && <FoglioRegole a={a} onClose={() => setAperto(false)} />}
    </>
  )
}

function FoglioRegole({ a, onClose }: { a: AvvisiRegole; onClose: () => void }) {
  // Divisi per area, nell'ordine in cui arrivano (peso e dieta, forza, movimento, recupero);
  // dentro l'area prima il più grave.
  const aree: [string, AvvisoRegola[]][] = []
  for (const x of [...a.avvisi].sort((p, q) => GRAVITA[p.livello] - GRAVITA[q.livello])) {
    const g = aree.find(([n]) => n === x.area)
    if (g) g[1].push(x); else aree.push([x.area, [x]])
  }
  const sett = a.settimana.split('-W')[1]
  return (
    <Foglio onClose={onClose} alto>
      <div className="row spread" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Avvisi delle regole</h2>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            sett. {Number(sett)} · {ggmm(a.dal)} → {ggmm(a.al)} · calcolati il {ggmm(a.aggiornato)}
          </div>
        </div>
        {a.rs && (
          <span style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: 'var(--gold)', border: '1px solid #4a3e18', background: 'var(--gold-bg)', whiteSpace: 'nowrap', marginTop: 4 }}>
            piano RS: si guarda
          </span>
        )}
      </div>
      {aree.map(([area, lista]) => (
        <div key={area}>
          <div className="muted" style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', fontWeight: 600, margin: '4px 0 6px' }}>{area}</div>
          {lista.map((x) => <Riga key={x.titolo} x={x} />)}
        </div>
      ))}
    </Foglio>
  )
}

const NUMERO: React.CSSProperties = { fontFamily: 'var(--f-numeri)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }

/** Un avviso: titolo e dato; righe e conto sempre; nota, soglia e «l'ombra farebbe» col tocco (aperti se è fuori). */
function Riga({ x }: { x: AvvisoRegola }) {
  const [dettagli, setDettagli] = useState(x.livello === 'fuori')
  const c = COLORE[x.livello]
  const conDettagli = !!(x.soglia || x.ombra)
  return (
    <div onClick={() => conDettagli && setDettagli((d) => !d)}
      style={{ border: '1px solid var(--line)', borderRadius: 13, background: 'var(--surface-2)', padding: '9px 11px', marginBottom: 7, cursor: conDettagli ? 'pointer' : 'default' }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <i style={{ width: 8, height: 8, borderRadius: '50%', background: c, flex: 'none', transform: 'translateY(-1px)' }} />
        <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0 }}>
          {x.titolo}
          {x.regola && <span className="muted" style={{ fontWeight: 500, fontSize: 10.5, marginLeft: 6, whiteSpace: 'nowrap' }}>{/^\d+$/.test(x.regola) ? `regola ${x.regola}` : x.regola}</span>}
        </span>
        <span style={{ ...NUMERO, fontSize: 16, color: c, whiteSpace: 'nowrap' }}>{x.dato.replace(/(\d{2}\.\d{2})\.\d{4}/, '$1')}</span>
      </div>
      {dettagli && x.nota && <div className="muted" style={{ fontSize: 10.5, textAlign: 'right', marginTop: 1 }}>{x.nota}</div>}
      {dettagli && (
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '3px 8px', fontSize: 11.5, lineHeight: 1.4, marginTop: 6 }}>
          {x.soglia && <><span className="muted">Soglia</span><span>{x.soglia}</span></>}
          {x.ombra && <><span className="muted">L'ombra farebbe</span><span>{x.ombra}</span></>}
        </div>
      )}
      {x.righe && x.righe.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11.5 }}>
          {x.righe.map((r) => (
            <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '4px 0', borderTop: '1px solid var(--line-soft)' }}>
              <span style={{ minWidth: 0 }}>{r[0]}</span>
              <span style={{ ...NUMERO, fontSize: 14 }}>{r[1]}</span>
              <span className="muted">{(r[2] ?? '').replace('esposizioni', 'esp.')}</span>
            </div>
          ))}
        </div>
      )}
      {x.conto && x.conto.length > 0 && (
        <div style={{ marginTop: 7, borderTop: '1px dashed var(--line)', paddingTop: 6, fontSize: 11.5 }}>
          {x.conto.map((r, i) => {
            const tot = i === x.conto!.length - 1
            return (
              <div key={r[0]} className="row spread" style={{ padding: '1px 0', color: tot ? 'var(--gold)' : undefined, fontWeight: tot ? 600 : undefined }}>
                <span className={tot ? undefined : 'muted'}>{tot && x.soglia ? `${r[0]} · soglia ${x.soglia.split(' ')[0]}` : r[0]}</span>
                <span style={{ ...NUMERO, fontSize: 14 }}>{r[1]}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

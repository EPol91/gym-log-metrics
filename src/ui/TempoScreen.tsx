// Salute → Tempo: la giornata com'e' andata, su una linea dalle 6 a mezzanotte.
//
// Si costruisce da sola: sonno (WHOOP), lavoro (i tuoi orari), allenamento
// (le sedute), pasti (l'ora segnata in Cibo). A destra gli intervalli che
// contano per dormire bene: dalla fine dell'allenamento alla cena, dalla cena
// al letto. L'uscita dall'ufficio si corregge toccando il lavoro.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { giornataTempo, durata, type Blocco } from '../tempo/giornata'
import { todayLocal, shiftDate, etichettaGiorno } from '../util/date'
import { segnaUscita, togliUscita } from '../tempo/orari'
import { FoglioOrario } from './FoglioOra'

/** Pixel per ora: 19 ore stanno in poco piu' di mezzo schermo. */
const PX = 28
const LARGO_DESTRA = 88

const STILE: Record<Blocco['tipo'], React.CSSProperties> = {
  sonno: { background: '#161a2e', border: '1px solid #2b3466', color: '#8f9de6' },
  lavoro: { background: '#1b1a17', border: '1px solid #34312b', color: '#b9b3a6' },
  pausa: { background: 'transparent', border: '1px dashed #2a2824', color: 'var(--faint)' },
  uscita: { background: 'repeating-linear-gradient(135deg, #1b1a17 0 5px, #24221e 5px 10px)', border: '1px dashed #3a3730', color: 'var(--muted)' },
  allena: { background: 'linear-gradient(180deg, #3a3012, #261f0c)', border: '1px solid #6b5822', color: 'var(--gold)' },
  libero: { background: 'transparent', border: '1px dashed #2f3a2f', color: '#7fae8a' },
}

const hh = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function TempoScreen() {
  const oggi = todayLocal()
  const [data, setData] = useState(oggi)
  const [foglioUscita, setFoglioUscita] = useState(false)
  const g = useLiveQuery(() => giornataTempo(data), [data])
  const y = (m: number) => ((m - (g?.inizio ?? 360)) / 60) * PX

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" style={{ padding: '6px 12px' }} onClick={() => setData((d) => shiftDate(d, -1))} aria-label="Giorno prima">‹</button>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          {/^(Oggi|Ieri)$/.test(etichettaGiorno(data, oggi)) && `${etichettaGiorno(data, oggi)} · `}
          {new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <button className="ghost small" style={{ padding: '6px 12px' }} disabled={data >= oggi}
          onClick={() => setData((d) => shiftDate(d, 1))} aria-label="Giorno dopo">›</button>
      </div>

      {g && (
        <div className="card" style={{ margin: 0, padding: '14px 12px 12px' }}>
          <div style={{ position: 'relative', height: ((g.fine - g.inizio) / 60) * PX, marginLeft: 34 }}>
            {/* le ore, ogni due */}
            {Array.from({ length: Math.floor((g.fine - g.inizio) / 120) + 1 }, (_, i) => g.inizio + i * 120).map((m) => (
              <div key={m}>
                <div style={{ position: 'absolute', left: -34, width: 28, top: y(m) - 7, textAlign: 'right', fontFamily: 'var(--f-numeri)', fontSize: 12, color: 'var(--faint)' }}>
                  {hh(m).slice(0, 2)}
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: y(m), borderTop: '1px dashed #24221e' }} />
              </div>
            ))}

            {/* i blocchi: sonno, lavoro, allenamento, tempo libero */}
            {g.blocchi.map((b, i) => {
              const alto = Math.max(16, y(b.alle) - y(b.dalle))
              const matita = b.uscita && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>✎</span>
              return (
                <div key={i} {...(b.uscita ? { role: 'button', onClick: () => setFoglioUscita(true), 'aria-label': `Correggi l'uscita dall'ufficio, ora ${g.uscita?.ora}` } : {})}
                  style={{
                    position: 'absolute', left: 0, right: LARGO_DESTRA, top: y(b.dalle), height: alto,
                    borderRadius: 8, padding: '2px 8px', fontSize: 11.5, overflow: 'hidden', lineHeight: 1.3, ...STILE[b.tipo],
                    ...(b.uscita ? { cursor: 'pointer' } : {}),
                  }}>
                  <strong style={{ fontWeight: 600 }}>{b.testo}</strong>
                  {b.sotto && alto >= 30 ? <div style={{ opacity: .85 }}>{b.sotto}{matita}</div> : matita}
                </div>
              )
            })}

            {/* i pasti: un punto all'ora in cui li hai mangiati */}
            {g.pasti.filter((p) => p.ora != null).map((p) => (
              <div key={p.id} style={{ position: 'absolute', left: -5, top: y(p.ora!), transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                <i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--carb)', boxShadow: '0 0 0 3px #ffc63d22', flex: 'none' }} />
                <span style={{ background: 'var(--surface)', padding: '0 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                  <b style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 13, color: 'var(--carb)' }}>{hh(p.ora!)}</b> {p.nome}
                </span>
              </div>
            ))}

            {/* gli intervalli che contano, a destra */}
            {g.intervalli.map((it, i) => (
              <div key={i} style={{
                position: 'absolute', right: 0, width: LARGO_DESTRA - 6, top: y(it.dalle), height: Math.max(26, y(it.alle) - y(it.dalle)),
                borderRight: '2px solid var(--gold)', paddingRight: 6, textAlign: 'right', fontSize: 10.5, lineHeight: 1.2,
                color: 'var(--muted)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <b style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 15, color: 'var(--gold)' }}>{durata(it.alle - it.dalle)}</b>
                {it.etichetta}
              </div>
            ))}
          </div>
        </div>
      )}

      {g && (g.pasti.some((p) => p.saltato) || g.senzaOra.length > 0) && (
        <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
          {g.pasti.filter((p) => p.saltato).length > 0 && <>Saltati: {g.pasti.filter((p) => p.saltato).map((p) => p.nome).join(', ')}. </>}
          {g.senzaOra.length > 0 && <>Senza ora: {g.senzaOra.join(', ')} — la segni in Cibo, toccando l'ora del pasto.</>}
        </p>
      )}
      <p className="muted" style={{ fontSize: 11, margin: 0 }}>
        Sonno da WHOOP, allenamento dalle sedute, pasti dall'ora in Cibo, lavoro dai tuoi orari (Profilo).
      </p>

      {foglioUscita && g?.uscita && (
        <FoglioOrario titolo="Uscita dall'ufficio" proposta={g.uscita.ora} diSolito={g.uscita.solita}
          onOra={(ora) => segnaUscita(data, ora)}
          altre={g.uscita.segnata ? [{ testo: "Torna all'orario solito", tenue: true, fai: () => togliUscita(data) }] : []}
          onClose={() => setFoglioUscita(false)} />
      )}
    </div>
  )
}

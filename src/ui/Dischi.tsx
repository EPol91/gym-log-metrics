import { useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Che dischi caricare per arrivare al peso che hai scritto.
 *
 * Non e' pigrizia: 82,5 kg col bilanciere da 20 sono 31,25 per lato, e farlo a
 * mente fra una serie e l'altra e' il modo migliore per caricarne 32,5 e non
 * accorgersene. Qui il conto e' fatto sui dischi che ha DAVVERO la tua palestra.
 */

const DISCHI_KEY = 'gymlog.dischi'
const BILANCIERE_KEY = 'gymlog.bilanciere'

/** Quello che si trova in una palestra normale, in kg. */
const DEFAULT = [25, 20, 15, 10, 5, 2.5, 1.25]

export function dischiDisponibili(): number[] {
  try {
    const s = localStorage.getItem(DISCHI_KEY)
    const v = s ? (JSON.parse(s) as number[]) : null
    return v?.length ? [...v].sort((a, b) => b - a) : DEFAULT
  } catch { return DEFAULT }
}

/**
 * Il peso della barra, zero per scelta.
 *
 * Cambi palestra e il bilanciere pesa diverso: l'unico numero che sai per certo
 * sono i dischi che infili. Contarci dentro una barra presunta vuol dire
 * scrivere carichi che non tornano fra una palestra e l'altra. Chi vuole
 * sommarla la imposta e resta impostata.
 */
export function bilanciere(): number {
  const v = Number(localStorage.getItem(BILANCIERE_KEY))
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Quanti dischi per lato, dal piu' pesante. Se il peso non e' raggiungibile
 * si dice quanto manca invece di arrotondare di nascosto: mezzo chilo di
 * differenza sul bilanciere non e' un dettaglio quando il numero lo scrivi.
 */
export function perLato(peso: number, barra: number, disponibili: number[]): { dischi: number[]; resto: number } {
  let lato = (peso - barra) / 2
  if (lato < 0) return { dischi: [], resto: peso - barra }
  const dischi: number[] = []
  for (const d of disponibili) {
    while (lato >= d - 0.001) { dischi.push(d); lato -= d }
  }
  return { dischi, resto: Math.round(lato * 100) / 100 }
}

const n = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')

export function Dischi({ peso, onClose }: { peso: number; onClose: () => void }) {
  const [barra, setBarra] = useState(bilanciere())
  const [lista, setLista] = useState(dischiDisponibili())
  const [modifica, setModifica] = useState(false)

  const { dischi, resto } = perLato(peso, barra, lista)
  // Raggruppati: «2 × 20» si legge, «20 20» si conta.
  const gruppi = dischi.reduce<{ d: number; q: number }[]>((a, d) => {
    const ultimo = a[a.length - 1]
    if (ultimo && ultimo.d === d) ultimo.q++
    else a.push({ d, q: 1 })
    return a
  }, [])

  const cambia = (d: number) => {
    const nuova = lista.includes(d) ? lista.filter((x) => x !== d) : [...lista, d].sort((a, b) => b - a)
    setLista(nuova)
    localStorage.setItem(DISCHI_KEY, JSON.stringify(nuova))
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)', background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 16, padding: 16, margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <strong>{n(peso)} kg</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ margin: '2px 0 12px' }}>
          Per lato, dal più pesante.{barra > 0 ? ` Barra da ${n(barra)} kg compresa.` : ' Solo dischi, barra non contata.'}
        </p>

        {gruppi.length === 0 ? (
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
            {barra > 0 ? `Meno del bilanciere da ${n(barra)} kg.` : 'Nessun disco: il peso è zero.'}
          </p>
        ) : (
          <div className="row wrap" style={{ gap: 6 }}>
            {gruppi.map((g, i) => (
              <span key={i} className="chip on" style={{ padding: '8px 12px', fontSize: 15 }}>
                {g.q > 1 ? `${g.q} × ` : ''}{n(g.d)}
              </span>
            ))}
          </div>
        )}

        {resto > 0.01 && (
          <p className="small" style={{ margin: '10px 0 0', color: 'var(--fat)' }}>
            Restano {n(resto * 2)} kg che i tuoi dischi non fanno.
          </p>
        )}

        <div className="row spread" style={{ marginTop: 14, alignItems: 'center' }}>
          <span className="muted small">Bilanciere</span>
          <span className="row" style={{ gap: 4 }}>
            {[0, 10, 15, 20, 25].map((b) => (
              <button key={b} className={barra === b ? 'chip on' : 'chip'} style={{ padding: '5px 10px' }}
                onClick={() => { setBarra(b); localStorage.setItem(BILANCIERE_KEY, String(b)) }}>{b === 0 ? 'no' : b}</button>
            ))}
          </span>
        </div>

        <button className="chip" style={{ marginTop: 10 }} onClick={() => setModifica((m) => !m)}>
          {modifica ? 'Fatto' : 'Dischi della tua palestra'}
        </button>
        {modifica && (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {DEFAULT.map((d) => (
              <button key={d} className={lista.includes(d) ? 'chip on' : 'chip'} onClick={() => cambia(d)}>{n(d)}</button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

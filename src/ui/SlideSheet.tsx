import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { slideRicetta, type Formato } from '../util/slideRicetta'
import { condividi, inGalleria, nativo } from '../util/condividi'
import type { Food, Recipe } from '../db/schema'
import type { RecipeCalc } from '../db/recipes'

const CHI = 'etp:ig-handle'

/**
 * Le slide della ricetta, pronte per Instagram.
 *
 * Si vedono prima di uscire: una ricetta con la foto storta o un passo scritto
 * male si scopre qui, non dopo averla postata. Da qui partono con il menu di
 * condivisione di Android; sul telefono senza (o dal computer) si scaricano.
 */
export function SlideSheet({ recipe, calc, foods, onClose }: {
  recipe: Recipe
  calc: RecipeCalc
  foods: Food[]
  onClose: () => void
}) {
  const [formato, setFormato] = useState<Formato>('post')
  const [chi, setChi] = useState(() => localStorage.getItem(CHI) ?? '')
  const [urls, setUrls] = useState<string[]>([])
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [busy, setBusy] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [fatte, setFatte] = useState(0)
  const [totale, setTotale] = useState(0)

  // Si ridisegna a ogni cambio di formato o di firma: sono pochi decimi di
  // secondo e vedere subito il risultato vale piu' di un tasto «rigenera».
  useEffect(() => {
    let vivo = true
    setBusy(true); setFatte(0); setTotale(0)
    const mappa = new Map(foods.map((f) => [f.id, f]))
    slideRicetta(recipe, calc, mappa, formato, chi.trim() || 'ETP HEALTH',
      (n, tot) => { if (vivo) { setFatte(n); setTotale(tot) } })
      .then((bs) => {
        if (!vivo) return
        setBlobs(bs)
        setUrls((vecchi) => { vecchi.forEach(URL.revokeObjectURL); return bs.map((b) => URL.createObjectURL(b)) })
      })
      .catch((e) => vivo && setMsg((e as Error)?.message ?? 'Non sono riuscito a disegnarle.'))
      .finally(() => vivo && setBusy(false))
    return () => { vivo = false }
  }, [recipe, calc, foods, formato, chi])

  // Gli URL creati qui vanno liberati: sono immagini da qualche mega l'una.
  useEffect(() => () => { urls.forEach(URL.revokeObjectURL) }, [urls])

  const nomeFile = (i: number) =>
    `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ricetta'}-${i + 1}.png`

  const files = () => blobs.map((b, i) => ({ nome: nomeFile(i), blob: b }))

  async function esci(cosa: 'condividi' | 'galleria') {
    setMsg(null)
    try {
      if (cosa === 'condividi') { await condividi(files(), recipe.name); return }
      const dove = await inGalleria(files())
      setMsg(dove === 'download' ? 'Scaricate.' : `Salvate in galleria, album «${dove}».`)
    } catch (e) {
      // Se il menu viene chiuso col dito Android risponde con un errore: non e'
      // un guasto, e dirgli che qualcosa e' andato storto sarebbe una bugia.
      const t = (e as Error)?.message ?? ''
      if (/cancel|abort|annull/i.test(t)) return
      setMsg(t || 'Non ci sono riuscito.')
    }
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Slide per Instagram</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        <div className="row" style={{ gap: 6 }}>
          <button className={formato === 'post' ? 'chip on' : 'chip'} style={{ flex: 1 }} onClick={() => setFormato('post')}>Post 4:5</button>
          <button className={formato === 'storia' ? 'chip on' : 'chip'} style={{ flex: 1 }} onClick={() => setFormato('storia')}>Storia 9:16</button>
        </div>

        {/* La chiocciola la mette l'app: un nome senza non sembra un profilo. */}
        <label className="fl" style={{ marginTop: 10 }}>Nome Instagram</label>
        <input value={chi} placeholder="@iltuonome"
          onChange={(e) => { const v = e.target.value.replace(/^@+/, ''); setChi(v ? `@${v}` : '') }}
          onBlur={() => localStorage.setItem(CHI, chi.trim())} />

        {!recipe.photo && (
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Nessuna foto: la copertina esce solo con il titolo. Aggiungila in modifica.
          </p>
        )}
        {msg && <p className="muted small" style={{ margin: '8px 0 0' }}>{msg}</p>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10 }}>
          {busy && (
            <div style={{ marginBottom: 8 }}>
              <div className="row spread">
                <span className="muted small">Disegno le slide…</span>
                <span className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {totale ? `${fatte} di ${totale} · ${Math.round((fatte / totale) * 100)}%` : ''}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', marginTop: 5 }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--gold)',
                  width: `${totale ? (fatte / totale) * 100 : 0}%`, transition: 'width .15s',
                }} />
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
            {urls.map((u, i) => (
              <img key={u} src={u} alt={`Slide ${i + 1}`}
                style={{
                  width: formato === 'post' ? 148 : 118, flex: 'none', borderRadius: 10,
                  border: '1px solid var(--line)', display: 'block',
                }} />
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className="primary" style={{ flex: 1 }} disabled={busy || !blobs.length} onClick={() => esci('condividi')}>
            Condividi ({blobs.length})
          </button>
          <button className="chip" disabled={busy || !blobs.length} onClick={() => esci('galleria')}>
            {nativo() ? 'Galleria' : 'Salva'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

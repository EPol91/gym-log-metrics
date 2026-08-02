import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { slideRicetta, type Formato } from '../util/slideRicetta'
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

  // Si ridisegna a ogni cambio di formato o di firma: sono pochi decimi di
  // secondo e vedere subito il risultato vale piu' di un tasto «rigenera».
  useEffect(() => {
    let vivo = true
    setBusy(true)
    const mappa = new Map(foods.map((f) => [f.id, f]))
    slideRicetta(recipe, calc, mappa, formato, chi.trim() || 'ETP HEALTH')
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

  async function condividi() {
    const files = blobs.map((b, i) => new File([b], nomeFile(i), { type: 'image/png' }))
    // canShare va chiesto con i file veri: alcuni telefoni condividono testo ma non immagini.
    if (navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: recipe.name }) } catch { /* annullato */ }
      return
    }
    scarica()
  }

  function scarica() {
    urls.forEach((u, i) => {
      const a = document.createElement('a')
      a.href = u
      a.download = nomeFile(i)
      a.click()
    })
    setMsg('Salvate: le trovi nei download.')
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

        <label className="fl" style={{ marginTop: 10 }}>Firma in fondo alle slide</label>
        <input value={chi} placeholder="@iltuonome" onChange={(e) => setChi(e.target.value)}
          onBlur={() => localStorage.setItem(CHI, chi.trim())} />

        {!recipe.photo && (
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Nessuna foto: la copertina esce solo con il titolo. Aggiungila in modifica.
          </p>
        )}
        {msg && <p className="muted small" style={{ margin: '8px 0 0' }}>{msg}</p>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10 }}>
          {busy && <p className="muted small">Disegno le slide…</p>}
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
          <button className="primary" style={{ flex: 1 }} disabled={busy || !blobs.length} onClick={condividi}>
            Condividi ({blobs.length})
          </button>
          <button className="chip" disabled={busy || !blobs.length} onClick={scarica}>Salva</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoodsRanked, addFood, findFoodByBarcode } from '../db/diet'
import { searchOFF, fetchByBarcode, type OffFood } from '../util/openFoodFacts'
import { BarcodeScanner, isScanSupported } from './BarcodeScanner'
import { FoodForm } from './FoodSheet'
import type { Food } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Scelta di un alimento dalla libreria, senza aggiungerlo a niente.
 * Serve all'editor delle ricette: stessa ricerca, stesso scanner e stesso form
 * del pannello del diario, ma alla fine restituisce l'alimento invece di registrarlo.
 */
export function FoodChooser({ onPick, onClose }: { onPick: (f: Food) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'mine' | 'online'>('mine')
  const [creating, setCreating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [online, setOnline] = useState<OffFood[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const foods = useLiveQuery(listFoodsRanked, []) ?? []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const nq = norm(q)
  const filtered = nq ? foods.filter((f) => norm(f.name).includes(nq) || norm(f.brand ?? '').includes(nq)) : foods

  async function runOnlineSearch() {
    if (!q.trim()) return
    setBusy(true); setMsg(null); setTab('online')
    try {
      const r = await searchOFF(q.trim())
      setOnline(r)
      if (!r.length) setMsg('Nessun risultato online.')
    } catch { setMsg('Ricerca online non riuscita: sei offline?') } finally { setBusy(false) }
  }

  /** Salva in libreria l'alimento trovato online e lo consegna alla ricetta. */
  async function salvaDaOff(o: OffFood) {
    const id = await addFood({ name: o.name, brand: o.brand, barcode: o.barcode, per100: o.per100, source: 'off', servingG: o.servingG })
    const f = (await listFoodsRanked()).find((x) => x.id === id)
    if (f) onPick(f)
  }

  async function onScanned(code: string) {
    setScanning(false); setBusy(true); setMsg(null)
    try {
      const existing = await findFoodByBarcode(code)
      if (existing) { onPick(existing); return }
      const o = await fetchByBarcode(code)
      if (!o) { setMsg(`Codice ${code} non trovato: creane uno tu dai valori in etichetta.`); setCreating(true); return }
      await salvaDaOff(o)
    } catch { setMsg('Lettura non riuscita.') } finally { setBusy(false) }
  }

  let body: React.ReactNode
  if (scanning) {
    body = <BarcodeScanner onDetected={onScanned} onCancel={() => setScanning(false)} />
  } else if (creating) {
    body = (
      <FoodForm title="Nuovo alimento" onCancel={() => setCreating(false)}
        onSave={async (v) => {
          const id = await addFood({ ...v, source: 'mine' })
          const f = (await listFoodsRanked()).find((x) => x.id === id)
          setCreating(false); if (f) onPick(f)
        }} />
    )
  } else {
    body = (
      <>
        <div className="row" style={{ gap: 8 }}>
          <input placeholder="🔍 Cerca alimento…" value={q} autoFocus onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runOnlineSearch() }} style={{ flex: 1 }} />
          {isScanSupported() && (
            <button className="chip on" style={{ flex: 'none', padding: '0 14px' }} onClick={() => setScanning(true)} aria-label="Scansiona codice a barre">▦</button>
          )}
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className={tab === 'mine' ? 'chip on' : 'chip'} onClick={() => setTab('mine')}>I miei ({foods.length})</button>
          <button className={tab === 'online' ? 'chip on' : 'chip'} onClick={runOnlineSearch} disabled={!q.trim() || busy}>
            {busy ? 'Cerco…' : 'Cerca online'}
          </button>
          <button className="chip" onClick={() => setCreating(true)}>＋ Nuovo</button>
        </div>

        {msg && <p className="muted small" style={{ marginTop: 8 }}>{msg}</p>}

        <div className="col" style={{ gap: 0, marginTop: 6, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {tab === 'mine' && filtered.map((f) => (
            <div key={f.id} className="row spread" style={{ alignItems: 'center', padding: '10px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => onPick(f)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.favorite ? '★ ' : ''}{f.name}
                </span>
                <span className="muted small">
                  {f.brand ? `${f.brand} · ` : ''}{f.per100.kcal} kcal · C: {f.per100.carbs}, P: {f.per100.protein}, G: {f.per100.fat}
                </span>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>＋</span>
            </div>
          ))}
          {tab === 'mine' && filtered.length === 0 && (
            <p className="muted small" style={{ marginTop: 10 }}>Nessun alimento trovato. Cerca online o creane uno nuovo.</p>
          )}

          {tab === 'online' && online.map((o) => (
            <div key={o.barcode ?? o.name} className="row spread" style={{ alignItems: 'center', padding: '10px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => salvaDaOff(o)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                <span className="muted small">{o.brand ? `${o.brand} · ` : ''}{o.per100.kcal} kcal · C: {o.per100.carbs}, P: {o.per100.protein}, G: {o.per100.fat}</span>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>＋</span>
            </div>
          ))}
          {tab === 'online' && online.length > 0 && (
            <p className="muted" style={{ fontSize: 10, marginTop: 8 }}>
              Dati da Open Food Facts. Controlla sempre con l'etichetta: sono inseriti dagli utenti e puoi correggerli dopo l'aggiunta.
            </p>
          )}
        </div>
      </>
    )
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '16px 16px 0 0',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Scegli un ingrediente</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {body}
        </div>
      </div>
    </div>,
    document.body,
  )
}

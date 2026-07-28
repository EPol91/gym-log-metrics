import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoodsRanked, addFood, addFoodLog, findFoodByBarcode } from '../db/diet'
import { searchOFF, fetchByBarcode, type OffFood } from '../util/openFoodFacts'
import { BarcodeScanner, isScanSupported } from './BarcodeScanner'
import { FoodSheet, FoodForm } from './FoodSheet'
import type { Food } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function FoodPicker({ date, mealId, mealName, onClose }: { date: string; mealId: string; mealName: string; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'mine' | 'online'>('mine')
  const [chosen, setChosen] = useState<Food | null>(null)
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

  /** Salva l'alimento trovato online nella libreria e passa alla quantità. */
  async function useOffFood(o: OffFood) {
    const id = await addFood({ name: o.name, brand: o.brand, barcode: o.barcode, per100: o.per100, source: 'off', servingG: o.servingG })
    const f = (await listFoodsRanked()).find((x) => x.id === id)
    if (f) setChosen(f)
  }

  async function onScanned(code: string) {
    setScanning(false); setBusy(true); setMsg(null)
    try {
      const existing = await findFoodByBarcode(code)
      if (existing) { setChosen(existing); return } // già in libreria: valori tuoi
      const o = await fetchByBarcode(code)
      if (!o) { setMsg(`Codice ${code} non trovato: creane uno tu dai valori in etichetta.`); setCreating(true); return }
      await useOffFood(o)
    } catch { setMsg('Lettura non riuscita.') } finally { setBusy(false) }
  }

  async function add(grams: number) {
    if (!chosen) return
    await addFoodLog(date, mealId, chosen.id, grams)
    onClose()
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
          setCreating(false); if (f) setChosen(f)
        }} />
    )
  } else if (chosen) {
    body = <FoodSheet food={chosen} mode="add" onConfirm={add} onBack={() => setChosen(null)} />
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
              onClick={() => setChosen(f)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.favorite ? '★ ' : ''}{f.name}
                </span>
                <span className="muted small">
                  {f.brand ? `${f.brand} · ` : ''}{f.per100.kcal} kcal · P{f.per100.protein} C{f.per100.carbs} G{f.per100.fat}
                  {f.edited ? ' · corretto' : ''}
                </span>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>›</span>
            </div>
          ))}
          {tab === 'mine' && filtered.length === 0 && (
            <p className="muted small" style={{ marginTop: 10 }}>Nessun alimento trovato. Cerca online o creane uno nuovo.</p>
          )}

          {tab === 'online' && online.map((o) => (
            <div key={o.barcode ?? o.name} className="row spread" style={{ alignItems: 'center', padding: '10px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => useOffFood(o)}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                <span className="muted small">{o.brand ? `${o.brand} · ` : ''}{o.per100.kcal} kcal · P{o.per100.protein} C{o.per100.carbs} G{o.per100.fat}</span>
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
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '16px 16px 0 0',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Aggiungi a {mealName}</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}

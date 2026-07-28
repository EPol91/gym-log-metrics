import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoodsRanked, addFood, addFoodLog, updateFood, deleteFood, macrosFor, findFoodByBarcode } from '../db/diet'
import { searchOFF, fetchByBarcode, type OffFood } from '../util/openFoodFacts'
import { BarcodeScanner, isScanSupported } from './BarcodeScanner'
import { parseNum } from '../util/validate'
import type { Food, Macros, MealKey } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Form valori per 100 g: usato sia per creare sia per correggere un alimento. */
function FoodForm({ initial, title, onSave, onCancel, onDelete }: {
  initial?: Partial<Food>
  title: string
  onSave: (v: { name: string; brand?: string; per100: Macros; servingG?: number }) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [kcal, setKcal] = useState(initial?.per100 ? String(initial.per100.kcal) : '')
  const [p, setP] = useState(initial?.per100 ? String(initial.per100.protein) : '')
  const [c, setC] = useState(initial?.per100 ? String(initial.per100.carbs) : '')
  const [f, setF] = useState(initial?.per100 ? String(initial.per100.fat) : '')
  const [serving, setServing] = useState(initial?.servingG ? String(initial.servingG) : '')

  const n = (v: string, max: number) => parseNum(v, { min: 0, max })
  const pn = n(p, 100), cn = n(c, 100), fn = n(f, 100)
  const kn = n(kcal, 1000)
  // Se le calorie non le scrivi, le calcolo dai macro.
  const kcalAuto = pn != null && cn != null && fn != null ? Math.round(pn * 4 + cn * 4 + fn * 9) : null
  const ok = name.trim() !== '' && pn != null && cn != null && fn != null

  return (
    <div>
      <div className="muted small" style={{ marginBottom: 8 }}>{title} · valori per 100 g</div>
      <label className="fl">Nome</label>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial?.name} />
      <label className="fl" style={{ marginTop: 8 }}>Marca (facoltativo)</label>
      <input value={brand} onChange={(e) => setBrand(e.target.value)} />

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <div style={{ flex: 1 }}><label className="fl">Proteine</label><input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} style={{ textAlign: 'center' }} /></div>
        <div style={{ flex: 1 }}><label className="fl">Carbo</label><input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} style={{ textAlign: 'center' }} /></div>
        <div style={{ flex: 1 }}><label className="fl">Grassi</label><input inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} style={{ textAlign: 'center' }} /></div>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="fl">kcal {kcalAuto != null && `(calcolate ${kcalAuto})`}</label>
          <input inputMode="numeric" value={kcal} placeholder={kcalAuto != null ? String(kcalAuto) : ''} onChange={(e) => setKcal(e.target.value)} style={{ textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl">Porzione (g)</label>
          <input inputMode="numeric" value={serving} onChange={(e) => setServing(e.target.value)} style={{ textAlign: 'center' }} />
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {onDelete && <button className="ghost" onClick={onDelete}>🗑</button>}
        <button className="ghost" style={{ flex: 1 }} onClick={onCancel}>Annulla</button>
        <button className="primary" style={{ flex: 2 }} disabled={!ok}
          onClick={() => ok && onSave({
            name: name.trim(),
            brand: brand.trim() || undefined,
            per100: { kcal: kn ?? kcalAuto ?? 0, protein: pn!, carbs: cn!, fat: fn! },
            servingG: parseNum(serving, { min: 1, max: 2000 }) ?? undefined,
          })}>
          Salva
        </button>
      </div>
    </div>
  )
}

/** Quanti grammi ne metto: con anteprima dei macro. */
function AmountStep({ food, onAdd, onEdit, onBack }: {
  food: Food; onAdd: (grams: number) => void; onEdit: () => void; onBack: () => void
}) {
  const [g, setG] = useState(String(food.servingG ?? 100))
  const grams = parseNum(g, { min: 1, max: 5000 }) ?? 0
  const m = macrosFor(food.per100, grams)
  return (
    <div>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>{food.name}</div>
          <div className="muted small">
            {food.brand ? `${food.brand} · ` : ''}per 100 g: {food.per100.kcal} kcal · P{food.per100.protein} C{food.per100.carbs} G{food.per100.fat}
          </div>
        </div>
        <button className="chip" style={{ flex: 'none' }} onClick={onEdit}>✎ Correggi</button>
      </div>

      <label className="fl" style={{ marginTop: 12 }}>Quantità (g)</label>
      <div className="row" style={{ gap: 6 }}>
        <button onClick={() => setG(String(Math.max(1, grams - 10)))}>−10</button>
        <input inputMode="decimal" value={g} autoFocus onChange={(e) => setG(e.target.value)} style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }} />
        <button onClick={() => setG(String(grams + 10))}>+10</button>
      </div>
      {food.servingG && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setG(String(food.servingG))}>
          {food.servingLabel ?? 'porzione'} ({food.servingG} g)
        </button>
      )}

      <div className="card" style={{ marginTop: 12, background: 'var(--bg)' }}>
        <div className="row spread"><span className="muted small">Calorie</span><strong style={{ color: 'var(--gold)' }}>{m.kcal}</strong></div>
        <div className="row spread" style={{ marginTop: 4 }}>
          <span className="muted small">Proteine</span><span>{m.protein} g</span>
        </div>
        <div className="row spread" style={{ marginTop: 2 }}><span className="muted small">Carboidrati</span><span>{m.carbs} g</span></div>
        <div className="row spread" style={{ marginTop: 2 }}><span className="muted small">Grassi</span><span>{m.fat} g</span></div>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        <button className="ghost" style={{ flex: 1 }} onClick={onBack}>Indietro</button>
        <button className="primary" style={{ flex: 2 }} disabled={grams <= 0} onClick={() => onAdd(grams)}>Aggiungi</button>
      </div>
    </div>
  )
}

export function FoodPicker({ date, meal, onClose }: { date: string; meal: MealKey; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'mine' | 'online'>('mine')
  const [chosen, setChosen] = useState<Food | null>(null)
  const [editing, setEditing] = useState<Food | null>(null)
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
    await addFoodLog(date, meal, chosen.id, grams)
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
  } else if (editing) {
    body = (
      <FoodForm title={`Correggi "${editing.name}"`} initial={editing}
        onCancel={() => setEditing(null)}
        onDelete={async () => { if (confirm(`Eliminare ${editing.name}?`)) { await deleteFood(editing.id); setEditing(null); setChosen(null) } }}
        onSave={async (v) => {
          await updateFood(editing.id, v)
          const f = (await listFoodsRanked()).find((x) => x.id === editing.id)
          setEditing(null); if (f) setChosen(f)
        }} />
    )
  } else if (chosen) {
    body = <AmountStep food={chosen} onAdd={add} onEdit={() => setEditing(chosen)} onBack={() => setChosen(null)} />
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
          <strong>Aggiungi a {meal}</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}

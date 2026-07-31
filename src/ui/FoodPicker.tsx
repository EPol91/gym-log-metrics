import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoodsRanked, addFood, addFoodLog, findFoodByBarcode, listFoods } from '../db/diet'
import { listRecipesRanked, computeRecipe } from '../db/recipes'
import { sostituisci } from '../rs/dieta'
import { searchOFF, fetchByBarcode, type OffFood } from '../util/openFoodFacts'
import { BarcodeScanner, isScanSupported } from './BarcodeScanner'
import { useScanner } from './useScanner'
import { FoodSheet, FoodForm, MacroDonut } from './FoodSheet'
import { AddRecipeSheet } from './AddRecipeSheet'
import type { Food, Recipe } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function FoodPicker({ date, mealId, mealName, onClose, sostituisciLog }: {
  date: string; mealId: string; mealName: string; onClose: () => void
  /** 🦠RS: invece di aggiungere una riga, cambia l'alimento di quella indicata. */
  sostituisciLog?: { id: string; onFatto: () => void }
}) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'mine' | 'online' | 'recipes'>('mine')
  const [chosen, setChosen] = useState<Food | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [online, setOnline] = useState<OffFood[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const foods = useLiveQuery(listFoodsRanked, []) ?? []
  const recipes = useLiveQuery(listRecipesRanked, []) ?? []
  const allFoods = useLiveQuery(listFoods, []) ?? []

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
    // In sostituzione la riga esiste gia': si cambia il suo alimento invece di
    // crearne un'altra, cosi' resta agganciata a cosa aveva prescritto il coach
    // e continua a valere come voce del piano onorata.
    if (sostituisciLog) {
      await sostituisci(sostituisciLog.id, chosen.id, grams)
      sostituisciLog.onFatto()
      return
    }
    await addFoodLog(date, mealId, chosen.id, grams)
    onClose()
  }

  const lettore = useScanner()
  // Selezione multipla: spunti più alimenti e li aggiungi in un colpo, ognuno con
  // la sua porzione predefinita. I grammi si correggono dopo, nel diario.
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const inSelezione = selezione.size > 0

  function spunta(id: string) {
    setSelezione((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function aggiungiSelezionati() {
    const scelti = foods.filter((f) => selezione.has(f.id))
    for (const f of scelti) await addFoodLog(date, mealId, f.id, f.servingG ?? 100)
    onClose()
  }

  let body: React.ReactNode
  if (scanning) {
    body = <BarcodeScanner onDetected={onScanned} onCancel={() => setScanning(false)} />
  } else if (creating) {
    body = (
      <FoodForm title="Nuovo alimento" onCancel={() => setCreating(false)} onScan={lettore.scan}
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
          <button className={tab === 'recipes' ? 'chip on' : 'chip'} onClick={() => setTab('recipes')}>📖 Ricette ({recipes.length})</button>
        </div>

        {msg && <p className="muted small" style={{ marginTop: 8 }}>{msg}</p>}

        {inSelezione && (
          <div className="row spread" style={{ alignItems: 'center', marginTop: 8, padding: '8px 10px', border: '1px solid var(--gold)', borderRadius: 10 }}>
            <span className="small">{selezione.size} selezionati</span>
            <div className="row" style={{ gap: 6, flex: 'none' }}>
              <button className="chip" onClick={() => setSelezione(new Set())}>Annulla</button>
              <button className="chip on" onClick={aggiungiSelezionati}>Aggiungi tutti</button>
            </div>
          </div>
        )}

        <div className="col" style={{ gap: 0, marginTop: 6, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {tab === 'mine' && filtered.map((f) => (
            <div key={f.id} className="row spread" style={{ alignItems: 'center', padding: '10px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => (inSelezione ? spunta(f.id) : setChosen(f))}>
              <button aria-label={selezione.has(f.id) ? 'Togli dalla selezione' : 'Aggiungi alla selezione'}
                onClick={(e) => { e.stopPropagation(); spunta(f.id) }}
                style={{
                  width: 22, height: 22, flex: 'none', marginRight: 9, padding: 0, borderRadius: 6,
                  border: '1px solid ' + (selezione.has(f.id) ? 'var(--gold)' : 'var(--line)'),
                  background: selezione.has(f.id) ? 'var(--gold)' : 'transparent',
                  color: '#1a1400', display: 'grid', placeItems: 'center', fontSize: 13,
                }}>{selezione.has(f.id) ? '✓' : ''}</button>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.favorite ? '★ ' : ''}{f.name}
                </span>
                <span className="muted small">
                  {f.brand ? `${f.brand} · ` : ''}{f.per100.kcal} kcal · C: {f.per100.carbs}, P: {f.per100.protein}, G: {f.per100.fat}
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
                <span className="muted small">{o.brand ? `${o.brand} · ` : ''}{o.per100.kcal} kcal · C: {o.per100.carbs}, P: {o.per100.protein}, G: {o.per100.fat}</span>
              </span>
              <span className="muted small" style={{ flex: 'none', marginLeft: 8 }}>＋</span>
            </div>
          ))}
          {tab === 'recipes' && (() => {
            const byId = new Map(allFoods.map((f) => [f.id, f]))
            const visibili = nq ? recipes.filter((r) => norm(r.name).includes(nq)) : recipes
            if (!visibili.length) {
              return <p className="muted small" style={{ marginTop: 10 }}>
                {recipes.length ? 'Nessuna ricetta con questo nome.' : 'Non hai ancora ricette: creale da Dieta → 📖 Ricette.'}
              </p>
            }
            return visibili.map((r) => {
              const c = computeRecipe(r, byId)
              const unit = r.mode === 'servings' ? c.perServing : c.per100
              const m = unit ?? c.totals
              return (
                <div key={r.id} className="row spread" style={{ alignItems: 'center', gap: 9, padding: '9px 2px', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
                  onClick={() => setRecipe(r)}>
                  <MacroDonut m={m} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.favorite ? '★ ' : ''}{r.name}
                    </span>
                    <span className="muted small">
                      {unit
                        ? `${m.kcal} kcal ${r.mode === 'servings' ? 'a porzione' : 'per 100 g'}`
                        : 'peso finale da impostare'}
                      {r.mode === 'servings' ? ` · ${r.servings ?? 1} porzioni` : ` · resa ${r.yieldG} g`}
                    </span>
                  </span>
                  <span className="muted small" style={{ flex: 'none' }}>›</span>
                </div>
              )
            })
          })()}

          {tab === 'online' && online.length > 0 && (
            <p className="muted" style={{ fontSize: 10, marginTop: 8 }}>
              Dati da Open Food Facts. Controlla sempre con l'etichetta: sono inseriti dagli utenti e puoi correggerli dopo l'aggiunta.
            </p>
          )}
        </div>
      </>
    )
  }

  const pannello = createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '16px 16px 0 0',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Aggiungi a {mealName}</strong>
          {/* Creare un alimento è un'azione, non un filtro: sta in testata insieme
              alla chiusura, dove non rischia di finire fuori dallo schermo. */}
          <div className="row" style={{ gap: 6, flex: 'none' }}>
            <button className="ghost" aria-label="Nuovo alimento"
              style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center', fontSize: 20, color: 'var(--gold)' }}
              onClick={() => setCreating(true)}>＋</button>
            <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
          </div>
        </div>
        {/* Un solo contenitore che scorre per tutti i contenuti: il form del nuovo
            alimento non ne aveva uno e veniva tagliato in fondo senza poter scorrere. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {lettore.overlay ?? body}
        </div>
      </div>
    </div>,
    document.body,
  )

  // La scheda della ricetta sta FUORI dallo sfondo del pannello: dentro, il tocco
  // sul suo sfondo risalirebbe lungo l'albero React e chiuderebbe anche il pannello.
  return (
    <>
      {pannello}
      {recipe && (
        <AddRecipeSheet recipe={recipe} date={date} mealId={mealId}
          onClose={() => setRecipe(null)} onDone={() => onClose()} />
      )}
    </>
  )
}

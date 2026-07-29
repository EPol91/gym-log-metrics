import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoods } from '../db/diet'
import { addRecipe, updateRecipe, deleteRecipe, getRecipe, type RecipeDraft } from '../db/recipes'
import { deleteWithUndo } from '../db/trash'
import { FoodChooser } from './FoodChooser'
import { clampNum } from '../util/validate'
import type { RecipeGroup, RecipeMode } from '../db/schema'

const VUOTA = (): RecipeDraft => ({
  name: '', mode: 'servings', servings: 4,
  groups: [{ name: 'Ingredienti', items: [] }], steps: [],
})

/**
 * Crea o modifica una ricetta. Il toggle porzioni/grammi sta qui, in cima:
 * è la scelta che comanda il resto dell'app, quindi si fa una volta e si vede subito.
 */
export function RecipeEditor({ recipeId, onBack, onSaved }: {
  recipeId: string | null
  onBack: () => void
  onSaved: (id: string) => void
}) {
  const existing = useLiveQuery(async () => (recipeId ? await getRecipe(recipeId) : undefined), [recipeId])
  const foods = useLiveQuery(listFoods, []) ?? []
  const foodName = (id: string) => foods.find((f) => f.id === id)?.name

  const [d, setD] = useState<RecipeDraft>(VUOTA)
  const [stepsText, setStepsText] = useState('')
  const [loaded, setLoaded] = useState(!recipeId)
  const [picking, setPicking] = useState<number | null>(null) // indice della sezione
  const [saving, setSaving] = useState(false)

  // Si carica una volta sola: la query è reattiva e riscriverebbe sopra le tue modifiche.
  useEffect(() => {
    if (loaded || !existing) return
    setD({
      name: existing.name, mode: existing.mode, servings: existing.servings, yieldG: existing.yieldG,
      groups: JSON.parse(JSON.stringify(existing.groups)), steps: [...existing.steps],
      note: existing.note, timeMin: existing.timeMin, tags: existing.tags ? [...existing.tags] : undefined,
    })
    setStepsText(existing.steps.join('\n'))
    setLoaded(true)
  }, [existing, loaded])

  if (recipeId && !loaded) return <p className="muted">Carico…</p>

  const set = (patch: Partial<RecipeDraft>) => setD((p) => ({ ...p, ...patch }))
  const setGroups = (fn: (g: RecipeGroup[]) => RecipeGroup[]) => setD((p) => ({ ...p, groups: fn(p.groups) }))
  const byPortions = d.mode === 'servings'
  const ok = d.name.trim() !== '' && !saving

  function cambiaModo(mode: RecipeMode) {
    if (mode === d.mode) return
    // Passando ai grammi propongo il crudo come resa: è un punto di partenza onesto,
    // da correggere pesando il piatto. Il contrario riparte da una teglia da 6.
    if (mode === 'grams') {
      const crudo = d.groups.reduce((a, g) => a + g.items.reduce((b, it) => b + (Number(it.grams) || 0), 0), 0)
      set({ mode, yieldG: d.yieldG ?? (crudo > 0 ? Math.round(crudo) : undefined) })
    } else {
      set({ mode, servings: d.servings ?? 6 })
    }
  }

  async function salva() {
    if (!ok) return
    setSaving(true)
    const payload: RecipeDraft = { ...d, steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean) }
    if (recipeId) { await updateRecipe(recipeId, payload); onSaved(recipeId) }
    else { const id = await addRecipe(payload); onSaved(id) }
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" style={{ padding: '6px 10px' }} onClick={onBack}>← Annulla</button>
      </div>
      <h1 style={{ fontSize: 22 }}>{recipeId ? 'Modifica ricetta' : 'Nuova ricetta'}</h1>

      <div className="card" style={{ padding: '13px', marginBottom: 0 }}>
        <label className="fl">Nome</label>
        <input value={d.name} autoFocus={!recipeId} placeholder="Es. Tiramisù fit"
          onChange={(e) => set({ name: e.target.value })} style={{ marginBottom: 12 }} />

        <label className="fl">Come si conta questa ricetta</label>
        <div className="row" style={{ gap: 6, marginBottom: 9 }}>
          <button className={byPortions ? 'chip on' : 'chip'} style={{ flex: 1, padding: '9px 10px', fontSize: 13 }}
            onClick={() => cambiaModo('servings')}>A porzioni</button>
          <button className={!byPortions ? 'chip on' : 'chip'} style={{ flex: 1, padding: '9px 10px', fontSize: 13 }}
            onClick={() => cambiaModo('grams')}>A grammi</button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 12px', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--gold)' }}>A porzioni:</strong> nel diario aggiungi «1 porzione».
          Per teglie e dolci che tagli.<br />
          <strong style={{ color: 'var(--gold-dim)' }}>A grammi:</strong> nel diario pesi il piatto e aggiungi «180 g».
          Per sughi, impasti, cose che stanno in un contenitore.
        </p>

        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="fl">{byPortions ? 'Porzioni' : 'Peso finale (g)'}</label>
            {byPortions ? (
              <input inputMode="numeric" value={String(d.servings ?? 1)} style={{ textAlign: 'center' }}
                onChange={(e) => set({ servings: clampNum(e.target.value, { min: 1, max: 99, int: true }) ?? 1 })} />
            ) : (
              <input inputMode="numeric" value={d.yieldG != null ? String(d.yieldG) : ''} placeholder="es. 1320" style={{ textAlign: 'center' }}
                onChange={(e) => set({ yieldG: clampNum(e.target.value, { min: 1, max: 20000, int: true }) ?? undefined })} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label className="fl">Tempo (min)</label>
            <input inputMode="numeric" value={d.timeMin != null ? String(d.timeMin) : ''} placeholder="—" style={{ textAlign: 'center' }}
              onChange={(e) => set({ timeMin: clampNum(e.target.value, { min: 0, max: 2000, int: true }) ?? undefined })} />
          </div>
        </div>

        <label className="fl" style={{ marginTop: 12 }}>Tag</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {(d.tags ?? []).map((t) => (
            <button key={t} className="chip on" onClick={() => set({ tags: (d.tags ?? []).filter((x) => x !== t) })}>{t} ✕</button>
          ))}
          <button className="chip" onClick={() => {
            const t = prompt('Nuovo tag (es. Dolci, Colazione)')?.trim()
            if (t) set({ tags: [...new Set([...(d.tags ?? []), t])] })
          }}>＋ tag</button>
        </div>
      </div>

      {/* Ingredienti */}
      <div className="card" style={{ padding: '13px', marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong className="small">Ingredienti</strong>
          <button className="chip" onClick={() => setGroups((g) => [...g, { name: 'Nuova sezione', items: [] }])}>＋ Sezione</button>
        </div>

        {d.groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: gi === 0 ? 0 : 14 }}>
            <div className="row" style={{ gap: 6, marginBottom: 3 }}>
              <input value={g.name} placeholder="Nome della sezione"
                onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))}
                style={{ flex: 1, padding: '7px 10px', fontSize: 14 }} />
              {d.groups.length > 1 && (
                <button className="ghost" style={{ flex: 'none', padding: '7px 11px', color: '#e57373' }}
                  onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} aria-label="Elimina sezione">🗑</button>
              )}
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg, var(--gold-dim), transparent)', marginBottom: 4 }} />

            {g.items.map((it, ii) => (
              <div key={ii} className="row" style={{ gap: 6, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {foodName(it.foodId) ?? <span style={{ color: 'var(--fat)' }}>alimento eliminato</span>}
                </span>
                <input inputMode="decimal" value={String(it.grams)} aria-label="Grammi"
                  onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi
                    ? { ...x, items: x.items.map((y, j) => (j === ii ? { ...y, grams: clampNum(e.target.value, { min: 0, max: 20000 }) ?? 0 } : y)) }
                    : x)))}
                  style={{ width: 68, padding: '6px', textAlign: 'center', fontSize: 14 }} />
                <span className="muted small" style={{ flex: 'none' }}>g</span>
                <button className="ghost" style={{ flex: 'none', padding: '5px 9px', color: 'var(--muted)' }}
                  onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x)))}
                  aria-label="Rimuovi ingrediente">✕</button>
              </div>
            ))}

            <button className="chip" style={{ marginTop: 9 }} onClick={() => setPicking(gi)}>＋ Ingrediente</button>
          </div>
        ))}
      </div>

      {/* Procedimento */}
      <div className="card" style={{ padding: '13px', marginBottom: 0 }}>
        <strong className="small">Procedimento</strong>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>Un passaggio per riga.</p>
        <textarea rows={7} value={stepsText} onChange={(e) => setStepsText(e.target.value)}
          style={{ lineHeight: 1.6, fontSize: 14, resize: 'vertical' }} />

        <label className="fl" style={{ marginTop: 12 }}>Nota, se serve</label>
        <textarea rows={3} value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })}
          style={{ lineHeight: 1.6, fontSize: 14, resize: 'vertical' }} />
      </div>

      <div className="row" style={{ gap: 6 }}>
        {recipeId && (
          <button className="ghost" style={{ flex: 'none', color: '#e57373' }} onClick={async () => {
            if (!confirm(`Eliminare "${d.name || 'ricetta'}"?`)) return
            await deleteWithUndo(`"${d.name}" eliminata`, () => deleteRecipe(recipeId))
            onBack()
          }}>🗑</button>
        )}
        <button className="ghost" style={{ flex: 1 }} onClick={onBack}>Annulla</button>
        <button className="primary" style={{ flex: 2 }} disabled={!ok} onClick={salva}>Salva ricetta</button>
      </div>

      {picking !== null && (
        <FoodChooser onClose={() => setPicking(null)}
          onPick={(f) => {
            setGroups((gs) => gs.map((x, i) => (i === picking ? { ...x, items: [...x.items, { foodId: f.id, grams: f.servingG ?? 100 }] } : x)))
            setPicking(null)
          }} />
      )}
    </div>
  )
}

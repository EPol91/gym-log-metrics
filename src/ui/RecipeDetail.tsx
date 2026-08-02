import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoods } from '../db/diet'
import {
  computeRecipe, scaleFactor, scaleMacros, getRecipe, updateRecipe,
  toggleRecipeFavorite, duplicateRecipe,
} from '../db/recipes'
import { MacroDonut, MacroRow } from './FoodSheet'
import { AddRecipeSheet } from './AddRecipeSheet'
import { useWakeLock, isWakeLockSupported } from '../util/wakeLock'
import { clampNum } from '../util/validate'
import type { Macros, Recipe } from '../db/schema'

/** Numeri all'italiana: virgola decimale, e sotto i 10 g un decimale (la bilancia lo legge). */
const fmt = (n: number, d = 1) => {
  const r = Math.round(n * 10 ** d) / 10 ** d
  return String(r).replace('.', ',')
}
const qtyOf = (g: number) => fmt(g, g < 10 ? 1 : 0)

/** Cosa mostrano i quattro numeri grandi. */
type View = 'unit' | 'total'

export function RecipeDetail({ recipeId, onBack, onEdit }: {
  recipeId: string
  onBack: () => void
  onEdit: () => void
}) {
  const recipe = useLiveQuery(() => getRecipe(recipeId), [recipeId])
  const foods = useLiveQuery(listFoods, []) ?? []

  const [servings, setServings] = useState<number | null>(null)
  const [view, setView] = useState<View>('unit')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())
  const [cookMode, setCookMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [yieldDraft, setYieldDraft] = useState<string | null>(null)
  const wakeActive = useWakeLock(cookMode)

  if (recipe === undefined) return <p className="muted">Carico…</p>
  if (!recipe) return (
    <div className="col">
      <button className="ghost small" onClick={onBack}>← Ricette</button>
      <p className="muted">Questa ricetta non esiste più.</p>
    </div>
  )

  const byPortions = recipe.mode === 'servings'
  const base = Math.max(1, Number(recipe.servings) || 1)
  const wanted = byPortions ? (servings ?? base) : 1
  const factor = scaleFactor(recipe, wanted)
  const calc = computeRecipe(recipe, new Map(foods.map((f) => [f.id, f])))
  const yieldG = Number(recipe.yieldG) || 0

  // A porzioni: una porzione oppure la teglia intera (riscalata).
  // A grammi: 100 g di piatto oppure tutto quello che è uscito.
  const shown: Macros = byPortions
    ? (view === 'unit' ? (calc.perServing ?? calc.totals) : scaleMacros(calc.totals, factor))
    : (view === 'unit' ? (calc.per100 ?? calc.totals) : calc.totals)

  const toggle = <T,>(s: Set<T>, v: T) => {
    const n = new Set(s)
    if (n.has(v)) n.delete(v); else n.add(v)
    return n
  }
  const totIng = (recipe.groups ?? []).reduce((a, g) => a + g.items.length, 0)

  async function salvaResa(v: string) {
    const n = clampNum(v, { min: 1, max: 20000, int: true })
    setYieldDraft(null)
    if (n != null && n !== yieldG) await updateRecipe(recipe!.id, { yieldG: n })
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" style={{ padding: '6px 10px' }} onClick={onBack}>← Ricette</button>
        <div className="row" style={{ gap: 6 }}>
          <button className="chip" onClick={onEdit}>✎ Modifica</button>
          <button className={recipe.favorite ? 'chip on' : 'chip'} onClick={() => toggleRecipeFavorite(recipe.id)}>
            {recipe.favorite ? '★' : '☆'}
          </button>
        </div>
      </div>

      <h1 style={{ fontSize: 22, lineHeight: 1.2 }}>{recipe.name}</h1>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="tag" style={byPortions ? undefined : { borderColor: 'var(--gold-dim)', color: 'var(--gold-dim)' }}>
          {byPortions ? 'a porzioni' : 'a grammi'}
        </span>
        {(recipe.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}
        {recipe.timeMin ? <span className="tag">⏱ {recipe.timeMin} min</span> : null}
      </div>

      {/* Quanto ne fai: porzioni da riscalare, oppure il peso di quello che è uscito dal forno. */}
      <div className="card" style={{ padding: '12px 13px', marginBottom: 0 }}>
        {byPortions ? (
          <>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <span>Porzioni</span>
              <span className="row" style={{ gap: 5 }}>
                <button style={{ width: 38, height: 38, padding: 0, color: 'var(--gold)', fontSize: 19 }}
                  onClick={() => setServings(Math.max(1, wanted - 1))} aria-label="Riduci porzioni">−</button>
                <input inputMode="numeric" value={String(wanted)}
                  onChange={(e) => setServings(clampNum(e.target.value, { min: 1, max: 99, int: true }) ?? 1)}
                  style={{ width: 60, textAlign: 'center', fontSize: 19, fontWeight: 700, padding: '8px 2px' }}
                  aria-label="Numero di porzioni" />
                <button style={{ width: 38, height: 38, padding: 0, color: 'var(--gold)', fontSize: 19 }}
                  onClick={() => setServings(Math.min(99, wanted + 1))} aria-label="Aumenta porzioni">+</button>
              </span>
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              Ricetta base per {base} · quantità × {fmt(factor, 2)}
            </div>
          </>
        ) : (
          <>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <span>Peso finale</span>
              <span className="row" style={{ gap: 6 }}>
                <input inputMode="numeric" value={yieldDraft ?? (yieldG || '')}
                  placeholder="—"
                  onChange={(e) => setYieldDraft(e.target.value)}
                  onBlur={(e) => salvaResa(e.target.value)}
                  style={{ width: 92, textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '8px 4px' }}
                  aria-label="Peso finale in grammi" />
                <span className="muted">g</span>
              </span>
            </div>
            <div className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Crudo {qtyOf(calc.rawG)} g · in cottura si perde acqua. Pesa il piatto da freddo e correggi
              qui: i valori per 100 g si aggiornano.
              {yieldG <= 0 && <strong style={{ color: 'var(--gold)' }}> Senza questo numero non si può aggiungere al diario.</strong>}
            </div>
          </>
        )}
      </div>

      {/* Valori */}
      <div className="card" style={{ padding: '12px 13px', marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong className="small">Valori</strong>
          <span className="row" style={{ gap: 4 }}>
            <button className={view === 'unit' ? 'chip on' : 'chip'} onClick={() => setView('unit')}>
              {byPortions ? 'Porzione' : '100 g'}
            </button>
            <button className={view === 'total' ? 'chip on' : 'chip'} onClick={() => setView('total')}>Totale</button>
          </span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <MacroDonut m={shown} size={58} />
          <div style={{ flex: 1, minWidth: 0 }}><MacroRow m={shown} /></div>
        </div>
        {calc.missing > 0 && (
          <p className="muted small" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {calc.missing === 1 ? 'Un ingrediente non è più' : `${calc.missing} ingredienti non sono più`} in
            libreria: {calc.missing === 1 ? 'la sua riga è sparita' : 'le loro righe sono sparite'} dal calcolo.
          </p>
        )}
      </div>

      {/* Ingredienti */}
      <div className="card" style={{ padding: '12px 13px', marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 8 }}>
          <strong className="small">
            Ingredienti <span className="muted" style={{ fontWeight: 400 }}>
              · {byPortions ? `per ${wanted} ${wanted === 1 ? 'porzione' : 'porzioni'}` : 'dose intera'}
            </span>
          </strong>
          {ticked.size > 0 && <button className="chip" onClick={() => setTicked(new Set())}>Azzera</button>}
        </div>

        {totIng === 0 && <p className="muted small">Nessun ingrediente. Aprila in modifica per aggiungerli.</p>}

        {(recipe.groups ?? []).map((g, gi) => (
          <div key={gi} style={{ marginTop: gi === 0 ? 0 : 13 }}>
            <h4 style={{ fontSize: 14, color: 'var(--gold)', margin: '0 0 3px' }}>{g.name}</h4>
            <div style={{ height: 1, background: 'linear-gradient(90deg, var(--gold-dim), transparent)', marginBottom: 3 }} />
            {g.items.map((it, ii) => {
              const f = foods.find((x) => x.id === it.foodId)
              const q = it.grams * factor
              const key = `${gi}:${ii}`
              const on = ticked.has(key)
              return (
                <div key={key} className="row" style={{ gap: 9, padding: '8px 0', borderBottom: ii === g.items.length - 1 ? 'none' : '1px solid var(--line)', cursor: 'pointer' }}
                  onClick={() => setTicked((s) => toggle(s, key))}>
                  <span style={{
                    width: 18, height: 18, flex: 'none', borderRadius: 5, border: '1px solid var(--line)',
                    background: on ? 'var(--gold)' : 'transparent', color: '#1a1400',
                    display: 'grid', placeItems: 'center', fontSize: 11,
                  }}>{on ? '✓' : ''}</span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: on ? 'var(--muted)' : undefined, textDecoration: on ? 'line-through' : undefined,
                  }}>
                    {f ? f.name : <span style={{ color: 'var(--fat)' }}>alimento eliminato</span>}
                  </span>
                  {/* Pizzico e «qb» non si scalano: raddoppiando la dose il sale
                      resta a occhio, un «2 pizzichi» sarebbe una finta precisione. */}
                  <span style={{
                    flex: 'none', fontSize: 14, fontVariantNumeric: 'tabular-nums',
                    color: on ? 'var(--muted)' : it.qta ? 'var(--muted)' : q < 1 ? 'var(--fat)' : 'var(--gold)',
                  }}>{it.qta ?? `${qtyOf(q)} g`}</span>
                </div>
              )
            })}
          </div>
        ))}

        {totIng > 0 && (
          <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
            In rosso le quantità sotto 1 g: serve la bilancia di precisione.
          </p>
        )}
      </div>

      {/* Procedimento */}
      {recipe.steps.length > 0 && (
        <div className="card" style={{ padding: '12px 13px', marginBottom: 0 }}>
          <div className="row spread" style={{ alignItems: 'center', marginBottom: 4 }}>
            <strong className="small">
              Procedimento <span className="muted" style={{ fontWeight: 400 }}>· {doneSteps.size} / {recipe.steps.length}</span>
            </strong>
            <div className="row" style={{ gap: 6 }}>
              {doneSteps.size > 0 && <button className="chip" onClick={() => setDoneSteps(new Set())}>Azzera</button>}
              {isWakeLockSupported() && (
                <button className={cookMode ? 'chip on' : 'chip'} onClick={() => setCookMode((v) => !v)}
                  title="Tiene acceso lo schermo mentre cucini">
                  🔆 {cookMode && !wakeActive ? 'Non riuscito' : 'Schermo acceso'}
                </button>
              )}
            </div>
          </div>
          {recipe.steps.map((s, i) => {
            const on = doneSteps.has(i)
            return (
              <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: i === recipe.steps.length - 1 ? 'none' : '1px solid var(--line)', cursor: 'pointer' }}
                onClick={() => setDoneSteps((s2) => toggle(s2, i))}>
                <span style={{
                  width: 23, height: 23, flex: 'none', borderRadius: '50%',
                  border: '1px solid var(--gold-dim)', display: 'grid', placeItems: 'center',
                  fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  background: on ? 'var(--gold)' : 'transparent', color: on ? '#1a1400' : 'var(--gold)',
                }}>{i + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: on ? 'var(--muted)' : undefined, textDecoration: on ? 'line-through' : undefined }}>
                  {s}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {recipe.note && (
        <div className="card" style={{ padding: '12px 13px', marginBottom: 0, borderColor: 'var(--gold-dim)' }}>
          <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 5 }}>Nota</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{recipe.note}</p>
        </div>
      )}

      <button className="primary" onClick={() => setAdding(true)}>＋ Aggiungi al diario</button>
      <button className="ghost small" onClick={async () => {
        const id = await duplicateRecipe(recipe.id)
        if (id) onBack()
      }}>⧉ Duplica ricetta</button>

      {adding && <AddRecipeSheet recipe={recipe as Recipe} onClose={() => setAdding(false)} />}
    </div>
  )
}

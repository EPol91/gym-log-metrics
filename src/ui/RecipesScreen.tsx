import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoods } from '../db/diet'
import { listRecipesRanked, listRecipeTags, computeRecipe } from '../db/recipes'
import { MacroDonut } from './FoodSheet'
import { RecipeDetail } from './RecipeDetail'
import { RecipeEditor } from './RecipeEditor'
import type { Food, Recipe } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const fmt1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** Filtro attivo: tutte, solo preferite, i pasti salvati, oppure un tag. */
type Filter = { kind: 'all' | 'fav' | 'meals' } | { kind: 'tag'; tag: string }

/** Una riga della lista: anello dei macro, nome, e il numero che conta davvero. */
function RecipeCard({ recipe, foods, onOpen }: {
  recipe: Recipe
  foods: Map<string, Food>
  onOpen: () => void
}) {
  const calc = computeRecipe(recipe, foods)
  const byPortions = recipe.mode === 'servings'
  const unit = byPortions ? calc.perServing : calc.per100
  const m = unit ?? calc.totals

  const sotto = byPortions
    ? `${m.kcal} kcal a porzione · P ${fmt1(m.protein)} · ${recipe.servings ?? 1} ${(recipe.servings ?? 1) === 1 ? 'porzione' : 'porzioni'}`
    : unit
      ? `${m.kcal} kcal per 100 g · P ${fmt1(m.protein)} · resa ${recipe.yieldG} g`
      : 'peso finale da impostare'

  return (
    <div className="card" style={{ padding: 12, marginBottom: 0, display: 'flex', gap: 11, alignItems: 'center', cursor: 'pointer' }}
      onClick={onOpen}>
      <MacroDonut m={m} size={40} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* Il nome va a capo invece di essere troncato: una ricetta si riconosce
            dal nome intero, non dai primi venti caratteri. Due righe al massimo. */}
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', fontSize: 15, lineHeight: 1.25,
        }}>
          {recipe.favorite ? '★ ' : ''}{recipe.name}
        </span>
        <span className="muted" style={{ fontSize: 11 }}>{sotto}</span>
      </span>
      <span className="tag" style={{ flex: 'none', ...(byPortions ? {} : { borderColor: 'var(--gold-dim)', color: 'var(--gold-dim)' }) }}>
        {byPortions ? 'porzioni' : 'grammi'}
      </span>
    </div>
  )
}

/**
 * Le ricette. Vive dentro Dieta come sotto-schermata, con lo stesso giro di
 * Obiettivi: lista → dettaglio → modifica, e si torna indietro un passo alla volta.
 */
export function RecipesScreen({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  const recipes = useLiveQuery(listRecipesRanked, []) ?? []
  const tags = useLiveQuery(listRecipeTags, []) ?? []
  const foods = useLiveQuery(listFoods, []) ?? []
  const foodsById = new Map(foods.map((f) => [f.id, f]))

  if (editing) {
    return (
      <RecipeEditor recipeId={editing === 'new' ? null : editing}
        onBack={() => setEditing(null)}
        onSaved={(id) => { setEditing(null); setOpen(id) }} />
    )
  }
  if (open) {
    return <RecipeDetail recipeId={open} onBack={() => setOpen(null)} onEdit={() => setEditing(open)} />
  }

  const nq = norm(q)
  const visible = recipes.filter((r) => {
    if (nq && !norm(r.name).includes(nq)) return false
    if (filter.kind === 'fav') return !!r.favorite
    // "Pasti salvati": le ricette senza procedimento, cioè i vecchi modelli di pasto.
    if (filter.kind === 'meals') return r.steps.length === 0
    if (filter.kind === 'tag') return (r.tags ?? []).includes(filter.tag)
    return true
  })

  const is = (f: Filter) => (filter.kind === f.kind && (f.kind !== 'tag' || (filter as { tag: string }).tag === f.tag) ? 'chip on' : 'chip')

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" style={{ padding: '6px 10px' }} onClick={onBack}>← Dieta</button>
        <button className="chip on" onClick={() => setEditing('new')}>＋ Nuova</button>
      </div>
      <h1 style={{ fontSize: 22 }}>Ricette</h1>

      <input placeholder="🔍 Cerca ricetta…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button className={is({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })}>Tutte ({recipes.length})</button>
        <button className={is({ kind: 'fav' })} onClick={() => setFilter({ kind: 'fav' })}>★ Preferite</button>
        {tags.map((t) => (
          <button key={t} className={is({ kind: 'tag', tag: t })} onClick={() => setFilter({ kind: 'tag', tag: t })}>{t}</button>
        ))}
        <button className={is({ kind: 'meals' })} onClick={() => setFilter({ kind: 'meals' })}>Pasti salvati</button>
      </div>

      {visible.map((r) => (
        <RecipeCard key={r.id} recipe={r} foods={foodsById} onOpen={() => setOpen(r.id)} />
      ))}

      {visible.length === 0 && (
        <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          {recipes.length === 0
            ? 'Non hai ancora ricette. Creane una, oppure salva un pasto del diario dal suo menù ⋮.'
            : 'Nessuna ricetta con questi filtri.'}
        </p>
      )}

      {recipes.some((r) => r.steps.length === 0) && filter.kind === 'all' && (
        <p className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          I pasti salvati sono diventati ricette senza procedimento: stanno qui insieme alle altre.
        </p>
      )}
    </div>
  )
}

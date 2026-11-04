import { useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFoods } from '../db/diet'
import { listRecipesRanked, listRecipeTags, computeRecipe } from '../db/recipes'
import { MacroDonut } from './FoodSheet'
import { RecipeDetail } from './RecipeDetail'
import { RecipeEditor } from './RecipeEditor'
import { AddRecipeSheet } from './AddRecipeSheet'
import { pushAvviso } from '../util/undo'
import type { Food, Recipe } from '../db/schema'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Filtro attivo: tutte, solo preferite, i pasti salvati, oppure un tag. */
type Filter = { kind: 'all' | 'fav' | 'meals' } | { kind: 'tag'; tag: string }

/**
 * Una riga: anello dei macro, nome, e il numero che conta davvero — la porzione
 * se e' a porzioni, i 100 g se e' a peso. C · P · G interi. Il «＋» la mette nel
 * diario senza aprirla.
 */
function RigaRicetta({ recipe, foods, onOpen, onAggiungi }: {
  recipe: Recipe
  foods: Map<string, Food>
  onOpen: () => void
  onAggiungi: () => void
}) {
  const calc = computeRecipe(recipe, foods)
  const byPortions = recipe.mode === 'servings'
  const unit = byPortions ? calc.perServing : calc.per100
  const m = unit ?? calc.totals
  const r = (n: number) => Math.round(n)

  return (
    <div className="riga-s" style={{ cursor: 'pointer' }} onClick={onOpen}>
      <MacroDonut m={m} size={38} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* Il nome va a capo invece di essere troncato: una ricetta si riconosce
            dal nome intero. Due righe al massimo. */}
        <b style={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>
          {recipe.favorite ? '★ ' : ''}{recipe.name}
        </b>
        {unit || !byPortions ? (
          <span className="sotto" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {r(m.kcal)} kcal{byPortions ? '' : ' / 100 g'} · <span style={{ color: 'var(--carb)' }}>C {r(m.carbs)}</span> · <span style={{ color: 'var(--prot)' }}>P {r(m.protein)}</span> · <span style={{ color: 'var(--fat)' }}>G {r(m.fat)}</span>
            {recipe.timeMin ? ` · ${recipe.timeMin}′` : ''}
          </span>
        ) : <span className="sotto">peso finale da impostare</span>}
      </span>
      <button className="piu-r" aria-label={`Aggiungi ${recipe.name} al diario`}
        onClick={(e) => { e.stopPropagation(); onAggiungi() }}>＋</button>
    </div>
  )
}

/**
 * Le ricette. Vive dentro Cibo come sotto-schermata: lista → dettaglio →
 * modifica, e si torna indietro un passo alla volta. Le ricette col procedimento
 * e i pasti salvati stanno in due gruppi.
 */
export function RecipesScreen({ onBack }: { onBack: () => void }) {
  useIndietro(onBack)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [aggiungi, setAggiungi] = useState<Recipe | null>(null)

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
  const conProcedimento = visible.filter((r) => r.steps.length > 0)
  const pasti = visible.filter((r) => r.steps.length === 0)

  const is = (f: Filter) => (filter.kind === f.kind && (f.kind !== 'tag' || (filter as { tag: string }).tag === f.tag) ? 'chip on' : 'chip')
  const gruppo = (titolo: string, lista: Recipe[]) => lista.length > 0 && (
    <>
      <span className="etichetta-p" style={{ margin: '4px 0 -4px 4px' }}>{titolo}</span>
      <div className="lista-p">
        {lista.map((r) => (
          <RigaRicetta key={r.id} recipe={r} foods={foodsById} onOpen={() => setOpen(r.id)} onAggiungi={() => setAggiungi(r)} />
        ))}
      </div>
    </>
  )

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="barra-s">
        <button className="ind" onClick={onBack}>‹ Cibo</button>
        <span className="tit">Ricette</span>
        <button className="ind" aria-label="Nuova ricetta" style={{ fontSize: 24, width: 44 }} onClick={() => setEditing('new')}>＋</button>
      </div>

      <input placeholder="Cerca ricetta…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button className={is({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })}>Tutte {recipes.length}</button>
        <button className={is({ kind: 'fav' })} onClick={() => setFilter({ kind: 'fav' })}>★ Preferite</button>
        {tags.map((t) => (
          <button key={t} className={is({ kind: 'tag', tag: t })} style={{ textTransform: 'capitalize' }} onClick={() => setFilter({ kind: 'tag', tag: t })}>{t}</button>
        ))}
        <button className={is({ kind: 'meals' })} onClick={() => setFilter({ kind: 'meals' })}>Pasti salvati</button>
      </div>

      {gruppo('Ricette', conProcedimento)}
      {gruppo('Pasti salvati', pasti)}

      {visible.length === 0 && (
        <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          {recipes.length === 0
            ? 'Non hai ancora ricette. Creane una col ＋, oppure salva un pasto del diario dal suo menù ⋮.'
            : 'Nessuna ricetta con questi filtri.'}
        </p>
      )}

      {aggiungi && <AddRecipeSheet recipe={aggiungi} onClose={() => setAggiungi(null)} onDone={(pasto) => pushAvviso(`✓ ${aggiungi.name} in ${pasto}`)} />}
    </div>
  )
}

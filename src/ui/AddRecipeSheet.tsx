import { useEffect, useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ensureMeals, mealsOfDate, todayDiet, listFoods } from '../db/diet'
import { addRecipeToDiary, computeRecipe, macrosForAmount, type RecipeAmount } from '../db/recipes'
import { MacroDonut, MacroRow } from './FoodSheet'
import { DayCalendar } from './DayCalendar'
import { shiftDate } from '../util/date'
import { parseNum } from '../util/validate'
import type { Recipe } from '../db/schema'
import { sostituisciConRicetta } from '../rs/dieta'

const labelFor = (iso: string) => {
  if (iso === todayDiet()) return 'Oggi'
  if (iso === shiftDate(todayDiet(), -1)) return 'Ieri'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/**
 * Aggiunge una ricetta al diario. Chiede quello che serve e nient'altro:
 * porzioni se la ricetta va a porzioni, grammi se va a peso.
 * Usata sia dal dettaglio ricetta sia dalla scheda Ricette del pannello alimenti.
 */
export function AddRecipeSheet({ recipe, date: initialDate, mealId: initialMeal, onClose, onDone, sostituisci }: {
  recipe: Recipe
  date?: string
  mealId?: string
  onClose: () => void
  onDone?: (mealName: string) => void
  /** 🦠RS: invece di aggiungere una riga, prende il posto di quella indicata. */
  sostituisci?: { id: string; onFatto: () => void; piano?: { nome: string; g: number } }
}) {
  useIndietro(onClose)
  const [date, setDate] = useState(initialDate ?? todayDiet())
  const [mealId, setMealId] = useState<string | null>(initialMeal ?? null)
  const [showCal, setShowCal] = useState(false)
  const [qty, setQty] = useState(recipe.mode === 'servings' ? '1' : '150')
  const [busy, setBusy] = useState(false)

  const byPortions = recipe.mode === 'servings'
  const yieldG = Number(recipe.yieldG) || 0

  // I pasti di default si creano qui (scrittura), mai dentro la query reattiva.
  useEffect(() => { ensureMeals(date) }, [date])
  const meals = useLiveQuery(() => mealsOfDate(date), [date]) ?? []
  const foods = useLiveQuery(listFoods, []) ?? []

  const ordered = [...meals].sort((a, b) => a.order - b.order)
  // Cambiando giorno il pasto scelto non esiste più: si riparte dal primo.
  useEffect(() => {
    if (!ordered.length) return
    if (!mealId || !ordered.some((m) => m.id === mealId)) setMealId(ordered[0].id)
  }, [date, ordered.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const calc = computeRecipe(recipe, new Map(foods.map((f) => [f.id, f])))
  const n = parseNum(qty, { min: 0.01, max: byPortions ? 50 : 5000 })
  const amount: RecipeAmount | null = n == null ? null : byPortions ? { portions: n } : { grams: n }
  const macros = amount ? macrosForAmount(recipe, calc, amount) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const mancaResa = !byPortions && yieldG <= 0
  const ok = amount != null && mealId != null && !mancaResa && !busy

  const step = (d: number) => {
    const cur = parseNum(qty, {}) ?? 0
    const next = Math.max(byPortions ? 0.5 : 5, Math.round((cur + d) * 100) / 100)
    setQty(String(next))
  }

  async function conferma() {
    if (!ok || !amount || !mealId) return
    setBusy(true)
    if (sostituisci) {
      // Sostituzione: la riga del piano diventa questa ricetta, al posto suo.
      // Non si aggiunge niente — la riga del coach resta una sola, com'e' giusto.
      // Stessa forma di una riga-ricetta aggiunta dal ricettario: a porzioni i
      // grammi restano a zero, e la quantita' la dice `portions`.
      await sostituisciConRicetta(sostituisci.id, {
        id: recipe.id, nome: recipe.name,
        ...('portions' in amount ? { porzioni: Number(amount.portions) || 0 } : {}),
        grammi: 'grams' in amount ? Math.max(0, Number(amount.grams) || 0) : 0,
        macros,
      }, sostituisci.piano)
      sostituisci.onFatto()
      onClose()
      return
    }
    await addRecipeToDiary(recipe.id, date, mealId, amount)
    onDone?.(ordered.find((m) => m.id === mealId)?.name ?? 'pasto')
    onClose()
  }

  const nomePasto = ordered.find((m) => m.id === mealId)?.name ?? ''

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sostituisci ? 'Sostituisci con la ricetta' : 'Aggiungi al diario'}
          </strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center', flex: 'none' }} onClick={onClose}>✕</button>
        </div>

        <label className="fl">Giorno</label>
        <div className="row" style={{ gap: 6, marginBottom: 12 }}>
          <button className={date === todayDiet() ? 'chip on' : 'chip'} onClick={() => setDate(todayDiet())}>Oggi</button>
          <button className={date === shiftDate(todayDiet(), -1) ? 'chip on' : 'chip'} onClick={() => setDate(shiftDate(todayDiet(), -1))}>Ieri</button>
          <button className={date !== todayDiet() && date !== shiftDate(todayDiet(), -1) ? 'chip on' : 'chip'} onClick={() => setShowCal(true)}>
            📅 {date !== todayDiet() && date !== shiftDate(todayDiet(), -1) ? labelFor(date) : 'Altro'}
          </button>
        </div>

        <label className="fl">Pasto</label>
        <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
          {ordered.map((m) => (
            <button key={m.id} className={mealId === m.id ? 'chip on' : 'chip'} onClick={() => setMealId(m.id)}>{m.name}</button>
          ))}
        </div>

        {mancaResa ? (
          <p className="muted small" style={{ lineHeight: 1.5 }}>
            Questa ricetta va a grammi ma non ha il peso finale. Aprila e scrivi quanto pesa il piatto
            una volta pronto: senza quel numero non si può sapere quanto stai mangiando.
          </p>
        ) : (
          <>
            <label className="fl">
              {byPortions ? 'Quante porzioni' : 'Quanti grammi'}
              {!byPortions && <span className="muted"> · resa {yieldG} g</span>}
            </label>
            <div className="row" style={{ gap: 6, marginBottom: 10 }}>
              <button style={{ flex: 'none' }} onClick={() => step(byPortions ? -0.5 : -10)}>{byPortions ? '−½' : '−10'}</button>
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)}
                style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }} />
              <button style={{ flex: 'none' }} onClick={() => step(byPortions ? 0.5 : 10)}>{byPortions ? '+½' : '+10'}</button>
            </div>

            <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
              {byPortions
                ? ['0.5', '1', '1.5', '2'].map((v) => (
                  <button key={v} className={qty === v ? 'chip on' : 'chip'} onClick={() => setQty(v)}>
                    {v === '0.5' ? '½' : v === '1.5' ? '1 ½' : v}
                  </button>
                ))
                : [8, 6, 4].map((d) => {
                  const g = String(Math.round(yieldG / d))
                  return (
                    <button key={d} className={qty === g ? 'chip on' : 'chip'} onClick={() => setQty(g)}>
                      1/{d} · {g} g
                    </button>
                  )
                })}
            </div>

            <div className="card" style={{ background: 'var(--bg)', padding: '11px 12px', marginBottom: 14 }}>
              <div className="row" style={{ gap: 11 }}>
                <MacroDonut m={macros} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}><MacroRow m={macros} size={16} /></div>
              </div>
            </div>

            {calc.missing > 0 && (
              <p className="muted small" style={{ marginBottom: 10, lineHeight: 1.5 }}>
                {calc.missing === 1 ? 'Un ingrediente non è più' : `${calc.missing} ingredienti non sono più`} in
                libreria: {calc.missing === 1 ? 'non è' : 'non sono'} conteggiat{calc.missing === 1 ? 'o' : 'i'}.
              </p>
            )}
          </>
        )}

        <div className="row" style={{ gap: 6 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Annulla</button>
          <button className="primary" style={{ flex: 2 }} disabled={!ok} onClick={conferma}>
            {nomePasto ? `Aggiungi a ${nomePasto}` : 'Aggiungi'}
          </button>
        </div>

        {showCal && (
          <DayCalendar date={date} onPick={(d) => { setDate(d); setShowCal(false) }} onClose={() => setShowCal(false)} />
        )}
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRecipe, updateRecipeLog, explodeRecipeLog, type RecipeAmount } from '../db/recipes'
import { restoreFoodLogs, deleteFoodLogs } from '../db/diet'
import { MacroDonut, MacroRow } from './FoodSheet'
import { pushUndo } from '../util/undo'
import { parseNum } from '../util/validate'
import type { DiaryEntry } from '../db/diet'

/**
 * Modifica di una riga-ricetta già nel diario.
 * Non è la scheda degli alimenti: qui non si "corregge l'alimento", si cambia
 * quanto ne hai mangiato — oppure si scioglie la riga nei suoi ingredienti.
 */
export function RecipeEntrySheet({ entry, onClose, onDelete }: {
  entry: DiaryEntry
  onClose: () => void
  onDelete: () => void
}) {
  const recipe = useLiveQuery(async () => (entry.log.recipeId ? await getRecipe(entry.log.recipeId) : undefined), [entry.log.recipeId])
  const byPortions = entry.log.portions != null
  const [qty, setQty] = useState(String(byPortions ? entry.log.portions : entry.log.grams))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const n = parseNum(qty, { min: 0.01, max: byPortions ? 50 : 5000 })
  const amount: RecipeAmount | null = n == null ? null : byPortions ? { portions: n } : { grams: n }
  const cambiata = n != null && n !== (byPortions ? entry.log.portions : entry.log.grams)

  const step = (d: number) => {
    const cur = parseNum(qty, {}) ?? 0
    setQty(String(Math.max(byPortions ? 0.5 : 5, Math.round((cur + d) * 100) / 100)))
  }

  async function sciogli() {
    setBusy(true)
    const res = await explodeRecipeLog(entry.log.id)
    onClose()
    if (res) {
      pushUndo('Ricetta sciolta in righe', async () => {
        await deleteFoodLogs(res.created)
        await restoreFoodLogs([res.removed])
      })
    }
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Modifica</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        <div className="row spread" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17 }}>📖 {entry.food.name}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {recipe === undefined ? 'ricetta' : recipe ? `ricetta · ${recipe.mode === 'servings' ? `${recipe.servings} porzioni` : `resa ${recipe.yieldG} g`}` : 'ricetta eliminata'}
            </div>
          </div>
          <MacroDonut m={entry.macros} />
        </div>

        <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '12px 0', margin: '12px 0' }}>
          <MacroRow m={entry.macros} />
        </div>

        {recipe ? (
          <>
            <label className="fl">{byPortions ? 'Porzioni' : 'Grammi'}</label>
            <div className="row" style={{ gap: 6 }}>
              <button style={{ flex: 'none' }} onClick={() => step(byPortions ? -0.5 : -10)}>{byPortions ? '−½' : '−10'}</button>
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)}
                style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }} />
              <button style={{ flex: 'none' }} onClick={() => step(byPortions ? 0.5 : 10)}>{byPortions ? '+½' : '+10'}</button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              I macro qui sopra sono quelli del giorno in cui l'hai aggiunta. Cambiando la quantità
              vengono rifatti sulla ricetta di oggi.
            </p>

            <button className="ghost small" style={{ width: '100%', marginTop: 10 }} disabled={busy} onClick={sciogli}>
              ⑃ Sciogli negli ingredienti
            </button>
            <p className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
              La riga diventa una riga per ingrediente, con le quantità di questa dose: serve quando
              quella sera hai messo qualcosa in più.
            </p>
          </>
        ) : (
          <p className="muted small" style={{ lineHeight: 1.5 }}>
            La ricetta è stata eliminata. La riga resta con i valori di quel giorno, e si può solo togliere.
          </p>
        )}

        <div className="row" style={{ gap: 6, marginTop: 14 }}>
          <button className="ghost" style={{ flex: 'none', color: '#e57373' }} onClick={onDelete}>🗑</button>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Indietro</button>
          <button className="primary" style={{ flex: 2 }} disabled={!cambiata || !amount || busy}
            onClick={async () => { if (!amount) return; setBusy(true); await updateRecipeLog(entry.log.id, amount); onClose() }}>
            Salva
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

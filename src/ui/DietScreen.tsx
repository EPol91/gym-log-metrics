import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  computeDiary, listDayTypes, todayDiet, addMeal, renameMeal, deleteMeal, moveMeal, ensureMeals,
  duplicateMeal, pasteIntoMeal, deleteFoodLogs, restoreFoodLogs, moveLogsToMeal,
  reorderLogs, updateFoodLog, macrosFor,
} from '../db/diet'
import { getNutrition, upsertNutrition, getUser, listMeasurements, getCurrentPhase } from '../db/repo'
import { computeTargets } from '../scores/nutritionTargets'
import { pushUndo } from '../util/undo'
import { DietTargets } from './DietTargets'
import { FoodPicker } from './FoodPicker'
import { FoodSheet } from './FoodSheet'
import { DayCalendar } from './DayCalendar'
import { UndoToast } from './UndoToast'
import { shiftDate } from '../util/date'
import type { DiaryEntry, DiaryMeal } from '../db/diet'

const shift = shiftDate
const labelFor = (iso: string) => {
  if (iso === todayDiet()) return 'Oggi'
  if (iso === shift(todayDiet(), -1)) return 'Ieri'
  const d = new Date(iso + 'T00:00:00')
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]
  return `${gg} ${d.getDate()}/${d.getMonth() + 1}`
}

/** Barra macro con il colore del macro e i grammi presi/obiettivo. */
function MacroTrack({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color }}>{label}</div>
      <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', margin: '4px 0', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value)} <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>/ {target || '—'}</span>
      </div>
    </div>
  )
}

/** Riga alimento: swipe verso sinistra per eliminare, tap per aprire la scheda. */
function EntryRow({ e, selectMode, selected, onToggle, onOpen, onDelete, dragHandlers }: {
  e: DiaryEntry
  selectMode: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
  dragHandlers?: { onPointerDown: (ev: React.PointerEvent) => void }
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const moved = useRef(false)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--line)' }}>
      {/* Sfondo rosso che si scopre scorrendo */}
      <div style={{ position: 'absolute', inset: 0, background: '#e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 16, color: '#fff', fontSize: 18 }}>🗑</div>
      <div
        onTouchStart={(ev) => { if (selectMode) return; start.current = ev.touches[0].clientX; moved.current = false }}
        onTouchMove={(ev) => {
          if (start.current == null) return
          const d = ev.touches[0].clientX - start.current
          if (d < 0) { setDx(Math.max(d, -120)); moved.current = true }
        }}
        onTouchEnd={() => {
          if (dx < -70) { onDelete(); setDx(0); start.current = null; return }
          setDx(0); start.current = null
        }}
        onClick={() => { if (moved.current) { moved.current = false; return } selectMode ? onToggle() : onOpen() }}
        style={{
          position: 'relative', background: 'var(--surface)', transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform .2s' : 'none',
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px', cursor: 'pointer',
        }}>
        {selectMode && (
          <span style={{
            width: 18, height: 18, flex: 'none', borderRadius: 5, border: '1px solid var(--line)',
            background: selected ? 'var(--gold)' : 'transparent', color: '#1a1400',
            display: 'grid', placeItems: 'center', fontSize: 12,
          }}>{selected ? '✓' : ''}</span>
        )}
        {dragHandlers && !selectMode && (
          <span onPointerDown={dragHandlers.onPointerDown} onClick={(ev) => ev.stopPropagation()}
            style={{ flex: 'none', color: 'var(--muted)', cursor: 'grab', padding: '0 4px', touchAction: 'none' }}>≡</span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
            {e.food.name}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            {e.food.brand ? `${e.food.brand} · ` : ''}{e.log.grams} g
          </span>
        </span>
        {/* Calorie e macro incolonnati a destra: i numeri stanno insieme, non sparsi. */}
        <span style={{ flex: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ display: 'block', color: 'var(--gold)' }}>{e.macros.kcal}</span>
          <span style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--carb)' }}>C{e.macros.carbs}</span>{' '}
            <span style={{ color: 'var(--prot)' }}>P{e.macros.protein}</span>{' '}
            <span style={{ color: 'var(--fat)' }}>G{e.macros.fat}</span>
          </span>
        </span>
      </div>
    </div>
  )
}

/** Recap a quattro numeri, usato in fondo a ogni pasto. */
function MealRecap({ m }: { m: DiaryMeal }) {
  const cell = (v: number, l: string, c: string) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ color: c, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div className="muted" style={{ fontSize: 9 }}>{l}</div>
    </div>
  )
  return (
    <div className="row" style={{ padding: '9px 0 4px', borderTop: '1px solid var(--line)', marginTop: 6 }}>
      {cell(m.totals.carbs, 'Carbo', 'var(--carb)')}
      {cell(m.totals.protein, 'Proteine', 'var(--prot)')}
      {cell(m.totals.fat, 'Grassi', 'var(--fat)')}
      {cell(m.totals.kcal, 'kcal', 'var(--gold)')}
    </div>
  )
}

export function DietScreen() {
  const [date, setDate] = useState(todayDiet())
  const [picking, setPicking] = useState<{ id: string; name: string } | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [showCal, setShowCal] = useState(false)
  const [editEntry, setEditEntry] = useState<DiaryEntry | null>(null)
  const [menuMeal, setMenuMeal] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<{ mealId: string; name: string } | null>(null)
  const [dragging, setDragging] = useState<{ mealId: string; ids: string[] } | null>(null)

  // I pasti di default si creano qui (scrittura), non dentro la query reattiva.
  useEffect(() => { ensureMeals(date) }, [date])

  const diary = useLiveQuery(() => computeDiary(date), [date])
  const dayTypes = useLiveQuery(listDayTypes, []) ?? []
  const nutri = useLiveQuery(() => getNutrition(date), [date])
  const user = useLiveQuery(getUser, [])
  const meas = useLiveQuery(listMeasurements, []) ?? []
  const phase = useLiveQuery(getCurrentPhase, [])

  const activeType = dayTypes.find((d) => d.key === nutri?.dayType)
  const weight = meas.length ? meas[meas.length - 1].weight : 0
  const suggested = weight && user?.heightCm && user?.birthYear
    ? computeTargets({
      weightKg: weight, heightCm: user.heightCm,
      age: new Date().getFullYear() - user.birthYear,
      sex: user.sex ?? 'm', weeklySessions: user.weeklyTarget ?? 4,
      phase: phase?.phase ?? null,
    })
    : null
  const t = activeType && activeType.targets.kcal > 0 ? activeType.targets : suggested
  const totals = diary?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const kcalPct = t && t.kcal > 0 ? Math.min(100, (totals.kcal / t.kcal) * 100) : 0

  // Uscendo dalla modalità selezione azzero le spunte.
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  if (showTargets) return <DietTargets onBack={() => setShowTargets(false)} suggested={suggested} />

  async function removeEntries(ids: string[]) {
    const rows = await deleteFoodLogs(ids)
    setSelected(new Set())
    pushUndo(ids.length > 1 ? `${ids.length} righe eliminate` : 'Riga eliminata', () => restoreFoodLogs(rows))
  }

  async function removeMeal(id: string, name: string) {
    const snap = await deleteMeal(id)
    setMenuMeal(null)
    if (snap) {
      pushUndo(`Pasto "${name}" eliminato`, async () => {
        await addMealRestore(snap.meal, snap.logs)
      })
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      {/* Giorno */}
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost" style={{ padding: '8px 12px' }} onClick={() => setDate((d) => shift(d, -1))}>‹</button>
        <button className="chip" style={{ fontSize: 15, padding: '7px 16px' }} onClick={() => setShowCal(true)}>
          📅 {labelFor(date)}
        </button>
        <button className="ghost" style={{ padding: '8px 12px' }} onClick={() => setDate((d) => shift(d, 1))}>›</button>
      </div>

      {/* Riepilogo macro */}
      <div className="card">
        <div className="row" style={{ gap: 10 }}>
          <MacroTrack label="Carboidrati" value={totals.carbs} target={t?.carbs ?? 0} color="var(--carb)" />
          <MacroTrack label="Proteine" value={totals.protein} target={t?.protein ?? 0} color="var(--prot)" />
          <MacroTrack label="Grassi" value={totals.fat} target={t?.fat ?? 0} color="var(--fat)" />
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${kcalPct}%`, background: 'var(--gold)', borderRadius: 999, transition: 'width .3s' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6 }}>
          <strong style={{ color: 'var(--gold)' }}>{totals.kcal}</strong>
          <span className="muted"> / {t?.kcal ?? '—'} kcal{t ? ` · restano ${Math.max(0, t.kcal - totals.kcal)}` : ''}</span>
        </div>
        {!t && <p className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>Imposta gli obiettivi con ⚙ qui sotto.</p>}
      </div>

      {/* Tipo giornata + obiettivi */}
      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {dayTypes.map((d) => (
          <button key={d.id} className={nutri?.dayType === d.key ? 'chip on' : 'chip'}
            onClick={() => upsertNutrition(date, { dayType: nutri?.dayType === d.key ? null : d.key as never })}>
            {d.name}
          </button>
        ))}
        <button className="chip" onClick={() => setShowTargets(true)}>⚙ Obiettivi</button>
      </div>

      {/* Barra selezione multipla */}
      {selectMode && (
        <div className="card" style={{ borderColor: 'var(--gold)', padding: '10px 12px' }}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <span className="small">{selected.size} selezionate</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="chip" disabled={!selected.size} onClick={() => removeEntries([...selected])}>🗑 Elimina</button>
              <button className="chip" onClick={() => setSelectMode(false)}>Fine</button>
            </div>
          </div>
          {selected.size > 0 && diary && (
            <div className="row" style={{ gap: 6, marginTop: 8, overflowX: 'auto' }}>
              <span className="muted small" style={{ flex: 'none', alignSelf: 'center' }}>Sposta in:</span>
              {diary.meals.map((m) => (
                <button key={m.meal.id} className="chip" onClick={async () => {
                  await moveLogsToMeal([...selected], m.meal.id)
                  setSelected(new Set())
                }}>{m.meal.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pasti */}
      {diary?.meals.map((m) => (
        <div className="card" key={m.meal.id}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>{m.meal.name}</strong>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="muted small">{m.totals.kcal} kcal</span>
              <button className="ghost small" onClick={() => setMenuMeal(menuMeal === m.meal.id ? null : m.meal.id)}>⋮</button>
            </div>
          </div>

          {/* Menù del pasto */}
          {menuMeal === m.meal.id && (
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <button className="chip" onClick={async () => { const n = prompt('Nome del pasto', m.meal.name)?.trim(); if (n) await renameMeal(m.meal.id, n); setMenuMeal(null) }}>✎ Rinomina</button>
              <button className="chip" onClick={async () => { await duplicateMeal(m.meal.id); setMenuMeal(null) }}>⧉ Duplica</button>
              <button className="chip" onClick={() => { setClipboard({ mealId: m.meal.id, name: m.meal.name }); setMenuMeal(null) }}>📋 Copia</button>
              {clipboard && clipboard.mealId !== m.meal.id && (
                <button className="chip on" onClick={async () => {
                  const ids = await pasteIntoMeal(clipboard.mealId, m.meal.id)
                  setMenuMeal(null)
                  if (ids.length) pushUndo(`Incollato da "${clipboard.name}"`, async () => { await deleteFoodLogs(ids) })
                }}>📥 Incolla ({clipboard.name})</button>
              )}
              <button className="chip" onClick={async () => { await moveMeal(m.meal.id, -1); setMenuMeal(null) }}>↑</button>
              <button className="chip" onClick={async () => { await moveMeal(m.meal.id, 1); setMenuMeal(null) }}>↓</button>
              <button className="chip" onClick={() => { setSelectMode(true); setMenuMeal(null) }}>☑ Seleziona</button>
              <button className="chip" style={{ color: '#e57373' }} onClick={() => removeMeal(m.meal.id, m.meal.name)}>🗑 Elimina pasto</button>
            </div>
          )}

          {/* Righe */}
          {m.entries.map((e) => (
            <EntryRow key={e.log.id} e={e}
              selectMode={selectMode}
              selected={selected.has(e.log.id)}
              onToggle={() => setSelected((s) => { const n = new Set(s); n.has(e.log.id) ? n.delete(e.log.id) : n.add(e.log.id); return n })}
              onOpen={() => setEditEntry(e)}
              onDelete={() => removeEntries([e.log.id])}
              dragHandlers={m.entries.length > 1 ? {
                onPointerDown: (ev) => {
                  ev.preventDefault()
                  setDragging({ mealId: m.meal.id, ids: m.entries.map((x) => x.log.id) })
                  const ids = m.entries.map((x) => x.log.id)
                  const from = ids.indexOf(e.log.id)
                  const startY = ev.clientY
                  const rowH = 46
                  const move = (mv: PointerEvent) => {
                    const delta = Math.round((mv.clientY - startY) / rowH)
                    const to = Math.max(0, Math.min(ids.length - 1, from + delta))
                    if (to !== from) {
                      const next = [...ids]
                      next.splice(to, 0, next.splice(from, 1)[0])
                      setDragging({ mealId: m.meal.id, ids: next })
                    }
                  }
                  const up = async () => {
                    window.removeEventListener('pointermove', move)
                    window.removeEventListener('pointerup', up)
                    setDragging((d) => {
                      if (d) reorderLogs(m.meal.id, d.ids)
                      return null
                    })
                  }
                  window.addEventListener('pointermove', move)
                  window.addEventListener('pointerup', up)
                },
              } : undefined} />
          ))}

          {m.entries.length > 0 && <MealRecap m={m} />}

          <button className="chip" style={{ marginTop: 9 }} onClick={() => setPicking({ id: m.meal.id, name: m.meal.name })}>
            ＋ Aggiungi cibo
          </button>
        </div>
      ))}

      <button className="ghost" onClick={async () => {
        const n = prompt('Nome del nuovo pasto', `Pasto ${(diary?.meals.length ?? 0) + 1}`)?.trim()
        if (n) await addMeal(date, n)
      }}>＋ Aggiungi pasto</button>

      {dragging && <div style={{ display: 'none' }} />}

      {picking && (
        <FoodPicker date={date} mealId={picking.id} mealName={picking.name} onClose={() => setPicking(null)} />
      )}

      {editEntry && (
        <EditEntrySheet entry={editEntry} onClose={() => setEditEntry(null)}
          onDelete={async () => { const e = editEntry; setEditEntry(null); await removeEntries([e.log.id]) }} />
      )}

      {showCal && (
        <DayCalendar date={date} onPick={(d) => { setDate(d); setShowCal(false) }} onClose={() => setShowCal(false)} />
      )}

      <UndoToast />
    </div>
  )
}

/** Ripristino di un pasto eliminato (pasto + righe). */
async function addMealRestore(meal: { id: string; date: string; name: string; order: number; userId: string; createdAt: string; updatedAt: string }, logs: unknown[]) {
  const { db } = await import('../db/db')
  await db.meals.add(meal as never)
  if (logs.length) await db.foodLogs.bulkAdd(logs as never[])
}

/** Scheda di modifica di una riga già nel diario: stessa scheda dell'aggiunta. */
function EditEntrySheet({ entry, onClose, onDelete }: { entry: DiaryEntry; onClose: () => void; onDelete: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Portal su body: gli antenati animati hanno `transform`, che intrappolerebbe
  // un position:fixed annidato facendolo comparire nel posto sbagliato.
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '16px 16px 0 0',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Modifica</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>
        <FoodSheet food={entry.food} grams={entry.log.grams} mode="edit"
          onConfirm={async (g) => { await updateFoodLog(entry.log.id, { grams: g }); onClose() }}
          onDeleteLog={onDelete}
          onBack={onClose} />
      </div>
    </div>,
    document.body,
  )
}

export { macrosFor }

import { useState } from 'react'
import { macrosFor, updateFood, deleteFood } from '../db/diet'
import { parseNum } from '../util/validate'
import type { Food, Macros } from '../db/schema'

/** Ripartizione calorica dei macro: è così che si legge un alimento a colpo d'occhio. */
export function MacroDonut({ m, size = 76 }: { m: Macros; size?: number }) {
  const kc = { carb: m.carbs * 4, prot: m.protein * 4, fat: m.fat * 9 }
  const tot = kc.carb + kc.prot + kc.fat
  const r = size / 2 - 7
  const circ = 2 * Math.PI * r
  const seg = (v: number) => (tot > 0 ? (v / tot) * circ : 0)
  let off = 0
  const parts = [
    { v: seg(kc.carb), color: 'var(--carb)' },
    { v: seg(kc.prot), color: 'var(--prot)' },
    { v: seg(kc.fat), color: 'var(--fat)' },
  ]
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
      {tot === 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />}
      {parts.map((p, i) => {
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth="12"
            strokeDasharray={`${p.v} ${circ - p.v}`} strokeDashoffset={-off} />
        )
        off += p.v
        return el
      })}
    </svg>
  )
}

/** Quattro numeri grandi e colorati: carbo, proteine, grassi, calorie. */
export function MacroRow({ m, size = 19 }: { m: Macros; size?: number }) {
  const cell = (v: number | string, label: string, color: string) => (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ color, fontSize: size, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div className="muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  )
  return (
    <div className="row" style={{ gap: 4 }}>
      {cell(m.carbs, 'Carbo', 'var(--carb)')}
      {cell(m.protein, 'Proteine', 'var(--prot)')}
      {cell(m.fat, 'Grassi', 'var(--fat)')}
      {cell(m.kcal, 'Calorie', 'var(--gold)')}
    </div>
  )
}

/** Form dei valori per 100 g: crea un alimento o corregge quelli esistenti. */
export function FoodForm({ initial, title, onSave, onCancel, onDelete }: {
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
  const pn = n(p, 100), cn = n(c, 100), fn = n(f, 100), kn = n(kcal, 1000)
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
        <div style={{ flex: 1 }}>
          <label className="fl" style={{ color: 'var(--carb)' }}>Carbo</label>
          <input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} style={{ textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl" style={{ color: 'var(--prot)' }}>Proteine</label>
          <input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} style={{ textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl" style={{ color: 'var(--fat)' }}>Grassi</label>
          <input inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} style={{ textAlign: 'center' }} />
        </div>
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
        {onDelete && <button className="ghost" style={{ color: '#e57373' }} onClick={onDelete}>🗑</button>}
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

/**
 * Scheda alimento: la stessa quando aggiungi e quando tocchi una riga già nel diario.
 * `mode` cambia solo il pulsante finale (Aggiungi / Salva) e mostra l'elimina.
 */
export function FoodSheet({ food, grams: initialGrams, mode, onConfirm, onDeleteLog, onBack }: {
  food: Food
  grams?: number
  mode: 'add' | 'edit'
  onConfirm: (grams: number) => void
  onDeleteLog?: () => void
  onBack: () => void
}) {
  const [g, setG] = useState(String(initialGrams ?? food.servingG ?? 100))
  const [fixing, setFixing] = useState(false)
  const grams = parseNum(g, { min: 1, max: 5000 }) ?? 0
  const m = macrosFor(food.per100, grams)

  if (fixing) {
    return (
      <FoodForm title={`Correggi "${food.name}"`} initial={food}
        onCancel={() => setFixing(false)}
        onDelete={async () => {
          if (confirm(`Eliminare ${food.name} dalla libreria?`)) { await deleteFood(food.id); setFixing(false); onBack() }
        }}
        onSave={async (v) => { await updateFood(food.id, v); setFixing(false) }} />
    )
  }

  return (
    <div>
      <div className="row spread" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17 }}>{food.name}</div>
          {food.brand && <div className="small" style={{ color: 'var(--gold)' }}>{food.brand}</div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            per 100 g · {food.per100.kcal} kcal{food.edited ? ' · corretto da te' : ''}
          </div>
        </div>
        <MacroDonut m={food.per100} />
      </div>

      <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '12px 0', margin: '12px 0' }}>
        <MacroRow m={m} />
      </div>

      <label className="fl">Quantità (g)</label>
      <div className="row" style={{ gap: 6 }}>
        <button onClick={() => setG(String(Math.max(1, grams - 10)))}>−10</button>
        <input inputMode="decimal" value={g} autoFocus onChange={(e) => setG(e.target.value)}
          style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }} />
        <button onClick={() => setG(String(grams + 10))}>+10</button>
      </div>
      {food.servingG && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setG(String(food.servingG))}>
          {food.servingLabel ?? 'porzione'} ({food.servingG} g)
        </button>
      )}

      {/* Valori nutrizionali completi, se disponibili */}
      {(food.per100.fiber != null || food.per100.sugar != null || food.per100.salt != null) && (
        <div className="card" style={{ marginTop: 12, background: 'var(--bg)', padding: '10px 12px' }}>
          <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Altri valori · {grams} g
          </div>
          {food.per100.fiber != null && <div className="row spread small"><span className="muted">Fibre</span><span>{macrosFor(food.per100, grams).fiber} g</span></div>}
          {food.per100.sugar != null && <div className="row spread small" style={{ marginTop: 3 }}><span className="muted">Zuccheri</span><span>{macrosFor(food.per100, grams).sugar} g</span></div>}
          {food.per100.salt != null && <div className="row spread small" style={{ marginTop: 3 }}><span className="muted">Sale</span><span>{macrosFor(food.per100, grams).salt} g</span></div>}
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {mode === 'edit' && onDeleteLog && <button className="ghost" style={{ color: '#e57373' }} onClick={onDeleteLog}>🗑</button>}
        <button className="ghost" style={{ flex: 'none' }} onClick={() => setFixing(true)}>✎ Correggi</button>
        <button className="ghost" style={{ flex: 1 }} onClick={onBack}>Indietro</button>
        <button className="primary" style={{ flex: 2 }} disabled={grams <= 0} onClick={() => onConfirm(grams)}>
          {mode === 'add' ? 'Aggiungi' : 'Salva'}
        </button>
      </div>
    </div>
  )
}

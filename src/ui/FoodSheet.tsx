import { useState } from 'react'
import { macrosFor, updateFood, deleteFood } from '../db/diet'
import { deleteWithUndo } from '../db/trash'
import { parseNum } from '../util/validate'
import { useScanner } from './useScanner'
import type { Food, Macros } from '../db/schema'

/** Ripartizione calorica dei macro: è così che si legge un alimento a colpo d'occhio. */
export function MacroDonut({ m, size = 76 }: { m: Macros; size?: number }) {
  const kc = { carb: m.carbs * 4, prot: m.protein * 4, fat: m.fat * 9 }
  const tot = kc.carb + kc.prot + kc.fat
  // Spessore PROPORZIONALE: con un tratto fisso, sugli anelli piccoli il buco
  // sparisce e il cerchio diventa una torta piena.
  const stroke = Math.max(4, size * 0.2)
  const r = size / 2 - stroke / 2 - 1
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
      {tot === 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />}
      {parts.map((p, i) => {
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
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

/**
 * I valori facoltativi dell'etichetta, nell'ordine in cui stanno sulle confezioni.
 * `max` serve solo a scartare i valori impossibili, non a giudicare.
 */
const EXTRA: { key: keyof Macros; label: string; unit: string; group: string; max: number }[] = [
  { key: 'satFat', label: 'Saturi', unit: 'g', group: 'Di cui grassi', max: 100 },
  { key: 'monoFat', label: 'Monoinsaturi', unit: 'g', group: 'Di cui grassi', max: 100 },
  { key: 'polyFat', label: 'Polinsaturi', unit: 'g', group: 'Di cui grassi', max: 100 },
  { key: 'transFat', label: 'Trans', unit: 'g', group: 'Di cui grassi', max: 100 },
  { key: 'cholesterol', label: 'Colesterolo', unit: 'mg', group: 'Di cui grassi', max: 5000 },
  { key: 'sugar', label: 'Zuccheri', unit: 'g', group: 'Di cui carboidrati', max: 100 },
  { key: 'fiber', label: 'Fibre', unit: 'g', group: 'Di cui carboidrati', max: 100 },
  { key: 'salt', label: 'Sale', unit: 'g', group: 'Sali e minerali', max: 50 },
  { key: 'sodium', label: 'Sodio', unit: 'mg', group: 'Sali e minerali', max: 20000 },
  { key: 'potassium', label: 'Potassio', unit: 'mg', group: 'Sali e minerali', max: 20000 },
  { key: 'calcium', label: 'Calcio', unit: 'mg', group: 'Sali e minerali', max: 20000 },
  { key: 'iron', label: 'Ferro', unit: 'mg', group: 'Sali e minerali', max: 1000 },
  { key: 'vitA', label: 'Vitamina A', unit: '%', group: 'Vitamine', max: 1000 },
  { key: 'vitC', label: 'Vitamina C', unit: '%', group: 'Vitamine', max: 1000 },
  { key: 'vitD', label: 'Vitamina D', unit: '%', group: 'Vitamine', max: 1000 },
]

/**
 * Form dei valori per 100 g: crea un alimento o corregge quelli esistenti.
 * I tre macro e le calorie restano in alto, sempre visibili. Tutto il resto
 * dell'etichetta sta sotto "Altri valori", chiuso: chi vuole solo i macro non
 * si trova una pagina lunga il doppio, chi è pignolo ha dove essere pignolo.
 */
export function FoodForm({ initial, title, onSave, onCancel, onDelete, onScan }: {
  initial?: Partial<Food>
  title: string
  onSave: (v: { name: string; brand?: string; per100: Macros; servingG?: number; barcode?: string }) => void
  onCancel: () => void
  onDelete?: () => void
  /** Apre il lettore e restituisce il codice letto. Assente = niente scansione. */
  onScan?: () => Promise<string | null>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [barcode, setBarcode] = useState(initial?.barcode ?? '')
  const [kcal, setKcal] = useState(initial?.per100 ? String(initial.per100.kcal) : '')
  const [p, setP] = useState(initial?.per100 ? String(initial.per100.protein) : '')
  const [c, setC] = useState(initial?.per100 ? String(initial.per100.carbs) : '')
  const [f, setF] = useState(initial?.per100 ? String(initial.per100.fat) : '')
  const [serving, setServing] = useState(initial?.servingG ? String(initial.servingG) : '')

  const val = (k: keyof Macros) => {
    const v = initial?.per100?.[k]
    return v == null ? '' : String(v)
  }
  // Tutti i valori facoltativi in una mappa: venti useState separati sarebbero
  // venti occasioni di sbagliarne uno.
  const [extra, setExtra] = useState<Record<string, string>>(() =>
    Object.fromEntries(EXTRA.map((e) => [e.key, val(e.key)])),
  )
  const setE = (k: string, v: string) => setExtra((p) => ({ ...p, [k]: v }))

  // Aperta da sola se l'alimento porta già qualcuno di questi valori: nasconderli
  // a chi li ha compilati sarebbe un modo per fargli credere di averli persi.
  const [altri, setAltri] = useState(Object.values(extra).some((x) => x !== ''))

  const n = (v: string, max: number) => parseNum(v, { min: 0, max })
  const pn = n(p, 100), cn = n(c, 100), fn = n(f, 100), kn = n(kcal, 1000)
  const kcalAuto = pn != null && cn != null && fn != null ? Math.round(pn * 4 + cn * 4 + fn * 9) : null
  const ok = name.trim() !== '' && pn != null && cn != null && fn != null

  const opzionale = (v: string, max = 100) => (v.trim() === '' ? undefined : n(v, max) ?? undefined)

  const campo = (etichetta: string, v: string, set: (x: string) => void, colore?: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="fl" style={colore ? { color: colore } : undefined}>{etichetta}</label>
      <input inputMode="decimal" value={v} placeholder="—" onChange={(e) => set(e.target.value)} style={{ textAlign: 'center' }} />
    </div>
  )

  return (
    <div>
      <div className="muted small" style={{ marginBottom: 8 }}>{title} · valori per 100 g</div>
      <label className="fl">Nome</label>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial?.name} />
      <label className="fl" style={{ marginTop: 8 }}>Marca (facoltativo)</label>
      <input value={brand} onChange={(e) => setBrand(e.target.value)} />

      {/* Codice a barre: legarlo qui significa ritrovare l'alimento con una
          scansione la prossima volta, invece di ricercarlo a mano. */}
      <label className="fl" style={{ marginTop: 8 }}>Codice a barre (facoltativo)</label>
      <div className="row" style={{ gap: 6 }}>
        <input inputMode="numeric" value={barcode} placeholder="—" onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ''))} style={{ flex: 1 }} />
        {onScan && (
          <button className="chip on" style={{ flex: 'none', padding: '0 14px' }} aria-label="Scansiona codice a barre"
            onClick={async () => { const code = await onScan(); if (code) setBarcode(code) }}>▦</button>
        )}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {campo('Carbo', c, setC, 'var(--carb)')}
        {campo('Proteine', p, setP, 'var(--prot)')}
        {campo('Grassi', f, setF, 'var(--fat)')}
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

      <button className="chip" style={{ marginTop: 10 }} onClick={() => setAltri((v) => !v)}>
        {altri ? '▾' : '›'} Altri valori dell'etichetta
      </button>

      {altri && (
        <div style={{ marginTop: 8 }}>
          {[...new Set(EXTRA.map((e) => e.group))].map((gruppo) => (
            <div key={gruppo} style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {gruppo}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {EXTRA.filter((e) => e.group === gruppo).map((e) => (
                  <div key={e.key} style={{ flex: '1 1 45%', minWidth: 0 }}>
                    <label className="fl">{e.label} <span className="muted">({e.unit})</span></label>
                    <input inputMode="decimal" value={extra[e.key] ?? ''} placeholder="—"
                      onChange={(ev) => setE(e.key, ev.target.value)} style={{ textAlign: 'center' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            Tutti facoltativi, riferiti a 100 g. Lascia vuoto quello che sulla confezione non c'è.
          </p>
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {onDelete && <button className="ghost" style={{ color: '#e57373' }} onClick={onDelete}>🗑</button>}
        <button className="ghost" style={{ flex: 1 }} onClick={onCancel}>Annulla</button>
        <button className="primary" style={{ flex: 2 }} disabled={!ok}
          onClick={() => ok && onSave({
            name: name.trim(),
            brand: brand.trim() || undefined,
            barcode: barcode.trim() || undefined,
            per100: {
              kcal: kn ?? kcalAuto ?? 0, protein: pn!, carbs: cn!, fat: fn!,
              ...Object.fromEntries(
                EXTRA.map((e) => [e.key, opzionale(extra[e.key] ?? '', e.max)])
                  .filter(([, v]) => v != null),
              ),
            },
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
  const lettore = useScanner()
  const grams = parseNum(g, { min: 1, max: 5000 }) ?? 0
  const m = macrosFor(food.per100, grams)

  if (fixing) {
    if (lettore.overlay) return lettore.overlay
    return (
      <FoodForm title={`Correggi "${food.name}"`} initial={food} onScan={lettore.scan}
        onCancel={() => setFixing(false)}
        onDelete={async () => {
          if (confirm(`Eliminare ${food.name} dalla libreria?`)) { await deleteWithUndo(`"${food.name}" eliminato dalla libreria`, () => deleteFood(food.id)); setFixing(false); onBack() }
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

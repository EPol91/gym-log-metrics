import { useEffect, useRef, useState } from 'react'
import { useBloccoScroll } from './useBloccoScroll'
import { createPortal, flushSync } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  computeDiary, listDayTypes, todayDiet, addMeal, renameMeal, deleteMeal, moveMeal, ensureMeals,
  duplicateMeal, pasteIntoMeal, deleteFoodLogs, restoreFoodLogs, moveLogsToMeal,
  reorderLogs, reorderMeals, updateFoodLog, macrosFor, duplicateLogs, repeatMealFrom, mealCountOn,
  saleDelDiario, saleDelPiano,
} from '../db/diet'
import { getNutrition, upsertNutrition, getUser, listMeasurements, getCurrentPhase } from '../db/repo'
import { computeTargets } from '../scores/nutritionTargets'
import { pushUndo } from '../util/undo'
import { saveMealAsRecipe } from '../db/recipes'
import { DietTargets } from './DietTargets'
import { RecipesScreen } from './RecipesScreen'
import { DayTemplates } from './DayTemplates'
import { RecipeEntrySheet } from './RecipeEntrySheet'
import { FoodPicker } from './FoodPicker'
import { FoodSheet, MacroDonut } from './FoodSheet'
import { DayCalendar } from './DayCalendar'
import { usePersistedState } from '../util/persist'
import { shiftDate, etichettaGiorno } from '../util/date'
import type { DiaryEntry, DiaryMeal } from '../db/diet'
import type { DayType } from '../db/schema'
import { statoDieta, spunta, spuntaTutte } from '../rs/dieta'
import { GiornataConsigliata } from './GiornataConsigliata'
import { copiaPasto } from '../util/appuntiPasto'
import { acquaDelPiano } from '../rs/protocollo'

const shift = shiftDate
const labelFor = (iso: string) => etichettaGiorno(iso, todayDiet())

/** Barra macro con il colore del macro e i grammi presi/obiettivo. */
function MacroTrack({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  // Etichetta e numeri centrati sulla barra, non allineati a sinistra.
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
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

/**
 * Elemento in movimento: `group` è la lista che stai riordinando (l'id del pasto
 * per le righe, MEALS per le card), `ids` l'ordine di anteprima, `dy` il sollevamento.
 */
interface Drag { group: string; activeId: string; ids: string[]; dy: number }
const MEALS = '#meals'

/** Millisecondi di pressione prima che la riga si stacchi: sotto, resta scroll e swipe. */
const HOLD_MS = 450

/**
 * Riga alimento: tap per aprire la scheda, swipe a sinistra per eliminare,
 * pressione prolungata per sollevarla e spostarla dentro al pasto.
 */
function EntryRow({ e, selectMode, selected, onToggle, onOpen, onDelete, onPress, lifted, offsetY, rs }: {
  e: DiaryEntry
  selectMode: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
  onPress?: (ev: React.PointerEvent<HTMLDivElement>) => void
  lifted?: boolean
  offsetY?: number
  /** Modalita' coach: la spunta dice "mangiato davvero", ed e' l'unica cosa che va a lui. */
  rs?: { spuntata: boolean; dalPiano: boolean; sostituita: boolean; onSpunta: () => void }
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const moved = useRef(false)

  // Riga-ricetta: filetto oro a sinistra e il libro davanti al nome. Si distingue
  // da un alimento a colpo d'occhio, perché si comporta in modo diverso al tocco.
  const isRecipe = !!e.log.recipeId
  const quantita = isRecipe
    ? e.log.portions != null
      ? `${String(e.log.portions).replace('.', ',')} ${e.log.portions === 1 ? 'porzione' : 'porzioni'}`
      : `${e.log.grams} g`
    : `${e.log.grams} g`

  return (
    <div data-drag-id={e.log.id}
      style={{ position: 'relative', overflow: lifted ? 'visible' : 'hidden', borderTop: '1px solid var(--line)', zIndex: lifted ? 5 : undefined }}>
      {/* Sfondo rosso che si scopre scorrendo */}
      <div style={{ position: 'absolute', inset: 0, background: '#e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 16, color: '#fff', fontSize: 18 }}>🗑</div>
      <div
        onPointerDown={onPress}
        onTouchStart={(ev) => { if (selectMode || lifted) return; start.current = ev.touches[0].clientX; moved.current = false }}
        onTouchMove={(ev) => {
          if (start.current == null || lifted) return
          const d = ev.touches[0].clientX - start.current
          if (d < 0) { setDx(Math.max(d, -120)); moved.current = true }
        }}
        onTouchEnd={() => {
          if (dx < -70) { onDelete(); setDx(0); start.current = null; return }
          setDx(0); start.current = null
        }}
        onClick={() => { if (moved.current) { moved.current = false; return } selectMode ? onToggle() : onOpen() }}
        style={{
          position: 'relative', background: 'var(--surface)',
          // Sollevata: bordo oro e ombra. È il segnale che la riga si può spostare.
          transform: lifted ? `translateY(${offsetY ?? 0}px) scale(1.02)` : `translateX(${dx}px)`,
          transition: lifted ? 'none' : dx === 0 ? 'transform .2s' : 'none',
          border: lifted ? '1px solid var(--gold)' : '1px solid transparent',
          borderRadius: lifted ? 10 : 0,
          boxShadow: lifted ? '0 8px 22px rgba(0,0,0,.55)' : 'none',
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', cursor: 'pointer',
        }}>
        {selectMode && (
          <span style={{
            width: 22, height: 22, flex: 'none', borderRadius: 6,
            border: '1px solid ' + (selected ? 'var(--gold)' : 'var(--line)'),
            background: selected ? 'var(--gold)' : 'transparent', color: '#1a1400',
            display: 'grid', placeItems: 'center', fontSize: 13,
          }}>{selected ? '✓' : ''}</span>
        )}
        {rs && (
          <span onClick={(ev) => { ev.stopPropagation(); rs.onSpunta() }}
            style={{
              width: 22, height: 22, flex: 'none', borderRadius: '50%',
              border: '1.5px solid ' + (rs.spuntata ? 'var(--rs)' : 'var(--line)'),
              background: rs.spuntata ? 'var(--rs)' : 'transparent', color: '#fff',
              display: 'grid', placeItems: 'center', fontSize: 12,
            }}>{rs.spuntata ? '✓' : ''}</span>
        )}
        {isRecipe && <span style={{ flex: 'none', width: 2, alignSelf: 'stretch', background: 'var(--gold)', borderRadius: 2 }} />}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
            {isRecipe ? '📖 ' : ''}{e.food.name}
            {rs?.sostituita && <span style={{ color: 'var(--rs)', fontSize: 11 }}> · sostituito</span>}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            {e.food.brand ? `${e.food.brand} · ` : ''}{quantita}
          </span>
        </span>
        {/* Calorie e macro incolonnati a destra: i numeri stanno insieme, non sparsi. */}
        <span style={{ flex: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ display: 'block', color: 'var(--gold)' }}>{e.macros.kcal}</span>
          <span style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--carb)' }}>C: {e.macros.carbs}</span>,{' '}
            <span style={{ color: 'var(--prot)' }}>P: {e.macros.protein}</span>,{' '}
            <span style={{ color: 'var(--fat)' }}>G: {e.macros.fat}</span>
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
    <div className="row" style={{ padding: '7px 0 2px', borderTop: '1px solid var(--line)', marginTop: 5 }}>
      {cell(m.totals.carbs, 'Carbo', 'var(--carb)')}
      {cell(m.totals.protein, 'Proteine', 'var(--prot)')}
      {cell(m.totals.fat, 'Grassi', 'var(--fat)')}
      {cell(m.totals.kcal, 'kcal', 'var(--gold)')}
    </div>
  )
}

export function DietScreen() {
  const [date, setDate] = usePersistedState('diet-date', todayDiet())
  const [picking, setPicking] = useState<{ id: string; name: string } | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [showRecipes, setShowRecipes] = useState(false)
  const [showDays, setShowDays] = useState(false)
  const [showCal, setShowCal] = useState(false)
  const [editEntry, setEditEntry] = useState<DiaryEntry | null>(null)
  const [menuMeal, setMenuMeal] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<{ mealId: string; name: string } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // Dopo un trascinamento il dito che si stacca genera un click: non deve aprire la scheda.
  const skipClick = useRef(false)

  // I pasti di default si creano qui (scrittura), non dentro la query reattiva.
  useEffect(() => { ensureMeals(date) }, [date])

  const diary = useLiveQuery(() => computeDiary(date), [date])
  const dayTypes = useLiveQuery(listDayTypes, []) ?? []
  const nutri = useLiveQuery(() => getNutrition(date), [date])
  const user = useLiveQuery(getUser, [])
  const meas = useLiveQuery(listMeasurements, []) ?? []
  const phase = useLiveQuery(getCurrentPhase, [])

  const activeType = dayTypes.find((d) => d.key === nutri?.dayType)

  // Acqua e sale: quanto ne hai preso e quanto ne prevede la giornata scelta.
  // Il sale viene dal piano (le righe «Sale» dentro i pasti); l'acqua dal tuo
  // obiettivo nel Profilo, perche' nel piano del coach non c'e'.
  const acqua = nutri?.water ?? 0
  // L'acqua del coach vince sulla tua: 5,5 L al giorno, ON e OFF uguale.
  const obiettivoAcqua = (activeType ? acquaDelPiano(activeType.name) : null) ?? user?.waterTarget ?? null
  const acquaOk = obiettivoAcqua != null && acqua >= obiettivoAcqua
  const sale = useLiveQuery(() => saleDelDiario(date), [date]) ?? 0
  const salePiano = useLiveQuery(
    () => (activeType ? saleDelPiano(activeType.name) : Promise.resolve(null)),
    [activeType?.name],
  )
  const obiettivoSale = salePiano ?? user?.saltTarget ?? null
  const saleOk = obiettivoSale != null && sale >= obiettivoSale
  const weight = meas.length ? meas[meas.length - 1].weight : 0
  const suggested = weight && user?.heightCm && user?.birthYear
    ? computeTargets({
      weightKg: weight, heightCm: user.heightCm,
      age: new Date().getFullYear() - user.birthYear,
      sex: user.sex ?? 'm', weeklySessions: user.weeklyTarget ?? 4,
      phase: phase?.phase ?? null,
      activityLevel: user.activityLevel, formula: user.bmrFormula,
      bodyFatPct: meas[meas.length - 1]?.bodyFat,
    })
    : null
  const t = activeType && activeType.targets.kcal > 0 ? activeType.targets : suggested
  const totals = diary?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const righeDelGiorno = (diary?.meals ?? []).flatMap((m) => m.entries)
  const statoRs = useLiveQuery(() => statoDieta(date), [date])
  // Cosa aveva prescritto il coach su ogni riga: quella scritta sulla riga, o
  // quella riconosciuta confrontandola con la giornata tipo.
  const pianoDi = new Map((statoRs?.righe ?? []).filter((r) => r.piano).map((r) => [r.log.id, r.piano!]))
  const kcalPct = t && t.kcal > 0 ? Math.min(100, (totals.kcal / t.kcal) * 100) : 0

  /**
   * La riga compatta compare quando il riepilogo esce dallo schermo.
   *
   * Si ascolta lo scorrimento IN CATTURA e si misura dove sta la card. Con
   * IntersectionObserver legato alla finestra non funzionava: nell'app a
   * scorrere non e' la finestra ma un contenitore interno, e per la finestra
   * non si muoveva niente — la riga non compariva mai. In cattura l'evento
   * arriva da qualunque contenitore, senza doverlo sapere.
   */
  const ancora = useRef<HTMLDivElement>(null)
  const [fuori, setFuori] = useState(false)
  useEffect(() => {
    // Misura diretta, senza requestAnimationFrame: con l'app in secondo piano o
    // lo schermo spento il fotogramma non arriva e la riga resterebbe indietro.
    // Una misura ogni 100 ms basta e avanza.
    let ultima = 0
    let coda: number | undefined
    const guarda = () => {
      const el = ancora.current
      if (!el) return
      // Un filo sopra il bordo: cosi' la riga non lampeggia quando la card sta
      // esattamente al limite.
      setFuori(el.getBoundingClientRect().top < -8)
    }
    /**
     * Al massimo una misura ogni 100 ms, ma l'ULTIMA non si perde.
     *
     * Prima gli eventi dentro la finestra di attesa venivano buttati via e
     * basta: se lo scorrimento finiva li' dentro — ed e' quello che succede
     * quando torni in cima con una scivolata — l'ultima misura utile non veniva
     * mai fatta, e la riga restava appesa in alto finche' non muovevi ancora il
     * dito. Adesso quella misura viene solo rimandata a fine finestra.
     */
    const suScroll = () => {
      const ora = Date.now()
      const manca = 100 - (ora - ultima)
      if (manca > 0) {
        if (coda == null) coda = window.setTimeout(() => { coda = undefined; ultima = Date.now(); guarda() }, manca)
        return
      }
      ultima = ora
      guarda()
    }
    guarda()
    window.addEventListener('scroll', suScroll, { capture: true, passive: true })
    window.addEventListener('resize', suScroll)
    return () => {
      if (coda != null) clearTimeout(coda)
      window.removeEventListener('scroll', suScroll, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', suScroll)
    }
  }, [])

  // Uscendo dalla modalità selezione azzero le spunte.
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  if (showTargets) return <DietTargets onBack={() => setShowTargets(false)} suggested={suggested} />
  if (showRecipes) return <RecipesScreen onBack={() => setShowRecipes(false)} />
  if (showDays) return <DayTemplates date={date} onClose={() => setShowDays(false)} />

  /**
   * Pressione prolungata → la riga si stacca e segue il dito.
   * Se il dito si muove prima dello scatto la presa si annulla: lo scroll della
   * pagina e lo swipe-elimina continuano a funzionare come prima.
   */
  function pressToDrag(group: string, id: string, onDrop: (ids: string[]) => void) {
    return (ev: React.PointerEvent<HTMLElement>) => {
      if (selectMode) return
      // Una riga dentro una card muove la riga, non la card: il gesto si ferma qui.
      ev.stopPropagation()
      const item = (ev.target as HTMLElement).closest('[data-drag-id]') as HTMLElement | null
      if (!item || item.dataset.dragId !== id) return
      const pointerId = ev.pointerId
      const startX = ev.clientX, startY = ev.clientY
      let active = false
      let timer: number | undefined
      // Posizioni reali misurate dal DOM all'attivazione: niente altezze indovinate.
      const st = { ids: [] as string[], from: 0, tops: [] as number[], heights: [] as number[] }

      // Mentre trascini la pagina non deve scorrere: serve un listener non passivo.
      const blockScroll = (te: TouchEvent) => { if (active) te.preventDefault() }

      const stop = () => {
        window.clearTimeout(timer)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('touchmove', blockScroll)
      }

      const move = (mv: PointerEvent) => {
        if (!active) {
          // Movimento prima dello scatto: non è una pressione, è uno scroll o uno swipe.
          if (Math.abs(mv.clientY - startY) > 8 || Math.abs(mv.clientX - startX) > 8) window.clearTimeout(timer)
          return
        }
        const dy = mv.clientY - startY
        const center = st.tops[st.from] + dy + st.heights[st.from] / 2
        // Quante caselle hanno il centro sopra al dito: quella è la posizione d'arrivo.
        let to = 0
        for (let i = 0; i < st.tops.length; i++) if (st.tops[i] + st.heights[i] / 2 < center) to = i
        to = Math.max(0, Math.min(st.tops.length - 1, to))
        const ids = [...st.ids]
        ids.splice(to, 0, ids.splice(st.from, 1)[0])
        last = ids
        flushSync(() => setDrag({ group, activeId: id, ids, dy: dy - (st.tops[to] - st.tops[st.from]) }))
      }
      let last: string[] = []

      const up = () => {
        stop()
        if (active && last.length) {
          skipClick.current = true
          onDrop(last)
        }
        setDrag(null)
      }

      timer = window.setTimeout(() => {
        const container = item.parentElement
        if (!container) return
        const els = ([...container.children] as HTMLElement[]).filter((c) => c.dataset && c.dataset.dragId)
        if (els.length < 2) return
        st.ids = els.map((x) => x.dataset.dragId!)
        st.from = st.ids.indexOf(id)
        const rects = els.map((x) => x.getBoundingClientRect())
        st.tops = rects.map((r) => r.top)
        st.heights = rects.map((r) => r.height)
        last = st.ids
        active = true
        try { item.setPointerCapture(pointerId) } catch { /* mouse senza capture: pazienza */ }
        navigator.vibrate?.(20)
        flushSync(() => setDrag({ group, activeId: id, ids: st.ids, dy: 0 }))
      }, HOLD_MS)

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('touchmove', blockScroll, { passive: false })
    }
  }

  /** Rimette una lista nell'ordine di anteprima mentre la stai trascinando. */
  function inDragOrder<T>(group: string, items: T[], idOf: (x: T) => string): T[] {
    if (drag?.group !== group) return items
    const byId = new Map(items.map((x) => [idOf(x), x]))
    const out = drag.ids.map((id) => byId.get(id)).filter((x): x is T => x !== undefined)
    return out.length === items.length ? out : items
  }

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
    <div className="col" style={{ gap: 8 }}>
      {/* Ricette a sinistra, data al centro, obiettivi a destra: la data resta
          centrata perche i due lati pesano uguale.
          I lati non si allargano e non si stringono — sono bottoni, e un bottone
          schiacciato non si preme piu'. Lo spazio che avanza va alla data, che
          e' l'unica cosa qui dentro che puo' accorciarsi: cosi' la testata sta
          dentro qualsiasi schermo senza spingere niente fuori. */}
      <div className="row" style={{ alignItems: 'center', gap: 4 }}>
        <div className="row" style={{ flex: 'none', gap: 4 }}>
          <button className="chip" style={{ padding: '6px 9px', fontSize: 16 }} aria-label="Ricette"
            onClick={() => setShowRecipes(true)}>📖</button>
          <button className="chip" style={{ padding: '6px 9px', fontSize: 16 }} aria-label="Giornate tipo"
            onClick={() => setShowDays(true)}>🗓</button>
        </div>
        <div className="row" style={{ gap: 2, alignItems: 'center', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <button className="ghost" style={{ padding: '6px 7px', flex: 'none' }} onClick={() => setDate((d) => shift(d, -1))}>‹</button>
          <button className="chip" onClick={() => setShowCal(true)}
            style={{ fontSize: 15, padding: '7px 9px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📅 {labelFor(date)}
          </button>
          <button className="ghost" style={{ padding: '6px 7px', flex: 'none' }} onClick={() => setDate((d) => shift(d, 1))}>›</button>
        </div>
        <div className="row" style={{ flex: 'none', justifyContent: 'flex-end', gap: 4 }}>
          {/* Svuota la giornata. Chiede conferma e resta annullabile: cancellare
              venti righe per sbaglio e non poter tornare indietro sarebbe grave. */}
          <button className="chip" style={{ padding: '6px 9px', fontSize: 16 }} aria-label="Svuota giornata"
            disabled={righeDelGiorno.length === 0}
            onClick={async () => {
              const n = righeDelGiorno.length
              if (!confirm(`Svuotare la giornata? Vengono tolte tutte e ${n} le righe. I pasti restano.`)) return
              const ids = righeDelGiorno.map((r) => r.log.id)
              const tolte = await deleteFoodLogs(ids)
              pushUndo(`Giornata svuotata · ${n} righe`, () => restoreFoodLogs(tolte))
            }}>🧹</button>
          <button className="chip" style={{ padding: '6px 9px', fontSize: 16 }} aria-label="Obiettivi"
            onClick={() => setShowTargets(true)}>⚙</button>
        </div>
      </div>

      {/* Tipo giornata: la tua, quella del coach, e quale tocca oggi. Tre
          riquadri bassi su una riga sola: l'etichetta sta dentro. */}
      <TendineGiornata dayTypes={dayTypes} scelta={nutri?.dayType ?? null}
        onScegli={(key) => upsertNutrition(date, { dayType: key as never })}
        terzo={<GiornataConsigliata date={date} />} />

      {/* Quanto del piano hai onorato, e quanto ci sei andato vicino. Solo se la
          giornata segue il coach: senza piano, non c'e' niente da misurare. */}
      <BarraRs date={date} onTuttoSeguito={(ids) => spuntaTutte(ids, true)} />

      {/* Riepilogo macro.
          Scorrendo, la card esce dallo schermo e i totali del giorno — l'unica
          cosa che guardi mentre aggiungi cibo — sparivano con lei. Ora al suo
          posto resta in alto una riga sola con gli stessi numeri. */}
      <div ref={ancora} />

      {/* La riga: anello, calorie, i tre macro col loro obiettivo, e sotto la
          barra delle calorie. Il «restano» non c'e': il confronto col target e'
          gia' scritto accanto a ogni numero. */}
      {/* Nel portale su document.body, come le modali: la schermata sta dentro
          un contenitore con una trasformazione, e li' dentro «position: fixed»
          non si ancora allo schermo ma a quel contenitore — la riga finiva
          disegnata in cima al documento, fuori da quello che vedi. */}
      {fuori && createPortal(
        <div style={{
          position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', zIndex: 60,
          padding: '6px 12px 0', background: 'var(--bg)',
        }}>
          <div className="card" style={{
            margin: 0, padding: '8px 10px', background: '#101010',
            boxShadow: '0 6px 18px rgba(0,0,0,.55)',
          }}>
            {/* Sette cose in fila su un telefono stretto: coi numeri veri —
                2593, C 289/289 — la somma superava la card, e da quando c'e'
                anche il bicchiere usciva dal bordo.
                Niente numeri tolti: acqua e macro stanno insieme in un blocco
                solo, e se la larghezza non basta e' quel blocco intero ad
                andare a capo — non un pezzo qualsiasi a sbordare. */}
            <div className="row" style={{ gap: 4, alignItems: 'center', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
              <MacroDonut m={totals} size={24} />
              {/* Le calorie senza il loro obiettivo: quanto manca lo dice gia'
                  la barra qui sotto, e sono i macro ad avere bisogno dei numeri
                  — il loro obiettivo non e' scritto da nessun'altra parte. */}
              <span style={{ flex: 'none' }}>
                <strong style={{ color: 'var(--gold)', fontSize: 15 }}>{totals.kcal}</strong>
                <span className="muted" style={{ fontSize: 9.5 }}> kcal</span>
              </span>
              <span className="row" style={{ gap: 4, alignItems: 'center', marginLeft: 'auto', flex: 'none' }}>
                <Bicchiere date={date} acqua={nutri?.water ?? 0} compatto />
                {([
                  ['C', totals.carbs, t?.carbs, 'var(--carb)'],
                  ['P', totals.protein, t?.protein, 'var(--prot)'],
                  ['G', totals.fat, t?.fat, 'var(--fat)'],
                ] as const).map(([et, v, tg, col]) => (
                  <span key={et} style={{ fontSize: 11.5, color: col, flex: 'none', whiteSpace: 'nowrap' }}>
                    {et} {Math.round(v)}<span className="muted" style={{ fontSize: 9.5 }}>/{tg ? Math.round(tg) : '—'}</span>
                  </span>
                ))}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${kcalPct}%`, background: 'var(--gold)', borderRadius: 999 }} />
            </div>
          </div>
        </div>,
        document.body,
      )}
      <div className="card" style={{ padding: '7px 12px 8px', marginBottom: 0 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          {/* Anello: ripartizione calorica dei macro, letta a colpo d'occhio dai
              soli colori — per quello non serve grande, e il posto che lascia
              libero e' schermo guadagnato per i pasti. */}
          <MacroDonut m={totals} size={52} />
          <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            <MacroTrack label="Carboidrati" value={totals.carbs} target={t?.carbs ?? 0} color="var(--carb)" />
            <MacroTrack label="Proteine" value={totals.protein} target={t?.protein ?? 0} color="var(--prot)" />
            <MacroTrack label="Grassi" value={totals.fat} target={t?.fat ?? 0} color="var(--fat)" />
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${kcalPct}%`, background: 'var(--gold)', borderRadius: 999, transition: 'width .3s' }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, marginTop: 3 }}>
          <strong style={{ color: 'var(--gold)' }}>{totals.kcal}</strong>
          <span className="muted"> / {t?.kcal ?? '—'} kcal{t ? ` · restano ${Math.max(0, t.kcal - totals.kcal)}` : ''}</span>
        </div>
        {/*
          Acqua e sale accanto ai macro.
          Il sale il coach lo prescrive riga per riga dentro i pasti: qui c'e' il
          totale della giornata scelta, contro quello che hai davvero spuntato.
          L'acqua nel suo piano non c'e', quindi il bersaglio e' il tuo (Profilo).
        */}
        <div className="row" style={{ gap: 14, justifyContent: 'center', marginTop: 4, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <span>
            💧 <strong style={{ color: acquaOk ? 'var(--good)' : 'var(--gold)' }}>{String(acqua).replace('.', ',')}</strong>
            <span className="muted"> / {obiettivoAcqua ? `${String(obiettivoAcqua).replace('.', ',')} L` : '— L'}</span>
          </span>
          <span>
            🧂 <strong style={{ color: saleOk ? 'var(--good)' : 'var(--gold)' }}>{String(sale).replace('.', ',')}</strong>
            <span className="muted"> / {obiettivoSale ? `${String(obiettivoSale).replace('.', ',')} g` : '— g'}</span>
          </span>
        </div>
        {!t && <p className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>Imposta gli obiettivi con ⚙ qui sopra.</p>}
      </div>

      {/* Barra selezione multipla */}
      {selectMode && (
        <div className="card" style={{ borderColor: 'var(--gold)', padding: '10px 12px' }}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <span className="small">
              {selected.size === 0 ? 'Tocca le righe da scegliere' : `${selected.size} selezionate`}
            </span>
            <button className="chip" onClick={() => setSelectMode(false)}>Fine</button>
          </div>

          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <button className="chip" onClick={() => {
              const tutte = (diary?.meals ?? []).flatMap((m) => m.entries.map((e) => e.log.id))
              setSelected(selected.size === tutte.length ? new Set() : new Set(tutte))
            }}>
              {(() => {
                const tutte = (diary?.meals ?? []).flatMap((m) => m.entries.map((e) => e.log.id))
                return selected.size === tutte.length && tutte.length > 0 ? 'Nessuna' : 'Tutte'
              })()}
            </button>
            <button className="chip" disabled={!selected.size} onClick={async () => {
              const ids = await duplicateLogs([...selected])
              setSelected(new Set())
              if (ids.length) pushUndo(`${ids.length} righe duplicate`, async () => { await deleteFoodLogs(ids) })
            }}>⧉ Duplica</button>
            <button className="chip" style={{ color: '#e57373' }} disabled={!selected.size}
              onClick={() => removeEntries([...selected])}>🗑 Elimina</button>
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

      {/* Pasti — anche le card si prendono con una pressione prolungata. */}
      {inDragOrder(MEALS, diary?.meals ?? [], (m) => m.meal.id).map((m) => {
        const cardLifted = drag?.group === MEALS && drag.activeId === m.meal.id
        return (
        <div className="card" key={m.meal.id} data-drag-id={m.meal.id}
          onPointerDown={pressToDrag(MEALS, m.meal.id, (ids) => reorderMeals(ids))}
          style={{
            padding: '11px 12px', marginBottom: 0,
            transform: cardLifted ? `translateY(${drag!.dy}px) scale(1.02)` : undefined,
            borderColor: cardLifted ? 'var(--gold)' : undefined,
            boxShadow: cardLifted ? '0 10px 28px rgba(0,0,0,.6)' : undefined,
            position: 'relative', zIndex: cardLifted ? 6 : undefined,
          }}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <span className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
              {m.entries.length > 0 && <MacroDonut m={m.totals} size={34} />}
              <strong style={{ fontSize: 15 }}>{m.meal.name}</strong>
            </span>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="muted small">{m.totals.kcal} kcal</span>
              <button className="ghost small" style={{ padding: '4px 10px', flex: 'none' }} onClick={() => setMenuMeal(menuMeal === m.meal.id ? null : m.meal.id)}>⋮</button>
            </div>
          </div>

          {/* Menù del pasto */}
          {menuMeal === m.meal.id && (
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <button className="chip" onClick={async () => { const n = prompt('Nome del pasto', m.meal.name)?.trim(); if (n) await renameMeal(m.meal.id, n); setMenuMeal(null) }}>✎ Rinomina</button>
              <button className="chip" onClick={async () => { await duplicateMeal(m.meal.id); setMenuMeal(null) }}>⧉ Duplica</button>
              {/* Il pasto copiato finisce anche negli appunti su disco: da li'
                  lo puoi incollare dentro una giornata tipo, che e' un'altra
                  schermata e non vede lo stato di questa. */}
              <button className="chip" onClick={() => {
                setClipboard({ mealId: m.meal.id, name: m.meal.name })
                copiaPasto({ mealId: m.meal.id, name: m.meal.name })
                setMenuMeal(null)
              }}>📋 Copia</button>
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
              {/* Erede dei "pasti salvati": il pasto diventa una ricetta riutilizzabile. */}
              <button className="chip" onClick={async () => {
                const n = prompt('Salva come ricetta — nome', m.meal.name)?.trim()
                setMenuMeal(null)
                if (!n) return
                const id = await saveMealAsRecipe(m.meal.id, n)
                if (!id) alert('Questo pasto non ha alimenti da salvare.')
              }}>💾 Salva come ricetta</button>
              <button className="chip" style={{ color: '#e57373' }} onClick={() => removeMeal(m.meal.id, m.meal.name)}>🗑 Elimina pasto</button>
            </div>
          )}

          {/* Righe — durante il trascinamento si disegnano nell'ordine di anteprima. */}
          {inDragOrder(m.meal.id, m.entries, (e) => e.log.id).map((e) => {
            const lifted = drag?.group === m.meal.id && drag.activeId === e.log.id
            return (
              <EntryRow key={e.log.id} e={e}
                selectMode={selectMode}
                selected={selected.has(e.log.id)}
                lifted={lifted}
                offsetY={lifted ? drag!.dy : 0}
                onPress={pressToDrag(m.meal.id, e.log.id, (ids) => reorderLogs(m.meal.id, ids))}
                onToggle={() => setSelected((s) => { const n = new Set(s); n.has(e.log.id) ? n.delete(e.log.id) : n.add(e.log.id); return n })}
                onOpen={() => { if (skipClick.current) { skipClick.current = false; return } setEditEntry(e) }}
                onDelete={() => removeEntries([e.log.id])}
                rs={statoRs?.attiva ? {
                  spuntata: !!e.log.rsDone,
                  dalPiano: !!e.log.rsPlanned,
                  sostituita: !!e.log.rsPlanned && !!e.log.rsPlanned.nome && e.log.rsPlanned.nome !== e.food.name,
                  onSpunta: () => spunta(e.log.id, !e.log.rsDone),
                } : undefined} />
            )
          })}

          {m.entries.length > 0 && <MealRecap m={m} />}

          <div className="row" style={{ gap: 0 }}>
            <button className="chip" style={{ marginTop: 8 }} onClick={() => setPicking({ id: m.meal.id, name: m.meal.name })}>
              ＋ Aggiungi cibo
            </button>
            <RipetiIeri mealId={m.meal.id} mealName={m.meal.name} date={date}
              onDone={(ids) => { if (ids.length) pushUndo(`${ids.length} righe da ieri`, async () => { await deleteFoodLogs(ids) }) }} />
            <Bicchiere date={date} acqua={nutri?.water ?? 0} />
          </div>
        </div>
        )
      })}

      <button className="ghost" onClick={async () => {
        const n = prompt('Nome del nuovo pasto', `Pasto ${(diary?.meals.length ?? 0) + 1}`)?.trim()
        if (n) await addMeal(date, n)
      }}>＋ Aggiungi pasto</button>


      {picking && (
        <FoodPicker date={date} mealId={picking.id} mealName={picking.name} onClose={() => setPicking(null)} />
      )}

      {/* Una riga-ricetta non si modifica come un alimento: ha la sua scheda. */}
      {editEntry && (editEntry.log.recipeId
        ? <RecipeEntrySheet entry={editEntry} piano={pianoDi.get(editEntry.log.id)} onClose={() => setEditEntry(null)}
            onDelete={async () => { const e = editEntry; setEditEntry(null); await removeEntries([e.log.id]) }} />
        : <EditEntrySheet entry={editEntry} piano={pianoDi.get(editEntry.log.id)} onClose={() => setEditEntry(null)}
            onDelete={async () => { const e = editEntry; setEditEntry(null); await removeEntries([e.log.id]) }} />
      )}

      {showCal && (
        <DayCalendar date={date} onPick={(d) => { setDate(d); setShowCal(false) }} onClose={() => setShowCal(false)} />
      )}

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
function EditEntrySheet({ entry, piano, onClose, onDelete }: {
  entry: DiaryEntry
  /** cosa aveva prescritto il coach su questa riga, se e' una riga del piano */
  piano?: { nome: string; g: number }
  onClose: () => void; onDelete: () => void
}) {
  const [sostituendo, setSostituendo] = useState(false)
  // La pagina sotto non scorre finché questa è aperta. Il conto è unico per
  // tutte le finestre: da qui se ne apre un'altra dentro (scegli alimento), e
  // chi si chiude per primo non deve riattivare lo scorrimento all'altra.
  useBloccoScroll()
  // Portal su body: gli antenati animati hanno `transform`, che intrappolerebbe
  // un position:fixed annidato facendolo comparire nel posto sbagliato.
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

        {sostituendo && (
          <FoodPicker date={entry.log.date} mealId={entry.log.mealId} mealName="sostituzione"
            onClose={() => setSostituendo(false)}
            sostituisciLog={{
              id: entry.log.id,
              ...(piano ? { piano } : {}),
              onFatto: () => { setSostituendo(false); onClose() },
            }} />
        )}
        {/* Il tasto sta sotto il nome e la riga «per 100 g · X kcal»: sopra
            copriva la cosa che sei venuto a guardare.
            Sulla riga del piano non e' "cancella e riscrivi": la voce resta
            onorata, e al coach vanno i macro di quello che hai mangiato davvero. */}
        <FoodSheet food={entry.food} grams={entry.log.grams} mode="edit"
          onConfirm={async (g) => { await updateFoodLog(entry.log.id, { grams: g }); onClose() }}
          onDeleteLog={onDelete}
          onBack={onClose}
          sottoIlNome={piano ? (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="small" style={{ color: 'var(--rs)' }}>
                {piano.nome && piano.nome !== entry.food.name
                  ? <>al posto di <strong>{piano.nome}</strong> · {piano.g} g</>
                  : 'riga del piano del coach'}
              </span>
              <button className="chip" style={{ borderColor: 'var(--rs)', color: 'var(--rs)' }}
                onClick={() => setSostituendo(true)}>🦠 Sostituisci</button>
            </div>
          ) : (
            <button className="chip" onClick={() => setSostituendo(true)}>⇄ Sostituisci alimento</button>
          )} />
      </div>
    </div>,
    document.body,
  )
}

export { macrosFor }

/**
 * "Ripeti ieri": la colazione è quasi sempre la stessa, e riscriverla ogni
 * mattina è il lavoro più inutile dell'app. Compare solo se ieri quel pasto
 * aveva davvero qualcosa dentro.
 */
/**
 * L'acqua bevuta.
 *
 * Registrarla come un alimento e' una seccatura che nessuno fa, e il campo del
 * coach resta vuoto tutti i giorni. Qui si tocca una misura e basta: sono
 * quelle vere — il bicchiere che usi, la bottiglietta, la bottiglia da un litro
 * e mezzo — perche' «250 ml» a mente non se li converte nessuno.
 */
/**
 * Le icone dei recipienti, disegnate.
 *
 * Le emoji non hanno le forme che servono: il boccale di birra per un
 * bicchierone d'acqua e il flacone di lozione per una bottiglietta dicono la
 * cosa sbagliata. Qui ogni misura ha la sua sagoma, con le proporzioni giuste —
 * il bicchierone e' un bicchiere alto, la bottiglia ha il collo.
 */
function Vetro({ d, w = 16, h = 18 }: { d: React.ReactNode; w?: number; h?: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 24 28" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flex: 'none' }}>{d}</svg>
  )
}

// La misura si legge anche dalla dimensione: un mezzo litro e un due litri
// disegnati uguali non dicono niente, e la fila diventa tutta uguale.
/** Bicchiere: tronco di cono, tanto piu' pieno quanto piu' grande. */
const bicchiere = (pieno: number, alto = 18) => (
  <Vetro h={alto} d={<>
    <path d="M6.5 4h11l-1.4 19a1.6 1.6 0 0 1-1.6 1.4h-5a1.6 1.6 0 0 1-1.6-1.4L6.5 4z" />
    <path d={`M${7.1 + 0.5 * (1 - pieno)} ${24.4 - 20 * pieno}h${9.8 - 1 * (1 - pieno)}`} opacity=".55" />
  </>} />
)

/** Bicchierone: piu' alto e piu' dritto, non un boccale. */
const bicchierone = (
  <Vetro h={24} w={19} d={<>
    <path d="M7 2h10l-.9 22.2a1.5 1.5 0 0 1-1.5 1.4h-5.2a1.5 1.5 0 0 1-1.5-1.4L7 2z" />
    <path d="M7.6 8h8.8" opacity=".55" />
  </>} />
)

/** Bottiglietta e bottiglia: stessa sagoma, altezza diversa. */
const bottiglia = (alto: number) => (
  <Vetro h={alto} d={<>
    <path d="M10 2h4v3.2c0 1 .3 1.5 1 2.2 1.2 1.2 1.7 2.2 1.7 3.9v11.3a3 3 0 0 1-3 3h-3.4a3 3 0 0 1-3-3V11.3c0-1.7.5-2.7 1.7-3.9.7-.7 1-1.2 1-2.2V2z" />
    <path d="M8.3 14h7.4" opacity=".55" />
  </>} />
)

/** Tazzina e tazza: la stessa tazza, il te' piu' larga. */
const tazza = (larga: boolean) => (
  <Vetro h={16} d={<>
    <path d={`M4 8h${larga ? 13 : 10}v${larga ? 8 : 6}a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z`} />
    <path d={`M${larga ? 17 : 14} 10h1.6a2.6 2.6 0 0 1 0 5.2H${larga ? 17 : 14}`} />
    <path d="M20 24H3" opacity=".55" />
  </>} />
)

const MISURE: { icona: React.ReactNode; l: number }[] = [
  { icona: bicchiere(0.25, 14), l: 0.1 },
  { icona: bicchiere(0.4, 15.5), l: 0.15 },
  { icona: bicchiere(0.55, 17), l: 0.2 },
  { icona: bicchiere(0.75, 18.5), l: 0.25 },
  { icona: bicchiere(0.9, 20), l: 0.3 },
  { icona: bicchierone, l: 0.7 },
  { icona: bottiglia(17), l: 0.5 },
  { icona: bottiglia(21), l: 1 },
  { icona: bottiglia(24), l: 1.5 },
  { icona: bottiglia(27), l: 2 },
  { icona: tazza(false), l: 0.04 },
  { icona: tazza(true), l: 0.25 },
]

const litri = (n: number) => (n >= 1 ? `${String(n).replace('.', ',')} L` : `${Math.round(n * 1000)} ml`)

function Bicchiere({ date, acqua, compatto }: { date: string; acqua: number; compatto?: boolean }) {
  const [apri, setApri] = useState(false)
  const cambia = (delta: number) => {
    const n = Math.max(0, Math.round((acqua + delta) * 100) / 100)
    void upsertNutrition(date, { water: n })
  }

  return (
    <>
      {/* Nella riga compatta la «L» si toglie: accanto a una goccia, litri si
          capisce — e li' ogni carattere e' spazio tolto ai macro. */}
      <button className="chip" aria-label="Acqua bevuta"
        style={compatto ? { padding: '3px 6px', fontSize: 11, flex: 'none' } : { marginTop: 8 }}
        onClick={() => setApri(true)}>
        💧{acqua > 0 ? ` ${String(acqua).replace('.', ',')}${compatto ? '' : ' L'}` : ''}
      </button>

      {apri && createPortal(
        <div onClick={() => setApri(false)}
          style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 100%)', background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 16, padding: 16, margin: '0 8px',
            }}>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <strong>Acqua di oggi</strong>
              <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }}
                onClick={() => setApri(false)}>✕</button>
            </div>

            <div className="row spread" style={{ alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 30, color: 'var(--gold)' }}>
                {String(acqua).replace('.', ',')} L
              </span>
              <span className="row" style={{ gap: 6 }}>
                <button className="chip" disabled={acqua <= 0} onClick={() => cambia(-0.25)}>− 250 ml</button>
                <button className="chip" style={{ color: '#e57373' }} disabled={acqua <= 0}
                  onClick={() => upsertNutrition(date, { water: 0 })}>Azzera</button>
              </span>
            </div>

            <p className="muted small" style={{ margin: '10px 0 6px' }}>Tocca quello che hai bevuto.</p>
            <div className="row wrap" style={{ gap: 6 }}>
              {MISURE.map((m, i) => (
                <button key={i} className="chip"
                  style={{ padding: '8px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => cambia(m.l)}>
                  {/* L'icona prende l'oro: dentro il chip erediterebbe il grigio
                      del testo e sembrerebbe spenta. */}
                  <span style={{ color: 'var(--gold)', display: 'inline-flex' }}>{m.icona}</span>
                  <span style={{ color: 'var(--text)' }}>{litri(m.l)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function RipetiIeri({ mealId, mealName, date, onDone }: {
  mealId: string; mealName: string; date: string; onDone: (ids: string[]) => void
}) {
  const ieri = shiftDate(date, -1)
  const quante = useLiveQuery(() => mealCountOn(mealName, ieri), [mealName, ieri])
  if (!quante) return null
  return (
    <button className="chip" style={{ marginTop: 8, marginLeft: 6 }}
      onClick={async () => onDone(await repeatMealFrom(mealId, ieri))}>
      ⟲ Ripeti ieri ({quante})
    </button>
  )
}

/**
 * Le giornate tipo in due tendine: le tue e quelle del coach.
 *
 * Non e' estetica: sono due mondi diversi e sceglierne una sbagliata falsa
 * gli obiettivi di tutto il giorno. Tenendole separate sai sempre da quale
 * elenco stai pescando, e quella del coach si riconosce dal rosso.
 */
function TendineGiornata({ dayTypes, scelta, onScegli, terzo }: {
  dayTypes: DayType[]; scelta: string | null; onScegli: (key: string | null) => void
  /** il terzo riquadro: quale giornata tocca oggi */
  terzo?: React.ReactNode
}) {
  const rs = dayTypes.filter((d) => d.name.startsWith('🦠'))
  const mie = dayTypes.filter((d) => !d.name.startsWith('🦠'))
  const attiva = dayTypes.find((d) => d.key === scelta) ?? null

  /**
   * L'etichetta sta DENTRO il riquadro, non su una riga sua.
   *
   * Prima le due scritte «LE TUE» e «RS · DAL COACH» si prendevano una riga
   * intera solo per dire cosa fossero le tendine sotto, e insieme al resto
   * spingevano i pasti a seicento pixel dall'alto. Cosi' si capisce uguale e
   * non costa niente.
   */
  const tendina = (voci: DayType[], etichetta: string, colore: string, quanto: number) => {
    if (!voci.length) return null
    const sceltaQui = voci.some((v) => v.key === scelta)
    return (
      <label className="card" style={{
        flex: quanto, minWidth: 0, margin: 0, padding: '3px 8px 4px', position: 'relative',
        borderColor: sceltaQui ? colore : 'var(--line)',
      }}>
        <span className="muted" style={{ fontSize: 9, letterSpacing: '.06em', display: 'block', lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{etichetta}</span>
        <select value={sceltaQui ? scelta! : ''} onChange={(e) => onScegli(e.target.value || null)}
          style={{
            padding: 0, border: 0, background: 'transparent', width: '100%', height: 20,
            fontSize: 12.5, fontWeight: sceltaQui ? 700 : 400,
            color: sceltaQui ? colore : 'var(--muted)',
          }}>
          <option value="">—</option>
          {voci.map((d) => <option key={d.id} value={d.key}>{d.name}</option>)}
        </select>
      </label>
    )
  }

  // Gli obiettivi della giornata non si scrivono qui: sono gia' scritti piu'
  // grandi nella card dei macro, due dita piu' sotto.
  void attiva

  return (
    <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
      {/* Larghezze diverse apposta: "LE TUE" mostra quasi sempre un trattino,
          il terzo riquadro deve ospitare due tasti che si devono poter centrare
          col pollice. */}
      {tendina(mie, 'LE TUE', 'var(--gold)', 0.8)}
      {tendina(rs, 'DAL COACH', 'var(--rs)', 1.15)}
      {terzo}
    </div>
  )
}

/**
 * La barra del coach: quanto del piano hai onorato e quanto ci sei andato vicino.
 *
 * Due numeri diversi apposta. L'aderenza dice se hai seguito il piano — e una
 * sostituzione conta come seguito. La precisione dice quanto i macro tornano:
 * patate al posto del riso non ti rendono meno preciso se i numeri combaciano.
 */
function BarraRs({ date, onTuttoSeguito }: { date: string; onTuttoSeguito: (ids: string[]) => void }) {
  const s = useLiveQuery(() => statoDieta(date), [date])
  if (!s?.attiva) return null

  /**
   * Un numero con la sua barretta.
   *
   * La barretta dice a colpo d'occhio quanto sei lontano: il numero da solo lo
   * devi leggere e confrontare a mente. E costa tre pixel, mentre i numeri
   * grandi con due righe di didascalia sotto ne costavano ottanta.
   */
  const numero = (v: number | null, etichetta: string, testo: string, quota: number) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etichetta}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rs)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{testo}</div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: 3, width: `${Math.max(0, Math.min(100, quota))}%`, background: v == null ? 'var(--line)' : 'var(--rs)' }} />
      </div>
    </div>
  )

  const daSpuntare = s.righe.filter((r) => !r.spuntata).map((r) => r.log.id)
  // Quanto delle kcal del piano hai coperto: e' il senso di quel numero, e la
  // barretta lo dice senza doverli dividere a mente.
  const quotaKcal = s.versoIlCoach.kcal > 0 ? (s.tuoi.kcal / s.versoIlCoach.kcal) * 100 : 0

  return (
    <div className="card" style={{ padding: '7px 10px', marginBottom: 0, borderColor: 'var(--rs)' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
        {numero(s.aderenza, `aderenza ${s.pianoOnorato}/${s.pianoTotale}`, s.aderenza == null ? '—' : `${s.aderenza}%`, s.aderenza ?? 0)}
        {numero(s.precisione, 'precisione', s.precisione == null ? '—' : `${s.precisione}%`, s.precisione ?? 0)}
        {numero(s.versoIlCoach.kcal, `al coach · tu ${Math.round(s.tuoi.kcal)}`, String(Math.round(s.versoIlCoach.kcal)), quotaKcal)}
        {daSpuntare.length > 0 && (
          <button className="chip" style={{ flex: 'none', padding: '5px 9px', fontSize: 12 }}
            aria-label={`Segna seguite tutte le ${daSpuntare.length} righe rimaste`}
            onClick={() => onTuttoSeguito(daSpuntare)}>
            ✓ {daSpuntare.length}
          </button>
        )}
      </div>
    </div>
  )
}

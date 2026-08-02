import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * Riordino a pressione prolungata: tieni premuto, l'elemento si stacca e segue
 * il dito. È la stessa logica delle righe della dieta, tirata fuori una volta
 * sola perché due implementazioni della stessa cosa divergono sempre.
 *
 * Gli elementi trascinabili si marcano con `data-drag-id` e devono essere
 * figli diretti dello stesso contenitore.
 */

export const HOLD_MS = 450

export interface DragState { group: string; activeId: string; ids: string[]; dy: number }

export function useHoldDrag(onDrop: (group: string, ids: string[]) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  // Staccando il dito parte un click: dopo un trascinamento non deve aprire niente.
  const skipClick = useRef(false)

  function press(group: string, id: string) {
    return (ev: React.PointerEvent<HTMLElement>) => {
      // Un elemento dentro un altro trascinabile muove sé stesso, non il contenitore.
      ev.stopPropagation()
      const item = (ev.target as HTMLElement).closest('[data-drag-id]') as HTMLElement | null
      if (!item || item.dataset.dragId !== id) return
      const pointerId = ev.pointerId
      const startX = ev.clientX, startY = ev.clientY
      let active = false
      let timer: number | undefined
      // Posizioni misurate dal DOM all'attivazione: niente altezze indovinate.
      const st = { ids: [] as string[], from: 0, tops: [] as number[], heights: [] as number[] }
      let last: string[] = []

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
          // Movimento prima dello scatto: è uno scroll, non una presa.
          if (Math.abs(mv.clientY - startY) > 8 || Math.abs(mv.clientX - startX) > 8) window.clearTimeout(timer)
          return
        }
        const dy = mv.clientY - startY
        const centro = st.tops[st.from] + dy + st.heights[st.from] / 2
        let to = 0
        for (let i = 0; i < st.tops.length; i++) if (st.tops[i] + st.heights[i] / 2 < centro) to = i
        to = Math.max(0, Math.min(st.tops.length - 1, to))
        const ids = [...st.ids]
        ids.splice(to, 0, ids.splice(st.from, 1)[0])
        last = ids
        // flushSync: il disegno non deve restare indietro rispetto al dito.
        flushSync(() => setDrag({ group, activeId: id, ids, dy: dy - (st.tops[to] - st.tops[st.from]) }))
      }

      const up = () => {
        stop()
        if (active && last.length) { skipClick.current = true; onDrop(group, last) }
        setDrag(null)
      }

      timer = window.setTimeout(() => {
        const cont = item.parentElement
        if (!cont) return
        const els = ([...cont.children] as HTMLElement[]).filter((c) => c.dataset && c.dataset.dragId)
        if (els.length < 2) return
        st.ids = els.map((x) => x.dataset.dragId!)
        st.from = st.ids.indexOf(id)
        const r = els.map((x) => x.getBoundingClientRect())
        st.tops = r.map((x) => x.top)
        st.heights = r.map((x) => x.height)
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

  /** Ordine di anteprima mentre trascini, ordine salvato altrimenti. */
  function inDragOrder<T>(group: string, items: T[], idOf: (x: T) => string): T[] {
    if (drag?.group !== group) return items
    const byId = new Map(items.map((x) => [idOf(x), x]))
    const out = drag.ids.map((id) => byId.get(id)).filter((x): x is T => x !== undefined)
    return out.length === items.length ? out : items
  }

  /**
   * Stile della card sollevata: contorno oro e ombra, il segnale che l'hai presa.
   *
   * Contorno e non `borderColor`: chi ci passa sopra scrive spesso il bordo con
   * l'abbreviazione (`borderBottom: '1px solid var(--line)'`), e al rilascio
   * React cancella il solo `borderColor` senza riscrivere l'abbreviazione — il
   * bordo restava senza colore e tornava bianco.
   */
  function liftStyle(group: string, id: string): React.CSSProperties {
    const on = drag?.group === group && drag.activeId === id
    return on
      ? {
        transform: `translateY(${drag!.dy}px) scale(1.02)`,
        outline: '1px solid var(--gold)', outlineOffset: 1,
        boxShadow: '0 10px 28px rgba(0,0,0,.6)',
        position: 'relative', zIndex: 6,
      }
      : { position: 'relative' }
  }

  return { drag, press, inDragOrder, liftStyle, skipClick }
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { loggedDates, listDayTypes, todayDiet } from '../db/diet'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'

/** Colore del pallino per tipo giornata: i tre di partenza hanno il loro, gli altri oro. */
const DOT: Record<string, string> = { on: 'var(--gold)', off: '#85B7EB', reload: 'var(--prot)' }

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function DayCalendar({ date, onPick, onClose }: {
  date: string; onPick: (d: string) => void; onClose: () => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(date + 'T00:00:00')
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const from = iso(cursor.y, cursor.m, 1)
  const last = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const to = iso(cursor.y, cursor.m, last)

  const logged = useLiveQuery(() => loggedDates(from, to), [from, to])
  const dayTypes = useLiveQuery(listDayTypes, []) ?? []
  // Tipo giornata per data: alimenta il colore del pallino.
  const nutri = useLiveQuery(
    () => db.nutrition.where('date').between(from, to, true, true).filter((n) => n.userId === LOCAL_USER_ID).toArray(),
    [from, to],
  ) ?? []
  const typeByDate = new Map(nutri.filter((n) => n.dayType).map((n) => [n.date, n.dayType as string]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  // Griglia da lunedì.
  const firstDow = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: last }, (_, i) => i + 1),
  ]
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
  const step = (d: number) => setCursor((c) => {
    const n = new Date(c.y, c.m + d, 1)
    return { y: n.getFullYear(), m: n.getMonth() }
  })

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(420px, 100%)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 14 }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <button className="ghost small" onClick={() => step(-1)}>‹</button>
          <strong>{MESI[cursor.m]} {cursor.y}</strong>
          <button className="ghost small" onClick={() => step(1)}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, textAlign: 'center' }}>
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => (
            <span key={i} className="muted" style={{ fontSize: 9 }}>{d}</span>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <span key={`e${i}`} />
            const day = iso(cursor.y, cursor.m, d)
            const isToday = day === todayDiet()
            const isSel = day === date
            const future = day > todayDiet()
            const has = logged?.has(day)
            const dt = typeByDate.get(day)
            const dotColor = dt ? (DOT[dt] ?? 'var(--gold)') : has ? 'var(--muted)' : null
            return (
              <button key={day} disabled={future} onClick={() => onPick(day)}
                style={{
                  padding: '7px 0', fontSize: 12, background: isSel ? 'var(--gold-bg)' : 'transparent',
                  border: isSel ? '1px solid var(--gold)' : '1px solid transparent',
                  borderRadius: 8, color: future ? 'var(--line)' : isSel ? 'var(--gold)' : isToday ? 'var(--text)' : 'var(--muted)',
                  fontWeight: isToday ? 700 : 400,
                }}>
                {d}
                <span style={{
                  display: 'block', width: 4, height: 4, borderRadius: 999, margin: '2px auto 0',
                  background: dotColor ?? 'transparent',
                }} />
              </button>
            )
          })}
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
          {dayTypes.map((t) => (
            <span key={t.id} className="muted" style={{ fontSize: 10 }}>
              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 999, background: DOT[t.key] ?? 'var(--gold)', marginRight: 4 }} />
              {t.name}
            </span>
          ))}
          <span className="muted" style={{ fontSize: 10 }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 999, background: 'var(--muted)', marginRight: 4 }} />
            solo cibo
          </span>
        </div>

        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Chiudi</button>
          <button className="primary" style={{ flex: 1 }} onClick={() => onPick(todayDiet())}>Oggi</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

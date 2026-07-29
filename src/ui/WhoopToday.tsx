import { useLiveQuery } from 'dexie-react-hooks'
import { whoopDay, whoopWorkoutsOf } from '../db/whoop'
import { todayLocal } from '../util/date'

const min = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))

/**
 * WHOOP di oggi in Home. Compare solo se c'è qualcosa da dire: senza dati
 * non lascio un riquadro vuoto a fare da promemoria.
 */
export function WhoopToday() {
  const oggi = todayLocal()
  const d = useLiveQuery(() => whoopDay(oggi), [oggi])
  const w = useLiveQuery(() => whoopWorkoutsOf(oggi), [oggi])

  const haNumeri = d && (d.recovery != null || d.sleepHours != null || d.strain != null)
  if (!haNumeri && !(w && w.length)) return null

  return (
    <div className="card" style={{ padding: '11px 12px' }}>
      <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        WHOOP oggi
      </div>

      {haNumeri && (
        <div className="row" style={{ textAlign: 'center' }}>
          {[
            { v: d!.recovery != null ? `${d!.recovery}%` : '—', l: 'recupero' },
            { v: d!.sleepHours != null ? `${d!.sleepHours}h` : '—', l: 'sonno' },
            { v: d!.strain != null ? `${d!.strain}` : '—', l: 'sforzo' },
            { v: d!.restingHr != null ? `${d!.restingHr}` : '—', l: 'FC riposo' },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
              <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
            </div>
          ))}
        </div>
      )}

      {w && w.length > 0 && (
        <div style={{ marginTop: haNumeri ? 10 : 0, borderTop: haNumeri ? '1px solid var(--line)' : undefined, paddingTop: haNumeri ? 8 : 0 }}>
          {w.map((x) => (
            <div key={x.id} className="row spread small" style={{ padding: '3px 0' }}>
              <span>{x.sport ?? 'Attività'}</span>
              <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {min(x.start, x.end)} min
                {x.strain != null ? ` · sforzo ${x.strain}` : ''}
                {x.avgHr != null ? ` · ${x.avgHr} bpm` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

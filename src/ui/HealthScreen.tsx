import { useLiveQuery } from 'dexie-react-hooks'
import { BodyScreen } from './BodyScreen'
import { HistoryScreen } from './HistoryScreen'
import { AnalyticsScreen } from './AnalyticsScreen'
import { HabitsScreen } from './HabitsScreen'
import { usePersistedState } from '../util/persist'
import { computeHome } from '../scores/dashboardScores'
import { ScoreRing } from './anim'
import { whoopDaysRecent } from '../db/whoop'
import { fmtOre } from '../util/format'
import type { WhoopDay } from '../db/schema'

type Sub = 'vitali' | 'body' | 'habits' | 'analytics' | 'history'

const TABS: { key: Sub; label: string }[] = [
  { key: 'vitali', label: 'Vitali' },
  { key: 'body', label: 'Corpo' },
  { key: 'habits', label: 'Abitudini' },
  { key: 'analytics', label: 'Analisi' },
  { key: 'history', label: 'Storico' },
]

/**
 * Salute: come stai andando, non come stai adesso. Qui vive tutto ciò che si
 * guarda nel tempo — la regola che tiene separata questa schermata da Oggi.
 */
export function HealthScreen({ onReopen }: { onReopen?: (id: string) => void }) {
  const [sub, setSub] = usePersistedState<Sub>('health-sub', 'vitali')

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map((t) => (
          <button key={t.key} className={sub === t.key ? 'chip on' : 'chip'} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>

      {sub === 'vitali' && <Vitali />}
      {sub === 'body' && <BodyScreen />}
      {sub === 'habits' && <HabitsScreen />}
      {sub === 'analytics' && <Analisi />}
      {sub === 'history' && <HistoryScreen onReopen={onReopen} />}
    </div>
  )
}

/** I quattro Score: erano in Home, ma sono andamenti — il loro posto è qui. */
function Analisi() {
  const home = useLiveQuery(computeHome, [])
  const SCORES = [
    { key: 'readiness', label: 'Readiness' },
    { key: 'workout', label: 'Workout' },
    { key: 'performance', label: 'Perf.' },
    { key: 'consistency', label: 'Constan.' },
  ] as const

  return (
    <>
      {home && (
        <div className="card">
          <div className="row" style={{ gap: 4 }}>
            {SCORES.map((s) => (
              <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <ScoreRing value={home[s.key].value} size={58} />
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <AnalyticsScreen />
    </>
  )
}

/**
 * Vitali: i numeri WHOOP giorno per giorno. L'andamento con i grafici arriva
 * col lavoro sullo storico — qui intanto c'è l'elenco, che è già leggibile.
 */
function Vitali() {
  const giorni = useLiveQuery(() => whoopDaysRecent(30), []) as WhoopDay[] | undefined

  if (!giorni) return <p className="muted">Carico…</p>
  if (!giorni.length) {
    return (
      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>
          Nessun dato WHOOP. Collega il tuo account dal Profilo, poi tocca Aggiorna.
        </p>
      </div>
    )
  }

  const media = (f: (d: WhoopDay) => number | undefined) => {
    const v = giorni.map(f).filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }

  return (
    <>
      <div className="card">
        <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Medie · ultimi {giorni.length} giorni
        </div>
        <div className="row" style={{ textAlign: 'center' }}>
          {[
            { v: media((d) => d.recovery), l: 'recupero', suf: '%' },
            { v: media((d) => d.hrv), l: 'HRV', suf: '' },
            { v: media((d) => d.restingHr), l: 'FC riposo', suf: '' },
            { v: media((d) => d.strain), l: 'sforzo', suf: '' },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {x.v != null ? `${x.v}${x.suf}` : '—'}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        {giorni.map((d) => (
          <div key={d.id} className="row spread small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="muted" style={{ flex: '0 0 auto' }}>{d.date.slice(5)}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              {d.recovery != null ? <span style={{ color: 'var(--gold)' }}>{d.recovery}%</span> : <span className="muted">—</span>}
              <span className="muted"> · {fmtOre(d.sleepHours)} · sforzo {d.strain ?? '—'}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

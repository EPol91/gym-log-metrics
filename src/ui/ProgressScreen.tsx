import { usePersistedState } from '../util/persist'
import { BodyScreen } from './BodyScreen'
import { HistoryScreen } from './HistoryScreen'
import { AnalyticsScreen } from './AnalyticsScreen'

type Sub = 'body' | 'history' | 'analytics'

/** Corpo · Storico · Analisi in un'unica voce: la barra in basso resta a 5. */
export function ProgressScreen({ onReopen }: { onReopen?: (id: string) => void }) {
  const [sub, setSub] = usePersistedState<Sub>('progress-sub', 'body')
  const TABS: { key: Sub; label: string }[] = [
    { key: 'body', label: 'Corpo' },
    { key: 'history', label: 'Storico' },
    { key: 'analytics', label: 'Analisi' },
  ]

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6 }}>
        {TABS.map((t) => (
          <button key={t.key} className={sub === t.key ? 'chip on' : 'chip'} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>
      {sub === 'body' && <BodyScreen />}
      {sub === 'history' && <HistoryScreen onReopen={onReopen} />}
      {sub === 'analytics' && <AnalyticsScreen />}
    </div>
  )
}

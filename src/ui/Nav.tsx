// 5 voci: Corpo, Storico e Analisi stanno dentro "Progressi" come schede.
export type Tab = 'home' | 'exercises' | 'diet' | 'progress' | 'profile'

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'exercises', label: 'Esercizi', icon: '❑' },
    { key: 'diet', label: 'Dieta', icon: '🍽' },
    { key: 'progress', label: 'Progressi', icon: '📈' },
    { key: 'profile', label: 'Profilo', icon: '☰' },
  ]
  return (
    <nav className="tabbar">
      {items.map((it) => (
        <button
          key={it.key}
          className={'tab' + (tab === it.key ? ' active' : '')}
          onClick={() => onChange(it.key)}
        >
          <span className="tab-icon">{it.icon}</span>
          <span className="tab-label">{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

import type { ReactNode } from 'react'

// Cinque voci. Il criterio: Oggi = adesso, Salute = andamento.
// Corpo, abitudini, storico e analisi stanno dentro Salute; la libreria
// esercizi dentro Allena; le ricette dentro Cibo.
export type Tab = 'today' | 'train' | 'food' | 'health' | 'profile'

// Icone disegnate, non emoji: stesso tratto per tutte e prendono il colore della
// voce (oro quando attiva). Le emoji restano colorate e non seguono lo stato.
const ico = (path: ReactNode) => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

const ICONS: Record<Tab, ReactNode> = {
  today: ico(<path d="M3 10.5l9-7 9 7V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />),
  train: ico(<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />),
  food: ico(<path d="M7 3v6.5a2 2 0 0 0 4 0V3M9 11.5V21M17.5 3c1.8 2 1.8 6.5 0 8.5V21" />),
  // Tracciato cardiaco: la salute che si misura nel tempo.
  health: ico(<path d="M3 12.5h4l2-5 3.5 10 2.5-6 1.5 3h4.5" />),
  profile: ico(<><circle cx="12" cy="8" r="3.6" /><path d="M4.6 20.5c.6-3.7 3.7-5.6 7.4-5.6s6.8 1.9 7.4 5.6" /></>),
}

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Oggi' },
    { key: 'train', label: 'Allena' },
    { key: 'food', label: 'Cibo' },
    { key: 'health', label: 'Salute' },
    { key: 'profile', label: 'Profilo' },
  ]
  return (
    <nav className="tabbar">
      {items.map((it) => (
        <button
          key={it.key}
          className={'tab' + (tab === it.key ? ' active' : '')}
          onClick={() => onChange(it.key)}
        >
          <span className="tab-icon">{ICONS[it.key]}</span>
          <span className="tab-label">{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

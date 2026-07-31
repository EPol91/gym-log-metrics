import type { ReactNode } from 'react'

// Cinque voci piu' 🦠RS. Il criterio: Oggi = adesso, Salute = andamento.
// Corpo, abitudini, storico e analisi stanno dentro Salute; la libreria
// esercizi dentro Allena; le ricette dentro Cibo.
//
// RS e' l'unica voce senza etichetta: e' il ponte verso il coach, non una
// sezione tua, e il virus si riconosce da solo.
export type Tab = 'today' | 'train' | 'food' | 'health' | 'rs' | 'profile'

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
  // Virus: corpo, otto spine e i nuclei. Disegnato come le altre, non emoji,
  // cosi' prende il colore della voce — e in RS quel colore e' il rosso del coach.
  rs: ico(<>
    <circle cx="12" cy="12" r="5.6" />
    <path d="M18 12h2.6M16.2 7.8l1.9-1.9M12 6V3.4M7.8 7.8L5.9 5.9M6 12H3.4M7.8 16.2l-1.9 1.9M12 18v2.6M16.2 16.2l1.9 1.9" />
    <circle cx="10.2" cy="10.6" r=".95" fill="currentColor" stroke="none" />
    <circle cx="13.6" cy="13.2" r=".95" fill="currentColor" stroke="none" />
    <circle cx="13.4" cy="9.8" r=".7" fill="currentColor" stroke="none" />
  </>),
  profile: ico(<><circle cx="12" cy="8" r="3.6" /><path d="M4.6 20.5c.6-3.7 3.7-5.6 7.4-5.6s6.8 1.9 7.4 5.6" /></>),
}

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Oggi' },
    { key: 'train', label: 'Allena' },
    { key: 'food', label: 'Cibo' },
    { key: 'health', label: 'Salute' },
    { key: 'rs', label: '' },
    { key: 'profile', label: 'Profilo' },
  ]
  return (
    <nav className="tabbar">
      {items.map((it) => (
        <button
          key={it.key}
          className={'tab' + (tab === it.key ? ' active' : '') + (it.key === 'rs' ? ' tab-rs' : '')}
          onClick={() => onChange(it.key)}
          aria-label={it.key === 'rs' ? 'RS' : undefined}
        >
          <span className="tab-icon">{ICONS[it.key]}</span>
          {it.label && <span className="tab-label">{it.label}</span>}
        </button>
      ))}
    </nav>
  )
}

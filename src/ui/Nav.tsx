import type { ReactNode } from 'react'

// 6 voci: Corpo, Storico e Analisi stanno dentro "Progressi" come schede.
export type Tab = 'home' | 'exercises' | 'diet' | 'habits' | 'progress' | 'profile'

// Icone disegnate, non emoji: stesso tratto per tutte e prendono il colore della voce
// (oro quando attiva). Le emoji restano colorate e non seguono lo stato.
const ico = (path: ReactNode) => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

const ICONS: Record<Tab, ReactNode> = {
  home: ico(<path d="M3 10.5l9-7 9 7V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />),
  exercises: ico(<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />),
  diet: ico(<path d="M7 3v6.5a2 2 0 0 0 4 0V3M9 11.5V21M17.5 3c1.8 2 1.8 6.5 0 8.5V21" />),
  // Abitudini: due impronte sfalsate, il passo ripetuto giorno dopo giorno.
  habits: ico(<>
    <path d="M6.4 12.6c-1.4 0-2.2-1-2.2-2.6 0-2 .5-3.9 1.2-5 .5-.8 1.2-1.2 1.9-1 .8.2 1.2 1 1.2 2.2 0 1.3-.3 3-.7 4.4-.3 1.2-.8 2-1.4 2z" />
    <path d="M6.1 15.1c.9 0 1.6.6 1.6 1.5s-.8 1.9-1.8 1.9-1.7-.5-1.7-1.4.8-2 1.9-2z" />
    <path d="M17.6 18.9c-1.4 0-2.2-1-2.2-2.6 0-2 .5-3.9 1.2-5 .5-.8 1.2-1.2 1.9-1 .8.2 1.2 1 1.2 2.2 0 1.3-.3 3-.7 4.4-.3 1.2-.8 2-1.4 2z" />
    <path d="M17.3 8.9c.9 0 1.6-.6 1.6-1.5s-.8-1.9-1.8-1.9-1.7.5-1.7 1.4.8 2 1.9 2z" />
  </>),
  progress: ico(<path d="M3.5 20h17M6 16l4-5 3.5 3.2L20 7M20 7h-3.6M20 7v3.6" />),
  profile: ico(<><circle cx="12" cy="8" r="3.6" /><path d="M4.6 20.5c.6-3.7 3.7-5.6 7.4-5.6s6.8 1.9 7.4 5.6" /></>),
}

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'exercises', label: 'Esercizi' },
    { key: 'diet', label: 'Dieta' },
    { key: 'habits', label: 'Abitudini' },
    { key: 'progress', label: 'Progressi' },
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

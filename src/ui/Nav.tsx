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
  // Abitudini: calendario di giorni spuntati e il simbolo dell'infinito —
  // la ripetizione che non si interrompe. Tre spunte e non nove: a 23 px
  // una griglia piena diventa una macchia.
  habits: ico(<>
    <rect x="2" y="3.6" width="13" height="11.8" rx="2" />
    <path d="M5.4 2v3.2M11.6 2v3.2M2 7h13" />
    <path d="M8.5 7v8.4M2 11.2h13" />
    <path d="M4 9.1l.9.9 1.6-1.9M10.5 9.1l.9.9 1.6-1.9M4 13.3l.9.9 1.6-1.9" />
    <path d="M16 18.5c.8-1.3 1.6-2 2.4-2 1 0 1.8.9 1.8 2s-.8 2-1.8 2c-.8 0-1.6-.7-2.4-2zm0 0c-.8-1.3-1.6-2-2.4-2-1 0-1.8.9-1.8 2s.8 2 1.8 2c.8 0 1.6-.7 2.4-2z" />
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

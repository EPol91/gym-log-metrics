import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ensureSeed } from './db/seed'
import { getUser } from './db/repo'
import { Onboarding } from './ui/Onboarding'
import { HomeScreen } from './ui/HomeScreen'
import { ExercisesScreen } from './ui/ExercisesScreen'
import { DietScreen } from './ui/DietScreen'
import { ProgressScreen } from './ui/ProgressScreen'
import { ProfileScreen } from './ui/ProfileScreen'
import { WorkoutFlow } from './ui/WorkoutFlow'
import { AnalyticsScreen } from './ui/AnalyticsScreen'
import { TemplateEditor } from './ui/TemplateEditor'
import { ExerciseDetail } from './ui/ExerciseDetail'
import { ReadinessScreen } from './ui/ReadinessScreen'
import { Nav, type Tab } from './ui/Nav'
import { onUpdateReady, applyPwaUpdate } from './util/pwaUpdate'

// Stato di navigazione: unico oggetto → persiste su refresh (sessionStorage) e guida il tasto Back (history API).
type Nav = { tab: Tab; workingOut: boolean; resumeId: string | null; analytics: boolean; editTemplate: string | 'new' | null; exercise: string | null; exerciseNew: boolean; check: boolean }
const DEFAULT_NAV: Nav = { tab: 'home', workingOut: false, resumeId: null, analytics: false, editTemplate: null, exercise: null, exerciseNew: false, check: false }

// Avviso mostrato solo se l'aggiornamento arriva mentre ti stai allenando:
// aggiornare ricarica la pagina, quindi decidi tu quando.
function UpdateBanner() {
  return (
    <button onClick={applyPwaUpdate}
      style={{ width: '100%', marginBottom: 8, background: 'var(--gold-bg)', borderColor: 'var(--gold)', color: 'var(--gold)', fontSize: 13, padding: '9px 12px' }}>
      Nuova versione disponibile · tocca per aggiornare
    </button>
  )
}

function loadNav(): Nav {
  try { const s = sessionStorage.getItem('nav'); if (s) return { ...DEFAULT_NAV, ...JSON.parse(s) } } catch { /* ignore */ }
  return DEFAULT_NAV
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [nav, setNav] = useState<Nav>(loadNav)
  const navRef = useRef(nav)
  navRef.current = nav
  const user = useLiveQuery(getUser, [])
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => { ensureSeed().then(() => setReady(true)) }, [])

  // Nuova versione: si applica da sola (i dati stanno nel DB locale, non si perde nulla).
  // Se sei in mezzo a un allenamento non interrompo: mostro un avviso e aggiorni tu.
  useEffect(() => onUpdateReady(setUpdateReady), [])
  useEffect(() => {
    if (updateReady && !navRef.current.workingOut) applyPwaUpdate()
  }, [updateReady])

  // History: ogni navigazione "in profondità" fa pushState; il Back del telefono torna indietro
  // dentro l'app invece di uscire. Refresh: ripristina l'ultimo stato salvato.
  useEffect(() => {
    history.replaceState(navRef.current, '')
    const onPop = (e: PopStateEvent) => {
      const n = (e.state as Nav) ?? DEFAULT_NAV
      navRef.current = n
      try { sessionStorage.setItem('nav', JSON.stringify(n)) } catch { /* ignore */ }
      setNav(n)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function commit(patch: Partial<Nav>, mode: 'push' | 'replace') {
    const next = { ...navRef.current, ...patch }
    navRef.current = next
    try { sessionStorage.setItem('nav', JSON.stringify(next)) } catch { /* ignore */ }
    if (mode === 'push') history.pushState(next, ''); else history.replaceState(next, '')
    setNav(next)
  }
  const push = (patch: Partial<Nav>) => commit(patch, 'push')
  const replace = (patch: Partial<Nav>) => commit(patch, 'replace')
  const back = () => history.back() // un solo punto: il Back UI usa la history come quello hardware

  if (!ready || user === undefined) return <div className="app"><p className="muted">Avvio…</p></div>

  // Primo avvio: onboarding guidato.
  if (user && !user.onboarded) {
    return <div className="app slide-up"><Onboarding onDone={() => replace({ tab: 'home' })} /></div>
  }

  // Flussi a schermo intero (senza tab bar).
  if (nav.workingOut) {
    return (
      <div className="app slide-up">
        {updateReady && <UpdateBanner />}
        <WorkoutFlow
          resumeSessionId={nav.resumeId}
          onSessionStarted={(id) => replace({ resumeId: id })}
          onExit={back}
        />
      </div>
    )
  }
  // Check del giorno dalla Home: si può fare anche senza allenarsi.
  if (nav.check) {
    return <div className="app slide-up"><ReadinessScreen mode="daily" onStart={back} onCancel={back} /></div>
  }
  if (nav.analytics) {
    return <div className="app slide-up"><AnalyticsScreen onBack={back} /></div>
  }
  if (nav.editTemplate) {
    return <div className="app slide-up"><TemplateEditor templateId={nav.editTemplate === 'new' ? null : nav.editTemplate} onBack={back} /></div>
  }

  return (
    <div className="app">
      <div className="screen" key={nav.tab}>
        {nav.tab === 'home' && (
          <HomeScreen
            onStartWorkout={() => push({ workingOut: true, resumeId: null })}
            onResumeWorkout={(id) => push({ workingOut: true, resumeId: id })}
            onOpenAnalytics={() => push({ analytics: true })}
            onOpenCheck={() => push({ check: true })}
          />
        )}
        {nav.tab === 'exercises' && (nav.exercise
          ? <ExerciseDetail exerciseId={nav.exercise} onBack={back} startEditing={nav.exerciseNew} />
          : <ExercisesScreen onOpen={(id, isNew) => push({ exercise: id, exerciseNew: !!isNew })} />)}
        {nav.tab === 'diet' && <DietScreen />}
        {nav.tab === 'progress' && <ProgressScreen onReopen={(id) => push({ workingOut: true, resumeId: id })} />}
        {nav.tab === 'profile' && (
          <ProfileScreen
            onEditTemplate={(id) => push({ editTemplate: id })}
            onNewTemplate={() => push({ editTemplate: 'new' })}
          />
        )}
      </div>
      <Nav tab={nav.tab} onChange={(t) => push({ tab: t, exercise: null, exerciseNew: false })} />
    </div>
  )
}

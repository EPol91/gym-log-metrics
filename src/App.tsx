import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ensureSeed } from './db/seed'
import { getUser } from './db/repo'
import { Onboarding } from './ui/Onboarding'
import { HomeScreen } from './ui/HomeScreen'
import { HistoryScreen } from './ui/HistoryScreen'
import { ExercisesScreen } from './ui/ExercisesScreen'
import { BodyScreen } from './ui/BodyScreen'
import { ProfileScreen } from './ui/ProfileScreen'
import { WorkoutFlow } from './ui/WorkoutFlow'
import { AnalyticsScreen } from './ui/AnalyticsScreen'
import { TemplateEditor } from './ui/TemplateEditor'
import { Nav, type Tab } from './ui/Nav'

export default function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [workingOut, setWorkingOut] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState(false)
  const [editTemplate, setEditTemplate] = useState<string | 'new' | null>(null)
  const user = useLiveQuery(getUser, [])

  useEffect(() => { ensureSeed().then(() => setReady(true)) }, [])

  if (!ready || user === undefined) return <div className="app"><p className="muted">Avvio…</p></div>

  // Primo avvio: onboarding guidato.
  if (user && !user.onboarded) {
    return <div className="app slide-up"><Onboarding onDone={() => setTab('home')} /></div>
  }

  // Flussi a schermo intero (senza tab bar).
  if (workingOut) {
    return (
      <div className="app slide-up">
        <WorkoutFlow resumeSessionId={resumeId} onExit={() => { setWorkingOut(false); setResumeId(null); setTab('home') }} />
      </div>
    )
  }
  if (analytics) {
    return <div className="app slide-up"><AnalyticsScreen onBack={() => setAnalytics(false)} /></div>
  }
  if (editTemplate) {
    return <div className="app slide-up"><TemplateEditor templateId={editTemplate === 'new' ? null : editTemplate} onBack={() => setEditTemplate(null)} /></div>
  }

  return (
    <div className="app">
      <div className="screen" key={tab}>
        {tab === 'home' && (
          <HomeScreen
            onStartWorkout={() => { setResumeId(null); setWorkingOut(true) }}
            onResumeWorkout={(id) => { setResumeId(id); setWorkingOut(true) }}
            onOpenAnalytics={() => setAnalytics(true)}
          />
        )}
        {tab === 'exercises' && <ExercisesScreen />}
        {tab === 'body' && <BodyScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'profile' && (
          <ProfileScreen
            onEditTemplate={(id) => setEditTemplate(id)}
            onNewTemplate={() => setEditTemplate('new')}
          />
        )}
      </div>
      <Nav tab={tab} onChange={setTab} />
    </div>
  )
}

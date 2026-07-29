import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeCoach, coachPrompt, COACH_BLOCKS_DEFAULT } from '../scores/coach'
import { isCoachAiOn, getAIProvider } from '../ai/aiEngine'
import { whoopDay } from '../db/whoop'
import { getUser } from '../db/repo'
import type { HomeData } from '../scores/dashboardScores'

/**
 * Coach: il dato in chiaro, il consiglio marcato e in sordina — così si
 * distingue a colpo d'occhio ciò che è misurato da ciò che è solo un
 * suggerimento. Al massimo quattro righe: un coach che dice otto cose non
 * dice niente.
 */
export function CoachCard({ home }: { home: HomeData }) {
  const lines = useLiveQuery(() => computeCoach(home), [home]) ?? []
  const vitali = useLiveQuery(() => whoopDay(), [])
  const user = useLiveQuery(getUser, [])
  const aiOn = useLiveQuery(isCoachAiOn, []) ?? false
  // Blocco spento = fuori anche dal prompt: se non lo vuoi vedere, non deve uscire di casa.
  const salute = (user?.coachBlocks ?? COACH_BLOCKS_DEFAULT).includes('salute')
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function askAi() {
    setAiLoading(true); setAiError(null)
    try { setAiText(await getAIProvider().analyze(coachPrompt(home, lines, salute ? vitali : null))) }
    catch (e) { setAiError((e as Error).message) }
    finally { setAiLoading(false) }
  }

  return (
    <div className="card" style={{ borderColor: 'var(--gold-dim)' }}>
      <div className="row spread"><span className="small" style={{ color: 'var(--gold)', letterSpacing: '.1em' }}>💡 COACH · OGGI</span></div>
      {lines.map((l, i) => (
        <div key={i} style={{ marginTop: i ? 8 : 6 }}>
          <p className="small" style={{ margin: 0 }}>{l.fact}</p>
          {l.advice && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Consiglio: {l.advice}</p>}
        </div>
      ))}
      {aiOn && (
        <>
          {!aiText && (
            <button className="ghost small" style={{ width: '100%', marginTop: 10 }} onClick={askAi} disabled={aiLoading}>
              {aiLoading ? 'Analizzo…' : '🤖 Chiedi al coach AI'}
            </button>
          )}
          {aiError && <p className="small" style={{ color: '#e57373', marginTop: 6 }}>Errore: {aiError}</p>}
          {aiText && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 8 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>🤖 Coach AI</div>
              <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aiText}</p>
              <button className="ghost small" style={{ marginTop: 6 }} onClick={() => setAiText(null)}>Chiudi</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

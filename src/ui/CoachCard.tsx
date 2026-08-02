import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeCoach, coachPrompt, COACH_BLOCKS_DEFAULT } from '../scores/coach'
import { isCoachAiOn, getAIProvider } from '../ai/aiEngine'
import { whoopDay } from '../db/whoop'
import { getUser } from '../db/repo'
import type { HomeData } from '../scores/dashboardScores'

/** Il bordo del tastino AI: argento, perché un oro dentro il bordo oro sparisce. */
const ARGENTO = '#cfcfcf'

/**
 * Spezza la risposta dell'AI nelle sue righe.
 *
 * Il modello risponde «LETTURA: …», «ATTENZIONE: …», «CONSIGLIO: …»: qui
 * l'etichetta si stacca dal testo, così la risposta si legge come le righe del
 * coach sopra invece che come un muro unico. Se un giorno risponde storto, il
 * testo resta comunque leggibile: si mostra la riga senza etichetta.
 */
function spezza(t: string): { titolo: string | null; testo: string }[] {
  return t.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
    const m = r.match(/^(LETTURA|ATTENZIONE|CONSIGLIO)\s*:\s*(.*)$/i)
    return m ? { titolo: m[1].toUpperCase(), testo: m[2] } : { titolo: null, testo: r }
  })
}

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
      <div className="row spread" style={{ alignItems: 'center' }}>
        <span className="small" style={{ color: 'var(--gold)', letterSpacing: '.1em' }}>💡 COACH · OGGI</span>
        {/* Un tondo piccolo invece di una barra larga: il coach AI è un extra,
            non deve prendere una riga intera. Bordo argento e non oro — un oro
            dentro il bordo oro della card non si distinguerebbe. */}
        {aiOn && (
          <button aria-label="Chiedi al coach AI"
            onClick={() => (aiText ? setAiText(null) : askAi())} disabled={aiLoading}
            style={{
              width: 34, height: 34, flex: 'none', padding: 0, fontSize: 15,
              display: 'grid', placeItems: 'center', borderRadius: '50%',
              border: `1px solid ${ARGENTO}`, background: aiText ? 'rgba(207,207,207,.14)' : 'transparent',
              opacity: aiLoading ? 0.5 : 1,
            }}>
            {aiLoading ? '…' : '🤖'}
          </button>
        )}
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ marginTop: i ? 8 : 6 }}>
          <p className="small" style={{ margin: 0 }}>{l.fact}</p>
          {l.advice && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Consiglio: {l.advice}</p>}
        </div>
      ))}
      {aiError && <p className="small" style={{ color: '#e57373', marginTop: 6 }}>Errore: {aiError}</p>}
      {aiText && (
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 8 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>🤖 Coach AI</div>
          {spezza(aiText).map((r, i) => (
            <div key={i} style={{ marginTop: i ? 8 : 0 }}>
              {r.titolo && (
                <span className="muted" style={{ fontSize: 11, letterSpacing: '.09em' }}>{r.titolo}</span>
              )}
              <p className="small" style={{ margin: r.titolo ? '1px 0 0' : 0, color: r.titolo === 'CONSIGLIO' ? 'var(--muted)' : undefined }}>
                {r.testo}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

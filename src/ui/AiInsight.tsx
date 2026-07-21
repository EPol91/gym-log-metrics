import { useState } from 'react'
import { getApiKey, getAIProvider } from '../ai/aiEngine'

/** Blocco Insight AI riutilizzabile. Genera l'interpretazione on-demand (controllo costi). */
export function AiInsight({ buildPrompt, label = 'Genera insight AI' }: {
  buildPrompt: () => string
  label?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasKey = !!getApiKey()

  async function run() {
    setLoading(true); setError(null); setText(null)
    try {
      const out = await getAIProvider().analyze(buildPrompt())
      setText(out || '(nessuna risposta)')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="muted small">Insight AI</div>
      {!hasKey ? (
        <p className="muted small" style={{ marginTop: 4 }}>Imposta la chiave AI nel Profilo per generare gli insight.</p>
      ) : (
        <>
          {!text && (
            <button className="ghost" style={{ width: '100%', marginTop: 6 }} onClick={run} disabled={loading}>
              {loading ? 'Analizzo…' : `✨ ${label}`}
            </button>
          )}
          {error && <p className="small" style={{ color: '#e57373', marginTop: 6 }}>Errore: {error}</p>}
          {text && (
            <>
              <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{text}</p>
              <button className="ghost small" style={{ marginTop: 6 }} onClick={run} disabled={loading}>↻ Rigenera</button>
            </>
          )}
          <p className="muted small" style={{ marginTop: 8 }}>Interpreta solo i tuoi dati · non inventa.</p>
        </>
      )}
    </div>
  )
}

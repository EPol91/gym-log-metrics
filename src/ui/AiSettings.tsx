import { useState } from 'react'
import { getApiKey, saveApiKey, clearApiKey, getAIProvider, isCoachAiOn, setCoachAi } from '../ai/aiEngine'

export function AiSettings() {
  const [key, setKey] = useState(getApiKey() ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [coachAi, setCoachAiState] = useState(isCoachAiOn())

  async function test() {
    saveApiKey(key.trim())
    setTesting(true)
    setResult(null)
    const r = await getAIProvider().test()
    setResult(r)
    setTesting(false)
  }

  function clear() {
    clearApiKey()
    setKey('')
    setResult(null)
  }

  return (
    <div className="card">
      <label className="fl">Chiave AI (Claude · claude-opus-4-8)</label>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-…"
        autoComplete="off"
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="ghost" style={{ flex: 1 }} onClick={clear} disabled={!key}>Rimuovi</button>
        <button className="primary" style={{ flex: 2 }} onClick={test} disabled={!key.trim() || testing}>
          {testing ? 'Verifico…' : 'Salva e testa chiave'}
        </button>
      </div>
      {result && (
        <p className="small" style={{ marginTop: 8, color: result.ok ? 'var(--good)' : '#e57373' }}>
          {result.message}
        </p>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>
        Salvata solo sul dispositivo. Su web nessuno storage è blindato: per uso personale. Sblocca gli Insight AI.
      </p>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        <label className="fl">Coach della Home</label>
        <div className="row" style={{ gap: 6 }}>
          <button className={!coachAi ? 'sel' : 'ghost'} style={{ flex: 1 }}
            onClick={() => { setCoachAi(false); setCoachAiState(false) }}>Euristico</button>
          <button className={coachAi ? 'sel' : 'ghost'} style={{ flex: 1 }} disabled={!getApiKey()}
            onClick={() => { setCoachAi(true); setCoachAiState(true) }}>AI</button>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>
          {getApiKey()
            ? 'Euristico: sempre disponibile, offline, istantaneo. AI: aggiunge in Home un pulsante per far commentare i tuoi dati al modello (consuma la tua chiave).'
            : 'Serve la chiave qui sopra per attivare il coach AI. Senza, resta quello euristico.'}
        </p>
      </div>
    </div>
  )
}

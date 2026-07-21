import { useState } from 'react'
import { getApiKey, saveApiKey, clearApiKey, getAIProvider } from '../ai/aiEngine'

export function AiSettings() {
  const [key, setKey] = useState(getApiKey() ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

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
    </div>
  )
}

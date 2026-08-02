import { useState } from 'react'
import { getApiKey, saveApiKey, clearApiKey, getAIProvider, isCoachAiOn, setCoachAi } from '../ai/aiEngine'
import { leggiConsumo, azzeraConsumo, costo, inDollari, PREZZO, type Voce } from '../ai/consumo'
import { fmtDataOra } from '../util/format'

/** Come si chiamano, per te, le funzioni che consumano. */
const VOCI: [Voce, string][] = [
  ['coach', 'Coach AI'],
  ['slide', 'Traduzione slide'],
  ['didascalia', 'Didascalia post'],
]

export function AiSettings() {
  const [key, setKey] = useState(getApiKey() ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [coachAi, setCoachAiState] = useState(isCoachAiOn())
  // Si rilegge quando torni qui: il conto cresce altrove (Home, slide).
  const [c, setC] = useState(leggiConsumo)

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
            ? 'Euristico: sempre disponibile, offline, istantaneo. AI: aggiunge in Oggi un pulsante per far commentare i tuoi dati al modello (consuma la tua chiave). Cosa esce di casa: le righe del coach, i quattro Score, l obiettivo settimanale e i vitali WHOOP del giorno (recupero, HRV, FC a riposo, sonno, sforzo). Niente nomi, niente diario alimentare.'
            : 'Serve la chiave qui sopra per attivare il coach AI. Senza, resta quello euristico.'}
        </p>
      </div>

      {/* Il conto di quanto stai spendendo. La chiave e' tua, quindi il costo
          e' tuo: saperlo qui evita di scoprirlo a fine mese sulla console. */}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        <label className="fl">Consumo</label>

        <div className="row spread" style={{ alignItems: 'baseline' }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, color: 'var(--gold)' }}>
            {inDollari(costo(c))}
          </span>
          <span className="muted small">stima · {c.richieste} {c.richieste === 1 ? 'richiesta' : 'richieste'}</span>
        </div>

        <div className="row spread" style={{ marginTop: 10 }}>
          <span className="muted small">Token in ingresso</span>
          <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.ingresso.toLocaleString('it-IT')}</span>
        </div>
        <div className="row spread" style={{ marginTop: 4 }}>
          <span className="muted small">Token in uscita</span>
          <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.uscita.toLocaleString('it-IT')}</span>
        </div>
        {c.ultima && (
          <div className="row spread" style={{ marginTop: 4 }}>
            <span className="muted small">Ultima richiesta</span>
            <span className="small">{fmtDataOra(c.ultima)}</span>
          </div>
        )}

        {VOCI.filter(([k]) => c.per[k]).map(([k, nome]) => {
          const v = c.per[k]!
          return (
            <div key={k} className="row spread" style={{ marginTop: 6 }}>
              <span className="muted small">{nome}</span>
              <span className="muted small">{v.richieste} · {inDollari(costo(v))}</span>
            </div>
          )
        })}

        <p className="muted" style={{ fontSize: 11, margin: '10px 0 0', lineHeight: 1.5 }}>
          Stima ai prezzi Opus: ${PREZZO.ingresso} per milione di token in ingresso, ${PREZZO.uscita} in uscita.
          Il conto vero è sulla tua console Anthropic.
        </p>
        {c.richieste > 0 && (
          <button className="chip" style={{ marginTop: 8 }}
            onClick={() => { azzeraConsumo(); setC(leggiConsumo()) }}>Azzera il contatore</button>
        )}
      </div>
    </div>
  )
}

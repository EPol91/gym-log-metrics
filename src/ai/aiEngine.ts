// AI Engine — isolato dietro un'unica interfaccia (decisione 7).
// Oggi: chiave utente (BYOK) + provider diretto Claude. Domani: si innesta un ServerProxyProvider
// per i clienti paganti, senza toccare il resto dell'app.

import { segnaConsumo } from './consumo'

/** Il modello, in un punto solo: lo usano anche didascalie e traduzioni. */
export const MODEL = 'claude-opus-5-5'
const KEY_STORAGE = 'gymlog.ai.apiKey'

export interface AIProvider {
  /** Verifica validità chiave/connessione. */
  test(): Promise<{ ok: boolean; message: string }>
  /** Analisi interpretativa sui dati forniti (mai inventa: dichiara se insufficienti). */
  analyze(prompt: string): Promise<string>
}

// --- Gestione chiave (BYOK). Su web non esiste storage davvero blindato: offuscabile, non sicuro. ---
export function saveApiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key)
}
export function getApiKey(): string | null {
  return localStorage.getItem(KEY_STORAGE)
}
export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE)
}

// --- Coach AI in Home: opzione, spenta di default. Senza, resta il coach euristico. ---
const COACH_AI = 'gymlog.ai.coachHome'
export function isCoachAiOn(): boolean {
  try { return localStorage.getItem(COACH_AI) === '1' && !!getApiKey() } catch { return false }
}
export function setCoachAi(on: boolean): void {
  try { localStorage.setItem(COACH_AI, on ? '1' : '0') } catch { /* ignore */ }
}

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export function headers(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'anthropic-version': API_VERSION,
    'content-type': 'application/json',
    // Consente la chiamata diretta dal browser (uso personale BYOK).
    'anthropic-dangerous-direct-browser-access': 'true',
    // Se il modello rifiuta una richiesta, l'API la ripassa da sola a un altro
    // modello (`fallbacks: 'default'` nel corpo).
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  }
}

/**
 * Il testo della risposta. Con Opus 5.5 il ragionamento e' sempre acceso e
 * arriva in un blocco a parte prima del testo: il primo blocco non e' piu' la
 * risposta. Si prendono i soli blocchi di testo.
 */
export function testoDi(data: { content?: { type: string; text?: string }[] } | null | undefined): string {
  return (data?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
}

/** Provider diretto verso l'API Claude (uso personale). NB: chiamata browser → attenzione CORS. */
export class DirectClaudeProvider implements AIProvider {
  async test(): Promise<{ ok: boolean; message: string }> {
    const key = getApiKey()
    if (!key) return { ok: false, message: 'Nessuna chiave inserita.' }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({ model: MODEL, max_tokens: 16, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'ping' }] }),
      })
      if (res.ok) return { ok: true, message: 'Chiave valida ✓' }
      if (res.status === 401) return { ok: false, message: 'Chiave non valida (401).' }
      const t = await res.text().catch(() => '')
      return { ok: false, message: `Errore ${res.status}: ${t.slice(0, 120)}` }
    } catch (e) {
      return { ok: false, message: 'Errore di rete/CORS: ' + (e as Error).message }
    }
  }

  async analyze(prompt: string): Promise<string> {
    const key = getApiKey()
    if (!key) throw new Error('Nessuna chiave AI impostata.')
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: MODEL,
        // Il ragionamento conta dentro max_tokens: con 1024 la risposta restava a meta'.
        max_tokens: 8000,
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        // L'AI interpreta i dati, non inventa: dichiara se insufficienti.
        system: 'Sei un analista di dati di allenamento. Interpreta SOLO i dati forniti, non inventare correlazioni, dichiara quando i dati sono insufficienti. Rispondi in italiano, conciso.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    segnaConsumo('coach', data?.usage)
    return testoDi(data)
  }
}

/** Punto unico da cui l'app ottiene il provider. Domani qui si sceglie diretto vs server-proxy. */
export function getAIProvider(): AIProvider {
  return new DirectClaudeProvider()
}

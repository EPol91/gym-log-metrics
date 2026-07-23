// Voice logging hands-free: Web Speech API (it-IT) + parser "100 per 8 RIR 2".
// Nessun dato lasciato dal dispositivo: il riconoscimento è locale al browser.

export interface VoiceSet { weight?: number; reps?: number; rir?: number; warmup?: boolean }

// Tipi minimi per l'API sperimentale (non tipizzata in lib.dom).
interface SRResult { transcript: string; final: boolean }
type SRWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean
  start(): void; stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function ctor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as SRWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isVoiceSupported(): boolean {
  return ctor() != null
}

/** Avvia il riconoscimento vocale. Ritorna una funzione per fermarlo. */
export function startRecognition(
  onResult: (r: SRResult) => void,
  onEnd: () => void,
  onError?: (err: string) => void,
): () => void {
  const C = ctor()
  if (!C) { onError?.('unsupported'); onEnd(); return () => {} }
  const rec = new C()
  rec.lang = 'it-IT'
  rec.interimResults = true
  rec.maxAlternatives = 1
  rec.continuous = false
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1]
    onResult({ transcript: last[0].transcript, final: last.isFinal })
  }
  rec.onend = onEnd
  rec.onerror = (e) => onError?.(e.error)
  try { rec.start() } catch { onError?.('start-failed'); onEnd() }
  return () => { try { rec.stop() } catch { /* ignore */ } }
}

// --- Parser ---
const WORD_NUM: Record<string, number> = {
  zero: 0, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
  dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16,
  diciassette: 17, diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50,
  sessanta: 60, settanta: 70, ottanta: 80, novanta: 90, cento: 100,
}

/** Converte le parole-numero italiane comuni in cifre (best effort; il riconoscitore di solito dà già cifre). */
function wordsToDigits(t: string): string {
  return t.replace(/[a-zàèéìòù]+/g, (w) => (w in WORD_NUM ? String(WORD_NUM[w]) : w))
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Interpreta una frase vocale in una serie.
 * Esempi: "100 per 8", "102,5 per 6 RIR 2", "riscaldamento 60 per 12".
 * Se il riconoscitore non restituisce il separatore ("per"), usa i numeri in ordine:
 * 1°=peso, 2°=reps, 3°=RIR. Così "15 8" → 15 kg × 8.
 */
export function parseVoiceSet(raw: string): VoiceSet {
  let t = raw.toLowerCase().trim()
  t = t.replace(/(\d),(\d)/g, '$1.$2') // decimali all'italiana → punto
  t = wordsToDigits(t)

  const res: VoiceSet = {}
  if (/riscald|warm|scald/.test(t)) res.warmup = true

  // RIR esplicito (e rimuovilo per non confondere il resto)
  const rir = t.match(/\b(?:rir|riserva|in\s*riserva)\s*(?:di\s*)?(\d+)/)
  if (rir) res.rir = clamp(+rir[1], 0, 10)
  const noRir = t.replace(/\b(?:rir|riserva|in\s*riserva)\s*(?:di\s*)?\d+/, ' ')

  // Reps: numero dopo un separatore ("per", "x", "×", "by", "volte")
  const repsMatch = noRir.match(/(?:per|x|×|by|volte)\s*(\d+)/)
  if (repsMatch) {
    res.reps = clamp(+repsMatch[1], 1, 1000)
    const wpart = repsMatch.index != null ? noRir.slice(0, repsMatch.index) : noRir
    const w = wpart.match(/(\d+(?:\.\d+)?)/)
    if (w) res.weight = clamp(+w[1], 0, 10000)
    return res
  }

  // Nessun separatore → posizionale sui numeri rimasti.
  const nums = (noRir.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (nums.length >= 1) res.weight = clamp(nums[0], 0, 10000)
  if (nums.length >= 2) res.reps = clamp(Math.round(nums[1]), 1, 1000)
  if (res.rir == null && nums.length >= 3) res.rir = clamp(Math.round(nums[2]), 0, 10)

  return res
}

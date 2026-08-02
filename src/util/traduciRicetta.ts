// Traduzione del testo di una ricetta, solo per le slide.
//
// Le etichette fisse le traduce l'app da sola: sono sempre le stesse. Quello che
// non puo' sapere e' il testo tuo — il nome del piatto, i nomi degli alimenti,
// i passi — e per quello serve l'AI. La ricetta salvata non si tocca: la
// traduzione vive il tempo di disegnare le immagini.

import { getApiKey } from '../ai/aiEngine'
import { segnaConsumo } from '../ai/consumo'
import type { Recipe } from '../db/schema'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-8'

export type Lingua = 'it' | 'en'

/** Il testo di una ricetta, appiattito: e' quello che parte e torna tradotto. */
interface Testo {
  nome: string
  sezioni: string[]
  ingredienti: string[]
  passi: string[]
}

export function haChiaveAI(): boolean {
  try { return !!getApiKey() } catch { return false }
}

function estrai(r: Recipe, nomi: Map<string, string>): Testo {
  const gruppi = (r.groups ?? []).filter((g) => g.items.length)
  return {
    nome: r.name,
    sezioni: gruppi.map((g) => g.name),
    ingredienti: gruppi.flatMap((g) => g.items.map((it) => nomi.get(it.foodId) ?? 'alimento')),
    passi: [...(r.steps ?? [])],
  }
}

/**
 * Traduce il testo e restituisce una copia della ricetta con dentro le parole
 * nuove, piu' la mappa dei nomi degli alimenti tradotti.
 *
 * Se qualcosa non torna — chiave assente, rete giu', risposta storta — si
 * solleva un errore invece di restituire mezza traduzione: mezza ricetta in due
 * lingue e' peggio di una ricetta in italiano.
 */
export async function traduciRicetta(
  r: Recipe, nomi: Map<string, string>, verso: Lingua,
): Promise<{ ricetta: Recipe; nomi: Map<string, string> }> {
  const key = getApiKey()
  if (!key) throw new Error('Nessuna chiave AI in Profilo.')

  const testo = estrai(r, nomi)
  const lingua = verso === 'en' ? 'inglese' : 'italiano'
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: `Traduci in ${lingua} il testo di una ricetta. Mantieni ESATTAMENTE la stessa struttura JSON e lo stesso numero di elementi in ogni lista, nello stesso ordine. Traduci nomi di piatti e alimenti con il termine usato davvero in cucina in quella lingua. Non aggiungere, non togliere, non commentare. Rispondi SOLO con il JSON.`,
      messages: [{ role: 'user', content: JSON.stringify(testo) }],
    }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Chiave AI non valida.' : `AI: errore ${res.status}.`)

  const data = await res.json()
  segnaConsumo('slide', data?.usage)
  const grezzo: string = data?.content?.[0]?.text ?? ''
  // Se il modello incornicia il JSON, si prende quello che sta fra le graffe.
  const dentro = grezzo.slice(grezzo.indexOf('{'), grezzo.lastIndexOf('}') + 1)
  let t: Testo
  try { t = JSON.parse(dentro) } catch { throw new Error('Risposta AI illeggibile.') }

  const gruppi = (r.groups ?? []).filter((g) => g.items.length)
  const attesi = gruppi.reduce((a, g) => a + g.items.length, 0)
  if (t.ingredienti?.length !== attesi || t.passi?.length !== testo.passi.length) {
    throw new Error('Traduzione incompleta: lascio l’italiano.')
  }

  // I nomi tornano nello stesso ordine in cui sono partiti: si riattaccano
  // agli id scorrendo i gruppi con lo stesso passo.
  const tradotti = new Map(nomi)
  let i = 0
  for (const g of gruppi) for (const it of g.items) tradotti.set(it.foodId, t.ingredienti[i++])

  const ricetta: Recipe = {
    ...r,
    name: t.nome || r.name,
    steps: t.passi,
    groups: (r.groups ?? []).map((g) => {
      const pos = gruppi.indexOf(g)
      return pos < 0 ? g : { ...g, name: t.sezioni?.[pos] ?? g.name }
    }),
  }
  return { ricetta, nomi: tradotti }
}

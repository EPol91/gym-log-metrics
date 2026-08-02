// La didascalia del post: quello che scrivi sotto le slide.
//
// Le immagini le disegna l'app, il testo no: un gancio che funziona dipende da
// cosa c'e' nel piatto e da come lo racconti. Qui si manda all'AI la ricetta
// vera — macro compresi — e torna un testo che parla di quella, non di una
// ricetta generica.

import { getApiKey } from '../ai/aiEngine'
import { segnaConsumo } from '../ai/consumo'
import type { Recipe } from '../db/schema'
import type { RecipeCalc } from '../db/recipes'
import type { Lingua } from './slideRicetta'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-8'

export interface Didascalia {
  /** il testo da incollare sotto il post */
  testo: string
  /** hashtag senza il cancelletto: lo mette la vista */
  hashtag: string[]
  /** chi taggare, per categoria — non handle inventati */
  tag: string[]
}

export async function didascaliaPost(
  r: Recipe, calc: RecipeCalc, ingredienti: string[], l: Lingua,
): Promise<Didascalia> {
  const key = getApiKey()
  if (!key) throw new Error('Nessuna chiave AI in Profilo.')

  const m = (r.mode === 'servings' ? calc.perServing : calc.per100) ?? calc.totals
  const per = r.mode === 'servings' ? 'a porzione' : 'per 100 g'
  const dati = [
    `Ricetta: ${r.name}`,
    `Ingredienti: ${ingredienti.join(', ')}`,
    `Macro ${per}: ${Math.round(m.kcal)} kcal, carboidrati ${m.carbs} g, proteine ${m.protein} g, grassi ${m.fat} g`,
    r.timeMin ? `Tempo: ${r.timeMin} minuti` : '',
    r.mode === 'servings' ? `Porzioni: ${r.servings ?? 1}` : '',
  ].filter(Boolean).join('\n')

  const lingua = l === 'en' ? 'inglese' : 'italiano'
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
      max_tokens: 900,
      system: `Scrivi la didascalia di un post Instagram per una ricetta fit, in ${lingua}, per un profilo di bodybuilding/palestra.

Regole:
- Prima riga: un gancio corto che fa fermare il pollice. Niente "Ecco la mia ricetta".
- Poi 2-4 righe brevi: perché vale la pena farla, i macro veri (usali, sono il motivo per cui la gente salva il post), un dettaglio concreto sul procedimento.
- Chiudi con una domanda o un invito a salvare il post.
- Emoji: poche e solo dove servono. Niente frasi da coach motivazionale, niente promesse di risultati, niente parole tipo "delizioso" o "irresistibile".
- I numeri devono essere quelli che ti do. Non inventare ingredienti né valori.
- 12-18 hashtag: qualcuno grande, la maggior parte di nicchia e attinenti al piatto.
- Per i tag NON inventare nomi di account: indica CATEGORIE di profili da taggare (es. "il marchio delle proteine che hai usato", "pagine di ricette proteiche"). Massimo 4.

Rispondi SOLO con questo JSON: {"testo":"…","hashtag":["…"],"tag":["…"]}`,
      messages: [{ role: 'user', content: dati }],
    }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Chiave AI non valida.' : `AI: errore ${res.status}.`)

  const data = await res.json()
  segnaConsumo('didascalia', data?.usage)
  const grezzo: string = data?.content?.[0]?.text ?? ''
  const dentro = grezzo.slice(grezzo.indexOf('{'), grezzo.lastIndexOf('}') + 1)
  let d: Didascalia
  try { d = JSON.parse(dentro) } catch { throw new Error('Risposta AI illeggibile.') }
  if (!d.testo) throw new Error('Didascalia vuota.')

  return {
    testo: d.testo.trim(),
    // Il cancelletto lo mette la vista: cosi' non ne escono due se il modello
    // lo ha gia' scritto.
    hashtag: (d.hashtag ?? []).map((h) => h.replace(/^#+/, '').trim()).filter(Boolean),
    tag: (d.tag ?? []).map((t) => t.trim()).filter(Boolean),
  }
}

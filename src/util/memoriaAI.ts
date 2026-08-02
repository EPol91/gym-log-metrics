// Quello che l'AI ha gia' scritto, tenuto da parte.
//
// Ogni chiamata costa. Chiudere il pannello, uscire dall'app per un secondo o
// cambiare schermata non sono motivi per ripagare la stessa didascalia: qui la
// risposta resta, legata alla ricetta e alla lingua in cui e' stata scritta.
//
// Sta in localStorage e non nel database perche' non e' un tuo dato: e' una
// copia di comodo, e se sparisce si rifa'.

import type { Didascalia } from './didascalia'
import type { Lingua } from './slideRicetta'

const CHIAVE = 'gymlog.ai.memoria'

export interface Ricordo {
  didascalia?: Didascalia
  /** la traduzione, appiattita: le mappe non sopravvivono al JSON */
  traduzione?: { nome: string; sezioni: string[]; passi: string[]; nomi: [string, string][] }
  /** com'era la ricetta quando l'AI l'ha letta: se cambia, il testo e' vecchio */
  ricettaAl?: string
}

type Memoria = Record<string, Ricordo>

const id = (recipeId: string, l: Lingua) => `${recipeId}:${l}`

function tutta(): Memoria {
  try { return JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as Memoria } catch { return {} }
}

export function ricorda(recipeId: string, l: Lingua, patch: Ricordo): void {
  const m = tutta()
  m[id(recipeId, l)] = { ...m[id(recipeId, l)], ...patch }
  try { localStorage.setItem(CHIAVE, JSON.stringify(m)) } catch { /* storage pieno: pazienza */ }
}

export function ricordo(recipeId: string, l: Lingua): Ricordo | null {
  return tutta()[id(recipeId, l)] ?? null
}

export function scorda(recipeId: string, l: Lingua): void {
  const m = tutta()
  delete m[id(recipeId, l)]
  try { localStorage.setItem(CHIAVE, JSON.stringify(m)) } catch { /* ignore */ }
}

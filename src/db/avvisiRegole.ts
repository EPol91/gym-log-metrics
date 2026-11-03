// Gli avvisi delle regole dell'autogestione, per lo scudo di Oggi.
//
// Li calcola il check-in sul PC e li manda al Worker; qui si leggono e basta.
// Finché c'è RS sono solo da guardare: non cambiano niente nell'app.
// L'ultima lettura resta nel telefono, così lo scudo c'è anche senza rete.

import { WORKER, deviceId } from './whoop'
import { collegato } from './autogestione'

export type Livello = 'ok' | 'attenzione' | 'fuori' | 'info'

export interface AvvisoRegola {
  area: string
  titolo: string
  /** «4», «KPI» o niente */
  regola: string | null
  livello: Livello
  dato: string
  nota?: string
  soglia?: string
  /** cosa farebbe il piano ombra */
  ombra?: string
  /** esercizi fermi: [nome, carico × ripetizioni, esposizioni] */
  righe?: string[][]
  /** passi per RS: [voce, numero], l'ultima è il totale */
  conto?: string[][] | null
}

export interface AvvisiRegole {
  aggiornato: string
  settimana: string
  dal: string
  al: string
  rs: boolean
  avvisi: AvvisoRegola[]
  at?: string
}

const CHIAVE = 'autog-avvisi'
const LETTO = 'autog-avvisi-letto'
/** Il check-in è settimanale: una lettura ogni mezz'ora basta e avanza. */
const OGNI_MS = 30 * 60 * 1000

export function avvisiSalvati(): AvvisiRegole | null {
  try { const v = localStorage.getItem(CHIAVE); return v ? JSON.parse(v) as AvvisiRegole : null } catch { return null }
}

/** Gli avvisi che chiedono un'occhiata: fuori e da guardare. Ok e informazioni no. */
export const daVedere = (a: AvvisiRegole | null) => (a?.avvisi ?? []).filter((x) => x.livello === 'fuori' || x.livello === 'attenzione')

/** Chiede gli ultimi avvisi al Worker; se non arrivano resta quello che c'era. */
export async function aggiornaAvvisi(forza = false): Promise<void> {
  if (!collegato()) return
  try {
    const ultima = Number(localStorage.getItem(LETTO) || 0)
    if (!forza && Date.now() - ultima < OGNI_MS) return
    const r = await fetch(`${WORKER}/autogestione/avvisi`, { headers: { 'x-device': deviceId() } })
    localStorage.setItem(LETTO, String(Date.now()))
    if (!r.ok) return
    const j = await r.json() as AvvisiRegole
    if (!Array.isArray(j.avvisi)) return
    localStorage.setItem(CHIAVE, JSON.stringify(j))
    window.dispatchEvent(new Event('autog-avvisi'))
  } catch { /* senza rete resta l'ultima lettura */ }
}

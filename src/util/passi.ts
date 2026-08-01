// I passi del telefono, letti da Health Connect.
//
// Perche' solo nell'app installata: dal browser questo dato non si puo' avere.
// WHOOP non espone i passi nella sua API (ho controllato campo per campo: c'e'
// strain, sonno, HRV, distanza dei workout — passi mai). Google Fit e' chiusa
// ai nuovi dal 2024, la Google Health API legge solo Fitbit e Pixel Watch, e il
// sensore del telefono dal browser conta solo mentre guardi lo schermo. Health
// Connect e' l'unica porta vera, ed e' una porta di sistema: la puo' aprire
// un'app installata, non una pagina web.
//
// Qui si legge e basta: nessuna scrittura, nessun dato che esce dal telefono.

import { isNativo } from './fasciaNativa'

interface Health {
  isHealthAvailable(): Promise<{ available: boolean }>
  checkHealthPermissions(p: { permissions: string[] }): Promise<{ permissions: string[] }>
  requestHealthPermissions(p: { permissions: string[] }): Promise<{ permissions: string[] }>
  queryAggregated(r: {
    startDate: string; endDate: string; dataType: 'steps' | 'calories' | 'distance'; bucket: string
  }): Promise<{ aggregatedData: { startDate: string; endDate: string; value: number }[] }>
}

/**
 * Una promessa che non puo' restare appesa per sempre.
 *
 * Se il ponte col nativo non risponde, senza questo la schermata resta a
 * guardare il vuoto: e' successo davvero, e non si capiva niente perche' non
 * compariva nemmeno un messaggio.
 */
function conTempo<T>(p: Promise<T>, ms: number, motivo: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, no) => setTimeout(() => no(new Error(motivo)), ms)),
  ])
}

let plugin: Health | null = null

/**
 * Il plugin, preso dal ponte che il guscio inietta nella pagina.
 *
 * L'app carica il sito da remoto, e nella pagina finiscono DUE Capacitor:
 * quello iniettato dal guscio — l'unico davvero collegato al nativo — e quello
 * dentro il nostro pacchetto. Passando dal secondo le chiamate partivano e non
 * tornava mai niente: la schermata restava su "Chiedo il permesso…" per
 * sempre. Prima si prova quello iniettato.
 */
async function health(): Promise<Health | null> {
  if (!isNativo()) return null
  if (plugin) return plugin

  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, Health> } }).Capacitor
  const dalGuscio = cap?.Plugins?.HealthPlugin
  if (dalGuscio?.isHealthAvailable) { plugin = dalGuscio; return plugin }

  // Ripiego: la copia dentro il pacchetto.
  const mod = await conTempo(import('capacitor-health'), 6000, "Il modulo Health non si e' caricato.")
  plugin = (mod as unknown as { Health: Health }).Health
  if (!plugin?.isHealthAvailable) throw new Error('Il ponte con Health Connect non risponde.')
  return plugin
}

/** Cosa vede la pagina del ponte nativo: serve a capire, non a indovinare. */
export function diagnosticaPonte(): string {
  const g = globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, unknown> }
  }
  const cap = g.Capacitor
  if (!cap) return 'Nessun Capacitor nella pagina.'
  const nomi = Object.keys(cap.Plugins ?? {})
  return [
    `piattaforma: ${cap.getPlatform?.() ?? '?'}`,
    `nativo: ${cap.isNativePlatform?.() ?? '?'}`,
    `plugin visibili: ${nomi.length ? nomi.join(', ') : 'nessuno'}`,
    `HealthPlugin: ${cap.Plugins?.HealthPlugin ? 'presente' : 'assente'}`,
  ].join(' · ')
}

/** Perche' i passi non si possono leggere: da mostrare, non da nascondere. */
export type StatoPassi =
  | { stato: 'fuoriDallApp' }
  | { stato: 'assente'; motivo: string }
  | { stato: 'daCollegare' }
  | { stato: 'collegato' }

/**
 * A che punto siamo con i passi.
 *
 * Ogni ramo dice qualcosa: "non si puo'" con il motivo, oppure "manca il
 * permesso", oppure "tutto a posto". Il silenzio non e' fra le risposte
 * possibili — era il difetto di prima.
 */
export async function statoPassi(): Promise<StatoPassi> {
  if (!isNativo()) return { stato: 'fuoriDallApp' }
  try {
    const h = await health()
    if (!h) return { stato: 'assente', motivo: 'Plugin non disponibile.' }
    const d = await conTempo(h.isHealthAvailable(), 6000, 'Health Connect non ha risposto.')
    if (!d.available) return { stato: 'assente', motivo: 'Health Connect non e\' installato o non e\' attivo su questo telefono.' }
    const p = await conTempo(h.checkHealthPermissions({ permissions: ['READ_STEPS'] }), 6000, 'Controllo permessi non riuscito.')
    return p.permissions?.includes('READ_STEPS') ? { stato: 'collegato' } : { stato: 'daCollegare' }
  } catch (e) {
    return { stato: 'assente', motivo: (e as Error)?.message ?? 'Errore sconosciuto.' }
  }
}

/** C'e' Health Connect su questo telefono? Fuori dall'app installata: no. */
export async function passiDisponibili(): Promise<boolean> {
  const s = await statoPassi()
  return s.stato === 'daCollegare' || s.stato === 'collegato'
}

/** Chiede il permesso di leggere i passi. Va chiamato da un tocco tuo. */
export async function chiediPermessoPassi(): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const h = await health()
    if (!h) return { ok: false, motivo: 'Plugin non disponibile.' }
    const r = await conTempo(h.requestHealthPermissions({ permissions: ['READ_STEPS'] }), 60_000, 'Nessuna risposta dalla schermata dei permessi.')
    return r.permissions?.includes('READ_STEPS')
      ? { ok: true }
      : { ok: false, motivo: 'Permesso non concesso.' }
  } catch (e) { return { ok: false, motivo: (e as Error)?.message } }
}

export async function permessoPassiConcesso(): Promise<boolean> {
  return (await statoPassi()).stato === 'collegato'
}

/**
 * I passi giorno per giorno, dal giorno indicato a oggi.
 *
 * Un giorno alla volta, non un totale unico: serve a riempire lo storico, e un
 * totale di sette giorni non si puo' spalmare all'indietro senza inventare.
 */
export async function leggiPassi(daISO: string, aISO: string): Promise<{ date: string; passi: number }[]> {
  const h = await health()
  if (!h) return []
  const inizio = new Date(daISO + 'T00:00:00')
  const fine = new Date(aISO + 'T23:59:59')
  try {
    const r = await h.queryAggregated({
      startDate: inizio.toISOString(),
      endDate: fine.toISOString(),
      dataType: 'steps',
      bucket: 'day',
    })
    return (r.aggregatedData ?? [])
      .map((x) => ({ date: new Date(x.startDate).toISOString().slice(0, 10), passi: Math.round(x.value) }))
      .filter((x) => x.passi > 0)
  } catch { return [] }
}

/**
 * Porta i passi degli ultimi giorni dentro le abitudini.
 *
 * Riscrive anche i giorni gia' presenti, perche' Health Connect aggiorna il
 * totale di oggi fino a mezzanotte: fermarsi al primo giorno gia' scritto
 * lascerebbe la giornata a meta'. Quello che hai messo a mano resta al suo
 * posto: e' setHabitValue a difenderlo, non questa funzione.
 */
export async function sincronizzaPassi(giorni = 7): Promise<number> {
  if (!(await permessoPassiConcesso())) return 0
  const { setHabitValue, STEPS, ensureHabits } = await import('../db/habits')
  const { todayLocal, shiftDate } = await import('./date')
  const a = todayLocal()
  const da = shiftDate(a, -(giorni - 1))
  const righe = await leggiPassi(da, a)
  if (!righe.length) return 0
  await ensureHabits()
  for (const r of righe) await setHabitValue(STEPS, r.date, r.passi, 'healthConnect')
  return righe.length
}

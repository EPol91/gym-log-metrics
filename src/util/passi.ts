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

let plugin: Health | null = null
async function health(): Promise<Health | null> {
  if (!isNativo()) return null
  if (plugin) return plugin
  try {
    const mod = await import('capacitor-health')
    plugin = (mod as unknown as { Health: Health }).Health
    return plugin
  } catch { return null }
}

/** C'e' Health Connect su questo telefono? Fuori dall'app installata: no. */
export async function passiDisponibili(): Promise<boolean> {
  const h = await health()
  if (!h) return false
  try { return (await h.isHealthAvailable()).available } catch { return false }
}

/** Chiede il permesso di leggere i passi. Va chiamato da un tocco tuo. */
export async function chiediPermessoPassi(): Promise<boolean> {
  const h = await health()
  if (!h) return false
  try {
    const r = await h.requestHealthPermissions({ permissions: ['READ_STEPS'] })
    return r.permissions.includes('READ_STEPS')
  } catch { return false }
}

export async function permessoPassiConcesso(): Promise<boolean> {
  const h = await health()
  if (!h) return false
  try {
    const r = await h.checkHealthPermissions({ permissions: ['READ_STEPS'] })
    return r.permissions.includes('READ_STEPS')
  } catch { return false }
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

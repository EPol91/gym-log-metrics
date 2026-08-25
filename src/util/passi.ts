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
  // La risposta e' un elenco di coppie permesso -> concesso, non di nomi:
  // trattarla come un elenco di stringhe faceva fallire ogni controllo.
  checkHealthPermissions(p: { permissions: string[] }): Promise<{ permissions: Record<string, boolean>[] }>
  requestHealthPermissions(p: { permissions: string[] }): Promise<{ permissions: Record<string, boolean>[] }>
  queryAggregated(r: {
    startDate: string; endDate: string; dataType: 'steps' | 'calories' | 'distance'; bucket: string
    /** se valorizzato, si legge SOLO da queste app */
    dataOrigins?: string[]
  }): Promise<{ aggregatedData: { startDate: string; endDate: string; value: number }[] }>
  queryRecords(r: { startDate: string; endDate: string; dataType: 'steps' }): Promise<{
    records: { startDate: string; endDate?: string; value: number; sourceBundleId: string; sourceName: string }[]
  }>
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

/** Il permesso c'e'? La risposta puo' arrivare come elenco di coppie o come
 *  singolo oggetto, a seconda della versione del plugin: si accettano entrambe. */
function concesso(r: { permissions?: unknown } | undefined, chiave: string): boolean {
  const p = r?.permissions as unknown
  if (Array.isArray(p)) return p.some((x) => (x as Record<string, boolean>)?.[chiave] === true)
  if (p && typeof p === 'object') return (p as Record<string, boolean>)[chiave] === true
  return false
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
    return concesso(p, 'READ_STEPS') ? { stato: 'collegato' } : { stato: 'daCollegare' }
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
    return concesso(r, 'READ_STEPS')
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
/** Il giorno di calendario di un istante, in ora locale. */
function giornoLocale(iso: string): string {
  const d = new Date(iso)
  const due = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
}

/**
 * Il nome dell'app come lo diresti tu.
 *
 * Health Connect a volte da' il nome leggibile e a volte solo il pacchetto:
 * «com.sec.android.app.shealth» accanto a un'etichetta non si legge e non ci
 * sta. Le app che contano passi sono quattro gatti, quindi le chiamo per nome;
 * per le altre tengo l'ultimo pezzo del pacchetto, che e' sempre meglio della
 * riga intera.
 */
const NOMI: [RegExp, string][] = [
  [/whoop/i, 'WHOOP'],
  [/shealth|samsung/i, 'Samsung Health'],
  [/google.*fit|com.google.android.apps.fitness|com.google.android.gms/i, 'Google Fit'],
  [/garmin/i, 'Garmin'],
  [/fitbit/i, 'Fitbit'],
  [/polar/i, 'Polar'],
  [/strava/i, 'Strava'],
  [/huawei/i, 'Huawei Health'],
  [/xiaomi|mi.health|mifit/i, 'Mi Fitness'],
  [/oura/i, 'Oura'],
  [/etphealth/i, 'ETP HEALTH'],
  [/healthconnect|com.google.android.apps.healthdata/i, 'Health Connect'],
]

export function nomeSorgente(id?: string | null): string {
  const s = (id ?? '').trim()
  if (!s) return 'Health Connect'
  for (const [re, nome] of NOMI) if (re.test(s)) return nome
  if (!s.includes('.')) return s
  // Ultimo pezzo del pacchetto, con l'iniziale grande: «com.tizio.passiapp» → «Passiapp».
  const ultimo = s.split('.').filter(Boolean).pop() ?? s
  return ultimo.charAt(0).toUpperCase() + ultimo.slice(1)
}

/** `da` e' l'identificativo dell'app, `nome` come si chiama sul telefono. */
export interface GiornoPassi { date: string; passi: number; da?: string; nome?: string }

export async function leggiPassi(daISO: string, aISO: string, sorgente?: string): Promise<GiornoPassi[]> {
  const h = await health()
  if (!h) return []
  const inizio = new Date(daISO + 'T00:00:00')
  const fine = new Date(aISO + 'T23:59:59')

  /**
   * A che giornata appartiene un record: quella dove sta il grosso della sua
   * durata, cioe' il suo punto di mezzo.
   *
   * Serve perche' il WHOOP marca il totale del giorno con l'ora in cui e'
   * COMINCIATA la sua giornata fisiologica, cioe' quando vai a dormire. Nei
   * dati veri:
   *   inizio 30/07 01:57 → 7.085 passi = il 30 luglio
   *   inizio 30/07 23:57 → 8.774 passi = il 31 luglio
   * Guardando l'inizio, gli 8.774 del 31 finivano sul 30 — che infatti faceva
   * 15.859, la somma dei due. E' lo stesso scarto dei cicli WHOOP: la giornata
   * comincia col sonno, non a mezzanotte.
   *
   * Il punto di mezzo risolve entrambi i casi senza regole speciali: un record
   * lungo un giorno cade nella giornata che copre davvero, uno breve del
   * telefono resta dov'e' — mezzogiorno di un record di trenta secondi e'
   * ancora mezzogiorno.
   */
  const giornoDelRecord = (x: { startDate: string; endDate?: string; value: number; sourceBundleId: string }): string => {
    const a = new Date(x.startDate).getTime()
    const b = x.endDate ? new Date(x.endDate).getTime() : a

    // Chi ha scritto il record, non quanto vale.
    //
    // Il WHOOP tiene UN totale per giornata e lo marca quando quella giornata
    // e' cominciata per lui: l'addormentamento. Segnato di sera, appartiene al
    // giorno dopo — la stessa regola dei suoi cicli. Prima decidevo in base al
    // valore (sopra i mille passi lo trattavo da totale): il totale di OGGI, che
    // a meta' pomeriggio vale poche centinaia, finiva incollato a ieri sera.
    if (/whoop/i.test(x.sourceBundleId)) {
      const d = new Date(a)
      if (d.getHours() >= 18) d.setDate(d.getDate() + 1)
      return giornoLocale(d.toISOString())
    }

    // Gli altri scrivono tanti record brevi all'ora vera: vale il punto di mezzo,
    // che per un record di trenta secondi e' il momento stesso.
    return giornoLocale(new Date(a + (b - a) / 2).toISOString())
  }

  if (h.queryRecords) {
    try {
      // Si guarda un giorno piu' in la' e uno piu' indietro: un record puo'
      // cominciare fuori dalla finestra e appartenere a un giorno dentro.
      const largo = (d: Date, giorni: number) => new Date(d.getTime() + giorni * 86_400_000)

      /**
       * A blocchi di pochi giorni, non tutto in una domanda sola.
       *
       * Health Connect a una richiesta risponde con un numero massimo di record
       * e taglia il resto — e taglia i piu' RECENTI. Il telefono ne scrive
       * qualche centinaio al giorno: appena lo storico chiesto ha superato quel
       * tetto, i giorni nuovi hanno smesso di arrivare e le giornate risultavano
       * a zero per tutte le sorgenti, WHOOP compreso. Nessuna richiesta larga,
       * nessun taglio.
       */
      const PASSO = 3
      const record: { startDate: string; endDate?: string; value: number; sourceBundleId: string; sourceName?: string }[] = []
      for (let t = largo(inizio, -1).getTime(); t <= largo(fine, 1).getTime(); t += PASSO * 86_400_000) {
        const fineBlocco = Math.min(t + PASSO * 86_400_000, largo(fine, 1).getTime())
        const parte = await conTempo(h.queryRecords({
          startDate: new Date(t).toISOString(),
          endDate: new Date(fineBlocco).toISOString(),
          dataType: 'steps',
        }), 25_000, 'La lettura dei passi non ha risposto.')
        record.push(...(parte.records ?? []))
      }

      // Per giorno E per sorgente: oggi serve sapere chi ha contato di piu'.
      // I blocchi si sovrappongono agli estremi, quindi lo stesso record puo'
      // arrivare due volte: si tiene per identita' (inizio + sorgente) o il
      // giorno verrebbe contato doppio.
      const per = new Map<string, Map<string, number>>()
      const visti = new Set<string>()
      /** Come si chiama l'app, non come si chiama il suo pacchetto. */
      const nomi = new Map<string, string>()
      for (const x of record) {
        const id = `${x.startDate}|${x.sourceBundleId}|${x.value}`
        if (visti.has(id)) continue
        visti.add(id)
        if (x.sourceName?.trim()) nomi.set(x.sourceBundleId, x.sourceName.trim())
        const g = giornoDelRecord(x)
        if (g < daISO || g > aISO) continue
        const perGiorno = per.get(g) ?? new Map<string, number>()
        perGiorno.set(x.sourceBundleId, (perGiorno.get(x.sourceBundleId) ?? 0) + (x.value || 0))
        per.set(g, perGiorno)
      }

      /**
       * Il valore di una giornata.
       *
       * Nei giorni passati comanda il WHOOP — o la sorgente che hai scelto — e
       * basta: e' il dato definitivo. OGGI il WHOOP non ha ancora scritto
       * niente, perche' chiude la giornata col sonno: allora vale il MASSIMO
       * fra le sorgenti, cioe' quella che ti stava addosso davvero. Non la
       * somma: orologio e telefono contano gli stessi passi, sommarli li
       * raddoppia. Stanotte il WHOOP arriva e prende il suo posto.
       */
      const oggi = giornoLocale(new Date().toISOString())
      /** Il valore della giornata E chi l'ha contata: al grafico serve sapere
       *  quali barre vengono dal WHOOP e quali da un ripiego. */
      const valore = (g: string): { passi: number; da?: string } => {
        const perGiorno = per.get(g)
        if (!perGiorno) return { passi: 0 }
        const migliore = () => {
          let quale: string | undefined, quanto = 0
          for (const [k, v] of perGiorno) if (v > quanto) { quanto = v; quale = k }
          return { passi: quanto, ...(quale ? { da: quale } : {}) }
        }
        if (g === oggi) return migliore()
        if (sorgente) return { passi: perGiorno.get(sorgente) ?? 0, da: sorgente }
        return migliore()
      }
      if (per.size) {
        // Anche i giorni rimasti a zero: servono a correggere un valore vecchio
        // sbagliato invece di lasciarlo li'.
        const out: { date: string; passi: number }[] = []
        for (let g = new Date(inizio); g <= fine; g.setDate(g.getDate() + 1)) {
          const d = giornoLocale(new Date(g.getFullYear(), g.getMonth(), g.getDate(), 12).toISOString())
          const v = valore(d)
          const nome = v.da ? nomi.get(v.da) : undefined
          out.push({ date: d, passi: Math.round(v.passi), ...(v.da ? { da: v.da } : {}), ...(nome ? { nome } : {}) })
        }
        return out
      }
    } catch { /* niente record: si prova l'aggregato qui sotto */ }
  }

  // Ripiego, se nessun giorno ha risposto: una sola domanda su tutto il periodo.
  // Un errore di lettura non va nascosto dietro un "nessun passo trovato":
  // sono due cose diverse, e confonderle fa perdere tempo a tutti e due.
  {
    const r = await conTempo(h.queryAggregated({
      startDate: inizio.toISOString(),
      endDate: fine.toISOString(),
      dataType: 'steps',
      bucket: 'day',
      // Con una sorgente scelta si legge solo la sua: Health Connect somma
      // tutte le app che scrivono passi, e due conteggi dello stesso giorno
      // sommati fanno un numero che non esiste da nessuna parte.
      ...(sorgente ? { dataOrigins: [sorgente] } : {}),
    }), 15_000, 'La lettura dei passi non ha risposto.')
    // Ripiego, usato solo se i record non arrivano. La data si legge comunque
    // in ora locale: in UTC ogni giornata finiva scritta un giorno indietro.
    return (r.aggregatedData ?? [])
      .map((x) => ({ date: giornoLocale(x.startDate), passi: Math.round(x.value) }))
      .filter((x) => x.passi > 0)
  }
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
  const { getUser } = await import('../db/repo')
  const a = todayLocal()
  const da = shiftDate(a, -(giorni - 1))
  // La sorgente scelta nel profilo, se c'e': altrimenti tutte sommate.
  const sorgente = (await getUser())?.passiSorgente
  const righe = await leggiPassi(da, a, sorgente)
  if (!righe.length) return 0
  await ensureHabits()
  const { getHabitValue } = await import('../db/habits')
  let scritti = 0
  for (const r of righe) {
    if (r.passi > 0) {
      // 'whoop' o 'healthConnect': il grafico mostra solo le barre del WHOOP, e
      // senza questa distinzione non potrebbe saperlo.
      await setHabitValue(STEPS, r.date, r.passi, /whoop/i.test(r.da ?? '') ? 'whoop' : 'healthConnect', nomeSorgente(r.nome ?? r.da))
      scritti++; continue
    }
    // Zero: si corregge solo se quel giorno era stato scritto in automatico.
    // Un valore messo da te non lo cancella nessuno.
    const gia = await getHabitValue(STEPS, r.date)
    if (gia && gia.source !== 'manual' && gia.value !== 0) await setHabitValue(STEPS, r.date, 0, 'healthConnect')
  }
  return scritti
}

/** Un'app che scrive passi in Health Connect. */
export interface SorgentePassi { id: string; nome: string; passi: number }

/**
 * Chi ha scritto i passi degli ultimi giorni.
 *
 * I nomi tecnici delle app non si indovinano: se sbagliassi il nome del WHOOP
 * leggeresti zero passi senza capire perche'. Qui si chiede a Health Connect
 * chi c'e' davvero, e si mostrano i nomi veri con quanto ha scritto ciascuno —
 * cosi' la scelta si fa guardando i numeri.
 */
export async function sorgentiPassi(giorni = 7): Promise<SorgentePassi[]> {
  const h = await health()
  if (!h?.queryRecords) return []
  const a = new Date()
  const da = new Date(a.getTime() - giorni * 86_400_000)
  const r = await conTempo(
    h.queryRecords({ startDate: da.toISOString(), endDate: a.toISOString(), dataType: 'steps' }),
    15_000, 'Non riesco a vedere chi scrive i passi.',
  )
  const per = new Map<string, SorgentePassi>()
  for (const x of r.records ?? []) {
    const id = x.sourceBundleId
    if (!id) continue
    const gia = per.get(id)
    if (gia) gia.passi += Math.round(x.value)
    else per.set(id, { id, nome: nomeSorgente(x.sourceName?.trim() || id), passi: Math.round(x.value) })
  }
  return [...per.values()].sort((p, q) => q.passi - p.passi)
}

/**
 * I dati grezzi, come arrivano davvero da Health Connect.
 *
 * Tre tentativi sbagliati di fila sono nati tutti dalla stessa cosa: ho
 * ipotizzato che forma avessero gli orari invece di guardarli. Questo li
 * stampa senza toccarli — la stringa esatta, il valore, chi l'ha scritto — e
 * accanto mette cosa restituisce l'aggregato per la stessa giornata. Con questi
 * due numeri davanti non c'e' piu' niente da indovinare.
 */
export async function diagnosticaPassi(giorni = 3): Promise<string> {
  const h = await health()
  if (!h) return 'Plugin non disponibile.'
  const righe: string[] = []
  const oggi = new Date()
  const da = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - (giorni - 1), 0, 0, 0, 0)
  const a = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1, 0, 0, 0, 0)

  righe.push(`fuso locale: UTC${-new Date().getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-new Date().getTimezoneOffset() / 60}`)
  righe.push(`chiesto: ${da.toISOString()} → ${a.toISOString()}`)

  try {
    const r = await conTempo(h.queryRecords({ startDate: da.toISOString(), endDate: a.toISOString(), dataType: 'steps' }), 20_000, 'record: nessuna risposta')
    const rec = r.records ?? []
    righe.push(`record: ${rec.length}`)
    for (const x of rec.slice(0, 12)) {
      righe.push(`  ${x.startDate} → ${x.endDate ?? '(fine assente)'} = ${x.value} [${x.sourceBundleId}]`)
    }
    if (rec.length > 12) righe.push(`  …e altri ${rec.length - 12}`)
  } catch (e) { righe.push(`record: ${(e as Error)?.message}`) }

  // Lo stesso giorno, chiesto all'aggregato: se i due numeri non combaciano,
  // il problema e' come il plugin ritaglia le giornate.
  for (let i = 0; i < giorni; i++) {
    const g0 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - i, 0, 0, 0, 0)
    const g1 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - i + 1, 0, 0, 0, 0)
    try {
      const r = await conTempo(h.queryAggregated({
        startDate: g0.toISOString(), endDate: g1.toISOString(), dataType: 'steps', bucket: 'day',
      }), 15_000, 'aggregato: nessuna risposta')
      const dettaglio = (r.aggregatedData ?? []).map((x) => `${x.startDate}→${x.endDate}=${Math.round(x.value)}`).join(' | ')
      righe.push(`agg ${giornoLocale(g0.toISOString())}: ${dettaglio || 'vuoto'}`)
    } catch (e) { righe.push(`agg ${giornoLocale(g0.toISOString())}: ${(e as Error)?.message}`) }
  }
  return righe.join('\n')
}

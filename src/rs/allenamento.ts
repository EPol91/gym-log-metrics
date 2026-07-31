// 🦠RS — la seduta nel formato del coach.
//
// Tu registri qui carichi e ripetizioni, una volta sola. Questo modulo prende la
// seduta del giorno, capisce a quale delle sue cinque giornate corrisponde e
// incolonna le serie sotto l'esercizio giusto — usando i nomi TUOI, che sono
// gia' agganciati ai suoi.
//
// Quello che resta tuo: stimolo, pump, tecnica, compensi, feedback di seduta.
// Sono giudizi, e inventarli vorrebbe dire far decidere il coach su un dato falso.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { SEDUTE_RS, RINOMINE } from './protocollo'

const U = LOCAL_USER_ID

export interface SerieRs { kg: number; reps: number; rir?: number }
export interface EsercizioSeduta {
  nome: string
  /** la prescrizione del coach, se questo esercizio e' nella sua scheda */
  prescrizione?: string
  serie: SerieRs[]
  /** era previsto dalla sua giornata? */
  previsto: boolean
}
export interface SedutaRs {
  /** la giornata del coach a cui somiglia di piu' (D1…D5), se ne ha una */
  codice: string | null
  nome: string | null
  esercizi: EsercizioSeduta[]
  /** quanti esercizi previsti hai davvero fatto, in percentuale */
  aderenzaLogistica: number | null
  serieTotali: number
}

interface Giornata { codice: string; nome: string; previsti: string[] }

const norm = (s: string) => s.trim().toLowerCase()

/** Gli esercizi di una sua giornata, con i nomi TUOI: l'import li ha rinominati. */
function previstiDi(s: (typeof SEDUTE_RS)[number]): string[] {
  return s.esercizi.map((e) => {
    const r = RINOMINE[e.nome]
    return r == null ? e.nome : Array.isArray(r) ? r[0] : r
  })
}

/** La giornata scritta nel nome del template da cui e' partita la seduta. */
function daTemplate(nomeTemplate: string): Giornata | null {
  const codice = nomeTemplate.match(/\bD[1-5]\b/)?.[0]
  const s = SEDUTE_RS.find((x) => x.codice === codice)
  return s ? { codice: s.codice, nome: s.nome, previsti: previstiDi(s) } : null
}

/**
 * Le sedute vecchie non dicono da dove sono partite: per quelle si guarda se la
 * lista degli esercizi e' ESATTAMENTE una delle sue giornate — tutti i suoi,
 * nessuno in piu'.
 *
 * Non e' una somiglianza, e' un'impronta. La somiglianza l'ho gia' provata e
 * sbagliava: bastava un esercizio in comune, e leg extension e squat li fai
 * anche negli allenamenti tuoi. Se manca o avanza qualcosa, la seduta e' tua.
 */
function impronta(nomiFatti: string[]): Giornata | null {
  const fatti = new Set(nomiFatti.filter(Boolean).map(norm))
  if (!fatti.size) return null
  for (const s of SEDUTE_RS) {
    const previsti = previstiDi(s)
    const suoi = new Set(previsti.map(norm))
    if (suoi.size !== fatti.size) continue
    if ([...suoi].every((p) => fatti.has(p))) return { codice: s.codice, nome: s.nome, previsti }
  }
  return null
}

/**
 * La giornata del coach di questa seduta, se e' davvero sua.
 *
 * Il template di partenza e' una prova; l'impronta degli esercizi vale solo
 * dove la prova manca, e mai prima del giorno in cui il protocollo e' entrato
 * nell'app. Tutto il resto e' tuo.
 */
function giornataDi(sess: { srcTemplateId?: string | null; date: string }, nomi: string[], nomiTemplate: Map<string, string>, inizioRs: string | null): Giornata | null {
  const tpl = sess.srcTemplateId ? nomiTemplate.get(sess.srcTemplateId) : undefined
  if (tpl != null) return tpl.trimStart().startsWith('🦠') ? daTemplate(tpl) : null
  if (!inizioRs || sess.date < inizioRs) return null
  return impronta(nomi)
}

/** Il nome del template da cui e' partita la seduta: e' come la chiami tu. */
function nomeTuo(sess: { srcTemplateId?: string | null; type: string }, nomiTemplate: Map<string, string>): string | null {
  const tpl = sess.srcTemplateId ? nomiTemplate.get(sess.srcTemplateId) : undefined
  return tpl && !tpl.trimStart().startsWith('🦠') ? tpl : null
}

/**
 * Da quando il protocollo esiste dentro l'app: il giorno dell'import.
 *
 * Non la settimana 1 del coach — quella e' una data che scegli tu e che puo'
 * stare nel futuro, mentre le sue sedute le stai gia' facendo. Qui serve un
 * fatto, e il fatto e' che prima dell'import quelle schede non c'erano: tutto
 * cio' che hai allenato prima e' roba tua.
 */
async function inizioProtocollo(): Promise<string | null> {
  const u = await db.users.get(U)
  if (u?.rsActive === false) return null
  const suoi = (await db.templates.where('userId').equals(U).toArray())
    .filter((t) => t.name.trimStart().startsWith('🦠'))
    .map((t) => t.createdAt)
    .sort()
  return suoi.length ? suoi[0].slice(0, 10) : null
}

async function templateNames(): Promise<Map<string, string>> {
  return new Map((await db.templates.where('userId').equals(U).toArray()).map((t) => [t.id, t.name]))
}

/** La seduta del giorno, pronta per il coach. */
export async function sedutaRs(date: string): Promise<SedutaRs | null> {
  const sessioni = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.date === date && s.finishedAt)
  if (!sessioni.length) return null

  const esercizi: EsercizioSeduta[] = []
  const tuttiEsercizi = await db.exercises.where('userId').equals(U).toArray()

  for (const sess of sessioni) {
    const entrate = (await db.exerciseEntries.where('userId').equals(U).toArray())
      .filter((e) => e.sessionId === sess.id)
      .sort((a, b) => a.order - b.order)
    for (const e of entrate) {
      const ex = tuttiEsercizi.find((x) => x.id === e.exerciseId)
      if (!ex) continue
      const sets = (await db.sets.where('entryId').equals(e.id).toArray())
        .filter((s) => !s.isWarmup)
        .sort((a, b) => a.order - b.order)
      // La prescrizione sta nelle note dell'esercizio, dove l'ha messa l'import.
      const riga = (ex.settings ?? '').split('\n').find((r) => r.trimStart().startsWith('🦠'))
      esercizi.push({
        nome: ex.name,
        prescrizione: riga?.replace(/^🦠\s*/, ''),
        serie: sets.map((s) => ({ kg: s.weight, reps: s.reps, ...(s.rir != null ? { rir: s.rir } : {}) })),
        previsto: false,
      })
    }
  }

  const nomiTpl = await templateNames()
  const inizio = await inizioProtocollo()
  const nomi = esercizi.map((e) => e.nome)
  const g = sessioni.map((s) => giornataDi(s, nomi, nomiTpl, inizio)).find(Boolean) ?? null
  if (g) {
    const previsti = new Set(g.previsti.map((p) => p.trim().toLowerCase()))
    for (const e of esercizi) e.previsto = previsti.has(e.nome.trim().toLowerCase())
  }

  const fattiPrevisti = esercizi.filter((e) => e.previsto && e.serie.length > 0).length
  return {
    codice: g?.codice ?? null,
    nome: g?.nome ?? null,
    esercizi,
    aderenzaLogistica: g ? Math.round((fattiPrevisti / g.previsti.length) * 100) : null,
    serieTotali: esercizi.reduce((s, e) => s + e.serie.length, 0),
  }
}

/** Una riga di testo per seduta: serve alla nota e all'anteprima. */
export function riassunto(s: SedutaRs): string {
  const parti = s.esercizi
    .filter((e) => e.serie.length)
    .map((e) => `${e.nome}: ${e.serie.map((x) => `${x.kg}×${x.reps}`).join(', ')}`)
  return parti.join(' · ')
}

export interface GiornoCalendario {
  date: string
  /** orario registrato dall app, correggibile a mano dal dettaglio seduta */
  dalle: string
  alle: string | null
  /** nome della seduta: quella del coach se riconosciuta, altrimenti la tua */
  nome: string
  /** viene dal protocollo del coach */
  delCoach: boolean
  serie: number
}

/**
 * Le sedute di un periodo, con dentro cosa hai fatto.
 *
 * Una passata sola su tutte le tabelle invece di una interrogazione per giorno:
 * il calendario copre un mese e chiedere trenta volte le stesse cose lo
 * renderebbe lento proprio dove deve solo apparire.
 */
export async function calendario(da: string, a: string): Promise<GiornoCalendario[]> {
  const sessioni = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.date >= da && s.date <= a && s.finishedAt)
  if (!sessioni.length) return []

  const ids = new Set(sessioni.map((s) => s.id))
  const entrate = (await db.exerciseEntries.where('userId').equals(U).toArray()).filter((e) => ids.has(e.sessionId))
  const esercizi = await db.exercises.where('userId').equals(U).toArray()
  const perId = new Map(esercizi.map((e) => [e.id, e.name]))
  const sets = await db.sets.where('userId').equals(U).toArray()
  const serieDi = new Map<string, number>()
  for (const s of sets) serieDi.set(s.entryId, (serieDi.get(s.entryId) ?? 0) + 1)
  const nomiTpl = await templateNames()
  const inizio = await inizioProtocollo()

  const TIPI: Record<string, string> = {
    push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
    lower: 'Lower', fullbody: 'Full Body', brosplit: 'Bro Split', custom: 'Custom',
  }

  return sessioni.map((s) => {
    const mie = entrate.filter((e) => e.sessionId === s.id)
    const nomi = mie.map((e) => perId.get(e.exerciseId) ?? '')
    const g = giornataDi(s, nomi, nomiTpl, inizio)
    const ora = (iso: string | null): string | null => {
      if (!iso) return null
      const d = new Date(iso)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return {
      date: s.date,
      dalle: ora(s.startedAt) ?? '',
      alle: ora(s.finishedAt),
      // Se la seduta e' tua, si chiama come l'hai chiamata tu: il tipo
      // (Legs, Push) e' l'ultima spiaggia, non il titolo che meriti.
      nome: g?.nome ?? nomeTuo(s, nomiTpl) ?? TIPI[s.type] ?? s.type,
      delCoach: !!g,
      serie: mie.reduce((n, e) => n + (serieDi.get(e.id) ?? 0), 0),
    }
  }).sort((x, y) => x.date.localeCompare(y.date))
}

// 🦠RS — il ponte verso il coach.
//
// Tu usi l'app tua, normalmente. RS legge quello che hai già scritto e prepara
// la giornata nel formato che il coach chiede, campo per campo. Quello che
// correggi a mano vince sempre e non viene piu' toccato dal ricalcolo: senza
// questa regola l'automatismo diventerebbe un nemico, perche' ogni correzione
// sparirebbe da sola al giro dopo.
//
// Qui NON si scrive niente verso il suo sistema: quello e' l'ultimo passo, e
// aspetta il permesso di accesso. Tutto il resto e' gia' pronto per quel momento.

import { db, newId, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal } from '../util/date'
import { computeDiary } from '../db/diet'
import { getNutrition } from '../db/repo'
import { getHabitValue, STEPS } from '../db/habits'
import { whoopDay } from '../db/whoop'
import { bestE1rm } from '../metrics/metrics'
import { CAMPI, type RsCampo } from './campi'
import { statoDieta, sostituzioni } from './dieta'
import type { RsDay } from '../db/schema'

const U = LOCAL_USER_ID

// --- Calendario del protocollo ----------------------------------------------

/** Data di inizio della settimana 1: la decidi tu nelle impostazioni di RS. */
export const RS_START_DEFAULT = '2026-08-10'

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

/**
 * A che settimana e a che giorno sei, secondo il calendario del coach.
 * Lui ragiona per settimana e giorno della settimana, l'app per date: questa e'
 * l'unica traduzione, e sbagliarla vorrebbe dire scrivere nel giorno sbagliato.
 */
export function settimanaGiorno(date: string, inizio: string): { settimana: number; giorno: number; label: string } {
  const d = new Date(date + 'T00:00:00')
  const i = new Date(inizio + 'T00:00:00')
  // Il conteggio parte dal LUNEDI' della settimana d'inizio: se cominci di
  // mercoledi', giovedi' e' ancora settimana 1, non settimana 2.
  const lunedi = new Date(i)
  lunedi.setDate(i.getDate() - ((i.getDay() + 6) % 7))
  const giorni = Math.floor((d.getTime() - lunedi.getTime()) / 86400_000)
  const settimana = Math.floor(giorni / 7) + 1
  const giorno = ((d.getDay() + 6) % 7) + 1 // 1 = lunedi
  return { settimana, giorno, label: `Settimana ${settimana} · ${GIORNI[giorno - 1]}` }
}

// --- La giornata -------------------------------------------------------------

export type Fonte = 'auto' | 'mio' | 'vuoto'
export interface RsValore { valore: string | null; fonte: Fonte }
export type RsGiornata = Record<RsCampo, RsValore>

/** La riga RS di una data, se esiste. */
export function rsDay(date: string = todayLocal()) {
  return db.rsDays.where('date').equals(date).filter((r) => r.userId === U).first()
}

/** Da 0-100 (le nostre scale) a 1-5 (le sue). Non e' una conversione a perdere:
 *  il check ha cinque gradini, esattamente come lui. */
const a5 = (v: number) => String(Math.min(5, Math.max(1, Math.round(v / 25) + 1)))
/** DOMS al contrario: da noi 100 = nessun indolenzimento, da lui 5 = massimo. */
const a5inv = (v: number) => String(Math.min(5, Math.max(1, 5 - Math.round(v / 25))))

const num = (v: number | null | undefined, dec = 0): string | null =>
  v == null || Number.isNaN(v) ? null : String(Math.round(v * 10 ** dec) / 10 ** dec)

const oraDi = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Quanto la giornata si avvicina al piano: media degli scarti su calorie e
 * macro. E' la "precisione" che chiede il coach, e con le sostituzioni ha senso
 * calcolarla sui macro e non sulle righe — mangiare patate al posto del riso non
 * ti fa meno preciso se i numeri tornano.
 */
function precisione(t: { kcal: number; protein: number; carbs: number; fat: number },
  o: { kcal: number; protein: number; carbs: number; fat: number }): number | null {
  const coppie: [number, number][] = [[t.kcal, o.kcal], [t.protein, o.protein], [t.carbs, o.carbs], [t.fat, o.fat]]
  const valide = coppie.filter(([, ob]) => ob > 0)
  if (!valide.length) return null
  const scarti = valide.map(([re, ob]) => Math.min(1, Math.abs(re - ob) / ob))
  return Math.round((1 - scarti.reduce((a, b) => a + b, 0) / scarti.length) * 100)
}

/**
 * C'e' stato un record in queste sedute? Si guarda il massimale stimato di ogni
 * esercizio e lo si confronta con tutte le volte precedenti: e' lo stesso metro
 * che usa il Coach quando ti dice "PR su…", quindi le due cose non possono
 * raccontarti storie diverse.
 */
async function haPr(seduteOggi: string[], tutte: { id: string; date: string; finishedAt: string | null }[], date: string): Promise<boolean> {
  const entrateOggi = (await db.exerciseEntries.where('userId').equals(U).toArray())
    .filter((e) => seduteOggi.includes(e.sessionId))
  if (!entrateOggi.length) return false

  const primaDiOggi = new Set(tutte.filter((s) => s.date < date && s.finishedAt).map((s) => s.id))
  const entratePrima = (await db.exerciseEntries.where('userId').equals(U).toArray())
    .filter((e) => primaDiOggi.has(e.sessionId))

  const megliodi = async (entrate: typeof entrateOggi, exerciseId: string): Promise<number> => {
    let max = 0
    for (const e of entrate.filter((x) => x.exerciseId === exerciseId)) {
      max = Math.max(max, bestE1rm(await db.sets.where('entryId').equals(e.id).toArray()))
    }
    return max
  }

  for (const e of entrateOggi) {
    const oggi = bestE1rm(await db.sets.where('entryId').equals(e.id).toArray())
    if (oggi <= 0) continue
    if (oggi > await megliodi(entratePrima, e.exerciseId)) return true
  }
  return false
}

/** I valori che l'app sa calcolare da sola. Quelli che restano tuoi non compaiono qui. */
async function calcolati(date: string): Promise<Partial<Record<RsCampo, string | null>>> {
  const out: Partial<Record<RsCampo, string | null>> = {}

  const misura = await db.bodyMeasurements.where('date').equals(date).filter((m) => m.userId === U).first()
  out.peso = num(misura?.weight, 1)

  // Quando segui una giornata del coach, a lui va SOLO quello che hai spuntato:
  // il tuo diario resta pieno, il suo conteggio conta il mangiato. Fuori dal
  // piano vale il diario intero, che e' l'unica cosa che esiste.
  const stato = await statoDieta(date)
  const t = stato.attiva ? stato.versoIlCoach : (await computeDiary(date)).totals
  const haCibo = t.kcal > 0
  out.kcal = haCibo ? num(t.kcal) : null
  out.cho = haCibo ? num(t.carbs) : null
  out.pro = haCibo ? num(t.protein) : null
  out.fat = haCibo ? num(t.fat) : null

  const nutri = await getNutrition(date)
  out.acqua = num(nutri?.water, 1)
  out.sale = num(nutri?.salt, 1)

  if (stato.attiva) {
    // Precisione e pasti extra escono dalle spunte: e' la tua idea, ed e' il
    // modo piu' onesto — una sostituzione non ti rende meno preciso se i macro
    // tornano, e un'aggiunta fuori piano e' un pasto extra per definizione.
    if (stato.precisione != null) out.precisione = num(stato.precisione)
    out.pasti_extra = num(stato.pastiExtra)
  } else if (haCibo && nutri?.dayType) {
    // Giornata tua: la precisione si misura comunque contro i tuoi obiettivi.
    const tipo = (await db.dayTypes.where('userId').equals(U).toArray()).find((d) => d.key === nutri.dayType)
    if (tipo) out.precisione = num(precisione(t, tipo.targets))
  }

  const passi = await getHabitValue(STEPS, date)
  out.passi = num(passi?.value)

  const cardio = await db.cardio.where('date').equals(date).filter((c) => c.userId === U).toArray()
  if (cardio.length) {
    out.cardio_min = num(cardio.reduce((s, c) => s + (c.durationMin || 0), 0))
    const bpm = cardio.map((c) => c.avgBpm).filter((x): x is number => x != null)
    out.cardio_fc = bpm.length ? num(bpm.reduce((a, b) => a + b, 0) / bpm.length) : null
  }

  const tutte = await db.sessions.where('userId').equals(U).toArray()
  const sedute = tutte.filter((s) => s.date === date && s.finishedAt)
  if (sedute.length) {
    out.workout = sedute.map((s) => s.type).join(' · ')
    // "Aumento prestazione": un massimale stimato che supera tutti quelli
    // precedenti sullo stesso esercizio. Se ti sei allenato e non e' successo,
    // la risposta e' No — non vuoto: il coach deve poter distinguere.
    out.perf_up = (await haPr(sedute.map((s) => s.id), tutte, date)) ? 'S' : 'N'
  }

  const check = (await db.readinessChecks.where('userId').equals(U).toArray()).find((c) => c.date === date)
  if (check?.check) {
    out.energia = a5(check.check.energy)
    if (check.check.soreness != null) out.doms = a5inv(check.check.soreness)
  }

  const w = await whoopDay(date)
  out.durata_sonno = num(w?.sleepHours, 2)
  out.hrv = num(w?.hrv, 1)
  if (w?.sleepPerf != null) out.qualita_sonno = a5(w.sleepPerf)
  out.ora_letto = oraDi(w?.sleepStart)
  out.ora_sveglia = oraDi(w?.sleepEnd)

  return out
}

/** La giornata come la vedrebbe il coach: valore, e da dove arriva. */
export async function computeRs(date: string): Promise<RsGiornata> {
  const riga = await rsDay(date)
  const miei = riga?.overrides ?? {}
  const auto = await calcolati(date)

  const out = {} as RsGiornata
  for (const c of CAMPI) {
    const mio = miei[c.key]
    if (mio != null && mio !== '') { out[c.key] = { valore: mio, fonte: 'mio' }; continue }
    const a = auto[c.key]
    out[c.key] = a != null && a !== '' ? { valore: a, fonte: 'auto' } : { valore: null, fonte: 'vuoto' }
  }
  return out
}

/** Quanti campi si sono compilati da soli e quanti aspettano te. */
export function conteggio(g: RsGiornata): { auto: number; miei: number; vuoti: number } {
  const v = Object.values(g)
  return {
    auto: v.filter((x) => x.fonte === 'auto').length,
    miei: v.filter((x) => x.fonte === 'mio').length,
    vuoti: v.filter((x) => x.fonte === 'vuoto').length,
  }
}

// --- Scrittura ---------------------------------------------------------------

async function assicuraRiga(date: string): Promise<RsDay> {
  const trovata = await rsDay(date)
  if (trovata) return trovata
  const ts = nowISO()
  const riga: RsDay = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, date, overrides: {} }
  await db.rsDays.add(riga)
  return riga
}

/** Scrive un valore tuo. Vince sul calcolo finche' non lo rimetti in automatico. */
export async function setRs(date: string, campo: RsCampo, valore: string): Promise<void> {
  const riga = await assicuraRiga(date)
  const overrides = { ...riga.overrides, [campo]: valore }
  await db.rsDays.update(riga.id, { overrides, updatedAt: nowISO(), stato: riga.stato === 'inviato' ? 'modificato' : riga.stato })
}

/** Ridà il campo all'automatico. */
export async function resetRs(date: string, campo: RsCampo): Promise<void> {
  const riga = await rsDay(date)
  if (!riga) return
  const overrides = { ...riga.overrides }
  delete overrides[campo]
  await db.rsDays.update(riga.id, { overrides, updatedAt: nowISO() })
}

/** La nota della giornata: la tua, se l'hai scritta. */
export async function setNotaRs(date: string, nota: string): Promise<void> {
  const riga = await assicuraRiga(date)
  await db.rsDays.update(riga.id, { nota, updatedAt: nowISO() })
}

/**
 * La nota composta dai fatti del giorno. Niente aggettivi e niente sensazioni
 * inventate: solo quello che e' successo davvero, perche' il coach su quella
 * riga ci decide.
 */
export async function notaAutomatica(date: string): Promise<string> {
  const g = await computeRs(date)
  const pezzi: string[] = []
  if (g.workout.valore) pezzi.push(`${g.workout.valore} completata`)
  if (g.kcal.valore) {
    const nutri = await getNutrition(date)
    const tipo = nutri?.dayType
      ? (await db.dayTypes.where('userId').equals(U).toArray()).find((d) => d.key === nutri.dayType)
      : null
    pezzi.push(tipo ? `${g.kcal.valore} kcal contro ${tipo.targets.kcal} previste` : `${g.kcal.valore} kcal`)
  }
  if (g.durata_sonno.valore) {
    const ore = Number(g.durata_sonno.valore)
    const h = Math.floor(ore), m = Math.round((ore - h) * 60)
    pezzi.push(`Sonno ${h}h${String(m).padStart(2, '0')}`)
  }
  // Le sostituzioni vanno dette: il coach quella cosa la deve vedere, e' un dato
  // utile e non una macchia. "Riso → patate" spiega meta' dei numeri del giorno.
  const cambi = await sostituzioni(date)
  if (cambi.length) pezzi.push(`Sostituito ${cambi.join(', ')}`)

  const w = await whoopDay(date)
  if (w?.recovery != null) pezzi.push(`recupero ${w.recovery}%`)
  return pezzi.join('. ') + (pezzi.length ? '.' : '')
}

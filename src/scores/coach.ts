// Coach euristico della Home. Nessuna AI: solo regole sui dati già presenti nel DB.
//
// TONO — regola non negoziabile:
//  · `fact`   = quello che dicono i tuoi numeri. Neutro, misurato, nessun giudizio.
//  · `advice` = facoltativo, mostrato come "Consiglio: …". Mai imperativo, mai una
//               verità assoluta: l'utente legge e decide da sé.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { bestE1rm, isWorkingSet, tonnage } from '../metrics/metrics'
import type { SetEntry, WorkoutSession } from '../db/schema'
import type { HomeData } from './dashboardScores'

const U = LOCAL_USER_ID
const DAY = 86_400_000
const todayISO = () => new Date().toISOString().slice(0, 10)
const dayOf = (d: string) => new Date(d + 'T00:00:00').getTime()

export interface CoachLine { fact: string; advice?: string }

async function setsOfSession(sessionId: string): Promise<SetEntry[]> {
  const entries = await db.exerciseEntries.where({ sessionId }).toArray()
  let sets: SetEntry[] = []
  for (const e of entries) sets = sets.concat(await db.sets.where({ entryId: e.id }).toArray())
  return sets
}

/** Serie di e1RM per esercizio, una voce per seduta, dalla più vecchia. */
async function e1rmSeries(): Promise<Map<string, { name: string; points: { t: number; v: number }[] }>> {
  const out = new Map<string, { name: string; points: { t: number; v: number }[] }>()
  const sessions = new Map((await db.sessions.where('userId').equals(U).toArray()).map((s) => [s.id, s]))
  const entries = await db.exerciseEntries.toArray()
  const exercises = new Map((await db.exercises.where('userId').equals(U).toArray()).map((e) => [e.id, e]))
  for (const en of entries) {
    const s = sessions.get(en.sessionId)
    const ex = exercises.get(en.exerciseId)
    if (!s || !ex || !s.finishedAt) continue
    const sets = (await db.sets.where({ entryId: en.id }).toArray()).filter(isWorkingSet)
    if (!sets.length) continue
    const v = bestE1rm(sets)
    if (!v) continue
    if (!out.has(ex.id)) out.set(ex.id, { name: ex.name, points: [] })
    out.get(ex.id)!.points.push({ t: dayOf(s.date), v })
  }
  for (const rec of out.values()) rec.points.sort((a, b) => a.t - b.t)
  return out
}

/** Blocco 1 — come stai oggi, dal check pre-workout scomposto. */
function todayLine(check: { sleep: number; fatigue: number; soreness?: number; energy: number } | null, readiness: number | null): CoachLine {
  if (!check || readiness == null) {
    return { fact: 'Nessun check pre-workout di oggi.', advice: 'falla, sono 15 secondi e il coach diventa più utile.' }
  }
  if (readiness >= 70) {
    return { fact: `Readiness ${readiness}: sei sopra la tua media.`, advice: 'giornata adatta a spingere, se te la senti.' }
  }
  if (readiness >= 40) {
    // Qual è la componente più bassa? Cambia solo la lettura del dato, non il verdetto.
    const parts: { key: string; v: number }[] = [
      { key: 'sleep', v: check.sleep }, { key: 'fatigue', v: check.fatigue }, { key: 'energy', v: check.energy },
    ]
    if (check.soreness != null) parts.push({ key: 'soreness', v: check.soreness })
    const worst = parts.sort((a, b) => a.v - b.v)[0].key
    if (worst === 'soreness') return { fact: `Readiness ${readiness}, il valore più basso è l'indolenzimento.`, advice: 'un riscaldamento più lungo di solito aiuta.' }
    if (worst === 'sleep') return { fact: `Readiness ${readiness}, hai dormito poco.`, advice: 'se cali a metà seduta è normale, non è un calo di forza.' }
    if (worst === 'fatigue') return { fact: `Readiness ${readiness}, fatica generale alta.`, advice: 'valuta tu se tenere il volume pieno.' }
    return { fact: `Readiness ${readiness}: sotto la tua media.`, advice: 'valuta il carico in base a come ti senti nelle prime serie.' }
  }
  return { fact: `Readiness ${readiness}: sotto la tua media.`, advice: 'valuta il carico in base a come ti senti nelle prime serie.' }
}

/** Blocco 2 — la cosa più rilevante che notano i dati (una sola, in ordine di priorità). */
async function noticeLine(home: HomeData, sessions: WorkoutSession[]): Promise<CoachLine | null> {
  const now = dayOf(todayISO())

  // 1) Carico acuto vs cronico (stesso ACWR del Readiness).
  const daily: { t: number; ton: number }[] = []
  for (const s of sessions) daily.push({ t: dayOf(s.date), ton: tonnage(await setsOfSession(s.id)) })
  const sum = (days: number) => daily.filter((d) => d.t > now - days * DAY).reduce((a, d) => a + d.ton, 0)
  const acute = sum(7) / 7, chronic = sum(28) / 28
  const historyDays = sessions.length ? Math.round((now - dayOf(sessions[0].date)) / DAY) : 0
  if (historyDays >= 14 && chronic > 0 && acute / chronic > 1.5) {
    return { fact: `Ultimi 7 giorni: carico ${(acute / chronic).toFixed(1)}× rispetto alla tua media di 4 settimane.`, advice: 'tienilo d’occhio.' }
  }

  // 2) Esercizio fermo: le ultime 3 sedute non superano il massimo precedente.
  const series = await e1rmSeries()
  for (const rec of series.values()) {
    const p = rec.points
    if (p.length < 5) continue
    const last3 = p.slice(-3), before = p.slice(0, -3)
    if (!before.length) continue
    const bestBefore = Math.max(...before.map((x) => x.v))
    const bestLast3 = Math.max(...last3.map((x) => x.v))
    if (bestLast3 <= bestBefore) {
      return { fact: `${rec.name}: e1RM fermo da 3 sedute.`, advice: 'cambiare range di ripetizioni è una delle strade.' }
    }
  }

  // 3) Trend forza in calo.
  const perf = home.performance
  if (perf.value != null && perf.reliability !== 'insufficiente' && perf.value < 40) {
    return { fact: 'Trend forza in calo nelle ultime settimane.', advice: 'capita nei cut; se dura, uno scarico è un’opzione.' }
  }

  // 4) Pausa lunga dall'ultima seduta.
  if (sessions.length) {
    const days = Math.round((now - dayOf(sessions[sessions.length - 1].date)) / DAY)
    if (days >= 5) return { fact: `${days} giorni dall'ultima seduta.` }
  }

  // 5) Peso che va contro la fase in corso.
  const phase = (await db.phases.where('userId').equals(U).toArray()).find((p) => !p.endDate)
  const meas = await db.bodyMeasurements.where('userId').equals(U).sortBy('date')
  if (phase && meas.length >= 3) {
    const last3 = meas.slice(-3)
    const delta = +(last3[2].weight - last3[0].weight).toFixed(1)
    if (phase.phase === 'cut' && delta > 0.5) return { fact: `Peso +${delta} kg su 3 misure, sei in cut.`, advice: 'se non è voluto, vale la pena guardare le calorie.' }
    if (phase.phase === 'bulk' && delta < -0.5) return { fact: `Peso ${delta} kg su 3 misure, sei in bulk.`, advice: 'se non è voluto, vale la pena guardare le calorie.' }
  }

  return null
}

/** Blocco 3 — riconoscimenti: solo fatti, nessun consiglio. */
async function creditLine(home: HomeData, sessions: WorkoutSession[]): Promise<CoachLine | null> {
  // PR nell'ultima seduta conclusa.
  const lastDone = [...sessions].reverse().find((s) => s.finishedAt)
  if (lastDone) {
    const series = await e1rmSeries()
    for (const rec of series.values()) {
      const p = rec.points
      if (p.length < 2) continue
      const last = p[p.length - 1]
      if (last.t === dayOf(lastDone.date) && last.v > Math.max(...p.slice(0, -1).map((x) => x.v))) {
        return { fact: `PR su ${rec.name} l'ultima seduta 💪` }
      }
    }
  }
  const wk = home.weekGoal
  if (wk.target > 0 && wk.done >= wk.target) return { fact: `Obiettivo settimana: ${wk.done}/${wk.target} centrato.` }
  if (wk.target > 0) return { fact: `${wk.done}/${wk.target} sedute questa settimana.` }
  if (wk.streak >= 3) return { fact: `${wk.streak} giorni di fila allenato.` }
  return null
}

/** Le righe del Coach: max 3, in ordine (oggi · cosa notano i dati · riconoscimento). */
export async function computeCoach(home: HomeData): Promise<CoachLine[]> {
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  // Il check di oggi può venire dalla Home o da una seduta odierna.
  const daily = await db.readinessChecks.where('date').equals(todayISO()).filter((r) => r.userId === U).first()
  const fromSession = [...sessions].reverse().find((s) => s.readiness && s.date === todayISO())
  const checkToday = daily?.check ?? fromSession?.readiness ?? null

  const lines: CoachLine[] = [todayLine(checkToday, home.todayReady)]
  const notice = await noticeLine(home, sessions)
  if (notice) lines.push(notice)
  const credit = await creditLine(home, sessions)
  if (credit) lines.push(credit)
  return lines
}

/** Contesto testuale per il Coach AI (opzione attivabile nel Profilo). */
export function coachPrompt(home: HomeData, lines: CoachLine[]): string {
  const facts = lines.map((l) => `- ${l.fact}`).join('\n')
  const s = (v: number | null) => (v == null ? 'n/d' : String(v))
  return `Sei il coach di un bodybuilder/powerbuilder che usa questa app.
Dati di oggi:
${facts}
Score: Readiness ${s(home.readiness.value)}, Workout ${s(home.workout.value)}, Performance ${s(home.performance.value)}, Consistency ${s(home.consistency.value)}.
Obiettivo settimana: ${home.weekGoal.done}/${home.weekGoal.target}, streak ${home.weekGoal.streak} giorni.

Scrivi max 3 frasi brevi in italiano. Distingui sempre il dato dal consiglio: i consigli vanno introdotti da "Consiglio:" e non devono mai essere imperativi né presentati come verità certe — l'atleta decide da sé. Niente motivazione generica: parla solo dei suoi numeri.`
}

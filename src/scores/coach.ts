// Coach euristico della Home. Nessuna AI: solo regole sui dati già presenti nel DB.
//
// TONO — regola non negoziabile:
//  · `fact`   = quello che dicono i tuoi numeri. Neutro, misurato, nessun giudizio.
//  · `advice` = facoltativo, mostrato come "Consiglio: …". Mai imperativo, mai una
//               verità assoluta: l'utente legge e decide da sé.
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal } from '../util/date'
import { fmtOre } from '../util/format'
import { bestE1rm, isWorkingSet, tonnage } from '../metrics/metrics'
import type { SetEntry, WorkoutSession } from '../db/schema'
import type { HomeData } from './dashboardScores'
import type { CoachBlock, WhoopDay } from '../db/schema'

/** Blocchi attivi per difetto: tutti tranne la nutrizione, che si accende dal Profilo. */
export const COACH_BLOCKS_DEFAULT: CoachBlock[] = ['salute', 'carico', 'allenamento', 'riconoscimenti']

const U = LOCAL_USER_ID
const DAY = 86_400_000
const todayISO = () => todayLocal()
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
  if (wk.target > 0 && wk.done >= wk.target) return { fact: `Obiettivo del ciclo centrato: ${wk.done}/${wk.target}.` }
  if (wk.target > 0) return { fact: `${wk.done}/${wk.target} sedute in questo ciclo, giorno ${wk.giorno} di ${wk.giorni}.` }
  if (wk.streak >= 3) return { fact: `${wk.streak} giorni di fila allenato.` }
  return null
}


// --- Salute: quello che dicono recupero, sonno e HRV --------------------------

/** Media di un campo sulle giornate WHOOP disponibili, esclusa quella di oggi. */
function mediaWhoop(giorni: WhoopDay[], f: (d: WhoopDay) => number | undefined): number | null {
  const v = giorni.map(f).filter((x): x is number => x != null)
  return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/**
 * Blocco salute: il sensore parla per primo, perché è il dato che condiziona
 * tutto il resto della giornata. Le soglie sono le TUE medie, non numeri da manuale.
 */
async function healthLine(): Promise<CoachLine | null> {
  const giorni = (await db.whoopDays.where('userId').equals(U).toArray())
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!giorni.length) return null

  const oggi = giorni[giorni.length - 1]
  const dOggi = oggi.date === todayISO() ? oggi : null
  const storico = giorni.filter((g) => g.date !== todayISO())

  // 1) Recupero di oggi. Con almeno cinque giorni alle spalle il confronto è con
  //    la TUA media; prima di allora si usano le fasce di WHOOP, che è meglio di
  //    tacere e lasciarti pensare che il coach sia rotto.
  const mediaRec = mediaWhoop(storico, (d) => d.recovery)
  if (dOggi?.recovery != null && mediaRec == null) {
    const r = dOggi.recovery
    if (r < 34) {
      return {
        fact: `Recupero ${r}%: fascia rossa di WHOOP.`,
        advice: 'una seduta più corta rende spesso più di una saltata.',
      }
    }
    if (r >= 67) {
      return {
        fact: `Recupero ${r}%: fascia verde di WHOOP.`,
        advice: 'se c\'è un giorno per il carico pesante, di solito è questo.',
      }
    }
    return {
      fact: `Recupero ${r}%: fascia gialla di WHOOP.`,
      advice: 'con qualche giorno in più di storico il confronto sarà con la tua media, non con le fasce.',
    }
  }
  if (dOggi?.recovery != null && mediaRec != null) {
    const scarto = dOggi.recovery - mediaRec
    if (scarto <= -12) {
      return {
        fact: `Recupero ${dOggi.recovery}%, sotto la tua media di ${Math.round(mediaRec)}%.`,
        advice: 'una seduta più corta rende spesso più di una saltata.',
      }
    }
    if (scarto >= 12) {
      return {
        fact: `Recupero ${dOggi.recovery}%, sopra la tua media di ${Math.round(mediaRec)}%.`,
        advice: 'se c\'è un giorno per il carico pesante, di solito è questo.',
      }
    }

    // Giornata nella norma. Prima qui si taceva, e un blocco che parla solo agli
    // estremi sembra spento: se il dato c'è, va detto anche quando è ordinario.
    const mediaSonnoOggi = mediaWhoop(storico, (d) => d.sleepHours)
    const pocoSonno = mediaSonnoOggi != null && dOggi.sleepHours != null && dOggi.sleepHours < mediaSonnoOggi - 0.5
    return {
      fact: `Recupero ${dOggi.recovery}%, in linea con la tua media di ${Math.round(mediaRec)}%.`
        + (pocoSonno ? ` Stanotte ${fmtOre(dOggi.sleepHours)} contro una media di ${fmtOre(mediaSonnoOggi!)}.` : ''),
      ...(pocoSonno ? { advice: 'se cali a metà seduta, la spiegazione è probabilmente lì.' } : {}),
    }
  }

  // 2) Debito di sonno: tre notti sotto la media spiegano molte cose.
  const mediaSonno = mediaWhoop(storico, (d) => d.sleepHours)
  const ultime3 = giorni.slice(-3).map((g) => g.sleepHours).filter((x): x is number => x != null)
  if (mediaSonno != null && ultime3.length === 3 && ultime3.every((h) => h < mediaSonno - 0.5)) {
    const tot = Math.round((mediaSonno * 3 - ultime3.reduce((a, b) => a + b, 0)) * 60)
    return {
      fact: `Tre notti sotto la tua media: ${tot} minuti di sonno in meno.`,
      advice: 'se cali a metà seduta, la spiegazione è probabilmente questa.',
    }
  }

  // 3) HRV in discesa sulla settimana.
  const hrv = giorni.slice(-14).map((g) => g.hrv).filter((x): x is number => x != null)
  if (hrv.length >= 10) {
    const prima = hrv.slice(0, Math.floor(hrv.length / 2))
    const dopo = hrv.slice(Math.floor(hrv.length / 2))
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    const calo = (m(prima) - m(dopo)) / m(prima)
    if (calo >= 0.12) {
      return {
        fact: `HRV in calo del ${Math.round(calo * 100)}% rispetto alla settimana prima.`,
        advice: 'spesso arriva prima della stanchezza percepita; vale la pena tenerlo d\'occhio.',
      }
    }
  }

  return null
}

// --- Nutrizione ---------------------------------------------------------------

/**
 * Blocco nutrizione: proteine e calorie contro la fase. Parla solo se hai
 * davvero registrato qualcosa — un diario vuoto non è un digiuno.
 */
async function nutritionLine(): Promise<CoachLine | null> {
  const oggi = todayISO()
  const da = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)
  const logs = (await db.foodLogs.where('userId').equals(U).toArray()).filter((l) => l.date >= da && l.date <= oggi)
  if (!logs.length) return null

  const foods = new Map((await db.foods.where('userId').equals(U).toArray()).map((f) => [f.id, f]))
  const perGiorno = new Map<string, { kcal: number; prot: number }>()
  for (const l of logs) {
    const acc = perGiorno.get(l.date) ?? { kcal: 0, prot: 0 }
    if (l.macrosSnapshot) {
      acc.kcal += l.macrosSnapshot.kcal
      acc.prot += l.macrosSnapshot.protein
    } else {
      const f = foods.get(l.foodId)
      if (f) {
        acc.kcal += (f.per100.kcal * l.grams) / 100
        acc.prot += (f.per100.protein * l.grams) / 100
      }
    }
    perGiorno.set(l.date, acc)
  }

  const meas = await db.bodyMeasurements.where('userId').equals(U).sortBy('date')
  const peso = meas.length ? meas[meas.length - 1].weight : null

  // 1) Proteine sotto 1,6 g/kg su tutti i giorni registrati.
  const giorniPieni = [...perGiorno.entries()].filter(([, v]) => v.kcal > 500)
  if (peso && giorniPieni.length >= 2) {
    const perKg = giorniPieni.map(([, v]) => v.prot / peso)
    if (perKg.every((x) => x < 1.6)) {
      const media = perKg.reduce((a, b) => a + b, 0) / perKg.length
      return {
        fact: `Proteine a ${media.toFixed(1)} g/kg negli ultimi ${giorniPieni.length} giorni registrati.`,
        advice: 'sotto 1,6 g/kg la massa magra è meno protetta, soprattutto in definizione.',
      }
    }
  }

  // 2) Calorie che vanno contro la fase.
  const fase = (await db.phases.where('userId').equals(U).toArray()).find((p) => !p.endDate)
  const tipi = await db.dayTypes.where('userId').equals(U).toArray()
  const target = tipi.map((t) => t.targets.kcal).filter((k) => k > 0).sort((a, b) => a - b)
  if (fase && giorniPieni.length >= 2 && target.length) {
    const mediaKcal = giorniPieni.reduce((a, [, v]) => a + v.kcal, 0) / giorniPieni.length
    const minimo = target[0], massimo = target[target.length - 1]
    if (fase.phase === 'cut' && mediaKcal > massimo * 1.1) {
      return {
        fact: `Media ${Math.round(mediaKcal)} kcal sui giorni registrati, sopra i tuoi obiettivi, e sei in cut.`,
        advice: 'se il peso non scende, è il primo posto dove guardare.',
      }
    }
    if (fase.phase === 'bulk' && mediaKcal < minimo * 0.9) {
      return {
        fact: `Media ${Math.round(mediaKcal)} kcal sui giorni registrati, sotto i tuoi obiettivi, e sei in bulk.`,
        advice: 'crescere con poco carburante è la parte difficile.',
      }
    }
  }

  return null
}

// --- Sforzo WHOOP contro sedute registrate ------------------------------------

/** Ti alleni sistematicamente da scarico? È la domanda che nessuna app sa fare da sola. */
async function loadVsRecoveryLine(sessions: WorkoutSession[]): Promise<CoachLine | null> {
  const giorni = await db.whoopDays.where('userId').equals(U).toArray()
  if (giorni.length < 20) return null
  const da = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)
  const recenti = giorni.filter((g) => g.date >= da && g.recovery != null)
  if (recenti.length < 10) return null

  const allenato = new Set(sessions.filter((s) => s.date >= da && s.finishedAt).map((s) => s.date))
  const scarichi = recenti.filter((g) => g.recovery! < 40)
  const scarichiAllenati = scarichi.filter((g) => allenato.has(g.date)).length
  if (scarichi.length >= 3 && scarichiAllenati >= Math.ceil(scarichi.length * 0.6)) {
    return {
      fact: `Negli ultimi 30 giorni ti sei allenato ${scarichiAllenati} volte su ${scarichi.length} giornate con recupero sotto il 40%.`,
      advice: 'non è un errore, ma vale la pena guardare se quelle sedute reggono il confronto con le altre.',
    }
  }
  return null
}

/**
 * Le righe del Coach, al massimo quattro, in ordine di priorità:
 * salute → nutrizione → carico contro recupero → allenamento → riconoscimento,
 * saltando i blocchi che hai spento nel Profilo.
 * Se una categoria non ha niente da dire cede il posto: meglio tre righe
 * che contano di quattro riempite.
 */
export async function computeCoach(home: HomeData): Promise<CoachLine[]> {
  const sessions = (await db.sessions.where('userId').equals(U).toArray())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  // Il check di oggi può venire dalla Home o da una seduta odierna.
  const daily = await db.readinessChecks.where('date').equals(todayISO()).filter((r) => r.userId === U).first()
  const fromSession = [...sessions].reverse().find((s) => s.readiness && s.date === todayISO())
  const checkToday = daily?.check ?? fromSession?.readiness ?? null

  const lines: CoachLine[] = [todayLine(checkToday, home.todayReady)]
  // Cosa il coach può guardare lo decidi tu, dal Profilo.
  const user = await db.users.get(U)
  const attivi = new Set<CoachBlock>(user?.coachBlocks ?? COACH_BLOCKS_DEFAULT)

  const candidate: [CoachBlock, CoachLine | null][] = [
    ['salute', attivi.has('salute') ? await healthLine() : null],
    ['nutrizione', attivi.has('nutrizione') ? await nutritionLine() : null],
    ['carico', attivi.has('carico') ? await loadVsRecoveryLine(sessions) : null],
    ['allenamento', attivi.has('allenamento') ? await noticeLine(home, sessions) : null],
    ['riconoscimenti', attivi.has('riconoscimenti') ? await creditLine(home, sessions) : null],
  ]
  for (const [, c] of candidate) {
    if (c && lines.length < 4) lines.push(c)
  }
  return lines
}

/** Contesto testuale per il Coach AI (opzione attivabile nel Profilo). */
export function coachPrompt(home: HomeData, lines: CoachLine[], whoop?: WhoopDay | null): string {
  const facts = lines.map((l) => `- ${l.fact}`).join('\n')
  const s = (v: number | null | undefined) => (v == null ? 'n/d' : String(v))
  const vitali = whoop
    ? `Vitali di oggi (WHOOP): recupero ${s(whoop.recovery)}%, HRV ${s(whoop.hrv)} ms, FC a riposo ${s(whoop.restingHr)}, sonno ${s(whoop.sleepHours)} h, sforzo ${s(whoop.strain)}.\n`
    : ''
  return `Sei il coach di un bodybuilder/powerbuilder che usa questa app.
Dati di oggi:
${facts}
Score: Readiness ${s(home.readiness.value)}, Workout ${s(home.workout.value)}, Performance ${s(home.performance.value)}, Consistency ${s(home.consistency.value)}.
Obiettivo del ciclo: ${home.weekGoal.done}/${home.weekGoal.target} (giorno ${home.weekGoal.giorno} di ${home.weekGoal.giorni}), streak ${home.weekGoal.streak} giorni.
${vitali}

Rispondi in italiano con TRE righe, in questo formato esatto e nient'altro:
LETTURA: <una frase su come sta oggi, coi suoi numeri>
ATTENZIONE: <una frase sull'indicatore più debole di oggi>
CONSIGLIO: <una frase, mai imperativa e mai data per certa — l'atleta decide da sé>

Una frase per riga, niente elenchi e niente paragrafi: un muro di testo non si legge. Niente motivazione generica: parla solo dei suoi numeri.`
}

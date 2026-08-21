// 🦠RS — la dieta vista con gli occhi del coach.
//
// Due numeri diversi sullo stesso giorno, e la differenza conta:
//
// - il TUO diario somma tutto quello che hai scritto, spuntato o no;
// - a lui va solo quello che hai SPUNTATO, cioe' mangiato davvero.
//
// Da qui escono i suoi campi: kcal e macro, aderenza, precisione e pasti extra.

import { db, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { computeDiary, macrosFor } from '../db/diet'
import { getNutrition } from '../db/repo'
import type { FoodLog, Macros } from '../db/schema'

const U = LOCAL_USER_ID
const ZERO: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

export interface RigaRs {
  log: FoodLog
  nome: string
  macros: Macros
  /** viene dal piano del coach */
  dalPiano: boolean
  /** e' stata cambiata rispetto a quello che aveva prescritto lui */
  sostituita: boolean
  spuntata: boolean
}

export interface StatoDieta {
  righe: RigaRs[]
  /** quante voci del piano hai onorato, spuntate o sostituite */
  aderenza: number | null
  /** quanto i macro di quello che hai mangiato si avvicinano al piano */
  precisione: number | null
  /** i totali che vanno al coach: solo lo spuntato */
  versoIlCoach: Macros
  /** grammi di sale delle righe spuntate: il coach lo chiede a parte */
  saleG: number
  /** i totali tuoi: tutto quello che hai scritto */
  tuoi: Macros
  pianoTotale: number
  pianoOnorato: number
  pastiExtra: number
  /** la giornata segue un piano del coach? senza, niente di tutto questo ha senso */
  attiva: boolean
}

const somma = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
  protein: Math.round((a.protein + b.protein) * 10) / 10,
  fat: Math.round((a.fat + b.fat) * 10) / 10,
})

/**
 * Quanto ti sei avvicinato al piano, sui macro e non sulle righe.
 * Con le sostituzioni e' l'unico modo onesto: patate al posto del riso non ti
 * rendono meno preciso se i numeri tornano.
 */
function scarto(reali: Macros, obiettivo: { kcal: number; carbs: number; protein: number; fat: number }): number | null {
  const coppie: [number, number][] = [
    [reali.kcal, obiettivo.kcal], [reali.protein, obiettivo.protein],
    [reali.carbs, obiettivo.carbs], [reali.fat, obiettivo.fat],
  ]
  const valide = coppie.filter(([, o]) => o > 0)
  if (!valide.length) return null
  const scarti = valide.map(([r, o]) => Math.min(1, Math.abs(r - o) / o))
  return Math.round((1 - scarti.reduce((a, b) => a + b, 0) / scarti.length) * 100)
}

/** Lo stato della giornata: righe, spunte e i due totali. */
export async function statoDieta(date: string): Promise<StatoDieta> {
  const diario = await computeDiary(date)
  const nutri = await getNutrition(date)
  const tipo = nutri?.dayType
    ? (await db.dayTypes.where('userId').equals(U).toArray()).find((d) => d.key === nutri.dayType)
    : null
  const attiva = !!tipo?.name.startsWith('🦠')

  const righe: RigaRs[] = []
  for (const m of diario.meals) {
    for (const e of m.entries) {
      const piano = e.log.rsPlanned
      righe.push({
        log: e.log, nome: e.food.name, macros: e.macros,
        dalPiano: !!piano,
        sostituita: !!piano && piano.nome !== '' && piano.nome !== e.food.name,
        spuntata: !!e.log.rsDone,
      })
    }
  }

  const spuntate = righe.filter((r) => r.spuntata)
  const versoIlCoach = spuntate.reduce((acc, r) => somma(acc, r.macros), ZERO)
  // Il sale si conta come si mangia: sono i grammi delle righe «Sale» che hai
  // spuntato. Niente conversioni e niente sale nascosto negli altri alimenti —
  // al coach interessa quello che aggiungi tu.
  const saleG = Math.round(spuntate.filter((r) => /^sale/i.test(r.nome.trim()))
    .reduce((a, r) => a + r.log.grams, 0) * 10) / 10
  const delPiano = righe.filter((r) => r.dalPiano)
  const onorate = delPiano.filter((r) => r.spuntata)

  // "Pasti extra" e' un conto di PASTI, non di righe: il gelato della sera e'
  // un pasto in piu', un'aggiunta dentro il pranzo no.
  const pastiExtra = diario.meals.filter((m) =>
    m.entries.length > 0 && m.entries.every((e) => !e.log.rsPlanned)).length

  return {
    righe,
    aderenza: delPiano.length ? Math.round((onorate.length / delPiano.length) * 100) : null,
    precisione: tipo ? scarto(versoIlCoach, tipo.targets) : null,
    versoIlCoach, saleG, tuoi: diario.totals,
    pianoTotale: delPiano.length, pianoOnorato: onorate.length,
    pastiExtra, attiva,
  }
}

// --- Azioni ------------------------------------------------------------------

/** Spunta o toglie la spunta a una riga. */
export async function spunta(logId: string, valore: boolean): Promise<void> {
  await db.foodLogs.update(logId, { rsDone: valore, updatedAt: nowISO() })
}

/** Spunta tutte le righe indicate: "tutto seguito" di un pasto o della giornata. */
export async function spuntaTutte(logIds: string[], valore: boolean): Promise<void> {
  const ts = nowISO()
  for (const id of logIds) await db.foodLogs.update(id, { rsDone: valore, updatedAt: ts })
}

/**
 * Sostituisci quello che il coach aveva previsto con quello che hai mangiato.
 * La voce resta ONORATA — hai seguito il piano con un'alternativa — e i macro
 * che vanno a lui sono quelli veri, non quelli del cibo che non hai mangiato.
 */
export async function sostituisci(logId: string, foodId: string, grams: number): Promise<void> {
  const log = await db.foodLogs.get(logId)
  if (!log) return
  const cibo = await db.foods.get(foodId)
  if (!cibo) return
  /*
   * Si riscrive la riga intera, non si aggiorna.
   *
   * Se prima era diventata una ricetta, i suoi campi vanno tolti — nome e macro
   * fotografati, porzioni — o resta una riga meta' e meta': l'alimento nuovo
   * sotto e il nome della ricetta a schermo. E `update` con i campi a
   * `undefined` non li toglie: Dexie li ignora e basta.
   */
  const { recipeId, portions, nameSnapshot, macrosSnapshot, ...resto } = log
  void recipeId; void portions; void nameSnapshot; void macrosSnapshot
  await db.foodLogs.put({
    ...resto,
    foodId, grams,
    // Il piano originale NON si perde: e' quello che rende la riga una
    // sostituzione invece di una voce qualsiasi. Ma su una riga TUA non si
    // inventa: senza prescrizione la riga resta una voce tua, e non entra nei
    // conti dell'aderenza.
    ...(log.rsPlanned ? { rsPlanned: log.rsPlanned, rsDone: true } : {}),
    updatedAt: nowISO(),
  })
}

/**
 * Sostituisce una riga con una RICETTA.
 *
 * Il pane arabo del coach diventa una porzione della tua focaccia: e' la stessa
 * sostituzione di prima, solo che al posto di un alimento c'e' una ricetta —
 * con le sue porzioni e i suoi macro fotografati, come quando la aggiungi dal
 * ricettario. Il piano del coach resta scritto sotto, come sempre.
 */
export async function sostituisciConRicetta(
  logId: string,
  ricetta: { id: string; nome: string; porzioni?: number; grammi: number; macros: Macros },
): Promise<void> {
  const log = await db.foodLogs.get(logId)
  if (!log) return
  await db.foodLogs.update(logId, {
    recipeId: ricetta.id,
    // La riga non e' piu' un alimento: l'alimento di prima non deve restare
    // agganciato, o il diario continuerebbe a contarne i macro.
    foodId: '',
    grams: ricetta.grammi,
    ...(ricetta.porzioni != null ? { portions: ricetta.porzioni } : {}),
    nameSnapshot: ricetta.nome,
    macrosSnapshot: ricetta.macros,
    // Come sopra: la prescrizione si tiene se c'era, non si inventa.
    ...(log.rsPlanned ? { rsPlanned: log.rsPlanned, rsDone: true } : {}),
    updatedAt: nowISO(),
  })
}

/** Le sostituzioni del giorno, in chiaro: finiscono nella nota per il coach. */
export async function sostituzioni(date: string): Promise<string[]> {
  const s = await statoDieta(date)
  return s.righe.filter((r) => r.sostituita)
    .map((r) => `${r.log.rsPlanned!.nome} → ${r.nome} ${r.log.grams} g`)
}

/** I macro di una riga se fosse mangiata come prescritta: serve all'anteprima. */
export async function macroPrevisti(log: FoodLog): Promise<Macros> {
  const cibo = await db.foods.get(log.foodId)
  return cibo ? macrosFor(cibo.per100, log.grams) : ZERO
}

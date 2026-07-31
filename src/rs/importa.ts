// 🦠RS — porta dentro il protocollo del coach.
//
// Regola che vale ovunque in RS: **non si sostituisce mai niente**. Le tue
// giornate, i tuoi template e i tuoi alimenti restano dove sono. Quello che
// arriva da qui si aggiunge e porta il 🦠 nel nome, cosi' si distingue senza
// leggere due volte — tranne gli alimenti, che restano alimenti normali:
// il virus davanti a "Fiocchi d'avena" darebbe solo fastidio in libreria.
//
// Rifarlo non duplica: aggiorna quello che esiste gia' e aggiunge il resto.

import { db, newId, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { addFood, macrosFor } from '../db/diet'
import { getOrCreateExercise, findExercise } from '../db/repo'
import { ALIMENTI_RS, GIORNATE_RS, SEDUTE_RS, RINOMINE } from './protocollo'
import type { DayTemplate, DayTemplateMeal, Food, Macros, MuscleGroup, WorkoutTemplate, WorkoutType } from '../db/schema'

const U = LOCAL_USER_ID
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const VUOTO: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

export interface EsitoImport {
  alimentiCreati: string[]
  alimentiRiusati: string[]
  daCompletare: string[]
  giornate: string[]
  sedute: string[]
  eserciziCreati: number
}

/**
 * Gli alimenti del piano: quelli che hai gia' si riusano (il tuo valore vince,
 * anche se diverso dal mio), gli altri si creano. Dove il valore non c'e'
 * l'alimento nasce comunque, a zero, e finisce nell'elenco "da completare":
 * meglio una casella vuota che un numero inventato che poi va al coach.
 */
async function alimenti(): Promise<{ mappa: Map<string, Food>; esito: Pick<EsitoImport, 'alimentiCreati' | 'alimentiRiusati' | 'daCompletare'> }> {
  const esistenti = await db.foods.where('userId').equals(U).toArray()
  const perNome = new Map(esistenti.map((f) => [norm(f.name), f]))
  const mappa = new Map<string, Food>()
  const creati: string[] = [], riusati: string[] = [], daCompletare: string[] = []

  for (const a of ALIMENTI_RS) {
    const gia = perNome.get(norm(a.nome))
    if (gia) {
      mappa.set(a.nome, gia)
      riusati.push(a.nome)
      if (gia.per100.kcal === 0 && a.per100 == null) daCompletare.push(a.nome)
      continue
    }
    const id = await addFood({ name: a.nome, per100: a.per100 ?? VUOTO, source: 'mine' })
    const creato = await db.foods.get(id)
    if (creato) mappa.set(a.nome, creato)
    creati.push(a.nome)
    if (a.per100 == null) daCompletare.push(a.nome)
  }
  return { mappa, esito: { alimentiCreati: creati, alimentiRiusati: riusati, daCompletare } }
}

/** Le quattro giornate: obiettivi (tipi giornata) + pasti pronti (giornate tipo). */
async function giornate(mappa: Map<string, Food>): Promise<string[]> {
  const ts = nowISO()
  const tipiEsistenti = await db.dayTypes.where('userId').equals(U).toArray()
  const modelliEsistenti = await db.dayTemplates.where('userId').equals(U).toArray()
  const fatte: string[] = []

  // L'ordine delle sue giornate lo decide il protocollo, non l'ordine in cui
  // sono state create: LOW ON, LOW OFF, HIGH ON, HIGH OFF. Vale anche quando si
  // aggiorna, altrimenti al secondo import tornano sparse.
  const primoPosto = Math.max(0, ...tipiEsistenti.filter((t) => !t.name.startsWith('🦠')).map((t) => t.order + 1))
  for (const [i, g] of GIORNATE_RS.entries()) {
    const posto = primoPosto + i
    const tipo = tipiEsistenti.find((t) => t.key === g.key)
    if (tipo) {
      await db.dayTypes.update(tipo.id, { name: g.nome, targets: g.targets, manual: true, order: posto, updatedAt: ts })
    } else {
      await db.dayTypes.add({
        id: newId(), userId: U, createdAt: ts, updatedAt: ts,
        key: g.key, name: g.nome, targets: g.targets, manual: true, order: posto,
      })
    }

    // 2. la giornata pronta da applicare, coi grammi del coach
    const meals: DayTemplateMeal[] = g.pasti.map((p, i) => ({
      name: p.nome, order: i,
      items: p.righe.map((r) => {
        const f = mappa.get(r.alimento)
        return {
          foodId: f?.id ?? '', grams: r.g,
          nameSnapshot: r.alimento,
          macrosSnapshot: f ? macrosFor(f.per100, r.g) : VUOTO,
        }
      }),
    }))
    const modello = modelliEsistenti.find((m) => m.name === g.nome)
    if (modello) {
      await db.dayTemplates.update(modello.id, { meals, updatedAt: ts })
    } else {
      const nuovo: DayTemplate = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: g.nome, meals }
      await db.dayTemplates.add(nuovo)
    }
    fatte.push(g.nome)
  }
  return fatte
}

/**
 * La prescrizione del coach finisce fra le note dell'esercizio, insieme alle tue
 * regolazioni di sellino e schienale: e' li' che guardi mentre carichi i pesi.
 *
 * Le tue righe non si toccano MAI: la riga del coach e' l'unica che comincia col
 * 🦠 e ogni import riscrive solo quella. Se lui cambia la scheda, cambia la sua
 * riga; quello che hai scritto tu resta dov'era.
 *
 * Lo stesso esercizio in due sedute tiene DUE righe, una per seduta: capita
 * davvero (le Vulken Overhead Extensions stanno in D2 e in D5 con ripetizioni
 * diverse) e tenerne una sola vorrebbe dire perdere meta' della scheda.
 */
async function scriviPrescrizione(id: string, attuali: string | undefined, codice: string, prescrizione: string): Promise<void> {
  const riga = `🦠 ${codice} · ${prescrizione}`
  const tue = (attuali ?? '').split('\n')
    // Via le righe del coach, ma solo quelle di QUESTA seduta: lo stesso esercizio
    // puo' comparire in due giorni con prescrizioni diverse, e servono entrambe.
    .filter((r) => !r.trimStart().startsWith(`🦠 ${codice} ·`))
    .filter((r) => r.trim())
  const altre = tue.filter((r) => r.trimStart().startsWith('🦠'))
  const mie = tue.filter((r) => !r.trimStart().startsWith('🦠'))
  await db.exercises.update(id, { settings: [...mie, ...altre, riga].join('\n'), updatedAt: nowISO() })
}

/**
 * L'esercizio giusto a cui agganciare la seduta: il TUO, se lo chiami in un
 * altro modo. Il nome del coach diventa un alias, cosi' al prossimo import lo
 * ritrova da solo invece di ricreare il doppione.
 */
async function esercizioGiusto(nomeCoach: string, muscolo: MuscleGroup) {
  const alternative = RINOMINE[nomeCoach]
  const nomi = alternative == null ? [] : Array.isArray(alternative) ? alternative : [alternative]

  let scelto
  for (const n of nomi) {
    scelto = await findExercise(n)
    if (scelto) break
  }
  // Nessuno dei tuoi nomi esiste ancora: si crea col primo che hai indicato.
  if (!scelto) scelto = await getOrCreateExercise(nomi[0] ?? nomeCoach, muscolo)

  // L'alias vale in entrambi i casi, appena creato o gia' tuo: e' quello che al
  // prossimo import fa ritrovare questo esercizio invece di crearne un altro.
  if (nomi.length && !scelto.aliases.some((a) => a.toLowerCase() === nomeCoach.toLowerCase())) {
    await db.exercises.update(scelto.id, { aliases: [...scelto.aliases, nomeCoach], updatedAt: nowISO() })
  }

  // Il doppione col nome del coach, rimasto da un import precedente, non serve
  // piu': via — ma SOLO se non ha storico attaccato. Un esercizio con dentro
  // delle serie non si tocca mai, nemmeno per fare ordine.
  const id = scelto.id
  const doppione = (await db.exercises.where('userId').equals(U).toArray())
    .find((e) => e.id !== id && e.name.toLowerCase() === nomeCoach.toLowerCase())
  if (doppione) {
    const usato = await db.exerciseEntries.where('userId').equals(U).filter((e) => e.exerciseId === doppione.id).count()
    if (usato === 0) await db.exercises.delete(doppione.id)
  }

  return await db.exercises.get(id) ?? scelto
}

/**
 * Le cinque sedute. Il template dell'app tiene l'elenco degli esercizi in ordine;
 * ripetizioni, RIR e recupero stanno nelle note dell'esercizio, dove li leggi
 * mentre ti alleni.
 */
async function sedute(): Promise<{ nomi: string[]; eserciziCreati: number }> {
  const ts = nowISO()
  const esistenti = await db.templates.where('userId').equals(U).toArray()
  const primaDegliEsercizi = await db.exercises.where('userId').equals(U).count()
  const nomi: string[] = []

  for (const s of SEDUTE_RS) {
    const items = []
    for (let i = 0; i < s.esercizi.length; i++) {
      const e = s.esercizi[i]
      const ex = await esercizioGiusto(e.nome, e.muscolo as MuscleGroup)
      await scriviPrescrizione(ex.id, ex.settings, s.codice, e.prescrizione)
      items.push({ exerciseId: ex.id, order: i })
    }
    const gia = esistenti.find((t) => t.name === s.nome)
    if (gia) {
      await db.templates.update(gia.id, { items, type: s.tipo as WorkoutType, updatedAt: ts })
    } else {
      const t: WorkoutTemplate = {
        id: newId(), userId: U, createdAt: ts, updatedAt: ts,
        name: s.nome, type: s.tipo as WorkoutType, items,
      }
      await db.templates.add(t)
    }
    nomi.push(s.nome)
  }
  const dopo = await db.exercises.where('userId').equals(U).count()
  return { nomi, eserciziCreati: dopo - primaDegliEsercizi }
}

/** Import completo. Ripetibile: aggiorna invece di duplicare. */
export async function importaProtocolloRs(): Promise<EsitoImport> {
  const { mappa, esito } = await alimenti()
  const g = await giornate(mappa)
  const s = await sedute()
  return { ...esito, giornate: g, sedute: s.nomi, eserciziCreati: s.eserciziCreati }
}

/** È già stato importato? Serve a non far ripetere il giro a vuoto. */
export async function protocolloImportato(): Promise<boolean> {
  const tipi = await db.dayTypes.where('userId').equals(U).toArray()
  return GIORNATE_RS.every((g) => tipi.some((t) => t.key === g.key))
}

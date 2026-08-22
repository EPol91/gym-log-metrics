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
  /** giornate che hai corretto a mano: lasciate come stanno */
  giornateTue: string[]
  /** ...e fra quelle, quelle dove il coach ha cambiato qualcosa */
  giornateCambiate: string[]
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

/**
 * Il piano del coach su questa giornata e' cambiato?
 *
 * Si confronta con quello che lui aveva prescritto la volta scorsa — non con
 * quello che c'e' scritto adesso, che sono le tue correzioni. Nome del pasto,
 * alimento e grammi: se cambia uno di questi, la giornata e' un'altra.
 */
function diverso(vecchi: DayTemplateMeal[], nuovi: DayTemplateMeal[]): boolean {
  const impronta = (meals: DayTemplateMeal[], originale: boolean) => meals
    .map((m) => `${m.name}:${m.items.map((it) => {
      const o = originale ? it.rsOriginale : undefined
      return `${o?.nome ?? it.nameSnapshot ?? ''}@${o?.g ?? it.grams}`
    }).join(',')}`)
    .join('|')
  return impronta(vecchi, true) !== impronta(nuovi, false)
}

/** Le quattro giornate: obiettivi (tipi giornata) + pasti pronti (giornate tipo). */
async function giornate(mappa: Map<string, Food>): Promise<{ fatte: string[]; tue: string[]; cambiate: string[] }> {
  const ts = nowISO()
  const tipiEsistenti = await db.dayTypes.where('userId').equals(U).toArray()
  const modelliEsistenti = await db.dayTemplates.where('userId').equals(U).toArray()
  const fatte: string[] = []
  const tue: string[] = []
  const cambiate: string[] = []

  // L'ordine delle sue giornate lo decide il protocollo, non l'ordine in cui
  // sono state create: LOW ON, LOW OFF, HIGH ON, HIGH OFF. Vale anche quando si
  // aggiorna, altrimenti al secondo import tornano sparse.
  const primoPosto = Math.max(0, ...tipiEsistenti.filter((t) => !t.name.startsWith('🦠')).map((t) => t.order + 1))
  for (const [i, g] of GIORNATE_RS.entries()) {
    const posto = primoPosto + i
    const tipo = tipiEsistenti.find((t) => t.key === g.key)
    // Giornata corretta da te: gli obiettivi sono i totali della TUA versione,
    // non quelli del coach. Reimportare non deve rimetterli come stavano.
    const tua = modelliEsistenti.find((m) => m.name === g.nome)?.modificata === true
    if (tipo) {
      await db.dayTypes.update(tipo.id, {
        name: g.nome, order: posto, updatedAt: ts,
        ...(tua ? {} : { targets: g.targets, manual: true }),
      })
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
          // Quello che ha prescritto lui, tenuto da parte: se poi correggi la
          // riga, il confronto col piano continua a guardare questo.
          rsOriginale: { nome: r.alimento, g: r.g },
        }
      }),
    }))
    const modello = modelliEsistenti.find((m) => m.name === g.nome)
    if (modello?.modificata) {
      // L'hai corretta a mano: non si sovrascrive. Se pero' il coach ha cambiato
      // quella giornata bisogna dirlo, altrimenti resti col piano vecchio senza
      // saperlo.
      tue.push(g.nome)
      if (diverso(modello.meals, meals)) cambiate.push(g.nome)
    } else if (modello) {
      await db.dayTemplates.update(modello.id, { meals, updatedAt: ts })
    } else {
      const nuovo: DayTemplate = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: g.nome, meals }
      await db.dayTemplates.add(nuovo)
    }
    fatte.push(g.nome)
  }
  return { fatte, tue, cambiate }
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
/**
 * Una riga del coach vecchio stile: senza codice della seduta e con lo stesso
 * testo di quella che sto per scrivere. Il codice si riconosce dalla forma
 * «D2 ·»: chi non ce l'ha e' rimasto indietro, e se dice la stessa cosa e' un
 * doppione — non una prescrizione di un altro giorno.
 */
function vecchiaSenzaCodice(riga: string, prescrizione: string): boolean {
  const t = riga.trimStart()
  if (!t.startsWith('🦠')) return false
  const resto = t.slice(2).trim()
  if (/^D\d+\s*·/.test(resto)) return false
  return resto === prescrizione.trim()
}

async function scriviPrescrizione(id: string, attuali: string | undefined, codice: string, prescrizione: string): Promise<void> {
  const riga = `🦠 ${codice} · ${prescrizione}`
  const tue = (attuali ?? '').split('\n')
    // Via le righe del coach, ma solo quelle di QUESTA seduta: lo stesso esercizio
    // puo' comparire in due giorni con prescrizioni diverse, e servono entrambe.
    .filter((r) => !r.trimStart().startsWith(`🦠 ${codice} ·`))
    // E via i doppioni di prima che esistesse il codice della seduta: erano
    // scritti «🦠 @A|B · …», nessun filtro li prendeva e restavano sotto la riga
    // nuova a ripetere la stessa cosa.
    .filter((r) => !vecchiaSenzaCodice(r, prescrizione))
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
      items.push({ exerciseId: ex.id, order: i, ...(e.coppia ? { coppia: e.coppia } : {}) })
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
  return {
    ...esito,
    giornate: g.fatte, giornateTue: g.tue, giornateCambiate: g.cambiate,
    sedute: s.nomi, eserciziCreati: s.eserciziCreati,
  }
}

/** È già stato importato? Serve a non far ripetere il giro a vuoto. */
export async function protocolloImportato(): Promise<boolean> {
  const tipi = await db.dayTypes.where('userId').equals(U).toArray()
  return GIORNATE_RS.every((g) => tipi.some((t) => t.key === g.key))
}

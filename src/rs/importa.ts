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
import { getOrCreateExercise } from '../db/repo'
import { ALIMENTI_RS, GIORNATE_RS, SEDUTE_RS } from './protocollo'
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

  for (const g of GIORNATE_RS) {
    // 1. obiettivi calorici, accanto ai tuoi
    const tipo = tipiEsistenti.find((t) => t.key === g.key)
    if (tipo) {
      await db.dayTypes.update(tipo.id, { name: g.nome, targets: g.targets, manual: true, updatedAt: ts })
    } else {
      await db.dayTypes.add({
        id: newId(), userId: U, createdAt: ts, updatedAt: ts,
        key: g.key, name: g.nome, targets: g.targets, manual: true,
        order: tipiEsistenti.length + fatte.length,
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
 * Limite noto: la nota sta sull'esercizio, non sulla singola seduta. Se lo stesso
 * esercizio comparisse in due sedute con prescrizioni diverse, vincerebbe
 * l'ultima. Nel protocollo di adesso non succede.
 */
async function scriviPrescrizione(id: string, attuali: string | undefined, prescrizione: string): Promise<void> {
  const tue = (attuali ?? '').split('\n').filter((r) => !r.trimStart().startsWith('🦠'))
  const righe = [...tue.filter((r) => r.trim()), `🦠 ${prescrizione}`]
  await db.exercises.update(id, { settings: righe.join('\n'), updatedAt: nowISO() })
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
      const ex = await getOrCreateExercise(e.nome, e.muscolo as MuscleGroup)
      await scriviPrescrizione(ex.id, ex.settings, e.prescrizione)
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

// Il piano alimentare del coach: quello in uso, e come si aggiorna.
//
// Prima il piano stava scritto nel codice. "Aggiorna protocollo" ricopiava quella
// copia, quindi quando il coach cambiava HIGH ON e HIGH OFF l'app restava sul
// vecchio — e poteva cambiarlo solo chi tocca il codice.
//
// Adesso il piano e' un dato: lo legge l'app dal suo archivio, col tuo accesso
// (vedi rs/coach.ts). E un aggiornamento tocca SOLO il piano del coach — i totali di ogni
// giornata, cioe' l'obiettivo che insegui in Cibo, e le sue righe di
// riferimento. I tuoi pasti, i tuoi alimenti e le tue grammature non si
// toccano mai: ne' nelle Giornate tipo ne' nel diario. Cosa e' cambiato negli
// alimenti te lo dice, come promemoria; se e come ritoccare lo decidi tu.

import { db, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal } from '../util/date'
import { GIORNATE_RS } from './protocollo'
import type { GiornataPianoRs, PianoRsSalvato, User, Macros, DayTemplate, Food } from '../db/schema'

const U = LOCAL_USER_ID

type Totali = GiornataPianoRs['targets']

// --- Il piano in uso ----------------------------------------------------------

/** Il piano di chi lo chiede, gia' letto: per i componenti che hanno l'utente in mano. */
export function pianoDi(u?: User | null): GiornataPianoRs[] {
  return u?.rsPiano?.giornate?.length ? u.rsPiano.giornate : GIORNATE_RS
}

/** Il piano in uso: quello aggiornato da te, o quello di fabbrica se non l'hai mai fatto. */
export async function pianoRs(): Promise<GiornataPianoRs[]> {
  return pianoDi(await db.users.get(U))
}

export function giornataDelPiano(piano: GiornataPianoRs[], nome: string): GiornataPianoRs | undefined {
  return piano.find((g) => g.nome === nome)
}

// --- Il confronto prima di salvare ---------------------------------------------

export interface CambioAlimento {
  pasto: string
  alimento: string
  /** null = riga nuova (prima) o tolta (dopo) */
  prima: number | null
  dopo: number | null
}

export interface ConfrontoGiornata {
  nome: string
  /** Il piano del coach prima e dopo. */
  prima: Totali
  dopo: Totali
  /** La tua versione, se l'hai corretta: e quanto manca per arrivare al piano nuovo. */
  tua: Totali | null
  mancano: Totali | null
  alimenti: CambioAlimento[]
  cambiata: boolean
}

const diff = (a: Totali, b: Totali): Totali => ({
  kcal: Math.round(a.kcal - b.kcal),
  carbs: Math.round((a.carbs - b.carbs) * 10) / 10,
  protein: Math.round((a.protein - b.protein) * 10) / 10,
  fat: Math.round((a.fat - b.fat) * 10) / 10,
})

/**
 * Cosa cambierebbe salvando, giornata per giornata.
 *
 * «Prima» per gli alimenti non e' il piano di fabbrica, che puo' essere piu'
 * nuovo di quello da cui sono nate le tue giornate: e' il piano in uso, e in
 * mancanza le righe del coach scritte dentro la tua giornata (rsOriginale) —
 * cioe' quello che avevi davvero.
 */
export async function confrontaPiano(nuovo: GiornataPianoRs[]): Promise<ConfrontoGiornata[]> {
  const u = await db.users.get(U)
  const attuale = pianoDi(u)
  const modelli = await db.dayTemplates.where('userId').equals(U).toArray()
  const tipi = await db.dayTypes.where('userId').equals(U).toArray()
  const cibi = new Map((await db.foods.where('userId').equals(U).toArray()).map((f) => [f.id, f]))

  return nuovo.map((g) => {
    const tipo = tipi.find((t) => t.key === g.key)
    const prima: Totali = tipo?.targets ?? attuale.find((x) => x.key === g.key)?.targets ?? g.targets
    const modello = modelli.find((m) => m.name === g.nome)
    const tua = modello?.modificata ? totaliDi(modello, cibi) : null
    const riferimento = u?.rsPiano ? attuale.find((x) => x.key === g.key)?.pasti : pastiDaRiferimento(modello)
    const alimenti = confrontaAlimenti(riferimento ?? [], g.pasti)
    const mossiTotali = ['kcal', 'carbs', 'protein', 'fat'].some((k) => prima[k as keyof Totali] !== g.targets[k as keyof Totali])
    return {
      nome: g.nome,
      prima,
      dopo: g.targets,
      tua,
      mancano: tua ? diff(g.targets, tua) : null,
      alimenti,
      cambiata: mossiTotali || alimenti.length > 0,
    }
  })
}

function totaliDi(m: DayTemplate, cibi: Map<string, Food>): Totali {
  const t = { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  for (const p of m.meals) {
    for (const it of p.items) {
      const f = cibi.get(it.foodId)
      const mm: Macros | undefined = f && !it.recipeId
        ? { kcal: f.per100.kcal * it.grams / 100, carbs: f.per100.carbs * it.grams / 100, protein: f.per100.protein * it.grams / 100, fat: f.per100.fat * it.grams / 100 }
        : it.macrosSnapshot
      if (!mm) continue
      t.kcal += mm.kcal; t.carbs += mm.carbs; t.protein += mm.protein; t.fat += mm.fat
    }
  }
  return { kcal: Math.round(t.kcal), carbs: Math.round(t.carbs), protein: Math.round(t.protein), fat: Math.round(t.fat) }
}

/** Le righe del coach come erano quando la tua giornata e' nata. */
function pastiDaRiferimento(m?: DayTemplate): GiornataPianoRs['pasti'] | undefined {
  if (!m) return undefined
  return [...m.meals].sort((a, b) => a.order - b.order).map((p) => ({
    nome: p.name,
    righe: p.items.filter((it) => it.rsOriginale).map((it) => ({ alimento: it.rsOriginale!.nome, g: it.rsOriginale!.g })),
  }))
}

function confrontaAlimenti(prima: GiornataPianoRs['pasti'], dopo: GiornataPianoRs['pasti']): CambioAlimento[] {
  const out: CambioAlimento[] = []
  const nomiPasti = [...new Set([...prima.map((p) => p.nome), ...dopo.map((p) => p.nome)])]
  for (const nome of nomiPasti) {
    const a = prima.find((p) => p.nome === nome)?.righe ?? []
    const b = dopo.find((p) => p.nome === nome)?.righe ?? []
    const alimenti = [...new Set([...a.map((r) => r.alimento), ...b.map((r) => r.alimento)])]
    for (const al of alimenti) {
      const x = a.find((r) => r.alimento === al)?.g ?? null
      const y = b.find((r) => r.alimento === al)?.g ?? null
      if (x !== y) out.push({ pasto: nome, alimento: al, prima: x, dopo: y })
    }
  }
  return out
}

// --- Salvare -----------------------------------------------------------------------

/**
 * Salva il piano nuovo. Tocca due cose sole: il piano del coach e l'obiettivo di
 * ogni sua giornata in Cibo, che passa ai suoi macro nuovi. Nient'altro.
 */
export async function applicaPiano(nuovo: GiornataPianoRs[], pubblicato?: string | null): Promise<void> {
  const u = await db.users.get(U)
  // Si parte dal piano in uso: se ne arriva solo una parte, il resto non si perde.
  const base = pianoDi(u).map((g) => ({ ...g }))
  for (const g of nuovo) {
    const i = base.findIndex((x) => x.key === g.key)
    if (i >= 0) base[i] = g
    else base.push(g)
  }
  const piano: PianoRsSalvato = { aggiornato: todayLocal(), giornate: base, ...(pubblicato ? { pubblicato } : {}) }
  const ts = nowISO()
  await db.transaction('rw', db.users, db.dayTypes, async () => {
    await db.users.update(U, { rsPiano: piano, updatedAt: ts })
    const tipi = await db.dayTypes.where('userId').equals(U).toArray()
    for (const g of nuovo) {
      const tipo = tipi.find((t) => t.key === g.key)
      if (tipo) await db.dayTypes.update(tipo.id, { targets: g.targets, manual: true, updatedAt: ts })
    }
  })
}

// Il piano alimentare del coach: quello in uso, e come si aggiorna.
//
// Prima il piano stava scritto nel codice. "Aggiorna protocollo" ricopiava quella
// copia, quindi quando il coach cambiava HIGH ON e HIGH OFF l'app restava sul
// vecchio — e poteva cambiarlo solo chi tocca il codice.
//
// Adesso il piano e' un dato: lo aggiorni tu, incollando la sua pagina «Stampa
// la dieta». E un aggiornamento tocca SOLO il piano del coach — i totali di ogni
// giornata, cioe' l'obiettivo che insegui in Cibo, e le sue righe di
// riferimento. I tuoi pasti, i tuoi alimenti e le tue grammature non si
// toccano mai: ne' nelle Giornate tipo ne' nel diario. Cosa e' cambiato negli
// alimenti te lo dice, come promemoria; se e come ritoccare lo decidi tu.

import { db, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal } from '../util/date'
import { GIORNATE_RS, NOMI_DEL_COACH } from './protocollo'
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

// --- Leggere il piano incollato ------------------------------------------------

/** Come si chiamano le sue giornate nella sua pagina, e come si chiamano qui. */
const GIORNATE_COACH: Record<string, { key: string; nome: string }> = {
  'LOW ON': { key: 'rs_low_on', nome: '🦠 LOW ON' },
  'LOW OFF': { key: 'rs_low_off', nome: '🦠 LOW OFF' },
  'HIGH ON': { key: 'rs_high_on', nome: '🦠 HIGH ON' },
  'HIGH OFF': { key: 'rs_high_off', nome: '🦠 HIGH OFF' },
}

export interface PianoLetto {
  giornate: GiornataPianoRs[]
  /** Quello che non si e' capito. Se c'e' qualcosa qui, non si salva niente. */
  problemi: string[]
}

const numero = (s: string) => Number(s.replace(',', '.'))
const TOTALE = /(\d+(?:[.,]\d+)?)\s*kcal\s*·\s*(\d+(?:[.,]\d+)?)\s*C\s*·\s*(\d+(?:[.,]\d+)?)\s*P\s*·\s*(\d+(?:[.,]\d+)?)\s*F/
const GRAMMI = /^(\d+(?:[.,]\d+)?)\s*gr?$/i
const GIORNATA = /^(LOW|HIGH)\s+(ON|OFF)$/i

/**
 * Il testo copiato, riga per riga.
 *
 * Copiando da un telefono le righe possono arrivare separate («Mirtilli» e sotto
 * «100gr») o incollate insieme («Mirtilli100gr»): si riportano tutte alla forma
 * a righe prima di leggere, cosi' vanno bene entrambe.
 */
function righeDi(testo: string): string[] {
  let t = testo.replace(/ /g, ' ').replace(/\r/g, '')
  t = t.replace(/((?:LOW|HIGH)\s+(?:ON|OFF))/g, '\n$1\n')
  t = t.replace(new RegExp(TOTALE.source, 'g'), (x) => `\n${x}\n`)
  // «Mirtilli100gr» → «Mirtilli» / «100gr». Dopo «gr» non c'e' un confine di
  // parola quando la riga seguente e' incollata («50grAlbume»): si controlla
  // solo che non prosegua in minuscolo.
  t = t.replace(/([^\n\d\s])\s*(\d+(?:[.,]\d+)?\s*gr)(?![a-zà-ÿ])/g, '$1\n$2\n')
  // Intestazione di pasto incollata al suo numero: «Pasto 11» = «Pasto 1» + «1»
  t = t.replace(/(Pasto \d+(?: · [^\n\d]+)?|Pre-workout|Intra-workout|Post-workout)(\d+)(?=\n|[A-Za-zÀ-ÿ])/g, '$1\n$2\n')
  return t.split('\n').map((r) => r.trim()).filter(Boolean)
}

export function leggiPianoIncollato(testo: string, attuale: GiornataPianoRs[] = GIORNATE_RS): PianoLetto {
  const righe = righeDi(testo)
  const problemi: string[] = []
  const giornate: GiornataPianoRs[] = []
  let g: GiornataPianoRs | null = null
  let pasto: GiornataPianoRs['pasti'][number] | null = null
  let totaleDellaGiornata = false

  for (let i = 0; i < righe.length; i++) {
    const t = righe[i]
    const intestazione = t.match(GIORNATA)
    if (intestazione) {
      const chi = GIORNATE_COACH[`${intestazione[1].toUpperCase()} ${intestazione[2].toUpperCase()}`]
      // L'acqua non sta nella sua pagina: resta quella del piano in uso.
      const prima = attuale.find((x) => x.key === chi.key)
      g = { key: chi.key, nome: chi.nome, targets: { kcal: 0, carbs: 0, protein: 0, fat: 0 }, acqua: prima?.acqua ?? 5.5, pasti: [] }
      giornate.push(g)
      pasto = null
      totaleDellaGiornata = false
      continue
    }
    if (!g) continue

    const tot = t.match(TOTALE)
    if (tot) {
      const valori: Totali = { kcal: numero(tot[1]), carbs: numero(tot[2]), protein: numero(tot[3]), fat: numero(tot[4]) }
      // Il primo totale dopo il nome e' quello della giornata; gli altri chiudono un pasto.
      if (!totaleDellaGiornata && !pasto) { g.targets = valori; totaleDellaGiornata = true }
      pasto = null
      continue
    }

    // Un pasto: il suo nome, seguito dal numero d'ordine.
    if (/^\d+$/.test(righe[i + 1] ?? '') && !GRAMMI.test(t)) {
      pasto = { nome: t, righe: [] }
      g.pasti.push(pasto)
      i++
      continue
    }

    const gr = (righe[i + 1] ?? '').match(GRAMMI)
    if (pasto && gr) {
      pasto.righe.push({ alimento: NOMI_DEL_COACH[t] ?? t, g: numero(gr[1]) })
      i++
    }
  }

  if (!giornate.length) {
    problemi.push('Non trovo nessuna giornata (LOW ON, LOW OFF, HIGH ON, HIGH OFF). Hai copiato la pagina «Stampa la dieta»?')
  }
  for (const x of giornate) {
    if (!x.targets.kcal) problemi.push(`${x.nome.replace('🦠 ', '')}: non trovo i totali (kcal · C · P · F).`)
    if (!x.pasti.length) problemi.push(`${x.nome.replace('🦠 ', '')}: non trovo i pasti.`)
  }
  const doppie = giornate.map((x) => x.key).filter((k, i, a) => a.indexOf(k) !== i)
  if (doppie.length) problemi.push('La stessa giornata compare due volte: copia la pagina una volta sola.')

  return { giornate, problemi }
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
export async function applicaPiano(nuovo: GiornataPianoRs[]): Promise<void> {
  const u = await db.users.get(U)
  // Si parte dal piano in uso: se hai incollato una giornata sola, le altre restano.
  const base = pianoDi(u).map((g) => ({ ...g }))
  for (const g of nuovo) {
    const i = base.findIndex((x) => x.key === g.key)
    if (i >= 0) base[i] = g
    else base.push(g)
  }
  const piano: PianoRsSalvato = { aggiornato: todayLocal(), giornate: base }
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

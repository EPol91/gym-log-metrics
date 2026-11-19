// Le sedute del coach confrontate con le tue, a ogni «↻ Aggiorna dal coach».
//
// Prima i cambi di scheda li portava Claude nel codice, uno per volta, e gli
// abbinamenti fra i suoi esercizi e i tuoi li sceglieva l'import (gli alias):
// cosi' il suo «Rear delt fly manubri su panca inclinata» e' finito sulle tue
// DB Rear Delts senza che nessuno te lo chiedesse.
//
// Adesso la regola e' una:
// 1. Ha la precedenza quello che hai gia' nella seduta. Un suo esercizio passa
//    senza domande solo se si chiama come il tuo, o se l'abbinamento l'hai gia'
//    confermato tu (rsAbbinamenti). Gli alias messi dall'import non contano.
// 2. Tutto il resto te lo chiedo, uno alla volta: tieni il tuo, ne scegli un
//    altro dalla libreria o crei il suo. Poi gli esercizi che lui ha tolto
//    (togli o tieni) e le prescrizioni cambiate (applica o tieni la tua).
// Niente si scrive finche' non salvi; lo storico delle serie non si tocca mai.

import { db, newId, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { normalizeName } from '../db/catalog'
import { SEDUTE_RS } from './protocollo'
import type { EsercizioCoach, SedutaCoach } from './coach'
import type { Exercise, MuscleGroup, TemplateItem } from '../db/schema'

const U = LOCAL_USER_ID
const n = normalizeName

export interface SedutaDaRivedere {
  codice: string
  nome: string
  templateId: string
  coach: EsercizioCoach[]
  /** per ogni suo esercizio, il tuo abbinato senza domande (o null) */
  auto: (string | null)[]
  /** gli esercizi della tua seduta adesso, in ordine */
  tuoi: string[]
}

export interface Revisione {
  sedute: SedutaDaRivedere[]
  esercizi: Map<string, Exercise>
  abbinamenti: Record<string, string>
  tenuti: string[]
  prescrizioniTenute: Record<string, string>
}

export type Scelta =
  | { tipo: 'abbina'; codice: string; i: number; exerciseId: string }
  | { tipo: 'crea'; codice: string; i: number }
  | { tipo: 'tolto'; codice: string; exerciseId: string; togli: boolean }
  | { tipo: 'prescrizione'; codice: string; exerciseId: string; sr: string; applica: boolean }

export type Domanda =
  | { tipo: 'abbina'; seduta: SedutaDaRivedere; i: number; proposta: string | null; daSeduta: boolean }
  | { tipo: 'tolto'; seduta: SedutaDaRivedere; exerciseId: string }
  | { tipo: 'prescrizione'; seduta: SedutaDaRivedere; exerciseId: string; prima: string | null; dopo: string }

const chiave = (codice: string, nome: string) => `${codice}|${n(nome)}`
const titoloSenzaGiorno = (t: string) => n(t.split(' · ').slice(1).join(' · ') || t)

// --- Le righe 🦠 nelle note dell'esercizio ---------------------------------------

const prefisso = (codice: string) => `🦠 ${codice} ·`

/** La prescrizione del coach per quella seduta, come sta adesso nelle note. */
export function rigaDi(settings: string | undefined, codice: string): string | null {
  const r = (settings ?? '').split('\n').find((x) => x.trimStart().startsWith(prefisso(codice)))
  return r ? r.trimStart().slice(prefisso(codice).length).trim() : null
}

function conRiga(settings: string | undefined, codice: string, sr: string): string {
  const righe = (settings ?? '').split('\n').filter((r) => r.trim() && !r.trimStart().startsWith(prefisso(codice)))
  const mie = righe.filter((r) => !r.trimStart().startsWith('🦠'))
  const altre = righe.filter((r) => r.trimStart().startsWith('🦠'))
  return [...mie, ...altre, `${prefisso(codice)} ${sr}`].join('\n')
}

function senzaRiga(settings: string | undefined, codice: string): string {
  return (settings ?? '').split('\n').filter((r) => !r.trimStart().startsWith(prefisso(codice))).join('\n')
}

/** Il recupero, quando il coach ne scrive uno solo («rec 120″»; non «rec 90-120″»). */
function recupero(sr: string): number | undefined {
  const m = sr.match(/\brec (\d+)″/)
  return m ? Number(m[1]) : undefined
}

const stessaPrescrizione = (a: string | null, b: string) => a != null && n(a) === n(b)

// --- Preparare -------------------------------------------------------------------

/** Abbina le sue sedute alle tue 🦠 e segna cosa passa senza domande. */
export async function preparaRevisione(schede: SedutaCoach[]): Promise<Revisione | null> {
  if (!schede.length) return null
  const u = await db.users.get(U)
  const esercizi = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  const abbinamenti = u?.rsAbbinamenti ?? {}
  const modelli = (await db.templates.where('userId').equals(U).toArray())
    .filter((t) => /^🦠\s*D\d+/.test(t.name.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }))

  const sedute: SedutaDaRivedere[] = []
  schede.forEach((s, idx) => {
    // Per titolo («PUSH», «UPPER B»); se lui lo cambia, per posizione.
    const t = modelli.find((m) => titoloSenzaGiorno(m.name) === titoloSenzaGiorno(s.titolo)) ?? modelli[idx]
    if (!t) return
    const codice = t.name.match(/D\d+/)![0]
    const tuoi = [...t.items].sort((a, b) => a.order - b.order).map((x) => x.exerciseId)
    const presi = new Set<string>()
    const auto = s.esercizi.map((c) => {
      const confermato = abbinamenti[chiave(codice, c.nome)]
      const id = confermato && tuoi.includes(confermato) && !presi.has(confermato)
        ? confermato
        : tuoi.find((x) => !presi.has(x) && n(esercizi.get(x)?.name ?? '') === n(c.nome)) ?? null
      if (id) presi.add(id)
      return id
    })
    sedute.push({ codice, nome: t.name, templateId: t.id, coach: s.esercizi, auto, tuoi })
  })

  return {
    sedute, esercizi, abbinamenti,
    tenuti: u?.rsTenuti ?? [],
    prescrizioniTenute: u?.rsPrescrizioniTenute ?? {},
  }
}

/** Il tuo esercizio scelto per il suo i-esimo (senza domande o da te), se c'e'. */
function scelto(s: SedutaDaRivedere, i: number, scelte: Scelta[]): string | null | 'crea' {
  if (s.auto[i]) return s.auto[i]
  const x = scelte.find((c) => (c.tipo === 'abbina' || c.tipo === 'crea') && c.codice === s.codice && c.i === i)
  if (!x) return null
  return x.tipo === 'abbina' ? x.exerciseId : 'crea'
}

/** I tuoi esercizi della seduta che nessun suo esercizio ha preso (finora). */
function avanzati(s: SedutaDaRivedere, scelte: Scelta[]): string[] {
  const presi = new Set(s.coach.map((_, i) => scelto(s, i, scelte)).filter((x): x is string => !!x && x !== 'crea'))
  return s.tuoi.filter((x) => !presi.has(x))
}

/**
 * La prossima cosa da decidere, o null se non resta niente. Prima gli
 * abbinamenti (da quelli dipende cosa risulta tolto), poi i tolti, poi le
 * prescrizioni.
 */
export function prossimaDomanda(rev: Revisione, scelte: Scelta[]): Domanda | null {
  for (const s of rev.sedute) {
    for (let i = 0; i < s.coach.length; i++) {
      if (scelto(s, i, scelte)) continue
      const c = s.coach[i]
      const liberi = avanzati(s, scelte)
      const confermato = rev.abbinamenti[chiave(s.codice, c.nome)]
      // La proposta: quello che avevi confermato, poi un tuo della seduta che
      // ha il suo nome fra gli alias, poi quello che sta al suo posto.
      const perAlias = liberi.find((x) => rev.esercizi.get(x)?.aliases.some((a) => n(a.replace(/^\d+[A-Z]\s*·\s*/, '')) === n(c.nome)))
      const alPosto = liberi.length ? liberi.reduce((m, x) => (Math.abs(s.tuoi.indexOf(x) - i) < Math.abs(s.tuoi.indexOf(m) - i) ? x : m)) : null
      const proposta = (confermato && rev.esercizi.has(confermato) ? confermato : null) ?? perAlias ?? alPosto
      return { tipo: 'abbina', seduta: s, i, proposta, daSeduta: !!proposta && s.tuoi.includes(proposta) }
    }
  }
  for (const s of rev.sedute) {
    for (const x of avanzati(s, scelte)) {
      if (rev.tenuti.includes(`${s.codice}|${x}`)) continue
      if (scelte.some((c) => c.tipo === 'tolto' && c.codice === s.codice && c.exerciseId === x)) continue
      return { tipo: 'tolto', seduta: s, exerciseId: x }
    }
  }
  for (const s of rev.sedute) {
    for (let i = 0; i < s.coach.length; i++) {
      // Solo quelli passati senza domande: chi l'hai appena scelto prende la
      // sua prescrizione insieme alla scelta (l'hai vista nella domanda).
      const id = s.auto[i]
      if (!id) continue
      const sr = s.coach[i].sr
      const prima = rigaDi(rev.esercizi.get(id)?.settings, s.codice)
      if (!sr || stessaPrescrizione(prima, sr)) continue
      if (rev.prescrizioniTenute[`${s.codice}|${id}`] === sr) continue
      if (scelte.some((c) => c.tipo === 'prescrizione' && c.codice === s.codice && c.exerciseId === id)) continue
      return { tipo: 'prescrizione', seduta: s, exerciseId: id, prima, dopo: sr }
    }
  }
  return null
}

// --- Salvare ---------------------------------------------------------------------

/** Il muscolo di un esercizio nuovo: quello della scheda scritta, se c'e'. */
function muscoloDi(nome: string): MuscleGroup {
  for (const s of SEDUTE_RS) {
    const e = s.esercizi.find((x) => n(x.nome.replace(/^\d+[A-Z]\s*·\s*/, '')) === n(nome))
    if (e) return e.muscolo as MuscleGroup
  }
  return 'altro'
}

/** Scrive le tue scelte: sedute, righe 🦠, abbinamenti. Tutto o niente. */
export async function applicaRevisione(rev: Revisione, scelte: Scelta[]): Promise<void> {
  const ts = nowISO()
  await db.transaction('rw', db.templates, db.exercises, db.users, async () => {
    const u = await db.users.get(U)
    const abbinamenti = { ...(u?.rsAbbinamenti ?? {}) }
    const tenuti = new Set(u?.rsTenuti ?? [])
    const prescrizioniTenute = { ...(u?.rsPrescrizioniTenute ?? {}) }
    const tutti = await db.exercises.toArray()

    // Le note cambiate, raccolte per esercizio e scritte alla fine.
    const note = new Map<string, { settings?: string; restSec?: number }>()
    const leggi = (id: string) => note.get(id)?.settings ?? tutti.find((e) => e.id === id)?.settings
    const scriviRiga = (id: string, codice: string, sr: string) => {
      const r = recupero(sr)
      note.set(id, { ...note.get(id), settings: conRiga(leggi(id), codice, sr), ...(r ? { restSec: r } : {}) })
    }

    for (const s of rev.sedute) {
      const t = await db.templates.get(s.templateId)
      if (!t) continue
      const tocca = scelte.some((c) => c.codice === s.codice)
      if (!tocca) continue

      // Il tuo esercizio per ogni suo, creando quelli che hai chiesto di creare.
      const risolti: (string | null)[] = []
      for (let i = 0; i < s.coach.length; i++) {
        const c = s.coach[i]
        const x = scelte.find((q) => (q.tipo === 'abbina' || q.tipo === 'crea') && q.codice === s.codice && q.i === i)
        let id = s.auto[i]
        if (x?.tipo === 'abbina') id = x.exerciseId
        if (x?.tipo === 'crea') {
          // Solo per nome esatto: un alias porterebbe proprio all'esercizio che hai scartato.
          let e = tutti.find((y) => n(y.name) === n(c.nome))
          if (!e) {
            e = { id: newId(), userId: U, createdAt: ts, updatedAt: ts, name: c.nome, muscle: muscoloDi(c.nome), isCustom: true, aliases: [] }
            await db.exercises.add(e)
            tutti.push(e)
          }
          id = e.id
        }
        if (x && id) {
          abbinamenti[chiave(s.codice, c.nome)] = id
          const e = tutti.find((y) => y.id === id)
          if (e && n(e.name) !== n(c.nome) && !e.aliases.some((a) => n(a) === n(c.nome))) {
            e.aliases = [...e.aliases, c.nome]
            await db.exercises.update(e.id, { aliases: e.aliases, updatedAt: ts })
          }
          if (c.sr) scriviRiga(id, s.codice, c.sr)
        }
        risolti.push(id)
      }

      // La seduta: il tuo ordine resta; via solo quelli che hai detto di togliere.
      const togli = new Set(scelte.filter((q) => q.tipo === 'tolto' && q.codice === s.codice && q.togli).map((q) => (q as { exerciseId: string }).exerciseId))
      let items: TemplateItem[] = [...t.items].sort((a, b) => a.order - b.order).filter((x) => !togli.has(x.exerciseId))
      for (const id of togli) note.set(id, { ...note.get(id), settings: senzaRiga(leggi(id), s.codice) })
      for (const q of scelte) if (q.tipo === 'tolto' && q.codice === s.codice && !q.togli) tenuti.add(`${s.codice}|${q.exerciseId}`)

      // I nuovi entrano dopo l'esercizio che nella sua scheda li precede.
      risolti.forEach((id, i) => {
        if (!id || items.some((x) => x.exerciseId === id)) return
        let dopo = -1
        for (let k = i - 1; k >= 0 && dopo < 0; k--) dopo = items.findIndex((x) => x.exerciseId === risolti[k])
        items = [...items.slice(0, dopo + 1), { exerciseId: id, order: 0 }, ...items.slice(dopo + 1)]
      })
      items = items.map((x, k) => ({ ...x, order: k }))
      await db.templates.update(t.id, { items, updatedAt: ts })

      for (const q of scelte) {
        if (q.tipo !== 'prescrizione' || q.codice !== s.codice) continue
        if (q.applica) scriviRiga(q.exerciseId, s.codice, q.sr)
        else prescrizioniTenute[`${s.codice}|${q.exerciseId}`] = q.sr
      }
    }

    for (const [id, p] of note) await db.exercises.update(id, { ...p, updatedAt: ts })
    await db.users.update(U, { rsAbbinamenti: abbinamenti, rsTenuti: [...tenuti], rsPrescrizioniTenute: prescrizioniTenute, updatedAt: ts })
  })
}

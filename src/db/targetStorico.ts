// Gli obiettivi di una giornata tipo cambiano nel tempo: il coach li sposta.
//
// Prima c'era un numero solo, e ogni cambio riscriveva anche il passato: un
// HIGH ON di settembre finiva confrontato coi macro di ottobre. Adesso ogni
// giornata tipo tiene le sue versioni, e un giorno usa quella in vigore allora.

import { db, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import { todayLocal } from '../util/date'
import type { DayType, VersioneTarget } from './schema'

type Targets = DayType['targets']

const uguali = (a: Targets, b: Targets) =>
  a.kcal === b.kcal && a.carbs === b.carbs && a.protein === b.protein && a.fat === b.fat

/** Gli obiettivi in vigore quel giorno. Prima della prima versione, la prima. */
export function targetsAl(tipo: DayType, data: string): Targets {
  const v = tipo.storico
  if (!v?.length) return tipo.targets
  let scelti = v[0].targets
  for (const x of v) if (x.dal <= data) scelti = x.targets
  return scelti
}

/**
 * Cosa scrivere quando gli obiettivi cambiano: quelli nuovi, e una versione in
 * piu' che vale da `dal`. Il passato non si tocca. Due cambi nello stesso
 * giorno: vale l'ultimo.
 */
export function conVersione(tipo: DayType | undefined, targets: Targets, dal = todayLocal()): Pick<DayType, 'targets' | 'storico'> {
  const prima: VersioneTarget[] = tipo?.storico?.length
    ? tipo.storico
    : tipo ? [{ dal: tipo.createdAt.slice(0, 10), targets: tipo.targets }] : []
  const tenute = prima.filter((x) => x.dal < dal)
  // Tornato a quelli di prima nello stesso giorno: nessuna versione in piu'.
  const ultima = tenute[tenute.length - 1]
  if (ultima && uguali(ultima.targets, targets)) return { targets, storico: tenute }
  return { targets, storico: [...tenute, { dal, targets }] }
}

/**
 * I macro del coach dal primo giorno, verificati il 01.11.2026: il piano letto
 * il 31.07, le HIGH cambiate il 16.09, tutto nuovo il 14.10.
 */
const STORICO_RS: Record<string, VersioneTarget[]> = {
  rs_low_on: [
    { dal: '2026-07-31', targets: { kcal: 2435, carbs: 300, protein: 201, fat: 49 } },
    { dal: '2026-10-14', targets: { kcal: 2947, carbs: 353, protein: 209, fat: 79 } },
  ],
  rs_low_off: [
    { dal: '2026-07-31', targets: { kcal: 2249, carbs: 241, protein: 204, fat: 52 } },
    { dal: '2026-10-14', targets: { kcal: 2711, carbs: 292, protein: 208, fat: 78 } },
  ],
  rs_high_on: [
    { dal: '2026-07-31', targets: { kcal: 2772, carbs: 353, protein: 209, fat: 59 } },
    { dal: '2026-09-16', targets: { kcal: 2951, carbs: 402, protein: 205, fat: 61 } },
    { dal: '2026-10-14', targets: { kcal: 3409, carbs: 451, protein: 211, fat: 91 } },
  ],
  rs_high_off: [
    { dal: '2026-07-31', targets: { kcal: 2778, carbs: 353, protein: 211, fat: 58 } },
    { dal: '2026-09-16', targets: { kcal: 2616, carbs: 319, protein: 205, fat: 59 } },
    { dal: '2026-10-14', targets: { kcal: 3122, carbs: 380, protein: 212, fat: 84 } },
  ],
}

/**
 * I piani del coach del 02.11 (18:29) e del 16.11 (14:23 e 18:06) erano stati
 * applicati dal giorno stesso, ma quei giorni erano gia' cominciati col piano
 * vecchio: valgono dal giorno dopo (docs/TARGET_COACH_STORICO.md).
 */
const tg = (kcal: number, carbs: number, protein: number, fat: number): Targets => ({ kcal, carbs, protein, fat })
const SPOSTA_RS: { da: string; a: string; targets: Record<string, Targets> }[] = [
  { da: '2026-11-02', a: '2026-11-03', targets: {
    rs_low_on: tg(2825, 327, 206, 78), rs_low_off: tg(2558, 256, 207, 78), rs_high_on: tg(3372, 434, 213, 93), rs_high_off: tg(2969, 344, 212, 84),
  } },
  { da: '2026-11-16', a: '2026-11-17', targets: {
    rs_low_on: tg(2832, 325, 204, 81), rs_low_off: tg(2351, 214, 202, 77), rs_high_on: tg(3347, 432, 211, 93), rs_high_off: tg(2798, 305, 209, 84),
  } },
]

/**
 * Una volta sola (18.11.2026): sposta al giorno dopo solo la versione con quella
 * data e quei macro. Se non c'e' (o e' gia' spostata) non scrive niente.
 */
export async function correggiConfiniRs(): Promise<void> {
  const tipi = await db.dayTypes.where('userId').equals(LOCAL_USER_ID).toArray()
  for (const tipo of tipi) {
    const v = tipo.storico
    if (!v?.length) continue
    let cambiato = false
    const storico = v.map((x) => {
      const s = SPOSTA_RS.find((y) => y.da === x.dal && y.targets[tipo.key] && uguali(y.targets[tipo.key], x.targets))
      if (!s || v.some((w) => w.dal === s.a)) return x
      cambiato = true
      return { ...x, dal: s.a }
    })
    if (cambiato) await db.dayTypes.update(tipo.id, { storico, updatedAt: nowISO() })
  }
}

/**
 * Una volta sola: le giornate del coach senza storico lo ricevono. Si tiene
 * fino alla versione uguale ai tuoi obiettivi di adesso; se i tuoi non sono
 * nessuna di quelle, valgono da quando li hai cambiati.
 */
export async function ensureStoricoRs(): Promise<void> {
  const tipi = await db.dayTypes.where('userId').equals(LOCAL_USER_ID).toArray()
  for (const t of tipi) {
    const noto = STORICO_RS[t.key]
    if (!noto || t.storico?.length) continue
    const i = noto.findIndex((v) => uguali(v.targets, t.targets))
    let storico: VersioneTarget[]
    if (i >= 0) storico = noto.slice(0, i + 1)
    else {
      const cambiati = t.updatedAt.slice(0, 10)
      const dal = cambiati > noto[noto.length - 1].dal ? cambiati : todayLocal()
      storico = [...noto.filter((v) => v.dal < dal), { dal, targets: t.targets }]
    }
    await db.dayTypes.update(t.id, { storico, updatedAt: nowISO() })
  }
}

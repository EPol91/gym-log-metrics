// Il ciclo del coach: D1 → D5, e quanto ci hai messo davvero.
//
// Il conteggio vecchio diceva «5 sedute in 8 giorni» guardando solo quante ne
// avevi fatte nella finestra. Ma le sue cinque sedute sono una sequenza, non un
// mucchio: se all'ottavo giorno ti manca ancora la D4, non e' che hai fatto
// poco — e' che stai allungando il ciclo. E allungare non e' saltare: la sua
// regola e' che la seduta non si perde, si recupera alla sessione dopo.
//
// Quindi qui il ciclo si apre con la prima seduta e si chiude quando le hai
// fatte tutte e cinque, quale che sia il giorno. Gli otto giorni restano il
// metro — dicono se sei in pari o di quanto stai sforando — non una ghigliottina
// che azzera il conto.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal, daysBetween } from '../util/date'
import { SEDUTE_RS } from './protocollo'

const U = LOCAL_USER_ID

/** Quanti giorni dovrebbe durare un giro completo. */
export const GIORNI_CICLO = 8

export interface CicloChiuso {
  numero: number
  dal: string
  al: string
  giorni: number
  /** Sedute fatte fuori dall'ordine del coach: D5 prima di D4 e simili. */
  fuoriOrdine: string[]
}

export interface CicloRs {
  /** Numero del ciclo in corso, contando dal primo. */
  numero: number
  /** Codici nell'ordine del coach, con lo stato di ciascuno. */
  passi: { codice: string; stato: 'fatta' | 'tocca' | 'scavalcata' | 'dopo'; date?: string }[]
  fatte: number
  totale: number
  /** A che giorno del ciclo sei (1 = il giorno della prima seduta). */
  giorno: number
  giorniPrevisti: number
  /** Giorni oltre il previsto: 0 se sei in pari. */
  oltre: number
  /** La prossima da fare: la prima non ancora fatta, nell'ordine suo. */
  prossima: string | null
  /** L'ultima seduta del coach registrata. */
  ultima: { codice: string; date: string } | null
  chiusi: CicloChiuso[]
  /** Riepilogo dei cicli chiusi: quanti in tempo, quanti allungati, media. */
  storico: { inTempo: number; allungati: number; giorniMedi: number | null; saltate: number }
}

/**
 * Ricostruisce i cicli dalle sedute registrate.
 *
 * Ogni seduta sa da quale scheda e' nata, e le schede del coach hanno il loro
 * codice: da li' si legge la sequenza vera, D per D. Le sedute tue e i cardio
 * non entrano — questo conta il protocollo, non l'attivita'.
 */
export async function cicloRs(oggi = todayLocal()): Promise<CicloRs | null> {
  const ordine = SEDUTE_RS.map((s) => s.codice)
  const schede = await db.templates.where('userId').equals(U).toArray()
  // Dalla scheda al codice: il nome e' quello che l'import ha scritto («🦠 D4 · …»).
  const codiceDi = new Map<string, string>()
  for (const t of schede) {
    const s = SEDUTE_RS.find((x) => x.nome === t.name)
    if (s) codiceDi.set(t.id, s.codice)
  }
  if (!codiceDi.size) return null

  const sedute = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.finishedAt && s.srcTemplateId && codiceDi.has(s.srcTemplateId) && s.date <= oggi)
    .map((s) => ({ codice: codiceDi.get(s.srcTemplateId!)!, date: s.date }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!sedute.length) return null

  // Si taglia in cicli: una D che ricompare, o il quinto codice diverso, aprono
  // il giro dopo. Nessun calendario di mezzo — comanda la sequenza.
  const giri: { codice: string; date: string }[][] = []
  let corrente: { codice: string; date: string }[] = []
  for (const s of sedute) {
    if (corrente.some((x) => x.codice === s.codice)) { giri.push(corrente); corrente = [] }
    corrente.push(s)
    if (new Set(corrente.map((x) => x.codice)).size === ordine.length) { giri.push(corrente); corrente = [] }
  }
  const aperto = corrente

  const daGiro = (g: { codice: string; date: string }[], numero: number): CicloChiuso => ({
    numero,
    dal: g[0].date,
    al: g[g.length - 1].date,
    giorni: daysBetween(g[0].date, g[g.length - 1].date) + 1,
    fuoriOrdine: fuoriOrdine(g, ordine),
  })

  const chiusi = giri.map((g, i) => daGiro(g, i + 1)).reverse()
  const inTempo = chiusi.filter((c) => c.giorni <= GIORNI_CICLO).length
  const allungati = chiusi.length - inTempo
  const giorniMedi = chiusi.length
    ? Math.round((chiusi.reduce((a, c) => a + c.giorni, 0) / chiusi.length) * 10) / 10
    : null

  // Il ciclo in corso. Se l'ultimo si e' appena chiuso, quello nuovo comincia
  // alla prima seduta che farai: fino ad allora si mostra vuoto, al giorno 1.
  const numero = giri.length + 1
  const fatte = new Map(aperto.map((s) => [s.codice, s.date]))
  const prossima = ordine.find((c) => !fatte.has(c)) ?? null
  const passi = ordine.map((codice) => {
    const date = fatte.get(codice)
    if (date) return { codice, stato: 'fatta' as const, date }
    // Scavalcata prima di 'tocca', anche quando e' la prossima: che tu l'abbia
    // saltata e' l'informazione piu' importante delle due — un ritardo si
    // recupera da solo, una saltata la devi vedere.
    const dopoDiLei = ordine.slice(ordine.indexOf(codice) + 1)
    if (dopoDiLei.some((c) => fatte.has(c))) return { codice, stato: 'scavalcata' as const }
    return { codice, stato: codice === prossima ? 'tocca' as const : 'dopo' as const }
  })

  const inizio = aperto[0]?.date ?? oggi
  const giorno = aperto.length ? daysBetween(inizio, oggi) + 1 : 1
  const ultimaSeduta = sedute[sedute.length - 1]

  return {
    numero,
    passi,
    fatte: fatte.size,
    totale: ordine.length,
    giorno,
    giorniPrevisti: GIORNI_CICLO,
    oltre: Math.max(0, giorno - GIORNI_CICLO),
    prossima,
    ultima: ultimaSeduta ? { codice: ultimaSeduta.codice, date: ultimaSeduta.date } : null,
    chiusi: chiusi.slice(0, 3),
    storico: {
      inTempo,
      allungati,
      giorniMedi,
      saltate: chiusi.reduce((a, c) => a + c.fuoriOrdine.length, 0),
    },
  }
}

/** Quali sedute sono state fatte dopo una che veniva dopo di loro. */
function fuoriOrdine(giro: { codice: string; date: string }[], ordine: string[]): string[] {
  const out: string[] = []
  let massimo = -1
  for (const s of giro) {
    const i = ordine.indexOf(s.codice)
    if (i < massimo) out.push(s.codice)
    else massimo = i
  }
  return out
}


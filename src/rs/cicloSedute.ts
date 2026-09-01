// Il ciclo del coach: D1 → D5, e quanto ci hai messo davvero.
//
// Il conteggio vecchio diceva «5 sedute in 8 giorni» guardando solo quante ne
// avevi fatte nella finestra. Ma le sue cinque sedute sono una sequenza, non un
// mucchio: se all'ottavo giorno ti manca ancora la D4, non e' che hai fatto
// poco — e' che stai allungando il ciclo. E allungare non e' saltare: la sua
// regola e' che la seduta non si perde, si recupera alla sessione dopo.
//
// Tre regole, e nient'altro:
//
//   1. Si parte dalla data d'inizio del protocollo. Le sedute di prima non
//      fanno numero: erano prove, e gonfiavano il conto.
//   2. Un ciclo si chiude quando ci sono TUTTE E CINQUE. Una D ripetuta non
//      apre un giro nuovo — e' una ripetizione, il ciclo resta aperto. Prima
//      spezzava, e un troncone da due sedute finiva contato come ciclo chiuso:
//      da li' i numeri non tornavano piu'.
//   3. Oppure lo chiudi tu. Quando un giro salta del tutto o riparti da capo,
//      lo dici e il conteggio riprende dal giorno dopo invece di restare
//      appeso a un ciclo che non finirai mai.
//
// Gli otto giorni restano il metro — dicono se sei in pari o di quanto stai
// sforando — non una ghigliottina che azzera il conto.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { todayLocal, daysBetween, shiftDate } from '../util/date'
import { SEDUTE_RS } from './protocollo'
import { RS_START_DEFAULT } from './rs'

const U = LOCAL_USER_ID

/** Quanti giorni dovrebbe durare un giro completo. */
export const GIORNI_CICLO = 8

export interface CicloChiuso {
  numero: number
  dal: string
  al: string
  giorni: number
  /** Le sedute che ha davvero, in ordine di esecuzione. */
  fatte: string[]
  /** Sedute fatte dopo una che veniva dopo di loro: D5 prima di D4 e simili. */
  fuoriOrdine: string[]
  /** Chiuso da te, non dalle cinque sedute. */
  aMano?: boolean
}

export interface CicloRs {
  /** Numero del ciclo in corso, contando dall'inizio del protocollo. */
  numero: number
  /** Il giorno in cui è cominciato: senza, i numeri sono da prendere per buoni. */
  dal: string
  /** Codici nell'ordine del coach, con lo stato di ciascuno. */
  passi: { codice: string; stato: 'fatta' | 'tocca' | 'scavalcata' | 'dopo'; date?: string }[]
  fatte: number
  totale: number
  /** A che giorno del ciclo sei (1 = il primo giorno). */
  giorno: number
  giorniPrevisti: number
  /** Giorni oltre il previsto: 0 se sei in pari. */
  oltre: number
  /** La prossima da fare: la prima non ancora fatta, nell'ordine suo. */
  prossima: string | null
  /** L'ultima seduta del coach registrata. */
  ultima: { codice: string; date: string } | null
  chiusi: CicloChiuso[]
  storico: { inTempo: number; allungati: number; giorniMedi: number | null; saltate: number }
}

type Seduta = { codice: string; date: string }

/**
 * Ricostruisce i cicli dalle sedute registrate.
 *
 * Ogni seduta sa da quale scheda e' nata, e le schede del coach hanno il loro
 * codice: da li' si legge la sequenza vera, D per D. Le sedute tue e i cardio
 * non entrano — questo conta il protocollo, non l'attivita'.
 */
export async function cicloRs(oggi = todayLocal()): Promise<CicloRs | null> {
  const ordine = SEDUTE_RS.map((s) => s.codice)
  const utente = await db.users.get(U)
  const inizioProtocollo = utente?.rsStart ?? RS_START_DEFAULT
  const chiusureAMano = [...(utente?.cicliChiusiAMano ?? [])].sort()

  const schede = await db.templates.where('userId').equals(U).toArray()
  // Dalla scheda al codice: il nome e' quello che l'import ha scritto («🦠 D4 · …»).
  const codiceDi = new Map<string, string>()
  for (const t of schede) {
    const s = SEDUTE_RS.find((x) => x.nome === t.name)
    if (s) codiceDi.set(t.id, s.codice)
  }
  if (!codiceDi.size) return null

  const sedute: Seduta[] = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => s.finishedAt && s.srcTemplateId && codiceDi.has(s.srcTemplateId)
      && s.date >= inizioProtocollo && s.date <= oggi)
    .map((s) => ({ codice: codiceDi.get(s.srcTemplateId!)!, date: s.date }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // I giri: si chiudono con le cinque, o dove li hai chiusi tu.
  const giri: { sedute: Seduta[]; aMano?: boolean; fino?: string }[] = []
  let corrente: Seduta[] = []
  const daChiudere = [...chiusureAMano]

  const chiudiQui = (quando: string) => {
    giri.push({ sedute: corrente, aMano: true, fino: quando })
    corrente = []
  }

  for (const s of sedute) {
    // Una chiusura a mano vale per tutto quello che e' venuto prima di lei.
    while (daChiudere.length && daChiudere[0] < s.date) chiudiQui(daChiudere.shift()!)
    corrente.push(s)
    if (new Set(corrente.map((x) => x.codice)).size === ordine.length) {
      giri.push({ sedute: corrente })
      corrente = []
    }
  }
  while (daChiudere.length) chiudiQui(daChiudere.shift()!)

  /**
   * Da quando comincia un ciclo: NON dalla sua prima seduta.
   *
   * Il giro scorre di continuo — l'orologio riparte da dove e' finito quello
   * prima, anche se poi ti alleni due giorni dopo. Contando dalla prima seduta,
   * i giorni di riposo fra un giro e l'altro sparivano dal conto: un ciclo
   * cominciato il 17 e chiuso il 25 risultava di 8 giorni invece di 9.
   *
   * Il primo parte dall'inizio del protocollo, gli altri dal giorno dopo la
   * chiusura del precedente.
   */
  let cursore = inizioProtocollo
  const daGiro = (g: { sedute: Seduta[]; aMano?: boolean; fino?: string }, numero: number): CicloChiuso => {
    const dal = cursore
    const al = g.aMano ? (g.fino ?? dal) : g.sedute[g.sedute.length - 1].date
    cursore = shiftDate(al, 1)
    return {
      numero,
      dal,
      al,
      giorni: daysBetween(dal, al) + 1,
      fatte: g.sedute.map((s) => s.codice),
      fuoriOrdine: fuoriOrdine(g.sedute, ordine),
      ...(g.aMano ? { aMano: true } : {}),
    }
  }

  const tuttiChiusi = giri.map((g, i) => daGiro(g, i + 1))
  const chiusi = [...tuttiChiusi].reverse()
  // I cicli chiusi a mano non entrano nella media dei giorni: sono interrotti, e
  // mescolarli falserebbe il «quanto ci metto di solito».
  const completi = tuttiChiusi.filter((c) => !c.aMano)
  const inTempo = completi.filter((c) => c.giorni <= GIORNI_CICLO).length
  const giorniMedi = completi.length
    ? Math.round((completi.reduce((a, c) => a + c.giorni, 0) / completi.length) * 10) / 10
    : null

  // Il ciclo in corso.
  const numero = giri.length + 1
  const fatte = new Map(corrente.map((s) => [s.codice, s.date]))
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

  // Il ciclo aperto parte dove il cursore e' arrivato: giorno dopo l'ultima
  // chiusura, o inizio protocollo se non se n'e' chiuso ancora nessuno.
  const dal = cursore
  const giorno = Math.max(1, daysBetween(dal, oggi) + 1)
  const ultimaSeduta = sedute[sedute.length - 1]

  return {
    numero,
    dal,
    passi,
    fatte: fatte.size,
    totale: ordine.length,
    giorno,
    giorniPrevisti: GIORNI_CICLO,
    oltre: Math.max(0, giorno - GIORNI_CICLO),
    prossima,
    ultima: ultimaSeduta ? { codice: ultimaSeduta.codice, date: ultimaSeduta.date } : null,
    chiusi: chiusi.slice(0, 4),
    storico: {
      inTempo,
      allungati: completi.length - inTempo,
      giorniMedi,
      saltate: tuttiChiusi.reduce((a, c) => a + c.fuoriOrdine.length, 0),
    },
  }
}

/**
 * «Questo giro lo chiudo qui»: il ciclo si archivia com'è e il prossimo parte
 * dal giorno dopo. Senza, il conteggio resterebbe appeso a un ciclo che non
 * finirai mai, e tutti i numeri dopo di lui sarebbero sbagliati.
 */
export async function chiudiCicloAMano(quando = todayLocal()): Promise<void> {
  const u = await db.users.get(U)
  const gia = u?.cicliChiusiAMano ?? []
  if (gia.includes(quando)) return
  await db.users.update(U, { cicliChiusiAMano: [...gia, quando].sort(), updatedAt: new Date().toISOString() })
}

/** Torna indietro sull'ultima chiusura: un tocco per sbaglio non deve falsare lo storico. */
export async function annullaChiusuraAMano(): Promise<void> {
  const u = await db.users.get(U)
  const gia = [...(u?.cicliChiusiAMano ?? [])].sort()
  if (!gia.length) return
  gia.pop()
  await db.users.update(U, { cicliChiusiAMano: gia, updatedAt: new Date().toISOString() })
}

/** Quali sedute sono state fatte dopo una che veniva dopo di loro. */
function fuoriOrdine(giro: Seduta[], ordine: string[]): string[] {
  const out: string[] = []
  let massimo = -1
  for (const s of giro) {
    const i = ordine.indexOf(s.codice)
    if (i < massimo) out.push(s.codice)
    else massimo = i
  }
  return out
}


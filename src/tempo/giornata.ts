// La giornata misurata: cosa hai fatto e quando, da quello che l'app sa gia'.
//
// Sonno da WHOOP (che lo attacca alla mattina del risveglio: la notte prima di
// un giorno sta nel giorno, quella dopo nel giorno dopo), allenamento dalle
// sedute, pasti dall'ora segnata in Cibo, lavoro dagli orari del Profilo.
// Tutto in minuti dalla mezzanotte del giorno: dopo mezzanotte si va oltre 1440.
//
// Solo lettura.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { shiftDate } from '../util/date'
import { getUser } from '../db/repo'
import { orariDi, fasceDeiPasti, minuti } from './orari'
import { SEDUTE_RS } from '../rs/protocollo'

const U = LOCAL_USER_ID

export type TipoBlocco = 'sonno' | 'lavoro' | 'pausa' | 'uscita' | 'allena' | 'libero'
export interface Blocco { tipo: TipoBlocco; dalle: number; alle: number; testo: string; sotto?: string }
export interface PuntoPasto { id: string; nome: string; ora?: number; saltato?: boolean; fascia?: string }
export interface Intervallo { dalle: number; alle: number; etichetta: string }
export interface GiornataTempo {
  data: string
  inizio: number
  fine: number
  blocchi: Blocco[]
  pasti: PuntoPasto[]
  intervalli: Intervallo[]
  /** pasti del giorno senza ora e non saltati, per dirlo sotto */
  senzaOra: string[]
}

/** Un istante (ISO) in minuti dalla mezzanotte di `data`, nell'ora di qui. */
function minDa(data: string, iso: string): number {
  const d = new Date(iso)
  const zero = new Date(data + 'T00:00:00')
  return Math.round((d.getTime() - zero.getTime()) / 60_000)
}

export const durata = (m: number) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return h ? `${h}h${String(r).padStart(2, '0')}` : `${r} min`
}
const orario = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export async function giornataTempo(data: string): Promise<GiornataTempo> {
  const user = await getUser()
  const orari = orariDi(user)
  const blocchi: Blocco[] = []

  // --- sonno: la notte prima (risveglio di oggi) e quella dopo (si va a letto oggi)
  const notte = await db.whoopDays.where('date').equals(data).filter((d) => d.userId === U).first()
  const dopo = await db.whoopDays.where('date').equals(shiftDate(data, 1)).filter((d) => d.userId === U).first()
  const sveglia = notte?.sleepEnd ? minDa(data, notte.sleepEnd) : null
  const letto = dopo?.sleepStart ? minDa(data, dopo.sleepStart) : null

  // --- lavoro: i giorni e gli orari del Profilo, con l'uscita vera se l'hai segnata
  const l = orari.lavoro
  const giornoSett = new Date(data + 'T12:00:00').getDay()
  let fineLavoro: number | null = null
  if (l && l.giorni.includes(giornoSett)) {
    const entrata = minuti(l.entrata)
    const uscitaVera = user?.uscite?.[data]
    const uscita = Math.max(minuti(l.uscita), uscitaVera ? minuti(uscitaVera) : 0)
    fineLavoro = uscita
    if (l.pausa && minuti(l.pausa.dalle) > entrata && minuti(l.pausa.alle) < uscita) {
      blocchi.push({ tipo: 'lavoro', dalle: entrata, alle: minuti(l.pausa.dalle), testo: 'lavoro', sotto: `${l.entrata} → ${l.pausa.dalle}` })
      blocchi.push({ tipo: 'pausa', dalle: minuti(l.pausa.dalle), alle: minuti(l.pausa.alle), testo: 'pausa pranzo' })
      blocchi.push({ tipo: 'lavoro', dalle: minuti(l.pausa.alle), alle: uscita, testo: 'lavoro', sotto: `${l.pausa.alle} → ${orario(uscita)}` })
    } else {
      blocchi.push({ tipo: 'lavoro', dalle: entrata, alle: uscita, testo: 'lavoro', sotto: `${l.entrata} → ${orario(uscita)}` })
    }
    // La finestra in cui a volte esci tardi: tratteggiata finche' non segni l'uscita.
    if (!uscitaVera && l.uscitaFinoA && minuti(l.uscitaFinoA) > uscita) {
      blocchi.push({ tipo: 'uscita', dalle: uscita, alle: minuti(l.uscitaFinoA), testo: `a volte fino alle ${l.uscitaFinoA}` })
    }
    // Uscita segnata: la dice gia' il blocco del lavoro («14:00 → 17:48»).
  }

  // --- allenamento: le sedute chiuse del giorno, col nome della scheda del coach se c'e'
  const schede = new Map((await db.templates.toArray()).map((t) => [t.id, t.name]))
  const sedute = (await db.sessions.where('date').equals(data).toArray())
    .filter((s) => s.userId === U && s.finishedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const s of sedute) {
    const da = minDa(data, s.startedAt), a = minDa(data, s.finishedAt!)
    const nomeScheda = s.srcTemplateId ? schede.get(s.srcTemplateId) : undefined
    const rs = nomeScheda ? SEDUTE_RS.find((x) => x.nome === nomeScheda) : undefined
    blocchi.push({
      tipo: 'allena', dalle: da, alle: a,
      // «D1 · PULL A» si legge «D1 · Pull A», come in Oggi.
      testo: rs ? `${rs.codice} · ${rs.nome.split(' · ').slice(1).join(' · ').split(' ').map((p) => (p.length > 1 ? p[0] + p.slice(1).toLowerCase() : p)).join(' ')}` : nomeScheda ?? 'Allenamento',
      sotto: `${orario(da)} → ${orario(a)} · ${durata(a - da)}`,
    })
  }
  const primaSeduta = sedute[0] ? minDa(data, sedute[0].startedAt) : null
  const ultimaFine = sedute.length ? minDa(data, sedute[sedute.length - 1].finishedAt!) : null

  // --- tempo libero fra lavoro e allenamento, se c'e' davvero
  if (fineLavoro != null && primaSeduta != null && primaSeduta - fineLavoro >= 20) {
    blocchi.push({ tipo: 'libero', dalle: fineLavoro, alle: primaSeduta, testo: `libero · ${durata(primaSeduta - fineLavoro)}` })
  }

  // --- pasti: con la loro ora, o saltati
  const pastiGiorno = (await db.meals.where('date').equals(data).toArray()).filter((m) => m.userId === U)
    .sort((a, b) => a.order - b.order)
  const fasce = fasceDeiPasti(pastiGiorno, orari.pasti)
  const pasti: PuntoPasto[] = pastiGiorno.map((m) => ({
    id: m.id, nome: m.name,
    ...(m.ora ? { ora: minuti(m.ora) } : {}),
    ...(m.saltato ? { saltato: true } : {}),
    ...(fasce.get(m.id) ? { fascia: fasce.get(m.id)!.fascia.nome } : {}),
  }))
  const righe = await db.foodLogs.where('date').equals(data).count()
  const senzaOra = righe ? pastiGiorno.filter((m) => !m.ora && !m.saltato && fasce.has(m.id)).map((m) => m.name) : []

  // --- gli intervalli che contano: fine allenamento → cena, cena → letto
  const intervalli: Intervallo[] = []
  const ultimaFascia = orari.pasti.length - 1
  const cena = pastiGiorno.find((m) => fasce.get(m.id)?.indice === ultimaFascia && m.ora)
  const oraCena = cena?.ora ? minuti(cena.ora) : null
  if (ultimaFine != null && oraCena != null && oraCena >= ultimaFine) {
    intervalli.push({ dalle: ultimaFine, alle: oraCena, etichetta: 'allenam. → cena' })
  }
  if (oraCena != null && letto != null && letto > oraCena) {
    intervalli.push({ dalle: oraCena, alle: letto, etichetta: 'cena → letto' })
  }

  // --- il sonno, disegnato per ultimo cosi' sta sopra al resto
  // La finestra si allarga quanto serve: dalle 6 (o prima, se ti svegli prima)
  // a mezzanotte (o dopo, se vai a letto dopo), in ore intere.
  const inizio = Math.min(360, sveglia != null ? Math.floor((sveglia - 30) / 60) * 60 : 360)
  const fine = Math.max(1440, letto != null ? Math.ceil((letto + 60) / 60) * 60 : 1440)
  if (sveglia != null) {
    const da = Math.max(inizio, notte?.sleepStart ? minDa(data, notte.sleepStart) : inizio)
    blocchi.push({
      tipo: 'sonno', dalle: da, alle: sveglia, testo: `sonno · sveglia ${orario(sveglia)}`,
      ...(notte?.sleepHours != null ? { sotto: `${durata(notte.sleepHours * 60)}${notte.recovery != null ? ` · recupero ${notte.recovery}%` : ''}` } : {}),
    })
  }
  if (letto != null) {
    blocchi.push({
      tipo: 'sonno', dalle: letto, alle: fine, testo: `sonno · a letto ${orario(letto)}`,
      ...(dopo?.sleepHours != null ? { sotto: `${durata(dopo.sleepHours * 60)}${dopo.recovery != null ? ` · recupero ${dopo.recovery}%` : ''}` } : {}),
    })
  }

  return { data, inizio, fine, blocchi, pasti, intervalli, senzaOra }
}

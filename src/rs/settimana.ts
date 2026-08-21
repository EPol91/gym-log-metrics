// 🦠RS — il check settimanale.
//
// I numeri della settimana escono dai tuoi dati, il testo si compone da quei
// numeri, e tu lo correggi prima di mandarlo. Nessun aggettivo inventato: se un
// dato non c'e', la frase non lo nomina. Il coach su quella riga ci decide.
//
// La settimana comincia SEMPRE di lunedi', come il conteggio del protocollo.

import { db, newId, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { statoDieta } from './dieta'
import { whoopDay } from '../db/whoop'
import { getHabitValue, STEPS } from '../db/habits'
import { fmtData } from '../util/format'
import { settimanaGiorno } from './rs'
import type { RsCheck } from '../db/schema'

const U = LOCAL_USER_ID

/** I sette giorni della settimana `n` del protocollo, da lunedi'. */
export function giorniDellaSettimana(inizio: string, n: number): string[] {
  const i = new Date(inizio + 'T00:00:00')
  const lunedi = new Date(i)
  lunedi.setDate(i.getDate() - ((i.getDay() + 6) % 7) + (n - 1) * 7)
  return Array.from({ length: 7 }, (_, k) => {
    const d = new Date(lunedi)
    d.setDate(lunedi.getDate() + k)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

export interface NumeriSettimana {
  giorni: string[]
  pesoMedio: number | null
  delta: number | null
  aderenza: number | null
  precisione: number | null
  sedute: number
  passiMedi: number | null
  sonnoMedio: number | null
  recuperoMedio: number | null
  pr: string[]
  sostituzioni: string[]
}

const media = (v: number[]): number | null =>
  v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null

/** I numeri della settimana, letti dai tuoi dati. */
export async function numeriSettimana(inizio: string, n: number): Promise<NumeriSettimana> {
  const giorni = giorniDellaSettimana(inizio, n)
  const primaSettimana = n > 1 ? giorniDellaSettimana(inizio, n - 1) : []

  const misure = await db.bodyMeasurements.where('userId').equals(U).toArray()
  const pesi = misure.filter((m) => giorni.includes(m.date)).map((m) => m.weight)
  const pesiPrima = misure.filter((m) => primaSettimana.includes(m.date)).map((m) => m.weight)
  const pesoMedio = media(pesi)
  const mediaPrima = media(pesiPrima)

  const aderenze: number[] = [], precisioni: number[] = [], sostituzioni: string[] = []
  for (const g of giorni) {
    const s = await statoDieta(g)
    if (!s.attiva) continue
    if (s.aderenza != null) aderenze.push(s.aderenza)
    if (s.precisione != null) precisioni.push(s.precisione)
    for (const r of s.righe.filter((x) => x.sostituita)) {
      sostituzioni.push(`${r.piano?.nome ?? '?'} → ${r.nome}`)
    }
  }

  const sessioni = (await db.sessions.where('userId').equals(U).toArray())
    .filter((s) => giorni.includes(s.date) && s.finishedAt)

  const passi: number[] = [], sonni: number[] = [], recuperi: number[] = []
  for (const g of giorni) {
    const p = await getHabitValue(STEPS, g)
    if (p?.value != null) passi.push(p.value)
    const w = await whoopDay(g)
    if (w?.sleepHours != null) sonni.push(w.sleepHours)
    if (w?.recovery != null) recuperi.push(w.recovery)
  }

  return {
    giorni, pesoMedio,
    delta: pesoMedio != null && mediaPrima != null ? Math.round((pesoMedio - mediaPrima) * 10) / 10 : null,
    aderenza: media(aderenze) != null ? Math.round(media(aderenze)!) : null,
    precisione: media(precisioni) != null ? Math.round(media(precisioni)!) : null,
    sedute: sessioni.length,
    passiMedi: media(passi) != null ? Math.round(media(passi)!) : null,
    sonnoMedio: media(sonni),
    recuperoMedio: media(recuperi) != null ? Math.round(media(recuperi)!) : null,
    pr: [],
    sostituzioni: [...new Set(sostituzioni)],
  }
}

const ore = (h: number) => `${Math.floor(h)}h${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`

/** Il testo per il coach, composto dai fatti. Quello che manca non viene nominato. */
export function testoSettimana(n: number, x: NumeriSettimana): string {
  const p: string[] = [`Settimana ${n} chiusa.`]
  if (x.pesoMedio != null) {
    p.push(`Peso ${x.pesoMedio} di media${x.delta != null ? `, ${x.delta > 0 ? '+' : ''}${x.delta} sulla scorsa` : ''}.`)
  }
  if (x.aderenza != null) {
    p.push(`Aderenza ${x.aderenza}%${x.precisione != null ? `, precisione ${x.precisione}%` : ''}.`)
  }
  if (x.sostituzioni.length) p.push(`Sostituzioni: ${x.sostituzioni.join(', ')}.`)
  p.push(x.sedute === 1 ? '1 seduta.' : `${x.sedute} sedute.`)
  if (x.passiMedi != null) p.push(`${x.passiMedi.toLocaleString('it-IT')} passi al giorno.`)
  if (x.sonnoMedio != null) {
    p.push(`Sonno ${ore(x.sonnoMedio)} di media${x.recuperoMedio != null ? `, recupero ${x.recuperoMedio}%` : ''}.`)
  }
  return p.join(' ')
}

/** L'intervallo leggibile della settimana: "24.08 – 30.08". */
export function periodo(inizio: string, n: number): string {
  const g = giorniDellaSettimana(inizio, n)
  return `${fmtData(g[0]).slice(0, 5)} – ${fmtData(g[6]).slice(0, 5)}`
}

// --- Salvataggio -------------------------------------------------------------

export function checkSettimana(n: number) {
  return db.rsChecks.where('userId').equals(U).filter((c) => c.settimana === n).first()
}

/** Salva il testo (tuo o composto) e lo stato. */
export async function salvaCheck(n: number, testo: string, stato: RsCheck['stato'] = 'da-inviare'): Promise<void> {
  const gia = await checkSettimana(n)
  const ts = nowISO()
  if (gia) {
    await db.rsChecks.update(gia.id, { testo, stato, updatedAt: ts })
  } else {
    await db.rsChecks.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, settimana: n, testo, stato, foto: [] })
  }
}

/**
 * Segna che qualcosa e' cambiato DOPO l'invio: il coach ha ancora la versione
 * vecchia, e deve saperlo chi guarda, non restare un dettaglio nascosto.
 */
export async function segnaModificato(n: number): Promise<void> {
  const c = await checkSettimana(n)
  if (c?.stato === 'inviato') await db.rsChecks.update(c.id, { stato: 'modificato', updatedAt: nowISO() })
}

/** Aggiunge una foto (data URL) al check della settimana. */
export async function aggiungiFoto(n: number, dataUrl: string): Promise<void> {
  const c = await checkSettimana(n)
  const ts = nowISO()
  if (c) {
    await db.rsChecks.update(c.id, { foto: [...(c.foto ?? []), dataUrl], updatedAt: ts })
    if (c.stato === 'inviato') await db.rsChecks.update(c.id, { stato: 'modificato' })
  } else {
    await db.rsChecks.add({ id: newId(), userId: U, createdAt: ts, updatedAt: ts, settimana: n, testo: '', stato: 'da-inviare', foto: [dataUrl] })
  }
}

export async function togliFoto(n: number, i: number): Promise<void> {
  const c = await checkSettimana(n)
  if (!c) return
  const foto = [...(c.foto ?? [])]
  foto.splice(i, 1)
  await db.rsChecks.update(c.id, { foto, updatedAt: nowISO() })
}

/** A che settimana sei oggi, secondo il calendario del coach. */
export function settimanaCorrente(inizio: string, oggi: string): number {
  return Math.max(1, settimanaGiorno(oggi, inizio).settimana)
}

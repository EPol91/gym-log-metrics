// Date come stringa YYYY-MM-DD, sempre nel fuso LOCALE.
//
// Perché esiste questo file: `new Date().toISOString()` restituisce la data UTC.
// In Italia (UTC+1/+2) tra mezzanotte e le 2 del mattino dà il GIORNO PRIMA, e
// `new Date('2026-07-28T00:00:00')` (mezzanotte locale) tornando in UTC diventa
// il 27 alle 22:00 — da cui "avanti di un giorno" che non si muoveva.

const pad = (n: number) => String(n).padStart(2, '0')

/** Oggi secondo l'orologio del telefono, non secondo UTC. */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Sposta una data di N giorni restando sul calendario (niente conversioni di fuso). */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** Millisecondi di una data (mezzogiorno UTC: immune ai cambi di ora legale). */
export function dateMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/** Giorni di distanza tra due date. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateMs(b) - dateMs(a)) / 86_400_000)
}

/**
 * Il giorno come lo leggi tu: «Oggi», «Ieri», oppure «mar 15/8».
 *
 * Il giorno della settimana c'e' perche' e' quello che stai cercando davvero:
 * «15.08.2026» ti dice il numero, non se era un sabato. `oggi` si passa da
 * fuori perche' non tutte le schermate cambiano giorno alla stessa ora — la
 * dieta ha la sua mezzanotte.
 */
export function etichettaGiorno(iso: string, oggi: string = todayLocal()): string {
  if (iso === oggi) return 'Oggi'
  if (iso === shiftDate(oggi, -1)) return 'Ieri'
  const d = new Date(iso + 'T00:00:00')
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]
  return `${gg} ${d.getDate()}/${d.getMonth() + 1}`
}

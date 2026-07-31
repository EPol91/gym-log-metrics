// Recupero leggibile: minuti interi → "Nmin" (60→1min, 120→2min), altrimenti "Xmin Ys" o "Xs".
/** Durata del sonno in ore e minuti: "5h 19" si legge, "5.32h" no. */
export function fmtOre(h?: number): string {
  if (h == null) return '—'
  const tot = Math.round(h * 60)
  return `${Math.floor(tot / 60)}h ${String(tot % 60).padStart(2, '0')}`
}

/**
 * Data come si scrive qui: 31.07.2026.
 *
 * Dentro l'app le date restano in formato ISO (2026-07-31) perche' si ordinano
 * da sole e non lasciano dubbi fra giorno e mese: quello e' il magazzino.
 * Questa e' la vetrina, e va usata OVUNQUE una data finisca sotto gli occhi.
 */
export function fmtData(iso?: string | null): string {
  if (!iso) return '—'
  const [a, m, g] = iso.slice(0, 10).split('-')
  return g && m && a ? `${g}.${m}.${a}` : iso
}

export function fmtRest(sec: number): string {
  if (sec % 60 === 0) return `${sec / 60}min`
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}min ${sec % 60}s`
}

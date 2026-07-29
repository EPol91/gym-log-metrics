// Recupero leggibile: minuti interi → "Nmin" (60→1min, 120→2min), altrimenti "Xmin Ys" o "Xs".
/** Durata del sonno in ore e minuti: "5h 19" si legge, "5.32h" no. */
export function fmtOre(h?: number): string {
  if (h == null) return '—'
  const tot = Math.round(h * 60)
  return `${Math.floor(tot / 60)}h ${String(tot % 60).padStart(2, '0')}`
}

export function fmtRest(sec: number): string {
  if (sec % 60 === 0) return `${sec / 60}min`
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}min ${sec % 60}s`
}

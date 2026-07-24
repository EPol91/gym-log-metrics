// Recupero leggibile: minuti interi → "Nmin" (60→1min, 120→2min), altrimenti "Xmin Ys" o "Xs".
export function fmtRest(sec: number): string {
  if (sec % 60 === 0) return `${sec / 60}min`
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}min ${sec % 60}s`
}

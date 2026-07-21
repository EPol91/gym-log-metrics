// Validazione input numerici: virgola→punto (tastiere IT), range, scarto NaN.

export interface NumOpts { min?: number; max?: number; int?: boolean }

/** Ritorna il numero valido, o null se non valido / fuori range. */
export function parseNum(v: string | number, opts: NumOpts = {}): number | null {
  const raw = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(raw)) return null
  let n = raw
  if (opts.int) n = Math.round(n)
  if (opts.min != null && n < opts.min) return null
  if (opts.max != null && n > opts.max) return null
  return n
}

/** Come parseNum ma clampa dentro il range invece di rifiutare. */
export function clampNum(v: string | number, opts: NumOpts = {}): number | null {
  const raw = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(raw)) return null
  let n = opts.int ? Math.round(raw) : raw
  if (opts.min != null) n = Math.max(opts.min, n)
  if (opts.max != null) n = Math.min(opts.max, n)
  return n
}

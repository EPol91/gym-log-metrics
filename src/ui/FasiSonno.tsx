// Le fasi della notte (WHOOP): leggero, profondo, REM, sveglio. Un pezzo solo,
// usato da Oggi, Vitali e Tempo, cosi' colori e ordine sono gli stessi ovunque.

import type { WhoopDay } from '../db/schema'

export const FASI = [
  { k: 'sleepLightMin', nome: 'Leggero', corto: 'Legg.', colore: '#8e9be0' },
  { k: 'sleepDeepMin', nome: 'Profondo', corto: 'Prof.', colore: '#3d4fb8' },
  { k: 'sleepRemMin', nome: 'REM', corto: 'REM', colore: '#b07be0' },
  { k: 'sleepAwakeMin', nome: 'Sveglio', corto: 'Sv.', colore: '#4a4740' },
] as const

type ConFasi = Pick<WhoopDay, 'sleepLightMin' | 'sleepDeepMin' | 'sleepRemMin' | 'sleepAwakeMin'>

export const haFasi = (d?: ConFasi | null): boolean =>
  !!d && (d.sleepLightMin != null || d.sleepDeepMin != null || d.sleepRemMin != null)

/** Minuti in «1h29»; sotto l'ora «28′». */
export function fmtMin(m?: number): string {
  if (m == null) return '—'
  const t = Math.round(m)
  return t < 60 ? `${t}′` : `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`
}

/** Il tempo a letto: le quattro fasi insieme. */
export const aLetto = (d: ConFasi) => FASI.reduce((a, f) => a + (d[f.k] ?? 0), 0)

/**
 * La barra della notte. Con `scala` (minuti) e' lunga quanto il tempo a letto
 * su quella scala, cosi' le notti si confrontano; senza, riempie la riga.
 */
export function BarraFasi({ d, alta = 10, scala }: { d: ConFasi; alta?: number; scala?: number }) {
  const tot = aLetto(d)
  return (
    <div style={{ display: 'flex', gap: 1, height: alta, borderRadius: alta / 2.5, overflow: 'hidden', width: scala ? `${Math.min(100, (tot / scala) * 100)}%` : '100%' }}>
      {FASI.map((f) => (d[f.k] ?? 0) > 0 && (
        <i key={f.k} style={{ display: 'block', flex: d[f.k]!, background: f.colore }} />
      ))}
    </div>
  )
}

/** Il quadratino del colore, per le legende. */
export const Punto = ({ colore }: { colore: string }) => (
  <b style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colore, marginRight: 5 }} />
)

/** La legenda; con `d` porta anche i minuti di ogni fase. */
export function LegendaFasi({ d, corta }: { d?: ConFasi; corta?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: 'var(--muted)' }}>
      {FASI.map((f) => (
        <span key={f.k} style={{ whiteSpace: 'nowrap' }}>
          <Punto colore={f.colore} />{corta ? f.corto : f.nome}
          {d && <span style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 14, color: 'var(--text)', marginLeft: 3 }}>{fmtMin(d[f.k])}</span>}
        </span>
      ))}
    </div>
  )
}

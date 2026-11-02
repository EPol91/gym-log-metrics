// Mini grafico a linea SVG (nessuna libreria). Per l'andamento e1RM nel tempo.

/**
 * `segnati`: punti in azzurro (in Corpo: i giorni con una nota). `onPunto`: il
 * punto si tocca, e chi chiama mostra cosa c'è dietro; `sel` è quello toccato.
 */
export function LineChart({ points, segnati, onPunto, sel, vuoto }: {
  points: { label: string; value: number }[]
  segnati?: boolean[]
  onPunto?: (i: number) => void
  sel?: number | null
  vuoto?: string
}) {
  if (points.length < 2) {
    return <p className="muted small">{vuoto ?? 'Servono almeno 2 sedute per il grafico.'}</p>
  }
  const W = 300, H = 120, pad = 10
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1)
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ')
  const area = `${line} L ${x(points.length - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="120" preserveAspectRatio="none" role="img" aria-label="Andamento">
      <path className="chart-area" d={area} fill="rgba(212,175,55,0.12)" />
      <path className="chart-line" pathLength={1} d={line} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle className="chart-dot" style={{ animationDelay: `${0.6 + i * 0.06}s` }} key={i} cx={x(i)} cy={y(p.value)}
          r={sel === i ? 4.5 : segnati?.[i] ? 3.5 : 2.5} fill={segnati?.[i] ? '#8e9be0' : 'var(--gold)'} />
      ))}
      {/* Il bersaglio del tocco è più grande del punto: col dito un cerchio da 2 px non si prende. */}
      {onPunto && points.map((_, i) => (
        <rect key={'t' + i} x={x(i) - (W - 2 * pad) / (points.length - 1) / 2} y={0} width={(W - 2 * pad) / (points.length - 1)} height={H}
          fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPunto(i)} />
      ))}
    </svg>
  )
}

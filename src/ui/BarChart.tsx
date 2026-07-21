// Mini grafico a barre SVG (nessuna libreria).

export function BarChart({ points, unit = '' }: { points: { label: string; value: number }[]; unit?: string }) {
  if (points.length === 0) return <p className="muted small">Nessun dato.</p>
  const W = 300, H = 120, pad = 18
  const max = Math.max(...points.map((p) => p.value), 1)
  const bw = (W - 2 * pad) / points.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="130" role="img" aria-label="Grafico a barre">
      {points.map((p, i) => {
        const h = ((H - 2 * pad) * p.value) / max
        const x = pad + i * bw
        const y = H - pad - h
        return (
          <g key={i}>
            <rect className="chart-bar" style={{ animationDelay: `${i * 0.05}s` }} x={x + 2} y={y} width={bw - 4} height={h} rx="3" fill="var(--gold)" opacity={0.85} />
            <text x={x + bw / 2} y={H - 6} fontSize="7" fill="var(--muted)" textAnchor="middle">{p.label}</text>
            {p.value > 0 && <text x={x + bw / 2} y={y - 3} fontSize="7" fill="var(--muted)" textAnchor="middle">{Math.round(p.value)}{unit}</text>}
          </g>
        )
      })}
    </svg>
  )
}

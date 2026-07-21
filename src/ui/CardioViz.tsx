const ZONE_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']

/** Cuore pulsante (al ritmo dei bpm, o "respiro" ambient) + barra zone Z1-Z5 con indicatore live. */
export function CardioViz({ bpm, pct, zone }: { bpm?: number; pct?: number; zone?: number }) {
  const beating = !!bpm
  const dur = bpm ? `${(60 / bpm).toFixed(2)}s` : '3s'
  const zoneCol = zone ? ZONE_COLORS[zone - 1] : 'var(--gold)'

  return (
    <div className="row" style={{ gap: 12, alignItems: 'center', marginTop: 6 }}>
      <span style={{
        fontSize: 26, lineHeight: 1, color: '#ef4444', display: 'inline-block',
        animation: `${beating ? 'heartBeat' : 'breathe'} ${dur} ease-in-out infinite`,
      }}>♥</span>
      <div style={{ flex: 1 }}>
        {bpm && <div className="small" style={{ marginBottom: 3, color: zoneCol }}>{bpm} bpm{zone ? ` · Z${zone}` : ''}</div>}
        <div style={{ position: 'relative', height: 10 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden' }}>
            {ZONE_COLORS.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c, opacity: zone ? (i === zone - 1 ? 1 : 0.35) : 0.6 }} />
            ))}
          </div>
          {pct != null && (
            <div style={{
              position: 'absolute', top: -3, left: `${Math.max(0, Math.min(100, pct))}%`,
              width: 3, height: 16, background: '#fff', borderRadius: 2, transform: 'translateX(-50%)',
              transition: 'left .6s ease',
            }} />
          )}
        </div>
      </div>
    </div>
  )
}

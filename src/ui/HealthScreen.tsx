import { useLiveQuery } from 'dexie-react-hooks'
import { BodyScreen } from './BodyScreen'
import { HistoryScreen } from './HistoryScreen'
import { AnalyticsScreen } from './AnalyticsScreen'
import { HabitsScreen } from './HabitsScreen'
import { usePersistedState } from '../util/persist'
import { useState } from 'react'
import { computeHome } from '../scores/dashboardScores'
import { ScoreRing } from './anim'
import { whoopTrend } from '../db/whoop'
import type { WhoopDay } from '../db/schema'

type Sub = 'vitali' | 'body' | 'habits' | 'analytics' | 'history'

const TABS: { key: Sub; label: string }[] = [
  { key: 'vitali', label: 'Vitali' },
  { key: 'body', label: 'Corpo' },
  { key: 'habits', label: 'Abitudini' },
  { key: 'analytics', label: 'Analisi' },
  { key: 'history', label: 'Storico' },
]

/**
 * Salute: come stai andando, non come stai adesso. Qui vive tutto ciò che si
 * guarda nel tempo — la regola che tiene separata questa schermata da Oggi.
 */
export function HealthScreen({ onReopen }: { onReopen?: (id: string) => void }) {
  const [sub, setSub] = usePersistedState<Sub>('health-sub', 'vitali')

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map((t) => (
          <button key={t.key} className={sub === t.key ? 'chip on' : 'chip'} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>

      {sub === 'vitali' && <Vitali />}
      {sub === 'body' && <BodyScreen />}
      {sub === 'habits' && <HabitsScreen />}
      {sub === 'analytics' && <Analisi />}
      {sub === 'history' && <HistoryScreen onReopen={onReopen} />}
    </div>
  )
}

/** I quattro Score: erano in Home, ma sono andamenti — il loro posto è qui. */
function Analisi() {
  const home = useLiveQuery(computeHome, [])
  const SCORES = [
    { key: 'readiness', label: 'Readiness' },
    { key: 'workout', label: 'Workout' },
    { key: 'performance', label: 'Perf.' },
    { key: 'consistency', label: 'Constan.' },
  ] as const

  return (
    <>
      {home && (
        <div className="card">
          <div className="row" style={{ gap: 4 }}>
            {SCORES.map((s) => (
              <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <ScoreRing value={home[s.key].value} size={58} />
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <AnalyticsScreen />
    </>
  )
}

/**
 * Vitali: come sono andati recupero, HRV, sonno e sforzo nel tempo — e quante
 * volte ti sei allenato da scarico, che è la domanda che nessuna delle due app
 * sa rispondere da sola.
 */
function Vitali() {
  const [giorni, setGiorni] = useState(90)
  const d = useLiveQuery(() => whoopTrend(giorni), [giorni])

  if (!d) return <p className="muted">Carico…</p>
  const righe = d.righe

  const periodi = [30, 90, 180]
  const selettore = (
    <div className="row" style={{ gap: 6 }}>
      {periodi.map((p) => (
        <button key={p} className={giorni === p ? 'chip on' : 'chip'} onClick={() => setGiorni(p)}>
          {p === 180 ? '6 mesi' : `${p} giorni`}
        </button>
      ))}
    </div>
  )

  if (!righe.length) {
    return (
      <>
        {selettore}
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>
            Nessun dato WHOOP in questo periodo. Collega l'account dal Profilo, poi tocca Aggiorna
            o Scarica 6 mesi.
          </p>
        </div>
      </>
    )
  }

  const media = (f: (r: WhoopDay) => number | undefined) => {
    const v = righe.map(f).filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }

  // Allenarsi da scarichi: il dato che vale la pena guardare.
  const scarichi = righe.filter((r) => r.recovery != null && r.recovery < 40)
  const scarichiAllenati = scarichi.filter((r) => d.sedute.has(r.date)).length

  return (
    <>
      {selettore}

      <div className="card">
        <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Medie · {righe.length} giornate
        </div>
        <div className="row" style={{ textAlign: 'center' }}>
          {[
            { v: media((r) => r.recovery), l: 'recupero', s: '%' },
            { v: media((r) => r.hrv), l: 'HRV', s: '' },
            { v: media((r) => r.restingHr), l: 'FC riposo', s: '' },
            { v: media((r) => r.sleepHours), l: 'sonno', s: 'h' },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {x.v != null ? `${x.v}${x.s}` : '—'}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      <Grafico titolo="Recupero" righe={righe} sedute={d.sedute} prendi={(r) => r.recovery}
        colore="var(--gold)" suffisso="%" zone />
      <Grafico titolo="HRV" righe={righe} sedute={d.sedute} prendi={(r) => r.hrv}
        colore="var(--prot)" suffisso=" ms" />
      <Grafico titolo="Sonno" righe={righe} sedute={d.sedute} prendi={(r) => r.sleepHours}
        colore="var(--gold-dim)" suffisso="h" barre />
      <Grafico titolo="Sforzo" righe={righe} sedute={d.sedute} prendi={(r) => r.strain}
        colore="var(--carb)" suffisso="" />

      <div className="card">
        <div className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Sforzo e sedute
        </div>
        <p className="small" style={{ margin: 0 }}>
          Giornate con recupero sotto il 40%: <strong>{scarichi.length}</strong>.
          {scarichi.length > 0 && <> Di queste, ti sei allenato <strong style={{ color: 'var(--gold)' }}>{scarichiAllenati}</strong> volte.</>}
        </p>
        {scarichi.length > 0 && scarichiAllenati > 0 && (
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Consiglio: non è un errore allenarsi da scarichi, ma se succede spesso guarda se il volume
            di quelle sedute regge il confronto con le altre.
          </p>
        )}
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          I trattini sotto ai grafici sono i giorni in cui ti sei allenato ({d.sedute.size} nel periodo).
        </p>
      </div>
    </>
  )
}

/**
 * Un grafico. Solo linee e rettangoli: niente archi, così non può deformarsi.
 * I giorni di allenamento sono trattini sotto l'asse, per leggerli insieme al dato.
 */
function Grafico({ titolo, righe, sedute, prendi, colore, suffisso, zone, barre }: {
  titolo: string
  righe: WhoopDay[]
  sedute: Set<string>
  prendi: (r: WhoopDay) => number | undefined
  colore: string
  suffisso: string
  zone?: boolean
  barre?: boolean
}) {
  const W = 320, H = 88, pad = 6, base = H - 12
  const punti = righe.map((r, i) => ({ i, v: prendi(r), date: r.date })).filter((p) => p.v != null) as { i: number; v: number; date: string }[]
  if (punti.length < 2) {
    return (
      <div className="card">
        <div className="row spread"><span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{titolo}</span></div>
        <p className="muted small" style={{ margin: '6px 0 0' }}>Servono almeno due giornate con questo dato.</p>
      </div>
    )
  }

  const vals = punti.map((p) => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, righe.length - 1)
  const y = (v: number) => pad + (1 - (v - min) / span) * (base - 2 * pad)

  const ultimo = punti[punti.length - 1]
  const linea = punti.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 4 }}>
        <span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{titolo}</span>
        <span className="small" style={{ color: colore, fontVariantNumeric: 'tabular-nums' }}>
          {ultimo.v}{suffisso} <span className="muted">oggi</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`Andamento ${titolo}`}>
        {/* Zone del recupero: rosso sotto 34, verde sopra 66. Sfondo, non decorazione. */}
        {zone && (
          <>
            <rect x="0" y={y(100)} width={W} height={Math.max(0, y(66) - y(100))} fill="var(--good)" opacity=".07" />
            <rect x="0" y={y(34)} width={W} height={Math.max(0, y(0) - y(34))} fill="#e74c3c" opacity=".07" />
          </>
        )}
        {barre
          ? punti.map((p) => (
            <rect key={p.i} x={x(p.i) - Math.max(1, (W - 2 * pad) / righe.length / 2)} y={y(p.v)}
              width={Math.max(1.5, (W - 2 * pad) / righe.length * 0.8)} height={Math.max(1, base - y(p.v))}
              fill={colore} opacity=".85" rx="1" />
          ))
          : <path d={linea} fill="none" stroke={colore} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />}
        {!barre && <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r="2.6" fill={colore} />}

        {/* Giorni di allenamento */}
        {righe.map((r, i) => (sedute.has(r.date)
          ? <line key={r.date} x1={x(i)} y1={base + 3} x2={x(i)} y2={base + 8} stroke="var(--gold)" strokeWidth="1.6" opacity=".8" />
          : null))}
      </svg>

      <div className="row spread">
        <span className="muted" style={{ fontSize: 10 }}>{righe[0].date.slice(5)}</span>
        <span className="muted" style={{ fontSize: 10 }}>min {min}{suffisso} · max {max}{suffisso}</span>
        <span className="muted" style={{ fontSize: 10 }}>{righe[righe.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}

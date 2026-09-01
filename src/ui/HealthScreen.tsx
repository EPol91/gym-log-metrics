import { useLiveQuery } from 'dexie-react-hooks'
import { BodyScreen } from './BodyScreen'
import { HabitsScreen } from './HabitsScreen'
import { usePersistedState } from '../util/persist'
import { useEffect, useState } from 'react'
import { whoopTrend } from '../db/whoop'
import type { WhoopDay } from '../db/schema'

type Sub = 'vitali' | 'body' | 'habits'

const TABS: { key: Sub; label: string }[] = [
  { key: 'vitali', label: 'Vitali' },
  { key: 'body', label: 'Corpo' },
  { key: 'habits', label: 'Abitudini' },
]

/**
 * Salute: come stai andando, non come stai adesso. Qui vive tutto ciò che si
 * guarda nel tempo — la regola che tiene separata questa schermata da Oggi.
 */
export function HealthScreen({ vai, vaiNonce }: {
  /** La scheda da aprire: chi ti manda qui sa quale vuole. */
  vai?: string | null; vaiNonce?: number
}) {
  const [sub, setSub] = usePersistedState<Sub>('health-sub', 'vitali')
  // "Andamento" dai Vitali deve portare ai Vitali, non all'ultima scheda che
  // avevi aperto. Il nonce fa valere anche la stessa richiesta ripetuta.
  useEffect(() => {
    if (vai && TABS.some((t) => t.key === vai)) setSub(vai as Sub)
  }, [vai, vaiNonce]) // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
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
            { v: media((r) => r.sleepHours), l: 'sonno', s: 'h', ore: true },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {x.v == null ? '—' : x.ore ? oreMinuti(x.v) : `${x.v}${x.s}`}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      <Grafico titolo="Recupero" righe={righe} sedute={d.sedute} prendi={(r) => r.recovery}
        colore="var(--gold)" suffisso="%" zone />
      <Grafico titolo="HRV" righe={righe} sedute={d.sedute} prendi={(r) => r.hrv}
        colore="var(--prot)" suffisso=" ms" bande />
      <Grafico titolo="Sonno" righe={righe} sedute={d.sedute} prendi={(r) => r.sleepHours}
        colore="var(--gold-dim)" suffisso="h" barre media formato={oreMinuti} />
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
/** Ore in ore e minuti: «7h04» si legge, «7.1h» va tradotto a mente ogni volta. */
function oreMinuti(v: number): string {
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return m === 60 ? `${h + 1}h00` : `${h}h${String(m).padStart(2, '0')}`
}

function Grafico({ titolo, righe, sedute, prendi, colore, suffisso, zone, barre, bande, media, formato }: {
  titolo: string
  righe: WhoopDay[]
  sedute: Set<string>
  prendi: (r: WhoopDay) => number | undefined
  colore: string
  suffisso: string
  zone?: boolean
  barre?: boolean
  /**
   * Bande sulla TUA normalità, non su una soglia universale.
   *
   * L'HRV non ha un "buono" valido per tutti: 48 ms puo' essere ottimo per te e
   * scarso per un altro. Quindi la fascia normale e' media ± mezza deviazione
   * del periodo che stai guardando, e i numeri si scrivono sotto: colorare
   * senza dire rispetto a cosa sarebbe solo decorazione.
   */
  bande?: boolean
  /** Riga tratteggiata sulla media del periodo. */
  media?: boolean
  /** Come si scrive un valore, quando il numero nudo non si legge (le ore). */
  formato?: (v: number) => string
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

  const mediaV = vals.reduce((a, b) => a + b, 0) / vals.length
  const scarto = Math.sqrt(vals.reduce((a, b) => a + (b - mediaV) ** 2, 0) / vals.length)
  const basso = mediaV - scarto / 2
  const alto = mediaV + scarto / 2
  const scrivi = (v: number) => (formato ? formato(v) : `${Math.round(v * 10) / 10}${suffisso}`)

  const ultimo = punti[punti.length - 1]
  const linea = punti.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 4 }}>
        <span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{titolo}</span>
        <span className="small" style={{ color: colore, fontVariantNumeric: 'tabular-nums' }}>
          {media && <span className="muted" style={{ marginRight: 8 }}>media {scrivi(mediaV)}</span>}
          {scrivi(ultimo.v)} <span className="muted">oggi</span>
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
        {/* Bande personali: sopra la tua normalità e' verde, sotto e' rossa. */}
        {bande && (
          <>
            <rect x="0" y={y(max)} width={W} height={Math.max(0, y(alto) - y(max))} fill="var(--good)" opacity=".07" />
            <rect x="0" y={y(basso)} width={W} height={Math.max(0, y(min) - y(basso))} fill="#e74c3c" opacity=".07" />
          </>
        )}
        {(media || bande) && (
          <line x1="0" y1={y(mediaV)} x2={W} y2={y(mediaV)} stroke="var(--muted)" strokeWidth="1"
            strokeDasharray="4 4" opacity=".7" />
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
        <span className="muted" style={{ fontSize: 10 }}>min {scrivi(min)} · max {scrivi(max)}</span>
        <span className="muted" style={{ fontSize: 10 }}>{righe[righe.length - 1].date.slice(5)}</span>
      </div>

      {bande && (
        <p className="muted" style={{ fontSize: 10, margin: '4px 0 0', lineHeight: 1.5 }}>
          La tua normalità in questo periodo: <strong>{scrivi(basso)} – {scrivi(alto)}</strong>.
          Sopra è verde, sotto è rosso — è il confronto con te, non con una soglia da manuale.
        </p>
      )}
    </div>
  )
}

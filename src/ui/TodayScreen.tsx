import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { getUser, getOngoingSession, upsertMeasurement, todayISO, updateUser } from '../db/repo'
import { computeDiary, todayDiet } from '../db/diet'
import { whoopDay, whoopWorkoutsOf, whoopStatus, whoopDaysRecent, syncWhoop } from '../db/whoop'
import { STEPS, getHabit, getHabitValue, ensureHabits } from '../db/habits'
import { useHoldDrag } from './useHoldDrag'
import { parseNum } from '../util/validate'
import { fmtOre, fmtData } from '../util/format'
import { ScoreRing } from './anim'
import { dailyPhrase } from '../util/phrases'
import { CoachCard } from './CoachCard'
import { usePesoOggi } from './PesoOggi'
import { CardCalendario } from './CardCalendario'
import { useEffect } from 'react'

const LBL: React.CSSProperties = { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }
const NUM: React.CSSProperties = { color: 'var(--gold)', fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }

const cella = (v: string | number, l: string) => (
  <div key={l} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
    <div style={NUM}>{v}</div>
    <div className="muted" style={{ fontSize: 10 }}>{l}</div>
  </div>
)

const ORDINE_DEFAULT = ['vitali', 'corpo', 'nutrizione', 'allenamento', 'calendario', 'abitudini']

/**
 * Oggi: com'è la tua giornata adesso. Qui non ci sono andamenti — quelli stanno
 * in Salute. I riquadri si riordinano tenendoli premuti, come le righe della dieta.
 */
export function TodayScreen({ onStartWorkout, onResumeWorkout, onOpenCheck, onGo }: {
  onStartWorkout: () => void
  onResumeWorkout: (id: string) => void
  onOpenCheck: () => void
  onGo: (dove: 'food' | 'health' | 'train') => void
}) {
  const home = useLiveQuery(computeHome, [])
  const user = useLiveQuery(getUser, [])
  const ongoing = useLiveQuery(getOngoingSession, [])
  // L'ordine dei riquadri e' una tua scelta, non uno stato temporaneo: sta nel
  // profilo, quindi resiste alla chiusura dell'app e finisce nel backup. Prima
  // viveva nella memoria di sessione e a ogni riavvio tornava quello di fabbrica.
  const ordine = user?.todayCards ?? ORDINE_DEFAULT
  const setOrdine = (ids: string[]) => { void updateUser({ todayCards: ids }) }
  // Se WHOOP ha già i dati di stanotte il check è mezzo compilato: l'anello
  // respira per farsi notare, senza allungare la riga sotto.
  const vitali = useLiveQuery(() => whoopDay(), [])
  const vitaliOggi = !!vitali && (vitali.recovery != null || vitali.sleepPerf != null)
  const { press, inDragOrder, liftStyle } = useHoldDrag((_, ids) => setOrdine(ids))

  const nome = (user?.name ?? '').trim().split(' ')[0]

  // Se un domani si aggiungono riquadri, quelli nuovi entrano in coda invece di sparire.
  const chiavi = [...ordine.filter((k) => ORDINE_DEFAULT.includes(k)), ...ORDINE_DEFAULT.filter((k) => !ordine.includes(k))]

  const card = (key: string, corpo: React.ReactNode) => (
    <div key={key} className="card" data-drag-id={key}
      onPointerDown={press('today', key)}
      style={{ padding: '11px 12px', marginBottom: 0, ...liftStyle('today', key) }}>
      {corpo}
    </div>
  )

  const contenuto: Record<string, React.ReactNode> = {
    vitali: <CardVitali onOpen={() => onGo('health')} />,
    corpo: <CardCorpo peso={home?.bodyWeight ?? null} />,
    nutrizione: <CardNutrizione onOpen={() => onGo('food')} />,
    allenamento: <CardAllenamento home={home} ongoing={ongoing ?? null}
      onStart={onStartWorkout} onResume={onResumeWorkout} />,
    calendario: <CardCalendario onApri={() => onGo('health')} />,
    abitudini: <CardAbitudini onOpen={() => onGo('health')} />,
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.06em' }}>ETP HEALTH</p>
          {/* La mano resta incollata al nome: se lo spazio finisce va a capo
              "Emanuel 👋" insieme, mai la mano da sola su una riga sua.
              Il corpo si stringe un po' sui telefoni stretti per restare in riga. */}
          <h1 style={{ fontSize: 'clamp(20px, 6.4vw, 26px)' }}>
            Ciao{' '}
            <span style={{ whiteSpace: 'nowrap' }}>{nome ? `${nome} ` : ''}<span className="brand">👋</span></span>
          </h1>
          <p className="muted small" style={{ marginTop: 2 }}>{dailyPhrase()}</p>
        </div>
        <button onClick={onOpenCheck} aria-label="Check del giorno"
          style={{ textAlign: 'center', flex: '0 0 auto', background: 'none', border: 'none', padding: 0 }}>
          <span className={home?.todayReady == null && vitaliOggi ? 'ring-invito' : undefined}>
            <ScoreRing value={home?.todayReady ?? null} size={82} />
          </span>
          <div className="small" style={{ marginTop: 1, letterSpacing: '.04em', color: home?.todayReady == null ? 'var(--muted)' : 'var(--gold)' }}>
            {home?.todayReady == null ? 'Oggi · fai il check' : 'Oggi'}
          </div>
        </button>
      </div>

      {home && <CoachCard home={home} />}

      <div className="row spread" style={{ marginTop: 2 }}>
        <span className="muted small">I tuoi riquadri</span>
        <span className="muted small">tieni premuto per riordinare</span>
      </div>

      {inDragOrder('today', chiavi, (k) => k).map((k) => card(k, contenuto[k]))}
    </div>
  )
}

// --- I riquadri -------------------------------------------------------------

function CardVitali({ onOpen }: { onOpen: () => void }) {
  const d = useLiveQuery(() => whoopDay(), [])
  const w = useLiveQuery(() => whoopWorkoutsOf(todayISO()), [])
  const ha = d && (d.recovery != null || d.sleepHours != null || d.strain != null)

  return (
    <>
      <div className="row spread"><span style={LBL}>Vitali · WHOOP</span><span className="muted small">≡</span></div>
      {ha ? (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            {cella(d!.recovery != null ? `${d!.recovery}%` : '—', 'recupero')}
            {cella(fmtOre(d!.sleepHours), 'sonno')}
            {cella(d!.strain != null ? `${d!.strain}` : '—', 'sforzo')}
            {cella(d!.hrv != null ? `${d!.hrv}` : '—', 'HRV')}
          </div>
          {w && w.length > 0 && (
            <div className="muted small" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
              {w.map((x) => x.sport ?? 'Attività').join(' · ')} registrati dal WHOOP
            </div>
          )}
          <button className="chip" style={{ marginTop: 8 }} onClick={onOpen}>Andamento ›</button>
        </>
      ) : (
        <VitaliAssenti />
      )}
    </>
  )
}

function CardCorpo({ peso }: { peso: { weight: number; delta: number | null } | null }) {
  const [w, setW] = useState('')
  const [salvato, setSalvato] = useState(false)
  const [apri, setApri] = useState(false)
  const n = parseNum(w, { min: 20, max: 400 })
  const { peso: pesoOggi, letto } = usePesoOggi()

  return (
    <>
      <div className="row spread"><span style={LBL}>Corpo</span><span className="muted small">≡</span></div>
      <div className="row" style={{ marginTop: 8 }}>
        {cella(peso ? `${peso.weight}` : '—', 'kg')}
        {cella(peso?.delta != null ? `${peso.delta > 0 ? '+' : ''}${peso.delta}` : '—', 'vs prec.')}
      </div>
      {!apri ? (
        // Il numero grande e' l'ultimo peso noto, che puo' essere di ieri: da solo
        // non dice se oggi l'hai fatto. Il tasto lo dice, e chiama quando manca.
        <button className={'chip' + (pesoOggi == null && letto ? ' ring-invito' : '')}
          style={{ marginTop: 8, ...(pesoOggi == null && letto ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}) }}
          onClick={() => setApri(true)}>
          {pesoOggi != null ? '✓ Peso di oggi registrato' : '＋ Peso di oggi · manca'}
        </button>
      ) : (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <input inputMode="decimal" value={w} placeholder={peso ? String(peso.weight) : 'kg'}
            onChange={(e) => { setW(e.target.value); setSalvato(false) }} style={{ flex: 1, textAlign: 'center' }} />
          <button className="primary" style={{ padding: '9px 16px' }} disabled={n == null}
            onClick={async () => { if (n == null) return; await upsertMeasurement(todayISO(), { weight: n }); setSalvato(true); setW('') }}>
            Salva
          </button>
        </div>
      )}
      {salvato && <p className="small" style={{ margin: '6px 0 0', color: 'var(--good)' }}>✓ salvato</p>}
    </>
  )
}

function CardNutrizione({ onOpen }: { onOpen: () => void }) {
  const diary = useLiveQuery(() => computeDiary(todayDiet()), [])
  const t = diary?.totals

  return (
    <>
      <div className="row spread"><span style={LBL}>Nutrizione</span><span className="muted small">≡</span></div>
      <div className="row" style={{ marginTop: 8 }}>
        {cella(t ? t.kcal : '—', 'kcal')}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ ...NUM, color: 'var(--carb)' }}>{t ? t.carbs : '—'}</div>
          <div className="muted" style={{ fontSize: 10 }}>carbo</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ ...NUM, color: 'var(--prot)' }}>{t ? t.protein : '—'}</div>
          <div className="muted" style={{ fontSize: 10 }}>proteine</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{ ...NUM, color: 'var(--fat)' }}>{t ? t.fat : '—'}</div>
          <div className="muted" style={{ fontSize: 10 }}>grassi</div>
        </div>
      </div>
      <button className="chip" style={{ marginTop: 8 }} onClick={onOpen}>Diario di oggi ›</button>
    </>
  )
}

function CardAllenamento({ home, ongoing, onStart, onResume }: {
  home: ReturnType<typeof computeHome> extends Promise<infer T> ? T | undefined : never
  ongoing: { id: string; type: string } | null
  onStart: () => void
  onResume: (id: string) => void
}) {
  const g = home?.weekGoal
  return (
    <>
      <div className="row spread"><span style={LBL}>Allenamento</span><span className="muted small">≡</span></div>
      {g && (
        <>
          <div className="row spread small" style={{ marginTop: 8 }}>
            <span className="muted">Obiettivo settimana</span>
            <strong>{g.done} / {g.target}</strong>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', background: 'var(--gold)', width: `${g.target ? Math.min(100, g.done / g.target * 100) : 0}%` }} />
          </div>
        </>
      )}
      {home?.lastSession && (
        <div className="muted small" style={{ marginTop: 6 }}>
          Ultima: {home.lastSession.type} · {fmtData(home.lastSession.date)}
        </div>
      )}
      {ongoing ? (
        <button className="primary" style={{ width: '100%', marginTop: 9 }} onClick={() => onResume(ongoing.id)}>▶ Riprendi allenamento</button>
      ) : (
        <button className="primary" style={{ width: '100%', marginTop: 9 }} onClick={onStart}>＋ Inizia allenamento</button>
      )}
    </>
  )
}

function CardAbitudini({ onOpen }: { onOpen: () => void }) {
  const h = useLiveQuery(() => getHabit(STEPS), [])
  const oggi = useLiveQuery(() => getHabitValue(STEPS), [])
  useEffect(() => { ensureHabits() }, [])
  const target = h?.target ?? 10000
  const fatti = oggi?.value ?? 0
  const pct = Math.min(100, (fatti / target) * 100)

  return (
    <>
      <div className="row spread"><span style={LBL}>Abitudini</span><span className="muted small">≡</span></div>
      <div className="row spread small" style={{ marginTop: 8 }}>
        <span>Passi</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {oggi ? fatti.toLocaleString('it-IT') : '—'} <span className="muted">/ {target.toLocaleString('it-IT')}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
        <div style={{ height: '100%', background: 'var(--gold)', width: `${pct}%` }} />
      </div>
      {!oggi && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          I passi arriveranno da Health Connect con l'app Android.
        </p>
      )}
      <button className="chip" style={{ marginTop: 8 }} onClick={onOpen}>Abitudini ›</button>
    </>
  )
}

/**
 * Quando i vitali di oggi non ci sono, la differenza fra "non sei collegato",
 * "WHOOP non ha ancora i dati di stanotte" e "qualcosa non funziona" è tutta:
 * un riquadro che dice solo "nessun dato" ti lascia a indovinare.
 */
function VitaliAssenti() {
  const stato = useLiveQuery(whoopStatus, [])
  const recenti = useLiveQuery(() => whoopDaysRecent(7), [])
  const [busy, setBusy] = useState(false)
  const [esito, setEsito] = useState<string | null>(null)

  const conDati = (recenti ?? []).find((d) => d.recovery != null || d.sleepHours != null || d.strain != null)

  if (stato && !stato.collegato) {
    return <p className="muted small" style={{ margin: '8px 0 0' }}>WHOOP non è collegato. Lo colleghi dal Profilo.</p>
  }

  return (
    <div style={{ marginTop: 8 }}>
      <p className="muted small" style={{ margin: 0 }}>
        {conDati
          ? `WHOOP non ha ancora i dati di oggi. Ultimo giorno con dati: ${fmtData(conDati.date)}.`
          : 'Nessun dato scaricato da WHOOP.'}
      </p>
      <button className="chip" style={{ marginTop: 8 }} disabled={busy}
        onClick={async (e) => {
          e.stopPropagation()
          setBusy(true); setEsito(null)
          try {
            const r = await syncWhoop(14)
            setEsito(r.giorni ? `Aggiornate ${r.giorni} giornate.` : 'WHOOP non ha restituito niente di nuovo.')
          } catch {
            setEsito('WHOOP non risponde. Riprova più tardi.')
          } finally { setBusy(false) }
        }}>
        {busy ? 'aggiorno…' : '↻ Aggiorna ora'}
      </button>
      {esito && <p className="muted small" style={{ margin: '6px 0 0' }}>{esito}</p>}
    </div>
  )
}

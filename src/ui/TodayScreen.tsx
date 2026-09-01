import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { getUser, getOngoingSession, upsertMeasurement, todayISO, updateUser, getNutrition } from '../db/repo'
import { computeDiary, todayDiet, listDayTypes } from '../db/diet'
import { whoopDay, whoopWorkoutsOf, whoopStatus, whoopDaysRecent, syncWhoop, lastAutoSync } from '../db/whoop'
import { STEPS, getHabit, getHabitValue, ensureHabits } from '../db/habits'
import { cicloRs, chiudiCicloAMano, annullaChiusuraAMano, GIORNI_CICLO } from '../rs/cicloSedute'
import { useHoldDrag } from './useHoldDrag'
import { parseNum } from '../util/validate'
import { fmtOre, fmtData } from '../util/format'
import { ScoreRing } from './anim'
import { dailyPhrase } from '../util/phrases'
import { CoachCard } from './CoachCard'
import { Avvisi } from './Avvisi'
import { usePesoOggi } from './PesoOggi'
import { DataDiOggi, Calendario } from './CardCalendario'
import { useEffect } from 'react'

// L'anello del check: la data accanto si misura su questo.
const ANELLO = 82

const LBL: React.CSSProperties = { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }
const NUM: React.CSSProperties = { color: 'var(--gold)', fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }

const cella = (v: string | number, l: string) => (
  <div key={l} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
    <div style={NUM}>{v}</div>
    <div className="muted" style={{ fontSize: 10 }}>{l}</div>
  </div>
)

const ORDINE_DEFAULT = ['vitali', 'corpo', 'nutrizione', 'allenamento', 'abitudini']

/**
 * Oggi: com'è la tua giornata adesso. Qui non ci sono andamenti — quelli stanno
 * in Salute. I riquadri si riordinano tenendoli premuti, come le righe della dieta.
 */
export function TodayScreen({ onStartWorkout, onResumeWorkout, onOpenCheck, onGo, onApriSeduta }: {
  onStartWorkout: () => void
  onResumeWorkout: (id: string) => void
  onOpenCheck: () => void
  /**  = quale scheda di Salute aprire: 'vitali', 'habits', … */
  onGo: (dove: 'food' | 'health' | 'train', sezione?: string) => void
  /** "Apri la seduta" dal calendario: porta allo Storico, su QUELLA seduta. */
  onApriSeduta: (sessionId: string) => void
}) {
  const home = useLiveQuery(computeHome, [])
  const user = useLiveQuery(getUser, [])
  const ongoing = useLiveQuery(getOngoingSession, [])
  const [calendario, setCalendario] = useState(false)
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

// Passi e Corpo stanno in mezza riga: sono due numeri e una barra, e a tutta
  // larghezza sprecavano schermo. Affiancandoli si vedono insieme senza
  // scorrere. Gli altri riquadri restano interi, perche' dentro hanno piu' roba.
  const META = ['abitudini', 'corpo']

  const card = (key: string, corpo: React.ReactNode) => (
    <div key={key} className="card" data-drag-id={key}
      onPointerDown={press('today', key)}
      style={{
        // I due a meta' larghezza hanno dentro un numero e un tasto: l'aria di
        // un riquadro intero li faceva sembrare mezzi vuoti.
        padding: META.includes(key) ? '9px 12px' : '11px 12px', marginBottom: 0,
        flex: META.includes(key) ? '1 1 calc(50% - 4px)' : '1 1 100%',
        minWidth: 0,
        ...liftStyle('today', key),
      }}>
      {corpo}
    </div>
  )

  const contenuto: Record<string, React.ReactNode> = {
    vitali: <CardVitali onOpen={() => onGo('health', 'vitali')} />,
    corpo: <CardCorpo peso={home?.bodyWeight ?? null} />,
    nutrizione: <CardNutrizione onOpen={() => onGo('food')} />,
    allenamento: <CardAllenamento home={home} ongoing={ongoing ?? null}
      onStart={onStartWorkout} onResume={onResumeWorkout} />,
    abitudini: <CardAbitudini onOpen={() => onGo('health', 'habits')} />,
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="muted small" style={{ marginBottom: 2, letterSpacing: '.06em' }}>ETP HEALTH</p>
          {/* Il corpo si stringe un po' sui telefoni stretti per restare in riga. */}
          <h1 style={{ fontSize: 'clamp(20px, 6.4vw, 26px)' }}>Ciao{nome ? ` ${nome}` : ''}</h1>
          <p className="muted small" style={{ marginTop: 2 }}>{dailyPhrase()}</p>
        </div>
        {/* La data al posto del saluto: un "👋" occupa spazio e non dice niente,
            una data la guardi — e col tocco apre il calendario. */}
        {/* La data alta quanto l'anello: cosi' i due riquadri combaciano invece
            di stare uno alto e uno basso. */}
        <div className="row" style={{ gap: 8, alignItems: 'flex-start', flex: '0 0 auto' }}>
        <DataDiOggi onApri={() => setCalendario(true)} altezza={ANELLO} />
        <button onClick={onOpenCheck} aria-label="Check del giorno"
          style={{ textAlign: 'center', flex: '0 0 auto', background: 'none', border: 'none', padding: 0 }}>
          <span className={home?.todayReady == null && vitaliOggi ? 'ring-invito' : undefined}>
            <ScoreRing value={home?.todayReady ?? null} size={ANELLO} />
          </span>
          <div className="small" style={{ marginTop: 1, letterSpacing: '.04em', color: home?.todayReady == null ? 'var(--muted)' : 'var(--gold)' }}>
            {home?.todayReady == null ? 'Oggi · fai il check' : 'Oggi'}
          </div>
        </button>
        </div>
      </div>

      {calendario && <Calendario onClose={() => setCalendario(false)} onApriSeduta={(id) => { setCalendario(false); onApriSeduta(id) }} />}

      {home && <CoachCard home={home} />}

      {/* Sotto il coach: prima cosa fai oggi, poi cosa e rimasto indietro. */}
      <Avvisi onGo={onGo} />

      <div className="row spread" style={{ marginTop: 2 }}>
        <span className="muted small">I tuoi riquadri</span>
        <span className="muted small">tieni premuto per riordinare</span>
      </div>

      {/* I riquadri scorrono in fila e vanno a capo: due da meta' larghezza
          finiscono affiancati, gli altri prendono la riga intera. */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'stretch' }}>
        {inDragOrder('today', chiavi, (k) => k).map((k) => card(k, contenuto[k]))}
      </div>
    </div>
  )
}

// --- I riquadri -------------------------------------------------------------

function CardVitali({ onOpen }: { onOpen: () => void }) {
  const d = useLiveQuery(() => whoopDay(), [])
  const w = useLiveQuery(() => whoopWorkoutsOf(todayISO()), [])
  const ha = d && (d.recovery != null || d.sleepHours != null || d.strain != null)
  const [sync, setSync] = useState(false)
  const [quando, setQuando] = useState<string | null>(lastAutoSync())

  return (
    <>
      <div className="row spread">
        <span style={LBL}>Vitali · WHOOP</span>
        {/* Aggiornare da qui: il WHOOP chiude la notte quando gli pare, e andare
            a cercare il tasto nel Profilo per un dato che stai guardando adesso
            e' un giro inutile. */}
        <span className="row" style={{ gap: 8, alignItems: 'center', flex: 'none' }}>
          <button className="chip" style={{ padding: '2px 9px', fontSize: 12 }} disabled={sync}
            aria-label="Aggiorna i dati WHOOP"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={async () => {
              setSync(true)
              try { await syncWhoop(3) } finally { setSync(false); setQuando(lastAutoSync()) }
            }}>{sync ? '…' : '↻'}</button>
          <span className="muted small">≡</span>
        </span>
      </div>
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
          {/* Quando sono stati presi: senza, un recupero fermo a ieri sembra
              quello di stanotte. */}
          {quando && (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Aggiornati il {fmtData(quando)} alle {quando.slice(11, 16)}
            </p>
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
      {/* A meta' larghezza due colonne stanno strette: il peso resta grande e la
          variazione gli si mette accanto piccola — e' un contorno, non il dato. */}
      <div className="row" style={{ marginTop: 6, gap: 6, alignItems: 'baseline', justifyContent: 'center' }}>
        <span style={{ ...NUM, fontSize: 24 }}>{peso ? peso.weight : '—'}</span>
        <span className="muted" style={{ fontSize: 10 }}>kg</span>
        {peso?.delta != null && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 2 }}>
            {peso.delta > 0 ? '+' : ''}{peso.delta}
          </span>
        )}
      </div>
      {!apri ? (
        // Il numero grande e' l'ultimo peso noto, che puo' essere di ieri: da solo
        // non dice se oggi l'hai fatto. Il tasto lo dice, e chiama quando manca.
        <button className={'chip' + (pesoOggi == null && letto ? ' ring-invito' : '')}
          style={{ marginTop: 6, ...(pesoOggi == null && letto ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}) }}
          onClick={() => setApri(true)}>
          {pesoOggi != null ? '✓ pesato oggi' : '＋ pesati oggi'}
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
  // Che giornata e' oggi. Quattrocento grammi di carboidrati non vogliono dire
  // niente se non sai se e' una HIGH o una LOW: il tipo e' il metro dei numeri
  // che gli stanno accanto. Si sceglie in Cibo, qui si legge soltanto.
  const giornata = useLiveQuery(async () => {
    const n = await getNutrition(todayDiet())
    if (!n?.dayType) return null
    return (await listDayTypes()).find((d) => d.key === n.dayType) ?? null
  }, [])
  const dalCoach = giornata?.name.startsWith('🦠') ?? false

  return (
    <>
      <div className="row spread">
        <span className="row" style={{ gap: 6, alignItems: 'baseline', minWidth: 0 }}>
          <span style={LBL}>Nutrizione</span>
          <span className="small" style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: giornata ? 700 : 400,
            color: giornata ? (dalCoach ? 'var(--rs)' : 'var(--gold)') : 'var(--muted)',
          }}>{giornata ? giornata.name : '—'}</span>
        </span>
        <span className="muted small">≡</span>
      </div>
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
  // Il ciclo del coach, se lo stai seguendo: e' piu' preciso dell'obiettivo a
  // finestra, perche' sa QUALE seduta tocca e se stai allungando.
  const ciclo = useLiveQuery(() => cicloRs(), [])
  const [storico, setStorico] = useState(false)
  // Solo per mostrare l'annulla subito dopo la chiusura: e' un ripensamento, non uno stato da salvare.
  const [chiuso, setChiuso] = useState(false)
  const scavalcate = ciclo?.passi.filter((p) => p.stato === 'scavalcata') ?? []

  return (
    <>
      <div className="row spread"><span style={LBL}>Allenamento</span><span className="muted small">≡</span></div>

      {ciclo ? (
        <>
          <div className="row spread small" style={{ marginTop: 8, alignItems: 'baseline' }}>
            <span>
              Ciclo {ciclo.numero} <span className="muted" style={{ fontSize: 10 }}>dal {ciclo.dal.slice(8)}.{ciclo.dal.slice(5, 7)}</span>
              {ciclo.prossima
                ? <> · tocca <strong style={{ color: 'var(--gold)' }}>{ciclo.prossima}</strong></>
                : <> · <span style={{ color: 'var(--good)' }}>chiuso</span></>}
            </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{ciclo.fatte} / {ciclo.totale}</strong>
          </div>

          {/* Le cinque sedute in fila: a colpo d'occhio quali hai fatto, quale
              tocca e quale hai scavalcato — che e' un'altra cosa dal ritardo. */}
          <div className="row" style={{ gap: 4, marginTop: 7 }}>
            {ciclo.passi.map((p) => (
              <span key={p.codice} style={{
                flex: 1, height: 18, borderRadius: 5, fontSize: 10,
                display: 'grid', placeItems: 'center',
                ...(p.stato === 'fatta' ? { background: 'var(--gold)', color: '#1a1400' }
                  : p.stato === 'tocca' ? { background: 'var(--gold-bg)', border: '1px solid var(--gold)', color: 'var(--gold)' }
                    : p.stato === 'scavalcata' ? { background: '#2a0e0c', border: '1px solid var(--rs)', color: 'var(--rs)' }
                      : { background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--muted)' }),
              }}>{p.codice}</span>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: 7 }}>
            giorno {ciclo.giorno} di {ciclo.giorniPrevisti} ·{' '}
            {scavalcate.length > 0
              ? <span style={{ color: 'var(--rs)' }}>{scavalcate.map((p) => p.codice).join(', ')} da recuperare</span>
              : ciclo.oltre > 0
                ? <span style={{ color: '#e0a030' }}>+{ciclo.oltre} · lo chiudi in ritardo, non lo perdi</span>
                : <span style={{ color: 'var(--good)' }}>nei tempi</span>}
            {ciclo.ultima && ` · ultima ${ciclo.ultima.codice} il ${ciclo.ultima.date.slice(8)}.${ciclo.ultima.date.slice(5, 7)}`}
          </div>
        </>
      ) : g && (
        <>
          <div className="row spread small" style={{ marginTop: 8 }}>
            <span className="muted">Obiettivo ciclo <span style={{ opacity: .7 }}>· giorno {g.giorno} di {g.giorni}</span></span>
            <strong>{g.done} / {g.target}</strong>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', background: 'var(--gold)', width: `${g.target ? Math.min(100, g.done / g.target * 100) : 0}%` }} />
          </div>
        </>
      )}

      {!ciclo && home?.lastSession && (
        <div className="muted small" style={{ marginTop: 6 }}>
          Ultima: {home.lastSession.type} · {fmtData(home.lastSession.date)}
        </div>
      )}

      {ongoing ? (
        <button className="primary" style={{ width: '100%', marginTop: 9 }} onClick={() => onResume(ongoing.id)}>▶ Riprendi allenamento</button>
      ) : (
        <button className="primary" style={{ width: '100%', marginTop: 9 }} onClick={onStart}>
          {scavalcate.some((p) => p.codice === ciclo?.prossima)
            ? `＋ Recupera ${ciclo!.prossima}`
            : `＋ Inizia${ciclo?.prossima ? ' ' + ciclo.prossima : ' allenamento'}`}
        </button>
      )}

      {/* I cicli chiusi si guardano ogni tanto, non ogni giorno: stanno qui
          dentro, chiusi, invece di rubare mezzo schermo tutti i giorni. */}
      {ciclo && ciclo.chiusi.length > 0 && (
        <div style={{ marginTop: 9, borderTop: '1px solid var(--line)', paddingTop: 7 }}>
          <button onClick={() => setStorico((v) => !v)}
            style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left' }}>
            <span className="row spread muted" style={{ fontSize: 11 }}>
              <span>Cicli chiusi</span><span>{storico ? '▴' : '▾'}</span>
            </span>
          </button>
          {storico && (
            <>
              <div className="row" style={{ gap: 10, marginTop: 9, textAlign: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={NUM}>{ciclo.storico.inTempo}</div>
                  <div className="muted" style={{ fontSize: 10 }}>nei tempi</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...NUM, color: '#e0a030' }}>{ciclo.storico.allungati}</div>
                  <div className="muted" style={{ fontSize: 10 }}>allungati</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...NUM, color: 'var(--text)' }}>{ciclo.storico.giorniMedi ?? '—'}</div>
                  <div className="muted" style={{ fontSize: 10 }}>giorni medi</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...NUM, color: 'var(--rs)' }}>{ciclo.storico.saltate}</div>
                  <div className="muted" style={{ fontSize: 10 }}>fuori ordine</div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                {ciclo.chiusi.map((c) => (
                  <div key={c.numero}>
                    Ciclo {c.numero} · {c.dal.slice(8)}.{c.dal.slice(5, 7)}→{c.al.slice(8)}.{c.al.slice(5, 7)} · {c.giorni} giorni ·{' '}
                    {c.aMano
                      ? <span style={{ color: 'var(--muted)' }}>chiuso a mano · {c.fatte.length} su {ciclo.totale}</span>
                      : c.giorni <= GIORNI_CICLO
                        ? <span style={{ color: 'var(--good)' }}>nei tempi</span>
                        : <span style={{ color: '#e0a030' }}>+{c.giorni - GIORNI_CICLO}</span>}
                    {c.fuoriOrdine.length > 0 && ` · ${c.fuoriOrdine.join(', ')} fuori ordine`}
                  </div>
                ))}
              </div>

              {/* Chiudere un giro saltato non e' barare: e' l'unico modo per non
                  lasciare il conteggio appeso a un ciclo che non finirai mai. */}
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <button className="chip" onClick={async () => { await chiudiCicloAMano(); setChiuso(true) }}>
                  Chiudi qui il ciclo
                </button>
                {chiuso && (
                  <button className="chip" onClick={async () => { await annullaChiusuraAMano(); setChiuso(false) }}>
                    ↺ annulla
                  </button>
                )}
              </div>
              <p className="muted" style={{ fontSize: 10, margin: '5px 0 0', lineHeight: 1.5 }}>
                Il ciclo si archivia com'è e il prossimo parte da domani. Serve quando un giro salta
                del tutto o riparti da capo.
              </p>
            </>
          )}
        </div>
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
      {/* A meta' larghezza "1.330 / 10.000" su una riga sola si stringe troppo:
          il numero di oggi resta grande, l'obiettivo va sotto. */}
      <div style={{ marginTop: 6, textAlign: 'center' }}>
        <span style={{ ...NUM, fontSize: 24 }}>{oggi ? fatti.toLocaleString('it-IT') : '—'}</span>
        <div className="muted" style={{ fontSize: 10 }}>di {target.toLocaleString('it-IT')} passi</div>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
        <div style={{ height: '100%', background: 'var(--gold)', width: `${pct}%` }} />
      </div>
      <button className="chip" style={{ marginTop: 6 }} onClick={onOpen}>Dettagli ›</button>
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

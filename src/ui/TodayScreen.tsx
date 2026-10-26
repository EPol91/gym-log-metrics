import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { computeHome } from '../scores/dashboardScores'
import { getUser, getOngoingSession, upsertMeasurement, todayISO, updateUser, getNutrition } from '../db/repo'
import { computeDiary, todayDiet, listDayTypes } from '../db/diet'
import { db } from '../db/db'
import { whoopDay, whoopWorkoutsOf, whoopStatus, whoopDaysRecent, syncWhoop, lastAutoSync } from '../db/whoop'
import { STEPS, getHabit, getHabitValue, ensureHabits } from '../db/habits'
import { cicloRs, chiudiCicloAMano, annullaChiusuraAMano, GIORNI_CICLO } from '../rs/cicloSedute'
import { SEDUTE_RS } from '../rs/protocollo'
import { useHoldDrag } from './useHoldDrag'
import { parseNum } from '../util/validate'
import { fmtOre, fmtData } from '../util/format'
import { ScoreRing } from './anim'
import { CoachCard } from './CoachCard'
import { Avvisi } from './Avvisi'
import { usePesoOggi } from './PesoOggi'
import { Calendario } from './CardCalendario'
import { useEffect } from 'react'

const LBL: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }
// Numeri da tabellone: stretti, si leggono da lontano e stanno nella mezza riga.
const NUM: React.CSSProperties = { color: 'var(--gold)', fontFamily: 'var(--f-numeri)', fontSize: 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
const GRANDE: React.CSSProperties = { ...NUM, color: 'var(--text)', fontSize: 34, lineHeight: 1 }

/** Una cifra con la sua etichetta sotto: quattro in fila stanno in un riquadro intero. */
const cella = (v: string | number, l: string, colore = 'var(--text)') => (
  <div key={l} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
    <div style={{ ...NUM, fontSize: 25, color: colore }}>{v}</div>
    <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>{l}</div>
  </div>
)

/** Il decimale all'italiana: 82,4 e non 82.4. */
const virgola = (n: number) => String(n).replace('.', ',')

// L'allenamento non e' piu' fra i riquadri da riordinare: sta in cima, fisso.
// Un ordine salvato che lo conteneva lo perde da solo (vedi `chiavi`).
const ORDINE_DEFAULT = ['vitali', 'nutrizione', 'corpo', 'abitudini']

/**
 * Oggi: com'è la tua giornata adesso. Qui non ci sono andamenti — quelli stanno
 * in Salute.
 *
 * Una cosa sola in primo piano: la prossima seduta, col tasto per partire. Sopra
 * il coach in due righe, sotto i riquadri — che si riordinano tenendoli premuti,
 * come le righe della dieta.
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
  // profilo, quindi resiste alla chiusura dell'app e finisce nel backup.
  const ordine = user?.todayCards ?? ORDINE_DEFAULT
  const setOrdine = (ids: string[]) => { void updateUser({ todayCards: ids }) }
  // Se WHOOP ha già i dati di stanotte il check è mezzo compilato: l'anello
  // respira per farsi notare.
  const vitali = useLiveQuery(() => whoopDay(), [])
  const vitaliOggi = !!vitali && (vitali.recovery != null || vitali.sleepPerf != null)
  const { press, inDragOrder, liftStyle } = useHoldDrag((_, ids) => setOrdine(ids))

  const nome = (user?.name ?? '').trim().split(' ')[0]
  // «lunedì 26 ottobre»: la data si legge come la diresti. Toccandola si apre il calendario.
  const data = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  // Se un domani si aggiungono riquadri, quelli nuovi entrano in coda invece di sparire.
  const chiavi = [...ordine.filter((k) => ORDINE_DEFAULT.includes(k)), ...ORDINE_DEFAULT.filter((k) => !ordine.includes(k))]

  // Passi e Corpo stanno in mezza riga: sono un numero e una barra, e a tutta
  // larghezza sprecavano schermo. Gli altri riquadri restano interi.
  const META = ['abitudini', 'corpo']

  const card = (key: string, corpo: React.ReactNode) => (
    <div key={key} className="card" data-drag-id={key}
      onPointerDown={press('today', key)}
      style={{
        padding: '11px 13px', marginBottom: 0,
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
    abitudini: <CardPassi onOpen={() => onGo('health', 'habits')} />,
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <button onClick={() => setCalendario(true)} aria-label="Calendario"
            style={{ ...LBL, background: 'none', border: 0, padding: '2px 0', borderRadius: 0 }}>
            {data} <span style={{ color: 'var(--faint)' }}>›</span>
          </button>
          <h1 style={{ fontSize: 'clamp(24px, 7.6vw, 30px)', marginTop: 2 }}>Ciao{nome ? ` ${nome}` : ''}</h1>
        </div>
        <button onClick={onOpenCheck} aria-label="Check del giorno"
          style={{ textAlign: 'center', flex: '0 0 auto', background: 'none', border: 'none', padding: 0 }}>
          <span className={home?.todayReady == null && vitaliOggi ? 'ring-invito' : undefined}>
            <ScoreRing value={home?.todayReady ?? null} size={66} />
          </span>
          <div style={{ fontSize: 10, marginTop: 2, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, color: home?.todayReady == null ? 'var(--muted)' : 'var(--gold)' }}>
            {home?.todayReady == null ? 'fai il check' : 'ready'}
          </div>
        </button>
      </div>

      {calendario && <Calendario onClose={() => setCalendario(false)} onApriSeduta={(id) => { setCalendario(false); onApriSeduta(id) }} />}

      {home && <CoachCard home={home} />}

      {/* La cosa che vieni a fare: la prossima seduta, sempre in cima. */}
      <CardAllenamento home={home} ongoing={ongoing ?? null}
        onStart={onStartWorkout} onResume={onResumeWorkout} />

      {/* Sotto la seduta: cosa e' rimasto indietro. */}
      <Avvisi onGo={onGo} />

      {/* I riquadri scorrono in fila e vanno a capo: due da meta' larghezza
          finiscono affiancati, gli altri prendono la riga intera. Il riordino
          (tieni premuto) resta; la riga che lo spiegava no. */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'stretch' }}>
        {inDragOrder('today', chiavi, (k) => k).map((k) => card(k, contenuto[k]))}
      </div>
    </div>
  )
}

// --- I riquadri -------------------------------------------------------------

/** «alle 07:12» se e' di oggi, altrimenti anche il giorno: un dato di ieri non deve sembrare di stanotte. */
function quandoSync(iso: string | null): string | null {
  if (!iso) return null
  const ora = iso.slice(11, 16)
  return iso.slice(0, 10) === todayISO() ? `alle ${ora}` : `${fmtData(iso).slice(0, 5)} ${ora}`
}

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
          {ha && quando && <span style={{ fontSize: 11, color: 'var(--faint)' }}>{quandoSync(quando)}</span>}
          <button className="chip" style={{ padding: '2px 9px', fontSize: 12 }} disabled={sync}
            aria-label="Aggiorna i dati WHOOP"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={async () => {
              setSync(true)
              try { await syncWhoop(3) } finally { setSync(false); setQuando(lastAutoSync()) }
            }}>{sync ? '…' : '↻'}</button>
        </span>
      </div>
      {ha ? (
        <>
          {/* Tocca i numeri e vai all'andamento: il tasto «Andamento ›» rubava una riga. */}
          <div className="row" role="button" tabIndex={0} onClick={onOpen} style={{ marginTop: 9, cursor: 'pointer' }}>
            {cella(d!.recovery != null ? `${d!.recovery}%` : '—', 'recupero', 'var(--gold)')}
            {cella(fmtOre(d!.sleepHours), 'sonno')}
            {cella(d!.strain != null ? virgola(d!.strain) : '—', 'sforzo')}
            {cella(d!.hrv != null ? `${d!.hrv}` : '—', 'HRV')}
          </div>
          {w && w.length > 0 && (
            <div className="muted small" style={{ marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
              {w.map((x) => x.sport ?? 'Attività').join(' · ')} registrati dal WHOOP
            </div>
          )}
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
      <span style={LBL}>Corpo</span>
      <div style={{ marginTop: 8 }}>
        <span style={GRANDE}>{peso ? virgola(peso.weight) : '—'}</span>
        <span className="muted" style={{ fontSize: 13, marginLeft: 4 }}>kg</span>
      </div>
      {peso?.delta != null && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          {peso.delta > 0 ? '+' : peso.delta < 0 ? '−' : ''}{virgola(Math.abs(peso.delta))} kg dalla pesata prima
        </div>
      )}
      {!apri ? (
        // Il numero grande e' l'ultimo peso noto, che puo' essere di ieri: da solo
        // non dice se oggi l'hai fatto. Il tasto lo dice, e chiama quando manca.
        <button className={'chip' + (pesoOggi == null && letto ? ' ring-invito' : '')}
          style={{ marginTop: 8, ...(pesoOggi == null && letto ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}) }}
          onClick={() => setApri(true)}>
          {pesoOggi != null ? '✓ pesato oggi' : '＋ pesati oggi'}
        </button>
      ) : (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <input inputMode="decimal" value={w} placeholder={peso ? String(peso.weight) : 'kg'}
            onChange={(e) => { setW(e.target.value); setSalvato(false) }} style={{ flex: 1, minWidth: 0, textAlign: 'center' }} />
          <button className="primary" style={{ padding: '9px 12px' }} disabled={n == null}
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
  const tondo = (v: number | undefined) => (v == null ? '—' : Math.round(v))

  return (
    <>
      <div className="row spread" style={{ gap: 8 }}>
        <span style={LBL}>Nutrizione</span>
        {giornata && (
          <span className="chip" style={{
            padding: '3px 9px', fontSize: 11, fontWeight: 600, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            ...(dalCoach
              ? { color: '#ff6b5f', borderColor: '#5a1a14', background: '#2a0f0c' }
              : { color: 'var(--gold)', borderColor: '#5a4a18', background: 'var(--gold-bg)' }),
          }}>{giornata.name.replace('🦠 ', '')}</span>
        )}
      </div>
      {/* Solo i numeri: le barre sono in Cibo, qui rubavano spazio. Tocca e vai al diario. */}
      <div className="row" role="button" tabIndex={0} onClick={onOpen} style={{ marginTop: 9, cursor: 'pointer' }}>
        {cella(tondo(t?.kcal), 'kcal', 'var(--gold)')}
        {cella(tondo(t?.carbs), 'carbo', 'var(--carb)')}
        {cella(tondo(t?.protein), 'proteine', 'var(--prot)')}
        {cella(tondo(t?.fat), 'grassi', 'var(--fat)')}
      </div>
    </>
  )
}

/** Il nome della seduta come si legge: «PULL A» diventa «Pull A», «ARMS + BACK C» «Arms + Back C». */
function titoloSeduta(nome: string): string {
  return nome.replace('🦠 ', '').split(' · ').slice(1).join(' · ')
    .split(' ').map((p) => (p.length > 1 ? p[0] + p.slice(1).toLowerCase() : p)).join(' ')
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

  // La seduta che tocca: nome, muscoli e quanti esercizi ha la TUA scheda (che
  // puo' averne uno in piu' o in meno del protocollo).
  const seduta = SEDUTE_RS.find((s) => s.codice === ciclo?.prossima)
  const esercizi = useLiveQuery(async () => {
    if (!seduta) return null
    const t = (await db.templates.toArray()).find((x) => x.name === seduta.nome)
    return t?.items.length ?? seduta.esercizi.length
  }, [seduta?.nome])

  const tono = scavalcate.length > 0 ? 'rosso' : (ciclo?.oltre ?? 0) > 0 ? 'ambra' : 'ok'
  const CHIP: Record<string, React.CSSProperties> = {
    ok: { color: 'var(--good)', borderColor: '#1f4a2c', background: '#0f1f14' },
    ambra: { color: '#e0a030', borderColor: '#5a4214', background: '#241a08' },
    rosso: { color: '#ff6b5f', borderColor: '#5a1a14', background: '#2a0f0c' },
  }

  return (
    <div className="card eroe" style={{ marginBottom: 0, padding: '13px 14px' }}>
      {ciclo ? (
        <>
          <div className="row spread" style={{ gap: 8 }}>
            <span className="chip" style={{ ...CHIP.rosso, fontWeight: 600, padding: '3px 9px', fontSize: 11 }}>
              🦠 Ciclo {ciclo.numero} · dal {ciclo.dal.slice(8)}.{ciclo.dal.slice(5, 7)}
            </span>
            <span className="chip" style={{ ...CHIP[tono], fontWeight: 600, padding: '3px 9px', fontSize: 11 }}>
              giorno {ciclo.giorno} di {ciclo.giorniPrevisti}{tono === 'ok' ? ' · nei tempi' : ''}
            </span>
          </div>

          <h2 style={{ fontSize: 24, margin: '10px 0 1px' }}>
            {ciclo.prossima ? `${ciclo.prossima}${seduta ? ' · ' + titoloSeduta(seduta.nome) : ''}` : 'Ciclo completo'}
          </h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {seduta
              ? `${seduta.focus}${esercizi ? ` · ${esercizi} esercizi` : ''}`
              : `${ciclo.fatte} su ${ciclo.totale} · il prossimo parte da domani`}
          </div>

          {/* Le cinque sedute in fila: a colpo d'occhio quali hai fatto, quale
              tocca e quale hai scavalcato — che e' un'altra cosa dal ritardo. */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ciclo.passi.length}, 1fr)`, gap: 5, marginTop: 11 }}>
            {ciclo.passi.map((p) => (
              <span key={p.codice} style={{
                height: 24, borderRadius: 8, fontSize: 13, fontFamily: 'var(--f-numeri)', fontWeight: 600, letterSpacing: '.04em',
                display: 'grid', placeItems: 'center',
                ...(p.stato === 'fatta' ? { background: 'var(--gold)', color: '#1a1400' }
                  : p.stato === 'tocca' ? { background: 'var(--gold-bg)', border: '1.5px solid var(--gold)', color: 'var(--gold)' }
                    : p.stato === 'scavalcata' ? { background: '#2a0e0c', border: '1px solid var(--rs)', color: 'var(--rs)' }
                      : { border: '1px dashed #3a3730', color: 'var(--faint)' }),
              }}>{p.codice}</span>
            ))}
          </div>

          {/* Cosa non torna, solo quando qualcosa non torna. L'ultima seduta resta sempre. */}
          <div className="muted" style={{ fontSize: 11, marginTop: 7 }}>
            {scavalcate.length > 0
              ? <span style={{ color: 'var(--rs)' }}>{scavalcate.map((p) => p.codice).join(', ')} da recuperare · </span>
              : ciclo.oltre > 0
                ? <span style={{ color: '#e0a030' }}>+{ciclo.oltre} · lo chiudi in ritardo, non lo perdi · </span>
                : null}
            {ciclo.ultima ? `ultima ${ciclo.ultima.codice} il ${ciclo.ultima.date.slice(8)}.${ciclo.ultima.date.slice(5, 7)}` : 'nessuna seduta in questo ciclo'}
          </div>
        </>
      ) : (
        <>
          <span style={LBL}>Allenamento</span>
          {g && (
            <>
              <div className="row spread small" style={{ marginTop: 8 }}>
                <span className="muted">Obiettivo ciclo <span style={{ opacity: .7 }}>· giorno {g.giorno} di {g.giorni}</span></span>
                <strong className="num" style={{ fontSize: 17 }}>{g.done} / {g.target}</strong>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginTop: 6 }}>
                <div style={{ height: '100%', background: 'var(--gold)', width: `${g.target ? Math.min(100, g.done / g.target * 100) : 0}%` }} />
              </div>
            </>
          )}
          {home?.lastSession && (
            <div className="muted small" style={{ marginTop: 6 }}>
              Ultima: {home.lastSession.type} · {fmtData(home.lastSession.date)}
            </div>
          )}
        </>
      )}

      {ongoing ? (
        <button className="primary" style={{ width: '100%', marginTop: 11, padding: 13, fontSize: 16 }} onClick={() => onResume(ongoing.id)}>▶ Riprendi allenamento</button>
      ) : (
        <button className="primary" style={{ width: '100%', marginTop: 11, padding: 13, fontSize: 16 }} onClick={onStart}>
          {scavalcate.some((p) => p.codice === ciclo?.prossima)
            ? `Recupera ${ciclo!.prossima}`
            : `Inizia${ciclo?.prossima ? ' ' + ciclo.prossima : ' allenamento'}`}
        </button>
      )}

      {/* I cicli chiusi si guardano ogni tanto, non ogni giorno: stanno qui
          dentro, chiusi, invece di rubare mezzo schermo tutti i giorni. */}
      {ciclo && ciclo.chiusi.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
          <button onClick={() => setStorico((v) => !v)}
            style={{ width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'left', borderRadius: 0 }}>
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
    </div>
  )
}

function CardPassi({ onOpen }: { onOpen: () => void }) {
  const h = useLiveQuery(() => getHabit(STEPS), [])
  const oggi = useLiveQuery(() => getHabitValue(STEPS), [])
  useEffect(() => { ensureHabits() }, [])
  const target = h?.target ?? 10000
  const fatti = oggi?.value ?? 0
  const pct = Math.min(100, (fatti / target) * 100)

  return (
    <div role="button" tabIndex={0} onClick={onOpen} style={{ cursor: 'pointer' }}>
      <span style={LBL}>Passi</span>
      <div style={{ marginTop: 8 }}>
        <span style={GRANDE}>{oggi ? fatti.toLocaleString('it-IT') : '—'}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginTop: 9 }}>
        <div style={{ height: '100%', background: 'var(--gold)', width: `${pct}%`, borderRadius: 999 }} />
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>di {target.toLocaleString('it-IT')} passi</div>
    </div>
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

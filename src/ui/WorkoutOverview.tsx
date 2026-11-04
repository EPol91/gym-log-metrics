import { useLiveQuery } from 'dexie-react-hooks'
import { useIndietro } from './useBloccoScroll'
import { Cuore } from './Cuore'
import { PiedeFisso } from './PiedeFisso'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { entriesOf, setsOf, allExercises, getSession, cardioOf, sessionElapsedSec } from '../db/repo'
import { isWorkingSet, tonnage } from '../metrics/metrics'
import { serieAttese, serieDiPrima, serieInFila, codiceScheda, nomeScheda } from '../scores/confronto'
import type { ExerciseEntry, SetEntry } from '../db/schema'

const TYPE_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper',
  lower: 'Lower', fullbody: 'Full body', brosplit: 'Bro split', custom: 'Libera',
}
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

interface Row { entry: ExerciseEntry; name: string; sets: SetEntry[]; attese: number | null; prima: SetEntry[] }
interface OverviewBlock {
  kind: 'single' | 'group'
  rows: Row[]
  index: number // posizione del blocco nella vista live, per tornarci
}

async function computeOverview(sessionId: string) {
  const session = await getSession(sessionId)
  const entries = await entriesOf(sessionId)
  const exercises = await allExercises()
  const scheda = session?.srcTemplateId ? (await db.templates.get(session.srcTemplateId))?.name ?? null : null
  const codice = codiceScheda(scheda)

  const rows: Row[] = []
  for (const e of entries) {
    const ex = exercises.find((x) => x.id === e.exerciseId)
    const prima = session ? (await serieDiPrima(e.exerciseId, session))?.sets ?? [] : []
    rows.push({
      entry: e, name: ex?.name ?? '—',
      sets: (await setsOf(e.id)).filter(isWorkingSet),
      // Quante ne prevede la riga del coach; se non c'e', quante ne hai fatte la volta scorsa.
      attese: serieAttese(ex?.settings, codice) ?? (prima.length || null),
      prima,
    })
  }

  // Stessi blocchi della vista live: singoli e superset/triset.
  const blocks: OverviewBlock[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.entry.groupId) { blocks.push({ kind: 'single', rows: [r], index: blocks.length }); continue }
    if (seen.has(r.entry.groupId)) continue
    seen.add(r.entry.groupId)
    blocks.push({ kind: 'group', rows: rows.filter((x) => x.entry.groupId === r.entry.groupId), index: blocks.length })
  }

  return { session, scheda, blocks, rows, cardio: await cardioOf(sessionId) }
}

const fatte = (b: OverviewBlock) => b.rows.reduce((a, r) => a + r.sets.length, 0)
const attese = (b: OverviewBlock) => (b.rows.every((r) => r.attese) ? b.rows.reduce((a, r) => a + (r.attese ?? 0), 0) : null)
const finito = (b: OverviewBlock) => { const a = attese(b); return a ? fatte(b) >= a : false }

/**
 * Panoramica della seduta in corso: dove sei, cosa hai fatto, cosa manca.
 * Fatto ✓, in corso in oro, da fare con il riferimento della volta scorsa.
 */
export function WorkoutOverview({ sessionId, onBack, onOpenBlock, onFinish }: {
  sessionId: string
  onBack: () => void
  onOpenBlock: (index: number) => void
  onFinish?: () => void
}) {
  useIndietro(onBack)
  const d = useLiveQuery(() => computeOverview(sessionId), [sessionId])
  // Nota: la lettura passa da db per restare reattiva agli inserimenti in corso.
  useLiveQuery(() => db.sets.where('userId').equals(LOCAL_USER_ID).count(), [])

  if (!d) return <div className="col"><p className="muted">Carico…</p></div>

  const sec = d.session ? sessionElapsedSec(d.session) : 0
  const ore = `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
  const serieFatte = d.rows.reduce((a, r) => a + r.sets.length, 0)
  const serieTotali = d.rows.every((r) => r.attese) ? d.rows.reduce((a, r) => a + (r.attese ?? 0), 0) : null
  const eserciziFatti = d.blocks.filter(finito).length
  // In corso: il primo blocco iniziato e non finito; altrimenti il primo da fare.
  const corrente = d.blocks.find((b) => fatte(b) > 0 && !finito(b)) ?? d.blocks.find((b) => !finito(b)) ?? null
  const titolo = d.scheda ? nomeScheda(d.scheda) : TYPE_LABEL[d.session?.type ?? ''] ?? 'Seduta'

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="barra-s">
        <button className="ind" onClick={onBack}>‹ Allenamento</button>
        <span className="tit">{titolo}</span>
        <span className="num" style={{ color: 'var(--gold)', fontSize: 17, flex: 'none' }}>{ore}</span>
      </div>

      <div className="card" style={{ margin: 0, padding: '12px 12px 13px' }}>
        <div className="row spread" style={{ marginBottom: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 14 }}>
            <b className="num" style={{ fontSize: 19 }}>{serieFatte}</b>
            <span className="muted">{serieTotali ? ` di ${serieTotali} serie` : ' serie'}</span>
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {eserciziFatti} esercizi su {d.blocks.length} · {migliaia(tonnage(d.rows.flatMap((r) => r.sets)))} kg
          </span>
        </div>
        <div className="prog-s"><i style={{ width: `${serieTotali ? Math.min(100, (serieFatte / serieTotali) * 100) : (eserciziFatti / Math.max(1, d.blocks.length)) * 100}%` }} /></div>
      </div>

      {d.blocks.length === 0 ? <p className="muted small">Nessun esercizio registrato.</p> : (
        <div className="lista-p">
          {d.blocks.map((b, i) => {
            const ok = finito(b), ora = b === corrente
            const a = attese(b), f = fatte(b)
            const nomi = b.rows.map((r) => r.name).join(' + ')
            const sotto = f > 0
              ? (ora ? `in corso · ${f} ${f === 1 ? 'serie fatta' : 'serie fatte'}` : b.rows.map((r) => serieInFila(r.sets)).filter(Boolean).join(' / '))
              : b.rows[0].prima.length ? `ultima volta ${b.rows.map((r) => serieInFila(r.prima)).filter(Boolean).join(' / ')}` : 'da fare'
            return (
              <button key={b.rows[0].entry.id} className={ora ? 'riga-s attiva' : 'riga-s'} onClick={() => onOpenBlock(b.index)}>
                <span className={ok ? 'stato-s fatto' : ora ? 'stato-s ora' : 'stato-s'}>{ok ? '✓' : i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: ora ? 'var(--gold)' : undefined }}>
                  {b.kind === 'group' && <span className="pill-p oro" style={{ fontSize: 9.5, padding: '1px 6px', marginRight: 6 }}>{b.rows.length === 3 ? 'TRISET' : 'SUPERSET'}</span>}
                  {nomi}
                  <span className="sotto" style={{ color: ora ? '#b9a35a' : undefined }}>{sotto}</span>
                </span>
                <span className="num" style={{ fontSize: 16, color: ora ? 'var(--gold)' : 'var(--muted)', flex: 'none' }}>{a ? `${f}/${a}` : f}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Cardio della seduta */}
      {d.cardio.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <div className="etichetta-p" style={{ marginBottom: 6 }}>Cardio</div>
          {d.cardio.map((c) => (
            <div key={c.id} className="row spread small" style={{ padding: '3px 0' }}>
              <span>{c.cardioType ?? 'cardio'}</span>
              <span className="muted">{c.durationMin}′{c.avgBpm ? ` · ${c.avgBpm} bpm` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Il cuore mentre ti alleni, non solo a cose fatte. */}
      <Cuore hr={d.session?.hr} da={d.session?.startedAt} a={d.session?.finishedAt ?? null} titolo="Cuore della seduta" />

      {d.session?.notes && (
        <div className="card" style={{ margin: 0 }}>
          <div className="etichetta-p" style={{ marginBottom: 4 }}>Note</div>
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.session.notes}</p>
        </div>
      )}

      <div className="spazio-piede" />
      <PiedeFisso>
        {onFinish && <button className="ghost" onClick={() => { if (confirm('Chiudere la seduta?')) onFinish() }}>Termina</button>}
        <button className="primary" onClick={() => onOpenBlock(corrente?.index ?? 0)}>
          {corrente ? `Riprendi · ${corrente.rows[0].name.split(' ').slice(0, 2).join(' ')}` : 'Torna alla seduta'}
        </button>
      </PiedeFisso>
    </div>
  )
}

import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getOngoingSession, listTemplates } from '../db/repo'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { cicloRs } from '../rs/cicloSedute'
import { SEDUTE_RS } from '../rs/protocollo'
import { nomeScheda } from '../scores/confronto'
import { fmtData } from '../util/format'
import { ExercisesScreen } from './ExercisesScreen'
import { HistoryScreen } from './HistoryScreen'
import { AnalisiAllenamenti } from './AnalisiAllenamenti'
import { usePersistedState } from '../util/persist'

type Sezione = 'esercizi' | 'storico' | 'analisi'

const SEZIONI: { key: Sezione; label: string }[] = [
  { key: 'esercizi', label: 'Esercizi' },
  { key: 'storico', label: 'Storico' },
  { key: 'analisi', label: 'Analisi' },
]
const ggmm = (iso: string) => fmtData(iso).slice(0, 5)

/** Cosa mettere in cima: la seduta in corso, o quella che tocca nel ciclo. */
async function inCima() {
  const ongoing = await getOngoingSession()
  const schede = await listTemplates()
  if (ongoing) {
    const t = ongoing.srcTemplateId ? schede.find((x) => x.id === ongoing.srcTemplateId) : undefined
    const entries = await db.exerciseEntries.where({ sessionId: ongoing.id }).toArray()
    let serie = 0
    for (const e of entries) serie += (await db.sets.where({ entryId: e.id }).toArray()).filter((s) => !s.isWarmup).length
    return { ongoing, nome: t ? nomeScheda(t.name) : null, serie, ciclo: null, scheda: null, ultima: null }
  }
  const ciclo = await cicloRs()
  const nomeRs = SEDUTE_RS.find((s) => s.codice === ciclo?.prossima)?.nome
  const scheda = nomeRs ? schede.find((t) => t.name === nomeRs) ?? null : null
  const ultima = scheda
    ? (await db.sessions.where('userId').equals(LOCAL_USER_ID).toArray())
      .filter((s) => s.finishedAt && s.srcTemplateId === scheda.id)
      .map((s) => s.date).sort().pop() ?? null
    : null
  return { ongoing: null, nome: null, serie: 0, ciclo, scheda, ultima }
}

/**
 * Allena: il verbo principale dell'app, finalmente dove uno lo cerca.
 *
 * In cima la seduta che tocca, con la striscia del ciclo come in Oggi e il tasto
 * che la fa partire; con una seduta aperta, quella da riprendere. Sotto gli
 * esercizi, lo storico e l'analisi, scelti con un interruttore a tre.
 */
export function TrainScreen({ onStartWorkout, onStartScheda, onResumeWorkout, onOpen, apriSeduta }: {
  onStartWorkout: () => void
  /** Parte subito con quella scheda (dal check di prontezza). */
  onStartScheda?: (templateId: string) => void
  onResumeWorkout: (id: string) => void
  onOpen: (id: string, isNew?: boolean) => void
  /** Arrivi da fuori per vedere UNA seduta: si apre lo storico su quella. */
  apriSeduta?: string | null
}) {
  const cima = useLiveQuery(inCima, [])
  const [sezione, setSezione] = usePersistedState<Sezione>('train-sub', 'storico')

  // Chi ti manda qui per una seduta vuole lo storico, non la sezione che avevi
  // aperto l'ultima volta.
  useEffect(() => { if (apriSeduta) setSezione('storico') }, [apriSeduta]) // eslint-disable-line react-hooks/exhaustive-deps

  const ciclo = cima?.ciclo
  const scavalcata = !!ciclo?.passi.some((p) => p.stato === 'scavalcata' && p.codice === ciclo.prossima)

  return (
    <div className="col" style={{ gap: 10 }}>
      <h1 style={{ margin: '0 0 2px' }}>Allena</h1>

      {cima?.ongoing ? (
        <div className="card eroe-a">
          <span className="etichetta-p" style={{ color: 'var(--gold)', fontWeight: 600 }}>In corso</span>
          <div className="tit-a">{cima.nome ?? 'Seduta libera'}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{cima.serie} {cima.serie === 1 ? 'serie fatta' : 'serie fatte'}</div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="primary" style={{ flex: 1, height: 48 }} onClick={() => onResumeWorkout(cima.ongoing!.id)}>▶ Riprendi</button>
            <button className="ghost" style={{ flex: '0 0 116px', height: 48, fontSize: 13.5 }} onClick={onStartWorkout}>Nuova seduta</button>
          </div>
        </div>
      ) : ciclo && ciclo.prossima ? (
        <div className="card eroe-a">
          <div className="row spread">
            <span className="etichetta-p" style={{ color: scavalcata ? 'var(--rs)' : 'var(--gold)', fontWeight: 600 }}>{scavalcata ? 'Da recuperare' : 'Tocca a te'}</span>
            <span className="muted" style={{ fontSize: 12 }}>ciclo · giorno {ciclo.giorno} di {ciclo.giorniPrevisti}</span>
          </div>
          <div className="tit-a">{cima.scheda ? nomeScheda(cima.scheda.name) : ciclo.prossima}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {[cima.scheda && `${cima.scheda.items.length} esercizi`, cima.ultima && `ultima ${ggmm(cima.ultima)}`].filter(Boolean).join(' · ')}
          </div>
          <div className="striscia-a" style={{ gridTemplateColumns: `repeat(${ciclo.passi.length}, 1fr)` }}>
            {ciclo.passi.map((p) => (
              <div key={p.codice} className={p.stato === 'fatta' ? 'fatta' : p.stato === 'tocca' ? 'ora' : p.stato === 'scavalcata' ? 'saltata' : ''}>
                {p.codice}
                <small>{p.stato === 'fatta' ? `✓ ${p.date ? ggmm(p.date) : ''}` : p.stato === 'tocca' ? 'oggi' : p.stato === 'scavalcata' ? 'recupera' : ' '}</small>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="primary" style={{ flex: 1, height: 48 }}
              onClick={() => (cima.scheda && onStartScheda ? onStartScheda(cima.scheda.id) : onStartWorkout())}>
              ▶ {scavalcata ? 'Recupera' : 'Inizia'} {ciclo.prossima}
            </button>
            <button className="ghost" style={{ flex: '0 0 116px', height: 48, fontSize: 13.5 }} onClick={onStartWorkout}>Altra seduta</button>
          </div>
        </div>
      ) : (
        <button className="primary" style={{ width: '100%', height: 52, fontSize: 16 }} onClick={onStartWorkout}>＋ Inizia allenamento</button>
      )}

      <div className="seg-a" role="tablist">
        {SEZIONI.map((s) => (
          <button key={s.key} role="tab" aria-selected={sezione === s.key} className={sezione === s.key ? 'on' : ''}
            onClick={() => setSezione(s.key)}>{s.label}</button>
        ))}
      </div>

      {sezione === 'esercizi' && <ExercisesScreen onOpen={onOpen} />}
      {sezione === 'storico' && <HistoryScreen onReopen={onResumeWorkout} apri={apriSeduta} />}
      {sezione === 'analisi' && <AnalisiAllenamenti />}
    </div>
  )
}

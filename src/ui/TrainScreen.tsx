import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getOngoingSession } from '../db/repo'
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

/**
 * Allena: il verbo principale dell'app, finalmente dove uno lo cerca.
 *
 * Il tasto per partire sta sempre in cima e non si nasconde mai dietro una
 * sezione: e' la cosa che vieni a fare qui. Sotto ci sono gli esercizi, lo
 * storico delle sedute e l'analisi — che prima stavano in Salute, cioe' nel
 * posto di come STAI, mentre parlano di come ti ALLENI.
 */
export function TrainScreen({ onStartWorkout, onResumeWorkout, onOpen, apriSeduta }: {
  onStartWorkout: () => void
  onResumeWorkout: (id: string) => void
  onOpen: (id: string, isNew?: boolean) => void
  /** Arrivi da fuori per vedere UNA seduta: si apre lo storico su quella. */
  apriSeduta?: string | null
}) {
  const ongoing = useLiveQuery(getOngoingSession, [])
  const [sezione, setSezione] = usePersistedState<Sezione>('train-sub', 'esercizi')

  // Chi ti manda qui per una seduta vuole lo storico, non la sezione che avevi
  // aperto l'ultima volta.
  useEffect(() => { if (apriSeduta) setSezione('storico') }, [apriSeduta]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="col" style={{ gap: 10 }}>
      {ongoing ? (
        <>
          <button className="primary" style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 600 }}
            onClick={() => onResumeWorkout(ongoing.id)}>
            ▶ Riprendi allenamento
          </button>
          <button className="ghost small" style={{ width: '100%' }} onClick={onStartWorkout}>＋ Inizia una nuova seduta</button>
        </>
      ) : (
        <button className="primary" style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 600 }} onClick={onStartWorkout}>
          ＋ Inizia allenamento
        </button>
      )}

      <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {SEZIONI.map((s) => (
          <button key={s.key} className={sezione === s.key ? 'chip on' : 'chip'}
            onClick={() => setSezione(s.key)}>{s.label}</button>
        ))}
      </div>

      {sezione === 'esercizi' && <ExercisesScreen onOpen={onOpen} />}
      {sezione === 'storico' && <HistoryScreen onReopen={onResumeWorkout} apri={apriSeduta} />}
      {sezione === 'analisi' && <AnalisiAllenamenti />}
    </div>
  )
}

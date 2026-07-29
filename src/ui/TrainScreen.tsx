import { useLiveQuery } from 'dexie-react-hooks'
import { getOngoingSession } from '../db/repo'
import { ExercisesScreen } from './ExercisesScreen'

/**
 * Allena: il verbo principale dell'app, finalmente dove uno lo cerca.
 * In cima si parte, sotto c'è la libreria degli esercizi.
 */
export function TrainScreen({ onStartWorkout, onResumeWorkout, onOpen }: {
  onStartWorkout: () => void
  onResumeWorkout: (id: string) => void
  onOpen: (id: string, isNew?: boolean) => void
}) {
  const ongoing = useLiveQuery(getOngoingSession, [])

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

      <ExercisesScreen onOpen={onOpen} />
    </div>
  )
}

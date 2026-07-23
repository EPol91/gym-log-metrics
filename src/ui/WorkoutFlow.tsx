import { useState } from 'react'
import { startSession, startFromTemplate, finishSession } from '../db/repo'
import { StartScreen } from './StartScreen'
import { ReadinessScreen } from './ReadinessScreen'
import { LiveWorkout } from './LiveWorkout'
import { FinishScreen } from './FinishScreen'
import type { WorkoutType, ReadinessCheck } from '../db/schema'

type Step = 'start' | 'readiness' | 'live' | 'finish'
type Source = { kind: 'type'; type: WorkoutType } | { kind: 'template'; templateId: string }

/** Flusso completo di un allenamento, dall'inizio al riepilogo. onExit torna alla Home.
 *  resumeSessionId: se presente, riprende una seduta già aperta (salta a 'live'). */
export function WorkoutFlow({ onExit, resumeSessionId, onSessionStarted }: {
  onExit: () => void; resumeSessionId?: string | null; onSessionStarted?: (id: string) => void
}) {
  const [step, setStep] = useState<Step>(resumeSessionId ? 'live' : 'start')
  const [source, setSource] = useState<Source>({ kind: 'type', type: 'push' })
  const [sessionId, setSessionId] = useState<string | null>(resumeSessionId ?? null)

  async function begin(r: ReadinessCheck | null) {
    const id = source.kind === 'template'
      ? await startFromTemplate(source.templateId, r)
      : await startSession(source.type, r)
    setSessionId(id)
    setStep('live')
    onSessionStarted?.(id) // persiste l'id per sopravvivere a refresh/back
  }
  async function finish() {
    if (sessionId) await finishSession(sessionId)
    setStep('finish')
  }

  return (
    <>
      {step === 'start' && (
        <StartScreen
          onNext={(t) => { setSource({ kind: 'type', type: t }); setStep('readiness') }}
          onTemplate={(templateId) => { setSource({ kind: 'template', templateId }); setStep('readiness') }}
          onCancel={onExit}
        />
      )}
      {step === 'readiness' && <ReadinessScreen onStart={begin} />}
      {step === 'live' && sessionId && <LiveWorkout sessionId={sessionId} onFinish={finish} onHome={onExit} />}
      {step === 'finish' && sessionId && <FinishScreen sessionId={sessionId} onHome={onExit} />}
    </>
  )
}

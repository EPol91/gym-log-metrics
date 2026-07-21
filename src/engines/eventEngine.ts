// Event Engine (scheletro) — orchestratore reattivo.
// Ruolo: a ogni evento (StartWorkout, AddSet, EditSet, Weight, Cardio, FinishWorkout, PhaseChange…)
// invalida e ricalcola SOLO la fetta di metriche/score dipendente, tenendo la cache in memoria.
// Rispetta: single source of truth (deriva dai grezzi) + performance (nessun ricalcolo globale).

export type DomainEvent =
  | 'StartWorkout' | 'AddExercise' | 'AddSet' | 'EditSet'
  | 'Weight' | 'Water' | 'Salt' | 'Cardio' | 'FinishWorkout' | 'PhaseChange'

// TODO: implementare il grafo delle dipendenze evento → metriche/score da invalidare,
// e la cache memoizzata. Per ora è solo il contratto.
export interface EventEngine {
  emit(event: DomainEvent, payload: unknown): void
}

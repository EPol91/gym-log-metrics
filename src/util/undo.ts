// Annulla l'ultima azione. Vive fuori da React: una sola azione alla volta,
// quella appena fatta — è ciò che serve davvero dopo un'eliminazione per sbaglio.

export interface UndoAction {
  label: string
  run: () => Promise<void> | void
}

let current: UndoAction | null = null
let timer: number | undefined
const listeners = new Set<(a: UndoAction | null) => void>()

function emit() { for (const l of listeners) l(current) }

export function subscribeUndo(l: (a: UndoAction | null) => void): () => void {
  listeners.add(l)
  l(current)
  return () => { listeners.delete(l) }
}

/** Registra l'azione annullabile. Scade da sola: non resta lì per sempre. */
export function pushUndo(label: string, run: UndoAction['run'], ttlMs = 8000): void {
  current = { label, run }
  emit()
  if (timer) clearTimeout(timer)
  timer = window.setTimeout(() => { current = null; emit() }, ttlMs)
}

export async function runUndo(): Promise<void> {
  const a = current
  current = null
  if (timer) clearTimeout(timer)
  emit()
  if (a) await a.run()
}

export function clearUndo(): void {
  current = null
  if (timer) clearTimeout(timer)
  emit()
}

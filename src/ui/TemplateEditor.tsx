import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTemplate, createTemplate, updateTemplate, allExercises } from '../db/repo'
import { ExercisePicker } from './ExercisePicker'
import type { WorkoutType } from '../db/schema'

const TYPES: WorkoutType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'fullbody', 'brosplit', 'custom']

/** templateId null = nuovo template (creato solo al salvataggio → niente template vuoti). */
export function TemplateEditor({ templateId, onBack }: { templateId: string | null; onBack: () => void }) {
  const tpl = useLiveQuery(() => (templateId ? getTemplate(templateId) : undefined), [templateId])
  const exercises = useLiveQuery(allExercises, []) ?? []
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—'
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkoutType>('custom')
  const [items, setItems] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!templateId) { setLoaded(true); return } // nuovo: parte vuoto
    if (tpl && !loaded) {
      setName(tpl.name); setType(tpl.type)
      setItems([...tpl.items].sort((a, b) => a.order - b.order).map((i) => i.exerciseId))
      setLoaded(true)
    }
  }, [tpl, loaded, templateId])

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items];[next[i], next[j]] = [next[j], next[i]]; setItems(next)
  }

  async function save() {
    const payload = { name, type, items: items.map((exerciseId, order) => ({ exerciseId, order })) }
    if (templateId) await updateTemplate(templateId, payload)
    else { const id = await createTemplate(name, type); await updateTemplate(id, payload) }
    onBack()
  }

  return (
    <div className="col">
      <button className="ghost small" onClick={onBack}>← Indietro</button>
      <h1>Template</h1>

      <div className="card">
        <label className="fl">Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Push A" />
        <label className="fl" style={{ marginTop: 8 }}>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value as WorkoutType)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card">
        <label className="fl">Esercizi</label>
        {items.length === 0 && <p className="muted small">Nessun esercizio. Aggiungine uno.</p>}
        {items.map((id, i) => (
          <div className="setline" key={id + i}>
            <span className="muted">{i + 1}</span>
            <span>{nameOf(id)}</span>
            <span className="row" style={{ gap: 4 }}>
              <button className="ghost small" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="ghost small" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="ghost small" onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
            </span>
          </div>
        ))}
        {picking ? (
          <ExercisePicker onPick={(id) => { setItems([...items, id]); setPicking(false) }} onClose={() => setPicking(false)} />
        ) : (
          <button style={{ marginTop: 8 }} onClick={() => setPicking(true)}>＋ Aggiungi esercizio</button>
        )}
      </div>

      <button className="fab primary" disabled={!name.trim()} onClick={save}>Salva template</button>
    </div>
  )
}

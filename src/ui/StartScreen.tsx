import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTemplates, deleteTemplate, listGyms, setDefaultGym } from '../db/repo'
import { TemplateEditor } from './TemplateEditor'
import type { WorkoutType } from '../db/schema'

const TYPES: { key: WorkoutType; label: string }[] = [
  { key: 'push', label: 'Push' }, { key: 'pull', label: 'Pull' }, { key: 'legs', label: 'Legs' },
  { key: 'upper', label: 'Upper' }, { key: 'lower', label: 'Lower' }, { key: 'fullbody', label: 'Full Body' },
  { key: 'brosplit', label: 'Bro Split' }, { key: 'custom', label: 'Custom' },
]

export function StartScreen({
  onNext, onTemplate, onCancel,
}: {
  onNext: (t: WorkoutType) => void
  onTemplate: (templateId: string) => void
  onCancel?: () => void
}) {
  const [type, setType] = useState<WorkoutType | null>(null)
  const [editId, setEditId] = useState<string | 'new' | null>(null)
  const templates = useLiveQuery(listTemplates, []) ?? []
  const gyms = useLiveQuery(listGyms, []) ?? []
  const defaultGym = gyms.find((g) => g.isDefault) ?? gyms[0]

  if (editId) return <TemplateEditor templateId={editId === 'new' ? null : editId} onBack={() => setEditId(null)} />

  return (
    <div className="col">
      <div className="row spread">
        <div>
          <h1>Nuovo allenamento</h1>
          <p className="muted small">Da un template o scegli il tipo</p>
        </div>
        {onCancel && <button className="ghost small" onClick={onCancel}>✕</button>}
      </div>

      {gyms.length > 1 && (
        <div className="card">
          <label className="fl">Palestra</label>
          <select value={defaultGym?.id ?? ''} onChange={(e) => setDefaultGym(e.target.value)}>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        <div className="row spread">
          <label className="fl">I tuoi template</label>
          <button className="ghost small" onClick={() => setEditId('new')}>＋ Nuovo</button>
        </div>
        {templates.length === 0 ? (
          <p className="muted small">Nessun template. Creane uno o salvane uno a fine allenamento.</p>
        ) : (
          <div className="col">
            {templates.map((t) => (
              <div className="row spread" key={t.id}>
                <button className="ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => onTemplate(t.id)}>
                  ▶ {t.name} <span className="muted small">· {t.items.length} esercizi</span>
                </button>
                <button className="ghost small" onClick={() => setEditId(t.id)}>✎</button>
                <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${t.name}?`)) deleteTemplate(t.id) }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <label className="fl">Nuova seduta vuota</label>
        <div className="grid2">
          {TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'sel' : ''} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button className="fab primary" disabled={!type} onClick={() => type && onNext(type)}>
        Continua
      </button>
    </div>
  )
}

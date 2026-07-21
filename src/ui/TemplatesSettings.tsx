import { useLiveQuery } from 'dexie-react-hooks'
import { listTemplates, deleteTemplate } from '../db/repo'

export function TemplatesSettings({ onEdit, onNew }: { onEdit: (id: string) => void; onNew: () => void }) {
  const templates = useLiveQuery(listTemplates, []) ?? []
  return (
    <div className="card">
      <div className="row spread">
        <label className="fl">Template workout</label>
        <button className="ghost small" onClick={onNew}>＋ Nuovo</button>
      </div>
      {templates.length === 0 ? (
        <p className="muted small">Nessun template. Creane uno o salvane uno a fine allenamento.</p>
      ) : (
        <div className="col">
          {templates.map((t) => (
            <div className="row spread" key={t.id}>
              <button className="ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => onEdit(t.id)}>
                {t.name} <span className="muted small">· {t.items.length} esercizi</span>
              </button>
              <button className="ghost small" onClick={() => onEdit(t.id)}>✎</button>
              <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${t.name}?`)) deleteTemplate(t.id) }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

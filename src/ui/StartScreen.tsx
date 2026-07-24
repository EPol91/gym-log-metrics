import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTemplates, deleteTemplate, listGyms, setDefaultGym } from '../db/repo'
import { TemplateEditor } from './TemplateEditor'
import type { WorkoutType } from '../db/schema'

const TYPES: { key: WorkoutType; label: string; hint: string }[] = [
  { key: 'push', label: 'Push', hint: 'spinta' }, { key: 'pull', label: 'Pull', hint: 'tirata' },
  { key: 'legs', label: 'Legs', hint: 'gambe' }, { key: 'upper', label: 'Upper', hint: 'alta' },
  { key: 'lower', label: 'Lower', hint: 'bassa' }, { key: 'fullbody', label: 'Full Body', hint: 'completo' },
  { key: 'brosplit', label: 'Bro Split', hint: 'monogruppo' }, { key: 'custom', label: 'Custom', hint: 'libero' },
]

// Etichetta sezione: maiuscoletto tenue.
const SECTION: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }

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

  const selLabel = TYPES.find((t) => t.key === type)?.label

  return (
    <div className="col" style={{ paddingBottom: 84 }}>
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Nuovo allenamento</h1>
          <p className="muted small" style={{ margin: 0 }}>Da un template o scegli il tipo</p>
        </div>
        {onCancel && (
          <button className="ghost" onClick={onCancel}
            style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }}>✕</button>
        )}
      </div>

      {gyms.length > 1 && (
        <div className="card">
          <label className="fl">Palestra</label>
          <select value={defaultGym?.id ?? ''} onChange={(e) => setDefaultGym(e.target.value)}>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="row spread" style={{ marginTop: 8 }}>
        <span style={SECTION}>I tuoi template</span>
        <button className="ghost small" style={{ color: 'var(--gold)' }} onClick={() => setEditId('new')}>＋ Nuovo</button>
      </div>
      {templates.length === 0 ? (
        <p className="muted small" style={{ marginTop: 4 }}>Nessun template. Creane uno o salvane uno a fine allenamento.</p>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {templates.map((t) => (
            <div key={t.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px' }}>
              <button className="ghost" onClick={() => onTemplate(t.id)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', padding: 0, background: 'none' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: '#20200f', color: 'var(--gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>▶</span>
                <span>
                  <span style={{ display: 'block', fontSize: 14 }}>{t.name}</span>
                  <span className="muted small">{t.items.length} esercizi</span>
                </span>
              </button>
              <button className="ghost small" onClick={() => setEditId(t.id)}>✎</button>
              <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${t.name}?`)) deleteTemplate(t.id) }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <span style={{ ...SECTION, marginTop: 12 }}>Nuova seduta vuota</span>
      <div className="grid2" style={{ gap: 8 }}>
        {TYPES.map((t) => {
          const on = type === t.key
          return (
            <button key={t.key} onClick={() => setType(t.key)}
              style={{
                textAlign: 'left', borderRadius: 12, padding: '12px 12px',
                background: on ? '#20200f' : 'var(--surface)',
                border: `1.5px solid ${on ? 'var(--gold)' : 'var(--line)'}`,
              }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: on ? 'var(--gold)' : 'var(--text)' }}>{t.label}</span>
                {on && <span style={{ color: 'var(--gold)', fontSize: 13 }}>↗</span>}
              </span>
              <span style={{ display: 'block', fontSize: 10, marginTop: 3, color: on ? 'var(--gold-dim)' : 'var(--muted)' }}>{t.hint}</span>
            </button>
          )
        })}
      </div>

      <button className="fab primary" disabled={!type} onClick={() => type && onNext(type)}>
        Continua{selLabel ? ` · ${selLabel}` : ''}
      </button>
    </div>
  )
}

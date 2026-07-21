import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listGyms, addGym, setDefaultGym, deleteGym, renameGym } from '../db/repo'

export function GymSettings() {
  const gyms = useLiveQuery(listGyms, []) ?? []
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  return (
    <div className="card">
      <label className="fl">Palestre (tocca per impostare la predefinita)</label>
      <div className="col">
        {gyms.map((g) => (
          editId === g.id ? (
            <div className="row" key={g.id}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              <button className="primary" onClick={async () => { await renameGym(g.id, editName); setEditId(null) }}>OK</button>
            </div>
          ) : (
            <div className="row spread" key={g.id}>
              <button className={g.isDefault ? 'sel' : 'ghost'} style={{ flex: 1, textAlign: 'left' }} onClick={() => setDefaultGym(g.id)}>
                {g.isDefault ? '★ ' : ''}{g.name}
              </button>
              <button className="ghost small" onClick={() => { setEditId(g.id); setEditName(g.name) }}>✎</button>
              {gyms.length > 1 && <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${g.name}?`)) deleteGym(g.id) }}>✕</button>}
            </div>
          )
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Nuova palestra…" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!name.trim()} onClick={async () => { await addGym(name); setName('') }}>Aggiungi</button>
      </div>
    </div>
  )
}

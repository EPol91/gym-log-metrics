import { useState } from 'react'
import { deleteWithUndo } from '../db/trash'
import { useLiveQuery } from 'dexie-react-hooks'
import { listGyms, addGym, setDefaultGym, deleteGym, renameGym, setGymPosition } from '../db/repo'
import { getPosition, isGeoSupported } from '../util/geo'

export function GymSettings() {
  const gyms = useLiveQuery(listGyms, []) ?? []
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [geoBusy, setGeoBusy] = useState<string | null>(null)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)

  // La posizione si chiede SOLO qui, al tocco: nessun permesso di nascosto.
  async function saveHere(id: string) {
    setGeoBusy(id); setGeoMsg(null)
    try {
      await setGymPosition(id, await getPosition())
      setGeoMsg('Posizione salvata.')
    } catch (e) {
      setGeoMsg((e as Error).message)
    } finally {
      setGeoBusy(null)
    }
  }

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
            <div key={g.id}>
              <div className="row spread">
                <button className={g.isDefault ? 'sel' : 'ghost'} style={{ flex: 1, textAlign: 'left' }} onClick={() => setDefaultGym(g.id)}>
                  {g.isDefault ? '★ ' : ''}{g.name}{g.lat != null && <span className="muted small"> · 📍</span>}
                </button>
                <button className="ghost small" onClick={() => { setEditId(g.id); setEditName(g.name) }}>✎</button>
                {gyms.length > 1 && <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${g.name}?`)) deleteWithUndo(`Palestra "${g.name}" eliminata`, () => deleteGym(g.id)) }}>✕</button>}
              </div>
              {isGeoSupported() && (
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <button className="chip" disabled={geoBusy === g.id} onClick={() => saveHere(g.id)}>
                    {geoBusy === g.id ? 'Rilevo…' : g.lat != null ? '📍 Aggiorna posizione' : '📍 Sono qui'}
                  </button>
                  {g.lat != null && <button className="chip" onClick={() => setGymPosition(g.id, null)}>Rimuovi</button>}
                </div>
              )}
            </div>
          )
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Nuova palestra…" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!name.trim()} onClick={async () => { await addGym(name); setName('') }}>Aggiungi</button>
      </div>
      {geoMsg && <p className="muted small" style={{ marginTop: 6 }}>{geoMsg}</p>}
      <p className="muted small" style={{ marginTop: 6 }}>
        La posizione serve solo a riconoscere la palestra all’avvio della seduta. Viene chiesta unicamente quando tocchi “Sono qui”.
      </p>
    </div>
  )
}

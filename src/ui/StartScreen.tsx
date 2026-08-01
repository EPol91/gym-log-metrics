import { useState } from 'react'
import { deleteWithUndo } from '../db/trash'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTemplates, deleteTemplate, listGyms, setDefaultGym, addGym, updateTemplate } from '../db/repo'
import { TemplateEditor } from './TemplateEditor'
import { getPosition, distanceMeters, fmtDistance, isGeoSupported } from '../util/geo'
import { PesoOggi } from './PesoOggi'
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
  const [locating, setLocating] = useState(false)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)
  const tutti = useLiveQuery(listTemplates, []) ?? []
  // Il 🦠 nel nome dice da dove viene: i suoi da una parte, i tuoi dall'altra.
  // D1…D5: l'ordine e' quello della scheda, non quello in cui sono stati creati.
  const rsTemplates = tutti.filter((t) => t.name.startsWith('🦠')).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const miei = tutti.filter((t) => !t.name.startsWith('🦠'))
  const templates = miei.filter((t) => !t.cardio)
  const cardioTpl = miei.filter((t) => t.cardio)
  const [apriRs, setApriRs] = useState(true)
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

      {/* Il peso si chiede qui, prima di cominciare: a seduta finita te ne sei
          dimenticato, e quel giorno resta senza il dato che regge i confronti. */}
      <PesoOggi dentro="seduta" />

      {/* Sempre visibile: anche con una sola palestra devi poterla vedere, rilevarla o aggiungerne altre. */}
      {gyms.length > 0 && (
        <div className="card">
          <div className="row spread">
            <label className="fl">Palestra</label>
            {gyms.some((g) => g.lat != null) && isGeoSupported() && (
              <button className="chip" disabled={locating} onClick={async () => {
                setLocating(true); setGeoMsg(null)
                try {
                  const me = await getPosition()
                  const withPos = gyms.filter((g) => g.lat != null && g.lng != null)
                  const nearest = withPos
                    .map((g) => ({ g, d: distanceMeters(me, { lat: g.lat!, lng: g.lng! }) }))
                    .sort((a, b) => a.d - b.d)[0]
                  if (nearest) { await setDefaultGym(nearest.g.id); setGeoMsg(`${nearest.g.name} · ${fmtDistance(nearest.d)}`) }
                } catch (e) { setGeoMsg((e as Error).message) } finally { setLocating(false) }
              }}>{locating ? 'Rilevo…' : '📍 Rileva'}</button>
            )}
          </div>
          {gyms.length > 1 ? (
            <select value={defaultGym?.id ?? ''} onChange={(e) => setDefaultGym(e.target.value)}>
              {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <div className="row spread" style={{ alignItems: 'center' }}>
              <span>{defaultGym?.name}{defaultGym?.lat != null && <span className="muted small"> · 📍</span>}</span>
              <button className="chip" onClick={async () => {
                const n = prompt('Nome della nuova palestra')?.trim()
                if (n) await addGym(n)
              }}>＋ Altra palestra</button>
            </div>
          )}
          {geoMsg && <p className="muted small" style={{ marginTop: 6 }}>{geoMsg}</p>}
          {gyms.length === 1 && defaultGym?.lat == null && isGeoSupported() && (
            <p className="muted small" style={{ marginTop: 6 }}>
              Per il rilevamento automatico salva la posizione in Profilo → 🏋️ Palestra.
            </p>
          )}
        </div>
      )}

      {/* Due elenchi separati, non una fila sola: i tuoi template e quelli del
          coach non si mescolano, cosi' sai sempre da dove stai partendo. */}
      {rsTemplates.length > 0 && (
        <>
          <button className="row spread" onClick={() => setApriRs((v) => !v)}
            style={{ marginTop: 8, width: '100%', background: 'none', border: 'none', padding: 0 }}>
            <span style={{ ...SECTION, color: 'var(--rs)' }}>🦠 RS · dal coach</span>
            <span className="muted small">{apriRs ? '▾' : `${rsTemplates.length} ›`}</span>
          </button>
          {apriRs && (
            <div className="col" style={{ gap: 8 }}>
              {rsTemplates.map((t) => (
                <div key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--rs)', borderRadius: 12, padding: '10px 12px' }}>
                  <button className="ghost" onClick={() => onTemplate(t.id)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', padding: 0, background: 'none' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: '#2a0e0c', color: 'var(--rs)', display: 'grid', placeItems: 'center', flex: 'none' }}>▶</span>
                    <span>
                      <span style={{ display: 'block', fontSize: 14 }}>{t.name}</span>
                      <span className="muted small">{t.items.length} esercizi · protocollo</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
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
            // Bordo oro come i suoi sono rossi: si distinguono a colpo d'occhio
            // e si assomigliano nella forma, perche' fanno la stessa cosa.
            <div key={t.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 12, padding: '10px 12px' }}>
              <button className="ghost" onClick={() => onTemplate(t.id)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', padding: 0, background: 'none' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: '#20200f', color: 'var(--gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>▶</span>
                <span>
                  <span style={{ display: 'block', fontSize: 14 }}>{t.name}</span>
                  <span className="muted small">{t.items.length} esercizi</span>
                </span>
              </button>
              {/* Lo spostamento nel cardio si fa da qui, dove il problema si
                  vede: l'interruttore stava dentro l'editor della scheda, e una
                  scheda di corsa restava in mezzo agli allenamenti finche' non
                  andavi a cercarlo. */}
              <button className="ghost small" aria-label={`Sposta ${t.name} in Solo cardio`}
                onClick={() => updateTemplate(t.id, { cardio: true })}>♥</button>
              <button className="ghost small" onClick={() => setEditId(t.id)}>✎</button>
              <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${t.name}?`)) deleteWithUndo(`Scheda "${t.name}" eliminata`, () => deleteTemplate(t.id)) }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Il cardio sta per conto suo: una corsa non e' un allenamento coi pesi,
          e vederla in mezzo alle schede fa solo confusione quando scegli. */}
      {cardioTpl.length > 0 && (
        <>
          <span style={{ ...SECTION, marginTop: 12 }}>Solo cardio</span>
          <div className="col" style={{ gap: 8 }}>
            {cardioTpl.map((t) => (
              <div key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 12, padding: '10px 12px' }}>
                <button className="ghost" onClick={() => onTemplate(t.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', padding: 0, background: 'none' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: '#20200f', color: 'var(--gold)', display: 'grid', placeItems: 'center', flex: 'none' }}>♥</span>
                  <span>
                    <span style={{ display: 'block', fontSize: 14 }}>{t.name}</span>
                    <span className="muted small">solo cardio</span>
                  </span>
                </button>
                <button className="ghost small" aria-label={`Riporta ${t.name} fra gli allenamenti`}
                  onClick={() => updateTemplate(t.id, { cardio: false })}>⤴</button>
                <button className="ghost small" onClick={() => setEditId(t.id)}>✎</button>
                <button className="ghost small" onClick={() => { if (confirm(`Eliminare ${t.name}?`)) deleteWithUndo(`Scheda "${t.name}" eliminata`, () => deleteTemplate(t.id)) }}>✕</button>
              </div>
            ))}
          </div>
        </>
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

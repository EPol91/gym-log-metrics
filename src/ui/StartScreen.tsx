import { useState } from 'react'
import { deleteWithUndo } from '../db/trash'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTemplates, deleteTemplate, listGyms, setDefaultGym, addGym, updateTemplate } from '../db/repo'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { cicloRs } from '../rs/cicloSedute'
import { SEDUTE_RS } from '../rs/protocollo'
import { nomeScheda } from '../scores/confronto'
import { fmtData } from '../util/format'
import { TemplateEditor } from './TemplateEditor'
import { SchedaVista } from './SchedaVista'
import { getPosition, distanceMeters, fmtDistance, isGeoSupported } from '../util/geo'
import { PesoOggi } from './PesoOggi'
import type { WorkoutTemplate, WorkoutType } from '../db/schema'

const TYPES: { key: WorkoutType; label: string }[] = [
  { key: 'push', label: 'Push' }, { key: 'pull', label: 'Pull' }, { key: 'legs', label: 'Legs' },
  { key: 'upper', label: 'Upper' }, { key: 'lower', label: 'Lower' }, { key: 'fullbody', label: 'Full body' },
  { key: 'brosplit', label: 'Bro split' }, { key: 'custom', label: 'Libera' },
]
const ggmm = (iso: string) => fmtData(iso).slice(0, 5)

/** Quando hai fatto l'ultima volta ogni scheda. */
async function ultimeVolte(): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (const s of await db.sessions.where('userId').equals(LOCAL_USER_ID).toArray()) {
    if (!s.finishedAt || !s.srcTemplateId) continue
    if (!m.has(s.srcTemplateId) || m.get(s.srcTemplateId)! < s.date) m.set(s.srcTemplateId, s.date)
  }
  return m
}

/**
 * Nuova seduta: tocchi la scheda e parti (poi il check di prontezza). In cima
 * quella che tocca nel ciclo; l'anteprima 👁 sta sulla riga, il resto nel «⋯».
 */
export function StartScreen({
  onNext, onTemplate, onCancel,
}: {
  onNext: (t: WorkoutType) => void
  onTemplate: (templateId: string) => void
  onCancel?: () => void
}) {
  const [editId, setEditId] = useState<string | 'new' | null>(null)
  // La scheda aperta in sola lettura: guardarla non fa partire niente.
  const [vedi, setVedi] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoMsg, setGeoMsg] = useState<string | null>(null)
  const tutti = useLiveQuery(listTemplates, []) ?? []
  const ultime = useLiveQuery(ultimeVolte, []) ?? new Map<string, string>()
  const ciclo = useLiveQuery(() => cicloRs(), [])
  const gyms = useLiveQuery(listGyms, []) ?? []
  const defaultGym = gyms.find((g) => g.isDefault) ?? gyms[0]

  if (editId) return <TemplateEditor templateId={editId === 'new' ? null : editId} onBack={() => setEditId(null)} />

  // I suoi D1…D5 nell'ordine della scheda, poi le tue; il cardio a parte.
  const tocca = SEDUTE_RS.find((s) => s.codice === ciclo?.prossima)?.nome
  const delCoach = tutti.filter((t) => t.name.startsWith('🦠')).sort((a, b) => a.name.localeCompare(b.name, 'it'))
  const mie = tutti.filter((t) => !t.name.startsWith('🦠') && !t.cardio)
  const cardio = tutti.filter((t) => !t.name.startsWith('🦠') && t.cardio)
  const schede = [...delCoach, ...mie].sort((a, b) => Number(b.name === tocca) - Number(a.name === tocca))

  const elimina = (t: WorkoutTemplate) => { if (confirm(`Eliminare ${t.name}?`)) deleteWithUndo(`Scheda "${t.name}" eliminata`, () => deleteTemplate(t.id)) }

  const riga = (t: WorkoutTemplate, tipo: 'scheda' | 'cardio') => {
    const ora = t.name === tocca
    const sotto = [ora && 'tocca a te', !t.name.startsWith('🦠') && tipo === 'scheda' && 'tua', tipo === 'cardio' ? 'solo cardio' : `${t.items.length} esercizi`, ultime.get(t.id) && `ultima ${ggmm(ultime.get(t.id)!)}`].filter(Boolean).join(' · ')
    return (
      <div key={t.id}>
        <div className="riga-s" style={ora ? { background: '#17150f' } : undefined}>
          <button className="play-a" style={{ ...(ora ? { background: 'var(--gold)', color: '#1a1405' } : {}), ...(tipo === 'cardio' ? { color: 'var(--cardio)', background: 'var(--cardio-bg)' } : {}) }}
            aria-label={`Inizia ${t.name}`} onClick={() => onTemplate(t.id)}>{tipo === 'cardio' ? '♥' : '▶'}</button>
          <button className="nome-a" onClick={() => onTemplate(t.id)}>
            <b style={{ color: ora ? 'var(--gold)' : undefined }}>{nomeScheda(t.name)}</b>
            <span className="sotto">{sotto}</span>
          </button>
          {tipo === 'scheda' && <button className="icona-a" aria-label={`Vedi ${t.name}`} onClick={() => setVedi(t.id)}>👁</button>}
          <button className="icona-a senza" aria-label={`Altro su ${t.name}`} onClick={() => setMenu(menu === t.id ? null : t.id)}>⋯</button>
        </div>
        {menu === t.id && (
          <div className="row" style={{ gap: 6, padding: '0 12px 10px', flexWrap: 'wrap', background: ora ? '#17150f' : undefined }}>
            <button className="chip" onClick={() => { setMenu(null); setEditId(t.id) }}>✎ Modifica</button>
            {/* Lo spostamento nel cardio si fa da qui, dove il problema si vede. */}
            {!t.name.startsWith('🦠') && (tipo === 'scheda'
              ? <button className="chip" onClick={() => { setMenu(null); void updateTemplate(t.id, { cardio: true }) }}>♥ Sposta in solo cardio</button>
              : <button className="chip" onClick={() => { setMenu(null); void updateTemplate(t.id, { cardio: false }) }}>⤴ Riporta fra le schede</button>)}
            {!t.name.startsWith('🦠') && <button className="chip" style={{ color: '#e57373' }} onClick={() => { setMenu(null); elimina(t) }}>✕ Elimina</button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="barra-s">
        {onCancel ? <button className="ind" aria-label="Chiudi" style={{ width: 40 }} onClick={onCancel}>✕</button> : <span style={{ width: 40 }} />}
        <span className="tit">Nuova seduta</span>
        <span style={{ width: 40 }} />
      </div>

      {/* Il peso si chiede qui, prima di cominciare: a seduta finita te ne sei
          dimenticato, e quel giorno resta senza il dato che regge i confronti. */}
      <PesoOggi dentro="seduta" />

      {/* La palestra in una riga: si cambia, si rileva, se ne aggiunge una. */}
      {gyms.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <select className="pill-select" value={defaultGym?.id ?? ''} aria-label="Palestra"
            onChange={async (e) => {
              if (e.target.value === '__nuova') {
                const n = prompt('Nome della nuova palestra')?.trim()
                if (n) await addGym(n)
                return
              }
              await setDefaultGym(e.target.value)
            }}>
            {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__nuova">＋ Altra palestra…</option>
          </select>
          {gyms.some((g) => g.lat != null) && isGeoSupported() && (
            <button className="chip" disabled={locating} onClick={async () => {
              setLocating(true); setGeoMsg(null)
              try {
                const me = await getPosition()
                const nearest = gyms.filter((g) => g.lat != null && g.lng != null)
                  .map((g) => ({ g, d: distanceMeters(me, { lat: g.lat!, lng: g.lng! }) }))
                  .sort((a, b) => a.d - b.d)[0]
                if (nearest) { await setDefaultGym(nearest.g.id); setGeoMsg(`${nearest.g.name} · ${fmtDistance(nearest.d)}`) }
              } catch (e) { setGeoMsg((e as Error).message) } finally { setLocating(false) }
            }}>{locating ? 'Rilevo…' : '📍 Rileva'}</button>
          )}
          {geoMsg && <span className="muted small">{geoMsg}</span>}
        </div>
      )}

      <span className="etichetta-p" style={{ margin: '4px 0 -4px 4px' }}>Le tue schede</span>
      {schede.length === 0
        ? <p className="muted small">Nessuna scheda. Creane una o salvane una a fine allenamento.</p>
        : <div className="lista-p">{schede.map((t) => riga(t, 'scheda'))}</div>}
      <button className="ghost small" style={{ alignSelf: 'center', color: 'var(--gold)' }} onClick={() => setEditId('new')}>＋ Nuova scheda</button>

      {/* Il cardio sta per conto suo: una corsa non e' un allenamento coi pesi. */}
      {cardio.length > 0 && (
        <>
          <span className="etichetta-p" style={{ margin: '2px 0 -4px 4px', color: 'var(--cardio)' }}>Solo cardio</span>
          <div className="lista-p">{cardio.map((t) => riga(t, 'cardio'))}</div>
        </>
      )}

      <span className="etichetta-p" style={{ margin: '2px 0 -4px 4px' }}>Seduta libera</span>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map((t) => <button key={t.key} className="chip" onClick={() => onNext(t.key)}>{t.label}</button>)}
      </div>

      {/* La scheda guardata e basta. Se poi decidi di farla, «Inizia» e' li'. */}
      {vedi && (
        <SchedaVista templateId={vedi} onClose={() => setVedi(null)}
          onInizia={() => { const id = vedi; setVedi(null); onTemplate(id) }} />
      )}
    </div>
  )
}

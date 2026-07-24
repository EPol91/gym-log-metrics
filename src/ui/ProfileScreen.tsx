import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentPhase, setPhase, clearPhase, setPhaseStartDate, getUser, updateUser } from '../db/repo'
import { AiSettings } from './AiSettings'
import { BackupSettings } from './BackupSettings'
import { CsvImport } from './CsvImport'
import { GymSettings } from './GymSettings'
import { TemplatesSettings } from './TemplatesSettings'
import { parseNum } from '../util/validate'
import type { Phase } from '../db/schema'

const PHASES: { key: Phase; label: string; hint: string }[] = [
  { key: 'cut', label: 'Cut', hint: 'definizione' },
  { key: 'bulk', label: 'Bulk', hint: 'massa' },
  { key: 'recomp', label: 'Recomp', hint: 'ricomposizione' },
  { key: 'maintenance', label: 'Mant.', hint: 'mantenimento' },
]

// Sezione collassabile: riga con titolo + freccia, apre il contenuto al tap.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <div className="row spread"><span>{title}</span><span className="muted small">{open ? '▾' : '›'}</span></div>
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

export function ProfileScreen({ onEditTemplate, onNewTemplate }: { onEditTemplate: (id: string) => void; onNewTemplate: () => void }) {
  const phase = useLiveQuery(getCurrentPhase, [])
  const user = useLiveQuery(getUser, [])

  const target = user?.weeklyTarget ?? 4
  const restDefault = user?.restDefaultSec ?? 90
  const REST_PRESETS = [60, 90, 120, 150, 180]

  return (
    <div className="col">
      <h1>Profilo</h1>

      <div className="card">
        <label className="fl">Nome</label>
        <input defaultValue={user?.name ?? ''} onBlur={(e) => updateUser({ name: e.target.value })} />
      </div>

      <div className="card">
        <label className="fl">Fase di allenamento</label>
        <div className="grid2">
          {PHASES.map((p) => (
            <button
              key={p.key}
              className={phase?.phase === p.key ? 'sel' : ''}
              onClick={() => (phase?.phase === p.key ? clearPhase() : setPhase(p.key))}
            >
              {p.label} <span className="muted small">· {p.hint}</span>
            </button>
          ))}
        </div>
        {phase ? (
          <div style={{ marginTop: 10 }}>
            <label className="fl">In <strong style={{ color: 'var(--gold)' }}>{phase.phase}</strong> dal — correggi la data se sbagliata</label>
            <input type="date" defaultValue={phase.startDate} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { if (e.target.value) setPhaseStartDate(phase.id, e.target.value) }} style={{ maxWidth: 200 }} />
            <p className="muted small" style={{ marginTop: 4 }}>Alimenta il Performance Score.</p>
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 10 }}>Nessuna fase: il Performance resta “insufficiente”.</p>
        )}
      </div>

      <div className="card">
        <label className="fl">Obiettivo allenamenti / settimana</label>
        <div className="row">
          <button onClick={() => updateUser({ weeklyTarget: Math.max(1, target - 1) })}>−</button>
          <strong style={{ minWidth: 40, textAlign: 'center', fontSize: 20 }}>{target}</strong>
          <button onClick={() => updateUser({ weeklyTarget: Math.min(14, target + 1) })}>＋</button>
          <span className="muted small">alimenta il Consistency Score</span>
        </div>
      </div>

      <div className="card">
        <label className="fl">Recupero predefinito</label>
        <div className="opts" style={{ gridTemplateColumns: `repeat(${REST_PRESETS.length}, 1fr)` }}>
          {REST_PRESETS.map((s) => (
            <button key={s} className={restDefault === s ? 'sel' : ''} onClick={() => updateUser({ restDefaultSec: s })}>{s}s</button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>Durata iniziale del timer di recupero (modificabile durante il workout).</p>
      </div>

      <div className="card">
        <label className="fl">Dati cardio (per le zone)</label>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="fl">Anno di nascita</label>
            <input inputMode="numeric" defaultValue={user?.birthYear ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 1920, max: 2020, int: true }); if (n != null) updateUser({ birthYear: n }) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="fl">FC a riposo (per HRR)</label>
            <input inputMode="numeric" defaultValue={user?.restingHr ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 30, max: 120, int: true }); if (n != null) updateUser({ restingHr: n }) }} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="fl">Sesso (per le calorie)</label>
            <div className="row">
              <button className={user?.sex === 'm' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'm' })}>Uomo</button>
              <button className={user?.sex === 'f' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'f' })}>Donna</button>
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="fl">Altezza (cm · FFMI)</label>
            <input inputMode="numeric" defaultValue={user?.heightCm ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ heightCm: n }) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="fl">FCmax misurata (opz.)</label>
            <input inputMode="numeric" defaultValue={user?.hrMaxMeasured ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ hrMaxMeasured: n }) }} />
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>FCmax misurata: se la conosci (da test reale) le zone la usano al posto di 220−età. Opzionale.</p>
      </div>

      <div className="card">
        <label className="fl">Target giornalieri (opz.)</label>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="fl">Acqua (L)</label>
            <input inputMode="decimal" defaultValue={user?.waterTarget ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 0, max: 15 }); if (n != null) updateUser({ waterTarget: n }) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="fl">Sale (g)</label>
            <input inputMode="decimal" defaultValue={user?.saltTarget ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 0, max: 50 }); if (n != null) updateUser({ saltTarget: n }) }} />
          </div>
        </div>
      </div>

      <div className="muted small" style={{ marginTop: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Avanzate</div>
      <Section title="⭐ Template di allenamento"><TemplatesSettings onEdit={onEditTemplate} onNew={onNewTemplate} /></Section>
      <Section title="🏋️ Palestra"><GymSettings /></Section>
      <Section title="🤖 AI"><AiSettings /></Section>
      <Section title="⬆️ Import CSV (Strong / Hevy)"><CsvImport /></Section>
      <Section title="💾 Backup dati"><BackupSettings /></Section>
    </div>
  )
}

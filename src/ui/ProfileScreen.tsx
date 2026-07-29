import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentPhase, setPhase, clearPhase, setPhaseStartDate, getUser, updateUser, listMeasurements } from '../db/repo'
import { ACTIVITY_LEVELS, BMR_FORMULAS, activityFactor, bmr } from '../scores/nutritionTargets'
import { AiSettings } from './AiSettings'
import { BackupSettings } from './BackupSettings'
import { CsvImport } from './CsvImport'
import { GymSettings } from './GymSettings'
import { WhoopSettings } from './WhoopSettings'
import { CoachSettings } from './CoachSettings'
import { TemplatesSettings } from './TemplatesSettings'
import { parseNum } from '../util/validate'
import { fmtRest } from '../util/format'
import type { Phase } from '../db/schema'

const PHASES: { key: Phase; label: string; hint: string }[] = [
  { key: 'cut', label: 'Cut', hint: 'definizione' },
  { key: 'bulk', label: 'Bulk', hint: 'massa' },
  { key: 'recomp', label: 'Recomp', hint: 'ricomposizione' },
  { key: 'maintenance', label: 'Mant.', hint: 'mantenimento' },
]

// Etichetta sezione: maiuscoletto tenue.
const SECTION: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }

// Sezione collassabile: riga con titolo + freccia, apre il contenuto al tap.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', margin: 0 }} onClick={() => setOpen((o) => !o)}>
        <div className="row spread"><span>{title}</span><span className="muted small">{open ? '▾' : '›'}</span></div>
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

/**
 * Metabolismo: livello di attività e formula del BMR.
 * Le tre formule sono mostrate con il loro risultato sui tuoi dati, così la
 * scelta si fa guardando i numeri e non il nome.
 */
function MetabolismCard() {
  const user = useLiveQuery(getUser, [])
  const meas = useLiveQuery(listMeasurements, []) ?? []
  const last = meas.length ? meas[meas.length - 1] : null

  const formula = user?.bmrFormula ?? 'mifflin'
  const level = user?.activityLevel
  const factor = activityFactor(user?.weeklyTarget ?? 4, level)

  const base = last && user?.heightCm && user?.birthYear
    ? {
      weightKg: last.weight, heightCm: user.heightCm,
      age: new Date().getFullYear() - user.birthYear,
      sex: user.sex ?? 'm' as const, bodyFatPct: last.bodyFat,
    }
    : null

  return (
    <div className="card">
      <label className="fl">Livello di attività</label>
      <div className="col" style={{ gap: 5 }}>
        {ACTIVITY_LEVELS.map((a) => (
          <button key={a.key} className={level === a.key ? 'sel' : ''} style={{ textAlign: 'left', padding: '9px 12px' }}
            onClick={() => updateUser({ activityLevel: level === a.key ? undefined : a.key })}>
            <span className="row spread">
              <span>{a.name} <span className="muted small">· {a.note}</span></span>
              <span className="muted small" style={{ flex: 'none' }}>×{a.factor}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {level
          ? `Fattore in uso: ×${factor}.`
          : `Non impostato: dedotto dalle tue ${user?.weeklyTarget ?? 4} sedute a settimana (×${factor}). Tocca un livello per decidere tu.`}
      </p>

      <label className="fl" style={{ marginTop: 14 }}>Formula del metabolismo basale</label>
      <div className="col" style={{ gap: 5 }}>
        {BMR_FORMULAS.map((f) => {
          const v = base ? bmr(base, f.key) : null
          const off = base && v == null
          return (
            <button key={f.key} className={formula === f.key ? 'sel' : ''} disabled={!!off}
              style={{ textAlign: 'left', padding: '9px 12px' }}
              onClick={() => updateUser({ bmrFormula: f.key })}>
              <span className="row spread">
                <span>{f.name}</span>
                <span className="small" style={{ flex: 'none', color: v != null ? 'var(--gold)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {v != null ? `${Math.round(v)} kcal` : off ? 'serve % grasso' : '—'}
                </span>
              </span>
              <span className="muted small">{f.note}</span>
            </button>
          )
        })}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {base
          ? `Metabolismo basale su peso ${last!.weight} kg${last!.bodyFat != null ? ` e ${last!.bodyFat}% grasso` : ''}. Il fabbisogno giornaliero è questo valore × ${factor}.`
          : 'Servono peso, altezza e anno di nascita per confrontare le formule.'}
      </p>
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

      <span style={SECTION}>Tu</span>
      <div className="card" style={{ marginTop: 0 }}>
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

      {/* All./sett. + Recupero affiancati */}
      <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <label className="fl">All. / sett.</label>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button onClick={() => updateUser({ weeklyTarget: Math.max(1, target - 1) })}>−</button>
            <strong style={{ fontSize: 20 }}>{target}</strong>
            <button onClick={() => updateUser({ weeklyTarget: Math.min(14, target + 1) })}>＋</button>
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>alimenta il Consistency</p>
        </div>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <label className="fl">Recupero</label>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {REST_PRESETS.map((s) => (
              <button key={s} className={restDefault === s ? 'chip on' : 'chip'} onClick={() => updateUser({ restDefaultSec: s })}>{fmtRest(s)}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <label className="fl">Dati cardio &amp; corpo</label>
        <div className="grid2" style={{ gap: 8 }}>
          <div>
            <label className="fl">Anno di nascita</label>
            <input inputMode="numeric" defaultValue={user?.birthYear ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 1920, max: 2020, int: true }); if (n != null) updateUser({ birthYear: n }) }} />
          </div>
          <div>
            <label className="fl">FC riposo (HRR)</label>
            <input inputMode="numeric" defaultValue={user?.restingHr ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 30, max: 120, int: true }); if (n != null) updateUser({ restingHr: n }) }} />
          </div>
          <div>
            <label className="fl">Altezza (cm · FFMI)</label>
            <input inputMode="numeric" defaultValue={user?.heightCm ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ heightCm: n }) }} />
          </div>
          <div>
            <label className="fl">FCmax mis. (opz.)</label>
            <input inputMode="numeric" defaultValue={user?.hrMaxMeasured ?? ''}
              onBlur={(e) => { const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ hrMaxMeasured: n }) }} />
          </div>
        </div>
        <label className="fl" style={{ marginTop: 8 }}>Sesso (per le calorie)</label>
        <div className="row">
          <button className={user?.sex === 'm' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'm' })}>Uomo</button>
          <button className={user?.sex === 'f' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'f' })}>Donna</button>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>FCmax misurata: se la conosci le zone la usano al posto di 220−età. Opzionale.</p>
      </div>

      <MetabolismCard />


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

      <span style={{ ...SECTION, marginTop: 6 }}>Avanzate</span>
      <div className="col" style={{ gap: 7 }}>
        <Section title="⭐ Template di allenamento"><TemplatesSettings onEdit={onEditTemplate} onNew={onNewTemplate} /></Section>
        <Section title="🏋️ Palestra"><GymSettings /></Section>
        <Section title="⌚ WHOOP"><WhoopSettings /></Section>
        <Section title="💡 Coach"><CoachSettings /></Section>
        <Section title="🤖 AI"><AiSettings /></Section>
        <Section title="⬆️ Import CSV (Strong / Hevy)"><CsvImport /></Section>
        <Section title="💾 Backup dati"><BackupSettings /></Section>
      </div>
    </div>
  )
}

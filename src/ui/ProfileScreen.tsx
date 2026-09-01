import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentPhase, setPhase, clearPhase, setPhaseStartDate, getUser, updateUser, listMeasurements } from '../db/repo'
import { ACTIVITY_LEVELS, BMR_FORMULAS, activityFactor, bmr } from '../scores/nutritionTargets'
import { restingHrFromWhoop } from '../db/whoop'
import { AiSettings } from './AiSettings'
import { BackupSettings } from './BackupSettings'
import { CsvImport } from './CsvImport'
import { GymSettings } from './GymSettings'
import { SuoniSettings } from './SuoniSettings'
import { WhoopSettings } from './WhoopSettings'
import { CoachSettings } from './CoachSettings'
import { TemplatesSettings } from './TemplatesSettings'
import { parseNum } from '../util/validate'
import { fmtRest, fmtData } from '../util/format'
import { todayLocal } from '../util/date'
import { cicloDi } from '../scores/consistency'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import type { Phase } from '../db/schema'

const PHASES: { key: Phase; label: string; hint: string }[] = [
  { key: 'cut', label: 'Cut', hint: 'definizione' },
  { key: 'bulk', label: 'Bulk', hint: 'massa' },
  { key: 'recomp', label: 'Recomp', hint: 'ricomposizione' },
  { key: 'maintenance', label: 'Mant.', hint: 'mantenimento' },
]

// Etichetta sezione: maiuscoletto tenue.
const SECTION: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }

/**
 * Sezione a tendina: riga con titolo, il valore di adesso, e il contenuto al tap.
 *
 * Il valore a destra e' quello che rende la tendina accettabile: chiuse, le
 * righe dicono gia' come sei messo — «Cut · dal 15.06.2026», «5 ogni 8 giorni» —
 * e si apre solo quello che si vuole cambiare, invece di scorrere sette card
 * alte mezzo schermo per leggere quattro numeri.
 */
function Section({ title, valore, children }: { title: string; valore?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', margin: 0 }} onClick={() => setOpen((o) => !o)}>
        <div className="row spread" style={{ alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 'none' }}>{title}</span>
          <span className="row" style={{ gap: 8, minWidth: 0, justifyContent: 'flex-end' }}>
            {!open && valore != null && (
              <span className="muted small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {valore}
              </span>
            )}
            <span className="muted small" style={{ flex: 'none' }}>{open ? '▾' : '›'}</span>
          </span>
        </div>
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

  const fcWhoop = useLiveQuery(() => restingHrFromWhoop(), [])
  const restDefault = user?.restDefaultSec ?? 90
  const REST_PRESETS = [60, 90, 120, 150, 180]

  return (
    <div className="col">
      <h1>Profilo</h1>

      <span style={SECTION}>Tu</span>
      <div className="col" style={{ gap: 7 }}>
      <Section title="Nome" valore={user?.name || '—'}>
      <div className="card" style={{ marginTop: 0 }}>
        <label className="fl">Nome</label>
        <input defaultValue={user?.name ?? ''} onBlur={(e) => updateUser({ name: e.target.value })} />
      </div>
      </Section>

      <Section title="Fase" valore={phase ? `${phase.phase} · dal ${fmtData(phase.startDate)}` : 'nessuna'}>
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
      </Section>

      {/* L'obiettivo di allenamento e' un CICLO, non una settimana: 5 sedute
          ogni 8 giorni non stanno in sette caselle, e giudicate a settimane
          danno 5 e poi 4 — il Consistency ti bocciava mentre facevi tutto. */}
      <Section title="Obiettivo" valore={`${user?.cicloSedute ?? 5} ogni ${user?.cicloGiorni ?? 8} giorni`}>
        <CicloAllenamento
          sedute={user?.cicloSedute ?? 5}
          giorni={user?.cicloGiorni ?? 8}
          inizio={user?.cicloInizio ?? null}
        />
      </Section>

      <Section title="Recupero" valore={fmtRest(restDefault)}>
      <div className="card">
        <label className="fl">Recupero di default</label>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {REST_PRESETS.map((s) => (
            <button key={s} className={restDefault === s ? 'chip on' : 'chip'} onClick={() => updateUser({ restDefaultSec: s })}>{fmtRest(s)}</button>
          ))}
        </div>
      </div>
      </Section>

      <Section title="Cardio e corpo"
        valore={[user?.birthYear && `${new Date().getFullYear() - user.birthYear} anni`, user?.heightCm && `${user.heightCm} cm`]
          .filter(Boolean).join(' · ') || 'da compilare'}>
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
            {fcWhoop != null && (
              <p className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                In uso: <strong style={{ color: 'var(--gold)' }}>{fcWhoop}</strong> dalla media WHOOP
              </p>
            )}
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
      </Section>

      <Section title="Metabolismo"
        valore={ACTIVITY_LEVELS.find((a) => a.key === user?.activityLevel)?.name ?? 'dedotto'}>
        <MetabolismCard />
      </Section>

      <Section title="Acqua e sale"
        valore={[user?.waterTarget && `${user.waterTarget} L`, user?.saltTarget && `${user.saltTarget} g`]
          .filter(Boolean).join(' · ') || 'non impostati'}>
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
      </Section>
      </div>

      <span style={{ ...SECTION, marginTop: 6 }}>Avanzate</span>
      <div className="col" style={{ gap: 7 }}>
        <Section title="⭐ Template di allenamento"><TemplatesSettings onEdit={onEditTemplate} onNew={onNewTemplate} /></Section>
        <Section title="🏋️ Palestra"><GymSettings /></Section>
        <Section title="🔔 Suoni dei timer"><SuoniSettings /></Section>
        <Section title="⌚ WHOOP"><WhoopSettings /></Section>
        <Section title="💡 Coach"><CoachSettings /></Section>
        <Section title="🤖 AI"><AiSettings /></Section>
        <Section title="⬆️ Import CSV (Strong / Hevy)"><CsvImport /></Section>
        <Section title="💾 Backup dati"><BackupSettings /></Section>
      </div>
    </div>
  )
}

/**
 * L'obiettivo di allenamento, nella forma in cui ti alleni davvero: N sedute
 * ogni M giorni, da una data che scegli tu.
 *
 * La data serve a dare confini fissi ai cicli: senza un'ancora scivolerebbero a
 * ogni ricalcolo e "giorno 6 di 8" non vorrebbe dire niente. Chi si allena a
 * settimane mette 4 su 7 e non cambia nulla per lui.
 */
function CicloAllenamento({ sedute, giorni, inizio }: { sedute: number; giorni: number; inizio: string | null }) {
  const oggi = todayLocal()
  // Se non hai scelto una data, i cicli si contano dalla tua prima seduta: e'
  // l'unica ancora che esiste davvero, e senza saresti sempre al "giorno 1".
  const primaSeduta = useLiveQuery(async () => {
    const s = await db.sessions.where('userId').equals(LOCAL_USER_ID).toArray()
    return s.map((x) => x.date).sort()[0] ?? null
  }, [])
  const ancora = inizio ?? primaSeduta ?? oggi
  const giornoDelCiclo = cicloDi(oggi, { sedute, giorni, inizio: ancora }).giorno

  // Le sedute a settimana restano il numero che alimenta fabbisogno e livello
  // di attivita': si tiene allineato al ciclo invece di farteli scrivere due volte.
  const salva = (patch: { cicloSedute?: number; cicloGiorni?: number; cicloInizio?: string }) => {
    const s = patch.cicloSedute ?? sedute
    const g = patch.cicloGiorni ?? giorni
    void updateUser({ ...patch, weeklyTarget: Math.max(1, Math.round((s / g) * 7)) })
  }

  const passo = (label: string, valore: number, min: number, max: number, campo: 'cicloSedute' | 'cicloGiorni') => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <label className="fl" style={{ display: 'block' }}>{label}</label>
      <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
        <button style={{ padding: '8px 0', flex: 1 }} onClick={() => salva({ [campo]: Math.max(min, valore - 1) })}>−</button>
        <strong style={{ fontSize: 20, minWidth: 28 }}>{valore}</strong>
        <button style={{ padding: '8px 0', flex: 1 }} onClick={() => salva({ [campo]: Math.min(max, valore + 1) })}>＋</button>
      </div>
    </div>
  )

  return (
    <div className="card">
      <label className="fl">Obiettivo allenamento</label>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        {passo('sedute', sedute, 1, 14, 'cicloSedute')}
        <span className="muted small" style={{ paddingBottom: 10 }}>ogni</span>
        {passo('giorni', giorni, 1, 30, 'cicloGiorni')}
      </div>

      <div className="row spread" style={{ marginTop: 12, alignItems: 'center', gap: 8 }}>
        <span className="muted small" style={{ flex: 'none' }}>Inizio del ciclo</span>
        <input type="date" value={ancora} style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => { if (e.target.value) salva({ cicloInizio: e.target.value }) }} />
      </div>

      <p className="muted small" style={{ marginTop: 8 }}>
        {sedute} sedute ogni {giorni} giorni · oggi sei al giorno {giornoDelCiclo} di {giorni}.{inizio ? '' : ' Cicli contati dalla tua prima seduta.'}
        Alimenta il Consistency Score.
      </p>
    </div>
  )
}

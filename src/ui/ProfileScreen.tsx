import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCurrentPhase, setPhase, clearPhase, setPhaseStartDate, getUser, updateUser, listMeasurements, listGyms, listTemplates } from '../db/repo'
import { ACTIVITY_LEVELS, BMR_FORMULAS, activityFactor, bmr } from '../scores/nutritionTargets'
import { restingHrFromWhoop, lastAutoSync } from '../db/whoop'
import { AiSettings } from './AiSettings'
import { BackupSettings } from './BackupSettings'
import { CsvImport } from './CsvImport'
import { GymSettings } from './GymSettings'
import { SuoniSettings } from './SuoniSettings'
import { WhoopSettings } from './WhoopSettings'
import { CoachSettings } from './CoachSettings'
import { NotificheSettings, riassuntoNotifiche } from './NotificheSettings'
import { OrariSettings } from './OrariSettings'
import { orariDi } from '../tempo/orari'
import { TemplatesSettings } from './TemplatesSettings'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import { parseNum } from '../util/validate'
import { fmtRest, fmtData, fmtDataOra } from '../util/format'
import { todayLocal } from '../util/date'
import { cicloDi } from '../scores/consistency'
import { COACH_BLOCKS_DEFAULT } from '../scores/coach'
import { getApiKey } from '../ai/aiEngine'
import { ultimoBackup } from '../db/backupAuto'
import { sceltaCorrente } from '../util/suoni'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import type { Phase } from '../db/schema'

const PHASES: { key: Phase; label: string; hint: string }[] = [
  { key: 'cut', label: 'Cut', hint: 'definizione' },
  { key: 'bulk', label: 'Bulk', hint: 'massa' },
  { key: 'recomp', label: 'Recomp', hint: 'ricomposizione' },
  { key: 'maintenance', label: 'Mant.', hint: 'mantenimento' },
]
const NOMI_FASE: Record<string, string> = { cut: 'Cut', bulk: 'Bulk', recomp: 'Recomp', maintenance: 'Mantenimento' }
const nomeFase = (p: Phase) => NOMI_FASE[p] ?? p
const virgola = (n: number) => String(n).replace('.', ',')
const ggmm = (iso: string) => fmtData(iso).slice(0, 5)
// Col punto anche sotto i 10.000: in italiano «2744» non lo prenderebbe.
const migliaia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

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
          ? `Metabolismo basale su peso ${last!.weight} kg${last!.bodyFat != null ? ` e ${last!.bodyFat}% grasso` : ''}.`
          : 'Servono peso, altezza e anno di nascita per confrontare le formule.'}
      </p>

      {/* Il fabbisogno: la formula scelta per il fattore scelto, ricalcolato a ogni tocco. */}
      {(() => {
        const basale = base ? bmr(base, formula) : null
        if (basale == null) return null
        return (
          <div className="row spread" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #5a4a18', background: 'var(--gold-bg)', alignItems: 'baseline' }}>
            <span>
              Fabbisogno giornaliero
              <span className="muted small" style={{ display: 'block' }}>{Math.round(basale)} × {factor}</span>
            </span>
            <span style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 24, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(basale * factor)} <span style={{ fontSize: 13, fontFamily: 'var(--f-testo)', fontWeight: 500 }}>kcal</span>
            </span>
          </div>
        )
      })()}
    </div>
  )
}

type Voce =
  | 'dati' | 'fase' | 'metabolismo' | 'acqua'
  | 'obiettivo' | 'recupero' | 'schede' | 'palestre' | 'cuore' | 'suoni'
  | 'orari' | 'notifiche'
  | 'coach' | 'ai' | 'whoop'
  | 'backup' | 'csv'

// Le icone delle righe: tratti semplici, nel colore dell'oro.
const ICONE: Record<Voce, string> = {
  dati: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20c1-3.5 3.8-5 7-5s6 1.5 7 5',
  fase: 'M4 18 9 12l4 3 7-8M15 7h5v5',
  metabolismo: 'M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-6 2-8.5Z',
  acqua: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  obiettivo: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  recupero: 'M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM12 13V9.5M10 3h4',
  schede: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 9h6M9 13h6M9 17h3',
  palestre: 'M3 10h3v4H3zM18 10h3v4h-3zM6 8h2v8H6zM16 8h2v8h-2zM8 12h8',
  cuore: 'M3 12h4l2-5 3 10 2-5h7',
  suoni: 'M5 9a4 4 0 0 1 4-4M5 15a4 4 0 0 0 4 4M19 9a4 4 0 0 0-4-4M19 15a4 4 0 0 1-4 4M9 12h6',
  orari: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 7.5V12l3 2',
  notifiche: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15ZM10 20.5a2 2 0 0 0 4 0',
  coach: 'M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3ZM9.5 20.5h5',
  ai: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  whoop: 'M11 3h2a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM10 9h4M10 13h4',
  backup: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3ZM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  csv: 'M12 15V4M8 8l4-4 4 4M5 14v5h14v-5',
}

const TITOLI: Record<Voce, string> = {
  dati: 'Dati personali', fase: 'Fase', metabolismo: 'Metabolismo', acqua: 'Acqua e sale',
  obiettivo: 'Obiettivo', recupero: 'Recupero predefinito', schede: 'Schede', palestre: 'Palestre', cuore: 'Cuore e zone', suoni: 'Suoni dei timer',
  orari: 'I tuoi orari', notifiche: 'Notifiche',
  coach: 'Righe del Coach', ai: 'AI', whoop: 'WHOOP',
  backup: 'Backup e invio', csv: 'Importa da Strong / Hevy',
}

const GRUPPI: { nome: string; voci: Voce[] }[] = [
  { nome: 'Tu', voci: ['fase', 'metabolismo', 'acqua'] },
  { nome: 'Allenamento', voci: ['obiettivo', 'recupero', 'schede', 'palestre', 'cuore', 'suoni'] },
  { nome: 'Giornata', voci: ['orari', 'notifiche'] },
  { nome: 'Coach e collegamenti', voci: ['coach', 'ai', 'whoop'] },
  { nome: 'Dati', voci: ['backup', 'csv'] },
]

function Icona({ voce }: { voce: Voce }) {
  return (
    <span className="ic-p">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONE[voce]} /></svg>
    </span>
  )
}

/**
 * Una voce aperta: a tutto schermo, sopra la pagina, con «‹ Profilo». Si chiude
 * anche col tasto indietro del telefono. Sta nel body (portale): dentro .app, che
 * e' trasformato, un fixed non si ancorerebbe allo schermo.
 */
function Foglio({ titolo, onClose, children }: { titolo: string; onClose: () => void; children: React.ReactNode }) {
  useIndietro(onClose)
  useBloccoScroll()
  return createPortal(
    <div className="foglio-p slide-up" role="dialog" aria-label={titolo}>
      <div className="foglio-p-barra">
        <button className="foglio-p-indietro" onClick={onClose}>‹ Profilo</button>
        <span className="foglio-p-titolo">{titolo}</span>
        <span style={{ width: 86, flex: 'none' }} />
      </div>
      <div className="foglio-p-corpo">{children}</div>
    </div>,
    document.body,
  )
}

/**
 * Profilo: chi sei in testata, poi le impostazioni in cinque gruppi per scopo.
 *
 * Ogni riga dice gia' il valore di adesso, cosi' per leggere non si apre niente;
 * il tocco apre la voce in un foglio a tutto schermo, invece delle tendine che
 * allungavano la pagina a ogni apertura.
 */
export function ProfileScreen({ onEditTemplate, onNewTemplate }: { onEditTemplate: (id: string) => void; onNewTemplate: () => void }) {
  const phase = useLiveQuery(getCurrentPhase, [])
  const user = useLiveQuery(getUser, [])
  const misure = useLiveQuery(listMeasurements, []) ?? []
  const palestre = useLiveQuery(listGyms, []) ?? []
  const schede = useLiveQuery(listTemplates, []) ?? []
  const ultimoWhoop = useLiveQuery(async () => (await db.whoopDays.where('userId').equals(LOCAL_USER_ID).toArray()).map((d) => d.date).sort().pop() ?? null, [])
  const fcWhoop = useLiveQuery(() => restingHrFromWhoop(), [])
  const [aperta, setAperta] = useState<Voce | null>(null)

  const ultima = misure.length ? misure[misure.length - 1] : null
  const eta = user?.birthYear ? new Date().getFullYear() - user.birthYear : null
  const restDefault = user?.restDefaultSec ?? 90
  const REST_PRESETS = [60, 90, 120, 150, 180]

  // Il fabbisogno, come lo calcola la voce Metabolismo.
  const fattore = activityFactor(user?.weeklyTarget ?? 4, user?.activityLevel)
  const basale = ultima && user?.heightCm && eta != null
    ? bmr({ weightKg: ultima.weight, heightCm: user.heightCm, age: eta, sex: user.sex ?? 'm', bodyFatPct: ultima.bodyFat }, user.bmrFormula ?? 'mifflin')
    : null
  const livello = ACTIVITY_LEVELS.find((a) => a.key === user?.activityLevel)?.name.toLowerCase() ?? 'dedotto'

  const sync = lastAutoSync()
  const backup = ultimoBackup()
  const suoni = sceltaCorrente()
  const delCoach = schede.filter((t) => t.name.trimStart().startsWith('🦠')).length
  const predefinita = palestre.find((g) => g.isDefault) ?? palestre[0]
  const orari = orariDi(user)

  const valori: Record<Voce, { testo: string; oro?: boolean }> = {
    dati: { testo: user?.name || '—' },
    fase: { testo: phase ? `${nomeFase(phase.phase)} · dal ${ggmm(phase.startDate)}` : 'nessuna', oro: !!phase },
    metabolismo: { testo: basale != null ? `${livello} · ${migliaia(basale * fattore)} kcal` : livello },
    acqua: { testo: [user?.waterTarget && `${virgola(user.waterTarget)} L`, user?.saltTarget && `${virgola(user.saltTarget)} g`].filter(Boolean).join(' · ') || 'non impostati' },
    obiettivo: { testo: `${user?.cicloSedute ?? 5} sedute ogni ${user?.cicloGiorni ?? 8} giorni` },
    recupero: { testo: fmtRest(restDefault) },
    schede: { testo: delCoach ? `${schede.length} · ${delCoach} del coach` : String(schede.length) },
    palestre: { testo: predefinita?.name ?? 'nessuna' },
    cuore: { testo: `riposo ${fcWhoop ?? user?.restingHr ?? '—'} · max ${user?.hrMaxMeasured ?? (eta ? 220 - eta : '—')}` },
    suoni: { testo: `${suoni.suono.nome.toLowerCase()} · ${suoni.volume}%` },
    orari: { testo: orari.lavoro ? `lavoro ${orari.lavoro.entrata}–${orari.lavoro.uscita} · ${orari.pasti.length} pasti` : `${orari.pasti.length} pasti` },
    notifiche: { testo: riassuntoNotifiche(), oro: true },
    coach: { testo: `${(user?.coachBlocks ?? COACH_BLOCKS_DEFAULT).length} blocchi accesi` },
    ai: { testo: getApiKey() ? 'Claude · collegata' : 'non collegata' },
    whoop: { testo: sync ? `sincronizzato ${fmtDataOra(sync).replace(fmtData(todayLocal()) + ' · ', 'oggi ')}` : ultimoWhoop ? `dati fino al ${ggmm(ultimoWhoop)}` : 'da collegare' },
    backup: { testo: backup ? `ultimo ${ggmm(backup.quando)}` : 'mai fatto' },
    csv: { testo: 'CSV' },
  }

  const contenuto: Record<Voce, () => React.ReactNode> = {
    dati: () => <DatiPersonali />,
    fase: () => <FaseCard />,
    metabolismo: () => <MetabolismCard />,
    acqua: () => <AcquaSale />,
    obiettivo: () => <CicloAllenamento sedute={user?.cicloSedute ?? 5} giorni={user?.cicloGiorni ?? 8} inizio={user?.cicloInizio ?? null} />,
    recupero: () => (
      <div className="card">
        <label className="fl">Recupero di default</label>
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {REST_PRESETS.map((x) => (
            <button key={x} className={restDefault === x ? 'chip on' : 'chip'} onClick={() => updateUser({ restDefaultSec: x })}>{fmtRest(x)}</button>
          ))}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Vale per gli esercizi che non hanno un recupero loro.</p>
      </div>
    ),
    schede: () => <TemplatesSettings onEdit={onEditTemplate} onNew={onNewTemplate} />,
    palestre: () => <GymSettings />,
    cuore: () => <CuoreZone fcWhoop={fcWhoop ?? null} />,
    suoni: () => <SuoniSettings />,
    orari: () => <OrariSettings />,
    notifiche: () => <NotificheSettings />,
    coach: () => <CoachSettings />,
    ai: () => <AiSettings />,
    whoop: () => <WhoopSettings />,
    backup: () => <BackupSettings />,
    csv: () => <CsvImport />,
  }

  return (
    <div className="col" style={{ gap: 0 }}>
      <h1 style={{ marginBottom: 12 }}>Profilo</h1>

      <button className="testa-p" onClick={() => setAperta('dati')}>
        <span className="avatar-p">{(user?.name || '?').trim().charAt(0).toUpperCase()}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 17 }}>{user?.name || 'Il tuo nome'}</span>
          <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
            {[eta && `${eta} anni`, user?.heightCm && `${user.heightCm} cm`, user?.sex && (user.sex === 'm' ? 'uomo' : 'donna')].filter(Boolean).join(' · ') || 'tocca per completare'}
          </span>
          <span className="row" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {phase && <span className="pill-p oro">{nomeFase(phase.phase)} · dal {ggmm(phase.startDate)}</span>}
            {ultima && <span className="pill-p"><b className="num">{virgola(ultima.weight)}</b> kg · {ggmm(ultima.date)}</span>}
          </span>
        </span>
        <span className="muted" style={{ fontSize: 18, flex: 'none' }}>›</span>
      </button>

      {GRUPPI.map((g) => (
        <div key={g.nome} style={{ marginTop: 16 }}>
          <div className="etichetta-p" style={{ margin: '0 0 6px 4px' }}>{g.nome}</div>
          <div className="lista-p">
            {g.voci.map((v) => (
              <button key={v} className="voce-p" onClick={() => setAperta(v)}>
                <Icona voce={v} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{TITOLI[v]}</span>
                <span className={valori[v].oro ? 'valore-p oro' : 'valore-p'}>{valori[v].testo}</span>
                <span className="muted" style={{ fontSize: 17, flex: 'none' }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '16px 0 0' }}>ETP Health · versione {__VERSIONE__}</p>

      {aperta && (
        <Foglio titolo={TITOLI[aperta]} onClose={() => setAperta(null)}>
          {contenuto[aperta]()}
        </Foglio>
      )}
    </div>
  )
}

/** Nome, anno, sesso e altezza: quello che serve a calorie, FFMI e zone. */
function DatiPersonali() {
  const user = useLiveQuery(getUser, [])
  if (!user) return null
  return (
    <div className="card">
      <label className="fl">Nome</label>
      <input defaultValue={user.name ?? ''} onBlur={(e) => updateUser({ name: e.target.value })} />
      <div className="grid2" style={{ gap: 8, marginTop: 10 }}>
        <div>
          <label className="fl">Anno di nascita</label>
          <input inputMode="numeric" defaultValue={user.birthYear ?? ''}
            onBlur={(e) => { const n = parseNum(e.target.value, { min: 1920, max: 2020, int: true }); if (n != null) updateUser({ birthYear: n }) }} />
        </div>
        <div>
          <label className="fl">Altezza (cm)</label>
          <input inputMode="numeric" defaultValue={user.heightCm ?? ''}
            onBlur={(e) => { const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ heightCm: n }) }} />
        </div>
      </div>
      <label className="fl" style={{ marginTop: 10 }}>Sesso (per le calorie)</label>
      <div className="row">
        <button className={user.sex === 'm' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'm' })}>Uomo</button>
        <button className={user.sex === 'f' ? 'sel' : ''} style={{ flex: 1 }} onClick={() => updateUser({ sex: 'f' })}>Donna</button>
      </div>
    </div>
  )
}

function FaseCard() {
  const phase = useLiveQuery(getCurrentPhase, [])
  return (
    <div className="card">
      <label className="fl">Fase di allenamento</label>
      <div className="grid2">
        {PHASES.map((p) => (
          <button key={p.key} className={phase?.phase === p.key ? 'sel' : ''}
            onClick={() => (phase?.phase === p.key ? clearPhase() : setPhase(p.key))}>
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
  )
}

function AcquaSale() {
  const user = useLiveQuery(getUser, [])
  if (!user) return null
  return (
    <div className="card">
      <label className="fl">Target giornalieri (opz.)</label>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label className="fl">Acqua (L)</label>
          <input inputMode="decimal" defaultValue={user.waterTarget ?? ''}
            onBlur={(e) => { const n = parseNum(e.target.value, { min: 0, max: 15 }); if (n != null) updateUser({ waterTarget: n }) }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fl">Sale (g)</label>
          <input inputMode="decimal" defaultValue={user.saltTarget ?? ''}
            onBlur={(e) => { const n = parseNum(e.target.value, { min: 0, max: 50 }); if (n != null) updateUser({ saltTarget: n }) }} />
        </div>
      </div>
    </div>
  )
}

/** FC a riposo e massima: le usano le zone del cardio e la HRR. */
function CuoreZone({ fcWhoop }: { fcWhoop: number | null }) {
  const user = useLiveQuery(getUser, [])
  if (!user) return null
  return (
    <div className="card">
      <div className="grid2" style={{ gap: 8 }}>
        <div>
          <label className="fl">FC a riposo</label>
          <input inputMode="numeric" defaultValue={user.restingHr ?? ''}
            onBlur={(e) => {
              // Vuoto = toglilo: senza, il numero vecchio restava li' per sempre.
              if (!e.target.value.trim()) { void updateUser({ restingHr: undefined }); return }
              const n = parseNum(e.target.value, { min: 30, max: 120, int: true }); if (n != null) updateUser({ restingHr: n })
            }} />
          {fcWhoop != null && (
            <p className="muted" style={{ fontSize: 11, marginTop: 3 }}>
              In uso: <strong style={{ color: 'var(--gold)' }}>{fcWhoop}</strong> dalla media WHOOP
            </p>
          )}
        </div>
        <div>
          <label className="fl">FC max misurata (opz.)</label>
          <input inputMode="numeric" defaultValue={user.hrMaxMeasured ?? ''}
            onBlur={(e) => {
              if (!e.target.value.trim()) { void updateUser({ hrMaxMeasured: undefined }); return }
              const n = parseNum(e.target.value, { min: 120, max: 230, int: true }); if (n != null) updateUser({ hrMaxMeasured: n })
            }} />
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Se conosci la FC max, le zone la usano al posto di 220 − età.</p>
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

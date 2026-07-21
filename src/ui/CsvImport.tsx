import { useRef, useState } from 'react'
import {
  parseCSV, autoDetectMapping, buildPreview, runImport,
  FIELD_LABELS, REQUIRED_FIELDS,
  type ParsedCsv, type ColumnMap, type CsvField, type ImportPreview,
} from '../db/csvImport'
import { allExercises, getUser } from '../db/repo'
import { normalizeName } from '../db/catalog'
import type { Unit } from '../db/schema'

const FIELD_KEYS = Object.keys(FIELD_LABELS) as CsvField[]

/** Import CSV universale (Strong, Hevy, o qualsiasi export). Mapping colonne + anteprima + scrittura. */
export function CsvImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [map, setMap] = useState<ColumnMap>({})
  const [fromUnit, setFromUnit] = useState<Unit>('kg')
  const [toUnit, setToUnit] = useState<Unit>('kg')
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)

  function reset() {
    setParsed(null); setMap({}); setPreview(null); setMsg(null); setShowSkipped(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null); setPreview(null)
    const text = await file.text()
    const p = parseCSV(text)
    if (p.headers.length === 0 || p.rows.length === 0) {
      setMsg({ ok: false, text: 'CSV vuoto o illeggibile.' }); return
    }
    const { map: auto, unit } = autoDetectMapping(p.headers)
    const user = await getUser()
    const uUnit = (user?.unit ?? 'kg') as Unit
    const exs = await allExercises()
    setKnown(new Set(exs.flatMap((x) => [normalizeName(x.name), ...x.aliases.map(normalizeName)])))
    setParsed(p); setMap(auto)
    setFromUnit(unit ?? uUnit); setToUnit(uUnit)
  }

  /** Assegna un campo a una colonna, garantendo 1:1 (rimuove il campo dalle altre colonne). */
  function setField(colIndex: number, field: CsvField | '') {
    setMap((prev) => {
      const next: ColumnMap = {}
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k)
        if (ki === colIndex) continue
        if (field !== '' && v === field) continue // togli il campo dall'altra colonna
        next[ki] = v
      }
      if (field !== '') next[colIndex] = field
      setPreview(null) // il mapping è cambiato → invalida anteprima
      return next
    })
  }

  const mappedFields = new Set(Object.values(map))
  const missing = REQUIRED_FIELDS.filter((f) => !mappedFields.has(f))

  function genPreview() {
    if (!parsed) return
    setPreview(buildPreview(parsed, map, fromUnit, toUnit, known))
  }

  async function doImport() {
    if (!preview) return
    setBusy(true)
    try {
      const r = await runImport(preview)
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) reset()
    } catch (err) {
      setMsg({ ok: false, text: 'Errore durante l’import: ' + (err as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <label className="fl">Importa allenamenti da CSV</label>
      <p className="muted small" style={{ marginTop: -2, marginBottom: 8 }}>
        Da Strong, Hevy o qualsiasi app: carica il file CSV, controlla l’abbinamento colonne, importa.
      </p>

      {!parsed && (
        <button className="ghost" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>⬆ Scegli file CSV</button>
      )}
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={onFile} />

      {parsed && (
        <>
          <div className="row spread" style={{ marginBottom: 6 }}>
            <span className="muted small">{parsed.headers.length} colonne · {parsed.rows.length} righe</span>
            <button className="ghost small" onClick={reset}>Cambia file ✕</button>
          </div>

          {/* Mapping colonne */}
          <div className="col" style={{ gap: 6 }}>
            {parsed.headers.map((h, i) => (
              <div key={i} className="row spread" style={{ gap: 8 }}>
                <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>
                  {h || <em className="muted">(vuota)</em>}
                </span>
                <select value={map[i] ?? ''} onChange={(e) => setField(i, e.target.value as CsvField | '')} style={{ flex: 1 }}>
                  <option value="">— ignora —</option>
                  {FIELD_KEYS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Unità peso */}
          <div className="row spread" style={{ marginTop: 10 }}>
            <span className="small">Unità peso nel file</span>
            <div className="row" style={{ gap: 4 }}>
              {(['kg', 'lb'] as Unit[]).map((u) => (
                <button key={u} className={fromUnit === u ? 'sel' : ''} onClick={() => { setFromUnit(u); setPreview(null) }}>{u}</button>
              ))}
            </div>
          </div>
          {fromUnit !== toUnit && (
            <p className="muted small" style={{ marginTop: 4 }}>Conversione {fromUnit} → {toUnit} (unità del tuo profilo).</p>
          )}

          {missing.length > 0 && (
            <p className="small" style={{ marginTop: 8, color: '#e57373' }}>
              Manca l’abbinamento: {missing.map((f) => FIELD_LABELS[f]).join(', ')}.
            </p>
          )}

          <button className="ghost" style={{ width: '100%', marginTop: 10 }} disabled={missing.length > 0} onClick={genPreview}>
            👁 Genera anteprima
          </button>
        </>
      )}

      {/* Anteprima */}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Stat n={preview.sessions.length} label="sedute" />
            <Stat n={preview.recognizedRows} label="serie ok" />
            <Stat n={preview.newExercises.length} label="esercizi nuovi" />
            <Stat n={preview.skipped.length} label="righe scartate" warn={preview.skipped.length > 0} />
          </div>

          {preview.newExercises.length > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Nuovi esercizi creati come custom: {preview.newExercises.slice(0, 12).join(', ')}{preview.newExercises.length > 12 ? '…' : ''}
            </p>
          )}

          {preview.skipped.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <button className="ghost small" onClick={() => setShowSkipped((s) => !s)}>
                {showSkipped ? 'Nascondi' : 'Mostra'} righe scartate
              </button>
              {showSkipped && (
                <ul className="muted small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.skipped.slice(0, 15).map((s, i) => <li key={i}>riga {s.line}: {s.reason}</li>)}
                  {preview.skipped.length > 15 && <li>…e altre {preview.skipped.length - 15}</li>}
                </ul>
              )}
            </div>
          )}

          {preview.sessions.length > 0 ? (
            <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={doImport}>
              {busy ? 'Importazione…' : `✓ Importa ${preview.sessions.length} sedute`}
            </button>
          ) : (
            <p className="small" style={{ marginTop: 10, color: '#e57373' }}>Nessuna riga valida da importare: controlla l’abbinamento colonne.</p>
          )}
        </div>
      )}

      {msg && <p className="small" style={{ marginTop: 8, color: msg.ok ? 'var(--good)' : '#e57373' }}>{msg.text}</p>}
    </div>
  )
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? '#e57373' : 'var(--gold)' }}>{n}</div>
      <div className="muted small">{label}</div>
    </div>
  )
}

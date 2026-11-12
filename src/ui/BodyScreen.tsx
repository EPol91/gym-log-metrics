import { useEffect, useState } from 'react'
import { fmtData } from '../util/format'
import { usePersistedState } from '../util/persist'
import { useLiveQuery } from 'dexie-react-hooks'
import { listMeasurements, deleteMeasurement, upsertMeasurement, getUser, todayISO } from '../db/repo'
import { deleteWithUndo } from '../db/trash'
import { computeFfmi } from '../metrics/body'
import { parseNum } from '../util/validate'
import { LineChart } from './LineChart'
import { AnalisiPeso } from './AnalisiPeso'
import { Info } from './anim'
import { SceltaTag, ChipTags, ChipAuto, RigaAuto, GuidaMisure, AZZURRO } from './NotaCorpo'
import { CIRC, haCirc, prossimeCirc, haNota, correggiMisura, salvaNota, listaTag, tagAuto, autoAttivi, whoopPerData, TAG_AUTO, type CircKey, type TagAuto } from '../db/noteCorpo'
import type { BodyMeasurement, TagNota } from '../db/schema'

const virgola = (n: number) => String(n).replace('.', ',')
const cm = (v: string) => (v.trim() === '' ? undefined : (parseNum(v, { min: 10, max: 300 }) ?? undefined))
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Le circonferenze di una misura in una riga: «vita 84 · str. 78 · …». */
function rigaCirc(m: BodyMeasurement): string {
  const nomi: Record<CircKey, string> = { waist: 'vita', waistNarrow: 'str.', chest: 'petto', arm: 'br.', thigh: 'coscia' }
  return CIRC.filter((c) => m[c.k] != null).map((c) => `${nomi[c.k]} ${virgola(m[c.k] as number)}`).join(' · ')
}

/** Peso, % grasso e, a richiesta, le circonferenze della riga che stai correggendo. */
function ModificaMisura({ m, onFine }: { m: BodyMeasurement; onFine: () => void }) {
  const [w, setW] = useState(virgola(m.weight))
  const [bf, setBf] = useState(m.bodyFat != null ? virgola(m.bodyFat) : '')
  const [conBf, setConBf] = useState(m.bodyFat != null)
  const [tags, setTags] = useState<TagNota[]>(m.tags ?? [])
  const [tagNo, setTagNo] = useState<string[]>(m.tagNo ?? [])
  const [note, setNote] = useState(m.note ?? '')
  const [conCirc, setConCirc] = useState(false)
  const [circ, setCirc] = useState<Record<string, string>>(
    Object.fromEntries(CIRC.map((c) => [c.k, m[c.k] != null ? virgola(m[c.k] as number) : ''])))
  const wn = parseNum(w, { min: 20, max: 400 })

  return (
    <div style={{ background: 'var(--surface-2)', margin: '2px -12px', padding: '9px 12px', borderRadius: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>{fmtData(m.date)}</div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><label className="fl">Peso (kg)</label><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
        {conBf
          ? <div style={{ flex: 1 }}><label className="fl">% grasso</label><input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} /></div>
          : <button className="chip" style={{ marginBottom: 10, fontSize: 11, padding: '3px 9px' }} onClick={() => setConBf(true)}>+ % grasso</button>}
      </div>
      <div style={{ marginTop: 9 }}><RigaAuto date={m.date} no={tagNo} onChange={setTagNo} /></div>
      <div style={{ marginTop: 7 }}><SceltaTag tags={tags} onChange={setTags} /></div>
      <textarea rows={2} value={note} placeholder="Nota (facoltativa)" onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 7, fontSize: 14, padding: '9px 11px', resize: 'none' }} />
      <button className="ghost small" style={{ border: 'none', padding: '6px 0', color: 'var(--muted)' }} onClick={() => setConCirc(!conCirc)}>
        📏 Circonferenze {conCirc ? '▴' : '›'}
      </button>
      {conCirc && (
        <div className="grid2" style={{ gap: 7 }}>
          {CIRC.map((c) => (
            <div key={c.k}><label className="fl">{c.nome}</label>
              <input inputMode="decimal" value={circ[c.k]} onChange={(e) => setCirc({ ...circ, [c.k]: e.target.value })} /></div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="ghost" style={{ flex: 1 }} onClick={() => { if (confirm('Eliminare la misura?')) deleteWithUndo('Misura del ' + fmtData(m.date) + ' eliminata', () => deleteMeasurement(m.id)) }}>🗑</button>
        <button className="ghost" style={{ flex: 1 }} onClick={onFine}>Annulla</button>
        <button className="primary" style={{ flex: 2 }} disabled={wn == null} onClick={async () => {
          if (wn == null) return
          await correggiMisura(m.id, {
            weight: wn,
            bodyFat: bf.trim() === '' ? undefined : (parseNum(bf, { min: 1, max: 70 }) ?? m.bodyFat),
            note: note.trim(), tags, tagNo,
            ...Object.fromEntries(CIRC.map((c) => [c.k, circ[c.k].trim() === '' ? undefined : (cm(circ[c.k]) ?? m[c.k])])),
          })
          onFine()
        }}>Salva</button>
      </div>
    </div>
  )
}

const GIORNI_SETTIMANA = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/** Riga dello storico: chiusa una linea; un tocco la apre, «modifica» corregge tutto. */
function MeasureRow({ m, corta, auto }: { m: BodyMeasurement; corta: boolean; auto: TagAuto[] }) {
  const [stato, setStato] = useState<'chiusa' | 'aperta' | 'modifica'>('chiusa')
  if (stato === 'modifica') return <ModificaMisura m={m} onFine={() => setStato('aperta')} />
  const d = fmtData(m.date)
  const data = corta ? d.slice(0, 5) : d.slice(0, 6) + d.slice(8)
  const gg = GIORNI_SETTIMANA[new Date(m.date + 'T12:00:00').getDay()]
  const nTag = m.tags?.length ?? 0
  const attivi = autoAttivi(auto, m)

  if (stato === 'aperta') {
    return (
      <div style={{ background: 'var(--surface-2)', margin: '2px -12px', padding: '9px 12px', borderRadius: 12 }}>
        <div className="row spread" onClick={() => setStato('chiusa')} style={{ cursor: 'pointer' }}>
          <span className="small" style={{ fontWeight: 600 }}>{d} · {virgola(m.weight)} kg{m.bodyFat != null ? ` · ${virgola(m.bodyFat)}%` : ''}</span>
          <button className="ghost small" style={{ border: 'none', padding: '2px 0', color: 'var(--muted)' }}
            onClick={(e) => { e.stopPropagation(); setStato('modifica') }}>✎ modifica</button>
        </div>
        {(nTag > 0 || auto.length > 0) && <div className="row wrap" style={{ gap: 4, marginTop: 6 }}><ChipAuto auto={auto} no={m.tagNo ?? []} mini /><ChipTags tags={m.tags} /></div>}
        {m.note?.trim() && <div style={{ marginTop: 4, fontSize: 12, color: '#b5afa3', fontStyle: 'italic' }}>{m.note}</div>}
        {haCirc(m) && <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>📏 {rigaCirc(m)}</div>}
        {!haNota(m) && !haCirc(m) && !auto.length && <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>Nessuna nota. «✎ modifica» per aggiungerla.</div>}
      </div>
    )
  }
  return (
    <div onClick={() => setStato('aperta')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
      <span className="muted small" style={{ flex: corta ? '0 0 80px' : '0 0 100px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 32 }}>{gg}</span>{data}</span>
      <span style={{ flex: 1 }}>{virgola(m.weight)} kg{m.bodyFat != null ? <span className="muted small"> · {virgola(m.bodyFat)}%</span> : null}</span>
      {attivi.length > 0 && <span className="muted" style={{ fontSize: 11 }}>⚙</span>}
      {haNota(m) && <span style={{ fontSize: 11, color: AZZURRO }}>🏷{nTag ? ' ' + nTag : ''}</span>}
      {haCirc(m) && <span style={{ fontSize: 11 }}>📏</span>}
      <span className="muted small" style={{ flex: 'none' }}>›</span>
    </div>
  )
}

/** Storico: per mese (aperto quello in corso) oppure, con un filtro, l'elenco secco. */
function Storico({ rows }: { rows: BodyMeasurement[] }) {
  const lista = useLiveQuery(listaTag, []) ?? []
  const [filtro, setFiltro] = usePersistedState<string>('body-filtro', 'tutte')
  const whoop = useLiveQuery(whoopPerData, []) ?? new Map()
  const autoDi = (m: BodyMeasurement) => tagAuto(whoop.get(m.date))
  const usati = [...new Set(rows.flatMap((m) => (m.tags ?? []).map((x) => x.t)))]
  const tagScelti = [...lista.filter((t) => usati.includes(t)), ...usati.filter((t) => !lista.includes(t))]
  const ultimoMese = rows.length ? rows[rows.length - 1].date.slice(0, 7) : ''
  const [aperti, setAperti] = useState<Set<string>>(new Set())
  useEffect(() => { if (ultimoMese) setAperti((a) => (a.size ? a : new Set([ultimoMese]))) }, [ultimoMese])

  const tagFiltro = filtro.startsWith('tag:') ? filtro.slice(4) : null
  const autoFiltro = filtro.startsWith('auto:') ? filtro.slice(5) : null
  const filtrate = [...rows].reverse().filter((m) =>
    filtro === 'nota' ? haNota(m) : filtro === 'circ' ? haCirc(m)
      : tagFiltro ? !!m.tags?.some((x) => x.t === tagFiltro)
        : autoFiltro ? autoAttivi(autoDi(m), m).some((a) => a.t === autoFiltro) : true)

  const mesi: { k: string; righe: BodyMeasurement[] }[] = []
  for (const m of filtrate) {
    const k = m.date.slice(0, 7)
    if (mesi[mesi.length - 1]?.k !== k) mesi.push({ k, righe: [] })
    mesi[mesi.length - 1].righe.push(m)
  }
  const chip = (k: string, testo: string) => (
    <button className={filtro === k ? 'chip on' : 'chip'} style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => setFiltro(k)}>{testo}</button>
  )

  return (
    <div className="card">
      <div className="row spread"><span className="muted small">Storico</span><span className="muted" style={{ fontSize: 11 }}>{rows.length} pesate</span></div>
      {rows.length === 0 ? <p className="muted small">Nessuna misura.</p> : (
        <>
          <div className="row wrap" style={{ gap: 4, margin: '7px 0 4px' }}>
            {chip('tutte', 'Tutte')}{chip('nota', 'con nota')}{chip('circ', '📏 circonf.')}
            {(tagScelti.length > 0 || whoop.size > 0) && (
              <select value={tagFiltro ? 'tag:' + tagFiltro : autoFiltro ? 'auto:' + autoFiltro : ''} onChange={(e) => setFiltro(e.target.value || 'tutte')}
                className={tagFiltro || autoFiltro ? 'chip on' : 'chip'}
                style={{ fontSize: 11, padding: '3px 9px', width: 'auto', maxWidth: 140, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none' }}>
                <option value="">tag ▾</option>
                {whoop.size > 0 && TAG_AUTO.map((t) => <option key={'a' + t} value={'auto:' + t}>⚙ {t}</option>)}
                {tagScelti.map((t) => <option key={t} value={'tag:' + t}>{t}</option>)}
              </select>
            )}
          </div>
          {filtro !== 'tutte' ? (
            <>
              {filtrate.map((m) => <MeasureRow key={m.id} m={m} corta={false} auto={autoDi(m)} />)}
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                {filtrate.length === 0 ? 'Nessun giorno trovato.' : `${filtrate.length} ${filtrate.length === 1 ? 'giorno' : 'giorni'}`}
              </div>
            </>
          ) : mesi.map(({ k, righe }) => {
            const aperto = aperti.has(k)
            const media = righe.reduce((s, m) => s + m.weight, 0) / righe.length
            return (
              <div key={k}>
                <div onClick={() => { const a = new Set(aperti); if (aperto) a.delete(k); else a.add(k); setAperti(a) }}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 7px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: aperto ? 'var(--gold)' : undefined }}>
                  <span>{MESI[Number(k.slice(5)) - 1].replace(/^./, (c) => c.toUpperCase())} {k.slice(0, 4)}</span>
                  <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>
                    {righe.length} {righe.length === 1 ? 'pesata' : 'pesate'} · media {virgola(+media.toFixed(1))} {aperto ? '▴' : '▾'}
                  </span>
                </div>
                {aperto && righe.map((m) => <MeasureRow key={m.id} m={m} corta auto={autoDi(m)} />)}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

/** Circonferenze: la domenica del check, una sì e una no, mattina a digiuno. Vanno sulla pesata del giorno. */
function CardCirconferenze({ rows, date }: { rows: BodyMeasurement[]; date: string }) {
  const [v, setV] = useState<Record<string, string>>({})
  const [spiega, setSpiega] = useState<string | null>(null)
  const [guida, setGuida] = useState(false)
  const [fatto, setFatto] = useState(false)
  const conCirc = rows.filter(haCirc)
  const ultima = conCirc[conCirc.length - 1] ?? null
  const ultimoDi = (k: CircKey) => [...conCirc].reverse().find((m) => m[k] != null)?.[k] as number | undefined
  const oggi = todayISO()
  const prossime = prossimeCirc(ultima?.date ?? null, oggi)
  const misura = rows.find((m) => m.date === date)
  const valori = Object.fromEntries(CIRC.map((c) => [c.k, cm(v[c.k] ?? '')]).filter(([, n]) => n != null))
  const pronte = Object.keys(valori).length > 0

  return (
    <div className="card">
      <div className="row spread">
        <label className="fl" style={{ margin: 0 }}>Circonferenze (cm)</label>
        {prossime === oggi
          ? <span className="small" style={{ color: 'var(--gold)', fontWeight: 600 }}>tocca oggi</span>
          : <span className="muted" style={{ fontSize: 11.5 }}>prossime dom. {fmtData(prossime).slice(0, 5)}</span>}
      </div>
      <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 8px' }}>
        La domenica del check, una sì e una no, mattina a digiuno.{ultima ? ` Ultime il ${fmtData(ultima.date)}.` : ''}
      </div>
      <div className="grid2" style={{ gap: '7px 8px' }}>
        {CIRC.flatMap((c) => {
          const u = ultimoDi(c.k)
          const cella = (
            <div key={c.k}>
              <label className="fl" style={{ display: 'flex', alignItems: 'center', color: spiega === c.k ? 'var(--gold)' : undefined }}>
                {c.nome}
                <button aria-label={`Dove si misura: ${c.nome}`} onClick={() => setSpiega(spiega === c.k ? null : c.k)}
                  style={{ background: 'none', border: 'none', padding: '0 4px', fontSize: 12, color: spiega === c.k ? 'var(--gold)' : 'var(--faint)' }}>ⓘ</button>
                {u != null && <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>{virgola(u)}</span>}
              </label>
              <input inputMode="decimal" value={v[c.k] ?? ''} placeholder={u != null ? virgola(u) : 'cm'}
                onChange={(e) => { setV({ ...v, [c.k]: e.target.value }); setFatto(false) }}
                style={spiega === c.k ? { borderColor: '#4a3e18' } : undefined} />
            </div>
          )
          // La spiegazione si apre sotto la coppia di campi dove sta quello toccato.
          const i = CIRC.findIndex((x) => x.k === c.k)
          const fine = i % 2 === 1 || i === CIRC.length - 1
          const sp = spiega && fine && [CIRC[i - (i % 2)]?.k, CIRC[i - (i % 2) + 1]?.k].includes(spiega as CircKey)
          return sp ? [cella, (
            <div key={'sp' + c.k} style={{ gridColumn: '1 / -1', fontSize: 11.5, lineHeight: 1.4, color: '#c9c4b9', background: 'var(--gold-bg)', border: '1px solid #4a3e18', borderRadius: 10, padding: '7px 9px' }}>
              <b style={{ color: 'var(--gold)' }}>{CIRC.find((x) => x.k === spiega)!.nome}</b> · {CIRC.find((x) => x.k === spiega)!.come}
            </div>
          )] : [cella]
        })}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="primary" style={{ width: '100%' }} disabled={!pronte || !misura} onClick={async () => {
            if (!misura || !pronte) return
            await correggiMisura(misura.id, valori)
            setV({}); setFatto(true)
          }}>Salva</button>
        </div>
      </div>
      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11 }}>
          {fatto ? <span style={{ color: 'var(--good)' }}>✓ salvate sul {fmtData(date)}</span>
            : !misura ? `Prima il peso del ${fmtData(date)}: vanno sulla stessa misura.`
              : 'Facoltative. In grigio l\'ultima misura.'}
        </span>
        <button className="ghost small" style={{ border: 'none', padding: '2px 0', color: 'var(--gold)', fontWeight: 600, flex: 'none' }} onClick={() => setGuida(true)}>📏 Come misurare ›</button>
      </div>
      {guida && <GuidaMisure onClose={() => setGuida(false)} />}
    </div>
  )
}

export function BodyScreen() {
  const rows = useLiveQuery(listMeasurements, []) ?? []
  const user = useLiveQuery(getUser, [])
  const [date, setDate] = usePersistedState('body-date', todayISO())
  const [w, setW] = useState('')
  const [bf, setBf] = useState('')
  const [conBf, setConBf] = useState(false)
  const [tags, setTags] = useState<TagNota[]>([])
  const [note, setNote] = useState('')
  const [tagNo, setTagNo] = useState<string[]>([])
  const [chart, setChart] = usePersistedState<'weight' | 'bf' | 'circ'>('body-chart', 'weight')
  const [quale, setQuale] = usePersistedState<CircKey>('body-circ', 'waist')

  const latest = rows[rows.length - 1]
  const ffmi = latest?.bodyFat != null && user?.heightCm ? computeFfmi(latest.weight, latest.bodyFat, user.heightCm) : null
  const bfRows = rows.filter((m) => m.bodyFat != null)
  const circRows = rows.filter((m) => m[quale] != null)

  // Se quel giorno c'è già una nota (scritta da Oggi), si parte da quella: salvare non la cancella.
  const esistente = rows.find((m) => m.date === date)
  useEffect(() => { setTags(esistente?.tags ?? []); setNote(esistente?.note ?? ''); setTagNo(esistente?.tagNo ?? []) }, [date, esistente?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const wn = parseNum(w, { min: 20, max: 400 })
  const opt = (v: string, max: number) => (v === '' ? undefined : (parseNum(v, { min: 1, max }) ?? undefined))

  async function save() {
    // Peso vuoto su un giorno già pesato = tieni quello: si salva solo la nota.
    if (wn == null && !esistente) return
    if (wn != null) await upsertMeasurement(date, { weight: wn, bodyFat: opt(bf, 70) })
    await salvaNota(date, note, tags, tagNo)
    setW(''); setBf(''); setConBf(false)
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <AnalisiPeso rows={rows} obiettivo={user?.pesoObiettivo} chart={chart} onChart={setChart} bfPochi={bfRows.length < 2}>
        {chart === 'bf' && <LineChart points={bfRows.map((m) => ({ label: m.date, value: m.bodyFat as number }))} />}
        {chart === 'circ' && (
          <>
            <div className="row wrap" style={{ gap: 4, marginBottom: 6 }}>
              {CIRC.map((c) => (
                <button key={c.k} className={quale === c.k ? 'chip on' : 'chip'} style={{ fontSize: 10.5, padding: '2px 8px' }} onClick={() => setQuale(c.k)}>{c.corto}</button>
              ))}
            </div>
            <LineChart points={circRows.map((m) => ({ label: m.date, value: m[quale] as number }))} vuoto="Servono almeno 2 misure per il grafico." />
            {circRows.length >= 2 && (
              <div className="row spread muted" style={{ fontSize: 11 }}>
                <span>{fmtData(circRows[0].date).slice(0, 5)} · {virgola(circRows[0][quale] as number)}</span>
                <span>{fmtData(circRows[circRows.length - 1].date).slice(0, 5)} · {virgola(circRows[circRows.length - 1][quale] as number)} cm</span>
              </div>
            )}
          </>
        )}
      </AnalisiPeso>

      {/* Log rapido: peso, e la nota del giorno */}
      <div className="card">
        <label className="fl">Registra misura</label>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}><label className="fl">Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark', padding: '11px 6px', minWidth: 0, fontSize: 15 }} /></div>
          <div style={{ flex: '1 1 0', minWidth: 0 }}><label className="fl">Peso (kg)</label>
            <input inputMode="decimal" value={w} placeholder={esistente ? virgola(esistente.weight) : ''} onChange={(e) => setW(e.target.value)} /></div>
          {!conBf && <button className="chip" style={{ marginBottom: 10, fontSize: 11, padding: '3px 8px' }} onClick={() => setConBf(true)}>+ % gr.</button>}
        </div>
        {conBf && (
          <div style={{ marginTop: 8 }}><label className="fl">% grasso (opz.)</label>
            <input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} /></div>
        )}
        <div style={{ marginTop: 10 }}><RigaAuto date={date} no={tagNo} onChange={setTagNo} /></div>
        <div style={{ marginTop: 8 }}><SceltaTag tags={tags} onChange={setTags} /></div>
        <textarea rows={2} value={note} placeholder="Nota (facoltativa)" onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: 7, fontSize: 14, padding: '9px 11px', resize: 'none' }} />
        <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={wn == null && !esistente} onClick={save}>Salva</button>
      </div>

      <CardCirconferenze rows={rows} date={date} />

      {/* FFMI */}
      {latest && (
        <div className="card">
          <div className="muted small">FFMI {ffmi ? '(norm.)' : ''}<Info text="FFMI = indice di massa magra: peso × (1−%grasso) / altezza². Migliore del BMI per chi ha muscoli. Serve % grasso + altezza (Profilo)." /></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{ffmi ? ffmi.normalized : '—'}</span>
            <span className="muted small">{ffmi ? `massa magra ${ffmi.ffmKg} kg` : 'serve % grasso + altezza'}</span>
          </div>
        </div>
      )}

      <Storico rows={rows} />
    </div>
  )
}

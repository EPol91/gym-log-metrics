import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { todayISO, updateUser } from '../db/repo'
import { haNota, testoTag } from '../db/noteCorpo'
import { finestraPinch, finestraSpostata, inizioPeriodo, isoGiorno, mediaMobile, numGiorno, piuGiorni, situazione, type Mobile, type Periodo } from '../metrics/analisiPeso'
import { usePersistedState } from '../util/persist'
import { parseNum } from '../util/validate'
import { AZZURRO } from './NotaCorpo'
import type { BodyMeasurement } from '../db/schema'

type Grafico = 'weight' | 'bf' | 'circ'

const virg = (n: number, c = 1) => n.toFixed(c).replace('.', ',')
const segno = (n: number, c = 1) => {
  const s = virg(Math.abs(n), c)
  if (Number(n.toFixed(c)) === 0) return s
  return (n > 0 ? '+' : '−') + s
}
const breve = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const mese = (s: string) => `${MESI[+s.slice(5, 7) - 1]} ${s.slice(2, 4)}`
const colDelta = (n: number | null, c = 1) =>
  n == null || Number(n.toFixed(c)) === 0 ? 'var(--text)' : n > 0 ? 'var(--ap-su)' : 'var(--good)'

const PERIODI: Periodo[] = ['1W', '3M', '6M', 'YTD', 'Tutto', 'Range']
const MOBILI: Mobile[] = [7, 14, 30]
const STILE: Record<Mobile, { col: string; w: number; dash: string; bordo: string }> = {
  7: { col: 'var(--gold)', w: 2.2, dash: '', bordo: 'solid' },
  14: { col: 'var(--gold-hi)', w: 1.5, dash: '5 3', bordo: 'dashed' },
  30: { col: '#b5afa3', w: 1.5, dash: '1.5 3', bordo: 'dotted' },
}

const W = 326, H = 172, L = 31, R = 6, T = 8, B = 20
const RAGGIO_DITO = 14

function Bandiera({ x, y, testo, col, sopra }: { x: number; y: number; testo: string; col: string; sopra: boolean }) {
  const w = 7 + testo.length * 5.4, h = 15
  const bx = Math.max(L, Math.min(W - R - w, x - w / 2))
  const by = sopra ? Math.max(0, y - h - 7) : Math.min(H - B - h, y + 7)
  return (
    <>
      <circle cx={x} cy={y} r={3.2} fill="var(--surface)" stroke={col} strokeWidth={1.6} />
      <rect x={bx} y={by} width={w} height={h} rx={4} fill={col} />
      <text x={bx + w / 2} y={by + 11} textAnchor="middle" fontSize={10} fontWeight={700} fill="#14110a">{testo}</text>
    </>
  )
}

function Andamento({ rows, D, oggi }: { rows: BodyMeasurement[]; D: string; oggi: string }) {
  const [per, setPer] = usePersistedState<Periodo>('body-periodo', 'YTD')
  const [accese, setAccese] = usePersistedState<Mobile[]>('body-mobili', [7])
  const [range, setRange] = useState({ da: piuGiorni(D, -90), a: D })
  const [sel, setSel] = useState<string | null>(null)

  const primo = rows[0]?.date ?? D
  const baseDa = per === 'Range' ? range.da : inizioPeriodo(per, D, primo)
  const baseA = per === 'Range' ? range.a : D

  // Il pizzico cambia solo il tratto visibile: periodo e data scelti restano quelli.
  const [zoom, setZoom] = useState<{ da: string; a: string } | null>(null)
  useEffect(() => setZoom(null), [baseDa, baseA])
  const da = zoom?.da ?? baseDa
  const a = zoom?.a ?? baseA
  const giorni = Math.max(0, numGiorno(a) - numGiorno(da))

  const [svg, setSvg] = useState<SVGSVGElement | null>(null)
  const ora = useRef({ baseDa, baseA, da, a, rows })
  ora.current = { baseDa, baseA, da, a, rows }
  const trascinato = useRef(false)

  // Ascoltatori a mano: quelli di React sono passivi e non fermerebbero lo zoom del browser.
  useEffect(() => {
    if (!svg) return
    type Gesto =
      | { tipo: 'pinch'; partenza: { ini: number; fine: number }; f0: number; d0: number }
      | { tipo: 'sposta'; partenza: { ini: number; fine: number }; x0: number; y0: number; asse: 'x' | 'y' | null }
    let g: Gesto | null = null

    const inPixel = (x: number) => { const b = svg.getBoundingClientRect(); return (x - b.left) * W / b.width }
    const frazione = (x: number) => Math.max(0, Math.min(1, (inPixel(x) - L) / (W - L - R)))
    const centro = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2
    const distanza = (t: TouchList) => Math.max(1, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY))
    const finestraOra = () => ({ ini: numGiorno(ora.current.da), fine: numGiorno(ora.current.a) })
    const finestraBase = () => ({ ini: numGiorno(ora.current.baseDa), fine: numGiorno(ora.current.baseA) })

    const applica = (n: { ini: number; fine: number } | null) => {
      trascinato.current = true
      if (!n) { setZoom(null); return }
      const nuovoDa = isoGiorno(n.ini), nuovoA = isoGiorno(n.fine)
      if (nuovoDa === ora.current.da && nuovoA === ora.current.a) return
      // Un tratto senza almeno 2 pesate non disegna niente: lì non ci si ferma.
      if (ora.current.rows.filter((r) => r.date >= nuovoDa && r.date <= nuovoA).length < 2) return
      setZoom({ da: nuovoDa, a: nuovoA })
    }

    const inizio = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        g = { tipo: 'pinch', partenza: finestraOra(), f0: frazione(centro(e.touches)), d0: distanza(e.touches) }
      } else if (e.touches.length === 1) {
        trascinato.current = false
        const { da: d, a: f, baseDa: bd, baseA: ba } = ora.current
        g = d !== bd || f !== ba ? { tipo: 'sposta', partenza: finestraOra(), x0: e.touches[0].clientX, y0: e.touches[0].clientY, asse: null } : null
      }
    }
    const muovi = (e: TouchEvent) => {
      if (!g) return
      if (g.tipo === 'pinch') {
        if (e.touches.length < 2) return
        if (e.cancelable) e.preventDefault()
        applica(finestraPinch(finestraBase(), g.partenza, g.f0, frazione(centro(e.touches)), distanza(e.touches) / g.d0))
        return
      }
      const dx = e.touches[0].clientX - g.x0, dy = e.touches[0].clientY - g.y0
      if (!g.asse) {
        if (Math.hypot(dx, dy) < 8) return
        g.asse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (g.asse === 'y') { g = null; return } // in verticale scorre la pagina
      if (e.cancelable) e.preventDefault()
      const ampiezza = g.partenza.fine - g.partenza.ini
      const b = svg.getBoundingClientRect()
      applica(finestraSpostata(finestraBase(), g.partenza, -(dx * W / b.width) / (W - L - R) * ampiezza))
    }
    const fine = (e: TouchEvent) => { if (e.touches.length < 2) g = null }

    svg.addEventListener('touchstart', inizio, { passive: false })
    svg.addEventListener('touchmove', muovi, { passive: false })
    svg.addEventListener('touchend', fine)
    svg.addEventListener('touchcancel', fine)
    return () => {
      svg.removeEventListener('touchstart', inizio)
      svg.removeEventListener('touchmove', muovi)
      svg.removeEventListener('touchend', fine)
      svg.removeEventListener('touchcancel', fine)
    }
  }, [svg])

  const G = useMemo(() => {
    const veri = rows.filter((r) => r.date >= da && r.date <= a)
    const serie = MOBILI.filter((k) => accese.includes(k)).map((k) => ({ k, punti: mediaMobile(rows, k, da, a) }))
    const valori = [...veri.map((r) => r.weight), ...serie.flatMap((s) => s.punti.flatMap((p) => (p.v != null ? [p.v] : [])))]
    const lo = Math.min(...valori), hi = Math.max(...valori), pad = Math.max(0.5, (hi - lo) * 0.2)
    const y0 = lo - pad, y1 = hi + pad
    const X = (g: string) => L + (W - L - R) * (giorni ? (numGiorno(g) - numGiorno(da)) / giorni : 0.5)
    const Y = (v: number) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0))
    const base = serie.length
      ? serie[0].punti.flatMap((p) => (p.v != null ? [{ date: p.date, v: p.v }] : []))
      : veri.map((r) => ({ date: r.date, v: r.weight }))
    const min = base.length >= 2 ? base.reduce((m, x) => (x.v < m.v ? x : m)) : null
    const max = base.length >= 2 ? base.reduce((m, x) => (x.v > m.v ? x : m)) : null
    return { veri, serie, y0, y1, X, Y, min, max }
  }, [rows, da, a, giorni, accese])

  const m = sel ? G.veri.find((r) => r.date === sel) ?? null : null

  function tocca(e: MouseEvent<SVGSVGElement>) {
    if (trascinato.current) { trascinato.current = false; return }
    const box = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - box.left) * W / box.width
    const piuVicino = (lista: BodyMeasurement[]) => {
      let meglio: string | null = null, dist = Infinity
      for (const r of lista) { const d = Math.abs(G.X(r.date) - x); if (d < dist) { dist = d; meglio = r.date } }
      return { meglio, dist }
    }
    // Il dito è largo: un punto azzurro vicino vince sulla pesata più vicina.
    const nota = piuVicino(G.veri.filter((r) => haNota(r) && !r.soloGiornata))
    const scelto = nota.meglio && nota.dist <= RAGGIO_DITO ? nota.meglio : piuVicino(G.veri).meglio
    setSel(sel === scelto ? null : scelto)
  }

  const corto = giorni <= 100, tacche = giorni >= 1 && giorni <= 6 ? giorni : 4
  const mobileDel = (k: Mobile, g: string) => G.serie.find((s) => s.k === k)?.punti.find((p) => p.date === g)?.v ?? null

  return (
    <>
      <div className="ap-periodi">
        {PERIODI.map((p) => <button key={p} className={per === p ? 'on' : ''} onClick={() => setPer(p)}>{p}</button>)}
      </div>
      {per === 'Range' && (
        <div className="ap-range">
          <input type="date" aria-label="Dal" value={range.da} max={range.a} onChange={(e) => e.target.value && setRange({ ...range, da: e.target.value })} />
          <input type="date" aria-label="Al" value={range.a} min={range.da} max={oggi} onChange={(e) => e.target.value && setRange({ ...range, a: e.target.value })} />
        </div>
      )}
      {G.veri.length < 2 ? (
        <p className="ap-dida" style={{ padding: '50px 0' }}>Servono almeno 2 pesate nel periodo.</p>
      ) : (
        <svg className="ap-graf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Andamento del peso" ref={setSvg} onClick={tocca}>
          {[0, 1, 2, 3].map((i) => {
            const v = G.y0 + (G.y1 - G.y0) * i / 3, y = G.Y(v)
            return (
              <g key={i}>
                <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--line-soft)" />
                <text x={L - 5} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">{virg(v)}</text>
              </g>
            )
          })}
          {Array.from({ length: tacche + 1 }, (_, i) => {
            const g = piuGiorni(da, Math.round(giorni * i / tacche))
            return <text key={i} x={G.X(g)} y={H - 5} textAnchor={i === 0 ? 'start' : i === tacche ? 'end' : 'middle'} fontSize={10} fill="var(--muted)">{corto ? breve(g) : mese(g)}</text>
          })}
          <path d={G.veri.map((r, i) => `${i ? 'L' : 'M'}${G.X(r.date).toFixed(1)} ${G.Y(r.weight).toFixed(1)}`).join(' ')} fill="none" stroke="#4b4840" strokeWidth={1} />
          {G.veri.length <= 31 && G.veri.map((r) => <circle key={r.date} cx={G.X(r.date)} cy={G.Y(r.weight)} r={2} fill="#6b675e" />)}
          {[...G.serie].reverse().map((s) => {
            let d = '', su = false
            for (const p of s.punti) {
              if (p.v == null) { su = false; continue }
              d += `${su ? 'L' : 'M'}${G.X(p.date).toFixed(1)} ${G.Y(p.v).toFixed(1)}`
              su = true
            }
            return <path key={s.k} d={d} fill="none" stroke={STILE[s.k].col} strokeWidth={STILE[s.k].w} strokeDasharray={STILE[s.k].dash} strokeLinejoin="round" strokeLinecap="round" />
          })}
          {G.veri.filter((r) => haNota(r) && !r.soloGiornata).map((r) => <circle key={'n' + r.date} cx={G.X(r.date)} cy={G.Y(r.weight)} r={2.8} fill={AZZURRO} stroke="var(--surface)" strokeWidth={1} />)}
          {G.max && <Bandiera x={G.X(G.max.date)} y={G.Y(G.max.v)} testo={`MAX ${virg(G.max.v)}`} col="#c2625b" sopra />}
          {G.min && <Bandiera x={G.X(G.min.date)} y={G.Y(G.min.v)} testo={`MIN ${virg(G.min.v)}`} col="var(--good)" sopra={false} />}
          {m && (
            <>
              <line x1={G.X(m.date)} x2={G.X(m.date)} y1={T} y2={H - B} stroke="#f3f1ec55" />
              <circle cx={G.X(m.date)} cy={G.Y(m.weight)} r={4} fill="#f3f1ec" stroke="var(--surface)" strokeWidth={1.5} />
            </>
          )}
        </svg>
      )}
      <div className="ap-mobili">
        {MOBILI.map((k) => (
          <button key={k} className={accese.includes(k) ? 'on' : ''} onClick={() => setAccese(accese.includes(k) ? accese.filter((x) => x !== k) : [...accese, k])}>
            <span style={{ borderTopStyle: STILE[k].bordo as 'solid', borderTopColor: accese.includes(k) ? STILE[k].col : 'var(--faint)' }} />MA{k}
          </button>
        ))}
        {zoom && <button className="ap-riduci" onClick={() => setZoom(null)}>Riduci</button>}
      </div>
      <div className="ap-dida">
        {m ? (
          <>
            <b>{breve(m.date)}{m.date.slice(0, 4) !== D.slice(0, 4) ? `.${m.date.slice(2, 4)}` : ''} · {virg(m.weight)} kg</b>
            {MOBILI.filter((k) => accese.includes(k)).map((k) => { const v = mobileDel(k, m.date); return v != null ? ` · MA${k} ${virg(v)}` : '' }).join('')}
            {m.tags?.length ? <span style={{ color: AZZURRO }}> — {testoTag(m.tags)}</span> : null}
            {m.note?.trim() ? <span style={{ color: m.tags?.length ? '#b5afa3' : AZZURRO }}>{m.tags?.length ? ' · ' : ' — '}{m.note}</span> : null}
          </>
        ) : (
          <><span style={{ color: AZZURRO }}>●</span> giorno con nota · {corto ? `${breve(da)} – ${breve(a)}` : `${mese(da)} – ${mese(a)}`} · {giorni + 1} gg</>
        )}
      </div>
    </>
  )
}

/** Il riquadro in cima a Corpo: situazione al giorno scelto e andamento. */
export function AnalisiPeso({ rows, obiettivo, chart, onChart, bfPochi, children }: {
  rows: BodyMeasurement[]
  obiettivo?: number
  chart: Grafico
  onChart: (g: Grafico) => void
  bfPochi: boolean
  /** I grafici di % grasso e circonferenze, quando sono scelti. */
  children?: ReactNode
}) {
  const oggi = todayISO()
  const [D, setD] = useState(oggi)
  const [modifica, setModifica] = useState(false)
  const [testoObj, setTestoObj] = useState('')
  const s = useMemo(() => situazione(rows, D), [rows, D])

  const riga = rows.find((r) => r.date === D)
  const daObiettivo = obiettivo != null && s.ultima ? s.ultima.weight - obiettivo : null
  const valObj = parseNum(testoObj, { min: 20, max: 400 })
  const colDeltaSett = s.delta == null ? 'var(--muted)' : s.provvisorio ? '#a9a498' : colDelta(s.delta, 2)

  function apriObiettivo() {
    setTestoObj(obiettivo != null ? virg(obiettivo) : '')
    setModifica(!modifica)
  }

  return (
    <div className="ap">
      <div className="ap-giorno">
        <button className="ap-fr" aria-label="Giorno prima" onClick={() => setD(piuGiorni(D, -1))}>‹</button>
        <label>
          <span className="ap-ey">Situazione al</span>
          <span className="ap-data">
            <input type="date" aria-label="Situazione al" value={D} max={oggi} onChange={(e) => e.target.value && setD(e.target.value > oggi ? oggi : e.target.value)} />▾
          </span>
        </label>
        <button className="ap-fr" aria-label="Giorno dopo" disabled={D >= oggi} onClick={() => setD(piuGiorni(D, 1))}>›</button>
        <button className="ap-ora" onClick={() => setD(oggi)}>Oggi</button>
      </div>

      <div className="card">
        <div className="row spread">
          <span className="ap-ey">Δ media vs settimana scorsa</span>
          {s.provvisorio && <span className="ap-prov">Provvisorio</span>}
        </div>
        <div className="ap-sett">
          <div className="num ap-delta" style={{ color: colDeltaSett }}>
            {s.delta == null ? '—' : <>{segno(s.delta, 2)}<small>kg</small></>}
          </div>
          <div className="ap-medie">
            <div>
              <div className="num ap-v">{s.mediaCor == null ? '—' : virg(s.mediaCor, 2)}</div>
              <div className="ap-s">{breve(s.lun)}–{breve(s.dom)}</div>
              <div className="ap-s">{s.nCor}/7 gg</div>
            </div>
            <div>
              <div className="num ap-v" style={{ color: '#c9c4b9' }}>{s.mediaPrec == null ? '—' : virg(s.mediaPrec, 2)}</div>
              <div className="ap-s">{breve(s.lunPrec)}–{breve(s.domPrec)}</div>
              <div className="ap-s">{s.nPrec}/7 gg</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card ap-tre">
        <div>
          <div className="ap-ey">Odierno</div>
          <div className="num ap-v">{s.odierno != null ? <>{virg(s.odierno)}<small>kg</small></> : '—'}</div>
          <div className="ap-s">
            {s.odierno != null
              ? `${breve(D)}${riga?.bodyFat != null ? ` · BF ${virg(riga.bodyFat)}%` : ''}`
              : s.ultima ? `ultima ${virg(s.ultima.weight)} · ${breve(s.ultima.date)}` : ''}
          </div>
        </div>
        <div>
          <div className="ap-ey">Δ giorno</div>
          <div className="num ap-v" style={{ color: s.deltaGiorno == null ? 'var(--muted)' : colDelta(s.deltaGiorno) }}>
            {s.deltaGiorno != null ? <>{segno(s.deltaGiorno)}<small>kg</small></> : '—'}
          </div>
          <div className="ap-s">{s.precedente ? `vs ${breve(s.precedente)}` : 'dopo la pesata'}</div>
        </div>
        <button onClick={apriObiettivo}>
          <div className="ap-ey">Da obiettivo<span className="ap-matita">✎&#xFE0E;</span></div>
          <div className="num ap-v">{daObiettivo != null ? <>{segno(daObiettivo)}<small>kg</small></> : '—'}</div>
          <div className="ap-s">{obiettivo != null ? `obiettivo ${virg(obiettivo)}` : 'imposta'}</div>
        </button>
      </div>

      {modifica && (
        <div className="card ap-obiettivo">
          <span className="ap-ey">Peso obiettivo</span>
          <input inputMode="decimal" aria-label="Peso obiettivo in kg" value={testoObj} onChange={(e) => setTestoObj(e.target.value)} />
          <button className="ap-pri" disabled={valObj == null} onClick={() => { void updateUser({ pesoObiettivo: valObj ?? undefined }); setModifica(false) }}>Salva</button>
          <button className="ap-gh" onClick={() => { void updateUser({ pesoObiettivo: undefined }); setModifica(false) }}>Togli</button>
        </div>
      )}

      <div className="card">
        <div className="row spread">
          <span className="ap-ey">Andamento</span>
          <span className="row" style={{ gap: 4 }}>
            <button className={chart === 'weight' ? 'chip on' : 'chip'} onClick={() => onChart('weight')}>Peso</button>
            <button className={chart === 'bf' ? 'chip on' : 'chip'} onClick={() => onChart('bf')} disabled={bfPochi}>% grasso</button>
            <button className={chart === 'circ' ? 'chip on' : 'chip'} onClick={() => onChart('circ')}>Circonf.</button>
          </span>
        </div>
        {chart === 'weight' ? <Andamento rows={rows} D={D} oggi={oggi} /> : <div style={{ marginTop: 8 }}>{children}</div>}
      </div>
    </div>
  )
}

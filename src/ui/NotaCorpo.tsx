// Nota del giorno (testo + tag) e guida alle circonferenze.
//
// La nota sta sulla pesata: si scrive in Corpo, si corregge dalla riga dello
// storico, e da Oggi si apre col foglio qui sotto senza passare da Corpo.
// Il colore dice di quando parla il tag: azzurro = ieri sera, oro = oggi.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import { useHoldDrag } from './useHoldDrag'
import { pushUndo } from '../util/undo'
import { listaTag, salvaListaTag, aggiungiTag, rinominaTag, eliminaTag, usoTag, misuraDel, salvaNota, CIRC } from '../db/noteCorpo'
import type { TagNota } from '../db/schema'

export const AZZURRO = '#8e9be0'

/** Il foglio dal basso, in un portal: dentro .app un fixed non si ancora allo schermo. */
function Foglio({ onClose, alto, children }: { onClose: () => void; alto?: boolean; children: React.ReactNode }) {
  useBloccoScroll()
  useIndietro(onClose)
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: alto ? '94vh' : '88vh', overflowY: 'auto', background: '#171613',
          borderTop: '1px solid var(--line)', borderRadius: '22px 22px 0 0',
          padding: '12px 16px calc(16px + var(--sicuro-basso))', boxShadow: '0 -18px 40px #000a',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
        <div style={{ width: 40, height: 4, borderRadius: 9, background: '#3a3730', margin: '0 auto 2px', flex: 'none' }} />
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** I tag di un giorno, solo da leggere. */
export function ChipTags({ tags }: { tags?: TagNota[] }) {
  if (!tags?.length) return null
  return (
    <>
      {tags.map((x) => (
        <span key={x.t} className={'chip' + (x.ieri ? ' ieri' : ' on')} style={{ fontSize: 10.5, padding: '1px 7px' }}>
          {x.ieri ? '↶ ' : ''}{x.t}
        </span>
      ))}
    </>
  )
}

/**
 * Scelta dei tag. «Riguarda» decide come si segna il prossimo tag che tocchi:
 * parte da ieri sera, perché ti pesi la mattina e di solito racconti la sera
 * prima. Un secondo tocco sul tag lo toglie.
 */
export function SceltaTag({ tags, onChange, titolo = 'Nota · riguarda' }: {
  tags: TagNota[]
  onChange: (t: TagNota[]) => void
  titolo?: string
}) {
  const lista = useLiveQuery(listaTag, []) ?? []
  const [ieri, setIeri] = useState(true)
  const [nuovo, setNuovo] = useState<string | null>(null)
  const [gestisci, setGestisci] = useState(false)
  // Un tag tolto dalla lista ma messo quel giorno resta visibile: lo devi poter togliere.
  const tutti = [...lista, ...tags.map((x) => x.t).filter((t) => !lista.includes(t))]

  function tocca(t: string) {
    const c = tags.find((x) => x.t === t)
    onChange(c ? tags.filter((x) => x.t !== t) : [...tags, ieri ? { t, ieri: true } : { t }])
  }
  async function aggiungi() {
    const n = await aggiungiTag(nuovo ?? '')
    setNuovo(null)
    if (n && !tags.some((x) => x.t === n)) onChange([...tags, ieri ? { t: n, ieri: true } : { t: n }])
  }

  const seg = (on: boolean, oro: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 0', fontSize: 12, borderRadius: 999, border: 'none',
    background: on ? (oro ? 'var(--gold-bg)' : '#161a2e') : 'transparent',
    color: on ? (oro ? 'var(--gold)' : AZZURRO) : 'var(--muted)', fontWeight: on ? 600 : 400,
  })

  return (
    <div>
      <div className="row spread">
        {titolo && <label className="fl" style={{ margin: 0 }}>{titolo}</label>}
        <div style={{ display: 'flex', gap: 4, padding: 3, border: '1px solid var(--line)', borderRadius: 999, width: titolo ? 170 : '100%' }}>
          <button style={seg(ieri, false)} onClick={() => setIeri(true)}>↶ ieri sera</button>
          <button style={seg(!ieri, true)} onClick={() => setIeri(false)}>oggi</button>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
        {tutti.map((t) => {
          const c = tags.find((x) => x.t === t)
          return (
            <button key={t} className={'chip' + (c ? (c.ieri ? ' ieri' : ' on') : '')} style={{ padding: '4px 10px' }} onClick={() => tocca(t)}>
              {c?.ieri ? '↶ ' : ''}{t}
            </button>
          )
        })}
        {nuovo == null ? (
          <>
            <button className="chip agg" style={{ padding: '4px 10px' }} onClick={() => setNuovo('')} aria-label="Nuovo tag">＋</button>
            <button className="chip agg" style={{ padding: '4px 10px' }} onClick={() => setGestisci(true)}>✎ tag</button>
          </>
        ) : (
          <span className="row" style={{ gap: 4, flex: '1 1 160px' }}>
            <input autoFocus value={nuovo} placeholder="nuovo tag" onChange={(e) => setNuovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') aggiungi() }}
              style={{ flex: 1, minWidth: 0, padding: '5px 10px', fontSize: 14, borderRadius: 999 }} />
            <button className="chip on" style={{ padding: '4px 10px' }} disabled={!nuovo.trim()} onClick={aggiungi}>✓</button>
            <button className="chip" style={{ padding: '4px 10px' }} onClick={() => setNuovo(null)}>✕</button>
          </span>
        )}
      </div>
      {gestisci && <GestisciTag onClose={() => setGestisci(false)} />}
    </div>
  )
}

/** I tuoi tag: aggiungi, rinomina, elimina, riordina tenendo premuto. */
export function GestisciTag({ onClose }: { onClose: () => void }) {
  const lista = useLiveQuery(listaTag, []) ?? []
  const uso = useLiveQuery(usoTag, []) ?? {}
  const [nuovo, setNuovo] = useState('')
  const [ed, setEd] = useState<{ da: string; a: string } | null>(null)
  const [conferma, setConferma] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const { press, inDragOrder, liftStyle, skipClick } = useHoldDrag((_, ids) => salvaListaTag(ids))

  async function elimina(t: string) {
    const prima = await eliminaTag(t)
    setConferma(null)
    pushUndo(`«${t}» tolto dai tag`, () => salvaListaTag(prima))
  }
  const giorni = (n?: number) => (!n ? 'mai usato' : n === 1 ? '1 giorno' : `${n} giorni`)
  const icona: React.CSSProperties = { width: 30, padding: '4px 0', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13 }

  return (
    <Foglio onClose={onClose} alto>
      <div className="row spread">
        <span style={{ fontWeight: 700, fontSize: 15 }}>I tuoi tag</span>
        <button className="ghost small" style={{ color: 'var(--gold)', fontWeight: 600, border: 'none', padding: '4px 0' }} onClick={onClose}>Fatto</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input value={nuovo} placeholder="nuovo tag" onChange={(e) => setNuovo(e.target.value)}
          onKeyDown={async (e) => { if (e.key === 'Enter' && nuovo.trim()) { await aggiungiTag(nuovo); setNuovo('') } }}
          style={{ flex: 1, minWidth: 0, padding: '9px 11px' }} />
        <button className="primary" style={{ flex: 'none', padding: '9px 14px' }} disabled={!nuovo.trim()}
          onClick={async () => { await aggiungiTag(nuovo); setNuovo('') }}>＋ Aggiungi</button>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>Tieni premuto un tag per spostarlo.</div>
      <div style={{ borderTop: '1px solid var(--line-soft)' }}>
        {inDragOrder('tag', lista, (t) => t).map((t) => ed?.da === t ? (
          <div key={t} className="row" style={{ gap: 6, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <input autoFocus value={ed.a} onChange={(e) => { setEd({ da: t, a: e.target.value }); setErrore(null) }}
              style={{ flex: 1, minWidth: 0, padding: '6px 10px', fontSize: 14 }} />
            <button style={{ ...icona, color: 'var(--good)', fontWeight: 700 }} onClick={async () => {
              if (await rinominaTag(t, ed.a)) setEd(null)
              else setErrore(ed.a.trim() === t ? null : 'Nome vuoto o già usato da un altro tag.')
              if (ed.a.trim() === t) setEd(null)
            }}>✓</button>
            <button style={icona} onClick={() => { setEd(null); setErrore(null) }}>✕</button>
          </div>
        ) : (
          <div key={t} data-drag-id={t} onPointerDown={press('tag', t)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13.5, background: '#171613', touchAction: 'pan-y', ...liftStyle('tag', t) }}>
            <span style={{ color: 'var(--faint)', fontSize: 11, letterSpacing: -2 }}>⋮⋮</span>
            <span style={{ flex: 1 }}>{t}</span>
            <span className="muted" style={{ fontSize: 11 }}>{giorni(uso[t])}</span>
            <button style={icona} aria-label={`Rinomina ${t}`} onClick={() => { if (skipClick.current) { skipClick.current = false; return } setEd({ da: t, a: t }); setErrore(null) }}>✎</button>
            <button style={icona} aria-label={`Elimina ${t}`} onClick={() => { if (skipClick.current) { skipClick.current = false; return } if (uso[t]) setConferma(t); else elimina(t) }}>🗑</button>
          </div>
        ))}
      </div>
      {errore && <p className="small" style={{ margin: 0, color: '#e57373' }}>{errore}</p>}
      {conferma && (
        <div style={{ fontSize: 12, lineHeight: 1.45, background: '#1a1210', border: '1px solid #4a2a22', borderRadius: 10, padding: '8px 10px' }}>
          <b style={{ color: '#e57373' }}>Eliminare «{conferma}»?</b> È usato in {giorni(uso[conferma])}: lì resta scritto, sparisce solo dall'elenco da toccare.
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className="ghost" style={{ flex: 1 }} onClick={() => setConferma(null)}>Annulla</button>
            <button className="ghost" style={{ flex: 1, color: '#e57373', borderColor: '#4a2a22' }} onClick={() => elimina(conferma)}>Elimina</button>
          </div>
        </div>
      )}
    </Foglio>
  )
}

/** Il foglio della nota, da Oggi: sulla pesata del giorno, che c'è già. */
export function FoglioNota({ date, onClose }: { date: string; onClose: () => void }) {
  const m = useLiveQuery(() => misuraDel(date).then((x) => x ?? null), [date])
  const [tags, setTags] = useState<TagNota[]>([])
  const [note, setNote] = useState('')
  const [pronto, setPronto] = useState(false)
  // Parte da quello che c'è già, una volta sola: dopo, comandi tu.
  useEffect(() => {
    if (m === undefined || pronto) return
    setTags(m?.tags ?? []); setNote(m?.note ?? ''); setPronto(true)
  }, [m, pronto])

  return (
    <Foglio onClose={onClose}>
      <div className="row spread">
        <span style={{ fontWeight: 700, fontSize: 15 }}>Nota di oggi</span>
        {m && <span className="muted small">{String(m.weight).replace('.', ',')} kg ✓</span>}
      </div>
      {pronto && (
        <>
          <SceltaTag tags={tags} onChange={setTags} titolo="" />
          <textarea rows={2} value={note} placeholder="Scrivi una nota (facoltativa)" onChange={(e) => setNote(e.target.value)}
            style={{ fontSize: 14, padding: '9px 11px', resize: 'none' }} />
          <div className="row" style={{ gap: 6 }}>
            <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Chiudi</button>
            <button className="primary" style={{ flex: 2 }} disabled={!m}
              onClick={async () => { if (await salvaNota(date, note, tags)) onClose() }}>Salva</button>
          </div>
        </>
      )}
    </Foglio>
  )
}

/** Dove passa il metro: figura e istruzioni, un colore per misura. */
export function GuidaMisure({ onClose }: { onClose: () => void }) {
  const ordine = ['chest', 'waistNarrow', 'waist', 'arm', 'thigh']
  const voci = ordine.map((k) => CIRC.find((c) => c.k === k)!)
  const col = (k: string) => CIRC.find((c) => c.k === k)!.col
  return (
    <Foglio onClose={onClose} alto>
      <div className="row spread">
        <span style={{ fontWeight: 700, fontSize: 15 }}>Come misurare</span>
        <button aria-label="Chiudi" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: '2px 6px' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, alignItems: 'start' }}>
        <svg viewBox="0 0 120 250" style={{ width: 100, height: 'auto' }} aria-hidden="true">
          <g fill="#1c1b18" stroke="#5d5951" strokeWidth="1.4" strokeLinejoin="round">
            <circle cx="60" cy="20" r="13" />
            <path d="M52 32 L68 32 L70 40 L90 46 Q98 50 99 60 L104 104 Q105 110 100 111 L96 111 L90 66 L86 64 L84 98 Q82 106 84 114 L86 124 L80 126 Q72 129 60 129 Q48 129 40 126 L34 124 L36 114 Q38 106 36 98 L34 64 L30 66 L24 111 L20 111 Q15 110 16 104 L21 60 Q22 50 30 46 L50 40 Z" />
            <path d="M36 124 L84 124 L86 140 L80 236 L66 236 L62 150 L58 150 L54 236 L40 236 L34 140 Z" />
          </g>
          <g strokeWidth="2.2" strokeLinecap="round">
            <line x1="31" y1="62" x2="89" y2="62" stroke={col('chest')} />
            <line x1="34" y1="94" x2="86" y2="94" stroke={col('waistNarrow')} />
            <line x1="35" y1="108" x2="85" y2="108" stroke={col('waist')} />
            <line x1="17" y1="76" x2="27" y2="78" stroke={col('arm')} />
            <line x1="38" y1="176" x2="57" y2="176" stroke={col('thigh')} />
          </g>
          <circle cx="60" cy="108" r="1.6" fill="#8f8a80" />
        </svg>
        <div style={{ display: 'grid', gap: 8 }}>
          {voci.map((c) => (
            <div key={c.k} style={{ fontSize: 12, lineHeight: 1.38, color: '#c9c4b9', paddingLeft: 13, position: 'relative' }}>
              <i style={{ position: 'absolute', left: 0, top: 5, width: 8, height: 8, borderRadius: 2, background: c.col }} />
              <b style={{ color: 'var(--text)', display: 'block', fontSize: 12.5 }}>{c.nome}</b>{c.come}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--muted)', borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
        <b style={{ color: 'var(--text)' }}>Ogni volta uguale</b> · la mattina, dopo il bagno, a digiuno, prima di allenarti.
        Metro aderente ma senza stringere la pelle, parallelo al pavimento. Due misure: se differiscono più di 0,5 cm, una terza.
      </div>
    </Foglio>
  )
}

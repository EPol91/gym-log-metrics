// La revisione delle sedute del coach: una domanda alla volta, in una finestra.
// Decidi tu ogni abbinamento, ogni esercizio tolto e ogni prescrizione
// cambiata; si salva tutto insieme alla fine, e «Annulla» non scrive niente.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { allExercises } from '../db/repo'
import { ExercisePicker } from './ExercisePicker'
import { useBloccoScroll } from './useBloccoScroll'
import { prossimaDomanda, applicaRevisione, type Revisione, type Scelta } from '../rs/schede'

const titolo = (nome: string) => nome.replace(/^🦠\s*/, '')

export function RevisioneSchede({ rev, onFine }: { rev: Revisione; onFine: (salvato: boolean) => void }) {
  useBloccoScroll()
  const lista = useLiveQuery(allExercises, []) ?? []
  const nomeDi = (id: string) => lista.find((e) => e.id === id)?.name ?? rev.esercizi.get(id)?.name ?? '—'
  const [scelte, setScelte] = useState<Scelta[]>([])
  const [libreria, setLibreria] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const d = prossimaDomanda(rev, scelte)
  const metti = (s: Scelta) => setScelte([...scelte, s])

  const salva = async () => {
    setSalvo(true); setErrore(null)
    try { await applicaRevisione(rev, scelte); onFine(true) } catch (e) { setErrore((e as Error).message); setSalvo(false) }
  }

  const bottone = { width: '100%', marginTop: 6 } as const
  const scatola = { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginTop: 8 } as const

  let corpo: React.ReactNode
  if (d?.tipo === 'abbina') {
    const c = d.seduta.coach[d.i]
    corpo = (
      <>
        <p className="small" style={{ margin: 0 }}>Esercizio nuovo o cambiato dal coach. Decidi tu cosa fare in questa seduta.</p>
        <div style={scatola}>
          <div className="muted" style={{ fontSize: 11 }}>il coach</div>
          <strong style={{ fontSize: 15, color: 'var(--rs)' }}>{c.nome}</strong>
          {c.catalogo && <div className="muted small">dal suo catalogo: {c.catalogo}</div>}
          {c.sr && <div className="small" style={{ marginTop: 4 }}>{c.sr}</div>}
        </div>
        {d.proposta && (
          <div style={scatola}>
            <div className="muted" style={{ fontSize: 11 }}>{d.daSeduta ? 'nella tua seduta adesso' : 'nella tua libreria'}</div>
            <strong style={{ fontSize: 15 }}>{nomeDi(d.proposta)}</strong>
          </div>
        )}
        {d.proposta && (
          <button className="primary" style={bottone} onClick={() => metti({ tipo: 'abbina', codice: d.seduta.codice, i: d.i, exerciseId: d.proposta! })}>
            Tengo «{nomeDi(d.proposta)}»
          </button>
        )}
        <button className={d.proposta ? '' : 'primary'} style={bottone} onClick={() => setLibreria(true)}>Scelgo dalla mia libreria…</button>
        <button className="ghost" style={bottone} onClick={() => metti({ tipo: 'crea', codice: d.seduta.codice, i: d.i })}>
          Creo «{c.nome}» come esercizio nuovo
        </button>
        <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>La sua prescrizione va nelle note dell'esercizio che scegli. Lo storico non si tocca.</p>
        {libreria && (
          <ExercisePicker titolo={`Al posto di «${c.nome}»`} onClose={() => setLibreria(false)}
            onPick={(id) => { setLibreria(false); metti({ tipo: 'abbina', codice: d.seduta.codice, i: d.i, exerciseId: id }) }} />
        )}
      </>
    )
  } else if (d?.tipo === 'tolto') {
    corpo = (
      <>
        <p className="small" style={{ margin: 0 }}>Nella sua scheda di questa seduta non c'è più:</p>
        <div style={scatola}><strong style={{ fontSize: 15 }}>{nomeDi(d.exerciseId)}</strong></div>
        <button className="primary" style={bottone} onClick={() => metti({ tipo: 'tolto', codice: d.seduta.codice, exerciseId: d.exerciseId, togli: true })}>
          Lo tolgo dalla seduta
        </button>
        <button style={bottone} onClick={() => metti({ tipo: 'tolto', codice: d.seduta.codice, exerciseId: d.exerciseId, togli: false })}>
          Lo tengo
        </button>
        <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>In tutti e due i casi lo storico resta.</p>
      </>
    )
  } else if (d?.tipo === 'prescrizione') {
    corpo = (
      <>
        <p className="small" style={{ margin: 0 }}>Il coach ha cambiato la prescrizione di <strong>{nomeDi(d.exerciseId)}</strong>.</p>
        <div style={scatola}>
          <div className="muted" style={{ fontSize: 11 }}>adesso nelle tue note</div>
          <div className="small muted">{d.prima ?? '— niente'}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>il coach</div>
          <div className="small" style={{ color: 'var(--gold)' }}>{d.dopo}</div>
        </div>
        <button className="primary" style={bottone} onClick={() => metti({ tipo: 'prescrizione', codice: d.seduta.codice, exerciseId: d.exerciseId, sr: d.dopo, applica: true })}>
          Applico la sua
        </button>
        <button style={bottone} onClick={() => metti({ tipo: 'prescrizione', codice: d.seduta.codice, exerciseId: d.exerciseId, sr: d.dopo, applica: false })}>
          Tengo la mia
        </button>
      </>
    )
  } else {
    corpo = (
      <>
        <p className="small" style={{ margin: 0 }}>{scelte.length ? 'Pronto da salvare:' : 'Le sedute sono uguali a quelle del coach.'}</p>
        <div className="small" style={{ marginTop: 6, lineHeight: 1.55 }}>
          {scelte.map((s, k) => {
            const sed = rev.sedute.find((x) => x.codice === s.codice)!
            const testo =
              s.tipo === 'abbina' ? `«${sed.coach[s.i].nome}» → ${nomeDi(s.exerciseId)}`
                : s.tipo === 'crea' ? `«${sed.coach[s.i].nome}» → esercizio nuovo`
                  : s.tipo === 'tolto' ? `${nomeDi(s.exerciseId)}: ${s.togli ? 'tolto dalla seduta' : 'resta'}`
                    : `${nomeDi(s.exerciseId)}: ${s.applica ? 'prescrizione nuova' : 'tieni la tua'}`
            return <div key={k}>· <span className="muted">{s.codice}</span> {testo}</div>
          })}
        </div>
        {errore && <p className="small" style={{ color: 'var(--rs)' }}>{errore}</p>}
        {scelte.length > 0 && (
          <button className="primary" style={{ ...bottone, marginTop: 10 }} disabled={salvo} onClick={salva}>
            {salvo ? 'salvo…' : 'Salva nelle sedute'}
          </button>
        )}
      </>
    )
  }

  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 900, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', margin: '0 8px' }}>
        <div className="row spread" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <strong style={{ fontSize: 15 }}>{d ? `🦠 ${titolo(d.seduta.nome)}` : 'Sedute del coach'}</strong>
          <span className="muted small">{scelte.length ? `${scelte.length} decis${scelte.length === 1 ? 'a' : 'e'}` : ''}</span>
        </div>
        {corpo}
        <div className="row spread" style={{ marginTop: 10 }}>
          <button className="ghost small" disabled={!scelte.length || salvo} onClick={() => setScelte(scelte.slice(0, -1))}>← indietro</button>
          <button className="ghost small" disabled={salvo} onClick={() => onFine(false)}>Annulla</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}


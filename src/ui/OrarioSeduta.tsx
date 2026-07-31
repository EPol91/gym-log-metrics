// Inizio e fine di una seduta: registrati da soli, correggibili a mano.
//
// Il cronometro parte quando tocchi "inizia" e si ferma quando chiudi, che non
// e' sempre quando hai davvero smesso. Se non li puoi correggere, quella durata
// resta sbagliata per sempre — e con lei ogni confronto fra sedute.

import { useState } from 'react'
import { setSessionTimes } from '../db/repo'

const oraDi = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Rimette un'ora "hh:mm" sulla data della seduta, senza spostarla di giorno. */
const conOra = (isoBase: string, hhmm: string): string | null => {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(isoBase)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function OrarioSeduta({ sessionId, startedAt, finishedAt }: {
  sessionId: string; startedAt: string; finishedAt: string | null
}) {
  const [apri, setApri] = useState(false)
  const [da, setDa] = useState(oraDi(startedAt))
  const [a, setA] = useState(oraDi(finishedAt))

  const durata = finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000))
    : null

  if (!apri) {
    return (
      <div className="row spread" onClick={() => { setDa(oraDi(startedAt)); setA(oraDi(finishedAt)); setApri(true) }}
        style={{ cursor: 'pointer' }}>
        <span className="muted">Orario</span>
        <strong>
          {oraDi(startedAt)}{finishedAt ? ` – ${oraDi(finishedAt)}` : ' · in corso'}
          {durata != null && <span className="muted small"> · {durata} min</span>}
          <span className="muted small"> ✎</span>
        </strong>
      </div>
    )
  }

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label style={{ flex: 1 }}>
          <span className="fl">Inizio</span>
          <input type="time" value={da} onChange={(e) => setDa(e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          <span className="fl">Fine</span>
          <input type="time" value={a} onChange={(e) => setA(e.target.value)} disabled={!finishedAt} />
        </label>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="primary" style={{ flex: 1 }} onClick={async () => {
          const inizio = conOra(startedAt, da)
          const fine = finishedAt && a ? conOra(finishedAt, a) : finishedAt
          if (!inizio) return
          // Fine prima dell'inizio: e' una seduta finita dopo mezzanotte, non un errore.
          const fineOk = fine && new Date(fine) < new Date(inizio)
            ? new Date(new Date(fine).getTime() + 86400_000).toISOString()
            : fine
          await setSessionTimes(sessionId, inizio, fineOk)
          setApri(false)
        }}>Salva</button>
        <button className="chip" onClick={() => setApri(false)}>annulla</button>
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        La durata diventa la distanza fra questi due orari.
      </p>
    </div>
  )
}

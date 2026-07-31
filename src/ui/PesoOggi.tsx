// Il peso di oggi, dove serve ricordarlo.
//
// È il dato che regge tutto il resto — calorie, andamento, Score, e quello che
// arriva al coach — ed è anche quello che salta più facilmente. Se manca proprio
// nei giorni in cui ti alleni, i confronti si bucano lì.
//
// Regola: avvisi, mai muri. Nessuna finestra che ti sbarra la strada.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { upsertMeasurement, todayISO } from '../db/repo'
import { parseNum } from '../util/validate'

const U = LOCAL_USER_ID

/** Misure del giorno indicato (oggi se non dici altro). */
export function measurementOn(date: string = todayISO()) {
  return db.bodyMeasurements.where('date').equals(date).filter((m) => m.userId === U).first()
}

/** L'ultimo peso registrato prima di oggi: serve come riferimento nel campo vuoto. */
async function ultimoPeso(): Promise<{ weight: number; date: string } | null> {
  const tutte = await db.bodyMeasurements.where('userId').equals(U).sortBy('date')
  const prima = tutte.filter((m) => m.date < todayISO() && m.weight != null).pop()
  return prima ? { weight: prima.weight, date: prima.date } : null
}

/**
 * Il peso di oggi c'è? `undefined` finché la risposta non è arrivata: chi chiama
 * non deve mostrare "manca" mentre sta ancora leggendo.
 */
export function usePesoOggi(): { peso: number | null; letto: boolean } {
  // Il `?? null` non e' un vezzo: Dexie restituisce `undefined` sia mentre sta
  // leggendo sia quando la riga non c'e'. Senza distinguerli, "manca" non si
  // accende mai perche' l'assenza sembra un caricamento eterno.
  const m = useLiveQuery(() => measurementOn().then((x) => x ?? null), [])
  return { peso: m?.weight ?? null, letto: m !== undefined }
}

/**
 * Riquadro del peso.
 * - `dentro: 'check'`  → in cima al Check del giorno.
 * - `dentro: 'seduta'` → all'inizio dell'allenamento, con la via d'uscita.
 * Quando il peso di oggi c'è, si fa piccolo e conferma; non sparisce, così sai
 * che l'hai fatto.
 */
export function PesoOggi({ dentro }: { dentro: 'check' | 'seduta' }) {
  const { peso, letto } = usePesoOggi()
  const ultimo = useLiveQuery(ultimoPeso, [])
  const [w, setW] = useState('')
  const [saltato, setSaltato] = useState(false)
  const n = parseNum(w, { min: 20, max: 400 })

  if (!letto) return null

  if (peso != null) {
    return (
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="row spread" style={{ alignItems: 'center' }}>
          <label className="fl" style={{ margin: 0 }}>⚖️ Peso di oggi</label>
          <span className="small" style={{ color: 'var(--good)' }}>✓ {peso} kg</span>
        </div>
      </div>
    )
  }

  if (saltato) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        Peso di oggi non registrato. Lo aggiungi da Oggi quando vuoi.
      </p>
    )
  }

  return (
    <div className="card ring-invito" style={{ borderColor: 'var(--gold)', borderRadius: 14, marginBottom: 0, display: 'block' }}>
      <div className="row spread" style={{ alignItems: 'center' }}>
        <label className="fl" style={{ margin: 0, color: dentro === 'seduta' ? 'var(--gold)' : undefined }}>
          {dentro === 'seduta' ? '⚖️ Peso di oggi non registrato' : '⚖️ Peso di oggi'}
        </label>
        {dentro === 'check' && <span className="small" style={{ color: 'var(--gold)' }}>manca</span>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input inputMode="decimal" value={w} placeholder={ultimo ? String(ultimo.weight) : 'kg'}
          onChange={(e) => setW(e.target.value)} style={{ flex: 1, textAlign: 'center' }} />
        <button className="primary" style={{ flex: '0 0 auto', padding: '11px 18px' }} disabled={n == null}
          onClick={async () => { if (n != null) await upsertMeasurement(todayISO(), { weight: n }) }}>
          Salva
        </button>
      </div>
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        {dentro === 'seduta'
          ? 'Consiglio: pesati adesso, prima di allenarti. Se salti, la seduta parte lo stesso — resta senza peso nel confronto.'
          : ultimo
            ? `L'ultimo è del ${ultimo.date}: ${ultimo.weight} kg.`
            : 'Non hai ancora registrato nessun peso.'}
      </p>
      {dentro === 'seduta' && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setSaltato(true)}>non ora</button>
      )}
    </div>
  )
}

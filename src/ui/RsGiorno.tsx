// 🦠RS — la domanda di inizio giornata.
//
// Una sola domanda al giorno, che ne risolve due: conferma RS e sceglie che
// giornata segui — e con quella risposta ti compila la giornata, se e' vuota.
// Su una giornata che ha gia' righe non si scrive: quelle sono tue.
//
// Il cambio di data va intercettato al RIENTRO nell'app, non all'avvio: sul
// telefono la PWA resta in memoria e a mezzanotte non riparte niente — lo
// stesso inciampo che ci ha fatto penare con WHOOP.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { getUser, upsertNutrition, getNutrition } from '../db/repo'
import { listDayTypes, applyDayTemplate, logsOfDate } from '../db/diet'
import { todayLocal } from '../util/date'
import { fmtData } from '../util/format'
import { settimanaGiorno, RS_START_DEFAULT } from '../rs/rs'
import type { DayType } from '../db/schema'

const U = LOCAL_USER_ID
const CHIESTO = 'rs-chiesto'
/** Prima di quest'ora la giornata non e' cominciata: la domanda aspetta. */
const ORA_MINIMA = 7

/** Oggi la domanda e' gia' stata fatta? Una volta al giorno, non una a ogni apertura. */
const giaChiesto = (giorno: string) => localStorage.getItem(CHIESTO) === giorno
const segnaChiesto = (giorno: string) => localStorage.setItem(CHIESTO, giorno)

export function RsGiorno() {
  const user = useLiveQuery(getUser, [])
  const tipi = useLiveQuery(listDayTypes, []) ?? []
  const [giorno, setGiorno] = useState(todayLocal())
  const [aperto, setAperto] = useState(false)
  const [scelta, setScelta] = useState<DayType | null>(null)
  const [esito, setEsito] = useState<string | null>(null)

  // Il giorno cambia mentre l'app e' aperta: si guarda al rientro, non al montaggio.
  useEffect(() => {
    const guarda = () => {
      if (document.visibilityState !== 'visible') return
      const oggi = todayLocal()
      setGiorno(oggi)
      // Mezzanotte e' un cambio di data, non l'inizio della tua giornata: a
      // quell'ora sei ancora sveglio e la domanda arriverebbe addosso alla sera
      // prima. Aspetta la mattina.
      if (new Date().getHours() < ORA_MINIMA) return
      // Riaprendo si riparte puliti: il messaggio della volta prima resterebbe
      // li' e terrebbe spento il tasto di conferma.
      if (!giaChiesto(oggi)) { setEsito(null); setScelta(null); setAperto(true) }
    }
    guarda()
    document.addEventListener('visibilitychange', guarda)
    window.addEventListener('focus', guarda)
    return () => {
      document.removeEventListener('visibilitychange', guarda)
      window.removeEventListener('focus', guarda)
    }
  }, [])

  const rsTipi = tipi.filter((t) => t.name.startsWith('🦠'))
  const attivo = user?.rsActive ?? true
  const chiedi = user?.rsAskDaily ?? true
  if (!aperto || !attivo || !chiedi || !rsTipi.length) return null

  const inizio = user?.rsStart ?? RS_START_DEFAULT
  const sg = settimanaGiorno(giorno, inizio)
  const chiudi = () => { segnaChiesto(giorno); setAperto(false) }

  /**
   * Qui compilare e' chiesto: il permesso e' la risposta che hai appena dato.
   *
   * Il tasto lo dice — «Conferma e compila la giornata» — e la giornata si
   * riempie solo se e' vuota: su una che ha gia' righe non si scrive, ne' sopra
   * ne' in coda. Quello che hai scritto vale piu' di un modello.
   */
  async function conferma() {
    if (!scelta) return
    await upsertNutrition(giorno, { dayType: scelta.key as never })
    const righe = await logsOfDate(giorno)
    if (righe.length === 0) {
      const modello = (await db.dayTemplates.where('userId').equals(U).toArray()).find((m) => m.name === scelta!.name)
      if (modello) {
        await applyDayTemplate(modello.id, giorno)
        setEsito(`${scelta.name} compilata. Spunta quello che mangi.`)
      }
    } else {
      setEsito(`${scelta.name} impostata. La giornata aveva già delle righe: non l'ho toccata.`)
    }
    setTimeout(chiudi, 1600)
  }

  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1100, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="rs-tema" style={{
        width: 'min(520px, 100%)', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 18, padding: 16, margin: '0 8px',
      }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--rs)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="5.6" />
            <path d="M18 12h2.6M16.2 7.8l1.9-1.9M12 6V3.4M7.8 7.8L5.9 5.9M6 12H3.4M7.8 16.2l-1.9 1.9M12 18v2.6M16.2 16.2l1.9 1.9" />
            <circle cx="10.2" cy="10.6" r=".95" fill="var(--rs)" stroke="none" />
            <circle cx="13.6" cy="13.2" r=".95" fill="var(--rs)" stroke="none" />
            <circle cx="13.4" cy="9.8" r=".7" fill="var(--rs)" stroke="none" />
          </svg>
          <div>
            <h2 style={{ fontSize: 19 }}>{fmtData(giorno)}</h2>
            <p className="muted small" style={{ margin: '2px 0 0' }}>
              {sg.settimana < 1 ? `Il protocollo inizia il ${fmtData(inizio)}` : sg.label}
            </p>
          </div>
        </div>

        <label className="fl" style={{ marginTop: 14 }}>Che giornata segui oggi?</label>
        <div className="row wrap" style={{ gap: 8 }}>
          {rsTipi.map((t) => (
            <button key={t.id} className={'chip' + (scelta?.id === t.id ? ' on' : '')}
              style={{ fontSize: 13, padding: '9px 14px' }}
              onClick={() => setScelta(t)}>{t.name}</button>
          ))}
        </div>
        {scelta && (
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            {scelta.targets.kcal} kcal — C: {scelta.targets.carbs}, P: {scelta.targets.protein}, G: {scelta.targets.fat}
          </p>
        )}

        {esito && <p className="small" style={{ margin: '10px 0 0', color: 'var(--good)' }}>✓ {esito}</p>}

        <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={!scelta || !!esito}
          onClick={conferma}>
          Conferma e compila la giornata
        </button>
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="chip" onClick={chiudi}>oggi salto RS</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Serve a Dieta per sapere se la giornata e' gia' stata scelta. */
export async function giornataScelta(date: string): Promise<boolean> {
  const n = await getNutrition(date)
  return !!n?.dayType
}

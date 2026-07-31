// La fascia cardio: un solo interruttore, buono ovunque.
//
// La connessione vive in un singleton (heartRate.ts) e sopravvive ai cambi di
// schermata: qui si legge e si accende, nient'altro. Prima l'interruttore stava
// solo dentro il blocco Cardio, e in un allenamento coi pesi la fascia non
// partiva mai — il registratore c'era, il modo di accenderlo no.

import { useEffect, useState } from 'react'
import { isHeartRateSupported, hrSubscribe, hrGetState, hrConnect, hrDisconnect, hrResetAvg, hrReconnectKnown } from '../util/heartRate'

export function useHeartRate() {
  const [, force] = useState(0)
  useEffect(() => hrSubscribe(() => force((x) => x + 1)), [])
  const s = hrGetState()
  return {
    supported: isHeartRateSupported(),
    connected: s.connected, connecting: s.connecting, retrying: s.retrying,
    bpm: s.bpm, avgBpm: s.avgBpm, maxBpm: s.maxBpm, minBpm: s.minBpm,
    deviceName: s.deviceName, error: s.error,
    connect: hrConnect, disconnect: hrDisconnect, resetAvg: hrResetAvg,
  }
}

/**
 * La domanda di inizio allenamento: la fascia si mette adesso, non a meta'
 * seduta quando ti accorgi che il cuore non lo stava registrando nessuno.
 *
 * Non puo' collegarsi da sola: il browser apre il Bluetooth solo dopo un tocco
 * tuo, e nessuna scorciatoia aggira quella regola. Quindi il tocco glielo si
 * chiede una volta sola, all'inizio, quando serve.
 */
export function ChiediFascia({ sessionId }: { sessionId: string }) {
  const hr = useHeartRate()
  // Il "non stavolta" vale per QUESTA seduta: legato all'id, non al giorno,
  // cosi' domani te lo richiede senza che nessuno debba azzerare niente.
  // Scritto fuori dal componente perche' basta un salto al Riepilogo per
  // smontarlo, e una domanda a cui hai gia' risposto non si ripete.
  // Dopo un ricarico la connessione muore ma il permesso resta: si riattacca
  // da sola, senza selettore e senza domande. La finestra esce solo se non
  // c'e' niente da riattaccare.
  useEffect(() => { void hrReconnectKnown() }, [sessionId])

  const chiave = `fascia-no-${sessionId}`
  const [rifiutato, setRifiutato] = useState(() => {
    try { return sessionStorage.getItem(chiave) === '1' } catch { return false }
  })
  useEffect(() => {
    try { setRifiutato(sessionStorage.getItem(chiave) === '1') } catch { /* ignore */ }
  }, [chiave])
  const rifiuta = () => {
    try { sessionStorage.setItem(chiave, '1') } catch { /* ignore */ }
    setRifiutato(true)
  }

  if (!hr.supported || hr.connected || hr.connecting || hr.retrying || rifiutato) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1150, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(420px, calc(100% - 24px))', margin: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1, color: 'var(--gold)' }}>♥</div>
        <h2 style={{ fontSize: 19, margin: '8px 0 2px' }}>Colleghi la fascia?</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Il cuore viene registrato per tutta la seduta, cardio compreso.
        </p>
        {hr.error && <p className="small" style={{ color: 'var(--bad)' }}>{hr.error}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={rifiuta}>Non stavolta</button>
          <button className="primary" style={{ flex: 2 }} onClick={() => void hr.connect()}>Collega</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Il tasto della fascia per la barra dell'allenamento.
 *
 * Collegata mostra i battiti, che e' il motivo per cui la indossi; scollegata
 * e' solo un cuore da toccare. Il pannello con medie e distacco si apre da qui:
 * in barra ci sta un numero, non una scheda.
 */
export function TastoFascia() {
  const hr = useHeartRate()
  const [aperto, setAperto] = useState(false)
  if (!hr.supported) return null

  return (
    <>
      <button className="ghost small" aria-label="Fascia cardio"
        style={{
          padding: '8px 10px', whiteSpace: 'nowrap',
          ...(hr.connected ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}),
        }}
        onClick={() => { if (hr.connected || hr.connecting || hr.retrying) setAperto(true); else void hr.connect() }}>
        {hr.connecting ? '♥…' : hr.connected ? `♥ ${hr.bpm ?? '—'}` : hr.retrying ? '♥ ⟳' : '♥'}
      </button>

      {aperto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAperto(false)}>
          <div className="card" style={{ width: 'min(420px, calc(100% - 24px))', margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread">
              <strong>{hr.deviceName || 'Fascia'}</strong>
              <span className="muted small">{hr.connected ? 'collegata' : hr.retrying ? 'segnale perso · riaggancio…' : 'in collegamento…'}</span>
            </div>
            <div className="row spread" style={{ marginTop: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 34, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>{hr.bpm ?? '—'}</span>
              <span className="muted small">
                min {hr.minBpm ?? '—'} · media {hr.avgBpm ?? '—'} · max {hr.maxBpm ?? '—'}
              </span>
            </div>
            {hr.error && <p className="small" style={{ color: 'var(--bad)' }}>{hr.error}</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="ghost" style={{ flex: 1 }} onClick={() => setAperto(false)}>Chiudi</button>
              <button className="ghost" style={{ flex: 1, color: '#e57373' }}
                onClick={() => { hr.disconnect(); setAperto(false) }}>Scollega</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

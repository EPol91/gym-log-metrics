import { useRef, useState } from 'react'
import { downloadBackup, importBackup, type EsitoImport } from '../db/backup'

/**
 * Backup dei dati.
 *
 * Il resoconto dice cosa e' tornato tabella per tabella, non un totale: un
 * import che risponde "completato" mentre si e' perso lo storico e' il guasto
 * peggiore, perche' te ne accorgi quando il vecchio telefono non c'e' piu'.
 */
export function BackupSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [modo, setModo] = useState<'unisci' | 'sostituisci'>('unisci')
  const [esito, setEsito] = useState<EsitoImport | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (modo === 'sostituisci' &&
      !confirm('Sostituire i dati con quelli del file? Quello che c\'è ora nelle tabelle del backup viene cancellato.')) return
    setEsito(await importBackup(await file.text(), modo))
  }

  return (
    <div className="card">
      <label className="fl">Backup dati</label>
      <div className="row">
        <button className="ghost" style={{ flex: 1 }} onClick={() => downloadBackup()}>⬇ Esporta (file)</button>
        <button className="ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>⬆ Importa</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onFile} />

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className={'chip' + (modo === 'unisci' ? ' on' : '')} onClick={() => setModo('unisci')}>unisci</button>
        <button className={'chip' + (modo === 'sostituisci' ? ' on' : '')} onClick={() => setModo('sostituisci')}>sostituisci</button>
      </div>

      {esito && (
        <div style={{ marginTop: 8 }}>
          <p className="small" style={{ margin: 0, color: esito.ok ? 'var(--good)' : '#e57373' }}>
            {esito.ok ? '✓ ' : ''}{esito.message}
          </p>
          {esito.dettaglio.length > 0 && (
            <p className="muted small" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
              {esito.dettaglio.map((d) => `${d.tabella} ${d.righe}`).join(' · ')}
            </p>
          )}
          {esito.ignorate.length > 0 && (
            <p className="small" style={{ margin: '4px 0 0', color: 'var(--gold)' }}>
              Non riconosciute e saltate: {esito.ignorate.join(', ')}. Il file viene da una versione più nuova dell'app.
            </p>
          )}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
        Il file contiene tutti i tuoi dati, storico WHOOP compreso. <strong>Unisci</strong> aggiorna e aggiunge senza
        cancellare; <strong>sostituisci</strong> rimette esattamente il backup al posto di quello che c'è.
      </p>
      <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
        Il collegamento WHOOP non è nel file: è una chiave d'accesso, non un dato, e lì dentro diventerebbe un
        lasciapassare per chiunque lo apra. Sul dispositivo nuovo lo ricolleghi dal Profilo in mezzo minuto.
      </p>
    </div>
  )
}

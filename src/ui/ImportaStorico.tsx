import { useRef, useState } from 'react'
import { anteprimaStorico, importaStorico, leggiFileStorico, type AnteprimaStorico, type RigaStorico } from '../db/storicoPeso'
import { fmtData } from '../util/format'

const mila = (n: number) => n.toLocaleString('it-IT')

/** Storico del peso da file: mostra cosa entra, poi aggiunge solo i giorni che in ETP non ci sono. */
export function ImportaStorico() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [righe, setRighe] = useState<RigaStorico[] | null>(null)
  const [prima, setPrima] = useState<AnteprimaStorico | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; testo: string } | null>(null)
  const [busy, setBusy] = useState(false)

  function azzera() {
    setRighe(null); setPrima(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null); azzera()
    try {
      const r = leggiFileStorico(await file.text())
      setRighe(r)
      setPrima(await anteprimaStorico(r))
    } catch (err) {
      setMsg({ ok: false, testo: (err as Error).message })
    }
  }

  async function importa() {
    if (!righe) return
    setBusy(true)
    try {
      const n = await importaStorico(righe)
      setMsg({ ok: true, testo: `Aggiunte ${mila(n)} pesate. Quelle che avevi sono rimaste come erano.` })
      azzera()
    } catch (err) {
      setMsg({ ok: false, testo: `Importazione non riuscita, non è stato scritto niente: ${(err as Error).message}` })
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <label className="fl">Storico del peso</label>
      <p className="muted small" style={{ marginTop: -2, marginBottom: 10 }}>
        Aggiunge solo i giorni che qui non ci sono. Se un giorno c’è già, peso, nota e tutto il resto restano come sono.
      </p>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />

      {!prima ? (
        <button className="ghost" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>Scegli il file</button>
      ) : (
        <>
          <div className="row" style={{ gap: 18, marginBottom: 8 }}>
            <div><div className="num" style={{ fontSize: 26, color: 'var(--gold)' }}>{mila(prima.entrano)}</div><div className="muted small">da aggiungere</div></div>
            <div><div className="num" style={{ fontSize: 26 }}>{mila(prima.saltate)}</div><div className="muted small">già presenti, saltate</div></div>
          </div>
          {prima.dal && prima.al && <p className="muted small" style={{ margin: '0 0 10px' }}>Dal {fmtData(prima.dal)} al {fmtData(prima.al)}.</p>}
          {prima.entrano > 0
            ? <button className="primary" style={{ width: '100%' }} disabled={busy} onClick={importa}>{busy ? 'Importazione…' : `Aggiungi ${mila(prima.entrano)} pesate`}</button>
            : <p className="small" style={{ margin: 0 }}>Non c’è niente da aggiungere.</p>}
          <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={azzera}>Annulla</button>
        </>
      )}

      {msg && <p className="small" style={{ margin: '10px 0 0', color: msg.ok ? 'var(--good)' : '#e57373' }}>{msg.testo}</p>}
    </div>
  )
}

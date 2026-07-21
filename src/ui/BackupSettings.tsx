import { useRef, useState } from 'react'
import { downloadBackup, importBackup } from '../db/backup'

export function BackupSettings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const r = await importBackup(text)
    setMsg({ ok: r.ok, text: r.message })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="card">
      <label className="fl">Backup dati</label>
      <div className="row">
        <button className="ghost" style={{ flex: 1 }} onClick={() => downloadBackup()}>⬇ Esporta (file)</button>
        <button className="ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>⬆ Importa</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onFile} />
      {msg && (
        <p className="small" style={{ marginTop: 8, color: msg.ok ? 'var(--good)' : '#e57373' }}>{msg.text}</p>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>
        Export = backup completo. Import = merge non distruttivo (non cancella i dati esistenti). Per migrare tra dispositivi.
      </p>
    </div>
  )
}

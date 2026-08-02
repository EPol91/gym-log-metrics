// Il backup che si fa da solo.
//
// I dati stanno su un telefono solo: se il backup dipende dal fatto che ti
// ricordi di farlo, prima o poi non c'e'. Una volta a settimana l'app scrive
// il file da sola, in una cartella che puoi aprire — e OneDrive, se la
// sincronizza, se lo porta via da solo.
//
// Nel guscio nativo il download di un link non fa niente (non e' un browser):
// si scrive col Filesystem. Sul web resta il download di sempre.

import { exportAll, downloadBackup } from './backup'

const ULTIMO = 'gymlog.backup.ultimo'
const CARTELLA = 'ETP-HEALTH'
const GIORNI = 7

interface Fs {
  writeFile(o: { path: string; data: string; directory: string; recursive?: boolean; encoding?: string }): Promise<{ uri?: string }>
}

function fs(): Fs | null {
  const cap = (globalThis as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, Fs> }
  }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.Filesystem ?? null
}

/** Quando e' andato l'ultimo backup, e dove e' finito. */
export function ultimoBackup(): { quando: string; dove: string } | null {
  try {
    const s = localStorage.getItem(ULTIMO)
    return s ? (JSON.parse(s) as { quando: string; dove: string }) : null
  } catch { return null }
}

/**
 * Scrive il backup adesso. Restituisce dove e' finito, per poterlo dire.
 * Sul web non si puo' scrivere di nascosto: parte il download di sempre.
 */
export async function salvaBackup(): Promise<string> {
  const backup = await exportAll()
  const nome = `etp-health-${backup.exportedAt.slice(0, 10)}.json`
  const f = fs()

  if (!f) {
    await downloadBackup()
    segna(`download · ${nome}`)
    return 'download'
  }

  await f.writeFile({
    path: `${CARTELLA}/${nome}`,
    data: JSON.stringify(backup),
    directory: 'DOCUMENTS',
    recursive: true,
    encoding: 'utf8',
  })
  const dove = `Documenti/${CARTELLA}/${nome}`
  segna(dove)
  return dove
}

function segna(dove: string) {
  try { localStorage.setItem(ULTIMO, JSON.stringify({ quando: new Date().toISOString(), dove })) } catch { /* ignore */ }
}

/**
 * Il giro automatico, all'avvio: scrive solo se e' passata una settimana e solo
 * nell'app installata. Sul web farebbe partire un download a tradimento, che
 * nessuno vuole.
 */
export async function forseBackupAutomatico(): Promise<void> {
  if (!fs()) return
  const u = ultimoBackup()
  if (u && Date.now() - Date.parse(u.quando) < GIORNI * 86_400_000) return
  try { await salvaBackup() } catch { /* riprovera' al prossimo avvio */ }
}

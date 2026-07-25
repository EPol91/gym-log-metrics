// Aggiornamento dell'app senza interventi manuali.
//
// Il service worker scarica la versione nuova ma la pagina continua a usare quella già
// caricata finché non viene ricaricata: per questo l'app sembrava "non aggiornarsi".
// Qui registriamo il SW noi, controlliamo periodicamente se c'è una versione nuova e
// ricarichiamo da soli. Mai durante un allenamento: in quel caso avvisiamo e basta.
import { registerSW } from 'virtual:pwa-register'

type Listener = (ready: boolean) => void

let updateReady = false
const listeners = new Set<Listener>()
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null

function announce() { for (const l of listeners) l(updateReady) }

/** Iscrizione allo stato "aggiornamento pronto". Restituisce la funzione di disiscrizione. */
export function onUpdateReady(l: Listener): () => void {
  listeners.add(l)
  l(updateReady)
  return () => { listeners.delete(l) }
}

/** Applica l'aggiornamento e ricarica. Svuota le cache se il SW non collabora. */
export function applyPwaUpdate() {
  if (applyUpdate) { applyUpdate(true); setTimeout(hardReload, 1500); return } // se il SW non ricarica, forziamo
  hardReload()
}

/** Ultima spiaggia: butta via le cache dell'app shell e ricarica. I dati stanno in IndexedDB, non si toccano. */
async function hardReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch { /* ignore */ }
  location.reload()
}

/**
 * Rete di sicurezza indipendente dal service worker: confronta il bundle in uso con
 * quello pubblicato (index.html preso dalla rete, senza cache). Se differiscono,
 * la versione caricata è vecchia → aggiornamento pronto.
 */
async function checkDeployedVersion() {
  try {
    const current = [...document.querySelectorAll('script[src]')]
      .map((s) => (s as HTMLScriptElement).src.split('/').pop() || '')
      .find((n) => n.startsWith('index-'))
    if (!current) return
    const res = await fetch(`${import.meta.env.BASE_URL}index.html?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.text()
    const deployed = (html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/) || [])[1]
    if (deployed && deployed !== current && !updateReady) { updateReady = true; announce() }
  } catch { /* offline: riproveremo */ }
}

export function initPwaUpdate() {
  if (typeof window === 'undefined') return

  let swCheck = () => { /* impostata quando il SW è registrato */ }
  if ('serviceWorker' in navigator) {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() { updateReady = true; announce() },
      onRegisteredSW(_url, reg) {
        if (reg) swCheck = () => { reg.update().catch(() => { /* offline */ }) }
      },
    })
  }

  // Doppio controllo: aggiornamento del service worker + confronto col bundle pubblicato.
  const check = () => { swCheck(); checkDeployedVersion() }
  setTimeout(check, 2_000)
  setInterval(check, 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
  window.addEventListener('focus', check)
  window.addEventListener('pageshow', check) // ritorno dalla cache di navigazione
}

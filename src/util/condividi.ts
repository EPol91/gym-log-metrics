// Portare un'immagine fuori dall'app: nel menu di condivisione o in galleria.
//
// Nel guscio nativo il WebView non e' un browser: `navigator.share` non esiste e
// il download di un link non fa niente. Servono i plugin, e vanno presi da
// `window.Capacitor.Plugins` — nella pagina convivono due istanze di Capacitor
// (quella iniettata dal guscio e quella impacchettata con l'app) e solo la prima
// parla davvero con Android.

const ALBUM = 'ETP Health'

interface Plugin { [k: string]: (...a: never[]) => Promise<unknown> }

function plugin(nome: string): Plugin | null {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, Plugin> } }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.[nome] ?? null
}

/** Vero se giriamo dentro l'app installata: cambia tutto il modo di uscire. */
export function nativo(): boolean {
  return !!plugin('Filesystem')
}

function base64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error('Immagine non leggibile.'))
    r.readAsDataURL(b)
  })
}

/** Scrive i file nella cache dell'app e ne restituisce gli indirizzi per Android. */
async function inCache(files: { nome: string; blob: Blob }[]): Promise<string[]> {
  const fs = plugin('Filesystem')
  if (!fs) throw new Error('Filesystem non disponibile.')
  const uri: string[] = []
  for (const f of files) {
    const dati = (await base64(f.blob)).split(',')[1]
    await (fs.writeFile as unknown as (o: unknown) => Promise<unknown>)({
      path: f.nome, data: dati, directory: 'CACHE', recursive: true,
    })
    const r = await (fs.getUri as unknown as (o: unknown) => Promise<{ uri: string }>)({
      path: f.nome, directory: 'CACHE',
    })
    uri.push(r.uri)
  }
  return uri
}

/**
 * Apre il menu di condivisione di Android con dentro le immagini.
 * Nel browser resta la condivisione web, e dove manca anche quella si scarica.
 */
export async function condividi(files: { nome: string; blob: Blob }[], titolo: string): Promise<void> {
  const share = plugin('Share')
  if (share) {
    const uri = await inCache(files)
    await (share.share as unknown as (o: unknown) => Promise<unknown>)({ title: titolo, files: uri })
    return
  }

  const web = files.map((f) => new File([f.blob], f.nome, { type: 'image/png' }))
  // canShare va chiesto con i file veri: c'e' chi condivide testo ma non immagini.
  if (navigator.canShare?.({ files: web })) {
    await navigator.share({ files: web, title: titolo })
    return
  }
  scaricaWeb(files)
}

/**
 * Mette le immagini in galleria, in un album dell'app.
 * Restituisce dove sono finite, per poterlo dire invece di far finta.
 */
export async function inGalleria(files: { nome: string; blob: Blob }[]): Promise<string> {
  const media = plugin('Media')
  if (!media) { scaricaWeb(files); return 'download' }

  const leggi = media.getAlbums as unknown as () => Promise<{ albums: { identifier: string; name: string }[] }>
  let album = (await leggi()).albums.find((a) => a.name === ALBUM)
  if (!album) {
    await (media.createAlbum as unknown as (o: unknown) => Promise<unknown>)({ name: ALBUM })
    album = (await leggi()).albums.find((a) => a.name === ALBUM)
  }
  if (!album) throw new Error('Album non creato.')

  for (const f of files) {
    await (media.savePhoto as unknown as (o: unknown) => Promise<unknown>)({
      path: await base64(f.blob),
      albumIdentifier: album.identifier,
      // Senza estensione: la mette il plugin.
      fileName: f.nome.replace(/\.png$/, ''),
    })
  }
  return ALBUM
}

/** Ripiego del browser: un link per file. Nell'app non funzionerebbe. */
function scaricaWeb(files: { nome: string; blob: Blob }[]) {
  for (const f of files) {
    const url = URL.createObjectURL(f.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = f.nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

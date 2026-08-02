// Foto scelte dalla galleria, ridotte a una misura sensata.
//
// Una foto del telefono pesa 3-6 MB. Messa cosi' com'e' dentro IndexedDB
// gonfierebbe il backup — che e' un unico JSON — di qualche megabyte a ricetta,
// per una copertina che nelle slide viene disegnata a 1080 px di lato.

/** Lato lungo massimo: il doppio della slide, cosi' regge anche i ritagli. */
const LATO = 1600
const QUALITA = 0.82

/**
 * Legge il file scelto e restituisce un dataURL JPEG ridimensionato.
 * La trasparenza si perde: una foto di un piatto non ne ha, e il JPEG pesa
 * un terzo del PNG.
 */
export async function fotoRidotta(file: File, lato = LATO): Promise<string> {
  const src = await leggi(file)
  const img = await carica(src)
  const k = Math.min(1, lato / Math.max(img.width, img.height))
  // Gia' piccola: ricomprimerla la peggiorerebbe e basta.
  if (k === 1 && file.size < 900_000) return src

  const cv = document.createElement('canvas')
  cv.width = Math.round(img.width * k)
  cv.height = Math.round(img.height * k)
  const ctx = cv.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img, 0, 0, cv.width, cv.height)
  return cv.toDataURL('image/jpeg', QUALITA)
}

function leggi(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error('Foto non leggibile.'))
    r.readAsDataURL(file)
  })
}

export function carica(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Immagine non caricata.'))
    img.src = src
  })
}

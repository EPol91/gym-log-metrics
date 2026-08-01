// Icone dell'app Android, generate dallo stesso logo della PWA.
//
// Due livelli: dietro una tinta unita, davanti il marchio. Android ritaglia con
// una maschera diversa per ogni telefono, e ritagliare tinta unita non fa danni;
// ritagliare le lettere si'.
//
// Due controlli, ed e' per quelli che questo file esiste:
//  1. il marchio si centra sull'INCHIOSTRO vero, non sui numeri scritti a mano
//     nell'SVG. Le lettere non riempiono la riga di testo — nessuna scende sotto
//     la linea di base — e centrare "a occhio" lo lasciava 19 px troppo in alto:
//     dentro il riquadro dell'icona si vedeva benissimo;
//  2. si verifica che stia dentro il cerchio sicuro (66% del lato), altrimenti
//     lo script si ferma invece di produrre un'icona che verra' tagliata.
//
// Uso: node scripts/gen-android-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const RES = new URL('../android/app/src/main/res/', import.meta.url)
const LATO = 432
const SICURO = LATO * 0.66            // il cerchio che nessuna maschera tocca

/** Il contenuto dell'SVG, senza involucro: serve per poterlo spostare. */
const nudo = (testo) => testo
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')
  .trim()

const marchio = nudo(readFileSync(new URL('../android-icon/foreground.svg', import.meta.url), 'utf8'))
const tela = (dentro, lato = LATO) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${lato}" height="${lato}" viewBox="0 0 ${lato} ${lato}">${dentro}</svg>`
const misura = (svg) => new Resvg(Buffer.from(svg), { fitTo: { mode: 'width', value: LATO } }).getBBox()
const png = (svg, size) => new Resvg(Buffer.from(svg), { fitTo: { mode: 'width', value: size } }).render().asPng()

// --- centratura sull'inchiostro ----------------------------------------------
const bb = misura(tela(marchio))
if (!bb) throw new Error('Nessun contenuto nel marchio.')
const dx = LATO / 2 - (bb.x + bb.width / 2)
const dy = LATO / 2 - (bb.y + bb.height / 2)
const centrato = `<g transform="translate(${dx.toFixed(2)}, ${dy.toFixed(2)})">${marchio}</g>`

// Controprova: dopo lo spostamento il centro dell'inchiostro deve cadere sul
// centro della tela. Se non ci cade, meglio fermarsi che stampare storto.
const bb2 = misura(tela(centrato))
const resto = Math.hypot(bb2.x + bb2.width / 2 - LATO / 2, bb2.y + bb2.height / 2 - LATO / 2)
if (resto > 0.5) throw new Error(`Centratura fallita: resta uno scarto di ${resto.toFixed(2)} px.`)

// --- zona sicura --------------------------------------------------------------
const angoli = [[bb2.x, bb2.y], [bb2.x + bb2.width, bb2.y], [bb2.x, bb2.y + bb2.height], [bb2.x + bb2.width, bb2.y + bb2.height]]
const raggio = Math.max(...angoli.map(([x, y]) => Math.hypot(x - LATO / 2, y - LATO / 2)))
console.table({
  spostamento: `dx ${dx.toFixed(1)} · dy ${dy.toFixed(1)} px`,
  inchiostro: `${bb2.width.toFixed(1)}×${bb2.height.toFixed(1)} px`,
  centratura: `scarto ${resto.toFixed(2)} px`,
  zonaSicura: `serve ${(raggio * 2).toFixed(1)} di ${SICURO.toFixed(1)} px`,
  margine: `${(SICURO / 2 - raggio).toFixed(1)} px`,
})
if (raggio * 2 > SICURO) throw new Error(`Il logo esce dalla zona sicura di ${(raggio * 2 - SICURO).toFixed(1)} px.`)

const marchioCentrato = tela(centrato)

// --- densita' Android ---------------------------------------------------------
// Il livello davanti si disegna su 108dp, l'icona classica su 48dp.
const DENSITA = [
  { dir: 'mipmap-mdpi', fg: 108, legacy: 48 },
  { dir: 'mipmap-hdpi', fg: 162, legacy: 72 },
  { dir: 'mipmap-xhdpi', fg: 216, legacy: 96 },
  { dir: 'mipmap-xxhdpi', fg: 324, legacy: 144 },
  { dir: 'mipmap-xxxhdpi', fg: 432, legacy: 192 },
]

// L'icona classica (Android vecchi): stesso marchio centrato, dentro il riquadro
// stondato scuro della PWA.
const classica = tela(`<rect width="432" height="432" rx="96" fill="#141418"/>${centrato}`)

for (const d of DENSITA) {
  const dir = new URL(`${d.dir}/`, RES)
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('ic_launcher_foreground.png', dir), png(marchioCentrato, d.fg))
  const intera = png(classica, d.legacy)
  writeFileSync(new URL('ic_launcher.png', dir), intera)
  writeFileSync(new URL('ic_launcher_round.png', dir), intera)
  console.log(`${d.dir}: davanti ${d.fg}px · classica ${d.legacy}px`)
}

// --- schermata di avvio -------------------------------------------------------
// Il bianco di fabbrica lampeggia in faccia prima che l'app parta: qui e' lo
// stesso nero dell'app, col marchio al centro.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#0b0b0b"/>
  <g transform="translate(384, 384)">${centrato}</g>
</svg>`
mkdirSync(new URL('drawable/', RES), { recursive: true })
writeFileSync(new URL('drawable/splash.png', RES), png(splash, 1200))
console.log('avvio: drawable/splash.png')

// --- icona "maskable" della PWA ----------------------------------------------
// Stesso difetto dell'app: nel manifesto era dichiarata maskable l'immagine
// quadrata piena, e Android la ritagliava mangiandosi cornice e scritta.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#141418"/>
  <g transform="translate(40, 40)">${centrato}</g>
</svg>`
writeFileSync(new URL('../public/icon-maskable-512.png', import.meta.url), png(maskable, 512))
console.log('PWA: public/icon-maskable-512.png')

console.log("\nMarchio centrato sull'inchiostro e dentro la zona sicura.")

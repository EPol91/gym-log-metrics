// Icone dell'app Android, generate dallo stesso logo della PWA.
//
// Due livelli: dietro una tinta unita, davanti il marchio. Android ritaglia con
// una maschera diversa per ogni telefono, e ritagliare tinta unita non fa danni;
// ritagliare le lettere si'. Il controllo qui sotto e' il punto: misura
// l'inchiostro davvero disegnato e verifica che stia dentro il cerchio sicuro
// (66% del lato). Se non ci sta, si ferma invece di produrre un'icona sbagliata.
//
// Uso: node scripts/gen-android-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const RES = new URL('../android/app/src/main/res/', import.meta.url)
const fg = readFileSync(new URL('../android-icon/foreground.svg', import.meta.url))
const pwa = readFileSync(new URL('../public/icon.svg', import.meta.url))

// --- controllo della zona sicura ---------------------------------------------
const LATO = 432
const SICURO = LATO * 0.66            // 285,12 px: il cerchio che ogni maschera lascia intatto
const misura = new Resvg(fg, { fitTo: { mode: 'width', value: LATO } })
const bb = misura.getBBox()
if (!bb) throw new Error('Nessun contenuto nel livello davanti.')
const centro = LATO / 2
// Il punto piu' lontano dal centro fra i quattro angoli dell'inchiostro.
const angoli = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]
const raggio = Math.max(...angoli.map(([x, y]) => Math.hypot(x - centro, y - centro)))
const info = {
  inchiostro: `${bb.width.toFixed(1)}×${bb.height.toFixed(1)} px a (${bb.x.toFixed(1)}, ${bb.y.toFixed(1)})`,
  raggioUsato: `${(raggio * 2).toFixed(1)} px di diametro`,
  cerchioSicuro: `${SICURO.toFixed(1)} px`,
  margine: `${(SICURO / 2 - raggio).toFixed(1)} px`,
}
console.table(info)
if (raggio * 2 > SICURO) {
  throw new Error(`Il logo esce dalla zona sicura di ${(raggio * 2 - SICURO).toFixed(1)} px: verrebbe tagliato.`)
}

// --- densita' Android ---------------------------------------------------------
// Il livello davanti si disegna su 108dp, l'icona classica su 48dp.
const DENSITA = [
  { dir: 'mipmap-mdpi', fg: 108, legacy: 48 },
  { dir: 'mipmap-hdpi', fg: 162, legacy: 72 },
  { dir: 'mipmap-xhdpi', fg: 216, legacy: 96 },
  { dir: 'mipmap-xxhdpi', fg: 324, legacy: 144 },
  { dir: 'mipmap-xxxhdpi', fg: 432, legacy: 192 },
]

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

for (const d of DENSITA) {
  const dir = new URL(`${d.dir}/`, RES)
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('ic_launcher_foreground.png', dir), png(fg, d.fg))
  // Android vecchi (prima delle icone adattive): il logo intero, cornice compresa.
  const intera = png(pwa, d.legacy)
  writeFileSync(new URL('ic_launcher.png', dir), intera)
  writeFileSync(new URL('ic_launcher_round.png', dir), intera)
  console.log(`${d.dir}: davanti ${d.fg}px · classica ${d.legacy}px`)
}

console.log('\nIcone Android generate. Zona sicura rispettata.')

// --- schermata di avvio -------------------------------------------------------
// Il bianco di fabbrica lampeggia in faccia prima che l'app parta: qui e' lo
// stesso nero dell'app, col marchio al centro.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#0b0b0b"/>
  <g transform="translate(384, 384) scale(0.84)">
    <text x="216" y="208" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700"
          text-anchor="middle" fill="#d4af37" letter-spacing="3">ETP</text>
    <text x="216" y="249" font-family="Inter, system-ui, Arial, sans-serif" font-size="29" font-weight="400"
          text-anchor="middle" fill="#f2f2f2" letter-spacing="10">HEALTH</text>
  </g>
</svg>`
mkdirSync(new URL('drawable/', RES), { recursive: true })
writeFileSync(new URL('drawable/splash.png', RES), png(Buffer.from(splash), 1200))
console.log('avvio: drawable/splash.png (nero, marchio al centro)')

// --- icona "maskable" della PWA ----------------------------------------------
// Stesso difetto dell'app: nel manifesto era dichiarata maskable l'immagine
// quadrata piena, e Android la ritagliava mangiandosi cornice e scritta. Questa
// invece ha il fondo a tutto campo e il marchio dentro la zona sicura.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#141418"/>
  <g transform="translate(40, 40)">
    <text x="216" y="208" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700"
          text-anchor="middle" fill="#d4af37" letter-spacing="3">ETP</text>
    <text x="216" y="249" font-family="Inter, system-ui, Arial, sans-serif" font-size="29" font-weight="400"
          text-anchor="middle" fill="#f2f2f2" letter-spacing="10">HEALTH</text>
  </g>
</svg>`
writeFileSync(new URL('../public/icon-maskable-512.png', import.meta.url), png(Buffer.from(maskable), 512))
console.log('PWA: public/icon-maskable-512.png (fondo pieno, marchio nella zona sicura)')

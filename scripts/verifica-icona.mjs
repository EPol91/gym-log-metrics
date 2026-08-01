// Controllo dell'icona come la vede Android davvero.
//
// Ogni telefono ritaglia l'icona con la sua maschera: cerchio su Pixel, quadrato
// stondato su Samsung, goccia altrove. Guardare l'immagine e dire "sembra a
// posto" non basta — qui si contano i pixel del marchio dentro e fuori la
// maschera, e se anche uno solo viene tagliato il controllo fallisce.
//
// Uso: node scripts/verifica-icona.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const L = 432
const fgFile = readFileSync(new URL('../android-icon/foreground.svg', import.meta.url), 'utf8')
const marchio = fgFile
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')

// Le maschere che Android applica sul serio.
const MASCHERE = {
  cerchio: '<circle cx="216" cy="216" r="216"/>',
  quadratoStondato: '<rect width="432" height="432" rx="96"/>',
  goccia: '<path d="M216 0 A216 216 0 0 1 432 216 L432 336 A96 96 0 0 1 336 432 L216 432 A216 216 0 0 1 216 0"/>',
  // La piu' severa: il cerchio "sicuro" del 66%, quello che nessun telefono taglia.
  zonaSicura: `<circle cx="216" cy="216" r="${(L * 0.66) / 2}"/>`,
}

/** Il marchio da solo, su fondo trasparente: serve a sapere dov'e' l'inchiostro. */
const soloMarchio = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" viewBox="0 0 ${L} ${L}">${marchio}</svg>`

const pixel = (svg) => {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: L }, background: 'rgba(0,0,0,0)' })
  return { dati: r.render().pixels, png: () => new Resvg(svg, { fitTo: { mode: 'width', value: L } }).render().asPng() }
}

const base = pixel(soloMarchio).dati
// Quanti pixel del marchio ci sono in tutto (alpha > 0).
let totale = 0
for (let i = 3; i < base.length; i += 4) if (base[i] > 8) totale++

const esiti = {}
let bocciate = 0
for (const [nome, m] of Object.entries(MASCHERE)) {
  const ritagliato = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" viewBox="0 0 ${L} ${L}">
    <defs><clipPath id="m">${m}</clipPath></defs>
    <g clip-path="url(#m)">${marchio}</g>
  </svg>`
  const d = pixel(ritagliato).dati
  let dentro = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) dentro++
  const persi = totale - dentro
  esiti[nome] = { pixelDelMarchio: totale, sopravvissuti: dentro, tagliati: persi, esito: persi === 0 ? 'INTATTO' : 'TAGLIATO' }
  if (persi !== 0) bocciate++
}
console.table(esiti)

// Un'anteprima come la vedrai sul telefono: sfondo + marchio, ritagliata a cerchio.
const anteprima = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" viewBox="0 0 ${L} ${L}">
  <defs><clipPath id="m">${MASCHERE.cerchio}</clipPath></defs>
  <g clip-path="url(#m)"><rect width="${L}" height="${L}" fill="#141418"/>${marchio}</g>
</svg>`
writeFileSync(new URL('../android-icon/anteprima-cerchio.png', import.meta.url), pixel(anteprima).png())

if (bocciate) throw new Error(`${bocciate} maschere tagliano il marchio.`)
console.log('\nNessuna maschera tocca il marchio. Anteprima in android-icon/anteprima-cerchio.png')

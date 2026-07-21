// Genera i PNG delle icone PWA da public/icon.svg. Uso: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url))
const targets = [
  { size: 192, out: 'icon-192.png' },
  { size: 512, out: 'icon-512.png' },
  { size: 180, out: 'apple-touch-icon.png' },
]

for (const t of targets) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: t.size } })
  const png = r.render().asPng()
  writeFileSync(new URL(`../public/${t.out}`, import.meta.url), png)
  console.log(`generato public/${t.out} (${t.size}px)`)
}

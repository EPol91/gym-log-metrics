// Le slide da postare: una ricetta diventa immagini pronte per Instagram.
//
// Disegnate su canvas e non fotografate dalla pagina: la pagina e' larga quanto
// il telefono, mentre queste devono uscire a 1080 px esatti con margini che su
// Instagram non finiscono sotto il nome utente o sotto la barra di risposta.
// Niente librerie, niente rete: funziona in aereo come tutto il resto.

import type { Food, Recipe } from '../db/schema'
import type { RecipeCalc } from '../db/recipes'
import { carica } from './immagine'

export type Formato = 'post' | 'storia'

const W = 1080
const H: Record<Formato, number> = { post: 1350, storia: 1920 }

// Zone di sicurezza. Nel post basta un margine tipografico; nella storia i primi
// e gli ultimi pixel sono coperti da Instagram (nome utente sopra, «invia un
// messaggio» sotto), quindi il contenuto vero comincia piu' in basso.
const LATO = 84
const SU: Record<Formato, number> = { post: 110, storia: 290 }
const GIU: Record<Formato, number> = { post: 110, storia: 330 }

const C = {
  fondo: '#0b0b0b',
  testo: '#f2f2f2',
  muto: '#8f8f8f',
  oro: '#d4af37',
  carb: '#FFC63D',
  prot: '#2ecc71',
  fat: '#e74c3c',
  riga: '#262626',
}

const TITOLO = "'Playfair Display', Georgia, serif"
const CORPO = "Inter, system-ui, -apple-system, sans-serif"
// Il monospazio per le etichette spaziate: e' quello che nell'esempio dava
// l'aria da scheda tecnica, e le lettere restano allineate fra una slide e l'altra.
const TECNICO = "'JetBrains Mono', ui-monospace, 'Courier New', monospace"

/** Un passo del procedimento non numerato: e' il tuo timbro, resta com'e'. */
const TIMBRO = /^enjoy/i

interface Ctx {
  ctx: CanvasRenderingContext2D
  f: Formato
  h: number
  /** margine sinistro/destro e prima/ultima riga utile */
  x: number
  su: number
  giu: number
}

// --- Mattoni di disegno -----------------------------------------------------

function nuova(f: Formato): Ctx {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H[f]
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = C.fondo
  ctx.fillRect(0, 0, W, H[f])
  ctx.textBaseline = 'alphabetic'
  return { ctx, f, h: H[f], x: LATO, su: SU[f], giu: H[f] - GIU[f] }
}

/** Etichetta piccola, spaziata: «PER PORZIONE», «INGREDIENTI · 4 PORZIONI». */
function etichetta(k: Ctx, s: string, y: number, colore = C.oro): number {
  const { ctx } = k
  ctx.font = `600 26px ${TECNICO}`
  ctx.fillStyle = colore
  ctx.letterSpacing = '7px'
  ctx.fillText(s.toUpperCase(), k.x, y)
  ctx.letterSpacing = '0px'
  return y + 26
}

/** Riduce il corpo finché il testo ci sta: i nomi lunghi si leggono, non escono. */
function corpoCheCiSta(ctx: CanvasRenderingContext2D, s: string, font: (px: number) => string, max: number, px: number, min = 22): number {
  let p = px
  while (p > min) {
    ctx.font = font(p)
    if (ctx.measureText(s).width <= max) break
    p -= 2
  }
  ctx.font = font(p)
  return p
}

/** Spezza in righe che stanno dentro `max`. */
function righe(ctx: CanvasRenderingContext2D, s: string, max: number): string[] {
  const out: string[] = []
  let riga = ''
  for (const parola of s.split(/\s+/)) {
    const prova = riga ? `${riga} ${parola}` : parola
    if (ctx.measureText(prova).width > max && riga) { out.push(riga); riga = parola } else riga = prova
  }
  if (riga) out.push(riga)
  return out
}

/** Il titolo della ricetta, con l'eventuale sottotitolo dopo la virgola o «con». */
function titolo(k: Ctx, nome: string, y: number, px = 92): number {
  const { ctx } = k
  const max = W - k.x * 2
  const p = corpoCheCiSta(ctx, nome, (n) => `600 ${n}px ${TITOLO}`, max, px, 46)
  ctx.fillStyle = C.testo
  const rs = righe(ctx, nome, max)
  for (const r of rs) { ctx.fillText(r, k.x, y); y += p * 1.12 }
  return y
}

/** Firma in fondo a ogni slide: le rende riconoscibili come tue. */
function firma(k: Ctx, chi: string) {
  const { ctx } = k
  ctx.font = `500 24px ${TECNICO}`
  ctx.fillStyle = '#6f6f6f'
  ctx.letterSpacing = '5px'
  ctx.fillText(chi.toUpperCase(), k.x, k.giu + 62)
  ctx.letterSpacing = '0px'
}

/**
 * Centra il contenuto fra la prima e l'ultima riga utile.
 *
 * Quanto sia alto si sa solo dopo averlo disegnato — dipende da quanti
 * ingredienti ci sono e da quante righe prende il titolo — quindi si disegna
 * due volte: la prima per misurare, la seconda per davvero. Costa qualche
 * millisecondo e risparmia mezza slide di vuoto in fondo.
 */
function centrato(k: Ctx, disegna: (off: number) => number) {
  const avanzo = k.giu - disegna(0)
  if (avanzo <= 70) return
  k.ctx.fillStyle = C.fondo
  k.ctx.fillRect(0, 0, W, k.h)
  // Non a metà esatta: un blocco di testo centrato geometricamente sembra
  // sempre un po' troppo in basso.
  disegna(Math.round(avanzo * 0.45))
}

function linea(k: Ctx, y: number) {
  k.ctx.fillStyle = C.riga
  k.ctx.fillRect(k.x, y, W - k.x * 2, 1)
}

/** Numero con la virgola italiana e senza decimali inutili. */
const num = (n: number, dec = 1) => {
  const v = Math.round(n * 10 ** dec) / 10 ** dec
  return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(dec)).replace('.', ',')
}

async function png(k: Ctx): Promise<Blob> {
  return new Promise((res) => k.ctx.canvas.toBlob((b) => res(b!), 'image/png'))
}

// --- Le slide ---------------------------------------------------------------

/**
 * Copertina: la foto occupa tutta la slide, il testo sta sopra una sfumatura.
 * Senza foto la slide non salta: resta il titolo su fondo scuro, che e'
 * comunque una copertina — solo piu' sobria.
 */
async function copertina(f: Formato, r: Recipe, sotto: string, chi: string): Promise<Blob> {
  const k = nuova(f)
  const { ctx } = k

  if (r.photo) {
    try {
      const img = await carica(r.photo)
      // Riempie tagliando il lato lungo: la foto non si deforma mai.
      const s = Math.max(W / img.width, k.h / img.height)
      const w = img.width * s, h = img.height * s
      ctx.drawImage(img, (W - w) / 2, (k.h - h) / 2, w, h)
    } catch { /* foto illeggibile: resta il fondo scuro */ }
  }

  // La sfumatura serve a leggere il testo su qualunque foto, anche chiara.
  const g = ctx.createLinearGradient(0, k.h * 0.32, 0, k.h)
  g.addColorStop(0, 'rgba(11,11,11,0)')
  g.addColorStop(0.55, 'rgba(11,11,11,.82)')
  g.addColorStop(1, 'rgba(11,11,11,.97)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, k.h)

  // Il blocco di testo sta in fondo: si misura tutto prima, poi si disegna
  // dall'alto: contarlo a ritroso e' il modo piu' sicuro di sbagliarlo.
  const max = W - k.x * 2
  ctx.font = `500 34px ${CORPO}`
  const rsSotto = righe(ctx, sotto, max)
  const p = corpoCheCiSta(ctx, r.name, (n) => `600 ${n}px ${TITOLO}`, max, 104, 52)
  const rsTitolo = righe(ctx, r.name, max)
  const altezza = rsTitolo.length * p * 1.1 + rsSotto.length * 46 + 66

  let y = k.giu - altezza
  etichetta(k, 'ricetta', y)
  y += 42
  ctx.font = `600 ${p}px ${TITOLO}`
  ctx.fillStyle = C.testo
  for (const t of rsTitolo) { y += p * 1.1; ctx.fillText(t, k.x, y) }
  y += 24
  ctx.font = `500 34px ${CORPO}`
  ctx.fillStyle = C.muto
  for (const t of rsSotto) { y += 46; ctx.fillText(t, k.x, y) }

  firma(k, chi)
  return png(k)
}

/** I macro: il numero grande, i tre valori, la ripartizione delle calorie. */
async function macro(f: Formato, r: Recipe, calc: RecipeCalc, chi: string): Promise<Blob> {
  const k = nuova(f)
  const { ctx } = k
  const porzioni = r.mode === 'servings'
  const m = (porzioni ? calc.perServing : calc.per100) ?? calc.totals

  centrato(k, (off) => {
  let y = k.su + 40 + off
  y = etichetta(k, porzioni ? 'per porzione' : 'per 100 g', y)
  y = titolo(k, r.name, y + 78, 92)

  // Le calorie sono il numero che si guarda per primo: prendono il posto che meritano.
  y += f === 'storia' ? 160 : 110
  ctx.font = `700 190px ${TITOLO}`
  ctx.fillStyle = C.oro
  ctx.fillText(String(Math.round(m.kcal)), k.x, y)
  const wKcal = ctx.measureText(String(Math.round(m.kcal))).width
  ctx.font = `500 44px ${CORPO}`
  ctx.fillStyle = C.muto
  ctx.fillText('kcal', k.x + wKcal + 22, y)

  y += f === 'storia' ? 150 : 110
  linea(k, y)
  y += 78

  // Ordine C, P, G: lo stesso di tutta l'app, cosi' i numeri si confrontano a colpo d'occhio.
  const voci: [string, number, string][] = [
    ['Carboidrati', m.carbs, C.carb],
    ['Proteine', m.protein, C.prot],
    ['Grassi', m.fat, C.fat],
  ]
  for (const [nome, v, col] of voci) {
    ctx.font = `400 46px ${CORPO}`
    ctx.fillStyle = C.testo
    ctx.fillText(nome, k.x, y)
    ctx.font = `500 46px ${TECNICO}`
    ctx.fillStyle = col
    const t = `${num(v)} g`
    ctx.fillText(t, W - k.x - ctx.measureText(t).width, y)
    y += 86
  }

  y += 10
  linea(k, y)
  y += 60

  // La ripartizione: due ricette con le stesse calorie possono essere due cose diverse.
  const kc = { c: m.carbs * 4, p: m.protein * 4, g: m.fat * 9 }
  const tot = kc.c + kc.p + kc.g || 1
  y = etichetta(k, 'ripartizione calorica · % sulle kcal', y)
  y += 34
  const larg = W - k.x * 2
  const parti: [number, string][] = [[kc.c / tot, C.carb], [kc.p / tot, C.prot], [kc.g / tot, C.fat]]
  let bx = k.x
  for (const [q, col] of parti) {
    const w = Math.max(0, larg * q - 6)
    ctx.fillStyle = col
    ctx.fillRect(bx, y, w, 16)
    bx += w + 6
  }
  y += 62
  ctx.font = `500 30px ${TECNICO}`
  ctx.letterSpacing = '2px'
  const et: [string, number, string][] = [
    ['C', kc.c / tot, C.carb], ['P', kc.p / tot, C.prot], ['G', kc.g / tot, C.fat],
  ]
  let ex = k.x
  for (const [s, q, col] of et) {
    ctx.fillStyle = col
    ctx.fillText(`${s} ${Math.round(q * 100)}%`, ex, y)
    ex += larg / 3
  }
  ctx.letterSpacing = '0px'

  // Il dato che nell'esempio mancava: quanto pesa davvero una porzione.
  y += 62
  ctx.font = `500 28px ${TECNICO}`
  ctx.fillStyle = C.muto
  ctx.letterSpacing = '4px'
  const peso = pesoPorzione(r, calc)
  ctx.fillText(peso.toUpperCase(), k.x, y)
  ctx.letterSpacing = '0px'
  return y
  })

  firma(k, chi)
  return png(k)
}

/** Ingredienti, per sezione. Pizzico e «qb» restano parole, non diventano numeri. */
async function ingredienti(f: Formato, r: Recipe, foods: Map<string, Food>, chi: string): Promise<Blob> {
  const k = nuova(f)
  const { ctx } = k

  const testa = r.mode === 'servings' ? `ingredienti · ${r.servings ?? 1} porzioni` : 'ingredienti'
  const gruppi = (r.groups ?? []).filter((g) => g.items.length)
  const solo = gruppi.length === 1
  // Quante righe ci stanno: se sono tante si stringe tutto invece di uscire dal bordo.
  const totRighe = gruppi.reduce((a, g) => a + g.items.length, 0) + (solo ? 0 : gruppi.length)

  centrato(k, (off) => {
  let y = etichetta(k, testa, k.su + 40 + off)
  y = titolo(k, r.name, y + 78, 92)
  y += 90

  const spazio = k.giu - y
  const passo = Math.min(f === 'storia' ? 84 : 74, Math.max(46, spazio / Math.max(totRighe, 1)))
  const corpo = Math.min(46, passo * 0.62)

  for (const g of gruppi) {
    if (!solo) {
      y = etichetta(k, g.name, y) + passo * 0.5
    }
    for (const it of g.items) {
      const nome = foods.get(it.foodId)?.name ?? 'alimento'
      const q = it.qta ?? `${num(it.grams, 0)} g`
      ctx.font = `500 ${Math.round(corpo * 0.92)}px ${TECNICO}`
      const wq = ctx.measureText(q).width
      ctx.fillStyle = it.qta ? C.muto : C.oro
      ctx.fillText(q, W - k.x - wq, y)

      const maxNome = W - k.x * 2 - wq - 40
      corpoCheCiSta(ctx, nome, (n) => `400 ${n}px ${CORPO}`, maxNome, corpo, 26)
      ctx.fillStyle = C.testo
      ctx.fillText(nome, k.x, y)
      y += passo
    }
    y += passo * 0.35
  }
  return y
  })

  firma(k, chi)
  return png(k)
}

/** Il procedimento, spezzato su piu' slide: meglio due slide che un testo minuscolo. */
async function procedimento(f: Formato, r: Recipe, chi: string, parte: string[], da: number, di: string): Promise<Blob> {
  const k = nuova(f)
  const { ctx } = k

  const maxTesto = W - k.x * 2 - 96

  centrato(k, (off) => {
  let y = etichetta(k, `procedimento${di}`, k.su + 40 + off)
  y = titolo(k, r.name, y + 78, 92)
  y += 96

  for (let i = 0; i < parte.length; i++) {
    const s = parte[i]
    const n = String(da + i + 1).padStart(2, '0')
    const timbro = TIMBRO.test(s)

    ctx.font = `400 ${f === 'storia' ? 40 : 37}px ${CORPO}`
    const rs = righe(ctx, s, maxTesto)

    ctx.font = `500 30px ${TECNICO}`
    ctx.fillStyle = timbro ? C.oro : '#6a6a6a'
    ctx.fillText(n, k.x, y)

    ctx.font = `400 ${f === 'storia' ? 40 : 37}px ${CORPO}`
    ctx.fillStyle = timbro ? C.oro : C.testo
    for (const t of rs) { ctx.fillText(t, k.x + 96, y); y += f === 'storia' ? 54 : 50 }
    y += 34
  }
  return y
  })

  firma(k, chi)
  return png(k)
}

// --- Messa insieme ----------------------------------------------------------

function pesoPorzione(r: Recipe, calc: RecipeCalc): string {
  if (r.mode === 'grams') return `resa ${num(r.yieldG ?? 0, 0)} g`
  const n = Math.max(1, r.servings ?? 1)
  const base = (Number(r.yieldG) || 0) > 0 ? Number(r.yieldG) : calc.rawG
  return `${n} porzioni · ~${num(base / n, 0)} g l'una`
}

/** Quanti passi per slide: pochi e leggibili invece di tanti e piccoli. */
const PER_SLIDE: Record<Formato, number> = { post: 5, storia: 6 }

/**
 * Tutte le slide della ricetta, nell'ordine in cui si postano.
 * Chi le usa decide se condividerle o salvarle: qui si disegna e basta.
 */
export async function slideRicetta(
  r: Recipe, calc: RecipeCalc, foods: Map<string, Food>, f: Formato, chi: string,
): Promise<Blob[]> {
  const m = (r.mode === 'servings' ? calc.perServing : calc.per100) ?? calc.totals
  const sotto = r.mode === 'servings'
    ? `${Math.round(m.kcal)} kcal a porzione · C ${num(m.carbs)} P ${num(m.protein)} G ${num(m.fat)}`
    : `${Math.round(m.kcal)} kcal per 100 g · C ${num(m.carbs)} P ${num(m.protein)} G ${num(m.fat)}`

  const out: Blob[] = [
    await copertina(f, r, sotto, chi),
    await macro(f, r, calc, chi),
  ]
  if ((r.groups ?? []).some((g) => g.items.length)) out.push(await ingredienti(f, r, foods, chi))

  const passi = r.steps ?? []
  const n = PER_SLIDE[f]
  const fette = Math.ceil(passi.length / n)
  for (let i = 0; i < fette; i++) {
    const di = fette > 1 ? ` · ${i + 1} di ${fette}` : ''
    out.push(await procedimento(f, r, chi, passi.slice(i * n, i * n + n), i * n, di))
  }
  return out
}

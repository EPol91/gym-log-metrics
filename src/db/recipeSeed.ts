// Import una tantum del vecchio ricettario: due ricette e gli alimenti che
// servono loro. Gira una volta sola — se poi elimini una ricetta, resta eliminata.
//
// Degli alimenti del ricettario ne vengono creati SOLO quelli che l'app non ha già:
// albume, uovo, tuorlo, olio, farina 00 e caffè esistono di serie e vengono riusati,
// così una correzione fatta lì vale anche dentro le ricette.
import { db, nowISO } from './db'
import { LOCAL_USER_ID } from './seed'
import type { Food, Macros, Recipe, RecipeGroup } from './schema'

// NB: `LOCAL_USER_ID` si legge DENTRO la funzione, non qui in cima. seed.ts importa
// questo file e questo file importa seed.ts: leggendolo all'avvio del modulo si
// cadrebbe nella zona morta della costante, con un errore al primo caricamento.
const DONE_KEY = 'etp:recipe-seed:v1'

const M = (kcal: number, protein: number, carbs: number, fat: number): Macros => ({ kcal, protein, carbs, fat })

/**
 * Alimenti del ricettario che l'app ha già, sotto un altro nome.
 * Gli id `base-…` sono quelli deterministici creati da ensureSeed.
 */
const GIA_PRESENTI: Record<string, string> = {
  'Albume': 'base-albume-crudo',
  'Uovo intero': 'base-uovo-intero-crudo',
  'Tuorlo': 'base-tuorlo-crudo',
  'Olio extravergine di oliva': 'base-olio-extravergine-di-oliva',
  'Farina 00': 'base-farina-00',
  'Caffè': 'base-caffe-espresso',
}

/** Alimenti che l'app non ha davvero. Valori per 100 g come nel ricettario. */
const DA_AGGIUNGERE: { name: string; per100: Macros }[] = [
  { name: 'Skyr naturale', per100: M(63, 11, 4, 0.2) },
  // L'app ha i fiocchi 0% e 3%; questo è un terzo prodotto, con i suoi valori.
  { name: 'Fiocchi di latte (ricettario)', per100: M(99, 11, 3.4, 4.3) },
  { name: 'Ricotta light', per100: M(90, 11, 4, 4) },
  { name: 'Quark magro', per100: M(67, 12, 4, 0.3) },
  { name: 'Mascarpone', per100: M(450, 4.5, 3, 47) },
  { name: 'Whey vaniglia', per100: M(380, 80, 6, 4) },
  { name: 'Isolate vaniglia', per100: M(373, 90, 1, 0.5) },
  { name: 'Farina di avena', per100: M(370, 13, 60, 7) },
  { name: 'Farina di cocco', per100: M(400, 18, 22, 14) },
  { name: 'Farina di lupino', per100: M(380, 40, 10, 10) },
  { name: 'Cacao amaro', per100: M(355, 20, 11, 21) },
  { name: 'Cioccolato fondente 85%', per100: M(592, 10, 15, 50) },
  { name: 'Eritritolo', per100: M(0, 0, 0, 0) },
  { name: 'Lievito per dolci', per100: M(0, 0, 0, 0) },
  { name: 'Xantana', per100: M(0, 0, 0, 0) },
  { name: 'Bevanda mandorla non zuccherata', per100: M(13, 0.4, 0.3, 1.1) },
]

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')
const ricId = (name: string) => `ric-${slug(name)}`

/** Passi comuni alle due versioni, dalla farcitura in poi. */
const FINITURA = [
  'Scola i fiocchi di latte dal liquido e frullali fino a crema liscia.',
  'Unisci skyr, fiocchi frullati, isolate ed eritritolo. Monta aggiungendo la xantana a pioggia.',
  'Taglia la base in 2 strati.',
  'Inzuppa il primo strato nel caffè, copri con metà crema.',
  'Ripeti con il secondo strato e la crema rimanente. Livella bene la superficie.',
  'Spolvera con il cacao amaro.',
  'Frigo 6 ore.',
  'Sciogli il cioccolato a bagnomaria, versalo sulla superficie e stendilo sottile.',
  'Rimetti in frigo 20 minuti, o 10 in freezer, finché non solidifica.',
]

const CREMA = (id: (n: string) => string): RecipeGroup => ({
  name: 'Crema',
  items: [
    { foodId: id('Skyr naturale'), grams: 500 },
    { foodId: id('Fiocchi di latte (ricettario)'), grams: 200 },
    { foodId: id('Isolate vaniglia'), grams: 30 },
    { foodId: id('Eritritolo'), grams: 30 },
    { foodId: id('Xantana'), grams: 0.5 },
  ],
})

const FINITURA_GRUPPO = (id: (n: string) => string): RecipeGroup => ({
  name: 'Finitura',
  items: [
    { foodId: id('Caffè'), grams: 200 },
    { foodId: id('Cacao amaro'), grams: 10 },
    { foodId: id('Cioccolato fondente 85%'), grams: 30 },
  ],
})

/**
 * Crea alimenti mancanti e ricette. Si ferma da sola dopo il primo giro:
 * le ricette sono roba tua, se ne cancelli una non deve ricomparire al riavvio.
 */
export async function ensureRecipeSeed(): Promise<void> {
  try { if (localStorage.getItem(DONE_KEY)) return } catch { /* storage assente: si prosegue */ }

  const U = LOCAL_USER_ID
  const ts = nowISO()

  // --- alimenti: solo i mancanti, e solo se non ci sono già per nome ---
  const existing = await db.foods.where('userId').equals(U).toArray()
  const byName = new Map(existing.map((f) => [slug(f.name), f.id]))
  const nuovi: Food[] = []
  for (const f of DA_AGGIUNGERE) {
    if (byName.has(slug(f.name))) continue
    const row: Food = {
      id: ricId(f.name), userId: U, createdAt: ts, updatedAt: ts,
      name: f.name, per100: f.per100, source: 'mine',
    }
    nuovi.push(row)
    byName.set(slug(f.name), row.id)
  }
  if (nuovi.length) await db.foods.bulkPut(nuovi)

  /** Id dell'alimento per nome del ricettario: prima la mappa, poi la libreria. */
  const id = (nome: string): string => GIA_PRESENTI[nome] ?? byName.get(slug(nome)) ?? ''

  // --- ricette ---
  const base = { userId: U, createdAt: ts, updatedAt: ts, mode: 'servings' as const, servings: 6, timeMin: 40, tags: ['Dolci'] }

  const tiramisu: Recipe = {
    ...base,
    id: 'ric-tiramisu-fit',
    name: 'Tiramisù fit',
    favorite: true,
    groups: [
      {
        name: 'Base',
        items: [
          { foodId: id('Albume'), grams: 200 },
          { foodId: id('Uovo intero'), grams: 55 },
          { foodId: id('Farina di avena'), grams: 60 },
          { foodId: id('Whey vaniglia'), grams: 30 },
          { foodId: id('Eritritolo'), grams: 30 },
          { foodId: id('Lievito per dolci'), grams: 4 },
        ],
      },
      CREMA(id),
      FINITURA_GRUPPO(id),
    ],
    steps: [
      'Monta l’albume a neve ferma.',
      'Mescola farina di avena, whey, eritritolo e lievito con l’uovo intero.',
      'Incorpora l’albume dal basso verso l’alto.',
      'Versa in teglia 20×20 e cuoci in forno statico a 180 °C per 12 minuti. Fai raffreddare completamente.',
      ...FINITURA,
    ],
    note: 'Stendi il cioccolato solo dopo il riposo in frigo: sulla crema morbida affonda invece di formare lo strato croccante.',
  }

  const tiramisuOlio: Recipe = {
    ...base,
    id: 'ric-tiramisu-fit-olio-evo',
    name: 'Tiramisù fit all’olio EVO',
    groups: [
      {
        name: 'Base',
        items: [
          { foodId: id('Albume'), grams: 250 },
          { foodId: id('Farina di avena'), grams: 60 },
          { foodId: id('Whey vaniglia'), grams: 30 },
          { foodId: id('Olio extravergine di oliva'), grams: 6 },
          { foodId: id('Eritritolo'), grams: 30 },
          { foodId: id('Lievito per dolci'), grams: 4 },
        ],
      },
      CREMA(id),
      FINITURA_GRUPPO(id),
    ],
    steps: [
      'Preleva 50 g di albume e tienilo da parte. Monta il resto a neve ferma.',
      'Mescola farina di avena, whey, eritritolo e lievito con l’albume tenuto da parte e l’olio, fino a ottenere un impasto omogeneo.',
      'Incorpora l’albume montato dal basso verso l’alto.',
      'Versa in teglia 20×20 e cuoci in forno statico a 180 °C per 12 minuti. Fai raffreddare completamente.',
      ...FINITURA,
    ],
    note: 'Usa un olio delicato. Un fruttato intenso si sente anche a 1 g per porzione. L’olio sostituisce il tuorlo nel tenere morbida la base.',
  }

  for (const r of [tiramisu, tiramisuOlio]) {
    if (!(await db.recipes.get(r.id))) await db.recipes.add(r)
  }

  try { localStorage.setItem(DONE_KEY, ts) } catch { /* ignore */ }
}

// Open Food Facts: ricerca prodotti confezionati e lettura per codice a barre.
// Licenza dati ODbL — usati DAL VIVO (query), mai impacchettati nell'app.
// Attribuzione mostrata nella schermata di ricerca.
//
// Nota: i valori OFF sono inseriti dagli utenti e non sempre aggiornati. Ogni
// alimento importato resta modificabile: l'etichetta in mano comanda.
import type { Macros } from '../db/schema'

const BASE = 'https://world.openfoodfacts.org'
const UA = 'GymLogMetrics/1.0 (app personale)'

export interface OffFood {
  name: string
  brand?: string
  barcode?: string
  per100: Macros
  servingG?: number
}

interface OffProduct {
  product_name?: string
  product_name_it?: string
  brands?: string
  code?: string
  serving_quantity?: string | number
  nutriments?: Record<string, number | string | undefined>
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return isNaN(n) ? undefined : n
}

/** Converte un prodotto OFF nel nostro formato. Scarta ciò che non ha macro. */
function toFood(p: OffProduct): OffFood | null {
  const n = p.nutriments ?? {}
  const name = (p.product_name_it || p.product_name || '').trim()
  if (!name) return null

  const protein = num(n['proteins_100g'])
  const carbs = num(n['carbohydrates_100g'])
  const fat = num(n['fat_100g'])
  if (protein == null || carbs == null || fat == null) return null

  // Le kcal a volte mancano ma ci sono i kJ; in ultima istanza si calcolano dai macro.
  const kcal = num(n['energy-kcal_100g'])
    ?? (num(n['energy_100g']) != null ? Math.round(num(n['energy_100g'])! / 4.184) : undefined)
    ?? Math.round(protein * 4 + carbs * 4 + fat * 9)

  return {
    name,
    brand: (p.brands || '').split(',')[0]?.trim() || undefined,
    barcode: p.code,
    per100: {
      kcal: Math.round(kcal),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      ...(num(n['fiber_100g']) != null ? { fiber: Math.round(num(n['fiber_100g'])! * 10) / 10 } : {}),
      ...(num(n['sugars_100g']) != null ? { sugar: Math.round(num(n['sugars_100g'])! * 10) / 10 } : {}),
      ...(num(n['salt_100g']) != null ? { salt: Math.round(num(n['salt_100g'])! * 100) / 100 } : {}),
    },
    servingG: num(p.serving_quantity),
  }
}

/** Ricerca testuale, prodotti italiani per primi. */
export async function searchOFF(query: string, limit = 20): Promise<OffFood[]> {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}`
    + `&search_simple=1&action=process&json=1&page_size=${limit}`
    + '&fields=product_name,product_name_it,brands,code,serving_quantity,nutriments'
    + '&tagtype_0=countries&tag_contains_0=contains&tag_0=italy'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error('OFF ' + res.status)
  const data = await res.json() as { products?: OffProduct[] }
  return (data.products ?? []).map(toFood).filter((x): x is OffFood => x != null)
}

/** Prodotto singolo dal codice a barre. */
export async function fetchByBarcode(code: string): Promise<OffFood | null> {
  const url = `${BASE}/api/v2/product/${encodeURIComponent(code)}`
    + '?fields=product_name,product_name_it,brands,code,serving_quantity,nutriments'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const data = await res.json() as { status?: number; product?: OffProduct }
  if (!data.product) return null
  return toFood(data.product)
}

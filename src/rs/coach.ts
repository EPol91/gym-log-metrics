// Il collegamento con l'app del coach: leggere il suo piano direttamente da lì.
//
// La sua app tiene il protocollo in un archivio online (Supabase) e ci entra
// col tuo account, via link nella mail. Qui si fa la stessa cosa, col tuo stesso
// account: la prima volta chiedi la mail, copi il link e lo incolli; da lì la
// sessione si rinnova da sola e «Aggiorna dal coach» diventa un tocco.
//
// Solo lettura. Qui non si scrive niente nel suo archivio.

import type { SupabaseClient } from '@supabase/supabase-js'
import { GIORNATE_RS, NOMI_DEL_COACH } from './protocollo'
import type { GiornataPianoRs } from '../db/schema'

const ARCHIVIO = 'https://tfnndykscoamsqmhtlxu.supabase.co'
/**
 * La chiave pubblica della sua app. Non e' un segreto: e' scritta in chiaro
 * nella sua pagina, e da sola non apre niente — i dati si vedono solo col tuo
 * accesso, e solo i tuoi.
 */
const CHIAVE_PUBBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbm5keWtzY29hbXNxbWh0bHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTIyMTksImV4cCI6MjEwMDIyODIxOX0.n_YLAA5-F0JN7y8e7m62DjmSEuHMFw7zouNmUjtc0c8'

let cliente: SupabaseClient | null = null

/** Il client, caricato solo quando serve: pesa, e il resto dell'app non lo usa. */
async function archivio(): Promise<SupabaseClient> {
  if (cliente) return cliente
  const { createClient } = await import('@supabase/supabase-js')
  cliente = createClient(ARCHIVIO, CHIAVE_PUBBLICA, {
    auth: {
      storageKey: 'etp-coach-sessione',
      persistSession: true,
      autoRefreshToken: true,
      // Il link non lo apriamo: lo incolli tu. Niente da leggere nell'indirizzo.
      detectSessionInUrl: false,
    },
  })
  return cliente
}

export interface Collegamento { collegato: boolean; email?: string }

export async function statoCollegamento(): Promise<Collegamento> {
  try {
    const { data } = await (await archivio()).auth.getSession()
    const s = data.session
    return s ? { collegato: true, email: s.user.email ?? undefined } : { collegato: false }
  } catch {
    return { collegato: false }
  }
}

/**
 * Fa partire la mail d'accesso, la stessa della sua app.
 *
 * Mai creare account: nella sua app l'accesso via mail crea l'utente se non
 * esiste, qui no. Se l'indirizzo non e' quello con cui il coach ti ha iscritto,
 * lo devi sapere — non deve nascere un account vuoto a nome tuo.
 */
export async function chiediMailDiAccesso(email: string): Promise<void> {
  const pulita = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pulita)) throw new Error('Questo indirizzo email non sembra valido.')
  const { error } = await (await archivio()).auth.signInWithOtp({ email: pulita, options: { shouldCreateUser: false } })
  if (error) {
    if (/signup|not allowed|not found/i.test(error.message)) {
      throw new Error("Con questa email il coach non ha nessun account. Usa quella con cui entri nella sua app.")
    }
    if (/rate|too many|seconds/i.test(error.message)) {
      throw new Error('Troppe richieste ravvicinate. Aspetta qualche minuto e riprova.')
    }
    throw new Error(error.message)
  }
}

/**
 * Il pezzo del link che vale come accesso.
 *
 * Il link della mail e' del tipo «…/auth/v1/verify?token=…&type=magiclink…».
 * Si accetta anche incollato con del testo intorno.
 */
export function codiceDalLink(testo: string): { codice: string; tipo: string } | null {
  const url = testo.match(/https?:\/\/\S+/)?.[0]
  if (!url) return null
  try {
    const u = new URL(url)
    const codice = u.searchParams.get('token') ?? u.searchParams.get('token_hash')
    if (!codice) return null
    return { codice, tipo: u.searchParams.get('type') ?? 'magiclink' }
  } catch {
    return null
  }
}

/** Scambia il link con l'accesso. Da li' in poi la sessione si rinnova da sola. */
export async function collegaConLink(testo: string): Promise<Collegamento> {
  const trovato = codiceDalLink(testo)
  if (!trovato) throw new Error('Non trovo il link della mail. Tieni premuto il pulsante nella mail, «Copia link», e incollalo qui.')
  const a = await archivio()
  // «email» e' il nome attuale del tipo; i link vecchi dicono ancora «magiclink».
  let { error } = await a.auth.verifyOtp({ token_hash: trovato.codice, type: 'email' })
  if (error && trovato.tipo === 'magiclink') {
    ({ error } = await a.auth.verifyOtp({ token_hash: trovato.codice, type: 'magiclink' }))
  }
  if (error) {
    if (/expired|invalid/i.test(error.message)) {
      throw new Error('Link scaduto o già usato: chiedi una mail nuova e incolla il link senza aprirlo.')
    }
    throw new Error(error.message)
  }
  return statoCollegamento()
}

export async function scollega(): Promise<void> {
  try { await (await archivio()).auth.signOut({ scope: 'local' }) } catch { /* gia' fuori */ }
}

// --- Il piano ----------------------------------------------------------------------

/** Come si chiamano le sue giornate nel suo archivio, e come si chiamano qui. */
const GIORNATE: Record<string, { key: string; nome: string }> = {
  'LOW ON': { key: 'rs_low_on', nome: '🦠 LOW ON' },
  'LOW OFF': { key: 'rs_low_off', nome: '🦠 LOW OFF' },
  'HIGH ON': { key: 'rs_high_on', nome: '🦠 HIGH ON' },
  'HIGH OFF': { key: 'rs_high_off', nome: '🦠 HIGH OFF' },
}

interface GiornoArchivio {
  nome: string
  tot: { KCAL: string | number; CHO: string | number; PRO: string | number; FAT: string | number }
  pasti: { nome: string; items: { qty: string; alimento: string }[] }[]
}

const numero = (v: string | number): number => (typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.]/g, '')))

export interface PianoDalCoach { giornate: GiornataPianoRs[]; pubblicato: string | null }

/**
 * Traduce il suo formato nel nostro. Il suo piano ha i totali in testo
 * («2951») e le grammature con l'unita' attaccata («1,5gr»): qui diventano
 * numeri, e i suoi nomi degli alimenti diventano i tuoi dove differiscono.
 */
export function traduciPiano(contenuto: unknown, attuale: GiornataPianoRs[] = GIORNATE_RS): GiornataPianoRs[] {
  const pilastri = (contenuto as { pilastri?: { tipo?: string; giorni?: GiornoArchivio[] }[] })?.pilastri
  const dieta = pilastri?.find((p) => p.tipo === 'dieta')
  if (!dieta?.giorni?.length) throw new Error('Nel suo archivio non trovo la dieta: la sua app potrebbe essere cambiata.')
  const out: GiornataPianoRs[] = []
  for (const g of dieta.giorni) {
    const chi = GIORNATE[g.nome?.trim().toUpperCase()]
    if (!chi) continue
    const prima = attuale.find((x) => x.key === chi.key)
    out.push({
      key: chi.key,
      nome: chi.nome,
      targets: { kcal: numero(g.tot.KCAL), carbs: numero(g.tot.CHO), protein: numero(g.tot.PRO), fat: numero(g.tot.FAT) },
      // L'acqua non sta nella sua dieta: resta quella del piano in uso.
      acqua: prima?.acqua ?? 5.5,
      pasti: (g.pasti ?? []).map((p) => ({
        nome: p.nome,
        righe: (p.items ?? []).map((it) => ({ alimento: NOMI_DEL_COACH[it.alimento] ?? it.alimento, g: numero(it.qty) })),
      })),
    })
  }
  if (!out.length) throw new Error('Il suo piano non ha le giornate LOW / HIGH che conosco: la sua app potrebbe essere cambiata.')
  const rotti = out.filter((g) => !g.targets.kcal || Number.isNaN(g.targets.kcal))
  if (rotti.length) throw new Error(`Non riesco a leggere i totali di ${rotti.map((g) => g.nome.replace('🦠 ', '')).join(', ')}.`)
  return out
}

/** Legge il piano pubblicato dal coach per te. Solo lettura. */
export async function pianoDalCoach(attuale?: GiornataPianoRs[]): Promise<PianoDalCoach> {
  const a = await archivio()
  const { data: sessione } = await a.auth.getSession()
  if (!sessione.session) throw new Error("Non sei collegato: collega prima l'app al coach.")
  const { data, error } = await a
    .from('protocols')
    .select('stato, published_at, content')
    .order('published_at', { ascending: false })
  if (error) {
    if (/jwt|token|auth/i.test(error.message)) throw new Error('Il collegamento è scaduto: ricollegati con una mail nuova.')
    throw new Error(error.message)
  }
  const righe = (data ?? []) as { stato?: string; published_at?: string; content: unknown }[]
  // Quello in uso: «live» se c'e', altrimenti il piu' recente.
  const scelto = righe.find((r) => r.stato === 'live') ?? righe[0]
  if (!scelto) throw new Error('Il coach non ha ancora pubblicato un protocollo per te.')
  return { giornate: traduciPiano(scelto.content, attuale), pubblicato: scelto.published_at ?? null }
}

// Invio ad Autogestione: il backup di ETP Health resta qui, in Cloudflare KV.
//
// L'app lo manda (POST), lo script dell'autogestione sul PC lo scarica (GET)
// e lo mette in Autogestione/ETP/. Niente Microsoft: un account personale non
// può registrare app senza Azure.
//
// Chi scrive: solo il telefono collegato a WHOOP (il suo codice dispositivo
// ha i token nel KV) e solo dal sito dell'app. Chi legge: solo chi ha
// AUTOGESTIONE_TOKEN, un wrangler secret di Emanuel, mai nel codice.

const ORIGINE = 'https://epol91.github.io'
/** Le tabelle su cui si controlla il calo: oltre il 20% in meno il backup è sospetto. */
const DA_CONTROLLARE = ['sessions', 'sets', 'bodyMeasurements', 'foodLogs', 'whoopDays']
const CALO_MAX = 0.2
const GIORNI_TENUTI = 30
/** Un valore KV arriva a 25 MiB: oltre i 20 MB si avvisa, oltre il limite si rifiuta. */
const AVVISO_MB = 20
const LIMITE = 25 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': ORIGINE,
  'Access-Control-Allow-Headers': 'content-type, x-device, x-sha1, x-conti',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra } })

async function sha1(buf) {
  const h = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Confronto a tempo costante: il codice non si indovina un carattere alla volta. */
function uguali(a, b) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

const meno = (data, n) => new Date(Date.parse(data + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10)
const domenica = (data) => new Date(data + 'T00:00:00Z').getUTCDay() === 0

async function giorni(env) {
  const out = []
  let cursor
  do {
    const r = await env.WHOOP.list({ prefix: 'backup:', cursor })
    for (const k of r.keys) out.push(k.name.slice(7))
    cursor = r.list_complete ? undefined : r.cursor
  } while (cursor)
  return out.sort()
}

/** Tiene gli ultimi 30 giorni e le domeniche. */
async function pulisci(env, oggi) {
  const dal = meno(oggi, GIORNI_TENUTI - 1)
  let tolti = 0
  for (const d of await giorni(env)) {
    if (d >= dal || domenica(d)) continue
    await env.WHOOP.delete('backup:' + d)
    tolti++
  }
  return tolti
}

async function ricevi(request, env, url) {
  if (request.headers.get('origin') !== ORIGINE) return json({ errore: 'origine non ammessa' }, 403)
  const device = request.headers.get('x-device') || ''
  if (device.length < 16 || !(await env.WHOOP.get('tok:' + device))) {
    return json({ errore: 'telefono non collegato a WHOOP', collega: true }, 401)
  }

  const data = url.searchParams.get('data') || ''
  const forza = url.searchParams.get('forza') === '1'
  const atteso = (request.headers.get('x-sha1') || '').toLowerCase()
  let conti
  try { conti = JSON.parse(request.headers.get('x-conti') || '') } catch { conti = null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^[0-9a-f]{40}$/.test(atteso) || !conti || typeof conti !== 'object') {
    return json({ errore: 'richiesta incompleta' }, 400)
  }

  const corpo = await request.arrayBuffer()
  if (corpo.byteLength > LIMITE) return json({ errore: `backup troppo grande (${(corpo.byteLength / 1e6).toFixed(1)} MB, limite 25)` }, 413)
  // Valido e completo: comincia come un backup, finisce con la graffa, ed è
  // identico byte per byte a quello che l'app ha riletto prima di partire.
  const inizio = new TextDecoder().decode(corpo.slice(0, 40))
  const fine = new Uint8Array(corpo.slice(-1))[0]
  if (corpo.byteLength < 200 || !inizio.startsWith('{"format":"gymlog-backup"') || fine !== 0x7d) {
    return json({ errore: 'il file non è un backup di ETP Health' }, 400)
  }
  if (await sha1(corpo) !== atteso) return json({ errore: 'il backup è arrivato incompleto' }, 400)

  // Backup sospetto: molte meno righe dell'ultimo salvato. Non si tocca niente.
  const prima = JSON.parse((await env.WHOOP.get('ag:ultimo')) || 'null')
  if (prima && !forza) {
    const calo = DA_CONTROLLARE
      .map((t) => ({ tabella: t, prima: prima.conti[t] ?? 0, ora: conti[t] ?? 0 }))
      .filter((x) => x.prima >= 10 && x.ora < x.prima * (1 - CALO_MAX))
    if (calo.length) return json({ calo, ultimo: { at: prima.at, data: prima.data } }, 409)
  }

  // La scrittura di una chiave KV è tutta o niente: o resta il vecchio backup
  // del giorno, o c'è il nuovo intero. Un secondo invio nello stesso giorno lo sostituisce.
  const at = new Date().toISOString()
  await env.WHOOP.put('backup:' + data, corpo, { metadata: { at, bytes: corpo.byteLength } })
  await env.WHOOP.put('ag:ultimo', JSON.stringify({ conti, at, data }))
  let tolti = 0
  try { tolti = await pulisci(env, data) } catch { /* riprova al prossimo invio */ }
  const avviso = corpo.byteLength > AVVISO_MB * 1e6 ? `il backup pesa ${(corpo.byteLength / 1e6).toFixed(1)} MB: il limite è 25` : null
  return json({ ok: true, data, bytes: corpo.byteLength, at, tolti, avviso })
}

async function consegna(request, env, giorno) {
  const h = request.headers.get('authorization') || ''
  const dato = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!env.AUTOGESTIONE_TOKEN || !dato || !uguali(dato, env.AUTOGESTIONE_TOKEN)) return json({ errore: 'codice non valido' }, 401)
  let data = giorno
  if (giorno === 'ultimo') {
    const tutti = await giorni(env)
    data = tutti[tutti.length - 1]
    if (!data) return json({ errore: 'nessun backup ancora' }, 404)
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return json({ errore: 'data non valida' }, 400)
  const corpo = await env.WHOOP.get('backup:' + data, 'arrayBuffer')
  if (!corpo) return json({ errore: `nessun backup del ${data}` }, 404)
  return new Response(corpo, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-backup-data': data } })
}

/** Gestisce /autogestione/…; null se il percorso non è suo. */
export async function autogestione(request, env, url) {
  const p = url.pathname
  if (!p.startsWith('/autogestione/')) return null
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (p === '/autogestione/backup' && request.method === 'POST') return ricevi(request, env, url)
  const m = /^\/autogestione\/backup\/([^/]+)$/.exec(p)
  if (m && request.method === 'GET') return consegna(request, env, m[1])
  return json({ errore: 'percorso sconosciuto' }, 404)
}

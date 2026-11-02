// Ponte verso OneDrive per l'invio ad Autogestione.
//
// L'app manda il backup, il Worker lo scrive nel tuo OneDrive con Microsoft
// Graph (OAuth delegato: il refresh token sta nel KV, come per WHOOP). Il
// backup non resta qui: transita e basta. Nel KV restano solo il token, l'impronta
// della chiave dell'app e quante righe aveva l'ultimo backup salvato.
//
// Chi può inviare: solo l'app che ha fatto l'accesso Microsoft con il TUO
// account (MS_EMAIL). Al ritorno dal login il Worker le dà una chiave casuale;
// qui se ne tiene solo l'impronta. Un nuovo accesso sostituisce la chiave.

const MS_AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const MS_TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = 'offline_access Files.ReadWrite User.Read'
const CARTELLA = 'CLAUDE/7. ETP HEALTH/Autogestione/ETP'
const PERCORSO = CARTELLA.split('/').map(encodeURIComponent).join('/')

/** Le tabelle su cui si controlla il calo: se una scende di oltre il 20% il backup è sospetto. */
const DA_CONTROLLARE = ['sessions', 'sets', 'bodyMeasurements', 'foodLogs', 'whoopDays']
const CALO_MAX = 0.2
/** Pulizia: gli ultimi 30 giorni, più tutte le domeniche. */
const GIORNI_TENUTI = 30

const NOME = /^etp-health-(\d{4}-\d{2}-\d{2})\.json$/

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-sha1, x-conti',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (env, obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(env) } })

const page = (titolo, testo, ok) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titolo}</title>
<body style="margin:0;background:#0e0e10;color:#f2f2f2;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;text-align:center">
<div style="padding:24px;max-width:420px">
  <div style="font-size:40px;margin-bottom:12px">${ok ? '&#10003;' : '&#10007;'}</div>
  <h1 style="font-family:Georgia,serif;color:${ok ? '#d4af37' : '#e57373'};font-size:22px;margin:0 0 8px">${titolo}</h1>
  <p style="color:#8f8f8f;line-height:1.6">${testo}</p>
</div>`,
  { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
)

async function sha(alg, dati) {
  const buf = await crypto.subtle.digest(alg, typeof dati === 'string' ? new TextEncoder().encode(dati) : dati)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function salvaToken(env, t) {
  await env.WHOOP.put('ms:tok', JSON.stringify({
    access: t.access_token,
    refresh: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    updatedAt: new Date().toISOString(),
  }))
}

/** Token Graph valido, rinnovato se scaduto. Null se il collegamento non c'è più. */
async function token(env) {
  const raw = await env.WHOOP.get('ms:tok')
  if (!raw) return null
  const tok = JSON.parse(raw)
  if (tok.expiresAt - 60000 > Date.now()) return tok.access
  const res = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: tok.refresh, scope: SCOPES,
      client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET,
    }),
  })
  if (!res.ok) { await env.WHOOP.delete('ms:tok'); return null }
  const t = await res.json()
  await salvaToken(env, t)
  return t.access_token
}

/** La chiave dell'app è quella giusta? Se ne confronta l'impronta, mai la chiave. */
async function autorizzato(env, request) {
  const h = request.headers.get('authorization') || ''
  const chiave = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (chiave.length < 40) return false
  const atteso = await env.WHOOP.get('ms:chiave')
  return !!atteso && atteso === await sha('SHA-256', chiave)
}

const graph = (access, path, init = {}) =>
  fetch(GRAPH + path, { ...init, headers: { authorization: 'Bearer ' + access, ...(init.headers || {}) } })

const rinomina = (access, id, nome, sostituisci) =>
  graph(access, `/me/drive/items/${id}${sostituisci ? '?@microsoft.graph.conflictBehavior=replace' : ''}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: nome }),
  })

/**
 * Il file temporaneo è identico a quello che l'app ha preparato? Stessa
 * dimensione e stessa impronta SHA-1 (l'app la calcola sul JSON che ha appena
 * riletto e verificato). Se OneDrive non dà l'impronta, si riscarica il file.
 */
async function verifica(access, item, bytes, sha1) {
  if (item.size !== bytes) return false
  let h = item.file?.hashes?.sha1Hash
  if (!h) {
    const r = await graph(access, `/me/drive/items/${item.id}?$select=size,file`)
    if (r.ok) h = (await r.json()).file?.hashes?.sha1Hash
  }
  if (!h) {
    const r = await graph(access, `/me/drive/items/${item.id}/content`)
    if (!r.ok) return false
    h = await sha('SHA-1', await r.arrayBuffer())
  }
  return h.toLowerCase() === sha1
}

const giornoUTC = (s) => new Date(s + 'T00:00:00Z')
const meno = (s, n) => new Date(giornoUTC(s).getTime() - n * 86400000).toISOString().slice(0, 10)

/** Tiene gli ultimi 30 giorni e le domeniche; il resto va nel cestino di OneDrive. */
async function pulisci(access, oggi) {
  const r = await graph(access, `/me/drive/root:/${PERCORSO}:/children?$select=id,name&$top=999`)
  if (!r.ok) return 0
  const dal = meno(oggi, GIORNI_TENUTI - 1)
  let tolti = 0
  for (const f of (await r.json()).value ?? []) {
    const m = NOME.exec(f.name)
    if (!m) continue // file che non sono nostri: non si toccano
    const d = m[1]
    if (d >= dal || giornoUTC(d).getUTCDay() === 0) continue
    const del = await graph(access, `/me/drive/items/${f.id}`, { method: 'DELETE' })
    if (del.ok) tolti++
  }
  return tolti
}

async function invia(env, request, url) {
  const data = url.searchParams.get('data') || ''
  const forza = url.searchParams.get('forza') === '1'
  const sha1 = (request.headers.get('x-sha1') || '').toLowerCase()
  let conti
  try { conti = JSON.parse(request.headers.get('x-conti') || '') } catch { conti = null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^[0-9a-f]{40}$/.test(sha1) || !conti || typeof conti !== 'object') {
    return json(env, { errore: 'richiesta incompleta' }, 400)
  }

  const corpo = await request.arrayBuffer()
  // Un backup comincia sempre così e finisce con la graffa: niente parse qui,
  // l'integrità la garantiscono dimensione e impronta controllate dopo.
  const inizio = new TextDecoder().decode(corpo.slice(0, 40))
  const fine = new Uint8Array(corpo.slice(-1))[0]
  if (corpo.byteLength < 200 || !inizio.startsWith('{"format":"gymlog-backup"') || fine !== 0x7d) {
    return json(env, { errore: 'il file non è un backup di ETP Health' }, 400)
  }

  // Backup sospetto: molte meno righe dell'ultimo salvato.
  const prima = JSON.parse((await env.WHOOP.get('ms:conti')) || 'null')
  if (prima && !forza) {
    const calo = DA_CONTROLLARE
      .map((t) => ({ tabella: t, prima: prima.conti[t] ?? 0, ora: conti[t] ?? 0 }))
      .filter((x) => x.prima >= 10 && x.ora < x.prima * (1 - CALO_MAX))
    if (calo.length) return json(env, { calo, ultimo: { at: prima.at, data: prima.data } }, 409)
  }

  const access = await token(env)
  if (!access) return json(env, { errore: 'ricollega' }, 401)

  const finale = `etp-health-${data}.json`
  const tmp = `.${finale}.tmp`
  // 1. Il temporaneo
  const up = await graph(access, `/me/drive/root:/${PERCORSO}/${encodeURIComponent(tmp)}:/content`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: corpo,
  })
  if (!up.ok) return json(env, { errore: `OneDrive non ha accettato il file (${up.status})` }, 502)
  const item = await up.json()

  // 2. È arrivato intero?
  if (!(await verifica(access, item, corpo.byteLength, sha1))) {
    await graph(access, `/me/drive/items/${item.id}`, { method: 'DELETE' })
    return json(env, { errore: 'il file è arrivato incompleto' }, 502)
  }

  // 3. Diventa il file del giorno. Se OneDrive non sostituisce in un colpo, si
  //    sposta da parte il vecchio e lo si rimette se il cambio non riesce.
  let r = await rinomina(access, item.id, finale, true)
  if (r.status === 409) {
    const vecchio = await graph(access, `/me/drive/root:/${PERCORSO}/${encodeURIComponent(finale)}?$select=id`)
    const vid = vecchio.ok ? (await vecchio.json()).id : null
    if (vid && (await rinomina(access, vid, `.${finale}.prec`, false)).ok) {
      r = await rinomina(access, item.id, finale, false)
      if (r.ok) await graph(access, `/me/drive/items/${vid}`, { method: 'DELETE' })
      else await rinomina(access, vid, finale, false)
    }
  }
  if (!r.ok) {
    await graph(access, `/me/drive/items/${item.id}`, { method: 'DELETE' })
    return json(env, { errore: `non sono riuscito a sostituire il file (${r.status})` }, 502)
  }

  const at = new Date().toISOString()
  await env.WHOOP.put('ms:conti', JSON.stringify({ conti, at, data }))
  let tolti = 0
  try { tolti = await pulisci(access, data) } catch { /* la pulizia riprova al prossimo invio */ }
  return json(env, { ok: true, file: finale, bytes: corpo.byteLength, at, tolti })
}

/** Gestisce /ms/…; null se il percorso non è suo. */
export async function onedrive(request, env, url) {
  const p = url.pathname
  if (!p.startsWith('/ms/')) return null
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })

  // --- Accesso Microsoft (una volta sola) ----------------------------------
  if (p === '/ms/auth') {
    const ritorno = url.searchParams.get('r') || ''
    if (!ritorno.startsWith(env.APP_ORIGIN + '/')) return page('Indirizzo non valido', "Il collegamento si avvia dall'app.", false)
    const state = crypto.randomUUID().replace(/-/g, '')
    await env.WHOOP.put('ms-st:' + state, JSON.stringify({ ritorno }), { expirationTtl: 600 })
    const q = new URLSearchParams({
      client_id: env.MS_CLIENT_ID, response_type: 'code', redirect_uri: env.MS_REDIRECT_URI,
      response_mode: 'query', scope: SCOPES, state, prompt: 'select_account',
    })
    return Response.redirect(MS_AUTH + '?' + q, 302)
  }

  if (p === '/ms/callback') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return page('Collegamento non riuscito', 'Microsoft non ha restituito il codice di autorizzazione.', false)
    const raw = await env.WHOOP.get('ms-st:' + state)
    if (!raw) return page('Collegamento scaduto', "Sono passati troppi minuti. Riprova dall'app.", false)
    await env.WHOOP.delete('ms-st:' + state)
    const { ritorno } = JSON.parse(raw)

    const res = await fetch(MS_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: env.MS_REDIRECT_URI, scope: SCOPES,
        client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET,
      }),
    })
    if (!res.ok) return page('Collegamento non riuscito', 'Microsoft ha rifiutato lo scambio del token.', false)
    const t = await res.json()

    // Solo il tuo account: un altro accesso non deve poter prendere il posto del tuo.
    const me = await fetch(GRAPH + '/me?$select=userPrincipalName,mail', { headers: { authorization: 'Bearer ' + t.access_token } })
    const io = me.ok ? await me.json() : {}
    const email = String(env.MS_EMAIL || '').trim().toLowerCase()
    const chi = [io.userPrincipalName, io.mail].filter(Boolean).map((x) => String(x).toLowerCase())
    if (!email || !chi.includes(email)) return page('Account non autorizzato', 'Questo account Microsoft non è quello collegato ad ETP Health.', false)

    await salvaToken(env, t)
    const chiave = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
    await env.WHOOP.put('ms:chiave', await sha('SHA-256', chiave))
    return Response.redirect(`${ritorno}#ms=ok&k=${chiave}`, 302)
  }

  // --- Da qui solo l'app, con la sua chiave --------------------------------
  if (request.headers.get('origin') !== env.APP_ORIGIN) return json(env, { errore: 'origine non ammessa' }, 403)
  if (!(await autorizzato(env, request))) return json(env, { errore: 'chiave non valida', ricollega: true }, 401)

  if (p === '/ms/stato') {
    const tok = await env.WHOOP.get('ms:tok')
    const prima = JSON.parse((await env.WHOOP.get('ms:conti')) || 'null')
    return json(env, { collegato: !!tok, ultimo: prima ? { at: prima.at, data: prima.data } : null })
  }

  if (p === '/ms/invia' && request.method === 'POST') return invia(env, request, url)

  if (p === '/ms/scollega' && request.method === 'POST') {
    await env.WHOOP.delete('ms:tok')
    await env.WHOOP.delete('ms:chiave')
    return json(env, { collegato: false })
  }

  return json(env, { errore: 'percorso sconosciuto' }, 404)
}

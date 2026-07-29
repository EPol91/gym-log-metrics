// Ponte OAuth verso WHOOP per ETP HEALTH.
//
// Perché esiste: lo scambio del token richiede il Client Secret, che non può
// stare in una pagina statica. Il Worker lo custodisce, tiene i token e fa da
// tramite per le chiamate — così l'app non vede mai né l'uno né gli altri.
//
// I dati sanitari NON vengono conservati qui: transitano e basta.

const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API = 'https://api.prod.whoop.com/developer'
const SCOPES = [
  'read:recovery', 'read:sleep', 'read:cycles', 'read:workout',
  'read:profile', 'read:body_measurement', 'offline',
].join(' ')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-device',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } })

/** Pagina di ritorno dopo il consenso: si chiude da sola se aperta in una scheda. */
const page = (titolo, testo, ok) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titolo}</title>
<body style="margin:0;background:#0e0e10;color:#f2f2f2;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh;text-align:center">
<div style="padding:24px;max-width:420px">
  <div style="font-size:40px;margin-bottom:12px">${ok ? '&#10003;' : '&#10007;'}</div>
  <h1 style="font-family:Georgia,serif;color:${ok ? '#d4af37' : '#e57373'};font-size:22px;margin:0 0 8px">${titolo}</h1>
  <p style="color:#8f8f8f;line-height:1.6">${testo}</p>
</div>
<script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script>`,
  { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
)

async function salva(env, device, t) {
  await env.WHOOP.put('tok:' + device, JSON.stringify({
    access: t.access_token,
    refresh: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    updatedAt: new Date().toISOString(),
  }))
}

/** Token valido per un dispositivo, rinnovato se scaduto. Null se non collegato. */
async function tokenFor(env, device) {
  const raw = await env.WHOOP.get('tok:' + device)
  if (!raw) return null
  const tok = JSON.parse(raw)
  // Margine di un minuto: meglio rinnovare in anticipo che fallire a metà chiamata.
  if (tok.expiresAt - 60000 > Date.now()) return tok.access

  const res = await fetch(WHOOP_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tok.refresh,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      scope: 'offline',
    }),
  })
  if (!res.ok) { await env.WHOOP.delete('tok:' + device); return null }
  const t = await res.json()
  await salva(env, device, t)
  return t.access_token
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const p = url.pathname
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    // --- Avvio del consenso -------------------------------------------------
    if (p === '/auth') {
      const device = url.searchParams.get('d')
      const ritorno = url.searchParams.get('r') || ''
      if (!device || device.length < 16) return json({ errore: 'dispositivo mancante' }, 400)
      // Lo state dev'essere lungo almeno otto caratteri e non indovinabile.
      const state = crypto.randomUUID().replace(/-/g, '')
      await env.WHOOP.put('st:' + state, JSON.stringify({ device, ritorno }), { expirationTtl: 600 })
      const q = new URLSearchParams({
        client_id: env.WHOOP_CLIENT_ID,
        redirect_uri: env.REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        state,
      })
      return Response.redirect(WHOOP_AUTH + '?' + q, 302)
    }

    // --- Ritorno da WHOOP ---------------------------------------------------
    if (p === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state) return page('Collegamento non riuscito', 'WHOOP non ha restituito il codice di autorizzazione.', false)
      const raw = await env.WHOOP.get('st:' + state)
      if (!raw) return page('Collegamento scaduto', 'Sono passati troppi minuti. Riprova dal Profilo.', false)
      await env.WHOOP.delete('st:' + state)
      const { device, ritorno } = JSON.parse(raw)

      const res = await fetch(WHOOP_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: env.WHOOP_CLIENT_ID,
          client_secret: env.WHOOP_CLIENT_SECRET,
          redirect_uri: env.REDIRECT_URI,
        }),
      })
      if (!res.ok) return page('Collegamento non riuscito', 'WHOOP ha rifiutato lo scambio del token.', false)
      await salva(env, device, await res.json())

      if (ritorno && ritorno.startsWith('https://')) return Response.redirect(ritorno + '#whoop=ok', 302)
      return page('WHOOP collegato', 'Puoi tornare in ETP HEALTH: i dati arrivano al prossimo aggiornamento.', true)
    }

    // --- Stato del collegamento --------------------------------------------
    if (p === '/stato') {
      const device = request.headers.get('x-device') || url.searchParams.get('d')
      if (!device) return json({ collegato: false })
      const raw = await env.WHOOP.get('tok:' + device)
      return json({ collegato: !!raw, aggiornato: raw ? JSON.parse(raw).updatedAt : null })
    }

    // --- Scollegamento ------------------------------------------------------
    if (p === '/scollega') {
      const device = request.headers.get('x-device') || url.searchParams.get('d')
      if (device) {
        const access = await tokenFor(env, device)
        // Revoca anche lato WHOOP: cancellare solo qui lascerebbe il consenso attivo.
        if (access) {
          try {
            await fetch(WHOOP_API + '/v2/user/access', {
              method: 'DELETE', headers: { authorization: 'Bearer ' + access },
            })
          } catch (e) { /* la revoca remota è un di più: i token qui vanno via comunque */ }
        }
        await env.WHOOP.delete('tok:' + device)
      }
      return json({ collegato: false })
    }

    // --- Tramite verso l'API ------------------------------------------------
    if (p.startsWith('/api/')) {
      const device = request.headers.get('x-device') || url.searchParams.get('d')
      if (!device) return json({ errore: 'dispositivo mancante' }, 400)
      const access = await tokenFor(env, device)
      if (!access) return json({ errore: 'non collegato' }, 401)

      const target = new URL(WHOOP_API + p.slice(4))
      for (const [k, v] of url.searchParams) if (k !== 'd') target.searchParams.set(k, v)
      const res = await fetch(target, { headers: { authorization: 'Bearer ' + access } })
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json', ...cors },
      })
    }

    return json({ servizio: 'etp-health-whoop', percorsi: ['/auth', '/callback', '/stato', '/scollega', '/api/…'] }, 404)
  },
}

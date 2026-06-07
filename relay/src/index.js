/**
 * MEATER Cloud -> Even Hub relay (Cloudflare Worker)
 *
 * Why this exists: the Even Hub WebView enforces browser CORS, and the MEATER
 * public REST API does not send CORS headers. This Worker holds the MEATER
 * credentials, polls MEATER Cloud server-to-server, and re-serves a compact
 * "active cooks" payload with permissive CORS so the glasses app can fetch it.
 *
 * Endpoints:
 *   GET  /        -> health check
 *   GET  /cooks   -> { cooks: [...], unit, fetchedAt }
 *   OPTIONS *     -> CORS preflight
 *
 * Secrets (set with `wrangler secret put ...`):
 *   MEATER_EMAIL + MEATER_PASSWORD   (or MEATER_JWT to skip the login step)
 */

const MEATER_BASE = 'https://public-api.cloud.meater.com/v1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

// Cached per-isolate. The MEATER JWT does not expire, so we reuse it and only
// re-authenticate on a 401 (token reset).
let cachedToken = null

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'meater-relay' })
      }

      if (url.pathname === '/cooks') {
        const unit = (url.searchParams.get('unit') || 'F').toUpperCase() === 'C' ? 'C' : 'F'
        const devices = await getDevices(env)
        const cooks = devices.filter((d) => d && d.cook).map((d) => toCook(d, unit))
        return json({ cooks, unit, fetchedAt: Date.now() })
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, (err && err.status) || 502)
    }
  },
}

async function login(env) {
  if (env.MEATER_JWT) return env.MEATER_JWT
  if (!env.MEATER_EMAIL || !env.MEATER_PASSWORD) {
    throw httpError(500, 'Relay not configured: set MEATER_EMAIL + MEATER_PASSWORD secrets')
  }
  const res = await fetch(`${MEATER_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.MEATER_EMAIL, password: env.MEATER_PASSWORD }),
  })
  if (!res.ok) throw httpError(502, `MEATER login failed (${res.status})`)
  const body = await res.json()
  const token = body?.data?.token ?? body?.data?.jwt ?? body?.token
  if (!token) throw httpError(502, 'MEATER login returned no token')
  return token
}

async function getDevices(env) {
  if (!cachedToken) cachedToken = await login(env)

  let res = await meaterGet('/devices', cachedToken)
  if (res.status === 401) {
    cachedToken = await login(env) // token was reset; re-auth once
    res = await meaterGet('/devices', cachedToken)
  }
  if (!res.ok) throw httpError(502, `MEATER /devices failed (${res.status})`)

  const body = await res.json()
  // Public API shape: { data: { devices: [...] } }. Be defensive about variants.
  const devices = body?.data?.devices ?? body?.data ?? []
  return Array.isArray(devices) ? devices : []
}

function meaterGet(path, token) {
  return fetch(`${MEATER_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
}

/** Map a raw MEATER device (Celsius) into a compact, glasses-friendly cook. */
function toCook(d, unit) {
  const t = d.temperature || {}
  const cook = d.cook || {}
  const ct = cook.temperature || {}
  const time = cook.time || {}

  const internalC = num(t.internal)
  const targetC = num(ct.target)
  const remaining = num(time.remaining)

  return {
    id: d.id,
    name: cook.name || 'Cook',
    state: cook.state ?? 'Cooking',
    internal: temp(internalC, unit),
    ambient: temp(num(t.ambient), unit),
    target: temp(targetC, unit),
    peak: temp(num(ct.peak), unit),
    elapsedSec: num(time.elapsed) ?? 0,
    // MEATER returns -1 for "remaining" while it is still estimating.
    remainingSec: remaining != null && remaining >= 0 ? remaining : null,
    // Rough progress: ratio of current to target temp (computed in Celsius).
    // Not a true done-ness metric, but a useful glanceable bar.
    progressPct:
      internalC != null && targetC ? clamp(Math.round((internalC / targetC) * 100), 0, 100) : null,
  }
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function temp(c, unit) {
  if (c == null) return null
  return Math.round(unit === 'C' ? c : (c * 9) / 5 + 32)
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

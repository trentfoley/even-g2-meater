// Live smoke test for the MEATER relay. Reads creds from env — stores no secrets.
//   MEATER_EMAIL=... MEATER_PASSWORD=... node test-live.mjs
const email = process.env.MEATER_EMAIL
const password = process.env.MEATER_PASSWORD
if (!email || !password) {
  console.error('Set MEATER_EMAIL and MEATER_PASSWORD env vars')
  process.exit(1)
}
const BASE = 'https://public-api.cloud.meater.com/v1'

const lr = await fetch(BASE + '/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
console.log('LOGIN', lr.status)
const lj = await lr.json().catch(() => null)
console.log('  top-level keys:', lj && Object.keys(lj))
console.log('  data keys:', lj && lj.data && Object.keys(lj.data))
const token = lj?.data?.token ?? lj?.data?.jwt ?? lj?.token
console.log('  data.token present:', !!lj?.data?.token, '| token len:', token ? String(token).length : 0)

if (token) {
  const dr = await fetch(BASE + '/devices', { headers: { Authorization: 'Bearer ' + token } })
  console.log('DEVICES', dr.status)
  const dj = await dr.json().catch(() => null)
  console.log('  top-level keys:', dj && Object.keys(dj))
  console.log('  data keys:', dj && dj.data && Object.keys(dj.data))
  const devices = dj?.data?.devices ?? dj?.data ?? []
  console.log('  device count:', Array.isArray(devices) ? devices.length : '(not an array)')
  if (devices[0]) console.log('  sample device:', JSON.stringify({ ...devices[0], id: '<redacted>' }, null, 2))
}

// End-to-end through the actual Worker handler:
const m = await import('./src/index.js')
const res = await m.default.fetch(new Request('https://r/cooks'), { MEATER_EMAIL: email, MEATER_PASSWORD: password })
console.log('WORKER /cooks', res.status, '->', await res.text())

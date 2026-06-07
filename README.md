# Meater Cooks — active MEATER cooks on Even Realities G2 glasses

> **Watch the meat, not your phone.**

See your live [MEATER](https://meater.com) probe cooks — each probe's internal temp,
target, ambient, cook progress, and estimated time remaining — on your **Even Realities
G2** smart glasses, refreshed continuously. Double-press the touchpad to exit.

```
Pork Shoulder  [Started]
  136°F -> 203°F   amb 236°F
  [######----] 61%   ETA 1h59
```

---

## How it works

Even Hub apps run in a WebView on the phone and enforce browser **CORS**; the MEATER
public API sends no CORS headers, so the glasses app can't call MEATER directly. A tiny
Cloudflare Worker bridges the gap — it holds your MEATER credentials, polls MEATER Cloud
server-to-server, and re-serves a compact "active cooks" feed *with* CORS.

```
MEATER probe(s) --BLE--> MEATER app/Block (phone) --> MEATER Cloud
                                                          |
                                            HTTPS (server-to-server, JWT)
                                                          v
                                                  relay/  (Cloudflare Worker)
                                                          |  adds CORS headers
                                                          v
   G2 glasses <--BLE-- Even Hub app (WebView, same phone)  <-- fetch /cooks (every 30s)
```

| Folder | What it is |
|--------|------------|
| `relay/` | Cloudflare Worker. Polls MEATER Cloud, exposes `GET /cooks` (CORS-enabled). |
| `glasses-app/` | Even Hub G2 app (Vite + TypeScript, `@evenrealities/even_hub_sdk`). |

## Prerequisites

- **Node.js 20 LTS or 22+** (Node 18 is not supported)
- A **Cloudflare account** (free tier is fine) for the relay
- A **MEATER account** with at least one *completed* cook — the public API only surfaces
  probes that have cooked and are currently connected, with the MEATER app/Block running
- For on-device use: **Even Realities G2 glasses** paired in the Even app. No glasses?
  Use the desktop **simulator** (below).

---

## 1. Deploy the relay

```powershell
cd relay
npm install
npx wrangler login                       # first time only (browser auth)

# MEATER credentials as encrypted Worker secrets (never committed):
npx wrangler secret put MEATER_EMAIL
npx wrangler secret put MEATER_PASSWORD

npm run deploy                            # prints https://meater-relay.<you>.workers.dev
```

Smoke-test it (start a cook first, or it returns an empty list):

```powershell
curl https://meater-relay.<you>.workers.dev/cooks
```

There's also a local end-to-end check that reads creds from env and stores nothing:

```powershell
$env:MEATER_EMAIL="you@example.com"; $env:MEATER_PASSWORD="..."; node relay/test-live.mjs
```

The relay defaults to °F; it also accepts `GET /cooks?unit=C`.

## 2. Run the glasses app

```powershell
cd glasses-app
npm install
copy .env.example .env.local              # then set VITE_RELAY_URL to your Worker URL
```

Point the app at your Worker in **two** places:
- `glasses-app/.env.local` → `VITE_RELAY_URL=https://meater-relay.<you>.workers.dev`
- `glasses-app/app.json` → `permissions[0].whitelist[0]` (the Even-side network allowlist)

```powershell
npm run dev                               # Vite on http://<LAN-IP>:5180
```

### Test in the simulator (no glasses needed)

```powershell
npm install -g @evenrealities/evenhub-simulator
evenhub-simulator http://localhost:5180
```

A glasses-display window opens and renders the live readout. Note: the desktop simulator
delivers taps as `sysEvent` while real G2 hardware uses `textEvent` — the input handler in
`src/main.ts` accepts both. (If you restart the sim, kill the old process first —
`taskkill /F /IM evenhub-simulator.exe` on Windows — or the new one collides on the port.)

### Sideload to real glasses

```powershell
npx evenhub login
npx evenhub qr --url "http://<LAN-IP>:5180"   # scan in the Even app (same Wi-Fi)
```

## 3. Package & publish to Even Hub

```powershell
cd glasses-app
npm run build                             # Vite production build -> dist/
npm run pack                              # -> g2-meater.ehpk
```

Upload `g2-meater.ehpk` via the Even Hub developer console at
[hub.evenrealities.com](https://hub.evenrealities.com), following the App Submission & QA
Guidelines. Bump `version` in `app.json` for each release.

---

## Controls

| Gesture | Action |
|---------|--------|
| Double-press temple touchpad (or R1 ring) | Exit (shows the confirm dialog) |

## Configuration & limits

- **Polling:** every 30s (MEATER recommends ≤ 2 requests / 60s).
- **Units:** °F by default (`/cooks?unit=C` for Celsius).
- **Active cooks:** the relay returns devices that currently have a `cook` object.
- **Display:** 576×288, 4-bit greyscale — text only, no font-size API, so layout is ASCII
  (e.g. `[######----] 61%`). Up to 3 cooks shown.
- **Keep the MEATER app/Block running** on the phone to maintain the probe→cloud bridge.
- **Keep the relay deployed** — the app fetches it at runtime.

## Troubleshooting

- **`/cooks` returns `Relay not configured`** → the `MEATER_EMAIL`/`MEATER_PASSWORD` secrets
  aren't set on the Worker. Run `npx wrangler secret list` to check; names are case-sensitive.
- **App shows a relay/CORS error** → confirm the Worker URL is in `app.json`'s network
  whitelist *and* `.env.local`, and that the Worker is deployed.
- **Empty readout / "No active cooks"** → no probe is currently cooking, or the MEATER app
  isn't connected to MEATER Cloud.

## Security

MEATER credentials live only as encrypted Cloudflare Worker secrets — never in the repo.
`.env.local`, `*.ehpk`, and `node_modules/` are git-ignored.

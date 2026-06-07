# CLAUDE.md — project guidance for Meater Cooks

Even Realities **G2** smart-glasses app that shows live **MEATER** probe cooks. Two parts:

- `relay/` — Cloudflare Worker. Holds MEATER creds, polls MEATER Cloud server-to-side,
  re-serves `GET /cooks` (active cooks) **with CORS headers**. Plain JS module worker.
- `glasses-app/` — Even Hub G2 app. Vite + TypeScript + `@evenrealities/even_hub_sdk`.
  Polls the relay every 30s and renders cooks to a 576×288 text container.

**Deployed:** relay is live at `https://meater-relay.foley-meater.workers.dev`
(`MEATER_EMAIL` + `MEATER_PASSWORD` are Cloudflare Worker secrets). Repo:
`github.com/trentfoley/even-g2-meater`.

---

## Gotchas (read these FIRST — each cost real time to learn)

1. **Why the relay exists = CORS.** Even Hub apps run in a phone WebView that enforces
   browser CORS; the MEATER public API sends no CORS headers, so the glasses app *cannot*
   call MEATER directly. The relay sets `Access-Control-Allow-Origin: *` on **every**
   response (errors included) so failures surface instead of silently breaking.

2. **Simulator taps arrive on different channels: sim = `sysEvent`, real G2 = `textEvent`.**
   Read `eventType` from whichever sub-object is present. `CLICK=0` is omitted on the wire
   (protobuf) → arrives `undefined` → coalesce `?? 0` (scope that to the sysEvent branch).
   `OsEventTypeList`: CLICK=0, SCROLL_TOP=1, SCROLL_BOTTOM=2, DOUBLE_CLICK=3, FG_ENTER=4,
   FG_EXIT=5, ABNORMAL_EXIT=6, SYSTEM_EXIT=7, IMU=8. Container needs `isEventCapture:1`.
   Exit = `bridge.shutDownPageContainer(1)` (confirm dialog); real teardown happens on the
   follow-up SYSTEM_EXIT(7) event. See `glasses-app/src/main.ts`.

3. **`TaskStop`/background-kill does NOT kill the simulator GUI process.** The detached
   `evenhub-simulator.exe` keeps running and holds the automation port → the next launch
   panics with `AddrInUse` (exit 127), leaving you staring at the OLD code. **Always**
   `taskkill //F //IM evenhub-simulator.exe` before relaunching.

4. **This sandbox's `curl` fails TLS (exit 35); use Node's `fetch` instead** (`node --input-type=module -e "..."`).
   Also: a freshly-deployed `*.workers.dev` subdomain has a short TLS cert-provisioning delay
   (handshake_failure for a few minutes) — not a bug.

5. **Vite dev port is 5180**, not the default 5173 (another local app owns 5173). Run with
   `npm run dev -- --port 5180 --strictPort`. The simulator auto-saves screenshots to the
   project root as `glasses_*.png` (git-ignored) — `Read` them to verify rendering visually.

6. **`evenhub pack` validates `app.json` strictly.** Required: `package_id`, `edition`
   ("202601"), `name`, `version`, `min_app_version`, `min_sdk_version`, `entrypoint`,
   `supported_languages` (subset of en/de/fr/es/it/zh/ja/ko). Limits: `name` ≤20,
   `tagline` ≤50, `description` ≤1024 chars. Missing `min_app_version`/`supported_languages`
   fails the pack.

---

## Commands

```powershell
# Relay (from relay/)
npm install; npx wrangler login            # first time
npx wrangler secret put MEATER_EMAIL       # + MEATER_PASSWORD
npm run deploy                             # wrangler deploy
node relay/test-live.mjs                   # live E2E check; reads creds from env, stores none

# Glasses app (from glasses-app/)
npm install
npm run dev -- --port 5180 --strictPort    # dev server
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json   # typecheck (build does NOT)
npm run build                              # vite build -> dist/ (base:'./', bakes in VITE_RELAY_URL)
npm run pack                               # -> g2-meater.ehpk

# Simulator (taskkill first!)
taskkill //F //IM evenhub-simulator.exe
evenhub-simulator --automation-port 9898 http://localhost:5180
```

## Authoritative references

- **SDK types:** `glasses-app/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` —
  read it directly; don't guess method/enum names.
- **Proven G2 patterns:** sibling repo `C:\Users\trent\Source\even-g2-stop-watch`
  (`src/input.ts`, `src/main.ts`) — a fuller, tested app. Source of the input-channel fix.
- **`everything-evenhub` plugin skills** are installed (glasses-ui, handle-input,
  sdk-reference, simulator-automation, build-and-deploy, font-measurement, etc.). Prefer
  them for Even Hub specifics.

## Key facts

- **MEATER API** (`public-api.cloud.meater.com/v1`): `POST /login` → `data.token` (JWT,
  non-expiring); `GET /devices` → `data.devices[]`. Temps in **Celsius** (relay converts to
  °F; `/cooks?unit=C` for C). `time.remaining = -1` while estimating. Public API only
  surfaces probes with an active cook AND a live MEATER app/Block connection. Rate limit
  ≤2 req/60s → 30s poll.
- **Display:** 576×288, 4-bit greyscale, no font-size API → ASCII layout. Updates via
  `textContainerUpgrade` (flicker-free), not full rebuilds. Up to 3 cooks shown.
- **Config wiring:** the Worker URL must be in BOTH `glasses-app/.env.local`
  (`VITE_RELAY_URL`) and `glasses-app/app.json` (network whitelist).

## Conventions & security

- TypeScript strict; 2-space indent; no semicolons (match existing files).
- **Never commit MEATER credentials** — they live only as Cloudflare Worker secrets.
  `.env.local`, `*.ehpk`, `node_modules/`, `dist/`, `glasses_*.png` are git-ignored.
- Default branch `main`. Don't push unless asked.

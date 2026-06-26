# CanTides — Claude Context

## Project
Progressive Web App displaying Canadian tide predictions.
- **Live URL:** https://cantides.sliochsoftware.ca
- **GitHub:** https://github.com/dfslioch/cantides
- **Deploy:** push to `main` → GitHub Actions → GitHub Pages (automatic)

## Stack
- Vite + Vanilla JS (ES modules)
- Chart.js + chartjs-adapter-date-fns + chartjs-plugin-annotation
- vite-plugin-pwa (Workbox service worker)
- No framework, no TypeScript

## CHS IWLS API — Confirmed Facts
Base URL: `https://api-iwls.dfo-mpo.gc.ca/api/v1`

### Endpoints
- `GET /stations` → plain array of all ~1571 station objects (no pagination)
- `GET /stations/{id}` → single station with `timeZone` field
- `GET /stations/{id}/data?time-series-code=wlp-hilo&from=...&to=...&datum=CD` → plain array of hi/lo events
- `GET /stations/{id}/data?time-series-code=wlp&from=...&to=...&datum=CD` → plain array of per-minute water levels

### Station object fields
```
id            — MongoDB ObjectId string (used in all /data calls, NOT the code)
code          — traditional 4-digit CHS code (display only)
officialName  — display name
latitude, longitude
operating     — boolean
type          — "PERMANENT" | "TEMPORARY" | "HISTORICAL"
timeSeries    — array of {code, id, nameEn, ...}; may be [] for obs-only stations
timeZone      — IANA tz string e.g. "America/Vancouver" (only on /stations/{id})
```

### Data response fields
- `eventDate` — ISO 8601 UTC string
- `value` — metres (always, regardless of datum param — datum shifts the zero reference)
- `type` — `"HIGH"` or `"LOW"` (wlp-hilo only; **no type field** on wlp)
- wlp-hilo has **no type field in API** — inferred by alternating pattern in `inferHiLoTypes()`
- wlp is **per-minute** resolution — downsample every 15th point for the main chart

### Station capabilities
- 1077 of 1571 stations have `wlp-hilo` (tide predictions)
- 494 have empty `timeSeries: []` (observation-only)
- `hasPredictions(station)` in `src/services/api.js` is the canonical check

### Region grouping
No `chsRegionCode` field in the station list. Regions inferred from longitude:
- `lon < -100` → Pacific (BC)
- `lon > -60` → Newfoundland & Labrador
- `lat > 55` → Central & Arctic
- `lat > 46` → Quebec
- else → Maritimes

### Gotchas
- All API dates/times are UTC — display in browser local time via `new Date(isoString)`
- `formatDayKey()` must use **local** date parts (not `toISOString()`) or day grouping breaks for UTC−offset timezones
- Station `id` (ObjectId) is used for all API calls; `code` is for display only
- Favorites store only `{id, name}` — `renderTideView` looks up full station from cache if `timeSeries` missing

## File Structure
```
src/
  main.js                 — router, nav, settings panel, offline banner
  styles/main.css         — dark maritime theme
  services/
    api.js                — CHS IWLS fetch wrappers + hasPredictions()
    storage.js            — favorites + settings in localStorage
    geo.js                — geolocation + Haversine nearest-station sort
    format.js             — height/time/date formatting (all local-time aware)
    sparkline.js          — shared SVG sparkline generator (used by homeView + tideView)
  views/
    homeView.js           — favorites home screen with next high/low preview + today sparkline
    browseView.js         — region drill-down + text search
    nearbyView.js         — GPS nearest stations (results cached in module scope)
    tideView.js           — main tide view: chart, current window, 7-day table + sparklines
public/
  CNAME                   — cantides.sliochsoftware.ca (keeps custom domain on redeploy)
  manifest.json           — PWA manifest
  sw.js                   — fallback SW (Workbox replaces on build)
  icons/icon.svg          — placeholder wave logo
.github/workflows/
  deploy.yml              — build + deploy to GitHub Pages on push to main
```

## Key Behaviours
- **Chart window:** −12h to +24h from now; downsampled wlp every 15th point
- **Day bands:** alternating box annotations; midnight dates drawn by custom `dayLabels` plugin in bottom padding
- **Hi/Lo type inference:** `inferHiLoTypes()` in api.js — first event vs neighbour, then strict alternating
- **Current Window:** hi/lo grid covering −12h to +24h (same window as chart), labelled "Current Window" not "Today"
- **7-day table:** grouped by local calendar day; sparklines (240×50) built from hi/lo data (no extra API call)
- **Home screen:** fetches startOfDay(0) to hoursFromNow(36); sparkline (240×28) displayed to the right of station name; next hi/lo below
- **Sparklines (shared):** `src/services/sparkline.js` — SVG, cubic bezier through hi/lo points + 1 neighbour each side; vertical dividers at 0h/6h/12h/18h/24h (full-height, opacity 0.6); baseline and topline framing the curve area
- **Home sparkline width:** fixed at 120px (`flex: 0 0 120px`); station name gets `flex: 1` so sparklines are consistent width regardless of name length
- **Offline banner:** fixed amber bar, `navigator.onLine` events
- **Timezone notice:** shown if station `timeZone` ≠ device timezone
- **Obs-only stations:** badge in lists; notice card in tide view instead of chart

## Settings (localStorage)
- `datum`: CD | MLLW | MSL (default CD)
- `units`: m | ft (default m)
- `timeFormat`: 24 | 12 (default 24)

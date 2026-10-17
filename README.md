# SkyFocus

A flight-themed focus timer. Each focus session is a simulated flight between real airports: book a route, focus while the plane crosses the map, and land to log it, earn miles and collect a passport stamp.

Runs entirely in the browser. No installs, no build step, no account.

## Launching

**Recommended: double-click `start.bat`.**

- If Python is installed, it starts a small local web server on the first free port of **8080, 8081, 8090** and opens `http://localhost:<port>/` in your default browser.
- The server runs in its own window titled **"SkyFocus server - close to stop"**. Close that window to stop SkyFocus.
- If Python isn't installed, `start.bat` simply opens `index.html` directly.

**Alternative: double-click `index.html`.** Everything works over `file://`, but:

- Your data is stored **separately** from the `start.bat` version (browsers treat `file://` and `http://localhost` as different sites). Use **Settings → Export JSON / Import JSON** to move data between them.
- Browser notifications (reminders, landing alerts) need the `start.bat` version.

A small dismissible banner explains this when you open the file directly.

### Dev / test options

| URL option | Effect |
|---|---|
| `?dev=1` | Flights and layovers run **60× faster** (a 25-minute flight takes 25 s). Adds a dev bar in flight: jump to 49% / 84% / 97%, fake a 5-second absence. |
| `?offline=1` | Forces the built-in offline map (what you get when map tiles or CDN libraries can't load). |
| `?lab=1` | Glass lab: three candidate glass treatments over a map, satellite, day sky or night backdrop (`&bg=map`, `sat`, `sky`, `night`). |
| `?dev=1&demo=flight` | Seeds a passenger, some history and the named screen (`flight`, `book`, `logbook`, `arrival`, `passport`, `layover`). Use on a clean browser profile. |

Example: `http://localhost:8080/?dev=1`

Design rules (materials, spacing scale, layout grid, copy) are in [DESIGN.md](DESIGN.md).

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Hold / resume (holding pattern, max 2 per flight, 10 min each) |
| M | Cycle map modes |
| C | Camera: follow plane / whole route |
| W | Window view |
| F | Airplane mode (fullscreen, minimal UI) |
| L | Logbook |
| S | Stats |
| Esc | Close panels / leave airplane mode |
| ? | Shortcut list |

## Project structure

```
index.html          App shell; loads every script with classic <script> tags (works over file://)
start.bat           Launcher (local server with port fallback, or file:// if no Python)
css/
  base.css          Design tokens (dark/light), reset, app shell, airplane mode, reduced motion
  components.css    Buttons, chips, fields, modal, toasts, boarding pass, stamps, seat map, atlas
  views.css         Per-screen layouts
js/
  data-airports.js  ~170 real airports (IATA, city, country, lat/lon, IANA time zone), as window.AIRPORTS
  data-world.js     Simplified land outlines (Natural Earth 1:110m, public domain) for the offline map
  storage.js        localStorage wrapper (every access guarded; memory fallback)
  geo.js            Great-circle distance/bearing/interpolation, flight-time estimate, sun position
  state.js          Store with defaults, migrations, export/import; shared helpers and formatting
  ui.js             Icons, hash router, modals, toasts, cabin announcements, airport picker,
                    theme, tab title + in-flight favicon, keyboard shortcuts, file:// banner
  stats.js          Aggregates (today/week/month, streaks, by tag, by hour)
  timer.js          Timestamp-based flight timer, flight profile, milestones, holds, divert,
                    landing, distraction guard (Page Visibility)
  map-fallback.js   Built-in SVG world map (route arc, flown portion, rotated plane, night shading)
  map-core.js       Map manager: one interface for every map provider, automatic fallback
  onboarding.js     First-launch welcome + check-in
  booking.js        Book by duration or destination, task, tags, seat map, recent/favourite routes
  boarding-pass.js  Boarding pass (canvas barcode/QR), gate checklist, board animation, countdown
  inflight.js       In-flight view: countdown, readouts, live map, holds, divert, airplane mode
  arrival.js        Arrival card, outcome + note, passport stamps (generated SVG), layover timer
  logbook.js        Flight log with filters + pass viewer; passport page
  settings.js       Preferences, tags, export/import, reset
  main.js           Boot: theme, shell, resume-after-reload prompt, routing
assets/             Original SVGs (logo, favicon, plane)
```

## How it works

- **Flight time.** Realistic block time = great-circle distance ÷ 800 km/h + 30 min (taxi, climb, approach). In *by duration* mode, destinations are ranked by how close their realistic time is to the length you chose; the session always lasts the time you chose, and routes that don't fit well are marked "scaled". In *by destination* mode you can fly the real time or scale it.
- **Travelling.** After landing, the destination becomes your new departure airport. Diverted flights return to the origin.
- **Timer accuracy.** Elapsed time is always computed from stored timestamps (start time, total hold time), never by counting ticks, so it stays exact in background tabs. Closing the app mid-flight is fine: on reopen you can resume (time kept running) or divert.
- **Flight profile.** Progress drives a realistic profile: taxi, climb to cruise, cruise, descent and approach. Position along the arc, altitude and ground speed follow it, and cabin announcements fire at pushback, takeoff, cruise, halfway, top of descent, final approach and touchdown.
- **Distraction guard.** Leaving the tab mid-flight counts as a turbulence event (recorded with the flight). Settings → Distraction guard: *Off*, *Warn*, or *Divert* after a chosen number of minutes away.
- **Data.** Everything lives in `localStorage` under `skyfocus.v1`. Export/import as JSON from Settings; "Reset everything" requires typing RESET.

## Build plan and status

Built in two milestones, each committed to git so any step can be rolled back.

**Milestone 1 (done): working vertical slice**
- Onboarding, booking (duration + destination), seat map with tag-based cabin bands
- Boarding pass, board animation, skippable 5 s countdown, do-not-disturb checklist
- Timestamp timer, in-flight view (built-in SVG map), holds, divert, airplane mode, distraction guard, resume after reload, tab title + favicon
- Landing, arrival card, outcome + note, passport stamps, layover timer
- Logbook with filters, passport page
- Settings with tags, export/import and reset
- `start.bat` with port fallback, file:// banner

**Milestone 2 (next)**
- Leaflet classic (light/dark vector basemap) and satellite maps, 3D globe with day/night shading. The built-in map stays as the automatic fallback.
- Window view (sky by real local time at the plane, clouds, stars, turbulence wobble)
- Web Audio: engine hum, rain, white noise, procedural ambient music, chimes, takeoff and touchdown sounds, per-layer mixer
- Stats dashboard (Chart.js), calendar heatmap, routes map
- 20+ achievements, frequent-flyer tiers with membership card, unlockable themes, map styles and sound layers
- Daily reminder and landing notifications

## Credits

- Land outlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via the `world-atlas` package.
- All artwork, icons, stamps and copy in this project are original.

# SkyFocus

A flight-themed focus timer. Each focus session is a simulated flight between real airports: book a route, focus while the plane crosses the map, and land to log it, earn miles and collect a passport stamp.

Runs entirely in the browser (no installs, no build step, no account), or as a Windows desktop app built with Electron.

## Launching

**Recommended: double-click `start.bat`.**

- If Python is installed, it starts a small local web server on the first free port of **8080, 8081, 8090** and opens `http://localhost:<port>/` in your default browser.
- The server runs in its own window titled **"SkyFocus server - close to stop"**. Close that window to stop SkyFocus.
- If Python isn't installed, `start.bat` simply opens `index.html` directly.

**Alternative: double-click `index.html`.** Everything works over `file://`, but:

- Your data is stored **separately** from the `start.bat` version (browsers treat `file://` and `http://localhost` as different sites). Use **Settings → Export JSON / Import JSON** to move data between them.
- Browser notifications (reminders, landing alerts) need the `start.bat` version.

A small dismissible banner explains this when you open the file directly.

## Desktop app (Windows)

The finished builds are in `dist/`:

- `dist\SkyFocus-1.0.0-portable.exe`: run it from anywhere. No install and no admin rights.
- `dist\SkyFocus-1.0.0-setup.exe`: installer with Start menu and desktop shortcuts and an uninstaller.

The desktop app works fully offline (libraries, fonts and globe imagery are bundled in `vendor/`); only the Classic and Satellite map tiles need the internet, and the built-in map stands in with an "Offline" note when they cannot load. Its data is stored separately from the browser version: on first launch it offers to import a JSON export, and Settings has Backup now and Open data folder.

Desktop extras: a frameless window with minimise, maximise, fullscreen and close in the top bar (drag the empty top bar to move, double-click to maximise, F11 or F for fullscreen, Esc to leave it); the mini pill (P, the pill button, the tray, or automatically when you minimise during a flight or layover), which stays on top and can be dragged and snapped to screen edges; a tray icon with Show, Show pill, Hold or Resume, Divert and Quit; native notifications; taskbar progress; single instance; optional launch at startup. Closing the window during a flight keeps SkyFocus running in the tray. In airplane mode, switching to another app counts as turbulence; using the pill does not.

### Build and run from source

Needs Node.js 20 or later.

```
npm install
npm run desktop
npm run dist
```

`npm run desktop` starts the app from this folder. `npm run dist` builds both exes into `dist/` (electron-builder 26.15.3, Electron 44.5.1). Desktop code lives in `desktop/` (`main.js`, `preload.js`, the pill window files and icons); the web version keeps working exactly as before through `index.html` and `start.bat`.

A hidden test switch speeds new flights up 60 times in any build: click the version line at the bottom of Settings five times.

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
| Space | Hold / resume (holding pattern, one per full hour of the flight (at least one), 10 min each) |
| M | Cycle map modes |
| C | Camera: follow plane / whole route |
| W | Window view |
| N | Mute or unmute sound |
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
  data-airports.js  ~445 real airports (IATA, city, country, lat/lon, IANA time zone), as window.AIRPORTS
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

**Milestone 2 (in progress, revised)**

Done:
- Shortcuts moved to Settings; time-first booking ("Pick my time") with a destination reveal, Reroll and other options.
- Glass and paper design system (DESIGN.md), Smoked glass variant, spacing scale and shell grid, glass lab (`?lab=1`).
- Maps: Classic (Esri dark or light canvas basemap) and Satellite (Esri World Imagery) through Leaflet 1.9.4, and a three.js r149 3D globe with real day and night imagery blended along the terminator. Each mode shows the built-in map instantly, swaps to the real one when its library loads, and keeps the built-in map (flat or canvas globe) if the network, tiles or WebGL are unavailable.
- Holding pattern: while holding, the plane flies a racetrack loop at its position on every map. Each flight records its real track (route progress plus every hold), shown on the arrival report's route chart and replayed in the logbook.
- Pomodoro journeys: book a chain of 2 to 8 legs (or an open journey) between nearby airports. Each leg is a normal focus flight, layovers are the breaks (short after each leg, long after every Nth), with optional auto boarding. Lengths are set in Settings, and the logbook groups the legs of each journey.
- Takeoff and landing scenes: after boarding, a skippable 3D takeoff (line up, roll with runway lights streaking, rotation, gear up, climb through cloud) hands over to the in-flight map. Each landing plays a descent through cloud, touchdown with a small bounce and tyre smoke, and rollout before the arrival report. Lighting follows the real sun at the airport, including night with runway, approach and city lights. Reduced motion, no WebGL or no network gives a 2D side view instead. Settings has a switch to turn the scenes off. The countdown is gone, and Board stays locked until the pre-departure check is complete.
- Motion pass: real spring curves for UI transitions (`js/motion.js`), a 3D hero plane on the check-in screen and booking sheet that tilts toward the pointer, hover previews on the booking map (the city pulses and an arc traces to it), a boarding pass that slides in, turns over to its printed reverse and tears along the perforation, a destination card that morphs into the pass on the way to the gate (View Transitions), banking into turns and a slow camera drift in flight, and an ink splash when a new stamp lands.
- Holds scale with the flight: one per full hour of block time, at least one.
- Window view (W in flight): a cabin wall with three windows onto one sky, lit by the real sun and moon (position and phase) at the aircraft's position. An original 3D wing with a winglet catches sun glints, moonlight and passing cloud shadows; the wingtip strobe double-flashes and the navigation light pulses. Each window glows onto the wall in the colour of the sky, with dim warm cabin lighting at night. Layered clouds lit on top, twinkling towns over land, moon glitter and sun glint over water, and a horizon that tilts with pitch and moves with bank. Seats A to C look left, D to F look right. Dev: `?dev=1&demo=window&hour=22&route=CDG-FCO`.
- Web Audio, all synthesised: engine hum that follows the flight phase and the takeoff and landing scenes, rain, white noise, an ambient pad, the announcement chime, a takeoff swoosh and a touchdown thump. Per-layer levels, master and mute in the in-flight sound panel and in Settings (N mutes).
- Stats (S): membership card and tier progress, totals, last 14 days, focus by tag, time of day (Chart.js 4.4.1, with built-in bars offline), a 12 month heatmap, every route flown on a map, passport progress by continent and the achievements grid.
- 26 achievements with progress, and five frequent-flyer tiers by focus miles (Contrail, Stratus 2,500, Cirrus 10,000, Jetstream 30,000, Aurora 75,000), each with its own paper membership card. New unlocks and tier changes turn over as cards with a sweep of light after landing.

Next:
- Final end-to-end test at ?dev=1 over start.bat and file://, including a 3-leg journey with a hold in leg 2
- Stats dashboard, achievements and frequent-flyer tiers

## Credits

- Land outlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via the `world-atlas` package.
- Map tiles: Esri World Dark Gray, World Light Gray, World Imagery and reference layers (attribution shown on the map).
- Globe imagery: NASA Blue Marble and Black Marble, as packaged in the `three-globe` examples.
- Libraries, loaded on demand from CDNs at pinned versions: Leaflet 1.9.4, three.js r149, Chart.js 4.4.1.
- All artwork, icons, stamps and copy in this project are original.

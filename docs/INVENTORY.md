# SkyFocus inventory

The checklist for testing every build (browser over start.bat, file://, and the desktop app).

## Screens

| Screen | Route | What to check |
|---|---|---|
| Check-in | `#/welcome` | Name, home airport picker, default block time, 3D hero plane with pointer tilt |
| Book | `#/book` | Time, Destination and Journey modes; duration chips and Other; reveal arc; Reroll; See other options with hover preview (pulsing city, traced arc); favourites; seat map by tag class; tag editor; hero plane in the sheet header; pending pass and journey notices |
| Gate | `#/board` | Destination card morphs into the pass; pass slides in, turns over (click or Turn over), tilts toward the pointer; pre-departure checklist locks Board until all ticked; airplane mode switch; journey auto-board bar; stamp and stub tear on Board |
| Takeoff scene | overlay | 3D runway takeoff with real sun lighting, runway lights streaking, gear up, climb through cloud; Space, Enter, Esc or click skips; 2D fallback with reduced motion or no WebGL |
| In flight | `#/flight` | Map modes Classic, Satellite, 3D Globe (M); camera follow or route (C); window view (W); sound panel (N mutes); airplane mode (F); Hold and Resume (Space); holds limited to one per full hour; racetrack hold on every map; banking; divert or End journey; instrument strip (time, phases, segments, altitude tape, GS, VS, heading tape, flown, remain, ETA local and destination); dev jump buttons |
| Window view | in flight | Three windows, 3D wing with winglet, strobe and nav light, wall glow, moon with phase, sea glitter, cloud layers, towns over land, cabin lighting, bank and pitch, turbulence shake |
| Landing scene | overlay | Descent through cloud, touchdown bounce and tyre smoke, rollout; skip |
| Arrival | `#/arrival/:id` | Report facts, route chart with track and hold markers, task status, remarks, stamp thud with ink splash, achievements and tier cards, layover or journey card |
| Layover | `#/layover` | Break timer ring, flap board, journey itinerary, Board leg N, auto-start, End journey |
| Logbook | `#/logbook` | Filters, journey groups, pass viewer, track panel with Replay |
| Passport | `#/passport` | Stamps by country, totals |
| Stats | `#/stats` (S) | Membership card and tier ladder, totals, last 14 days, by tag, 12 month heatmap, routes map, time of day, passport by continent, achievements grid; card previews |
| Settings | `#/settings` | Passenger, Focus (goal, default duration, booking mode, pre-departure check), Journeys, Display (theme, units, clock, graphics quality, reduce motion, scenes), Sound (switch, mixer, test chime), Distraction guard (strictness, minutes), Tags, Shortcuts, Your data (export, import, reset) |
| Glass lab | `?lab=1` | Hidden design page |

## Shortcuts

Space hold or resume, M map mode, C camera, W window view, N mute, F airplane mode, L logbook, S stats, Esc close, ? shortcut list.

## Settings stored

defaultDuration, bookingMode, graphics, breaks, units, clock24, theme, reducedMotion, scenes, windowView, sounds, strictness, strictMinutes, dndChecklist, dailyGoalMin, reminderEnabled and reminderTime (stored, not yet wired), landingNotify (stored, not yet wired), mapMode, camera, journey (legMin, shortBreak, longBreak, longEvery, autoStart), audioMix, tierSeen.

## Systems

- Flight engine: timestamp timer, phases and milestones, holds with auto resume, divert, resume after reload, journeys and layovers.
- Distraction guard: page visibility, turbulence count, warn or divert after N minutes.
- Achievements (26) and tiers (Contrail, Stratus, Cirrus, Jetstream, Aurora).
- Audio (Web Audio, synthesised): engine, rain, white noise, pad, chime, swoosh, touchdown.
- Motion: spring easings, view transition booking to gate, hero planes, unlock cards.
- Glass engine: refraction filters, specular highlight, adaptive tint, graphics quality.
- Dev: `?dev=1` (60x time), `demo=flight|book|logbook|arrival|passport|layover|hold|globe|satellite|journey|jlayover|window|whold|stats`, `hour=`, `route=`, `unlock=tier|ach`, `?offline=1`, `?lab=1`.

## External resources

| Resource | Version | Source |
|---|---|---|
| Leaflet (js and css) | 1.9.4 | cdnjs |
| three.js | r149 (0.149.0) | jsdelivr |
| Chart.js | 4.4.1 | cdnjs |
| Earth day texture | three-globe 2.31.1 `earth-blue-marble.jpg` | jsdelivr |
| Earth night texture | three-globe 2.31.1 `earth-night.jpg` | jsdelivr |
| Fonts | Barlow Condensed 500 600 700, Barlow 400 500 600, IBM Plex Mono 400 500 600 | Google Fonts |
| Map tiles | Esri Canvas World Dark Gray and Light Gray (base and reference), World Imagery, Reference World Boundaries and Places | server.arcgisonline.com |

No globe.gl and no motion library are used: the globe, scenes and springs are written on three.js and plain JavaScript.

Local data: `js/data-airports.js` (445 airports), `js/data-world.js` (Natural Earth 110m land), `assets/logo.svg`, `assets/plane.svg`, `assets/favicon.svg`.

## Desktop app additions

| Area | What to check |
|---|---|
| Window | Frameless, opens maximised the first time, remembers size and position, minimum 1100 by 700 |
| Top bar controls | Pill, minimise, maximise or restore (icon follows state), fullscreen, close (red on hover); hidden in fullscreen until the mouse reaches the top edge; no overlap at 1366 by 768 and 1920 by 1080 |
| Drag region | Empty top bar drags the window, double-click maximises, drag to edges snaps |
| Keys | F11 and F (outside the flight screen) fullscreen, Esc leaves it, P opens the pill |
| Mini pill | Flight, hover controls, holding, layover, journey dots, landing glow and chime, idle with Book 25 min; drag and snap; remembered position; ghost click-through; double-click opens the app |
| Pill opens | On minimise during a flight or layover (setting), top bar button, tray, P |
| Tray | Tooltip with route and time left; Show, Show pill, Hold or Resume, Divert with confirmation, Quit |
| Close | During a flight or layover hides to the tray (and opens the pill) with a one-time note |
| Notifications | Landing, layover over, journey leg departed, daily reminder |
| Taskbar | Progress bar, paused while holding; flashes on landing when not focused |
| Distraction guard | Airplane mode counts switching apps; the pill counts as the cabin |
| Settings | Desktop section, notification switches, Backup now, Open data folder, hidden test speed |
| First launch | Offers to import a browser export |
| Offline | Everything except map tiles; the built-in map shows "Offline" |
| Security | No Node in pages, CSP, external links in the default browser |
| Single instance | A second launch focuses the running window |
| YPT link | MacroDroid webhooks start YPT at the gate and stop it on landing, diversion, journey end, Change booking and quit; URLs kept in `desktop-state.json`, never in exports or backups; options for holds and layovers |

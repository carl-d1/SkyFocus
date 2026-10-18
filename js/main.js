/* Boot: theme, shell, resume-after-reload, routing. */
(function () {
  var SF = window.SF;
  var ui = SF.ui;

  function resumePrompt() {
    var af = SF.store.state.activeFlight;
    if (!af || !af.started) return false;
    var now = Date.now();
    // Closing the app counts as leaving the cabin.
    if (af.awayStart) {
      SF.store.update(function (s) {
        var f = s.activeFlight;
        f.awayMs += now - f.awayStart;
        f.awayStart = null;
        f.turbulence += 1;
      }, true);
    }
    SF.flight.normalize(af, now);
    var st = SF.flight.status(af, now);
    var body = st.done
      ? "<p>Flight <b>" + af.flightNo + "</b> " + af.from + " → " + af.to + " reached " + SF.esc(af.toCity) + " while SkyFocus was closed.</p>"
      : "<p>Flight <b>" + af.flightNo + "</b> " + af.from + " → " + af.to + " is airborne. Time continued while SkyFocus was closed.</p>" +
        '<p class="mono big-remaining">' + SF.fmt.clock(st.remainingMs) + ' <small class="muted">REMAINING · ' + Math.floor(st.progress * 100) + "%</small></p>";
    ui.modal({
      title: st.done ? "Flight arrived" : "Flight in progress",
      body: body, cls: "modal-sm", dismissable: false,
      actions: st.done
        ? [{ label: "Divert", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Complete landing", primary: true, icon: "landing", onClick: function () { SF.engine.land(); } }]
        : [{ label: "Divert", icon: "alert", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Resume flight", primary: true, icon: "play", onClick: function () { ui.go("flight"); SF.engine.run(); } }]
    });
    return true;
  }

  // Dev only: ?dev=1&demo=flight|book|logbook|arrival seeds a passenger, some history and the
  // requested screen. Used for screenshots on a clean browser profile.
  function seedDemo(kind) {
    if (!SF.dev) return;
    var now = Date.now(), H = 3600000;
    SF.store.update(function (s) {
      if (!s.profile.onboarded) {
        s.profile = { name: "Demo Pilot", home: "MEL", memberSince: now - 30 * 24 * H, memberNo: "SF 0412 7730", onboarded: true };
        s.currentAirport = "MEL";
      }
      if (!s.flights.length) {
        var legs = [["MEL", "MQL", 25, "study", "Chapter 3 notes", "landed", 0, 0, "yes"], ["MQL", "ADL", 45, "coding", "Refactor the parser", "landed", 1, 0, "partly"],
          ["ADL", "PER", 90, "writing", "Grant draft, section 2", "landed", 0, 1, "yes"], ["PER", "DPS", 60, "work", "Quarterly review deck", "diverted", 2, 1, null],
          ["PER", "SIN", 120, "reading", "", "landed", 0, 0, "yes"]];
        legs.forEach(function (l, k) {
          var af = SF.flight.create({ from: l[0], to: l[1], minutes: l[2], tagId: l[3], seat: (3 + k * 5) + "A", task: l[4] });
          af.startAt = now - (5 - k) * 20 * H - l[2] * 60000; af.holds = l[6]; af.turbulence = l[7];
          var frac = l[5] === "landed" ? 1 : .55;
          var st = { flownKm: af.distanceKm * frac, elapsedMs: l[2] * 60000 * frac };
          if (l[6]) af.track.holds = [{ frac: .42, heading: SF.geo.bearing(SF.airport(l[0]), SF.airport(l[1])), durationMs: 360000, laps: 1.5 }];
          var rec = SF.flight.toRecord(af, l[5], Object.assign({ routeFrac: frac }, st), { outcome: l[8], endAt: af.startAt + l[2] * 60000 });
          if (l[5] === "landed" && !s.stamps.some(function (x) { return x.iata === l[1]; })) {
            var a = SF.airport(l[1]);
            s.stamps.push({ iata: a.iata, city: a.city, country: a.country, cc: a.cc, continent: a.continent, date: rec.endAt, flightId: rec.id });
            rec.newStamp = true;
          }
          s.flights.push(rec);
        });
        s.currentAirport = "SIN";
      }
    }, true);
    var modeFor = { globe: "globe", satellite: "satellite", hold: "classic", flight: "classic", window: "classic", whold: "classic" };
    if (modeFor[kind] && !SF.store.state.activeFlight) {
      SF.store.update(function (s) {
        var af = SF.flight.create({ from: "SIN", to: "HKG", minutes: 240, tagId: "coding", seat: "4A", task: "Refactor the parser" });
        af.timeScale = 1; af.started = true; af.startAt = now - 96 * 60000;
        af.milestones = { pushback: 1, takeoff: 1, cruise: 1 };
        if (kind === "hold" || kind === "whold") {
          // in the middle of a hold that began two minutes ago
          var st = SF.flight.status(af, now - 120000);
          af.track.holds.push({ frac: st.routeFrac, heading: st.heading, start: now - 120000, end: null });
          af.pauseStart = now - 120000; af.holds = 1;
        }
        s.activeFlight = af;
        s.settings.mapMode = modeFor[kind];
        s.settings.camera = "route";
        s.settings.windowView = kind === "window" || kind === "whold";
      }, true);
      SF.engine.run();
    }
    if (modeFor[kind]) kind = "flight";
    if (kind === "journey") SF.store.update(function (s) { s.settings.bookingMode = "journey"; }, true);
    if (kind === "jlayover" && !SF.journey.active()) {
      // a 3-leg journey with leg 1 landed and the first layover running
      var legs = SF.journey.plan(SF.store.state.currentAirport, 3, 25, 7);
      SF.journey.start({ legs: legs, untilStop: false, tagId: "coding", task: "Refactor the parser", seat: "4A", cls: "Compiler Class" });
      SF.store.update(function (s) {
        var af = s.activeFlight; af.timeScale = 1; af.started = true; af.startAt = now - 26 * 60000;
        var st = SF.flight.status(af, now);
        var rec = SF.flight.toRecord(af, "landed", st, { endAt: now - 60000 });
        s.flights.push(rec); s.activeFlight = null; s.currentAirport = legs[0].to; s.journey.index = 1;
        s.layover = { start: now - 90000, min: 5, scale: 1, journeyId: s.journey.id };
      }, true);
    }
    var target = { flight: "flight", journey: "book", jlayover: "layover", book: "book", logbook: "logbook", passport: "passport", settings: "settings", layover: "layover",
      arrival: "arrival/" + SF.store.state.flights.filter(function (f) { return f.status === "landed"; }).slice(-1)[0].id }[kind] || "book";
    if (kind === "layover") SF.store.update(function (s) { s.layover = { start: now - 4 * 60000, min: 15, scale: 1 }; }, true);
    location.hash = "#/" + target;
  }

  // dev: &hour=H sets solar time at the aircraft for the window view
  if (SF.dev) { var hr = new URLSearchParams(location.search).get("hour"); if (hr != null) SF.devSunHour = +hr; }

  function boot() {
    ui.applyTheme();
    SF.glass.init();
    // Dim world map behind document screens.
    try { SF.FallbackMap(document.getElementById("backdrop"), { camera: "world", showPlane: false, label: "World map", instant: true }); } catch (e) { console.warn(e); }
    ui.buildNav();
    ui.fileBanner();
    window.addEventListener("hashchange", ui.render);
    if (new URLSearchParams(location.search).get("lab") === "1") { location.hash = "#/lab"; ui.render(); }
    else if (SF.dev && new URLSearchParams(location.search).get("demo")) { seedDemo(new URLSearchParams(location.search).get("demo")); ui.render(); }
    else { ui.render(); resumePrompt(); }
    if (SF.dev) console.info("SkyFocus dev mode: flights run 60× faster.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

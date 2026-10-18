/* Flight timer and flight engine.
   Time is always derived from stored timestamps (never by counting intervals), so it stays exact
   in background tabs and survives reloads. */
(function () {
  var SF = (window.SF = window.SF || {});
  // Holds allowed: one per full hour of block time, at least one.
  function maxHolds(f) { return Math.max(1, Math.floor(((f && f.plannedMin) || 0) / 60)); }
  var HOLD_MAX_MS = 10 * 60000;
  var HOLD_LAP_MS = 4 * 60000;   // one racetrack lap, in flight time (a real hold is about 4 min)

  /* ---------- flight profile ---------- */
  var T_TAXI = 0.03, T_CLIMB = 0.12, T_TOD = 0.85, T_FLARE = 0.98;
  function speedAt(p) {
    if (p < T_TAXI) return 0.015;
    if (p < T_CLIMB) return 0.25 + 0.75 * ((p - T_TAXI) / (T_CLIMB - T_TAXI));
    if (p < T_TOD) return 1;
    if (p < T_FLARE) return 1 - 0.7 * ((p - T_TOD) / (T_FLARE - T_TOD));
    return 0.3 * (1 - (p - T_FLARE) / (1 - T_FLARE)) + 0.02;
  }
  // Cumulative table: share of route distance covered at time-progress p.
  var N = 500, table = [0];
  (function () {
    var acc = 0;
    for (var i = 1; i <= N; i++) { acc += speedAt((i - 0.5) / N); table.push(acc); }
    for (var j = 0; j <= N; j++) table[j] /= acc;
  })();
  function routeFrac(p) {
    p = Math.max(0, Math.min(1, p));
    var x = p * N, i = Math.floor(x);
    if (i >= N) return 1;
    return table[i] + (table[i + 1] - table[i]) * (x - i);
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function cruiseAltFor(km) {
    if (km < 400) return 24000;
    if (km < 1200) return 32000;
    if (km < 4000) return 36000;
    return 38000;
  }
  function altitude(p, cruise, tsec) {
    if (p < T_TAXI) return 0;
    if (p < T_CLIMB) return Math.round(cruise * easeOut((p - T_TAXI) / (T_CLIMB - T_TAXI)) / 10) * 10;
    if (p < T_TOD) {
      var stepUp = cruise >= 36000 && p > 0.55 ? 2000 : 0;
      return cruise + stepUp + Math.round(Math.sin(tsec / 7) * 30 + Math.sin(tsec / 2.3) * 12);
    }
    if (p < T_FLARE) return Math.max(0, Math.round(cruise * (1 - easeInOut((p - T_TOD) / (T_FLARE - T_TOD))) / 10) * 10);
    return 0;
  }
  function groundSpeed(p, tsec) {
    if (p < 0.015) return 0;
    if (p < T_TAXI) return 16;
    if (p < T_CLIMB) return Math.round(150 + 300 * ((p - T_TAXI) / (T_CLIMB - T_TAXI)));
    if (p < T_TOD) return Math.round(472 + Math.sin(tsec / 11) * 9 + Math.sin(tsec / 3.1) * 3);
    if (p < T_FLARE) return Math.round(450 - 310 * ((p - T_TOD) / (T_FLARE - T_TOD)));
    return Math.round(140 - 120 * ((p - T_FLARE) / (1 - T_FLARE)));
  }
  function phase(p) {
    if (p >= 1) return "Arrived";
    if (p < 0.015) return "Pushback";
    if (p < T_TAXI) return "Taxi";
    if (p < 0.045) return "Takeoff";
    if (p < T_CLIMB) return "Climb";
    if (p < T_TOD) return "Cruise";
    if (p < 0.95) return "Descent";
    if (p < 0.99) return "Approach";
    return "Landing";
  }

  var MILESTONES = [
    { id: "pushback", at: 0, icon: "plane", title: "Pushback", text: function (f) { return "Doors closed. Pushback approved. Destination " + f.toCity + "."; } },
    { id: "takeoff", at: 0.03, icon: "takeoff", title: "Takeoff", text: function (f) { return "Airborne " + f.fromCity + ". Climbing."; } },
    { id: "cruise", at: T_CLIMB, icon: "compass", title: "Cruise", text: function (f) { return "Level FL" + Math.round(f.cruiseAlt / 100) + ". Seatbelt sign off."; } },
    { id: "halfway", at: 0.5, icon: "route", title: "Halfway", text: function (f) { return "50 percent. Continuing to " + f.toCity + "."; } },
    { id: "tod", at: T_TOD, icon: "landing", title: "Top of descent", text: function () { return "Descent started. Begin wrap-up."; } },
    { id: "approach", at: 0.95, icon: "target", title: "Final approach", text: function (f) { return f.toCity + " in sight. Finish current item."; } }
  ];

  /* ---------- flight model ---------- */
  var flight = (SF.flight = {
    maxHolds: maxHolds,
    HOLD_MAX_MS: HOLD_MAX_MS,
    routeFrac: routeFrac,
    MILESTONES: MILESTONES,

    flightNo: function (from, to) {
      return "SF" + (100 + (SF.hash(from + to) % 899));
    },

    // Build a booked (not yet departed) flight from booking choices.
    create: function (b) {
      var A = SF.airport(b.from), B = SF.airport(b.to), tag = SF.tag(b.tagId);
      var km = SF.geo.distanceKm(A, B);
      var id = SF.uid();
      var rnd = SF.rng(SF.hash(id));
      return {
        id: id,
        flightNo: flight.flightNo(b.from, b.to),
        from: A.iata, to: B.iata,
        fromCity: A.city, toCity: B.city,
        distanceKm: Math.round(km),
        plannedMin: b.minutes,
        realisticMin: Math.round(SF.geo.realisticMinutes(km)),
        tagId: tag.id, tagName: tag.name, tagColor: tag.color, tagIcon: tag.icon,
        cls: b.cls || tag.cls,
        seat: b.seat,
        gate: "ABCDEF".charAt(Math.floor(rnd() * 6)) + (1 + Math.floor(rnd() * 38)),
        task: b.task || "",
        journeyId: b.journeyId || null, legIndex: b.legIndex == null ? null : b.legIndex, legCount: b.legCount || null,
        bookedAt: Date.now(),
        cruiseAlt: cruiseAltFor(km),
        timeScale: SF.speed(),
        started: false, startAt: null,
        pausedTotal: 0, pauseStart: null, holds: 0,
        turbulence: 0, awayMs: 0, awayStart: null,
        airplaneMode: false,
        milestones: {},
        track: { holds: [] }
      };
    },

    // Close a hold that exceeded its maximum length (e.g. while the app was closed).
    normalize: function (af, now) {
      if (af.pauseStart && now - af.pauseStart > HOLD_MAX_MS / af.timeScale) {
        af.pausedTotal += HOLD_MAX_MS / af.timeScale;
        flight.closeHold(af, af.pauseStart + HOLD_MAX_MS / af.timeScale);
        af.pauseStart = null;
        return true;
      }
      return false;
    },

    elapsedMs: function (af, now) {
      if (!af.started) return 0;
      var paused = af.pausedTotal + (af.pauseStart ? now - af.pauseStart : 0);
      return Math.max(0, (now - af.startAt - paused) * af.timeScale);
    },

    status: function (af, now) {
      now = now || Date.now();
      var total = af.plannedMin * 60000;
      var el = Math.min(total, flight.elapsedMs(af, now));
      var p = total ? el / total : 1;
      var rf = routeFrac(p);
      var A = SF.airport(af.from), B = SF.airport(af.to);
      var tsec = now / 1000;
      var remainingReal = (total - el) / af.timeScale;
      return {
        elapsedMs: el,
        remainingMs: total - el,
        progress: p,
        routeFrac: rf,
        pos: SF.geo.interpolate(A, B, rf),
        heading: SF.geo.bearing(SF.geo.interpolate(A, B, Math.max(0, rf - 0.001)), SF.geo.interpolate(A, B, Math.min(1, rf + 0.001))),
        flownKm: af.distanceKm * rf,
        remainingKm: af.distanceKm * (1 - rf),
        altitudeFt: altitude(p, af.cruiseAlt, tsec),
        groundSpeedKt: groundSpeed(p, tsec),
        phase: af.pauseStart ? "Holding" : phase(p),
        paused: !!af.pauseStart,
        holdLeftMs: af.pauseStart ? Math.max(0, HOLD_MAX_MS / af.timeScale - (now - af.pauseStart)) : 0,
        // While holding, the plane flies a racetrack at the hold fix instead of stopping.
        hold: af.pauseStart ? {
          phase: ((now - af.pauseStart) * af.timeScale / HOLD_LAP_MS) % 1,
          heading: flight.openHold(af) ? flight.openHold(af).heading : 0,
          sizeKm: SF.geo.holdSizeKm(af.distanceKm)
        } : null,
        eta: new Date(now + (af.pauseStart ? remainingReal + Math.max(0, HOLD_MAX_MS / af.timeScale - (now - af.pauseStart)) : remainingReal)),
        done: p >= 1
      };
    },

    // Turn an active flight into a logbook record.
    toRecord: function (af, statusName, st, extra) {
      var miles = SF.fmt.miles(st.flownKm);
      return Object.assign({
        id: af.id, flightNo: af.flightNo,
        from: af.from, to: af.to, fromCity: af.fromCity, toCity: af.toCity,
        distanceKm: af.distanceKm, flownKm: Math.round(st.flownKm), miles: miles,
        plannedMin: af.plannedMin, realisticMin: af.realisticMin,
        focusMin: Math.round(st.elapsedMs / 60000 * 10) / 10,
        tagId: af.tagId, tagName: af.tagName, tagColor: af.tagColor, tagIcon: af.tagIcon,
        cls: af.cls, seat: af.seat, gate: af.gate, task: af.task,
        bookedAt: af.bookedAt, startAt: af.startAt, endAt: Date.now(),
        status: statusName,
        holds: af.holds, turbulence: af.turbulence, awayMs: Math.round(af.awayMs),
        airplaneMode: af.airplaneMode,
        timeScale: af.timeScale,
        outcome: null, note: "", newStamp: false,
        journeyId: af.journeyId || null, legIndex: af.legIndex == null ? null : af.legIndex, legCount: af.legCount || null,
        // The flown track: route progress plus every hold, enough to redraw the real path.
        track: {
          routeFrac: Math.round(st.routeFrac * 10000) / 10000,
          holds: ((af.track && af.track.holds) || []).map(function (h) {
            return { frac: h.frac, heading: h.heading, durationMs: Math.round(h.durationMs || 0), laps: Math.round((h.laps || 0) * 100) / 100 };
          })
        }
      }, extra || {});
    },

    openHold: function (af) {
      var hs = (af.track && af.track.holds) || [];
      var h = hs[hs.length - 1];
      return h && h.end == null ? h : null;
    },
    startHold: function (af, now, st) {
      if (!af.track) af.track = { holds: [] };
      af.track.holds.push({ frac: st.routeFrac, heading: st.heading, start: now, end: null });
    },
    closeHold: function (af, end) {
      var h = flight.openHold(af);
      if (!h) return;
      h.end = end;
      h.durationMs = Math.max(0, (end - h.start) * af.timeScale);
      h.laps = h.durationMs / HOLD_LAP_MS;
    },

    // Points (lat/lon, longitudes unwrapped) of the path actually flown, holds included.
    // sizeKm: draw holds at this size (charts enlarge them so they read at route scale).
    trackPoints: function (rec, perLap, sizeKm) {
      var A = SF.airport(rec.from), B = SF.airport(rec.to);
      var tr = rec.track || { routeFrac: rec.distanceKm ? rec.flownKm / rec.distanceKm : 1, holds: [] };
      var end = Math.max(0, Math.min(1, tr.routeFrac));
      var holds = (tr.holds || []).slice().sort(function (a, b) { return a.frac - b.frac; });
      var size = sizeKm || SF.geo.holdSizeKm(rec.distanceKm), pts = [], steps = Math.max(8, Math.round(160 * end));
      var hi = 0;
      for (var i = 0; i <= steps; i++) {
        var f = end * i / steps;
        while (hi < holds.length && holds[hi].frac <= f) {
          var h = holds[hi++], fix = SF.geo.interpolate(A, B, h.frac);
          var laps = Math.max(1, Math.min(3, Math.ceil(h.laps || 1)));
          var n = (perLap || 48) * laps;
          for (var k = 0; k <= n; k++) { var q = SF.geo.holdPos(fix, h.heading, size, k / (perLap || 48)); q.hold = true; pts.push(q); }
        }
        pts.push(SF.geo.interpolate(A, B, f));
      }
      // keep longitudes continuous across the antimeridian
      for (var j = 1; j < pts.length; j++) {
        while (pts[j].lon - pts[j - 1].lon > 180) pts[j].lon -= 360;
        while (pts[j].lon - pts[j - 1].lon < -180) pts[j].lon += 360;
      }
      return pts;
    },
    // Chart helpers: an enlarged hold size and labelled hold markers.
    chartHoldKm: function (rec) { return Math.max(60, Math.min(600, rec.distanceKm * 0.12)); },
    holdMarkers: function (rec) {
      var A = SF.airport(rec.from), B = SF.airport(rec.to);
      return ((rec.track && rec.track.holds) || []).map(function (h, i) {
        var p = SF.geo.interpolate(A, B, h.frac);
        return { lat: p.lat, lon: p.lon, label: "H" + (i + 1), cls: "m-hold", px: 3 };
      });
    }
  });

  /* ---------- engine: the one place that advances an active flight ---------- */
  var listeners = {};
  var tickTimer = null;
  var engine = (SF.engine = {
    on: function (ev, fn) {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return function () { listeners[ev] = listeners[ev].filter(function (f) { return f !== fn; }); };
    },
    emit: function (ev, data) { (listeners[ev] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); },
    active: function () { return SF.store.state.activeFlight; },

    start: function () {
      var af = engine.active();
      if (!af) return;
      SF.store.update(function (s) {
        s.activeFlight.started = true;
        s.activeFlight.startAt = Date.now();
      }, true);
      engine.run();
    },

    run: function () {
      clearInterval(tickTimer);
      tickTimer = setInterval(engine.tick, 250);
      engine.tick();
    },
    stop: function () {
      clearInterval(tickTimer);
      tickTimer = null;
      SF.ui.setFlightFavicon(null);
      SF.ui.setTitle("");
    },

    tick: function () {
      var af = engine.active();
      if (!af || !af.started) { engine.stop(); return; }
      var now = Date.now();
      if (flight.normalize(af, now)) {
        SF.store.save();
        SF.ui.toast("Hold limit reached. Resuming.", "play");
        engine.emit("hold", { holding: false });
      }
      // Strict distraction guard can divert while away.
      var s = SF.store.state.settings;
      if (af.awayStart && s.strictness === "divert" && now - af.awayStart > s.strictMinutes * 60000 / af.timeScale) {
        engine.divert("away");
        return;
      }
      var st = flight.status(af, now);
      // Milestones (announce each once; skip stale ones after a long absence).
      MILESTONES.forEach(function (m) {
        if (!af.milestones[m.id] && st.progress >= m.at) {
          af.milestones[m.id] = now;
          var next = MILESTONES[MILESTONES.indexOf(m) + 1];
          if (!next || st.progress < next.at) {
            SF.ui.announce(m.title, m.text(af), m.icon);
            if (m.id === "takeoff" && SF.audio && SF.audio.swoosh) SF.audio.swoosh();
            engine.emit("milestone", m);
          }
          SF.store.save();
        }
      });
      SF.ui.setTitle(SF.fmt.clock(st.remainingMs) + " · " + af.from + " → " + af.to + (st.paused ? " (holding)" : ""));
      SF.ui.setFlightFavicon(st.progress);
      var navTime = document.getElementById("navFlightTime");
      if (navTime) navTime.textContent = SF.fmt.clock(st.remainingMs);
      engine.emit("tick", st);
      if (st.done) engine.land();
    },

    hold: function () {
      var af = engine.active();
      if (!af || !af.started) return false;
      var now = Date.now();
      if (af.pauseStart) {
        SF.store.update(function (s) {
          flight.closeHold(s.activeFlight, now);
          s.activeFlight.pausedTotal += now - s.activeFlight.pauseStart;
          s.activeFlight.pauseStart = null;
        }, true);
        SF.ui.toast("Cleared. Resuming.", "play");
        engine.emit("hold", { holding: false });
        engine.tick();
        return true;
      }
      var max = maxHolds(af);
      if (af.holds >= max) {
        SF.ui.toast("Hold unavailable. " + max + " of " + max + " used.", "alert");
        return false;
      }
      if (flight.status(af, now).done) return false;
      SF.store.update(function (s) {
        flight.startHold(s.activeFlight, now, flight.status(s.activeFlight, now));
        s.activeFlight.pauseStart = now;
        s.activeFlight.holds += 1;
      }, true);
      SF.ui.announce("Hold " + af.holds + " of " + max, "Holding at present position. Maximum 10 minutes.", "pause");
      engine.emit("hold", { holding: true });
      engine.tick();
      return true;
    },

    setAirplaneMode: function (on) {
      SF.store.update(function (s) { if (s.activeFlight) s.activeFlight.airplaneMode = on || s.activeFlight.airplaneMode; });
      document.body.classList.toggle("airplane", !!on);
      if (on) SF.ui.enterFullscreen(); else SF.ui.exitFullscreen();
      engine.emit("airplane", on);
    },

    land: function () {
      var af = engine.active();
      if (!af) return;
      var st = flight.status(af, Date.now());
      if (af.pauseStart) flight.closeHold(af, Date.now());
      var rec = flight.toRecord(af, "landed", st);
      engine.finish(rec, af.to);
      engine.emit("landed", rec);
      // The record is saved before the landing scene, so closing the app mid-scene loses nothing.
      function arrive() {
        SF.ui.announce("Landed", "Arrived " + af.toCity + ".", "landing");
        SF.ui.go("arrival/" + rec.id);
      }
      if (SF.scenes && SF.scenes.enabled()) SF.scenes.play("landing", { flight: rec, reveal: arrive });
      else { if (SF.audio && SF.audio.touchdown) SF.audio.touchdown(1); arrive(); }
    },

    divert: function (reason) {
      var af = engine.active();
      if (!af) return;
      var now = Date.now();
      if (af.awayStart) {
        // The absence that triggered (or overlapped) the diversion counts as turbulence.
        af.awayMs += now - af.awayStart;
        af.awayStart = null;
        af.turbulence += 1;
      }
      var st = flight.status(af, now);
      if (af.pauseStart) flight.closeHold(af, now);
      var rec = flight.toRecord(af, "diverted", st, { divertReason: reason || "manual" });
      engine.finish(rec, af.from);
      engine.emit("diverted", rec);
      SF.ui.go("arrival/" + rec.id);
    },

    // Abandon a booked flight that has not departed.
    cancel: function () {
      SF.store.update(function (s) { s.activeFlight = null; }, true);
      engine.stop();
    },

    finish: function (rec, newAirport) {
      engine.stop();
      document.body.classList.remove("airplane");
      SF.ui.exitFullscreen();
      SF.store.update(function (s) {
        if (rec.status === "landed") {
          var dest = SF.airport(rec.to);
          var seen = s.stamps.some(function (x) { return x.iata === rec.to; });
          if (!seen) {
            s.stamps.push({ iata: rec.to, city: dest.city, country: dest.country, cc: dest.cc, continent: dest.continent, date: rec.endAt, flightId: rec.id });
            rec.newStamp = true;
          }
        }
        s.flights.push(rec);
        s.currentAirport = newAirport;
        s.activeFlight = null;
        s.recentRoutes = [rec.from + "-" + rec.to].concat((s.recentRoutes || []).filter(function (r) { return r !== rec.from + "-" + rec.to; })).slice(0, 6);
      }, true);
      if (SF.journey) SF.journey.afterFlight(rec);
      if (SF.achievements && SF.achievements.evaluate) SF.achievements.evaluate(rec);
    }
  });

  /* ---------- distraction guard: leaving the cabin (hidden tab, or in the desktop app another app in front) ---------- */
  engine.setAway = function (away) {
    var af = engine.active();
    if (!af || !af.started || af.pauseStart) return;
    var s = SF.store.state.settings;
    if (s.strictness === "off") return;
    var now = Date.now();
    if (away) {
      if (!af.awayStart) SF.store.update(function (st) { st.activeFlight.awayStart = now; }, true);
    } else if (af.awayStart) {
      var away = now - af.awayStart;
      if (s.strictness === "divert" && away > s.strictMinutes * 60000 / af.timeScale) {
        engine.divert("away");
        return;
      }
      SF.store.update(function (st) {
        st.activeFlight.awayMs += away;
        st.activeFlight.awayStart = null;
        st.activeFlight.turbulence += 1;
      }, true);
      engine.emit("turbulence", { away: away, count: af.turbulence + 1 });
      var secs = Math.round(away * af.timeScale / 1000);
      var awayTxt = secs < 60 ? secs + " s" : Math.round(secs / 60) + " min";
      SF.ui.announce("Turbulence", "Cabin left for " + awayTxt + ". Event logged." +
        (s.strictness === "divert" ? " Diversion after " + s.strictMinutes + " min away." : ""), "alert");
    }
  };
  // The desktop app reports presence itself (focus, and the pill counts as being in the cabin).
  document.addEventListener("visibilitychange", function () { if (!engine.presenceFromHost) engine.setAway(document.hidden); });
})();

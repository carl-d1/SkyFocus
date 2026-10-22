/* Pomodoro: four 25 minute focus flights with 5 minute breaks and a 10 minute long break after the
   fourth, then go again or finish. Each focus is a time flight (a random chain of routes anywhere, no
   stamps, no change of location) tagged with the cycle id. Older journeys (legs from your airport,
   with stamps) still finish as before. */
(function () {
  var SF = (window.SF = window.SF || {});
  var PLAN_AHEAD = 6;   // legs planned at a time for an older "until I stop" journey
  var POMO = { legs: 4, focus: 25, shortBreak: 5, longBreak: 10, longEvery: 4 };

  function cfg() { return SF.store.state.settings.journey; }

  var J = (SF.journey = {
    active: function () { return SF.store.state.journey || null; },

    // A chain of `count` legs from `from`, each close to `legMin` of realistic flying,
    // never revisiting a stop in the same chain.
    plan: function (from, count, legMin, seed) {
      var legs = [], seen = [from], at = from, r = SF.rng(seed || Date.now());
      for (var i = 0; i < count; i++) {
        var pool = SF.routeCandidates(at, legMin, { exclude: seen, max: 6 });
        if (!pool.length) pool = SF.routeCandidates(at, legMin, { max: 6 });
        if (!pool.length) break;
        var pick = pool[Math.floor(r() * pool.length)];
        legs.push({ from: at, to: pick.a.iata, km: Math.round(pick.km) });
        seen.push(pick.a.iata);
        at = pick.a.iata;
      }
      return legs;
    },

    POMODORO: POMO,

    // A Pomodoro cycle: four legs of about 25 minutes, chained from a random airport anywhere.
    planCycle: function (seed) {
      var r = SF.rng(seed || Date.now()), list = window.AIRPORTS;
      for (var t = 0; t < 40; t++) {
        var legs = J.plan(list[Math.floor(r() * list.length)].iata, POMO.legs, POMO.focus, Math.floor(r() * 1e9));
        if (legs.length === POMO.legs) return legs;
      }
      return [];
    },

    // Break after completed leg number n (1-based): long after every Nth leg.
    breakAfter: function (n, j) {
      j = j || J.active() || cfg();
      return n % (j.longEvery || 4) === 0 ? j.longBreak : j.shortBreak;
    },

    start: function (o) {
      if (!o.legs || !o.legs.length) return;   // nothing to fly: no empty journey
      var j = {
        id: "j" + SF.uid(), pomodoro: true,
        legs: o.legs, untilStop: false,
        legMin: POMO.focus, shortBreak: POMO.shortBreak, longBreak: POMO.longBreak, longEvery: POMO.longEvery,
        tagId: o.tagId, task: o.task || "", seat: o.seat, cls: o.cls,
        index: 0, startedAt: Date.now(), ended: null
      };
      SF.store.update(function (s) { s.journey = j; s.lastJourney = null; }, true);
      J.bookLeg(0);
    },

    bookLeg: function (i) {
      var j = J.active();
      if (!j || !j.legs[i]) return null;
      var leg = j.legs[i];
      var af = SF.flight.create({
        from: leg.from, to: leg.to, minutes: j.legMin, tagId: j.tagId, seat: j.seat, cls: j.cls, task: j.task,
        journeyId: j.id, legIndex: i, legCount: j.untilStop ? null : j.legs.length,
        free: !!j.pomodoro, pomodoro: !!j.pomodoro
      });
      SF.store.update(function (s) { s.activeFlight = af; s.journey.index = i; }, true);
      return af;
    },

    // Called by the engine after every finished flight.
    afterFlight: function (rec) {
      var j = J.active();
      if (!j || rec.journeyId !== j.id) return;
      SF.store.update(function (s) {
        var jj = s.journey;
        if (rec.status !== "landed") { jj.ended = "early"; J._close(s, rec); return; }
        jj.index = rec.legIndex + 1;
        // a Pomodoro stays open after its last focus: the long break, then go again or finish
        if (jj.index >= jj.legs.length && !jj.pomodoro) {
          if (jj.untilStop) jj.legs = jj.legs.concat(J.plan(rec.to, PLAN_AHEAD, jj.legMin));
          else { jj.ended = "complete"; J._close(s, rec); }
        }
      }, true);
    },

    // End at a layover (nothing in the air): completed legs stay logged. how: "complete" once a
    // Pomodoro has flown every focus, otherwise "stopped".
    end: function (how) {
      SF.store.update(function (s) { if (s.journey) { s.journey.ended = how === "complete" ? "complete" : "stopped"; J._close(s); } }, true);
    },

    // Every focus of the cycle flown (the long break may still be running).
    cycleDone: function (j) { j = j || J.active(); return !!(j && j.pomodoro && j.index >= j.legs.length); },

    // Finish this cycle and start another with the same tag, task and seat. Returns the first booked leg.
    again: function () {
      var j = J.active() || SF.store.state.lastJourney;
      if (!j) return null;
      var legs = J.planCycle();
      if (!legs.length) return null;
      if (J.active()) SF.journey.end("complete");
      J.start({ legs: legs, tagId: j.tagId, task: j.task, seat: j.seat, cls: j.cls });
      return SF.store.state.activeFlight;
    },

    _close: function (s, rec) {
      var j = s.journey;
      var legs = s.flights.filter(function (f) { return f.journeyId === j.id; });
      s.lastJourney = {
        id: j.id, ended: j.ended, planned: j.untilStop ? null : j.legs.length,
        pomodoro: !!j.pomodoro, tagId: j.tagId, task: j.task, seat: j.seat, cls: j.cls,
        landed: legs.filter(function (f) { return f.status === "landed"; }).length,
        minutes: legs.reduce(function (a, f) { return a + (f.focusMin || 0); }, 0),
        km: legs.reduce(function (a, f) { return a + (f.flownKm || 0); }, 0),
        lastFlightId: rec ? rec.id : null
      };
      s.journey = null;
    },

    // Summary for a journey id from the logbook.
    summary: function (id) {
      var legs = SF.store.state.flights.filter(function (f) { return f.journeyId === id; });
      return {
        legs: legs.length,
        landed: legs.filter(function (f) { return f.status === "landed"; }).length,
        minutes: legs.reduce(function (a, f) { return a + (f.focusMin || 0); }, 0),
        km: legs.reduce(function (a, f) { return a + (f.flownKm || 0); }, 0),
        miles: legs.reduce(function (a, f) { return a + (f.miles || 0); }, 0),
        stops: legs.length ? [legs[0].from].concat(legs.filter(function (f) { return f.status === "landed"; }).map(function (f) { return f.to; })) : [],
        endedEarly: legs.some(function (f) { return f.status !== "landed"; })
      };
    },

    legLabel: function (af) {
      if (!af || af.legIndex == null) return "";
      return (af.pomodoro ? "FOCUS " : "LEG ") + (af.legIndex + 1) + (af.legCount ? " OF " + af.legCount : "");
    }
  });
})();

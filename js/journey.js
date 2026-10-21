/* Journeys: chains of focus legs between nearby airports, with layovers as breaks.
   Each leg is an ordinary flight (gate, flight, landing, stamp) tagged with the journey id. */
(function () {
  var SF = (window.SF = window.SF || {});
  var PLAN_AHEAD = 6;   // legs planned at a time for "until I stop"

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

    // Break after completed leg number n (1-based): long after every Nth leg.
    breakAfter: function (n, j) {
      j = j || J.active() || cfg();
      return n % (j.longEvery || 4) === 0 ? j.longBreak : j.shortBreak;
    },

    start: function (o) {
      if (!o.legs || !o.legs.length) return;   // nothing to fly: no empty journey
      var c = cfg();
      var j = {
        id: "j" + SF.uid(),
        legs: o.legs, untilStop: !!o.untilStop,
        legMin: c.legMin, shortBreak: c.shortBreak, longBreak: c.longBreak, longEvery: c.longEvery,
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
        journeyId: j.id, legIndex: i, legCount: j.untilStop ? null : j.legs.length
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
        if (jj.index >= jj.legs.length) {
          if (jj.untilStop) jj.legs = jj.legs.concat(J.plan(rec.to, PLAN_AHEAD, jj.legMin));
          else { jj.ended = "complete"; J._close(s, rec); }
        }
      }, true);
    },

    // End at a layover (nothing in the air): completed legs stay logged.
    end: function () {
      SF.store.update(function (s) { if (s.journey) { s.journey.ended = "stopped"; J._close(s); } }, true);
    },

    _close: function (s, rec) {
      var j = s.journey;
      var legs = s.flights.filter(function (f) { return f.journeyId === j.id; });
      s.lastJourney = {
        id: j.id, ended: j.ended, planned: j.untilStop ? null : j.legs.length,
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
      return "LEG " + (af.legIndex + 1) + (af.legCount ? " OF " + af.legCount : "");
    }
  });
})();

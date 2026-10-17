/* Aggregates over the flight log. (The dashboard view is added in Milestone 2.) */
(function () {
  var SF = (window.SF = window.SF || {});

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function startOfWeek(d) { var x = startOfDay(d); var wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  function startOfMonth(d) { var x = startOfDay(d); x.setDate(1); return x; }

  function flights() { return SF.store.state.flights; }
  function minutesSince(ts) {
    return flights().filter(function (f) { return f.startAt >= ts; }).reduce(function (a, f) { return a + (f.focusMin || 0); }, 0);
  }

  // Minutes per day key.
  function byDay() {
    var m = {};
    flights().forEach(function (f) { var k = dayKey(f.startAt); m[k] = (m[k] || 0) + (f.focusMin || 0); });
    return m;
  }

  function streaks() {
    var days = byDay();
    var keys = Object.keys(days).filter(function (k) { return days[k] > 0; }).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      var d = new Date(k + "T00:00:00");
      if (prev && (d - prev) / 86400000 < 1.5) run += 1; else run = 1;
      best = Math.max(best, run);
      prev = d;
    });
    // Current streak: counts back from today (or yesterday if nothing yet today).
    var cur = 0, day = startOfDay(new Date());
    if (!days[dayKey(day)]) day.setDate(day.getDate() - 1);
    while (days[dayKey(day)]) { cur += 1; day.setDate(day.getDate() - 1); }
    return { current: cur, best: best };
  }

  SF.stats = {
    dayKey: dayKey,
    byDay: byDay,
    streaks: streaks,
    todayMinutes: function () { return minutesSince(startOfDay(new Date()).getTime()); },
    weekMinutes: function () { return minutesSince(startOfWeek(new Date()).getTime()); },
    monthMinutes: function () { return minutesSince(startOfMonth(new Date()).getTime()); },
    totals: function () {
      var fl = flights();
      var landed = fl.filter(function (f) { return f.status === "landed"; });
      var countries = {}, continents = {};
      SF.store.state.stamps.forEach(function (s) { countries[s.cc] = 1; continents[s.continent] = 1; });
      return {
        flights: fl.length,
        landed: landed.length,
        diverted: fl.length - landed.length,
        minutes: fl.reduce(function (a, f) { return a + (f.focusMin || 0); }, 0),
        km: fl.reduce(function (a, f) { return a + (f.flownKm || 0); }, 0),
        miles: fl.reduce(function (a, f) { return a + (f.miles || 0); }, 0),
        cities: SF.store.state.stamps.length,
        countries: Object.keys(countries).length,
        continents: Object.keys(continents).length
      };
    },
    byTag: function () {
      var m = {};
      flights().forEach(function (f) {
        var k = f.tagId;
        if (!m[k]) m[k] = { id: k, name: f.tagName, color: f.tagColor, minutes: 0 };
        m[k].minutes += f.focusMin || 0;
      });
      return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.minutes - a.minutes; });
    },
    byHour: function () {
      var h = new Array(24).fill(0);
      flights().forEach(function (f) { h[new Date(f.startAt).getHours()] += f.focusMin || 0; });
      return h;
    }
  };
})();

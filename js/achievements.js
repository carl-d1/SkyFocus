/* Achievements and frequent-flyer tiers.
   Achievements are checked after every flight (and when a task status is recorded). Each has a
   progress function so locked ones can show how far along they are. Tiers follow focus miles; each
   has its own paper membership card. New unlocks and tier changes are shown as cards that turn over
   with a spring and catch a sweep of light. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  /* ---------- tiers ---------- */
  var TIERS = [
    { id: "contrail", name: "Contrail", miles: 0, line: "Every flight leaves a trace." },
    { id: "stratus", name: "Stratus", miles: 2500, line: "A steady layer of focus." },
    { id: "cirrus", name: "Cirrus", miles: 10000, line: "High, thin and far reaching." },
    { id: "jetstream", name: "Jetstream", miles: 30000, line: "Fast air at altitude." },
    { id: "aurora", name: "Aurora", miles: 75000, line: "The light at the top of the sky." }
  ];
  function tierFor(miles) { var t = TIERS[0]; TIERS.forEach(function (x) { if (miles >= x.miles) t = x; }); return t; }
  function tierIndex(id) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return i; return 0; }

  /* ---------- achievements ---------- */
  function n(x) { return Math.max(0, Math.floor(x)); }
  var DEFS = [
    { id: "first", name: "Wheels up", desc: "Land your first flight.", icon: "takeoff", test: function (c) { return [c.landed.length, 1]; } },
    { id: "ten", name: "Regular", desc: "Land 10 flights.", icon: "plane", test: function (c) { return [c.landed.length, 10]; } },
    { id: "fifty", name: "Frequent flyer", desc: "Land 50 flights.", icon: "ticket", test: function (c) { return [c.landed.length, 50]; } },
    { id: "hundred", name: "Centurion", desc: "Land 100 flights.", icon: "trophy", test: function (c) { return [c.landed.length, 100]; } },
    { id: "longhaul", name: "Long haul", desc: "Land a flight of 4,000 km or more.", icon: "route", test: function (c) { return [c.maxKm, 4000]; } },
    { id: "ultra", name: "Ultra long haul", desc: "Land a flight of 10,000 km or more.", icon: "globe", test: function (c) { return [c.maxKm, 10000]; } },
    { id: "c5", name: "Visa pages", desc: "Collect stamps from 5 countries.", icon: "passport", test: function (c) { return [c.t.countries, 5]; } },
    { id: "c10", name: "Well stamped", desc: "Collect stamps from 10 countries.", icon: "passport", test: function (c) { return [c.t.countries, 10]; } },
    { id: "c25", name: "Extra pages", desc: "Collect stamps from 25 countries.", icon: "map", test: function (c) { return [c.t.countries, 25]; } },
    { id: "continents", name: "Six continents", desc: "Land on every inhabited continent.", icon: "compass", test: function (c) { return [c.t.continents, 6]; } },
    { id: "s3", name: "Three in a row", desc: "Fly on 3 days in a row.", icon: "flame", test: function (c) { return [c.sk.best, 3]; } },
    { id: "s5", name: "Five in a row", desc: "Fly on 5 days in a row.", icon: "flame", test: function (c) { return [c.sk.best, 5]; } },
    { id: "s30", name: "Thirty in a row", desc: "Fly on 30 days in a row.", icon: "flame", test: function (c) { return [c.sk.best, 30]; } },
    { id: "redeye", name: "Red-eye", desc: "Depart at 22:00 or later.", icon: "moon", test: function (c) { return [c.redeye, 1]; } },
    { id: "early", name: "First light", desc: "Depart before 07:00.", icon: "sun", test: function (c) { return [c.early, 1]; } },
    { id: "h10", name: "Ten hours", desc: "Fly 10 hours of focus.", icon: "clock", test: function (c) { return [n(c.t.minutes / 60), 10]; } },
    { id: "h100", name: "Hundred hours", desc: "Fly 100 hours of focus.", icon: "clock", test: function (c) { return [n(c.t.minutes / 60), 100]; } },
    { id: "smooth", name: "Smooth air", desc: "Land 25 minutes or more in airplane mode with no turbulence.", icon: "shield", test: function (c) { return [c.smooth, 1]; } },
    { id: "noholds", name: "Straight through", desc: "Land a flight of an hour or more without a hold.", icon: "target", test: function (c) { return [c.noHolds, 1]; } },
    { id: "marathon", name: "Marathon", desc: "Land a flight of 2 hours or more.", icon: "dumbbell", test: function (c) { return [c.maxMin >= 120 ? 1 : 0, 1]; } },
    { id: "mission", name: "Mission accomplished", desc: "Mark 10 tasks complete.", icon: "check", test: function (c) { return [c.complete, 10]; } },
    { id: "aussie", name: "Down under", desc: "Collect stamps at 5 Australian airports.", icon: "leaf", test: function (c) { return [c.au, 5]; } },
    { id: "home", name: "Homecoming", desc: "Land back at your home airport after time away.", icon: "home", test: function (c) { return [c.home, 1]; } },
    { id: "equator", name: "Line crossing", desc: "Fly across the equator.", icon: "crosshair", test: function (c) { return [c.equator, 1]; } },
    { id: "goal7", name: "Goal getter", desc: "Meet your daily goal on 7 days.", icon: "target", test: function (c) { return [c.goalDays, 7]; } },
    { id: "journey", name: "Four legs", desc: "Complete a journey of 4 legs or more.", icon: "route", test: function (c) { return [c.journeyLegs, 4]; } }
  ];

  function context() {
    var s = SF.store.state, fl = s.flights;
    var landed = fl.filter(function (f) { return f.status === "landed"; });
    var days = SF.stats.byDay(), goal = s.settings.dailyGoalMin || 120;
    var c = {
      landed: landed, t: SF.stats.totals(), sk: SF.stats.streaks(),
      maxKm: 0, maxMin: 0, redeye: 0, early: 0, smooth: 0, noHolds: 0, complete: 0, equator: 0, home: 0, journeyLegs: 0,
      au: s.stamps.filter(function (x) { return x.cc === "AU"; }).length,
      goalDays: Object.keys(days).filter(function (k) { return days[k] >= goal; }).length
    };
    var visitedOther = false, legs = {};
    fl.slice().sort(function (a, b) { return a.startAt - b.startAt; }).forEach(function (f) {
      var h = new Date(f.startAt).getHours();
      if (h >= 22) c.redeye = 1;
      if (h < 7) c.early = 1;
      if (f.outcome === "yes") c.complete += 1;
      if (f.status !== "landed") { if (f.journeyId) legs[f.journeyId] = -1; return; }
      c.maxKm = Math.max(c.maxKm, f.flownKm || 0);
      c.maxMin = Math.max(c.maxMin, f.plannedMin || 0);
      if (f.airplaneMode && !f.turbulence && (f.plannedMin || 0) >= 25) c.smooth = 1;
      if (!f.holds && (f.plannedMin || 0) >= 60) c.noHolds = 1;
      var A = SF.airport(f.from), B = SF.airport(f.to);
      if (A && B && A.lat * B.lat < 0) c.equator = 1;
      if (!f.free) {   // time flights do not take you anywhere
        if (f.to === s.profile.home && visitedOther) c.home = 1;
        if (f.to !== s.profile.home) visitedOther = true;
      }
      if (f.journeyId && legs[f.journeyId] !== -1) legs[f.journeyId] = (legs[f.journeyId] || 0) + 1;
    });
    Object.keys(legs).forEach(function (k) { c.journeyLegs = Math.max(c.journeyLegs, legs[k]); });
    return c;
  }

  var queue = [];
  var A = (SF.achievements = {
    DEFS: DEFS,
    TIERS: TIERS,
    tierFor: tierFor,
    tierIndex: tierIndex,

    // [{ def, cur, max, unlocked, at }]
    list: function () {
      var c = context(), got = SF.store.state.achievements;
      return DEFS.map(function (d) {
        var p = d.test(c), u = got[d.id];
        return { def: d, cur: Math.min(p[0], p[1]), max: p[1], unlocked: !!u, at: u ? u.at : null };
      });
    },

    // Unlock what has been earned. Unless silent, queue the new cards for celebrate().
    evaluate: function (rec, silent) {
      var c = context(), now = Date.now(), fresh = [], tierUp = null, s0 = SF.store.state;
      DEFS.forEach(function (d) {
        if (s0.achievements[d.id]) return;
        var p = d.test(c);
        if (p[0] >= p[1]) fresh.push(d);
      });
      var t = tierFor(c.t.miles);
      if (tierIndex(t.id) > tierIndex(s0.tierSeen || "contrail")) tierUp = t;
      // nothing new: no store update and no save
      if (fresh.length || s0.tierSeen !== t.id) SF.store.update(function (s) {
        fresh.forEach(function (d) { s.achievements[d.id] = { at: now, flightId: rec ? rec.id : null }; });
        s.tierSeen = t.id;
      }, true);
      if (!silent) {
        fresh.forEach(function (d) { queue.push({ kind: "ach", def: d }); });
        if (tierUp) queue.push({ kind: "tier", tier: tierUp });
      }
      return fresh;
    },

    pending: function () { return queue.length; },

    /* ---------- cards ---------- */
    badgeHTML: function (d, state) {
      return '<div class="ach-card' + (state === "locked" ? " locked" : "") + '"><span class="ach-label label">Achievement</span>' +
        '<span class="ach-medal">' + SF.icon(d.icon) + "</span><b class=\"ach-name\">" + SF.esc(d.name) + '</b><p class="ach-desc">' + SF.esc(d.desc) + "</p>" +
        '<span class="form-no">SF-A ' + String(DEFS.indexOf(d) + 1).padStart(2, "0") + "</span></div>";
    },
    // Paper membership card for a tier.
    cardHTML: function (tierId) {
      var t = TIERS[tierIndex(tierId)], p = SF.store.state.profile, miles = SF.stats.totals().miles;
      var since = p.memberSince ? new Date(p.memberSince) : new Date();
      return '<div class="mcard tier-' + t.id + '" aria-label="' + t.name + ' membership card">' +
        '<div class="mc-top"><span class="mc-brand"><img src="assets/logo.svg" alt="" width="22" height="22">SkyFocus</span><span class="mc-tier">' + t.name + "</span></div>" +
        '<svg class="mc-emblem" viewBox="0 0 120 40" aria-hidden="true"><path d="M2 30 C30 30 52 22 78 12 S112 4 118 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M2 36 C34 36 58 28 84 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".6"/><circle cx="118" cy="4" r="3" fill="currentColor"/></svg>' +
        '<div class="mc-no">' + SF.esc(p.memberNo || "SF 0000 0000") + "</div>" +
        '<div class="mc-foot"><div><small>Member</small><b>' + SF.esc((p.name || "Passenger").toUpperCase()) + "</b></div>" +
        "<div><small>Since</small><b>" + String(since.getMonth() + 1).padStart(2, "0") + "/" + String(since.getFullYear()).slice(2) + "</b></div>" +
        "<div><small>Miles</small><b>" + miles.toLocaleString() + "</b></div></div>" +
        '<i class="mc-foil" aria-hidden="true"></i></div>';
    },

    // Show queued unlocks one card at a time. Resolves when the last is dismissed.
    celebrate: function () {
      if (!queue.length || document.querySelector(".unlock")) return Promise.resolve();
      var items = queue.splice(0), i = 0;
      return new Promise(function (resolve) {
        var ov = ui.h('<div class="unlock" role="dialog" aria-modal="true" aria-label="New on your record">' +
          '<div class="unlock-stage"><div class="flip3d"><div class="face back" aria-hidden="true"><img src="assets/logo.svg" alt="" width="64" height="64"><span>SkyFocus</span></div><div class="face front"></div><i class="sweep" aria-hidden="true"></i></div></div>' +
          '<p class="unlock-caption"><span class="label" id="unlockKind"></span><span class="readout readout-sm" id="unlockCount"></span></p>' +
          '<button class="btn btn-signal" id="unlockNext"></button></div>');
        document.body.appendChild(ov);
        var flip = ov.querySelector(".flip3d"), front = ov.querySelector(".front"), btn = ov.querySelector("#unlockNext");
        function show() {
          var it = items[i];
          front.innerHTML = it.kind === "tier" ? A.cardHTML(it.tier.id) : A.badgeHTML(it.def);
          flip.classList.toggle("is-tier", it.kind === "tier");
          ov.querySelector("#unlockKind").textContent = it.kind === "tier" ? "New tier · " + it.tier.name + " · " + it.tier.line : "Achievement unlocked · " + it.def.name;
          ov.querySelector("#unlockCount").textContent = items.length > 1 ? (i + 1) + " OF " + items.length : "";
          btn.textContent = i < items.length - 1 ? "Next" : "Continue";
          flip.classList.remove("swept", "open");
          void flip.offsetWidth;
          if (SF.audio && SF.audio.chime) SF.audio.chime();
          setTimeout(function () { flip.classList.add("open"); }, 250);
          setTimeout(function () { flip.classList.add("swept"); }, ui.reducedMotion() ? 0 : 1000);
          btn.focus({ preventScroll: true });
        }
        function next() {
          i++;
          if (i < items.length) { show(); return; }
          ov.classList.add("out");
          window.removeEventListener("keydown", key, true);
          setTimeout(function () { ov.remove(); resolve(); }, 260);
        }
        function key(e) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); next(); } }
        btn.onclick = next;
        window.addEventListener("keydown", key, true);
        show();
      });
    },

    // Re-show any card (from the stats screen).
    preview: function (item) { queue.push(item); return A.celebrate(); }
  });

  // Bring older logs up to date without fanfare, once the first screen is up.
  if (SF.store && SF.store.state.profile.onboarded) {
    if (window.requestIdleCallback) requestIdleCallback(function () { A.evaluate(null, true); }, { timeout: 1500 });
    else setTimeout(function () { A.evaluate(null, true); }, 300);
  }
})();

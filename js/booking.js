/* Booking. Default flow: pick a block time and the app picks the destination.
   Alternative (Settings > Booking mode): pick a destination, then set the block time. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;
  var DURATIONS = [15, 25, 45, 60, 90, 120];
  var ROWS = 30, COLS = ["A", "B", "C", "D", "E", "F"];
  var SWATCHES = ["#5aa9ff", "#f2a541", "#9b8cff", "#4fd1a5", "#ff7a8a", "#ffd166", "#6ee7ff", "#c084fc", "#94e36b", "#ff9f6b"];

  /* ---------- destination candidates for a block time ---------- */
  // Airports whose realistic flight time is closest to `minutes`, nearest fit first.
  // The pool widens for short times, where every route is longer than the session.
  SF.routeCandidates = function (fromCode, minutes, opts) {
    opts = opts || {};
    var A = SF.airport(fromCode);
    var exclude = opts.exclude || [];
    var recent = (SF.store.state.flights || []).slice(-3).map(function (f) { return f.to; });
    var all = window.AIRPORTS.filter(function (a) { return a.iata !== fromCode && exclude.indexOf(a.iata) < 0; }).map(function (a) {
      var km = SF.geo.distanceKm(A, a);
      var fit = Math.abs(SF.geo.realisticMinutes(km) - minutes);
      if (recent.indexOf(a.iata) >= 0) fit += 8;
      return { a: a, km: km, fit: fit };
    }).sort(function (x, y) { return x.fit - y.fit; });
    if (!all.length) return [];
    var tol = Math.max(15, minutes * 0.25);
    var pool = all.filter(function (r) { return r.fit <= all[0].fit + tol; });
    if (pool.length < 5) pool = all.slice(0, 5);
    return pool.slice(0, opts.max || 10);
  };
  function shuffle(list, seed) {
    var r = SF.rng(seed), a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- seat bands: one band of rows per tag ---------- */
  SF.seatBands = function () {
    var tags = SF.store.state.tags;
    var builtin = tags.filter(function (t) { return t.builtin; });
    var bands = builtin.map(function (t) { return { tagIds: [t.id], name: t.cls, color: t.color }; });
    var custom = tags.filter(function (t) { return !t.builtin; });
    if (custom.length) bands.push({ tagIds: custom.map(function (t) { return t.id; }), name: "Open Cabin", color: "#a8b3c7" });
    var per = Math.floor(ROWS / bands.length), row = 1;
    bands.forEach(function (b, i) {
      b.start = row;
      b.end = i === bands.length - 1 ? ROWS : row + per - 1;
      row = b.end + 1;
    });
    return bands;
  };
  SF.bandForTag = function (tagId) {
    var bands = SF.seatBands();
    for (var i = 0; i < bands.length; i++) if (bands[i].tagIds.indexOf(tagId) >= 0) return bands[i];
    return bands[bands.length - 1];
  };
  // Decorative "taken" seats, stable for a day and route.
  function takenSeats(seed) {
    var r = SF.rng(SF.hash(seed)), taken = {};
    for (var row = 1; row <= ROWS; row++) COLS.forEach(function (c) { if (r() < 0.38) taken[row + c] = true; });
    return taken;
  }

  SF.views.book = {
    stage: true,
    mount: function (root) {
      var S = SF.store.state;
      var sel = {
        from: S.currentAirport || S.profile.home,
        to: null,
        minutes: S.settings.defaultDuration,
        mode: ["destination", "journey"].indexOf(S.settings.bookingMode) >= 0 ? S.settings.bookingMode : "time",
        legs: 3, untilStop: false, plan: [],
        tagId: S.lastTagId || S.tags[0].id,
        seat: null,
        pool: [], poolIdx: 0, showOptions: false
      };
      var preset = SF.bookPreset;
      SF.bookPreset = null;
      var mapObj = null;

      ui.topbar("", '<div class="glass goal-pill" id="homeGoal"></div>');
      root.innerHTML =
        '<div class="stage" id="routeMap"></div>' +
        '<div class="book">' +
        '<section class="glass sheet book-sheet" id="bookSheet" aria-label="Book a flight">' +
        '<header class="sheet-head"><div><p class="label">' + SF.esc((S.profile.name || "Passenger").toUpperCase()) + '</p><h1>Book flight</h1></div><span class="form-no">FORM SF-01</span></header>' +
        '<div class="sheet-body">' +
        '<div id="pendingSlot"></div>' +
        '<label class="field row"><span class="label">From</span><div><input id="fromInput" aria-label="Departure airport"></div></label>' +
        '<div class="seg seg-wide" id="modeSeg" role="radiogroup" aria-label="Booking mode">' +
        '<button type="button" role="radio" class="seg-btn" data-mode="time" title="Pick my time">' + SF.icon("clock") + "<span>Time</span></button>" +
        '<button type="button" role="radio" class="seg-btn" data-mode="destination" title="Pick my destination">' + SF.icon("compass") + "<span>Destination</span></button>" +
        '<button type="button" role="radio" class="seg-btn" data-mode="journey" title="Journey: several legs with layovers">' + SF.icon("route") + "<span>Journey</span></button></div>" +
        '<div id="modePanel"></div>' +
        '<label class="field row"><span class="label">Task</span><input id="taskInput" maxlength="80" placeholder="What are you working on?"></label>' +
        '<div class="field row"><span class="label">Tag</span><div class="tag-grid" id="tagChips"></div></div>' +
        "</div>" +
        '<footer class="sheet-foot"><button class="btn btn-signal btn-lg block" id="printPass" disabled>' + SF.icon("ticket") + "<span>Print boarding pass</span></button></footer>" +
        "</section>" +
        '<aside class="book-side"><div class="glass dest-card" id="destCard" aria-live="polite"></div>' +
        '<section class="glass seat-card" aria-label="Seat selection"><div class="seat-head"><span class="label">Seat</span><b id="seatLabel" class="readout readout-sm"></b></div><div class="seatmap" id="seatMap"></div></section>' +
        "</aside>" +
        "</div>";

      var $ = function (id) { return document.getElementById(id); };
      var fromInput = $("fromInput");
      function setFromLabel() { var a = SF.airport(sel.from); fromInput.value = a.city + " (" + a.iata + ")"; }

      /* ---------- pending (booked, not departed) ---------- */
      function renderPending() {
        var af = SF.store.state.activeFlight, box = $("pendingSlot"), jn = SF.journey.active();
        if (!af && jn) {
          // a journey between legs (layover left early): resume or end it
          box.innerHTML = '<div class="notice">' + SF.icon("route") + "<span>Journey in progress. Next: <b class=\"mono\">leg " + (jn.index + 1) + " " + jn.legs[jn.index].from + " to " + jn.legs[jn.index].to + "</b>.</span>" +
            '<button class="btn btn-signal small" id="jResume">Board</button><button class="btn small" id="jEnd">End journey</button></div>';
          $("jResume").onclick = function () { SF.journey.bookLeg(jn.index); ui.go("board"); };
          $("jEnd").onclick = function () { SF.journey.end(); renderPending(); };
          return;
        }
        if (!af || af.started) { box.innerHTML = ""; return; }
        box.innerHTML = '<div class="notice">' + SF.icon("ticket") + "<span>Pass issued: <b class=\"mono\">" + af.from + " to " + af.to + "</b>, " + SF.fmt.dur(af.plannedMin) + ".</span>" +
          '<button class="btn btn-signal small" id="toGate">Gate</button><button class="btn small" id="cancelPass">Cancel</button></div>';
        $("toGate").onclick = function () { ui.go("board"); };
        $("cancelPass").onclick = function () { if (af.journeyId && SF.journey.active()) SF.journey.end(); SF.engine.cancel(); renderPending(); };
      }

      /* ---------- mode panel ---------- */
      function renderMode() {
        ui.$$("#modeSeg .seg-btn", root).forEach(function (b) {
          var on = b.getAttribute("data-mode") === sel.mode;
          b.classList.toggle("on", on);
          b.setAttribute("aria-checked", on);
        });
        var p = $("modePanel");
        if (sel.mode === "journey") {
          var jc = SF.store.state.settings.journey;
          p.innerHTML = '<div class="field row"><span class="label">Legs</span><div class="leg-grid" id="legChips" role="group" aria-label="Number of legs">' +
            [2, 3, 4, 6, 8].map(function (n) { var on = !sel.untilStop && n === sel.legs; return '<button type="button" class="chip mono' + (on ? " on" : "") + '" data-l="' + n + '" aria-pressed="' + on + '">' + n + "</button>"; }).join("") +
            '<button type="button" class="chip' + (sel.untilStop ? " on" : "") + '" data-l="open" aria-pressed="' + sel.untilStop + '" title="Until I stop">Open</button></div></div>' +
            '<div class="field row"><span class="label">Plan</span><p class="journey-spec readout readout-sm">' + jc.legMin + " MIN LEGS · " + jc.shortBreak + " MIN LAYOVERS · " + jc.longBreak + " MIN EVERY " + jc.longEvery + (jc.longEvery === 1 ? "ST" : jc.longEvery === 2 ? "ND" : jc.longEvery === 3 ? "RD" : "TH") +
            '<a class="btn btn-text small" href="#/settings">Edit</a></p></div>';
          p.querySelector("#legChips").addEventListener("click", function (e) {
            var b = e.target.closest("[data-l]");
            if (!b) return;
            var v = b.getAttribute("data-l");
            sel.untilStop = v === "open";
            if (!sel.untilStop) sel.legs = +v;
            renderMode(); planJourney();
          });
          return;
        }
        if (sel.mode === "time") {
          var custom = DURATIONS.indexOf(sel.minutes) < 0;
          p.innerHTML = '<div class="field row"><span class="label">Min</span><div class="dur-grid dur-chips" role="group" aria-label="Focus length in minutes">' + DURATIONS.map(function (m) {
            return '<button type="button" class="chip mono' + (m === sel.minutes ? " on" : "") + '" data-m="' + m + '" aria-pressed="' + (m === sel.minutes) + '">' + m + "</button>";
          }).join("") + '<label class="chip chip-input' + (custom ? " on" : "") + '"><input type="number" id="customMin" min="5" max="600" step="5" value="' + (custom ? sel.minutes : "") + '" placeholder="Other" aria-label="Other length in minutes"></label></div></div>';
          p.querySelector(".dur-chips").addEventListener("click", function (e) {
            var b = e.target.closest("[data-m]");
            if (!b) return;
            sel.minutes = +b.getAttribute("data-m");
            renderMode(); pick(true);
          });
          var ci = p.querySelector("#customMin");
          ci.addEventListener("change", function () {
            var v = Math.round(+ci.value);
            if (!v || v < 5) return;
            sel.minutes = Math.min(600, v);
            renderMode(); pick(true);
          });
        } else {
          p.innerHTML = '<div class="field row"><span class="label">To</span><div class="search-row">' + SF.icon("search") + '<input id="destSearch" placeholder="City, country or code" aria-label="Search destinations"></div></div>' +
            '<div id="destList" class="dest-list" role="listbox" aria-label="Destinations"></div>' +
            '<div class="field row"><span class="label">Block</span><div class="stepper"><button type="button" class="btn icon-only" id="minDown" aria-label="5 minutes shorter">' + SF.icon("minus") + '</button><b class="mono" id="minVal"></b><button type="button" class="btn icon-only" id="minUp" aria-label="5 minutes longer">' + SF.icon("plus") + "</button></div></div>" +
            '<div id="quickRoutes"></div>';
          var ds = p.querySelector("#destSearch");
          ds.addEventListener("input", renderDestList);
          ds.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { var first = root.querySelector("#destList [data-code]"); if (first) first.click(); }
          });
          p.querySelector("#minDown").onclick = function () { setMinutes(sel.minutes - 5); };
          p.querySelector("#minUp").onclick = function () { setMinutes(sel.minutes + 5); };
          p.querySelector("#destList").addEventListener("click", function (e) {
            var b = e.target.closest("[data-code]");
            if (!b) return;
            chooseDestination(b.getAttribute("data-code"));
          });
          p.querySelector("#quickRoutes").addEventListener("click", function (e) {
            var b = e.target.closest("[data-route]");
            if (!b) return;
            var parts = b.getAttribute("data-route").split("-");
            if (!SF.airport(parts[0]) || !SF.airport(parts[1])) return;
            sel.from = parts[0];
            setFromLabel();
            chooseDestination(parts[1]);
          });
          renderDestList(); renderQuick(); renderMinutes();
        }
      }
      function setMinutes(m) {
        sel.minutes = Math.max(5, Math.min(600, Math.round(m / 5) * 5));
        renderMinutes(); renderSummary();
      }
      function renderMinutes() { var el = $("minVal"); if (el) el.textContent = SF.fmt.dur(sel.minutes); }

      function renderDestList() {
        var box = $("destList");
        if (!box) return;
        var A = SF.airport(sel.from);
        var q = ($("destSearch") || {}).value || "";
        var list = q ? ui.searchAirports(q, sel.from) : window.AIRPORTS.filter(function (a) { return a.iata !== sel.from; })
          .slice().sort(function (x, y) { return SF.geo.distanceKm(A, x) - SF.geo.distanceKm(A, y); });
        box.innerHTML = list.slice(0, 40).map(function (a) {
          return '<button type="button" class="dest' + (sel.to === a.iata ? " on" : "") + '" role="option" aria-selected="' + (sel.to === a.iata) + '" data-code="' + a.iata + '">' +
            '<b class="mono code">' + a.iata + '</b><span class="dest-name">' + SF.esc(a.city) + "<small>" + SF.esc(a.country) + "</small></span>" +
            '<span class="dest-meta mono">' + SF.fmt.dist(SF.geo.distanceKm(A, a)) + "</span></button>";
        }).join("") || '<p class="muted pad">No match.</p>';
      }

      function renderQuick() {
        var s = SF.store.state, box = $("quickRoutes");
        if (!box) return;
        var fav = s.favourites || [], recent = (s.recentRoutes || []).filter(function (r) { return fav.indexOf(r) < 0; });
        if (!fav.length && !recent.length) { box.innerHTML = ""; return; }
        function chip(r, star) {
          var parts = r.split("-");
          return '<button type="button" class="route-chip" data-route="' + r + '">' + SF.icon(star ? "star" : "route", star ? "fill" : "") + '<span class="mono">' + parts[0] + " " + parts[1] + "</span></button>";
        }
        box.innerHTML = '<div class="field"><span class="label">Rebook</span><div class="quick-list">' +
          fav.map(function (r) { return chip(r, true); }).join("") + recent.map(function (r) { return chip(r, false); }).join("") + "</div></div>";
      }

      /* ---------- picking ---------- */
      // Time mode: the app picks. fresh=true rebuilds the candidate pool.
      function pick(fresh) {
        if (fresh || !sel.pool.length) {
          sel.pool = shuffle(SF.routeCandidates(sel.from, sel.minutes), Date.now());
          sel.poolIdx = 0;
        } else {
          sel.poolIdx = (sel.poolIdx + 1) % sel.pool.length;
        }
        var c = sel.pool[sel.poolIdx];
        sel.to = c ? c.a.iata : null;
        reveal();
      }
      // Journey mode: plan a chain of legs from the departure airport.
      function planJourney() {
        var jc = SF.store.state.settings.journey;
        sel.plan = SF.journey.plan(sel.from, sel.untilStop ? 6 : sel.legs, jc.legMin, Date.now());
        sel.to = sel.plan.length ? sel.plan[0].to : null;
        sel.minutes = jc.legMin;
        reveal();
      }
      function chooseDestination(code) {
        sel.to = code;
        if (sel.mode === "destination") {
          var km = SF.geo.distanceKm(SF.airport(sel.from), SF.airport(code));
          setMinutes(SF.geo.realisticMinutes(km));
          renderDestList();
        }
        reveal();
      }
      function reveal() {
        renderCard();
        renderSummary();
        renderSeats();
        var A = SF.airport(sel.from);
        if (!mapObj) return;
        if (sel.mode === "journey") {
          // the whole itinerary: first leg solid, later legs dashed, every stop marked
          mapObj.api.clearRoute();
          mapObj.api.setRoutes(sel.plan.map(function (l, i) { return { from: SF.airport(l.from), to: SF.airport(l.to), cls: i === 0 ? "leg-next" : "leg-later" }; }));
          mapObj.api.setMarkers([{ lat: A.lat, lon: A.lon, label: A.iata, cls: "m-from", px: 5 }].concat(sel.plan.map(function (l, i) {
            var b = SF.airport(l.to);
            return { lat: b.lat, lon: b.lon, label: b.iata, cls: i === sel.plan.length - 1 && !sel.untilStop ? "m-to" : "m-stop", px: 4 };
          })));
          return;
        }
        mapObj.api.setRoutes([]);
        if (sel.to) mapObj.api.setRoute(A, SF.airport(sel.to), { animate: true });
        else { mapObj.api.clearRoute(); mapObj.api.setMarkers([{ lat: A.lat, lon: A.lon, label: A.iata, cls: "m-from", px: 5 }]); }
      }

      /* ---------- destination card ---------- */
      function renderCard() {
        var box = $("destCard");
        if (sel.mode === "journey") {
          var jc = SF.store.state.settings.journey;
          if (!sel.plan.length) { box.innerHTML = '<p class="label">Itinerary</p><p class="muted">No route available.</p>'; return; }
          var total = sel.plan.reduce(function (a, l) { return a + l.km; }, 0);
          box.innerHTML =
            '<div class="dc-head"><p class="label">' + (sel.untilStop ? "Itinerary · open, first " + sel.plan.length + " legs" : "Itinerary · " + sel.plan.length + " legs") + "</p></div>" +
            '<ol class="itinerary">' + sel.plan.map(function (l, i) {
              var b = SF.airport(l.to), brk = i < sel.plan.length - 1 || sel.untilStop ? SF.journey.breakAfter(i + 1, jc) : null;
              return '<li title="' + SF.esc(b.city) + '"><span class="readout it-n">' + String(i + 1).padStart(2, "0") + '</span><b class="mono">' + l.from + " → " + l.to + '</b><span class="it-city">' + SF.esc(b.city) + '</span><small class="mono">' + SF.fmt.dist(l.km) + "</small>" +
                (brk ? '<small class="it-break mono">+' + brk + " MIN</small>" : '<small class="it-break mono">END</small>') + "</li>";
            }).join("") + "</ol>" +
            '<dl class="dc-facts mono"><div><dt>Focus</dt><dd>' + SF.fmt.dur(sel.plan.length * jc.legMin) + "</dd></div><div><dt>Distance</dt><dd>" + SF.fmt.dist(total) + "</dd></div><div><dt>Stops</dt><dd>" + sel.plan.length + "</dd></div></dl>" +
            '<div class="dc-actions"><button class="btn" id="reroll">' + SF.icon("refresh") + "<span>Reroll</span></button></div>";
          $("reroll").onclick = planJourney;
          return;
        }
        if (!sel.to) {
          box.innerHTML = '<p class="label">Destination</p><p class="muted">' + (sel.mode === "time" ? "No route available." : "Select a destination.") + "</p>";
          return;
        }
        var A = SF.airport(sel.from), B = SF.airport(sel.to), km = SF.geo.distanceKm(A, B);
        var key = sel.from + "-" + sel.to, fav = (SF.store.state.favourites || []).indexOf(key) >= 0;
        var others = sel.mode === "time" ? sel.pool.filter(function (c) { return c.a.iata !== sel.to; }) : [];
        box.innerHTML =
          '<div class="dc-head"><p class="label">' + (sel.mode === "time" ? "Assigned destination" : "Destination") + '</p>' +
          '<button class="btn icon-only fav' + (fav ? " on" : "") + '" id="favBtn" aria-pressed="' + fav + '" aria-label="' + (fav ? "Remove from" : "Add to") + ' favourite routes">' + SF.icon("star", fav ? "fill" : "") + "</button></div>" +
          '<div class="dc-route"><b class="mono dc-code">' + B.iata + '</b><div><span class="dc-city">' + SF.esc(B.city) + "</span><small>" + SF.esc(B.country) + '</small></div></div>' +
          '<dl class="dc-facts mono"><div><dt>From</dt><dd>' + A.iata + "</dd></div><div><dt>Distance</dt><dd>" + SF.fmt.dist(km) + "</dd></div><div><dt>Block</dt><dd>" + SF.fmt.dur(sel.minutes) + "</dd></div></dl>" +
          (sel.mode === "time" ?
            '<div class="dc-actions"><button class="btn" id="reroll">' + SF.icon("refresh") + '<span>Reroll</span></button>' +
            (others.length ? '<button class="btn btn-text" id="optToggle" aria-expanded="' + sel.showOptions + '">' + (sel.showOptions ? "Hide options" : "See other options") + "</button>" : "") + "</div>" +
            (sel.showOptions ? '<ul class="dc-options" role="listbox" aria-label="Other destinations">' + others.slice(0, 6).map(function (c) {
              return '<li><button type="button" role="option" data-code="' + c.a.iata + '"><b class="mono">' + c.a.iata + "</b><span>" + SF.esc(c.a.city) + '</span><small class="mono">' + SF.fmt.dist(c.km) + "</small></button></li>";
            }).join("") + "</ul>" : "")
            : "");
        $("favBtn").onclick = function () {
          SF.store.update(function (s) {
            var i = s.favourites.indexOf(key);
            if (i >= 0) s.favourites.splice(i, 1); else s.favourites.unshift(key);
          });
          renderCard(); renderQuick();
        };
        var rr = $("reroll");
        if (rr) rr.onclick = function () { pick(false); };
        var ot = $("optToggle");
        if (ot) ot.onclick = function () { sel.showOptions = !sel.showOptions; renderCard(); };
        var ol = box.querySelector(".dc-options");
        if (ol) ol.onclick = function (e) {
          var b = e.target.closest("[data-code]"); if (!b) return;
          var code = b.getAttribute("data-code");
          sel.poolIdx = sel.pool.map(function (c) { return c.a.iata; }).indexOf(code);
          sel.to = code;
          reveal();
        };
      }

      function renderSummary() {
        $("printPass").disabled = !(sel.to && sel.seat);
        $("printPass").querySelector("span").textContent = sel.mode === "journey" ? "Start journey" : "Print boarding pass";
        var dc = sel.mode === "journey" ? null : root.querySelector(".dc-facts div:last-child dd");
        if (dc) dc.textContent = SF.fmt.dur(sel.minutes);
      }

      /* ---------- tags ---------- */
      function renderTags() {
        $("tagChips").innerHTML = SF.store.state.tags.map(function (t) {
          return '<button type="button" class="chip tag-chip' + (t.id === sel.tagId ? " on" : "") + '" data-tag="' + t.id + '" style="--tag:' + t.color + '" aria-pressed="' + (t.id === sel.tagId) + '">' + SF.icon(t.icon) + "<span>" + SF.esc(t.name) + "</span></button>";
        }).join("") + '<button type="button" class="chip chip-add" id="addTag" aria-label="Create a tag">' + SF.icon("plus") + "<span>Tag</span></button>";
      }
      $("tagChips").addEventListener("click", function (e) {
        if (e.target.closest("#addTag")) { SF.tagEditor(null, function (t) { sel.tagId = t.id; sel.seat = null; renderTags(); renderSeats(); }); return; }
        var b = e.target.closest("[data-tag]");
        if (!b) return;
        sel.tagId = b.getAttribute("data-tag");
        sel.seat = null;
        renderTags(); renderSeats();
      });

      /* ---------- seat map ---------- */
      function renderSeats() {
        var box = $("seatMap");
        var bands = SF.seatBands(), mine = SF.bandForTag(sel.tagId);
        var taken = takenSeats(SF.stats.dayKey(Date.now()) + sel.from + (sel.to || ""));
        if (!sel.seat || taken[sel.seat]) {
          sel.seat = null;
          for (var r = mine.start; r <= mine.end && !sel.seat; r++) {
            ["A", "F", "C", "D", "B", "E"].some(function (c) { if (!taken[r + c]) { sel.seat = r + c; return true; } return false; });
          }
        }
        // Overview: the whole cabin as one strip of class segments, yours highlighted.
        var html = '<div class="cabin-strip" aria-hidden="true"><span class="strip-nose"></span>' + bands.map(function (b) {
          return '<span class="strip-seg' + (b.start === mine.start ? " on" : "") + '" style="--tag:' + b.color + ";flex:" + (b.end - b.start + 1) + '"></span>';
        }).join("") + "</div>";
        // Your class, enlarged: rows across, seats A to F down, aisle between C and D.
        var rows = [];
        for (var rr = mine.start; rr <= mine.end; rr++) rows.push(rr);
        html += '<div class="seat-zoom" role="grid" aria-label="' + SF.esc(mine.name) + ', rows ' + mine.start + " to " + mine.end + '" style="--rows:' + rows.length + '">';
        html += '<div class="sz-row sz-nums" role="row" aria-hidden="true"><span></span>' + rows.map(function (r) { return "<span>" + r + "</span>"; }).join("") + "</div>";
        COLS.forEach(function (c, ci) {
          if (ci === 3) html += '<div class="sz-aisle" aria-hidden="true"><span>Aisle</span></div>';
          html += '<div class="sz-row" role="row"><span class="sz-col" aria-hidden="true">' + c + "</span>";
          rows.forEach(function (r) {
            var id = r + c, state = taken[id] ? "taken" : id === sel.seat ? "sel" : "free";
            html += '<button type="button" role="gridcell" class="seat ' + state + '" data-seat="' + id + '" style="--tag:' + mine.color + '"' +
              (state === "taken" ? " disabled" : "") +
              ' aria-label="Seat ' + id + (state === "taken" ? ", taken" : state === "sel" ? ", selected" : ", available") + '"' +
              (state === "sel" ? ' aria-pressed="true"' : "") + ">" + (state === "sel" ? id : "") + "</button>";
          });
          html += "</div>";
        });
        html += "</div>";
        html += '<div class="seat-legend" aria-hidden="true"><span><i class="lg free" style="--tag:' + mine.color + '"></i>Open</span><span><i class="lg sel"></i>Yours</span><span><i class="lg taken"></i>Taken</span></div>';
        box.innerHTML = html;
        $("seatLabel").textContent = (sel.seat ? sel.seat : "FULL") + " · " + mine.name.toUpperCase();
        renderSummary();
      }
      $("seatMap").addEventListener("click", function (e) {
        var b = e.target.closest("[data-seat]");
        if (!b || b.disabled) return;
        sel.seat = b.getAttribute("data-seat");
        renderSeats();
      });

      /* ---------- print pass ---------- */
      $("printPass").addEventListener("click", function () {
        if (!sel.to || !sel.seat) return;
        if (sel.mode === "journey") {
          var jt = SF.tag(sel.tagId), jb = SF.bandForTag(sel.tagId);
          SF.store.update(function (s) { s.lastTagId = jt.id; });
          SF.journey.start({ legs: sel.plan, untilStop: sel.untilStop, tagId: jt.id, task: $("taskInput").value.trim(), seat: sel.seat, cls: jt.builtin ? jt.cls : jb.name });
          ui.go("board");
          return;
        }
        var tag = SF.tag(sel.tagId), band = SF.bandForTag(sel.tagId);
        var af = SF.flight.create({
          from: sel.from, to: sel.to, minutes: Math.max(1, Math.round(sel.minutes)), tagId: tag.id,
          seat: sel.seat, cls: tag.builtin ? tag.cls : band.name,
          task: $("taskInput").value.trim()
        });
        SF.store.update(function (s) { s.activeFlight = af; s.lastTagId = tag.id; }, true);
        ui.go("board");
      });

      $("modeSeg").addEventListener("click", function (e) {
        var b = e.target.closest("[data-mode]");
        if (!b || b.getAttribute("data-mode") === sel.mode) return;
        sel.mode = b.getAttribute("data-mode");
        SF.store.update(function (s) { s.settings.bookingMode = sel.mode; });
        sel.showOptions = false;
        renderMode();
        if (sel.mode === "journey") planJourney();
        else if (sel.mode === "time") { sel.minutes = DURATIONS.indexOf(sel.minutes) >= 0 ? sel.minutes : SF.store.state.settings.defaultDuration; renderMode(); pick(true); }
        else if (sel.to) chooseDestination(sel.to);
        else reveal();
      });

      ui.airportPicker(fromInput, function (a) {
        sel.from = a.iata;
        if (sel.to === a.iata) sel.to = null;
        if (sel.mode === "journey") planJourney();
        else if (sel.mode === "time") pick(true);
        else { renderDestList(); if (sel.to) chooseDestination(sel.to); else reveal(); }
      });

      function renderGoal() {
        var today = SF.stats.todayMinutes(), goal = SF.store.state.settings.dailyGoalMin;
        $("homeGoal").innerHTML = ui.ring(today / goal, 40, 4, "Daily goal " + Math.round(today / goal * 100) + "%") +
          '<div><span class="label">Daily goal</span><b class="readout">' + SF.fmt.dur(today) + " / " + SF.fmt.dur(goal) + "</b></div>";
      }

      // Free map area: between the sheet and the destination card, below the top bar.
      function insets() {
        var gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 24;
        var sheet = $("bookSheet"), card = $("destCard"), bar = document.getElementById("topbar");
        var W = window.innerWidth, cr = card && card.getBoundingClientRect();
        var right = cr && cr.width ? W - cr.left + gut : gut;
        // When the card sits low (narrow layouts), keep the route above it instead.
        return { left: sheet.getBoundingClientRect().right + gut, top: bar.getBoundingClientRect().bottom + gut, right: right, bottom: gut };
      }
      mapObj = SF.maps.create($("routeMap"), "classic", { camera: "route", padPx: 48, planeSize: 22, showPlane: false, label: "Route map", insets: insets });
      setFromLabel(); renderPending(); renderGoal(); renderTags(); renderMode();
      if (preset && SF.airport(preset.to) && preset.to !== sel.from) {
        if (preset.minutes) sel.minutes = preset.minutes;
        if (sel.mode === "time") {
          sel.pool = SF.routeCandidates(sel.from, sel.minutes);
          var idx = sel.pool.map(function (c) { return c.a.iata; }).indexOf(preset.to);
          if (idx < 0) { var B = SF.airport(preset.to); sel.pool.unshift({ a: B, km: SF.geo.distanceKm(SF.airport(sel.from), B), fit: 0 }); idx = 0; }
          sel.poolIdx = idx; sel.to = preset.to; reveal();
        } else chooseDestination(preset.to);
      } else if (sel.mode === "journey") planJourney();
      else if (sel.mode === "time") pick(true);
      else reveal();
      this._cleanup = function () { if (mapObj) mapObj.api.destroy(); };
    },
    unmount: function () { if (this._cleanup) this._cleanup(); }
  };

  /* ---------- tag editor (shared with settings) ---------- */
  SF.tagEditor = function (tag, onSave) {
    var t = tag ? Object.assign({}, tag) : { id: "t" + SF.uid(), name: "", icon: "star", color: SWATCHES[5], builtin: false, cls: "Open Cabin" };
    var body = ui.h('<form class="tag-form" novalidate>' +
      '<label class="field"><span class="label">Name</span><input id="tgName" maxlength="20" value="' + SF.esc(t.name) + '" autofocus></label>' +
      '<div class="field"><span class="label">Icon</span><div class="icon-grid" id="tgIcons">' + SF.TAG_ICONS.map(function (i) {
        return '<button type="button" class="btn icon-only' + (i === t.icon ? " on" : "") + '" data-i="' + i + '" aria-label="' + i + '">' + SF.icon(i) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field"><span class="label">Colour</span><div class="swatches" id="tgCols">' + SWATCHES.map(function (c) {
        return '<button type="button" class="swatch' + (c === t.color ? " on" : "") + '" data-c="' + c + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>';
      }).join("") + "</div></div>" +
      '<p class="form-error" id="tgErr" role="alert"></p></form>');
    body.querySelector("#tgIcons").onclick = function (e) {
      var b = e.target.closest("[data-i]"); if (!b) return;
      t.icon = b.getAttribute("data-i");
      ui.$$("#tgIcons .btn", body).forEach(function (x) { x.classList.toggle("on", x === b); });
    };
    body.querySelector("#tgCols").onclick = function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      t.color = b.getAttribute("data-c");
      ui.$$("#tgCols .swatch", body).forEach(function (x) { x.classList.toggle("on", x === b); });
    };
    function save() {
      t.name = body.querySelector("#tgName").value.trim();
      if (!t.name) { body.querySelector("#tgErr").textContent = "Name required."; return false; }
      SF.store.update(function (s) {
        var i = s.tags.map(function (x) { return x.id; }).indexOf(t.id);
        if (i >= 0) s.tags[i] = t; else s.tags.push(t);
      });
      if (onSave) onSave(t);
    }
    body.addEventListener("submit", function (e) { e.preventDefault(); if (save() !== false) m.close(); });
    var m = ui.modal({
      title: tag ? "Edit tag" : "New tag", body: body, cls: "modal-sm",
      actions: [{ label: "Cancel" }, { label: "Save", primary: true, onClick: save }]
    });
  };
})();

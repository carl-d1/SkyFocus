/* Arrival card, passport stamps and the layover (break) timer. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  /* ---------- passport stamps (generated SVG, varied per country) ---------- */
  var INKS = ["#c2410c", "#1d4ed8", "#047857", "#7c3aed", "#be123c", "#0e7490", "#a16207", "#4338ca", "#9d174d", "#166534"];
  var SHAPES = ["circle", "rect", "hex", "oct", "oval", "shield"];

  function polygon(n, r, cx, cy, rot) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = rot + i * 2 * Math.PI / n;
      pts.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }

  // Mix an ink towards white so the same stamp reads on dark glass.
  function lighten(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function m(c) { return Math.round(c + (255 - c) * k); }
    return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
  }

  // opts.onDark: light ink for glass screens (logbook, passport); default dark ink for paper.
  SF.stampSVG = function (s, size, opts) {
    size = size || 150;
    opts = opts || {};
    var hc = SF.hash(s.cc || s.country), hi = SF.hash(s.iata);
    var ink = INKS[hc % INKS.length], shape = SHAPES[(hc >> 4) % SHAPES.length];
    if (opts.onDark) ink = lighten(ink, .62);
    // fewer ink voids on dark glass, so the stamp stays legible
    var speck = opts.onDark ? "0 0 0 -1.5 1.55" : "0 0 0 -2.4 1.75";
    var rot = ((hi % 25) - 12);
    var dash = ["", "5 3", "2 3"][(hi >> 3) % 3];
    var fid = "ink-" + s.iata + "-" + Math.random().toString(36).slice(2, 6);
    var date = SF.fmt.shortDate(new Date(s.date)) + " " + String(new Date(s.date).getFullYear()).slice(2);
    var country = s.country.toUpperCase(), city = s.city.toUpperCase();
    var outer = "", inner = "", text = "";
    var plane = '<path transform="translate(88 30) scale(.9) rotate(45 12 12)" fill="' + ink + '" d="M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z"/>';

    // Text that always fits its line: if the monospace estimate is wider than maxW,
    // the browser compresses it to exactly maxW (textLength).
    function fitAttrs(str, size, ls, maxW) {
      var est = str.length * size * 0.6 + Math.max(0, str.length - 1) * ls;
      return est > maxW ? ' textLength="' + maxW + '" lengthAdjust="spacingAndGlyphs"' : "";
    }
    function t(y, size, ls, str, maxW, bold) {
      return '<text x="100" y="' + y + '" font-size="' + size + '" text-anchor="middle" letter-spacing="' + ls + '"' +
        (bold ? ' font-weight="800"' : "") + fitAttrs(str, size, ls, maxW) + ">" + SF.esc(str) + "</text>";
    }
    function onArc(id, size, ls, str, maxW) {
      return '<text font-size="' + size + '" letter-spacing="' + ls + '" text-anchor="middle"><textPath href="#' + id + '" startOffset="50%"' +
        fitAttrs(str, size, ls, maxW) + ">" + SF.esc(str) + "</textPath></text>";
    }

    if (shape === "circle") {
      outer = '<circle cx="100" cy="100" r="88" stroke-width="5"/>';
      inner = '<circle cx="100" cy="100" r="62" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = '<defs><path id="arc-' + fid + '" d="M28 100a72 72 0 0 1 144 0"/><path id="arcb-' + fid + '" d="M26 100a74 74 0 0 0 148 0"/></defs>' +
        onArc("arc-" + fid, 15, 3, country, 170) +
        onArc("arcb-" + fid, 13, 2, city, 160) +
        t(108, 36, 2, s.iata, 112, true) +
        t(130, 12, 1.5, date, 96);
    } else if (shape === "rect") {
      outer = '<rect x="18" y="34" width="164" height="132" rx="14" stroke-width="5"/>';
      inner = '<rect x="28" y="44" width="144" height="112" rx="8" stroke-width="2" stroke-dasharray="' + dash + '"/><path d="M28 74H172M28 128H172" stroke-width="2"/>';
      text = t(65, 14, 3, country, 128) + t(113, 38, 3, s.iata, 128, true) + t(146, 11, 1, city + " · " + date, 128);
    } else if (shape === "hex" || shape === "oct") {
      var n = shape === "hex" ? 6 : 8, r0 = shape === "hex" ? -Math.PI / 2 : Math.PI / 8;
      outer = '<polygon points="' + polygon(n, 90, 100, 100, r0) + '" stroke-width="5"/>';
      inner = '<polygon points="' + polygon(n, 74, 100, 100, r0) + '" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = t(78, 13, 2.5, country, 112) + t(114, 36, 2, s.iata, 120, true) + t(134, 11, 1.5, city, 100) + t(150, 11, 1.5, date, 76);
      plane = "";
    } else if (shape === "oval") {
      outer = '<ellipse cx="100" cy="100" rx="92" ry="66" stroke-width="5"/>';
      inner = '<ellipse cx="100" cy="100" rx="78" ry="52" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = t(80, 13, 3, country, 128) + t(114, 34, 4, s.iata, 128, true) + t(134, 11, 1.5, city + " · " + date, 108);
      plane = "";
    } else {
      outer = '<path d="M100 14 172 40V100C172 140 140 170 100 186 60 170 28 140 28 100V40Z" stroke-width="5"/>';
      inner = '<path d="M100 28 160 50V100C160 133 133 158 100 172 67 158 40 133 40 100V50Z" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = t(74, 12, 2, country, 104) + t(112, 34, 2, s.iata, 110, true) + t(132, 11, 1, city, 96) + t(148, 11, 1, date, 80);
      plane = "";
    }
    return '<svg class="stamp' + (opts.onDark ? " on-dark" : "") + '" viewBox="-8 -8 216 216" width="' + size + '" height="' + size + '" role="img" aria-label="Passport stamp: ' + SF.esc(s.city) + ", " + SF.esc(s.country) + '">' +
      '<filter id="' + fid + '" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="' + (hi % 97) + '" result="w"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="w" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="' + (hi % 89) + '" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ' + speck + '" result="m"/>' +
      '<feComposite in="d" in2="m" operator="in"/></filter>' +
      '<g transform="rotate(' + rot + ' 100 100)" filter="url(#' + fid + ')" fill="none" stroke="' + ink + '" font-family="JetBrains Mono, Consolas, monospace">' +
      outer + inner + '<g fill="' + ink + '" stroke="none">' + text + "</g>" + plane + "</g></svg>";
  };

  function findFlight(id) {
    var fl = SF.store.state.flights;
    for (var i = fl.length - 1; i >= 0; i--) if (fl[i].id === id) return fl[i];
    return null;
  }
  function updateFlight(id, fn) {
    SF.store.update(function (s) { s.flights.forEach(function (f) { if (f.id === id) fn(f); }); });
  }

  /* ---------- arrival ---------- */
  var OUTCOMES = [["yes", "Complete"], ["partly", "Partial"], ["no", "Not complete"]];

  SF.views.arrival = {
    fit: true,
    mount: function (root, args) {
      var rec = findFlight(args[0]) || SF.store.state.flights[SF.store.state.flights.length - 1];
      if (!rec) { ui.go("book"); return; }
      var landed = rec.status === "landed";
      var here = SF.airport(landed ? rec.to : rec.from);
      var stamp = SF.store.state.stamps.filter(function (x) { return x.iata === rec.to; })[0];
      var breaks = SF.store.state.settings.breaks;
      var stampCount = SF.store.state.stamps.length;

      root.innerHTML =
        '<div class="arrival">' +
        '<section class="paper report" aria-label="Arrival report">' +
        '<div class="report-head"><div><p class="label">' + rec.flightNo + " · " + rec.from + " → " + rec.to + "</p>" +
        "<h1>" + (landed ? "Arrived " + SF.esc(here.city) : "Diverted") + "</h1>" +
        '<p class="stat-line">' + (landed ? "LOCAL " + SF.fmt.localTime(here.tz, new Date()) + " · " + SF.esc(here.country.toUpperCase())
          : "RETURNED TO " + SF.esc(here.city.toUpperCase()) + " · LOCAL " + SF.fmt.localTime(here.tz, new Date())) + "</p>" +
        (rec.divertReason === "away" ? '<p class="divert-why">REASON: DISTRACTION GUARD. TIME AWAY EXCEEDED LIMIT.</p>' : "") +
        '</div><span class="form-no">FORM SF-12<br>ARRIVAL REPORT</span></div>' +
        '<dl class="report-grid">' +
        "<div><dt>Block time</dt><dd>" + SF.fmt.dur(rec.focusMin) + "</dd></div>" +
        "<div><dt>Miles</dt><dd>+" + rec.miles.toLocaleString() + "</dd></div>" +
        "<div><dt>Distance</dt><dd>" + SF.fmt.dist(rec.flownKm) + "</dd></div>" +
        "<div><dt>Turbulence</dt><dd>" + rec.turbulence + "</dd></div>" +
        "<div><dt>Holds</dt><dd>" + rec.holds + " OF " + SF.flight.MAX_HOLDS + "</dd></div>" +
        '<div><dt>Class</dt><dd><span class="tag-pill" style="--tag:' + rec.tagColor + '">' + SF.esc(rec.tagName) + "</span></dd></div>" +
        '<div class="wide"><dt>Task</dt><dd>' + (rec.task ? SF.esc(rec.task) : "Not entered") + "</dd></div>" +
        "</dl>" +
        '<div class="chart-block"><div class="chart-head"><span class="label">Route chart · track flown</span><span class="form-no">' +
        ((rec.track && rec.track.holds.length) ? rec.track.holds.length + " HOLD" + (rec.track.holds.length > 1 ? "S" : "") + " SHOWN" : "NO HOLDS") + "</span></div>" +
        '<div class="chart" id="arrChart" role="img" aria-label="Chart of the track flown from ' + rec.from + " to " + rec.to + '"></div></div>' +
        '<div class="outcome"><span class="label">Task status</span><div class="tickboxes" id="outcome" role="radiogroup" aria-label="Task status">' +
        OUTCOMES.map(function (o) {
          return '<button type="button" role="radio" class="tickbox' + (rec.outcome === o[0] ? " on" : "") + '" data-o="' + o[0] + '" aria-checked="' + (rec.outcome === o[0]) + '"><i></i>' + o[1] + "</button>";
        }).join("") + "</div>" +
        '<label class="field"><span class="label">Remarks</span><textarea id="note" rows="2" maxlength="400">' + SF.esc(rec.note) + "</textarea></label></div>" +
        "</section>" +
        '<aside class="arr-side">' +
        '<div class="paper passport-page"><div class="pp-head"><span class="label">' + (landed && stamp ? (rec.newStamp ? "Stamp issued" : "Stamp on file") : "No stamp") + '</span><span class="form-no">PASSPORT P.' + String(Math.max(1, stampCount)).padStart(2, "0") + "</span></div>" +
        (landed && stamp ? '<div class="stamp-wrap' + (rec.newStamp ? " fresh" : "") + '">' + SF.stampSVG(stamp, 240) + "</div>"
          : '<div class="no-stamp">DIVERTED FLIGHTS ARE NOT STAMPED</div>') +
        "</div>" +
        '<div class="glass next-card"><h3>' + SF.icon("coffee") + "Layover</h3><p class=\"muted\">Break before the next departure.</p>" +
        '<div class="chips" id="layover">' + breaks.map(function (b) { return '<button type="button" class="chip mono" data-b="' + b + '">' + b + " MIN</button>"; }).join("") + "</div>" +
        '<button class="btn btn-signal block" id="nextFlight">' + SF.icon("takeoff") + "<span>Book next flight · " + here.iata + "</span></button></div>" +
        "</aside></div>";

      var chart = SF.FallbackMap(root.querySelector("#arrChart"), { camera: "route", showPlane: false, night: false, padPx: 24, label: "Route chart" });
      chart.setRoute(SF.airport(rec.from), SF.airport(rec.to));
      chart.setProgress(rec.track ? rec.track.routeFrac : rec.flownKm / Math.max(1, rec.distanceKm));
      chart.setTrack(SF.flight.trackPoints(rec, 48, SF.flight.chartHoldKm(rec)));
      chart.setMarkers([{ lat: SF.airport(rec.from).lat, lon: SF.airport(rec.from).lon, label: rec.from, cls: "m-from", px: 4.5 },
        { lat: SF.airport(rec.to).lat, lon: SF.airport(rec.to).lon, label: rec.to, cls: "m-to", px: 4.5 }].concat(SF.flight.holdMarkers(rec)));
      this._chart = chart;
      root.querySelector("#outcome").onclick = function (e) {
        var b = e.target.closest("[data-o]"); if (!b) return;
        var o = b.getAttribute("data-o");
        updateFlight(rec.id, function (f) { f.outcome = o; });
        rec.outcome = o;
        ui.$$("#outcome .tickbox", root).forEach(function (c) { var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-checked", on); });
        if (SF.achievements && SF.achievements.evaluate) SF.achievements.evaluate(rec);
      };
      var note = root.querySelector("#note");
      note.oninput = function () { updateFlight(rec.id, function (f) { f.note = note.value; }); };
      root.querySelector("#layover").onclick = function (e) {
        var b = e.target.closest("[data-b]"); if (!b) return;
        var min = +b.getAttribute("data-b");
        SF.store.update(function (s) { s.layover = { start: Date.now(), min: min, scale: SF.dev ? 60 : 1 }; }, true);
        ui.go("layover");
      };
      root.querySelector("#nextFlight").onclick = function () { ui.go("book"); };
      ui.updateGoal();
    },
    unmount: function () { if (this._chart) this._chart.destroy(); this._chart = null; }
  };

  /* ---------- split-flap text ---------- */
  function flaps(text, width) {
    text = String(text).toUpperCase().slice(0, width);
    while (text.length < width) text += " ";
    return '<span class="flaps" aria-label="' + SF.esc(text.trim()) + '">' + text.split("").map(function (ch, i) {
      return '<span class="flap" style="animation-delay:' + (i * 35) + 'ms" aria-hidden="true">' + (ch === " " ? "&nbsp;" : SF.esc(ch)) + "</span>";
    }).join("") + "</span>";
  }
  SF.flaps = flaps;

  /* ---------- layover ---------- */
  SF.views.layover = {
    fit: true,
    mount: function (root) {
      var lo = SF.store.state.layover;
      if (!lo) { ui.go("book"); return; }
      var here = SF.airport(SF.store.state.currentAirport);
      var total = lo.min * 60000, iv = null, finished = false;
      var def = SF.store.state.settings.defaultDuration;
      var sugg = SF.routeCandidates(here.iata, def, { max: 6 });

      root.innerHTML =
        '<div class="layover"><section class="glass layover-card">' +
        '<p class="label">' + SF.esc(here.city) + " · Local " + SF.fmt.localTime(here.tz, new Date()) + "</p><h1>Break</h1>" +
        '<div class="lo-ring"><div id="loRing"></div><div class="lo-time" id="loTime">' + SF.fmt.clock(total) + "</div></div>" +
        '<p class="muted" id="loMsg">Leave the screen. Water. Look at something far away.</p>' +
        '<div class="row-btns"><button class="btn" id="loEnd">End layover</button></div>' +
        "</section>" +
        '<section class="board" aria-label="Departures from ' + here.iata + '">' +
        '<div class="board-head"><span>FLIGHT</span><span>DESTINATION</span><span>BLOCK</span><span>STATUS</span></div>' +
        sugg.map(function (r, i) {
          return '<button type="button" class="board-row" data-code="' + r.a.iata + '">' +
            flaps(SF.flight.flightNo(here.iata, r.a.iata), 5) + flaps(r.a.city, 14) + flaps(SF.fmt.dur(def), 6) +
            '<span class="status-cell">' + (i === 0 ? "BOARDING" : "SCHEDULED") + "</span></button>";
        }).join("") + '<div class="board-fill" aria-hidden="true"></div></section></div>';
      ui.topbar(ui.topbarTitle("Layover · " + here.iata), "");
      if (!ui.reducedMotion()) ui.$$(".flap", root).forEach(function (f) { f.classList.add("flip"); });

      function tick() {
        var el = (Date.now() - lo.start) * (lo.scale || 1);
        var left = Math.max(0, total - el);
        root.querySelector("#loTime").textContent = SF.fmt.clock(left);
        root.querySelector("#loRing").innerHTML = ui.ring(Math.min(1, el / total), 240, 8, "Layover " + Math.round(Math.min(1, el / total) * 100) + "%");
        SF.ui.setTitle(SF.fmt.clock(left) + " · Layover");
        if (left <= 0 && !finished) {
          finished = true;
          clearInterval(iv);
          root.querySelector("#loMsg").textContent = "Layover complete.";
          root.querySelector("#loEnd").innerHTML = SF.icon("takeoff") + "<span>Book next flight</span>";
          root.querySelector("#loEnd").className = "btn btn-signal";
          SF.ui.setTitle("");
          SF.ui.announce("Boarding", "Layover " + here.iata + " complete.", "takeoff");
          SF.store.update(function (s) { s.layover = null; }, true);
        }
      }
      iv = setInterval(tick, 500);
      tick();
      root.querySelector("#loEnd").onclick = function () {
        SF.store.update(function (s) { s.layover = null; }, true);
        ui.go("book");
      };
      root.querySelector(".board").onclick = function (e) {
        var b = e.target.closest("[data-code]"); if (!b) return;
        SF.store.update(function (s) { s.layover = null; }, true);
        SF.bookPreset = { to: b.getAttribute("data-code"), minutes: def };
        ui.go("book");
      };
      this._stop = function () { clearInterval(iv); SF.ui.setTitle(""); };
    },
    unmount: function () { if (this._stop) this._stop(); }
  };
})();

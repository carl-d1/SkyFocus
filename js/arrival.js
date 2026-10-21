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

  // opts.onDark: light ink for glass screens; default dark ink for paper.
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
    var fid = opts._fid || "ink-" + s.iata + "-" + Math.random().toString(36).slice(2, 6);
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

  // Stamps are drawn once per stamp, size and style, then reused; each copy keeps a unique filter id.
  (function () {
    var draw = SF.stampSVG, memo = {}, n = 0;
    SF.stampSVG = function (s, size, opts) {
      opts = opts || {};
      var fid = "ink-" + s.iata + "-" + Math.random().toString(36).slice(2, 6);
      var key = [s.iata, s.cc, s.country, s.city, s.date, size, opts.onDark ? 1 : 0].join("|");
      var tpl = memo[key];
      if (!tpl) {
        if (++n > 600) { memo = {}; n = 1; }
        tpl = memo[key] = draw(s, size, Object.assign({}, opts, { _fid: "__SFFID__" }));
      }
      return tpl.split("__SFFID__").join(fid);
    };
  })();


  function findFlight(id) {
    var fl = SF.store.state.flights;
    for (var i = fl.length - 1; i >= 0; i--) if (fl[i].id === id) return fl[i];
    return null;
  }
  function updateFlight(id, fn) {
    SF.store.update(function (s) { s.flights.forEach(function (f) { if (f.id === id) fn(f); }); });
  }

  /* ---------- a new stamp lands: thud, ink splash, the page gives a little ---------- */
  function inkSplash(wrap) {
    if (!wrap || SF.ui.reducedMotion()) return;
    var svg = wrap.querySelector(".stamp");
    // wait for the landing scene to fade so the moment is seen
    var delay = SF.scenes && SF.scenes.playing ? 900 : 200;
    svg.style.animationDelay = delay + "ms";
    setTimeout(function () {
      if (!wrap.isConnected) return;
      var ink = (svg.querySelector("[stroke]:not([stroke='none'])") || svg).getAttribute("stroke") || "#c8432f";
      var q = (SF.store.state.settings.graphics) || "high", n = q === "low" ? 6 : q === "balanced" ? 10 : 15;
      // layout sizes (not the bounding box, which still carries the thud transform)
      var cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2, R = Math.min(svg.clientWidth, svg.clientHeight) * .45;
      var rng = SF.rng(Date.now()), dots = "";
      for (var i = 0; i < n; i++) {
        var a = rng() * Math.PI * 2, d = R * (.82 + rng() * .3), size = 1.2 + rng() * (i < 3 ? 5 : 2.6);
        var x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + size.toFixed(1) + '" style="--dx:' + (-Math.cos(a) * 18).toFixed(1) + "px;--dy:" + (-Math.sin(a) * 18).toFixed(1) + "px;animation-delay:" + Math.round(rng() * 60) + 'ms"/>';
      }
      wrap.insertAdjacentHTML("beforeend", '<svg class="ink-splash" aria-hidden="true" fill="' + ink + '">' + dots + "</svg>");
      var page = wrap.closest(".passport-page");
      if (page) { page.classList.remove("jolt"); void page.offsetWidth; page.classList.add("jolt"); }
    }, delay + 250);
  }

  /* ---------- journey cards ---------- */
  function itineraryList(legs, doneUpTo, nowIdx) {
    return '<ol class="itinerary">' + legs.map(function (l, i) {
      var b = SF.airport(l.to), st = i < doneUpTo ? "done" : i === nowIdx ? "now" : "";
      return '<li class="' + st + '"><span class="readout it-n">' + String(i + 1).padStart(2, "0") + '</span><b class="mono">' + l.from + " → " + l.to + '</b><span class="it-city">' + SF.esc(b.city) + '</span><small class="mono">' + SF.fmt.dist(l.km) + '</small><small class="it-break mono">' +
        (i < doneUpTo ? "LANDED" : i === nowIdx ? "NEXT" : "") + "</small></li>";
    }).join("") + "</ol>";
  }
  function nextCard(rec, here, breaks) {
    var j = SF.journey.active();
    if (j && rec.journeyId === j.id) {
      var n = rec.legIndex + 1, min = SF.journey.breakAfter(n, j);
      return '<div class="glass journey-card"><h3>' + SF.icon("route") + "Journey · leg " + n + (j.untilStop ? "" : " of " + j.legs.length) + " complete</h3>" +
        itineraryList(j.legs.slice(0, Math.min(j.legs.length, n + 3)), n, n) +
        '<button class="btn btn-signal block" id="journeyLayover" data-min="' + min + '">' + SF.icon("coffee") + "<span>Layover · " + min + " min" + (n % j.longEvery === 0 ? " · long" : "") + "</span></button>" +
        '<button class="btn btn-text" id="journeyEnd">End journey here</button></div>';
    }
    var lj = SF.store.state.lastJourney;
    if (lj && rec.journeyId === lj.id) {
      return '<div class="glass journey-card"><h3>' + SF.icon("route") + (lj.ended === "complete" ? "Journey complete" : "Journey ended") + "</h3>" +
        '<dl class="dc-facts mono"><div><dt>Legs</dt><dd>' + lj.landed + (lj.planned ? " of " + lj.planned : "") + "</dd></div><div><dt>Focus</dt><dd>" + SF.fmt.dur(lj.minutes) + "</dd></div><div><dt>Distance</dt><dd>" + SF.fmt.dist(lj.km) + "</dd></div></dl>" +
        '<button class="btn btn-signal block" id="nextFlight">' + SF.icon("takeoff") + "<span>Book next flight · " + here.iata + "</span></button></div>";
    }
    return '<div class="glass next-card"><h3>' + SF.icon("coffee") + "Layover</h3><p class=\"muted\">Break before the next departure.</p>" +
      '<div class="chips" id="layover">' + breaks.map(function (b) { return '<button type="button" class="chip mono" data-b="' + b + '">' + b + " MIN</button>"; }).join("") + "</div>" +
      '<button class="btn btn-signal block" id="nextFlight">' + SF.icon("takeoff") + "<span>Book next flight · " + here.iata + "</span></button></div>";
  }

  /* ---------- arrival ---------- */
  var OUTCOMES = [["yes", "Complete"], ["partly", "Partial"], ["no", "Not complete"]];

  SF.views.arrival = {
    fit: true,
    mount: function (root, args) {
      if (!(SF.scenes && SF.scenes.playing)) SF.audio.setScene("idle");
      var rec = findFlight(args[0]) || SF.store.state.flights[SF.store.state.flights.length - 1];
      if (!rec) { ui.go("book"); return; }
      var landed = rec.status === "landed";
      var here = SF.airport(landed ? rec.to : rec.from);
      var stamp = SF.store.state.stamps.filter(function (x) { return x.iata === rec.to; })[0];
      var breaks = SF.store.state.settings.breaks;
      var stampCount = SF.store.state.stamps.length;

      root.innerHTML =
        '<div class="arrival">' +
        '<section class="glass report" aria-label="Arrival report">' +
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
        "<div><dt>Holds</dt><dd>" + rec.holds + " OF " + SF.flight.maxHolds(rec) + "</dd></div>" +
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
        '<div class="glass passport-page"><div class="pp-head"><span class="label">' + (landed && stamp ? (rec.newStamp ? "Stamp issued" : "Stamp on file") : "No stamp") + '</span><span class="form-no">PASSPORT P.' + String(Math.max(1, stampCount)).padStart(2, "0") + "</span></div>" +
        (landed && stamp ? '<div class="stamp-wrap' + (rec.newStamp ? " fresh" : "") + '">' + SF.stampSVG(stamp, 240, { onDark: true }) + "</div>"
          : '<div class="no-stamp">DIVERTED FLIGHTS ARE NOT STAMPED</div>') +
        "</div>" +
        nextCard(rec, here, breaks) +
        "</aside></div>";

      inkSplash(root.querySelector(".stamp-wrap.fresh"));
      // new achievements and tiers, once the stamp has landed
      var celebrateIn = (SF.scenes && SF.scenes.playing ? 900 : 200) + (rec.newStamp ? 1300 : 400);
      this._celebrate = setTimeout(function () { if (root.isConnected && SF.achievements) SF.achievements.celebrate(); }, celebrateIn);
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
        if (SF.achievements && SF.achievements.evaluate) { SF.achievements.evaluate(rec); SF.achievements.celebrate(); }
      };
      var note = root.querySelector("#note");
      note.oninput = function () { updateFlight(rec.id, function (f) { f.note = note.value; }); };
      function startLayover(min, journeyId) {
        SF.store.update(function (s) { s.layover = { start: Date.now(), min: min, scale: SF.speed(), journeyId: journeyId || null }; }, true);
        ui.go("layover");
      }
      var lb = root.querySelector("#layover");
      if (lb) lb.onclick = function (e) {
        var b = e.target.closest("[data-b]"); if (!b) return;
        startLayover(+b.getAttribute("data-b"));
      };
      var jl = root.querySelector("#journeyLayover");
      if (jl) jl.onclick = function () { startLayover(+jl.getAttribute("data-min"), rec.journeyId); };
      var je = root.querySelector("#journeyEnd");
      if (je) je.onclick = function () {
        ui.confirm("End journey", "Stop here. Completed legs stay in the logbook.", "End journey", true).then(function (ok) {
          if (!ok) return;
          SF.journey.end();
          ui.go("arrival/" + rec.id);
        });
      };
      var nf = root.querySelector("#nextFlight");
      if (nf) nf.onclick = function () { ui.go("book"); };
      ui.updateGoal();
    },
    unmount: function () { clearTimeout(this._celebrate); if (this._chart) this._chart.destroy(); this._chart = null; }
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
      var j = SF.journey.active();
      var inJourney = !!(j && lo.journeyId === j.id);
      var sugg = inJourney ? [] : SF.routeCandidates(here.iata, def, { max: 6 });
      var autoStart = inJourney && SF.store.state.settings.journey.autoStart;
      SF.audio.setScene("layover");   // rain, noise and pad carry on through the break; no engine

      root.innerHTML =
        '<div class="layover"><section class="glass layover-card">' +
        '<p class="label">' + SF.esc(here.city) + " · Local " + SF.fmt.localTime(here.tz, new Date()) + "</p><h1>Break</h1>" +
        '<div class="lo-ring"><div id="loRing"></div><div class="lo-time" id="loTime">' + SF.fmt.clock(total) + "</div></div>" +
        '<p class="muted" id="loMsg">Leave the screen. Water. Look at something far away.</p>' +
        (inJourney
          ? '<div class="row-btns"><button class="btn btn-signal" id="loBoard">' + SF.icon("takeoff") + "<span>Board leg " + (j.index + 1) + "</span></button>" +
            '<button class="btn btn-text" id="loEndJourney">End journey</button></div>' +
            '<p class="small-print">' + (autoStart ? "Next leg boards automatically when the break ends." : "Next leg waits for you.") + "</p>"
          : '<div class="row-btns"><button class="btn" id="loEnd">End layover</button></div>') +
        "</section>" +
        '<section class="board" aria-label="Departures from ' + here.iata + '">' +
        '<div class="board-head"><span>FLIGHT</span><span>DESTINATION</span><span>BLOCK</span><span>STATUS</span></div>' +
        (inJourney
          ? j.legs.map(function (l, i) {
              var st = i < j.index ? "LANDED" : i === j.index ? "NEXT" : "SCHEDULED";
              return '<div class="board-row journey-row' + (i < j.index ? " done" : "") + '">' +
                flaps(SF.flight.flightNo(l.from, l.to), 5) + flaps(SF.airport(l.to).city, 14) + flaps(j.legMin + "m", 6) +
                '<span class="status-cell">' + st + "</span></div>";
            }).slice(Math.max(0, j.index - 2), j.index + 6).join("")
          : sugg.map(function (r, i) {
              return '<button type="button" class="board-row" data-code="' + r.a.iata + '">' +
                flaps(SF.flight.flightNo(here.iata, r.a.iata), 5) + flaps(r.a.city, 14) + flaps(SF.fmt.dur(def), 6) +
                '<span class="status-cell">' + (i === 0 ? "BOARDING" : "SCHEDULED") + "</span></button>";
            }).join("")) + '<div class="board-fill" aria-hidden="true"></div></section></div>';
      ui.topbar(ui.topbarTitle("Layover · " + here.iata), inJourney ? '<span class="leg-tag">JOURNEY · LEG ' + (j.index + 1) + (j.untilStop ? "" : " OF " + j.legs.length) + " NEXT</span>" : "");
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
          SF.ui.setTitle("");
          SF.ui.announce("Boarding", "Layover " + here.iata + " complete.", "takeoff");
          SF.store.update(function (s) { s.layover = null; }, true);
          if (inJourney) { if (autoStart) boardNext(true); }
          else {
            root.querySelector("#loEnd").innerHTML = SF.icon("takeoff") + "<span>Book next flight</span>";
            root.querySelector("#loEnd").className = "btn btn-signal";
          }
        }
      }
      iv = setInterval(tick, 500);
      tick();
      // Journey: book the next leg and go to the gate (auto-boards when started by the timer).
      function boardNext(auto) {
        SF.store.update(function (s) { s.layover = null; }, true);
        SF.journey.bookLeg(SF.journey.active().index);
        SF.autoBoard = !!auto;
        ui.go("board");
      }
      if (inJourney) {
        root.querySelector("#loBoard").onclick = function () { boardNext(false); };
        root.querySelector("#loEndJourney").onclick = function () {
          ui.confirm("End journey", "Stop here. Completed legs stay in the logbook.", "End journey", true).then(function (ok) {
            if (!ok) return;
            SF.store.update(function (s) { s.layover = null; }, true);
            SF.journey.end();
            ui.go("book");
          });
        };
      } else root.querySelector("#loEnd").onclick = function () {
        SF.store.update(function (s) { s.layover = null; }, true);
        ui.go("book");
      };
      root.querySelector(".board").onclick = function (e) {
        var b = e.target.closest("[data-code]"); if (!b) return;
        SF.store.update(function (s) { s.layover = null; }, true);
        SF.bookPreset = { to: b.getAttribute("data-code"), minutes: def };
        ui.go("book");
      };
      this._stop = function () { clearInterval(iv); SF.ui.setTitle(""); SF.audio.setScene("idle"); };
    },
    unmount: function () { if (this._stop) this._stop(); }
  };
})();

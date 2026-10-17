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

  SF.stampSVG = function (s, size) {
    size = size || 150;
    var hc = SF.hash(s.cc || s.country), hi = SF.hash(s.iata);
    var ink = INKS[hc % INKS.length], shape = SHAPES[(hc >> 4) % SHAPES.length];
    var rot = ((hi % 25) - 12);
    var dash = ["", "5 3", "2 3"][(hi >> 3) % 3];
    var fid = "ink-" + s.iata + "-" + Math.random().toString(36).slice(2, 6);
    var date = SF.fmt.shortDate(new Date(s.date)) + " " + String(new Date(s.date).getFullYear()).slice(2);
    var country = SF.esc(s.country.toUpperCase());
    var city = SF.esc(s.city.toUpperCase());
    var outer = "", inner = "", text = "";
    var plane = '<path transform="translate(88 30) scale(.9) rotate(45 12 12)" fill="' + ink + '" d="M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z"/>';

    if (shape === "circle") {
      outer = '<circle cx="100" cy="100" r="88" stroke-width="5"/>';
      inner = '<circle cx="100" cy="100" r="62" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = '<defs><path id="arc-' + fid + '" d="M28 100a72 72 0 0 1 144 0"/><path id="arcb-' + fid + '" d="M30 104a70 70 0 0 0 140 0"/></defs>' +
        '<text font-size="15" letter-spacing="3" text-anchor="middle"><textPath href="#arc-' + fid + '" startOffset="50%">' + country + "</textPath></text>" +
        '<text font-size="13" letter-spacing="2" text-anchor="middle"><textPath href="#arcb-' + fid + '" startOffset="50%">' + city + "</textPath></text>" +
        '<text x="100" y="108" font-size="36" font-weight="800" text-anchor="middle" letter-spacing="2">' + s.iata + "</text>" +
        '<text x="100" y="130" font-size="12" text-anchor="middle" letter-spacing="1.5">' + date + "</text>";
    } else if (shape === "rect") {
      outer = '<rect x="18" y="34" width="164" height="132" rx="14" stroke-width="5"/>';
      inner = '<rect x="28" y="44" width="144" height="112" rx="8" stroke-width="2" stroke-dasharray="' + dash + '"/><path d="M28 74H172M28 128H172" stroke-width="2"/>';
      text = '<text x="100" y="65" font-size="14" text-anchor="middle" letter-spacing="3">' + country + "</text>" +
        '<text x="100" y="113" font-size="38" font-weight="800" text-anchor="middle" letter-spacing="3">' + s.iata + "</text>" +
        '<text x="100" y="147" font-size="10.5" text-anchor="middle" letter-spacing="1">' + city.slice(0, 12) + " · " + date + "</text>";
    } else if (shape === "hex" || shape === "oct") {
      var n = shape === "hex" ? 6 : 8, r0 = shape === "hex" ? -Math.PI / 2 : Math.PI / 8;
      outer = '<polygon points="' + polygon(n, 90, 100, 100, r0) + '" stroke-width="5"/>';
      inner = '<polygon points="' + polygon(n, 74, 100, 100, r0) + '" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = '<text x="100" y="76" font-size="13" text-anchor="middle" letter-spacing="2.5">' + country.slice(0, 16) + "</text>" +
        '<text x="100" y="114" font-size="36" font-weight="800" text-anchor="middle" letter-spacing="2">' + s.iata + "</text>" +
        '<text x="100" y="134" font-size="11" text-anchor="middle" letter-spacing="1.5">' + city.slice(0, 14) + "</text>" +
        '<text x="100" y="150" font-size="11" text-anchor="middle" letter-spacing="1.5">' + date + "</text>";
      plane = "";
    } else if (shape === "oval") {
      outer = '<ellipse cx="100" cy="100" rx="92" ry="66" stroke-width="5"/>';
      inner = '<ellipse cx="100" cy="100" rx="78" ry="52" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = '<text x="100" y="80" font-size="13" text-anchor="middle" letter-spacing="3">' + country.slice(0, 18) + "</text>" +
        '<text x="100" y="114" font-size="34" font-weight="800" text-anchor="middle" letter-spacing="4">' + s.iata + "</text>" +
        '<text x="100" y="134" font-size="11" text-anchor="middle" letter-spacing="1.5">' + date + " · ARRIVED</text>";
      plane = "";
    } else {
      outer = '<path d="M100 14 172 40V100C172 140 140 170 100 186 60 170 28 140 28 100V40Z" stroke-width="5"/>';
      inner = '<path d="M100 28 160 50V100C160 133 133 158 100 172 67 158 40 133 40 100V50Z" stroke-width="2" stroke-dasharray="' + dash + '"/>';
      text = '<text x="100" y="72" font-size="12" text-anchor="middle" letter-spacing="2">' + country.slice(0, 15) + "</text>" +
        '<text x="100" y="112" font-size="34" font-weight="800" text-anchor="middle" letter-spacing="2">' + s.iata + "</text>" +
        '<text x="100" y="132" font-size="11" text-anchor="middle" letter-spacing="1">' + city.slice(0, 14) + "</text>" +
        '<text x="100" y="148" font-size="11" text-anchor="middle" letter-spacing="1">' + date + "</text>";
      plane = "";
    }
    return '<svg class="stamp" viewBox="0 0 200 200" width="' + size + '" height="' + size + '" role="img" aria-label="Passport stamp: ' + SF.esc(s.city) + ", " + SF.esc(s.country) + '">' +
      '<filter id="' + fid + '"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="' + (hi % 100) + '" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>' +
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
  SF.views.arrival = {
    mount: function (root, args) {
      var rec = findFlight(args[0]) || SF.store.state.flights[SF.store.state.flights.length - 1];
      if (!rec) { ui.go("book"); return; }
      var landed = rec.status === "landed";
      var here = SF.airport(landed ? rec.to : rec.from);
      var stamp = SF.store.state.stamps.filter(function (s) { return s.iata === rec.to; })[0];
      var breaks = SF.store.state.settings.breaks;

      root.innerHTML =
        '<div class="arrival">' +
        '<section class="panel arrival-card' + (landed ? "" : " diverted") + '">' +
        '<div class="arr-hero">' +
        '<div class="arr-icon">' + SF.icon(landed ? "landing" : "alert") + "</div>" +
        '<p class="eyebrow">' + (landed ? "Flight " + rec.flightNo + " has landed" : "Flight " + rec.flightNo + " diverted") + "</p>" +
        "<h1>" + (landed ? "Welcome to " + SF.esc(here.city) : "Back at " + SF.esc(here.city)) + "</h1>" +
        '<p class="muted">Local time <b class="mono">' + SF.fmt.localTime(here.tz, new Date()) + "</b> · " + SF.esc(here.country) + "</p>" +
        (rec.divertReason === "away" ? '<p class="divert-why">' + SF.icon("shield") + "The distraction guard turned this flight around because you were away from the cabin too long.</p>" : "") +
        "</div>" +
        '<dl class="arr-facts">' +
        '<div><dt>Focus time</dt><dd class="mono">' + SF.fmt.dur(rec.focusMin) + "</dd></div>" +
        '<div><dt>Miles earned</dt><dd class="mono accent">+' + rec.miles.toLocaleString() + "</dd></div>" +
        '<div><dt>Distance</dt><dd class="mono">' + SF.fmt.dist(rec.flownKm) + "</dd></div>" +
        '<div><dt>Turbulence</dt><dd class="mono">' + rec.turbulence + "</dd></div>" +
        '<div><dt>Tag</dt><dd><span class="tag-pill" style="--tag:' + rec.tagColor + '">' + SF.icon(rec.tagIcon) + SF.esc(rec.tagName) + "</span></dd></div>" +
        '<div class="wide"><dt>Task</dt><dd>' + (rec.task ? SF.esc(rec.task) : '<span class="muted">Open focus</span>') + "</dd></div>" +
        "</dl>" +
        '<div class="outcome"><p><b>Did you finish what you planned?</b></p><div class="chips" id="outcome" role="group" aria-label="Outcome">' +
        [["yes", "Yes", "check"], ["partly", "Partly", "minus"], ["no", "No", "x"]].map(function (o) {
          return '<button class="chip' + (rec.outcome === o[0] ? " on" : "") + '" data-o="' + o[0] + '" aria-pressed="' + (rec.outcome === o[0]) + '">' + SF.icon(o[2]) + "<span>" + o[1] + "</span></button>";
        }).join("") + "</div>" +
        '<label class="field"><span>Note <small class="muted">(optional)</small></span><textarea id="note" rows="2" maxlength="400" placeholder="What went well? What’s next?">' + SF.esc(rec.note) + "</textarea></label></div>" +
        "</section>" +
        '<aside class="arr-side">' +
        '<div class="panel stamp-card">' +
        (landed && stamp ? (rec.newStamp ? '<p class="eyebrow">New passport stamp</p>' : '<p class="eyebrow">Already in your passport</p>') +
          '<div class="stamp-wrap' + (rec.newStamp ? " fresh" : "") + '">' + SF.stampSVG(stamp, 170) + "</div>" +
          '<p class="muted center">' + SF.store.state.stamps.length + " " + (SF.store.state.stamps.length === 1 ? "city" : "cities") + " collected</p>"
          : '<p class="eyebrow">No stamp this time</p><div class="no-stamp">' + SF.icon("passport") + '</div><p class="muted center">Diverted flights earn miles for the distance flown, but no city stamp.</p>') +
        "</div>" +
        '<div class="panel next-card"><h3>' + SF.icon("coffee") + "Layover</h3><p class=\"muted\">Take a proper break before your next flight.</p>" +
        '<div class="chips" id="layover">' + breaks.map(function (b) { return '<button class="chip" data-b="' + b + '">' + b + " min</button>"; }).join("") + "</div>" +
        '<button class="btn btn-primary block" id="nextFlight">' + SF.icon("takeoff") + "<span>Book next flight from " + here.iata + "</span></button></div>" +
        "</aside></div>";

      root.querySelector("#outcome").onclick = function (e) {
        var b = e.target.closest("[data-o]"); if (!b) return;
        var o = b.getAttribute("data-o");
        updateFlight(rec.id, function (f) { f.outcome = o; });
        rec.outcome = o;
        ui.$$("#outcome .chip", root).forEach(function (c) { var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-pressed", on); });
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
    unmount: function () { }
  };

  /* ---------- layover ---------- */
  SF.views.layover = {
    mount: function (root) {
      var lo = SF.store.state.layover;
      if (!lo) { ui.go("book"); return; }
      var here = SF.airport(SF.store.state.currentAirport);
      var total = lo.min * 60000, iv = null, finished = false;
      var def = SF.store.state.settings.defaultDuration;
      var A = here;
      var sugg = window.AIRPORTS.filter(function (a) { return a.iata !== A.iata; }).map(function (a) {
        var km = SF.geo.distanceKm(A, a);
        return { a: a, real: SF.geo.realisticMinutes(km) };
      }).sort(function (x, y) { return Math.abs(x.real - def) - Math.abs(y.real - def); }).slice(0, 4);

      root.innerHTML =
        '<div class="layover"><section class="panel layover-card">' +
        '<p class="eyebrow">Layover in ' + SF.esc(here.city) + "</p><h1>Stretch your legs</h1>" +
        '<div class="lo-ring"><div id="loRing"></div><div class="lo-time mono" id="loTime">' + SF.fmt.clock(total) + "</div></div>" +
        '<p class="muted" id="loMsg">Step away from the screen, refill your water, look at something far away.</p>' +
        '<div class="row-btns"><button class="btn btn-ghost" id="loEnd">End layover</button></div>' +
        "</section>" +
        '<section class="panel lo-next"><h3>' + SF.icon("route") + "Next departures from " + here.iata + '</h3><div class="dest-list">' +
        sugg.map(function (r) {
          return '<button class="dest" data-code="' + r.a.iata + '"><b class="mono code">' + r.a.iata + '</b><span class="dest-name">' + SF.esc(r.a.city) + "<small>" + SF.esc(r.a.country) + '</small></span><span class="dest-meta mono">' + SF.fmt.dur(def) + "<small>focus</small></span></button>";
        }).join("") + "</div></section></div>";

      function tick() {
        var el = (Date.now() - lo.start) * (lo.scale || 1);
        var left = Math.max(0, total - el);
        root.querySelector("#loTime").textContent = SF.fmt.clock(left);
        root.querySelector("#loRing").innerHTML = ui.ring(el / total, 220, 10, "Layover " + Math.round(Math.min(1, el / total) * 100) + "%");
        SF.ui.setTitle(SF.fmt.clock(left) + " · Layover");
        if (left <= 0 && !finished) {
          finished = true;
          clearInterval(iv);
          root.querySelector("#loMsg").textContent = "Layover complete. Ready for your next flight?";
          root.querySelector("#loEnd").innerHTML = SF.icon("takeoff") + "<span>Book next flight</span>";
          root.querySelector("#loEnd").className = "btn btn-primary";
          SF.ui.setTitle("");
          SF.ui.announce("Boarding soon", "Your layover in " + here.city + " is over. Pick your next flight.", "takeoff");
          SF.store.update(function (s) { s.layover = null; }, true);
        }
      }
      iv = setInterval(tick, 500);
      tick();
      root.querySelector("#loEnd").onclick = function () {
        SF.store.update(function (s) { s.layover = null; }, true);
        ui.go("book");
      };
      root.querySelector(".lo-next").onclick = function (e) {
        var b = e.target.closest("[data-code]"); if (!b) return;
        SF.store.update(function (s) { s.layover = null; }, true);
        SF.bookPreset = { to: b.getAttribute("data-code") };
        ui.go("book");
      };
      this._iv = iv;
      this._stop = function () { clearInterval(iv); SF.ui.setTitle(""); };
    },
    unmount: function () { if (this._stop) this._stop(); }
  };
})();

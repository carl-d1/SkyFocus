/* Boarding pass rendering and the gate (board) view. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  // f can be an active flight or a logbook record (same field names).
  SF.renderPass = function (f, opts) {
    opts = opts || {};
    var A = SF.airport(f.from), B = SF.airport(f.to);
    var when = new Date(f.startAt || f.bookedAt);
    var boarding = new Date((f.startAt || f.bookedAt));
    var name = (SF.store.state.profile.name || "Passenger").toUpperCase();
    var status = f.status ? '<span class="pass-status ' + f.status + '">' + (f.status === "landed" ? "LANDED" : "DIVERTED") + "</span>" : "";
    var el = ui.h(
      '<article class="pass" style="--tag:' + f.tagColor + '" aria-label="Boarding pass ' + f.flightNo + " from " + A.city + " to " + B.city + '">' +
      '<div class="pass-main">' +
      '<header class="pass-top"><div class="pass-brand"><span>SkyFocus</span><small>Boarding pass</small></div>' + status + '<span class="pass-cls">' + SF.esc(f.cls) + "</span></header>" +
      '<div class="pass-route">' +
      '<div class="pr-end"><small>From</small><b>' + A.iata + "</b><span>" + SF.esc(A.city) + "</span></div>" +
      '<div class="pr-mid"><span class="pr-line"></span>' + SF.icon("plane", "rot90 fill") + '<span class="pr-line"></span><small>' + SF.fmt.dur(f.plannedMin).toUpperCase() + "</small></div>" +
      '<div class="pr-end right"><small>To</small><b>' + B.iata + "</b><span>" + SF.esc(B.city) + "</span></div></div>" +
      '<dl class="pass-grid">' +
      "<div><dt>Passenger</dt><dd>" + SF.esc(name) + "</dd></div>" +
      "<div><dt>Flight</dt><dd>" + f.flightNo + "</dd></div>" +
      "<div><dt>Date</dt><dd>" + SF.fmt.shortDate(when) + "</dd></div>" +
      "<div><dt>Boarding</dt><dd>" + SF.fmt.time(boarding) + "</dd></div>" +
      "<div><dt>Gate</dt><dd>" + f.gate + "</dd></div>" +
      "<div><dt>Seat</dt><dd>" + f.seat + "</dd></div>" +
      "<div><dt>Class</dt><dd>" + SF.esc(f.tagName) + "</dd></div>" +
      "<div><dt>Duration</dt><dd>" + SF.fmt.dur(f.plannedMin) + "</dd></div>" +
      '<div class="wide"><dt>Task</dt><dd>' + (f.task ? SF.esc(f.task) : '<span class="muted">Open focus</span>') + "</dd></div>" +
      "</dl>" +
      '<div class="pass-foot"><canvas class="pass-barcode" width="560" height="56" aria-hidden="true"></canvas><span class="form-no">FORM SF-07 · ' + f.id.slice(-6).toUpperCase() + "</span></div>" +
      "</div>" +
      '<div class="pass-stub">' +
      '<div class="stub-row"><small>Flight</small><b>' + f.flightNo + "</b></div>" +
      '<div class="stub-row"><small>Route</small><b>' + A.iata + " → " + B.iata + "</b></div>" +
      '<div class="stub-row two"><span><small>Seat</small><b>' + f.seat + "</b></span><span><small>Gate</small><b>" + f.gate + "</b></span></div>" +
      '<canvas class="pass-qr" width="120" height="120" aria-hidden="true"></canvas>' +
      '<div class="stub-stamp" aria-hidden="true">BOARDED</div>' +
      "</div></article>");
    drawBarcode(el.querySelector(".pass-barcode"), f.id + f.flightNo);
    drawQR(el.querySelector(".pass-qr"), f.id);
    return el;
  };

  // Purely decorative: random bar widths seeded by the flight id.
  function drawBarcode(c, seed) {
    var g = c.getContext("2d"), r = SF.rng(SF.hash(seed));
    var color = getComputedStyle(document.documentElement).getPropertyValue("--pass-ink").trim() || "#1a2233";
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    var x = 4;
    while (x < c.width - 6) {
      var w = 1 + Math.floor(r() * 4);
      if (r() > 0.42) g.fillRect(x, 0, w, c.height);
      x += w + 1 + Math.floor(r() * 2);
    }
  }
  function drawQR(c, seed) {
    var g = c.getContext("2d"), r = SF.rng(SF.hash("qr" + seed)), n = 21, s = c.width / n;
    var color = getComputedStyle(document.documentElement).getPropertyValue("--pass-ink").trim() || "#1a2233";
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    function finder(x, y) {
      g.fillRect(x * s, y * s, 7 * s, 7 * s);
      g.clearRect((x + 1) * s, (y + 1) * s, 5 * s, 5 * s);
      g.fillRect((x + 2) * s, (y + 2) * s, 3 * s, 3 * s);
    }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!inFinder && r() > 0.52) g.fillRect(x * s, y * s, s + 0.4, s + 0.4);
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  }

  /* ---------- gate view ---------- */
  var DND = ["Phone silenced", "Other tabs closed", "Water ready", "Materials open"];

  SF.views.board = {
    fit: true,
    mount: function (root) {
      var af = SF.store.state.activeFlight;
      if (!af) { ui.go("book"); return; }
      if (af.started) { ui.go("flight"); return; }
      var s = SF.store.state.settings;
      var timers = [];
      var self = this;
      self._timers = timers;
      var guard = { off: "Off", warn: "Warn on exit", divert: "Divert after " + s.strictMinutes + " min away" }[s.strictness];

      ui.topbar(ui.topbarTitle("Gate " + af.gate + " · " + af.from + " → " + af.to),
        '<button class="btn" id="backBook">' + SF.icon("x") + "<span>Change booking</span></button>");
      root.innerHTML =
        '<div class="gate-grid"><div class="pass-wrap" id="passWrap"></div>' +
        '<aside class="glass gate-side">' +
        (s.dndChecklist ? '<h3>Pre-departure check</h3><ul class="checklist" id="dnd">' + DND.map(function (d, i) {
          return '<li><label><input type="checkbox" data-i="' + i + '"><span class="tick">' + SF.icon("check") + "</span><span>" + d + "</span></label></li>";
        }).join("") + "</ul>" : "") +
        '<label class="switch"><input type="checkbox" id="apMode"><span class="track"><span class="thumb"></span></span><span><b>Airplane mode</b><small>Fullscreen. Non-essential UI hidden. Key F.</small></span></label>' +
        '<p class="small-print">' + SF.icon("shield") + "Guard <b>" + guard + "</b> · Holds <b>" + SF.flight.MAX_HOLDS + "</b></p>" +
        (SF.dev ? '<p class="dev-note">' + SF.icon("flask") + "DEV: TIME ×60</p>" : "") +
        '<button class="btn btn-signal btn-lg block" id="boardBtn">' + SF.icon("takeoff") + "<span>Board</span></button>" +
        "</aside></div>";

      var pass = SF.renderPass(af);
      root.querySelector("#passWrap").appendChild(pass);
      document.getElementById("backBook").onclick = function () { SF.engine.cancel(); ui.go("book"); };

      root.querySelector("#boardBtn").onclick = function () {
        var ap = root.querySelector("#apMode").checked;
        this.disabled = true;
        this.querySelector("span").textContent = "Boarding closed";
        if (SF.audio && SF.audio.unlock) SF.audio.unlock();
        if (ap) SF.ui.enterFullscreen();
        var reduce = ui.reducedMotion();
        pass.classList.add("stamped");
        timers.push(setTimeout(function () { pass.classList.add("torn"); }, reduce ? 0 : 450));
        timers.push(setTimeout(function () { countdown(ap); }, reduce ? 200 : 1200));
      };

      function countdown(ap) {
        var n = 5;
        var ov = ui.h('<div class="countdown" role="dialog" aria-modal="true" aria-label="Takeoff countdown"><div class="glass cd-inner">' +
          '<p class="label">Cleared for takeoff</p><div class="cd-num" aria-live="assertive">5</div>' +
          '<p class="mono muted">' + af.flightNo + "  " + af.from + " → " + af.to + '</p><button class="btn" id="cdSkip">Skip <kbd>Enter</kbd></button></div></div>');
        document.body.appendChild(ov);
        var done = false;
        function go() {
          if (done) return;
          done = true;
          clearInterval(iv);
          document.removeEventListener("keydown", key, true);
          ov.remove();
          SF.store.update(function (st) { st.activeFlight.airplaneMode = ap; }, true);
          if (ap) document.body.classList.add("airplane");
          SF.engine.start();
          ui.go("flight");
        }
        function key(e) { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); go(); } }
        document.addEventListener("keydown", key, true);
        ov.querySelector("#cdSkip").onclick = go;
        ov.querySelector("#cdSkip").focus();
        var iv = setInterval(function () {
          n--;
          if (n <= 0) { go(); return; }
          var num = ov.querySelector(".cd-num");
          num.textContent = n;
          num.classList.remove("pop"); void num.offsetWidth; num.classList.add("pop");
        }, 1000);
        self._cd = function () { if (!done) { done = true; clearInterval(iv); document.removeEventListener("keydown", key, true); ov.remove(); } };
      }
    },
    unmount: function () {
      (this._timers || []).forEach(clearTimeout);
      if (this._cd) this._cd();
      this._cd = null;
    }
  };
})();

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

  // The reverse of the pass: conditions of carriage, printed on the same paper.
  SF.renderPassBack = function (f) {
    return ui.h('<div class="pass-back" aria-hidden="true">' +
      '<div class="pb-stub"><img src="assets/logo.svg" alt="" width="40" height="40"><span class="pb-brand">SkyFocus</span><span class="form-no">' + f.flightNo + "</span></div>" +
      '<div class="pb-main"><div class="pb-stripe"></div>' +
      '<p class="pb-title">Conditions of carriage</p><ol class="pb-terms">' +
      "<li>Valid for one focus session on the flight shown. Not transferable.</li>" +
      "<li>Holds: " + SF.flight.maxHolds(f) + " on this flight (one per full hour of block time), up to 10 minutes each.</li>" +
      "<li>Leaving the cabin during flight is logged as turbulence.</li>" +
      "<li>A diverted flight is logged without a passport stamp.</li>" +
      "<li>Keep the stub until arrival.</li></ol>" +
      '<span class="form-no">FORM SF-07 · REVERSE</span></div></div>');
  };

  /* ---------- gate view ---------- */
  var DND = ["Turn on YPT", "Other tabs closed", "Water ready", "Materials open"];

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
      // YPT link on: the first check becomes the phone's own start, ticked once the link is sent
      var yptOn = s.dndChecklist && SF.ypt && SF.ypt.on();
      var dnd = DND.slice();
      if (yptOn) dnd[0] = "Unlock phone when it wakes, YPT starts itself";
      var guard = { off: "Off", warn: "Warn on exit", divert: "Divert after " + s.strictMinutes + " min away" }[s.strictness];

      ui.topbar(ui.topbarTitle("Gate " + af.gate + " · " + af.from + " → " + af.to) + (af.journeyId ? '<span class="leg-tag">' + SF.journey.legLabel(af) + "</span>" : ""),
        '<button class="btn" id="backBook">' + SF.icon("x") + "<span>Change booking</span></button>");
      root.innerHTML =
        '<div class="gate-grid"><div class="pass-wrap" id="passWrap"></div>' +
        '<aside class="glass gate-side">' +
        (s.dndChecklist ? '<h3>Pre-departure check</h3><ul class="checklist" id="dnd">' + dnd.map(function (d, i) {
          return '<li><label><input type="checkbox" data-i="' + i + '"><span class="tick">' + SF.icon("check") + "</span><span>" + d + "</span></label>" +
            (yptOn && i === 0 ? '<div class="ypt-line"><span id="yptStatus">Waking your phone</span><button type="button" class="btn btn-text small" id="yptAgain">Send again</button></div>' : "") + "</li>";
        }).join("") + "</ul>" : "") +
        '<label class="switch"><input type="checkbox" id="apMode"><span class="track"><span class="thumb"></span></span><span><b>Airplane mode</b><small>Fullscreen. Non-essential UI hidden. Key F.</small></span></label>' +
        '<p class="small-print">' + SF.icon("shield") + "Guard <b>" + guard + "</b> · Holds <b>" + SF.flight.maxHolds(af) + "</b></p>" +
        (SF.dev ? '<p class="dev-note">' + SF.icon("flask") + "DEV: TIME ×60</p>" : "") +
        '<button class="btn btn-signal btn-lg block" id="boardBtn">' + SF.icon("takeoff") + "<span>Board</span></button>" +
        "</aside></div>";

      var pass = SF.renderPass(af);
      // Board stays locked until every pre-departure check is ticked. Later legs of the same journey
      // keep the ticks.
      var checks = ui.$$("#dnd input", root), boardBtn = root.querySelector("#boardBtn");
      if (checks.length && SF.dndJourney && SF.dndJourney === af.journeyId) checks.forEach(function (c) { c.checked = true; });
      var boarded = false;
      function checkGate() {
        var ok = checks.every(function (c) { return c.checked; });
        if (boarded) return ok;
        boardBtn.disabled = !ok;
        boardBtn.title = ok ? "" : "Complete the pre-departure check first";
        if (ok && af.journeyId) SF.dndJourney = af.journeyId;
        return ok;
      }
      checks.forEach(function (c) { c.addEventListener("change", checkGate); });
      checkGate();
      if (yptOn) {
        var yStat = root.querySelector("#yptStatus");
        var yptStart = function (again) {
          yStat.textContent = "Waking your phone";
          (again ? SF.ypt.test("start") : SF.ypt.send("start")).then(function (how) {
            yStat.textContent = how === "already" ? "YPT is already running" : how === "sent" ? "Sent to your phone" : "Your phone got it";
            checks[0].checked = true;
            checkGate();
          }, function () { yStat.textContent = "Not sent. Tick this once YPT runs."; });
        };
        yptStart(false);
        root.querySelector("#yptAgain").onclick = function () { yptStart(true); };
      }
      // flip card: front and reverse, turned with a spring and tilted toward the pointer
      var flipBox = ui.h('<div class="pass-flip"><div class="pass-card" role="button" tabindex="0" aria-label="Turn the boarding pass over"></div></div>');
      var card = flipBox.firstChild;
      card.appendChild(pass);
      card.appendChild(SF.renderPassBack(af));
      var passWrap = root.querySelector("#passWrap");
      passWrap.appendChild(flipBox);
      passWrap.appendChild(ui.h('<button type="button" class="btn btn-text small pass-turn" id="passTurn">' + SF.icon("refresh") + "<span>Turn over</span></button>"));
      var flipped = false;
      var flipS = SF.motion.spring({ stiffness: 110, damping: 13, onUpdate: function (v) { card.style.setProperty("--flip", v.toFixed(2) + "deg"); } });
      function turn(to) {
        flipped = to == null ? !flipped : to;
        flipS.set(flipped ? 180 : 0);
        card.classList.toggle("is-back", flipped);
      }
      card.addEventListener("click", function () { if (!boarded) turn(); });
      card.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !boarded) { e.preventDefault(); turn(); } });
      root.querySelector("#passTurn").onclick = function () { if (!boarded) turn(); };
      self._untilt = SF.motion.tilt(flipBox, 4);
      if (document.documentElement.classList.contains("vt-run")) flipBox.classList.add("no-intro");
      document.getElementById("backBook").onclick = function () {
        // leaving the gate during a journey ends the journey (no leg is lost: this one has not departed)
        if (af.journeyId && SF.journey.active()) SF.journey.end();
        SF.engine.cancel(); ui.go("book");
        if (yptOn) SF.ypt.send("stop").catch(function () { /* toast shown */ });
      };
      // Journey legs started by the layover timer board on their own after a short delay (a bar fills
      // the Board button; touching anything else cancels it).
      var auto = SF.autoBoard;
      SF.autoBoard = false;
      if (auto && checkGate()) {
        var btn = root.querySelector("#boardBtn");
        btn.classList.add("auto-board");
        btn.querySelector("span").textContent = "Boarding";
        requestAnimationFrame(function () { requestAnimationFrame(function () { btn.classList.add("run"); }); });
        var autoT = setTimeout(function () { btn.classList.remove("auto-board", "run"); btn.click(); }, 5000);
        timers.push(autoT);
        root.addEventListener("pointerdown", function stop(e) {
          if (e.target.closest("#boardBtn")) return;
          clearTimeout(autoT);
          btn.classList.remove("auto-board", "run");
          btn.querySelector("span").textContent = "Board";
          root.removeEventListener("pointerdown", stop);
        });
      }

      root.querySelector("#boardBtn").onclick = function () {
        if (!checkGate()) return;
        var ap = root.querySelector("#apMode").checked;
        boarded = true;
        this.disabled = true;
        this.querySelector("span").textContent = "Boarding closed";
        if (SF.audio && SF.audio.unlock) SF.audio.unlock();
        if (ap) SF.ui.enterFullscreen();
        var reduce = ui.reducedMotion(), wait = flipped && !reduce ? 650 : 0;
        if (flipped) turn(false);
        timers.push(setTimeout(function () { pass.classList.add("stamped"); }, wait));
        timers.push(setTimeout(function () { pass.classList.add("torn"); }, wait + (reduce ? 0 : 450)));
        timers.push(setTimeout(function () { takeoff(ap); }, wait + (reduce ? 200 : 1300)));
      };
      SF.scenes.preload();

      // The takeoff scene plays over the gate; the flight starts as it hands over to the map.
      function takeoff(ap) {
        var scened = SF.scenes.enabled();
        function go() {
          SF.store.update(function (st) {
            var f = st.activeFlight;
            f.airplaneMode = ap;
            // the scene already showed pushback and takeoff, so the cabin does not announce them again
            if (scened) { f.milestones = f.milestones || {}; f.milestones.pushback = 1; f.milestones.takeoff = 1; }
          }, true);
          if (ap) document.body.classList.add("airplane");
          SF.engine.start();
          ui.go("flight");
        }
        if (scened) SF.scenes.play("takeoff", { flight: af, reveal: go });
        else go();
      }
    },
    unmount: function () {
      (this._timers || []).forEach(function (t) { clearTimeout(t); clearInterval(t); });
      if (this._untilt) this._untilt();
      this._untilt = null;
    }
  };
})();

/* In-flight view: cockpit layout. Large map on the left, glass instrument strip on the right. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;
  var SEGMENTS = 40;
  var PHASES = [["Pushback", "PUSH"], ["Taxi", "TAXI"], ["Takeoff", "T/O"], ["Climb", "CLB"], ["Cruise", "CRZ"], ["Descent", "DES"], ["Approach", "APP"], ["Landing", "LDG"]];
  var ALT_STEP = 500, ALT_PX = 1.15;   // rem per 500 ft on the tape
  var HDG_STEP = 5, HDG_PX = .62;      // rem per 5 degrees on the heading tape

  function altTape() {
    var h = "";
    for (var ft = 44000; ft >= -2000; ft -= ALT_STEP) {
      var major = ft % 1000 === 0;
      h += '<div class="tk' + (major ? " major" : "") + '">' + (major && ft >= 0 ? "<span>" + (ft / 100 | 0) + "</span>" : "") + "</div>";
    }
    return h;
  }
  function hdgTape() {
    var names = { 0: "N", 90: "E", 180: "S", 270: "W" }, h = "";
    for (var d = -180; d <= 540; d += HDG_STEP) {
      var n = ((d % 360) + 360) % 360, major = n % 30 === 0;
      h += '<div class="tk' + (major ? " major" : "") + '">' + (major ? "<span>" + (names[n] || String(n / 10).padStart(2, "0")) + "</span>" : "") + "</div>";
    }
    return h;
  }

  SF.views.flight = {
    stage: true,
    mount: function (root) {
      var af = SF.store.state.activeFlight;
      if (!af) { ui.go("book"); return; }
      if (!af.started) { ui.go("board"); return; }
      var self = this, offs = [];
      var settings = SF.store.state.settings;
      var A = SF.airport(af.from), B = SF.airport(af.to);
      var mapObj = null;
      var mode = settings.mapMode || "classic";
      var camera = settings.camera || "follow";

      document.body.setAttribute("data-backdrop", "dark");
      ui.topbar(
        '<div class="glass ft-chip"><span class="tag-dot" style="--tag:' + af.tagColor + '">' + SF.icon(af.tagIcon) + "</span>" +
        '<div><b class="mono">' + af.flightNo + "  " + af.from + " → " + af.to + "</b><small>" + (af.task ? SF.esc(af.task) : SF.esc(af.tagName)) + "</small></div></div>" +
        (SF.dev ? '<div class="glass dev-row"><b>DEV</b><button data-jump="0.49">49%</button><button data-jump="0.84">84%</button><button data-jump="0.97">97%</button><button id="devAway">AWAY 5S</button></div>' : ""),
        '<div class="glass ft-tools" role="toolbar" aria-label="Map controls">' +
        '<span class="map-note" id="mapBadge" hidden></span>' +
        '<div class="seg" id="mapModes" role="group" aria-label="Map mode">' + SF.maps.MODES.map(function (m) {
          return '<button class="seg-btn" data-mode="' + m.id + '" aria-pressed="false" title="' + m.label + ' (M)">' + SF.icon(m.icon) + "<span>" + m.label + "</span></button>";
        }).join("") + "</div>" +
        '<button class="btn icon-only" id="camBtn" aria-label="Camera"></button>' +
        '<button class="btn icon-only" id="winBtn" title="Window view (W)" aria-label="Window view">' + SF.icon("window") + "</button>" +
        '<button class="btn icon-only" id="apBtn" title="Airplane mode (F)" aria-label="Airplane mode" aria-pressed="false">' + SF.icon("expand") + "</button>" +
        "</div>");

      root.innerHTML =
        '<div class="stage" id="flightMap"></div>' +
        '<div class="flight">' +
        '<aside class="glass strip" id="strip" aria-label="Flight instruments">' +
        '<header class="strip-head"><span class="label">' + SF.esc(af.fromCity) + " to " + SF.esc(af.toCity) + '</span><span class="form-no">FMS SF-07</span></header>' +

        '<section class="inst inst-time">' +
        '<div class="inst-label"><span class="label">Time to destination</span><span class="lamp" id="holdLamp">HOLD</span></div>' +
        '<div class="well time-well"><span class="readout readout-xl" id="remain" role="timer" aria-live="off">--:--</span></div>' +
        '<div class="annun well" id="annun" aria-label="Flight phase">' + PHASES.map(function (p) { return '<span data-p="' + p[0] + '">' + p[1] + "</span>"; }).join("") + "</div>" +
        '<div class="segbar well" id="segBar" aria-hidden="true">' + new Array(SEGMENTS + 1).join("<i></i>") + "</div>" +
        '<div class="prog-row readout"><span>' + af.from + '</span><b id="pct">0%</b><span>' + af.to + "</span></div>" +
        "</section>" +

        '<section class="inst inst-gauges">' +
        '<div class="gauge alt"><span class="label">ALT</span><div class="well tape-v"><div class="tape" id="altTape">' + altTape() + '</div><div class="readout" id="alt">0</div></div><small class="unit readout">FT</small></div>' +
        '<div class="gauge-col">' +
        '<div class="gauge-pair">' +
        '<div class="gauge"><span class="label">GS · KT</span><div class="well box"><b class="readout readout-lg" id="gs">0</b></div></div>' +
        '<div class="gauge"><span class="label">VS · FT/MIN</span><div class="well box"><b class="readout readout-lg" id="vs">0</b></div></div>' +
        "</div>" +
        '<div class="gauge hdg"><div class="inst-label"><span class="label">HDG</span><b class="readout readout-sm" id="hdg">000°</b></div><div class="well tape-h"><div class="tape" id="hdgTape">' + hdgTape() + '</div><span class="caret" aria-hidden="true"></span></div></div>' +
        "</div></section>" +

        '<section class="inst-table">' +
        '<div><span class="label">Flown</span><b class="readout readout-md" id="flown">0</b></div>' +
        '<div><span class="label">Remain</span><b class="readout readout-md" id="remKm">0</b></div>' +
        '<div><span class="label">ETA local</span><b class="readout readout-md" id="eta">--</b></div>' +
        '<div><span class="label">ETA ' + af.to + '</span><b class="readout readout-md" id="etaLocal">--</b></div>' +
        "</section>" +

        '<footer class="strip-ctrl">' +
        '<button class="btn" id="holdBtn">' + SF.icon("pause") + '<span id="holdTxt">Hold</span><small id="holdsLeft"></small></button>' +
        '<button class="btn btn-text danger" id="divertBtn">' + SF.icon("alert") + "<span>Divert</span></button>" +
        "</footer></aside>" +
        "</div>";

      var $ = function (id) { return document.getElementById(id); };
      var segs = Array.prototype.slice.call(root.querySelectorAll("#segBar i"));

      /* ---------- map ---------- */
      // Free map area: right of the rail, below the top bar, left of the instrument cluster.
      function insets() {
        var gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 24;
        var strip = $("strip"), bar = document.getElementById("topbar"), nav = document.getElementById("nav");
        var W = window.innerWidth;
        return {
          left: (document.body.classList.contains("airplane") ? 0 : nav.getBoundingClientRect().right) + gut,
          top: bar.getBoundingClientRect().bottom + gut,
          right: strip ? W - strip.getBoundingClientRect().left + gut : gut,
          bottom: gut
        };
      }
      function buildMap() {
        if (mapObj) mapObj.api.destroy();
        var host = $("flightMap");
        host.innerHTML = "";
        mapObj = SF.maps.create(host, mode, { camera: camera, planeSize: 34, label: "Live flight map, " + A.city + " to " + B.city, insets: insets, onMode: showBadge });
        mapObj.api.setRoute(A, B);
        var st = SF.flight.status(SF.store.state.activeFlight);
        mapObj.api.setProgress(st.routeFrac, st.hold ? { hold: st.hold } : null);
        mapObj.api.setCamera(camera, true);
        ui.$$("#mapModes .seg-btn").forEach(function (b) {
          var on = b.getAttribute("data-mode") === mode;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on);
        });
        showBadge(mapObj.mode);
      }
      // The built-in map stands in while a library loads, and stays when one cannot load.
      function showBadge(actual) {
        var badge = $("mapBadge");
        if (!badge) return;
        badge.hidden = actual === mode;
        badge.textContent = "BUILT-IN" + (SF.forceOffline ? " · OFFLINE" : "");
      }
      function setMode(m) {
        mode = m;
        SF.store.update(function (s) { s.settings.mapMode = m; });
        buildMap();
      }
      function cycleMode() {
        var ids = SF.maps.MODES.map(function (m) { return m.id; });
        setMode(ids[(ids.indexOf(mode) + 1) % ids.length]);
      }
      function setCamera(c) {
        camera = c;
        SF.store.update(function (s) { s.settings.camera = c; });
        if (mapObj) mapObj.api.setCamera(c);
        var cb = $("camBtn");
        cb.innerHTML = SF.icon(c === "follow" ? "crosshair" : "route");
        cb.title = (c === "follow" ? "Camera: follow" : "Camera: route") + " (C)";
        cb.setAttribute("aria-label", cb.title);
      }
      $("mapModes").onclick = function (e) { var b = e.target.closest("[data-mode]"); if (b) setMode(b.getAttribute("data-mode")); };
      $("camBtn").onclick = function () { setCamera(camera === "follow" ? "route" : "follow"); };
      $("winBtn").onclick = function () { ui.toast("Window view not installed yet.", "window"); };

      /* ---------- airplane mode ---------- */
      function syncAp() {
        var on = document.body.classList.contains("airplane");
        $("apBtn").setAttribute("aria-pressed", on);
        $("apBtn").classList.toggle("on", on);
      }
      function toggleAp() {
        SF.engine.setAirplaneMode(!document.body.classList.contains("airplane"));
        syncAp();
      }
      $("apBtn").onclick = toggleAp;
      function onFs() {
        if (!document.fullscreenElement && document.body.classList.contains("airplane")) {
          document.body.classList.remove("airplane");
          syncAp();
        }
      }
      document.addEventListener("fullscreenchange", onFs);
      offs.push(function () { document.removeEventListener("fullscreenchange", onFs); });

      /* ---------- hold & divert ---------- */
      $("holdBtn").onclick = function () { SF.engine.hold(); };
      $("divertBtn").onclick = function () {
        var cur = SF.store.state.activeFlight;
        if (!cur) return;
        ui.confirm("Divert flight " + cur.flightNo, "Return to <b>" + SF.esc(cur.fromCity) + "</b>. The flight is logged as diverted with the distance flown so far. No stamp is issued.", "Divert", true)
          .then(function (ok) { if (ok && SF.store.state.activeFlight) SF.engine.divert("manual"); });
      };

      /* ---------- instruments ---------- */
      var lastPhase = null, lastLong = null, lastAlt = null, lastT = 0, vs = 0;
      function render(st) {
        var cur = SF.store.state.activeFlight;
        if (!cur) return;
        $("remain").textContent = SF.fmt.clock(st.remainingMs);
        var long = st.remainingMs >= 3600000;
        if (long !== lastLong) {
          lastLong = long;
          root.querySelector(".time-well").classList.toggle("long", long);
        }
        $("pct").textContent = Math.floor(st.progress * 100) + "%";
        var lit = Math.floor(st.progress * SEGMENTS);
        segs.forEach(function (s, i) { s.className = i < lit ? "on" : i === lit && st.progress < 1 ? "now" : ""; });
        var phase = st.paused ? lastPhase : st.phase;
        if (!st.paused) lastPhase = st.phase;
        ui.$$("#annun span", root).forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-p") === phase); });
        $("holdLamp").classList.toggle("on", st.paused);
        // altitude tape: 0 ft sits at index (44000 / 500); centre the current altitude
        var altIdx = (44000 - st.altitudeFt) / ALT_STEP;
        $("altTape").style.transform = "translateY(" + (-altIdx * ALT_PX) + "rem)";
        $("alt").textContent = String(Math.round(st.altitudeFt / 10) * 10).padStart(5, " ");
        $("gs").textContent = String(st.groundSpeedKt).padStart(3, " ");
        // Vertical speed from the altitude change, smoothed and rounded like a real VSI.
        var nowT = Date.now();
        if (lastAlt !== null && nowT > lastT) {
          var mins = (nowT - lastT) / 60000 * (cur.timeScale || 1);
          var raw = st.paused || st.phase === "Cruise" ? 0 : (st.altitudeFt - lastAlt) / mins;
          if (Math.abs(raw) < 120) raw = 0;
          vs = vs * .7 + raw * .3;
        }
        lastAlt = st.altitudeFt; lastT = nowT;
        var vsr = Math.round(vs / 100) * 100;
        $("vs").textContent = vsr === 0 ? "0" : (vsr > 0 ? "+" : "−") + Math.abs(vsr).toLocaleString();
        var hdg = Math.round(st.heading) % 360;
        $("hdgTape").style.transform = "translateX(" + (-(hdg + 180) / HDG_STEP * HDG_PX) + "rem)";
        $("hdg").textContent = String(hdg).padStart(3, "0") + "°";
        $("flown").textContent = SF.fmt.dist(st.flownKm);
        $("remKm").textContent = SF.fmt.dist(st.remainingKm);
        $("eta").textContent = SF.fmt.time(st.eta);
        $("etaLocal").textContent = SF.fmt.localTime(B.tz, st.eta);
        var used = cur.holds, max = SF.flight.MAX_HOLDS;
        $("holdTxt").textContent = st.paused ? "Resume" : "Hold";
        $("holdsLeft").textContent = st.paused ? "HOLD " + used + " OF " + max + " · " + SF.fmt.clock(st.holdLeftMs) : used + " OF " + max + " USED";
        $("holdBtn").querySelector(".icon").outerHTML = SF.icon(st.paused ? "play" : "pause");
        $("holdBtn").classList.toggle("btn-signal", st.paused);
        $("holdBtn").disabled = !st.paused && used >= max;
        root.querySelector(".strip").classList.toggle("is-holding", st.paused);
        if (mapObj) mapObj.api.setProgress(st.routeFrac, st.hold ? { hold: st.hold } : null);
      }
      offs.push(SF.engine.on("tick", render));
      offs.push(SF.engine.on("hold", function () { render(SF.flight.status(SF.store.state.activeFlight)); }));

      /* ---------- keys ---------- */
      offs.push(ui.onKey(function (e) {
        var k = e.key.toLowerCase();
        if (e.key === " ") { SF.engine.hold(); return true; }
        if (k === "m") { cycleMode(); return true; }
        if (k === "c") { setCamera(camera === "follow" ? "route" : "follow"); return true; }
        if (k === "w") { $("winBtn").click(); return true; }
        if (k === "f") { toggleAp(); return true; }
        if (e.key === "Escape" && document.body.classList.contains("airplane")) { toggleAp(); return true; }
        return false;
      }));

      /* ---------- dev helpers ---------- */
      if (SF.dev) {
        ui.$$("[data-jump]").forEach(function (b) {
          b.onclick = function () {
            SF.store.update(function (s) {
              var f = s.activeFlight, now = Date.now();
              var want = +b.getAttribute("data-jump") * f.plannedMin * 60000;
              f.startAt -= (want - SF.flight.elapsedMs(f, now)) / f.timeScale;
            }, true);
            SF.engine.tick();
          };
        });
        $("devAway").onclick = function () {
          // Simulate a 5 s absence through the same path as a real visibility change.
          SF.store.update(function (s) { s.activeFlight.awayStart = Date.now() - 5000; }, true);
          Object.defineProperty(document, "hidden", { configurable: true, get: function () { return false; } });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
        };
      }

      buildMap();
      setCamera(camera);
      syncAp();
      render(SF.flight.status(af));
      self._cleanup = function () {
        offs.forEach(function (o) { o(); });
        if (mapObj) mapObj.api.destroy();
        document.body.removeAttribute("data-backdrop");
      };
    },
    unmount: function () { if (this._cleanup) this._cleanup(); this._cleanup = null; }
  };
})();

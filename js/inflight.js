/* In-flight focus view: countdown, readouts, live map, holds, divert, airplane mode. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  SF.views.flight = {
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

      root.innerHTML =
        '<div class="flight">' +
        '<div class="flight-map" id="flightMap"></div>' +
        '<div class="flight-shade" aria-hidden="true"></div>' +
        '<header class="flight-top">' +
        '<div class="ft-route panel glass"><span class="tag-dot" style="--tag:' + af.tagColor + '">' + SF.icon(af.tagIcon) + "</span>" +
        '<div><b class="mono">' + af.flightNo + " · " + af.from + " → " + af.to + "</b><small>" + (af.task ? SF.esc(af.task) : SF.esc(af.tagName) + " session") + "</small></div></div>" +
        '<div class="ft-tools panel glass" role="toolbar" aria-label="Flight view controls">' +
        '<div class="seg" id="mapModes" role="group" aria-label="Map mode">' + SF.maps.MODES.map(function (m) {
          return '<button class="seg-btn" data-mode="' + m.id + '" aria-pressed="false" title="' + m.label + ' (M)">' + SF.icon(m.icon) + "<span>" + m.label + "</span></button>";
        }).join("") + "</div>" +
        '<button class="icon-btn" id="camBtn" title="Camera (C)" aria-label="Toggle camera"></button>' +
        '<button class="icon-btn" id="winBtn" title="Window view (W)" aria-label="Window view">' + SF.icon("window") + "</button>" +
        '<button class="icon-btn" id="apBtn" title="Airplane mode (F)" aria-label="Airplane mode" aria-pressed="false">' + SF.icon("expand") + "</button>" +
        "</div></header>" +
        '<span class="map-badge" id="mapBadge" hidden></span>' +
        '<section class="flight-hud panel glass" aria-label="Flight progress">' +
        '<p class="eyebrow" id="phase">Pushback</p>' +
        '<div class="hud-time mono" id="remain" role="timer" aria-live="off">--:--</div>' +
        '<div class="hud-sub"><span class="mono" id="pct">0%</span><span class="muted">complete</span><span class="hold-tag" id="holdTag" hidden>' + SF.icon("pause") + '<span id="holdLeft"></span></span></div>' +
        '<div class="track" aria-hidden="true"><span class="track-end">' + af.from + '</span><div class="track-line"><div class="track-fill" id="trackFill"></div><span class="track-plane" id="trackPlane">' + SF.icon("plane", "rot90") + '</span></div><span class="track-end">' + af.to + "</span></div>" +
        '<div class="hud-actions"><button class="btn btn-ghost" id="holdBtn">' + SF.icon("pause") + '<span>Hold</span><small id="holdsLeft"></small></button>' +
        '<button class="btn btn-ghost danger-text" id="divertBtn">' + SF.icon("alert") + "<span>Divert</span></button></div>" +
        "</section>" +
        '<section class="flight-readouts panel glass mono" aria-label="Flight data">' +
        '<div><small>Flown</small><b id="flown">0</b></div>' +
        '<div><small>Remaining</small><b id="remKm">0</b></div>' +
        '<div><small>ETA</small><b id="eta">--</b><small id="etaLocal" class="muted"></small></div>' +
        '<div><small>Altitude</small><b id="alt">0</b><small class="muted">ft</small></div>' +
        '<div><small>Ground speed</small><b id="gs">0</b><small class="muted">kt</small></div>' +
        '<div><small>Heading</small><b id="hdg">000°</b></div>' +
        "</section>" +
        (SF.dev ? '<div class="dev-panel panel glass"><b>' + SF.icon("flask") + 'Dev</b><button data-jump="0.49">49%</button><button data-jump="0.84">84%</button><button data-jump="0.97">97%</button><button id="devAway">Fake 5s away</button></div>' : "") +
        "</div>";

      var $ = function (id) { return root.querySelector("#" + id); };

      /* ---------- map ---------- */
      function buildMap() {
        if (mapObj) mapObj.api.destroy();
        var host = $("flightMap");
        host.innerHTML = "";
        mapObj = SF.maps.create(host, mode, { camera: camera, planeSize: 34, label: "Live flight map, " + A.city + " to " + B.city });
        mapObj.api.setRoute(A, B);
        var st = SF.flight.status(SF.store.state.activeFlight);
        mapObj.api.setProgress(st.routeFrac);
        mapObj.api.setCamera(camera, true);
        ui.$$("#mapModes .seg-btn", root).forEach(function (b) {
          var on = b.getAttribute("data-mode") === mode;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on);
        });
        var badge = $("mapBadge");
        badge.hidden = mapObj.mode === mode;
        badge.innerHTML = SF.icon("map") + "Built-in atlas" + (SF.forceOffline ? " (offline mode)" : "");
      }
      function setMode(m) {
        mode = m;
        SF.store.update(function (s) { s.settings.mapMode = m; });
        buildMap();
      }
      function cycleMode() {
        var ids = SF.maps.MODES.map(function (m) { return m.id; });
        setMode(ids[(ids.indexOf(mode) + 1) % ids.length]);
        ui.toast((SF.maps.MODES.filter(function (x) { return x.id === mode; })[0] || {}).label + " view", "map", 1500);
      }
      function setCamera(c) {
        camera = c;
        SF.store.update(function (s) { s.settings.camera = c; });
        if (mapObj) mapObj.api.setCamera(c);
        var cb = $("camBtn");
        cb.innerHTML = SF.icon(c === "follow" ? "crosshair" : "route");
        cb.title = (c === "follow" ? "Following the plane" : "Showing whole route") + " (C)";
        cb.setAttribute("aria-label", cb.title);
      }
      $("mapModes").onclick = function (e) { var b = e.target.closest("[data-mode]"); if (b) setMode(b.getAttribute("data-mode")); };
      $("camBtn").onclick = function () { setCamera(camera === "follow" ? "route" : "follow"); };
      $("winBtn").onclick = function () { ui.toast("The window view arrives in the next milestone.", "window"); };

      /* ---------- airplane mode ---------- */
      function syncAp() {
        var on = document.body.classList.contains("airplane");
        $("apBtn").setAttribute("aria-pressed", on);
        $("apBtn").classList.toggle("on", on);
      }
      function toggleAp() {
        var on = !document.body.classList.contains("airplane");
        SF.engine.setAirplaneMode(on);
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
      $("divertBtn").onclick = function () { divert(); };
      function divert() {
        var cur = SF.store.state.activeFlight;
        if (!cur) return;
        ui.confirm("Divert this flight?", "You'll turn back to <b>" + SF.esc(cur.fromCity) + "</b>. The flight is logged as diverted with the miles flown so far, and no passport stamp is awarded.", "Divert flight", true)
          .then(function (ok) { if (ok && SF.store.state.activeFlight) SF.engine.divert("manual"); });
      }

      /* ---------- readouts ---------- */
      function render(st) {
        var cur = SF.store.state.activeFlight;
        if (!cur) return;
        $("remain").textContent = SF.fmt.clock(st.remainingMs);
        $("pct").textContent = Math.floor(st.progress * 100) + "%";
        $("phase").textContent = st.phase;
        $("trackFill").style.width = (st.progress * 100) + "%";
        $("trackPlane").style.left = (st.progress * 100) + "%";
        $("flown").textContent = SF.fmt.dist(st.flownKm);
        $("remKm").textContent = SF.fmt.dist(st.remainingKm);
        $("eta").textContent = SF.fmt.time(st.eta);
        $("etaLocal").textContent = SF.fmt.localTime(B.tz, st.eta) + " in " + B.city;
        $("alt").textContent = st.altitudeFt.toLocaleString();
        $("gs").textContent = st.groundSpeedKt;
        $("hdg").textContent = String(Math.round(st.heading) % 360).padStart(3, "0") + "°";
        var left = SF.flight.MAX_HOLDS - cur.holds;
        $("holdsLeft").textContent = st.paused ? "" : left + " left";
        $("holdBtn").querySelector("span").textContent = st.paused ? "Resume" : "Hold";
        $("holdBtn").querySelector(".icon").outerHTML = SF.icon(st.paused ? "play" : "pause");
        $("holdBtn").disabled = !st.paused && left <= 0;
        $("holdTag").hidden = !st.paused;
        if (st.paused) $("holdLeft").textContent = "Holding · " + SF.fmt.clock(st.holdLeftMs) + " max";
        root.querySelector(".flight").classList.toggle("is-holding", st.paused);
        if (mapObj) mapObj.api.setProgress(st.routeFrac);
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
        ui.$$("[data-jump]", root).forEach(function (b) {
          b.onclick = function () {
            SF.store.update(function (s) {
              var f = s.activeFlight, now = Date.now();
              var want = +b.getAttribute("data-jump") * f.plannedMin * 60000;
              var have = SF.flight.elapsedMs(f, now);
              f.startAt -= (want - have) / f.timeScale;
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
      };
    },
    unmount: function () { if (this._cleanup) this._cleanup(); this._cleanup = null; }
  };
})();

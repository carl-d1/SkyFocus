/* Map manager: one interface over every map provider.
   The built-in atlas renders instantly; the real provider (Leaflet or the three.js globe) is loaded
   from the CDN in the background and swapped in when ready. If a library or its tiles fail, the
   built-in map stays, so a map is always shown. */
(function () {
  var SF = (window.SF = window.SF || {});

  /* ---------- libraries: pinned, loaded on demand from vendor/ (offline), the CDN as a backup ---------- */
  var CDNJS = "https://cdnjs.cloudflare.com/ajax/libs/", JSDELIVR = "https://cdn.jsdelivr.net/npm/";
  var LIBS = {
    leaflet: {
      css: ["vendor/leaflet/1.9.4/leaflet.min.css", CDNJS + "leaflet/1.9.4/leaflet.min.css"],
      js: ["vendor/leaflet/1.9.4/leaflet.min.js", CDNJS + "leaflet/1.9.4/leaflet.min.js"],
      tiles: true,   // useless without map tiles, so ?offline=1 skips it
      ready: function () { return !!window.L; }
    },
    chart: {
      js: ["vendor/chart.js/4.4.1/chart.umd.min.js", CDNJS + "Chart.js/4.4.1/chart.umd.min.js"],
      ready: function () { return !!window.Chart; }
    },
    three: {
      js: ["vendor/three/0.149.0/three.min.js", JSDELIVR + "three@0.149.0/build/three.min.js"],
      ready: function () { return !!window.THREE; }
    }
  };
  function remote(u) { return /^https?:/.test(u); }
  // Load one script from the first source that works.
  function script(srcs, ready) {
    return srcs.reduce(function (chain, src) {
      return chain.catch(function () {
        if (ready()) return;
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = src; s.async = true;
          if (remote(src)) s.crossOrigin = "anonymous";
          var t = setTimeout(function () { s.remove(); reject(new Error("timed out")); }, 10000);
          s.onload = function () { clearTimeout(t); ready() ? resolve() : reject(new Error("did not initialise")); };
          s.onerror = function () { clearTimeout(t); s.remove(); reject(new Error("failed to load")); };
          document.head.appendChild(s);
        });
      });
    }, Promise.reject(new Error("start")));
  }
  var pending = {}, webgl = null;
  SF.lib = {
    // WebGL support, checked once; the probe context is released at once
    webgl: function () {
      if (webgl === null) {
        try {
          var c = document.createElement("canvas"), gl = window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"));
          webgl = !!gl;
          var lose = gl && gl.getExtension("WEBGL_lose_context");
          if (lose) lose.loseContext();
        } catch (e) { webgl = false; }
      }
      return webgl;
    },
    ready: function (name) { return !(SF.forceOffline && LIBS[name].tiles) && LIBS[name].ready(); },
    load: function (name) {
      var lib = LIBS[name];
      if (SF.forceOffline && lib.tiles) return Promise.reject(new Error("offline mode"));
      if (lib.ready()) return Promise.resolve();
      if (pending[name]) return pending[name];
      var srcs = SF.forceOffline ? lib.js.filter(function (u) { return !remote(u); }) : lib.js;
      if (lib.css) {
        // the stylesheet: local first, the CDN copy only if the local one fails
        var l = document.createElement("link");
        l.rel = "stylesheet"; l.href = lib.css[0];
        l.onerror = function () { if (lib.css[1]) { l.onerror = null; l.crossOrigin = "anonymous"; l.href = lib.css[1]; } };
        document.head.appendChild(l);
      }
      pending[name] = script(srcs, lib.ready).catch(function (e) { throw new Error(name + " " + e.message); });
      pending[name].catch(function () { pending[name] = null; });
      return pending[name];
    }
  };

  /* ---------- providers ---------- */
  var providers = {
    atlas: { lib: null, create: function (el, opts) { return SF.FallbackMap(el, opts); } },
    "atlas-globe": { lib: null, create: function (el, opts) { return SF.FallbackGlobe(el, opts); } }
  };
  var MODES = [
    { id: "classic", label: "Classic", icon: "map" },
    { id: "satellite", label: "Satellite", icon: "frame" },
    { id: "globe", label: "3D Globe", icon: "globe" }
  ];
  function backupFor(mode) { return mode === "globe" ? "atlas-globe" : "atlas"; }

  SF.maps = {
    MODES: MODES,
    register: function (id, lib, factory) { providers[id] = { lib: lib, create: factory }; },

    // Returns { api, mode }. `mode` is what is on screen now; opts.onMode(mode) reports swaps.
    create: function (el, wanted, opts) {
      opts = opts || {};
      var state = { route: null, ro: null, frac: 0, extra: null, camera: opts.camera || "route", markers: null, routes: null, track: null };
      var cur = null, destroyed = false, offline = false;
      var wrap = { mode: null, api: null };
      var TILED = { classic: 1, satellite: 1 };
      // a small note on the map while tiles cannot load and the built-in map stands in
      function offlineNote() {
        var n = el.querySelector(".map-offline");
        var show = TILED[wanted] && wrap.mode !== wanted && (offline || SF.forceOffline);
        if (show && !n) el.insertAdjacentHTML("beforeend", '<span class="map-offline" role="status"><i></i>Offline · built-in map</span>');
        else if (!show && n) n.remove();
      }
      function online() { if (offline && !destroyed) { offline = false; if (SF.lib.ready("leaflet")) build(wanted); } }
      window.addEventListener("online", online);

      function build(id) {
        el.innerHTML = "";
        var o = Object.assign({}, opts, {
          camera: state.camera,
          // a provider reports that it cannot work here (no tiles, no WebGL)
          fail: function (why) {
            if (destroyed || wrap.mode !== id) return;
            console.info("Map: using built-in map (" + why + ")");
            if (/tiles/.test(why)) offline = true;
            build(backupFor(wanted));
          }
        });
        var made;
        try { made = providers[id].create(el, o); }
        catch (e) {
          if (id === backupFor(wanted)) throw e;
          console.info("Map: using built-in map (" + e.message + ")");
          return build(backupFor(wanted));
        }
        if (cur && cur.destroy) try { cur.destroy(); } catch (e) { /* already gone */ }
        cur = made;
        wrap.mode = id;
        // replay state into the new provider
        if (state.markers && !state.route) cur.setMarkers(state.markers);
        if (state.route) { cur.setRoute(state.route[0], state.route[1]); cur.setProgress(state.frac, state.extra); }
        if (state.routes && cur.setRoutes) cur.setRoutes(state.routes);
        if (state.track && cur.setTrack) cur.setTrack(state.track);
        cur.setCamera(state.camera, true);
        offlineNote();
        if (opts.onMode) opts.onMode(id);
      }

      var p = providers[wanted];
      if (!p || SF.forceOffline) build(backupFor(wanted));
      else if (!p.lib || SF.lib.ready(p.lib)) build(wanted);
      else {
        build(backupFor(wanted));
        SF.lib.load(p.lib).then(function () { if (!destroyed) build(wanted); },
          function (e) { console.info("Map: using built-in map (" + e.message + ")"); });
      }

      // Bank angle from the rate of turn: a standard-rate turn (3 deg/s) is about 25 degrees of bank.
      // Mostly visible in the holding pattern; along the great circle it stays near level.
      var bankS = SF.motion.spring({ stiffness: 24, damping: 9, onUpdate: function (v) { if (cur && cur.setBank) cur.setBank(v); } });
      var lastHdg = null, lastT = 0;
      function trackBank() {
        if (!state.route || !cur || !cur.setBank) return;
        var a = state.route[0], b = state.route[1], h = state.extra && state.extra.hold, hdg;
        if (h) {
          var fix = SF.geo.interpolate(a, b, state.frac);
          hdg = SF.geo.bearing(SF.geo.holdPos(fix, h.heading, h.sizeKm, h.phase), SF.geo.holdPos(fix, h.heading, h.sizeKm, h.phase + .004));
        } else {
          var f = Math.min(state.frac, .995);
          hdg = SF.geo.bearing(SF.geo.interpolate(a, b, f), SF.geo.interpolate(a, b, f + .004));
        }
        var now = performance.now();
        if (lastHdg != null && now - lastT > 50) {
          var dh = ((hdg - lastHdg + 540) % 360) - 180, rate = dh / ((now - lastT) / 1000);
          bankS.set(Math.max(-25, Math.min(25, rate * 8)));
        }
        if (lastHdg == null || now - lastT > 50) { lastHdg = hdg; lastT = now; }
      }

      wrap.api = {
        setRoute: function (a, b, ro) { state.route = [a, b]; state.frac = 0; state.extra = null; cur.setRoute(a, b, ro); },
        clearRoute: function () { state.route = null; cur.clearRoute(); },
        setProgress: function (frac, extra) { state.frac = frac; state.extra = extra || null; cur.setProgress(frac, extra); trackBank(); },
        setCamera: function (c, instant) { state.camera = c; cur.setCamera(c, instant); },
        setMarkers: function (list) { state.markers = list; cur.setMarkers(list); },
        setRoutes: function (list) { state.routes = list; if (cur.setRoutes) cur.setRoutes(list); },
        setTrack: function (pts) { state.track = pts; if (cur.setTrack) cur.setTrack(pts); },
        setPreview: function (p) { if (cur.setPreview) cur.setPreview(p); },
        replay: function (pts, ms) { if (cur.replay) cur.replay(pts, ms); },
        resize: function () { if (cur.resize) cur.resize(); },
        destroy: function () { destroyed = true; window.removeEventListener("online", online); bankS.stop(); if (cur && cur.destroy) cur.destroy(); }
      };
      return wrap;
    }
  };
})();

/* Leaflet map provider. Classic uses Esri's keyless canvas basemaps (dark for the cockpit theme,
   light for the paper theme); Satellite (map-satellite.js) reuses this with imagery. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  var PLANE = "M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z";

  function layersFor(style) {
    var L = window.L, light = document.documentElement.getAttribute("data-theme") === "light";
    if (style === "satellite") {
      return [
        L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }),
        L.tileLayer(ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, opacity: .8 })
      ];
    }
    var base = light ? "Canvas/World_Light_Gray_Base" : "Canvas/World_Dark_Gray_Base";
    var ref = light ? "Canvas/World_Light_Gray_Reference" : "Canvas/World_Dark_Gray_Reference";
    return [
      L.tileLayer(ESRI + base + "/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap contributors" }),
      L.tileLayer(ESRI + ref + "/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 })
    ];
  }

  function create(container, opts, style) {
    var L = window.L;
    if (!L) throw new Error("Leaflet missing");
    var host = document.createElement("div");
    host.className = "leaflet-host map-" + style;
    container.appendChild(host);
    var map = L.map(host, { zoomControl: false, attributionControl: true, worldCopyJump: false, zoomSnap: .25, inertia: true, minZoom: 1.5 });
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition("bottomleft");
    map.setView([0, 0], 2);
    var tiles = layersFor(style), loads = 0, errors = 0, failed = false;
    tiles.forEach(function (t, i) {
      t.addTo(map);
      if (i === 0) {
        t.on("tileload", function () { loads++; });
        t.on("tileerror", function () {
          errors++;
          if (!failed && loads === 0 && errors > 6) { failed = true; if (opts.fail) opts.fail("tiles unavailable"); }
        });
      }
    });
    var night = L.polygon([], { stroke: false, fillColor: "#000", fillOpacity: style === "satellite" ? .38 : .28, interactive: false }).addTo(map);
    function drawNight() {
      var poly = SF.geo.nightPolygon(new Date());
      night.setLatLngs([-360, 0, 360].map(function (off) { return poly.map(function (p) { return [p[1], p[0] + off]; }); }));
    }
    drawNight();
    var nightTimer = setInterval(drawNight, 60000);

    var remain = L.polyline([], { className: "lf-remain", interactive: false }).addTo(map);
    var flown = L.polyline([], { className: "lf-flown", interactive: false }).addTo(map);
    var holdLine = L.polyline([], { className: "lf-hold", interactive: false }).addTo(map);
    var trackLine = L.polyline([], { className: "lf-track", interactive: false }).addTo(map);
    var routesLayer = L.layerGroup().addTo(map);
    var markerLayer = L.layerGroup().addTo(map);
    var planeIcon = L.divIcon({ className: "lf-plane", iconSize: [36, 36], iconAnchor: [18, 18],
      html: '<svg viewBox="0 0 24 24" width="36" height="36"><path class="shadow" transform="translate(.8 1.2)" d="' + PLANE + '"/><path d="' + PLANE + '"/></svg>' });
    var plane = L.marker([0, 0], { icon: planeIcon, interactive: false, keyboard: false, zIndexOffset: 1000 });

    var route = null, frac = 0, extra = null, camera = opts.camera || "route", destroyed = false, manualUntil = 0, drawRaf = null;
    var lastMarkers = [];
    map.on("dragstart zoomstart", function (e) { if (e.originalEvent || e.type === "dragstart") manualUntil = Date.now() + 15000; });

    function ll(p) { return [p.lat, p.lon]; }
    function near(q, ref) { while (q.lon - ref > 180) q.lon -= 360; while (q.lon - ref < -180) q.lon += 360; return q; }
    function padding() {
      var ins = (opts.insets && opts.insets()) || {}, r = container.getBoundingClientRect(), pad = opts.padPx == null ? 48 : opts.padPx;
      // insets are measured in the viewport; the map container may not start at 0,0
      return {
        tl: [Math.max(0, (ins.left || 0) - r.left) + pad, Math.max(0, (ins.top || 0) - r.top) + pad],
        br: [Math.max(0, (ins.right || 0) - (window.innerWidth - r.right)) + pad, Math.max(0, (ins.bottom || 0) - (window.innerHeight - r.bottom)) + pad]
      };
    }
    function drawMarkers(list) {
      lastMarkers = list || [];
      markerLayer.clearLayers();
      var ref = route ? route.pts[0].lon : null;
      lastMarkers.forEach(function (m) {
        var p = ref == null ? { lat: m.lat, lon: m.lon } : near({ lat: m.lat, lon: m.lon }, ref);
        L.marker(ll(p), { interactive: false, keyboard: false, icon: L.divIcon({ className: "lf-mark " + (m.cls || ""), iconSize: [10, 10], iconAnchor: [5, 5],
          html: '<i></i>' + (m.label ? "<b>" + m.label + "</b>" : "") }) }).addTo(markerLayer);
      });
    }
    function drawRoute(drawT) {
      if (!route) { remain.setLatLngs([]); flown.setLatLngs([]); return; }
      var n = route.pts.length - 1;
      if (drawT != null && drawT < 1) { remain.setLatLngs(route.pts.slice(0, Math.max(2, Math.round(drawT * n) + 1)).map(ll)); flown.setLatLngs([]); return; }
      var idx = Math.round(frac * n), pos = SF.geo.interpolate(route.from, route.to, frac);
      near(pos, route.pts[idx].lon);
      flown.setLatLngs(frac > 0 ? route.pts.slice(0, idx + 1).concat([pos]).map(ll) : []);
      remain.setLatLngs([pos].concat(route.pts.slice(idx)).map(ll));
    }
    function placePlane() {
      if (!route || opts.showPlane === false) { if (map.hasLayer(plane)) map.removeLayer(plane); return null; }
      var idx = Math.round(frac * (route.pts.length - 1)), ref = route.pts[idx].lon;
      var p = near(SF.geo.interpolate(route.from, route.to, frac), ref), ahead, behind, hold = extra && extra.hold;
      if (hold) {
        var fix = p;
        p = near(SF.geo.holdPos(fix, hold.heading, hold.sizeKm, hold.phase), ref);
        ahead = near(SF.geo.holdPos(fix, hold.heading, hold.sizeKm, hold.phase + .004), ref);
        behind = near(SF.geo.holdPos(fix, hold.heading, hold.sizeKm, hold.phase - .004), ref);
        holdLine.setLatLngs(SF.geo.holdLoop(fix, hold.heading, hold.sizeKm, 72).map(function (q) { return ll(near(q, ref)); }));
      } else {
        ahead = near(SF.geo.interpolate(route.from, route.to, Math.min(1, frac + .002)), ref);
        behind = near(SF.geo.interpolate(route.from, route.to, Math.max(0, frac - .002)), ref);
        holdLine.setLatLngs([]);
      }
      // heading on screen (Mercator bends bearings), from projected neighbours
      var a = map.latLngToLayerPoint(ll(behind)), b = map.latLngToLayerPoint(ll(ahead));
      var hdg = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;
      plane.setLatLng(ll(p));
      if (!map.hasLayer(plane)) plane.addTo(map);
      var el = plane.getElement();
      if (el) { var svg = el.querySelector("svg"); if (svg) svg.style.transform = "rotate(" + hdg + "deg)"; }
      return p;
    }
    function fitRoute(animate) {
      if (!route) {
        if (lastMarkers[0]) map.setView([lastMarkers[0].lat, lastMarkers[0].lon], 4, { animate: animate });
        return;
      }
      var pd = padding(), pts = route.pts.map(ll);
      map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: pd.tl, paddingBottomRight: pd.br, animate: animate, duration: .8, maxZoom: 9 });
    }
    function follow(animate) {
      var p = placePlane();
      if (!p) return;
      var pd = padding(), size = map.getSize();
      // centre the plane in the free area, not the container
      var off = L.point((pd.tl[0] - pd.br[0]) / 2, (pd.tl[1] - pd.br[1]) / 2);
      var zoom = Math.max(3, Math.min(7, Math.round(map.getBoundsZoom(L.latLngBounds(route.pts.map(ll))) + 1.5)));
      var target = map.unproject(map.project(ll(p), zoom).subtract(off), zoom);
      if (size.x) map.setView(target, zoom, { animate: animate, duration: .6 });
    }
    function camUpdate(animate) {
      if (Date.now() < manualUntil) return;
      if (camera === "follow") follow(animate); else fitRoute(animate);
    }

    var api = {
      setRoute: function (a, b, ro) {
        ro = ro || {};
        route = { from: a, to: b, pts: SF.geo.arcPoints(a, b, 128) };
        frac = 0; extra = null;
        drawMarkers([{ lat: a.lat, lon: a.lon, label: a.iata, cls: "m-from" }, { lat: b.lat, lon: b.lon, label: b.iata, cls: "m-to" }]);
        if (drawRaf) cancelAnimationFrame(drawRaf);
        var animate = ro.animate && !(SF.ui && SF.ui.reducedMotion());
        manualUntil = 0;
        if (!animate) { drawRoute(); placePlane(); fitRoute(false); return; }
        fitRoute(true);
        host.classList.remove("arrived");
        var t0 = performance.now() + 300;
        (function step(now) {
          if (destroyed) return;
          var k = Math.max(0, Math.min(1, (now - t0) / 900));
          drawRoute(1 - Math.pow(1 - k, 3));
          if (k < 1) drawRaf = requestAnimationFrame(step); else { drawRoute(); host.classList.add("arrived"); }
        })(performance.now());
      },
      clearRoute: function () { route = null; drawRoute(); placePlane(); holdLine.setLatLngs([]); drawMarkers([]); },
      setProgress: function (f, ex) {
        if (!route) return;
        frac = Math.max(0, Math.min(1, f)); extra = ex || null;
        drawRoute(); placePlane();
        if (camera === "follow" && Date.now() >= manualUntil) follow(false);
      },
      setCamera: function (c, instant) { camera = c; manualUntil = 0; camUpdate(!instant); },
      setMarkers: function (list) {
        drawMarkers(list);
        if (route) return;
        if (list && list.length > 1) {
          var pd = padding();
          map.fitBounds(L.latLngBounds(list.map(function (m) { return [m.lat, m.lon]; })), { paddingTopLeft: pd.tl, paddingBottomRight: pd.br, maxZoom: 7, animate: true, duration: .8 });
        } else fitRoute(false);
      },
      setRoutes: function (list) {
        routesLayer.clearLayers();
        list.forEach(function (r) { L.polyline(SF.geo.arcPoints(r.from, r.to, 48).map(ll), { className: "lf-routes " + (r.cls || ""), interactive: false }).addTo(routesLayer); });
      },
      setTrack: function (pts) { trackLine.setLatLngs((pts || []).map(ll)); },
      resize: function () { map.invalidateSize(); camUpdate(false); },
      destroy: function () {
        destroyed = true;
        if (drawRaf) cancelAnimationFrame(drawRaf);
        clearInterval(nightTimer);
        if (ro) ro.disconnect();
        try { map.remove(); } catch (e) { /* container already cleared */ }
        host.remove();
      }
    };
    var ro = window.ResizeObserver ? new ResizeObserver(function () { map.invalidateSize(); }) : null;
    if (ro) ro.observe(host);
    return api;
  }

  SF.leafletProvider = create;
  SF.maps.register("classic", "leaflet", function (el, opts) { return create(el, opts, "classic"); });
})();

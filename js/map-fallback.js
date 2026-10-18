/* Built-in stylised SVG world map (equirectangular). Needs no network, so the app always has a map. */
(function () {
  var SF = (window.SF = window.SF || {});
  var NS = "http://www.w3.org/2000/svg";
  var PLANE = "M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z";
  var landPathCache = null;

  function landPath() {
    if (landPathCache) return landPathCache;
    var d = "";
    (window.WORLD_LAND || []).forEach(function (poly) {
      for (var i = 0; i < poly.length; i++) d += (i ? "L" : "M") + poly[i][0] + " " + (-poly[i][1]);
      d += "Z";
    });
    landPathCache = d;
    return d;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pathFrom(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p.lon.toFixed(3) + " " + (-p.lat).toFixed(3); }).join("");
  }

  SF.FallbackMap = function (container, opts) {
    opts = opts || {};
    var svg = el("svg", { class: "atlas", role: "img", "aria-label": opts.label || "Route map", preserveAspectRatio: "xMidYMid meet" });
    container.appendChild(svg);
    el("rect", { x: -720, y: -100, width: 1440, height: 200, class: "atlas-ocean" }, svg);
    var grat = el("g", { class: "atlas-grat" }, svg);
    var gd = "";
    for (var lon = -540; lon <= 540; lon += 30) gd += "M" + lon + " -90V90";
    for (var lat = -60; lat <= 60; lat += 30) gd += "M-540 " + -lat + "H540";
    el("path", { d: gd, "vector-effect": "non-scaling-stroke" }, grat);
    var land = el("g", { class: "atlas-land" }, svg);
    var lp = landPath();
    [-360, 0, 360].forEach(function (off) {
      el("path", { d: lp, transform: "translate(" + off + " 0)", "vector-effect": "non-scaling-stroke" }, land);
    });
    var night = el("g", { class: "atlas-night" }, svg);
    var routesG = el("g", { class: "atlas-routes" }, svg);
    var remain = el("path", { class: "atlas-remain", "vector-effect": "non-scaling-stroke", fill: "none" }, svg);
    var flown = el("path", { class: "atlas-flown", "vector-effect": "non-scaling-stroke", fill: "none" }, svg);
    var trackPath = el("path", { class: "atlas-track", "vector-effect": "non-scaling-stroke", fill: "none" }, svg);
    var holdPath = el("path", { class: "atlas-hold", "vector-effect": "non-scaling-stroke", fill: "none" }, svg);
    var dots = el("g", { class: "atlas-dots" }, svg);
    var labels = el("g", { class: "atlas-labels" }, svg);
    var planeG = el("g", { class: "atlas-plane" }, svg);
    var planeInner = el("g", {}, planeG);
    el("path", { d: PLANE, class: "atlas-plane-shadow", transform: "translate(1.2 1.6)" }, planeInner);
    el("path", { d: PLANE }, planeInner);
    planeG.style.display = "none";

    var route = null; // {from, to, pts}
    var progress = 0, pos = null, heading = 0;
    var camera = opts.camera || "route";
    var vb = { x: -180, y: -84, w: 360, h: 150 }, target = null;
    var raf = null, destroyed = false, nightTimer = null;
    var markers = [];

    function pxPerUnit() {
      var r = container.getBoundingClientRect();
      // preserveAspectRatio meet: scale is the smaller ratio
      return Math.min(r.width / vb.w, r.height / vb.h) || 1;
    }
    // Free area of the container in px, after panels that sit on top of the map (opts.insets).
    function inner() {
      var r = container.getBoundingClientRect();
      var W = r.width > 10 ? r.width : 800, H = r.height > 10 ? r.height : 450;
      var ins = (opts.insets && opts.insets()) || {};
      var l = ins.left || 0, t = ins.top || 0, rr = ins.right || 0, b = ins.bottom || 0;
      var iw = Math.max(80, W - l - rr), ih = Math.max(80, H - t - b);
      return { W: W, H: H, l: l, t: t, iw: iw, ih: ih };
    }
    // Fit a lon/lat box (y = -lat) into the free area with `pad` px of breathing room.
    function fit(minX, minY, maxX, maxY, pad) {
      var f = inner();
      var bw = Math.max(maxX - minX, 6), bh = Math.max(maxY - minY, 4);
      var s = Math.min((f.iw - 2 * pad) / bw, (f.ih - 2 * pad) / bh);
      s = Math.max(s, 0.5);
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      return { x: cx - (f.l + f.iw / 2) / s, y: cy - (f.t + f.ih / 2) / s, w: f.W / s, h: f.H / s };
    }
    function computeTarget() {
      var pad = opts.padPx == null ? 48 : opts.padPx;
      if (camera === "world" || !route) {
        if (route === null && markers.length === 1) {
          var m = markers[0];
          return fit(m.lon - 25, -m.lat - 15, m.lon + 25, -m.lat + 15, pad);
        }
        if (route === null && markers.length > 1) {
          // an itinerary: fit every stop, longitudes kept continuous from the first
          var ref = markers[0].lon, xs2 = [], ys2 = [];
          markers.forEach(function (mk) { var lo = mk.lon; while (lo - ref > 180) lo -= 360; while (lo - ref < -180) lo += 360; xs2.push(lo); ys2.push(-mk.lat); });
          return fit(Math.min.apply(null, xs2), Math.min.apply(null, ys2), Math.max.apply(null, xs2), Math.max.apply(null, ys2), pad);
        }
        return fit(-170, -75, 190, 60, 0);
      }
      if (camera === "follow" && pos) {
        var span = Math.max(26, Math.min(60, route.spanLon * 0.6 + 10));
        return fit(pos.lon - span / 2, -pos.lat - span / 4, pos.lon + span / 2, -pos.lat + span / 4, 0);
      }
      var xs = route.pts.map(function (p) { return p.lon; }), ys = route.pts.map(function (p) { return -p.lat; });
      return fit(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys), pad);
    }
    function applyVB() {
      svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
      var u = 1 / pxPerUnit();
      var size = (opts.planeSize || 30) * u / 24;
      if (pos) {
        planeG.setAttribute("transform", "translate(" + pos.lon + " " + -pos.lat + ") rotate(" + heading + ") scale(" + size + ") translate(-12 -12)");
      }
      ui$all(dots, "circle").forEach(function (c) { c.setAttribute("r", (c.getAttribute("data-px") || 4) * u); });
      ui$all(labels, "text").forEach(function (t) {
        t.setAttribute("font-size", 12 * u);
        t.setAttribute("stroke-width", 3 * u);
        t.setAttribute("x", +t.getAttribute("data-x") + 8 * u);
        t.setAttribute("y", +t.getAttribute("data-y") - 6 * u);
      });
    }
    function ui$all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

    function animate() {
      raf = null;
      if (destroyed || !target) return;
      var reduce = SF.ui && SF.ui.reducedMotion();
      var k = reduce || opts.instant ? 1 : 0.12, done = true;
      ["x", "y", "w", "h"].forEach(function (key) {
        var d = target[key] - vb[key];
        if (Math.abs(d) > 0.01) { vb[key] += d * k; done = false; } else vb[key] = target[key];
      });
      applyVB();
      if (!done) raf = requestAnimationFrame(animate);
    }
    function refreshCamera(instant) {
      target = computeTarget();
      if (instant) { vb = Object.assign({}, target); applyVB(); return; }
      if (!raf) raf = requestAnimationFrame(animate);
    }

    function drawMarkers() {
      dots.innerHTML = ""; labels.innerHTML = "";
      markers.forEach(function (m) {
        var lon = m.lon;
        // keep markers near the route's unwrapped longitudes
        if (route) {
          var ref = route.pts[0].lon;
          while (lon - ref > 180) lon -= 360;
          while (lon - ref < -180) lon += 360;
        }
        el("circle", { cx: lon, cy: -m.lat, r: 0.6, "data-px": m.px || 4, class: m.cls || "" }, dots);
        if (m.label) {
          var t = el("text", { "data-x": lon, "data-y": -m.lat, x: lon, y: -m.lat, class: m.cls || "" }, labels);
          t.textContent = m.label;
        }
      });
    }
    function drawNight() {
      night.innerHTML = "";
      if (opts.night === false) return;
      var poly = SF.geo.nightPolygon(new Date());
      var d = poly.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + -p[1]; }).join("") + "Z";
      [-360, 0, 360].forEach(function (off) { el("path", { d: d, transform: "translate(" + off + " 0)" }, night); });
    }
    var drawT = 1, drawRaf = null;
    function drawRoute() {
      if (!route) { remain.setAttribute("d", ""); flown.setAttribute("d", ""); planeG.style.display = "none"; return; }
      var n = route.pts.length - 1;
      if (drawT < 1) {
        remain.setAttribute("d", pathFrom(route.pts.slice(0, Math.max(2, Math.round(drawT * n) + 1))));
        flown.setAttribute("d", "");
        return;
      }
      var idx = Math.max(0, Math.min(n, Math.round(progress * n)));
      var fl = route.pts.slice(0, idx + 1);
      if (pos) fl = fl.concat([pos]);
      flown.setAttribute("d", progress > 0 ? pathFrom(fl) : "");
      var rem = (pos ? [pos] : []).concat(route.pts.slice(idx));
      remain.setAttribute("d", pathFrom(rem));
    }

    var api = {
      setRoute: function (from, to, ro) {
        ro = ro || {};
        var pts = SF.geo.arcPoints(from, to, 128);
        var xs = pts.map(function (p) { return p.lon; });
        route = { from: from, to: to, pts: pts, spanLon: Math.max.apply(null, xs) - Math.min.apply(null, xs) };
        progress = 0; pos = null;
        markers = [
          { lat: from.lat, lon: from.lon, label: from.iata, cls: "m-from", px: 4.5 },
          { lat: to.lat, lon: to.lon, label: to.iata, cls: "m-to", px: 4.5 }
        ];
        drawMarkers();
        planeG.style.display = opts.showPlane === false ? "none" : "";
        if (drawRaf) cancelAnimationFrame(drawRaf);
        var animate = ro.animate && !(SF.ui && SF.ui.reducedMotion());
        drawT = animate ? 0 : 1;
        api.setProgress(0);
        if (!animate) { refreshCamera(true); svg.classList.add("arrived"); return; }
        // Reveal: pan to the route, then draw the arc, then pulse the destination.
        svg.classList.remove("arrived");
        refreshCamera(false);
        var t0 = performance.now() + 250, dur = 900;
        (function step(now) {
          if (destroyed) return;
          var k = Math.max(0, Math.min(1, (now - t0) / dur));
          drawT = 1 - Math.pow(1 - k, 3);
          drawRoute();
          if (k < 1) drawRaf = requestAnimationFrame(step);
          else { drawT = 1; drawRoute(); svg.classList.add("arrived"); }
        })(performance.now());
      },
      clearRoute: function () { holdPath.setAttribute("d", ""); if (drawRaf) cancelAnimationFrame(drawRaf); drawT = 1; route = null; markers = []; drawMarkers(); drawRoute(); refreshCamera(true); },
      // frac = fraction of route distance flown
      setProgress: function (frac, extra) {
        if (!route) return;
        progress = Math.max(0, Math.min(1, frac));
        var p = SF.geo.interpolate(route.from, route.to, progress);
        var ref = route.pts[Math.round(progress * (route.pts.length - 1))].lon;
        function near(q) { while (q.lon - ref > 180) q.lon -= 360; while (q.lon - ref < -180) q.lon += 360; return q; }
        near(p);
        var ahead, behind;
        var hold = extra && extra.hold;
        if (hold) {
          // Fly the racetrack at the hold fix instead of stopping.
          var hp = near(SF.geo.holdPos(p, hold.heading, hold.sizeKm, hold.phase));
          ahead = near(SF.geo.holdPos(p, hold.heading, hold.sizeKm, hold.phase + 0.004));
          behind = near(SF.geo.holdPos(p, hold.heading, hold.sizeKm, hold.phase - 0.004));
          holdPath.setAttribute("d", pathFrom(SF.geo.holdLoop(p, hold.heading, hold.sizeKm, 72).map(near)));
          p = hp;
        } else {
          ahead = near(SF.geo.interpolate(route.from, route.to, Math.min(1, progress + 0.002)));
          behind = near(SF.geo.interpolate(route.from, route.to, Math.max(0, progress - 0.002)));
          holdPath.setAttribute("d", "");
        }
        var dx = ahead.lon - behind.lon, dy = -(ahead.lat - behind.lat);
        if (Math.abs(dx) + Math.abs(dy) > 1e-9) heading = Math.atan2(dx, -dy) * 180 / Math.PI;
        pos = p;
        drawRoute();
        if (camera === "follow") refreshCamera(false); else applyVB();
      },
      // The path actually flown (holds included), drawn over everything else.
      setTrack: function (pts) {
        trackPath.setAttribute("d", pts && pts.length ? pathFrom(pts) : "");
      },
      // Fly the plane along a track once (logbook replay).
      replay: function (pts, ms) {
        if (!pts || pts.length < 2) return;
        ms = ms || 4000;
        planeG.style.display = "";
        var t0 = performance.now();
        (function step(now) {
          if (destroyed) return;
          var k = Math.min(1, (now - t0) / ms), i = Math.min(pts.length - 2, Math.floor(k * (pts.length - 1)));
          var a = pts[i], b = pts[i + 1];
          pos = { lat: a.lat, lon: a.lon };
          heading = Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180 / Math.PI;
          trackPath.setAttribute("d", pathFrom(pts.slice(0, i + 2)));
          applyVB();
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      },
      setCamera: function (mode, instant) { camera = mode; refreshCamera(instant); },
      // Static overlay of many routes (logbook/routes map).
      setRoutes: function (list) {
        routesG.innerHTML = "";
        list.forEach(function (r) {
          [-360, 0, 360].forEach(function (off) {
            el("path", { d: pathFrom(SF.geo.arcPoints(r.from, r.to, 48)), transform: "translate(" + off + " 0)", "vector-effect": "non-scaling-stroke", class: r.cls || "", fill: "none" }, routesG);
          });
        });
      },
      setMarkers: function (list) { markers = list; drawMarkers(); if (!route) refreshCamera(true); else applyVB(); },
      resize: function () { refreshCamera(true); },
      destroy: function () {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        clearInterval(nightTimer);
        if (ro) ro.disconnect();
        svg.remove();
      },
      el: svg
    };

    drawNight();
    nightTimer = setInterval(drawNight, 60000);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { refreshCamera(true); }) : null;
    // Fit again once the surrounding layout has settled (charts are created before layout).
    requestAnimationFrame(function () { if (!destroyed) refreshCamera(true); });
    setTimeout(function () { if (!destroyed) refreshCamera(true); }, 120);
    if (ro) ro.observe(container);
    refreshCamera(true);
    return api;
  };
})();

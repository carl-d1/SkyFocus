/* Built-in globe: an orthographic canvas globe used for 3D Globe mode when three.js or WebGL is
   unavailable. Same interface as the other map providers. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var PLANE = new (window.Path2D || Object)("M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z");

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  SF.FallbackGlobe = function (container, opts) {
    opts = opts || {};
    var cv = document.createElement("canvas");
    cv.className = "atlas-globe";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", opts.label || "Globe");
    container.appendChild(cv);
    var g = cv.getContext("2d");
    var shade = document.createElement("canvas"); shade.width = shade.height = 300;
    var route = null, frac = 0, extra = null, markers = [], track = null, camera = opts.camera || "route";
    var view = { lat: 0, lon: 0 }, target = { lat: 0, lon: 0 }, raf = null, destroyed = false, W = 0, H = 0, dpr = 1;
    var shadeKey = "";

    function size() {
      var r = container.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = Math.max(50, r.width); H = Math.max(50, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
    }
    function frame() {
      var ins = (opts.insets && opts.insets()) || {};
      var l = ins.left || 0, t = ins.top || 0, iw = W - l - (ins.right || 0), ih = H - t - (ins.bottom || 0);
      return { cx: l + iw / 2, cy: t + ih / 2, R: Math.max(60, Math.min(iw, ih) * 0.44) };
    }
    function project(p, f) {
      var phi = p.lat * D2R, lam = (p.lon - view.lon) * D2R, phi0 = view.lat * D2R;
      var cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
      return {
        x: f.cx + f.R * Math.cos(phi) * Math.sin(lam),
        y: f.cy - f.R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam)),
        vis: cosc > 0
      };
    }
    function line(pts, f) {
      var open = false;
      g.beginPath();
      pts.forEach(function (p) {
        var q = project(p, f);
        if (!q.vis) { open = false; return; }
        if (open) g.lineTo(q.x, q.y); else { g.moveTo(q.x, q.y); open = true; }
      });
    }
    // Land mask: the outlines painted once onto an equirectangular canvas, then sampled per pixel.
    var mask = null;
    function landMask() {
      if (mask) return mask;
      var c = document.createElement("canvas"); c.width = 1024; c.height = 512;
      var mg = c.getContext("2d");
      mg.fillStyle = "#fff";
      (window.WORLD_LAND || []).forEach(function (poly) {
        mg.beginPath();
        poly.forEach(function (pt, k) {
          var x = (pt[0] + 180) / 360 * 1024, y = (90 - pt[1]) / 180 * 512;
          if (k) mg.lineTo(x, y); else mg.moveTo(x, y);
        });
        mg.closePath(); mg.fill();
      });
      mask = mg.getImageData(0, 0, 1024, 512).data;
      return mask;
    }
    function rgb(hex) {
      var m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || "");
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [30, 34, 40];
    }
    // The visible hemisphere, rendered per pixel at low resolution (land, ocean, night) and scaled up.
    function surface(f, oceanHex, landHex) {
      var s = SF.geo.sun(new Date());
      var key = view.lat.toFixed(2) + view.lon.toFixed(2) + s.subLon.toFixed(1) + oceanHex + landHex;
      if (key !== shadeKey) {
        shadeKey = key;
        var N = shade.width, sg = shade.getContext("2d"), img = sg.createImageData(N, N), d = img.data, m = landMask();
        var oc = rgb(oceanHex), ld = rgb(landHex);
        var sl = s.subLat * D2R, so = s.subLon * D2R;
        var sun = [Math.cos(sl) * Math.cos(so), Math.cos(sl) * Math.sin(so), Math.sin(sl)];
        var p0 = view.lat * D2R, l0 = view.lon * D2R, cp = Math.cos(p0), sp = Math.sin(p0);
        for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
          var u = (x + .5) / N * 2 - 1, v = 1 - (y + .5) / N * 2, rr = u * u + v * v, i = (y * N + x) * 4;
          if (rr > 1) { d[i + 3] = 0; continue; }
          var z = Math.sqrt(1 - rr);
          var lat = Math.asin(v * cp + z * sp);
          var lon = l0 + Math.atan2(u, z * cp - v * sp);
          var lonD = ((lon * R2D + 540) % 360) - 180;
          var mx = Math.min(1023, Math.max(0, Math.floor((lonD + 180) / 360 * 1024))), my = Math.min(511, Math.max(0, Math.floor((90 - lat * R2D) / 180 * 512)));
          var isLand = m[(my * 1024 + mx) * 4 + 3] > 127;
          var c = isLand ? ld : oc;
          var dot = Math.cos(lat) * Math.cos(lon) * sun[0] + Math.cos(lat) * Math.sin(lon) * sun[1] + Math.sin(lat) * sun[2];
          var night = Math.max(0, Math.min(1, (0.08 - dot) / 0.2)) * .45;
          var limb = .78 + .22 * z;      // a little darkening towards the edge
          d[i] = c[0] * limb * (1 - night); d[i + 1] = c[1] * limb * (1 - night); d[i + 2] = c[2] * limb * (1 - night) + 6 * night; d[i + 3] = 255;
        }
        sg.putImageData(img, 0, 0);
      }
      g.imageSmoothingEnabled = true;
      g.drawImage(shade, f.cx - f.R, f.cy - f.R, f.R * 2, f.R * 2);
    }
    function draw() {
      var f = frame();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      var ocean = css("--map-ocean") || "#101215", coast = css("--map-coast") || "#30343a";
      var land = document.documentElement.getAttribute("data-theme") === "light" ? (css("--map-land") || "#efe9dd") : "#262a30";
      var flownC = css("--map-flown") || "#ffc400", routeC = css("--map-route") || "rgba(236,232,222,.55)", label = css("--map-label") || "#ece8de";
      // halo and disc
      var halo = g.createRadialGradient(f.cx, f.cy, f.R * .95, f.cx, f.cy, f.R * 1.12);
      halo.addColorStop(0, "rgba(120,160,220,.18)"); halo.addColorStop(1, "rgba(120,160,220,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(f.cx, f.cy, f.R * 1.12, 0, Math.PI * 2); g.fill();
      surface(f, ocean, land);
      g.save(); g.beginPath(); g.arc(f.cx, f.cy, f.R, 0, Math.PI * 2); g.clip();
      // graticule
      g.strokeStyle = css("--map-grat") || "rgba(236,232,222,.05)"; g.lineWidth = 1;
      for (var lo = -180; lo < 180; lo += 30) { var mer = []; for (var la = -90; la <= 90; la += 5) mer.push({ lat: la, lon: lo }); line(mer, f); g.stroke(); }
      for (var la2 = -60; la2 <= 60; la2 += 30) { var par = []; for (var lo2 = -180; lo2 <= 180; lo2 += 5) par.push({ lat: la2, lon: lo2 }); line(par, f); g.stroke(); }
      g.restore();
      // rim
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 1; g.beginPath(); g.arc(f.cx, f.cy, f.R, 0, Math.PI * 2); g.stroke();

      if (route) {
        var n = route.pts.length - 1, idx = Math.round(frac * n);
        g.setLineDash([5, 5]); g.strokeStyle = routeC; g.lineWidth = 1.5;
        line(route.pts.slice(idx), f); g.stroke();
        g.setLineDash([]); g.strokeStyle = flownC; g.lineWidth = 2.5;
        line(route.pts.slice(0, idx + 1), f); g.stroke();
      }
      if (track) { g.strokeStyle = flownC; g.lineWidth = 2; line(track, f); g.stroke(); }
      var plane = planePos();
      if (plane && plane.loop) { g.setLineDash([3, 4]); g.strokeStyle = flownC; g.lineWidth = 1.5; line(plane.loop, f); g.stroke(); g.setLineDash([]); }
      g.font = "600 12px " + (css("--font-mono") || "monospace");
      markers.forEach(function (m) {
        var q = project(m, f); if (!q.vis) return;
        g.fillStyle = m.cls === "m-to" ? flownC : label;
        g.beginPath(); g.arc(q.x, q.y, 4, 0, Math.PI * 2); g.fill();
        if (m.label) { g.fillStyle = label; g.fillText(m.label, q.x + 8, q.y - 6); }
      });
      if (plane && opts.showPlane !== false) {
        var a = project(plane.p, f), b = project(plane.next, f);
        if (a.vis) {
          g.save(); g.translate(a.x, a.y); g.rotate(Math.atan2(b.x - a.x, a.y - b.y));
          var sc = (opts.planeSize || 30) / 24; g.scale(sc, sc); g.translate(-12, -12);
          g.fillStyle = "rgba(0,0,0,.4)"; g.translate(1, 1.5); g.fill(PLANE); g.translate(-1, -1.5);
          g.fillStyle = document.documentElement.getAttribute("data-theme") === "light" ? "#1d1c19" : "#f6f3ec"; g.fill(PLANE);
          g.restore();
        }
      }
    }
    function planePos() {
      if (!route) return null;
      var p = SF.geo.interpolate(route.from, route.to, frac);
      var hold = extra && extra.hold;
      if (hold) {
        return { p: SF.geo.holdPos(p, hold.heading, hold.sizeKm, hold.phase), next: SF.geo.holdPos(p, hold.heading, hold.sizeKm, hold.phase + .01),
          loop: SF.geo.holdLoop(p, hold.heading, hold.sizeKm, 72) };
      }
      return { p: p, next: SF.geo.interpolate(route.from, route.to, Math.min(1, frac + .005)) };
    }
    function aim() {
      if (camera === "follow" && route) { var pp = planePos(); target = { lat: pp.p.lat, lon: pp.p.lon }; }
      else if (route) { var mid = SF.geo.interpolate(route.from, route.to, .5); target = { lat: mid.lat * .7, lon: mid.lon }; }
      else if (markers[0]) target = { lat: markers[0].lat, lon: markers[0].lon };
    }
    function tick() {
      raf = null;
      if (destroyed) return;
      var dl = ((target.lon - view.lon + 540) % 360) - 180, dt = target.lat - view.lat;
      var k = SF.ui && SF.ui.reducedMotion() ? 1 : .12;
      view.lon += dl * k; view.lat += dt * k;
      draw();
      if (Math.abs(dl) + Math.abs(dt) > .05) raf = requestAnimationFrame(tick);
    }
    function refresh(instant) { aim(); if (instant) { view = { lat: target.lat, lon: target.lon }; draw(); } else if (!raf) raf = requestAnimationFrame(tick); }

    size();
    var ro = window.ResizeObserver ? new ResizeObserver(function () { size(); draw(); }) : null;
    if (ro) ro.observe(container);
    var shadeTimer = setInterval(function () { shadeKey = ""; draw(); }, 60000);

    return {
      setRoute: function (a, b) {
        route = { from: a, to: b, pts: SF.geo.arcPoints(a, b, 128) };
        markers = [{ lat: a.lat, lon: a.lon, label: a.iata, cls: "m-from" }, { lat: b.lat, lon: b.lon, label: b.iata, cls: "m-to" }];
        frac = 0; extra = null; refresh(true);
      },
      clearRoute: function () { route = null; markers = []; refresh(true); },
      setProgress: function (f, ex) { frac = Math.max(0, Math.min(1, f)); extra = ex || null; if (camera === "follow") refresh(false); else draw(); },
      setCamera: function (c, instant) { camera = c; refresh(instant); },
      setMarkers: function (list) { markers = list.slice(); refresh(true); },
      setRoutes: function () { },
      setTrack: function (pts) { track = pts; draw(); },
      resize: function () { size(); draw(); },
      destroy: function () { destroyed = true; if (raf) cancelAnimationFrame(raf); clearInterval(shadeTimer); if (ro) ro.disconnect(); cv.remove(); }
    };
  };
})();

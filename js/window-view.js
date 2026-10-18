/* Window view: the sky from your seat, drawn on one canvas behind a cabin wall with three windows.
   Light comes from the real sun at the aircraft's position (day, golden hour, twilight, night with
   stars and a moon). Clouds, cirrus and ground features sit in a simple 3D world around the aircraft
   and are projected through the window, so near clouds race past, far ones drift, and the horizon
   tilts with pitch and moves with bank. Window seats A to C look left, D to F look right. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var FOV = 96;   // degrees across the full stage width

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrap180(d) { return ((d % 360) + 540) % 360 - 180; }

  var PITCH = { Pushback: 0, Taxi: 0, Takeoff: 8, Climb: 5, Cruise: 2, Holding: 2, Descent: -1, Approach: 2, Landing: 4, Arrived: 0 };

  /* ---------- cloud sprites: several shapes, lit on top and darker underneath ---------- */
  // type: cumulus (heaped), puff (small), strato (wide rolls), alto (small cells), cirrus (streaks), veil (thin sheet)
  var SHAPE = { cumulus: [256, 176], puff: [160, 96], strato: [384, 112], alto: [320, 96], cirrus: [384, 64], veil: [512, 64] };
  function cloudSprite(type, seed, col) {
    var sz = SHAPE[type], w = sz[0], h = sz[1];
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d"), r = SF.rng(seed);
    var top = SF.sky.css(SF.sky.mix(col, [255, 255, 255], .35)), mid = SF.sky.css(col), midSoft = SF.sky.css(col, .45), base = SF.sky.mix(col, [52, 60, 80], .5);
    function blob(x, y, rad, a) {
      var gr = g.createRadialGradient(x - rad * .15, y - rad * .45, rad * .05, x, y, rad);
      gr.addColorStop(0, top); gr.addColorStop(.35, mid); gr.addColorStop(.72, midSoft); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    var i, n, baseY;
    if (type === "cirrus" || type === "veil") {
      g.lineCap = "round";
      n = type === "veil" ? 6 : 14;
      for (i = 0; i < n; i++) {
        var x0 = r() * w * .3, y0 = h * (.3 + r() * .4), len = w * (.4 + r() * .55), curl = (r() - .5) * h * .6;
        var gr2 = g.createLinearGradient(x0, 0, x0 + len, 0);
        gr2.addColorStop(0, "rgba(0,0,0,0)"); gr2.addColorStop(.35, SF.sky.css(col, type === "veil" ? .16 : .32)); gr2.addColorStop(1, "rgba(0,0,0,0)");
        g.strokeStyle = gr2; g.lineWidth = type === "veil" ? h * (.25 + r() * .3) : 1.5 + r() * 4;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + len * .5, y0 + curl, x0 + len, y0 - curl * .4); g.stroke();
      }
      return c;
    }
    if (type === "cumulus") {
      baseY = h * .8; n = 30 + (r() * 14 | 0);
      var tower = .35 + r() * .5;
      for (i = 0; i < n; i++) {
        var u = r(), rad = h * (.1 + r() * .14) * (1 - u * .35), x = w * (.2 + r() * .6) + (r() - .5) * w * .1 * (1 - u), y = baseY - rad * .55 - u * h * .5 * tower;
        blob(x, y, rad, .7);
      }
    } else if (type === "puff") {
      baseY = h * .78; n = 7 + (r() * 5 | 0);
      n += 6;
      for (i = 0; i < n; i++) { var rp = h * (.14 + r() * .16); blob(w * (.22 + r() * .56), baseY - rp * .55 - r() * h * .2, rp, .7); }
    } else if (type === "strato") {
      baseY = h * .78; n = 26 + (r() * 10 | 0);
      for (i = 0; i < n; i++) { var rs = h * (.16 + r() * .18); blob(w * (.04 + r() * .92), baseY - rs * .5 - r() * h * .18, rs, .7); }
    } else {
      baseY = h * .8; n = 40 + (r() * 20 | 0);
      for (i = 0; i < n; i++) { var ra = h * (.07 + r() * .08); blob(w * (.06 + r() * .88), h * (.3 + r() * .45), ra, .7); }
    }
    // flat base cut away and the underside darkened
    g.globalAlpha = 1;
    g.globalCompositeOperation = "destination-out";
    var cut = g.createLinearGradient(0, baseY, 0, baseY + h * .08);
    cut.addColorStop(0, "rgba(0,0,0,0)"); cut.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = cut; g.fillRect(0, baseY, w, h - baseY);
    g.globalCompositeOperation = "source-atop";
    var sh = g.createLinearGradient(0, baseY - h * .45, 0, baseY);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, SF.sky.css(base, .75));
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    return c;
  }

  SF.windowView = {
    // getStatus(): the flight status; opts.insets(): free area; opts.seat: seat code like "4A"
    mount: function (host, getStatus, opts) {
      opts = opts || {};
      var q = (SF.store.state.settings.graphics) || "high";
      var reduce = SF.ui.reducedMotion();
      var dir = /[D-F]$/i.test(opts.seat || "A") ? -1 : 1;   // 1: left side, -1: right side
      host.innerHTML = '<canvas class="wv-sky" aria-hidden="true"></canvas><svg class="wv-wall" aria-hidden="true"></svg><canvas class="wv-glow" aria-hidden="true"></canvas>' +
        '<div class="glass wv-label"><span class="label">Window · seat ' + SF.esc(opts.seat || "A") + " · looking " + (dir > 0 ? "left" : "right") + '</span><b class="readout readout-sm" id="wvRead">--</b></div>';
      host.setAttribute("role", "img");
      host.setAttribute("aria-label", "View from the cabin window");
      var glowCv = host.querySelector(".wv-glow"), gg = glowCv.getContext("2d"), glowMask = null, cabinNight = null, grain = null;
      // fine grain for the wall panels, made once
      function grainURL() {
        if (grain) return grain;
        var c = document.createElement("canvas"); c.width = c.height = 160;
        var gx = c.getContext("2d"), r = SF.rng(29), img = gx.createImageData(160, 160);
        for (var j = 0; j < img.data.length; j += 4) { var v = r() * 255 | 0; img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 10; }
        gx.putImageData(img, 0, 0);
        grain = c.toDataURL();
        return grain;
      }
      var cv = host.querySelector("canvas"), g = cv.getContext("2d"), wall = host.querySelector("svg"), read = host.querySelector("#wvRead");
      var dpr = Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 1), W = 0, H = 0, wins = [], centre = null;

      /* ---------- the world around the aircraft (km, ft) ---------- */
      var rng = SF.rng(SF.hash(opts.seed || "sky")), clouds = [], ground = [], towns = [], stars = [], i;
      var Q = q === "low" ? .35 : q === "balanced" ? .6 : 1;
      function layer(type, count, h0, h1, s0, s1, r0, r1, span) {
        for (var n = 0; n < Math.round(count * Q); n++) clouds.push({ type: type, a: (rng() - .5) * span, r: r0 + Math.pow(rng(), 1.3) * (r1 - r0), h: h0 + rng() * (h1 - h0), s: s0 + Math.pow(rng(), 1.8) * (s1 - s0), v: rng() * 4 | 0, span: span });
      }
      layer("cumulus", 34, 3500, 6500, .4, 1.6, .3, 12, 300);     // close in, for climb and descent
      layer("cumulus", 70, 3500, 7000, 1.5, 7, 8, 200, 300);
      layer("puff", 60, 3000, 6000, .6, 2.2, 6, 190, 300);
      layer("strato", 24, 6500, 9500, 6, 20, 10, 200, 300);
      layer("alto", 44, 13000, 17500, 3, 10, 8, 200, 320);
      layer("cirrus", 26, 28000, 34000, 8, 22, 8, 200, 400);
      layer("veil", 8, 38500, 41000, 20, 40, 6, 120, 400);
      // towns (clusters, some strung out along a road); lit only where there is land beneath them
      for (var tn = 0; tn < Math.round(120 * Q); tn++) {
        var t = { a: (rng() - .5) * 400, r: 3 + Math.pow(rng(), 1.1) * 185, size: Math.pow(rng(), 1.4), road: rng() < .35, ang: rng() * Math.PI, land: true, pts: [] };
        var cnt = Math.round((10 + t.size * t.size * 90) * (q === "low" ? .5 : 1)), spread = .8 + t.size * 5;
        for (i = 0; i < cnt; i++) {
          var along = (rng() - .5) * spread * (t.road ? 5 : 1), across = (rng() + rng() - 1) * spread * (t.road ? .15 : .6);
          t.pts.push({ da: Math.cos(t.ang) * along - Math.sin(t.ang) * across, dr: Math.sin(t.ang) * along + Math.cos(t.ang) * across, k: rng(), f: 2 + rng() * 6, ph: rng() * 6.3, warm: rng() < .7 });
        }
        towns.push(t);
      }
      for (i = 0; i < 1600; i++) stars.push({ az: rng() * 360, el: 1 + rng() * 45, m: .3 + rng() * .7 });
      function wrapA(o, span) { if (o.a < -span / 2) { o.a += span; return true; } if (o.a > span / 2) { o.a -= span; return true; } return false; }
      // where a point of the world sits on the earth, from its offset to the aircraft
      function landAt(o, st2) {
        var hd = st2.heading * D2R, side = (st2.heading - 90 * dir) * D2R;
        var east = Math.sin(hd) * o.a + Math.sin(side) * o.r, north = Math.cos(hd) * o.a + Math.cos(side) * o.r;
        var p2 = SF.geo.offsetKm(st2.pos, east, north);
        return SF.geo.isLand(p2.lat, Math.max(-180, Math.min(180, p2.lon)));
      }

      /* ---------- palette and sprites (rebuilt as the light changes) ---------- */
      var P = null, sun = null, moon = null, moonK = 0, dayness = 1, overWater = false, sprites = {}, lastLight = 0;
      function light(st) {
        var when = new Date();
        if (SF.devSunHour != null) { var d = new Date(); when = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (SF.devSunHour - st.pos.lon / 15) * 3600000); }
        sun = SF.sky.sunAt(st.pos, when);
        P = SF.sky.palette(sun.el);
        moon = SF.geo.moon(when, st.pos.lat, st.pos.lon);
        dayness = clamp((sun.el + 6) / 14, 0, 1);
        // moonlight: how full, how high, and how dark the sky is
        moonK = moon.el > -1 ? moon.fraction * clamp((moon.el + 1) / 10, 0, 1) * (1 - dayness) : 0;
        overWater = !SF.geo.isLand(st.pos.lat, st.pos.lon);
        var cloudCol = SF.sky.mix(P.cloud, [150, 166, 210], Math.min(.6, moonK * .8));
        var vars = q === "low" ? 2 : q === "balanced" ? 3 : 4;
        sprites = {};
        Object.keys(SHAPE).forEach(function (t2, ti) {
          sprites[t2] = [];
          for (var vi = 0; vi < vars; vi++) sprites[t2].push(cloudSprite(t2, 101 + ti * 17 + vi * 5, t2 === "cirrus" || t2 === "veil" ? SF.sky.mix(cloudCol, [255, 255, 255], .2) : cloudCol));
        });
        towns.forEach(function (t2) { t2.land = landAt(t2, st); });
        lastLight = Date.now();
      }

      /* ---------- the cabin wall with its windows ---------- */
      function layout() {
        var w = host.clientWidth, h = host.clientHeight;
        if (!w || !h || (w === W && h === H)) return;
        W = w; H = h;
        cv.width = w * dpr; cv.height = h * dpr;
        var ins = (opts.insets && opts.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
        var fx0 = ins.left, fx1 = w - ins.right, fy0 = ins.top, fy1 = h - ins.bottom;
        var cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
        var wh = Math.min((fy1 - fy0) * .74, 560), ww = wh * .66, gap = ww * 1.85;
        wins = []; centre = null;
        for (var k = -3; k <= 3; k++) { var x = cx + k * gap; if (x + ww / 2 > -20 && x - ww / 2 < w + 20) wins.push({ x: x - ww / 2, y: cy - wh / 2, w: ww, h: wh }); }
        centre = { x: cx, y: cy - wh / 2, w: ww, h: wh };
        var rr = ww * .46, holes = "", deco = "";
        function rrect(x, y, ww2, hh, r2) { return "M" + (x + r2) + " " + y + "h" + (ww2 - 2 * r2) + "a" + r2 + " " + r2 + " 0 0 1 " + r2 + " " + r2 + "v" + (hh - 2 * r2) + "a" + r2 + " " + r2 + " 0 0 1 " + (-r2) + " " + r2 + "h" + (-(ww2 - 2 * r2)) + "a" + r2 + " " + r2 + " 0 0 1 " + (-r2) + " " + (-r2) + "v" + (-(hh - 2 * r2)) + "a" + r2 + " " + r2 + " 0 0 1 " + r2 + " " + (-r2) + "z"; }
        wins.forEach(function (o, n) {
          holes += rrect(o.x, o.y, o.w, o.h, rr);
          var b = 22;
          deco += '<path d="' + rrect(o.x - b, o.y - b, o.w + 2 * b, o.h + 2 * b, rr + b) + rrect(o.x, o.y, o.w, o.h, rr) + '" fill="url(#wvBezel)" fill-rule="evenodd"/>' +
            '<path d="' + rrect(o.x, o.y, o.w, o.h, rr) + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3"/>' +
            '<path d="' + rrect(o.x + 6, o.y + 6, o.w - 12, o.h - 12, rr - 6) + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1.5"/>' +
            '<clipPath id="wvClip' + n + '"><path d="' + rrect(o.x, o.y, o.w, o.h, rr) + '"/></clipPath>' +
            '<g clip-path="url(#wvClip' + n + ')"><rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + (o.h * .13) + '" fill="url(#wvShade)"/>' +
            '<rect x="' + o.x + '" y="' + (o.y + o.h * .13 - 4) + '" width="' + o.w + '" height="4" fill="rgba(0,0,0,.35)"/></g>';
        });
        var seams = "";
        for (var sx = (cx - gap / 2) % gap; sx < w; sx += gap) seams += '<line x1="' + sx + '" y1="0" x2="' + sx + '" y2="' + h + '" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/><line x1="' + (sx + 1.5) + '" y1="0" x2="' + (sx + 1.5) + '" y2="' + h + '" stroke="rgba(255,255,255,.04)"/>';
        // glow around each window, cleared inside the openings; tinted every frame
        glowCv.width = w * dpr; glowCv.height = h * dpr;
        glowMask = document.createElement("canvas"); glowMask.width = w * dpr; glowMask.height = h * dpr;
        var m = glowMask.getContext("2d");
        m.scale(dpr, dpr);
        function rrPath(o) { m.beginPath(); if (m.roundRect) m.roundRect(o.x, o.y, o.w, o.h, rr); else m.rect(o.x, o.y, o.w, o.h); }
        wins.forEach(function (o) {
          m.save(); m.shadowColor = "#fff"; m.shadowBlur = 90; m.fillStyle = "#fff"; rrPath(o); m.fill(); m.fill(); m.restore();
          var sg = m.createRadialGradient(o.x + o.w / 2, o.y + o.h * .95, 0, o.x + o.w / 2, o.y + o.h * .95, o.h * .85);
          sg.addColorStop(0, "rgba(255,255,255,.45)"); sg.addColorStop(1, "rgba(255,255,255,0)");
          m.fillStyle = sg; m.fillRect(o.x - o.w, o.y + o.h * .4, o.w * 3, o.h * 1.4);
        });
        m.globalCompositeOperation = "destination-out";
        m.fillStyle = "#000";
        wins.forEach(function (o) { rrPath(o); m.fill(); });
        // night cabin lighting: a warm wash from the ceiling and faint pools from the reading lights
        cabinNight = document.createElement("canvas"); cabinNight.width = w * dpr; cabinNight.height = h * dpr;
        var cn = cabinNight.getContext("2d");
        cn.scale(dpr, dpr);
        var wash = cn.createLinearGradient(0, 0, 0, h * .45);
        wash.addColorStop(0, "rgba(255,176,104,.16)"); wash.addColorStop(1, "rgba(255,176,104,0)");
        cn.fillStyle = wash; cn.fillRect(0, 0, w, h * .45);
        for (var px = (cx - gap / 2) % gap; px < w + gap; px += gap) {
          var pool = cn.createRadialGradient(px, h * .06, 0, px, h * .06, h * .5);
          pool.addColorStop(0, "rgba(255,200,140,.12)"); pool.addColorStop(1, "rgba(255,200,140,0)");
          cn.fillStyle = pool; cn.fillRect(px - h * .5, 0, h, h * .56);
        }
        var floor = cn.createLinearGradient(0, h * .82, 0, h);
        floor.addColorStop(0, "rgba(120,140,200,0)"); floor.addColorStop(1, "rgba(120,140,200,.06)");
        cn.fillStyle = floor; cn.fillRect(0, h * .82, w, h * .18);
        wall.setAttribute("viewBox", "0 0 " + w + " " + h);
        wall.innerHTML =
          '<defs><linearGradient id="wvWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3934"/><stop offset=".5" stop-color="#2e2c28"/><stop offset="1" stop-color="#1d1c19"/></linearGradient>' +
          '<radialGradient id="wvBezel" cx=".5" cy=".42" r=".62"><stop offset=".8" stop-color="#4a4740"/><stop offset=".93" stop-color="#26241f"/><stop offset="1" stop-color="#3d3a34"/></radialGradient>' +
          '<linearGradient id="wvShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8d3c7"/><stop offset="1" stop-color="#b9b3a6"/></linearGradient>' +
          '<pattern id="wvGrain" width="160" height="160" patternUnits="userSpaceOnUse"><image href="' + grainURL() + '" width="160" height="160"/></pattern>' +
          '<linearGradient id="wvDado" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".02" stop-color="#fff" stop-opacity=".06"/><stop offset=".05" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>' +
          '<linearGradient id="wvBin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>' +
          '<clipPath id="wvWallClip"><path clip-rule="evenodd" d="M0 0H' + w + "V" + h + "H0Z" + holes + '"/></clipPath></defs>' +
          '<path d="M0 0H' + w + "V" + h + "H0Z" + holes + '" fill="url(#wvWall)" fill-rule="evenodd"/>' +
          '<g clip-path="url(#wvWallClip)"><rect width="' + w + '" height="' + h + '" fill="url(#wvGrain)"/>' +
          '<rect y="0" width="' + w + '" height="' + (h * .1) + '" fill="url(#wvBin)"/>' +
          '<rect y="' + (h * .84) + '" width="' + w + '" height="' + (h * .16) + '" fill="url(#wvDado)"/></g>' + seams + deco;
      }

      /* ---------- drawing ---------- */
      var st = getStatus(), t0 = performance.now(), last = t0, lastHdg = st.heading, bank = 0, bankV = 0, shake = 0, nextBump = 8 + Math.random() * 20;
      var strobeAt = -10, nextStrobe = 1, strobe = 0, navI = 1, whiteoutNow = 0;
      function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
      light(st);
      function proj(a, r, h, altFt, cx, hy, k) {
        // relative azimuth (clockwise from the view direction) and elevation, to screen
        var dist = Math.sqrt(a * a + r * r), az = Math.atan2(a, r) * R2D, el = Math.atan2((h - altFt) * .0003048, dist) * R2D;
        return { x: cx + dir * az * k, y: hy - el * k, d: dist, az: az };
      }
      function frame(now) {
        raf = requestAnimationFrame(frame);
        if (document.hidden) { last = now; return; }
        var dt = Math.min(.1, (now - last) / 1000);
        if (reduce && now - last < 1000) return;
        last = now;
        layout();
        if (!W) return;
        st = getStatus() || st;
        if (Date.now() - lastLight > 60000) light(st);
        var alt = st.altitudeFt || 0, gsKmS = (st.groundSpeedKt || 0) * 1.852 / 3600;
        var speed = reduce ? 0 : gsKmS * (SF.store.state.activeFlight ? SF.store.state.activeFlight.timeScale || 1 : 1);
        // world drifts backwards past the window
        clouds.forEach(function (c) { c.a -= speed * dt; wrapA(c, c.span); });
        towns.forEach(function (t2) { t2.a -= speed * dt; if (wrapA(t2, 400)) t2.land = landAt(t2, st); });
        // bank from the rate of turn (holds), smoothed by a spring
        var dh = wrap180(st.heading - lastHdg) / Math.max(dt, .001);
        lastHdg = st.heading;
        var target = clamp(-dh * 8, -25, 25);   // left wing down is positive
        if (st.hold) target = clamp(-holdRate(st) * 8, -25, 25);
        bankV += ((target - bank) * 6 - bankV * 4) * dt; bank += bankV * dt;
        // the odd bump of light chop
        nextBump -= dt;
        if (nextBump < 0 && !reduce) { shake = 1; nextBump = 15 + Math.random() * 30; }
        shake = Math.max(0, shake - dt * .7);

        var ts = now / 1000;
        // white strobe: a double flash every 1 to 2 seconds; the red or green light pulses steadily
        if (!reduce && ts >= nextStrobe) { strobeAt = ts; nextStrobe = ts + 1 + Math.random(); }
        var sd = ts - strobeAt;
        strobe = reduce ? 0 : Math.exp(-Math.pow((sd - .02) / .028, 2)) + .85 * Math.exp(-Math.pow((sd - .16) / .028, 2));
        navI = reduce ? 1 : .2 + .8 * sstep(-.25, .25, Math.sin(ts * Math.PI * 2 * .9));
        var k = W / FOV, cx = W / 2;
        var dip = Math.sqrt(Math.max(alt, 0) / 3.28) * .0321;   // horizon dip in degrees
        var pitch = PITCH[st.phase] != null ? PITCH[st.phase] : 2;
        var hy = H * .5 + dip * k - dir * bank * k * .9 + (shake ? Math.sin(now / 37) * shake * 3 : 0);
        var tilt = -dir * pitch * D2R;
        var viewAz = st.heading - 90 * dir;

        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.save();
        g.translate(cx, hy); g.rotate(tilt); g.translate(-cx, -hy);
        // sky and the earth below it
        var sky = g.createLinearGradient(0, hy - 28 * k, 0, hy);
        sky.addColorStop(0, SF.sky.css(P.zenith)); sky.addColorStop(1, SF.sky.css(P.horizon));
        g.fillStyle = sky; g.fillRect(-W, hy - H * 3, W * 3, H * 3 + 1);
        var earth = SF.sky.mix(SF.sky.mix(P.ground, overWater ? [22, 52, 88] : [52, 66, 58], alt > 10000 ? .6 : .3), P.horizon, .25 * (1 - P.lights));
        var eg = g.createLinearGradient(0, hy, 0, hy + 40 * k);
        eg.addColorStop(0, SF.sky.css(SF.sky.mix(P.horizon, earth, .35))); eg.addColorStop(.12, SF.sky.css(SF.sky.mix(P.horizon, earth, .75))); eg.addColorStop(1, SF.sky.css(earth));
        g.fillStyle = eg; g.fillRect(-W, hy, W * 3, H * 3);
        // stars and moon
        if (P.stars > .02) {
          stars.forEach(function (s) {
            var ra = wrap180(s.az - viewAz);
            if (Math.abs(ra) > FOV / 2 + 4) return;   // behind the viewer
            var x = cx + ra * k, y = hy - s.el * k;
            g.fillStyle = "rgba(255,255,255," + Math.min(1, P.stars * (s.m + .25)).toFixed(2) + ")";
            var z = s.m > .85 ? 2.4 : s.m > .6 ? 1.7 : 1.2;
            g.fillRect(x, y, z, z);
          });
        }
        // the moon at its real position, with its phase turned toward the sun
        if (moon.el > -1) {
          var mx = cx + wrap180(moon.az - viewAz) * k, my = hy - moon.el * k, mr = Math.max(9, .85 * k), fr = moon.fraction;
          var vis = 1 - dayness * .75;
          var halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 7);
          halo.addColorStop(0, "rgba(210,222,255," + (.32 * fr * vis).toFixed(3) + ")"); halo.addColorStop(1, "rgba(210,222,255,0)");
          g.fillStyle = halo; g.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
          var sxs = cx + wrap180(sun.az - viewAz) * k, sys = hy - sun.el * k;
          g.save();
          g.translate(mx, my); g.rotate(Math.atan2(sys - my, sxs - mx));
          g.fillStyle = "rgba(170,182,210," + (.16 * vis).toFixed(3) + ")";   // earthshine on the dark part
          g.beginPath(); g.arc(0, 0, mr, 0, Math.PI * 2); g.fill();
          g.fillStyle = "rgba(238,240,246," + vis.toFixed(3) + ")";
          g.beginPath(); g.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2);
          var rx = mr * Math.abs(1 - 2 * fr);
          if (fr >= .5) g.ellipse(0, 0, Math.max(.01, rx), mr, 0, Math.PI / 2, Math.PI * 1.5, false);
          else g.ellipse(0, 0, Math.max(.01, rx), mr, 0, Math.PI / 2, -Math.PI / 2, true);
          g.fill();
          g.restore();
        }
        // the sun and its glow
        if (sun.el > -6) {
          var saz = wrap180(sun.az - viewAz), sx = cx + saz * k, sy = hy - sun.el * k;
          var glow = g.createRadialGradient(sx, sy, 0, sx, sy, 60 * k / 4);
          glow.addColorStop(0, SF.sky.css(P.sun, .7)); glow.addColorStop(.08, SF.sky.css(P.sun, .35)); glow.addColorStop(1, SF.sky.css(P.sun, 0));
          g.fillStyle = glow; g.fillRect(sx - 15 * k, sy - 15 * k, 30 * k, 30 * k);
          if (sun.el > -1) { g.fillStyle = SF.sky.css(SF.sky.mix(P.sun, [255, 255, 255], .6)); g.beginPath(); g.arc(sx, sy, Math.max(5, .3 * k), 0, Math.PI * 2); g.fill(); }
        }
        // towns and roads: twinkling lights at night, only over land
        var night = P.lights;
        if (night > .2) towns.forEach(function (t2) {
          if (!t2.land) return;
          var c2 = proj(t2.a, t2.r, 0, alt, cx, hy, k);
          if (c2.d > 200 || Math.abs(c2.az) > 72) return;
          var fade = Math.pow(1 - c2.d / 200, .7) * night;
          if (t2.size > .25) {   // the glow over a town
            var gR = (2 + t2.size * 7) / c2.d * R2D * k * .55;
            var cg = g.createRadialGradient(c2.x, c2.y, 0, c2.x, c2.y, gR);
            cg.addColorStop(0, "rgba(255,170,90," + ((.12 + .2 * t2.size) * fade).toFixed(3) + ")"); cg.addColorStop(1, "rgba(255,170,90,0)");
            g.fillStyle = cg; g.fillRect(c2.x - gR, c2.y - gR, gR * 2, gR * 2);
          }
          // distant towns are drawn with fewer, slightly larger points
          var step = c2.d > 120 ? 3 : c2.d > 60 ? 2 : 1;
          t2.pts.forEach(function (pp, pi) {
            if (pi % step) return;
            var p = proj(t2.a + pp.da, t2.r + pp.dr, 0, alt, cx, hy, k);
            var tw = reduce ? 1 : .7 + .3 * Math.sin(ts * pp.f + pp.ph);
            var a2 = Math.min(1, fade * (.6 + .6 * pp.k) * tw), z = Math.max(1.3, 3 - p.d / 60) + (step - 1) * .4;
            g.fillStyle = pp.warm ? "rgba(255,206,130," + a2.toFixed(3) + ")" : "rgba(220,236,255," + (a2 * .85).toFixed(3) + ")";
            g.fillRect(p.x, p.y, z, z * .8);
          });
        });
        // sun glint on open water, below the sun
        if (overWater && sun.el > 2 && sun.el < 50 && alt > 2000) {
          var sgx = cx + wrap180(sun.az - viewAz) * k, sgy = hy + sun.el * k, sR = (8 + sun.el * .25) * k;
          if (Math.abs(sgx - cx) < W) {
            var sgg = g.createRadialGradient(sgx, sgy, 0, sgx, sgy, sR);
            sgg.addColorStop(0, SF.sky.css(SF.sky.mix(P.sun, [255, 255, 255], .5), .5)); sgg.addColorStop(1, SF.sky.css(P.sun, 0));
            g.save(); g.translate(sgx, sgy); g.scale(1, .35); g.translate(-sgx, -sgy);
            g.fillStyle = sgg; g.fillRect(sgx - sR, sgy - sR, sR * 2, sR * 2);
            g.restore();
          }
        }
        // moon glitter on open water
        if (overWater && moonK > .04 && alt > 2000) {
          var gx = cx + wrap180(moon.az - viewAz) * k;
          if (Math.abs(gx - cx) < W * .7) {
            var col2 = g.createLinearGradient(0, hy, 0, hy + 22 * k);
            col2.addColorStop(0, "rgba(210,222,255," + (.14 * moonK).toFixed(3) + ")"); col2.addColorStop(1, "rgba(210,222,255,0)");
            g.fillStyle = col2;
            // a soft column: several narrowing layers instead of one hard wedge
            for (var gl2 = 0; gl2 < 4; gl2++) {
              var wtop = (.2 + gl2 * .25) * k, wbot = (2 + gl2 * 2.2) * k;
              g.beginPath(); g.moveTo(gx - wtop, hy); g.lineTo(gx + wtop, hy); g.lineTo(gx + wbot, hy + 22 * k); g.lineTo(gx - wbot, hy + 22 * k); g.closePath(); g.fill();
            }
            var gr2 = SF.rng(7), nG = q === "low" ? 40 : 110;
            for (var gi = 0; gi < nG; gi++) {
              var e = .2 + Math.pow(gr2(), 1.6) * 22, wd = (.35 + e * .22) * k, x2 = gx + (gr2() - .5) * 2 * wd, y2 = hy + e * k;
              var tw = .5 + .5 * Math.sin(ts * (5 + gr2() * 9) + gi);
              g.fillStyle = "rgba(235,240,255," + (moonK * tw * (1 - e / 24)).toFixed(3) + ")";
              g.fillRect(x2, y2, 1 + (e > 8 ? 1 : 0), 1);
            }
          }
        }
        // cloud layers, far to near
        var list = [];
        clouds.forEach(function (o) {
          var p = proj(o.a, o.r, o.h, alt, cx, hy, k);
          if (Math.abs(p.az) > 75) return;
          list.push({ o: o, p: p });
        });
        list.sort(function (x, y) { return y.p.d - x.p.d; });
        var whiteout = 0;
        list.forEach(function (it) {
          var p = it.p, o = it.o, img = sprites[o.type][o.v % sprites[o.type].length];
          var size = o.s / p.d * R2D * k;
          if (size < 2) return;
          var wpx = size * 2, hpx = wpx * img.height / img.width;
          if (o.type === "strato" || o.type === "alto" || o.type === "veil") hpx *= clamp(Math.abs(Math.atan2((o.h - alt) * .0003048, p.d)) * 4, .22, 1);
          var far = o.h > 20000 ? 280 : 190, fade = clamp(1 - p.d / far, 0, 1);
          if (p.d < 1.2 && Math.abs(o.h - alt) < 900) whiteout = Math.max(whiteout, 1 - p.d / 1.2);
          g.globalAlpha = fade * (o.type === "veil" ? .7 : o.type === "alto" ? .8 : .95);
          g.drawImage(img, p.x - wpx / 2, p.y - hpx * .7, wpx, hpx);
        });
        g.globalAlpha = 1;
        // big towns light the cloud above them from below
        if (night > .3 && alt > 9000) towns.forEach(function (t2) {
          if (!t2.land || t2.size < .45) return;
          var c3 = proj(t2.a, t2.r, 6000, alt, cx, hy, k);
          if (c3.d > 180 || Math.abs(c3.az) > 72) return;
          var R3 = (3 + t2.size * 8) / c3.d * R2D * k * .5, a3 = .14 * night * (1 - c3.d / 180);
          var cg3 = g.createRadialGradient(c3.x, c3.y, 0, c3.x, c3.y, R3);
          cg3.addColorStop(0, "rgba(255,160,80," + a3.toFixed(3) + ")"); cg3.addColorStop(1, "rgba(255,160,80,0)");
          g.fillStyle = cg3; g.fillRect(c3.x - R3, c3.y - R3, R3 * 2, R3 * 2);
        });
        g.globalAlpha = 1;
        g.restore();
        // inside a cloud the view greys and dims; the wing, a few metres away, stays faintly visible
        whiteoutNow = whiteout;
        var fog = SF.sky.mix(P.cloud, [92, 98, 110], .35);
        if (whiteout > 0) { g.fillStyle = SF.sky.css(fog, (whiteout * .82).toFixed(2)); g.fillRect(0, 0, W, H); }
        var wingInfo = drawWing(cx, k, ts, alt, st.heading);
        if (whiteout > 0) { g.fillStyle = SF.sky.css(fog, (whiteout * .35).toFixed(2)); g.fillRect(0, 0, W, H); }
        // the strobe lights the wing and the cloud around the tip
        if (strobe > .01) {
          var night2 = 1 - dayness, R = W * .3, sx2 = wingInfo.strobe[0], sy2 = wingInfo.strobe[1];
          g.save(); g.globalCompositeOperation = "lighter";
          var fl = g.createRadialGradient(sx2, sy2, 0, sx2, sy2, R);
          fl.addColorStop(0, "rgba(255,255,255," + Math.min(1, strobe * (.45 + .5 * night2)).toFixed(3) + ")");
          fl.addColorStop(.12, "rgba(225,232,255," + (strobe * (.12 + .3 * night2) * (1 + whiteout)).toFixed(3) + ")");
          fl.addColorStop(1, "rgba(225,232,255,0)");
          g.fillStyle = fl; g.fillRect(sx2 - R, sy2 - R, R * 2, R * 2);
          g.restore();
        }
        // a glint where the sun catches the wing
        if (wingInfo.glint > .35) {
          var gl = wingInfo.glintAt, gs = 18 + wingInfo.glint * 40;
          g.save(); g.globalCompositeOperation = "lighter"; g.translate(gl[0], gl[1]);
          var gg2 = g.createRadialGradient(0, 0, 0, 0, 0, gs);
          gg2.addColorStop(0, "rgba(255,250,235," + Math.min(.9, wingInfo.glint).toFixed(3) + ")"); gg2.addColorStop(1, "rgba(255,250,235,0)");
          g.fillStyle = gg2; g.fillRect(-gs, -gs, gs * 2, gs * 2);
          g.fillStyle = "rgba(255,255,255," + Math.min(.8, wingInfo.glint * .8).toFixed(3) + ")";
          g.fillRect(-gs * 1.6, -.6, gs * 3.2, 1.2); g.fillRect(-.6, -gs * .9, 1.2, gs * 1.8);
          g.restore();
        }
        drawGlow(shake);
        if (now % 1000 < 40 || !read.textContent || read.textContent === "--") read.textContent = Math.round(alt).toLocaleString() + " FT · SUN " + Math.round(sun.el) + "° · " + sunTime(st.pos);
      }
      function holdRate(s) {
        // a standard racetrack: two 180 degree turns per lap, one lap per 4 min of flight time
        var ph = s.hold.phase % .5;
        return ph > .1 && ph < .4 ? 0 : 360 / (4 * 60) * 2.4 * ((SF.store.state.activeFlight && SF.store.state.activeFlight.timeScale) || 1);
      }
      /* ---------- the wing: an original swept wing with a winglet, in the same perspective as the sky.
         Aircraft frame in metres: x forward, y outward on the window side, z up; the eye is at 0, 0, 0. */
      var NSEC = q === "low" ? 5 : q === "balanced" ? 8 : 12, WING = [];
      for (i = 0; i <= NSEC; i++) {
        var u = i / NSEC;
        WING.push({ u: u, y: 2.1 + 15.4 * u, le: 6.4 - 15.4 * u * Math.tan(28 * D2R), c: 6.4 - 4.7 * u, z: -2.4 + 15.4 * u * Math.tan(5.5 * D2R), t: .55 - .41 * u });
      }
      var PAINT = [204, 208, 214], SIGNAL = [255, 196, 0];
      function vnorm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
      function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
      function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
      function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
      // a light at true azimuth and elevation, in the aircraft frame
      function lightVec(az, el, heading) {
        var rel = (az - heading) * D2R, e = el * D2R;
        return vnorm([Math.cos(e) * Math.cos(rel), -dir * Math.cos(e) * Math.sin(rel), Math.sin(e)]);
      }
      // colour of a surface: sky ambient, direct sun, and a specular glint toward the eye
      var MOONC = [175, 192, 235];
      function lit(base, n, at, L) {
        var amb = .2 + .38 * P.hemiI, sunK = sun.el > -2 ? clamp((sun.el + 2) / 6, 0, 1) * P.sunI * .38 : 0;
        var diff = Math.max(0, vdot(n, L.sun)) * sunK, dm = Math.max(0, vdot(n, L.moon)) * moonK * .55;
        // glossy paint also picks up the colour of the sky above it
        var c = [0, 1, 2].map(function (i) { return Math.min(242, base[i] * (P.sky[i] / 255 * amb + P.sun[i] / 255 * diff + MOONC[i] / 255 * dm) + P.horizon[i] * .12 * Math.max(0, n[2])); });
        var v = vnorm([-at[0], -at[1], -at[2]]);
        var hv = vnorm([L.sun[0] + v[0], L.sun[1] + v[1], L.sun[2] + v[2]]), hm = vnorm([L.moon[0] + v[0], L.moon[1] + v[1], L.moon[2] + v[2]]);
        var spec = Math.pow(Math.max(0, vdot(n, hv)), 70) * sunK * 1.6;
        var sheen = Math.pow(Math.max(0, vdot(n, hm)), 24) * moonK * .9;
        return { c: c, spec: spec, sheen: sheen };
      }
      // shadows of passing cloud sliding across the wing on cloudy stretches of daylight
      function cloudShadow(ts2, x, y) {
        if (sun.el < 3) return 0;
        var cover = clamp(Math.sin(ts2 * .05) * 1.6 - .2, 0, 1);
        if (!cover) return 0;
        var u2 = ts2 * 9 + x - y * .45;
        var v2 = Math.sin(u2 * .19) + .8 * Math.sin(u2 * .071 + 1.7) + .6 * Math.sin(u2 * .033 + 4);
        return sstep(.5, 1.4, v2) * cover;
      }
      function rgb(c, a) { return "rgba(" + Math.min(255, c[0] | 0) + "," + Math.min(255, c[1] | 0) + "," + Math.min(255, c[2] | 0) + "," + (a == null ? 1 : a) + ")"; }

      function drawWing(cx, k, ts, alt, heading) {
        var mid = H * .5;
        function sp(p) { var dh = Math.sqrt(p[0] * p[0] + p[1] * p[1]); return [cx + dir * Math.atan2(p[0], p[1]) * R2D * k, mid - Math.atan2(p[2], dh) * R2D * k]; }
        // in flight the wing bends up under load; a bump makes it flex
        var bend = alt > 200 ? .55 : 0, flex = shake * .45 * Math.sin(ts * 13);
        function pt(s, f, hz) { return [s.le - f * s.c, s.y, s.z + hz * s.t + (bend + flex) * s.u * s.u]; }
        var L = { sun: lightVec(sun.az, sun.el, heading), moon: lightVec(moon.az, moon.el, heading) }, glint = 0, glintAt = null;
        function poly(pts, fill) { g.beginPath(); pts.forEach(function (p, n2) { var q2 = sp(p); if (n2) g.lineTo(q2[0], q2[1]); else g.moveTo(q2[0], q2[1]); }); g.closePath(); g.fillStyle = fill; g.fill(); }
        function line(a, b, style, w) { var p = sp(a), q2 = sp(b); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q2[0], q2[1]); g.strokeStyle = style; g.lineWidth = w; g.stroke(); }
        g.save();
        g.lineJoin = "round";
        for (var n = WING.length - 2; n >= 0; n--) {
          var a = WING[n], b = WING[n + 1];
          // upper skin from the crest of the leading edge back to the trailing edge
          var p1 = pt(a, .12, .5), p2 = pt(b, .12, .5), p3 = pt(b, 1, .1), p4 = pt(a, 1, .1);
          var nU = vnorm(vcross(vsub(p2, p1), vsub(p4, p1)));
          if (nU[2] < 0) nU = [-nU[0], -nU[1], -nU[2]];
          var ctr = [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2, (p1[2] + p3[2]) / 2], tone = n % 2 ? .97 : 1.01;
          var s1 = lit(PAINT.map(function (v) { return v * tone; }), nU, ctr, L);
          // darker toward the trailing edge, where the skin curves down
          var ga = sp(p1), gb = sp(p4), skin = g.createLinearGradient(ga[0], ga[1], gb[0], gb[1]);
          skin.addColorStop(0, rgb(s1.c)); skin.addColorStop(1, rgb([s1.c[0] * .8, s1.c[1] * .8, s1.c[2] * .82]));
          poly([p1, p2, p3, p4], skin);
          if (s1.spec > .02) poly([p1, p2, p3, p4], "rgba(255,250,240," + Math.min(.85, s1.spec).toFixed(3) + ")");
          if (s1.sheen > .02) poly([p1, p2, p3, p4], "rgba(190,205,245," + Math.min(.5, s1.sheen).toFixed(3) + ")");
          if (s1.spec > glint) { glint = s1.spec; glintAt = sp(ctr); }
          var cs = cloudShadow(ts, ctr[0], ctr[1]);
          if (cs > .02) poly([p1, p2, p3, p4], "rgba(10,14,24," + (cs * .32).toFixed(3) + ")");
          // leading edge: the curved nose catches the light as a bright band
          var e1 = pt(a, 0, 0), e2 = pt(b, 0, 0), nL = vnorm([1, 0, .9]), s2 = lit(PAINT, nL, e1, L);
          var hi = [s2.c[0] * 1.18 + 26, s2.c[1] * 1.18 + 26, s2.c[2] * 1.18 + 28];
          poly([e1, e2, p2, p1], rgb(hi));
          if (s2.spec > .02) poly([e1, e2, p2, p1], "rgba(255,255,255," + Math.min(.9, s2.spec * 1.4).toFixed(3) + ")");
          if (s2.sheen > .02) poly([e1, e2, p2, p1], "rgba(205,218,255," + Math.min(.6, s2.sheen * 1.3).toFixed(3) + ")");
          // panel lines: spoilers and flaps inboard, the aileron outboard, a seam at each rib station
          var shade = "rgba(0,0,0,.28)", w1 = Math.max(.6, 1.6 - a.u);
          line(pt(a, .55, .32), pt(b, .55, .32), shade, w1 * .8);
          line(pt(a, .74, .22), pt(b, .74, .22), shade, w1);
          if (n % 2 === 0 && n > 0) line(pt(a, .12, .5), pt(a, 1, .1), "rgba(0,0,0,.16)", w1 * .7);
          // trailing edge shadow line
          line(p3, p4, "rgba(0,0,0,.45)", w1 * 1.2);
        }
        // tip cap and winglet, canted out and swept back, in the signal colour
        var tip = WING[WING.length - 1];
        var b1 = pt(tip, .1, .5), b2 = pt(tip, 1, .1);
        var t1 = [b1[0] - .9, b1[1] + .4, b1[2] + 2.1], t2 = [t1[0] - .6, t1[1], t1[2]];
        var nW = vnorm([0, -1, .22]), sw = lit(SIGNAL, nW, b1, L);
        var wb = sp(b1), wt = sp(t1), wgr = g.createLinearGradient(wb[0], wb[1], wt[0], wt[1]);
        wgr.addColorStop(0, rgb(sw.c)); wgr.addColorStop(1, rgb([sw.c[0] * .72, sw.c[1] * .66, sw.c[2] * .6]));
        poly([b1, b2, t2, t1], wgr);
        if (sw.spec > .02) poly([b1, b2, t2, t1], "rgba(255,255,255," + Math.min(.8, sw.spec).toFixed(3) + ")");
        line(b1, t1, "rgba(255,255,255,.35)", 1.2);
        // navigation light: red on the left wing, green on the right
        var nav = sp(pt(tip, .02, .3)), col = dir > 0 ? "255,59,48" : "56,255,122", lr = 26, lg;
        lr = 18 + 18 * navI;
        lg = g.createRadialGradient(nav[0], nav[1], 0, nav[0], nav[1], lr);
        lg.addColorStop(0, "rgba(" + col + "," + ((.35 + .6 * (1 - dayness * .6)) * navI).toFixed(2) + ")"); lg.addColorStop(1, "rgba(" + col + ",0)");
        g.fillStyle = lg; g.fillRect(nav[0] - lr, nav[1] - lr, lr * 2, lr * 2);
        g.fillStyle = "rgba(" + col + "," + (.4 + .6 * navI).toFixed(2) + ")"; g.beginPath(); g.arc(nav[0], nav[1], 2, 0, Math.PI * 2); g.fill();
        var sb = sp(pt(tip, .96, .2));
        if (strobe > .01) { g.fillStyle = "rgba(255,255,255," + Math.min(1, strobe).toFixed(2) + ")"; g.beginPath(); g.arc(sb[0], sb[1], 2.5, 0, Math.PI * 2); g.fill(); }
        g.restore();
        return { strobe: sb, glint: glint, glintAt: glintAt || nav };
      }

      /* ---------- light on the cabin wall: each window glows with the colour of the sky outside ---------- */
      function drawGlow(sh) {
        if (!glowMask) return;
        var skyAvg = SF.sky.mix(P.horizon, P.zenith, .45);
        var lum = (skyAvg[0] * .3 + skyAvg[1] * .59 + skyAvg[2] * .11) / 255;
        var warm = clamp(1 - Math.abs(sun.el - 2) / 9, 0, 1);
        var col = SF.sky.mix(SF.sky.mix(skyAvg, [255, 255, 255], .4 * dayness * (1 - warm)), [255, 150, 70], warm * .75);
        var I = .1 + lum * .8;
        var nightness = clamp((-sun.el - 2) / 8, 0, 1);
        if (nightness > 0) { col = SF.sky.mix(col, [96, 132, 235], nightness * Math.min(1, moonK * 1.2 + .55)); I += moonK * .45 * nightness; }
        if (strobe > .01) { col = SF.sky.mix(col, [255, 255, 255], Math.min(1, strobe * .8)); I += strobe * .5 * (1 - dayness * .6); }
        I *= 1 - whiteoutNow * .45;
        if (sh > .02) I *= 1 - sh * .3 * Math.random();   // a flicker in a bump
        gg.setTransform(1, 0, 0, 1, 0, 0);
        gg.clearRect(0, 0, glowCv.width, glowCv.height);
        gg.globalCompositeOperation = "source-over";
        gg.globalAlpha = clamp(I, 0, 1);
        gg.drawImage(glowMask, 0, 0);
        gg.globalAlpha = 1;
        gg.globalCompositeOperation = "source-in";
        gg.fillStyle = SF.sky.css(col);
        gg.fillRect(0, 0, glowCv.width, glowCv.height);
        gg.globalCompositeOperation = "source-over";
        var nightCabin = clamp((-sun.el + 2) / 10, 0, 1);
        if (cabinNight && nightCabin > 0) {
          gg.globalAlpha = nightCabin * (sh > .02 ? 1 - sh * .35 * Math.random() : 1);
          gg.drawImage(cabinNight, 0, 0);
          gg.globalAlpha = 1;
        }
      }
      function sunTime(pos) {
        var d = SF.devSunHour != null ? new Date(SF.devSunHour * 3600000) : new Date(Date.now() + pos.lon / 15 * 3600000);
        return "SUN TIME " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
      }

      var raf = requestAnimationFrame(frame);
      if (SF.dev) host._frame = frame;   // dev: lets a test time a frame
      return {
        destroy: function () { cancelAnimationFrame(raf); host.innerHTML = ""; }
      };
    }
  };
})();

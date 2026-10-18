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

  // soft cloud puff, lit from above, in the palette's cloud colour
  function puff(col, seed, w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d"), r = SF.rng(seed);
    var top = SF.sky.css(SF.sky.mix(col, [255, 255, 255], .25)), base = SF.sky.css(SF.sky.mix(col, [70, 78, 96], .35));
    for (var i = 0; i < 14; i++) {
      var x = w * (.15 + r() * .7), y = h * (.35 + r() * .4), rad = h * (.18 + r() * .22);
      var gr = g.createRadialGradient(x, y - rad * .3, 0, x, y, rad);
      gr.addColorStop(0, top); gr.addColorStop(.55, SF.sky.css(col)); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.globalAlpha = .8;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    // flat, shaded base
    g.globalCompositeOperation = "source-atop";
    var bg = g.createLinearGradient(0, h * .45, 0, h);
    bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(1, base);
    g.globalAlpha = .45; g.fillStyle = bg; g.fillRect(0, 0, w, h);
    return c;
  }
  function streak(col, seed) {
    var c = document.createElement("canvas"); c.width = 256; c.height = 48;
    var g = c.getContext("2d"), r = SF.rng(seed);
    for (var i = 0; i < 18; i++) {
      var x = 20 + r() * 216, y = 14 + r() * 20, len = 40 + r() * 90;
      var gr = g.createLinearGradient(x - len / 2, 0, x + len / 2, 0);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(.5, SF.sky.css(col, .35)); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - len / 2, y, len, 1.5 + r() * 3);
    }
    return c;
  }

  SF.windowView = {
    // getStatus(): the flight status; opts.insets(): free area; opts.seat: seat code like "4A"
    mount: function (host, getStatus, opts) {
      opts = opts || {};
      var q = (SF.store.state.settings.graphics) || "high";
      var reduce = SF.ui.reducedMotion();
      var dir = /[D-F]$/i.test(opts.seat || "A") ? -1 : 1;   // 1: left side, -1: right side
      host.innerHTML = '<canvas class="wv-sky" aria-hidden="true"></canvas><svg class="wv-wall" aria-hidden="true"></svg>' +
        '<div class="glass wv-label"><span class="label">Window · seat ' + SF.esc(opts.seat || "A") + " · looking " + (dir > 0 ? "left" : "right") + '</span><b class="readout readout-sm" id="wvRead">--</b></div>';
      host.setAttribute("role", "img");
      host.setAttribute("aria-label", "View from the cabin window");
      var cv = host.querySelector("canvas"), g = cv.getContext("2d"), wall = host.querySelector("svg"), read = host.querySelector("#wvRead");
      var dpr = Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 1), W = 0, H = 0, wins = [], centre = null;

      /* ---------- the world around the aircraft (km, ft) ---------- */
      var rng = SF.rng(SF.hash(opts.seed || "sky")), clouds = [], cirrus = [], ground = [], stars = [], i;
      var nC = q === "low" ? 90 : q === "balanced" ? 160 : 240;
      for (i = 0; i < nC; i++) {
        var near = i < nC * .3;   // a share close in, for climb and descent through the layer
        clouds.push({ a: (rng() - .5) * 300, r: near ? .3 + rng() * 12 : 8 + rng() * 190, h: 4500 + rng() * 3500, s: near ? .6 + rng() * 1.6 : 2.5 + rng() * 6, v: rng() * 3 | 0 });
      }
      for (i = 0; i < (q === "low" ? 16 : 36); i++) clouds.push({ a: (rng() - .5) * 300, r: 10 + rng() * 190, h: 8000 + rng() * 3000, s: 14 + rng() * 26, v: rng() * 3 | 0, flat: true });
      for (i = 0; i < (q === "low" ? 10 : 22); i++) cirrus.push({ a: (rng() - .5) * 400, r: 8 + rng() * 160, h: 30000 + rng() * 6000, s: 9 + rng() * 14, v: rng() * 2 | 0 });
      // towns: clusters of lights by night, darker patches by day
      for (var tn = 0; tn < (q === "low" ? 14 : 30); tn++) {
        var ta = (rng() - .5) * 400, tr = 4 + rng() * 180, n = 6 + rng() * 26 | 0, spread = 1 + rng() * 4;
        for (i = 0; i < n; i++) ground.push({ a: ta + (rng() - .5) * spread, r: Math.max(.5, tr + (rng() - .5) * spread), k: rng(), lit: rng() < .8 });
      }
      for (i = 0; i < 1600; i++) stars.push({ az: rng() * 360, el: 1 + rng() * 45, m: .3 + rng() * .7 });
      function wrapA(o, span) { if (o.a < -span / 2) o.a += span; else if (o.a > span / 2) o.a -= span; }

      /* ---------- palette and sprites (rebuilt as the light changes) ---------- */
      var P = null, sun = null, sprites = [], streaks = [], lastLight = 0;
      function light(st) {
        var when = new Date();
        if (SF.devSunHour != null) { var d = new Date(); when = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (SF.devSunHour - st.pos.lon / 15) * 3600000); }
        sun = SF.sky.sunAt(st.pos, when);
        P = SF.sky.palette(sun.el);
        sprites = [0, 1, 2].map(function (k) { return puff(P.cloud, 11 + k, 256, 128); });
        streaks = [0, 1].map(function (k) { return streak(P.cloud, 31 + k); });
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
        wall.setAttribute("viewBox", "0 0 " + w + " " + h);
        wall.innerHTML =
          '<defs><linearGradient id="wvWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3934"/><stop offset=".5" stop-color="#2e2c28"/><stop offset="1" stop-color="#1d1c19"/></linearGradient>' +
          '<radialGradient id="wvBezel" cx=".5" cy=".42" r=".62"><stop offset=".8" stop-color="#4a4740"/><stop offset=".93" stop-color="#26241f"/><stop offset="1" stop-color="#3d3a34"/></radialGradient>' +
          '<linearGradient id="wvShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8d3c7"/><stop offset="1" stop-color="#b9b3a6"/></linearGradient></defs>' +
          '<path d="M0 0H' + w + "V" + h + "H0Z" + holes + '" fill="url(#wvWall)" fill-rule="evenodd"/>' + seams + deco;
      }

      /* ---------- drawing ---------- */
      var st = getStatus(), t0 = performance.now(), last = t0, lastHdg = st.heading, bank = 0, bankV = 0, shake = 0, nextBump = 8 + Math.random() * 20;
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
        clouds.forEach(function (c) { c.a -= speed * dt; wrapA(c, 300); });
        cirrus.forEach(function (c) { c.a -= speed * dt; wrapA(c, 400); });
        ground.forEach(function (c) { c.a -= speed * dt; wrapA(c, 400); });
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
        var earth = SF.sky.mix(SF.sky.mix(P.ground, [40, 66, 92], alt > 10000 ? .55 : .15), P.horizon, .25 * (1 - P.lights));
        var eg = g.createLinearGradient(0, hy, 0, hy + 40 * k);
        eg.addColorStop(0, SF.sky.css(SF.sky.mix(P.horizon, earth, .35))); eg.addColorStop(.12, SF.sky.css(SF.sky.mix(P.horizon, earth, .75))); eg.addColorStop(1, SF.sky.css(earth));
        g.fillStyle = eg; g.fillRect(-W, hy, W * 3, H * 3);
        // stars and moon
        if (P.stars > .02) {
          stars.forEach(function (s) {
            var x = cx + dir * wrap180(s.az - viewAz) * k * dir, y = hy - s.el * k;
            g.fillStyle = "rgba(255,255,255," + Math.min(1, P.stars * (s.m + .25)).toFixed(2) + ")";
            var z = s.m > .85 ? 2.4 : s.m > .6 ? 1.7 : 1.2;
            g.fillRect(x, y, z, z);
          });
          var maz = wrap180(sun.az + 180 - viewAz), mel = Math.max(8, -sun.el * .7);
          var mx = cx + maz * k, my = hy - mel * k;
          var mg = g.createRadialGradient(mx, my, 0, mx, my, 40);
          mg.addColorStop(0, "rgba(230,236,255,.35)"); mg.addColorStop(1, "rgba(230,236,255,0)");
          g.fillStyle = mg; g.fillRect(mx - 40, my - 40, 80, 80);
          g.fillStyle = "#e8ebf2"; g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.fill();
        }
        // the sun and its glow
        if (sun.el > -6) {
          var saz = wrap180(sun.az - viewAz), sx = cx + saz * k, sy = hy - sun.el * k;
          var glow = g.createRadialGradient(sx, sy, 0, sx, sy, 60 * k / 4);
          glow.addColorStop(0, SF.sky.css(P.sun, .7)); glow.addColorStop(.08, SF.sky.css(P.sun, .35)); glow.addColorStop(1, SF.sky.css(P.sun, 0));
          g.fillStyle = glow; g.fillRect(sx - 15 * k, sy - 15 * k, 30 * k, 30 * k);
          if (sun.el > -1) { g.fillStyle = SF.sky.css(SF.sky.mix(P.sun, [255, 255, 255], .6)); g.beginPath(); g.arc(sx, sy, Math.max(5, .3 * k), 0, Math.PI * 2); g.fill(); }
        }
        // ground features: fields by day, lights by night
        var night = P.lights;
        ground.forEach(function (o) {
          var p = proj(o.a, o.r, 0, alt, cx, hy, k);
          if (p.d > 190 || Math.abs(p.az) > 70) return;
          var fade = 1 - p.d / 190;
          if (night > .3 && o.lit) {
            var a2 = fade * night * (.55 + .45 * o.k), z = Math.max(1.2, 3.4 - p.d / 50);
            g.fillStyle = "rgba(255,196,110," + (a2 * .25).toFixed(3) + ")";
            g.fillRect(p.x - z * 1.5, p.y - z, z * 4, z * 3);
            g.fillStyle = "rgba(255,222,160," + a2.toFixed(2) + ")";
            g.fillRect(p.x, p.y, z, z * .8);
          } else if (night < .6) {
            var sz = Math.max(1, 1.6 / p.d * R2D * k * .12);
            g.fillStyle = "rgba(" + (o.k > .5 ? "0,0,0," : "255,255,255,") + (fade * .07 * (1 - night)).toFixed(3) + ")";
            g.fillRect(p.x - sz, p.y, sz * 2, Math.max(1, sz * .25));
          }
        });
        // cirrus and cumulus, far to near
        var list = [];
        cirrus.forEach(function (o) { list.push({ o: o, p: proj(o.a, o.r, o.h, alt, cx, hy, k), img: streaks[o.v] }); });
        clouds.forEach(function (o) { list.push({ o: o, p: proj(o.a, o.r, o.h, alt, cx, hy, k), img: sprites[o.v] }); });
        list.sort(function (x, y) { return y.p.d - x.p.d; });
        var whiteout = 0;
        list.forEach(function (it) {
          var p = it.p, o = it.o;
          if (Math.abs(p.az) > 75) return;
          var size = o.s / p.d * R2D * k;
          if (size < 2) return;
          var wpx = size * 2, hpx = wpx * it.img.height / it.img.width;
          if (o.flat) hpx = wpx * Math.max(.05, Math.abs(Math.atan2((o.h - alt) * .0003048, p.d))) * .8;
          var fade = clamp(1 - p.d / (o.h > 20000 ? 260 : 170), 0, 1);
          if (p.d < 1.2 && Math.abs(o.h - alt) < 900) whiteout = Math.max(whiteout, 1 - p.d / 1.2);
          g.globalAlpha = fade * (o.flat ? .55 : it.img === sprites[o.v] ? 1 : .8);
          g.drawImage(it.img, p.x - wpx / 2, p.y - hpx * .6, wpx, hpx);
        });
        g.globalAlpha = 1;
        g.restore();
        // inside a cloud the view greys out; the wing, a few metres away, stays faintly visible
        if (whiteout > 0) { g.fillStyle = SF.sky.css(P.cloud, (whiteout * .8).toFixed(2)); g.fillRect(0, 0, W, H); }
        drawWing(cx, k, now / 1000, alt, st.heading);
        if (whiteout > 0) { g.fillStyle = SF.sky.css(P.cloud, (whiteout * .35).toFixed(2)); g.fillRect(0, 0, W, H); }
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
      function lit(base, n, at, L) {
        var amb = .2 + .38 * P.hemiI, sunK = sun.el > -2 ? clamp((sun.el + 2) / 6, 0, 1) * P.sunI * .38 : 0;
        var diff = Math.max(0, vdot(n, L.sun)) * sunK;
        // glossy paint also picks up the colour of the sky above it
        var c = [0, 1, 2].map(function (i) { return Math.min(242, base[i] * (P.sky[i] / 255 * amb + P.sun[i] / 255 * diff) + P.horizon[i] * .12 * Math.max(0, n[2])); });
        var v = vnorm([-at[0], -at[1], -at[2]]), hv = vnorm([L.sun[0] + v[0], L.sun[1] + v[1], L.sun[2] + v[2]]);
        var spec = Math.pow(Math.max(0, vdot(n, hv)), 70) * sunK * 1.6;
        return { c: c, spec: spec };
      }
      function rgb(c, a) { return "rgba(" + Math.min(255, c[0] | 0) + "," + Math.min(255, c[1] | 0) + "," + Math.min(255, c[2] | 0) + "," + (a == null ? 1 : a) + ")"; }

      function drawWing(cx, k, ts, alt, heading) {
        var mid = H * .5;
        function sp(p) { var dh = Math.sqrt(p[0] * p[0] + p[1] * p[1]); return [cx + dir * Math.atan2(p[0], p[1]) * R2D * k, mid - Math.atan2(p[2], dh) * R2D * k]; }
        // in flight the wing bends up under load; a bump makes it flex
        var bend = alt > 200 ? .55 : 0, flex = shake * .45 * Math.sin(ts * 13);
        function pt(s, f, hz) { return [s.le - f * s.c, s.y, s.z + hz * s.t + (bend + flex) * s.u * s.u]; }
        var L = { sun: lightVec(sun.az, sun.el, heading) };
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
          // leading edge: the curved nose catches the light as a bright band
          var e1 = pt(a, 0, 0), e2 = pt(b, 0, 0), nL = vnorm([1, 0, .9]), s2 = lit(PAINT, nL, e1, L);
          var hi = [s2.c[0] * 1.18 + 26, s2.c[1] * 1.18 + 26, s2.c[2] * 1.18 + 28];
          poly([e1, e2, p2, p1], rgb(hi));
          if (s2.spec > .02) poly([e1, e2, p2, p1], "rgba(255,255,255," + Math.min(.9, s2.spec * 1.4).toFixed(3) + ")");
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
        var nav = sp(pt(tip, .02, .3)), col = dir > 0 ? "255,59,48" : "56,255,122", lr = 26;
        var lg = g.createRadialGradient(nav[0], nav[1], 0, nav[0], nav[1], lr);
        lg.addColorStop(0, "rgba(" + col + "," + (.35 + .55 * P.lights).toFixed(2) + ")"); lg.addColorStop(1, "rgba(" + col + ",0)");
        g.fillStyle = lg; g.fillRect(nav[0] - lr, nav[1] - lr, lr * 2, lr * 2);
        g.fillStyle = "rgb(" + col + ")"; g.beginPath(); g.arc(nav[0], nav[1], 2, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      function sunTime(pos) {
        var d = SF.devSunHour != null ? new Date(SF.devSunHour * 3600000) : new Date(Date.now() + pos.lon / 15 * 3600000);
        return "SUN TIME " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
      }

      var raf = requestAnimationFrame(frame);
      return {
        destroy: function () { cancelAnimationFrame(raf); host.innerHTML = ""; }
      };
    }
  };
})();

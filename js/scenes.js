/* Takeoff and landing scenes.
   A full-screen overlay plays a short sequence when a flight departs and when it lands: 3D with
   three.js r149 (the build the globe already uses) and the shared airliner model, or a 2D side view
   when motion is reduced, WebGL is missing or the library cannot load. Lighting follows the real sun
   at the airport. Click, Space, Enter or Esc skips. Audio, when present, follows the throttle through
   SF.audio.engine(level 0 to 1) and SF.audio.touchdown(strength). */
(function () {
  var SF = (window.SF = window.SF || {});
  var D2R = Math.PI / 180;
  var GEAR_H = 1.9;                       // fuselage centre above the runway with the gear down
  var CLOUD = [48, 64];                   // cloud layer in scene units (1 unit is about 4 m, heights exaggerated)
  var RWY = { z0: -70, z1: 690, w: 18 };  // runway along +Z, touchdown point at z = 0

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function bump(a, peak, b, x) { return x < peak ? sstep(a, peak, x) : 1 - sstep(peak, b, x); }
  function quality() { return (SF.store && SF.store.state.settings.graphics) || "high"; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function sfx(name, v) { try { if (SF.audio && SF.audio[name]) SF.audio[name](v); } catch (e) { /* audio is optional */ } }

  function hasWebGL() { return SF.lib.webgl(); }

  /* ---------- light: the real sun at the airport ---------- */
  function sunAt(ap, date) {
    var s = SF.geo.sun(date, ap.lat, ap.lon);
    return { el: s.elevation, az: SF.geo.bearing(ap, { lat: s.subLat, lon: s.subLon }) };
  }
  // Palette keyed by sun elevation: night, twilight, sunset, golden hour, day.
  var PAL = [
    { el: -18, zenith: "#04060b", horizon: "#0c1324", ground: "#07090c", sun: "#7d8fbf", sunI: .16, sky: "#28344e", gnd: "#0b0d11", hemiI: .32, cloud: "#1b2233", body: .3, stars: 1, lights: 1 },
    { el: -6, zenith: "#0d1530", horizon: "#3d3754", ground: "#101318", sun: "#8f97c4", sunI: .28, sky: "#3f4968", gnd: "#15171c", hemiI: .42, cloud: "#4c4c64", body: .42, stars: .55, lights: 1 },
    { el: 0, zenith: "#24396a", horizon: "#ee8b4f", ground: "#2c2b26", sun: "#ff9b55", sunI: .95, sky: "#7a7fa8", gnd: "#3a3026", hemiI: .5, cloud: "#eaa680", body: .72, stars: 0, lights: .75 },
    { el: 8, zenith: "#3a67a5", horizon: "#f1c593", ground: "#4b5141", sun: "#ffd39d", sunI: 1.25, sky: "#a7bfd9", gnd: "#4d4a3c", hemiI: .62, cloud: "#f6dec6", body: .9, stars: 0, lights: .2 },
    { el: 25, zenith: "#2b6bb4", horizon: "#b9d3ea", ground: "#5c694c", sun: "#fff5e6", sunI: 1.45, sky: "#cfe2f3", gnd: "#5a5a48", hemiI: .7, cloud: "#ffffff", body: 1, stars: 0, lights: 0 }
  ];
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(lerp(a[i], b[i], t)); }); }
  function palette(el) {
    var i = 0;
    while (i < PAL.length - 2 && el > PAL[i + 1].el) i++;
    var a = PAL[i], b = PAL[i + 1], t = clamp((el - a.el) / (b.el - a.el), 0, 1), o = {};
    Object.keys(a).forEach(function (k) { o[k] = typeof a[k] === "string" ? mix(hex(a[k]), hex(b[k]), t) : lerp(a[k], b[k], t); });
    return o;
  }
  function css(c, a) { return a == null ? "rgb(" + c.join(",") + ")" : "rgba(" + c.join(",") + "," + a + ")"; }

  /* ---------- sequences: closed-form motion shared by the 3D and 2D views ---------- */
  var SEQ = {
    takeoff: {
      dur: 11.2,
      white: function (t) { return sstep(10.3, 11.2, t); },
      at: function (t) {
        var a = 20.6, tb = 1.4, tr = 4.8, vr = a * (tr - tb), a2 = 6, s, v, u;
        if (t < tb) { s = 0; v = 0; }
        else if (t < tr) { s = .5 * a * (t - tb) * (t - tb); v = a * (t - tb); }
        else { u = t - tr; s = .5 * a * (tr - tb) * (tr - tb) + vr * u + .5 * a2 * u * u; v = vr + a2 * u; }
        var tl = 5.5, h = 0;
        if (t > tl) { u = t - tl; h = 16 * u - 12 * (1 - Math.exp(-u / .75)); }
        return {
          z: RWY.z0 + 20 + s, v: v, h: h,
          pitch: 11 * sstep(4.8, 5.6, t) - 3 * sstep(9, 11, t),
          gear: 1 - sstep(7, 8.2, t),
          phase: t < tb ? "LINED UP" : t < 4.3 ? "TAKEOFF ROLL" : t < tr ? "V1" : t < 5.6 ? "ROTATE" : t < 7 ? "POSITIVE CLIMB" : t < 8.2 ? "GEAR UP" : "CLIMB",
          thr: t < 1 ? .3 : t < 8.4 ? lerp(.3, 1, sstep(1, 1.8, t)) : lerp(1, .85, sstep(8.4, 9.4, t)),
          kt: v * 150 / 70
        };
      }
    },
    landing: {
      dur: 9.8,
      touches: [[6, 1], [6.42, .45]],
      dark: function (t) { return sstep(9.0, 9.8, t); },
      at: function (t) {
        var tTD = 6, vA = 62, dec = 12, s, v, u;
        if (t < tTD) { s = vA * (t - tTD); v = vA; }
        else { u = Math.min(t - tTD, (vA - 14) / dec); s = vA * u - .5 * dec * u * u + (t - tTD - u) * 14; v = vA - dec * u; }
        var d = -s, h = 0;
        if (d > 0) h = d > 25 ? d * .11 + Math.max(0, d - 220) * .3 : 2.75 * Math.pow(d / 25, 1.6);
        var tb = t - tTD;
        if (tb > 0 && tb < .42) h += .32 * Math.sin(Math.PI * tb / .42);   // the small bounce
        return {
          z: s, v: v, h: h,
          pitch: t < tTD ? lerp(2.5, 6, sstep(25, 0, d)) : 6 * (1 - sstep(6.6, 7.4, t)),
          gear: 1,
          phase: tb >= .9 ? "ROLLOUT" : tb >= 0 ? "TOUCHDOWN" : d < 25 ? "FLARE" : h > CLOUD[0] ? "DESCENT" : "FINAL APPROACH",
          thr: t < tTD ? .45 : t < 6.5 ? .25 : t < 8 ? lerp(.25, .8, sstep(6.5, 6.9, t)) : lerp(.8, .2, sstep(8, 8.6, t)),
          kt: v * 140 / 62
        };
      }
    }
  };

  /* =========================================================
     3D view
     ========================================================= */
  function tc(T, c) { if (typeof c === "string") c = hex(c); return new T.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear(); }
  function canvasTex(T, w, h, draw, repeat) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function radial(g, x, y, r, stops) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Runway surface with markings. Canvas top is the -Z threshold (where takeoffs start and landings
  // cross); text there is turned so it reads upright to a pilot heading +Z.
  function runwayTex(T, des, recip) {
    return canvasTex(T, 128, 4096, function (g, w, h) {
      var L = RWY.z1 - RWY.z0, py = h / L, px = w / RWY.w, r = SF.rng(5), i;
      g.fillStyle = "#3b3d41"; g.fillRect(0, 0, w, h);
      for (i = 0; i < 9000; i++) { g.fillStyle = r() > .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.09)"; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
      function end(label) {
        // drawn with the threshold at the canvas bottom, runway extending upwards
        var i, k;
        g.fillStyle = "rgba(12,12,14,.35)";   // tyre marks
        for (i = 0; i < 26; i++) g.fillRect(w / 2 + (r() > .5 ? 1 : -1) * (14 + r() * 10) - 4, h - (60 + r() * 140) * py, 6 + r() * 6, (20 + r() * 50) * py);
        g.fillStyle = "#e9e8e2";
        [-7.2, -5.6, -4, -2.4, 1.7, 3.3, 4.9, 6.5].forEach(function (x) { g.fillRect(w / 2 + x * px, h - 30 * py, .7 * px, 26 * py); });
        g.save();
        g.font = "bold 100px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
        var tw = g.measureText(label).width;
        g.translate(w / 2, h - 40 * py);
        g.scale(9 * px / tw, 18 * py / 72);
        g.fillText(label, 0, 0);
        g.restore();
        for (k = 0; k < 3; k++) [-1, 1].forEach(function (s) {
          for (var n = 0; n < 3 - k; n++) g.fillRect(w / 2 + s * (3 + n * 1.2) * px - (s < 0 ? .8 * px : 0), h - (150 + k * 75) * py, .8 * px, 18 * py);
        });
        [-1, 1].forEach(function (s) { g.fillRect(w / 2 + s * 4.5 * px - (s < 0 ? 1.6 * px : 0), h - 300 * py, 1.6 * px, 36 * py); });
      }
      g.fillStyle = "#e9e8e2";
      g.fillRect(px * .6, 0, 2, h); g.fillRect(w - px * .6 - 2, 0, 2, h);
      for (var y = 70 * py; y < h - 70 * py; y += 50 * py) g.fillRect(w / 2 - 1.5, y, 3, 30 * py);
      end(recip);
      g.save(); g.translate(w, h); g.rotate(Math.PI); end(des); g.restore();
    });
  }

  function addGear(T, parent, lowPoly) {
    var strutM = new T.MeshStandardMaterial({ color: 0x9da3aa, metalness: .6, roughness: .4 });
    var tyreM = new T.MeshStandardMaterial({ color: 0x1b1c1f, roughness: .9 });
    var seg = lowPoly ? 10 : 18, legs = [];
    // [x, z, wheel radius, strut length, nose]
    [[0, 3.3, .26, 1.14, 1], [1.25, .3, .3, 1.1, 0], [-1.25, .3, .3, 1.1, 0]].forEach(function (d) {
      var pivot = new T.Group();
      pivot.position.set(d[0], -.5, d[1]);
      var strut = new T.Mesh(new T.CylinderGeometry(.07, .07, d[3], 8), strutM);
      strut.position.y = -d[3] / 2;
      pivot.add(strut);
      [-1, 1].forEach(function (s) {
        var w = new T.Mesh(new T.CylinderGeometry(d[2], d[2], .2, seg), tyreM);
        w.rotation.z = Math.PI / 2;
        w.position.set(s * .17, -d[3], 0);
        pivot.add(w);
      });
      parent.add(pivot);
      legs.push({ g: pivot, nose: !!d[4], side: Math.sign(d[0]) });
    });
    return function (k) {   // 1 down, 0 stowed
      var a = (1 - k) * Math.PI / 2;
      legs.forEach(function (l) {
        if (l.nose) l.g.rotation.x = -a; else l.g.rotation.z = -l.side * a;
        l.g.visible = k > .03;
      });
    };
  }

  function build3D(T, kind, c) {
    var q = c.q, P = c.P, low = q === "low";
    var renderer = new T.WebGLRenderer({ antialias: !low, powerPreference: "high-performance" });
    if (!renderer.getContext()) throw new Error("WebGL unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.75 : q === "balanced" ? 1.25 : 1));
    renderer.outputEncoding = T.sRGBEncoding;
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(42, 1, .5, 7000);
    scene.fog = new T.Fog(tc(T, P.horizon), 260, 2600);
    var rng = SF.rng(17), i;

    // sun direction in scene space: +Z is the runway heading, +X is the pilot's left
    var rel = (c.sun.az - c.hdg) * D2R, el = c.sun.el * D2R;
    var sunDir = new T.Vector3(-Math.sin(rel) * Math.cos(el), Math.sin(el), Math.cos(rel) * Math.cos(el)).normalize();
    var lightDir = c.sun.el > -4 ? sunDir.clone().setY(Math.max(sunDir.y, .12)).normalize() : new T.Vector3(.35, .8, -.45).normalize();

    /* sky dome and stars */
    function v3(col) { return new T.Vector3(col[0] / 255, col[1] / 255, col[2] / 255); }
    var sky = new T.Mesh(new T.SphereGeometry(3200, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: v3(P.zenith) }, horizon: { value: v3(P.horizon) }, sunColor: { value: v3(P.sun) },
        sunDir: { value: sunDir }, sunAmt: { value: clamp((c.sun.el + 6) / 10, 0, 1) }
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: [
        "uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunAmt; varying vec3 vDir;",
        "void main(){",
        "  vec3 d = normalize(vDir);",
        "  vec3 c = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.45)) : horizon * (1.0 - clamp(-d.y * 3.0, 0.0, 0.15));",
        "  float s = max(dot(d, normalize(sunDir)), 0.0);",
        "  c += sunColor * (pow(s, 1200.0) * 2.5 + pow(s, 14.0) * 0.32 + pow(s, 3.0) * 0.1) * sunAmt;",
        "  gl_FragColor = vec4(c, 1.0);",
        "}"
      ].join("\n")
    }));
    sky.renderOrder = -2;
    scene.add(sky);
    var stars = null;
    if (P.stars > .02) {
      var ns = low ? 500 : 1400, sp = new Float32Array(ns * 3);
      for (i = 0; i < ns; i++) {
        var th = rng() * Math.PI * 2, y = .05 + rng() * .95, rr = Math.sqrt(1 - y * y);
        sp[i * 3] = Math.cos(th) * rr * 3000; sp[i * 3 + 1] = y * 3000; sp[i * 3 + 2] = Math.sin(th) * rr * 3000;
      }
      var sg = new T.BufferGeometry();
      sg.setAttribute("position", new T.BufferAttribute(sp, 3));
      stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .9 * P.stars, fog: false, depthWrite: false }));
      stars.renderOrder = -1;
      scene.add(stars);
    }

    /* light */
    var hemi = new T.HemisphereLight(tc(T, P.sky), tc(T, P.gnd), P.hemiI);
    var sunL = new T.DirectionalLight(tc(T, P.sun), P.sunI);
    scene.add(hemi, sunL, sunL.target);

    /* textures */
    var glow = canvasTex(T, 64, 64, function (g) { radial(g, 32, 32, 32, [[0, "rgba(255,255,255,1)"], [.2, "rgba(255,255,255,.7)"], [.5, "rgba(255,255,255,.14)"], [1, "rgba(255,255,255,0)"]]); });
    var puff = canvasTex(T, 128, 128, function (g) {
      var r = SF.rng(23);
      for (var k = 0; k < 9; k++) {
        var x = 34 + r() * 60, y = 40 + r() * 46, rad = 22 + r() * 22;
        radial(g, x, y, rad, [[0, "rgba(255,255,255,.55)"], [.6, "rgba(255,255,255,.22)"], [1, "rgba(255,255,255,0)"]]);
      }
    });
    var fields = canvasTex(T, 512, 512, function (g, w, h) {
      var r = SF.rng(11), k;
      g.fillStyle = "#c9c9be"; g.fillRect(0, 0, w, h);
      for (k = 0; k < 80; k++) {
        var v = 150 + (r() * 95 | 0);
        g.fillStyle = "rgb(" + (v * .95 | 0) + "," + v + "," + (v * .84 | 0) + ")";
        g.fillRect(r() * w, r() * h, 40 + r() * 170, 30 + r() * 130);
      }
      g.strokeStyle = "rgba(55,66,45,.3)"; g.lineWidth = 2;
      for (k = 0; k < 24; k++) { g.beginPath(); var x0 = r() * w, y0 = r() * h; g.moveTo(x0, y0); g.lineTo(x0 + (r() - .5) * 300, y0 + (r() - .5) * 40); g.stroke(); }
      for (k = 0; k < 6000; k++) { g.fillStyle = r() > .5 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.07)"; g.fillRect(r() * w, r() * h, 2, 2); }
    }, [70, 70]);

    /* ground, verge, runway, taxiway, apron */
    function flat(wd, ln, mat, x, y, z) {
      var m = new T.Mesh(new T.PlaneGeometry(wd, ln), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
      scene.add(m);
      return m;
    }
    function off(mat, f) { mat.polygonOffset = true; mat.polygonOffsetFactor = f; mat.polygonOffsetUnits = f; return mat; }
    var gcol = tc(T, P.ground);
    flat(9000, 9000, new T.MeshStandardMaterial({ color: gcol, map: fields, roughness: 1, metalness: 0 }), 0, 0, 0);
    flat(80, 1100, off(new T.MeshStandardMaterial({ color: gcol.clone().multiplyScalar(1.25), roughness: 1 }), -1), 0, 0, 310);
    var rwyLen = RWY.z1 - RWY.z0, rwyMid = (RWY.z0 + RWY.z1) / 2;
    flat(RWY.w, rwyLen, off(new T.MeshStandardMaterial({ map: runwayTex(T, c.des, c.recip), roughness: .92 }), -3), 0, 0, rwyMid);
    var asphalt = off(new T.MeshStandardMaterial({ color: 0x34363a, roughness: .95 }), -2);
    flat(10, rwyLen - 40, asphalt, -46, 0, rwyMid);
    flat(30, 10, asphalt, -26, 0, 120);
    flat(30, 10, asphalt, -26, 0, 520);
    flat(90, 240, off(new T.MeshStandardMaterial({ color: 0x6f7276, roughness: .95 }), -2), -100, 0, 200);

    /* buildings: terminal with lit windows at night, tower, hangar */
    var concrete = new T.MeshStandardMaterial({ color: 0x9ca1a6, roughness: .85 });
    var winTex = canvasTex(T, 256, 64, function (g, w, h) {
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      var r = SF.rng(4);
      for (var y = 10; y < h - 8; y += 18) for (var x = 4; x < w - 6; x += 9) { g.fillStyle = r() > .3 ? "#ffd9a0" : "#5a4630"; g.fillRect(x, y, 6, 8); }
    });
    var term = new T.Mesh(new T.BoxGeometry(100, 12, 28), new T.MeshStandardMaterial({ color: 0xa9adb2, roughness: .7, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: .9 * P.lights }));
    term.position.set(-128, 6, 200); term.rotation.y = Math.PI / 2;
    var tower = new T.Mesh(new T.CylinderGeometry(2.2, 2.8, 26, 10), concrete);
    tower.position.set(-70, 13, 360);
    var cab = new T.Mesh(new T.CylinderGeometry(4.6, 3.6, 4.4, 8), new T.MeshStandardMaterial({ color: 0x1a222c, metalness: .5, roughness: .25, emissive: 0x7fb0d0, emissiveIntensity: .35 * P.lights }));
    cab.position.set(-70, 28, 360);
    var hangar = new T.Mesh(new T.BoxGeometry(46, 16, 44), concrete);
    hangar.position.set(-112, 8, 470);
    scene.add(term, tower, cab, hangar);

    /* runway lights: fixtures (instanced, streak at speed) and glow points */
    var glowPos = [], glowCol = [];
    function lightSet(list, color, size) {
      var m = new T.InstancedMesh(new T.BoxGeometry(size, size * .7, size), new T.MeshBasicMaterial({ color: tc(T, color), toneMapped: false }), list.length);
      var dummy = new T.Object3D(), col = tc(T, color);
      list.forEach(function (p, k) {
        dummy.position.set(p[0], p[1], p[2]); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
        glowPos.push(p[0], p[1] + .15, p[2]); glowCol.push(col.r, col.g, col.b);
      });
      scene.add(m);
      return { mesh: m, list: list, size: size, dummy: dummy, len: 0 };
    }
    var edge = [], edgeY = [], centre = [], z;
    for (z = RWY.z0; z <= RWY.z1; z += 12) [-1, 1].forEach(function (s) { (z > RWY.z1 - 150 ? edgeY : edge).push([s * (RWY.w / 2 + .8), .25, z]); });
    for (z = RWY.z0 + 10; z < RWY.z1; z += 15) centre.push([0, .05, z]);
    var thr = [], endL = [], appr = [], taxi = [];
    for (i = 0; i < 10; i++) { thr.push([-9 + i * 2, .2, RWY.z0]); endL.push([-9 + i * 2, .2, RWY.z1]); }
    for (var k2 = 1; k2 <= 12; k2++) for (i = -2; i <= 2; i++) appr.push([i * 2, .5 + k2 * .12, RWY.z0 - 15 * k2]);
    for (z = RWY.z0 + 30; z < RWY.z1 - 20; z += 20) [-1, 1].forEach(function (s) { taxi.push([-46 + s * 5.5, .2, z]); });
    var streaky = [lightSet(edge, "#fff4dc", .32), lightSet(edgeY, "#ffcf6e", .32), lightSet(centre, "#f4f6ff", .26)];
    lightSet(thr, "#43ff8a", .36); lightSet(endL, "#ff3b30", .36); lightSet(appr, "#fff1d0", .36); lightSet(taxi, "#4b8bff", .26);
    var gg = new T.BufferGeometry();
    gg.setAttribute("position", new T.Float32BufferAttribute(glowPos, 3));
    gg.setAttribute("color", new T.Float32BufferAttribute(glowCol, 3));
    scene.add(new T.Points(gg, new T.PointsMaterial({ size: 2.4, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: lerp(.18, 1, P.lights), toneMapped: false })));
    // the sequenced approach strobe ("rabbit") at dusk and night
    var rabbit = null;
    if (P.lights > .3) {
      rabbit = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      rabbit.scale.set(5, 5, 1);
      scene.add(rabbit);
    }
    function setStreak(L) {
      streaky.forEach(function (s) {
        if (Math.abs(L - s.len) < .02) return;
        s.len = L;
        s.list.forEach(function (p, k) {
          s.dummy.position.set(p[0], p[1], p[2]); s.dummy.scale.set(1, 1, 1 + L / s.size); s.dummy.updateMatrix();
          s.mesh.setMatrixAt(k, s.dummy.matrix);
        });
        s.mesh.instanceMatrix.needsUpdate = true;
      });
    }

    /* city lights on the ground at dusk and night */
    if (P.lights > .2) {
      var cp = [], nc = low ? 360 : q === "balanced" ? 900 : 1500;
      for (var cl = 0; cl < 16 && cp.length / 3 < nc; cl++) {
        var ang = rng() * Math.PI * 2, dist = 520 + rng() * 2200, cx = Math.cos(ang) * dist, cz = 310 + Math.sin(ang) * dist, spread = 70 + rng() * 170;
        for (i = 0; i < nc / 16; i++) cp.push(cx + (rng() + rng() - 1) * spread, .4, cz + (rng() + rng() - 1) * spread);
      }
      var cg = new T.BufferGeometry();
      cg.setAttribute("position", new T.Float32BufferAttribute(cp, 3));
      scene.add(new T.Points(cg, new T.PointsMaterial({ size: 3.4, map: glow, color: tc(T, "#ffc77a"), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .85 * P.lights, toneMapped: false })));
    }

    /* clouds */
    var cloudMat = new T.SpriteMaterial({ map: puff, color: tc(T, P.cloud), transparent: true, depthWrite: false, opacity: .95 });
    var nCloud = low ? 70 : q === "balanced" ? 150 : 260;
    for (i = 0; i < nCloud; i++) {
      var sc = 50 + rng() * 85, cs = new T.Sprite(cloudMat);
      cs.scale.set(sc * 1.6, sc, 1);
      cs.position.set((rng() - .5) * 900, CLOUD[0] + 4 + rng() * (CLOUD[1] - CLOUD[0] - 8), -1200 + rng() * 2800);
      scene.add(cs);
    }

    /* the aircraft: rig at the main-wheel contact point, pitch about the wheels */
    var rig = new T.Group(), pitchG = new T.Group();
    var plane = SF.models.airliner(T, { lowPoly: low });
    plane.position.set(0, GEAR_H, -.3);
    pitchG.add(plane); rig.add(pitchG); scene.add(rig);
    plane.traverse(function (o) {
      if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.envMapIntensity = 1; }
    });
    var setGear = addGear(T, plane, low);
    function sprite(color, size, op) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: glow, color: tc(T, color), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: op, toneMapped: false, fog: false }));
      s.scale.set(size, size, 1);
      plane.add(s);
      return s;
    }
    var navOp = .35 + .65 * P.lights;
    sprite("#ff3b30", 1.5, navOp).position.set(6.65, -.12, -1.6);
    sprite("#38ff7a", 1.5, navOp).position.set(-6.65, -.12, -1.6);
    var beacon = [sprite("#ff2a20", 1.8, 0), sprite("#ff2a20", 1.8, 0)];
    beacon[0].position.set(0, .74, -.6); beacon[1].position.set(0, -.74, .2);
    var strobe = [sprite("#ffffff", 2.4, 0), sprite("#ffffff", 2.4, 0), sprite("#ffffff", 1.8, 0)];
    strobe[0].position.set(6.7, -.1, -1.75); strobe[1].position.set(-6.7, -.1, -1.75); strobe[2].position.set(0, .45, -5.8);
    var landOp = .4 + .6 * P.lights;
    [[1.3, -.48, 2.1], [-1.3, -.48, 2.1], [0, -.5, 4.4]].forEach(function (p) { sprite("#fff6e0", 2.4, landOp).position.set(p[0], p[1], p[2]); });
    if (P.lights > .35) {
      var spot = new T.SpotLight(0xfff1d6, 2.4 * P.lights, 300, .36, .7, 1);
      spot.position.set(0, -.6, 4.5); spot.target.position.set(0, -14, 70);
      plane.add(spot, spot.target);
    }
    // contact shadow
    var blobTex = canvasTex(T, 128, 128, function (g) { radial(g, 64, 64, 64, [[0, "rgba(0,0,0,.75)"], [.55, "rgba(0,0,0,.35)"], [1, "rgba(0,0,0,0)"]]); });
    var blob = new T.Mesh(new T.PlaneGeometry(15, 13), off(new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), -4));
    blob.rotation.x = -Math.PI / 2;
    scene.add(blob);
    var shadowK = clamp(c.sun.el / 15, 0, 1) * .45 + .2;

    /* tyre smoke */
    var smoke = [], smokeMat = new T.SpriteMaterial({ map: puff, color: tc(T, mix([214, 214, 210], P.horizon, .25).map(function (v) { return v * (.5 + .5 * P.body); })), transparent: true, depthWrite: false });
    function touch(strength) {
      jolt = .18 * strength;
      var n = Math.round((low ? 5 : 9) * strength) + 2;
      [-1, 1].forEach(function (s) {
        for (var k = 0; k < n; k++) {
          var m = new T.Sprite(smokeMat.clone());
          m.position.set(s * 1.25 + (rng() - .5) * .6, .5, rig.position.z + .3);
          m.userData = { v: new T.Vector3(s * (.6 + rng() * 1.4), .8 + rng() * 1.6, 4 + rng() * 6), age: 0, life: 1.8 + rng() * 1.2, k: strength };
          scene.add(m);
          smoke.push(m);
        }
      });
    }
    var jolt = 0;

    /* camera choreography: offsets from the aircraft (x is the pilot's left), absolute height (ya),
       or a fixed world position with a telephoto lens (w) */
    var KEYS = {
      takeoff: [
        { t: 0, x: 11, y: .7, z: 24, fov: 38 }, { t: 1.4, x: 10, y: .5, z: 21, fov: 38 },
        { t: 3.6, x: 6, y: .4, z: -15, fov: 46 },
        { t: 5.0, x: 14, y: 2.4, z: 2, ya: 1, fov: 40 }, { t: 6.6, x: 15, y: 2.6, z: -3, ya: 1, fov: 40 },
        { t: 8.6, x: -8, y: 4, z: -28, fov: 48 }, { t: 11.2, x: -3, y: 18, z: -75, fov: 52 }
      ],
      landing: [
        { t: 0, x: -7, y: 5, z: -30, fov: 46 }, { t: 1.55, x: -6, y: 3, z: -24, fov: 46 },
        { t: 1.55, w: 1, x: 17, y: 2.2, z: 46 }, { t: 7.4, w: 1, x: 17, y: 2.2, z: 46 },
        { t: 8.8, x: -9, y: 2, z: -22, fov: 46 }, { t: 9.8, x: -10, y: 3, z: -28, fov: 48 }
      ]
    }[kind];
    var target = new T.Vector3();
    function pose(k) {
      var p = new T.Vector3();
      if (k.w) p.set(k.x, k.y, k.z);
      else p.set(rig.position.x + k.x, k.ya ? k.y : rig.position.y + GEAR_H + k.y, rig.position.z + k.z);
      return { p: p, fov: k.w ? clamp(2 * Math.atan(16 / Math.max(1, p.distanceTo(target))) / D2R, 14, 46) : k.fov };
    }
    function placeCamera(t) {
      var i = 0;
      while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
      var a = KEYS[i], b = KEYS[i + 1];
      var f = t >= b.t ? 1 : b.t - a.t < 1e-6 ? 1 : sstep(a.t, b.t, t);
      var pa = pose(a), pb = pose(b);
      camera.position.copy(pa.p.lerp(pb.p, f));
      camera.fov = lerp(pa.fov, pb.fov, f);
    }

    var W = 1, H = 1;
    return {
      el: renderer.domElement,
      touch: touch,
      resize: function (w, h) { W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
      render: function (t, dt, st) {
        rig.position.set(0, st.h, st.z);
        pitchG.rotation.x = -st.pitch * D2R;
        setGear(st.gear);
        var onGround = st.h < .4;
        setStreak(onGround ? clamp(st.v / 70, 0, 1) * 2.6 : 0);
        var bOn = (t % 1.2) < .12, sOn = ((t + .5) % 1.1) < .06;
        beacon.forEach(function (b) { b.material.opacity = bOn ? .95 : 0; });
        strobe.forEach(function (s) { s.material.opacity = sOn ? 1 : 0; });
        if (rabbit) { var rk = 12 - Math.floor((t * 9) % 12); rabbit.position.set(0, 1.2, RWY.z0 - 15 * rk); rabbit.material.opacity = P.lights; }
        blob.position.set(0, .06, st.z + .2);
        blob.material.opacity = shadowK * (1 - clamp(st.h / 22, 0, 1));
        // smoke
        for (var k = smoke.length - 1; k >= 0; k--) {
          var m = smoke[k], u = m.userData;
          u.age += dt;
          if (u.age >= u.life) { scene.remove(m); m.material.dispose(); smoke.splice(k, 1); continue; }
          var a = u.age / u.life, s = lerp(1.4, 9, 1 - Math.pow(1 - a, 2.2)) * (.6 + .4 * u.k);
          m.position.addScaledVector(u.v, dt);
          u.v.multiplyScalar(1 - dt * 1.2);
          m.scale.set(s, s * .75, 1);
          m.material.opacity = .7 * Math.pow(1 - a, 1.5);
        }
        // camera
        target.set(0, st.h + GEAR_H + .3, st.z + 1.5);
        placeCamera(t);
        var shake = onGround && st.v > 1 ? (.02 + .03 * clamp(st.v / 70, 0, 1)) : 0;
        jolt = Math.max(0, jolt - dt * .6);
        camera.position.y += (shake + jolt) * (Math.sin(t * 37) + .6 * Math.sin(t * 23.3 + 1));
        camera.position.y = Math.max(.8, camera.position.y);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        sky.position.copy(camera.position);
        if (stars) stars.position.copy(camera.position);
        sunL.position.copy(rig.position).addScaledVector(lightDir, 200);
        sunL.target.position.copy(rig.position);
        renderer.render(scene, camera);
        // white-out while the camera is inside the cloud layer, and over the landing camera cut
        var cy = camera.position.y;
        var veil = sstep(CLOUD[0] - 4, CLOUD[0] + 2, cy) * (1 - sstep(CLOUD[1] - 2, CLOUD[1] + 4, cy)) * .92;
        if (kind === "landing") veil = Math.max(veil, bump(1.2, 1.55, 1.95, t));
        return veil;
      },
      destroy: function () {
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach(function (m) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); });
        });
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      }
    };
  }

  /* =========================================================
     2D side view (reduced motion, no WebGL, library offline)
     ========================================================= */
  function build2D(kind, c) {
    var P = c.P, cv = document.createElement("canvas"), g = cv.getContext("2d");
    var W = 1, H = 1, dpr = Math.min(window.devicePixelRatio || 1, 2), r = SF.rng(3), i;
    var stars = [], clouds = [], puffs = [], lastZ = 0;
    for (i = 0; i < 140; i++) stars.push([r(), r() * .62, .3 + r() * .7]);
    for (i = 0; i < 54; i++) clouds.push({ z: -600 + r() * 1900, h: CLOUD[0] + 2 + r() * (CLOUD[1] - CLOUD[0] - 4), rx: 22 + r() * 34, ry: 4 + r() * 5, par: .75 + r() * .5, seed: r() * 10 });
    function shade(base, f) { return mix(base.map(function (v) { return v * f; }), P.sun, .12); }
    var body = shade([242, 239, 232], P.body), grey = shade([196, 199, 204], P.body), dark = shade([42, 45, 51], P.body);
    var far = mix(P.horizon, P.ground, .35), near = mix(P.horizon, P.ground, .68);

    function hills(color, amp, base, par, seed, x) {
      g.fillStyle = css(color);
      g.beginPath(); g.moveTo(0, H);
      for (var sx = 0; sx <= W + 8; sx += 8) {
        var wx = sx + x * par;
        g.lineTo(sx, base - amp * (.55 + .45 * Math.sin(wx * .004 + seed)) * (.6 + .4 * Math.sin(wx * .0011 + seed * 2)));
      }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    function cloud(cx, cy, k, cl) {
      for (var j = 0; j < 3; j++) {
        var x = cx + (j - 1) * cl.rx * .6 * k, y = cy + Math.sin(cl.seed + j) * cl.ry * .4 * k, rx = cl.rx * k * (.7 + .15 * j), ry = cl.ry * k * 1.6;
        g.save(); g.translate(x, y); g.scale(1, ry / rx);
        var gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, css(P.cloud, .9)); gr.addColorStop(.6, css(P.cloud, .5)); gr.addColorStop(1, css(P.cloud, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    // side profile facing right, units of the 3D model (x forward, y down), origin at the fuselage centre
    function plane(t, gear) {
      g.fillStyle = css(grey);   // far wing and stabiliser
      g.beginPath(); g.moveTo(1.4, .2); g.lineTo(-1.6, .05); g.lineTo(-2.1, .2); g.lineTo(1.2, .38); g.closePath(); g.fill();
      if (gear > .03) {
        g.strokeStyle = css(grey); g.lineWidth = .1;
        [[.3, 1.1, .3], [3.3, 1.14, .26]].forEach(function (l) {
          var len = l[1] * gear;
          g.beginPath(); g.moveTo(l[0], .5); g.lineTo(l[0], .5 + len); g.stroke();
          g.fillStyle = "#1b1c1f"; g.beginPath(); g.arc(l[0], .5 + len, l[2] * gear, 0, Math.PI * 2); g.fill();
        });
      }
      g.fillStyle = css(body);
      g.beginPath();
      g.moveTo(-5.0, -.35); g.lineTo(-2.6, -.62); g.lineTo(3.4, -.62);
      g.bezierCurveTo(4.4, -.62, 5.0, -.3, 5.05, .05);
      g.bezierCurveTo(5.0, .4, 4.4, .62, 3.4, .62);
      g.lineTo(-2.2, .62);
      g.bezierCurveTo(-3.4, .62, -4.4, .1, -5.0, -.2);
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-2.9, -.6); g.lineTo(-4.5, -2.9); g.lineTo(-5.3, -2.9); g.lineTo(-4.95, -.35); g.closePath(); g.fill();
      g.fillStyle = "#ffc400";
      g.beginPath(); g.moveTo(-4.05, -2.25); g.lineTo(-4.5, -2.9); g.lineTo(-5.3, -2.9); g.lineTo(-5.18, -2.25); g.closePath(); g.fill();
      g.fillStyle = css(grey);
      g.beginPath(); g.moveTo(-3.6, -.25); g.lineTo(-5.1, -.4); g.lineTo(-5.25, -.18); g.lineTo(-3.7, -.08); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(1.7, .32); g.lineTo(-1.9, .2); g.lineTo(-2.5, .36); g.lineTo(1.5, .5); g.closePath(); g.fill();
      g.fillStyle = css(body);   // engine
      g.beginPath(); g.moveTo(.4, .62); g.lineTo(2.3, .55); g.lineTo(2.35, 1.2); g.lineTo(.5, 1.12); g.closePath(); g.fill();
      g.fillStyle = css(dark); g.fillRect(2.25, .58, .14, .6);
      g.fillStyle = css(dark);   // windows and windscreen
      for (var x = -2.2; x < 3.1; x += .34) g.fillRect(x, -.24, .14, .16);
      g.beginPath(); g.moveTo(4.1, -.42); g.lineTo(4.6, -.3); g.lineTo(4.7, -.12); g.lineTo(4.15, -.18); g.closePath(); g.fill();
      if ((t % 1.2) < .12) { g.fillStyle = "#ff2a20"; g.beginPath(); g.arc(-.5, -.72, .14, 0, Math.PI * 2); g.fill(); }
      if (((t + .5) % 1.1) < .06) { g.fillStyle = "#fff"; g.beginPath(); g.arc(-5.6, -.4, .16, 0, Math.PI * 2); g.fill(); }
    }

    return {
      el: cv,
      touch: function (strength) { puffs.push({ z: lastZ + .3, age: 0, life: 2.2, k: strength }); },
      resize: function (w, h) { W = w; H = h; cv.width = w * dpr; cv.height = h * dpr; },
      render: function (t, dt, st) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        var k = clamp(W * .02, 14, 28), px = W * .4, gy = H * .76;
        lastZ = st.z;
        var hf = (gy - H * .42) / k - GEAR_H, camH = Math.max(0, st.h - hf), groundY = gy + camH * k;
        function sx(z) { return px + (z - st.z) * k; }
        // sky, stars, sun
        var sg = g.createLinearGradient(0, 0, 0, Math.max(groundY, H * .5));
        sg.addColorStop(0, css(P.zenith)); sg.addColorStop(1, css(P.horizon));
        g.fillStyle = sg; g.fillRect(0, 0, W, H);
        if (P.stars > .02) stars.forEach(function (s) { g.fillStyle = "rgba(255,255,255," + (s[2] * P.stars).toFixed(2) + ")"; g.fillRect(s[0] * W, s[1] * H, 1.5, 1.5); });
        if (c.sun.el > -4) {
          var sy = groundY - clamp(c.sun.el / 45, -.05, 1) * (H * .7), sxp = W * .78;
          var sgr = g.createRadialGradient(sxp, sy, 0, sxp, sy, H * .35);
          sgr.addColorStop(0, css(P.sun, .55)); sgr.addColorStop(.08, css(P.sun, .25)); sgr.addColorStop(1, css(P.sun, 0));
          g.fillStyle = sgr; g.fillRect(0, 0, W, H);
          g.fillStyle = css(mix(P.sun, [255, 255, 255], .5)); g.beginPath(); g.arc(sxp, sy, 14, 0, Math.PI * 2); g.fill();
        }
        // terrain
        hills(far, 60, groundY - 4, .05 * k, 1.3, st.z);
        hills(near, 30, groundY - 1, .2 * k, 4.1, st.z);
        if (groundY < H + 40) {
          g.fillStyle = css(P.ground); g.fillRect(0, groundY, W, H - groundY + 1);
          g.fillStyle = "#2c2e33"; g.fillRect(sx(RWY.z0), groundY - 1, (RWY.z1 - RWY.z0) * k, 9);
          g.fillStyle = "rgba(233,232,226,.85)";
          for (var z = RWY.z0 + 70; z < RWY.z1 - 70; z += 50) { var a = sx(z); if (a > -40 && a < W + 40) g.fillRect(a, groundY + 3, 30 * k * .45, 2); }
          var streak = st.h < .4 ? clamp(st.v / 70, 0, 1) * 34 : 0;
          for (z = RWY.z0; z <= RWY.z1; z += 12) {
            var lx = sx(z);
            if (lx < -60 || lx > W + 60) continue;
            var col = z > RWY.z1 - 150 ? [255, 207, 110] : [255, 244, 220];
            if (P.lights > .2) { var lg = g.createRadialGradient(lx, groundY - 1, 0, lx, groundY - 1, 9); lg.addColorStop(0, css(col, .8 * P.lights)); lg.addColorStop(1, css(col, 0)); g.fillStyle = lg; g.fillRect(lx - 9, groundY - 10, 18, 18); }
            g.fillStyle = css(col);
            g.fillRect(lx - (streak ? streak : 1.5), groundY - 2.5, streak ? streak + 1.5 : 3, 3);
          }
        }
        var planeY = gy - (st.h - camH + GEAR_H) * k;
        clouds.forEach(function (cl) { if (cl.par < 1) cloud(px + (cl.z - st.z) * k * cl.par, gy - (cl.h - camH) * k, k * .9, cl); });
        // tyre smoke
        puffs.forEach(function (p) {
          p.age += dt;
          if (p.age > p.life) return;
          var a = p.age / p.life, rad = (6 + 26 * (1 - Math.pow(1 - a, 2))) * (.6 + .4 * p.k);
          var x = sx(p.z) + p.age * 14, y = groundY - 4 - p.age * 10;
          var pg = g.createRadialGradient(x, y, 0, x, y, rad);
          pg.addColorStop(0, "rgba(220,220,216," + (.55 * (1 - a)).toFixed(2) + ")"); pg.addColorStop(1, "rgba(220,220,216,0)");
          g.fillStyle = pg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        });
        // landing light beam at night
        g.save();
        g.translate(px, planeY + GEAR_H * k);
        g.rotate(-st.pitch * D2R);
        g.translate(0, -GEAR_H * k);
        if (P.lights > .35) {
          var bg = g.createLinearGradient(5 * k, 0, 30 * k, 0);
          bg.addColorStop(0, "rgba(255,246,224," + (.35 * P.lights).toFixed(2) + ")"); bg.addColorStop(1, "rgba(255,246,224,0)");
          g.fillStyle = bg; g.beginPath(); g.moveTo(4.6 * k, .3 * k); g.lineTo(32 * k, 3 * k); g.lineTo(32 * k, 9 * k); g.closePath(); g.fill();
        }
        g.scale(k, k);
        plane(t, st.gear);
        g.restore();
        clouds.forEach(function (cl) { if (cl.par >= 1) cloud(px + (cl.z - st.z) * k * cl.par, gy - (cl.h - camH) * k, k * 1.1, cl); });
        return bump(CLOUD[0] - 4, (CLOUD[0] + CLOUD[1]) / 2, CLOUD[1] + 4, st.h) * .7;
      },
      destroy: function () {}
    };
  }

  /* =========================================================
     Director: overlay, HUD, skip, timing, hand-over
     ========================================================= */
  var active = null;
  SF.scenes = {
    get playing() { return !!active; },
    enabled: function () { return !!(SF.store && SF.store.state.settings.scenes !== false); },
    // Start fetching three.js early so the scene opens without a wait.
    preload: function () {
      if (SF.scenes.enabled() && !SF.ui.reducedMotion() && hasWebGL() && !SF.forceOffline) SF.lib.load("three").catch(function () {});
    },
    // kind: "takeoff" or "landing". o.flight: the active flight or the landed record.
    // o.reveal runs once, just before the overlay fades, to mount the next screen underneath.
    play: function (kind, o) {
      if (active) active.end();
      return new Promise(function (resolve) {
        var f = o.flight, A = SF.airport(f.from), B = SF.airport(f.to), at = kind === "takeoff" ? A : B;
        var hdg = kind === "takeoff" ? SF.geo.bearing(A, B) : (SF.geo.bearing(B, A) + 180) % 360;
        var rw = Math.round(hdg / 10) % 36 || 36;
        var when = o.date || new Date();
        var sun = sunAt(at, when);
        var ctx = { P: palette(sun.el), sun: sun, hdg: hdg, des: pad(rw), recip: pad((rw + 17) % 36 + 1), q: quality() };
        var seq = SEQ[kind];
        var local = SF.fmt.localTime(at.tz, when);
        var ov = SF.ui.h('<div class="scene" role="dialog" aria-modal="true" aria-label="' + (kind === "takeoff" ? "Takeoff" : "Landing") + ", " + f.from + " to " + f.to + '">' +
          '<div class="scene-veil"></div><div class="scene-fade"></div>' +
          '<div class="glass scene-hud" aria-hidden="true">' +
          '<p class="label">' + f.flightNo + " · " + f.from + " → " + f.to + "</p>" +
          '<p class="readout scene-phase">' + (kind === "takeoff" ? "LINED UP" : "DESCENT") + "</p>" +
          '<dl class="scene-read"><div><dt class="label">IAS</dt><dd class="readout" data-kt>0<small> KT</small></dd></div>' +
          '<div><dt class="label">ALT</dt><dd class="readout" data-ft>0<small> FT</small></dd></div>' +
          '<div><dt class="label">Local</dt><dd class="readout">' + local + "</dd></div></dl>" +
          '<p class="small-print">RWY ' + ctx.des + " · " + SF.esc(at.city) + "</p></div>" +
          '<button class="btn scene-skip" type="button">Skip <kbd>Space</kbd></button></div>');
        var veilEl = ov.querySelector(".scene-veil"), fadeEl = ov.querySelector(".scene-fade");
        var phaseEl = ov.querySelector(".scene-phase"), ktEl = ov.querySelector("[data-kt]"), ftEl = ov.querySelector("[data-ft]");
        veilEl.style.background = css(ctx.P.cloud);
        fadeEl.style.opacity = "1";
        document.body.appendChild(ov);
        ov.querySelector(".scene-skip").focus({ preventScroll: true });

        var runner = null, raf = 0, t0 = 0, last = 0, hudT = -1, touched = 0, revealed = false, ended = false, swooshed = false;
        function reveal() {
          if (revealed) return;
          revealed = true;
          try { if (o.reveal) o.reveal(); } catch (e) { console.error(e); }
        }
        function end() {
          if (ended) return;
          ended = true;
          cancelAnimationFrame(raf);
          window.removeEventListener("keydown", key, true);
          window.removeEventListener("resize", resize);
          reveal();
          sfx("engine", null);   // hand the engine back to the cabin (or to silence on arrival)
          if (kind === "landing" && SF.audio) SF.audio.setScene("idle");
          ov.classList.add("out");
          setTimeout(function () {
            try { if (runner) runner.destroy(); } catch (e) { /* already gone */ }
            ov.remove();
            if (active === handle) active = null;
            resolve();
          }, SF.ui.reducedMotion() ? 60 : 700);
        }
        var handle = { end: end };
        active = handle;
        function key(e) {
          if (e.key === " " || e.key === "Enter" || e.key === "Escape") { e.preventDefault(); end(); }
          e.stopPropagation();   // no app shortcuts while the scene plays
        }
        function resize() { if (runner) runner.resize(ov.clientWidth, ov.clientHeight); }
        window.addEventListener("keydown", key, true);
        window.addEventListener("resize", resize);
        ov.addEventListener("click", end);

        function frame(now) {
          if (ended) return;
          if (!t0) t0 = now;
          var t = o.hold != null ? o.hold : (now - t0) / 1000, dt = clamp(t - last, 0, .05);
          last = t;
          var st = seq.at(Math.min(t, seq.dur));
          while (seq.touches && touched < seq.touches.length && t >= seq.touches[touched][0]) {
            runner.touch(seq.touches[touched][1]);
            sfx("touchdown", seq.touches[touched][1]);
            touched++;
          }
          var veil;
          try { veil = runner.render(t, dt, st) || 0; }
          catch (e) { console.error(e); end(); return; }
          veilEl.style.opacity = Math.max(veil, seq.white ? seq.white(t) : 0).toFixed(3);
          fadeEl.style.opacity = Math.max(1 - t / .5, seq.dark ? seq.dark(t) : 0).toFixed(3);
          sfx("engine", st.thr);
          if (kind === "takeoff" && !swooshed && t >= 5.4) { swooshed = true; sfx("swoosh"); }
          if (t - hudT > .08) {
            hudT = t;
            phaseEl.textContent = st.phase;
            ktEl.firstChild.nodeValue = String(Math.round(st.kt));
            ftEl.firstChild.nodeValue = (Math.round(st.h * 6) * 10).toLocaleString();
          }
          if (t >= seq.dur && o.hold == null) { end(); return; }
          raf = requestAnimationFrame(frame);
        }
        function start(r) {
          if (ended) { try { r.destroy(); } catch (e) { /* nothing to free */ } return; }
          runner = r;
          ov.insertBefore(r.el, ov.firstChild);
          resize();
          raf = requestAnimationFrame(frame);
        }
        function flat(why) {
          if (why) console.info("Scene: using the 2D view (" + why + ")");
          start(build2D(kind, ctx));
        }
        if (SF.ui.reducedMotion() || !hasWebGL() || SF.forceOffline) { flat(); return; }
        var timer;
        Promise.race([SF.lib.load("three"), new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error("three.js slow to load")); }, 4000); })])
          .then(function () {
            clearTimeout(timer);
            if (ended) return;
            var r;
            try { r = build3D(window.THREE, kind, ctx); } catch (e) { flat(e.message); return; }
            start(r);
          }, function (e) { clearTimeout(timer); if (!ended) flat(e.message); });
      });
    }
  };

  // shared with the window view
  SF.sky = { palette: palette, sunAt: sunAt, css: css, mix: mix };

  // Dev: preview a scene without flying. SF.scenes.demo("landing", { to: "SYD", hour: 19, hold: 6.1 })
  // sets solar time at the airport and can freeze one moment of the sequence.
  SF.scenes.demo = function (kind, o) {
    o = o || {};
    var from = o.from || "SIN", to = o.to || "KUL", date;
    if (o.hour != null) {
      var ap = SF.airport(kind === "landing" ? to : from), d = new Date();
      date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (o.hour - ap.lon / 15) * 3600000);
    }
    return SF.scenes.play(kind || "takeoff", { flight: { from: from, to: to, flightNo: SF.flight.flightNo(from, to) }, date: date, hold: o.hold });
  };
})();

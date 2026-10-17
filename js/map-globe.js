/* 3D globe map mode (three.js r149, the same build used by the takeoff and landing scenes).
   Day and night textures blend along the real terminator; the route arcs above the surface;
   the airliner model flies the route, or the racetrack while holding. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D2R = Math.PI / 180;
  var TEX = {
    day: "https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-blue-marble.jpg",
    night: "https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-night.jpg"
  };

  // lat/lon to a point on the unit sphere, matching three.js SphereGeometry UVs
  function vec(T, lat, lon, r) {
    var p = lat * D2R, l = lon * D2R, c = Math.cos(p);
    return new T.Vector3(c * Math.cos(l) * r, Math.sin(p) * r, -c * Math.sin(l) * r);
  }

  // Offline texture: land outlines painted on a canvas, so the globe never waits for the network.
  function paintedTexture(T, night) {
    var c = document.createElement("canvas");
    c.width = 2048; c.height = 1024;
    var g = c.getContext("2d");
    g.fillStyle = night ? "#05070b" : "#0f1a2a"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = night ? "#0b0d10" : "#2a3340"; g.strokeStyle = night ? "#15181d" : "#3d4756"; g.lineWidth = 1.5;
    (window.WORLD_LAND || []).forEach(function (poly) {
      g.beginPath();
      poly.forEach(function (pt, i) {
        var x = (pt[0] + 180) / 360 * c.width, y = (90 - pt[1]) / 180 * c.height;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.closePath(); g.fill(); g.stroke();
    });
    var t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function create(container, opts) {
    var T = window.THREE;
    if (!T) throw new Error("three.js missing");
    var quality = (SF.store && SF.store.state.settings.graphics) || "high";
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: quality !== "low", alpha: true, powerPreference: "high-performance" }); }
    catch (e) { throw new Error("WebGL unavailable"); }
    if (!renderer.getContext()) throw new Error("WebGL unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25));
    renderer.outputEncoding = T.sRGBEncoding;
    var host = document.createElement("div");
    host.className = "globe-host";
    container.appendChild(host);
    host.appendChild(renderer.domElement);
    var labels = document.createElement("div");
    labels.className = "globe-labels";
    host.appendChild(labels);

    var scene = new T.Scene(), camera = new T.PerspectiveCamera(35, 1, .01, 100);
    camera.position.set(0, 0, 3.2);
    var sunLight = new T.DirectionalLight(0xffffff, 1.25), amb = new T.AmbientLight(0x8899aa, .5);
    scene.add(sunLight, amb);

    // earth: day/night blend by the sun direction
    var dayTex = paintedTexture(T, false), nightTex = paintedTexture(T, true);
    var uniforms = { dayMap: { value: dayTex }, nightMap: { value: nightTex }, sunDir: { value: new T.Vector3(1, 0, 0) } };
    var segs = quality === "low" ? 48 : 96;
    var earth = new T.Mesh(new T.SphereGeometry(1, segs, segs / 2), new T.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: "varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;" +
        "void main(){ float d = dot(normalize(vN), normalize(sunDir)); float k = smoothstep(-0.12, 0.18, d);" +
        "vec3 day = texture2D(dayMap, vUv).rgb * (0.6 + 0.7 * max(d, 0.0)); vec3 night = texture2D(nightMap, vUv).rgb * 1.35;" +
        "gl_FragColor = vec4(mix(night, day, k), 1.0); }"
    }));
    scene.add(earth);
    if (quality !== "low") {
      var atmo = new T.Mesh(new T.SphereGeometry(1.06, 64, 32), new T.ShaderMaterial({
        side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec3 vN; void main(){ float i = pow(0.68 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0); gl_FragColor = vec4(0.45, 0.65, 1.0, 1.0) * i; }"
      }));
      scene.add(atmo);
    }
    // real imagery when the network allows
    var loader = new T.TextureLoader();
    loader.setCrossOrigin("anonymous");
    if (!SF.forceOffline) {
      loader.load(TEX.day, function (t) { t.encoding = T.sRGBEncoding; t.anisotropy = 8; uniforms.dayMap.value = t; dayTex.dispose(); }, undefined, function () { });
      loader.load(TEX.night, function (t) { t.encoding = T.sRGBEncoding; uniforms.nightMap.value = t; nightTex.dispose(); }, undefined, function () { });
    }

    var routeGroup = new T.Group();
    scene.add(routeGroup);
    var signal = new T.Color(0xffc400);
    var flownMat = new T.MeshBasicMaterial({ color: signal });
    var remainMat = new T.LineDashedMaterial({ color: 0xece8de, dashSize: .012, gapSize: .01, transparent: true, opacity: .7 });
    var holdMat = new T.LineBasicMaterial({ color: signal });
    var flownMesh = null, remainLine = null, holdLine = null, trackLine = null;
    var airliner = SF.models.airliner(T, { lowPoly: quality === "low" });
    airliner.scale.setScalar(.0026);
    airliner.visible = false;
    scene.add(airliner);

    var route = null, frac = 0, extra = null, camera_ = opts.camera || "route", markers = [], destroyed = false, raf = null;
    var camPos = camera.position.clone(), camLook = new T.Vector3(), manualUntil = 0, drag = null, yaw = 0, pitch = 0;
    var lastIdx = -1, W = 1, H = 1;

    function lift(t, dist) { return 1 + .006 + .13 * Math.sin(Math.PI * t) * Math.min(1, dist / 9000); }
    function arcVec(t) {
      var p = SF.geo.interpolate(route.from, route.to, t);
      return vec(T, p.lat, p.lon, lift(t, route.km));
    }
    function size() {
      var r = container.getBoundingClientRect();
      W = Math.max(50, r.width); H = Math.max(50, r.height);
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = W + "px"; renderer.domElement.style.height = H + "px";
      camera.aspect = W / H;
      // centre the globe in the free area between panels
      var ins = (opts.insets && opts.insets()) || {};
      var cx = (ins.left || 0) + (W - (ins.left || 0) - (ins.right || 0)) / 2, cy = (ins.top || 0) + (H - (ins.top || 0) - (ins.bottom || 0)) / 2;
      camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
      camera.updateProjectionMatrix();
    }
    function rebuildRoute() {
      while (routeGroup.children.length) { var c = routeGroup.children.pop(); c.geometry.dispose(); }
      flownMesh = remainLine = holdLine = null; lastIdx = -1;
      if (!route) return;
      route.vecs = [];
      for (var i = 0; i <= 128; i++) route.vecs.push(arcVec(i / 128));
      updateRoute(true);
    }
    function updateRoute(force) {
      var idx = Math.round(frac * 128);
      if (!force && idx === lastIdx) return;
      lastIdx = idx;
      if (flownMesh) { routeGroup.remove(flownMesh); flownMesh.geometry.dispose(); flownMesh = null; }
      if (remainLine) { routeGroup.remove(remainLine); remainLine.geometry.dispose(); remainLine = null; }
      if (idx >= 1) {
        flownMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(route.vecs.slice(0, idx + 1)), Math.max(4, idx * 2), .0035, 6, false), flownMat);
        routeGroup.add(flownMesh);
      }
      if (idx < 128) {
        remainLine = new T.Line(new T.BufferGeometry().setFromPoints(route.vecs.slice(idx)), remainMat);
        remainLine.computeLineDistances();
        routeGroup.add(remainLine);
      }
    }
    function planeState() {
      if (!route) return null;
      var hold = extra && extra.hold, alt = lift(frac, route.km);
      if (hold) {
        var fix = SF.geo.interpolate(route.from, route.to, frac);
        var a = SF.geo.holdPos(fix, hold.heading, hold.sizeKm, hold.phase), b = SF.geo.holdPos(fix, hold.heading, hold.sizeKm, hold.phase + .01);
        return { p: vec(T, a.lat, a.lon, alt), next: vec(T, b.lat, b.lon, alt), loop: SF.geo.holdLoop(fix, hold.heading, hold.sizeKm, 72).map(function (q) { return vec(T, q.lat, q.lon, alt); }) };
      }
      return { p: arcVec(frac), next: arcVec(Math.min(1, frac + .004)) };
    }
    function placePlane(st) {
      if (holdLine) { routeGroup.remove(holdLine); holdLine.geometry.dispose(); holdLine = null; }
      if (!st || opts.showPlane === false) { airliner.visible = false; return; }
      airliner.visible = true;
      airliner.position.copy(st.p);
      airliner.up.copy(st.p).normalize();
      airliner.lookAt(st.next.x === st.p.x && st.next.y === st.p.y ? st.p.clone().multiplyScalar(1.1) : st.next);
      if (st.loop) {
        holdLine = new T.Line(new T.BufferGeometry().setFromPoints(st.loop), holdMat);
        routeGroup.add(holdLine);
      }
    }
    function cameraTarget() {
      var st = planeState(), pos = new T.Vector3(), look = new T.Vector3();
      if (camera_ === "follow" && st) {
        var n = st.p.clone().normalize(), fwd = st.next.clone().sub(st.p).normalize();
        pos.copy(n).multiplyScalar(1.9).addScaledVector(fwd, -.35);
        look.copy(st.p);
      } else if (route) {
        var mid = SF.geo.interpolate(route.from, route.to, .5), sep = route.km / 6371;
        pos.copy(vec(T, mid.lat, mid.lon, 1)).multiplyScalar(Math.max(2.7, Math.min(3.8, 2.5 + sep * .95)));
      } else if (markers[0]) {
        pos.copy(vec(T, markers[0].lat, markers[0].lon, 1)).multiplyScalar(2.8);
      } else pos.set(0, .6, 3);
      if (yaw || pitch) {
        pos.applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
        var side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), pos).normalize();
        if (side.lengthSq() > 0) pos.applyAxisAngle(side, -pitch);
      }
      return { pos: pos, look: look };
    }
    function updateSun() {
      var s = SF.geo.sun(new Date()), d = vec(T, s.subLat, s.subLon, 1);
      uniforms.sunDir.value.copy(d);
      sunLight.position.copy(d).multiplyScalar(5);
    }
    function drawLabels() {
      var html = "", camDir = camera.position.clone().normalize();
      markers.forEach(function (m) {
        var v = vec(T, m.lat, m.lon, 1.002);
        if (v.clone().normalize().dot(camDir) < .1) return;
        var q = v.clone().project(camera);
        var x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
        html += '<div class="gl-mark ' + (m.cls || "") + '" style="transform:translate(' + x.toFixed(1) + "px," + y.toFixed(1) + 'px)"><i></i>' + (m.label ? "<b>" + m.label + "</b>" : "") + "</div>";
      });
      labels.innerHTML = html;
    }
    function loop() {
      if (destroyed) return;
      raf = requestAnimationFrame(loop);
      if (Date.now() > manualUntil && !drag) { yaw *= .94; pitch *= .94; }
      var t = cameraTarget(), k = SF.ui && SF.ui.reducedMotion() ? 1 : .06;
      camPos.lerp(t.pos, k); camLook.lerp(t.look, k);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      renderer.render(scene, camera);
      drawLabels();
    }

    // drag to look around; the camera eases back after a while
    renderer.domElement.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; renderer.domElement.setPointerCapture(e.pointerId); });
    renderer.domElement.addEventListener("pointermove", function (e) {
      if (!drag) return;
      yaw = drag.yaw - (e.clientX - drag.x) * .005;
      pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * .005));
    });
    renderer.domElement.addEventListener("pointerup", function () { drag = null; manualUntil = Date.now() + 8000; });

    size();
    updateSun();
    var sunTimer = setInterval(updateSun, 60000);
    var ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) ro.observe(container);
    loop();

    return {
      setRoute: function (a, b) {
        route = { from: a, to: b, km: SF.geo.distanceKm(a, b) };
        markers = [{ lat: a.lat, lon: a.lon, label: a.iata, cls: "m-from" }, { lat: b.lat, lon: b.lon, label: b.iata, cls: "m-to" }];
        frac = 0; extra = null; rebuildRoute(); placePlane(planeState());
      },
      clearRoute: function () { route = null; markers = []; rebuildRoute(); placePlane(null); },
      setProgress: function (f, ex) {
        if (!route) return;
        frac = Math.max(0, Math.min(1, f)); extra = ex || null;
        updateRoute(false); placePlane(planeState());
      },
      setCamera: function (c, instant) {
        camera_ = c;
        if (instant) { var t = cameraTarget(); camPos.copy(t.pos); camLook.copy(t.look); }
      },
      setMarkers: function (list) { markers = list.slice(); },
      setRoutes: function () { },
      setTrack: function (pts) {
        if (trackLine) { routeGroup.remove(trackLine); trackLine.geometry.dispose(); trackLine = null; }
        if (!pts || !pts.length) return;
        trackLine = new T.Line(new T.BufferGeometry().setFromPoints(pts.map(function (p) { return vec(T, p.lat, p.lon, 1.01); })), new T.LineBasicMaterial({ color: signal }));
        routeGroup.add(trackLine);
      },
      resize: size,
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        clearInterval(sunTimer);
        if (ro) ro.disconnect();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach(function (m) { Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) m[k].dispose(); }); m.dispose(); });
        });
        [uniforms.dayMap.value, uniforms.nightMap.value].forEach(function (t) { if (t && t.dispose) t.dispose(); });
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        host.remove();
      }
    };
  }

  SF.maps.register("globe", "three", create);
})();

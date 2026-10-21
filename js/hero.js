/* Hero plane: the shared airliner flying gently in place on a transparent canvas, tilting toward the
   pointer through springs. Used on the check-in screen and in the booking sheet header.
   Low graphics, reduced motion, no WebGL or no network leave the logo in place instead. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D2R = Math.PI / 180;

  function canRun() {
    var q = (SF.store && SF.store.state.settings.graphics) || "high";
    if (q === "low" || SF.forceOffline || (SF.ui && SF.ui.reducedMotion())) return false;
    return SF.lib.webgl();
  }

  // opts.view: "front" (three-quarter front, check-in) or "side" (profile, booking header)
  // One renderer per view (and graphics level) is kept for the session and moved to each new host,
  // so a visit does not create a new WebGL context. It is attached after the screen's first frame.
  var engines = {};
  SF.hero = {
    mount: function (el, opts) {
      opts = opts || {};
      var dead = false, inst = null;
      el.classList.add("hero");
      if (!canRun()) { el.classList.add("hero-static"); return { destroy: function () {} }; }
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (dead) return;
        SF.lib.load("three").then(function () {
          if (dead) return;
          try {
            var q = (SF.store && SF.store.state.settings.graphics) || "high", key = (opts.view || "front") + q;
            if (!engines[key]) engines[key] = build(window.THREE, opts);
            inst = engines[key];
            inst.attach(el);
          }
          catch (e) { el.classList.add("hero-static"); console.info("Hero: static (" + e.message + ")"); }
        }, function () { el.classList.add("hero-static"); });
      }); });
      return { destroy: function () { dead = true; if (inst) inst.detach(el); } };
    }
  };

  function build(T, opts) {
    var q = (SF.store && SF.store.state.settings.graphics) || "high";
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    if (!renderer.getContext()) throw new Error("WebGL unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 2 : 1.25));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    var cv = renderer.domElement, el = null;
    cv.className = "hero-canvas";
    cv.setAttribute("aria-hidden", "true");

    var scene = new T.Scene();
    var side = opts.view === "side";
    var camera = new T.PerspectiveCamera(side ? 22 : 30, 1, .1, 200);
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x2a2622, .85));
    var key = new T.DirectionalLight(0xfff4e2, 1.35);
    key.position.set(-6, 10, 8);
    var rim = new T.DirectionalLight(0xffd27a, .55);
    rim.position.set(8, 2, -10);
    scene.add(key, rim);

    var plane = SF.models.airliner(T, { lowPoly: q !== "high" });
    var rig = new T.Group();
    rig.add(plane);
    scene.add(rig);

    // contrails from the engines: fading ribbons behind the aircraft
    var trailMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0, depthWrite: false });
    var tex = (function () {
      var c = document.createElement("canvas"); c.width = 4; c.height = 128;
      var g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
      var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
    })();
    trailMat.map = tex; trailMat.opacity = .85;
    [-2.4, 2.4].forEach(function (x) {
      var m = new T.Mesh(new T.PlaneGeometry(.32, 22), trailMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -.86, -13.5);
      plane.add(m);
    });

    if (side) camera.position.set(-17, 1.2, 1);
    else camera.position.set(-15, 5.5, 17);
    var look = new T.Vector3(0, 0, side ? 0 : -.5);
    camera.lookAt(look);

    // pointer parallax through springs
    var tx = SF.motion.spring({ stiffness: 60, damping: 11 }), ty = SF.motion.spring({ stiffness: 60, damping: 11 });
    function onMove(e) {
      tx.target = (e.clientX / window.innerWidth - .5) * 2;
      ty.target = (e.clientY / window.innerHeight - .5) * 2;
    }

    var W = 0, H = 0;
    function resize() {
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h || (w === W && h === H)) return;
      W = w; H = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;

    var raf = 0, t0 = 0, last = 0, visible = true;
    var io = window.IntersectionObserver ? new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }) : null;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible || SF.offstage()) { last = now; return; }
      resize();
      var t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000);
      last = now;
      tx.step(dt); ty.step(dt);
      // a slow, calm flight in place: gentle bob, sway and yaw
      rig.position.y = Math.sin(t * .9) * .18;
      rig.rotation.z = Math.sin(t * .55) * 4 * D2R - tx.x * 9 * D2R;
      rig.rotation.x = Math.sin(t * .7 + 1) * 1.5 * D2R + ty.x * 6 * D2R;
      rig.rotation.y = Math.sin(t * .23) * 6 * D2R + tx.x * 14 * D2R;
      camera.position.y = (side ? 1.2 : 5.5) - ty.x * (side ? .6 : 1.2);
      camera.lookAt(look);
      renderer.render(scene, camera);
    }

    return {
      // start as a brand new hero would: time from zero, springs at rest, first frame drawn before showing
      attach: function (host) {
        if (el) this.detach(el);
        el = host; W = H = 0; visible = true;
        tx.snap(0); ty.snap(0);
        host.appendChild(cv);
        host.classList.add("hero-live");
        if (ro) ro.observe(host);
        if (io) io.observe(host);
        window.addEventListener("pointermove", onMove);
        t0 = last = performance.now();
        frame(t0);
      },
      detach: function (host) {
        if (el !== host) return;
        cancelAnimationFrame(raf); raf = 0;
        window.removeEventListener("pointermove", onMove);
        if (ro) ro.unobserve(host);
        if (io) io.unobserve(host);
        cv.remove();
        host.classList.remove("hero-live");
        el = null;
      }
    };
  }
})();

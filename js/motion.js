/* Motion: spring physics for UI movement.
   - SF.motion.spring(): a damped spring that follows a moving target (tilt, banking, drag).
   - Spring step responses are baked into CSS linear() easings (--spring, --spring-soft, --spring-snap),
     so every transition that uses var(--spring) moves like a real spring. Browsers without linear()
     keep the cubic-bezier fallbacks in base.css.
   Reduced motion makes springs jump straight to their target. */
(function () {
  var SF = (window.SF = window.SF || {});

  function reduced() { return !!(SF.ui && SF.ui.reducedMotion && SF.ui.reducedMotion()); }

  // Step response of a spring from 0 to 1, simulated until it settles.
  function response(k, c, m) {
    var x = 0, v = 0, dt = 1 / 600, t = 0, pts = [0];
    while (t < 4) {
      var a = (-k * (x - 1) - c * v) / m;
      v += a * dt; x += v * dt; t += dt;
      pts.push(x);
      if (t > .05 && Math.abs(x - 1) < .0015 && Math.abs(v) < .02) break;
    }
    pts[pts.length - 1] = 1;
    return pts;
  }
  function linearEasing(k, c, m, samples) {
    var pts = response(k, c, m), out = [];
    for (var i = 0; i <= samples; i++) out.push(+pts[Math.round(i / samples * (pts.length - 1))].toFixed(4));
    return "linear(" + out.join(", ") + ")";
  }

  function Spring(o) {
    this.k = o.stiffness || 170;
    this.c = o.damping || 20;
    this.m = o.mass || 1;
    this.x = o.from != null ? o.from : 0;
    this.v = 0;
    this.target = this.x;
    this.onUpdate = o.onUpdate || null;
    this.raf = 0;
    this.last = 0;
  }
  Spring.prototype.set = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.v = velocity;
    if (reduced()) { this.snap(target); return this; }
    if (!this.raf) {
      var self = this;
      this.last = performance.now();
      this.raf = requestAnimationFrame(function frame(now) {
        var dt = Math.min(.05, (now - self.last) / 1000);
        self.last = now;
        self.step(dt);
        if (self.onUpdate) self.onUpdate(self.x, self.v);
        if (Math.abs(self.x - self.target) < 1e-4 && Math.abs(self.v) < 1e-3) { self.x = self.target; self.v = 0; self.raf = 0; if (self.onUpdate) self.onUpdate(self.x, 0); return; }
        self.raf = requestAnimationFrame(frame);
      });
    }
    return this;
  };
  // Advance by dt seconds (for callers that run their own frame loop).
  Spring.prototype.step = function (dt) {
    var n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (var i = 0; i < n; i++) {
      var a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  };
  Spring.prototype.snap = function (x) { this.x = this.target = x; this.v = 0; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } if (this.onUpdate) this.onUpdate(x, 0); return this; };
  Spring.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };

  SF.motion = {
    spring: function (o) { return new Spring(o || {}); },
    linearEasing: linearEasing,
    // Install the spring easings as CSS custom properties.
    install: function () {
      try {
        if (!(window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)"))) return;
        var r = document.documentElement.style;
        r.setProperty("--spring", linearEasing(210, 15, 1, 48));        // lively, small overshoot
        r.setProperty("--spring-soft", linearEasing(140, 22, 1, 40));   // settles without bounce
        r.setProperty("--spring-snap", linearEasing(520, 30, 1, 40));   // quick press and release
        r.setProperty("--spring-flip", linearEasing(120, 13, 1, 56));   // a card turning over
      } catch (e) { /* keep the fallbacks */ }
    },

    // A spring-driven tilt toward the pointer for one element (CSS vars --tilt-x, --tilt-y in degrees).
    tilt: function (el, max) {
      max = max || 6;
      var sx = SF.motion.spring({ stiffness: 160, damping: 16, onUpdate: function (v) { el.style.setProperty("--tilt-y", v.toFixed(2) + "deg"); } });
      var sy = SF.motion.spring({ stiffness: 160, damping: 16, onUpdate: function (v) { el.style.setProperty("--tilt-x", v.toFixed(2) + "deg"); } });
      function move(e) {
        var r = el.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5;
        sx.set(nx * max * 2);
        sy.set(-ny * max * 2);
      }
      function leave() { sx.set(0); sy.set(0); }
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return function () { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); sx.stop(); sy.stop(); };
    }
  };
  SF.motion.install();
})();

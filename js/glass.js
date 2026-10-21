/* Glass engine: edge refraction, moving specular highlight, adaptive tint, graphics quality.
   Refraction uses an SVG displacement filter in backdrop-filter (Chromium). Other browsers,
   and the "Low" quality setting, get blur and highlight only.
   Speed: displacement maps are kept between launches (a file in the desktop data folder, or
   IndexedDB in the browser; 2 MB, least recently used dropped first). A map that is not cached yet is
   built in idle time, and the pane shows plain blur (as on Low) until it is ready. Sizes come from
   the ResizeObserver, so panes are never measured with a forced layout. */
(function () {
  var SF = (window.SF = window.SF || {});
  var NS = "http://www.w3.org/2000/svg";
  var defs = null, cache = {}, observed = new WeakSet(), ro = null;
  var isChromium = /Chrome\//.test(navigator.userAgent) && typeof CSS !== "undefined" &&
    CSS.supports("backdrop-filter", "url(#x) blur(2px)");
  var SCALE = { high: 46, balanced: 26, low: 0 };
  var radius = new WeakMap(), size = new WeakMap(), applied = new WeakMap();

  function quality() { return (SF.store && SF.store.state.settings.graphics) || "high"; }
  function refractOn() { return isChromium && quality() !== "low"; }

  // Displacement map for a rounded rectangle: pixels near the rim sample from further inside,
  // which bends the backdrop like the edge of a thick lens.
  function buildMap(w, h, r) {
    var k = Math.min(1, 360 / Math.max(w, h));
    var cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k));
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var g = c.getContext("2d"), img = g.createImageData(cw, ch), d = img.data;
    var band = Math.min(30, Math.min(w, h) * 0.32) * k, rr = Math.min(r, Math.min(w, h) / 2) * k;
    var hx = cw / 2, hy = ch / 2;
    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) {
        var px = x + 0.5 - hx, py = y + 0.5 - hy;
        var qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
        var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        var dist = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rr; // < 0 inside
        var nx = 0, ny = 0;
        if (qx > 0 && qy > 0) { var l = Math.sqrt(qx * qx + qy * qy) || 1; nx = qx / l; ny = qy / l; }
        else if (qx > qy) nx = 1; else ny = 1;
        nx *= px < 0 ? -1 : 1; ny *= py < 0 ? -1 : 1;
        var inside = -dist, s = inside < band ? Math.pow(1 - Math.max(0, inside) / band, 2) : 0;
        var i = (y * cw + x) * 4;
        d[i] = 128 - nx * s * 127;
        d[i + 1] = 128 - ny * s * 127;
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  /* ---------- the map cache that survives restarts ---------- */
  var CAP = 2 * 1024 * 1024, stored = {}, storeDirty = false, storeTimer = null;
  var desktop = window.skyfocusDesktop && window.skyfocusDesktop.glassMaps;
  function loadStore() {
    if (desktop) {
      try { var t = desktop.load(); if (t) stored = JSON.parse(t) || {}; } catch (e) { stored = {}; }
      return;
    }
    try {
      var rq = indexedDB.open("skyfocus-glass", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("maps"); };
      rq.onsuccess = function () {
        var db = rq.result, get = db.transaction("maps").objectStore("maps").get("all");
        get.onsuccess = function () { var v = get.result || {}; Object.keys(v).forEach(function (k) { if (!stored[k]) stored[k] = v[k]; }); if (queued.length) idle(drainQueue); };
      };
    } catch (e) { /* no IndexedDB: maps are rebuilt each session */ }
  }
  function saveStore() {
    storeDirty = true;
    clearTimeout(storeTimer);
    storeTimer = setTimeout(function () { idle(writeStore); }, 1500);
  }
  function writeStore() {
    if (!storeDirty) return;
    storeDirty = false;
    // least recently used out first until the total fits the cap
    var keys = Object.keys(stored).sort(function (a, b) { return stored[b].t - stored[a].t; }), total = 0, keep = {};
    keys.forEach(function (k) { var n = stored[k].u.length + k.length + 32; if (total + n <= CAP) { keep[k] = stored[k]; total += n; } });
    stored = keep;
    if (desktop) { try { desktop.save(JSON.stringify(stored)); } catch (e) { /* only a cache */ } return; }
    try {
      var rq = indexedDB.open("skyfocus-glass", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("maps"); };
      rq.onsuccess = function () { rq.result.transaction("maps", "readwrite").objectStore("maps").put(stored, "all"); };
    } catch (e) { /* only a cache */ }
  }
  function idle(fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 120 }); else setTimeout(fn, 16); }

  function keyFor(w, h, r, scale) { return Math.round(w / 8) * 8 + "x" + Math.round(h / 8) * 8 + "r" + r + "s" + scale; }
  function makeFilter(key, W, H, url, scale) {
    var id = "sf-rf-" + Object.keys(cache).length;
    var f = document.createElementNS(NS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("x", "0"); f.setAttribute("y", "0");
    f.setAttribute("width", W); f.setAttribute("height", H);
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.setAttribute("color-interpolation-filters", "sRGB");
    var im = document.createElementNS(NS, "feImage");
    im.setAttribute("href", url);
    im.setAttribute("x", "0"); im.setAttribute("y", "0");
    im.setAttribute("width", W); im.setAttribute("height", H);
    im.setAttribute("preserveAspectRatio", "none");
    im.setAttribute("result", "map");
    var dm = document.createElementNS(NS, "feDisplacementMap");
    dm.setAttribute("in", "SourceGraphic"); dm.setAttribute("in2", "map");
    dm.setAttribute("scale", scale);
    dm.setAttribute("xChannelSelector", "R"); dm.setAttribute("yChannelSelector", "G");
    f.appendChild(im); f.appendChild(dm);
    defs.appendChild(f);
    cache[key] = id;
    return id;
  }
  // The filter id for a size, or null while its map is still being built.
  var queue = {}, queued = [];
  function filterFor(w, h, r, scale) {
    var key = keyFor(w, h, r, scale);
    if (cache[key]) return cache[key];
    var W = Math.round(w / 8) * 8 || 8, H = Math.round(h / 8) * 8 || 8;
    if (stored[key]) { stored[key].t = Date.now(); saveStore(); return makeFilter(key, W, H, stored[key].u, scale); }
    if (!queue[key]) { queue[key] = { W: W, H: H, r: r, scale: scale }; queued.push(key); idle(drainQueue); }
    return null;
  }
  function drainQueue(deadline) {
    while (queued.length) {
      if (deadline && deadline.timeRemaining && deadline.timeRemaining() < 4 && !deadline.didTimeout) { idle(drainQueue); return; }
      var key = queued.shift(), job = queue[key];
      delete queue[key];
      if (cache[key]) continue;
      var url = stored[key] ? stored[key].u : buildMap(job.W, job.H, job.r);
      if (!stored[key]) { stored[key] = { u: url, t: Date.now() }; saveStore(); }
      makeFilter(key, job.W, job.H, url, job.scale);
      // panes waiting for this size
      (waiting[key] || []).forEach(function (el) { if (el.isConnected) apply(el); });
      delete waiting[key];
    }
  }
  var waiting = {};

  function apply(el) {
    if (!refractOn()) { el.style.backdropFilter = ""; el.style.webkitBackdropFilter = ""; applied.delete(el); return; }
    var sz = size.get(el);
    if (!sz) return;   // the ResizeObserver reports the size before the first paint
    if (sz.w < 24 || sz.h < 16) return;
    var r = radius.get(el);
    if (r == null) { r = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0); radius.set(el, r); }
    // A container can set its own refraction strength (glass lab variants): data-refract="40".
    var host = el.closest("[data-refract]");
    var scale = host ? +host.getAttribute("data-refract") : SCALE[quality()] || 0;
    if (!scale) { el.style.backdropFilter = ""; el.style.webkitBackdropFilter = ""; applied.delete(el); return; }
    var key = keyFor(sz.w, sz.h, r, scale);
    if (applied.get(el) === key) return;
    var id = filterFor(sz.w, sz.h, r, scale);
    if (!id) { (waiting[key] = waiting[key] || []).push(el); return; }
    applied.set(el, key);
    el.style.backdropFilter = "url(#" + id + ") blur(var(--glass-blur)) saturate(var(--glass-sat)) brightness(var(--glass-bright))";
  }

  // Dev guard: materials must not nest (DESIGN.md).
  function checkMaterials() {
    if (!SF.dev) return;
    var bad = document.querySelectorAll(".glass .paper, .paper .glass");
    if (bad.length) console.warn("SkyFocus material rule: paper and glass are nested", bad);
  }

  function watch(el) {
    if (observed.has(el)) return;
    observed.add(el);
    ro.observe(el);
  }
  function scan(root) {
    if (!ro) return;
    checkMaterials();
    (root || document).querySelectorAll(".glass").forEach(watch);
  }
  // only added and removed elements are looked at; text changes cost nothing
  function onMutations(muts) {
    var added = false;
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i], j, n;
      for (j = 0; j < m.addedNodes.length; j++) {
        n = m.addedNodes[j];
        if (n.nodeType !== 1) continue;
        if (n.classList.contains("glass")) { watch(n); added = true; }
        if (n.firstElementChild) { var inner = n.querySelectorAll(".glass"); if (inner.length) { inner.forEach(watch); added = true; } }
      }
      for (j = 0; j < m.removedNodes.length; j++) {
        n = m.removedNodes[j];
        if (n.nodeType !== 1 || n.isConnected) continue;
        if (observed.has(n)) { ro.unobserve(n); observed.delete(n); }
        if (n.firstElementChild) n.querySelectorAll(".glass").forEach(function (g) { if (observed.has(g)) { ro.unobserve(g); observed.delete(g); } });
      }
    }
    if (added) checkMaterials();
  }

  var mx = 0.5, raf = null, lastSpec = "";
  function onMove(e) {
    mx = e.clientX / window.innerWidth;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      // whole percent steps: the highlight looks the same, the page restyles far less often
      var v = Math.round(20 + mx * 60) + "%";
      if (v === lastSpec) return;
      lastSpec = v;
      document.documentElement.style.setProperty("--spec-x", v);
    });
  }

  SF.glass = {
    supportsRefraction: isChromium,
    init: function () {
      var svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      defs = document.createElementNS(NS, "defs");
      svg.appendChild(defs);
      document.body.appendChild(svg);
      if (SF.dev) document.documentElement.setAttribute("data-dev", "");
      if (isChromium) loadStore();
      document.documentElement.setAttribute("data-gfx", quality());
      document.documentElement.classList.toggle("refract", refractOn());
      if (window.ResizeObserver) ro = new ResizeObserver(function (entries) {
        entries.forEach(function (en) {
          var b = en.borderBoxSize && en.borderBoxSize[0];
          var w = b ? b.inlineSize : en.target.offsetWidth, h = b ? b.blockSize : en.target.offsetHeight;
          size.set(en.target, { w: w, h: h });
          radius.delete(en.target);   // read again after a resize (a breakpoint can change it)
          apply(en.target);
        });
      });
      scan();
      new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
      window.addEventListener("mousemove", onMove, { passive: true });
    },
    setQuality: function (q) {
      document.documentElement.setAttribute("data-gfx", q);
      document.documentElement.classList.toggle("refract", isChromium && q !== "low");
      document.querySelectorAll(".glass").forEach(function (el) { applied.delete(el); apply(el); });
    },
    // Tell glass inside `el` what is behind it: "bright" (sky, light imagery) or "dark" (night map).
    backdrop: function (el, kind) { if (el) el.setAttribute("data-backdrop", kind); },
    // Relative luminance of a CSS rgb() colour, for callers that sample their backdrop.
    luminance: function (r, g, b) {
      function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
  };
})();

/* Glass engine: edge refraction, moving specular highlight, adaptive tint, graphics quality.
   Refraction uses an SVG displacement filter in backdrop-filter (Chromium). Other browsers,
   and the "Low" quality setting, get blur and highlight only. */
(function () {
  var SF = (window.SF = window.SF || {});
  var NS = "http://www.w3.org/2000/svg";
  var defs = null, cache = {}, observed = new WeakSet(), ro = null;
  var isChromium = /Chrome\//.test(navigator.userAgent) && typeof CSS !== "undefined" &&
    CSS.supports("backdrop-filter", "url(#x) blur(2px)");
  var SCALE = { high: 46, balanced: 26, low: 0 };

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

  function filterFor(w, h, r) {
    var q = quality(), scale = SCALE[q] || 0;
    var key = Math.round(w / 8) * 8 + "x" + Math.round(h / 8) * 8 + "r" + r + "s" + scale;
    if (cache[key]) return cache[key];
    var W = Math.round(w / 8) * 8 || 8, H = Math.round(h / 8) * 8 || 8;
    var id = "sf-rf-" + Object.keys(cache).length;
    var f = document.createElementNS(NS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("x", "0"); f.setAttribute("y", "0");
    f.setAttribute("width", W); f.setAttribute("height", H);
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.setAttribute("color-interpolation-filters", "sRGB");
    var im = document.createElementNS(NS, "feImage");
    im.setAttribute("href", buildMap(W, H, r));
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

  function apply(el) {
    if (!refractOn()) { el.style.backdropFilter = ""; el.style.webkitBackdropFilter = ""; return; }
    var rect = el.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 16) return;
    var r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    var id = filterFor(rect.width, rect.height, Math.round(r));
    el.style.backdropFilter = "url(#" + id + ") blur(var(--glass-blur)) saturate(1.7) brightness(1.04)";
  }

  function scan(root) {
    if (!ro) return;
    (root || document).querySelectorAll(".glass").forEach(function (el) {
      if (observed.has(el)) return;
      observed.add(el);
      ro.observe(el);
      apply(el);
    });
  }

  var mx = 0.5, raf = null;
  function onMove(e) {
    mx = e.clientX / window.innerWidth;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      document.documentElement.style.setProperty("--spec-x", (20 + mx * 60).toFixed(1) + "%");
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
      SF.glass.setQuality(quality());
      if (window.ResizeObserver) ro = new ResizeObserver(function (entries) { entries.forEach(function (en) { apply(en.target); }); });
      scan();
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) if (muts[i].addedNodes.length) { scan(); break; }
      }).observe(document.body, { childList: true, subtree: true });
      window.addEventListener("mousemove", onMove, { passive: true });
    },
    setQuality: function (q) {
      document.documentElement.setAttribute("data-gfx", q);
      document.documentElement.classList.toggle("refract", isChromium && q !== "low");
      document.querySelectorAll(".glass").forEach(apply);
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

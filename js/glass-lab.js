/* Glass lab (hidden): ?lab=1 and optionally &bg=map|sky|night.
   Three candidate glass treatments side by side over the same backdrop, each with the same controls. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  var VARIANTS = [
    { id: "clear", name: "A · Clear", note: "Thin, high refraction, little blur. The scene stays readable through it.", refract: 64 },
    { id: "frost", name: "B · Frost", note: "Heavy blur with a pale haze. Softest, most diffuse.", refract: 34 },
    { id: "smoke", name: "C · Smoked", note: "Dark tint, medium blur. Strongest contrast for text.", refract: 44 }
  ];
  var BACKDROPS = [["map", "Map"], ["sat", "Satellite"], ["sky", "Day sky"], ["night", "Night"]];
  var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";

  /* ---------- painted backdrops ---------- */
  function sky(c) {
    var g = c.getContext("2d"), W = c.width, H = c.height, r = SF.rng(7);
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1f4f8f"); grad.addColorStop(.55, "#6fa1d6"); grad.addColorStop(.85, "#d9c9ad"); grad.addColorStop(1, "#f0c88a");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    var sun = g.createRadialGradient(W * .78, H * .7, 0, W * .78, H * .7, H * .5);
    sun.addColorStop(0, "rgba(255,244,214,.95)"); sun.addColorStop(.08, "rgba(255,230,180,.6)"); sun.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // cloud banks: soft blobs, denser and flatter towards the horizon
    for (var band = 0; band < 5; band++) {
      var y0 = H * (.25 + band * .14), n = 26 + band * 10, sc = 1 + band * .45;
      for (var i = 0; i < n; i++) {
        var x = r() * W, y = y0 + (r() - .5) * H * .06, rad = (30 + r() * 70) * sc;
        var cg = g.createRadialGradient(x, y, 0, x, y, rad);
        var a = .22 + r() * .25;
        cg.addColorStop(0, "rgba(255,255,255," + a + ")"); cg.addColorStop(.6, "rgba(245,240,235," + a * .5 + ")"); cg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = cg;
        g.beginPath(); g.ellipse(x, y, rad * 1.8, rad * .55, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function night(c) {
    var g = c.getContext("2d"), W = c.width, H = c.height, r = SF.rng(11);
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#02040a"); grad.addColorStop(.6, "#0a1428"); grad.addColorStop(.72, "#1b2440"); grad.addColorStop(1, "#05070c");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    for (var i = 0; i < 900; i++) {
      var y = r() * H * .66, s = r() * 1.6;
      g.fillStyle = "rgba(255,255,255," + (.25 + r() * .7) + ")";
      g.fillRect(r() * W, y, s, s);
    }
    var moon = g.createRadialGradient(W * .22, H * .2, 0, W * .22, H * .2, 120);
    moon.addColorStop(0, "rgba(245,240,225,1)"); moon.addColorStop(.12, "rgba(245,240,225,.95)"); moon.addColorStop(.14, "rgba(200,210,240,.25)"); moon.addColorStop(1, "rgba(120,140,200,0)");
    g.fillStyle = moon; g.fillRect(0, 0, W, H);
    // city lights below the horizon, thicker towards the bottom
    for (var k = 0; k < 2600; k++) {
      var t = Math.pow(r(), .6), yy = H * (.74 + t * .26);
      var cx = (r() < .5 ? W * .3 : W * .72) + (r() - .5) * W * (.25 + t * .6);
      var sz = .6 + t * 2.2;
      g.fillStyle = r() < .8 ? "rgba(255,190,110," + (.35 + r() * .6) + ")" : "rgba(220,235,255," + (.3 + r() * .5) + ")";
      g.fillRect(cx, yy, sz, sz);
    }
  }
  function paint(host, kind) {
    var c = document.createElement("canvas");
    c.width = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
    c.height = Math.round(window.innerHeight * (window.devicePixelRatio || 1));
    c.style.width = "100%"; c.style.height = "100%";
    host.appendChild(c);
    (kind === "sky" ? sky : night)(c);
  }
  function mapBackdrop(host, imagery) {
    // Real tiles when Leaflet can load; the built-in atlas otherwise.
    function atlas() {
      host.innerHTML = "";
      var m = SF.FallbackMap(host, { camera: "route", showPlane: true, label: "Map backdrop" });
      m.setRoute(SF.airport("MEL"), SF.airport("SYD"));
      m.setProgress(.45);
    }
    if (SF.forceOffline) { atlas(); return; }
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onerror = atlas;
    js.onload = function () {
      var map = window.L.map(host, { zoomControl: false, attributionControl: true }).setView([-35.6, 147.6], 6);
      if (imagery) {
        window.L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }).addTo(map);
      } else {
        window.L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap contributors" }).addTo(map);
        window.L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(map);
      }
      var A = SF.airport("MEL"), B = SF.airport("SYD");
      var pts = SF.geo.arcPoints(A, B, 64).map(function (p) { return [p.lat, p.lon]; });
      window.L.polyline(pts.slice(0, 30), { color: "#ffc400", weight: 3 }).addTo(map);
      window.L.polyline(pts.slice(29), { color: "#ece8de", weight: 1.5, dashArray: "5 5" }).addTo(map);
    };
    document.head.appendChild(js);
  }

  function panel(v) {
    return '<section class="glass lab-sheet lab-' + v.id + '" data-refract="' + v.refract + '">' +
      '<header class="sheet-head"><div><p class="label">Variant</p><h1>' + v.name + '</h1></div><span class="form-no">LAB ' + v.id.toUpperCase() + "</span></header>" +
      '<p class="muted">' + v.note + "</p>" +
      '<div class="glass lab-chip"><span class="label">Time to dest</span><b class="readout readout-lg">24:37</b></div>' +
      '<div class="row-btns"><button class="btn btn-signal">' + SF.icon("takeoff") + "<span>Board</span></button><button class=\"btn\">" + SF.icon("pause") + "<span>Hold</span></button><button class=\"btn icon-only\" aria-label=\"Window\">" + SF.icon("window") + "</button></div>" +
      '<label class="switch"><input type="checkbox" checked><span class="track"><span class="thumb"></span></span><span><b>Airplane mode</b><small>Toggle sample</small></span></label>' +
      '<label class="field"><span class="label">Volume</span><input type="range" min="0" max="100" value="62"></label>' +
      '<div class="seg"><button class="seg-btn on">Classic</button><button class="seg-btn">Satellite</button><button class="seg-btn">Globe</button></div>' +
      '<div class="well lab-readouts"><div><span class="label">ALT</span><b class="readout readout-md">36 020</b></div><div><span class="label">GS</span><b class="readout readout-md">472</b></div><div><span class="label">HDG</span><b class="readout readout-md">054°</b></div></div>' +
      "</section>";
  }

  SF.views.lab = {
    stage: true,
    mount: function (root) {
      var bg = new URLSearchParams(location.search).get("bg") || "map";
      document.body.setAttribute("data-backdrop", bg === "sky" || bg === "sat" ? "bright" : "dark");
      ui.topbar(ui.topbarTitle("Glass lab"),
        '<div class="glass seg-host"><div class="seg">' + BACKDROPS.map(function (b) {
          return '<a class="seg-btn' + (b[0] === bg ? " on" : "") + '" href="?lab=1&bg=' + b[0] + (SF.dev ? "&dev=1" : "") + '">' + b[1] + "</a>";
        }).join("") + "</div></div>");
      root.innerHTML = '<div class="stage" id="labStage"></div><div class="lab">' + VARIANTS.map(panel).join("") + "</div>";
      var stage = root.querySelector("#labStage");
      if (bg === "map" || bg === "sat") mapBackdrop(stage, bg === "sat"); else paint(stage, bg);
    },
    unmount: function () { document.body.removeAttribute("data-backdrop"); }
  };
})();

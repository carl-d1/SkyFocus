/* UI shell: icons, router, modals, toasts, announcements, airport picker, theme, title/favicon, shortcuts. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = (SF.ui = {});
  SF.views = SF.views || {};

  /* ---------- icons (original line icons, 24x24, stroke = currentColor) ---------- */
  var P = {
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    glasses: '<circle cx="6.5" cy="15" r="3.5"/><circle cx="17.5" cy="15" r="3.5"/><path d="M10 15c1.2-1 2.8-1 4 0"/><path d="M3 15l2-8h2M21 15l-2-8h-2"/>',
    pen: '<path d="M16.5 3.5l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    plane: '<path d="M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z"/>',
    takeoff: '<path d="M3 20h18"/><path d="M4 14.5l3.2 1.6 12-5.5a1.8 1.8 0 0 0-1.4-3.3L13.5 9 7 6 5.5 6.8l4 3.6-3.4 1.5-2-1z"/>',
    landing: '<path d="M3 20h18"/><path d="M4.5 8.5l1.4-.8 2.3 2 4.3.7-2.7-6 1.8-.4 4.5 6.6 4 .7a1.8 1.8 0 0 1-.6 3.5L5 13z"/>',
    map: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    window: '<path d="M7 3h10l2 3v12l-2 3H7l-2-3V6z"/><path d="M8 14l3-2 2 1 3-2"/><path d="M8 17h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logbook: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    passport: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><circle cx="12" cy="10" r="3.5"/><path d="M8.5 10h7M12 6.5c1 1 1.4 2.2 1.4 3.5S13 12.5 12 13.5M12 6.5c-1 1-1.4 2.2-1.4 3.5s.4 2.5 1.4 3.5M9 17.5h6"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    seat: '<path d="M7 3h7a2 2 0 0 1 2 2v8H7z"/><path d="M5 13h13l1 5H5zM7 18v3M17 18v3"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    coffee: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5c-.8 1 .8 2-.1 3M12 2.5c-.8 1 .8 2-.1 3"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    flame: '<path d="M12 21c4 0 7-2.7 7-6.5 0-3.6-2.7-5.6-4-9.5-2 1.6-3 3.6-3 5.5-1-1-1.6-2-1.8-3.3C7.8 9.4 5 11.6 5 14.5 5 18.3 8 21 12 21z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h7a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h7"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    frame: '<path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/><path d="M8 15l3-6 2 4 1.5-2L17 15z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    ticket: '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M15 6v2M15 11v2M15 16v2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
  };
  SF.icon = function (name, cls) {
    return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (P[name] || P.tag) + "</svg>";
  };
  SF.iconNames = Object.keys(P);
  SF.TAG_ICONS = ["book", "briefcase", "glasses", "pen", "code", "star", "heart", "music", "leaf", "flask", "palette", "dumbbell", "coffee", "target", "compass"];

  /* ---------- DOM helpers ---------- */
  ui.$ = function (sel, root) { return (root || document).querySelector(sel); };
  ui.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  ui.h = function (html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  ui.reducedMotion = function () {
    return SF.store.state.settings.reducedMotion ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  /* ---------- theme ---------- */
  ui.applyTheme = function () {
    var s = SF.store.state.settings;
    var theme = s.theme;
    if (theme === "auto") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("reduce-motion", !!s.reducedMotion);
  };
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { ui.applyTheme(); });
    } catch (e) { /* old browsers */ }
  }

  /* ---------- router ---------- */
  var current = null, currentName = null;
  var NAV = [
    { route: "book", label: "Book", icon: "takeoff", key: "" },
    { route: "logbook", label: "Logbook", icon: "logbook", key: "L" },
    { route: "passport", label: "Passport", icon: "passport", key: "" },
    { route: "stats", label: "Stats", icon: "stats", key: "S" },
    { route: "settings", label: "Settings", icon: "gear", key: "" }
  ];
  ui.NAV = NAV;

  ui.parseHash = function () {
    var h = (window.location.hash || "").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    return { name: parts[0] || "book", args: parts.slice(1) };
  };
  ui.go = function (path) {
    var target = "#/" + path.replace(/^#?\/?/, "");
    if (window.location.hash === target) ui.render();
    else window.location.hash = target;
  };
  ui.currentRoute = function () { return currentName; };

  // Booking to gate runs inside a view transition where supported, so the destination card morphs
  // into the boarding pass instead of cutting. Not while a scene is on screen, not with reduced
  // motion, and a transition that has not finished within a second is skipped.
  ui.render = function () {
    var vt = document.startViewTransition && currentName === "book" && ui.parseHash().name === "board" &&
      !ui.reducedMotion() && !(SF.scenes && SF.scenes.playing) && !document.hidden;
    if (!vt) { renderNow(); return; }
    var html = document.documentElement, t = null, guard = null;
    html.classList.add("vt-run");
    function done() { clearTimeout(guard); html.classList.remove("vt-run"); }
    try {
      t = document.startViewTransition(renderNow);
      t.finished.then(done, done);
      // a skipped transition rejects these; that is expected
      if (t.ready) t.ready.catch(function () {});
      if (t.updateCallbackDone) t.updateCallbackDone.catch(function () {});
      guard = setTimeout(function () { try { t.skipTransition(); } catch (e) { /* already over */ } done(); }, 1000);
    } catch (e) { done(); renderNow(); }
  };
  function renderNow() {
    var r = ui.parseHash();
    var st = SF.store.state;
    if (!st.profile.onboarded && r.name !== "welcome" && r.name !== "lab") { ui.go("welcome"); return; }
    if (st.activeFlight && st.activeFlight.started && r.name === "book") { ui.go("flight"); return; }
    var view = SF.views[r.name];
    if (!view) { ui.go("book"); return; }
    if (current && current.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }
    modalStack.slice().forEach(function (m) { if (m.dismissable) m.close(true); });
    var root = ui.$("#view");
    root.innerHTML = "";
    root.className = "view view-" + r.name;
    currentName = r.name;
    current = view;
    document.body.setAttribute("data-route", r.name);
    // Layout flags: "stage" = full-bleed map behind the shell, "fit" = exactly one viewport tall.
    document.body.classList.toggle("has-stage", !!view.stage);
    document.body.classList.toggle("fit", !!(view.fit || view.stage));
    ui.topbar("", "");
    try { view.mount(root, r.args); } catch (e) { console.error(e); root.innerHTML = '<div class="glass empty"><p class="mono">VIEW FAILED TO LOAD.</p></div>'; }
    ui.updateNav();
    root.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // Fill the shared top bar's side slots. Strings or nodes.
  ui.topbar = function (left, right) {
    [["#tbLeft", left], ["#tbRight", right]].forEach(function (x) {
      var el = ui.$(x[0]);
      if (!el) return;
      el.innerHTML = "";
      if (typeof x[1] === "string") el.innerHTML = x[1]; else if (x[1]) el.appendChild(x[1]);
    });
  };
  ui.topbarTitle = function (text) { return '<h1 class="tb-title">' + text + "</h1>"; };

  ui.buildNav = function () {
    var nav = ui.$("#nav");
    nav.innerHTML =
      '<a class="brand" href="#/book" aria-label="SkyFocus home" title="SkyFocus"><img src="assets/logo.svg" alt="" width="34" height="34"></a>' +
      '<ul class="nav-list">' + NAV.map(function (n) {
        return '<li><a href="#/' + n.route + '" data-route="' + n.route + '" aria-label="' + n.label + '" title="' + n.label + '">' + SF.icon(n.icon) + "<span>" + n.label + "</span></a></li>";
      }).join("") + "</ul>" +
      '<div class="nav-flight" id="navFlight" hidden></div>' +
      '<div class="nav-foot"><div class="nav-goal" id="navGoal"></div></div>';
  };

  ui.updateNav = function () {
    ui.$$("#nav .nav-list a").forEach(function (a) {
      var on = a.getAttribute("data-route") === currentName || (currentName === "board" && a.getAttribute("data-route") === "book");
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var af = SF.store.state.activeFlight;
    var pill = ui.$("#navFlight");
    if (pill) {
      var show = af && af.started && currentName !== "flight";
      pill.hidden = !show;
      if (show) {
        pill.innerHTML = '<a href="#/flight" aria-label="Return to flight ' + af.from + " to " + af.to + '">' + SF.icon("plane") + '<b>' + af.to + '</b><small id="navFlightTime">--:--</small></a>';
      }
    }
    ui.updateGoal();
  };

  ui.updateGoal = function () {
    var g = ui.$("#navGoal");
    if (!g || !SF.stats) return;
    var today = SF.stats.todayMinutes();
    var goal = SF.store.state.settings.dailyGoalMin || 120;
    g.innerHTML = ui.ring(today / goal, 48, 4, "Daily goal " + Math.round(today / goal * 100) + "%") + '<small>Goal</small><b>' + Math.round(today / goal * 100) + "%</b>";
    g.title = SF.fmt.dur(today) + " of " + SF.fmt.dur(goal) + " today";
  };

  /* ---------- progress ring ---------- */
  // Over 100%: the outer ring is full and glows, and a second lap fills on an inner track.
  ui.ring = function (frac, size, stroke, label) {
    frac = Math.max(0, frac || 0);
    var lap1 = Math.min(1, frac), lap2 = Math.max(0, Math.min(1, frac - 1));
    var h = size / 2, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var r2 = r - stroke - 1.5, c2 = 2 * Math.PI * r2;
    function arc(rad, circ, f, cls) {
      return '<circle cx="' + h + '" cy="' + h + '" r="' + rad + '" class="' + cls + '" stroke-width="' + stroke + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ * (1 - f) + '" transform="rotate(-90 ' + h + " " + h + ')"/>';
    }
    return '<svg class="ring' + (frac >= 1 ? " over" : "") + '" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="' + (label || Math.round(frac * 100) + "% complete") + '">' +
      '<circle cx="' + h + '" cy="' + h + '" r="' + r + '" class="ring-bg" stroke-width="' + stroke + '"/>' +
      arc(r, c, lap1, "ring-fg") +
      (lap2 > 0 ? arc(r2, c2, lap2, "ring-fg ring-lap2") : "") + "</svg>";
  };

  /* ---------- modals ---------- */
  var modalStack = [];
  function closeAllModals() { while (modalStack.length) modalStack[modalStack.length - 1].close(true); }
  ui.closeAllModals = closeAllModals;

  ui.modal = function (opts) {
    var prevFocus = document.activeElement;
    var wrap = ui.h('<div class="modal-wrap" role="presentation"><div class="modal ' + (opts.doc ? "modal-doc " : "glass ") + (opts.cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="mt-' + modalStack.length + '">' +
      (opts.title ? '<header class="modal-head"><h2 id="mt-' + modalStack.length + '">' + opts.title + "</h2>" +
        (opts.dismissable === false ? "" : '<button class="btn icon-only small" data-close aria-label="Close">' + SF.icon("x") + "</button>") + "</header>" : "") +
      '<div class="modal-body"></div><footer class="modal-actions"></footer></div></div>');
    var body = wrap.querySelector(".modal-body");
    if (typeof opts.body === "string") body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = wrap.querySelector(".modal-actions");
    (opts.actions || []).forEach(function (a) {
      var b = ui.h('<button type="button" class="btn ' + (a.primary ? "btn-signal" : a.danger ? "btn-danger" : "") + '">' + (a.icon ? SF.icon(a.icon) : "") + "<span>" + a.label + "</span></button>");
      b.addEventListener("click", function () {
        var keep = a.onClick && a.onClick(api) === false;
        if (!keep) api.close();
      });
      foot.appendChild(b);
    });
    if (!foot.children.length) foot.remove();
    var api = {
      el: wrap, body: body,
      close: function (silent) {
        var i = modalStack.indexOf(api);
        if (i < 0) return;
        modalStack.splice(i, 1);
        wrap.remove();
        if (opts.onDestroy) opts.onDestroy();
        if (!silent && opts.onClose) opts.onClose();
        if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    };
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap && opts.dismissable !== false) api.close(); });
    wrap.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) api.close(); });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Tab") {
        var f = ui.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', wrap).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    api.dismissable = opts.dismissable !== false;
    document.body.appendChild(wrap);
    modalStack.push(api);
    var first = wrap.querySelector("[autofocus]") || wrap.querySelector(".modal-actions .btn-signal") || wrap.querySelector("button, input, select, textarea");
    if (first) setTimeout(function () { first.focus(); }, 30);
    return api;
  };
  ui.topModal = function () { return modalStack[modalStack.length - 1]; };

  ui.confirm = function (title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      ui.modal({
        title: title, body: "<p>" + message + "</p>", cls: "modal-sm",
        onClose: function () { if (!done) resolve(false); },
        actions: [
          { label: "Cancel", onClick: function () { done = true; resolve(false); } },
          { label: okLabel || "Confirm", primary: !danger, danger: !!danger, onClick: function () { done = true; resolve(true); } }
        ]
      });
    });
  };

  /* ---------- toasts & announcements ---------- */
  // One status line in the centre of the top bar. Announcements and toasts share it, newest wins,
  // so messages never cover content.
  var statusTimer = null;
  function showStatus(title, text, icon, ms, kind) {
    var host = ui.$("#tbStatus");
    if (!host) return;
    var el = ui.h('<div class="status-pill glass ' + (kind || "") + '" role="status">' +
      '<span class="st-icon">' + SF.icon(icon || "info") + "</span>" +
      (title ? '<b class="st-title">' + title + "</b>" : "") + '<span class="st-text">' + text + "</span></div>");
    var old = host.firstElementChild;
    if (old) { old.classList.add("out"); setTimeout(function () { old.remove(); }, 160); }
    host.appendChild(el);
    ui.$("#live").textContent = (title ? title + ". " : "") + text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 160); }, ms);
  }
  ui.toast = function (msg, icon, ms) { showStatus("", msg, icon, ms || 3600, "toast"); };
  ui.announce = function (title, text, icon) {
    showStatus(title, text, icon, 7000, "announce");
    if (SF.audio && SF.audio.chime) SF.audio.chime();
  };

  /* ---------- airport picker (combobox) ---------- */
  ui.searchAirports = function (q, exclude) {
    q = (q || "").trim().toLowerCase();
    var list = window.AIRPORTS.filter(function (a) { return a.iata !== exclude; });
    if (!q) return list.slice().sort(function (a, b) { return a.city.localeCompare(b.city); });
    return list.map(function (a) {
      var s = 0;
      if (a.iata.toLowerCase() === q) s = 100;
      else if (a.iata.toLowerCase().indexOf(q) === 0) s = 80;
      else if (a.city.toLowerCase().indexOf(q) === 0) s = 70;
      else if (a.city.toLowerCase().indexOf(q) >= 0) s = 50;
      else if (a.country.toLowerCase().indexOf(q) === 0) s = 40;
      else if (a.name.toLowerCase().indexOf(q) >= 0) s = 30;
      else if (a.country.toLowerCase().indexOf(q) >= 0) s = 20;
      return { a: a, s: s };
    }).filter(function (x) { return x.s > 0; })
      .sort(function (x, y) { return y.s - x.s || x.a.city.localeCompare(y.a.city); })
      .map(function (x) { return x.a; });
  };

  // Attach a dropdown to an <input>. onSelect(airport).
  ui.airportPicker = function (input, onSelect, opts) {
    opts = opts || {};
    var id = "ap-" + Math.random().toString(36).slice(2, 8);
    var list = ui.h('<ul class="ap-list" role="listbox" id="' + id + '" hidden></ul>');
    input.parentNode.classList.add("ap-wrap");
    input.parentNode.appendChild(list);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
    var items = [], active = -1;
    function render() {
      items = ui.searchAirports(input.value, opts.exclude && opts.exclude()).slice(0, 8);
      active = items.length ? 0 : -1;
      list.innerHTML = items.map(function (a, i) {
        return '<li role="option" id="' + id + "-" + i + '" data-i="' + i + '" class="' + (i === active ? "active" : "") + '"><b class="mono">' + a.iata + "</b><span>" + SF.esc(a.city) + " <small>" + SF.esc(a.country) + "</small></span></li>";
      }).join("") || '<li class="empty">No airports match</li>';
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      sync();
    }
    function sync() {
      ui.$$("li[data-i]", list).forEach(function (li, i) { li.classList.toggle("active", i === active); });
      if (active >= 0) input.setAttribute("aria-activedescendant", id + "-" + active); else input.removeAttribute("aria-activedescendant");
      var el = list.querySelector("li.active");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); }
    function choose(i) {
      var a = items[i];
      if (!a) return;
      input.value = a.city + " (" + a.iata + ")";
      close();
      onSelect(a);
    }
    input.addEventListener("input", render);
    input.addEventListener("focus", function () { input.select(); render(); });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
    input.addEventListener("keydown", function (e) {
      if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) { render(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); sync(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); sync(); }
      else if (e.key === "Enter") { if (!list.hidden && active >= 0) { e.preventDefault(); justChose = true; choose(active); } }
      else if (e.key === "Escape") { if (!list.hidden) { e.stopPropagation(); close(); } }
    });
    // Some input paths deliver Enter's keypress separately; never let picking an airport submit a form.
    var justChose = false;
    input.addEventListener("keypress", function (e) { if (e.key === "Enter" && justChose) e.preventDefault(); justChose = false; });
    input.addEventListener("keyup", function () { justChose = false; });
    list.addEventListener("mousedown", function (e) {
      var li = e.target.closest("li[data-i]");
      if (li) { e.preventDefault(); choose(+li.getAttribute("data-i")); }
    });
    return { close: close };
  };

  /* ---------- tab title & favicon ---------- */
  var baseFavicon = "assets/favicon.svg";
  var lastFav = "";
  ui.setTitle = function (t) { document.title = t ? t + " · SkyFocus" : "SkyFocus"; };
  ui.setFlightFavicon = function (progress) {
    var link = ui.$("#favicon");
    if (progress == null) {
      if (lastFav !== "base") { link.href = baseFavicon; link.type = "image/svg+xml"; lastFav = "base"; }
      return;
    }
    var key = "p" + Math.round(progress * 40);
    if (key === lastFav) return;
    lastFav = key;
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    g.fillStyle = "#0d1626"; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#f4a640"; g.beginPath(); g.arc(32, 32, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); g.stroke();
    g.fillStyle = "#ffffff";
    g.translate(32, 32); g.rotate(Math.PI / 4); g.scale(1.25, 1.25); g.translate(-12, -12);
    g.fill(new Path2D("M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21l-4-1.2L8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z"));
    link.type = "image/png";
    link.href = c.toDataURL("image/png");
  };

  /* ---------- fullscreen ---------- */
  ui.isFullscreen = function () { return !!document.fullscreenElement; };
  ui.enterFullscreen = function () {
    var el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) return el.requestFullscreen().catch(function () { });
    return Promise.resolve();
  };
  ui.exitFullscreen = function () {
    if (document.fullscreenElement && document.exitFullscreen) return document.exitFullscreen().catch(function () { });
    return Promise.resolve();
  };

  /* ---------- shortcuts ---------- */
  var SHORTCUTS = ui.SHORTCUTS = [
    ["Space", "Hold or resume"],
    ["M", "Cycle map mode"],
    ["W", "Window view"],
    ["N", "Mute or unmute sound"],
    ["F", "Airplane mode"],
    ["C", "Camera: follow or route"],
    ["L", "Logbook"],
    ["S", "Stats"],
    ["Esc", "Close panel"],
    ["?", "Shortcut list"]
  ];
  ui.showShortcuts = function () {
    if (ui.$(".modal-shortcuts")) return;
    ui.modal({
      title: "Keyboard shortcuts", cls: "modal-sm modal-shortcuts",
      body: '<dl class="kbd-list">' + SHORTCUTS.map(function (s) { return "<dt><kbd>" + s[0] + "</kbd></dt><dd>" + s[1] + "</dd>"; }).join("") + "</dl>"
    });
  };

  // Views can register key handlers: return true if handled.
  var keyHandlers = [];
  ui.onKey = function (fn) {
    keyHandlers.push(fn);
    return function () { keyHandlers = keyHandlers.filter(function (k) { return k !== fn; }); };
  };

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    var typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
    if (e.key === "Escape") {
      var top = ui.topModal();
      if (top && top.dismissable) { top.close(); e.preventDefault(); return; }
    }
    if (typing) return;
    if (ui.topModal() && e.key !== "?") return;
    for (var i = keyHandlers.length - 1; i >= 0; i--) {
      if (keyHandlers[i](e)) { e.preventDefault(); return; }
    }
    var k = e.key;
    if (k === "?") { e.preventDefault(); ui.showShortcuts(); }
    else if (k === "l" || k === "L") { ui.go("logbook"); }
    else if (k === "s" || k === "S") {
      ui.go("stats");
    }
  });

  /* ---------- file:// banner ---------- */
  ui.fileBanner = function () {
    if (!SF.isFile || SF.store.state.ui.fileBannerDismissed) return;
    var b = ui.h('<div class="file-banner" role="note">' + SF.icon("info") +
      "<span><b>FILE MODE.</b> Data here is stored separately from the start.bat version. Notifications need start.bat. Move data with Settings: Export and Import.</span>" +
      '<button class="btn icon-only small" aria-label="Dismiss">' + SF.icon("x") + "</button></div>");
    b.querySelector("button").addEventListener("click", function () {
      SF.store.update(function (s) { s.ui.fileBannerDismissed = true; });
      b.remove();
      document.body.classList.remove("has-banner");
    });
    // A row at the top of the main column, so it never overlaps content.
    var main = ui.$(".main");
    main.insertBefore(b, main.firstChild);
    document.body.classList.add("has-banner");
  };
})();

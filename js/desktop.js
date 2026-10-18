/* Desktop app integration (Electron). Runs only when the preload bridge is present, so the browser
   version is unchanged: window controls embedded in the top bar, fullscreen reveal, and the links to
   the main process (pill state, tray commands, notifications, focus, preferences and data). */
(function () {
  var SF = (window.SF = window.SF || {});
  var D = window.skyfocusDesktop;
  if (!D) return;
  var ui = SF.ui, html = document.documentElement;
  SF.desktop = D;
  html.classList.add("desktop");

  /* ---------- window controls in the top bar ---------- */
  var ctrls = ui.h('<div class="glass win-ctrls" id="winCtrls" role="toolbar" aria-label="Window">' +
    '<button type="button" class="wc" id="wcPill" title="Mini pill (P)" aria-label="Open the mini pill">' + SF.icon("pill") + "</button>" +
    '<span class="wc-sep" aria-hidden="true"></span>' +
    '<button type="button" class="wc" id="wcMin" title="Minimise" aria-label="Minimise">' + SF.icon("winMin") + "</button>" +
    '<button type="button" class="wc" id="wcMax" title="Maximise" aria-label="Maximise">' + SF.icon("winMax") + "</button>" +
    '<button type="button" class="wc" id="wcFull" title="Fullscreen (F11)" aria-label="Fullscreen">' + SF.icon("expand") + "</button>" +
    '<button type="button" class="wc close" id="wcClose" title="Close" aria-label="Close">' + SF.icon("x") + "</button></div>");
  document.getElementById("topbar").appendChild(ctrls);
  var $ = function (id) { return document.getElementById(id); };
  $("wcPill").onclick = function () { D.openPill(); };
  $("wcMin").onclick = function () { D.minimize(); };
  $("wcMax").onclick = function () { D.toggleMaximize(); };
  $("wcFull").onclick = function () { D.toggleFullscreen(); };
  $("wcClose").onclick = function () { D.close(); };

  var win = { maximized: false, fullscreen: false };
  D.onWindowState(function (s) {
    win = s || win;
    html.classList.toggle("win-max", !!win.maximized);
    html.classList.toggle("win-fullscreen", !!win.fullscreen);
    var mx = $("wcMax");
    mx.innerHTML = SF.icon(win.maximized ? "winRestore" : "winMax");
    mx.title = mx.ariaLabel = win.maximized ? "Restore" : "Maximise";
    var fl = $("wcFull");
    fl.innerHTML = SF.icon(win.fullscreen ? "shrink" : "expand");
    fl.title = win.fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F11)";
    fl.ariaLabel = fl.title;
    if (!win.fullscreen) html.classList.remove("win-reveal");
  });
  // in fullscreen the controls hide; moving to the top edge brings them back for a moment
  var revealT = null;
  document.addEventListener("mousemove", function (e) {
    if (!win.fullscreen) return;
    if (e.clientY <= 6 || ctrls.contains(e.target)) {
      html.classList.add("win-reveal");
      clearTimeout(revealT);
      revealT = setTimeout(function () { if (!ctrls.matches(":hover")) html.classList.remove("win-reveal"); }, 2500);
    }
  });
  ctrls.addEventListener("mouseleave", function () {
    if (!win.fullscreen) return;
    clearTimeout(revealT);
    revealT = setTimeout(function () { html.classList.remove("win-reveal"); }, 1200);
  });

  // F (outside the flight screen, where F is airplane mode) and the window fullscreen
  SF.toggleFullscreen = function () { D.toggleFullscreen(); };

  /* ---------- first launch: bring data across from the browser version ---------- */
  function offerImport() {
    var body = ui.h('<div><p>Desktop data is stored separately from the browser version. To bring your flights, stamps, achievements and tier across, ' +
      "export from the browser version (Settings, Your data, Export JSON) and import the file here.</p>" +
      '<input type="file" id="firstImport" accept="application/json,.json" hidden></div>');
    var input = body.querySelector("#firstImport");
    var m = ui.modal({
      title: "Welcome to SkyFocus for Windows", body: body, cls: "modal-sm", dismissable: false,
      actions: [
        { label: "Start fresh", onClick: function () { D.firstRunDone(); } },
        { label: "Import JSON", primary: true, icon: "upload", onClick: function () { input.click(); return false; } }
      ]
    });
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var err = SF.store.importJSON(String(r.result));
        if (err) { ui.toast(err, "alert", 5000); input.value = ""; return; }
        D.firstRunDone();
        if (m && m.close) m.close(true);
        ui.applyTheme(); ui.buildNav();
        if (SF.store.state.activeFlight && SF.store.state.activeFlight.started) SF.engine.run();
        ui.toast("Import complete. " + SF.store.state.flights.length + " flights.", "check");
        ui.go(SF.store.state.profile.onboarded ? "book" : "welcome");
      };
      r.readAsText(f);
    };
  }
  // decided after start-up, so data already present (a resumed or seeded profile) skips the offer
  D.isFirstRun().then(function (first) {
    if (first) setTimeout(function () { if (SF.store.state.flights.length) D.firstRunDone(); else offerImport(); }, 800);
  });

  /* ---------- presence for the distraction guard ----------
     visible: the main window is on screen, or the pill is. focused: SkyFocus or its pill is the
     active app. In airplane mode leaving focus counts as turbulence; otherwise only leaving view. */
  SF.engine.presenceFromHost = true;
  D.onPresence(function (p) {
    var af = SF.store.state.activeFlight;
    if (!p || !af) return;
    SF.engine.setAway(af.airplaneMode ? !p.focused : !p.visible);
  });
})();

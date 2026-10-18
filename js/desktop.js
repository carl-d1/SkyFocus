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
})();

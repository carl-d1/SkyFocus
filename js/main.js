/* Boot: theme, shell, resume-after-reload, routing. */
(function () {
  var SF = window.SF;
  var ui = SF.ui;

  function resumePrompt() {
    var af = SF.store.state.activeFlight;
    if (!af || !af.started) return false;
    var now = Date.now();
    // Closing the app counts as leaving the cabin.
    if (af.awayStart) {
      SF.store.update(function (s) {
        var f = s.activeFlight;
        f.awayMs += now - f.awayStart;
        f.awayStart = null;
        f.turbulence += 1;
      }, true);
    }
    SF.flight.normalize(af, now);
    var st = SF.flight.status(af, now);
    var body = st.done
      ? "<p>Flight <b>" + af.flightNo + "</b> from " + SF.esc(af.fromCity) + " to <b>" + SF.esc(af.toCity) + "</b> reached its destination while SkyFocus was closed.</p>"
      : "<p>Flight <b>" + af.flightNo + "</b> " + af.from + " → " + af.to + " is still in the air. The clock kept running while you were away.</p>" +
        '<p class="mono big-remaining">' + SF.fmt.clock(st.remainingMs) + ' <small class="muted">remaining · ' + Math.floor(st.progress * 100) + "% complete</small></p>";
    ui.modal({
      title: st.done ? "You’ve arrived" : "Welcome back aboard",
      body: body, cls: "modal-sm", dismissable: false,
      actions: st.done
        ? [{ label: "Divert instead", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Complete landing", primary: true, icon: "landing", onClick: function () { SF.engine.land(); } }]
        : [{ label: "Divert", icon: "alert", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Resume flight", primary: true, icon: "play", onClick: function () { ui.go("flight"); SF.engine.run(); } }]
    });
    return true;
  }

  function boot() {
    ui.applyTheme();
    ui.buildNav();
    ui.fileBanner();
    window.addEventListener("hashchange", ui.render);
    ui.render();
    resumePrompt();
    if (SF.dev) console.info("SkyFocus dev mode: flights run 60× faster.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

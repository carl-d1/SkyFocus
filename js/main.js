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
      ? "<p>Flight <b>" + af.flightNo + "</b> " + af.from + " → " + af.to + " reached " + SF.esc(af.toCity) + " while SkyFocus was closed.</p>"
      : "<p>Flight <b>" + af.flightNo + "</b> " + af.from + " → " + af.to + " is airborne. Time continued while SkyFocus was closed.</p>" +
        '<p class="mono big-remaining">' + SF.fmt.clock(st.remainingMs) + ' <small class="muted">REMAINING · ' + Math.floor(st.progress * 100) + "%</small></p>";
    ui.modal({
      title: st.done ? "Flight arrived" : "Flight in progress",
      body: body, cls: "modal-sm", dismissable: false,
      actions: st.done
        ? [{ label: "Divert", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Complete landing", primary: true, icon: "landing", onClick: function () { SF.engine.land(); } }]
        : [{ label: "Divert", icon: "alert", onClick: function () { SF.engine.divert("resume"); } },
           { label: "Resume flight", primary: true, icon: "play", onClick: function () { ui.go("flight"); SF.engine.run(); } }]
    });
    return true;
  }

  // Dev only: ?dev=1&demo=flight seeds a passenger and a flight in progress (used for screenshots).
  function seedDemo() {
    if (!SF.dev || new URLSearchParams(location.search).get("demo") !== "flight" || SF.store.state.activeFlight) return;
    SF.store.update(function (s) {
      if (!s.profile.onboarded) {
        s.profile = { name: "Demo Pilot", home: "MEL", memberSince: Date.now(), memberNo: "SF 0000 0000", onboarded: true };
        s.currentAirport = "MEL";
      }
      var af = SF.flight.create({ from: "MEL", to: "SYD", minutes: 600, tagId: "coding", seat: "4A", task: "Refactor the parser" });
      af.timeScale = 1;
      af.started = true;
      af.startAt = Date.now() - 240 * 60000;
      af.milestones = { pushback: 1, takeoff: 1, cruise: 1 };
      s.activeFlight = af;
    }, true);
    location.hash = "#/flight";
    SF.engine.run();
  }

  function boot() {
    ui.applyTheme();
    SF.glass.init();
    // Dim world map behind document screens.
    try { SF.FallbackMap(document.getElementById("backdrop"), { camera: "world", showPlane: false, label: "World map", instant: true }); } catch (e) { console.warn(e); }
    ui.buildNav();
    ui.fileBanner();
    window.addEventListener("hashchange", ui.render);
    if (SF.dev && new URLSearchParams(location.search).get("demo") === "flight") { seedDemo(); ui.render(); }
    else { ui.render(); resumePrompt(); }
    if (SF.dev) console.info("SkyFocus dev mode: flights run 60× faster.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* The mini pill, app side. Builds a snapshot of the flight or layover twice a second and sends it to
   the desktop pill (through the main process, which also drives the tray and taskbar) or to the
   browser Picture-in-Picture pill. Handles commands coming back (hold, book, divert), and raises
   notification events: landing, layover end, journey legs and the daily reminder. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D = window.skyfocusDesktop || null;
  var ABBR = { Pushback: "PUSH", Taxi: "TAXI", Takeoff: "T/O", Climb: "CLB", Cruise: "CRZ", Descent: "DES", Approach: "APP", Landing: "LDG", Holding: "HOLD", Arrived: "ARR" };

  function snapshot() {
    var S = SF.store.state, af = S.activeFlight, now = Date.now(), j = SF.journey && SF.journey.active();
    if (af && af.started) {
      var st = SF.flight.status(af, now);
      return {
        kind: "flight", flightNo: af.flightNo, from: af.from, to: af.to,
        remainingMs: st.remainingMs, progress: st.progress, routeFrac: st.routeFrac,
        phase: ABBR[st.phase] || "", holding: !!st.paused, holdsLeft: Math.max(0, SF.flight.maxHolds(af) - af.holds),
        journey: af.legIndex != null ? { index: af.legIndex, count: af.legCount || (j ? j.legs.length : 0) } : null
      };
    }
    var lo = S.layover;
    if (lo) {
      var total = lo.min * 60000, left = Math.max(0, total - (now - lo.start) * (lo.scale || 1));
      var inJ = j && lo.journeyId === j.id;
      return {
        kind: "layover", at: S.currentAirport, remainingMs: left, progress: total ? 1 - left / total : 1,
        next: inJ && j.legs[j.index] ? j.legs[j.index].to : "",
        journey: inJ ? { index: j.index, count: j.untilStop ? j.legs.length : j.legs.length } : null
      };
    }
    return { kind: "idle" };
  }

  /* ---------- notifications (desktop) ---------- */
  function notify(type, title, body) {
    if (D) D.event({ type: type, notify: true, title: title, body: body });
  }
  var prev = null;
  function transitions(s) {
    if (!prev) { prev = s; return; }   // nothing to announce for the state found at start
    var n = SF.store.state.settings.notify || {};
    if (prev.kind === "layover" && prev.remainingMs > 0 && (s.kind !== "layover" || s.remainingMs <= 0) && n.layover) {
      notify("layoverEnd", "Layover over at " + prev.at, prev.next ? "Next leg to " + SF.airport(prev.next).city + " is ready to board." : "Ready for the next departure.");
    }
    if (s.kind === "flight" && s.journey && n.legs && (prev.kind !== "flight" || !prev.journey || prev.journey.index !== s.journey.index || prev.to !== s.to)) {
      notify("leg", "Leg " + (s.journey.index + 1) + (s.journey.count ? " of " + s.journey.count : "") + " departed", s.from + " to " + s.to + " · " + SF.airport(s.to).city);
    }
    prev = s;
  }
  // daily reminder: once a day at the chosen time, if the goal is not met yet
  function reminder() {
    var st = SF.store.state.settings;
    if (!D || !st.reminderEnabled) return;
    var now = new Date(), hm = (st.reminderTime || "09:00").split(":"), key = SF.stats.dayKey(now);
    var at = new Date(now); at.setHours(+hm[0], +hm[1], 0, 0);
    var sent = null;
    try { sent = localStorage.getItem("skyfocus.reminded"); } catch (e) { /* storage off */ }
    if (now < at || sent === key) return;
    try { localStorage.setItem("skyfocus.reminded", key); } catch (e) { /* storage off */ }
    var done = Math.round(SF.stats.todayMinutes()), goal = st.dailyGoalMin || 120;
    if (done >= goal) return;
    notify("reminder", "Time to fly", done + " of " + goal + " focus minutes today. A short flight keeps the streak going.");
  }

  /* ---------- commands from the pill, tray or PiP ---------- */
  function quickBook() {
    var S = SF.store.state;
    if (S.activeFlight && S.activeFlight.started) { SF.ui.go("flight"); return; }
    var pool = SF.routeCandidates(S.currentAirport, 25);
    if (pool.length) SF.bookPreset = { to: pool[0].a.iata, minutes: 25 };
    SF.ui.go("book");
  }
  function command(c) {
    if (!c) return;
    var af = SF.store.state.activeFlight;
    if (c.type === "hold" && af && af.started) SF.engine.hold();
    else if (c.type === "divert" && af && af.started) SF.engine.divert(af.journeyId ? "journey" : "manual");
    else if (c.type === "book") quickBook();
    else if (c.type === "expand") { if (pip) { try { window.focus(); } catch (e) { /* not allowed */ } pip.close(); } }
    else if (c.type === "closePill" && pip) pip.close();
    publish(true);
  }

  /* ---------- browser Picture-in-Picture pill (Chrome and Edge) ---------- */
  var pip = null, pipView = null;
  function pipSupported() { return !D && "documentPictureInPicture" in window; }
  function openPip() {
    if (pip) { pip.focus && pip.focus(); return; }
    window.documentPictureInPicture.requestWindow({ width: 472, height: 84 }).then(function (w) {
      pip = w;
      var d = w.document;
      d.title = "SkyFocus";
      var link = d.createElement("link");
      link.rel = "stylesheet"; link.href = new URL("desktop/pill.css", location.href).href;
      d.head.appendChild(link);
      d.body.classList.add("pip");
      pipView = window.SkyPill.create(d.body, { command: command });
      pipView.update(snapshot());
      w.addEventListener("pagehide", function () { pip = null; pipView = null; });
    }).catch(function (e) { SF.ui.toast("Pill unavailable: " + e.message, "alert"); });
  }

  /* ---------- publishing ---------- */
  var last = "";
  function publish(force) {
    var s = snapshot(), key = JSON.stringify(s);
    transitions(s);
    if (!force && key === last) return;
    last = key;
    if (D) D.pushState(s);
    if (pipView) pipView.update(s);
  }

  SF.pill = {
    snapshot: snapshot,
    supported: function () { return !!D || pipSupported(); },
    open: function () { if (D) D.openPill(); else if (pipSupported()) openPip(); }
  };
  SF.openPill = SF.pill.open;

  function start() {
    setInterval(publish, 500);
    setInterval(reminder, 60000);
    setTimeout(reminder, 5000);
    publish(true);
    SF.engine.on("hold", function () { publish(true); });
    SF.engine.on("landed", function (rec) {
      publish(true);
      var ev = { type: "landed" };
      if (D && (SF.store.state.settings.notify || {}).landing) { ev.notify = true; ev.title = "Landed in " + rec.toCity; ev.body = rec.flightNo + " · " + rec.from + " to " + rec.to + " · " + SF.fmt.dur(rec.focusMin) + " of focus"; }
      if (D) D.event(ev);
      if (pipView) pipView.event(ev);
    });
    SF.engine.on("diverted", function () { publish(true); if (D) D.event({ type: "diverted" }); });
    if (D) D.onCommand(command);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

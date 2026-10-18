/* The mini pill: a small floating summary of the flight. One renderer for the desktop pill window
   and the browser Picture-in-Picture window. It knows nothing about the app; it draws a snapshot and
   reports button presses, hover and drags to a host:
     host.command({ type })  hold, expand, closePill, book
     host.hover(on)          (desktop) grow or shrink the window around the pill
     host.drag(type, d)      (desktop) start, move { dx, dy }, end
     host.chime              true to play a short chime on landing */
(function () {
  var PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 11.2H13.6L9.4 3.5H7.6l2 7.7H4.8L3 8.8H1.6l1.2 3.2-1.2 3.2H3l1.8-2.4h4.8l-2 7.7h1.8l4.2-7.7H21c.7 0 1.2-.4 1.2-.8s-.5-.8-1.2-.8z"/></svg>';
  var ICON = {
    hold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  var R = 23, CIRC = 2 * Math.PI * R;

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + "h " + String(m).padStart(2, "0") : String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  window.SkyPill = {
    fmt: fmt,
    create: function (root, host) {
      host = host || {};
      var doc = root.ownerDocument;
      root.innerHTML =
        '<div class="pill" data-kind="idle">' +
        '<div class="p-clock"><svg class="p-ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="p-ring-bg" cx="28" cy="28" r="' + R + '"/><circle class="p-ring-fg" cx="28" cy="28" r="' + R + '" stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + CIRC.toFixed(2) + '"/></svg>' +
        '<b class="p-time" aria-live="off">--:--</b><span class="p-idle-icon">' + PLANE + "</span></div>" +
        '<div class="p-main">' +
        '<div class="p-top"><span class="p-code p-from"></span><span class="p-phase"></span><span class="p-code p-to"></span></div>' +
        '<div class="p-bar"><i class="p-fill"></i><span class="p-plane">' + PLANE + "</span></div>" +
        '<div class="p-sub"><span class="p-dots"></span><span class="p-note"></span></div>' +
        '<div class="p-ready"><b>Ready</b><button type="button" class="p-book" data-cmd="book">Book 25 min</button></div>' +
        "</div>" +
        '<div class="p-ctrls">' +
        '<button type="button" class="p-btn p-hold" data-cmd="hold" title="Hold">' + ICON.hold + "</button>" +
        '<button type="button" class="p-btn" data-cmd="expand" title="Open SkyFocus">' + ICON.expand + "</button>" +
        '<button type="button" class="p-btn p-x" data-cmd="closePill" title="Close pill">' + ICON.close + "</button>" +
        "</div></div>";
      var pill = root.querySelector(".pill");
      var q = function (c) { return pill.querySelector(c); };
      var el = { time: q(".p-time"), ring: q(".p-ring-fg"), from: q(".p-from"), to: q(".p-to"), phase: q(".p-phase"), fill: q(".p-fill"), plane: q(".p-plane"), dots: q(".p-dots"), note: q(".p-note"), hold: q(".p-hold") };
      var snap = { kind: "idle" };

      /* ---------- input ---------- */
      pill.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cmd]");
        if (b && host.command) host.command({ type: b.getAttribute("data-cmd") });
      });
      pill.addEventListener("dblclick", function (e) { if (!e.target.closest("button") && host.command) host.command({ type: "expand" }); });
      var leaveT = null;
      pill.addEventListener("mouseenter", function () {
        clearTimeout(leaveT);
        if (host.hover) host.hover(true);
        (doc.defaultView.requestAnimationFrame || setTimeout)(function () { pill.classList.add("open"); });
      });
      pill.addEventListener("mouseleave", function () {
        pill.classList.remove("open");
        clearTimeout(leaveT);
        leaveT = setTimeout(function () { if (host.hover) host.hover(false); }, 260);
      });
      if (host.drag) {
        var drag = null;
        pill.addEventListener("pointerdown", function (e) {
          if (e.button !== 0 || e.target.closest("button")) return;
          drag = { x: e.screenX, y: e.screenY, moved: false, id: e.pointerId };
          pill.setPointerCapture(e.pointerId);
        });
        pill.addEventListener("pointermove", function (e) {
          if (!drag) return;
          var dx = e.screenX - drag.x, dy = e.screenY - drag.y;
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          if (!drag.moved) { drag.moved = true; pill.classList.add("dragging"); host.drag("start"); }
          host.drag("move", { dx: dx, dy: dy });
        });
        var end = function () {
          if (!drag) return;
          if (drag.moved) host.drag("end");
          pill.classList.remove("dragging");
          drag = null;
        };
        pill.addEventListener("pointerup", end);
        pill.addEventListener("pointercancel", end);
      }

      /* ---------- landing chime (desktop pill only; the app chimes for itself) ---------- */
      var actx = null;
      function chime() {
        try {
          var AC = doc.defaultView.AudioContext || doc.defaultView.webkitAudioContext;
          actx = actx || new AC();
          var t = actx.currentTime + .02;
          [[987.8, 0], [740, .4]].forEach(function (n) {
            var o = actx.createOscillator(), g = actx.createGain();
            o.frequency.value = n[0]; o.connect(g); g.connect(actx.destination);
            g.gain.setValueAtTime(0, t + n[1]); g.gain.linearRampToValueAtTime(.12, t + n[1] + .012); g.gain.exponentialRampToValueAtTime(.0001, t + n[1] + 1.4);
            o.start(t + n[1]); o.stop(t + n[1] + 1.5);
          });
        } catch (e) { /* no audio */ }
      }

      /* ---------- drawing ---------- */
      function dots(j) {
        if (!j || !j.count) return "";
        var n = Math.min(j.count, 8), html = "";
        for (var i = 0; i < n; i++) html += '<i class="' + (i < j.index ? "done" : i === j.index ? "now" : "") + '"></i>';
        return html + (j.count > 8 ? "<em>+" + (j.count - 8) + "</em>" : "");
      }
      function update(s) {
        snap = s || { kind: "idle" };
        var k = snap.kind;
        pill.setAttribute("data-kind", k);
        pill.classList.toggle("holding", !!snap.holding);
        var frac = Math.max(0, Math.min(1, snap.progress || 0));
        el.ring.setAttribute("stroke-dashoffset", (CIRC * (1 - frac)).toFixed(2));
        if (k === "idle") { el.time.textContent = ""; return; }
        el.time.textContent = fmt(snap.remainingMs);
        el.time.classList.toggle("long", snap.remainingMs >= 3600000);
        el.dots.innerHTML = dots(snap.journey);
        if (k === "flight") {
          el.from.textContent = snap.from; el.to.textContent = snap.to;
          el.phase.textContent = snap.holding ? "HOLD" : snap.phase || "";
          var rf = Math.max(0, Math.min(1, snap.routeFrac || 0));
          el.fill.style.width = (rf * 100).toFixed(2) + "%";
          el.plane.style.left = (rf * 100).toFixed(2) + "%";
          el.note.textContent = snap.journey && snap.journey.count ? "LEG " + (snap.journey.index + 1) + " OF " + snap.journey.count : snap.flightNo || "";
          el.hold.innerHTML = snap.holding ? ICON.resume : ICON.hold;
          el.hold.title = snap.holding ? "Resume" : "Hold";
          el.hold.disabled = !snap.holding && snap.holdsLeft === 0;
        } else if (k === "layover") {
          el.from.textContent = snap.at;
          el.to.textContent = snap.next ? "NEXT: " + snap.next : "LAYOVER";
          el.phase.textContent = "BREAK";
          el.fill.style.width = (frac * 100).toFixed(2) + "%";
          el.note.textContent = snap.journey && snap.journey.count ? "LEG " + (snap.journey.index + 1) + " OF " + snap.journey.count + " NEXT" : "LAYOVER";
          el.hold.disabled = true;
        }
      }
      function event(ev) {
        if (!ev || ev.type !== "landed") return;
        pill.classList.remove("landed"); void pill.offsetWidth; pill.classList.add("landed");
        setTimeout(function () { pill.classList.remove("landed"); }, 2600);
        if (host.chime) chime();
      }
      return {
        update: update,
        event: event,
        setPrefs: function (p) { pill.classList.toggle("ghost", !!(p && p.pillClickThrough)); },
        setSide: function (side) { root.classList.toggle("grow-left", side === "left"); }
      };
    }
  };
})();

/* Dev only: ?dev=1&freeze=<epoch ms or 1> freezes time so screenshots are pixel exact.
   The clock is fixed, randomness is seeded, CSS animations are paused long after they started (finished ones show their end state),
   and every animation frame gets the same timestamp, so animated canvases draw one fixed frame.
   Does nothing without both parameters. */
(function () {
  var q = new URLSearchParams(location.search), f = q.get("freeze");
  if (q.get("dev") !== "1" || !f) return;
  var T = /^\d{10,}$/.test(f) ? +f : Date.UTC(2026, 9, 21, 10, 0, 0);
  var RD = Date;
  function FD(a, b, c, d, e, g, h) {
    if (!(this instanceof FD)) return new RD(T).toString();
    switch (arguments.length) {
      case 0: return new RD(T);
      case 1: return new RD(a);
      default: return new RD(a, b, c == null ? 1 : c, d || 0, e || 0, g || 0, h || 0);
    }
  }
  FD.prototype = RD.prototype;
  FD.now = function () { return T; };
  FD.UTC = RD.UTC; FD.parse = RD.parse;
  window.Date = FD;
  var P0 = 100000;
  performance.now = function () { return P0; };
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { return raf(function () { cb(P0); }); };
  var seed = 7;
  Math.random = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // animations sit at a fixed point long after they started: finished ones show their end state
  var css = "*,*::before,*::after{animation-play-state:paused!important;animation-delay:-9999s!important;transition:none!important;caret-color:transparent!important}";
  function inject() { var s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  if (document.head) inject(); else document.addEventListener("DOMContentLoaded", inject);
  window.SF_FROZEN = T;
})();

/* YPT link: starts and stops YPT on the phone through two MacroDroid webhook URLs, so the phone never
   has to be picked up to start a session. The URLs act like passwords, so they never enter SF.store
   (exports and backups cannot carry them): the desktop main process keeps them in its own state file
   and makes the request; the browser keeps them under a separate localStorage key. The last command
   sent is remembered so nothing is sent twice and a restart knows what the phone is doing. */
(function () {
  var SF = (window.SF = window.SF || {});
  var D = window.skyfocusDesktop && window.skyfocusDesktop.ypt ? window.skyfocusDesktop.ypt : null;
  var KEY = "skyfocus.ypt";
  var link = { startUrl: "", stopUrl: "", last: "stop" };

  function readLocal() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function writeLocal() { try { localStorage.setItem(KEY, JSON.stringify(link)); } catch (e) { /* storage off */ } }
  var ready = (D ? D.get() : Promise.resolve(readLocal()))
    .then(function (v) { if (v) Object.assign(link, v); })
    .catch(function () { /* keep the empty link */ });

  function cfg() { return SF.store.state.settings.ypt || {}; }
  function configured() { return /^https:\/\//i.test(link.startUrl) && /^https:\/\//i.test(link.stopUrl); }
  function on() { return !!cfg().enabled && configured(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // One request. Desktop: the main process answers with the HTTP status. Browser: a no-cors request
  // gives no answer, so "sent" is as far as it can tell.
  function request(kind) {
    if (D) {
      return D.send(kind).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || "No answer");
        return "reached";
      });
    }
    var url = kind === "start" ? link.startUrl : link.stopUrl;
    if (!/^https:\/\//i.test(url)) return Promise.reject(new Error("Not an https link"));
    return fetch(url, { mode: "no-cors", cache: "no-store", keepalive: true }).then(function () { return "sent"; });
  }
  function attempt(kind, retries) {
    return request(kind).catch(function (e) {
      if (retries > 0) return wait(3000).then(function () { return attempt(kind, retries - 1); });
      throw e;
    });
  }
  function mark(kind) {
    link.last = kind;
    if (!D) writeLocal();   // the main process records it on the desktop
  }

  // Sends run one after another, so a quick start then stop reaches the phone in that order.
  var queue = Promise.resolve();
  function send(kind, force) {
    var run = function () {
      if (!force && (!on() || link.last === kind)) return link.last === kind ? "already" : null;
      return attempt(kind, 1).then(function (how) { mark(kind); return how; }, function (e) {
        SF.ui.toast("YPT link did not reach your phone. " + (kind === "start" ? "Start" : "Stop") + " YPT by hand.", "alert", 6000);
        throw e;
      });
    };
    var p = queue.then(function () { return ready; }).then(run);
    queue = p.catch(function () { /* the next send still runs */ });
    return p;
  }

  // What the phone should be doing right now, or null when the gate decides.
  function desired() {
    var S = SF.store.state, af = S.activeFlight, j = SF.journey && SF.journey.active();
    if (af && af.started) {
      if (SF.flight.status(af, Date.now()).done) return null;   // landing sends the stop
      return af.pauseStart && cfg().holds ? "stop" : "start";
    }
    if (af) return null;
    if (S.layover && cfg().layovers && j && S.layover.journeyId === j.id) return "start";
    return "stop";
  }

  function start() {
    SF.engine.on("hold", function (h) {
      if (cfg().holds) send(h.holding ? "stop" : "start").catch(function () { /* toast shown */ });
    });
    SF.engine.on("landed", function (rec) {
      var j = SF.journey.active();
      if (cfg().layovers && j && rec.journeyId === j.id) return;   // the journey goes on: keep YPT running
      send("stop").catch(function () { /* toast shown */ });
    });
    SF.engine.on("diverted", function () { send("stop").catch(function () { /* toast shown */ }); });
    var end = SF.journey.end;
    SF.journey.end = function () {
      end.apply(this, arguments);
      if (!SF.store.state.activeFlight) send("stop").catch(function () { /* toast shown */ });
    };
    // after a restart: bring the phone in line with the app
    ready.then(function () {
      setTimeout(function () {
        var want = desired();
        if (want && on() && link.last !== want) send(want).catch(function () { /* toast shown */ });
      }, 1500);
    });
  }

  SF.ypt = {
    ready: ready,
    on: on,
    configured: configured,
    last: function () { return link.last; },
    send: function (kind) { return send(kind, false); },
    test: function (kind) { return send(kind, true); },
    getUrls: function () { return ready.then(function () { return { startUrl: link.startUrl, stopUrl: link.stopUrl }; }); },
    setUrls: function (u) {
      var clean = function (s) { s = String(s || "").trim(); return /^https:\/\/\S+$/i.test(s) ? s : ""; };
      link.startUrl = clean(u.startUrl);
      link.stopUrl = clean(u.stopUrl);
      if (D) return D.set({ startUrl: link.startUrl, stopUrl: link.stopUrl }).then(function () { return link; });
      writeLocal();
      return Promise.resolve(link);
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

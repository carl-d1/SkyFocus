/* localStorage wrapper. Every access is guarded: private windows and blocked storage must not break the app. */
(function () {
  var SF = (window.SF = window.SF || {});
  var KEY = "skyfocus.v1";
  var memoryFallback = {};
  var available = (function () {
    try {
      var k = "__sf_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function read(key) {
    try { return available ? window.localStorage.getItem(key) : (memoryFallback[key] || null); }
    catch (e) { return memoryFallback[key] || null; }
  }
  function write(key, value) {
    try {
      if (available) window.localStorage.setItem(key, value);
      else memoryFallback[key] = value;
      return true;
    } catch (e) {
      memoryFallback[key] = value;
      return false;
    }
  }
  function remove(key) {
    try { if (available) window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    delete memoryFallback[key];
  }

  // The desktop app keeps its data in a file written straight to disk by the main process, so a
  // crash or a forced close never loses a flight (localStorage reaches the disk only lazily).
  var file = window.skyfocusDesktop && window.skyfocusDesktop.storage, pendingCopy = null;

  SF.storage = {
    KEY: KEY,
    available: available || !!file,
    // Desktop: the file and the localStorage copy are both read and the one saved most recently wins
    // (the file on a tie), so a session that could not reach the file never loses to an older file.
    load: function () {
      var data = null;
      function parse(t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } }
      if (file) {
        var fromFile = null;
        try { fromFile = parse(file.load()); } catch (e) { fromFile = null; }
        var fromLocal = parse(read(KEY));
        data = fromFile;
        if (fromLocal && (!fromFile || (fromLocal.savedAt || 0) > (fromFile.savedAt || 0))) {
          data = fromLocal;
          if (file.note) try { file.note(fromFile ? "localStorage copy is newer than the file, using it" : "no data file, using the localStorage copy"); } catch (e) { /* no log */ }
        }
      } else data = parse(read(KEY));
      if (data) delete data.savedAt;
      return data;
    },
    save: function (obj) {
      try {
        var text = JSON.stringify(file ? Object.assign({}, obj, { savedAt: Date.now() }) : obj);
        if (!file) return write(KEY, text);
        file.save(text);
        // the backup copy in localStorage waits for an idle moment; the newest text wins
        var first = pendingCopy === null;
        pendingCopy = text;
        if (first) {
          var flush = function () { var t = pendingCopy; pendingCopy = null; if (t !== null) write(KEY, t); };
          if (window.requestIdleCallback) requestIdleCallback(flush, { timeout: 2000 }); else setTimeout(flush, 200);
        }
        return true;
      } catch (e) { return false; }
    },
    clear: function () { remove(KEY); if (file) file.save(""); },
    readRaw: read,
    writeRaw: write
  };
})();

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

  SF.storage = {
    KEY: KEY,
    available: available,
    load: function () {
      var raw = read(KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    save: function (obj) {
      try { return write(KEY, JSON.stringify(obj)); } catch (e) { return false; }
    },
    clear: function () { remove(KEY); },
    readRaw: read,
    writeRaw: write
  };
})();

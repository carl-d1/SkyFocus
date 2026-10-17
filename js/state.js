/* App state: defaults, migrations, a tiny pub/sub store, and shared helpers. */
(function () {
  var SF = (window.SF = window.SF || {});
  var SCHEMA = 1;

  var params = new URLSearchParams(window.location.search);
  SF.dev = params.get("dev") === "1";
  SF.forceOffline = params.get("offline") === "1";
  SF.isFile = window.location.protocol === "file:";

  // Seat-map class names are SkyFocus originals.
  var DEFAULT_TAGS = [
    { id: "study", name: "Study", icon: "book", color: "#5aa9ff", cls: "Scholar Class", builtin: true },
    { id: "work", name: "Work", icon: "briefcase", color: "#f2a541", cls: "Boardroom Class", builtin: true },
    { id: "reading", name: "Reading", icon: "glasses", color: "#9b8cff", cls: "Library Class", builtin: true },
    { id: "writing", name: "Writing", icon: "pen", color: "#4fd1a5", cls: "Manuscript Class", builtin: true },
    { id: "coding", name: "Coding", icon: "code", color: "#ff7a8a", cls: "Compiler Class", builtin: true }
  ];

  function defaults() {
    return {
      version: SCHEMA,
      profile: { name: "", home: "MEL", memberSince: null, memberNo: null, onboarded: false },
      currentAirport: "MEL",
      settings: {
        defaultDuration: 25,
        breaks: [5, 10, 15],
        units: "km",
        clock24: true,
        theme: "dark",
        reducedMotion: false,
        sounds: true,
        strictness: "warn",
        strictMinutes: 3,
        dndChecklist: true,
        dailyGoalMin: 120,
        reminderEnabled: false,
        reminderTime: "09:00",
        landingNotify: true,
        mapMode: "classic",
        camera: "follow"
      },
      tags: DEFAULT_TAGS.map(function (t) { return Object.assign({}, t); }),
      flights: [],
      favourites: [],
      activeFlight: null,
      stamps: [],
      achievements: {},
      audioMix: null,
      ui: { fileBannerDismissed: false }
    };
  }

  function migrate(data) {
    var base = defaults();
    if (!data || typeof data !== "object") return base;
    // Shallow-merge each section so new settings get their defaults.
    var out = Object.assign(base, data);
    out.profile = Object.assign(defaults().profile, data.profile || {});
    out.settings = Object.assign(defaults().settings, data.settings || {});
    out.ui = Object.assign(defaults().ui, data.ui || {});
    if (!Array.isArray(out.tags) || !out.tags.length) out.tags = defaults().tags;
    if (!Array.isArray(out.flights)) out.flights = [];
    if (!Array.isArray(out.favourites)) out.favourites = [];
    if (!Array.isArray(out.stamps)) out.stamps = [];
    if (!out.achievements || typeof out.achievements !== "object") out.achievements = {};
    out.version = SCHEMA;
    return out;
  }

  var listeners = [];
  var saveTimer = null;

  var store = {
    state: migrate(SF.storage.load()),
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    },
    // Mutate via a function, then notify and persist.
    update: function (fn, immediate) {
      fn(store.state);
      listeners.forEach(function (l) { try { l(store.state); } catch (e) { console.error(e); } });
      if (immediate) store.saveNow(); else store.save();
    },
    save: function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(store.saveNow, 250);
    },
    saveNow: function () {
      clearTimeout(saveTimer);
      SF.storage.save(store.state);
    },
    replace: function (data) {
      store.state = migrate(data);
      store.saveNow();
      listeners.forEach(function (l) { try { l(store.state); } catch (e) { console.error(e); } });
    },
    reset: function () {
      SF.storage.clear();
      store.state = defaults();
    },
    exportJSON: function () {
      return JSON.stringify({ app: "SkyFocus", exportedAt: new Date().toISOString(), data: store.state }, null, 2);
    },
    // Returns an error message, or null on success.
    importJSON: function (text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return "That file is not valid JSON."; }
      var data = parsed && parsed.app === "SkyFocus" ? parsed.data : parsed;
      if (!data || typeof data !== "object" || !data.profile || !Array.isArray(data.flights)) {
        return "That file does not look like a SkyFocus export.";
      }
      store.replace(data);
      return null;
    }
  };

  SF.store = store;
  SF.defaults = defaults;

  /* ---------- shared helpers ---------- */
  SF.airport = function (code) { return window.AIRPORT_BY_CODE[code] || null; };
  SF.tag = function (id) {
    var tags = store.state.tags;
    for (var i = 0; i < tags.length; i++) if (tags[i].id === id) return tags[i];
    return tags[0];
  };
  SF.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  SF.hash = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  // Deterministic PRNG for decorative things (barcodes, stamps).
  SF.rng = function (seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  };
  SF.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- formatting ---------- */
  SF.fmt = {
    dist: function (km, withUnit) {
      var mi = store.state.settings.units === "mi";
      var v = Math.round(mi ? km * SF.geo.KM_TO_MI : km);
      return v.toLocaleString() + (withUnit === false ? "" : mi ? " mi" : " km");
    },
    distUnit: function () { return store.state.settings.units === "mi" ? "mi" : "km"; },
    // Focus miles are always statute miles of route flown.
    miles: function (km) { return Math.round(km * SF.geo.KM_TO_MI); },
    clock: function (ms) {
      ms = Math.max(0, ms);
      var total = Math.ceil(ms / 1000);
      var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
      var mm = (h ? String(m).padStart(2, "0") : String(m)), ss = String(s).padStart(2, "0");
      return h ? h + ":" + mm + ":" + ss : mm.padStart(2, "0") + ":" + ss;
    },
    dur: function (min) {
      min = Math.round(min);
      var h = Math.floor(min / 60), m = min % 60;
      return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m";
    },
    time: function (date) {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: !store.state.settings.clock24 }).format(date);
    },
    date: function (date) {
      return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(date);
    },
    shortDate: function (date) {
      return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(date).toUpperCase();
    },
    localTime: function (tz, date) { return SF.geo.localTime(tz, date, !store.state.settings.clock24); }
  };
})();

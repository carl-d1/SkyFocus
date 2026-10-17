/* Map manager: one interface over every map provider, with automatic fallback to the built-in SVG atlas. */
(function () {
  var SF = (window.SF = window.SF || {});

  // Provider factories register themselves here (classic, satellite, globe arrive in Milestone 2).
  var providers = { atlas: function (el, opts) { return SF.FallbackMap(el, opts); } };
  var MODES = [
    { id: "classic", label: "Classic", icon: "map" },
    { id: "satellite", label: "Satellite", icon: "frame" },
    { id: "globe", label: "3D Globe", icon: "globe" }
  ];

  function available(mode) {
    if (SF.forceOffline) return false;
    return !!providers[mode];
  }

  SF.maps = {
    MODES: MODES,
    register: function (id, factory) { providers[id] = factory; },
    available: available,
    // Create a map in el. Returns { api, mode } where mode is what actually rendered.
    create: function (el, mode, opts) {
      var use = available(mode) ? mode : "atlas";
      var api = null;
      try { api = providers[use](el, opts || {}); }
      catch (e) {
        console.warn("Map provider failed, using built-in atlas:", e);
        el.innerHTML = "";
        use = "atlas";
        api = providers.atlas(el, opts || {});
      }
      return { api: api, mode: use };
    }
  };
})();

/* Satellite map mode: the Leaflet provider with Esri World Imagery and place labels. */
(function () {
  var SF = window.SF;
  SF.maps.register("satellite", "leaflet", function (el, opts) { return SF.leafletProvider(el, opts, "satellite"); });
})();

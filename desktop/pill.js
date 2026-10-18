/* Desktop pill window: draws snapshots from the main process and sends back commands, hover and drags. */
(function () {
  var P = window.skyfocusPill;
  var view = window.SkyPill.create(document.body, {
    chime: true,
    command: function (c) { P.command(c); },
    hover: function (on) { P.hover(on); },
    drag: function (type, d) { P.drag(type, d); }
  });
  P.onState(view.update);
  P.onEvent(view.event);
  P.onPrefs(view.setPrefs);
  P.onSide(function (side) { document.body.classList.toggle("grow-left", side === "left"); });
  P.ready();
})();

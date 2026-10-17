/* Home screen: book a flight by duration or by destination, set task, tag and seat. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;
  var DURATIONS = [15, 25, 45, 60, 90, 120];
  var ROWS = 30, COLS = ["A", "B", "C", "D", "E", "F"];
  var SWATCHES = ["#5aa9ff", "#f2a541", "#9b8cff", "#4fd1a5", "#ff7a8a", "#ffd166", "#6ee7ff", "#c084fc", "#94e36b", "#ff9f6b"];

  /* ---------- seat bands: one band of rows per tag ---------- */
  SF.seatBands = function () {
    var tags = SF.store.state.tags;
    var builtin = tags.filter(function (t) { return t.builtin; });
    var bands = builtin.map(function (t) { return { tagIds: [t.id], name: t.cls, color: t.color }; });
    var custom = tags.filter(function (t) { return !t.builtin; });
    if (custom.length) bands.push({ tagIds: custom.map(function (t) { return t.id; }), name: "Open Cabin", color: "#a8b3c7" });
    var per = Math.floor(ROWS / bands.length), row = 1;
    bands.forEach(function (b, i) {
      b.start = row;
      b.end = i === bands.length - 1 ? ROWS : row + per - 1;
      row = b.end + 1;
    });
    return bands;
  };
  SF.bandForTag = function (tagId) {
    var bands = SF.seatBands();
    for (var i = 0; i < bands.length; i++) if (bands[i].tagIds.indexOf(tagId) >= 0) return bands[i];
    return bands[bands.length - 1];
  };
  // Decorative "taken" seats, stable for a day and route.
  function takenSeats(seed) {
    var r = SF.rng(SF.hash(seed)), taken = {};
    for (var row = 1; row <= ROWS; row++) COLS.forEach(function (c) { if (r() < 0.38) taken[row + c] = true; });
    return taken;
  }

  SF.views.book = {
    mount: function (root) {
      var S = SF.store.state;
      var sel = {
        from: S.currentAirport || S.profile.home,
        to: null,
        minutes: S.settings.defaultDuration,
        chosenDuration: S.settings.defaultDuration,
        mode: "duration",
        scaleMode: "real",
        tagId: S.lastTagId || S.tags[0].id,
        seat: null,
        task: ""
      };
      if (SF.bookPreset && SF.airport(SF.bookPreset.to) && SF.bookPreset.to !== sel.from) sel.to = SF.bookPreset.to;
      SF.bookPreset = null;
      var mapObj = null, unsub = [];

      var hour = new Date().getHours();
      var greet = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

      root.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">' + greet + ", " + SF.esc(S.profile.name || "passenger") + '</p><h1>Where are we flying today?</h1></div>' +
        '<div class="head-goal" id="homeGoal"></div></header>' +
        '<div id="pendingPass"></div>' +
        '<div class="book-grid">' +
        '<section class="panel book-left" aria-label="Choose your route">' +
        '<div class="depart-row"><span class="eyebrow">Departing</span><div class="depart-pick"><input id="fromInput" aria-label="Departure airport"></div></div>' +
        '<div class="tabs" role="tablist"><button role="tab" class="tab" data-mode="duration">' + SF.icon("clock") + '<span>By duration</span></button><button role="tab" class="tab" data-mode="destination">' + SF.icon("compass") + "<span>By destination</span></button></div>" +
        '<div id="modePanel"></div>' +
        '<div id="routeList" class="dest-list" role="listbox" aria-label="Destinations"></div>' +
        '<div id="quickRoutes"></div>' +
        "</section>" +
        '<section class="book-right">' +
        '<div class="panel route-card"><div class="route-map" id="routeMap"></div><div class="route-sum" id="routeSum"></div></div>' +
        '<div class="panel session-card">' +
        '<label class="field"><span>What are you working on?</span><input id="taskInput" maxlength="80" placeholder="e.g. Finish chapter 3 notes"></label>' +
        '<div class="field"><span>Tag</span><div class="chips tags" id="tagChips"></div></div>' +
        '<div class="field"><span class="seat-head">Seat <small id="seatLabel" class="muted"></small></span><div class="seatmap" id="seatMap"></div></div>' +
        '<div class="book-cta"><button class="btn btn-primary btn-lg" id="printPass" disabled>' + SF.icon("tag") + "<span>Print boarding pass</span></button></div>" +
        "</div></section></div>";

      var fromInput = root.querySelector("#fromInput");
      function setFromLabel() { var a = SF.airport(sel.from); fromInput.value = a.city + " (" + a.iata + ")"; }
      setFromLabel();
      ui.airportPicker(fromInput, function (a) {
        sel.from = a.iata;
        if (sel.to === a.iata) sel.to = null;
        renderAll();
      }, { exclude: function () { return null; } });

      /* ---------- pending (booked, not departed) ---------- */
      function renderPending() {
        var af = SF.store.state.activeFlight, box = root.querySelector("#pendingPass");
        if (!af || af.started) { box.innerHTML = ""; return; }
        box.innerHTML = '<div class="notice panel">' + SF.icon("tag") + "<span>You have a boarding pass for <b>" + af.from + " → " + af.to + "</b> (" + SF.fmt.dur(af.plannedMin) + ").</span>" +
          '<button class="btn btn-primary small" id="toGate">Go to gate</button><button class="btn btn-ghost small" id="cancelPass">Cancel it</button></div>';
        box.querySelector("#toGate").onclick = function () { ui.go("board"); };
        box.querySelector("#cancelPass").onclick = function () { SF.engine.cancel(); renderPending(); };
      }

      /* ---------- mode panel ---------- */
      function renderMode() {
        ui.$$(".tab", root).forEach(function (t) {
          var on = t.getAttribute("data-mode") === sel.mode;
          t.classList.toggle("on", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        var p = root.querySelector("#modePanel");
        if (sel.mode === "duration") {
          var custom = DURATIONS.indexOf(sel.chosenDuration) < 0;
          p.innerHTML = '<div class="chips dur-chips" role="group" aria-label="Focus length">' + DURATIONS.map(function (m) {
            return '<button class="chip' + (m === sel.chosenDuration ? " on" : "") + '" data-m="' + m + '">' + (m < 60 ? m + " min" : m / 60 + (m === 60 ? " hr" : " hrs")) + "</button>";
          }).join("") + '<label class="chip chip-input' + (custom ? " on" : "") + '"><span>Custom</span><input type="number" id="customMin" min="5" max="600" step="5" value="' + (custom ? sel.chosenDuration : "") + '" placeholder="min" aria-label="Custom minutes"></label></div>';
          p.querySelector(".dur-chips").addEventListener("click", function (e) {
            var b = e.target.closest("[data-m]");
            if (!b) return;
            sel.chosenDuration = +b.getAttribute("data-m");
            sel.minutes = sel.chosenDuration;
            renderMode(); renderList(); renderSummary();
          });
          var ci = p.querySelector("#customMin");
          ci.addEventListener("change", function () {
            var v = Math.round(+ci.value);
            if (!v || v < 5) return;
            sel.chosenDuration = Math.min(600, v);
            sel.minutes = sel.chosenDuration;
            renderMode(); renderList(); renderSummary();
          });
        } else {
          p.innerHTML = '<div class="search-row">' + SF.icon("search") + '<input id="destSearch" placeholder="Search city, country or code" aria-label="Search destinations"></div>';
          var ds = p.querySelector("#destSearch");
          ds.addEventListener("input", renderList);
          ds.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { var first = root.querySelector("#routeList [data-code]"); if (first) first.click(); }
          });
        }
      }

      /* ---------- destination list ---------- */
      function renderList() {
        var A = SF.airport(sel.from), box = root.querySelector("#routeList"), rows;
        var all = window.AIRPORTS.filter(function (a) { return a.iata !== sel.from; }).map(function (a) {
          var km = SF.geo.distanceKm(A, a);
          return { a: a, km: km, real: SF.geo.realisticMinutes(km) };
        });
        if (sel.mode === "duration") {
          rows = all.sort(function (x, y) { return Math.abs(x.real - sel.chosenDuration) - Math.abs(y.real - sel.chosenDuration); }).slice(0, 14);
        } else {
          var q = (root.querySelector("#destSearch") || {}).value || "";
          var matches = q ? ui.searchAirports(q, sel.from).map(function (a) { return a.iata; }) : null;
          rows = matches ? matches.map(function (c) { return all.filter(function (r) { return r.a.iata === c; })[0]; }).filter(Boolean)
            : all.sort(function (x, y) { return x.km - y.km; });
          rows = rows.slice(0, 40);
        }
        box.innerHTML = rows.map(function (r) {
          var delta = Math.round(r.real - sel.chosenDuration);
          var badge = "";
          if (sel.mode === "duration") {
            var scaled = Math.abs(delta) > Math.max(10, sel.chosenDuration * 0.25);
            badge = '<span class="badge ' + (scaled ? "warn" : "ok") + '" title="Realistic flight time ' + SF.fmt.dur(r.real) + '">' + (scaled ? "scaled · " : "") + (delta >= 0 ? "+" : "−") + SF.fmt.dur(Math.abs(delta)) + "</span>";
          }
          return '<button class="dest' + (sel.to === r.a.iata ? " on" : "") + '" role="option" aria-selected="' + (sel.to === r.a.iata) + '" data-code="' + r.a.iata + '">' +
            '<b class="mono code">' + r.a.iata + '</b><span class="dest-name">' + SF.esc(r.a.city) + "<small>" + SF.esc(r.a.country) + "</small></span>" +
            '<span class="dest-meta mono">' + SF.fmt.dist(r.km) + "<small>" + SF.fmt.dur(r.real) + "</small></span>" + badge + "</button>";
        }).join("") || '<p class="muted pad">No destinations match.</p>';
      }
      root.querySelector("#routeList").addEventListener("click", function (e) {
        var b = e.target.closest("[data-code]");
        if (!b) return;
        sel.to = b.getAttribute("data-code");
        if (sel.mode === "destination") {
          sel.scaleMode = "real";
          sel.minutes = Math.round(SF.geo.realisticMinutes(SF.geo.distanceKm(SF.airport(sel.from), SF.airport(sel.to))));
        } else sel.minutes = sel.chosenDuration;
        ui.$$("#routeList .dest", root).forEach(function (d) { var on = d === b; d.classList.toggle("on", on); d.setAttribute("aria-selected", on); });
        renderSummary();
        renderSeats();
      });

      /* ---------- recent & favourite routes ---------- */
      function renderQuick() {
        var s = SF.store.state, box = root.querySelector("#quickRoutes");
        var fav = s.favourites || [], recent = (s.recentRoutes || []).filter(function (r) { return fav.indexOf(r) < 0; });
        if (!fav.length && !recent.length) { box.innerHTML = ""; return; }
        function chip(r, star) {
          var p = r.split("-");
          return '<button class="route-chip" data-route="' + r + '">' + (star ? SF.icon("star", "fill") : SF.icon("route")) + '<span class="mono">' + p[0] + " → " + p[1] + "</span></button>";
        }
        box.innerHTML = '<div class="quick"><span class="eyebrow">Rebook</span><div class="quick-list">' +
          fav.map(function (r) { return chip(r, true); }).join("") + recent.map(function (r) { return chip(r, false); }).join("") + "</div></div>";
      }
      root.querySelector("#quickRoutes").addEventListener("click", function (e) {
        var b = e.target.closest("[data-route]");
        if (!b) return;
        var p = b.getAttribute("data-route").split("-");
        if (!SF.airport(p[0]) || !SF.airport(p[1])) return;
        sel.from = p[0]; sel.to = p[1];
        setFromLabel();
        if (sel.mode === "destination") {
          sel.scaleMode = "real";
          sel.minutes = Math.round(SF.geo.realisticMinutes(SF.geo.distanceKm(SF.airport(p[0]), SF.airport(p[1]))));
        }
        renderAll();
      });

      /* ---------- route summary + scale ---------- */
      function renderSummary() {
        var box = root.querySelector("#routeSum");
        var A = SF.airport(sel.from);
        if (!sel.to) {
          box.innerHTML = '<div class="route-empty"><b class="mono">' + A.iata + '</b><span class="muted">Pick a destination to see your route.</span></div>';
          if (mapObj) { mapObj.api.clearRoute(); mapObj.api.setMarkers([{ lat: A.lat, lon: A.lon, label: A.iata, cls: "m-from", px: 5 }]); }
          root.querySelector("#printPass").disabled = true;
          return;
        }
        var B = SF.airport(sel.to);
        var km = SF.geo.distanceKm(A, B), real = Math.round(SF.geo.realisticMinutes(km));
        var key = sel.from + "-" + sel.to, fav = (SF.store.state.favourites || []).indexOf(key) >= 0;
        var scaleHtml = "";
        if (sel.mode === "destination") {
          var max = Math.max(240, Math.min(600, Math.ceil(real / 5) * 5));
          var val = sel.scaleMode === "real" ? Math.min(600, real) : sel.minutes;
          scaleHtml = '<div class="scale">' +
            '<label class="radio"><input type="radio" name="scale" value="real"' + (sel.scaleMode === "real" ? " checked" : "") + '><span>Fly it as-is · <b class="mono">' + SF.fmt.dur(real) + "</b></span></label>" +
            '<label class="radio"><input type="radio" name="scale" value="custom"' + (sel.scaleMode === "custom" ? " checked" : "") + '><span>Scale to fit · <b class="mono" id="scaleVal">' + SF.fmt.dur(val) + "</b></span></label>" +
            '<input type="range" id="scaleRange" min="10" max="' + max + '" step="5" value="' + val + '" aria-label="Scaled focus length"' + (sel.scaleMode === "custom" ? "" : " disabled") + "></div>";
        }
        box.innerHTML =
          '<div class="route-head"><div class="rh-end"><b class="mono">' + A.iata + "</b><small>" + SF.esc(A.city) + '</small></div>' +
          '<div class="rh-mid">' + SF.icon("plane", "rot90") + '<small class="mono">' + SF.fmt.dist(km) + "</small></div>" +
          '<div class="rh-end right"><b class="mono">' + B.iata + "</b><small>" + SF.esc(B.city) + "</small></div>" +
          '<button class="icon-btn fav' + (fav ? " on" : "") + '" id="favBtn" aria-pressed="' + fav + '" aria-label="' + (fav ? "Remove from" : "Add to") + ' favourite routes">' + SF.icon("star", fav ? "fill" : "") + "</button></div>" +
          '<div class="route-facts"><span><small>Realistic</small><b class="mono">' + SF.fmt.dur(real) + '</b></span><span><small>Your focus</small><b class="mono accent" id="sumFocus"></b></span><span><small>Arrive</small><b class="mono"><span id="sumArrive"></span> <small>local</small></b></span></div>' +
          scaleHtml;
        box.querySelector("#favBtn").onclick = function () {
          SF.store.update(function (s) {
            var i = s.favourites.indexOf(key);
            if (i >= 0) s.favourites.splice(i, 1); else s.favourites.unshift(key);
          });
          renderSummary(); renderQuick();
        };
        function facts() {
          box.querySelector("#sumFocus").textContent = SF.fmt.dur(sel.minutes);
          box.querySelector("#sumArrive").textContent = SF.fmt.localTime(B.tz, new Date(Date.now() + sel.minutes * 60000));
        }
        facts();
        if (sel.mode === "destination") {
          var rg = box.querySelector("#scaleRange");
          ui.$$('input[name="scale"]', box).forEach(function (r) {
            r.onchange = function () {
              sel.scaleMode = r.value;
              rg.disabled = r.value === "real";
              sel.minutes = r.value === "real" ? Math.min(600, real) : +rg.value;
              facts();
            };
          });
          rg.oninput = function () {
            sel.minutes = +rg.value;
            box.querySelector("#scaleVal").textContent = SF.fmt.dur(sel.minutes);
            facts();
          };
        }
        if (mapObj) mapObj.api.setRoute(A, B);
        root.querySelector("#printPass").disabled = !sel.seat;
      }

      /* ---------- tags ---------- */
      function renderTags() {
        var box = root.querySelector("#tagChips");
        box.innerHTML = SF.store.state.tags.map(function (t) {
          return '<button class="chip tag-chip' + (t.id === sel.tagId ? " on" : "") + '" data-tag="' + t.id + '" style="--tag:' + t.color + '" aria-pressed="' + (t.id === sel.tagId) + '">' + SF.icon(t.icon) + "<span>" + SF.esc(t.name) + "</span></button>";
        }).join("") + '<button class="chip chip-add" id="addTag" aria-label="Create a tag">' + SF.icon("plus") + "<span>New tag</span></button>";
      }
      root.querySelector("#tagChips").addEventListener("click", function (e) {
        if (e.target.closest("#addTag")) { SF.tagEditor(null, function (t) { sel.tagId = t.id; sel.seat = null; renderTags(); renderSeats(); }); return; }
        var b = e.target.closest("[data-tag]");
        if (!b) return;
        sel.tagId = b.getAttribute("data-tag");
        sel.seat = null;
        renderTags(); renderSeats();
      });

      /* ---------- seat map ---------- */
      function renderSeats() {
        var box = root.querySelector("#seatMap");
        var bands = SF.seatBands(), mine = SF.bandForTag(sel.tagId);
        var taken = takenSeats(SF.stats.dayKey(Date.now()) + sel.from + (sel.to || ""));
        if (!sel.seat || taken[sel.seat]) {
          // Auto-pick a free window seat in this band.
          sel.seat = null;
          for (var r = mine.start; r <= mine.end && !sel.seat; r++) {
            ["A", "F", "C", "D", "B", "E"].some(function (c) { if (!taken[r + c]) { sel.seat = r + c; return true; } return false; });
          }
        }
        var html = '<div class="cabin" role="grid" aria-label="Cabin seat map">';
        html += '<div class="cabin-nose" aria-hidden="true"></div><div class="cabin-body">';
        html += '<div class="band-row" aria-hidden="true">' + bands.map(function (b) {
          return '<span class="band-label' + (b === mine ? " on" : "") + '" style="--tag:' + b.color + ";grid-column:" + (b.start + 1) + " / " + (b.end + 2) + '">' + SF.esc(b.name) + "</span>";
        }).join("") + "</div>";
        COLS.forEach(function (c, ci) {
          if (ci === 3) html += '<div class="aisle" aria-hidden="true"></div>';
          html += '<div class="seat-row" role="row"><span class="col-label" aria-hidden="true">' + c + "</span>";
          for (var r = 1; r <= ROWS; r++) {
            var id = r + c, inBand = r >= mine.start && r <= mine.end, band = bands.filter(function (b) { return r >= b.start && r <= b.end; })[0];
            var state = taken[id] ? "taken" : !inBand ? "other" : id === sel.seat ? "sel" : "free";
            html += '<button role="gridcell" class="seat ' + state + '" data-seat="' + id + '" style="--tag:' + band.color + '"' +
              (state === "taken" || state === "other" ? " disabled" : "") +
              ' aria-label="Seat ' + id + (state === "taken" ? ", taken" : state === "other" ? ", " + band.name : state === "sel" ? ", selected" : ", available") + '"' +
              (state === "sel" ? ' aria-pressed="true"' : "") + "></button>";
          }
          html += "</div>";
        });
        html += '<div class="row-nums" aria-hidden="true"><span></span>' + Array.from({ length: ROWS }, function (_, i) { return "<span>" + ((i + 1) % 5 === 0 || i === 0 ? i + 1 : "") + "</span>"; }).join("") + "</div>";
        html += "</div></div>";
        box.innerHTML = html;
        root.querySelector("#seatLabel").innerHTML = sel.seat ? "<b class='mono'>" + sel.seat + "</b> · " + SF.esc(mine.name) : "No seats left in this cabin";
        root.querySelector("#printPass").disabled = !(sel.seat && sel.to);
      }
      root.querySelector("#seatMap").addEventListener("click", function (e) {
        var b = e.target.closest("[data-seat]");
        if (!b || b.disabled) return;
        sel.seat = b.getAttribute("data-seat");
        renderSeats();
      });

      /* ---------- print pass ---------- */
      root.querySelector("#printPass").addEventListener("click", function () {
        if (!sel.to || !sel.seat) return;
        var tag = SF.tag(sel.tagId), band = SF.bandForTag(sel.tagId);
        var af = SF.flight.create({
          from: sel.from, to: sel.to, minutes: Math.max(1, Math.round(sel.minutes)), tagId: tag.id,
          seat: sel.seat, cls: tag.builtin ? tag.cls : band.name,
          task: root.querySelector("#taskInput").value.trim()
        });
        SF.store.update(function (s) { s.activeFlight = af; s.lastTagId = tag.id; }, true);
        ui.go("board");
      });

      root.querySelector(".tabs").addEventListener("click", function (e) {
        var t = e.target.closest("[data-mode]");
        if (!t) return;
        sel.mode = t.getAttribute("data-mode");
        if (sel.mode === "duration") sel.minutes = sel.chosenDuration;
        else if (sel.to) { sel.scaleMode = "real"; sel.minutes = Math.round(SF.geo.realisticMinutes(SF.geo.distanceKm(SF.airport(sel.from), SF.airport(sel.to)))); }
        renderMode(); renderList(); renderSummary();
        if (sel.mode === "destination") root.querySelector("#destSearch").focus();
      });

      function renderGoal() {
        var g = root.querySelector("#homeGoal");
        var today = SF.stats.todayMinutes(), goal = SF.store.state.settings.dailyGoalMin;
        g.innerHTML = ui.ring(today / goal, 64, 7, "Daily goal " + Math.round(today / goal * 100) + "%") +
          '<div><small class="eyebrow">Daily goal</small><b class="mono">' + SF.fmt.dur(today) + " / " + SF.fmt.dur(goal) + "</b><small class='muted'>" + (today >= goal ? "Goal reached. Nice work." : SF.fmt.dur(goal - today) + " to go") + "</small></div>";
      }

      function renderAll() {
        setFromLabel(); renderMode(); renderList(); renderSummary(); renderSeats(); renderQuick();
      }

      mapObj = SF.maps.create(root.querySelector("#routeMap"), "atlas", { camera: "route", pad: 0.5, planeSize: 22, showPlane: false, label: "Route preview" });
      renderPending(); renderGoal(); renderTags(); renderAll();
      this._cleanup = function () { if (mapObj) mapObj.api.destroy(); unsub.forEach(function (u) { u(); }); };
    },
    unmount: function () { if (this._cleanup) this._cleanup(); }
  };

  /* ---------- tag editor (shared with settings) ---------- */
  SF.tagEditor = function (tag, onSave) {
    var t = tag ? Object.assign({}, tag) : { id: "t" + SF.uid(), name: "", icon: "star", color: SWATCHES[5], builtin: false, cls: "Open Cabin" };
    var body = ui.h('<form class="tag-form" novalidate>' +
      '<label class="field"><span>Name</span><input id="tgName" maxlength="20" value="' + SF.esc(t.name) + '" autofocus></label>' +
      '<div class="field"><span>Icon</span><div class="icon-grid" id="tgIcons">' + SF.TAG_ICONS.map(function (i) {
        return '<button type="button" class="icon-btn' + (i === t.icon ? " on" : "") + '" data-i="' + i + '" aria-label="' + i + '">' + SF.icon(i) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="field"><span>Colour</span><div class="swatches" id="tgCols">' + SWATCHES.map(function (c) {
        return '<button type="button" class="swatch' + (c === t.color ? " on" : "") + '" data-c="' + c + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>';
      }).join("") + "</div></div>" +
      '<p class="form-error" id="tgErr" role="alert"></p></form>');
    body.querySelector("#tgIcons").onclick = function (e) {
      var b = e.target.closest("[data-i]"); if (!b) return;
      t.icon = b.getAttribute("data-i");
      ui.$$("#tgIcons .icon-btn", body).forEach(function (x) { x.classList.toggle("on", x === b); });
    };
    body.querySelector("#tgCols").onclick = function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      t.color = b.getAttribute("data-c");
      ui.$$("#tgCols .swatch", body).forEach(function (x) { x.classList.toggle("on", x === b); });
    };
    function save() {
      t.name = body.querySelector("#tgName").value.trim();
      if (!t.name) { body.querySelector("#tgErr").textContent = "Give the tag a name."; return false; }
      SF.store.update(function (s) {
        var i = s.tags.map(function (x) { return x.id; }).indexOf(t.id);
        if (i >= 0) s.tags[i] = t; else s.tags.push(t);
      });
      if (onSave) onSave(t);
    }
    body.addEventListener("submit", function (e) { e.preventDefault(); if (save() !== false) m.close(); });
    var m = ui.modal({
      title: tag ? "Edit tag" : "New tag", body: body, cls: "modal-sm",
      actions: [{ label: "Cancel" }, { label: "Save tag", primary: true, onClick: save }]
    });
  };
})();

/* Settings: profile, focus, display, distraction guard, tags, data export/import/reset. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  function seg(name, value, options) {
    return '<div class="seg" role="radiogroup" data-seg="' + name + '">' + options.map(function (o) {
      return '<button type="button" role="radio" class="seg-btn' + (o[0] === value ? " on" : "") + '" aria-checked="' + (o[0] === value) + '" data-v="' + o[0] + '">' + o[1] + "</button>";
    }).join("") + "</div>";
  }
  function toggle(id, on, label, hint) {
    return '<label class="switch"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + '><span class="track"><span class="thumb"></span></span><span><b>' + label + "</b>" + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>";
  }

  SF.views.settings = {
    mount: function (root) {
      function draw() {
        var S = SF.store.state, s = S.settings, home = SF.airport(S.profile.home), cur = SF.airport(S.currentAirport);
        root.innerHTML =
          '<header class="page-head"><div><p class="eyebrow">Settings</p><h1>Cabin preferences</h1></div><span class="muted saved" id="saved" aria-live="polite"></span></header>' +
          '<div class="settings-grid">' +

          '<section class="panel set-sec"><h2>' + SF.icon("user") + "Passenger</h2>" +
          '<label class="field"><span>Name</span><input id="sName" maxlength="40" value="' + SF.esc(S.profile.name) + '"></label>' +
          '<label class="field"><span>Home airport</span><div><input id="sHome" value="' + SF.esc(home.city + " (" + home.iata + ")") + '"></div></label>' +
          '<div class="field"><span>Current location</span><div class="inline-row"><b class="mono">' + cur.iata + "</b> " + SF.esc(cur.city) +
          (cur.iata !== home.iata ? ' <button class="btn btn-ghost small" id="goHome">' + SF.icon("home") + "Reposition to home</button>" : "") + "</div></div>" +
          "</section>" +

          '<section class="panel set-sec"><h2>' + SF.icon("clock") + "Focus</h2>" +
          '<label class="field"><span>Default focus length (min)</span><input type="number" id="sDur" min="5" max="600" step="5" value="' + s.defaultDuration + '"></label>' +
          '<div class="field"><span>Layover lengths (min)</span><div class="inline-row">' + s.breaks.map(function (b, i) {
            return '<input type="number" class="short" data-break="' + i + '" min="1" max="60" value="' + b + '" aria-label="Layover option ' + (i + 1) + '">';
          }).join("") + "</div></div>" +
          '<label class="field"><span>Daily focus goal (min)</span><input type="number" id="sGoal" min="10" max="960" step="10" value="' + s.dailyGoalMin + '"></label>' +
          toggle("sDnd", s.dndChecklist, "Pre-takeoff checklist", "Show the do-not-disturb checklist at the gate.") +
          "</section>" +

          '<section class="panel set-sec"><h2>' + SF.icon("sun") + "Display</h2>" +
          '<div class="field"><span>Theme</span>' + seg("theme", s.theme, [["dark", "Dark"], ["light", "Light"], ["auto", "Auto"]]) + "</div>" +
          '<div class="field"><span>Distance units</span>' + seg("units", s.units, [["km", "Kilometres"], ["mi", "Miles"]]) + "</div>" +
          '<div class="field"><span>Clock</span>' + seg("clock", s.clock24 ? "24" : "12", [["24", "24-hour"], ["12", "12-hour"]]) + "</div>" +
          toggle("sMotion", s.reducedMotion, "Reduce motion", "Turn off animations (your system setting is also respected).") +
          toggle("sSound", s.sounds, "Sounds", "Chimes and cabin audio.") +
          "</section>" +

          '<section class="panel set-sec"><h2>' + SF.icon("shield") + "Distraction guard</h2>" +
          '<p class="muted">When you leave the SkyFocus tab mid-flight, that counts as turbulence.</p>' +
          '<div class="field"><span>Strictness</span>' + seg("strict", s.strictness, [["off", "Off"], ["warn", "Warn"], ["divert", "Divert"]]) + "</div>" +
          '<label class="field" id="strictRow"' + (s.strictness === "divert" ? "" : " hidden") + '><span>Divert after this many minutes away</span><input type="number" id="sStrictMin" min="1" max="60" value="' + s.strictMinutes + '"></label>' +
          "</section>" +

          '<section class="panel set-sec"><h2>' + SF.icon("tag") + 'Tags</h2><ul class="tag-list">' + S.tags.map(function (t) {
            return '<li><span class="tag-pill" style="--tag:' + t.color + '">' + SF.icon(t.icon) + SF.esc(t.name) + '</span><small class="muted">' + SF.esc(t.builtin ? t.cls : "Open Cabin") + "</small>" +
              '<button class="icon-btn" data-edit="' + t.id + '" aria-label="Edit ' + SF.esc(t.name) + '">' + SF.icon("pen") + "</button>" +
              (t.builtin ? "" : '<button class="icon-btn" data-del="' + t.id + '" aria-label="Delete ' + SF.esc(t.name) + '">' + SF.icon("trash") + "</button>") + "</li>";
          }).join("") + '</ul><button class="btn btn-ghost small" id="addTag">' + SF.icon("plus") + "<span>New tag</span></button></section>" +

          '<section class="panel set-sec"><h2>' + SF.icon("download") + "Your data</h2>" +
          '<p class="muted">Everything is stored in this browser only' + (SF.isFile ? " (file mode, separate from the start.bat version)" : "") + ".</p>" +
          '<div class="row-btns"><button class="btn btn-ghost" id="exportBtn">' + SF.icon("download") + '<span>Export JSON</span></button>' +
          '<label class="btn btn-ghost" tabindex="0" id="importLbl">' + SF.icon("upload") + '<span>Import JSON</span><input type="file" id="importFile" accept="application/json,.json" hidden></label></div>' +
          '<div class="danger-zone"><b>Reset everything</b><p class="muted">Deletes all flights, stamps and settings in this browser.</p><button class="btn btn-danger" id="resetBtn">' + SF.icon("trash") + "<span>Reset SkyFocus</span></button></div>" +
          "</section></div>";
        wire();
      }

      var savedTimer = null;
      function saved() {
        var el = root.querySelector("#saved");
        if (!el) return;
        el.textContent = "Saved";
        clearTimeout(savedTimer);
        savedTimer = setTimeout(function () { if (el) el.textContent = ""; }, 1500);
      }
      function set(fn, redraw) {
        SF.store.update(fn);
        ui.applyTheme();
        ui.updateGoal();
        saved();
        if (redraw) draw();
      }
      function num(id, min, max, fn) {
        var el = root.querySelector(id);
        el.onchange = function () {
          var v = Math.round(+el.value);
          if (!isFinite(v)) return;
          v = Math.max(min, Math.min(max, v));
          el.value = v;
          set(function (s) { fn(s, v); });
        };
      }

      function wire() {
        root.querySelector("#sName").onchange = function () {
          var v = this.value.trim();
          if (v) set(function (s) { s.profile.name = v; });
        };
        ui.airportPicker(root.querySelector("#sHome"), function (a) { set(function (s) { s.profile.home = a.iata; }, true); });
        var gh = root.querySelector("#goHome");
        if (gh) gh.onclick = function () { set(function (s) { s.currentAirport = s.profile.home; }, true); ui.toast("Repositioned to your home airport.", "home"); };
        num("#sDur", 5, 600, function (s, v) { s.settings.defaultDuration = v; });
        num("#sGoal", 10, 960, function (s, v) { s.settings.dailyGoalMin = v; });
        num("#sStrictMin", 1, 60, function (s, v) { s.settings.strictMinutes = v; });
        ui.$$("[data-break]", root).forEach(function (el) {
          el.onchange = function () {
            var i = +el.getAttribute("data-break"), v = Math.max(1, Math.min(60, Math.round(+el.value) || 5));
            el.value = v;
            set(function (s) { s.settings.breaks[i] = v; });
          };
        });
        root.querySelector("#sDnd").onchange = function () { var v = this.checked; set(function (s) { s.settings.dndChecklist = v; }); };
        root.querySelector("#sMotion").onchange = function () { var v = this.checked; set(function (s) { s.settings.reducedMotion = v; }); };
        root.querySelector("#sSound").onchange = function () { var v = this.checked; set(function (s) { s.settings.sounds = v; }); };
        ui.$$("[data-seg]", root).forEach(function (g) {
          g.onclick = function (e) {
            var b = e.target.closest("[data-v]"); if (!b) return;
            var v = b.getAttribute("data-v"), name = g.getAttribute("data-seg");
            set(function (s) {
              if (name === "theme") s.settings.theme = v;
              if (name === "units") s.settings.units = v;
              if (name === "clock") s.settings.clock24 = v === "24";
              if (name === "strict") s.settings.strictness = v;
            }, true);
          };
        });
        root.querySelector("#addTag").onclick = function () { SF.tagEditor(null, function () { draw(); saved(); }); };
        ui.$$("[data-edit]", root).forEach(function (b) {
          b.onclick = function () { SF.tagEditor(SF.tag(b.getAttribute("data-edit")), function () { draw(); saved(); }); };
        });
        ui.$$("[data-del]", root).forEach(function (b) {
          b.onclick = function () {
            var t = SF.tag(b.getAttribute("data-del"));
            ui.confirm("Delete tag “" + SF.esc(t.name) + "”?", "Past flights keep their tag name and colour.", "Delete", true).then(function (ok) {
              if (!ok) return;
              set(function (s) { s.tags = s.tags.filter(function (x) { return x.id !== t.id; }); if (s.lastTagId === t.id) s.lastTagId = null; }, true);
            });
          };
        });

        root.querySelector("#exportBtn").onclick = function () {
          var blob = new Blob([SF.store.exportJSON()], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "skyfocus-backup-" + SF.stats.dayKey(Date.now()) + ".json";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          ui.toast("Backup downloaded.", "download");
        };
        var lbl = root.querySelector("#importLbl"), file = root.querySelector("#importFile");
        lbl.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
        file.onchange = function () {
          var fl = file.files && file.files[0];
          if (!fl) return;
          var reader = new FileReader();
          reader.onload = function () {
            var text = String(reader.result);
            ui.confirm("Import this backup?", "This replaces everything currently stored in SkyFocus with the contents of <b>" + SF.esc(fl.name) + "</b>.", "Import", true).then(function (ok) {
              file.value = "";
              if (!ok) return;
              if (SF.store.state.activeFlight) SF.engine.stop();
              var err = SF.store.importJSON(text);
              if (err) { ui.toast(err, "alert", 5000); return; }
              ui.applyTheme();
              ui.toast("Backup imported: " + SF.store.state.flights.length + " flights restored.", "check");
              ui.buildNav();
              if (SF.store.state.activeFlight && SF.store.state.activeFlight.started) SF.engine.run();
              draw();
              ui.updateNav();
            });
          };
          reader.readAsText(fl);
        };
        root.querySelector("#resetBtn").onclick = function () {
          var body = ui.h('<div><p>This permanently deletes every flight, stamp and setting stored in this browser. Export a backup first if you might want them back.</p>' +
            '<label class="field"><span>Type <b class="mono">RESET</b> to confirm</span><input id="resetTxt" autocomplete="off" autofocus></label></div>');
          var m = ui.modal({
            title: "Reset everything?", body: body, cls: "modal-sm",
            actions: [{ label: "Cancel" }, {
              label: "Reset SkyFocus", danger: true, onClick: function () {
                if (body.querySelector("#resetTxt").value.trim().toUpperCase() !== "RESET") {
                  body.querySelector("#resetTxt").focus();
                  ui.toast("Type RESET to confirm.", "alert");
                  return false;
                }
                SF.engine.stop();
                document.body.classList.remove("airplane");
                SF.store.reset();
                ui.applyTheme();
                ui.go("welcome");
              }
            }]
          });
          return m;
        };
      }
      draw();
    },
    unmount: function () { }
  };
})();

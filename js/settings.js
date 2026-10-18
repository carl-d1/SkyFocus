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
      ui.topbar(ui.topbarTitle("Configuration"), '<span class="saved" id="saved" aria-live="polite"></span>');
      function draw() {
        var S = SF.store.state, s = S.settings, home = SF.airport(S.profile.home), cur = SF.airport(S.currentAirport);
        root.innerHTML =
          '<div class="settings-grid">' +

          '<section class="glass set-sec"><h2>' + SF.icon("user") + "Passenger</h2>" +
          '<label class="field"><span class="label">Name</span><input id="sName" maxlength="40" value="' + SF.esc(S.profile.name) + '"></label>' +
          '<label class="field"><span class="label">Home airport</span><div><input id="sHome" value="' + SF.esc(home.city + " (" + home.iata + ")") + '"></div></label>' +
          '<div class="field"><span class="label">Current location</span><div class="inline-row"><b class="mono">' + cur.iata + "</b> " + SF.esc(cur.city) +
          (cur.iata !== home.iata ? ' <button class="btn small" id="goHome">' + SF.icon("home") + "<span>Reposition home</span></button>" : "") + "</div></div>" +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("clock") + "Focus</h2>" +
          '<div class="field"><span class="label">Booking mode</span>' + seg("booking", s.bookingMode, [["time", "Pick my time"], ["destination", "Pick my destination"], ["journey", "Journey"]]) + "</div>" +
          '<label class="field"><span class="label">Default focus length (min)</span><input type="number" id="sDur" min="5" max="600" step="5" value="' + s.defaultDuration + '"></label>' +
          '<div class="field"><span class="label">Layover lengths (min)</span><div class="inline-row">' + s.breaks.map(function (b, i) {
            return '<input type="number" class="short" data-break="' + i + '" min="1" max="60" value="' + b + '" aria-label="Layover option ' + (i + 1) + '">';
          }).join("") + "</div></div>" +
          '<label class="field"><span class="label">Daily focus goal (min)</span><input type="number" id="sGoal" min="10" max="960" step="10" value="' + s.dailyGoalMin + '"></label>' +
          toggle("sDnd", s.dndChecklist, "Pre-departure check", "Checklist at the gate.") +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("route") + "Journeys</h2>" +
          '<p class="muted">Several focus legs in a row, with layovers as breaks.</p>' +
          '<label class="field"><span class="label">Leg length (min)</span><input type="number" id="jLeg" min="5" max="120" step="5" value="' + s.journey.legMin + '"></label>' +
          '<div class="field"><span class="label">Layovers (min): short, long, long every N legs</span><div class="inline-row">' +
          '<input type="number" class="short" id="jShort" min="1" max="60" value="' + s.journey.shortBreak + '" aria-label="Short layover minutes">' +
          '<input type="number" class="short" id="jLong" min="1" max="90" value="' + s.journey.longBreak + '" aria-label="Long layover minutes">' +
          '<input type="number" class="short" id="jEvery" min="2" max="8" value="' + s.journey.longEvery + '" aria-label="Long layover every N legs"></div></div>' +
          toggle("jAuto", s.journey.autoStart, "Auto-start next leg", "Board automatically when a layover ends.") +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("sun") + "Display</h2>" +
          '<div class="field"><span class="label">Theme</span>' + seg("theme", s.theme, [["dark", "Cockpit"], ["light", "Paper"], ["auto", "Auto"]]) + "</div>" +
          '<div class="field"><span class="label">Distance units</span>' + seg("units", s.units, [["km", "Kilometres"], ["mi", "Miles"]]) + "</div>" +
          '<div class="field"><span class="label">Clock</span>' + seg("clock", s.clock24 ? "24" : "12", [["24", "24-hour"], ["12", "12-hour"]]) + "</div>" +
          '<div class="field"><span class="label">Graphics quality</span>' + seg("gfx", s.graphics || "high", [["high", "High"], ["balanced", "Balanced"], ["low", "Low"]]) + "</div>" +
          toggle("sMotion", s.reducedMotion, "Reduce motion", "Animations off. The system setting also applies.") +
          toggle("sScenes", s.scenes !== false, "Takeoff and landing scenes", "Short sequences at departure and arrival. Space skips.") +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("volume") + "Sound</h2>" +
          '<p class="muted">Synthesised cabin audio. Engine plays in flight; rain, white noise and the pad also play during layovers.</p>' +
          toggle("sSound", s.sounds, "Sound", "Chimes, cabin layers, takeoff and touchdown.") +
          '<div id="setMix"></div><button class="btn small" id="sndTest">' + SF.icon("play") + "<span>Test chime</span></button>" +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("shield") + "Distraction guard</h2>" +
          '<p class="muted">Leaving the tab during a flight logs a turbulence event.</p>' +
          '<div class="field"><span class="label">Strictness</span>' + seg("strict", s.strictness, [["off", "Off"], ["warn", "Warn"], ["divert", "Divert"]]) + "</div>" +
          '<label class="field" id="strictRow"' + (s.strictness === "divert" ? "" : " hidden") + '><span class="label">Divert after minutes away</span><input type="number" id="sStrictMin" min="1" max="60" value="' + s.strictMinutes + '"></label>' +
          "</section>" +

          '<section class="glass set-sec"><h2>' + SF.icon("tag") + 'Tags</h2><ul class="tag-list">' + S.tags.map(function (t) {
            return '<li><span class="tag-pill" style="--tag:' + t.color + '">' + SF.esc(t.name) + '</span><small class="muted">' + SF.esc(t.builtin ? t.cls : "Open Cabin") + "</small>" +
              '<button class="btn icon-only small" data-edit="' + t.id + '" aria-label="Edit ' + SF.esc(t.name) + '">' + SF.icon("pen") + "</button>" +
              (t.builtin ? "" : '<button class="btn icon-only small" data-del="' + t.id + '" aria-label="Delete ' + SF.esc(t.name) + '">' + SF.icon("trash") + "</button>") + "</li>";
          }).join("") + '</ul><button class="btn small" id="addTag">' + SF.icon("plus") + "<span>New tag</span></button></section>" +

          '<section class="glass set-sec" id="shortcuts"><h2>' + SF.icon("keyboard") + 'Keyboard shortcuts</h2><dl class="kbd-list">' +
          ui.SHORTCUTS.map(function (k) { return "<dt><kbd>" + k[0] + "</kbd></dt><dd>" + k[1] + "</dd>"; }).join("") + "</dl></section>" +

          (SF.desktop ? '<section class="glass set-sec"><h2>' + SF.icon("pill") + "Desktop</h2>" +
            toggle("dPillMin", true, "Pill when minimised", "Opens the mini pill when you minimise during a flight or layover.") +
            toggle("dGhost", false, "Ghost pill", "Semi-transparent and click-through until the mouse is over it.") +
            toggle("dStartup", false, "Launch at startup", "Start SkyFocus when you sign in to Windows.") +
            '<h3 class="set-sub">Notifications</h3>' +
            toggle("nLand", s.notify.landing, "Landing", "When a flight lands.") +
            toggle("nLay", s.notify.layover, "Layover over", "When a break ends.") +
            toggle("nLegs", s.notify.legs, "Journey legs", "When the next leg of a journey departs.") +
            toggle("nRem", s.reminderEnabled, "Daily reminder", "Once a day if the goal is not met yet.") +
            '<label class="field" id="remRow"' + (s.reminderEnabled ? "" : " hidden") + '><span class="label">Reminder time</span><input type="time" id="nRemTime" value="' + SF.esc(s.reminderTime || "09:00") + '"></label>' +
            "</section>" : "") +

          '<section class="glass set-sec"><h2>' + SF.icon("download") + "Your data</h2>" +
          '<p class="muted">' + (SF.desktop ? "Stored by the desktop app, separate from the browser version. Import a browser export to bring flights, stamps, achievements and tiers across" :
            "Stored in this browser only" + (SF.isFile ? ". File mode: separate from the start.bat version" : "")) + ".</p>" +
          (SF.desktop ? '<div class="row-btns"><button class="btn" id="backupBtn">' + SF.icon("download") + '<span>Backup now</span></button><button class="btn" id="folderBtn">' + SF.icon("logbook") + "<span>Open data folder</span></button></div>" : "") +
          '<div class="row-btns"><button class="btn" id="exportBtn">' + SF.icon("download") + '<span>Export JSON</span></button>' +
          '<label class="btn" tabindex="0" id="importLbl">' + SF.icon("upload") + '<span>Import JSON</span><input type="file" id="importFile" accept="application/json,.json" hidden></label></div>' +
          '<div class="danger-zone"><b>Reset</b><p class="muted">Deletes all flights, stamps and settings in this browser.</p><button class="btn btn-danger" id="resetBtn">' + SF.icon("trash") + "<span>Reset all data</span></button></div>" +
          "</section>" +
          // the version line; five clicks reveal a test switch that runs new flights 60 times faster
          '<p class="set-version"><button type="button" class="btn-text" id="verBtn">SkyFocus 1.0.0' + (SF.desktop ? " · desktop" : "") + "</button></p>" +
          '<section class="glass set-sec" id="testSec"' + (s.devSpeed ? "" : " hidden") + '><h2>' + SF.icon("flask") + "Test</h2>" +
          toggle("tSpeed", s.devSpeed, "Test speed", "New flights and layovers run 60 times faster. For testing only.") + "</section>" +
          "</div>";
        wire();
      }

      var savedTimer = null;
      function saved() {
        var el = document.getElementById("saved");
        if (!el) return;
        el.textContent = "Saved";
        clearTimeout(savedTimer);
        savedTimer = setTimeout(function () { if (el) el.textContent = ""; }, 1500);
      }
      function set(fn, redraw) {
        SF.store.update(fn);
        ui.applyTheme();
        SF.glass.setQuality(SF.store.state.settings.graphics || "high");
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
        if (gh) gh.onclick = function () { set(function (s) { s.currentAirport = s.profile.home; }, true); ui.toast("Repositioned to " + SF.store.state.profile.home + ".", "home"); };
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
        num("#jLeg", 5, 120, function (s, v) { s.settings.journey.legMin = v; });
        num("#jShort", 1, 60, function (s, v) { s.settings.journey.shortBreak = v; });
        num("#jLong", 1, 90, function (s, v) { s.settings.journey.longBreak = v; });
        num("#jEvery", 2, 8, function (s, v) { s.settings.journey.longEvery = v; });
        root.querySelector("#jAuto").onchange = function () { var v = this.checked; set(function (s) { s.settings.journey.autoStart = v; }); };
        root.querySelector("#sMotion").onchange = function () { var v = this.checked; set(function (s) { s.settings.reducedMotion = v; }); };
        root.querySelector("#sScenes").onchange = function () { var v = this.checked; set(function (s) { s.settings.scenes = v; }); };
        root.querySelector("#sSound").onchange = function () { var v = this.checked; set(function (s) { s.settings.sounds = v; }); SF.audio.unlock(); SF.audio.refresh(); };
        root.querySelector("#setMix").innerHTML = SF.audio.mixerHTML();
        SF.audio.bindMixer(root.querySelector("#setMix"));
        root.querySelector("#sndTest").onclick = function () { SF.audio.unlock(); SF.audio.chime(); };
        ui.$$("[data-seg]", root).forEach(function (g) {
          g.onclick = function (e) {
            var b = e.target.closest("[data-v]"); if (!b) return;
            var v = b.getAttribute("data-v"), name = g.getAttribute("data-seg");
            set(function (s) {
              if (name === "theme") s.settings.theme = v;
              if (name === "units") s.settings.units = v;
              if (name === "clock") s.settings.clock24 = v === "24";
              if (name === "strict") s.settings.strictness = v;
              if (name === "booking") s.settings.bookingMode = v;
              if (name === "gfx") s.settings.graphics = v;
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
            ui.confirm("Delete tag " + SF.esc(t.name), "Logged flights keep their tag name and colour.", "Delete", true).then(function (ok) {
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
          ui.toast("Export saved.", "download");
        };
        var lbl = root.querySelector("#importLbl"), file = root.querySelector("#importFile");
        lbl.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
        file.onchange = function () {
          var fl = file.files && file.files[0];
          if (!fl) return;
          var reader = new FileReader();
          reader.onload = function () {
            var text = String(reader.result);
            ui.confirm("Import " + SF.esc(fl.name), "All data in this browser will be replaced by the file contents.", "Import", true).then(function (ok) {
              file.value = "";
              if (!ok) return;
              if (SF.store.state.activeFlight) SF.engine.stop();
              var err = SF.store.importJSON(text);
              if (err) { ui.toast(err, "alert", 5000); return; }
              ui.applyTheme();
              ui.toast("Import complete. " + SF.store.state.flights.length + " flights.", "check");
              ui.buildNav();
              if (SF.store.state.activeFlight && SF.store.state.activeFlight.started) SF.engine.run();
              draw();
              ui.updateNav();
            });
          };
          reader.readAsText(fl);
        };
        // test switch
        var clicks = 0;
        root.querySelector("#verBtn").onclick = function () { if (++clicks >= 5) root.querySelector("#testSec").hidden = false; };
        root.querySelector("#tSpeed").onchange = function () { var v = this.checked; set(function (s) { s.settings.devSpeed = v; }); ui.toast(v ? "Test speed on: new flights run 60 times faster." : "Test speed off.", "flask"); };
        // desktop preferences, notifications and data
        if (SF.desktop) {
          var D = SF.desktop;
          D.getPrefs().then(function (p) {
            if (!p) return;
            root.querySelector("#dPillMin").checked = p.pillOnMinimise;
            root.querySelector("#dGhost").checked = p.pillClickThrough;
            root.querySelector("#dStartup").checked = p.launchAtStartup;
          });
          [["#dPillMin", "pillOnMinimise"], ["#dGhost", "pillClickThrough"], ["#dStartup", "launchAtStartup"]].forEach(function (x) {
            root.querySelector(x[0]).onchange = function () { var o = {}; o[x[1]] = this.checked; D.setPrefs(o).then(saved); };
          });
          [["#nLand", "landing"], ["#nLay", "layover"], ["#nLegs", "legs"]].forEach(function (x) {
            root.querySelector(x[0]).onchange = function () { var v = this.checked; set(function (s) { s.settings.notify[x[1]] = v; }); };
          });
          root.querySelector("#nRem").onchange = function () { var v = this.checked; root.querySelector("#remRow").hidden = !v; set(function (s) { s.settings.reminderEnabled = v; }); };
          root.querySelector("#nRemTime").onchange = function () { var v = this.value || "09:00"; set(function (s) { s.settings.reminderTime = v; }); };
          root.querySelector("#backupBtn").onclick = function () {
            D.backupNow(SF.store.exportJSON()).then(function (f) { ui.toast(f ? "Backup saved: " + f.split(/[\/]/).pop() : "Backup failed.", f ? "check" : "alert", 5000); });
          };
          root.querySelector("#folderBtn").onclick = function () { D.openDataFolder(); };
        }
        root.querySelector("#resetBtn").onclick = function () {
          var body = ui.h('<div><p>Permanently deletes every flight, stamp and setting in this browser. Export first to keep a copy.</p>' +
            '<label class="field"><span class="label">Type RESET to confirm</span><input id="resetTxt" autocomplete="off" autofocus></label></div>');
          var m = ui.modal({
            title: "Reset all data", body: body, cls: "modal-sm",
            actions: [{ label: "Cancel" }, {
              label: "Reset", danger: true, onClick: function () {
                if (body.querySelector("#resetTxt").value.trim().toUpperCase() !== "RESET") {
                  body.querySelector("#resetTxt").focus();
                  ui.toast("Confirmation text does not match.", "alert");
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

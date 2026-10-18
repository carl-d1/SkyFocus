/* Stats dashboard: membership and tier progress, totals, charts (Chart.js 4.4.1 with an SVG
   fallback), a 12 month heatmap, every route flown on a map, passport progress and achievements. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  function cssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  // Plain SVG bars, used when Chart.js is not available.
  function svgBars(host, labels, values, color) {
    var w = 600, h = 200, pad = 22, max = Math.max(1, Math.max.apply(null, values)), bw = (w - pad) / values.length;
    var bars = values.map(function (v, i) {
      var bh = (h - pad) * v / max;
      return '<rect x="' + (pad + i * bw + 2).toFixed(1) + '" y="' + (h - pad - bh).toFixed(1) + '" width="' + Math.max(1, bw - 4).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + color + '"><title>' + labels[i] + ": " + SF.fmt.dur(v) + "</title></rect>";
    }).join("");
    var ticks = labels.map(function (l, i) { return i % Math.ceil(labels.length / 8) ? "" : '<text x="' + (pad + i * bw + bw / 2).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle">' + l + "</text>"; }).join("");
    host.innerHTML = '<svg class="svg-chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img">' + bars + ticks + "</svg>";
  }

  function heatmap(byDay, goal) {
    var cell = 13, gap = 3, today = startOfDay(new Date());
    var start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 52 * 7);
    var rects = "", months = "", lastMonth = -1, d = new Date(start), col = 0;
    var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    while (d <= today) {
      var row = (d.getDay() + 6) % 7, key = SF.stats.dayKey(d), m = byDay[key] || 0;
      var lvl = m <= 0 ? 0 : m < 25 ? 1 : m < 60 ? 2 : m < goal ? 3 : 4;
      var x = 28 + col * (cell + gap), y = 18 + row * (cell + gap);
      rects += '<rect class="hm l' + lvl + (+d === +today ? " today" : "") + '" x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="2"><title>' + SF.fmt.date(d) + ": " + (m ? SF.fmt.dur(Math.round(m)) : "no flights") + "</title></rect>";
      if (row === 0 && d.getMonth() !== lastMonth) { lastMonth = d.getMonth(); months += '<text x="' + x + '" y="11">' + MON[lastMonth] + "</text>"; }
      d.setDate(d.getDate() + 1);
      if (row === 6) col++;
    }
    var days = ["M", "", "W", "", "F", "", ""].map(function (t, i) { return t ? '<text x="0" y="' + (18 + i * (cell + gap) + 10) + '">' + t + "</text>" : ""; }).join("");
    var W = 28 + (col + 1) * (cell + gap), H = 18 + 7 * (cell + gap);
    return '<svg class="heatmap" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Focus minutes per day, last 12 months">' + months + days + rects + "</svg>";
  }

  SF.views.stats = {
    mount: function (root) {
      var S = SF.store.state, t = SF.stats.totals(), sk = SF.stats.streaks(), self = this;
      var A = SF.achievements, tier = A.tierFor(t.miles), ti = A.tierIndex(tier.id), next = A.TIERS[ti + 1];
      var pct = next ? (t.miles - tier.miles) / (next.miles - tier.miles) : 1;
      var achs = A.list(), got = achs.filter(function (a) { return a.unlocked; }).length;
      var landed = S.flights.filter(function (f) { return f.status === "landed"; });
      self._charts = [];
      var token = self._token = {};   // a later mount makes this one stale

      ui.topbar(ui.topbarTitle("Stats"), '<span class="leg-tag">' + tier.name.toUpperCase() + " · " + t.miles.toLocaleString() + " MI</span>");

      function kpi(label, value, sub) { return '<div class="kpi"><span class="label">' + label + '</span><b class="readout readout-md">' + value + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
      var conts = ["AF", "AS", "EU", "NA", "SA", "OC"], have = {};
      S.stamps.forEach(function (s) { have[s.continent] = (have[s.continent] || 0) + 1; });
      var recent = S.stamps.slice(-8).reverse();
      var longest = null, holds = 0, turb = 0;
      S.flights.forEach(function (f) {
        holds += f.holds || 0; turb += f.turbulence || 0;
        if (f.status === "landed" && (!longest || f.flownKm > longest.flownKm)) longest = f;
      });

      root.innerHTML =
        '<div class="stats">' +
        // membership
        '<section class="glass st-card st-member"><header class="st-head"><span class="label">Membership</span><span class="form-no">SF-M ' + String(ti + 1).padStart(2, "0") + "</span></header>" +
        '<button type="button" class="mcard-btn" id="cardBtn" aria-label="Show ' + tier.name + ' card">' + A.cardHTML(tier.id) + "</button>" +
        '<div class="tier-prog"><div class="tp-bar"><i style="width:' + (pct * 100).toFixed(1) + '%"></i></div>' +
        '<p class="small-print">' + (next ? (next.miles - t.miles).toLocaleString() + " miles to <b>" + next.name + "</b>" : "Top tier reached") + "</p></div>" +
        '<ol class="tier-ladder">' + A.TIERS.map(function (x, i) { return '<li class="' + (i < ti ? "done" : i === ti ? "now" : "") + '"><b>' + x.name + "</b><small>" + x.miles.toLocaleString() + "</small></li>"; }).join("") + "</ol></section>" +
        // totals
        '<section class="glass st-card st-kpis"><header class="st-head"><span class="label">Totals</span><span class="form-no">SF-S 01</span></header><div class="kpi-grid">' +
        kpi("Focus", SF.fmt.dur(Math.round(t.minutes)), t.flights + " flights") +
        kpi("Landed", t.landed, t.diverted + " diverted") +
        kpi("Miles", t.miles.toLocaleString(), SF.fmt.dist(t.km)) +
        kpi("Streak", sk.current + (sk.current === 1 ? " day" : " days"), "best " + sk.best) +
        kpi("Today", SF.fmt.dur(Math.round(SF.stats.todayMinutes())), "goal " + SF.fmt.dur(S.settings.dailyGoalMin || 120)) +
        kpi("This week", SF.fmt.dur(Math.round(SF.stats.weekMinutes()))) +
        kpi("This month", SF.fmt.dur(Math.round(SF.stats.monthMinutes()))) +
        kpi("Places", t.cities, t.countries + " countries") +
        kpi("Longest", longest ? SF.fmt.dist(longest.flownKm) : "--", longest ? longest.from + " to " + longest.to : "") +
        kpi("Average", landed.length ? SF.fmt.dur(Math.round(t.minutes / Math.max(1, t.flights))) : "--", "per flight") +
        kpi("Holds", holds.toLocaleString(), "across all flights") +
        kpi("Turbulence", turb.toLocaleString(), turb === 1 ? "event" : "events") +
        "</div></section>" +
        // charts
        '<section class="glass st-card st-days"><header class="st-head"><span class="label">Last 14 days</span><span class="form-no">FOCUS PER DAY</span></header><div class="chart-box"><canvas id="cDays"></canvas></div></section>' +
        '<section class="glass st-card st-tags"><header class="st-head"><span class="label">By tag</span><span class="form-no">SHARE OF FOCUS</span></header><div class="tag-chart"><div class="chart-box donut"><canvas id="cTags"></canvas></div><ul class="tag-legend" id="tagLegend"></ul></div></section>' +
        '<section class="glass st-card st-heat"><header class="st-head"><span class="label">Last 12 months</span><span class="hm-key"><span>LESS</span><i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i><span>GOAL MET</span></span></header>' + heatmap(SF.stats.byDay(), S.settings.dailyGoalMin || 120) + "</section>" +
        '<section class="glass st-card st-routes"><header class="st-head"><span class="label">Routes flown</span><span class="form-no">' + landed.length + " LANDED</span></header><div class=\"routes-map\" id=\"routesMap\"></div></section>" +
        '<section class="glass st-card st-hours"><header class="st-head"><span class="label">Time of day</span><span class="form-no">FOCUS BY DEPARTURE HOUR</span></header><div class="chart-box"><canvas id="cHours"></canvas></div></section>' +
        // passport
        '<section class="glass st-card st-passport"><header class="st-head"><span class="label">Passport</span><a class="btn btn-text small" href="#/passport">Open</a></header>' +
        '<ul class="cont-list">' + conts.map(function (c) { return '<li class="' + (have[c] ? "on" : "") + '"><b>' + window.CONTINENTS[c] + "</b><span class=\"readout readout-sm\">" + (have[c] || 0) + "</span></li>"; }).join("") + "</ul>" +
        (recent.length ? '<div class="mini-stamps">' + recent.map(function (s) { return '<figure title="' + SF.esc(s.city + ", " + s.country) + '">' + SF.stampSVG(s, 76, { onDark: true }) + "</figure>"; }).join("") + "</div>" : '<p class="muted">No stamps yet.</p>') +
        "</section>" +
        // achievements
        '<section class="glass st-card st-ach"><header class="st-head"><span class="label">Achievements</span><span class="readout readout-sm">' + got + " OF " + achs.length + "</span></header>" +
        '<div class="ach-grid">' + achs.map(function (a) {
          var p = a.max ? a.cur / a.max : 0;
          return '<button type="button" class="ach-tile' + (a.unlocked ? " on" : "") + '" data-id="' + a.def.id + '" title="' + SF.esc(a.def.desc) + '">' +
            '<span class="ach-ico">' + SF.icon(a.def.icon) + "</span><span class=\"ach-txt\"><b>" + SF.esc(a.def.name) + "</b><small>" +
            (a.unlocked ? SF.fmt.date(new Date(a.at)) : (a.max > 1 ? a.cur.toLocaleString() + " / " + a.max.toLocaleString() : "Locked")) + "</small></span>" +
            '<span class="ach-bar"><i style="width:' + (a.unlocked ? 100 : p * 100).toFixed(0) + '%"></i></span></button>';
        }).join("") + "</div></section>" +
        "</div>";

      root.querySelector("#cardBtn").onclick = function () { A.preview({ kind: "tier", tier: tier }); };
      root.querySelector(".ach-grid").onclick = function (e) {
        var b = e.target.closest(".ach-tile.on"); if (!b) return;
        var d = A.DEFS.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
        if (d) A.preview({ kind: "ach", def: d });
      };
      SF.motion.tilt(root.querySelector("#cardBtn"), 6);

      /* ---------- data for the charts ---------- */
      var byDay = SF.stats.byDay(), dl = [], dv = [];
      for (var i = 13; i >= 0; i--) {
        var d = startOfDay(new Date()); d.setDate(d.getDate() - i);
        dl.push(i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase().slice(0, 2) + " " + d.getDate());
        dv.push(Math.round(byDay[SF.stats.dayKey(d)] || 0));
      }
      var tags = SF.stats.byTag(), hours = SF.stats.byHour().map(Math.round);
      var hl = hours.map(function (_, h) { return String(h).padStart(2, "0"); });
      root.querySelector("#tagLegend").innerHTML = tags.length ? tags.map(function (g) {
        return '<li><i style="background:' + g.color + '"></i><span>' + SF.esc(g.name) + '</span><b class="readout readout-sm">' + SF.fmt.dur(Math.round(g.minutes)) + "</b></li>";
      }).join("") : '<li class="muted">No flights yet.</li>';

      var signal = cssVar("--signal") || "#ffc400", text = cssVar("--glass-muted") || "#999", rule = cssVar("--glass-rule") || "rgba(255,255,255,.1)";
      function fallback() {
        svgBars(root.querySelector("#cDays").parentNode, dl, dv, signal);
        svgBars(root.querySelector("#cHours").parentNode, hl, hours, signal);
        var box = root.querySelector("#cTags").parentNode, total = tags.reduce(function (a, g) { return a + g.minutes; }, 0) || 1, a0 = -Math.PI / 2, paths = "";
        tags.forEach(function (g) {
          var a1 = a0 + g.minutes / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
          paths += '<path d="M' + (50 + 46 * Math.cos(a0)) + " " + (50 + 46 * Math.sin(a0)) + " A46 46 0 " + large + " 1 " + (50 + 46 * Math.cos(a1)) + " " + (50 + 46 * Math.sin(a1)) + '" stroke="' + g.color + '" stroke-width="14" fill="none"/>';
          a0 = a1;
        });
        box.innerHTML = '<svg viewBox="0 0 100 100" class="svg-donut">' + (paths || '<circle cx="50" cy="50" r="46" stroke="' + rule + '" stroke-width="14" fill="none"/>') + "</svg>";
      }
      SF.lib.load("chart").then(function () {
        if (self._token !== token || !document.getElementById("cDays")) return;
        var C = window.Chart, reduce = ui.reducedMotion();
        C.defaults.font.family = "'IBM Plex Mono', monospace";
        C.defaults.font.size = 11;
        C.defaults.color = text;
        var anim = reduce ? false : { duration: 900, easing: "easeOutQuart" };
        function bars(id, labels, values) {
          return new C(document.getElementById(id), {
            type: "bar",
            data: { labels: labels, datasets: [{ data: values, backgroundColor: signal, borderRadius: 3, maxBarThickness: 28 }] },
            options: {
              animation: anim, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return SF.fmt.dur(c.parsed.y); } } } },
              scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } }, y: { beginAtZero: true, grid: { color: rule }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: function (v) { return v >= 120 ? Math.round(v / 60) + "h" : v + "m"; } } } }
            }
          });
        }
        self._charts.push(bars("cDays", dl, dv), bars("cHours", hl, hours));
        self._charts.push(new C(document.getElementById("cTags"), {
          type: "doughnut",
          data: { labels: tags.map(function (g) { return g.name; }), datasets: [{ data: tags.map(function (g) { return Math.round(g.minutes); }), backgroundColor: tags.map(function (g) { return g.color; }), borderWidth: 0, hoverOffset: 6 }] },
          options: { animation: anim, cutout: "68%", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return " " + c.label + ": " + SF.fmt.dur(c.parsed); } } } } }
        }));
      }, function (e) { console.info("Charts: built-in bars (" + e.message + ")"); if (self._token === token) fallback(); });

      /* ---------- routes map ---------- */
      var seen = {}, routes = [], marks = {};
      S.flights.forEach(function (f) {
        var a = SF.airport(f.from), b = SF.airport(f.to);
        if (!a || !b) return;
        var k = [f.from, f.to].sort().join("-");
        if (!seen[k]) { seen[k] = 1; routes.push({ from: a, to: b, cls: f.status === "landed" ? "leg-next" : "leg-later" }); }
        marks[a.iata] = a; if (f.status === "landed") marks[b.iata] = b;
      });
      var home = SF.airport(S.profile.home);
      if (home) marks[home.iata] = home;
      var mapObj = SF.maps.create(root.querySelector("#routesMap"), "classic", { camera: "route", padPx: 28, showPlane: false, label: "Routes flown" });
      mapObj.api.setRoutes(routes);
      mapObj.api.setMarkers(Object.keys(marks).map(function (k) { var a = marks[k]; return { lat: a.lat, lon: a.lon, label: routes.length > 30 ? "" : a.iata, cls: a === home ? "m-from" : "m-stop", px: 3.5 }; }));
      self._map = mapObj;
    },
    unmount: function () {
      this._token = null;
      (this._charts || []).forEach(function (c) { try { c.destroy(); } catch (e) { /* gone */ } });
      this._charts = [];
      if (this._map) this._map.api.destroy();
      this._map = null;
    }
  };
})();

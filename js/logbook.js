/* Logbook (flight log with filters) and Passport (stamps by country). */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  function toDateInput(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  SF.showPassModal = function (rec) {
    var body = document.createElement("div");
    body.className = "pass-modal";
    body.appendChild(SF.renderPass(rec));
    var outcome = { yes: "Finished as planned", partly: "Partly finished", no: "Didn’t finish" }[rec.outcome] || "Not recorded";
    body.appendChild(ui.h('<dl class="rec-facts">' +
      "<div><dt>Status</dt><dd>" + (rec.status === "landed" ? "Landed" : "Diverted" + (rec.divertReason === "away" ? " (away too long)" : "")) + "</dd></div>" +
      '<div><dt>Focus time</dt><dd class="mono">' + SF.fmt.dur(rec.focusMin) + "</dd></div>" +
      '<div><dt>Distance flown</dt><dd class="mono">' + SF.fmt.dist(rec.flownKm) + "</dd></div>" +
      '<div><dt>Miles</dt><dd class="mono">' + rec.miles.toLocaleString() + "</dd></div>" +
      '<div><dt>Turbulence</dt><dd class="mono">' + rec.turbulence + "</dd></div>" +
      '<div><dt>Holds</dt><dd class="mono">' + rec.holds + "</dd></div>" +
      "<div><dt>Outcome</dt><dd>" + outcome + "</dd></div>" +
      (rec.note ? '<div class="wide"><dt>Note</dt><dd>' + SF.esc(rec.note) + "</dd></div>" : "") +
      "</dl>"));
    ui.modal({ title: "Flight " + rec.flightNo + " · " + SF.fmt.date(new Date(rec.startAt)), body: body, cls: "modal-wide" });
  };

  SF.views.logbook = {
    mount: function (root) {
      var S = SF.store.state;
      var f = { tag: "all", status: "all", from: "", to: "" };
      var t = SF.stats.totals();
      root.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Logbook</p><h1>Your flights</h1></div></header>' +
        '<div class="kpis">' +
        '<div class="panel kpi"><small>Flights</small><b class="mono">' + t.flights + "</b></div>" +
        '<div class="panel kpi"><small>Focus time</small><b class="mono">' + SF.fmt.dur(t.minutes) + "</b></div>" +
        '<div class="panel kpi"><small>Focus miles</small><b class="mono">' + t.miles.toLocaleString() + "</b></div>" +
        '<div class="panel kpi"><small>Cities</small><b class="mono">' + t.cities + "</b></div>" +
        "</div>" +
        '<div class="panel filters" role="search">' +
        '<label class="field inline"><span>Tag</span><select id="fTag"><option value="all">All tags</option>' + S.tags.map(function (tg) { return '<option value="' + tg.id + '">' + SF.esc(tg.name) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field inline"><span>Status</span><select id="fStatus"><option value="all">All</option><option value="landed">Landed</option><option value="diverted">Diverted</option></select></label>' +
        '<label class="field inline"><span>From</span><input type="date" id="fFrom"></label>' +
        '<label class="field inline"><span>To</span><input type="date" id="fTo" max="' + toDateInput(new Date()) + '"></label>' +
        '<button class="btn btn-ghost small" id="fReset">Clear</button>' +
        "</div>" +
        '<div class="panel log-table-wrap"><table class="log-table"><thead><tr><th scope="col">Date</th><th scope="col">Flight</th><th scope="col">Route</th><th scope="col">Tag</th><th scope="col">Task</th><th scope="col" class="num">Focus</th><th scope="col" class="num">Miles</th><th scope="col">Status</th></tr></thead><tbody id="logRows"></tbody></table></div>';

      function rows() {
        var from = f.from ? new Date(f.from + "T00:00:00").getTime() : -Infinity;
        var to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
        return SF.store.state.flights.filter(function (r) {
          return (f.tag === "all" || r.tagId === f.tag) && (f.status === "all" || r.status === f.status) && r.startAt >= from && r.startAt <= to;
        }).slice().reverse();
      }
      function render() {
        var list = rows(), tb = root.querySelector("#logRows");
        if (!SF.store.state.flights.length) {
          tb.innerHTML = '<tr><td colspan="8" class="empty-cell">' + SF.icon("logbook") + "<p>No flights yet. Your first landing will appear here.</p><a class=\"btn btn-primary small\" href=\"#/book\">Book a flight</a></td></tr>";
          return;
        }
        tb.innerHTML = list.map(function (r) {
          var d = new Date(r.startAt);
          var oc = r.outcome === "yes" ? "check" : r.outcome === "partly" ? "minus" : r.outcome === "no" ? "x" : "";
          return '<tr tabindex="0" data-id="' + r.id + '" aria-label="View boarding pass for ' + r.flightNo + '">' +
            '<td class="mono">' + SF.fmt.shortDate(d) + " <small class='muted'>" + SF.fmt.time(d) + "</small></td>" +
            '<td class="mono">' + r.flightNo + "</td>" +
            '<td class="mono"><b>' + r.from + " → " + r.to + "</b></td>" +
            '<td><span class="tag-pill" style="--tag:' + r.tagColor + '">' + SF.icon(r.tagIcon) + SF.esc(r.tagName) + "</span></td>" +
            '<td class="task-cell">' + (r.task ? SF.esc(r.task) : '<span class="muted">—</span>') + "</td>" +
            '<td class="mono num">' + SF.fmt.dur(r.focusMin) + "</td>" +
            '<td class="mono num">' + r.miles.toLocaleString() + "</td>" +
            '<td><span class="status ' + r.status + '">' + (r.status === "landed" ? "Landed" : "Diverted") + "</span>" + (oc ? '<span class="oc" title="Outcome: ' + r.outcome + '">' + SF.icon(oc) + "</span>" : "") + "</td></tr>";
        }).join("") || '<tr><td colspan="8" class="empty-cell"><p>No flights match these filters.</p></td></tr>';
      }
      function open(e) {
        var tr = e.target.closest("tr[data-id]"); if (!tr) return;
        var id = tr.getAttribute("data-id");
        var rec = SF.store.state.flights.filter(function (x) { return x.id === id; })[0];
        if (rec) SF.showPassModal(rec);
      }
      var tb = root.querySelector("#logRows");
      tb.addEventListener("click", open);
      tb.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } });
      root.querySelector("#fTag").onchange = function () { f.tag = this.value; render(); };
      root.querySelector("#fStatus").onchange = function () { f.status = this.value; render(); };
      root.querySelector("#fFrom").onchange = function () { f.from = this.value; render(); };
      root.querySelector("#fTo").onchange = function () { f.to = this.value; render(); };
      root.querySelector("#fReset").onclick = function () {
        f = { tag: "all", status: "all", from: "", to: "" };
        ["fTag", "fStatus"].forEach(function (id) { root.querySelector("#" + id).value = "all"; });
        ["fFrom", "fTo"].forEach(function (id) { root.querySelector("#" + id).value = ""; });
        render();
      };
      render();
    },
    unmount: function () { }
  };

  SF.views.passport = {
    mount: function (root) {
      var stamps = SF.store.state.stamps;
      var t = SF.stats.totals();
      var byCountry = {};
      stamps.forEach(function (s) { (byCountry[s.country] = byCountry[s.country] || []).push(s); });
      var countries = Object.keys(byCountry).sort();
      root.innerHTML =
        '<header class="page-head"><div><p class="eyebrow">Passport</p><h1>' + SF.esc(SF.store.state.profile.name || "Your") + "’s stamps</h1></div>" +
        '<div class="pp-sum mono"><span><b>' + t.cities + "</b> cities</span><span><b>" + t.countries + "</b> countries</span><span><b>" + t.continents + "</b>/6 continents</span></div></header>" +
        (countries.length ? '<div class="pp-countries">' + countries.map(function (c) {
          return '<section class="panel pp-country"><h2>' + SF.esc(c) + ' <small class="muted">' + byCountry[c].length + "</small></h2><div class=\"pp-grid\">" +
            byCountry[c].map(function (s) { return '<figure class="pp-stamp">' + SF.stampSVG(s, 140) + "<figcaption>" + SF.esc(s.city) + "<small class='mono'>" + SF.fmt.date(new Date(s.date)) + "</small></figcaption></figure>"; }).join("") +
            "</div></section>";
        }).join("") + "</div>" : '<div class="panel empty">' + SF.icon("passport") + "<h2>Your passport is empty</h2><p class=\"muted\">Land somewhere new to collect your first stamp. Diverted flights don’t count.</p><a class=\"btn btn-primary\" href=\"#/book\">Book a flight</a></div>");
    },
    unmount: function () { }
  };
})();

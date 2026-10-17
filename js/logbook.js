/* Logbook (paper ledger with filters) and Passport (stamps by country). */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;
  var OUTCOME = { yes: "Complete", partly: "Partial", no: "Not complete" };

  function toDateInput(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  SF.showPassModal = function (rec) {
    var body = document.createElement("div");
    body.className = "pass-modal";
    body.appendChild(SF.renderPass(rec));
    body.appendChild(ui.h('<dl class="rec-facts glass">' +
      "<div><dt>Status</dt><dd>" + (rec.status === "landed" ? "LANDED" : "DIVERTED" + (rec.divertReason === "away" ? " (AWAY)" : "")) + "</dd></div>" +
      "<div><dt>Block time</dt><dd>" + SF.fmt.dur(rec.focusMin) + "</dd></div>" +
      "<div><dt>Distance</dt><dd>" + SF.fmt.dist(rec.flownKm) + "</dd></div>" +
      "<div><dt>Miles</dt><dd>" + rec.miles.toLocaleString() + "</dd></div>" +
      "<div><dt>Turbulence</dt><dd>" + rec.turbulence + "</dd></div>" +
      "<div><dt>Holds</dt><dd>" + rec.holds + "</dd></div>" +
      "<div><dt>Task status</dt><dd>" + (OUTCOME[rec.outcome] || "Not recorded") + "</dd></div>" +
      (rec.note ? '<div class="wide"><dt>Remarks</dt><dd>' + SF.esc(rec.note) + "</dd></div>" : "") +
      "</dl>"));
    ui.modal({ title: "Flight " + rec.flightNo + " · " + SF.fmt.date(new Date(rec.startAt)), body: body, doc: true });
  };

  SF.views.logbook = {
    fit: true,
    mount: function (root) {
      var S = SF.store.state;
      var f = { tag: "all", status: "all", from: "", to: "" };
      var t = SF.stats.totals();
      ui.topbar('<div class="glass filters" role="search" aria-label="Filter flights">' +
        '<label class="field inline"><span class="label">Tag</span><select id="fTag"><option value="all">All tags</option>' + S.tags.map(function (tg) { return '<option value="' + tg.id + '">' + SF.esc(tg.name) + "</option>"; }).join("") + "</select></label>" +
        '<label class="field inline"><span class="label">Status</span><select id="fStatus"><option value="all">All</option><option value="landed">Landed</option><option value="diverted">Diverted</option></select></label>' +
        '<label class="field inline"><span class="label">From</span><input type="date" id="fFrom"></label>' +
        '<label class="field inline"><span class="label">To</span><input type="date" id="fTo" max="' + toDateInput(new Date()) + '"></label>' +
        '<button class="btn small" id="fReset">Clear</button>' +
        "</div>", "");
      var $ = function (id) { return document.getElementById(id); };
      root.innerHTML =
        '<section class="paper ledger" aria-label="Flight log">' +
        '<div class="ledger-head"><div><p class="label">' + SF.esc((S.profile.name || "").toUpperCase()) + " · " + SF.esc(S.profile.memberNo || "") + "</p><h1>Flight log</h1></div><span class=\"form-no\">FORM SF-20</span></div>" +
        '<dl class="totals">' +
        "<div><dt>Flights</dt><dd>" + t.flights + "</dd></div>" +
        "<div><dt>Block time</dt><dd>" + SF.fmt.dur(t.minutes) + "</dd></div>" +
        "<div><dt>Miles</dt><dd>" + t.miles.toLocaleString() + "</dd></div>" +
        "<div><dt>Cities</dt><dd>" + t.cities + "</dd></div>" +
        "</dl>" +
        '<table class="log-table"><thead><tr><th scope="col">Date</th><th scope="col">Flight</th><th scope="col">Route</th><th scope="col">Class</th><th scope="col" class="col-task">Task</th><th scope="col" class="num">Block</th><th scope="col" class="num">Miles</th><th scope="col" class="col-status">Status</th></tr></thead><tbody id="logRows"></tbody></table>' +
        '<div class="ledger-foot" id="ledgerFoot"></div>' +
        "</section>";

      function rows() {
        var from = f.from ? new Date(f.from + "T00:00:00").getTime() : -Infinity;
        var to = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
        return SF.store.state.flights.filter(function (r) {
          return (f.tag === "all" || r.tagId === f.tag) && (f.status === "all" || r.status === f.status) && r.startAt >= from && r.startAt <= to;
        }).slice().reverse();
      }
      // A logbook page always shows a full page of ruled lines; empty lines fill the rest.
      var PAGE_ROWS = window.innerHeight > 900 ? 12 : 7;
      function blanks(n) { var h = ""; for (var i = 0; i < n; i++) h += '<tr class="blank" aria-hidden="true"><td colspan="8">.</td></tr>'; return h; }
      function render() {
        var list = rows(), tb = root.querySelector("#logRows");
        if (!SF.store.state.flights.length) {
          tb.innerHTML = '<tr><td colspan="8" class="empty-cell">NO ENTRIES. THE FIRST LANDING WILL BE RECORDED HERE.</td></tr>' + blanks(PAGE_ROWS - 1);
          return;
        }
        tb.innerHTML = list.map(function (r) {
          var d = new Date(r.startAt);
          return '<tr tabindex="0" data-id="' + r.id + '" aria-label="Open boarding pass ' + r.flightNo + '">' +
            '<td class="mono">' + SF.fmt.shortDate(d) + " " + SF.fmt.time(d) + "</td>" +
            '<td class="mono">' + r.flightNo + "</td>" +
            '<td class="mono"><b>' + r.from + " → " + r.to + "</b></td>" +
            '<td><span class="tag-pill" style="--tag:' + r.tagColor + '">' + SF.esc(r.tagName) + "</span></td>" +
            '<td class="col-task">' + (r.task ? SF.esc(r.task) : "") + "</td>" +
            '<td class="mono num">' + SF.fmt.dur(r.focusMin) + "</td>" +
            '<td class="mono num">' + r.miles.toLocaleString() + "</td>" +
            '<td class="col-status"><span class="status ' + r.status + '">' + (r.status === "landed" ? "Landed" : "Diverted") + "</span></td></tr>";
        }).join("") || '<tr><td colspan="8" class="empty-cell">NO ENTRIES MATCH FILTER.</td></tr>';
        tb.innerHTML += blanks(Math.max(0, PAGE_ROWS - Math.max(1, list.length)));
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
      $("fTag").onchange = function () { f.tag = this.value; render(); };
      $("fStatus").onchange = function () { f.status = this.value; render(); };
      $("fFrom").onchange = function () { f.from = this.value; render(); };
      $("fTo").onchange = function () { f.to = this.value; render(); };
      $("fReset").onclick = function () {
        f = { tag: "all", status: "all", from: "", to: "" };
        ["fTag", "fStatus"].forEach(function (id) { $(id).value = "all"; });
        ["fFrom", "fTo"].forEach(function (id) { $(id).value = ""; });
        render();
      };
      // Page foot: passport summary, so a short log still reads as a full page.
      var stamps = SF.store.state.stamps.slice(-8).reverse();
      $("ledgerFoot").innerHTML = '<dl class="totals" style="margin:0;grid-template-columns:repeat(2,minmax(0,1fr))">' +
        "<div><dt>Countries</dt><dd>" + t.countries + "</dd></div><div><dt>Continents</dt><dd>" + t.continents + "/6</dd></div></dl>" +
        '<div class="stamp-row" aria-label="Recent passport stamps">' + (stamps.length ? stamps.map(function (x) { return SF.stampSVG(x, 72); }).join("") : '<span class="form-no">NO STAMPS ISSUED</span>') + "</div>";
      render();
    },
    unmount: function () { }
  };

  SF.views.passport = {
    fit: true,
    mount: function (root) {
      var stamps = SF.store.state.stamps;
      var t = SF.stats.totals();
      var byCountry = {};
      stamps.forEach(function (s) { (byCountry[s.country] = byCountry[s.country] || []).push(s); });
      var countries = Object.keys(byCountry).sort();
      ui.topbar(ui.topbarTitle("Passport"), '<div class="pp-sum"><span><b>' + t.cities + "</b> CITIES</span><span><b>" + t.countries + "</b> COUNTRIES</span><span><b>" + t.continents + "</b>/6 CONTINENTS</span></div>");
      root.innerHTML =
        '<section class="paper passport" aria-label="Passport pages">' +
        '<div class="passport-head"><span class="label">' + SF.esc((SF.store.state.profile.name || "").toUpperCase()) + " · " + SF.esc(SF.store.state.profile.memberNo || "") + '</span><span class="form-no">VISAS / ENTRIES</span></div>' +
        (countries.length ? '<div class="pp-book">' + countries.map(function (c) {
          return '<div class="pp-country"><h2>' + SF.esc(c) + " <small>" + byCountry[c].length + "</small></h2><div class=\"pp-grid\">" +
            byCountry[c].map(function (s) { return '<figure class="pp-stamp">' + SF.stampSVG(s, 130) + "<figcaption>" + SF.esc(s.city) + "<small>" + SF.fmt.date(new Date(s.date)) + "</small></figcaption></figure>"; }).join("") +
            "</div></div>";
        }).join("") + "</div>"
          : '<div class="empty"><p class="mono">NO ENTRIES. LAND AT A NEW CITY TO RECEIVE A STAMP. DIVERTED FLIGHTS ARE NOT STAMPED.</p><a class="btn" href="#/book">Book flight</a></div>') +
        "</section>";
    },
    unmount: function () { }
  };
})();

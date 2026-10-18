/* First launch: operating procedure on the left, check-in form on the right. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  var STEPS = [
    ["01", "Book", "Choose a block time. A destination is assigned, or pick one yourself."],
    ["02", "Fly", "The session runs as a live flight. Leaving the tab is logged as turbulence."],
    ["03", "Land", "Landing logs the flight, adds miles and issues a passport stamp for new cities."]
  ];

  SF.views.welcome = {
    fit: true,
    mount: function (root) {
      var data = { name: "", home: null, minutes: 25 };
      root.innerHTML =
        '<div class="onboard">' +
        '<section aria-label="How SkyFocus works">' +
        '<div class="ob-brand"><img src="assets/logo.svg" alt="" width="56" height="56"><h1>SkyFocus</h1></div>' +
        '<p class="label">Operating procedure</p>' +
        '<ol class="ob-steps">' + STEPS.map(function (s) {
          return '<li><span class="n">' + s[0] + "</span><div><h3>" + s[1] + "</h3><p>" + s[2] + "</p></div></li>";
        }).join("") + "</ol></section>" +
        '<form class="glass checkin" novalidate aria-label="Passenger check-in">' +
        '<div class="checkin-head"><h2>Passenger check-in</h2><span class="form-no">FORM SF-00</span></div>' +
        '<label class="field"><span class="label">Passenger name</span><input id="obName" maxlength="40" required autocomplete="name"></label>' +
        '<label class="field"><span class="label">Home airport</span><div><input id="obHome" placeholder="City or IATA code"></div></label>' +
        '<div class="field"><span class="label">Default block time</span><div class="chips" id="obDur">' +
        [15, 25, 45, 60, 90].map(function (m) { return '<button type="button" class="chip mono' + (m === data.minutes ? " on" : "") + '" data-m="' + m + '" aria-pressed="' + (m === data.minutes) + '">' + m + " MIN</button>"; }).join("") +
        "</div></div>" +
        '<p class="form-error" id="obErr" role="alert"></p>' +
        '<button type="submit" class="btn btn-signal btn-lg">' + SF.icon("check") + "<span>Complete check-in</span></button>" +
        "</form></div>";

      var form = root.querySelector("form"), homeInput = root.querySelector("#obHome");
      ui.airportPicker(homeInput, function (a) { data.home = a; });
      root.querySelector("#obDur").addEventListener("click", function (e) {
        var b = e.target.closest("[data-m]");
        if (!b) return;
        data.minutes = +b.getAttribute("data-m");
        ui.$$("#obDur .chip", root).forEach(function (c) { c.classList.toggle("on", c === b); c.setAttribute("aria-pressed", c === b); });
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        data.name = root.querySelector("#obName").value.trim();
        var err = root.querySelector("#obErr");
        if (!data.name) { err.textContent = "Passenger name required."; root.querySelector("#obName").focus(); return; }
        if (!data.home && homeInput.value.trim()) data.home = ui.searchAirports(homeInput.value)[0] || null;
        if (!data.home) { err.textContent = "Home airport required."; homeInput.focus(); return; }
        var now = Date.now();
        SF.store.update(function (s) {
          s.profile.name = data.name;
          s.profile.home = data.home.iata;
          s.profile.memberSince = now;
          s.profile.memberNo = "SF " + String(SF.hash(data.name + now) % 100000000).padStart(8, "0").replace(/(\d{4})(\d{4})/, "$1 $2");
          s.profile.onboarded = true;
          s.currentAirport = data.home.iata;
          s.settings.defaultDuration = data.minutes;
        }, true);
        ui.toast("Check-in complete. Home base " + data.home.iata + ".", "check");
        ui.go("book");
      });
      setTimeout(function () { root.querySelector("#obName").focus(); }, 30);
    },
    unmount: function () { }
  };
})();

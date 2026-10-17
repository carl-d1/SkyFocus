/* First-launch onboarding: three welcome slides, then passenger details. */
(function () {
  var SF = (window.SF = window.SF || {});
  var ui = SF.ui;

  var SLIDES = [
    { icon: "takeoff", title: "Book a flight", text: "Choose how long you want to focus, or where you want to go. SkyFocus finds a real route that fits." },
    { icon: "compass", title: "Focus while you fly", text: "Your session runs as a live flight: watch the route unfold while you work. Step away and you'll hit turbulence." },
    { icon: "passport", title: "Land to log it", text: "Each landing goes into your logbook, earns focus miles, and stamps your passport with a new city." }
  ];

  SF.views.welcome = {
    mount: function (root) {
      var step = 0;
      var data = { name: "", home: null, minutes: 25 };
      root.innerHTML = '<div class="onboard"><div class="onboard-card panel"></div></div>';
      var card = root.querySelector(".onboard-card");

      function dots() {
        return '<div class="ob-dots" aria-hidden="true">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i === step ? "on" : "") + '"></i>'; }).join("") + "</div>";
      }

      function render() {
        if (step < SLIDES.length) {
          var s = SLIDES[step];
          card.innerHTML =
            (step === 0 ? '<div class="ob-brand"><img src="assets/logo.svg" alt="" width="56" height="56"><h1>SkyFocus</h1><p class="muted">Every focus session is a flight.</p></div>' : "") +
            '<div class="ob-slide"><div class="ob-icon">' + SF.icon(s.icon) + '</div><p class="eyebrow">Step ' + (step + 1) + " of 3</p><h2>" + s.title + '</h2><p class="muted">' + s.text + "</p></div>" +
            dots() +
            '<div class="ob-actions">' + (step > 0 ? '<button class="btn btn-ghost" data-back>Back</button>' : '<span></span>') +
            '<button class="btn btn-primary" data-next>' + (step === 2 ? "Get started" : "Next") + "</button></div>";
        } else {
          card.innerHTML =
            '<div class="ob-slide left"><p class="eyebrow">Passenger details</p><h2>Check in</h2></div>' +
            '<form class="ob-form" novalidate>' +
            '<label class="field"><span>Passenger name</span><input id="obName" maxlength="40" required placeholder="e.g. Alex Rivera" value="' + SF.esc(data.name) + '"></label>' +
            '<label class="field"><span>Home airport</span><div><input id="obHome" placeholder="Search city or code, e.g. Melbourne or MEL"></div></label>' +
            '<div class="field"><span>Default focus length</span><div class="chips" id="obDur">' +
            [15, 25, 45, 60, 90].map(function (m) { return '<button type="button" class="chip' + (m === data.minutes ? " on" : "") + '" data-m="' + m + '">' + m + " min</button>"; }).join("") +
            "</div></div>" +
            '<p class="form-error" id="obErr" role="alert"></p>' +
            dots() +
            '<div class="ob-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button type="submit" class="btn btn-primary">' + SF.icon("check") + "<span>Finish check-in</span></button></div>" +
            "</form>";
          var homeInput = card.querySelector("#obHome");
          if (data.home) homeInput.value = data.home.city + " (" + data.home.iata + ")";
          ui.airportPicker(homeInput, function (a) { data.home = a; });
          card.querySelector("#obDur").addEventListener("click", function (e) {
            var b = e.target.closest("[data-m]");
            if (!b) return;
            data.minutes = +b.getAttribute("data-m");
            ui.$$("#obDur .chip", card).forEach(function (c) { c.classList.toggle("on", c === b); });
          });
          card.querySelector("form").addEventListener("submit", function (e) {
            e.preventDefault();
            data.name = card.querySelector("#obName").value.trim();
            var err = card.querySelector("#obErr");
            if (!data.name) { err.textContent = "Please enter a passenger name."; card.querySelector("#obName").focus(); return; }
            if (!data.home) {
              // Accept a typed code without picking from the list.
              var guess = ui.searchAirports(homeInput.value)[0];
              if (guess && homeInput.value.trim()) data.home = guess;
            }
            if (!data.home) { err.textContent = "Please choose a home airport."; homeInput.focus(); return; }
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
            ui.toast("Welcome aboard, " + SF.esc(data.name) + "!", "plane");
            ui.go("book");
          });
          setTimeout(function () { card.querySelector("#obName").focus(); }, 30);
        }
        var next = card.querySelector("[data-next]");
        if (next) { next.addEventListener("click", function () { step++; render(); }); setTimeout(function () { next.focus(); }, 30); }
        var back = card.querySelector("[data-back]");
        if (back) back.addEventListener("click", function () {
          var nameInput = card.querySelector("#obName");
          if (nameInput) data.name = nameInput.value;
          step--; render();
        });
      }
      render();
    },
    unmount: function () { }
  };
})();

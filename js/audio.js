/* Cabin audio, all synthesised with Web Audio (no sound files).
   Layers: engine hum, rain, white noise and an ambient pad, each with its own level, plus a master
   level and mute. Effects: announcement chime, takeoff swoosh, touchdown thump.
   The context starts on the first user gesture (browsers require one). Which layers play depends on
   the scene a view sets: "cabin" (in flight: all layers), "layover" (no engine) or "idle" (effects only).
   The mix is saved in state.audioMix; the Sound switch in Settings silences everything. */
(function () {
  var SF = (window.SF = window.SF || {});
  var LAYERS = [
    { id: "engine", label: "Engine", icon: "plane" },
    { id: "rain", label: "Rain", icon: "leaf" },
    { id: "noise", label: "White noise", icon: "frame" },
    { id: "pad", label: "Ambient pad", icon: "music" }
  ];
  var DEFAULT_MIX = { master: .8, muted: false, layers: { engine: .55, rain: 0, noise: 0, pad: .25 } };

  var ctx = null, out = null, layerGain = {}, nodes = {}, scene = "idle", cabinLevel = .7, override = null, padTimer = null;

  function mix() {
    var m = (SF.store && SF.store.state.audioMix) || {};
    return { master: m.master != null ? m.master : DEFAULT_MIX.master, muted: !!m.muted, layers: Object.assign({}, DEFAULT_MIX.layers, m.layers || {}) };
  }
  function enabled() { return !SF.store || SF.store.state.settings.sounds !== false; }
  function audible() { var m = mix(); return enabled() && !m.muted; }

  /* ---------- buffers ---------- */
  function noiseBuffer(sec, kind) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), last = 0;
      for (var i = 0; i < n; i++) {
        var w = Math.random() * 2 - 1;
        if (kind === "brown") { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
        else d[i] = w;
      }
    }
    return b;
  }
  // Rain: soft broadband hiss with scattered droplets, rendered once and looped.
  function rainBuffer(sec) {
    var sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0, i;
      for (i = 0; i < n; i++) { lp += .35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * .35; }
      var drops = Math.floor(sec * 70);
      for (var k = 0; k < drops; k++) {
        var at = Math.floor(Math.random() * n), f = 1800 + Math.random() * 4200, amp = .08 + Math.random() * .22, len = Math.floor(sr * (.006 + Math.random() * .02));
        for (i = 0; i < len && at + i < n; i++) d[at + i] += Math.sin(2 * Math.PI * f * i / sr) * amp * Math.exp(-i / (len / 4));
      }
      // fade the loop seam
      var fade = Math.floor(sr * .05);
      for (i = 0; i < fade; i++) { var g = i / fade; d[i] *= g; d[n - 1 - i] *= g; }
    }
    return b;
  }
  function loop(buffer) { var s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; return s; }

  /* ---------- graph ---------- */
  function build() {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    out = ctx.createGain();
    out.connect(comp); comp.connect(ctx.destination);
    nodes.meter = ctx.createAnalyser(); nodes.meter.fftSize = 1024;
    comp.connect(nodes.meter);
    LAYERS.forEach(function (l) { layerGain[l.id] = ctx.createGain(); layerGain[l.id].gain.value = 0; layerGain[l.id].connect(out); });

    // engine: brown noise rumble through a moving low-pass, plus a faint fan whine
    var rum = loop(noiseBuffer(6, "brown")), lpf = ctx.createBiquadFilter(), eg = ctx.createGain();
    lpf.type = "lowpass"; lpf.frequency.value = 420; lpf.Q.value = .5;
    rum.connect(lpf); lpf.connect(eg); eg.connect(layerGain.engine);
    var lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = .07; lfoAmt.gain.value = 40;
    lfo.connect(lfoAmt); lfoAmt.connect(lpf.frequency);
    var whine = ctx.createOscillator(), whine2 = ctx.createOscillator(), wg = ctx.createGain();
    whine.type = "triangle"; whine2.type = "sine";
    whine.frequency.value = 180; whine2.frequency.value = 361;
    wg.gain.value = .012;
    whine.connect(wg); whine2.connect(wg); wg.connect(layerGain.engine);
    rum.start(); lfo.start(); whine.start(); whine2.start();
    nodes.engine = { lpf: lpf, gain: eg, whine: whine, whine2: whine2, wg: wg };

    // rain
    var rain = loop(rainBuffer(7)), rhp = ctx.createBiquadFilter();
    rhp.type = "highpass"; rhp.frequency.value = 350;
    rain.connect(rhp); rhp.connect(layerGain.rain); rain.start();

    // white noise, softened at the top
    var wn = loop(noiseBuffer(4, "white")), wlp = ctx.createBiquadFilter(), wng = ctx.createGain();
    wlp.type = "lowpass"; wlp.frequency.value = 8000; wng.gain.value = .3;
    wn.connect(wlp); wlp.connect(wng); wng.connect(layerGain.noise); wn.start();

    // pad: slow chords through a warm filter and a feedback delay
    var padIn = ctx.createGain(), plp = ctx.createBiquadFilter(), dly = ctx.createDelay(1), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
    plp.type = "lowpass"; plp.frequency.value = 1400;
    dly.delayTime.value = .42; fb.gain.value = .38; dlp.type = "lowpass"; dlp.frequency.value = 1800;
    padIn.connect(plp); plp.connect(layerGain.pad);
    plp.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(layerGain.pad);
    nodes.pad = { input: padIn };
  }

  // Four slow chords (MIDI notes), eight seconds each, voices overlapping as they swell and fade.
  var CHORDS = [[48, 55, 62, 64, 71], [45, 52, 60, 64, 67], [41, 48, 57, 64, 69], [43, 50, 59, 62, 69]];
  var chordIx = 0;
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function padChord() {
    if (!ctx || layerGain.pad.gain.value < .001 && mixTarget("pad") === 0) return;
    var t = ctx.currentTime + .05, len = 9.5;
    CHORDS[chordIx % CHORDS.length].forEach(function (m, i) {
      [-4, 4].forEach(function (cents) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = hz(m);
        o.detune.value = cents + (Math.random() - .5) * 3;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime((i === 0 ? .05 : .028), t + 3);
        g.gain.setValueAtTime((i === 0 ? .05 : .028), t + len - 3.5);
        g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g); g.connect(nodes.pad.input);
        o.start(t); o.stop(t + len + .1);
      });
    });
    chordIx++;
  }

  /* ---------- levels ---------- */
  function mixTarget(id) {
    if (!audible()) return 0;
    var m = mix(), v = m.layers[id] || 0;
    if (scene === "idle") return 0;
    if (scene === "layover" && id === "engine") return 0;
    return v;
  }
  function apply(fast) {
    if (!ctx) return;
    var t = ctx.currentTime, m = mix(), tc = fast ? .05 : .6;
    out.gain.setTargetAtTime(audible() ? m.master : 0, t, .08);
    LAYERS.forEach(function (l) { layerGain[l.id].gain.setTargetAtTime(mixTarget(l.id), t, tc); });
    setThrottle(override != null ? override : cabinLevel, fast);
  }
  function setThrottle(v, fast) {
    if (!ctx) return;
    var e = nodes.engine, t = ctx.currentTime, tc = fast ? .08 : .9;
    e.lpf.frequency.setTargetAtTime(260 + v * 900, t, tc);
    e.gain.gain.setTargetAtTime(.35 + v * .75, t, tc);
    e.whine.frequency.setTargetAtTime(120 + v * 140, t, tc);
    e.whine2.frequency.setTargetAtTime(241 + v * 281, t, tc);
    e.wg.gain.setTargetAtTime(.004 + v * .016, t, tc);
  }

  /* ---------- effects ---------- */
  function tone(f, start, dur, peak, type) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + .012);
    g.gain.exponentialRampToValueAtTime(.0001, start + dur);
    o.connect(g); g.connect(out);
    o.start(start); o.stop(start + dur + .05);
  }
  function noiseBurst(start, dur, f0, f1, peak, q) {
    var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nodes.white || (nodes.white = noiseBuffer(2, "white"));
    bp.type = "bandpass"; bp.Q.value = q || 1.2;
    bp.frequency.setValueAtTime(f0, start);
    bp.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + dur * .3);
    g.gain.exponentialRampToValueAtTime(.0001, start + dur);
    s.connect(bp); bp.connect(g); g.connect(out);
    s.start(start); s.stop(start + dur + .05);
  }

  var A = (SF.audio = {
    LAYERS: LAYERS,
    get ready() { return !!ctx; },
    get state() { return ctx ? ctx.state : "none"; },
    // Output level, 0 to 1 (RMS), for the meter in the sound panel.
    meter: function () {
      if (!ctx || !nodes.meter) return 0;
      var a = nodes.meter, buf = new Float32Array(a.fftSize), sum = 0;
      a.getFloatTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },

    // Create or resume the context. Call from a user gesture.
    unlock: function () {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          build();
          padTimer = setInterval(padChord, 8000);
          padChord();
        }
        if (ctx.state === "suspended") ctx.resume();
        apply(true);
      } catch (e) { console.info("Audio unavailable (" + e.message + ")"); }
    },

    // "cabin", "layover" or "idle"
    setScene: function (s) { scene = s; apply(false); },
    // Engine level for the in-flight cabin, from the flight phase.
    cabin: function (level) { cabinLevel = level; if (override == null) setThrottle(level, false); },
    // Scenes drive the engine directly (takeoff roll, reversers); null hands it back to the cabin.
    engine: function (level) {
      if (level == null) { override = null; setThrottle(cabinLevel, false); return; }
      override = level;
      if (!ctx) return;
      if (scene !== "cabin") { scene = "cabin"; apply(true); }
      setThrottle(level, true);
    },

    chime: function () {
      if (!ctx || !audible()) return;
      var t = ctx.currentTime + .02;
      [[987.8, 0], [740, .42]].forEach(function (n) {
        tone(n[0], t + n[1], 1.6, .12);
        tone(n[0] * 2.01, t + n[1], .7, .025);
        tone(n[0] * 3.02, t + n[1], .35, .01);
      });
    },
    swoosh: function () {
      if (!ctx || !audible()) return;
      noiseBurst(ctx.currentTime + .02, 2.6, 300, 1900, .14, .8);
    },
    touchdown: function (strength) {
      if (!ctx || !audible()) return;
      var k = strength == null ? 1 : strength, t = ctx.currentTime + .01;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + .25);
      g.gain.setValueAtTime(.5 * k, t); g.gain.exponentialRampToValueAtTime(.0001, t + .35);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + .4);
      noiseBurst(t, .32, 2400, 1500, .1 * k, 2.5);
    },

    /* ---------- mix ---------- */
    mix: mix,
    setLevel: function (id, v) {
      SF.store.update(function (s) {
        var m = s.audioMix || JSON.parse(JSON.stringify(DEFAULT_MIX));
        m.layers = Object.assign({}, DEFAULT_MIX.layers, m.layers || {});
        if (id === "master") m.master = v; else m.layers[id] = v;
        s.audioMix = m;
      });
      apply(true);
    },
    setMuted: function (on) {
      SF.store.update(function (s) { var m = s.audioMix || JSON.parse(JSON.stringify(DEFAULT_MIX)); m.muted = !!on; s.audioMix = m; });
      apply(true);
    },
    toggleMute: function () { A.setMuted(!mix().muted); return mix().muted; },
    refresh: function () { apply(true); },

    // Mixer markup and wiring, shared by the in-flight sound panel and Settings.
    mixerHTML: function () {
      var m = mix();
      function row(id, label, icon, v) {
        return '<label class="mix-row"><span class="mix-name">' + SF.icon(icon) + "<span>" + label + "</span></span>" +
          '<input type="range" min="0" max="100" step="1" value="' + Math.round(v * 100) + '" data-layer="' + id + '" aria-label="' + label + ' volume">' +
          '<b class="readout readout-sm" data-val="' + id + '">' + Math.round(v * 100) + "</b></label>";
      }
      return '<div class="mixer">' + LAYERS.map(function (l) { return row(l.id, l.label, l.icon, m.layers[l.id]); }).join("") +
        '<div class="mix-rule"></div>' + row("master", "Master", "volume", m.master) +
        '<button type="button" class="btn small mix-mute' + (m.muted ? " btn-signal" : "") + '" aria-pressed="' + m.muted + '">' + SF.icon(m.muted ? "mute" : "volume") + "<span>" + (m.muted ? "Muted" : "Mute") + "</span></button></div>";
    },
    bindMixer: function (root) {
      root.addEventListener("input", function (e) {
        var id = e.target.getAttribute && e.target.getAttribute("data-layer");
        if (!id) return;
        A.unlock();
        var v = +e.target.value / 100;
        var lab = root.querySelector('[data-val="' + id + '"]');
        if (lab) lab.textContent = Math.round(v * 100);
        A.setLevel(id, v);
      });
      root.addEventListener("click", function (e) {
        var b = e.target.closest(".mix-mute");
        if (!b) return;
        A.unlock();
        var muted = A.toggleMute();
        b.classList.toggle("btn-signal", muted);
        b.setAttribute("aria-pressed", muted);
        b.innerHTML = SF.icon(muted ? "mute" : "volume") + "<span>" + (muted ? "Muted" : "Mute") + "</span>";
      });
    }
  });

  // Any first interaction unlocks audio, so a reload mid-flight gets its cabin back on the first click.
  function first() { A.unlock(); window.removeEventListener("pointerdown", first, true); window.removeEventListener("keydown", first, true); }
  window.addEventListener("pointerdown", first, true);
  window.addEventListener("keydown", first, true);
})();

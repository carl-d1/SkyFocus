/* Great-circle maths, flight time estimates and sun position. */
(function () {
  var SF = (window.SF = window.SF || {});
  var R = 6371; // km
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function toVec(lat, lon) {
    var p = lat * D2R, l = lon * D2R;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  }
  function fromVec(v) {
    return { lat: Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * R2D, lon: Math.atan2(v[1], v[0]) * R2D };
  }

  function distanceKm(a, b) {
    var dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearing(a, b) {
    var p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }

  // Point a fraction t (0..1) of the way along the great circle from a to b.
  function interpolate(a, b, t) {
    var va = toVec(a.lat, a.lon), vb = toVec(b.lat, b.lon);
    var dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
    var w = Math.acos(dot);
    if (w < 1e-9) return { lat: a.lat, lon: a.lon };
    var s = Math.sin(w), k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
    return fromVec([va[0] * k1 + vb[0] * k2, va[1] * k1 + vb[1] * k2, va[2] * k1 + vb[2] * k2]);
  }

  // Sampled arc. Longitudes are "unwrapped" so consecutive points never jump by 360,
  // which keeps polylines continuous across the antimeridian.
  function arcPoints(a, b, n, t0, t1) {
    n = n || 64; t0 = t0 || 0; t1 = t1 == null ? 1 : t1;
    var pts = [], prevLon = null;
    for (var i = 0; i <= n; i++) {
      var p = interpolate(a, b, t0 + (t1 - t0) * (i / n));
      if (prevLon !== null) {
        while (p.lon - prevLon > 180) p.lon -= 360;
        while (p.lon - prevLon < -180) p.lon += 360;
      }
      prevLon = p.lon;
      pts.push(p);
    }
    return pts;
  }

  // Realistic block time: cruise at ~800 km/h plus 30 min for taxi, climb and approach.
  function realisticMinutes(km) { return km / 800 * 60 + 30; }

  // Solar position (NOAA-style approximation). Returns elevation in degrees at lat/lon for a Date,
  // plus the subsolar point.
  function sun(date, lat, lon) {
    var jd = date.getTime() / 86400000 + 2440587.5;
    var n = jd - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360;
    var g = ((357.528 + 0.9856003 * n) % 360) * D2R;
    var lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
    var eps = (23.439 - 0.0000004 * n) * D2R;
    var decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var subLon = ((ra * R2D - gmst * 15) % 360 + 540) % 360 - 180;
    var subLat = decl * R2D;
    var res = { subLat: subLat, subLon: subLon, elevation: null };
    if (lat != null) {
      var ha = (lon - subLon) * D2R;
      var el = Math.asin(Math.sin(lat * D2R) * Math.sin(decl) + Math.cos(lat * D2R) * Math.cos(decl) * Math.cos(ha));
      res.elevation = el * R2D;
    }
    return res;
  }

  // Polygon (lon/lat) covering the night side, for equirectangular maps.
  function nightPolygon(date) {
    var s = sun(date);
    var pts = [];
    var tanD = Math.tan(s.subLat * D2R) || 1e-6;
    for (var lon = -180; lon <= 180; lon += 3) {
      var ha = (lon - s.subLon) * D2R;
      var lat = Math.atan(-Math.cos(ha) / tanD) * R2D;
      pts.push([lon, lat]);
    }
    var pole = s.subLat > 0 ? -90 : 90;
    pts.push([180, pole], [-180, pole]);
    return pts;
  }

  // Local time string in an IANA zone.
  function localTime(tz, date, h12) {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: !!h12, timeZone: tz }).format(date || new Date());
    } catch (e) {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: !!h12 }).format(date || new Date());
    }
  }
  function localHour(tz, date) {
    try {
      var s = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(date || new Date());
      return parseInt(s, 10) % 24;
    } catch (e) { return (date || new Date()).getHours(); }
  }

  SF.geo = {
    distanceKm: distanceKm, bearing: bearing, interpolate: interpolate, arcPoints: arcPoints,
    realisticMinutes: realisticMinutes, sun: sun, nightPolygon: nightPolygon,
    localTime: localTime, localHour: localHour,
    KM_TO_MI: 0.621371
  };
})();

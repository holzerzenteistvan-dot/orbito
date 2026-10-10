/* ORBITA satellite-lite v1: local two-body fallback for TLE propagation.
   Approximate only; the full satellite.js SGP4 model takes precedence when available. */
(function (global) {
  'use strict';
  var PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
  var MU = 398600.4418, RE = 6378.137, F = 1 / 298.257223563, E2 = F * (2 - F);
  function rad(v) { return v * DEG; }
  function mod(v, n) { return ((v % n) + n) % n; }
  function rot(x, y, z, O, i, w) {
    var co = Math.cos(O), so = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
    return { x: x * (co * cw - so * sw * ci) + y * (-co * sw - so * cw * ci),
             y: x * (so * cw + co * sw * ci) + y * (-so * sw + co * cw * ci),
             z: x * (sw * si) + y * (cw * si) };
  }
  function twoline2satrec(l1, l2) {
    try {
      var yy = parseInt(l1.slice(18, 20), 10), day = parseFloat(l1.slice(20, 32));
      var year = yy >= 57 ? 1900 + yy : 2000 + yy;
      var epoch = Date.UTC(year, 0, 1) + (day - 1) * 86400000;
      var inc = rad(parseFloat(l2.slice(8, 16))), raan = rad(parseFloat(l2.slice(17, 25)));
      var ecc = parseFloat('0.' + l2.slice(26, 33).trim());
      var argp = rad(parseFloat(l2.slice(34, 42))), m0 = rad(parseFloat(l2.slice(43, 51)));
      var revDay = parseFloat(l2.slice(52, 63)), n = revDay * TAU / 86400;
      if (![epoch, inc, raan, ecc, argp, m0, n].every(Number.isFinite) || ecc < 0 || ecc >= 1 || n <= 0) return null;
      return { epoch: epoch, inc: inc, raan: raan, ecc: ecc, argp: argp, m0: m0, n: n, a: Math.pow(MU / (n * n), 1 / 3) };
    } catch (e) { return null; }
  }
  function propagate(rec, date) {
    if (!rec || !date) return {};
    var dt = (date.getTime() - rec.epoch) / 1000;
    var M = mod(rec.m0 + rec.n * dt + PI, TAU) - PI;
    var E = M;
    for (var k = 0; k < 12; k++) {
      var d = (E - rec.ecc * Math.sin(E) - M) / (1 - rec.ecc * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-10) break;
    }
    var e = rec.ecc, a = rec.a, ce = Math.cos(E), se = Math.sin(E), r = a * (1 - e * ce);
    if (!Number.isFinite(r) || r <= RE * 0.8) return {};
    var xp = a * (ce - e), yp = a * Math.sqrt(1 - e * e) * se;
    var edot = rec.n / (1 - e * ce);
    var vxp = -a * se * edot, vyp = a * Math.sqrt(1 - e * e) * ce * edot;
    var pos = rot(xp, yp, 0, rec.raan, rec.inc, rec.argp);
    var vel = rot(vxp, vyp, 0, rec.raan, rec.inc, rec.argp);
    return { position: pos, velocity: vel };
  }
  function gstime(date) {
    var jd = date.getTime() / 86400000 + 2440587.5, t = (jd - 2451545.0) / 36525;
    var sec = 67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 0.0000062 * t * t * t;
    return mod(sec * PI / 43200, TAU);
  }
  function eciToGeodetic(pos, theta) {
    if (!pos) return null;
    var c = Math.cos(theta), s = Math.sin(theta);
    var x = c * pos.x + s * pos.y, y = -s * pos.x + c * pos.y, z = pos.z;
    var p = Math.sqrt(x * x + y * y), lon = Math.atan2(y, x), lat = Math.atan2(z, p * (1 - E2)), h = 0;
    for (var j = 0; j < 6; j++) {
      var sl = Math.sin(lat), N = RE / Math.sqrt(1 - E2 * sl * sl);
      h = p / Math.max(1e-9, Math.cos(lat)) - N;
      lat = Math.atan2(z, p * (1 - E2 * N / (N + h)));
    }
    return { longitude: lon, latitude: lat, height: h };
  }
  global.ORBITA_SAT_LITE = { twoline2satrec: twoline2satrec, propagate: propagate, gstime: gstime, eciToGeodetic: eciToGeodetic };
})(window);

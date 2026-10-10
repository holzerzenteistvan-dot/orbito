/* ORBITA flights.js – élő repülőforgalom: adatbetöltés, lista, keresés, járatkártya, útvonal-lekérdezés.
   Adatforrások: ADSB.lol, Airplanes.live (tartalék: OpenSky), útvonal és gép: adsbdb.com, hexdb.io. */
(function () {
  'use strict';
  var O = window.ORBITA;
  var mapEl = document.getElementById('flymap');
  if (!O || !O.Map || !mapEl) return;

  var $ = function (id) { return document.getElementById(id); };
  var esc = O.esc;
  var el = { status: $('fl-status'), count: $('fl-count'), list: $('fl-list'), card: $('fl-card'), q: $('fl-q'),
             auto: $('fl-auto'), me: $('fl-me'), reload: $('fl-reload'), legend: $('fl-legend'), next: $('fl-next') };
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  var ADSB = 'https://api.adsb.lol/v2/point/';
  var AIRPL = 'https://api.airplanes.live/v2/point/';
  var OSKY = 'https://opensky-network.org/api/states/all';
  var MAXPLANES = 2500, REFRESH = 45, ROUTE_KEY = 'orbita-routes-v2', ROUTE_TTL = 864e5, MISS_TTL = 216e5;

  var REG = {
    hu: { name: 'Magyarország', pts: [[47.35, 19.2, 200]], bbox: [45.6, 15.8, 48.6, 23.2], c: [47.2, 19.2], z: 6.6 },
    eu: { name: 'Európa', pts: [[50, 6, 250], [52, 22, 250], [44, 10, 250], [44, 26, 250], [58, 26, 250], [40, -6, 250]],
          bbox: [34, -12, 63, 34], c: [49, 13], z: 4 },
    world: { name: 'Világ', world: true, c: [18, 8], z: 1.6,
             pts: [[50, 10, 250], [40, -74, 250], [34, -118, 250], [19, -99, 250], [-23, -46, 250], [-33, 151, 250],
                   [35, 139, 250], [1, 104, 250], [25, 55, 250], [43, -79, 250], [30, 31, 250], [6, 3, 250]] }
  };

  var map = O.Map(mapEl, { lat: 49, lon: 13, zoom: 4, onPick: function (p) { select(p, true); },
                           onEmpty: function () { /* üres kattintás: a kijelölés marad */ } });
  window.ORB_MAP = map;

  var data = [], cur = 'eu', activeRegion = REG.eu, token = 0, sel = null, viewDirty = true, lastErr = '', lastOk = 0, auto = true, left = REFRESH, fails = 0;
  var aircraft = {}, miss = {}, inflight = {}, routes = {};
  try { routes = JSON.parse(localStorage.getItem(ROUTE_KEY) || '{}') || {}; } catch (e) { routes = {}; }

  /* ---------- beépített repülőterek ---------- */
  var AP = {};
  String(window.ORBITA_AIRPORTS || '').split(';').forEach(function (row) {
    var f = row.split('|');
    if (f.length < 6) return;
    AP[f[0]] = { icao: f[0], iata: f[1], city: f[2], country: f[3], name: f[2], lat: parseFloat(f[4]), lon: parseFloat(f[5]) };
  });

  /* ---------- segédek ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function nf(n) { return Number(n).toLocaleString('hu-HU'); }
  function km(a, b) {
    var r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  var DIRS = ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy'];
  function dir(deg) { return DIRS[Math.round(deg / 45) % 8]; }
  function hm(h) {
    var m = Math.max(1, Math.round(h * 60));
    return m < 60 ? m + ' perc' : Math.floor(m / 60) + ' óra ' + (m % 60 ? (m % 60) + ' perc' : '');
  }
  function validCs(cs) { return /^[A-Z]{2,3}\d{1,4}[A-Z]{0,2}$/.test(cs || ''); }
  function say(html) { if (el.status) el.status.innerHTML = html; }

  function getJSON(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) { lastErr = 'HTTP ' + r.status; return { __s: r.status }; } return r.json(); })
      .catch(function (e) { clearTimeout(to); lastErr = e && e.name === 'AbortError' ? 'időtúllépés' : 'hálózati hiba'; return null; });
  }

  /* ---------- légijármű-adatok egységesítése ---------- */
  function plane(hex, cs, lat, lon, alt, spd, trk, type, reg, ground) {
    cs = String(cs || '').trim().toUpperCase().replace(/\s+/g, '');
    hex = String(hex || '').toLowerCase();
    lat = +lat; lon = +lon;
    return { id: hex || (cs + Math.round(lat * 50) + '_' + Math.round(lon * 50)), hex: hex, cs: cs, lat: lat, lon: lon,
             alt: alt, spd: spd != null && isFinite(spd) ? Math.round(spd) : null,
             trk: trk != null && isFinite(trk) ? Math.round(trk) : null, type: type || '', reg: reg || '', ground: !!ground,
             label: cs || reg || type || hex.toUpperCase() };
  }
  function fromAdsb(j) {
    var a = j && (j.ac || j.aircraft);
    if (!a || !a.length) return null;
    var out = [];
    a.forEach(function (x) {
      if (x.lat == null || x.lon == null) return;
      var alt = typeof x.alt_baro === 'number' ? Math.round(x.alt_baro) : null;
      out.push(plane(x.hex, x.flight || x.callsign, x.lat, x.lon, alt, x.gs, x.track != null ? x.track : x.true_heading,
                     x.t, x.r, x.alt_baro === 'ground'));
    });
    return out;
  }
  function fromOpenSky(j) {
    var s = j && j.states;
    if (!s || !s.length) return null;
    var out = [];
    s.forEach(function (x) {
      if (x[5] == null || x[6] == null) return;
      var m = x[7] != null ? x[7] : x[13];
      out.push(plane(x[0], x[1], x[6], x[5], m != null ? Math.round(m * 3.281) : null,
                     x[9] != null ? x[9] * 1.944 : null, x[10], '', '', x[8]));
    });
    return out;
  }

  /* ---------- betöltés ---------- */
  function sample(p) {
    var u = p[0] + '/' + p[1] + '/' + (p[2] || 200);
    return getJSON(ADSB + u).then(function (j) {
      var a = fromAdsb(j);
      if (a && a.length) return { src: 'ADSB.lol', list: a };
      return getJSON(AIRPL + u).then(function (j2) {
        var b = fromAdsb(j2);
        return b && b.length ? { src: 'Airplanes.live', list: b } : null;
      });
    });
  }
  function merge(res) {
    var all = [], seen = {}, srcs = [];
    res.forEach(function (x) {
      if (!x) return;
      if (srcs.indexOf(x.src) < 0) srcs.push(x.src);
      x.list.forEach(function (p) {
        if (p.ground || seen[p.id] || all.length >= MAXPLANES) return;
        seen[p.id] = 1; all.push(p);
      });
    });
    return { list: all, srcs: srcs };
  }
  function osUrl(b) { return OSKY + '?lamin=' + b[0] + '&lomin=' + b[1] + '&lamax=' + b[2] + '&lomax=' + b[3]; }

  function load(key, custom) {
    var r = custom || REG[key];
    if (!r) return;
    if (key !== cur || custom) viewDirty = true;
    cur = key;
    activeRegion = r;
    var me = ++token;
    Array.prototype.forEach.call(document.querySelectorAll('.fl-reg'), function (b) {
      var on = b.getAttribute('data-reg') === key;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { if (!custom) localStorage.setItem('orbita-region', key); } catch (e) {}
    if (viewDirty || !data.length) say('<b>' + esc(r.name) + '</b> betöltése…');
    left = r.world ? REFRESH * 2 : REFRESH;

    Promise.all(r.pts.map(sample)).then(function (res) {
      var m = merge(res);
      if (m.list.length || !r.bbox) return m;
      return getJSON(osUrl(r.bbox), 20000).then(function (j) {                       /* tartalék: OpenSky */
        var a = fromOpenSky(j);
        return a ? merge([{ src: 'OpenSky', list: a }]) : m;
      });
    }).then(function (m) {
      if (me !== token) return;                                                      /* közben másik térség lett */
      apply(m, r);
    });
  }

  function apply(m, r) {
    if (!m.list.length) {
      fails++;
      say('<span class="fl-bad">Az adatforrások most nem adtak adatot (' + esc(lastErr || 'üres válasz') + ').</span> ' +
          'Automatikusan újrapróbáljuk.' +
          (LOCAL && fails > 1 ? ' Ha ez helyben marad: a <code>python3 serve.py</code> futtatja az adatproxyt.' : '') +
          ' <button type="button" class="fl-link" id="fl-retry">Újra most</button>');
      var rb = $('fl-retry'); if (rb) rb.onclick = function () { load(cur, r.custom ? r : null); };
      left = 15;
      if (!data.length) renderList();
      return;
    }
    fails = 0; lastOk = Date.now();
    data = m.list;
    map.setPoints(data, false);
    if (viewDirty) {
      viewDirty = false;
      if (r.world) map.world(); else map.flyTo(r.c[0], r.c[1], r.z);
    }
    if (sel) {                                                                       /* a kijelölt gép frissítése */
      var f = find(sel.id);
      if (f) { sel = f; map.focus(f, null, true); } else sel.gone = true;
      renderCard();
    }
    renderList();
    say('<b>' + nf(data.length) + '</b> repülő a levegőben · forrás: ' + esc(m.srcs.join(' + ')) +
        (r.world ? ' · a világnézet a legforgalmasabb térségek mintája' : '') +
        ' · frissítve: ' + new Date().toLocaleTimeString('hu-HU'));
  }
  function find(id) { for (var i = 0; i < data.length; i++) if (data[i].id === id) return data[i]; return null; }

  /* ---------- útvonal-lekérdezés (adsbdb -> hexdb), gyorsítótárral ---------- */
  var lane = Promise.resolve();
  function throttle(fn) {
    var p = lane.then(fn);
    lane = p.catch(function () {}).then(function () { return new Promise(function (r) { setTimeout(r, 450); }); });
    return p;
  }
  function ap(o) {
    if (!o) return null;
    return { iata: o.iata_code || '', icao: o.icao_code || '', city: o.municipality || o.name || '', name: o.name || '',
             country: o.country_name || '', lat: num(o.latitude), lon: num(o.longitude) };
  }
  function askAdsbdb(cs) {
    return getJSON('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(cs)).then(function (j) {
      if (!j) return null;
      if (j.__s) return j.__s === 404 ? 'none' : null;
      var fr = j.response && j.response.flightroute;
      if (!fr || !fr.origin || !fr.destination) return 'none';
      return { from: ap(fr.origin), to: ap(fr.destination), airline: fr.airline && fr.airline.name || '' };
    });
  }
  function hexAirport(code) {
    if (AP[code]) return Promise.resolve(AP[code]);
    return getJSON('https://hexdb.io/api/v1/airport/icao/' + code).then(function (j) {
      if (!j || j.__s) return { icao: code, iata: '', city: code, name: code, country: '', lat: null, lon: null };
      return { icao: code, iata: j.iata || '', city: j.airport || code, name: j.airport || code, country: j.country_code || '',
               lat: num(j.latitude), lon: num(j.longitude) };
    });
  }
  function askHexdb(cs) {
    return getJSON('https://hexdb.io/api/v1/route/icao/' + encodeURIComponent(cs)).then(function (j) {
      if (!j) return null;
      if (j.__s) return j.__s === 404 ? 'none' : null;
      var m = /\b([A-Z0-9]{4})\s*[-–]\s*([A-Z0-9]{4})\b/.exec(String(j.route || ''));
      if (!m) return 'none';
      return Promise.all([hexAirport(m[1]), hexAirport(m[2])]).then(function (a) { return { from: a[0], to: a[1], airline: '' }; });
    });
  }
  function routeFor(cs) {
    if (!validCs(cs)) return Promise.resolve(null);
    var hit = routes[cs];
    if (hit && Date.now() - hit.t < ROUTE_TTL) return Promise.resolve(hit.r);
    if (miss[cs] && Date.now() - miss[cs] < MISS_TTL) return Promise.resolve(null);
    if (inflight[cs]) return inflight[cs];
    inflight[cs] = throttle(function () {
      return askAdsbdb(cs).then(function (r) { return r && r !== 'none' ? r : askHexdb(cs).then(function (r2) { return r2 || r; }); });
    }).then(function (r) {
      delete inflight[cs];
      if (r && r !== 'none') {
        routes[cs] = { t: Date.now(), r: r };
        var k = Object.keys(routes);
        if (k.length > 500) k.sort(function (a, b) { return routes[a].t - routes[b].t; }).slice(0, k.length - 500).forEach(function (x) { delete routes[x]; });
        try { localStorage.setItem(ROUTE_KEY, JSON.stringify(routes)); } catch (e) {}
        return r;
      }
      if (r === 'none') miss[cs] = Date.now();
      return null;
    }).catch(function () { delete inflight[cs]; return null; });
    return inflight[cs];
  }
  function aircraftInfo(hex) {
    if (!hex) return Promise.resolve(null);
    if (aircraft[hex] !== undefined) return Promise.resolve(aircraft[hex]);
    return getJSON('https://api.adsbdb.com/v0/aircraft/' + encodeURIComponent(hex)).then(function (j) {
      var a = j && j.response && j.response.aircraft;
      aircraft[hex] = a || null;
      return aircraft[hex];
    });
  }

  /* ---------- lista és keresés ---------- */
  function query() { return String(el.q && el.q.value || '').trim().toUpperCase().replace(/\s+/g, ''); }
  function visibleList() {
    var q = query(), out = [];
    if (q.length >= 2) {
      for (var i = 0; i < data.length && out.length < 30; i++) {
        var p = data[i];
        if (p.cs.indexOf(q) >= 0 || p.reg.replace(/-/g, '').toUpperCase().indexOf(q.replace(/-/g, '')) >= 0 ||
            p.type.toUpperCase().indexOf(q) >= 0 || p.hex.toUpperCase().indexOf(q) >= 0) out.push(p);
      }
      return { q: q, items: out };
    }
    var seen = {};
    data.forEach(function (p) { if (validCs(p.cs) && !seen[p.cs]) { seen[p.cs] = 1; out.push(p); } });
    out.sort(function (a, b) { return (b.alt || 0) - (a.alt || 0); });
    return { q: '', items: out.slice(0, 14) };
  }
  function renderList() {
    if (!el.list) return;
    var v = visibleList();
    if (el.count) el.count.textContent = data.length ? nf(data.length) + ' gép' : '';
    if (!v.items.length) {
      el.list.innerHTML = '<p class="fl-empty">' + (v.q ? 'Nincs találat erre: <b>' + esc(v.q) + '</b>. Próbálj hívójel-előtagot (pl. WZZ) vagy típust (pl. A320).'
        : (data.length ? 'Nincs hívójellel azonosítható járat a látható gépek között.' : 'Várom az élő adatokat…')) + '</p>';
      return;
    }
    var h = '';
    v.items.forEach(function (p) {
      var r = routes[p.cs] && routes[p.cs].r;
      var code = r ? (r.from.iata || r.from.icao || '?') + ' → ' + (r.to.iata || r.to.icao || '?')
                   : (miss[p.cs] ? '–' : (validCs(p.cs) ? '…' : ''));
      var sub = r ? (r.from.city || '?') + ' → ' + (r.to.city || '?') : (p.type || 'útvonal keresése…');
      h += '<button type="button" class="fl-li' + (sel && sel.id === p.id ? ' on' : '') + '" data-id="' + esc(p.id) + '">' +
           '<i class="fl-dot" style="background:' + (O.altColor ? O.altColor(p.alt) : '#999') + '"></i>' +
           '<b>' + esc(p.label) + '</b><span class="fl-r">' + esc(code) + '</span>' +
           '<small>' + esc(sub) + (p.alt ? ' · ' + nf(p.alt) + ' láb' : '') + '</small></button>';
      if (!r && !miss[p.cs] && validCs(p.cs)) routeFor(p.cs).then(function (rr) { if (rr) softRender(); });
    });
    el.list.innerHTML = h;
  }
  var softT = null;
  function softRender() { clearTimeout(softT); softT = setTimeout(function () { renderList(); if (sel) renderCard(); }, 250); }

  /* ---------- járatkártya ---------- */
  function select(p, fly) {
    if (!p) return;
    sel = p.id ? p : (find(p.id) || p);
    map.setRoute(null);
    if (fly !== false) map.focus(sel, 7);
    renderCard(); renderList();
    var cs = sel.cs, me = sel.id;
    aircraftInfo(sel.hex).then(function () { if (sel && sel.id === me) renderCard(); });
    routeFor(cs).then(function (r) {
      if (!sel || sel.id !== me) return;
      if (r && r.from && r.to && r.from.lat != null && r.to.lat != null) {
        map.setRoute([{ lat: r.from.lat, lon: r.from.lon }, { lat: r.to.lat, lon: r.to.lon }],
                     r.from.iata || r.from.icao, r.to.iata || r.to.icao);
      }
      renderCard();
    });
  }
  function clearSel() {
    sel = null; map.setRoute(null); map.clearFocus(); renderCard(); renderList();
  }
  function stat(k, v) { return '<div><span>' + k + '</span><b>' + v + '</b></div>'; }
  function renderCard() {
    if (!el.card) return;
    if (!sel) { el.card.innerHTML = '<p class="fl-hint">Kattints egy gépre a térképen vagy a listában: megmutatjuk, honnan hová tart, és hol tart az úton.</p>'; return; }
    var p = sel, r = routes[p.cs] && routes[p.cs].r, ac = aircraft[p.hex] || null;
    var h = '<div class="fl-cardhead"><div><h3>' + esc(p.label) + '</h3><p class="muted small">' +
            esc([(r && r.airline), ac && [ac.manufacturer, ac.type].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || p.type || 'ismeretlen típus') +
            '</p></div><button type="button" class="fl-x" aria-label="Kijelölés törlése">×</button></div>';
    if (p.gone) h += '<p class="fl-warn">Ez a gép kikerült a mostani adatokból (talán leszállt vagy elhagyta a térséget).</p>';
    if (r) {
      var A = r.from, B = r.to, total = null, frac = null, eta = '';
      if (A.lat != null && B.lat != null) {
        var d1 = km(A, p), d2 = km(p, B);
        total = Math.round(km(A, B)); frac = d1 / Math.max(1, d1 + d2);
        if (p.spd && p.spd > 120) eta = hm(d2 / (p.spd * 1.852));
      }
      h += '<div class="fl-route"><div><span class="k">Honnan</span><b>' + esc(A.city || A.icao) + '</b><small>' + esc(A.iata || A.icao) +
           (A.country ? ' · ' + esc(A.country) : '') + '</small></div><div class="fl-arrow" aria-hidden="true">✈</div>' +
           '<div><span class="k">Hová</span><b>' + esc(B.city || B.icao) + '</b><small>' + esc(B.iata || B.icao) +
           (B.country ? ' · ' + esc(B.country) : '') + '</small></div></div>';
      if (frac != null) {
        h += '<div class="fl-prog" role="img" aria-label="Az út ' + Math.round(frac * 100) + '%-a megtéve"><i style="width:' + Math.round(Math.min(1, frac) * 100) + '%"></i></div>' +
             '<p class="small muted">' + nf(total) + ' km · megtéve ' + Math.round(Math.min(1, frac) * 100) + '%' +
             (eta ? ' · érkezés kb. ' + eta + ' múlva' : '') + '</p>';
      }
    } else if (validCs(p.cs)) {
      h += '<p class="small muted">' + (miss[p.cs] ? 'Ehhez a hívójelhez nincs nyilvántartott útvonal (teher-, magán- vagy különjárat lehet).' : '<span class="load"></span> Útvonal keresése…') + '</p>';
    } else {
      h += '<p class="small muted">Ehhez a géphez nincs menetrendi járatszám az adásban, ezért az útvonal nem kérdezhető le.</p>';
    }
    h += '<div class="fl-stats">' +
         stat('Magasság', p.alt != null ? nf(p.alt) + ' láb<small>' + nf(Math.round(p.alt * 0.3048)) + ' m</small>' : '–') +
         stat('Sebesség', p.spd != null ? nf(Math.round(p.spd * 1.852)) + ' km/h<small>' + p.spd + ' csomó</small>' : '–') +
         stat('Irány', p.trk != null ? p.trk + '° <small>' + dir(p.trk) + '</small>' : '–') +
         stat('Lajstrom', esc(p.reg || (ac && ac.registration) || '–')) + '</div>';
    if (ac && ac.url_photo_thumbnail) {
      h += '<figure class="fl-photo"><img src="' + esc(ac.url_photo_thumbnail) + '" alt="Fotó a gépről: ' + esc(p.reg || p.label) + '" loading="lazy" onerror="this.parentNode.remove()">' +
           '<figcaption>Fotó: planespotters.net' + (ac.registered_owner ? ' · ' + esc(ac.registered_owner) : '') + '</figcaption></figure>';
    }
    if (r && r.from.lat != null && r.to.lat != null) {
      h += '<a class="btn btn-s fl-gm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=' +
           r.from.lat + ',' + r.from.lon + '&destination=' + r.to.lat + ',' + r.to.lon + '">Megnyitás Google Térképen</a>';
    }
    el.card.innerHTML = h;
    var x = el.card.querySelector('.fl-x'); if (x) x.onclick = clearSel;
  }

  /* ---------- vezérlők ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.fl-reg'), function (b) {
    b.addEventListener('click', function () { viewDirty = true; load(b.getAttribute('data-reg')); });
  });
  if (el.list) el.list.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.fl-li') : null;
    if (!b) return;
    var p = find(b.getAttribute('data-id'));
    if (p) select(p, true);
  });
  if (el.q) {
    el.q.addEventListener('input', O.debounce(renderList, 150));
    el.q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var v = visibleList(); if (v.q && v.items[0]) select(v.items[0], true); }
      else if (e.key === 'Escape') { el.q.value = ''; renderList(); }
    });
  }
  if (el.auto) el.auto.addEventListener('click', function () {
    auto = !auto;
    el.auto.setAttribute('aria-pressed', auto ? 'true' : 'false');
    el.auto.textContent = auto ? 'Automatikus: be' : 'Automatikus: ki';
    if (el.next && !auto) el.next.textContent = 'Automatikus frissítés szünetel';
    else if (el.next) el.next.textContent = 'Következő frissítés: ' + left + ' mp';
  });
  if (el.reload) el.reload.addEventListener('click', function () {
    if (el.reload.disabled) return;
    el.reload.disabled = true;
    var old = el.reload.textContent;
    el.reload.textContent = 'Frissítés…';
    load(cur, REG[cur] ? null : activeRegion);
    window.setTimeout(function () { if (el.reload) { el.reload.disabled = false; el.reload.textContent = old; } }, 1200);
  });
  if (el.me) el.me.addEventListener('click', function () {
    if (!navigator.geolocation) { O.toast('A böngésződ nem tudja megadni a helyzetedet.', 'bad'); return; }
    el.me.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      el.me.disabled = false;
      var la = +pos.coords.latitude.toFixed(2), lo = +pos.coords.longitude.toFixed(2);
      viewDirty = true;
      load('me', { name: 'a környéked', pts: [[la, lo, 150]], bbox: [la - 2, lo - 3, la + 2, lo + 3], c: [la, lo], z: 7.4, custom: true });
    }, function () { el.me.disabled = false; O.toast('A helyzeted nem érhető el. Engedélyezd a böngészőben, vagy válassz térséget.', 'bad'); },
    { timeout: 10000, maximumAge: 300000 });
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '1') { viewDirty = true; load('hu'); }
    else if (e.key === '2') { viewDirty = true; load('eu'); }
    else if (e.key === '3') { viewDirty = true; load('world'); }
    else if (e.key === 'Escape' && sel) clearSel();
  });

  if (el.legend && O.ALT_BANDS) {
    el.legend.innerHTML = '<b>Magasság</b>' + O.ALT_BANDS.map(function (b) { return '<span><i style="background:' + b[1] + '"></i>' + b[2] + '</span>'; }).join('');
  }

  /* ---------- időzítő: másodpercenként számol, láthatatlan lapon áll ---------- */
  setInterval(function () {
    if (!auto || document.hidden) return;
    left--;
    if (el.next) el.next.textContent = left > 0 ? 'Következő frissítés: ' + left + ' mp' : '';
    if (left <= 0) { left = REFRESH; load(cur, REG[cur] ? null : activeRegion); }
  }, 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastOk > REFRESH * 1000 && REG[cur]) load(cur);
  });

  renderCard();
  var start = 'eu';
  try { var sr = localStorage.getItem('orbita-region'); if (sr && REG[sr]) start = sr; } catch (e) {}
  load(start);
})();

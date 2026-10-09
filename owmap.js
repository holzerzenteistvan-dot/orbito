/* ORBITA owmap.js v3 - csempés világtérkép. Nincs rétegválasztó: a térkép
   automatikusan a világos/sötét témához igazodik. Vektoros tartalék nézettel.
   API: ORBITA.Map(el, opts) -> setPoints, setRoute, focus, fit, world, refresh */
(function () {
  'use strict';
  var O = window.ORBITA = window.ORBITA || {};
  var RM = false;
  try { RM = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var SRC = {
    sat: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    light: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    dark: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
           'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    street: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
  };
  var PAL = {
    dark: { sea: '#121c2b', land: '#1d2a1c', coast: 'rgba(140,180,140,.45)', grid: 'rgba(255,255,255,.05)', ink: '#ece7db', halo: 'rgba(0,0,0,.62)', acc: '#d9b978', dim: '#8b95a6' },
    light: { sea: '#cfe2f2', land: '#eceee6', coast: '#b9c6d2', grid: 'rgba(0,0,0,.05)', ink: '#1b1d22', halo: 'rgba(255,255,255,.8)', acc: '#8a6a1f', dim: '#6b7280' }
  };
  var LAND = [
    [-168,66,-160,71,-140,70,-125,70,-110,73,-95,72,-82,73,-62,66,-55,52,-66,45,-70,42,-75,35,-81,25,-83,23,-88,21,-95,19,-97,16,-105,20,-114,31,-124,40,-130,55,-140,60,-150,60,-165,60],
    [-97,16,-92,15,-84,10,-78,8,-77,9,-83,15,-88,21,-95,19],
    [-81,9,-77,8,-70,12,-60,10,-50,0,-35,-6,-38,-15,-48,-25,-58,-35,-62,-41,-66,-55,-72,-53,-75,-45,-71,-30,-70,-18,-76,-14,-81,-5,-79,2],
    [-10,36,-9,43,3,43,5,53,8,57,12,56,22,60,30,66,40,68,60,70,80,74,100,77,120,74,140,72,160,70,180,66,180,60,160,60,143,53,132,43,127,36,122,31,120,23,108,21,105,10,100,6,95,16,90,22,80,15,72,20,65,25,57,25,50,30,43,38,36,45,30,46,28,41,23,40,18,40,15,37,10,44,3,42,-5,36],
    [-17,15,-16,21,-10,27,0,32,10,34,20,32,32,31,35,24,43,12,51,12,43,-2,40,-15,35,-24,27,-34,20,-35,15,-29,12,-18,9,0,3,6,-8,5,-14,11],
    [113,-22,114,-32,123,-34,135,-35,145,-38,150,-37,153,-28,146,-19,142,-11,132,-11,128,-15,122,-17],
    [-45,60,-20,70,-20,82,-40,83,-60,82,-58,76,-50,68],
    [43,-16,50,-15,50,-25,45,-25],
    [130,32,141,41,145,44,142,40,132,33],
    [166,-46,174,-41,178,-38,173,-35,168,-44],
    [-24,65,-14,66,-15,64,-22,63],
    [-10,52,-6,58,-2,58,0,53,-6,50]
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mercY(lat) {
    var s = Math.sin(clamp(lat, -85.0511, 85.0511) * Math.PI / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }
  function invMercY(y) {
    var n = Math.PI - 2 * Math.PI * y;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function lngToX(l) { return (l + 180) / 360; }
  function xToLng(x) { return x * 360 - 180; }
  function lonNorm(l) { return ((l + 180) % 360 + 360) % 360 - 180; }
  function gc(a, b, n) {
    var rad = Math.PI / 180, out = [], i, t;
    var p1 = a.lat * rad, l1 = a.lon * rad, p2 = b.lat * rad, l2 = b.lon * rad;
    var dp = p2 - p1, dl = l2 - l1;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    var d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (!d) return [a, b];
    for (i = 0; i <= n; i++) {
      t = i / n;
      var A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
      var x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      var y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      var z = A * Math.sin(p1) + B * Math.sin(p2);
      out.push({ lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / rad, lon: Math.atan2(y, x) / rad });
    }
    return out;
  }

  var cache = {}, stats = { ok: 0, fail: 0 };

  O.Map = function (el, opts) {
    opts = opts || {};
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    if (!el.style.overflow) el.style.overflow = 'hidden';
    el.classList.add('owmap');
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    el.appendChild(cv);
    var ctx = cv.getContext('2d');
    var DPR = Math.min(2, window.devicePixelRatio || 1);
    var W = 800, H = 460;
    var view = { lat: opts.lat != null ? +opts.lat : 25, lon: opts.lon != null ? +opts.lon : 12, zoom: opts.zoom != null ? +opts.zoom : 2 };
    var pts = [], route = null, focusPt = null, hoverPt = null;
    var layer = 'sat', dash = 0, need = false, anim = 0;
    var proxied = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || '');
    var custom = !!(opts.tiles && opts.tiles.length);
    if (custom) { SRC.custom = opts.tiles; layer = 'custom'; }

    function lightTheme() {
      try {
        var m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(getComputedStyle(document.body).backgroundColor || '');
        if (!m) return false;
        return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 > 0.6;
      } catch (e) { return false; }
    }
    function autoLayer() {
      if (custom) return;
      var want = lightTheme() ? 'light' : 'sat';
      if (layer !== want) { layer = want; cache = {}; stats = { ok: 0, fail: 0 }; tick(); }
    }
    function pal() { return PAL[layer === 'light' ? 'light' : 'dark']; }
    function isLight() { return layer === 'light'; }
    function worldPx() { return 256 * Math.pow(2, view.zoom); }
    function screen(lat, lon) {
      var wp = worldPx();
      return { x: (lonNorm(lon - view.lon) / 360) * wp + W / 2, y: (mercY(lat) - mercY(view.lat)) * wp + H / 2 };
    }
    function unproject(sx, sy) {
      var wp = worldPx();
      return { lat: invMercY(mercY(view.lat) + (sy - H / 2) / wp), lon: lonNorm(view.lon + ((sx - W / 2) / wp) * 360) };
    }

    function urlFor(list, z, x, y, k) {
      return list[Math.min(k, list.length - 1)].replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }
    function tile(list, tz, x, y) {
      var key = layer + '|' + tz + '|' + x + '|' + y;
      var t = cache[key];
      if (!t) { t = cache[key] = { ok: false, k: 0, img: null }; load(t, list, tz, x, y); }
      return t;
    }
    function load(t, list, tz, x, y) {
      var u = urlFor(list, tz, x, y, t.k);
      if (proxied) u = '/api/proxy?url=' + encodeURIComponent(u);
      var im = new Image();
      t.img = im;
      im.onload = function () { t.ok = true; stats.ok++; note(null); tick(); };
      im.onerror = function () {
        stats.fail++;
        if (proxied && stats.ok === 0 && stats.fail > 1) { proxied = false; cache = {}; stats.fail = 0; tick(); return; }
        t.k++;
        if (t.k < list.length) load(t, list, tz, x, y);
        else { note('A térkép csempéi nem érhetők el – vektoros tartalék nézet.'); tick(); }
      };
      im.src = u;
    }
    var noteEl = null;
    function note(txt) {
      if (txt === null) { if (noteEl) noteEl.style.display = 'none'; return; }
      if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;max-width:70%;padding:6px 10px;border-radius:9px;font:12px/1.45 system-ui,sans-serif;background:rgba(20,22,28,.82);color:#f0e7d6;border:1px solid rgba(217,185,120,.35)';
        el.appendChild(noteEl);
      }
      noteEl.textContent = txt; noteEl.style.display = 'block';
    }

    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(300, Math.round(r.width || el.clientWidth || 800));
      H = Math.max(220, Math.round(r.height || el.clientHeight || 460));
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      tick();
    }
    function tick() { request(); }
    function frame() { need = false; draw(); if (route && !RM) { dash = (dash + 0.7) % 24; tick(); } }
    function request() { if (need) return; need = true; requestAnimationFrame(frame); }

    function draw() {
      var p = pal();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = p.sea; ctx.fillRect(0, 0, W, H);
      drawLand(p); drawTiles(); drawGrid(p); drawRoute(p); drawPoints(p);
      ctx.font = '11px system-ui,sans-serif';
      ctx.fillStyle = p.dim; ctx.globalAlpha = 0.75; ctx.textAlign = 'right';
      ctx.fillText('© Esri, Maxar · © OpenStreetMap · © CARTO', W - 10, H - 9);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    function drawLand(p) {
      ctx.beginPath();
      LAND.forEach(function (poly) {
        for (var j = 0; j < poly.length; j += 2) {
          var s = screen(poly[j + 1], poly[j]);
          if (j) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        }
        ctx.closePath();
      });
      ctx.fillStyle = p.land; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = p.coast; ctx.stroke();
    }
    function drawTiles() {
      var list = SRC[layer];
      if (!list || !list.length) return;
      var tz = Math.round(clamp(view.zoom, 1, 18)), n = 1 << tz;
      var ts = 256 * Math.pow(2, view.zoom - tz);
      var cxT = lngToX(view.lon) * n, cyT = mercY(view.lat) * n;
      var x0 = Math.floor(cxT - (W / 2) / ts) - 1, x1 = Math.ceil(cxT + (W / 2) / ts) + 1;
      var y0 = Math.max(0, Math.floor(cyT - (H / 2) / ts) - 1), y1 = Math.min(n - 1, Math.ceil(cyT + (H / 2) / ts) + 1);
      for (var j = y0; j <= y1; j++) {
        for (var i = x0; i <= x1; i++) {
          var ii = ((i % n) + n) % n;
          var t = tile(list, tz, ii, j);
          if (!t.ok) continue;
          ctx.drawImage(t.img, (i - cxT) * ts + W / 2, (j - cyT) * ts + H / 2, ts + 0.6, ts + 0.6);
        }
      }
    }
    function drawGrid(p) {
      if (view.zoom < 2.2) return;
      ctx.strokeStyle = p.grid; ctx.lineWidth = 1; ctx.beginPath();
      var step = view.zoom > 7 ? 1 : view.zoom > 5 ? 5 : 10;
      for (var lon = -180; lon <= 180; lon += step) {
        var a = screen(80, lon), b = screen(-80, lon);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (var lat = -80; lat <= 80; lat += step) {
        var c = screen(lat, -180), d = screen(lat, 180);
        ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      }
      ctx.stroke();
    }
    function drawRoute(p) {
      if (!route || route.pts.length < 2) return;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      var prev = null;
      for (var i = 0; i < route.pts.length; i++) {
        var s = screen(route.pts[i].lat, route.pts[i].lon);
        if (prev && Math.abs(s.x - prev.x) < W * 0.5) {
          ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke();
          ctx.strokeStyle = p.acc; ctx.lineWidth = 2.4; ctx.setLineDash([11, 13]); ctx.lineDashOffset = -dash;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(s.x, s.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        prev = s;
      }
      ctx.restore();
      pin(screen(route.pts[0].lat, route.pts[0].lon), p, route.a || 'Indulás');
      pin(screen(route.pts[route.pts.length - 1].lat, route.pts[route.pts.length - 1].lon), p, route.b || 'Cél');
    }
    function pin(s, p, label) {
      if (s.x < -80 || s.x > W + 80 || s.y < -60 || s.y > H + 60) return;
      ctx.beginPath(); ctx.arc(s.x, s.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = p.acc; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
      if (!label) return;
      ctx.font = '600 12px system-ui,sans-serif';
      var w = ctx.measureText(label).width + 14;
      var x = clamp(s.x - w / 2, 6, W - w - 6), y = s.y - 30;
      ctx.fillStyle = 'rgba(12,14,20,.88)';
      roundRect(x, y, w, 22, 7); ctx.fill();
      ctx.fillStyle = '#f4ecdc'; ctx.textAlign = 'left';
      ctx.fillText(label, x + 7, y + 15);
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function drawPoints(p) {
      if (!pts.length) return;
      var boxes = [], showLabels = pts.length <= 60 || !!focusPt;
      var sorted = pts.slice(0, 3000).map(function (q) { return { q: q, s: screen(q.lat, q.lon) }; })
        .sort(function (a, b) { return a.s.y - b.s.y; });
      sorted.forEach(function (o) {
        var s = o.s;
        if (s.x < -70 || s.x > W + 70 || s.y < -40 || s.y > H + 40) return;
        var isF = focusPt && (focusPt === o.q || focusPt.raw === o.q.raw);
        var isH = hoverPt === o.q;
        var rr = isF || isH ? 6 : 3.6;
        ctx.beginPath(); ctx.arc(s.x, s.y, rr + 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();
        ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = isF ? '#ffffff' : p.acc; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
        if (!showLabels || !o.q.label) return;
        ctx.font = (isF ? '700 12px' : '600 11px') + ' system-ui,sans-serif';
        var txt = o.q.label;
        var w = ctx.measureText(txt).width + 12, x = s.x + 9, y = s.y - 9;
        if (x + w > W - 4) x = s.x - w - 9;
        if (y < 2) y = s.y + 6;
        var box = { x: x, y: y, w: w, h: 18 };
        for (var i = 0; i < boxes.length; i++) {
          var b = boxes[i];
          if (!(box.x > b.x + b.w || box.x + box.w < b.x || box.y > b.y + b.h || box.y + box.h < b.y)) return;
        }
        boxes.push(box);
        ctx.fillStyle = isF ? 'rgba(12,14,20,.92)' : p.halo;
        roundRect(x, y, w, 18, 6); ctx.fill();
        ctx.fillStyle = isF ? '#ffffff' : p.ink;
        ctx.textAlign = 'left';
        ctx.fillText(txt, x + 6, y + 13);
      });
    }

    function panBy(dx, dy) {
      var wp = worldPx();
      var x = lngToX(view.lon) + dx / wp;
      view.lon = xToLng(x - Math.floor(x));
      view.lat = invMercY(clamp(mercY(view.lat) - dy / wp, 0.0005, 0.9995));
      tick();
    }
    function ease(k) { return k * k * (3 - 2 * k); }
    function flyTo(lat, lon, zoom, ms) {
      if (RM) { view.lat = lat; view.lon = lon; if (zoom != null) view.zoom = zoom; tick(); return; }
      var t0 = performance.now(), d = ms || 700;
      var la = view.lat, lo = lonNorm(view.lon), zo = view.zoom, dlon = lonNorm(lon - lo);
      var tz = zoom == null ? zo : zoom;
      cancelAnimationFrame(anim);
      (function step(now) {
        var k = clamp((now - t0) / d, 0, 1), e = ease(k);
        view.lat = la + (lat - la) * e;
        view.lon = lonNorm(lo + dlon * e);
        view.zoom = zo + (tz - zo) * e;
        tick();
        if (k < 1) anim = requestAnimationFrame(step);
      })(t0);
    }
    function setPoints(list, doFit) {
      pts = (list || []).filter(function (x) { return x && x.lat != null && x.lon != null; }).map(function (x) {
        return { lat: +x.lat, lon: lonNorm(+x.lon), label: x.label || x.name || x.callsign || x.title || '',
                 sub: x.sub || x.detail || x.route || x.type || '', raw: x };
      });
      hoverPt = null;
      if (doFit) fit();
      tick();
      return pts.length;
    }
    function setRoute(list, a, b) {
      var clean = (list || []).filter(function (x) { return x && x.lat != null && x.lon != null; });
      if (clean.length < 2) { route = null; tick(); return; }
      var p = clean.map(function (x) { return { lat: +x.lat, lon: lonNorm(+x.lon) }; });
      route = { pts: p.length === 2 ? gc(p[0], p[1], 64) : p, a: a || '', b: b || '' };
      var mid = route.pts[Math.floor(route.pts.length / 2)];
      var z = clamp(9 - Math.abs(p[0].lon - p[p.length - 1].lon) / 22, 4, 9);
      flyTo((p[0].lat + p[p.length - 1].lat) / 2, mid.lon, z);
      tick();
    }
    function fit() {
      var src = pts.concat(route ? route.pts : []);
      if (!src.length) return world();
      var n = 90, s = -90, e = -180, w = 180;
      src.forEach(function (p) { n = Math.min(n, p.lat); s = Math.max(s, p.lat); e = Math.max(e, p.lon); w = Math.min(w, p.lon); });
      var dLat = Math.max(1, s - n), dLon = Math.max(1, e - w);
      var z = Math.log2(W / (dLon / 360 * 256)) - 0.4;
      flyTo((n + s) / 2, (e + w) / 2, clamp(z, 1, 11));
    }
    function world() {
      var z = clamp(Math.log2(Math.max(320, W) / 256) - 0.02, 0.6, 3);
      flyTo(18, 8, z, RM ? 0 : 700);
    }
    function focus(p, z) {
      if (!p) return;
      var q = null;
      pts.forEach(function (x) { if (x === p || x.raw === p || (p.lat != null && x.lat === +p.lat && x.lon === lonNorm(+p.lon))) q = x; });
      focusPt = q || { lat: +p.lat, lon: lonNorm(+p.lon), label: '', raw: p };
      flyTo(+focusPt.lat, +focusPt.lon, z == null ? Math.max(view.zoom, 7) : z);
    }
    function refresh() { resize(); }
    function destroy() { cv.remove(); if (noteEl) noteEl.remove(); }

    var drag = null, pointers = {}, pinch = null;
    function dist() {
      var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
    }
    cv.addEventListener('pointerdown', function (e) {
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length === 2) pinch = { d: dist(), z: view.zoom };
      else { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.style.cursor = 'grabbing'; }
    });
    cv.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
      if (pinch && Object.keys(pointers).length === 2) {
        view.zoom = clamp(pinch.z + Math.log2(Math.max(1, dist() / pinch.d)), 1, 16); tick(); return;
      }
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        panBy(dx, dy); return;
      }
      hover(e);
    });
    function release(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (!drag) return;
      var wasClick = drag.moved < 6;
      drag = null; cv.style.cursor = 'grab';
      if (wasClick) pick(e);
    }
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('pointerleave', function () { if (!drag) { hoverPt = null; tick(); } });
    cv.addEventListener('dblclick', function (e) {
      var q = unproject(e.offsetX, e.offsetY);
      flyTo(q.lat, q.lon, view.zoom + 1.4, 420);
    });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var before = unproject(e.offsetX, e.offsetY);
      view.zoom = clamp(view.zoom - e.deltaY * 0.0022, 1, 16);
      var after = screen(before.lat, before.lon);
      panBy(e.offsetX - after.x, e.offsetY - after.y);
    }, { passive: false });
    function hit(e) {
      var best = null, bd = 15;
      for (var i = 0; i < pts.length; i++) {
        var s = screen(pts[i].lat, pts[i].lon);
        var d = Math.hypot(s.x - e.offsetX, s.y - e.offsetY);
        if (d < bd) { bd = d; best = pts[i]; }
      }
      return best;
    }
    function hover(e) {
      var q = hit(e);
      if (q !== hoverPt) { hoverPt = q; cv.style.cursor = q ? 'pointer' : 'grab'; tick(); }
    }
    function pick(e) {
      var q = hit(e);
      if (q) { focusPt = q; if (opts.onPick) opts.onPick(q.raw || q); }
      else if (opts.onEmpty) opts.onEmpty();
      else if (opts.resetOnEmpty) world();
      tick();
    }

    window.addEventListener('resize', function () { resize(); });
    if (window.ResizeObserver) { try { new ResizeObserver(function () { resize(); }).observe(el); } catch (x) {} }
    autoLayer();
    try {
      new MutationObserver(autoLayer).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    } catch (e) {}
    setInterval(autoLayer, 1500);
    resize();
    var readyNote = setTimeout(function () { if (!stats.ok) note('M\u0171holdas t\u00e9rk\u00e9p bet\u00f6lt\u00e9se\u2026'); }, 1800);
    if (opts.points) setPoints(opts.points, opts.fit);
    if (opts.route) setRoute(opts.route, opts.routeA, opts.routeB);

    return {
      el: el, canvas: cv, view: view, stats: stats,
      setPoints: setPoints, setRoute: setRoute, focus: focus, fit: fit,
      world: world, refresh: refresh, resize: resize, destroy: destroy
    };
  };
  O.tiles = function (tpl, x, y, z) {
    return String(tpl).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  };
})();

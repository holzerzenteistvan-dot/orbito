/* ================= ORBITA gömb motor =================
   Canvas 2D, ortografikus vetítés, könyvtár nélkül.
   A feliratok DOM elemek, minden képkockán a vászon tényleges
   képernyőméretéhez skálázva -> nem csúsznak el nagyításkor.
   ==================================================== */
(function () {
  'use strict';
  var O = window.ORBITA = window.ORBITA || {};
  var BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/';
  var TEX = {
    day: [BASE + 'earth_atmos_2048.jpg',
          BASE + 'earth_atmos_4096.jpg',
          'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/2_no_clouds_4k.jpg',
          'https://unpkg.com/three@0.128.0/examples/textures/planets/earth_atmos_2048.jpg'],
    night: [BASE + 'earth_lights_2048.png'],
    clouds: [BASE + 'earth_clouds_1024.png', BASE + 'earth_clouds_2048.png']
  };

  /* ---- egyszer kiszámolt táblák ---- */
  var ASIN = new Float32Array(4097);
  for (var ai = 0; ai <= 4096; ai++) ASIN[ai] = Math.asin(ai / 4096 * 2 - 1);
  var A2 = new Float32Array(512 * 512);
  for (var zi = 0; zi < 512; zi++) {
    var zz = zi / 511 * 2 - 1;
    for (var xi = 0; xi < 512; xi++) A2[zi * 512 + xi] = Math.atan2(xi / 511 * 2 - 1, zz);
  }

  function loadOne(urls) {
    return new Promise(function (res) {
      if (!urls || !urls.length) return res(null);
      var i = 0;
      (function next() {
        if (i >= urls.length) return res(null);
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.decoding = 'async';
        im.onload = function () { res(im); };
        im.onerror = function () { i++; next(); };
        im.src = urls[i++];
      })();
    });
  }
  O.loadTex = loadOne;

  function toPixels(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    try { return { w: w, h: h, d: g.getImageData(0, 0, w, h).data }; }
    catch (e) { return null; }
  }

  /* ---- tartalék Föld: kontinens-poligonok ---- */
  var LAND = [
    [[-168,66],[-150,70],[-125,70],[-100,72],[-85,70],[-62,60],[-52,47],[-66,44],[-70,41],
     [-81,31],[-80,25],[-90,29],[-97,26],[-105,22],[-115,30],[-124,40],[-124,48],[-135,58],[-152,60]],
    [[-78,8],[-70,10],[-60,10],[-50,0],[-35,-5],[-38,-16],[-48,-25],[-58,-35],[-62,-42],
     [-68,-52],[-75,-52],[-73,-40],[-70,-20],[-80,-5],[-79,2]],
    [[-10,36],[0,44],[12,45],[20,40],[28,41],[30,45],[38,45],[40,38],[28,36],[24,40],
     [22,37],[14,38],[18,40],[10,44],[3,43],[-6,43]],
    [[-17,15],[-5,5],[8,4],[10,0],[12,-6],[13,-17],[18,-28],[26,-34],[33,-26],[40,-16],
     [41,-4],[51,11],[43,12],[35,23],[32,31],[12,33],[0,36],[-6,35],[-16,22]],
    [[26,70],[60,72],[100,76],[140,72],[170,68],[160,58],[140,52],[142,44],[128,35],[122,31],
     [120,22],[108,21],[100,12],[95,5],[80,8],[72,20],[60,25],[48,29],[43,38],[46,45],
     [52,52],[40,58],[30,60],[28,66]],
    [[113,-22],[129,-12],[142,-11],[153,-28],[150,-38],[140,-38],[132,-31],[118,-34],[114,-27]],
    [[166,-46],[174,-41],[178,-38],[173,-34],[168,-35],[165,-41]],
    [[-180,-72],[180,-72],[180,-90],[-180,-90]],
    [[-45,60],[-20,70],[-18,76],[-30,83],[-58,82],[-62,72]],
    [[43,-12],[50,-14],[50,-25],[45,-25],[43,-18]],
    [[-10,51],[-2,53],[-3,58],[-6,58],[-8,55]]
  ];
  function makeFallback() {
    var W = 2048, H = 1024, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, '#eef6fd'); g.addColorStop(0.14, '#bcd7ee');
    g.addColorStop(0.50, '#1d5fa8'); g.addColorStop(0.86, '#a9c9e7');
    g.addColorStop(1.00, '#eef6fd');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    function pt(lon, lat) { return [(lon + 180) / 360 * W, (90 - lat) / 180 * H]; }
    x.lineJoin = 'round';
    LAND.forEach(function (poly) {
      x.beginPath();
      poly.forEach(function (p, i) { var q = pt(p[0], p[1]); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
      x.closePath();
      x.fillStyle = '#336e48'; x.fill();
      x.lineWidth = 3; x.strokeStyle = '#27573a'; x.stroke();
    });
    return c;
  }

  function Globe(canvas, opts) {
    opts = opts || {};
    var host = opts.host || canvas.parentElement;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var markers = (opts.marks || []).map(function (m, i) {
      var o = {};
      for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k] = m[k];
      o.lat = +m.lat; o.lon = +m.lon; o._i = i;
      return o;
    });

    var labelHost = opts.labelHost || null;
    var tip = null, hoverMark = null, hoverTimer = null;

    var state = {
      yaw: (opts.lon != null) ? -opts.lon * Math.PI / 180 : 0.35,
      pitch: (opts.lat != null) ? opts.lat * Math.PI / 180 : 0.30,
      zoom: 1, zoomT: 1,
      dragging: false, vx: 0, vy: 0, moved: false,
      dirty: true, W: 0, H: 0, R: 0, cx: 0, cy: 0,
      tex: { day: null, night: null, clouds: null },
      px: null, img: null, buf: null
    };
    var sun = { x: 1, y: 0, z: 0 };
    var running = true;

    /* ---------------- méret ---------------- */
    function resize() {
      var r = canvas.getBoundingClientRect();
      var cssW = Math.max(200, Math.round(r.width) || 480);
      var cssH = Math.max(200, Math.round(r.height) || cssW);
      var maxW = cssW < 780 ? 470 : 900;
      var k = Math.min(1, maxW / cssW);
      var w = Math.max(200, Math.round(cssW * k));
      var h = Math.max(200, Math.round(cssH * k));
      if (w === state.W && h === state.H) return;
      state.W = canvas.width = w;
      state.H = canvas.height = h;
      state.cx = w / 2; state.cy = h / 2;
      state.R = Math.min(w, h) / 2 * 0.975;
      buildPixels();
      if (window.ImageData) { state.img = new ImageData(w, h); state.buf = state.img.data; }
      else { state.img = ctx.createImageData(w, h); state.buf = state.img.data; }
      state.dirty = true;
    }

    function buildPixels() {
      var W = state.W, H = state.H, R = state.R, cx = state.cx, cy = state.cy;
      var cap = W * H;
      var ix = new Int32Array(cap), pxs = new Float32Array(cap), pys = new Float32Array(cap), pzs = new Float32Array(cap);
      var n = 0;
      for (var y = 0; y < H; y++) {
        var v0 = -(y + 0.5 - cy) / R;
        for (var x = 0; x < W; x++) {
          var u0 = (x + 0.5 - cx) / R;
          var d = u0 * u0 + v0 * v0;
          if (d > 1) continue;
          ix[n] = y * W + x; pxs[n] = u0; pys[n] = v0; pzs[n] = Math.sqrt(1 - d); n++;
        }
      }
      state.px = { n: n, ix: ix, xs: pxs, ys: pys, zs: pzs };
    }

    /* ---------------- napállás ---------------- */
    function sunDir(d) {
      d = d || new Date();
      var n = d.getTime() / 86400000 + 2440587.5 - 2451545.0;
      var L = (280.460 + 0.9856474 * n) % 360;
      var g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
      var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
      var eps = (23.439 - 0.0000004 * n) * Math.PI / 180;
      var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
      var gmst = (18.697374558 + 24.06570982441908 * n) % 24;
      var lo = (ra * 180 / Math.PI - gmst * 15) * Math.PI / 180;
      return { x: Math.cos(dec) * Math.sin(lo), y: Math.sin(dec), z: Math.cos(dec) * Math.cos(lo) };
    }

    /* ---------------- textúra betöltés ---------------- */
    Promise.all([loadOne(TEX.day), loadOne(TEX.night), loadOne(TEX.clouds)]).then(function (t) {
      var day = t[0] ? toPixels(t[0]) : null;
      if (!day) {
        var fb = makeFallback();
        day = toPixels(fb);
      }
      state.tex.day = day;
      state.tex.night = t[1] ? toPixels(t[1]) : null;
      state.tex.clouds = t[2] ? toPixels(t[2]) : null;
      state.dirty = true;
      if (opts.onReady) opts.onReady({ remote: !!t[0] });
      paint();
    });

    /* ---------------- feliratok ---------------- */
    if (labelHost) {
      markers.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'glabel' + (m.kind ? ' ' + m.kind : '');
        el.setAttribute('aria-hidden', 'true');
        labelHost.appendChild(el);
        m._el = el;
      });
      tip = document.createElement('div');
      tip.className = 'gtip';
      labelHost.appendChild(tip);
    }

    /* ---------------- vetítés ---------------- */
    function cam(lat, lon) {
      var la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
      var x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      var cyw = Math.cos(state.yaw), syw = Math.sin(state.yaw);
      var cpi = Math.cos(state.pitch), spi = Math.sin(state.pitch);
      var x1 = x * cyw + z * syw;
      var z1 = -x * syw + z * cyw;
      var y1 = y * cpi - z1 * spi;
      var z2 = y * spi + z1 * cpi;
      return [x1, y1, z2];
    }
    function project(lat, lon) {
      var c = cam(lat, lon), R = state.R * state.zoom;
      return { x: state.cx + c[0] * R, y: state.cy - c[1] * R, z: c[2] };
    }

    /* ---------------- rajzolás ---------------- */
    function paint() {
      if (!state.px || !state.tex.day || !state.img) return;
      var W = state.W, H = state.H, R = state.R, cx = state.cx, cy = state.cy;
      var zoom = state.zoom, Rz = R * zoom;

      var day = state.tex.day, night = state.tex.night, clouds = state.tex.clouds;
      var dW = day.w, dH = day.h, dD = day.d;
      var nW = night ? night.w : 0, nH = night ? night.h : 0, nD = night ? night.d : null;
      var cW = clouds ? clouds.w : 0, cH = clouds ? clouds.h : 0, cD = clouds ? clouds.d : null;

      var yaw = state.yaw, pitch = state.pitch;
      var cyw = Math.cos(yaw), syw = Math.sin(yaw);
      var cpi = Math.cos(pitch), spi = Math.sin(pitch);
      var sx = sun.x, sy = sun.y, sz = sun.z;
      var buf = state.buf;
      buf.fill(0);

      var px = state.px, n = px.n, IX = px.ix, PX = px.xs, PY = px.ys, PZ = px.zs;
      var inv = 1 / zoom;

      for (var i = 0; i < n; i++) {
        var u = PX[i] * inv, v = PY[i] * inv;
        var q2 = u * u + v * v;
        if (q2 > 1) continue;
        var cz = Math.sqrt(1 - q2);

        /* kamera -> világ (a forgatás transzponáltja) */
        var y1 = v * cpi + cz * spi;
        var z1 = -v * spi + cz * cpi;
        var wx = u * cyw - z1 * syw;
        var wz = u * syw + z1 * cyw;
        var wy = y1;

        /* földrajzi koordináta táblából */
        var qx = ((wx + 1) * 255.5) | 0; if (qx < 0) qx = 0; else if (qx > 511) qx = 511;
        var qz = ((wz + 1) * 255.5) | 0; if (qz < 0) qz = 0; else if (qz > 511) qz = 511;
        var lon = A2[qz * 512 + qx];
        var ay = ((wy + 1) * 2048) | 0; if (ay < 0) ay = 0; else if (ay > 4096) ay = 4096;
        var lat = ASIN[ay];

        var tu = lon * 0.15915494309189535 + 0.5; if (tu < 0) tu += 1;
        var tv = 0.5 - lat * 0.3183098861837907;
        var txi = (tu * dW) | 0; if (txi >= dW) txi = dW - 1;
        var tyi = (tv * dH) | 0; if (tyi < 0) tyi = 0; else if (tyi >= dH) tyi = dH - 1;
        var di = (tyi * dW + txi) << 2;

        var ndl = wx * sx + wy * sy + wz * sz;
        var lit = (ndl + 0.17) * 2.38;
        if (lit < 0) lit = 0; else if (lit > 1) lit = 1;
        lit = lit * lit * (3 - 2 * lit);

        var r = dD[di], g = dD[di + 1], b = dD[di + 2];

        /* felhőzet */
        if (cD) {
          var cu = tu + 0.0016; if (cu > 1) cu -= 1;
          var cxi = (cu * cW) | 0; if (cxi >= cW) cxi = cW - 1;
          var cyi = (tv * cH) | 0; if (cyi < 0) cyi = 0; else if (cyi >= cH) cyi = cH - 1;
          var ci = (cyi * cW + cxi) << 2;
          var al = (cD[ci + 3] * 0.0029) * (0.22 + 0.78 * lit);
          if (al > 0.004) {
            r += (255 - r) * al; g += (255 - g) * al; b += (255 - b) * al;
          }
        }

        /* éjszakai városfények */
        if (nD && lit < 0.985) {
          var ni = (((tv * nH) | 0) * nW + ((tu * nW) | 0)) << 2;
          var nv = nD[ni];
          if (nv > 6) {
            var nl = 1 - lit;
            var ka = (nD[ni + 3] / 255) * nl * 1.05;
            r = r * (1 - nl * 0.85) + nv * ka;
            g = g * (1 - nl * 0.85) + nD[ni + 1] * ka;
            b = b * (1 - nl * 0.80) + nD[ni + 2] * ka;
          } else if (nl > 0.15) {
            r *= 1 - nl * 0.85; g *= 1 - nl * 0.84; b *= 1 - nl * 0.78;
          }
        }

        /* nappali fényerő + peremfelderítés */
        var bright = 0.15 + 0.93 * lit;
        var edge = 1 - Math.abs(cz) * 0.14;
        var o = IX[i] << 2;
        buf[o] = r * bright * edge;
        buf[o + 1] = g * bright * edge;
        buf[o + 2] = b * (bright * 0.99 + 0.02) * edge;
        buf[o + 3] = 255;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(state.img, 0, 0);

      /* atmoszféra / peremfény a korong körül */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var rim = ctx.createRadialGradient(cx, cy, Rz * 0.90, cx, cy, Rz * 1.14);
      rim.addColorStop(0.00, 'rgba(110,168,254,0)');
      rim.addColorStop(0.46, 'rgba(126,190,255,.28)');
      rim.addColorStop(0.72, 'rgba(140,200,255,.12)');
      rim.addColorStop(1.00, 'rgba(110,168,254,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, Rz * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      updateLabels();
      state.dirty = false;
    }

    /* ---- feliratok pozicionálása (a lényeg: CSS-méretre skálázás) ---- */
    function updateLabels() {
      if (!labelHost) return;
      var rect = canvas.getBoundingClientRect();
      var kx = rect.width ? rect.width / state.W : 1;
      var ky = rect.height ? rect.height / state.H : 1;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (!m._el) continue;
        var s = project(m.lat, m.lon);
        m._x = s.x; m._y = s.y; m._z = s.z;
        if (s.z <= 0.03) { m._el.style.opacity = 0; continue; }
        var lx = s.x * kx, ly = s.y * ky;
        if (lx < -30 || ly < -30 || lx > rect.width + 30 || ly > rect.height + 30) {
          m._el.style.opacity = 0;
          continue;
        }
        m._el.style.opacity = (0.34 + s.z * 0.66).toFixed(2);
        m._el.style.left = lx.toFixed(1) + 'px';
        m._el.style.top = ly.toFixed(1) + 'px';
      }
    }

    /* ---------------- interakció ---------------- */
    function localPoint(e) {
      var rect = canvas.getBoundingClientRect();
      var cssX = e.clientX - rect.left, cssY = e.clientY - rect.top;
      return {
        rect: rect, cssX: cssX, cssY: cssY,
        x: rect.width ? cssX * (state.W / rect.width) : 0,
        y: rect.height ? cssY * (state.H / rect.height) : 0
      };
    }
    function hitTest(p) {
      var rect = p.rect;
      var k = rect.width ? state.W / rect.width : 1;
      var lim = 20 * k;
      var best = null;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (m._z == null || m._z <= 0.06) continue;
        var d = Math.sqrt((m._x - p.x) * (m._x - p.x) + (m._y - p.y) * (m._y - p.y));
        if (d < lim && (!best || d < best.d)) best = { m: m, d: d };
      }
      return best ? best.m : null;
    }
    function showTip(m, p) {
      if (!tip) return;
      if (!m) { tip.style.opacity = 0; tip.style.left = '-9999px'; tip.style.top = '-9999px'; return; }
      tip.innerHTML = '<b>' + esc(m.label || '') + '</b><small>' + esc(m.sub || '') + '</small>';
      tip.style.left = p.cssX + 'px';
      tip.style.top = (p.cssY - 12) + 'px';
      tip.style.opacity = 1;
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    var last = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      state.dragging = true; state.moved = false; state.vx = 0; state.vy = 0;
      last = localPoint(e);
      canvas.classList.add('grabbing');
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = localPoint(e);
      if (state.dragging && last) {
        var dx = p.x - last.x, dy = p.y - last.y;
        var Rz = state.R * state.zoom;
        state.yaw += dx / Rz * 1.05;
        state.pitch += dy / Rz * 0.95;
        if (state.pitch > 1.45) state.pitch = 1.45;
        if (state.pitch < -1.45) state.pitch = -1.45;
        state.vx = dx; state.vy = dy;
        if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
        last = p;
        state.dirty = true;
        schedule();
      } else {
        var m = hitTest(p);
        showTip(m, p);
        if (m !== hoverMark) {
          hoverMark = m;
          clearTimeout(hoverTimer);
          if (m && opts.hoverFocus !== false) {
            hoverTimer = setTimeout(function () { if (hoverMark === m) focusOn(m, 1.95); }, 950);
          }
        }
      }
    });
    function release(e) {
      var wasDrag = state.moved;
      state.dragging = false;
      canvas.classList.remove('grabbing');
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      var p = localPoint(e);
      var m = hitTest(p);
      showTip(m, p);
      var Rz = state.R * state.zoom;
      var inDisc = Math.sqrt((p.x - state.cx) * (p.x - state.cx) + (p.y - state.cy) * (p.y - state.cy)) <= Rz;
      if (!wasDrag) {
        if (m) {
          focusOn(m, 2.15);
          if (opts.onPick) opts.onPick(m, p);
        } else {
          if (opts.onOutside) opts.onOutside();
          if (!inDisc && state.zoomT > 1.02) { state.zoomT = 1; state.dirty = true; schedule(); }
          else if (inDisc && state.zoomT > 1.02) { state.zoomT = 1; state.dirty = true; schedule(); }
        }
      }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function () {
      if (!state.dragging) {
        showTip(null);
        hoverMark = null;
        clearTimeout(hoverTimer);
      }
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.zoomT = Math.max(0.92, Math.min(4.5, state.zoomT * (e.deltaY > 0 ? 0.90 : 1.11)));
      state.dirty = true;
      schedule();
    }, { passive: false });
    canvas.addEventListener('dblclick', function () {
      state.zoomT = 1;
      state.pitch = 0.28;
      if (opts.lon != null) state.yaw = -opts.lon * Math.PI / 180;
      state.dirty = true;
      schedule();
    });

    /* ---------------- animációk ---------------- */
    var tw = null;
    function focusOn(m, z) {
      var la = m.lat * Math.PI / 180, lo = m.lon * Math.PI / 180;
      /* a markert középre visszük: a gömböt -lon és +lat irányba forgatjuk */
      var targetYaw = -lo, targetPitch = la;
      if (targetPitch > 0.95) targetPitch = 0.95;
      if (targetPitch < -0.95) targetPitch = -0.95;
      tweenTo(targetYaw, targetPitch, z || 2.1);
    }
    function tweenTo(yawT, pitchT, zoomT) {
      if (O.reduce) {
        state.yaw = yawT; state.pitch = pitchT;
        state.zoom = state.zoomT = zoomT;
        state.dirty = true; paint();
        return;
      }
      var y0 = state.yaw, p0 = state.pitch, z0 = state.zoom;
      var dy = ((yawT - y0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      var dp = pitchT - p0, dz = zoomT - z0;
      var t0 = performance.now(), dur = 820;
      if (tw) cancelAnimationFrame(tw);
      (function step(ts) {
        var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        state.yaw = y0 + dy * e;
        state.pitch = p0 + dp * e;
        state.zoom = state.zoomT = z0 + dz * e;
        state.dirty = true;
        paint();
        if (p < 1) tw = requestAnimationFrame(step);
      })(t0);
    }

    var raf = null, lastT = 0;
    function schedule() { if (!raf && running) raf = requestAnimationFrame(loop); }
    function loop(ts) {
      raf = null;
      if (!running) return;
      var dt = Math.min(52, ts - (lastT || ts));
      lastT = ts;
      if (!state.dragging && Math.abs(state.vx) > 0.25) {
        state.yaw += state.vx / (state.R * state.zoom) * 0.85;
        state.pitch += state.vy / (state.R * state.zoom) * 0.7;
        if (state.pitch > 1.45) state.pitch = 1.45;
        if (state.pitch < -1.45) state.pitch = -1.45;
        state.vx *= 0.88; state.vy *= 0.88;
        state.dirty = true;
      }
      if (Math.abs(state.zoom - state.zoomT) > 0.0015) {
        state.zoom += (state.zoomT - state.zoom) * Math.min(1, dt / 95);
        state.dirty = true;
      }
      if (state.dirty) paint();
      if (state.dragging || Math.abs(state.zoom - state.zoomT) > 0.0015 || Math.abs(state.vx) > 0.4) schedule();
    }

    window.addEventListener('resize', function () { resize(); schedule(); });
    document.addEventListener('orbita:theme', function () { state.dirty = true; schedule(); });

    resize();
    sun = sunDir();
    var sunT = setInterval(function () { sun = sunDir(); state.dirty = true; schedule(); }, 120000);

    /* ---------------- nyilvános API ---------------- */
    return {
      focus: function (m) {
        var t = (typeof m === 'string') ? null : m;
        if (typeof m === 'string') {
          for (var i = 0; i < markers.length; i++) if (markers[i].label === m) { t = markers[i]; break; }
        }
        if (t) focusOn(t, 2.2);
      },
      zoom: function (z) { state.zoomT = z; state.dirty = true; schedule(); },
      reset: function () { state.zoomT = 1; state.dirty = true; schedule(); },
      add: function (m) {
        var o = {};
        for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k] = m[k];
        o.lat = +m.lat; o.lon = +m.lon; o._i = markers.length;
        markers.push(o);
        if (labelHost) {
          var el = document.createElement('div');
          el.className = 'glabel' + (o.kind ? ' ' + o.kind : '');
          el.setAttribute('aria-hidden', 'true');
          labelHost.appendChild(el);
          o._el = el;
        }
        state.dirty = true; schedule();
        return o;
      },
      removeIf: function (fn) {
        var keep = [];
        markers.forEach(function (m) { if (fn(m)) { if (m._el) m._el.remove(); } else keep.push(m); });
        markers.length = 0;
        Array.prototype.push.apply(markers, keep);
        state.dirty = true; schedule();
      },
      markers: markers,
      state: state,
      redraw: function () { state.dirty = true; schedule(); },
      stop: function () { running = false; clearInterval(sunT); if (raf) cancelAnimationFrame(raf); }
    };
  }

  O.Globe = Globe;
})();

/* ORBITA owmap-alt.js - biztonsagi reteg a terkep korul.
   1) potolja a regi metodusneveket (nem hal be a lap, ha egy hivas hianyzik)
   2) a "Vilag" nezet 6 masodpercig ragad, az oldal nem tudja visszahuzni Európára
   3) maximalja a rajzolt gepek szamat, hogy ne akadjon le */
(function () {
  'use strict';
  if (!window.ORBITA || !window.ORBITA.Map) return;
  var Orig = window.ORBITA.Map;
  var EXTRA = ['layer', 'setLayer', 'setTheme', 'theme', 'reset', 'clear', 'zoom', 'center',
               'addMarker', 'setTiles', 'tiles', 'render', 'update', 'show', 'hide',
               'setCenter', 'setZoom', 'invalidate', 'panTo', 'flyTo', 'toggle', 'bind', 'on', 'off'];
  var MAXP = 900;
  var noop = function () { return this; };
  var last = null;

  window.ORBITA.Map = function (el, opts) {
    var m = Orig(el, opts);
    var lock = 0;

    var origFit = m.fit, origWorld = m.world, origPoints = m.setPoints, origFocus = m.focus;

    if (origFit) m.fit = function () { if (Date.now() < lock) return m; return origFit.apply(m, arguments); };
    if (origFocus) m.focus = function () { return origFocus.apply(m, arguments); };
    if (origPoints) m.setPoints = function (list, doFit) {
      if (list && list.length > MAXP) list = list.slice(0, MAXP);
      return origPoints.call(m, list, doFit && Date.now() >= lock);
    };
    if (origWorld) m.world = function () {
      lock = Date.now() + 6000;
      try {
        m.view.lat = 18; m.view.lon = 8;
        m.view.zoom = Math.max(0.6, Math.log2(Math.max(320, el.clientWidth || 800) / 256) - 0.02);
        if (m.refresh) m.refresh();
      } catch (e) {}
      origWorld.apply(m, arguments);
      return m;
    };
    EXTRA.forEach(function (k) { if (typeof m[k] !== 'function') m[k] = noop; });

    last = m;
    if (window.Proxy) {
      return new Proxy(m, {
        get: function (t, k) {
          if (k in t) return t[k];
          if (typeof k !== 'string' || /^(then|catch|toJSON|constructor)$/.test(k)) return undefined;
          return noop;
        },
        set: function (t, k, v) { t[k] = v; return true; }
      });
    }
    return m;
  };

  function forceWorld() {
    if (!last || !last.world) return;
    last.world();
    setTimeout(function () { if (last && last.world) last.world(); }, 700);
    setTimeout(function () { if (last && last.world) last.world(); }, 2600);
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target, d = 0;
    while (t && t !== document.body && d++ < 5) {
      if (t.tagName === 'SELECT' || t.tagName === 'INPUT') {
        var v = String(t.value || '') + ' ' + String(t.getAttribute('aria-label') || '');
        if (/world|vil[a\u00e1]g/i.test(v)) return forceWorld();
      }
      var txt = String(t.textContent || '').trim();
      if (txt && txt.length < 30 && /vil[a\u00e1]g/i.test(txt)) return forceWorld();
      t = t.parentElement;
    }
  }, true);
  window.ORBITA.world = forceWorld;
})();

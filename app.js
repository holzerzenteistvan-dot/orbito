/* ============ ORBITA - közös viselkedés ============ */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var O = window.ORBITA = window.ORBITA || {};

  O.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (O.reduce) document.documentElement.classList.add('reduce');

  /* ---------- téma ---------- */
  O.theme = function () { return document.documentElement.getAttribute('data-theme') || 'dark'; };
  O.setTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('orbita-theme', t); } catch (e) {}
    document.dispatchEvent(new CustomEvent('orbita:theme', { detail: t }));
  };
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      O.setTheme(O.theme() === 'light' ? 'dark' : 'light');
      O.toast(O.theme() === 'light' ? 'Világos, letisztult téma' : 'Sötét, elegáns téma');
    });
  });

  /* ---------- mobil menü ---------- */
  var burger = $('.burger'), drawer = $('#drawer');
  if (burger && drawer) {
    burger.addEventListener('click', function () {
      var open = drawer.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('no-scroll', open);
    });
    $$('#drawer a').forEach(function (a) {
      a.addEventListener('click', function () {
        drawer.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('no-scroll');
      });
    });
  }

  $$('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });

  /* ---------- scroll: nav, folyamatjelző, parallax ---------- */
  var nav = $('.nav'), pbar = $('.progress > i'), par = $$('[data-par]'), tick = false;
  function frame() {
    tick = false;
    if (nav) nav.classList.toggle('solid', window.scrollY > 40);
    if (pbar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      pbar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')';
    }
    if (!O.reduce) {
      for (var i = 0; i < par.length; i++) {
        var el = par[i], r = el.getBoundingClientRect();
        if (r.bottom < -240 || r.top > window.innerHeight + 240) continue;
        var mid = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.transform = 'translate3d(0,' + (-mid * parseFloat(el.dataset.par || '0.08')).toFixed(2) + 'px,0)';
      }
    }
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();

  /* ---------- beúszás ---------- */
  var rev = $$('.rv');
  if (O.reduce || !('IntersectionObserver' in window)) {
    rev.forEach(function (e) { e.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rev.forEach(function (e) { io.observe(e); });
  }
  $$('[data-stagger]').forEach(function (p) {
    $$('.rv', p).forEach(function (e, i) { e.style.transitionDelay = (Math.min(i, 9) * 80) + 'ms'; });
  });

  /* ---------- számlálók ---------- */
  function runCounter(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count) || 0;
    var suffix = el.dataset.suffix || '', dec = parseInt(el.dataset.dec || '0', 10);
    if (O.reduce) { el.textContent = target.toFixed(dec) + suffix; return; }
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 1500), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { runCounter(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.35 });
    counters.forEach(function (e) { cio.observe(e); });
  } else { counters.forEach(runCounter); }

  /* ---------- húzható galéria ---------- */
  $$('.hgal').forEach(function (g) {
    var down = false, sx = 0, sl = 0, moved = false, pid = null;
    g.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      down = true; moved = false; sx = e.clientX; sl = g.scrollLeft; pid = e.pointerId;
      g.classList.add('drag');
    });
    g.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      g.scrollLeft = sl - dx;
    });
    function up() { down = false; g.classList.remove('drag'); pid = null; }
    g.addEventListener('pointerup', up);
    g.addEventListener('pointerleave', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  });

  /* ---------- csillagmező ---------- */
  O.stars = function (host, n) {
    if (!host) return;
    n = n || 130;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = document.createElement('i');
      var sz = (Math.random() * 1.7 + 0.7).toFixed(2);
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top = (Math.random() * 100).toFixed(2) + '%';
      s.style.width = sz + 'px';
      s.style.height = sz + 'px';
      s.style.opacity = (Math.random() * 0.6 + 0.25).toFixed(2);
      if (!O.reduce) s.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
      else s.style.animation = 'none';
      frag.appendChild(s);
    }
    host.appendChild(frag);
  };
  $$('[data-stars]').forEach(function (h) { O.stars(h, parseInt(h.dataset.stars, 10) || 120); });

  /* ---------- toast ---------- */
  var toastEl = null, toastT = null;
  O.toast = function (msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'toast ' + (kind || '');
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  };

  /* ---------- Leaflet csempe lánc ---------- */
  O.tiles = function (map) {
    if (!window.L) return { reload: function () {} };
    var chains = function () {
      var light = O.theme() === 'light';
      return [
        { u: 'https://{s}.basemaps.cartocdn.com/' + (light ? 'light_all' : 'dark_all') + '/{z}/{x}/{y}{r}.png',
          o: { subdomains: 'abcd', maxZoom: 20, attribution: '&copy; OpenStreetMap, &copy; CARTO' } },
        { u: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          o: { maxZoom: 19, attribution: '&copy; OpenStreetMap közreműködők' } },
        { u: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          o: { subdomains: 'abc', maxZoom: 17, attribution: '&copy; OpenTopoMap' } }
      ];
    };
    var i = 0, errs = 0, layer = null, list = chains();
    function add() {
      errs = 0;
      layer = L.tileLayer(list[i].u, Object.assign({ crossOrigin: true }, list[i].o));
      layer.on('tileerror', function () {
        errs++;
        if (errs >= 5 && i < list.length - 1) { i++; map.removeLayer(layer); add(); }
      });
      layer.addTo(map);
    }
    add();
    return {
      reload: function () {
        if (layer) map.removeLayer(layer);
        i = 0; list = chains(); add();
      }
    };
  };

  /* ---------- űrlap (opcionális) ---------- */
  O.form = function (form, opts) {
    opts = opts || {};
    form.dataset.t0 = Date.now();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', form).forEach(function (f) {
        var bad = !String(f.value).trim() ||
          (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.value));
        var box = f.closest('.field');
        if (box) box.classList.toggle('bad', bad);
        if (bad && ok) { f.focus(); ok = false; }
      });
      if (!ok) { O.toast('Kérlek töltsd ki helyesen a mezőket.', 'bad'); return; }
      var trap = form.querySelector('[name="_trap"]');
      if (trap && trap.value) { O.toast('Elküldve.', 'ok'); form.reset(); return; }
      if (Date.now() - (+form.dataset.t0) < 2500) { O.toast('Kérlek várj egy pillanatot.', 'bad'); return; }
      var btn = form.querySelector('[type="submit"]');
      var end = (opts.endpoint || form.getAttribute('action') || '').trim();
      if (!end || end.indexOf('FORMSPREE') > -1 || end.indexOf('KITOLTENDO') > -1) {
        O.toast('Az űrlap még nincs bekötve - ide kell a Formspree azonosító.', 'bad');
        return;
      }
      if (btn) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.innerHTML = '<span class="load"></span> Küldés...'; }
      fetch(end, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
        .then(function () { O.toast('Köszönjük, megkaptuk!', 'ok'); form.reset(); })
        .catch(function () { O.toast('Nem sikerült elküldeni. Próbáld újra később.', 'bad'); })
        .then(function () {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.old || 'Küldés'; }
        });
    });
  };
  $$('form[data-validate]').forEach(function (f) { O.form(f); });

  /* ---------- süti sáv ---------- */
  var CK = 'orbita-consent';
  function readCK() { try { return JSON.parse(localStorage.getItem(CK)); } catch (e) { return null; } }
  function applyCK(v) {
    if (!v || !v.analytics) return;
    if (document.getElementById('orbita-analytics')) return;
    var id = window.ORBITA_ANALYTICS_ID;
    if (!id) return;                                 /* nincs beállított mérőkód -> nincs mérés */
    var s = document.createElement('script');
    s.id = 'orbita-analytics'; s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', id, { anonymize_ip: true });
  }
  function saveCK(v) { try { localStorage.setItem(CK, JSON.stringify(v)); } catch (e) {} applyCK(v); }
  O.consent = readCK;
  O.openConsent = function () { build(true); };

  var cookieEl = null;
  function build(force) {
    if (readCK() && !force) { applyCK(readCK()); return; }
    if (cookieEl) cookieEl.remove();
    var el = document.createElement('div');
    cookieEl = el;
    el.className = 'cookie';
    el.id = 'cookie';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Sütikezelési beállítások');
    el.innerHTML =
      '<div class="cktext"><h4>Csak azt mérjük, amit engedsz</h4>' +
      '<p style="margin:0">A működéshez szükséges tárolók mindig aktívak. Statisztikát csak hozzájárulás után töltünk be. ' +
      'Részletek: <a href="adatvedelem.html" style="color:var(--gold)">Adatvédelmi tájékoztató</a>.</p></div>' +
      '<div class="cookie-do">' +
      '<button class="btn btn-p" data-act="all" type="button">Elfogadom</button>' +
      '<button class="btn" data-act="none" type="button">Elutasítom</button>' +
      '<button class="btn btn-s" data-act="pref" type="button" aria-expanded="false">Beállítások</button>' +
      '</div>' +
      '<div class="ck-pref">' +
      '<div class="ck-row"><input type="checkbox" checked disabled id="ck-nec">' +
      '<div><label for="ck-nec">Szükséges</label><small>Téma, süti-választás, csomaglista. Ezek nélkül nem működik.</small></div></div>' +
      '<div class="ck-row"><input type="checkbox" id="ck-ana">' +
      '<div><label for="ck-ana">Statisztika</label><small>Névtelen látogatottságmérés. Alapból kikapcsolva, és csak akkor indul, ha van beállított mérőkód.</small></div></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });

    var lastFocus = document.activeElement;
    setTimeout(function () { var b = el.querySelector('[data-act="all"]'); if (b && !force) b.focus(); }, 420);

    function close() {
      el.classList.remove('show');
      setTimeout(function () {
        el.remove();
        if (cookieEl === el) cookieEl = null;
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }, 620);
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'all') { saveCK({ analytics: true, t: Date.now() }); close(); O.toast('Elfogadva', 'ok'); return; }
      if (act === 'none') { saveCK({ analytics: false, t: Date.now() }); close(); O.toast('Elutasítva - nincs mérés'); return; }
      var p = el.querySelector('.ck-pref');
      var open = p.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !p.querySelector('[data-save]')) {
        var save = document.createElement('button');
        save.type = 'button';
        save.className = 'btn btn-p btn-s mt1';
        save.dataset.save = '1';
        save.textContent = 'Kiválasztottak mentése';
        save.addEventListener('click', function () {
          saveCK({ analytics: el.querySelector('#ck-ana').checked, t: Date.now() });
          close();
          O.toast('Beállítások mentve', 'ok');
        });
        p.appendChild(save);
      }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
  if (document.documentElement.dataset.noconsent !== '1') setTimeout(function () { build(false); }, 1000);
  $$('[data-open-consent]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); build(true); });
  });
})();

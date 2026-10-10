/* ============ ORBITA – közös viselkedés (v17) ============
   Külső könyvtár nélkül: IntersectionObserver + requestAnimationFrame.
   Ha a látogató csökkentett mozgást kér (prefers-reduced-motion), minden animáció kikapcsol. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var O = window.ORBITA = window.ORBITA || {};
  var CFG = O.cfg = window.ORBITA_CONFIG || {};
  var html = document.documentElement;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  O.esc = esc;
  O.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };

  /* ---------- csökkentett mozgás ---------- */
  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  O.reduce = !!(mq && mq.matches);
  function syncReduce() { O.reduce = !!(mq && mq.matches); html.classList.toggle('reduce', O.reduce); }
  syncReduce();
  if (mq && mq.addEventListener) mq.addEventListener('change', syncReduce);

  /* ---------- téma ---------- */
  O.theme = function () { return html.getAttribute('data-theme') || 'dark'; };
  function themeColor() {
    var m = $('meta[name="theme-color"]');
    if (m) m.setAttribute('content', O.theme() === 'light' ? '#f5f3ee' : '#04060c');
  }
  O.setTheme = function (t) {
    html.setAttribute('data-theme', t);
    try { localStorage.setItem('orbita-theme', t); } catch (e) {}
    themeColor();
    document.dispatchEvent(new CustomEvent('orbita:theme', { detail: t }));
  };
  themeColor();
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      O.setTheme(O.theme() === 'light' ? 'dark' : 'light');
      O.toast(O.theme() === 'light' ? 'Világos, letisztult téma' : 'Sötét, elegáns téma');
    });
  });

  /* ---------- aktuális oldal a menüben ---------- */
  (function () {
    var cur = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
    $$('.nav-links a, .drawer a, .fly-nav a').forEach(function (a) {
      var h = (a.getAttribute('href') || '').split('#')[0].split('?')[0].replace(/\.html$/, '');
      if (h && h === cur) { a.setAttribute('aria-current', 'page'); a.classList.add('on'); }
    });
  })();

  /* ---------- mobil menü (hozzáférhető) ---------- */
  var burger = $('.burger'), drawer = $('#drawer'), scrim = null, lastFocus = null;
  function setDrawer(open) {
    if (!drawer || !burger) return;
    drawer.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Menü bezárása' : 'Menü megnyitása');
    document.body.classList.toggle('no-scroll', open);
    if (scrim) scrim.classList.toggle('on', open);
    if (open) {
      lastFocus = document.activeElement;
      var f = drawer.querySelector('a');
      if (f) setTimeout(function () { f.focus(); }, 60);
    } else if (lastFocus && lastFocus.focus) {
      lastFocus.focus(); lastFocus = null;
    }
  }
  if (burger && drawer) {
    burger.setAttribute('aria-controls', 'drawer');
    drawer.setAttribute('aria-label', 'Menü');
    if (!drawer.querySelector('.drawer-close')) {
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button'; closeBtn.className = 'drawer-close';
      closeBtn.setAttribute('aria-label', 'Menü bezárása'); closeBtn.textContent = '×';
      closeBtn.addEventListener('click', function () { setDrawer(false); });
      drawer.insertBefore(closeBtn, drawer.firstChild);
    }
    scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function () { setDrawer(false); });
    burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('open')); });
    $$('a', drawer).forEach(function (a) { a.addEventListener('click', function () { setDrawer(false); }); });
    document.addEventListener('keydown', function (e) {
      if (!drawer.classList.contains('open')) return;
      if (e.key === 'Escape') { setDrawer(false); return; }
      if (e.key === 'Tab') {                       /* a fókusz a menün belül marad */
        var items = [burger].concat($$('a', drawer));
        var i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 900 && drawer.classList.contains('open')) setDrawer(false); });
  }

  $$('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });

  /* ---------- szavankénti címsor-beúszás ---------- */
  function split(el) {
    var n = 0, frag = document.createDocumentFragment();
    function wrap(node) {
      var s = document.createElement('span'), i = document.createElement('span');
      s.className = 'w'; i.style.setProperty('--i', n++);
      i.appendChild(node); s.appendChild(i);
      return s;
    }
    Array.prototype.slice.call(el.childNodes).forEach(function (k) {
      if (k.nodeType === 3) {
        k.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
          else frag.appendChild(wrap(document.createTextNode(part)));
        });
      } else if (k.nodeName === 'BR') { frag.appendChild(k); }
      else { frag.appendChild(wrap(k)); }
    });
    el.textContent = '';
    el.appendChild(frag);
    el.classList.add('split');
  }
  if (!O.reduce) $$('[data-split]').forEach(split);

  /* ---------- görgetés: menü, folyamatjelző, parallax, vízszintes galéria ---------- */
  var nav = $('.nav'), pbar = $('.progress > i'), par = $$('[data-par]'), hs = $$('.hscroll'), tick = false;

  function hsMeasure() {
    hs.forEach(function (s) {
      var pin = $('.hscroll-pin', s), tr = $('.hscroll-track', s);
      if (!pin || !tr) return;
      s.style.height = '';
      s._native = getComputedStyle(pin).position !== 'sticky';
      tr.style.transform = '';
      if (s._native) return;
      s._dist = Math.max(0, tr.scrollWidth - pin.clientWidth + 2);
      s.style.height = (pin.offsetHeight + s._dist) + 'px';
    });
  }
  function frame() {
    tick = false;
    var y = window.scrollY || window.pageYOffset || 0;
    if (nav) nav.classList.toggle('solid', y > 40);
    if (pbar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      pbar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0).toFixed(4) + ')';
    }
    if (O.reduce) return;
    for (var i = 0; i < par.length; i++) {
      var el = par[i], r = el.getBoundingClientRect();
      if (r.bottom < -260 || r.top > window.innerHeight + 260) continue;
      var mid = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = 'translate3d(0,' + (-mid * parseFloat(el.dataset.par || '0.08')).toFixed(2) + 'px,0)';
    }
    for (var j = 0; j < hs.length; j++) {
      var s = hs[j];
      if (s._native) continue;
      var pin = $('.hscroll-pin', s), tr = $('.hscroll-track', s), bar = $('.hscroll-bar i', s);
      var rr = s.getBoundingClientRect(), span = rr.height - pin.offsetHeight;
      var p = span > 0 ? Math.max(0, Math.min(1, -rr.top / span)) : 0;
      tr.style.transform = 'translate3d(' + (-p * (s._dist || 0)).toFixed(1) + 'px,0,0)';
      if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { hsMeasure(); onScroll(); });
  window.addEventListener('load', function () { hsMeasure(); onScroll(); });
  hsMeasure();
  frame();

  /* ---------- beúszás ---------- */
  var rev = $$('.rv, .split');
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

  /* ---------- felpörgő számok ---------- */
  function fmtNum(v, dec) {
    var s = v.toFixed(dec), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return parts.join(',');
  }
  function runCounter(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count) || 0;
    var suffix = el.dataset.suffix || '', dec = parseInt(el.dataset.dec || '0', 10);
    if (O.reduce) { el.textContent = fmtNum(target, dec) + suffix; return; }
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 1600), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(target * e, dec) + suffix;
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

  /* ---------- húzható galéria (egérrel; ujjal natívan görgethető) ---------- */
  $$('.hgal').forEach(function (g) {
    var down = false, sx = 0, sl = 0, moved = false;
    g.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      down = true; moved = false; sx = e.clientX; sl = g.scrollLeft;
      g.classList.add('drag');
    });
    g.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      g.scrollLeft = sl - dx;
    });
    function up() { down = false; g.classList.remove('drag'); }
    g.addEventListener('pointerup', up);
    g.addEventListener('pointerleave', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  });

  /* ---------- kattintható, billentyűzettel is kezelhető galéria-nagyító ---------- */
  (function () {
    var images = $$('.hgal img');
    if (!images.length) return;
    var lb = document.createElement('div');
    lb.className = 'lightbox'; lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Kép nagyítása');
    lb.innerHTML = '<button type="button" class="lb-x" aria-label="Nagyító bezárása">×</button><button type="button" class="lb-prev" aria-label="Előző kép">‹</button><figure style="margin:0;max-width:100%;text-align:center"><img alt=""><figcaption class="lb-caption"></figcaption></figure><button type="button" class="lb-next" aria-label="Következő kép">›</button>';
    document.body.appendChild(lb);
    var pic = $('img', lb), cap = $('.lb-caption', lb), close = $('.lb-x', lb), prev = $('.lb-prev', lb), next = $('.lb-next', lb), current = 0, oldFocus = null;
    function show(i) {
      current = (i + images.length) % images.length;
      var image = images[current], fig = image.closest('figure');
      pic.src = image.currentSrc || image.src; pic.alt = image.alt || '';
      cap.textContent = (fig && $('figcaption', fig) ? $('figcaption', fig).textContent : image.alt) + ' · ' + (current + 1) + '/' + images.length;
    }
    function open(i) { oldFocus = document.activeElement; show(i); lb.classList.add('open'); document.body.classList.add('no-scroll'); close.focus(); }
    function shut() { lb.classList.remove('open'); document.body.classList.remove('no-scroll'); pic.removeAttribute('src'); if (oldFocus && oldFocus.focus) oldFocus.focus(); }
    images.forEach(function (im, i) {
      im.setAttribute('tabindex', '0'); im.setAttribute('role', 'button');
      im.setAttribute('aria-label', (im.alt || 'Kép') + ' – nagyítás');
      im.addEventListener('click', function () { open(i); });
      im.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    });
    close.addEventListener('click', shut);
    prev.addEventListener('click', function () { show(current - 1); });
    next.addEventListener('click', function () { show(current + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) shut(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') shut();
      else if (e.key === 'ArrowRight') show(current + 1);
      else if (e.key === 'ArrowLeft') show(current - 1);
    });
  })();

  /* ---------- kártyák fényfoltja az egér alatt ---------- */
  if (window.matchMedia && matchMedia('(hover:hover)').matches) {
    document.addEventListener('pointermove', function (e) {
      if (O.reduce) return;
      var c = e.target.closest ? e.target.closest('.spot') : null;
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------- hiányzó kép: elegáns tartalék a véletlen kép helyett ---------- */
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG') {
      var f = t.closest ? t.closest('figure, .imgsh') : null;
      if (f) f.classList.add('noimg');
      t.style.visibility = 'hidden';
    }
  }, true);

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

  /* ---------- értesítés ---------- */
  var toastEl = null, toastT = null;
  O.toast = function (msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'toast ' + (kind || '');
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  };

  /* ---------- helykeresés: Photon (keresés gépelés közben) + Nominatim tartalék ---------- */
  var gcache = {};
  var TYPE_HU = { city: 'város', town: 'kisváros', village: 'falu', locality: 'település', district: 'városrész',
    county: 'megye', state: 'tartomány', country: 'ország', street: 'utca', house: 'cím', hamlet: 'település',
    municipality: 'község', suburb: 'városrész', other: '' };
  function uniq(a) { var seen = {}; return a.filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }); }
  function valid(r) { return r && isFinite(r.lat) && isFinite(r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180; }
  function isAbort(e) { return e && e.name === 'AbortError'; }

  function photon(q, signal) {
    return fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q), { signal: signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.features) return null;
        return j.features.map(function (f) {
          var p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
          var street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
          var name = p.name || street || p.city || p.state || p.country || '';
          var parts = uniq([street !== name ? street : '', p.district, p.city !== name ? p.city : '', p.state !== name ? p.state : '', p.country !== name ? p.country : '']);
          return { name: name, detail: parts.join(', '), label: [name].concat(parts.slice(0, 2)).join(', '),
                   country: p.country || '', type: TYPE_HU[p.type] || '', lat: +c[1], lon: +c[0] };
        }).filter(function (x) { return x.name && valid(x); });
      })
      .catch(function (e) { if (isAbort(e)) throw e; return null; });
  }
  function nominatim(q, signal) {
    return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=hu&q=' + encodeURIComponent(q),
      { signal: signal, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        return rows.map(function (r) {
          var a = r.address || {};
          var kind = a.city ? 'város' : a.town ? 'kisváros' : a.village ? 'falu' : a.hamlet ? 'település' : a.municipality ? 'község' : a.county ? 'megye' : '';
          var name = r.name || String(r.display_name || '').split(',')[0];
          var tail = String(r.display_name || '').split(',').slice(1, 3).join(',').trim() || a.country || '';
          return { name: name, detail: tail, label: String(r.display_name || '').split(',').slice(0, 3).join(',').trim(),
                   country: a.country || '', type: kind, lat: +r.lat, lon: +r.lon };
        }).filter(valid);
      })
      .catch(function (e) { if (isAbort(e)) throw e; return []; });
  }
  O.geocode = function (q, signal) {
    var key = String(q).toLowerCase().trim();
    if (gcache[key]) return Promise.resolve(gcache[key]);
    return photon(q, signal)
      .then(function (r) { return (r && r.length) ? r : nominatim(q, signal); })
      .then(function (r) { r = r || []; if (r.length) gcache[key] = r; return r; });
  };

  /* ---------- űrlap: ellenőrzés, visszajelzés, spamvédelem (Formspree) ---------- */
  O.form = function (form) {
    var status = $('[data-status]', form), okBox = $('[data-success]', form.parentNode);
    var t0 = Date.now(), lastSent = 0;
    form.noValidate = true;

    function fieldBox(f) { return f.closest('.field') || f.closest('.check'); }
    function check(f) {
      var isCb = f.type === 'checkbox', v = isCb ? f.checked : String(f.value).trim(), msg = '';
      if (f.required && !v) msg = f.dataset.msg || (isCb ? 'A továbblépéshez ezt el kell fogadnod.' : 'Ez a mező kötelező.');
      else if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) msg = 'Adj meg érvényes e-mail-címet.';
      else if (!isCb && f.minLength > 0 && v && v.length < f.minLength) msg = 'Legalább ' + f.minLength + ' karakter szükséges.';
      var box = fieldBox(f);
      if (box) {
        box.classList.toggle('bad', !!msg);
        var er = $('.err', box);
        if (er && msg) er.textContent = msg;
      }
      f.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }
    function say(text, kind) {
      if (!status) return;
      status.className = 'form-status ' + (kind || '');
      status.textContent = text;
    }
    $$('input, select, textarea', form).forEach(function (f) {
      f.addEventListener('blur', function () { if (f.type !== 'hidden' && f.name !== '_gotcha') check(f); });
      f.addEventListener('input', function () { var b = fieldBox(f); if (b && b.classList.contains('bad')) check(f); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      $$('[required], [type="email"], [minlength]', form).forEach(function (f) { if (!check(f) && !first) first = f; });
      if (first) { first.focus(); say('Kérlek, javítsd a pirossal jelölt mezőket.', 'bad'); return; }

      var trap = form.querySelector('[name="_gotcha"]');
      if (trap && trap.value) { say('Köszönjük, megkaptuk!', 'ok'); form.reset(); return; }   /* robot: úgy teszünk, mintha sikerült volna */
      if (Date.now() - t0 < 3000) { say('Túl gyors küldés – kérlek, várj egy pillanatot, és próbáld újra.', 'bad'); return; }
      if (Date.now() - lastSent < 30000) { say('Az előző üzenet most ment el. Kérlek, várj fél percet.', 'bad'); return; }

      var end = String(form.dataset.endpoint || CFG.formspreeUrl || (CFG.formspreeId ? 'https://formspree.io/f/' + String(CFG.formspreeId).trim() : '') || '').trim();
      if (!end || /KITOLTENDO|FORMSPREE|^https:\/\/formspree\.io\/f\/?$/i.test(end)) {
        say('Az űrlap még nincs bekötve: az üzemeltetőnek meg kell adnia a Formspree-címet a config.js fájlban.' +
            (CFG.contactEmail ? ' Addig írj ide: ' + CFG.contactEmail : ''), 'bad');
        return;
      }
      var btn = $('[type="submit"]', form), old = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="load"></span> Küldés…'; }
      say('Küldés folyamatban…', '');
      fetch(end, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok) return j;
            var m = j && j.errors && j.errors[0] && j.errors[0].message;
            throw new Error(m || 'http');
          });
        })
        .then(function () {
          lastSent = Date.now();
          form.reset();
          if (okBox) { okBox.hidden = false; form.hidden = true; okBox.setAttribute('tabindex', '-1'); okBox.focus(); }
          else say('Köszönjük, megkaptuk! Hamarosan válaszolunk.', 'ok');
          O.toast('Köszönjük, megkaptuk!', 'ok');
        })
        .catch(function (err) {
          say('Nem sikerült elküldeni' + (err && err.message && err.message !== 'http' ? ' (' + err.message + ')' : '') + '. Próbáld újra később.', 'bad');
        })
        .then(function () { if (btn) { btn.disabled = false; btn.textContent = old || 'Küldés'; } });
    });
  };
  $$('form[data-validate]').forEach(function (f) { O.form(f); });

  /* ---------- élő adatsáv: UTC-idő, napsütötte pont, ISS ---------- */
  O.sunPoint = function (d) {
    d = d || new Date();
    var n = d.getTime() / 86400000 + 2440587.5 - 2451545.0, R = Math.PI / 180;
    var L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * R;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, eps = (23.439 - 0.0000004 * n) * R;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var lon = ra / R - gmst * 15;
    return { lat: dec / R, lon: ((lon + 180) % 360 + 360) % 360 - 180 };
  };
  function fLat(v) { return Math.abs(v).toFixed(1).replace('.', ',') + '° ' + (v >= 0 ? 'É' : 'D'); }
  function fLon(v) { return Math.abs(v).toFixed(1).replace('.', ',') + '° ' + (v >= 0 ? 'K' : 'Ny'); }
  O.fmtLat = fLat; O.fmtLon = fLon;
  (function () {
    var utc = $('[data-live="utc"]'), sun = $('[data-live="sun"]'), iss = $('[data-live="iss"]');
    if (!utc && !sun && !iss) return;
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function clock() {
      var d = new Date();
      if (utc) utc.textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
      if (sun) { var s = O.sunPoint(d); sun.textContent = fLat(s.lat) + ' · ' + fLon(s.lon); }
    }
    clock();
    setInterval(function () { if (!document.hidden) clock(); }, 1000);
    if (!iss) return;
    var fails = 0, box = iss.closest('[data-live-box]');
    function poll() {
      if (document.hidden) return;
      fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (j) {
          if (j.latitude == null) return Promise.reject();
          fails = 0;
          iss.textContent = fLat(+j.latitude) + ' · ' + fLon(+j.longitude) + ' · ' + Math.round(+j.altitude) + ' km';
          if (box) box.hidden = false;
        })
        .catch(function () { if (++fails >= 2 && box) box.hidden = true; });
    }
    poll();
    setInterval(poll, 20000);
  })();

  /* ---------- süti-sáv: mérés csak hozzájárulás után ---------- */
  /* ---------- kapcsolat gomb: ne maradjon látszólag kattintható, üres mailto ---------- */
  $$('[data-contact-email]').forEach(function (a) {
    var email = String(CFG.contactEmail || '').trim();
    var hint = document.getElementById('contactHint');
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      a.href = 'mailto:' + email;
      a.removeAttribute('aria-disabled');
      a.removeAttribute('title');
      if (hint) hint.textContent = 'Az e-mail gomb az alapértelmezett levelezőalkalmazásodat nyitja meg.';
    } else {
      a.href = '#email-missing';
      a.removeAttribute('aria-disabled');
      a.title = 'A kapcsolat e-mail nincs beállítva – kattintás után útmutatót kapsz.';
      if (hint) hint.textContent = 'A kapcsolatfelvételi e-mail még nincs beállítva. Add meg a contactEmail értékét a projekt gyökérkönyvtárában lévő site.json fájlban, majd futtasd újra a buildet.';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        O.toast('A kapcsolat e-mail címe még nincs beállítva a site.json fájlban.', 'bad');
      });
    }
  });

  var CK = 'orbita-consent';
  function readCK() { try { return JSON.parse(localStorage.getItem(CK)); } catch (e) { return null; } }
  function applyCK(v) {
    if (!v || !v.analytics) return;
    if (document.getElementById('orbita-analytics')) return;
    var id = String(window.ORBITA_ANALYTICS_ID || CFG.analyticsId || '').trim();
    if (!id) return;                                  /* nincs beállított mérőkód → nincs mérés */
    var s = document.createElement('script');
    s.id = 'orbita-analytics'; s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  }
  function saveCK(v) { try { localStorage.setItem(CK, JSON.stringify(v)); } catch (e) {} applyCK(v); }
  O.consent = readCK;
  O.openConsent = function () { build(true); };

  var cookieEl = null;
  function build(force) {
    if (readCK() && !force) { applyCK(readCK()); return; }
    if (cookieEl) cookieEl.remove();
    var cur = readCK();
    var el = document.createElement('div');
    cookieEl = el;
    el.className = 'cookie';
    el.id = 'cookie';
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Sütikezelési beállítások');
    el.innerHTML =
      '<div class="cktext"><h4>Csak azt mérjük, amit engedsz</h4>' +
      '<p style="margin:0">A működéshez szükséges tárolók (téma, süti-választás) mindig aktívak. Névtelen látogatottság-statisztikát csak a hozzájárulásoddal töltünk be. ' +
      'Részletek: <a href="adatvedelem.html" style="color:var(--gold);text-decoration:underline">Adatvédelmi tájékoztató</a>.</p></div>' +
      '<div class="cookie-do">' +
      '<button class="btn" data-act="none" type="button">Elutasítom</button>' +
      '<button class="btn" data-act="all" type="button">Elfogadom</button>' +
      '<button class="btn btn-s btn-ghost" data-act="pref" type="button" aria-expanded="false">Beállítások</button>' +
      '</div>' +
      '<div class="ck-pref">' +
      '<div class="ck-row"><input type="checkbox" checked disabled id="ck-nec">' +
      '<div><label for="ck-nec">Szükséges</label><small>Téma és süti-választás. Ezek nélkül nem működik az oldal.</small></div></div>' +
      '<div class="ck-row"><input type="checkbox" id="ck-ana"' + (cur && cur.analytics ? ' checked' : '') + '>' +
      '<div><label for="ck-ana">Statisztika</label><small>Névtelen látogatottságmérés. Alapból kikapcsolva, és csak akkor indul, ha az üzemeltető beállított mérőkódot.</small></div></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var lastF = document.activeElement;
    if (!force) setTimeout(function () { el.focus({ preventScroll: true }); }, 700);

    function close() {
      el.classList.remove('show');
      setTimeout(function () {
        el.remove();
        if (cookieEl === el) cookieEl = null;
        if (force && lastF && lastF.focus) lastF.focus();
      }, 620);
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'all') { saveCK({ analytics: true, t: Date.now() }); close(); O.toast('Beállítás mentve: statisztika engedélyezve', 'ok'); return; }
      if (act === 'none') { saveCK({ analytics: false, t: Date.now() }); close(); O.toast('Beállítás mentve: nincs mérés'); return; }
      var p = el.querySelector('.ck-pref');
      var open = p.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !p.querySelector('[data-save]')) {
        var save = document.createElement('button');
        save.type = 'button';
        save.className = 'btn btn-s mt1';
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
  if (html.dataset.noconsent !== '1') setTimeout(function () { build(false); }, 900);
  $$('[data-open-consent]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); build(true); });
  });
})();

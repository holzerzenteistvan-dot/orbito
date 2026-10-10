/* ORBITA v17: helyi API-proxy. Ha statikus tárhelyen fut, visszaesik a közvetlen kérésre. */
(function () {
  'use strict';
  var originalFetch = window.fetch.bind(window);
  var HOSTS = /^https:\/\/(?:api\.adsbdb\.com|hexdb\.io|tile\.openstreetmap\.org|[abc]\.basemaps\.cartocdn\.com|server\.arcgisonline\.com|celestrak\.org|api\.wheretheiss\.at|db\.satnogs\.org|api\.adsb\.lol|api\.airplanes\.live|opensky-network\.org|nominatim\.openstreetmap\.org|photon\.komoot\.io|router\.project-osrm\.org|routing\.openstreetmap\.de|hu\.wikipedia\.org|en\.wikipedia\.org|commons\.wikimedia\.org|api\.open-meteo\.com|restcountries\.com)\//i;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (!url || !HOSTS.test(url) || location.protocol === 'file:') return originalFetch(input, init);
    return originalFetch('/api/proxy?url=' + encodeURIComponent(url), init).then(function (r) {
      if (r && r.headers && r.headers.get('X-Orbita-Proxy')) return r;
      return originalFetch(input, init);
    }).catch(function () { return originalFetch(input, init); });
  };
  if (location.protocol === 'file:') {
    var banner = document.createElement('div');
    banner.className = 'orbita-file-warning';
    banner.innerHTML = '<strong>Az ORBITA helyi szerverrel működik a legjobban.</strong> A fájlból megnyitott oldalnál a böngésző korlátozhatja az élő adatokat. Futtasd a projekt mappájában: <code>python3 build.py</code>, majd <code>python3 serve.py</code>, és nyisd meg a <a href="http://localhost:8000">localhost:8000</a> címet.';
    banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:13px 16px;border:1px solid #d9b978;border-radius:14px;background:#10141d;color:#f5f3ee;font:13px/1.5 system-ui;box-shadow:0 12px 40px #0008';
    document.addEventListener('DOMContentLoaded', function () { if (document.body) document.body.appendChild(banner); });
  }
})();

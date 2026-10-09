/* ORBITA - atlatszo helyi proxy. A kulso adatkereseket a gepeden futo
   serve.py-n keresztul kuldjuk: nincs CORS-hiba es kevesebb napi limit.
   Ha a serve.py nem fut, automatikusan kozvetlenul kerdez. */
(function () {
  var old = window.fetch.bind(window);
  var HOSTS = /^https:\/\/(api\.adsbdb\.com|tile\.openstreetmap\.org|a\.basemaps\.cartocdn\.com|b\.basemaps\.cartocdn\.com|c\.basemaps\.cartocdn\.com|server\.arcgisonline\.com|api\.adsbdb\.com|tile\.openstreetmap\.org|a\.basemaps\.cartocdn\.com|b\.basemaps\.cartocdn\.com|c\.basemaps\.cartocdn\.com|server\.arcgisonline\.com|api\.adsbdb\.com|hexdb\.io|api\.allorigins\.win|corsproxy\.io|r\.jina\.ai|server\.arcgisonline\.com|hexdb\.io|api\.adsbdb\.com|celestrak\.org|api\.wheretheiss\.at|db\.satnogs\.org|api\.adsb\.lol|api\.airplanes\.live|opensky-network\.org|nominatim\.openstreetmap\.org|router\.project-osrm\.org|hu\.wikipedia\.org|en\.wikipedia\.org|commons\.wikimedia\.org|api\.open-meteo\.com|restcountries\.com)\//i;

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (!url || !HOSTS.test(url)) return old(input, init);
    return old('/api/proxy?url=' + encodeURIComponent(url), init).then(function (r) {
      if (r && r.headers && r.headers.get('X-Orbita-Proxy')) return r;
      return old(input, init);
    }, function () {
      return old(input, init);
    });
  };

  if (location.protocol === 'file:') {
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#8a1c1c;color:#fff;font:14px/1.6 system-ui;padding:12px 16px;text-align:center';
    b.innerHTML = 'Az oldal fajlbol nyilt meg, ezert az elo adatok nem toltodnek be.<br>' +
      'Terminal: <b>cd orbita &amp;&amp; python3 serve.py</b> &nbsp;|&nbsp; bongeszoben: <b>http://localhost:8000</b>';
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) document.body.appendChild(b);
    });
  }
})();

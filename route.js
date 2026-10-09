/* ORBITA route.js v3 - "Honnan -> Hova" panel.
   Ket ingyenes forras: adsbdb.com es hexdb.io. A halozati hibat NEM keverjuk
   ossze azzal, hogy nincs ilyen jarat - a panel megmondja, mi tortent. */
(function () {
  'use strict';
  var KEY = 'orb_routes_v3';
  var routes = {}, miss = {}, queued = {}, tries = {}, aport = {}, q = [];
  var busy = false, live = [], current = null, errs = 0, wins = 0, open = true, pauseUntil = 0, done = 0;
  try { routes = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { routes = {}; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (x) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x];
    });
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function save() {
    try {
      var k = Object.keys(routes);
      k.slice(0, Math.max(0, k.length - 600)).forEach(function (x) { delete routes[x]; });
      localStorage.setItem(KEY, JSON.stringify(routes));
    } catch (e) {}
  }
  function km(a, b) {
    if (a.lat == null || b.lat == null) return 0;
    var R = 6371, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(x)));
  }
  function theme() {
    try {
      var m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(getComputedStyle(document.body).backgroundColor || '');
      if (!m) return 'dark';
      return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 > 0.6 ? 'light' : 'dark';
    } catch (e) { return 'dark'; }
  }
  function csOf(txt) {
    var m = (txt || '').toUpperCase().replace(/\s+/g, '').match(/([A-Z]{2,3}\d{1,4}[A-Z]{0,2})/);
    return m ? m[1] : '';
  }

  /* ---------- 1. elo gepadatok ---------- */
  var of = window.fetch;
  if (of) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var pr = of.apply(this, arguments);
      if (/adsb\.lol|airplanes\.live|opensky|adsbexchange/i.test(url)) {
        try { pr.then(function (r) { r.clone().json().then(ingest).catch(function () {}); }).catch(function () {}); } catch (e) {}
      }
      return pr;
    };
  }
  function norm(a) {
    if (!a) return null;
    var lat = num(a.lat != null ? a.lat : a[6]);
    var lon = num(a.lon != null ? a.lon : a[5]);
    if (lat == null || lon == null) return null;
    var raw = a.flight != null ? a.flight : (a.callsign != null ? a.callsign : (a.call != null ? a.call : a[1]));
    var alt = null;
    if (a.alt_baro != null) alt = num(a.alt_baro);
    else if (a.altitude != null) alt = num(a.altitude);
    else if (a[7] != null) { alt = num(a[7]); if (alt != null) alt = alt * 3.28084; }
    return { cs: String(raw == null ? '' : raw).trim().toUpperCase().replace(/\s+/g, ''),
             alt: alt && alt > 0 ? Math.round(alt) : null, lat: lat, lon: lon, raw: a };
  }
  function ingest(j) {
    var arr = j && (j.ac || j.states || j.aircraft);
    if (!arr || !arr.length) return;
    var out = [];
    for (var i = 0; i < arr.length; i++) { var n = norm(arr[i]); if (n) out.push(n); }
    if (out.length) { live = out; renderList(); }
  }

  /* ---------- 2. lekerdezes ---------- */
  function get(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return { ok: false, status: r.status };
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) { j = t; }
          return { ok: true, status: 200, j: j };
        });
      })
      .catch(function () { return null; });
  }
  function mk(fi, fa, fc, flat, flon, ti, ta, tc, tlat, tlon) {
    return { fi: fi || '', fa: fa || fi || '', fc: fc || '', flat: flat, flon: flon,
             ti: ti || '', ta: ta || ti || '', tc: tc || '', tlat: tlat, tlon: tlon };
  }
  function askAdsbdb(c) {
    return get('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(c)).then(function (r) {
      if (!r) return null;
      if (!r.ok) return r.status === 404 ? 'none' : null;
      var fr = r.j && r.j.response && r.j.response.flightroute;
      var rt = fr && fr.route;
      if (!rt || rt.length < 2) return 'none';
      var a = rt[0], b = rt[rt.length - 1];
      return mk(a.iata || a.icao, a.municipality || a.name, a.country, num(a.latitude), num(a.longitude),
                b.iata || b.icao, b.municipality || b.name, b.country, num(b.latitude), num(b.longitude));
    });
  }
  function airport(code) {
    if (aport[code]) return Promise.resolve(aport[code]);
    return get('https://hexdb.io/api/v1/airport/icao/' + code).then(function (r) {
      if (!r || !r.ok || !r.j || typeof r.j !== 'object') return null;
      var j = r.j;
      var o = {
        city: j.Municipality || j.municipality || j.City || j.city || j.Name || j.name || code,
        country: j.Country || j.country || j['ISO country'] || '',
        lat: num(j.Latitude || j.latitude || j.lat),
        lon: num(j.Longitude || j.longitude || j.lon || j.lng)
      };
      if (o.lat == null || o.lon == null) return null;
      aport[code] = o;
      return o;
    });
  }
  function askHexdb(c) {
    return get('https://hexdb.io/api/v1/route/icao/' + encodeURIComponent(c)).then(function (r) {
      if (!r) return null;
      if (!r.ok) return r.status === 404 ? 'none' : null;
      var txt = typeof r.j === 'string' ? r.j : JSON.stringify(r.j || {});
      var m = /\b([A-Z]{4})\s*[-\u2013]\s*([A-Z]{4})\b/.exec(txt);
      if (!m) return 'none';
      return Promise.all([airport(m[1]), airport(m[2])]).then(function (ap) {
        if (!ap[0] || !ap[1]) return 'none';
        return mk(m[1], ap[0].city, ap[0].country, ap[0].lat, ap[0].lon,
                  m[2], ap[1].city, ap[1].country, ap[1].lat, ap[1].lon);
      });
    });
  }
  /* --- beepitett repter-adatbazis (ICAO|IATA|Varos|Orszag|lat|lon) --- */
  var APDATA = [
'EGLL|LHR|London|Egyesult Kiralysag|51.4700|-0.4543','EGKK|LGW|London Gatwick|Egyesult Kiralysag|51.1481|-0.1903',
'EHAM|AMS|Amszterdam|Hollandia|52.3086|4.7639','EDDF|FRA|Frankfurt|Nemetorszag|50.0333|8.5706',
'EDDM|MUC|Munchen|Nemetorszag|48.3538|11.7861','EDDB|BER|Berlin|Nemetorszag|52.3667|13.5033',
'LFPG|CDG|Parizs|Franciaorszag|49.0097|2.5479','LFPO|ORY|Parizs Orly|Franciaorszag|48.7233|2.3794',
'LSZH|ZRH|Zurich|Svajc|47.4647|8.5492','LSGG|GVA|Genf|Svajc|46.2381|6.1089',
'LOWW|VIE|Becs|Ausztria|48.1103|16.5697','LKPR|PRG|Praha|Csehorszag|50.1008|14.2600',
'EPWA|WAW|Varso|Lengyelorszag|52.1657|20.9671','LHBP|BUD|Budapest|Magyarorszag|47.4369|19.2556',
'LBSF|SOF|Szofia|Bulgária|42.6967|23.4114','LROP|OTP|Bukarest|Romania|44.5711|26.0850',
'LDZA|ZAG|Zagreb|Horvatorszag|45.7429|16.0688','LJLJ|LJU|Ljubljana|Szlovenia|46.2237|14.4576',
'LZIB|BTS|Pozsony|Szlovakia|48.1702|17.2127','LGAV|ATH|Athen|Gorogorszag|37.9364|23.9445',
'LTFM|IST|Isztambul|Torokorszag|41.2753|28.7519','LTAI|AYT|Antalya|Torokorszag|36.8987|30.8005',
'LEMD|MAD|Madrid|Spanyolorszag|40.4719|-3.5626','LEBL|BCN|Barcelona|Spanyolorszag|41.2971|2.0785',
'LPPT|LIS|Lisszabon|Portugalia|38.7813|-9.1359','LIRF|FCO|Rome|Olaszorszag|41.8003|12.2389',
'LIMC|MXP|Milan|Olaszorszag|45.6306|8.7281','LIPZ|VCE|Velence|Olaszorszag|45.5053|12.3519',
'EFHK|HEL|Helsinki|Finnorszag|60.3172|24.9633','ENGM|OSL|Oslo|Norvegia|60.1939|11.1004',
'EKCH|CPH|Koppenhaga|Dania|55.6180|12.6560','ESSA|ARN|Stockholm|Svedorszag|59.6519|17.9186',
'EBBR|BRU|Brusszel|Belgium|50.9014|4.4844','EIDW|DUB|Dublin|Irorszag|53.4213|-6.2701',
'EGPH|EDI|Edinburgh|Egyesult Kiralysag|55.9500|-3.3725','EGCC|MAN|Manchester|Egyesult Kiralysag|53.3537|-2.2750',
'EGSS|STN|London Stansted|Egyesult Kiralysag|51.8850|0.2350','EVRA|RIX|Riga|Lettorszag|56.9236|23.9711',
'EYVI|VNO|Vilnius|Litvania|54.6341|25.2858','EETN|TLL|Tallinn|Esztorszag|59.4133|24.8328',
'UKBB|KBP|Kijev|Ukrajna|50.3450|30.8947','UUEE|SVO|Moszkva|Oroszorszag|55.9726|37.4146',
'UUDD|DME|Moszkva|Oroszorszag|55.4088|37.9063','ULLI|LED|Szentpetervar|Oroszorszag|59.8003|30.2625',
'KJFK|JFK|New York|USA|40.6398|-73.7789','KEWR|EWR|Newark|USA|40.6925|-74.1687',
'KLGA|LGA|New York LaGuardia|USA|40.7772|-73.8726','KBOS|BOS|Boston|USA|42.3630|-71.0064',
'KIAD|IAD|Washington|USA|38.9531|-77.4565','KATL|ATL|Atlanta|USA|33.6367|-84.4281',
'KMIA|MIA|Miami|USA|25.7932|-80.2906','KORD|ORD|Chicago|USA|41.9786|-87.9048',
'KDFW|DFW|Dallas|USA|32.8968|-97.0380','KIAH|IAH|Houston|USA|29.9844|-95.3414',
'KDEN|DEN|Denver|USA|39.8617|-104.6732','KLAX|LAX|Los Angeles|USA|33.9425|-118.4081',
'KSFO|SFO|San Francisco|USA|37.6189|-122.3750','KSEA|SEA|Seattle|USA|47.4490|-122.3093',
'KLAS|LAS|Las Vegas|USA|36.0801|-115.1523','KPHX|PHX|Phoenix|USA|33.4343|-112.0116',
'KMSP|MSP|Minneapolis|USA|44.8820|-93.2218','KDTW|DTW|Detroit|USA|42.2124|-83.3534',
'KPHL|PHL|Philadelphia|USA|39.8719|-75.2411','KSAN|SAN|San Diego|USA|32.7336|-117.1900',
'CYYZ|YYZ|Toronto|Kanada|43.6772|-79.6306','CYVR|YVR|Vancouver|Kanada|49.1939|-123.1844',
'CYUL|YUL|Montreal|Kanada|45.4706|-73.7408','MMMX|MEX|Mexikovaros|Mexiko|19.4363|-99.0721',
'MMUN|CUN|Cancun|Mexiko|21.0365|-86.8771','SBGR|GRU|Sao Paulo|Brazilia|-23.4356|-46.4731',
'SBGL|GIG|Rio de Janeiro|Brazilia|-22.8100|-43.2506','SAEZ|EZE|Buenos Aires|Argentina|-34.8222|-58.5358',
'SCEL|SCL|Santiago|Chile|-33.3930|-70.7858','SKBO|BOG|Bogota|Kolumbia|4.7016|-74.1469',
'SPJC|LIM|Lima|Peru|-12.0219|-77.1143','FAOR|JNB|Johannesburg|Del-Afrika|-26.1392|28.2460',
'FACT|CPT|Fokvaros|Del-Afrika|-33.9715|18.6021','HECA|CAI|Kairo|Egyiptom|30.1219|31.4056',
'DNMM|LOS|Lagos|Nigeria|6.5774|3.3212','HKJK|NBO|Nairobi|Kenya|-1.3192|36.9278',
'GMMN|CMN|Casablanca|Marokko|33.3675|-7.5900','DAAG|ALG|Algir|Algeria|36.6910|3.2154',
'OMDB|DXB|Dubaj|EAE|25.2528|55.3644','OMAA|AUH|Abu Dhabi|EAE|24.4330|54.6511',
'OTHH|DOH|Doha|Katar|25.2731|51.6081','OERK|RUH|Rijad|Szaud-Arabia|24.9576|46.6988',
'OEJN|JED|Dzsidda|Szaud-Arabia|21.6796|39.1565','LLBG|TLV|Tel Aviv|Izrael|32.0114|34.8867',
'OBBI|BAH|Bahrein|Bahrein|26.2708|50.6336','OKBK|KWI|Kuvait|Kuvait|29.2266|47.9689',
'VIDP|DEL|Delhi|India|28.5562|77.1000','VABB|BOM|Mumbai|India|19.0887|72.8679',
'VOBL|BLR|Bangalore|India|13.1986|77.7066','VOMM|MAA|Chennai|India|12.9941|80.1709',
'VCBI|CMB|Colombo|Sri Lanka|7.1808|79.8841','VTBS|BKK|Bangkok|Thaifold|13.6900|100.7501',
'WSSS|SIN|Szingapur|Szingapur|1.3644|103.9915','WMKK|KUL|Kuala Lumpur|Malajzia|2.7456|101.7099',
'WIII|CGK|Jakarta|Indonezia|-6.1256|106.6559','WADD|DPS|Bali|Indonezia|-8.7482|115.1672',
'RPLL|MNL|Manila|Fulop-szigetek|14.5086|121.0194','VVTS|SGN|Ho Si Minh|Vietnam|10.8188|106.6520',
'VVNB|HAN|Hanoi|Vietnam|21.2212|105.8072','VHHH|HKG|Hongkong|Kina|22.3080|113.9185',
'RCTP|TPE|Tajpej|Tajvan|25.0777|121.2328','RJTT|HND|Tokio Haneda|Japan|35.5494|139.7798',
'RJAA|NRT|Tokio Narita|Japan|35.7647|140.3864','RJBB|KIX|Oszaka|Japan|34.4273|135.2444',
'RKSI|ICN|Szoul|Del-Korea|37.4602|126.4407','ZBAA|PEK|Peking|Kina|40.0799|116.6031',
'ZBAD|PKX|Peking Daxing|Kina|39.5098|116.4105','ZSPD|PVG|Sanghaj|Kina|31.1443|121.8083',
'ZGGG|CAN|Kuangcsou|Kina|23.3924|113.2988','ZGSZ|SZX|Sencsen|Kina|22.6393|113.8107',
'ZUUU|CTU|Csengdu|Kina|30.5785|103.9471','VVDN|DAD|Da Nang|Vietnam|16.0439|108.1994',
'YSSY|SYD|Sydney|Ausztrália|-33.9461|151.1772','YMML|MEL|Melbourne|Ausztrália|-37.6733|144.8433',
'YBBN|BNE|Brisbane|Ausztrália|-27.3842|153.1175','YPPH|PER|Perth|Ausztrália|-31.9403|115.9669',
'NZAA|AKL|Auckland|Uj-Zeland|-37.0081|174.7920','OPKC|KHI|Karacsi|Pakisztan|24.9065|67.1608',
'UTTT|TAS|Taskent|Uzbegisztan|41.2579|69.2812','UAAA|ALA|Almaty|Kazahsztan|43.3521|77.0405',
'UNNT|OVB|Novoszibirszk|Oroszorszag|55.0126|82.6507'
  ].join(';');
  var AP = {};
  (function () {
    APDATA.split(';').forEach(function (row) {
      var f = row.split('|');
      if (f.length < 6) return;
      AP[f[0]] = { iata: f[1], city: f[2], country: f[3], lat: parseFloat(f[4]), lon: parseFloat(f[5]) };
    });
  })();

  /* --- 3. es 4. forras: kozvetito szerverek (megkeruli a helyi blokkot) --- */
  function askPublic(c) {
    if (pubOff) return Promise.resolve(null);
    var target = 'https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(c);
    var list = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(target),
      'https://corsproxy.io/?url=' + encodeURIComponent(target),
      'https://r.jina.ai/' + target
    ];
    var i = 0, fails2 = 0;
    function step() {
      if (i >= list.length) { if (fails2 >= list.length) pubOff = true; return null; }
      return get(list[i++]).then(function (r) {
        if (!r || !r.ok) { fails2++; lastStatus = r ? String(r.status) : 'nincs valasz'; return step(); }
        var j = r.j;
        if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { j = null; } }
        var fr = j && j.response && j.response.flightroute;
        var rt = fr && fr.route;
        if (!rt || rt.length < 2) { fails2++; return step(); }
        var a = rt[0], b = rt[rt.length - 1];
        return mk(a.iata || a.icao, a.municipality || a.name, a.country, num(a.latitude), num(a.longitude),
                  b.iata || b.icao, b.municipality || b.name, b.country, num(b.latitude), num(b.longitude));
      });
    }
    return step();
  }

  /* --- 3. forras: OpenSky (ugyanaz, ami a vilag repuloket is adja) --- */
  var osOff = false, osTries = 0, pubOff = false, lastStatus = '', proxyOK = null;
  function askOpenSky(c) {
    if (osOff || osTries > 4) return Promise.resolve(null);
    osTries++;
    return new Promise(function (res) { setTimeout(function () { res(get('https://opensky-network.org/api/routes?callsign=' + encodeURIComponent(c))); }, 900); })
      .then(function (r) {
        if (!r) { if (osTries > 3) osOff = true; return null; }
        if (!r.ok) { if (r.status === 404) return 'none'; if (r.status === 429) osOff = true; return null; }
        var rt = r.j && r.j.route;
        if (!rt || rt.length < 2) return 'none';
        var a = AP[rt[0]], b = AP[rt[rt.length - 1]];
        return mk(rt[0], a ? a.city : rt[0], a ? a.country : '', a ? a.lat : null, a ? a.lon : null,
                  rt[rt.length - 1], b ? b.city : rt[rt.length - 1], b ? b.country : '', b ? b.lat : null, b ? b.lon : null);
      });
  }

  function ask(c) {
    if (!c || routes[c] || miss[c] || queued[c] || q.length > 40) return;
    queued[c] = 1; q.push(c); pump();
  }
  function pump() {
    if (busy || !q.length || Date.now() < pauseUntil) return;
    var c = q.shift();
    if (routes[c] || miss[c]) { setTimeout(pump, 40); return; }
    busy = true;
    askAdsbdb(c).then(function (r) {
      if (r !== null) return r;
      return askHexdb(c);
    }).then(function (r) {
      if (r !== null) return r;
      return askPublic(c);
    }).then(function (r) {
      if (r !== null) return r;
      return askOpenSky(c);
    }).then(function (r) {
      if (r === 'none') { miss[c] = 1; done++; }
      else if (r) { routes[c] = r; save(); wins++; done++; }
      else {
        errs++; tries[c] = (tries[c] || 0) + 1;
        if (tries[c] < 3) q.push(c);
        if (errs >= 6 && wins === 0) pauseUntil = Date.now() + 45000;
      }
    }).catch(function () { errs++; }).then(function () {
      busy = false; renderList();
      if (current === c) { show(c); drawMap(routes[c]); }
      setTimeout(pump, 1200);
    });
  }

  /* ---------- 3. stilus ---------- */
  var st = document.createElement('style');
  st.textContent = [
    '#orblist,#orbtab,#orbroute{font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
    '#orblist{position:fixed;right:16px;top:84px;z-index:9997;width:310px;max-height:60vh;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
    '#orblist.off{display:none}',
    '#orblist.orb-dark{background:rgba(16,18,24,.94);color:#ece7db;border:1px solid #33363f}',
    '#orblist.orb-light{background:rgba(255,255,255,.97);color:#1b1b1b;border:1px solid #ddd6c8}',
    '.orb-lh{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(128,128,128,.25);font-size:11px;letter-spacing:.16em;text-transform:uppercase}',
    '.orb-lh b{flex:1;font-weight:600}',
    '.orb-lx{border:0;background:none;color:inherit;opacity:.55;font-size:19px;line-height:1;cursor:pointer}',
    '.orb-lb{overflow:auto;padding:6px;font-size:13px}',
    '.orb-li{padding:7px 9px;border-radius:10px;cursor:pointer}',
    '.orb-li:hover{background:rgba(128,128,128,.15)}',
    '.orb-li b{font-size:12.5px;letter-spacing:.04em}',
    '.orb-lr{float:right;color:#c8a45c;font-weight:700;font-size:12px}',
    '.orb-li small{display:block;opacity:.62;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.orb-empty{padding:10px;font-size:12.5px;opacity:.75}',
    '.orb-warn{padding:9px 11px;margin:6px;border-radius:10px;font-size:12px;line-height:1.5;background:rgba(224,163,60,.14);color:#e0a33c;border:1px solid rgba(224,163,60,.4)}',
    '.orb-ok{padding:9px 11px;margin:6px;border-radius:10px;font-size:12px;background:rgba(120,190,120,.13);color:#7fc07f;border:1px solid rgba(120,190,120,.35)}',
    '#orbtab{position:fixed;right:16px;top:84px;z-index:9997;padding:10px 15px;border-radius:999px;border:1px solid rgba(200,164,92,.5);background:rgba(16,18,24,.93);color:#e9dfc8;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '#orbtab.off{display:none}',
    '#orbroute{position:fixed;right:16px;bottom:16px;z-index:9998;width:min(360px,calc(100vw - 32px));border-radius:16px;padding:16px 18px 14px;font-size:14px;line-height:1.55;box-shadow:0 24px 60px rgba(0,0,0,.5);display:none}',
    '#orbroute.on{display:block}',
    '#orbroute.orb-dark{background:#14161c;color:#eee9df;border:1px solid #34363f}',
    '#orbroute.orb-light{background:#fff;color:#1a1a1a;border:1px solid #ddd6c8}',
    '#orbroute .orb-hh{font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.55;margin:0 0 10px}',
    '#orbroute .orb-r{display:flex;align-items:center;gap:10px}',
    '#orbroute .orb-leg{flex:1;min-width:0}',
    '#orbroute .orb-k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.5}',
    '#orbroute .orb-leg b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#orbroute .orb-leg small{display:block;opacity:.6;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#orbroute .orb-mid{opacity:.5;font-size:18px}',
    '#orbroute .orb-note{margin:0;opacity:.8;font-size:13px}',
    '#orbroute .orb-f{margin-top:12px;display:flex;align-items:center;gap:12px;font-size:12px;opacity:.85}',
    '#orbroute a.orb-maps{margin-left:auto;color:#b08a3c;text-decoration:none;font-weight:600;white-space:nowrap}',
    '#orbroute .orb-x{position:absolute;top:6px;right:10px;border:0;background:none;color:inherit;opacity:.5;font-size:19px;line-height:1;cursor:pointer}',
    '.orb-tag{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:11px;background:rgba(176,138,60,.2);color:#b08a3c;border:1px solid rgba(176,138,60,.45);white-space:nowrap}',
    '@media(max-width:640px){#orblist{left:10px;right:10px;width:auto;top:auto;bottom:200px;max-height:36vh}#orbtab{top:auto;bottom:12px;right:12px}#orbroute{bottom:64px;left:10px;right:10px;width:auto}}'
  ].join('');
  (document.head || document.documentElement).appendChild(st);

  /* ---------- 4. panel ---------- */
  function panel() {
    var el = document.getElementById('orblist');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'orblist';
    el.innerHTML = '<div class="orb-lh"><b>Honnan &#8594; Hov&#225;</b><span id="orbcnt"></span>' +
      '<button class="orb-lx" type="button" aria-label="Bez&#225;r&#225;s">&times;</button></div>' +
      '<div class="orb-lb" id="orblb"></div>';
    el.querySelector('.orb-lx').addEventListener('click', function () { open = false; renderList(); });
    document.body.appendChild(el);
    return el;
  }
  function tab() {
    var t = document.getElementById('orbtab');
    if (t) return t;
    t = document.createElement('button');
    t.id = 'orbtab'; t.type = 'button';
    t.textContent = 'Honnan \u2192 Hov\u00e1';
    t.addEventListener('click', function () { open = true; renderList(); });
    document.body.appendChild(t);
    return t;
  }
  function status() {
    var px = proxyOK === null ? '?' : (proxyOK ? 'fut' : 'NEM fut');
    if (proxyOK === false) {
      return '<div class="orb-warn"><b>A helyi adatproxy nem fut (' + px + ').</b><br>' +
        'Ind\u00edtsd a termin\u00e1lban: <b>cd orbita</b>, majd <b>python3 serve.py</b>, \u00e9s ut\u00e1na nyisd meg a http://localhost:8000/repulok.html c\u00edmet.</div>';
    }
    if (errs >= 6 && wins === 0) {
      return '<div class="orb-warn"><b>Az \u00fatvonal-adatforr\u00e1sok most nem v\u00e1laszolnak.</b><br>' +
        'Pr\u00f3b\u00e1lva: adsbdb.com, hexdb.io, k\u00f6zvet\u00edt\u0151 szerverek, OpenSky. Utols\u00f3 v\u00e1lasz: ' +
        (lastStatus || 'nincs') + '.<br>' +
        'A rep\u00fcl\u0151k list\u00e1ja \u00e9s a t\u00e9rk\u00e9p ett\u0151l f\u00fcggetlen\u00fcl m\u0171k\u00f6dik. (proxy: ' + px + ')</div>';
    }
    if (pauseUntil > Date.now()) return '<div class="orb-warn">Sz\u00fcneteltetve 45 m\u00e1sodpercre a t\u00fal sok hiba miatt\u2026</div>';
    if (done > 0 && errs === 0 && wins > 0) return '<div class="orb-ok">' + wins + ' j\u00e1rat \u00fatvonala megvan, ' + done + ' leellen\u0151rizve. (proxy: ' + px + ')</div>';
    return '';
  }
  function renderList() {
    var el = panel();
    el.className = (theme() === 'light' ? 'orb-light' : 'orb-dark') + (open ? '' : ' off');
    tab().className = open ? 'off' : '';
    var body = document.getElementById('orblb'), cnt = document.getElementById('orbcnt');
    if (!body) return;
    if (cnt) cnt.textContent = live.length + ' rep\u00fcl\u0151';
    var seen = {}, items = [];
    for (var i = 0; i < live.length && items.length < 300; i++) {
      var a = live[i];
      if (!a.cs || seen[a.cs] || !/^[A-Z]{2,3}\d/.test(a.cs)) continue;
      seen[a.cs] = 1; items.push(a);
    }
    items.sort(function (x, y) { return (y.alt || 0) - (x.alt || 0); });
    items = items.slice(0, 16);
    var h = status();
    if (!items.length) {
      body.innerHTML = h + '<div class="orb-empty">V\u00e1rom az \u00e9l\u0151 rep\u00fcl\u0151adatokat\u2026<br>' +
        '(a t\u00e9rk\u00e9p adatforr\u00e1sa m\u00e9g nem v\u00e1laszolt)</div>';
      return;
    }
    items.forEach(function (a) {
      var r = routes[a.cs];
      var right = r ? ((r.fi || '?') + ' \u2192 ' + (r.ti || '?')) : (miss[a.cs] ? '\u2013' : '\u2026');
      var sub = r ? (r.fa + ' \u2192 ' + r.ta) : (miss[a.cs] ? 'nincs nyilv\u00e1ntartott \u00fatvonal' : '\u00fatvonal keres\u00e9se\u2026');
      h += '<div class="orb-li" data-cs="' + esc(a.cs) + '"><b>' + esc(a.cs) + '</b>' +
           '<span class="orb-lr">' + esc(right) + '</span><small>' + esc(sub) +
           (a.alt ? ' \u00b7 ' + a.alt + ' ft' : '') + '</small></div>';
      if (!r && !miss[a.cs]) ask(a.cs);
    });
    body.innerHTML = h;
  }

  /* ---------- 5. reszletes kartya ---------- */
  function card() {
    var el = document.getElementById('orbroute');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'orbroute';
    el.innerHTML = '<button class="orb-x" type="button" aria-label="Bez\u00e1r\u00e1s">&times;</button><div id="orbroutebody"></div>';
    el.querySelector('.orb-x').addEventListener('click', function () {
      el.classList.remove('on');
      try { if (window.ORB_MAP && window.ORB_MAP.world) window.ORB_MAP.world(); } catch (e) {}
    });
    document.body.appendChild(el);
    return el;
  }
  function show(c) {
    var el = card(), r = c ? routes[c] : null;
    el.className = (theme() === 'light' ? 'orb-light ' : 'orb-dark ') + 'on';
    var h = '<p class="orb-hh">J\u00e1rat \u00fatvonala</p>';
    if (!c) {
      h += '<p class="orb-note">Ehhez a rep\u00fcl\u0151h\u00f6z nincs j\u00e1ratsz\u00e1m az ad\u00e1sban, ez\u00e9rt az \u00fatvonal nem k\u00e9rdezhet\u0151 le.</p>';
    } else if (r) {
      var d = km({ lat: r.flat, lon: r.flon }, { lat: r.tlat, lon: r.tlon });
      var has = r.flat != null && r.tlat != null;
      h += '<div class="orb-r">' +
        '<div class="orb-leg"><span class="orb-k">Honnan</span><b>' + esc(r.fa) + '</b><small>' +
        esc(r.fi) + (r.fc ? ' \u00b7 ' + esc(r.fc) : '') + '</small></div>' +
        '<div class="orb-mid">&#9992;</div>' +
        '<div class="orb-leg"><span class="orb-k">Hov\u00e1</span><b>' + esc(r.ta) + '</b><small>' +
        esc(r.ti) + (r.tc ? ' \u00b7 ' + esc(r.tc) : '') + '</small></div></div>' +
        '<div class="orb-f"><span>' + esc(c) + '</span><span>' + (has && d ? d.toLocaleString('hu-HU') + ' km' : '') +
        '</span>' + (has ? '<a class="orb-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=' +
        r.flat + ',' + r.flon + '&destination=' + r.tlat + ',' + r.tlon + '">Google Maps &rarr;</a>' : '') + '</div>';
    } else if (miss[c]) {
      h += '<p class="orb-note"><b>' + esc(c) + '</b> \u2013 ehhez a j\u00e1ratsz\u00e1mhoz nincs nyilv\u00e1ntartott \u00fatvonal.</p>';
    } else if (errs >= 6 && wins === 0) {
      h += '<p class="orb-note"><b>' + esc(c) + '</b> \u2013 az \u00fatvonal-adatforr\u00e1sok nem v\u00e1laszolnak (h\u00e1l\u00f3zati blokk vagy napi limit). Nem az oldal hib\u00e1ja.</p>';
    } else {
      h += '<p class="orb-note"><b>' + esc(c) + '</b> \u2013 \u00fatvonal keres\u00e9se\u2026</p>';
      ask(c);
    }
    var b = document.getElementById('orbroutebody');
    if (b) b.innerHTML = h;
  }

  /* ---------- 6. terkep ---------- */
  function find(cs) {
    for (var i = 0; i < live.length; i++) if (live[i].cs === cs) return live[i];
    return null;
  }
  function focusOn(cs) {
    var a = find(cs);
    if (!a) return;
    try { if (window.ORB_MAP && window.ORB_MAP.focus) window.ORB_MAP.focus({ lat: a.lat, lon: a.lon }, 7); } catch (e) {}
  }
  function drawMap(r) {
    var m = window.ORB_MAP;
    if (!m || !r || r.flat == null || r.tlat == null) return;
    try { if (m.setRoute) m.setRoute([{ lat: r.flat, lon: r.flon }, { lat: r.tlat, lon: r.tlon }], r.fi || r.fa, r.ti || r.ta); } catch (e) {}
  }

  /* ---------- 7. kattintasok ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#orbroute')) return;
    var li = t.closest('.orb-li');
    if (li) {
      var cs = li.getAttribute('data-cs');
      current = cs; show(cs); focusOn(cs);
      if (routes[cs]) drawMap(routes[cs]);
      return;
    }
    var host = t.closest('tr, [data-callsign]');
    if (host && !(host.tagName === 'TR' && !host.querySelector('td'))) {
      var c = csOf(host.textContent);
      current = c; show(c); focusOn(c);
      if (c && routes[c]) drawMap(routes[c]);
    }
  }, true);

  /* ---------- 8. tartalek: tablazatsorok ---------- */
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > -80 && r.top < (window.innerHeight || 800) + 80;
  }
  function tag(tr, c) {
    if (tr.querySelector('.orb-tag')) return;
    var r = routes[c];
    if (!r) return;
    var cell = tr.lastElementChild;
    if (!cell || cell.tagName !== 'TD') return;
    var s = document.createElement('span');
    s.className = 'orb-tag';
    s.textContent = (r.fi || r.fa) + ' \u2192 ' + (r.ti || r.ta);
    s.title = 'Honnan: ' + r.fa + '  -  Hov\u00e1: ' + r.ta;
    cell.appendChild(s);
  }
  function scan() {
    var rows = document.querySelectorAll('tr'), n = 0;
    for (var i = 0; i < rows.length && n < 14; i++) {
      var tr = rows[i];
      if (tr.querySelector('.orb-tag')) continue;
      var c = csOf(tr.textContent);
      if (!c || !visible(tr)) continue;
      n++;
      if (routes[c]) tag(tr, c); else ask(c);
    }
  }

  window.ORBITA_ROUTE = { routes: routes, show: show, planes: function () { return live.slice(); } };

  function probeProxy() {
    fetch('/api/proxy?url=' + encodeURIComponent('https://pelda.local/proba'))
      .then(function (r) {
        proxyOK = !!(r && r.headers && r.headers.get('X-Orbita-Proxy'));
        renderList();
      })
      .catch(function () { proxyOK = false; renderList(); });
  }

  function boot() {
    panel(); tab(); renderList(); probeProxy(); scan();
    setInterval(renderList, 4000);
    setInterval(scan, 6000);
    setTimeout(function () {
      if (!window.ORB_MAP) {
        var b = document.getElementById('orblb');
        if (b && !live.length) b.innerHTML = '<div class="orb-warn">A t\u00e9rk\u00e9p-kezel\u0151 nem indult el ezen az oldalon. Nyomd meg a Ctrl+Shift+R-t, \u00e9s ha \u00edgy sem j\u00f3, \u00edrd meg nekem.</div>';
      }
    }, 4000);
    try { new MutationObserver(function () { setTimeout(scan, 300); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

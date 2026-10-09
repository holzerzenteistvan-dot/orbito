#!/usr/bin/env python3
# ORBITA helyi szerver + API-proxy.  Inditas:  python3 serve.py
import http.server, socketserver, urllib.request, urllib.parse, urllib.error
import os, time, json, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))

ALLOW = {
    "api.allorigins.win", "corsproxy.io", "r.jina.ai",
    "hexdb.io",
    "tile.openstreetmap.org", "a.basemaps.cartocdn.com", "b.basemaps.cartocdn.com", "c.basemaps.cartocdn.com", "server.arcgisonline.com",
    "api.adsbdb.com", "celestrak.org", "api.wheretheiss.at", "db.satnogs.org", "api.adsb.lol",
    "api.airplanes.live", "opensky-network.org", "nominatim.openstreetmap.org",
    "router.project-osrm.org", "hu.wikipedia.org", "en.wikipedia.org",
    "commons.wikimedia.org", "api.open-meteo.com", "restcountries.com",
}
TTL = 20
_cache = {}
_lock = threading.Lock()
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def upstream(url):
    now = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and now - hit[0] < TTL:
        return hit[1], hit[2], "cache"
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        body = r.read()
        ctype = r.headers.get("Content-Type", "application/json")
    with _lock:
        _cache[url] = (now, body, ctype)
    return body, ctype, "elo"


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("X-Orbita-Proxy", "1")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/proxy"):
            return self.proxy()
        return super().do_GET()

    def proxy(self):
        q = urllib.parse.urlparse(self.path).query
        target = urllib.parse.parse_qs(q).get("url", [""])[0]
        p = urllib.parse.urlparse(target)
        host = p.hostname or "?"
        code, ctype = 400, "application/json"
        body = b'{"error":"bad request"}'
        src = "-"
        if p.scheme == "https" and host in ALLOW:
            t0 = time.time()
            try:
                body, ctype, src = upstream(target)
                code = 200
            except urllib.error.HTTPError as e:
                code, ctype, src = e.code, "text/plain", "-"
                body = (e.read() or b"")[:1500]
            except Exception as e:
                code, ctype, src = 502, "text/plain", "-"
                body = str(e).encode()[:300]
            print("[proxy] %s %5dms %-5s %s%s" % (
                code, int((time.time() - t0) * 1000), src, host, p.path[:60]),
                flush=True)
        else:
            print("[proxy] 403 tiltott cel: %s" % host, flush=True)
            body = json.dumps({"error": "host not allowed", "host": host}).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.chdir(ROOT)
    print("==================================================")
    print(" ORBITA fut  ->  http://localhost:%d" % PORT)
    print(" Leallitas: Ctrl+C")
    print(" Az adatkeresek naploja itt latszik ([proxy] sorok).")
    print("==================================================", flush=True)
    with Server(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nLeallitva.")

/* School OS offline helper for Take Attendance (08-platform-security.md §10).
 *
 * Registered only on Attendance Management pages, and only for schools that
 * switch on offline attendance. It keeps the last copy of each Take Attendance
 * page the teacher opened (their own class lists and today's periods) and the
 * app's script files, so the page still opens without internet. Attendance
 * taken offline is kept in the page's own queue on this phone and sent when
 * the phone is back online. Nothing is ever sent from here.
 */
const VERSION = "v1";
const PAGES = `sos-attendance-pages-${VERSION}`;
const ASSETS = `sos-attendance-assets-${VERSION}`;
const SCOPE_PATH = "/attendance-management";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const name of await caches.keys()) {
      if (name.startsWith("sos-attendance-") && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// A signed-out phone must not keep class lists: the page sends this message on sign-out or when offline is switched off.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "sos-clear") {
    event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(ASSETS)]));
  }
});

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f7f7f8;color:#1b1b1f}@media (prefers-color-scheme:dark){body{background:#111214;color:#ececf1}}main{max-width:32rem;margin:10vh auto}h1{font-size:1.4rem}a{color:inherit}</style></head>
<body><main><h1>You are offline</h1><p>This page has not been opened on this phone before, so it cannot open without internet.</p>
<p>Open Take Attendance once while online and it will work offline after that. Attendance you already took is kept on this phone and will send when online.</p>
<p><a href="${SCOPE_PATH}">Try again</a></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Script and style files never change once built: keep them.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Take Attendance itself: always the newest copy when online, the last copy when offline.
  const isTakePage = url.pathname === SCOPE_PATH || url.pathname === `${SCOPE_PATH}/`;
  if (!isTakePage) return;
  event.respondWith((async () => {
    const cache = await caches.open(PAGES);
    try {
      const res = await fetch(req);
      if (res.ok && !res.redirected) cache.put(req, res.clone());
      return res;
    } catch {
      const exact = await cache.match(req);
      if (exact) return exact;
      const isRsc = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
      if (!isRsc) {
        const any = await cache.match(new Request(`${self.location.origin}${SCOPE_PATH}`), { ignoreSearch: true });
        if (any) return any;
        return offlinePage();
      }
      return Response.error();
    }
  })());
});

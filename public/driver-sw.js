/* School OS driver page helper (12 §2 Driver app; the /driver page).
 *
 * Registered only by the /driver page (scope /driver). It does two things:
 *  1. Keeps the last copy of the /driver page and the app's script files,
 *     so the page still opens in a place with no signal.
 *  2. Queues the bus's locations, stop and boarding marks and End trip while
 *     the phone is offline, in this phone's own storage (IndexedDB), and
 *     sends them in order as soon as the phone is back online. Locations
 *     carry the time they were taken, so the school sees the real path.
 * The emergency button and breakdown are never queued: offline, the page
 * offers to call the school instead.
 * Nothing about other schools or other drivers is kept here.
 */
const VERSION = "v1";
const PAGES = `sos-driver-pages-${VERSION}`;
const ASSETS = `sos-driver-assets-${VERSION}`;
const SCOPE_PATH = "/driver";
const API = "/api/v1/transport/driver/";
const QUEUED = ["points", "reached", "boarding", "end", "start"];
const DB_NAME = "sos-driver";
const STORE = "queue";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const name of await caches.keys()) {
      if (name.startsWith("sos-driver-") && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

/* ---------- The queue (IndexedDB) ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && "result" in out ? out.result : out);
    tx.onerror = () => reject(tx.error);
  });
}

const addItem = (item) => withStore("readwrite", (s) => s.add(item));
const allItems = () => withStore("readonly", (s) => s.getAll());
const removeItem = (id) => withStore("readwrite", (s) => s.delete(id));
const clearItems = () => withStore("readwrite", (s) => s.clear());

async function tell(message) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(message);
}

async function queueSize() {
  try { return (await allItems()).length; } catch { return 0; }
}

let flushing = null;
/** Sends the queue in order. Stops at the first network failure or a refused sign-in, and keeps the rest. */
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      const items = await allItems();
      for (const item of items) {
        let res;
        try {
          res = await fetch(item.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: item.body, credentials: "same-origin" });
        } catch {
          break; // still offline
        }
        if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) break; // try again later
        // 200 sent; 4xx such as a trip already ended: the school's rules refused it, so it is dropped.
        await removeItem(item.id);
        sent++;
      }
    } finally {
      flushing = null;
    }
    await tell({ type: "sos-driver-queue", size: await queueSize(), sent });
    return sent;
  })();
  return flushing;
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sos-driver-queue") event.waitUntil(flush());
});

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "sos-driver-flush") event.waitUntil(flush());
  if (d.type === "sos-driver-size") event.waitUntil(queueSize().then((size) => tell({ type: "sos-driver-queue", size, sent: 0 })));
  // Signing out clears the page copy and anything not yet sent from this phone.
  if (d.type === "sos-clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(ASSETS), clearItems()]));
});

/* ---------- Requests ---------- */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Driver actions: online goes straight through; offline is queued and answered "queued".
  if (req.method === "POST" && url.pathname.startsWith(API)) {
    const action = url.pathname.slice(API.length);
    if (!QUEUED.includes(action)) return;
    event.respondWith((async () => {
      const body = await req.clone().text();
      // Something already waiting goes first, so the order stays right.
      if ((await queueSize()) > 0) {
        await addItem({ url: req.url, body, at: Date.now() });
        flush();
        return queuedReply();
      }
      try {
        const res = await fetch(req);
        if (res.status >= 500) throw new Error("server");
        return res;
      } catch {
        await addItem({ url: req.url, body, at: Date.now() });
        try { await self.registration.sync.register("sos-driver-queue"); } catch { /* no background sync: the page asks to send when back online */ }
        await tell({ type: "sos-driver-queue", size: await queueSize(), sent: 0 });
        return queuedReply();
      }
    })());
    return;
  }

  if (req.method !== "GET") return;

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

  // Today's trips: the newest when online, the last copy when offline.
  const isTrips = url.pathname === `${API}trips`;
  const isPage = url.pathname === SCOPE_PATH || url.pathname === `${SCOPE_PATH}/`;
  if (!isTrips && !isPage) return;
  event.respondWith((async () => {
    const cache = await caches.open(PAGES);
    try {
      const res = await fetch(req);
      if (res.ok && !res.redirected) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: isPage });
      if (hit) return hit;
      if (isPage && req.headers.get("RSC") !== "1") return offlinePage();
      return Response.error();
    }
  })());
});

function queuedReply() {
  return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { "Content-Type": "application/json" } });
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f7f7f8;color:#1b1b1f}@media (prefers-color-scheme:dark){body{background:#111214;color:#ececf1}}main{max-width:32rem;margin:10vh auto}h1{font-size:1.4rem}a{color:inherit}</style></head>
<body><main><h1>You are offline</h1><p>Open the driver page once while online and it will open offline after that.</p><p><a href="${SCOPE_PATH}">Try again</a></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

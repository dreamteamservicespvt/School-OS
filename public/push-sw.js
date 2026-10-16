/* School OS push alerts (00-global.md §4 rules 6 and 8).
 *
 * Registered from My profile when a person switches on push alerts on this
 * phone or computer. Firebase Cloud Messaging delivers each alert here as
 * data only (src/lib/push.ts, fcmMessage); this shows it and, on a tap, opens
 * the same screen as the in-app notification. It keeps nothing on the phone
 * and never caches pages, so it does not clash with the offline helper
 * (public/sw.js), which has its own scope.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readAlert(event) {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = {};
  }
  // FCM wraps data messages as { data: {...} }; a plain payload is taken as it is.
  const d = (p && typeof p.data === "object" && p.data) || p || {};
  const n = (p && typeof p.notification === "object" && p.notification) || {};
  const link = typeof d.link === "string" && d.link.startsWith("/") && !d.link.startsWith("//") ? d.link : "/notifications";
  return {
    title: String(d.title || n.title || "School OS"),
    body: String(d.body || n.body || "You have a new notification."),
    link,
    tag: d.tag ? String(d.tag) : undefined,
  };
}

self.addEventListener("push", (event) => {
  const a = readAlert(event);
  event.waitUntil(
    self.registration.showNotification(a.title, {
      body: a.body,
      tag: a.tag,
      renotify: Boolean(a.tag),
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { link: a.link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/notifications";
  const url = new URL(link, self.location.origin).href;
  // This helper controls no pages (its scope is only /push-alerts/), so it
  // cannot steer an open window; it opens the screen in the app instead.
  event.waitUntil(self.clients.openWindow(url));
});

// Phone companion only (docs/MOBILE.md): the app lives on the desktop, so with no desktop there is nothing to
// load. Instead of the browser's own error page, show offline.html, which says how to bring Sprigo back.
// Nothing else is cached: every other request goes to the desktop as usual.
const CACHE = "sprigo-offline-1";
const KEEP = ["/offline.html", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(KEEP)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  // A network error: the phone is off Tailscale or the desktop's serve rule is gone. 502-504: Tailscale is
  // up but Sprigo isn't running on the desktop.
  e.respondWith(fetch(e.request)
    .then((r) => (r.status >= 502 && r.status <= 504 ? caches.match("/offline.html").then((o) => o ?? r) : r))
    .catch(() => caches.match("/offline.html")));
});

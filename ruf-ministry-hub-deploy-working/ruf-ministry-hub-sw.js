const CACHE_NAME = "ruf-ministry-hub-v23-ai-confirm-actions";
const HTML_ENTRY = "ruf-ministry-hub.html";
const ASSETS = [
  "index.html",
  HTML_ENTRY,
  "ruf-ministry-hub.webmanifest",
  "ruf-ministry-hub-icon-180.png",
  "ruf-ministry-hub-icon-192.png",
  "ruf-ministry-hub-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/ruf-ministry-hub" || path === "/app" || path === "/ruf-ministry-hub.html") {
      event.respondWith(caches.match(HTML_ENTRY).then(cached => cached || fetch(HTML_ENTRY)));
      return;
    }
    if (path === "/" || path === "/index.html") {
      event.respondWith(caches.match("index.html").then(cached => cached || fetch("index.html")));
    }
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const CACHE_NAME = "ruf-ministry-hub-v15-profile-action-sheets";
const ASSETS = [
  "index.html",
  "ruf-ministry-hub.html",
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
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const CACHE_PREFIX = "ruf-ministry-hub-";
const CACHE_NAME = "ruf-ministry-hub-v30-quick-grab-backend-wiring";
const APP_SHELL = "ruf-ministry-hub.html";
const ASSETS = [
  "index.html",
  APP_SHELL,
  "ruf-ministry-hub.webmanifest",
  "ruf-ministry-hub-icon-180.png",
  "ruf-ministry-hub-icon-192.png",
  "ruf-ministry-hub-icon-512.png"
];

async function cacheRequiredAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(ASSETS.map(async asset => {
    const request = new Request(asset, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Failed to cache ${asset}: ${response.status}`);
    await cache.put(request, response);
  }));
}

async function cachedOrNetwork(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch (error) {
    if (request.mode === "navigate" || request.destination === "document") {
      const shell = await caches.match(APP_SHELL);
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    cacheRequiredAssets()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(cachedOrNetwork(event.request));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

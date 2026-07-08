const CACHE_PREFIX = "ruf-ministry-hub-";
const CACHE_NAME = "ruf-ministry-hub-v31-offline-cache-hardening";
const APP_SHELL = "ruf-ministry-hub.html";
const ASSETS = [
  "./",
  "index.html",
  APP_SHELL,
  "ruf-ministry-hub.webmanifest",
  "ruf-ministry-hub-icon.svg",
  "ruf-ministry-hub-icon-180.png",
  "ruf-ministry-hub-icon-192.png",
  "ruf-ministry-hub-icon-512.png"
];

async function cacheAsset(cache, asset) {
  try {
    const response = await fetch(new Request(asset, { cache: "reload" }));
    if (response && response.ok) await cache.put(asset, response.clone());
  } catch (error) {
    // Do not fail the whole service-worker install because one optional icon or asset was unavailable.
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map(asset => cacheAsset(cache, asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(APP_SHELL, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(APP_SHELL)) || (await cache.match("index.html")) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(cacheFirstAsset(event.request));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

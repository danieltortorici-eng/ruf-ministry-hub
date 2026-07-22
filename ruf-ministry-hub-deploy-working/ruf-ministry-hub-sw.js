const CACHE_PREFIX = "ruf-ministry-hub-";
const CACHE_NAME = "ruf-ministry-hub-v93-calm-os-core-v42";
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

async function cacheAsset(cache, asset, required = false) {
  try {
    const response = await fetch(new Request(asset, { cache: "reload" }));
    if (!response || !response.ok) {
      if (required) throw new Error(`Required app shell could not be fetched: ${asset}`);
      return false;
    }
    await cache.put(asset, response.clone());
    return true;
  } catch (error) {
    if (required) throw error;
    // Optional icons and metadata do not block an otherwise valid app shell.
    return false;
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheAsset(cache, APP_SHELL, true);
    await Promise.all(ASSETS.filter(asset => asset !== APP_SHELL).map(asset => cacheAsset(cache, asset)));
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

async function fetchWithTimeout(request, timeoutMs = 3500) {
  if (typeof AbortController !== "function") return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request);
    if (!response || !response.ok) throw new Error("Network navigation response was not usable.");
    if (response && response.ok) {
      try {
        await cache.put(APP_SHELL, response.clone());
      } catch (cacheError) {
        // A fresh response is still safer than returning an older shell.
      }
    }
    return response;
  } catch (error) {
    return (await cache.match(APP_SHELL, { ignoreSearch: true }))
      || (await cache.match("index.html", { ignoreSearch: true }))
      || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.put(request, response.clone());
    } catch (cacheError) {
      // Return the fresh asset even when the cache is full.
    }
  }
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(cacheFirstAsset(event.request));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

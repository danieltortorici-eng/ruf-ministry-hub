const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(repoRoot, "ruf-ministry-hub-deploy-working/ruf-ministry-hub.html"), "utf8");
const workerPath = path.join(repoRoot, "ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js");
const workerSource = fs.readFileSync(workerPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

const appVersion = appSource.match(/const APP_VERSION = "([^"]+)";/)?.[1] || "";
const cacheName = workerSource.match(/const CACHE_NAME = "([^"]+)";/)?.[1] || "";
const releaseSlug = packageJson.version.replace(/^\d{4}\.\d{2}\.\d{2}-/, "");

assert.equal(appVersion, packageJson.version, "APP_VERSION and package identity must match exactly");
assert.match(cacheName, new RegExp(`^ruf-ministry-hub-v\\d+-${releaseSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "cache identity must carry the same release slug");
console.log("PASS app, package, and cache identities describe one Calm release");

class FakeRequest {
  constructor(input, options = {}) {
    const source = typeof input === "string" ? input : input.url;
    this.url = new URL(source, "https://calm.synthetic/").href;
    this.method = options.method || input?.method || "GET";
    this.mode = options.mode || input?.mode || "same-origin";
    this.destination = options.destination || input?.destination || "";
  }
}

class FakeResponse {
  constructor(body = "", options = {}) {
    this.body = body;
    this.status = options.status === undefined ? 200 : options.status;
    this.ok = this.status >= 200 && this.status < 300;
  }

  clone() {
    return new FakeResponse(this.body, { status: this.status });
  }

  static error() {
    return new FakeResponse("", { status: 0 });
  }
}

function cacheKey(input) {
  return new URL(typeof input === "string" ? input : input.url, "https://calm.synthetic/").href;
}

function createRuntime(options = {}) {
  const listeners = new Map();
  const events = [];
  const initialKeys = options.initialKeys || [cacheName];
  const cacheEntries = new Map();
  if (options.cachedShell) cacheEntries.set(cacheKey("ruf-ministry-hub.html"), options.cachedShell);
  const caches = {
    async open(name) {
      return {
        async put(request, response) {
          cacheEntries.set(cacheKey(request), response);
        },
        async match(request) {
          return cacheEntries.get(cacheKey(request)) || null;
        }
      };
    },
    async keys() {
      return [...initialKeys];
    },
    async delete(name) {
      events.push(`delete:${name}`);
      return true;
    },
    async match(request) {
      return cacheEntries.get(cacheKey(request)) || null;
    }
  };
  const self = {
    location: { origin: "https://calm.synthetic" },
    clients: {
      async claim() {
        events.push("claim");
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {}
  };
  const fetch = options.fetchImpl || (async () => new FakeResponse("network"));
  vm.runInNewContext(workerSource, {
    AbortController,
    Request: FakeRequest,
    Response: FakeResponse,
    URL,
    caches,
    clearTimeout,
    console,
    fetch,
    self,
    setTimeout
  }, { filename: workerPath });
  return { events, listeners };
}

function dispatchExtendable(runtime, type) {
  let pending;
  const listener = runtime.listeners.get(type);
  assert.ok(listener, `${type} listener must exist`);
  listener({ waitUntil(value) { pending = Promise.resolve(value); } });
  assert.ok(pending, `${type} must extend its lifetime`);
  return pending;
}

function dispatchFetch(runtime, request) {
  let response;
  const listener = runtime.listeners.get("fetch");
  assert.ok(listener, "fetch listener must exist");
  listener({
    request,
    respondWith(value) {
      response = Promise.resolve(value);
    }
  });
  return response;
}

async function run() {
  const staleOne = "ruf-ministry-hub-v1-stale";
  const staleTwo = "ruf-ministry-hub-v2-stale";
  const unrelated = "other-app-cache";
  const activation = createRuntime({ initialKeys: [unrelated, staleOne, cacheName, staleTwo] });
  await dispatchExtendable(activation, "activate");
  assert.deepEqual(activation.events, [`delete:${staleOne}`, `delete:${staleTwo}`, "claim"]);
  console.log("PASS activation deletes only stale RUF caches, retains current/unrelated caches, then claims clients");

  const bypass = createRuntime();
  assert.equal(dispatchFetch(bypass, new FakeRequest("https://calm.synthetic/api/ai/health")), undefined);
  assert.equal(dispatchFetch(bypass, new FakeRequest("https://calm.synthetic/api/calendar/events")), undefined);
  assert.equal(dispatchFetch(bypass, new FakeRequest("https://calm.synthetic/ruf-ministry-hub.html", { method: "POST" })), undefined);
  assert.equal(dispatchFetch(bypass, new FakeRequest("https://external.synthetic/app.js")), undefined);
  console.log("PASS every same-origin /api route, non-GET request, and cross-origin request bypasses service-worker interception");

  const cachedShell = new FakeResponse("cached shell");
  const cachedOffline = createRuntime({
    cachedShell,
    fetchImpl: async () => { throw new Error("synthetic offline"); }
  });
  const cachedResult = await dispatchFetch(cachedOffline, new FakeRequest("https://calm.synthetic/app?offline=1", {
    mode: "navigate",
    destination: "document"
  }));
  assert.equal(cachedResult, cachedShell);
  console.log("PASS offline document navigation returns the cached Calm shell when available");

  const emptyOffline = createRuntime({
    fetchImpl: async () => { throw new Error("synthetic offline"); }
  });
  const emptyResult = await dispatchFetch(emptyOffline, new FakeRequest("https://calm.synthetic/app?offline=1", {
    mode: "navigate",
    destination: "document"
  }));
  assert.equal(emptyResult.status, 0);
  assert.equal(emptyResult.ok, false);
  console.log("PASS offline navigation without a cached shell fails closed instead of returning unrelated HTML");

  console.log("All Calm service-worker boundary checks passed.");
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

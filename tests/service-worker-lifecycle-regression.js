const fs = require("fs");
const path = require("path");
const vm = require("vm");

const workerPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js");
const workerSource = fs.readFileSync(workerPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

const listeners = new Map();
const cachedAssets = [];
let skipWaitingCalls = 0;

class FakeRequest {
  constructor(url, options = {}) {
    this.url = String(url);
    this.options = options;
    this.method = options.method || "GET";
    this.mode = options.mode || "cors";
    this.destination = options.destination || "script";
  }
}

let runtimePutResolve = null;
let delayRuntimePut = false;
let rejectNetwork = false;
const cachedAppShell = { ok: true, source: "cached-app-shell" };

const context = vm.createContext({
  Request: FakeRequest,
  Response: { error: () => ({ ok: false }) },
  URL,
  console,
  fetch: async request => {
    if (rejectNetwork) throw new Error("synthetic offline");
    return {
      ok: true,
      clone: () => ({ ok: true, request })
    };
  },
  caches: {
    async open() {
      return {
        async put(asset) {
          cachedAssets.push(String(asset?.url || asset));
          if (delayRuntimePut && asset instanceof FakeRequest) {
            await new Promise(resolve => { runtimePutResolve = resolve; });
          }
        },
        async match(asset) {
          return String(asset?.url || asset) === "ruf-ministry-hub.html" ? cachedAppShell : null;
        }
      };
    },
    async keys() {
      return [];
    },
    async delete() {
      return true;
    },
    async match() {
      return null;
    }
  },
  self: {
    location: { origin: "https://synthetic.invalid" },
    clients: { claim: async () => undefined },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    skipWaiting() {
      skipWaitingCalls += 1;
      return Promise.resolve();
    }
  }
});

vm.runInContext(workerSource, context, { filename: workerPath });

async function run() {
  assert(listeners.has("install"), "service worker exposes an install lifecycle handler");
  assert(listeners.has("message"), "service worker exposes an explicit update-message handler");

  let installWork;
  listeners.get("install")({
    waitUntil(promise) {
      installWork = Promise.resolve(promise);
    }
  });
  await installWork;

  assert(cachedAssets.includes("ruf-ministry-hub.html"), "install caches the app shell");
  assert(skipWaitingCalls === 0, "install leaves a newer worker waiting instead of activating it automatically");

  listeners.get("message")({ data: { type: "UNRELATED_MESSAGE" } });
  assert(skipWaitingCalls === 0, "unrelated messages cannot activate a waiting worker");

  listeners.get("message")({ data: { type: "SKIP_WAITING" } });
  assert(skipWaitingCalls === 1, "the explicit app update message activates the waiting worker once");

  delayRuntimePut = true;
  let responsePromise;
  let responseSettled = false;
  listeners.get("fetch")({
    request: new FakeRequest("https://synthetic.invalid/ruf-ministry-hub-icon.svg"),
    respondWith(promise) {
      responsePromise = Promise.resolve(promise).then(value => {
        responseSettled = true;
        return value;
      });
    }
  });
  for (let attempt = 0; attempt < 10 && typeof runtimePutResolve !== "function"; attempt += 1) {
    await Promise.resolve();
  }
  assert(responseSettled === false && typeof runtimePutResolve === "function", "runtime fetch waits for its cache write to settle");
  runtimePutResolve();
  await responsePromise;
  assert(responseSettled === true, "runtime fetch completes after the cache write");

  rejectNetwork = true;
  let navigationPromise;
  listeners.get("fetch")({
    request: new FakeRequest("https://synthetic.invalid/app?offline=1", { mode: "navigate", destination: "document" }),
    respondWith(promise) {
      navigationPromise = Promise.resolve(promise);
    }
  });
  assert(await navigationPromise === cachedAppShell, "offline document navigation falls back to the cached app shell");

  let apiResponded = false;
  listeners.get("fetch")({
    request: new FakeRequest("https://synthetic.invalid/api/ai/quick-grab"),
    respondWith() {
      apiResponded = true;
    }
  });
  assert(apiResponded === false, "service worker leaves same-origin API requests to the network without respondWith");

  console.log("All service-worker lifecycle regression checks passed.");
}

run().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});

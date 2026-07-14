const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const workerPath = path.resolve(repoRoot, "cloudflare/ai-rate-limiter/worker.js");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function loadWorker() {
  const source = fs.readFileSync(workerPath, "utf8")
    .replace(/import\s+\{\s*DurableObject\s*\}\s+from\s+"cloudflare:workers";?/, "")
    .replace("export class AiRateLimiter", "class AiRateLimiter")
    .replace("export default", "const worker =");
  class DurableObject {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  const context = { DurableObject, Request, Response, URL, console };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__exports = { AiRateLimiter, worker };`, context, { filename: workerPath });
  return context.__exports;
}

function syntheticContext() {
  const values = new Map();
  return {
    values,
    storage: {
      async get(key) {
        return values.get(key);
      },
      async put(key, value) {
        values.set(key, value);
      }
    }
  };
}

async function run() {
  const { AiRateLimiter, worker } = loadWorker();
  const ctx = syntheticContext();
  const firstInstance = new AiRateLimiter(ctx, {});

  const first = await firstInstance.check(2, 60);
  const second = await firstInstance.check(2, 60);
  const denied = await firstInstance.check(2, 60);
  assert(first.allowed === true, "durable limiter allows the first request in a fixed window");
  assert(second.allowed === true, "durable limiter allows requests up to the configured bound");
  assert(denied.allowed === false, "durable limiter denies requests beyond the configured bound");

  const secondInstance = new AiRateLimiter(ctx, {});
  const stillDenied = await secondInstance.check(2, 60);
  assert(stillDenied.allowed === false, "durable limiter persists counts across object instance recreation");

  const stored = ctx.values.get("fixed-window");
  ctx.values.set("fixed-window", { ...stored, startedAt: Date.now() - stored.windowMs - 1 });
  const reset = await secondInstance.check(2, 60);
  assert(reset.allowed === true, "durable limiter starts a new bounded window after expiry");

  const publicResponse = await worker.fetch(new Request("https://example.test/"));
  assert(publicResponse.status === 404, "rate-limiter support Worker exposes no public application endpoint");
  console.log("All durable AI rate-limiter regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

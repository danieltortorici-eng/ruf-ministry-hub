const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

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
  const context = { DurableObject, Request, Response, URL, console, crypto: nodeCrypto.webcrypto };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__exports = { AiRateLimiter, worker };`, context, { filename: workerPath });
  return context.__exports;
}

function syntheticContext() {
  const values = new Map();
  return {
    values,
    async blockConcurrencyWhile(callback) {
      return callback();
    },
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

  const grant = await secondInstance.issuePilotGrant("principal-hash", "policy-v1", "fixture-one", 120);
  assert(grant.ok === true && grant.grantId && grant.expiresAt > Date.now(), "pilot limiter issues a short-lived metadata-only grant");
  const reservation = await secondInstance.consumePilotGrantAndReserve(grant.grantId, "principal-hash", "policy-v1", "fixture-one", {
    minuteLimit: 2,
    dayLimit: 5,
    lifetimeLimit: 25,
    spendingCeilingMicros: 5_000_000,
    reservedCostPerAttemptMicros: 10_000
  });
  assert(reservation.ok === true && reservation.attemptNumber === 1, "pilot limiter atomically consumes one grant and reserves one attempt");
  const replay = await secondInstance.consumePilotGrantAndReserve(grant.grantId, "principal-hash", "policy-v1", "fixture-one", {});
  assert(replay.ok === false && replay.code === "pilot_grant_invalid", "pilot limiter rejects grant replay");

  const secondGrant = await secondInstance.issuePilotGrant("principal-hash", "policy-v1", "fixture-two", 120);
  const secondReservation = await secondInstance.consumePilotGrantAndReserve(secondGrant.grantId, "principal-hash", "policy-v1", "fixture-two", { minuteLimit: 2, dayLimit: 5, lifetimeLimit: 25, spendingCeilingMicros: 5_000_000, reservedCostPerAttemptMicros: 10_000 });
  assert(secondReservation.ok === true, "pilot limiter permits the second attempt within the minute cap");
  const thirdGrant = await secondInstance.issuePilotGrant("principal-hash", "policy-v1", "fixture-three", 120);
  const minuteDenied = await secondInstance.consumePilotGrantAndReserve(thirdGrant.grantId, "principal-hash", "policy-v1", "fixture-three", { minuteLimit: 2, dayLimit: 5, lifetimeLimit: 25, spendingCeilingMicros: 5_000_000, reservedCostPerAttemptMicros: 10_000 });
  assert(minuteDenied.ok === false && minuteDenied.code === "pilot_minute_limit", "pilot limiter enforces the two-per-minute cap");
  const pilotState = ctx.values.get("quick-grab-fictional-pilot");
  assert(JSON.stringify(pilotState).includes("principal-hash") && !JSON.stringify(pilotState).includes("Fictional example"), "pilot limiter stores metadata only and no fixture content");

  const publicResponse = await worker.fetch(new Request("https://example.test/"));
  assert(publicResponse.status === 404, "rate-limiter support Worker exposes no public application endpoint");
  console.log("All durable AI rate-limiter regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

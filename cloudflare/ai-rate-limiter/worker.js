import { DurableObject } from "cloudflare:workers";

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_WINDOW_SECONDS = 10;
const MAX_WINDOW_SECONDS = 3600;
const PILOT_STATE_KEY = "quick-grab-fictional-pilot";

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export class AiRateLimiter extends DurableObject {
  async exclusive(callback) {
    if (typeof this.ctx.blockConcurrencyWhile === "function") return this.ctx.blockConcurrencyWhile(callback);
    return callback();
  }

  async check(requestedLimit, requestedWindowSeconds) {
    const limit = boundedInteger(requestedLimit, 10, MIN_LIMIT, MAX_LIMIT);
    const windowSeconds = boundedInteger(requestedWindowSeconds, 60, MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS);
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const stored = await this.ctx.storage.get("fixed-window");
    const startsNewWindow = !stored
      || !Number.isFinite(stored.startedAt)
      || stored.windowMs !== windowMs
      || now >= stored.startedAt + stored.windowMs;

    if (startsNewWindow) {
      await this.ctx.storage.put("fixed-window", { startedAt: now, windowMs, count: 1 });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: windowSeconds };
    }

    const retryAfter = Math.max(1, Math.ceil((stored.startedAt + stored.windowMs - now) / 1000));
    if (stored.count >= limit) {
      return { allowed: false, remaining: 0, retryAfter };
    }

    const count = stored.count + 1;
    await this.ctx.storage.put("fixed-window", { ...stored, count });
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfter };
  }

  async issuePilotGrant(principalHash, policyVersion, fixtureId, ttlSeconds = 120) {
    return this.exclusive(async () => {
      const now = Date.now();
      const ttl = boundedInteger(ttlSeconds, 120, 30, 120);
      const state = await this.ctx.storage.get(PILOT_STATE_KEY) || { grants: {}, attempts: [] };
      const grantId = crypto.randomUUID();
      const activeGrants = Object.entries(state.grants || {}).filter(([, grant]) => grant.expiresAt > now && grant.used !== true).slice(-49);
      const grants = Object.fromEntries(activeGrants);
      grants[grantId] = {
        principalHash: String(principalHash),
        policyVersion: String(policyVersion),
        fixtureId: String(fixtureId),
        expiresAt: now + ttl * 1000,
        used: false
      };
      await this.ctx.storage.put(PILOT_STATE_KEY, { ...state, grants });
      return { ok: true, grantId, expiresAt: now + ttl * 1000 };
    });
  }

  async consumePilotGrantAndReserve(grantId, principalHash, policyVersion, fixtureId, limits = {}) {
    return this.exclusive(async () => {
      const now = Date.now();
      const state = await this.ctx.storage.get(PILOT_STATE_KEY) || { grants: {}, attempts: [] };
      const grant = state.grants?.[String(grantId)];
      if (!grant || grant.used === true || grant.expiresAt <= now
        || grant.principalHash !== String(principalHash)
        || grant.policyVersion !== String(policyVersion)
        || grant.fixtureId !== String(fixtureId)) {
        return { ok: false, code: "pilot_grant_invalid" };
      }
      const minuteLimit = boundedInteger(limits.minuteLimit, 2, 1, 10);
      const dayLimit = boundedInteger(limits.dayLimit, 5, 1, 100);
      const lifetimeLimit = boundedInteger(limits.lifetimeLimit, 25, 1, 1000);
      const ceiling = boundedInteger(limits.spendingCeilingMicros, 5_000_000, 1, 100_000_000);
      const reserve = boundedInteger(limits.reservedCostPerAttemptMicros, 10_000, 1, ceiling);
      const attempts = Array.isArray(state.attempts) ? state.attempts.filter(attempt => Number.isFinite(attempt.at)) : [];
      const minuteCount = attempts.filter(attempt => attempt.at > now - 60_000).length;
      const dayCount = attempts.filter(attempt => attempt.at > now - 86_400_000).length;
      const lifetimeCount = attempts.length;
      const reservedMicros = attempts.reduce((sum, attempt) => sum + (Number(attempt.reservedMicros) || 0), 0);
      let code = "";
      if (minuteCount >= minuteLimit) code = "pilot_minute_limit";
      else if (dayCount >= dayLimit) code = "pilot_day_limit";
      else if (lifetimeCount >= lifetimeLimit) code = "pilot_lifetime_limit";
      else if (reservedMicros + reserve > ceiling) code = "pilot_spending_ceiling";
      state.grants[grantId] = { ...grant, used: true };
      if (code) {
        await this.ctx.storage.put(PILOT_STATE_KEY, state);
        return { ok: false, code };
      }
      attempts.push({ at: now, reservedMicros: reserve });
      await this.ctx.storage.put(PILOT_STATE_KEY, { ...state, attempts });
      return { ok: true, attemptNumber: lifetimeCount + 1, reservedMicros: reservedMicros + reserve };
    });
  }
}

export default {
  async fetch() {
    return json({ ok: false, error: "not_found" }, 404);
  }
};

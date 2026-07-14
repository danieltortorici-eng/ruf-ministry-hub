import { DurableObject } from "cloudflare:workers";

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_WINDOW_SECONDS = 10;
const MAX_WINDOW_SECONDS = 3600;

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
}

export default {
  async fetch() {
    return json({ ok: false, error: "not_found" }, 404);
  }
};

export const QUICK_GRAB_PILOT_POLICY = Object.freeze({
  id: "ai-qg-pilot-01",
  version: "2026-07-22.1",
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  maxOutputTokens: 800,
  grantTtlSeconds: 120,
  minuteLimit: 2,
  dayLimit: 5,
  lifetimeLimit: 25,
  spendingCeilingMicros: 5_000_000,
  reservedCostPerAttemptMicros: 10_000
});

export const QUICK_GRAB_PILOT_FIXTURES = Object.freeze([
  Object.freeze({ id: "fixture-welcome", title: "Welcome follow-up", rawContent: "Fictional example: Avery Example visited the welcome table. Suggest a kind follow-up for tomorrow.", todayISO: "2026-07-22", tags: ["Follow-up"], urgency: "Soon" }),
  Object.freeze({ id: "fixture-prayer", title: "Prayer reminder", rawContent: "Fictional example: Jordan Sample asked for prayer about a practice presentation next week.", todayISO: "2026-07-22", tags: ["Prayer"], urgency: "Normal" }),
  Object.freeze({ id: "fixture-meeting", title: "Meeting recap", rawContent: "Fictional example: The Sample Team discussed an August welcome night and needs a simple next-step summary.", todayISO: "2026-07-22", tags: ["Meeting"], urgency: "Normal" }),
  Object.freeze({ id: "fixture-task", title: "Supply task", rawContent: "Fictional example: Pick up name tags and markers for the sample welcome event by Friday.", todayISO: "2026-07-22", tags: ["Task"], urgency: "Soon" }),
  Object.freeze({ id: "fixture-note", title: "Conversation note", rawContent: "Fictional example: Riley Placeholder enjoys hiking and is interested in the sample small group.", todayISO: "2026-07-22", tags: ["Note"], urgency: "Normal" })
]);

export const QUICK_GRAB_PILOT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["summary", "category", "suggestedNextStep", "confidence", "warnings"],
  properties: {
    summary: { type: "string" },
    category: { type: "string", enum: ["follow_up", "prayer", "meeting", "task", "note", "no_action"] },
    suggestedNextStep: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" }, maxItems: 3 }
  }
});

export function quickGrabPilotFixture(fixtureId) {
  return QUICK_GRAB_PILOT_FIXTURES.find(fixture => fixture.id === fixtureId) || null;
}

export function quickGrabPilotConfiguration(request, env = {}) {
  const url = new URL(request.url);
  const configuredHost = String(env.AI_QG_PILOT_PREVIEW_HOST || "").trim().toLowerCase();
  const expiresAt = Date.parse(String(env.AI_QG_PILOT_EXPIRES_AT || ""));
  const enabled = env.AI_QG_PILOT_ENABLED === "true";
  const policyCurrent = env.AI_QG_PILOT_POLICY_VERSION === QUICK_GRAB_PILOT_POLICY.version;
  const previewHost = Boolean(configuredHost)
    && configuredHost.endsWith(".pages.dev")
    && url.hostname.toLowerCase() === configuredHost;
  const unexpired = Number.isFinite(expiresAt) && Date.now() < expiresAt;
  return {
    available: enabled && policyCurrent && previewHost && unexpired,
    enabled,
    policyCurrent,
    previewHost,
    unexpired
  };
}

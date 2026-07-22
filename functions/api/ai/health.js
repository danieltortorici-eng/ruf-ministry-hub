import { QUICK_GRAB_PILOT_POLICY, quickGrabPilotConfiguration } from "./quick-grab-pilot-policy.js";

const DEFAULT_MODEL = "gpt-5.6";
const DEFAULT_REASONING_EFFORT = "low";

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestGet({ request = new Request("https://invalid.example"), env = {} }) {
  const hasOpenAIKey = Boolean(env.OPENAI_API_KEY);
  const mockRequested = env.AI_MOCK_MODE !== "false";
  const tokenProtected = Boolean(env.RUF_HUB_AI_ACCESS_TOKEN);
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").trim().replace(/\/+$/, "");
  const accessProtected = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(teamDomain)
    && Boolean(String(env.CF_ACCESS_AUD || "").trim());
  const authenticationConfigured = tokenProtected || accessProtected;
  const durableRateLimitConfigured = Boolean(env.AI_RATE_LIMITER && typeof env.AI_RATE_LIMITER.idFromName === "function");
  const realModeRequested = !mockRequested && hasOpenAIKey;
  const readyForRealMode = realModeRequested && authenticationConfigured && durableRateLimitConfigured;
  const effectiveMode = readyForRealMode ? "real" : realModeRequested ? "blocked" : "mock";
  const configurationIssues = [];
  if (realModeRequested && !authenticationConfigured) configurationIssues.push("authentication_not_configured");
  if (realModeRequested && !durableRateLimitConfigured) configurationIssues.push("rate_limit_not_configured");
  const pilotConfiguration = quickGrabPilotConfiguration(request, env);
  const pilotReady = pilotConfiguration.available && accessProtected && durableRateLimitConfigured && hasOpenAIKey;

  return json({
    ok: effectiveMode !== "blocked",
    usesFunctions: true,
    responsesApi: true,
    effectiveMode,
    mockMode: effectiveMode === "mock",
    realModeBlocked: effectiveMode === "blocked",
    readyForRealMode,
    hasOpenAIKey,
    authenticationConfigured,
    accessProtected,
    tokenProtected,
    durableRateLimitConfigured,
    configurationIssues,
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
    storedServerSide: false,
    fictionalQuickGrabPilot: {
      policyVersion: QUICK_GRAB_PILOT_POLICY.version,
      model: QUICK_GRAB_PILOT_POLICY.model,
      defaultOff: true,
      availableOnThisHost: pilotReady,
      accessRequired: true,
      providerConfigured: hasOpenAIKey,
      durableLimiterConfigured: durableRateLimitConfigured,
      storesProposals: false,
      mutatesRecords: false
    }
  }, effectiveMode === "blocked" ? 503 : 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

const DEFAULT_MODEL = "gpt-5.6";
const DEFAULT_REASONING_EFFORT = "low";

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet({ env = {} }) {
  return json({
    ok: true,
    usesFunctions: true,
    responsesApi: true,
    mockMode: env.AI_MOCK_MODE === "true",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    tokenProtected: Boolean(env.RUF_HUB_AI_ACCESS_TOKEN),
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
    storedServerSide: false
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

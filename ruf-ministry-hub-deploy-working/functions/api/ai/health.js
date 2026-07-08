const DEFAULT_MODEL = "gpt-4.1-mini";

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
    mockMode: env.AI_MOCK_MODE === "true",
    hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL || DEFAULT_MODEL
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

# OpenAI Integration

Last reviewed: 2026-07-13.

RUF Ministry Hub uses OpenAI only in the Cloudflare Pages Function at `/api/ai/quick-grab`. The browser app never receives the OpenAI API key. The function turns one Quick Grab plus a small approved candidate-person list into a proposed local action plan; the app still requires human review before anything becomes a record.

## Official References

- Latest model guidance: https://developers.openai.com/api/docs/guides/latest-model
- Responses API migration: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Reasoning models: https://developers.openai.com/api/docs/guides/reasoning
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Pricing: https://developers.openai.com/api/docs/pricing
- Rate limits: https://developers.openai.com/api/docs/guides/rate-limits

API billing is separate from any ChatGPT subscription. Check the OpenAI pricing page before turning on real requests for production volume.

## Runtime Defaults

- `OPENAI_MODEL`: defaults to `gpt-5.6`.
- `OPENAI_REASONING_EFFORT`: defaults to `low`.
- `OPENAI_TIMEOUT_MS`: defaults to `12000`, capped by the function.
- `OPENAI_MAX_RETRIES`: defaults to `1`, capped by the function.
- `OPENAI_RETRY_BASE_MS`: defaults to `250`.
- `AI_MOCK_MODE=true`: forces the safe local mock proposal path.
- Missing `OPENAI_API_KEY`: also uses the safe local mock proposal path.
- `RUF_HUB_AI_ACCESS_TOKEN`: optional request token. When set, callers must send `X-RUF-HUB-AI-Token`.

The current request uses the OpenAI Responses API with `store:false`, strict structured output through `text.format`, and no `temperature`. Reasoning settings are sent only for reasoning-capable model names.

## Local Secrets

Use `.env.local` for local development secrets. It is intentionally ignored by git. Use `.env.example` as the safe template and never paste a real key into tracked files, frontend HTML, tests, docs, screenshots, or issue comments.

For Cloudflare Pages, set runtime variables and secrets in the Pages project settings. Production should use Cloudflare environment secrets for `OPENAI_API_KEY`; do not deploy local `.env.local`.

## Data Boundary

The quick-grab function validates and minimizes the request before sending anything to OpenAI:

- accepts only known top-level request fields;
- caps body size, raw Quick Grab length, total fields, candidate count, and candidate field length;
- rejects prototype-pollution keys;
- sends candidate people with only `id`, `name`, `personType`, and `fraternitySorority`;
- treats Quick Grab text as untrusted data that cannot override the system instructions;
- returns `storedServerSide:false` and avoids storing request bodies server-side.

Errors return safe codes and messages. The function does not log the Quick Grab body, candidate details, or secrets.

## Verification

Run the focused AI checks:

```sh
node tests/ai-functions-regression.js
```

Run deployment boundary checks:

```sh
node tests/deployment-config-regression.js
```

Run syntax checks for both source and deploy copies before deployment:

```sh
node --check functions/api/ai/quick-grab.js
node --check ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js
```

Optional real-API QA should be done against a development Pages environment with a low-volume sample Quick Grab and `AI_MOCK_MODE=false`. Confirm `/api/ai/health` reports `hasOpenAIKey:true`, `responsesApi:true`, and `storedServerSide:false`.

## Rollback

Set `AI_MOCK_MODE=true` or remove `OPENAI_API_KEY` to stop external OpenAI requests while keeping the app usable. The endpoint will return local mock proposals, and users can still approve or reject suggestions locally.

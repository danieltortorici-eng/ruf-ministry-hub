# Production AI Safety Runbook

This runbook lists Cloudflare changes that require Daniel's explicit approval. The code patch does not create resources, set secrets, redeploy, or enable real OpenAI traffic.

## Immediate containment

Until every real-mode prerequisite below exists, keep production in mock mode:

1. Cloudflare dashboard > Workers & Pages > the RUF Ministry Hub Pages project > Settings > Variables and Secrets > Production.
2. Set `AI_MOCK_MODE` to plaintext value `true`, or remove `OPENAI_API_KEY` from Production.
3. Save and redeploy the Pages production branch so the runtime receives the change.
4. Check `/api/ai/health`. Expected: `effectiveMode` is `mock` and `readyForRealMode` is `false`.

Changing a production variable, removing a secret, or redeploying requires Daniel approval.

## Approved browser authentication path

Cloudflare Access is the supported browser path; the browser stores no app secret.

1. Cloudflare Zero Trust dashboard > Access controls > Applications > Add an application > Self-hosted.
2. Add the production hostname used by Daniel. Protect the whole app hostname if practical; otherwise protect `/api/ai/quick-grab` at minimum.
3. Add an Allow policy limited to Daniel's identity provider account. Require MFA if the identity provider supports it.
4. Save the application. From the application > Additional settings, copy the Application Audience (AUD) Tag.
5. Copy the Zero Trust team domain in the exact form `https://TEAM-NAME.cloudflareaccess.com`.
6. Pages project > Settings > Variables and Secrets > Production: add plaintext `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` with those values.
7. Apply equivalent protection to every production hostname that Daniel will use. An unprotected hostname still cannot call real mode because the Function independently validates the Access JWT, but it will not provide a usable browser session.

The Function validates the `Cf-Access-Jwt-Assertion` RS256 signature against the team JWKS plus issuer, audience, expiry, not-before, and subject claims. A header's presence alone is never trusted.

## Durable rate limiter

Pages cannot define a Durable Object directly. The checked-in support Worker under `cloudflare/ai-rate-limiter/` owns the namespace and intentionally serves `404` on its public Worker handler.

1. After Daniel approves creating one Cloudflare Worker and Durable Object namespace, deploy the checked-in `cloudflare/ai-rate-limiter/wrangler.jsonc` configuration from an authenticated administrative environment. Do not paste or add any secret to that Worker.
2. Cloudflare dashboard > Workers & Pages > the RUF Ministry Hub Pages project > Settings > Bindings > Production > Add > Durable Object.
3. Set Variable name exactly to `AI_RATE_LIMITER`.
4. Select the `AiRateLimiter` namespace owned by the `ruf-hub-ai-rate-limiter` Worker.
5. Pages project > Settings > Variables and Secrets > Production: set plaintext `AI_RATE_LIMIT_MAX_REQUESTS=10` and `AI_RATE_LIMIT_WINDOW_SECONDS=60` unless Daniel approves different bounded values.
6. Save and redeploy the Pages production branch.

The Function fails with `503` before reading ministry content or calling OpenAI if this binding is absent or unavailable. Limits are durable, strongly consistent fixed windows sharded by a hash of the authenticated principal.

## Secrets and real-mode switch

Only after Access and the Durable Object binding are working:

1. Pages project > Settings > Variables and Secrets > Production.
2. Add `OPENAI_API_KEY` as an encrypted Secret, never as plaintext.
3. For browser use, leave `RUF_HUB_AI_ACCESS_TOKEN` unset. For approved non-browser API clients only, create a high-entropy value and add it as an encrypted Secret; send it only in `X-RUF-HUB-AI-Token` from that trusted client.
4. Set plaintext `AI_MOCK_MODE=false`.
5. Keep model/time/retry values at the reviewed defaults unless Daniel approves a change.
6. Save and redeploy production.
7. While signed into the protected hostname, check `/api/ai/health`. Required result: `effectiveMode:"real"`, `readyForRealMode:true`, `authenticationConfigured:true`, `accessProtected:true` (or `tokenProtected:true` for an API-only deployment), and `durableRateLimitConfigured:true`.
8. Send one synthetic Quick Grab. Confirm a `200` real proposal. Then test a signed-out request and confirm `401` with `externalDataSent:false`.

Never put the value of `OPENAI_API_KEY`, `RUF_HUB_AI_ACCESS_TOKEN`, a Cloudflare service token, or any equivalent credential in HTML, JavaScript, a service worker, IndexedDB, localStorage, query strings, tests, docs, or screenshots.

## Rollback

Set `AI_MOCK_MODE=true` and redeploy. If immediate containment is needed, also remove the Production `OPENAI_API_KEY`. Verify `/api/ai/health` reports `effectiveMode:"mock"`; no request should report `externalDataSent:true`.

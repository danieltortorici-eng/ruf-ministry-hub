# RUF Ministry Hub Deployment Notes

The canonical repository is `https://github.com/danieltortorici-eng/ruf-ministry-hub`. Use the GitHub-first release, rollback, and emergency Quick Grab procedures in `docs/canonical-repository-guide.md`; this file records the concrete production boundary and audit checklist.

## Correct Cloudflare Pages Setup

Use Cloudflare Pages for this project, not a separate Worker. Do not rely on the accidental `workers.dev` URL; test the app at the Cloudflare Pages URL.

Recommended Cloudflare Pages settings:

- Root directory: `ruf-ministry-hub-deploy-working`
- Build command: blank
- Deploy command: blank
- Build output directory: `.`
- Functions directory: `functions`
- Do not use `npx wrangler deploy`.
- Do not use the `workers.dev` URL.
- Test the app at the Cloudflare Pages URL.
- Test AI health at `https://YOUR-PAGES-URL/api/ai/health`.

The intended routine release path is a reviewed merge to the canonical repository's configured Pages production branch, normally `main`. Confirm the actual production branch in the Cloudflare dashboard before release. Do not substitute a direct upload or separate Worker deployment for the Git-backed Pages project.

This makes the public site root contain only the PWA files and Cloudflare Pages special files, while Pages Functions remain under `functions/`.

If Cloudflare shows a Deploy command of `npx wrangler deploy`, remove it. That command creates a separate Worker deployment and is not the RUF Ministry Hub Pages app.

## Public Files

The deploy root should contain these public app files:

- `index.html`
- `ruf-ministry-hub.html`
- `ruf-ministry-hub.webmanifest`
- `ruf-ministry-hub-sw.js`
- `ruf-ministry-hub-icon-180.png`
- `ruf-ministry-hub-icon-192.png`
- `ruf-ministry-hub-icon-512.png`
- `ruf-ministry-hub-icon.svg`
- `_redirects`

## Pages Functions

Keep these functions in the deploy root:

- `functions/api/ai/health.js`
- `functions/api/ai/quick-grab.js`

Expected routes:

- `/api/ai/health`
- `/api/ai/quick-grab`

Test AI health at `/api/ai/health` on the Pages URL, not on a `workers.dev` Worker URL.

## What Not To Deploy

The public asset upload must not include:

- `.git/`
- `.wrangler/`
- `node_modules/`
- `tests/`
- `docs/`
- `.env*`
- `.dev.vars*`
- logs, zip archives, staging folders, or local scratch files

## AI Secrets And Runtime Settings

Never commit OpenAI keys. `.env.local` may be used for local development because it is gitignored, but real secrets must stay out of tracked files and deploy artifacts. Use `.env.example` only as the safe template.

Set production runtime secrets and variables in Cloudflare Pages:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_TIMEOUT_MS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_RETRY_BASE_MS`
- `RUF_HUB_AI_ACCESS_TOKEN`
- `AI_MOCK_MODE`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `AI_RATE_LIMIT_MAX_REQUESTS`
- `AI_RATE_LIMIT_WINDOW_SECONDS`
- Durable Object binding `AI_RATE_LIMITER`

Recommended defaults are documented in `docs/openai-integration.md`. If `OPENAI_API_KEY` is missing, or if `AI_MOCK_MODE` is not exactly `false`, the Quick Grab AI endpoint returns a mock proposal safely. Real mode is blocked unless a Cloudflare Access JWT or server-only route token authenticates the caller and the `AI_RATE_LIMITER` Durable Object binding is available. AI proposals never write records directly; Daniel must approve selected actions before saving.

Do not change production to real mode until Daniel approves and completes `docs/production-ai-safety.md`.

## Deployment Audit Checklist

- Cloudflare project type is Pages, not Worker.
- The accidental Worker URL is not used for app testing.
- Root directory is `ruf-ministry-hub-deploy-working`.
- Build command is blank.
- Deploy command is blank.
- The deploy command is not `npx wrangler deploy`.
- Build output directory is `.`.
- Functions directory is `functions`.
- The app loads at the Cloudflare Pages URL.
- `_redirects` contains `/ruf-ministry-hub /ruf-ministry-hub.html 200` and `/app /ruf-ministry-hub.html 200`.
- Service worker bypasses `/api/*`.
- `/ruf-ministry-hub.html` loads directly.
- `/api/ai/health` returns JSON from a Pages Function on the Pages URL.
- `/api/ai/quick-grab` accepts POST JSON from a Pages Function on the Pages URL.
- No `.git`, `.wrangler`, `node_modules`, tests, docs, logs, or local env files appear as public assets.
- No OpenAI API key appears in frontend files, test files, tracked env templates, git history, or committed code.

## Production Rollback

Use Cloudflare Pages **Deployments** to roll back to a previously successful production deployment. Preview deployments are not rollback targets. After the dashboard rollback, verify the static routes and Pages Functions with synthetic data, then create a revert or fix in the canonical GitHub repository. A Pages rollback does not move `main`, so Git must be reconciled before the next production build.

Cloudflare reference: https://developers.cloudflare.com/pages/configuration/rollbacks/

## Emergency Quick Grab External-AI Control

Set the production runtime variable `AI_MOCK_MODE=true`, then redeploy the current approved commit. Verify `/api/ai/health` reports `mockMode:true`, and verify a synthetic Quick Grab response reports `mode:"mock"` and `externalDataSent:false`. This stops external OpenAI requests while preserving local capture and mock proposals.

Restore only after Daniel approves: confirm the OpenAI key still exists as an encrypted Pages secret, set `AI_MOCK_MODE=false`, redeploy the approved canonical commit, and verify with low-sensitivity synthetic data. Removing `OPENAI_API_KEY` also forces mock behavior, but use that more disruptive option only when the secret may be compromised. Never copy the secret value into a ticket, document, command transcript, or tracked file.

## Incident Response

Use `docs/incident-response.md` for secret exposure, public AI abuse, failed deploys, data-loss reports, service-worker outages, and Worker loops. The runbook preserves local browser data, uses Cloudflare Pages rollback rather than a separate Worker deploy, and keeps production/data changes human-approved.

Run the deterministic offline exercise with:

```sh
node tests/incident-response-simulations.js
```

The exercise uses synthetic fixtures only. It does not read real secrets or ministry data, contact external services, send messages, mutate records, deploy, roll back, purge caches, or rotate credentials.

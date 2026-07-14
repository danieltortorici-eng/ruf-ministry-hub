# RUF Ministry Hub Deployment Notes

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

Recommended defaults are documented in `docs/openai-integration.md`. If `OPENAI_API_KEY` is missing, or if `AI_MOCK_MODE=true`, the Quick Grab AI endpoint returns a mock proposal safely. AI proposals never write records directly; Daniel must approve selected actions before saving.

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

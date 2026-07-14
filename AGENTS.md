# RUF Ministry Hub Agent Instructions

## Source Of Truth

- Treat `ruf-ministry-hub-deploy-working/` as the deployable app source.
- Keep `functions/api/ai/*.js` and `ruf-ministry-hub-deploy-working/functions/api/ai/*.js` in sync.
- Do not edit old zip archives or `.ai-*`, `.mock-*`, `.person-*`, `.prayer-*`, or `.follow-up-*` staging folders unless explicitly asked.
- Read `docs/next-level-build-prompt.md`, `docs/next-level-roadmap.md`, `TESTING.md`, and `DEPLOYMENT_NOTES.md` before substantial feature work.

## Safety And Privacy

- Never read, print, commit, or copy `.env.local` or any real secret value.
- Never place `OPENAI_API_KEY` or other secrets in frontend HTML, tests, docs, screenshots, or tracked files.
- Ministry data is sensitive by default. Any external AI, sync, import, email, calendar, or contact integration must be opt-in, reversible, and clearly documented.
- AI features may propose actions, but the user must approve selected actions before records are saved.

## Build Rules

- Keep the app usable after every change. Prefer small vertical slices over broad rewrites.
- Do not claim cloud sync, native widgets, calendar/contact permissions, email import, background automation, or external integrations are implemented unless the working deploy path includes them.
- For deployable app changes, bump `APP_VERSION` in `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html` and the service worker `CACHE_NAME`.
- Update `docs/manual-qa.md` when iPhone or Safari behavior changes.

## Verification

Run the relevant checks before reporting work as complete:

```sh
node tests/regression-harness.js
node tests/person-profile-fix-regression.js
node tests/ai-functions-regression.js
node tests/deployment-config-regression.js
```

For JavaScript/function changes, also run:

```sh
node --check functions/api/ai/quick-grab.js
node --check functions/api/ai/health.js
node --check ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js
node --check ruf-ministry-hub-deploy-working/functions/api/ai/health.js
node --check ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js
```

## Deployment

- Deploy with Cloudflare Pages, not a separate Worker.
- Pages root directory: `ruf-ministry-hub-deploy-working`.
- Build command: blank. Deploy command: blank. Build output directory: `.`.
- Pages Functions directory: `functions`.
- Do not use `npx wrangler deploy` for this app.

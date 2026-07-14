# Canonical Repository Guide

Last reviewed: 2026-07-13.

This is the current operating map for RUF Ministry Hub. The canonical repository is [danieltortorici-eng/ruf-ministry-hub](https://github.com/danieltortorici-eng/ruf-ministry-hub). Historical audits and handoff prompts remain in the repository as evidence, but this guide, `AGENTS.md`, `TESTING.md`, and `DEPLOYMENT_NOTES.md` govern current work.

## Architecture map

```text
Canonical GitHub repository
├── ruf-ministry-hub-deploy-working/        Cloudflare Pages root
│   ├── index.html                           Static entry redirect
│   ├── ruf-ministry-hub.html                Single-file PWA and editable app source
│   ├── ruf-ministry-hub-sw.js               Browser service worker/offline shell
│   ├── manifest, icons, _redirects, _headers Static Pages assets and security policy
│   └── functions/api/ai/                    Pages Functions (Workers runtime)
│       ├── health.js                         GET /api/ai/health
│       └── quick-grab.js                     POST /api/ai/quick-grab
└── cloudflare/ai-rate-limiter/              Real-AI support Worker
    └── AiRateLimiter Durable Object         Required fail-closed request limiter

Browser
├── localStorage / IndexedDB                 Local records, settings, drafts, vault data
├── browser service worker                   Cache and offline navigation
└── optional reviewed Quick Grab packet
    └── Pages Function
        ├── mock path                         No external data sent
        └── real path                         Minimized packet -> OpenAI Responses API
            ├── Cloudflare Access identity + durable rate-limit gate
            └── proposal -> browser review -> Daniel-approved local record changes
```

The current backend boundary is deliberately narrow: two stateless Pages Functions plus an optional real-AI rate-limiter support Worker, with no application database, cloud sync service, scheduled job, or general-purpose API. The support Worker exposes no application endpoint. The PWA remains usable locally when Quick Grab AI is in mock mode or has no OpenAI key.

## Source-of-truth rules

| Path | Authority | Rule |
| --- | --- | --- |
| `ruf-ministry-hub-deploy-working/` | Deployable app | This is the Cloudflare Pages root and the editable source for deployable PWA changes. |
| `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html` | App source | Make application changes here. Pair deployable changes with `APP_VERSION` and service-worker `CACHE_NAME` bumps. |
| `ruf-ministry-hub-deploy-working/functions/api/ai/*.js` | Deployed function copies | Cloudflare Pages executes these files. |
| `functions/api/ai/*.js` | Maintained function mirrors | Change in the same patch as the deployed copies; the files must remain identical. |
| Root PWA files | v32 compatibility/audit foundation | Do not treat the repository root as the Pages publish directory. Change only when a task explicitly requires the compatibility copy. |
| `dist/ruf-ministry-hub.html` | Historical compatibility artifact | Do not deploy it or use it as editable source, current release output, or behavioral-test authority. |
| `cloudflare/ai-rate-limiter/` | Optional real-AI support infrastructure | Deploy and bind only after Daniel approves the privacy, infrastructure, and spending boundary. |
| `tests/` | Local verification | Use synthetic data only. Tests must not contact live ministry or OpenAI services. |
| Old zip/staging folders | Historical evidence | Do not edit or delete unless a task explicitly scopes them in. |

When documents disagree, prefer executable evidence in the deploy tree and maintained tests, then update the current document without deleting the historical record. Record uncertainty instead of inventing a deployed capability or dashboard setting.

## Local setup

Requirements are Git, Node.js, and npm. The repository does not currently pin a Node version and has no required third-party package install for its maintained tests.

```sh
git clone https://github.com/danieltortorici-eng/ruf-ministry-hub.git
cd ruf-ministry-hub
node --version
npm --version
npm test
```

Do not inspect or reuse another machine or worktree's `.env.local`. Mock-only work needs no real secret and should use synthetic fixtures.

For a static browser preview without Pages Functions:

```sh
python3 -m http.server 4173 --directory ruf-ministry-hub-deploy-working
```

Then open `http://localhost:4173/`. The static preview exercises the PWA shell, but `/api/*` is unavailable.

For a Pages-compatible local preview, use Wrangler's Pages development command, not its deployment command:

```sh
npx wrangler pages dev ruf-ministry-hub-deploy-working --binding AI_MOCK_MODE=true
```

`npx` may download Wrangler if it is not installed. The explicit mock binding prevents external OpenAI requests. Do not use remote production bindings or real ministry fixtures for local QA.

## Test matrix

| Change or risk | Command | What it proves |
| --- | --- | --- |
| Any maintained change | `npm test` | Full syntax, deploy-copy, regression, asset, and secret audit suite. |
| PWA behavior or screen changes | `node tests/regression-harness.js` | Current screens, local actions, PWA routing/cache, privacy helpers, and documentation guardrails. |
| People/profile workflows | `node tests/person-profile-fix-regression.js` | Person profile sheets, edits, actions, and linked records. |
| AI function or AI review changes | `node tests/ai-functions-regression.js` | Mock/real request paths, validation, minimization, error handling, no live network, and approval-before-save behavior. |
| Real-AI rate limiter | `node tests/ai-rate-limiter-regression.js` | Durable fixed-window behavior and absence of a public application endpoint. |
| Pages layout or deployment docs | `node tests/deployment-config-regression.js` | Deploy-root boundary, function locations, mirror alignment, ignore rules, and Pages-only guidance. |
| App JavaScript | `npm run check:app` | Inline app script and root service-worker syntax. |
| Function or deploy JavaScript | `npm run check:deploy` | Both function copies and deploy service-worker syntax. |
| Static asset change | `npm run audit:assets` | Referenced app assets exist. |
| Security/privacy boundary | `npm run audit:secrets` | Browser bundle has no key or direct OpenAI client boundary violation. |
| iPhone/Safari/release behavior | Follow `docs/manual-qa.md` | Real-device layout, offline, shortcut, vault, and persistence behavior. |

The automated tests are local logic/render checks, not screenshot automation or a substitute for real iPhone Safari QA. The AI suite stubs the OpenAI call; it does not send test content to an external service.

## Privacy model

1. **Local by default.** People, prayer, tasks, notes, settings, backups, and restore history belong in the browser. Auto Memory Vault is local recovery, not cloud sync.
2. **Synthetic repository data only.** Real pastoral or ministry data must not appear in commits, fixtures, logs, screenshots, issues, PR descriptions, or copied prompts.
3. **Secrets stay server-side.** Never read or publish `.env.local`. Never put `OPENAI_API_KEY`, access tokens, or other real values in HTML, docs, tests, screenshots, or tracked configuration.
4. **External AI is explicit and narrow.** Only the reviewed Quick Grab proposal flow may send a minimized packet to the Pages Function. Candidate people are limited to the fields accepted by the function. The browser never receives the OpenAI key.
5. **Proposals are not writes.** AI output must remain pending until Daniel selects and approves actions. Cancelled, skipped, invalid, or unapproved actions must not create records.
6. **No server-side ministry store.** The current Pages Functions report `storedServerSide:false`; the Quick Grab function logs only safe error metadata, not request bodies or candidate details.
7. **Integrations remain opt-in.** Sync, calendar, contacts, email, background automation, and any expanded AI surface require a reviewed privacy boundary, a reversible control, and truthful documentation before release.

Portable restores accept only the current versioned RUF Ministry Hub backup envelope, enforce bounded structure and safe unique identifiers before mutation, and escape dynamic record identifiers at the HTML boundary. Static Pages responses use a hash-based script CSP; Pages Function responses set their own MIME hardening because `_headers` does not apply to Functions.

Device Vault protects local browser storage when enabled, but it does not protect against device loss by itself. Keep encrypted exports as part of release and migration practice.

## Worker catalog

| Runtime component | Files | Purpose | Operational boundary |
| --- | --- | --- | --- |
| Browser service worker | `ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js` | Offline shell, cache cleanup, navigation fallback, and `/api/*` bypass. | Runs in the user's browser. It is not a Cloudflare Worker. |
| AI health Pages Function | `ruf-ministry-hub-deploy-working/functions/api/ai/health.js` plus root mirror | Reports mode/capability metadata with `Cache-Control: no-store`. | Stateless; does not accept ministry content. |
| Quick Grab Pages Function | `ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js` plus root mirror | Validates and minimizes one Quick Grab, returns a mock or OpenAI-backed proposal. | Stateless; no record writes; external send only on the real path. |
| AI rate-limiter support Worker | `cloudflare/ai-rate-limiter/worker.js` and its `wrangler.jsonc` | Owns the `AiRateLimiter` Durable Object required by real mode. | No public app endpoint; deploy/bind only with Daniel's approval. |
| Wrangler Pages guardrail | `wrangler.jsonc` | Identifies the Pages output directory for local tooling. | Not a standalone Worker deployment configuration. |

There is no `_worker.js`, cron trigger, background automation, server database, or cloud-sync worker in the application deploy path. Pages Functions use the Workers runtime, while the application is deployed as one Cloudflare Pages project. The separate Durable Object exists only as approved support infrastructure for fail-closed real-AI rate limiting.

## GitHub-first handoffs

The routine path is branch -> local tests -> reviewable commit -> pull request in the canonical repository -> Daniel review/merge -> Cloudflare Pages Git deployment. A local folder, zip, direct upload, or `workers.dev` deployment is not the source of truth.

1. Start from the requested canonical base. For normal work, update from `origin/main`; for coordinated integration work, use the named integration branch or commit.
2. Work in an isolated branch/worktree. Do not mix unrelated user changes.
3. Keep both AI function copies synchronized and bump app/cache versions only for deployable app changes.
4. Run the relevant focused checks and `npm test` before handoff.
5. Review the diff for secrets, real ministry data, generated artifacts, and unsupported capability claims.
6. Commit one coherent, cherry-pickable change. Do not push, merge, or deploy unless the task explicitly authorizes it.
7. In a PR handoff, name the base and branch, list changed boundaries, report exact test results, call out privacy effects, and state whether deployment settings or variables must change.
8. Daniel approves record-changing AI behavior and production release decisions.

Suggested handoff fields:

```text
Canonical repo: https://github.com/danieltortorici-eng/ruf-ministry-hub
Base commit/branch:
Handoff branch/commit:
Deployable app changed: yes/no
Function mirrors identical: yes/no/not applicable
Synthetic data only: yes/no
Tests run and results:
Privacy or external-data effect:
Cloudflare setting/secret change required:
Rollback note:
```

## Cloudflare Pages deploy and rollback

### Intended Git-backed deployment

Cloudflare Pages should be connected to the canonical GitHub repository. The canonical default branch is `main`; confirm the Pages production branch in the dashboard before a release instead of assuming dashboard state.

Required Pages settings:

- Root directory: `ruf-ministry-hub-deploy-working`
- Build command: blank
- Deploy command: blank
- Build output directory: `.`
- Functions directory: `functions`
- Production source: reviewed canonical GitHub branch, normally `main`

For this framework-free static PWA, a blank build command is intentional. Merging the reviewed release into the configured production branch should create the production deployment through the Pages Git integration. Do not run `npx wrangler deploy`, and do not validate the app on an accidental `workers.dev` URL.

After deployment, verify the Pages URL:

- `/`
- `/ruf-ministry-hub.html`
- `/app`
- `/api/ai/health`
- `/api/ai/quick-grab` with the synthetic fixture in `tests/fixtures/api/fake-quick-grab.json`
- service-worker registration and one-online-load offline behavior

### Rollback

1. In Cloudflare, open the Pages project and its **Deployments** list.
2. Choose a previously successful **production** deployment and select **Rollback to this deployment**. Preview deployments are not valid rollback targets.
3. Verify the static routes, health route, and a mock-mode Quick Grab using synthetic data.
4. Record the rolled-back deployment/commit and incident reason.
5. Immediately reconcile the canonical repository with a revert or fix PR. A dashboard rollback does not move `main`; without a Git correction, the next production build can reintroduce the bad commit.
6. After Daniel approves and the corrected Git commit deploys, repeat the release checks.

Official Cloudflare references:

- [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Pages Function bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/)

## Emergency Quick Grab external-AI disable and restore

The current reversible emergency control disables **external OpenAI processing for Quick Grab** while preserving local capture and mock proposals. There is no runtime flag that hard-disables the entire `/api/ai/quick-grab` route; a hard route shutdown requires a reviewed code change.

### Disable external processing

1. In the production Pages environment, set `AI_MOCK_MODE=true` as a runtime variable.
2. Save the variable and redeploy the current known-good production commit so the deployment receives the new value. Do not alter app code during the emergency toggle.
3. Verify `/api/ai/health` returns `mockMode:true`.
4. Submit only `tests/fixtures/api/fake-quick-grab.json` through an authorized QA path and verify the response reports `mode:"mock"`, `externalDataSent:false`, and `storedServerSide:false`.
5. Keep the OpenAI key encrypted and unchanged for the fastest restore. If compromise is suspected, rotate or remove the secret separately; do not copy its value into an incident document.
6. Record who changed the flag, the deployment, time, reason, and verification result in the canonical GitHub handoff or incident record.

If the flag cannot be changed safely, removing `OPENAI_API_KEY` also forces the Quick Grab function onto its mock path. Secret removal is more disruptive and restoration must use the Cloudflare secret store, never a tracked file.

### Restore external processing

1. Confirm the incident is resolved and Daniel approves restoration.
2. Confirm `OPENAI_API_KEY` exists as an encrypted Pages secret without revealing it.
3. Confirm Cloudflare Access authentication and the `AI_RATE_LIMITER` Durable Object binding are healthy.
4. Set `AI_MOCK_MODE=false` and redeploy the approved canonical commit.
5. Verify `/api/ai/health` reports `effectiveMode:"real"`, `readyForRealMode:true`, `hasOpenAIKey:true`, and `storedServerSide:false`.
6. Use one low-sensitivity synthetic request to confirm `mode:"real"`; do not use a real person or ministry note as a smoke test.
7. Confirm the returned proposal still waits for Daniel's selected-action approval before any local record save.

## Contributor checklist

Before editing:

- [ ] Confirm the canonical repository, base commit/branch, and isolated worktree.
- [ ] Read `AGENTS.md`, this guide, `TESTING.md`, `DEPLOYMENT_NOTES.md`, and the relevant roadmap/integration document.
- [ ] Confirm the request does not require `.env.local`, real secrets, or real ministry data.
- [ ] Identify whether the change is local-only, deployable PWA, Pages Function, documentation, or future integration work.

Before handoff:

- [ ] Deployable source changes live in `ruf-ministry-hub-deploy-working/`.
- [ ] Root and deploy AI function copies are identical.
- [ ] `APP_VERSION` and `CACHE_NAME` changed together when deployable app behavior changed.
- [ ] iPhone/Safari behavior changes are reflected in `docs/manual-qa.md`.
- [ ] Tests use synthetic fixtures and make no unexpected network calls.
- [ ] Relevant focused checks and `npm test` pass.
- [ ] Diff contains no secrets, real ministry data, staging debris, or unsupported capability claims.
- [ ] AI output remains a proposal until Daniel approves selected record changes.
- [ ] Handoff states tests, privacy effect, deployment requirements, and rollback path.
- [ ] No push, merge, direct upload, Worker deploy, or Pages deploy occurred without explicit authorization.

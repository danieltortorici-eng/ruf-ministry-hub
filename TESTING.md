# RUF Ministry Hub Testing

This workspace contains local regression checks for the current single-file PWA bundle in `ruf-ministry-hub-deploy-working`.

## Run The Full Suite

From the repository root, run:

```sh
npm test
```

This runs the root v32 syntax/asset/secret audits, both copies of the Pages Function syntax checks, the deploy service worker check, and all four maintained regression suites below.

## Run The Regression Harness

From this folder:

```sh
node tests/regression-harness.js
```

If `node` is not on your shell path, use the bundled runtime:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/regression-harness.js
```

Run the focused current person-profile checks:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/person-profile-fix-regression.js
```

Run the focused Cloudflare/OpenAI proposal checks:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/ai-functions-regression.js
```

These checks cover the AI health endpoint, mock fallback, Responses API request shape, strict structured output, access-token protection, input-size and field validation, prompt-injection handling, upstream OpenAI error handling, retry behavior, and selected-action approval metadata.

Run the deployment configuration checks:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/deployment-config-regression.js
```

To test another copy of the app, pass its folder:

```sh
RUF_HUB_APP_DIR="/path/to/ruf-ministry-hub-deploy" node tests/regression-harness.js
```

## What It Covers

- Current screen rendering for Today, Autopilot, Quick Grab, Quick Review, Search, People, Person Profile, Prayer, 15 Minutes, Weekly Reset, Settings, App Coach, Duplicate People, iPhone Readiness, and App Manual.
- Quick Grab URL capture with `quickgrab`, `quickgrabCategory`, `quickgrabUrgency`, and refresh duplicate prevention.
- ADHD Mode defaults and Today section visibility toggles.
- Autopilot next-step selection and attention preset behavior.
- Core local actions for follow-ups, prayer status, tasks, exports, and privacy masking.
- Person profile quick actions for notes, meeting notes, prayer requests, follow-up tasks, profile edits, text draft copying, in-app quick-action sheets, edit-field sheets, create-person sheets, and prayer action sheets.
- Data safety sheets for encrypted backup export, demo reset confirmation, and duplicate-person merge confirmation.
- Security sheets for App Lock PIN setup/removal and Device Vault enable/disable.
- Backup Health status and action selection.
- Auto Memory Vault local restore point creation, restore confirmation, deletion, retention limits, and Device Vault migration without plaintext snapshots.
- Cloudflare Pages AI health and Quick Grab proposal routes, mock fallback, OpenAI Responses API request shape, no frontend key exposure, and AI proposal approval before any local save.
- Cloudflare Pages extensionless rewrites, direct HTML loading, and service worker bypass for `/api/*` routes.
- Cloudflare Pages deploy-root shape, public file boundary, Pages Function locations, and Wrangler/ignore guardrails.
- Service worker registration shape, cache version, and current asset list.
- Documentation guardrails so tests do not claim removed or unimplemented screens or future integrations as active features.

## Notes

These are local logic/render checks. They are not a full browser screenshot suite and not a real iPhone Safari test. They intentionally avoid backend services, cloud sync, native APIs, and real iOS Share Sheet behavior.

Run the manual iPhone Safari checklist before relying on a release on your phone:

```text
docs/manual-qa.md
```

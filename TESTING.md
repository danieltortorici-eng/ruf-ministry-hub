# RUF Ministry Hub Testing

This workspace contains local regression checks for the current single-file PWA bundle in `ruf-ministry-hub-deploy-working`.

The cross-project test matrix and change-to-check mapping live in `docs/canonical-repository-guide.md`. This file remains the command-level testing reference.

## Run The Full Suite

From the repository root, run:

```sh
npm test
```

This runs the root v32 syntax, asset, generated-output drift, and secret-boundary audits; both copies of the Pages Function syntax checks; the deploy service worker check; and all five maintained regression suites below.

The same command runs in `.github/workflows/ci.yml` for every pull request and push to `main`. The workflow uses read-only permissions, cancels superseded runs, and retains failure logs for 7 days.

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

Run the GitHub coordination checks:

```sh
node tests/github-coordination-regression.js
```

Run the generated-output and secret boundaries directly:

```sh
node audit-generated-output.mjs
node audit-secrets.mjs
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
- GitHub workflow permissions, full-SHA action pins, concurrency cancellation, failure-artifact retention, CODEOWNERS, and pull-request safety prompts.
- Byte-for-byte drift checks for the two required Pages Function mirrors.
- Tracked/proposed-file credential signatures, forbidden secret/data paths, and browser/server credential boundaries without reading ignored local env files.

## Notes

These are local logic/render checks. They are not a full browser screenshot suite and not a real iPhone Safari test. They do not call live backend or OpenAI services and intentionally avoid cloud sync, native APIs, and real iOS Share Sheet behavior. Pages Function code is exercised locally with synthetic inputs and stubbed network calls.

Run the manual iPhone Safari checklist before relying on a release on your phone:

```text
docs/manual-qa.md
```

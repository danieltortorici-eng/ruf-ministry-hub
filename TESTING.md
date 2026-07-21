# RUF Ministry Hub Testing

This workspace contains local regression checks for the current single-file PWA bundle in `ruf-ministry-hub-deploy-working`.

The cross-project test matrix and change-to-check mapping live in `docs/canonical-repository-guide.md`. This file remains the command-level testing reference.

## Run The Full Suite

From the repository root, run:

```sh
npm test
```

This runs app syntax checks for the compatibility root and canonical deploy v39; the asset, generated-output drift, and secret-boundary audits; both copies of the Pages Function syntax checks; the deploy service worker and AI rate-limiter Worker checks; the maintained app/repository regression suites below; and the deterministic incident-response simulations.

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

Run the service-worker update lifecycle simulation:

```sh
node tests/service-worker-lifecycle-regression.js
```

Run the maintained synthetic Chrome journey for strict Device Vault main-data and Auto Memory payload schemas, latest-attempt/exact-envelope ownership with real local Web Crypto, rejected-Auto-Memory-to-valid retry, successful App Lock and Device Vault transition focus, deterministic toast semantics/deadline ownership and accessibility-tree cleanup, fragment-only shared capture, local request-log privacy, default-off disclosed dictation, mutation-free disclosure transitions, pre-disclosure live-draft preservation, immediate-render-safe successful dictation persistence, truthful Backup Rhythm readiness, protected encrypted-backup busy/reentry behavior and modal focus containment, exact-once Save/Process behavior, accessibility, and proposal approval boundaries:

```sh
node tests/calm-browser-journey-regression.js
```

This journey starts a loopback-only static server and an isolated temporary Chrome profile. It uses fictional data, records local request URLs, makes no provider or production request, and removes the temporary profile afterward. Browser absence, a blocked loopback server, truncation, or tool failure is `NOT VERIFIED`, not a pass.

The service-worker lifecycle check above uses a synthetic in-memory service-worker environment. It proves that install caches the app shell without activating a replacement worker, unrelated messages cannot activate it, an explicit `SKIP_WAITING` message activates it once, offline document navigation returns the cached shell, and `/api/*` is not intercepted. The main regression harness separately proves that the app sends `SKIP_WAITING` only after Update now is chosen. The lifecycle simulation does not register a worker in a real browser or access the network.

Run the focused current person-profile checks:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/person-profile-fix-regression.js
```

Run the focused Cloudflare/OpenAI proposal checks:

```sh
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/ai-functions-regression.js
/Users/danieltortorici/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/ai-rate-limiter-regression.js
```

These checks cover the AI health endpoint, effective runtime mode, mock fallback, fail-closed real mode, Cloudflare Access JWT validation, constant-time route-token protection, durable rate limiting, bounded request bodies, Responses API request shape, strict structured output, field validation, prompt-injection handling, upstream OpenAI error handling, retry behavior, and selected-action approval metadata.

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

Run the offline incident-response simulations:

```sh
node tests/incident-response-simulations.js
```

These simulations use only `tests/fixtures/incident-simulations.json`. They cover synthetic secret exposure, public AI abuse, failed Pages deploy, data-loss report, service-worker outage, and Worker loop inputs. The runner makes no network requests, sends no external messages, uses no real credentials or ministry data, and changes no records or production state.

To test another copy of the app, pass its folder:

```sh
RUF_HUB_APP_DIR="/path/to/ruf-ministry-hub-deploy" node tests/regression-harness.js
```

## What It Covers

- Current screen rendering for Today, Autopilot, Quick Grab, Quick Review, Search, People, Person Profile, Prayer, 15 Minutes, Weekly Reset, Settings, App Coach, Duplicate People, iPhone Readiness, and App Manual.
- Fragment-only Quick Grab capture with one exact `#quickgrab=` parameter, 6,000-code-unit input ceiling, cleanup-before-import, refresh/focus/pageshow duplicate prevention, legacy query discard, unrelated query/anchor preservation, and a recovered opt-out that clears deferred text before any visible draft or autosave.
- Start with the default shared-capture setting on, a valid fictional fragment, and a newer synthetic IndexedDB settings mirror with `enableUrlQuickGrab:false`. Confirm startup scrubs the fragment, recovered settings remain off, pending/deferred text clears without draft, autosave, storage, record, proposal, Undo, status, or screen mutation, and focus/pageshow/reload cannot resurrect it. Repeat through a failed hydration followed by Retry and while recovery owns state; keep the recovered-on exact-once case green.
- Dictation defaults off for new, missing, legacy, malformed, and imported settings unless exact boolean `true` carries the current disclosure marker. Enabling and every start require an accessible checked disclosure before browser recognition construction. Opening, canceling, and checked-Start disclosure transitions render the complete visual/focus surface without running unrelated auto-archive persistence, pending shared-fragment application/autosave, or reminder settings/Notification effects; ordinary renders retain those maintained effects. Opening or canceling preserves the actual byte-exact live Today or profile input even when the programmatic view and draft store are absent or older, creates no persistence, constructs no recognition object, and binds profile context to the exact rendered person. Synthetic constructor/property/start errors, `onerror`, timeout/missing `onend`, empty/duplicate/late events, a second start, detached targets, identity drift, recovery, navigation, and disablement must discard staged words with no draft autosave or permanent record. For main, Today, and profile capture, one current successful `onend` appends once, synchronously updates the maintained plaintext draft store or Device Vault draft cache before announcing success, survives an immediate render/reopen, and retires only its superseded delayed autosave. Autosave-off retains the current view draft without persistence; false/throw persistence rolls target, view, and capture-method metadata back exactly.
- Speech-recognition permission UI, audio processing location/handling/retention, physical iPhone Safari and installed Home Screen behavior remain `NOT VERIFIED`; automated tests make no locality, retention, permission, or guaranteed-abort claim.
- Backup export builds a detached payload/envelope first, cleans up its temporary anchor and object URL on every covered path, initiates the browser download before recording status, and leaves prior live/persisted status exact when initiation or metadata persistence fails. Successful initiation uses Files-confirmation copy; a post-click persistence failure is reported as partial rather than current. Tests inspect only synthetic counters and metadata, never exported content or a real passphrase.
- Encrypted backup export has one short-lived generation owner, an accessible busy sheet with passphrase, Close, Cancel, and submit disabled, rapid-reentry rejection, and modal focus on the panel when no control is enabled. Actual-browser Tab and Shift+Tab remain on that panel; Escape, backdrop, and Close cannot dismiss it. Success restores invoking-control focus, failure restores enabled preferred-input focus, and a normal non-busy sheet still focuses its enabled preferred input. Recovery advancement, real navigation, and forced-close invalidation retire the current owner; stale generations stay isolated while a newer generation is active; failure is content-free and retryable; one successful sheetless call returns truthful `true`. Invalidation itself performs no persistence, crypto, or download. iPhone Readiness marks Backup Rhythm Ready only for a valid non-due initiation timestamp with a positive reminder interval; reminder-off, missing, malformed, and due states remain Needs Work.
- Backup Health, iPhone Readiness, every Weekly Reset backup summary/plan, and the complete rendered in-app Back up and restore guide treat `lastBackupAt` only as browser download-initiation metadata. Synthetic absent, invalid, reminder-off, due, and current-initiation cases use distinct copy, avoid **Backed up today**, **Backup current**, **Last export**, and **current or off**, state that export asks the browser to start a download, and direct the user to confirm the expected non-zero file in Files before relying on it. Restore/import wording remains about the file the user selected. This is one shared status path, not a second persisted source.
- Portable backup import requires the exact numeric envelope version `2`. Missing data-schema markers and exact numeric schemas `2` or `3` are supported at the top level, nested data, or both matching positions. Schema `1`, future, mismatched, coercible, malformed, fractional, and non-finite markers are rejected before normalization or recovery ownership. Direct, plaintext-file, encrypted-decode/file, and actual-browser UI checks prove generic retryable failure with exact live/local/settings/Undo/recovery state and zero IndexedDB writes; actual-browser encryption/decryption also proves a current schema-3 round trip. The narrow internal legacy Auto Memory restore bridge is not reachable from selected portable files.
- Plaintext startup classifies the canonical local database graph and canonical local Auto Memory vault before normalization. Main-data missing/exact `2`/exact `3` and Auto Memory's complete absent/schema-2/schema-3 matrix remain supported. Unsupported authoritative local Auto Memory—including future, coercible, mismatched, or more than 50 raw snapshots—keeps exact local and IndexedDB bytes behind one content-free accessible recovery gate and never yields to an older mirror. IndexedDB-only supported absent/schema-2 Auto Memory publishes locally only after classification; unsupported input leaves local missing and the mirror exact.
- Auto Memory snapshots require exactly one `data`/legacy-`db` graph source, plain auxiliary objects, matching supported markers, and exact paired producer metadata when present. Schema `3` requires every current collection; absent/schema `2` may omit only additive current collections. Normal restore and reconciliation preserve absent/schema-2/schema-3 provenance until the maintained additive data normalizer. One unsupported snapshot rejects the complete vault. Raw 51- and 10,000-snapshot fixtures reject with zero payload-normalizer and zero comparator calls; exact 50 remains accepted. These are synthetic corruption and liveness controls, not an approved retention/deletion schedule.
- `CALM-AUTO-MEMORY-38` performance evidence uses the same already-constructed ordered 10,000-snapshot fictional vault for five before/after runs. Removing the raw-count preflight produced 10,000 payload normalizations and 9,999 comparisons each run, with 60/66/63/62/63 ms elapsed (median 63 ms). The maintained preflight produced 0 normalizations, 0 comparisons, and 0 ms in all five runs: 100% deterministic-work and measured-median reductions. The earlier audit's 119,860 comparisons/82 ms came from a different ordering and remains historical context only, not part of this comparable result.
- Device Vault unlock classifies decrypted `payload.data` and the complete Auto Memory vault after successful decryption, stages main/copy/drafts/Auto Memory, and rechecks latest attempt, exact raw envelope, and recovery epoch before any publication or side effect. Unsupported inputs stay locked with one fixed content-free storage alert, unchanged envelope/settings bytes, no plaintext keys, no warning detail, and no invalid-passphrase state; one later valid retry may succeed. The local Chrome journey uses fictional envelopes and real local Web Crypto for future-main rejection, unsupported-Auto-Memory rejection, valid retry, heading-focus transitions, App Lock PIN focus, newest-wins overlap, and mid-decrypt replacement. This is `SIMULATED`; existing real vaults, physical VoiceOver/iPhone/Safari, installed Home Screen, preview, provider, production, and rollback deployment remain `NOT VERIFIED`.
- Toast replacement uses one monotonic in-memory generation plus exact timer-handle ownership. Success, including **Unlocked.** after an alert, applies `status`/`polite` before the text mutation and retains the exact 2,800 ms deadline; explicit errors and retained heuristic errors such as **Could not…** apply `alert`/`assertive` before text and retain 5,000 ms. Forced stale callbacks are inert. Only the current owned callback hides the toast, restores idle polite semantics, clears accessibility text, and releases its own handle. Deterministic recovery and synthetic Chrome checks use fictional messages; physical VoiceOver announcement order remains `NOT VERIFIED`.
- Physical iPhone/Safari download initiation, Files visibility, exported-file contents, passphrase recovery, preview headers/assets, provider state, and production behavior remain `NOT VERIFIED`. Automated success proves initiation only and must not be upgraded to file durability.
- Calm OS removes redundant ADHD/Attention controls, and legacy Today visibility settings cannot fragment the fixed Today contract.
- Autopilot next-step selection remains covered, and obsolete attention-preset code cannot mutate the fixed Today contract.
- Core local actions for follow-ups, prayer status, tasks, exports, always-visible classified content in the unlocked app, and fail-closed outward privacy tiers.
- Person profile quick actions for notes, meeting notes, prayer requests, follow-up tasks, profile edits, text draft copying, in-app quick-action sheets, edit-field sheets, create-person sheets, and prayer action sheets.
- Data safety sheets for encrypted backup export, demo reset confirmation, and duplicate-person merge confirmation.
- Security sheets for App Lock PIN setup/removal and Device Vault enable/disable.
- Backup Health status and action selection.
- Auto Memory Vault local restore point creation, restore confirmation, deletion, retention limits, and Device Vault migration without plaintext snapshots.
- Cloudflare Pages AI health and Quick Grab proposal routes, mock fallback, OpenAI Responses API request shape, no frontend key exposure, and AI proposal approval before any local save.
- Deploy-source AI Review cards, including selected/skipped action persistence across reload, editable action drafts, partial approval filtering, and confirmation-only record creation.
- Deploy-source Quick Grab AI proposal review and save behavior; behavioral harnesses do not use the stale `dist` artifact as application authority.
- Calm OS adversarial shapes for empty data, 500 People, 600 Search matches, 300 profile-history records, long/missing names, corrupt/missing dates, repeated capture taps, oversized photos, same-name ambiguity, sensitive derived records, offline/unavailable AI, and truthful real-backend approval provenance.
- Deterministic local persistence failures proving IndexedDB recovery-write ordering, backup-restore rollback, Device Vault disable staging, and app-update recovery flush ordering.
- Cloudflare Pages extensionless rewrites, direct HTML loading, and service worker bypass for `/api/*` routes.
- Cloudflare Pages deploy-root shape, public file boundary, Pages Function locations, and Wrangler/ignore guardrails.
- Service worker registration shape, cache version, and current asset list.
- Documentation guardrails so tests do not claim removed or unimplemented screens or future integrations as active features.
- GitHub workflow permissions, full-SHA action pins, concurrency cancellation, failure-artifact retention, CODEOWNERS, and pull-request safety prompts.
- Byte-for-byte drift checks for the five required Pages Function mirrors.
- Tracked/proposed-file credential signatures, forbidden secret/data paths, and browser/server credential boundaries without reading ignored local env files.
- Incident-response severity, containment, evidence, human-approval, and privacy guardrails for all six synthetic scenarios.

## Notes

These are local logic/render checks. They are not a full browser screenshot suite and not a real iPhone Safari test. They do not call live backend or OpenAI services and intentionally avoid cloud sync, native APIs, and real iOS Share Sheet behavior. Pages Function code is exercised locally with synthetic inputs and stubbed network calls. Synthetic quota and service-worker simulations are not proof of real Safari quota, OS suspension, or installed-PWA behavior.

Run the manual iPhone Safari checklist before relying on a release on your phone:

```text
docs/manual-qa.md
```

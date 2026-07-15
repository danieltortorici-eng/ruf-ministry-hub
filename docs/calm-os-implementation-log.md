# Calm OS Implementation Log

## Phase 0 — Safety and branch

Status: complete locally on 2026-07-15; no deployment or merge performed.

### Mandatory intake

1. **Approved outcome and non-goals:** Implement the Calm OS product redesign through Phase 13. Do not deploy, merge, change production settings or secrets, silently save AI output, or break old data/backups.
2. **Repository and worktree:** Canonical repository `https://github.com/danieltortorici-eng/ruf-ministry-hub`; branch `redesign/calm-os-next-action`; base HEAD `c1541625b47073c3cce2e3eb116617a3d36285f8`; isolated worktree `/Users/danieltortorici/Documents/RUF Ministry Hub - Calm OS`; deploy root `ruf-ministry-hub-deploy-working/`; redesign worktree started clean.
3. **Writer inventory:** `/root` is the sole writer for `CALM-OS-01`. Support agents are read-only unless a later work order assigns a separate non-overlapping worktree. The original `codex/steward-consolidation` checkout and all existing worktrees are preserved; none is a writer for this branch.
4. **Governing sources:** `AGENTS.md`, `BUILD_CONTROL_CENTER.md`, `docs/build-operations.md`, `docs/canonical-repository-guide.md`, `docs/ai-code-quality-director.md`, `TESTING.md`, `DEPLOYMENT_NOTES.md`, `RUF_Ministry_Hub_Project_Source_Audit.md`, and `docs/manual-qa.md`. Runtime authority is `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html` plus its deploy service worker and Pages assets.
5. **Observed baseline:** The accepted single-file PWA exposes dashboard-like Today, category-first Quick Grab, People, profile, prayer, settings, local backup/vault, offline, and proposal-review behavior. The smallest product gap is that Today does not enforce the requested three-section next-action hierarchy and capture/profile flows expose more classification and metadata than Calm OS permits.
6. **Privacy classification:** Local-only application changes and synthetic-only tests. Optional AI sends remain governed by existing explicit approval and server-side privacy gates. Real data is forbidden.
7. **External-state classification:** None. Static local preview may be used; production, preview deployment, credentials, provider calls, spending, and irreversible actions are out of scope.
8. **Coupled artifacts:** Pair `APP_VERSION`, deploy service-worker `CACHE_NAME`, `package.json` version, and CSP hash when the inline app changes. Preserve Pages routes, `/api/*` service-worker bypass, backup schema, browser storage keys, IndexedDB/vault behavior, and Function mirrors without modifying Functions.
9. **Verification:** Baseline `npm test` passed with exit code 0. Focused app, profile, service-worker, AI proposal, backup, deployment, asset, generated-output, and secret checks remain required. Browser simulation and manual-device evidence must be labeled separately.
10. **Daniel-only blockers:** None for local implementation. Real iPhone verification and production/provider state will remain `NOT VERIFIED` unless separately supplied; they do not authorize or require deployment.

### Writer claim and work order

**Work order:** `CALM-OS-01 — Calm OS next-action redesign`
**Mode:** implementation

**Outcome:** A reviewable local branch whose authoritative PWA presents Today, Capture, People, Prayer, and More as a cohesive Calm OS; shares one capture/proposal path; preserves local data/backups/offline behavior; and passes the maintained and new Calm OS regression suites.

**Allowed runtime files:**

- `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html`
- `ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js`
- `ruf-ministry-hub-deploy-working/_headers`
- `ruf-ministry-hub-deploy-working/ruf-ministry-hub.webmanifest`
- `package.json`

**Allowed verification and documentation files:**

- `tests/regression-harness.js`
- `tests/person-profile-fix-regression.js`
- `tests/service-worker-lifecycle-regression.js`
- new focused tests under `tests/` using synthetic data only
- `TESTING.md`, `docs/manual-qa.md`, `docs/canonical-repository-guide.md`
- the Calm OS documents required by the approved command

**Do not touch:** Root or `dist/` PWA compatibility files, old archives/staging folders, `.env*`, secrets, backups/exports/browser data, real ministry fixtures, Pages Functions, Cloudflare Workers/settings, GitHub settings, or production resources. Do not push, merge, deploy, bind, credential, or enable optional candidates.

**Invariants and edge cases:** Keep existing storage identifiers and record relationships; normalize malformed or missing legacy fields without destructive deletion; retain dormant `preferredContactMethod` values through backup round trips but never render or create them; keep AI actions pending until explicit selected-action approval; preserve interrupted text and proposal edits locally; make retries idempotent; mask sensitive previews; support empty, large, malformed-date, offline, repeated-tap, 390px, 430px, large-text, and reduced-motion states.

**Acceptance gates:** Required screen hierarchy and action limits are asserted in synthetic render tests; old backup/vault/local persistence tests stay green; `APP_VERSION`, cache, package identity, CSP, routes, and assets remain aligned; focused suites and `npm test` exit 0; all tracked and untracked redesign files pass whitespace, secret, and scope review.

**Rollback:** Revert individual phase commits in reverse order. No data migration may delete legacy fields; schema normalization must be forward-compatible so rolling back code leaves the original stored payload readable.

**Stop conditions:** Secret or real-data exposure; unexpected overlapping writer; destructive or backup-incompatible migration; unauthorized external/production action; unresolved P0/P1 failure after fresh diagnosis.

### Baseline evidence

- `OBSERVED`: Original checkout was dirty on `codex/steward-consolidation`; its changes remain untouched.
- `OBSERVED`: Required branch did not exist locally or remotely before creation.
- `AUTOMATED`: `npm test` passed at base HEAD with exit code 0.
- `NOT VERIFIED`: Real iPhone Safari, Home Screen, provider, preview deployment, and production behavior.

## Phase checkpoints

Later phases append decisions, files, verification, defects, and evidence here. Each committed phase must leave the branch reviewable and must not imply deployment or release approval.

## Phase 1 — Preimplementation audits

Status: complete locally on 2026-07-15.

- Added source-of-truth, product, cognitive-load, before/after workflow, performance/recovery, and accessibility audits.
- Measured baseline authority: 577,038-byte single-file deploy app, 10 desktop/7 mobile primary destinations, and 19 rendered screen states.
- Measured baseline load: Today approximately 125 attention points, People 94, Profile 84. Adopted 18 points for the initial mobile viewport, 30 per undrilled primary screen, and 7 per repeating card.
- Classified duplicate Today recommendations, category-first capture, separate profile creation sheets, profile field/action grids, primary administrative navigation, timestamps, and preferred-contact behavior for merge, move, hide, or rebuild.
- Confirmed existing `quickGrabs` and `aiProposals` are the compatible shared architecture; no second capture or proposal store will be introduced.
- Recorded P1 blockers: demo seeding can mask IndexedDB recovery, and proposal-selected create actions can silently update unselected person dates.
- Recorded P2 gates for idempotency, capture/proposal recovery, encrypted suspension, contextual dates, bounded profile rendering, and preferred-contact dormancy.
- Audit workers B, C, D, E, F, G, H, I, J, K, L, M, N, O, and P signed off on their read-only audit portions. Browser/device evidence remains `NOT VERIFIED`.
- No runtime files, external systems, secrets, production state, original dirty work, or other worktrees were changed by the audits.

## Phase 2 — Architecture and migration

Status: complete locally on 2026-07-15.

- Documented the before-state runtime, storage, product paths, and coupled release artifacts.
- Defined internal recovery, date, capture, proposal, executor, recommendation, profile-grounding, presentation, and accessibility boundaries without adding a framework.
- Kept `quickGrabs`, `aiProposals`, collection identifiers, localStorage keys, IndexedDB, Device Vault, Auto Memory, service-worker model, and version-2 backup envelope.
- Defined additive `dataSchemaVersion: 3`, stable capture revisions/proposal keys, per-action execution keys, and side-effect-free proposal constructors.
- Defined recovery-first startup and safe stale-processing behavior with no automatic external resend.
- Defined a synthetic pre-Calm version-2 compatibility boundary; formats earlier than the tracked contract remain `NOT VERIFIED` rather than guessed.
- Expanded the authorized runtime scope to the deploy webmanifest when Calm OS naming/theme metadata changes. Root and `dist` artifacts remain prohibited.
- No runtime or external state changed in this phase.

## Phase 3 — Calm OS design system

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Added Calm OS product/design principles, attention and visual-weight budgets, tokens, component contracts, and accessibility foundations.
- Adopted warmer paper/surface colors, one core green accent, quieter borders/shadows, 10/16/22px radii, and the 4/8/12/16/24/32px spacing scale.
- Raised shared controls to a 44px minimum, added visible focus, disabled, quiet-button, disclosure, capture-composer, calm-card/list, live-status, fixed-media, and reduced-motion primitives.
- Updated deploy-only PWA naming/theme metadata to Calm OS while retaining the RUF Ministry Hub identity and install ID.
- Paired app/package version, service-worker cache, and CSP identity. Pages routes, Functions, storage, records, and production settings are unchanged.
- Verification: `node check-app-syntax.mjs`, service-worker `node --check`, `node tests/deployment-config-regression.js`, and `node tests/regression-harness.js` all exited 0. The regression harness retained its service-worker safety assertions and now recognizes the intentional Calm OS release family.

## Phase 4 — Contextual dates and compatibility foundation

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Added one local-calendar date system for interaction, follow-up, due, historical, and audit contexts. Date-only values are parsed as calendar components instead of UTC timestamps.
- Added `dataSchemaVersion: 3` without changing the version-2 backup envelope or any browser storage key.
- Version-2 backups with the six historical ministry collections may omit `aiProposals`; the missing newer collection safely normalizes to an empty array.
- Removed preferred contact from demo/new records, creation, normal cards/profiles, search, briefings, and data-quality suggestions. Unknown legacy values remain untouched as dormant data through import/export/re-import.
- Administrative Created/Updated timestamps are now hidden in normal UI and available only in collapsed Record details when both advanced actions and inline editing are deliberately enabled.
- Added synthetic regression coverage for today/yesterday/tomorrow/weekday/overdue/next-week/same-year/prior-year/date-only boundaries, schema markers, old backup import, dormant-field round trip, and timestamp dormancy.
- Verification: the focused app syntax, profile, deployment-contract, and regression commands exited 0; `npm test` then completed all maintained checks and audits with exit code 0.

## Phase 5 — Unified capture and proposal processing

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Rebuilt the main Capture screen around one expanding field, one Process action, optional dictation, and quiet Save for later; visible category, urgency, and record-type selection was removed.
- Added one capture composer/service contract for main, Today, profile, dictation, shared, imported, and future inputs. Raw text is persisted before the privacy/context gate opens.
- Added additive capture source, revision, submission, processing, error, proposal, and person-lock metadata while retaining the existing `quickGrabs` collection.
- Added deterministic proposal keys and safe retry routing. A refresh-interrupted processing state becomes a clear failed/retry state; backend failure keeps raw text and can fall back to the local mock without structured writes.
- Reused `aiProposals` and its independent selections, action editing, partial approval, rejection, person change, and final confirmation. Review language is now Suggested updates, Review before saving, RUF Hub sorted this into…, and Save approved updates.
- Added explicit Mark sensitive control and per-action source links. Repeated proposal execution is blocked.
- Removed proposal-constructor side effects: approved create-meeting/create-follow-up actions no longer update person dates unless a separate selected `updatePerson` action does so.
- Updated iPhone manual QA for unified capture and proposal review. No Pages Function, external AI contract, production setting, or secret changed.
- Verification: `npm test` completed all maintained syntax, deployment, service-worker, profile, AI, backup, security, coordination, incident, asset, generated-output, and secret-boundary checks with exit code 0.

## Phase 6 — Today around the next action

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Replaced the dashboard-style Today renderer with exactly three normal primary sections: Next thing to do, Quick Capture, and After that. After that renders at most two compact recommendations.
- Added one central reason-coded recommendation queue in the required ministry-first order: overdue person, person due today, important task, important/due capture, prayer follow-up, care-window person, oldest capture, proactive pastoral opportunity, then quiet maintenance fallback.
- Stored a testable internal explanation with every candidate, excluded completed and snoozed records, deduplicated competing candidates, and masked sensitive capture, prayer, and task details.
- Limited the selected item to Do this, Done, and Later. Real records require a selected future return date; proactive suggestions dismiss for the local day. Repeated taps remain idempotent through current status/deferral checks.
- Kept one compact critical alert outside the three-section hierarchy and prioritized an available app update over a serious backup alert. Full backup, coach, shortcut, review, care, task, count, and administrative content remains off Today.
- Routed the legacy Autopilot selector through the central queue without exposing Autopilot as normal Today language; its old standalone screen remains temporarily accessible until Navigation/Cleanup phases relocate or remove verified legacy paths.
- Paired app/package version, service-worker cache, and CSP identity. No data collection, storage key, backup envelope, Function, production setting, or external state changed.
- Verification: focused syntax and Today regression passed before the full maintained suite; final exact commands and exit results are recorded in the Phase 6 commit evidence.

## Phase 7 — People discovery and care

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Rebuilt People cards as one semantic whole-card open control with a fixed 48px circular photo or initials fallback, explicit image dimensions, quiet lazy decoding, and long-name wrapping.
- Added one generated identity helper capped at two grounded pieces. It prioritizes meaningful ministry identity such as leadership team, fraternity/sorority, donor status, RUF involvement, or hometown without inventing data.
- Kept only name, identity, care level, contextual next follow-up, and a concise saved follow-up reason. Removed card-level Open, Pin, Followed Up, pinned badges, last-interaction stats, Created/Updated timestamps, and preferred-contact display.
- Follow-up reasons now render only beside a valid planned date and respect sensitive-preview masking. Search restores its field focus and caret after filtered rerenders so one-handed iPhone typing can continue.
- Simplified the People entry question and search toolbar. Person creation stays available as a quiet secondary action; whole-card opening is the repeated primary behavior.
- Preserved all person records, local photos, pin settings, follow-up data, search behavior, storage keys, backup compatibility, and existing profile access. Administrative controls are handled in Profile/Navigation phases, not duplicated on cards.
- Verification: focused syntax and People regression passed before the full maintained suite; final exact commands and exit results are recorded in the Phase 7 commit evidence.

## Phase 8 — Profiles around present care

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Replaced the normal profile stat/field/action dashboard with an essential photo-or-initial header, two-piece identity, care level, contextual interaction/follow-up timing, useful reason, and phone only when populated.
- Added a grounded Right Now selector for Pray, Next thing, Remember, and Reminder. It ranks only saved active prayers, open tasks, explicit follow-up reasons, meeting next steps/memories, notes, and dated reminders; calm empty states replace guesses and sensitive evidence uses existing preview masking.
- Made the shared capture composer the sole normal creation path. The profile person is preselected and locked; Change person safely transfers the interrupted draft to another person key, persists that lock across a refresh-like view reset, refuses to overwrite a different existing draft, and creates or updates no profile records.
- Replaced proposal-producing profile briefing/draft entry points with immediate local-only sheets. Brief Me uses existing context privacy gates, warns on excluded/sensitive context, works with AI disabled, and states when little information exists. Follow Up shows a Short draft immediately, offers Casual/Pastoral variants, copies only, never sends, and never marks complete without the explicit action.
- Moved profile fields, photo controls, Pin, Mark followed up, editing, and optional audit details under collapsed Profile Details and More actions. Preferred contact remains dormant.
- Kept Notes, Meetings, Prayer Requests, Follow-Ups, and Timeline separate. Empty sections do not render; each starts with at most three compact story-oriented records, and View all expands full untruncated access on demand without administrative timestamp clutter.
- Kept all existing record collections, editing/merge primitives, storage keys, version-2 backups, schema marker, encryption, IndexedDB, localStorage, offline shell, and human approval boundaries unchanged.
- Verification: focused syntax, Calm profile regression, and maintained person-profile regression passed before the full maintained suite; final exact commands and exit results are recorded in the Phase 8 commit evidence.

## Phase 9 — Primary navigation and secondary tools

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Replaced the ten-entry desktop and seven-entry mobile navigation with exactly Today, Capture, People, Prayer, and More. Desktop and mobile now share one source list, named navigation landmarks, current-page state, 48px mobile targets, and safe-area spacing.
- Removed the floating duplicate Capture action and recurring Search/Capture buttons from screen headers. Person and proposal subflows correctly announce their parent destination.
- Rebuilt More around one prominent Search action and three collapsed native groups: Ministry rhythms, Review and care, and App and data. I Have 15 Minutes, Weekly Reset, priority explanation, review queues, App Coach, duplicates, readiness, manual, and settings remain reachable.
- Moved the dense preference, privacy, encryption, and backup controls to the deliberate Settings and data route and removed its duplicate workflow-shortcut cluster.
- Restricted new launch-screen choices to the five primary destinations. Stored legacy secondary choices and old presets normalize conservatively to a primary destination without changing ministry records.
- Renamed the Prayer destination and question for pastoral use, while retaining every prayer filter and record action.
- Paired app/package version, service-worker cache, and CSP identity. No record, backup, storage, Function, production setting, or external state changed.
- Verification: focused syntax and navigation regression passed before the full maintained suite; final exact commands and exit results are recorded in the Phase 9 commit evidence.

## Phase 10 — Verified cleanup and performance

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Deleted verified unreachable dashboard-era Today, legacy profile, prompt-based profile-action, old attention-preset, and no-op Calm-mode paths. Updated the in-app manual to describe the implemented Calm OS flows.
- Found and removed a higher-severity duplicate architecture: saved Quick Grab cards could still open a manual structured-record form that bypassed the shared proposal system. All visible Process routes now enter `beginCaptureProcessing`, preserve the raw capture, show the privacy gate, and require selected-action approval before permanent records.
- Preserved unknown legacy settings, old record fields, and dormant `process:<captureId>` autosave entries for backup round-trip and rollback tolerance; no destructive cleanup or data migration was performed.
- Added first-ID-wins People indexes, one-map Search linking, a shared bounded duplicate matcher, Set-based pin checks, and linear proactive-suggestion deduplication.
- Relative to Phase 9, reduced authoritative HTML by 90,507 bytes (13.6%), local gzip by 14,777 bytes (11.3%), inline JavaScript by 87,973 bytes (14.0%), named functions by 63, and renderers by 15.
- Removed 236 lines of uninvoked legacy AI test scaffolding tied to the deleted manual saver. The maintained AI proposal selection/edit/partial-approval/person-resolution/idempotency tests continue to run.
- No storage identifier, record collection, backup envelope, Function, Worker, external system, secret, production setting, or original checkout was changed.
- Verification: focused syntax, Calm regression, maintained person-profile, AI function, and whitespace checks passed before final Phase 10 versioning; full `npm test` is the commit gate.

## Phase 11 — Accessibility and workflow recovery

Status: implemented locally on 2026-07-15; verification recorded with the phase commit.

- Replaced the startup localStorage/IndexedDB render race with a fail-closed recovery bootstrap. No demo seed, archive mutation, ministry render, or plaintext fallback occurs while storage is unresolved.
- Distinguished missing from corrupt local values; restored and normalized valid IndexedDB-only mirrors; retained unreadable raw bytes and paused when no safe mirror existed; seeded demo data only for a confirmed empty first install.
- Kept Device Vault locked with an empty in-memory graph until decrypt succeeds. Serialized encrypted saves by revision, capped write concurrency at one, committed the newest requested snapshot, retained the old envelope on failure, and made later retry safe.
- Recovered main, Today, profile, and proposal drafts from local/IndexedDB mirrors. Added lifecycle flushing without allowing PIN/vault-locked screens to delete drafts. Final proposal approval is never autosaved or restored.
- Added a skip link, focusable main landmark, intentional H1 route focus, global Search caret restoration, one modal focus trap/Escape/inert/return-focus binding, explicit labels/descriptions, fieldsets/legends, `aria-pressed`, invalid-field focus, and live error announcements.
- Raised switches/small buttons to 44px, strengthened focus/muted contrast, added horizontal safe-area and `dvh` sheet handling, wrapping navigation labels, landscape adjustments, reduced-motion preservation, and forced-colors support.
- Added focused recovery and accessibility suites to `npm test`; paired `APP_VERSION`, package version, service-worker cache v43, and CSP hash. Storage identifiers, backup envelope, Functions, Workers, production settings, and secrets are unchanged.
- Manual VoiceOver, Dynamic Type, real iPhone landscape/one-handed behavior, real browser process termination, and performance vitals remain explicitly `NOT VERIFIED` pending Phase 12/13 browser and device evidence.

## Phase 12 — Regression and adversarial QA

Status: implemented locally on 2026-07-15; final command evidence recorded with the phase commit.

- Bounded People to 40-card increments, Search groups to 30-result increments, and expanded profile history to 50-record increments while preserving complete stored access through Show more.
- Replaced worst-case quadratic full-matrix name comparison with normalized, length-banded candidate indexes, a deterministic comparison ceiling, and a two-row bounded-distance helper. New names are capped at 120 characters; imported legacy names remain nondestructively displayable.
- Made same-first-name capture matching explicitly ambiguous: raw capture stays unlinked, the proposal stores candidate IDs and low confidence, and final approval requires an explicit person choice.
- Closed privacy propagation boundaries so sensitive capture approvals create sensitive tasks and mark sensitive person-detail updates; Today and Search keep the derived text masked.
- Closed sensitive Search query leakage, missing/corrupt-date sort crashes, real-backend approval when local mock fallback is off, and false `mockOnly` provenance after real-backend approval.
- Made app update activation await draft/vault recovery flush. Added offline cached-document navigation and `/api/*` pass-through execution coverage.
- Requested an IndexedDB recovery write before surfacing a plaintext quota failure; made backup restore roll back in-memory/local state; staged all plaintext before Device Vault disable so failure leaves the prior encrypted envelope intact.
- Normalized legacy person records missing a name to the explicit `Unnamed person` fallback and hardened capture parsing. Import, render, capture, and re-export remain safe.
- Adversarial fixtures cover empty data, long/no-photo people, 500 people, 600 Search matches, 300 profile records, multiple overdue items, sensitive prayer/task/profile text, same-name ambiguity, missing/corrupt dates, repeated taps, oversized photos, unavailable AI, backend provenance, quota failures, service-worker interruption, and old backup shapes.
- Read-only adversarial re-audit reported no unresolved P0/P1 defects. Real Safari/iPhone, VoiceOver, OS suspension, storage quota, slow-device vitals, and live provider AI remain `NOT VERIFIED`, not synthetic passes.
- `npm test`, both extreme-timezone regression runs, the five tracked mandatory regression commands, all six tracked JavaScript syntax commands, CSP/deploy validation, generated-output drift, secret audit, asset audit, and whitespace checks exited 0.
- Newer control-center instructions name candidate Calendar/Secretary/optimizer/steward files and four related suites that are not present in this branch's tracked tree. Those absent paths are `NOT VERIFIED`; no substitute pass is claimed and no unapproved candidate Worker was created, deployed, bound, or credentialed.

## Phase 13 — Final documentation and view reproduction

Status: completed locally on 2026-07-15.

- Added the standalone product constitution and future-worker gates for Calm OS, one-question/one-action design, delete-first disclosure, attention/visual budgets, local-first privacy, backward compatibility, human AI approval, accessibility, interruption recovery, regression testing, and the no-production-action boundary.
- Added the final redesign report with phase commits, changes/removals/merges/relocations, data/privacy results, explicit acceptance audit, exact automated evidence, known risks, unavailable candidate-path disclosure, worker A–P sign-offs, and Executive Product Lead sign-off.
- Added disposable-origin before/after reproduction steps at 390 × 844, 430 × 932, and 1440 × 900. No production, preview, real-data, or real-device screenshot was created or implied.
- Phase 13 changes documentation only; no app version, service-worker cache, CSP, runtime source, external state, or production setting changed.

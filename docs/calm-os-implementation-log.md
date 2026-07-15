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

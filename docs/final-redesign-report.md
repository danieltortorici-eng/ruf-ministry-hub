# Calm OS Final Redesign Report

Report date: 2026-07-15

Branch: `redesign/calm-os-next-action`

Deploy/merge status: neither deployed nor merged

## Executive result

RUF Ministry Hub has been rebuilt as Calm OS around one outcome: open, understand the next faithful action, act, and leave. Today is no longer a dashboard; Capture accepts messy input without classification; People and profiles foreground present care; AI remains proposal-only; secondary tools live under More; recovery, accessibility, and privacy are shared release boundaries.

The authoritative runtime remains `ruf-ministry-hub-deploy-working/`. The original dirty checkout, root compatibility PWA, historical `dist` artifact, production configuration, secrets, optional Workers, external services, and real ministry data were not modified.

## Phase commits

1. `9d68762` — `chore: establish calm os redesign workspace`
2. `29a462e` — `docs: complete calm os preimplementation audits`
3. `779a7f3` — `docs: define calm os architecture and migration`
4. `09f3690` — `feat: establish calm os design system`
5. `1bf22e9` — `refactor: centralize dates and legacy profile compatibility`
6. `3a97853` — `feat: unify capture and approval processing`
7. `cd9db9c` — `feat: redesign today around next action`
8. `4a52ac9` — `feat: simplify people discovery and care`
9. `aad2044` — `feat: rebuild profiles around present care`
10. `f580c42` — `refactor: simplify navigation and secondary tools`
11. `a956c52` — `refactor: remove legacy complexity and improve performance`
12. `4ea77c7` — `fix: improve accessibility and workflow recovery`
13. `48d5595` — `test: complete calm os regression coverage`
14. Phase 13 — `docs: finalize calm os redesign report` (the commit containing this report)

## What changed

- Today now contains exactly Next thing to do, Quick Capture, and After that. One reason-coded queue applies the required people-before-maintenance priority, masks sensitive evidence, excludes completed/snoozed work, and stores testable selection explanations.
- Main, Today, profile, dictation, shared URL, and imported text use one raw-capture service. Raw text is saved before processing; drafts and failed processing remain recoverable.
- The existing `aiProposals` architecture now handles shared suggested updates, independent selection, editing, rejection, person change, sensitivity, partial approval, final confirmation, and idempotent execution.
- People cards are compact whole-card controls with 48px photos/initials, two-piece identity, care level, contextual follow-up, and useful masked reasons.
- Profiles now lead with essential identity and timing, grounded Right Now, one linked capture composer, Brief Me, Follow Up, collapsed details, and bounded separate histories.
- Dates use one local-calendar system for active relative language and stable historical language.
- Navigation is exactly Today, Capture, People, Prayer, and More. Search remains prominent on More without becoming a sixth primary destination.
- Shared CSS foundations cover hierarchy, spacing, controls, cards, fields, disclosures, focus, errors, safe areas, touch targets, reduced motion, forced colors, and dynamic viewport sheets.
- Startup recovers local/IndexedDB state before rendering. Device Vault writes are revisioned/serialized, lifecycle boundaries flush recoverable state, and service-worker activation waits for a successful recovery flush.
- Large repeated interfaces disclose in batches: People 40, Search groups 30, expanded profile histories 50. Fuzzy duplicate checks and new-name length are bounded.

## Removed, merged, and relocated

### Removed

- Dashboard-era Today sections, People Shortcuts, visible counts, equal-weight action clusters, and redundant Calm/ADHD presets.
- The parallel manual Quick Grab structured-record saver that could bypass shared proposal approval.
- Legacy profile field/stat dashboard, direct-create action cluster, prompt-based profile flows, normal timestamps, visible preferred-contact UI, and verified dead render paths/CSS.
- Repeated card-level Pin/Open/Followed Up controls and generic avatar treatment.

### Merged

- All capture entry points into `submitUnifiedCapture` and one proposal-keyed processing flow.
- All AI/local suggestions into the existing proposal review and final executor.
- Contextual date wording into shared date helpers.
- Today selection into one reason-coded recommendation engine.
- Modal focus, validation reporting, navigation focus, and accessibility state into shared interaction primitives.

### Relocated

- I Have 15 Minutes, Weekly Reset, App Coach, review tools, duplicates, iPhone readiness, manual, settings, backup, encryption, and administration to More or deliberate contextual entry points.
- Profile editing, photo controls, Pin, Mark followed up, and audit details to collapsed Profile Details/More actions.
- Full historical records behind independent View all/Show more disclosures without removing access.

## Data compatibility and privacy result

- Storage keys, IndexedDB database/store, record collections, version-2 backup envelope, Device Vault algorithm, and offline shell model are preserved.
- Additive `dataSchemaVersion: 3` records the current live shape without rejecting tracked version-2 backups.
- Unknown legacy properties survive normalization and round trip. `preferredContactMethod` is dormant: preserved but not created, shown, searched, briefed, recommended, or sorted.
- Missing legacy person names normalize to explicit `Unnamed person`, then render, capture, and re-export safely.
- Backup restore rolls back on deterministic persistence failure. Device Vault disable stages plaintext before removing the prior envelope.
- Sensitive capture-derived tasks and person updates retain sensitivity; Today and Search mask them by default.
- AI never writes records silently. Final approval is never autosaved or restored. Real-backend provenance remains truthful after approval.
- No browser asset contains a server key or route token. No secret, production setting, binding, deployment, external message, or real ministry record was accessed or changed.

## Final acceptance audit

### Product and navigation — PASS

- [x] Calm OS, ministry-first language, delete-first review, one question per screen, one primary action, progressive disclosure, Pastor Mode, and speed-to-action are implemented.
- [x] Attention and visual-weight budgets are documented and adopted.
- [x] Primary navigation is Today, Capture, People, Prayer, and More; secondary tools remain reachable without primary prominence.

### Today — PASS

- [x] Next thing to do, Quick Capture, and After that are the only normal primary sections.
- [x] After that is capped at two; one CTA is dominant; critical alerts are compact and singular.
- [x] Required recommendation order, internal explanation, Done, Later/return date, proactive daily dismissal, snooze/completion exclusion, and sensitive masking are covered.

### Capture and proposals — PASS

- [x] Main, Today, profile, dictation, shared/imported text, and Save for later share one pipeline with no upfront category/urgency/type chooser.
- [x] Profile person lock, quiet Change person, raw-first persistence, AI failure fallback, draft recovery, retry, independent proposal checkboxes, edit/reject/change person/mark sensitive, partial approval, and final approval are implemented.
- [x] Stable proposal/action keys and repeated-tap guards prevent duplicate structured records.
- [x] Same-first-name ambiguity requires explicit human resolution; no first-match person is silently selected.

### People and profiles — PASS

- [x] Compact photo/initial cards, concise identity, care level, contextual follow-up/reason, whole-card opening, no preferred contact, and no normal timestamps are implemented.
- [x] Profile essential header, grounded Right Now rows, linked capture, local Brief Me, immediate Follow Up draft, collapsed details, separate Notes/Meetings/Prayer/Follow-Ups/Timeline, three-item previews, View all, and empty-section hiding are implemented.
- [x] History becomes quieter at the top as it grows; complete stored access remains available in bounded batches.

### Dates, compatibility, privacy, and recovery — PASS (automated/local evidence)

- [x] Today/yesterday/tomorrow/weekday/overdue/next-week/same-year/prior-year/timezone date boundaries are centralized and tested.
- [x] Tracked old backup import/re-export, dormant preferred contact, additive schema, localStorage, IndexedDB, encryption, and service-worker upgrade behavior are covered.
- [x] Capture/profile/proposal recovery, refresh-like restoration, offline failure, safe retry, repeated taps, quota rollback, and update-flush ordering are covered synthetically.
- [x] AI context and record writes remain behind privacy and human-approval gates.

### Accessibility and engineering — PASS (automated/static evidence)

- [x] Semantic landmarks/headings, names/labels, focus order, modal trap/Escape/restore, validation announcements, 44px targets, contrast, scalable navigation, reduced motion, forced colors, disabled states, image semantics, and safe areas are covered.
- [x] Deploy authority, Function mirror drift, app/package/cache/CSP identity, dead-path removal, bounded rendering, and complete staged-candidate whitespace/secret audits are clean.
- [x] Read-only adversarial re-audit found no unresolved P0/P1 defect.

## Verification evidence

| Command/evidence | Exact result |
| --- | --- |
| `npm test` | Exit 0: app/deploy syntax, current regression, recovery, accessibility, service-worker lifecycle, profile, AI Functions, rate limiter, deployment, GitHub coordination, incident simulations, assets, two Function mirrors, and secret boundary all passed. |
| `node tests/regression-harness.js` | Exit 0, including Calm OS adversarial and compatibility coverage. Expected synthetic quota errors were exercised and asserted as rollback paths. |
| `TZ=Pacific/Kiritimati node tests/regression-harness.js` | Exit 0. |
| `TZ=America/Los_Angeles node tests/regression-harness.js` | Exit 0. |
| Tracked required focused suites | Profile, AI Functions, AI rate limiter, deployment configuration, recovery, accessibility, and service-worker lifecycle all exited 0. |
| Tracked JavaScript `node --check` commands | Root/deploy Quick Grab and health Functions, deploy service worker, and AI rate-limiter Worker all exited 0. |
| `git diff --check` and staged-candidate equivalent | Exit 0; no untracked proposed implementation file was omitted. |
| `node audit-generated-output.mjs` | Exit 0; both tracked Pages Function mirrors matched. |
| `node audit-secrets.mjs` | Exit 0 across 81 tracked/proposed files and six browser assets; ignored secret files were not read. |
| Adversarial worker re-audit | PASS; no unresolved P0/P1 defect. |

Newer control-center instructions name Calendar/Secretary/optimizer/steward candidate files and suites that do not exist in this branch's tracked tree. They are `NOT VERIFIED`, not failed or silently substituted. No candidate Worker or integration was created or activated.

## View evidence and reproduction

No production, preview, or real-data screenshots were created. Exact before/after local reproduction steps for 390 × 844, 430 × 932, and 1440 × 900 are in [calm-os-view-reproduction.md](calm-os-view-reproduction.md). The after-view responsive contracts are automated; real Safari visual/device evidence remains separate.

## Remaining known risks and evidence limits

- Real iPhone Safari, installed-PWA lifecycle, VoiceOver, Dynamic Type, landscape, one-handed reach, OS suspension/termination, and Safari quota behavior remain `NOT VERIFIED`.
- LCP, INP, CLS, memory, battery, and slow-device timing were not measured in a real browser.
- Live backend/OpenAI provider behavior and credentials were not exercised; local/synthetic Function tests passed.
- Search still constructs all matches before rendering batches, and full-database local persistence remains a cost on very large stores. Current batching and recovery boundaries reduce visible/input risk without changing the compatible store.
- Bounded fuzzy duplicate review is advisory and may not exhaustively discover every distant typo; it never merges automatically.
- Root compatibility and historical `dist` PWA copies remain intentionally stale/non-authoritative.
- Historical backup formats earlier than the tracked version-2 envelope were unavailable and remain `NOT VERIFIED`.

## Worker sign-offs

- **A — Executive Product Lead:** PASS. Scope, sequencing, integration, constitution, decisions, acceptance, and no-deploy boundary complete.
- **B — Repository and Source-of-Truth:** PASS. Deploy authority, mirrors, stale copies, storage, routes, tests, and original-checkout preservation audited.
- **C — Product and Cognitive Load:** PASS. Before/after inventories, deletion/merge/relocation decisions, workflow maps, and attention review complete.
- **D — Design System and ADHD UX:** PASS. Shared foundations, budgets, Pastor Mode, one-action hierarchy, and progressive disclosure adopted.
- **E — Unified Capture:** PASS. All requested sources share one raw-first pipeline; Save for later has no structured side effect.
- **F — AI Proposal and Approval:** PASS. Existing proposal system reused; partial/final approval, ambiguity, sensitivity, provenance, and idempotency covered.
- **G — Homepage and Recommendation:** PASS. Three-section Today and required central ordering implemented.
- **H — People:** PASS. Recognition-first compact cards and bounded discovery implemented.
- **I — Profile and Right Now:** PASS. Essential present-care top, grounded summaries, quiet details, and separate history implemented.
- **J — Brief Me and Follow Up:** PASS. Grounded local briefing and immediate unsent drafts implemented with explicit completion only.
- **K — Date and Schema Compatibility:** PASS. Central dates, dormant preferred contact, schema marker, tracked old-backup round trip, and missing-name recovery covered.
- **L — Navigation:** PASS. Five primary destinations and More relocation complete.
- **M — Architecture and Cleanup:** PASS. Parallel capture saver/dead paths removed; shared helpers and source authority preserved.
- **N — Interruption, Offline, and Performance:** PASS for automated/local scope. Recovery, update ordering, batching, quota rollback, and offline shell simulation passed; real device/vitals remain `NOT VERIFIED`.
- **O — Accessibility:** PASS for automated/static scope. Focus, labels, semantics, targets, contrast, safe areas, reduced motion, and errors passed; real VoiceOver/device evidence remains `NOT VERIFIED`.
- **P — Testing and Adversarial QA:** PASS. Maintained suite is green and final re-audit found no unresolved P0/P1 defect.

## Executive Product Lead sign-off

**SIGNED OFF FOR REVIEW.** Calm OS satisfies the implemented local acceptance boundary with no known unresolved high-severity defect. The branch is ready for code/design review. Nothing was pushed, merged, deployed, bound, credentialed, or changed in production.

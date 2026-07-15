# Calm OS Product Decisions

Date started: 2026-07-15

This is the decision record for the Calm OS redesign. Decisions are constrained by local-first privacy, reversible migrations, human approval before AI-created records are saved, and the Cloudflare Pages deploy boundary.

## Decision log

### PD-001 — Isolate the redesign from the dirty canonical checkout

- **Decision:** Build on `redesign/calm-os-next-action` in a dedicated Git worktree based on accepted commit `c1541625b47073c3cce2e3eb116617a3d36285f8`.
- **Alternatives considered:** Switch the dirty canonical checkout; copy or commit its inherited staged candidate; start from an unrelated historical worktree.
- **Reason:** The canonical checkout contains extensive staged, unstaged, and untracked work. Isolation preserves it byte-for-byte and gives the redesign a reviewable lineage.
- **Cognitive-load effect:** Keeps one clear implementation stream and avoids reconciling unrelated candidate features while redesigning the primary workflows.
- **Compatibility effect:** Begins from the accepted local-first v32 data, backup, vault, offline, and proposal contracts. Later changes must prove compatibility with that baseline.
- **Files affected:** Git worktree metadata; this decision record; `docs/calm-os-implementation-log.md`.
- **Tests used:** `npm test` at the base commit (exit 0).

### PD-002 — Keep the deploy tree as the sole application authority

- **Decision:** Application behavior is edited only in `ruf-ministry-hub-deploy-working/`; root PWA files and `dist/` remain compatibility or historical artifacts.
- **Alternatives considered:** Split the app into a new framework project; edit every copy; make `dist/` authoritative.
- **Reason:** The checked-in Pages configuration, maintained tests, and repository guide all identify the deploy tree as the release source.
- **Cognitive-load effect:** One product implementation avoids drift and duplicate mental models.
- **Compatibility effect:** Preserves Pages routing, service-worker scope, browser storage keys, and existing backup behavior.
- **Files affected:** No runtime files in Phase 0.
- **Tests used:** Baseline deployment configuration, generated-output, asset, and secret audits through `npm test`.

### PD-003 — No external or production state in this redesign

- **Decision:** The redesign is local-code and synthetic-test work only. It will not deploy, merge, push, enable real AI, change Cloudflare settings, read secrets, or inspect real ministry data.
- **Alternatives considered:** Live provider or production validation.
- **Reason:** The command expressly prohibits deployment and merge; provider credentials and real data are unnecessary for a local-first UI redesign.
- **Cognitive-load effect:** Keeps the work centered on the in-app care workflow.
- **Compatibility effect:** Existing optional AI remains proposal-only and default-safe; no integration contract is expanded.
- **Files affected:** Documentation only in Phase 0.
- **Tests used:** Secret/client-boundary audit through `npm test`.

### PD-004 — Enforce a measurable attention budget

- **Decision:** Cap the initial 390px viewport at 18 attention points, a full undrilled primary screen at 30, and a repeating list card at 7. Primary screens may show one CTA and three visual sections.
- **Alternatives considered:** Treat calmness as subjective; retain user-configurable dashboard sections; use only a visual-weight guideline.
- **Reason:** The baseline measured approximately 125 points on Today, 94 on People, and 84 on Profile. A numeric budget makes product review testable.
- **Cognitive-load effect:** New functionality must pay for itself by removing equal or greater visual competition.
- **Compatibility effect:** No data change. Secondary features remain reachable through More and disclosure.
- **Files affected:** `docs/cognitive-load-audit.md`; later design and render source.
- **Tests used:** Synthetic baseline render inventory; future structural Calm OS regression.

### PD-005 — Reuse existing collections and proposal approval

- **Decision:** `db.quickGrabs` remains the single raw-capture store and `db.aiProposals` remains the single suggestion/approval store.
- **Alternatives considered:** Add a new captures collection; build a second profile-capture path; replace the proposal engine.
- **Reason:** The current stores already preserve local-first backups and provide selection, editing, partial approval, and atomic rollback. Parallel systems would raise migration and cognitive costs.
- **Cognitive-load effect:** One capture path and one review language across Today, Capture, and profiles.
- **Compatibility effect:** Existing captures and proposals remain readable; new metadata is additive.
- **Files affected:** Architecture documents and later authoritative app/test files.
- **Tests used:** Baseline AI and backup suites plus planned unified-capture/idempotency coverage.

### PD-006 — Treat both audit P1 findings as completion blockers

- **Decision:** Calm OS cannot be signed off until startup recovers IndexedDB before demo seeding and proposal-created records no longer mutate unselected profile fields.
- **Alternatives considered:** Document as legacy risks; defer to later cleanup.
- **Reason:** Either defect can corrupt recovery expectations or bypass independent human approval.
- **Cognitive-load effect:** Trustworthy recovery and explicit changes reduce uncertainty even though they add internal engineering work.
- **Compatibility effect:** Recovery becomes more conservative; proposal behavior becomes narrower without deleting data.
- **Files affected:** Later storage bootstrap, record-constructor, proposal-execution, and focused test changes.
- **Tests used:** Planned missing-localStorage/IDB-present, locked-vault, and selected-action side-effect tests.

### PD-007 — Add a data schema marker without changing backup version

- **Decision:** Add optional `dataSchemaVersion: 3` while keeping the portable backup envelope at version 2 and retaining all storage keys.
- **Alternatives considered:** Bump backup envelope version; change the main storage key; mutate every old record in place.
- **Reason:** Additive metadata supports explicit migration tests without making current backups unreadable or duplicating stores.
- **Cognitive-load effect:** No user-facing migration choice or classification work.
- **Compatibility effect:** Missing schema means pre-Calm data; unknown/dormant fields survive; old version-2 backups continue through normalization.
- **Files affected:** Architecture/migration docs; later authoritative app and compatibility tests.
- **Tests used:** Planned pre-Calm import/export/re-import and rollback-tolerance checks.

### PD-008 — Make recommendation and date logic pure and injectable

- **Decision:** Build recommendations and contextual dates from pure helpers that accept a reference date and return reason-coded data.
- **Alternatives considered:** Continue renderer-local sorting and direct `Date` calls; store recommendation results.
- **Reason:** Pure functions make priority, timezone, masking, and fallback rules deterministic without adding server state.
- **Cognitive-load effect:** One stable, explainable priority replaces dashboard scanning.
- **Compatibility effect:** No record migration; only existing dates/statuses are read.
- **Files affected:** Architecture docs; later app/test source.
- **Tests used:** Planned priority-tier and date-boundary matrices.

### PD-009 — Keep legacy contact preference dormant, not deleted

- **Decision:** Stop creating, displaying, searching, briefing, or auditing `preferredContactMethod`, while preserving any existing value as an unknown-compatible person property through normalization and backup round trips.
- **Alternatives considered:** Delete the field during migration; continue showing it under Profile Details; rename it.
- **Reason:** Contact preference is not required for the next act of care, and deleting it would create unnecessary backup risk.
- **Cognitive-load effect:** Removes one classification choice from person creation and one repeated metadata item from cards and profiles.
- **Compatibility effect:** Synthetic pre-Calm version-2 import/export/re-import keeps the exact legacy field value; new people omit it.
- **Files affected:** Authoritative deploy HTML, regression harness, migration/implementation records.
- **Tests used:** Contextual date and legacy profile compatibility regression; full backup validation regression.

### PD-010 — Save raw capture before any processing or classification review

- **Decision:** Main, Today, profile, dictation, and shared/imported text all call one `submitUnifiedCapture` service that writes a normalized Quick Grab before opening the existing proposal privacy gate. Proposal identity is capture ID + revision + processor version.
- **Alternatives considered:** Process text in memory before saving; keep profile and Today-specific capture handlers; add a new captures collection.
- **Reason:** A saved raw capture is the safest interruption boundary and reuses the compatible Quick Grab/proposal stores.
- **Cognitive-load effect:** Removes category and urgency choices before capture and gives every entry point the same Process / Save for later language.
- **Compatibility effect:** Existing Quick Grabs normalize additively; old proposals are reused by source ID; new proposal/action keys prevent duplicate proposals and repeated structured writes.
- **Files affected:** Authoritative deploy HTML, service-worker/CSP/package identities, focused regressions, iPhone manual QA.
- **Tests used:** Unified capture, failure/retry, draft recovery, proposal reuse, per-action link, hidden person-date side-effect, AI function, profile, and deployment-contract regressions.

### PD-011 — Select Today from one explainable ministry recommendation queue

- **Decision:** Build Today from one reason-coded priority queue and render exactly Next thing to do, Quick Capture, and After that. After that is capped at two; one compact critical alert may sit outside those sections.
- **Alternatives considered:** Keep independent dashboard lists; continue legacy Autopilot as a separate selector; make users configure which Today sections appear.
- **Reason:** One deterministic queue answers the screen's single question and makes the required people-first ordering testable.
- **Cognitive-load effect:** Replaces competing cards, counts, shortcuts, and maintenance prompts with one dominant action plus at most two quiet previews. Real postponements require one explicit return date; proactive suggestions can leave for the day.
- **Compatibility effect:** Recommendations are derived from existing people, tasks, captures, and prayers. Deferrals are additive settings data; records are not migrated, and sensitive detail is masked before display.
- **Files affected:** Authoritative deploy HTML, service-worker/CSP/package identities, focused Today regression, iPhone manual QA, implementation record.
- **Tests used:** Central priority order, reason/explanation, sensitive masking, completed/snoozed exclusion, Done, Later, proactive dismissal, three-section, two-item, one-primary-action, and critical-alert regressions; full maintained suite.

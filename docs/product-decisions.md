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

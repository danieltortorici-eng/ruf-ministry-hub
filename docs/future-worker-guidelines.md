# Calm OS Future Worker Guidelines

These rules apply to every future worker, agent, contributor, and automation touching RUF Ministry Hub.

## Before changing code

1. Read the repository control center, build operations, canonical repository guide, product constitution, current implementation log, migration plan, testing reference, and deployment notes.
2. Inspect git status and preserve all existing work. Use the deploy tree as runtime authority; never promote root or `dist` copies by assumption.
3. State an exact, bounded outcome with source files, prohibited files, invariants, edge cases, acceptance checks, rollback, and stop conditions.
4. Confirm the work does not require production deployment, credentials, bindings, external messages, or real ministry data.

## Product gates

- Apply Calm OS and ministry-first language.
- Keep one question per screen and one primary action per workflow.
- Use delete-first thinking and progressive disclosure before adding UI.
- Enforce the documented attention and visual-weight budgets.
- Preserve Pastor Mode: one hand, low attention, interruption, seconds available.
- Prefer recognition, contextual dates, plain language, and grounded saved evidence.
- Never invent, diagnose, spiritually score, or rank people.

## Data, privacy, and AI gates

- Preserve local-first behavior, localStorage, IndexedDB, Device Vault encryption, Auto Memory, backups, offline access, and unknown legacy properties.
- Keep old backup import/re-export and dormant `preferredContactMethod` compatibility additive and nondestructive.
- Use the shared capture pipeline and existing `aiProposals` approval architecture; do not create parallel savers or proposal stores.
- AI may propose only. A human must review selected actions and explicitly approve before permanent records change.
- Sensitive source context must remain sensitive in every derived record and preview.
- External AI or integration context must be minimal, opt-in, reversible, server-mediated, and protected by the existing privacy gates.
- Never place credentials in browser assets, tests, docs, screenshots, or tracked source.

## Interaction and engineering gates

- Recover interrupted capture, profile drafts, proposal edits, processing state, retry, and service-worker update state.
- Prevent duplicate submission, partial corruption, stale encrypted writes, and wrong-person inference.
- Maintain semantic HTML, labels, focus order, modal focus containment, VoiceOver names, 44px targets, contrast, reduced motion, safe areas, scalable text, and non-color cues.
- Bound repeated rendering and fuzzy work; preserve full access through deliberate batching rather than truncating data.
- Prefer focused helpers and small vertical slices over a framework rewrite.
- Update app/package version, deploy service-worker cache, and CSP hash together after deployable changes.
- Keep required Function mirrors byte-identical; do not deploy or bind optional Workers without exact approval.

## Verification and handoff

1. Add regression coverage for intentional behavior and adversarial shapes; never delete valid tests to make a change pass.
2. Run `npm test`, every tracked repository-mandated focused check, syntax validation, staged-candidate whitespace/secret/drift checks, and relevant timezone/browser/device checks.
3. Label automated, simulated-browser, live-preview, real-iPhone, provider, and production evidence separately. A missing tool or file is `NOT VERIFIED`, never a pass.
4. Record decisions, cognitive-load effect, compatibility effect, files, tests, removals, and known limits in the implementation records.
5. Do not merge or deploy without explicit authorization. Never use a production action to prove a local change.

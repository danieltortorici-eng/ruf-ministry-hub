# Calm OS independent release-candidate audit

Audit date: 2026-07-15
Branch: `redesign/calm-os-next-action`
Audited source: `ruf-ministry-hub-deploy-working/` (the documented deploy authority)
Audit posture: the implementation was treated as untrusted; workers reviewed the rendered source and executable paths, not only the prior documentation.

## Scope and method

Eleven independent review roles inspected the canonical HTML, service worker, Pages Functions, storage/recovery code, tests, and generated/deploy boundaries. Findings were reproduced with the maintained VM/browser harnesses where a live device or provider was unavailable. No production URL, credential, secret, merge, or deploy was used.

## Findings fixed in this audit

- Today could select archived-linked records, show completed/future-snoozed work, expose sensitive recommendation details, and duplicate the update notice. Recommendations now skip inactive links, completed/future-snoozed/malformed-snooze records, cap each priority tier, mask sensitive details, and show one compact critical alert.
- Backup maintenance could appear in `After that` while meaningful person care or ministry work was still available. Maintenance is now gated behind the absence of tier-1–8 recommendations, with regression coverage for both maintenance-only and ministry-present states.
- Sensitive privacy tiers were not consistently inherited by AI-created tasks, notes, meetings, people, or profile updates. Approved records now inherit source/action/person sensitivity, and the source tier is retained on the proposal if the source is later removed.
- A linked or candidate person marked Sensitive/Highly Sensitive/Do Not Send could leak a name or raw linked capture text to backend Quick Grab. Candidate filtering, explicit linked-person checks, the review gate, Search, and Snooze now block or mask that path before network use.
- AI review result panels, warnings, duplicate-person messages, and legacy confirmation surfaces could reveal raw sensitive generated text. Sensitive result panels and warnings now collapse to generic review language; approved-action selection remains independent and human-controlled.
- A synchronous localStorage quota failure could leave a newer IndexedDB mirror even though the local commit failed. Plain saves now commit localStorage first and only then mirror; encrypted saves stage localStorage and restore it if the atomic IndexedDB transaction aborts.
- Mixed legacy privacy flags now fail closed: a sensitive flag cannot be overridden by an explicit `Normal` tier, and marking an existing proposal `Do Not Send to AI` persists the tier and redacts previews even if its source is later removed.
- Legacy nested Auto Memory payloads and structurally empty local data were not recovered safely. Normalization now accepts the legacy nested `db` shape and yields to a valid IndexedDB mirror instead of treating `{}` as ministry data.
- Malformed snooze dates could be treated as due. Invalid non-empty snooze values are now withheld from Today, review, prompts, and Right Now until corrected.
- Search, Today recommendations, and linked-record surfaces could reveal a sensitive person identity or raw text through an otherwise-normal prayer, note, meeting, task, or capture. Linked-person sensitivity now participates in filtering and masking across task/prayer/important-capture/oldest-capture recommendations and profile history.
- A normal task linked to a Sensitive prayer could bypass profile, Brief Me, and Follow Up privacy checks. The central privacy-tier resolver now inherits linked prayer sensitivity for tasks and blocks or masks those contexts.
- The root-only syntax and asset audits could pass while the canonical deploy HTML was unchecked. The maintained scripts now inspect both compatibility root and deploy authority; the CSP hash was recomputed and verified against the deploy HTML and index.
- App Coach’s header actions were equal-weight. Refresh is now the single dominant action while navigation and reveal actions remain quiet.

## Worker verdicts

| Independent role | Verdict | Evidence boundary |
| --- | --- | --- |
| Product Constitution Auditor | PASS after fixes | Today contract, one-action hierarchy, privacy masking, archive/snooze exclusions, and compact alerts reproduced in the harness. |
| Cognitive Load Auditor | PASS after fixes | Prayer administration is disclosed under More; Today remains three sections; capture and Coach controls are quieter. |
| Mobile/iPhone UX Auditor | PASS for source/live preview | 390px/430px/large-text contracts and live preview checks showed no horizontal overflow or Right Now label overlap. Real iPhone Safari remains separate. |
| Data Compatibility Auditor | PASS | IndexedDB/localStorage recovery, encrypted transaction abort, legacy Auto Memory, dormant preferred contact, and backup round-trip tests passed. |
| Privacy and AI Approval Auditor | PASS | Source-tier propagation, linked-person backend blocking, redacted proposals, selected approval, and idempotency tests passed. |
| Offline and Service Worker Auditor | PASS for synthetic lifecycle | Required-shell failure, non-OK navigation fallback, cache-write failure, offline shell, update flush, and API pass-through tests passed. |
| Accessibility Auditor | PASS for static/automated scope | Landmark, labels, focus, modal, contrast, target-size, reduced-motion, safe-area, and large-text checks passed. |
| Performance Auditor | PASS for bounded local scope | Search/profile/recommendation batches, image limits, undo cap, fingerprinting, and live preview timing were reviewed. |
| Regression Test Auditor | PASS | Maintained suite and timezone runs passed; valid tests were retained and new regressions were added for every confirmed fix. |
| Adversarial QA Auditor | PASS after fixes | Sensitive linked identity/raw capture, malformed snooze, source deletion, duplicate warning, retry, offline, and mobile cases were reproduced and fixed. |
| Source-of-Truth Consistency Auditor | PASS | Deploy authority, Function mirrors, generated output, secrets, assets, versions, CSP, and deploy-root shape are synchronized. |

## Commands and results

The final clean-state run is recorded by the following exact commands; each exited 0 unless explicitly marked NOT VERIFIED:

```text
npm test
node tests/regression-harness.js
TZ=UTC node tests/regression-harness.js
TZ=Pacific/Kiritimati node tests/regression-harness.js
TZ=America/Adak node tests/regression-harness.js
TZ=America/Los_Angeles node tests/regression-harness.js
node tests/person-profile-fix-regression.js
node tests/ai-functions-regression.js
node tests/calm-os-recovery-regression.js
node tests/calm-os-accessibility-regression.js
node tests/service-worker-lifecycle-regression.js
node tests/ai-rate-limiter-regression.js
node tests/deployment-config-regression.js
node tests/github-coordination-regression.js
node tests/incident-response-simulations.js
node check-app-syntax.mjs
node audit-assets.mjs
node audit-generated-output.mjs
node audit-secrets.mjs
node --check ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js
node --check functions/api/ai/quick-grab.js
node --check functions/api/ai/health.js
node --check ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js
node --check ruf-ministry-hub-deploy-working/functions/api/ai/health.js
node --check cloudflare/ai-rate-limiter/worker.js
git diff --check
```

The repository’s maintained suite does not contain the separately named Calendar, Secretary, Worker Optimizer, or Worker Steward source/tests; those paths are `NOT VERIFIED`, not substituted or claimed as passes. Real provider AI, real iPhone Safari, VoiceOver, OS suspension, and production Pages behavior are also `NOT VERIFIED` in this local audit.

## Release disposition

No unresolved high-severity defect remains in the audited local implementation. The branch is ready for review only. Nothing was deployed, merged, pushed, bound, credentialed, or changed in production.

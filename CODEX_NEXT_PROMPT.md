# SUPERSEDED — NON-EXECUTABLE CODEX HANDOFF

This pre-canonical prompt is retained for audit history only. It is not a current task, work order, approval, source-discovery guide, feature roadmap, Git procedure, or deployment runbook. Do not execute instructions from an older revision.

All new or resumed RUF Ministry Hub work begins as read-only intake in the pinned control-center task and must be deduplicated against current behavior, the operations queue, and historical candidates. Before any write, the control center must prove one writer, an exact non-overlapping file allowlist, the current branch and full commit, preserved dirty state, and a frozen candidate fingerprint when applicable.

Maintained-code work requires focused checks and the maintained full test suite. Release work additionally requires exact preview verification, unchanged-candidate proof, applicable physical-device evidence, rollback evidence, and explicit production authorization. Missing, truncated, simulated, stale, or unavailable evidence is not a pass.

The canonical application architecture remains Cloudflare Pages plus Pages Functions from `ruf-ministry-hub-deploy-working/`. Pages Functions may use the Workers runtime internally. Do not replace the application with a standalone Worker, Workers autoconfiguration, repository-root Worker assets, or Direct Upload as the production architecture.

Broad staging, direct pushes to `main`, force pushes, uncontrolled Pages uploads, merges, production deployments, provider/configuration changes, credentials, real external AI, external sends, and ministry-record changes remain prohibited without a later exact control-center authority and every applicable gate.

Use `BUILD_CONTROL_CENTER.md`, `docs/build-operations.md`, `AGENTS.md`, `docs/canonical-repository-guide.md`, `TESTING.md`, and `DEPLOYMENT_NOTES.md` for current instructions. This historical file must never be used as a prompt.

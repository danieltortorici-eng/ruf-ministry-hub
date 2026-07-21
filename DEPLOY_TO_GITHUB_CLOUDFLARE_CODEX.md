# SUPERSEDED — NON-EXECUTABLE DEPLOYMENT HANDOFF

This file is retained only as historical evidence of the pre-canonical workflow. It has no implementation, Git, GitHub, Cloudflare, preview, production, or approval authority. Do not copy commands from an older revision of this file.

The current sources of truth are:

1. Daniel's current explicit instruction in the pinned RUF Build Single Control Center task.
2. `BUILD_CONTROL_CENTER.md`.
3. An exact active work order and frozen candidate receipt under `docs/build-operations.md`.
4. `AGENTS.md`, `docs/canonical-repository-guide.md`, `TESTING.md`, and `DEPLOYMENT_NOTES.md`.

The application architecture is Cloudflare Pages with Pages Functions from `ruf-ministry-hub-deploy-working/`. Pages Functions may use the Workers runtime internally; the application must not be converted to or deployed as a standalone Worker.

## Historical conflicts retired

The former handoff attempted to discover another source folder, initialize or broadly stage a repository, push directly to `main`, copy files across unverified output folders, tolerate unavailable tests, and perform an uncontrolled direct Pages upload. Those instructions are superseded and intentionally no longer executable here.

Current work must instead preserve one writer, exact file allowlists, frozen fingerprints, required focused and full tests, preview verification, unchanged-candidate proof, physical-device gates when applicable, rollback evidence, and Daniel's exact production authorization. Broad staging, direct `main` pushes, force pushes, standalone Worker deployment, uncontrolled Pages uploads, Direct Upload as production architecture, provider/configuration changes, credential changes, real-AI enablement, and production deployment are prohibited unless the current control center supplies a later exact authority and every required gate passes.

This historical file must never be used as a runbook.

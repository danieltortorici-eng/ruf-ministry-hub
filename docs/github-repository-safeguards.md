# GitHub Repository Safeguards

Last reviewed: 2026-07-14.

This document is a setup recommendation for `danieltortorici-eng/ruf-ministry-hub`. The repository files in this change do not modify GitHub settings, push a branch, merge `main`, or deploy the app.

## Files Enforced In The Repository

- `.github/workflows/ci.yml` runs on every pull request, pushes to `main`, and manual dispatches.
- The workflow has only `contents: read`, does not persist checkout credentials, pins every third-party action to a full commit SHA, cancels superseded runs, and retains failure logs for 7 days.
- `npm test` runs syntax checks, all maintained regression suites, asset checks, generated-output drift checks, and tracked/proposed-secret and browser-boundary checks.
- `.github/CODEOWNERS` assigns Daniel as the owner of all content and calls out CI, privacy, Pages Functions, and deploy boundaries explicitly.
- `.github/pull_request_template.md` requires reviewers to check privacy, AI approval, deploy-source synchronization, verification, and rollback.

The generated-output audit intentionally enforces only the two Pages Function mirrors required by `AGENTS.md`. The root compatibility PWA and `dist/ruf-ministry-hub.html` are maintained artifacts with intentional differences from the deploy source, so byte equality would be a false invariant.

## Recommended `main` Ruleset

Create a branch ruleset targeting the default branch `main` and start in **Evaluate** mode. After one representative pull request proves the check name and CODEOWNERS behavior, switch it to **Active**.

Recommended rules:

1. Require a pull request before merging.
2. Require the status check `CI / verify` and require the branch to be up to date before merging.
3. Require conversation resolution.
4. Block force pushes and branch deletion.
5. Require linear history if the repository will use squash or rebase merges consistently.
6. Do not grant routine bypass access. Reserve a documented emergency bypass for the repository owner, and require a follow-up pull request when it is used.

For a one-person repository, requiring an approving review or a CODEOWNERS review can deadlock Daniel's own pull requests because authors cannot approve their own changes. Keep CODEOWNERS active for ownership and notifications, but enable **one approval**, **dismiss stale approvals**, and **require CODEOWNER review** only after adding a second trusted reviewer. For contributions opened by someone else, Daniel can serve as the required code owner immediately.

## Recommended Actions Settings

In **Settings → Actions → General**:

- Set the default `GITHUB_TOKEN` permission to **Read repository contents and packages permissions**.
- Do not allow workflows to create or approve pull requests.
- Allow GitHub-authored actions and only explicitly reviewed third-party actions.
- Require actions to be pinned to a full-length commit SHA if the repository plan exposes that policy.

The checked-in workflow remains least-privilege even if repository defaults are broader, but restrictive repository defaults protect future workflows too.

## Recommended Merge And Secret Settings

- Enable automatic branch deletion after merge.
- Prefer squash merge for a short, reviewable `main` history; keep merge policy consistent with the linear-history rule.
- Enable secret scanning and push protection if available for the repository plan.
- Never add production credentials as Actions secrets for this test-only workflow. OpenAI and Cloudflare production secrets belong in Cloudflare Pages runtime settings, not GitHub CI.
- Treat any alert involving a real secret as an incident: revoke or rotate it first, then remove it from the branch and review repository history.

## Setup Verification

Use a synthetic documentation-only pull request to verify:

1. `CI / verify` starts automatically.
2. A second commit cancels the superseded run.
3. A deliberately failing test produces a failure-log artifact that expires after 7 days; remove the deliberate failure before merge.
4. `main` cannot merge while `CI / verify` is pending or failing.
5. A non-owner change requests Daniel's CODEOWNERS review.

Do not test secret scanning with a real credential. Use a clearly fake string that does not resemble a provider token, or exercise the audit with an isolated synthetic fixture that is never committed.

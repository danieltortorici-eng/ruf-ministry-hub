# RUF Ministry Hub Incident Response

Last reviewed: 2026-07-13.

This runbook covers suspected or confirmed secret exposure, abuse of the public AI route, failed production deploys, data-loss reports, service-worker outages, and Cloudflare Worker loops. It applies to the canonical Cloudflare Pages app whose deploy root is `ruf-ministry-hub-deploy-working`.

The workflow is human-controlled. Detection and AI may propose a classification or response, but Daniel or a designated human incident commander approves production changes. Daniel must approve every ministry-record create, update, restore, merge, or delete. Simulations use synthetic fixtures, make no network requests, send no messages, and change no records.

## Non-negotiable safety rules

1. Protect people before uptime. Treat ministry content, identities, prayer details, meeting notes, and donor information as sensitive.
2. Do not open, copy, print, or upload `.env.local`, production secrets, raw request bodies, Quick Grab text, candidate-person lists, browser storage, or real ministry records during triage.
3. Never paste a credential into an incident log, terminal transcript, issue, chat, screenshot, test, or postmortem. Record only provider, environment, secret name, owner, rotation state, and a non-secret identifier when policy allows it.
4. Do not tell a user to clear browser storage, unregister the service worker, uninstall the PWA, or restore a backup while data loss is being investigated. Those actions can destroy local evidence or overwrite recoverable data.
5. Preserve evidence before rollback when safe. Containment wins when delay would prolong exposure or harm; record what could not be preserved and why.
6. No automation may deploy, roll back, purge caches, rotate/revoke credentials, change DNS/WAF rules, send external messages, delete evidence, or mutate ministry records without explicit human approval.
7. Use Cloudflare Pages controls for this app. Do not use `npx wrangler deploy` and do not treat an accidental `workers.dev` deployment as production.

## Roles and authority

One person may fill several roles, but name them in the incident log.

| Role | Authority and responsibility |
| --- | --- |
| Incident commander (IC) | Declares severity, owns the timeline, approves containment/rollback, assigns owners, and closes the incident. Default: Daniel unless delegated. |
| Technical responder | Investigates with metadata-only evidence, proposes changes, runs approved validation, and records exact results. Cannot silently broaden data access. |
| Credential owner | Creates replacement credentials in the provider, updates Cloudflare Pages secrets, validates, revokes the predecessor, and reports completion without sharing values. |
| Communications owner | Drafts and sends approved status updates. Simulations only render templates; they never send them. |
| Data steward | Protects local ministry data and approves evidence handling, export, restore, merge, or deletion. Daniel approves record changes. |
| Scribe | Maintains a private UTC timeline, decision log, evidence index, and follow-ups without sensitive payloads. |

## Severity levels

Use the highest matching level. Raise severity while scope is uncertain and a credible privacy, credential, or irreversible-data risk exists. Lower it only when evidence supports the change.

| Level | Definition | Examples | Response target | Update target |
| --- | --- | --- | --- | --- |
| SEV-1 Critical | Active/credible exposure of a usable production credential; sensitive data exposure; confirmed broad or irreversible data loss; uncontrolled cost/compromise with immediate material harm. | Public active provider token; ministry content sent to an unintended party; destructive restore affecting multiple users. | Declare and contain immediately. | Every 30 minutes until stable. |
| SEV-2 High | Production is unavailable or materially unsafe; sustained AI abuse or Worker loop; widespread service-worker failure; credible but unconfirmed data loss. | Failed Pages deploy; sustained `1019`; many clients cannot load; one user reports missing local records with scope unknown. | Begin within 30 minutes. | Every 60 minutes until stable. |
| SEV-3 Moderate | Limited degradation with a safe workaround and no exposure or irreversible loss evidence. | Isolated stale service worker; preview failure; blocked abuse probes with normal cost/availability. | Same working day. | At material changes and resolution. |
| SEV-4 Low / Event | No user impact, false positive, or exercise; track for hardening. | Synthetic drill; scanner match confirmed as placeholder; one transient error below threshold. | Normal workflow. | At closure. |

Targets are operating goals, not guarantees. Promote an event if privacy, credential, cost, availability, or integrity risk grows.

## Detection inputs and privacy boundary

Use the least sensitive evidence that answers the question.

| Input | Safe fields to collect | Never collect in the incident log |
| --- | --- | --- |
| Cloudflare Pages deployments | Project/environment, deployment ID, production/preview, commit SHA, UTC time, status, rollback target ID | Secret values, build environment contents |
| Pages Function / Workers metrics | UTC window, route, request/error counts, status classes, outcomes, latency bands, error code such as `1019`, sampled Ray IDs | Authorization headers, bodies, Quick Grab text, candidate people |
| AI provider usage | UTC window, project, model, aggregate requests/tokens/cost/rate limits, safe provider request IDs | Prompts, outputs, API key, ministry content |
| Repository/security scan | File path, commit SHA, scanner rule, first/last seen, whether credential is active | Matched credential text or a diff containing it |
| PWA/service worker | App version, `CACHE_NAME`, browser/OS, installed vs tab, online/offline result, affected route, affected-user count | Browser storage dump, ministry screenshots, exported records |
| Data-loss report | Device/browser, app version, time, preceding action, approximate record counts/types, backup existence/date | Names, prayer text, notes, raw backup, PIN, recovery key |
| User report | Channel, timestamp, impact statement, follow-up consent | Unnecessary ministry detail |

Workers Logs can be filtered by error metadata or invocation outcome, but logging must remain payload-free. Increasing sampling, enabling logging, or exporting logs is a production change requiring IC/data-steward approval.

## Common response workflow

### 1. Declare and stabilize

1. Create incident ID `IR-YYYYMMDD-NN`.
2. Record UTC start/detection times, reporter, suspected type, severity, IC, and known impact.
3. Open a private incident log with access limited to responders.
4. State what must not change: deploys, credentials, browser storage, affected records, or an accidental Worker route.
5. Choose the smallest reversible containment. Record approver, action, time, and expected effect before execution.

### 2. Preserve evidence

Capture metadata before changing state when safe:

- current/previous production deployment IDs and commit SHAs;
- `APP_VERSION`, service-worker `CACHE_NAME`, and affected route;
- UTC metric window, aggregate status/error counts, Worker outcome/code, and a few Ray/provider request IDs;
- repository path and commit for a secret finding, without the value;
- reporter device/browser/version and action sequence;
- commands, approvals, results, and hashes of non-sensitive artifacts.

Store evidence read-only where practical. Never edit an original. If evidence might contain ministry data or a credential, do not ingest it into AI or a general-purpose issue tracker.

### 3. Contain, recover, and validate

1. Apply the relevant playbook.
2. Prefer reversible controls that preserve the local-first app: AI mock mode, a known-good Pages rollback, a targeted route control, or a new service-worker version.
3. Validate from a clean browser context without deleting the affected user's storage.
4. Run repository checks appropriate to the change. A dashboard status alone is insufficient.
5. Keep proposal separate from execution. Record the human approver for every production/data action.

### 4. Communicate and close

1. Use approved templates; disclose only confirmed impact and safe workarounds.
2. Never include ministry content, credentials, exploit detail, or speculation.
3. Close only when containment is durable, validation passes, users have a safe next step, rotation is complete/handed off, and follow-up owners/dates exist.
4. Schedule a postmortem for SEV-1/SEV-2 and any meaningful privacy, integrity, or repeat-risk lesson.

## Scenario playbooks

### Secret exposure

**Detect from:** repository scanner, public commit/report, dashboard audit, provider alert, unexpected usage, or a credential in a log/screenshot.

**Containment**

1. Treat a credible public production credential as SEV-1 until proved inactive or synthetic.
2. Stop distribution by removing authorized public access. Do not paste the value while coordinating.
3. Freeze deployments/log exports that might replicate it.
4. Credential owner creates a replacement securely, updates the Pages production secret, validates a safe path, then revokes the predecessor. If active misuse is occurring, revoke first and accept temporary degradation.
5. For an OpenAI key, approved temporary containment is `AI_MOCK_MODE=true` or removal of `OPENAI_API_KEY`; external requests stop while local mock proposals remain.

**Evidence:** provider/environment/name, discovery source, exposure window/reach, commit/file/log identifier, aggregate usage, audit events, rotation timestamps, and non-secret credential identifier. Never save the value.

**Recovery/rotation:** owner reports `replacement created -> Pages secret updated -> safe validation passed -> predecessor revoked -> usage reviewed`. Rotate related credentials when reuse/scope is uncertain. Deleting a current file does not remove git history or third-party copies; IC separately approves host/history remediation. Run `npm run audit:secrets` before a later deploy.

**Close when:** predecessor is revoked, replacement validated, public artifacts/history addressed, unusual usage reviewed, and downstream rotations owned.

### Public AI abuse

**Detect from:** request/token/cost spike, repeated unauthorized traffic, elevated 429/5xx, provider alert, latency, or scripted `/api/ai/quick-grab` reports.

**Containment**

1. Use SEV-1 for credible sensitive-data exposure, credential compromise, or uncontrolled material cost; otherwise sustained abuse is SEV-2.
2. With approval, set `AI_MOCK_MODE=true` or remove `OPENAI_API_KEY` to stop external OpenAI requests while preserving local mock proposals.
3. If traffic threatens availability, an authorized operator may add a narrow Cloudflare control for `/api/ai/quick-grab` after testing. Record rule, scope, expiration, and rollback.
4. `RUF_HUB_AI_ACCESS_TOKEN` blocks callers without `X-RUF-HUB-AI-Token`, but the current browser bundle does not send it. Enabling it is a break-glass action that makes browser AI calls fail until a compatible flow exists.
5. Never auto-save, bulk-approve, or replay proposals. Daniel reviews selected actions before a local record is saved.

**Evidence:** aggregate requests/tokens/cost, codes, latency, route, time window, sampled Ray/provider IDs, deployed commit, mock/token state, and rule IDs. Never retain prompts, outputs, bodies, candidates, or headers.

**Recovery:** keep mock mode until the route is bounded, cost understood, key safety verified, and a low-volume synthetic test passes. Restore real AI only with IC approval and rollback trigger.

### Failed deploy

**Detect from:** Pages build failure, unhealthy production, blank/wrong app, missing assets, `/api/ai/health` failure, regression report, or version/cache mismatch.

**Containment**

1. Stop deploys and identify the last known-good successful production deployment.
2. For material production breakage, use Pages **Deployments** to roll back to that production deployment. Preview deployments are not valid rollback targets.
3. Do not deploy a separate Worker or use `npx wrangler deploy`.

**Evidence:** failed/prior deployment IDs, production/preview status, SHAs, build summary, UTC window, affected URLs/statuses, `APP_VERSION`, `CACHE_NAME`, and pre-deploy tests. Never preserve environment values.

**Validation:** Pages URL, direct HTML, manifest/icons, offline shell after one online load, `/api/ai/health`, and a synthetic/mock proposal. Confirm `/api/*` bypasses the service worker. Pages rollback alone does not prove every browser replaced its cached service worker.

### Data-loss report

**Detect from:** missing/changed records, empty app after browser/PWA change, failed import/restore, Auto Memory Vault issue, or unexpected counts.

**Containment**

1. Credible unscoped report is SEV-2; confirmed broad, sensitive, or irreversible loss is SEV-1.
2. Ask user to stop editing on that browser profile. Do not clear site data, unregister, uninstall, reset demo data, import, restore, merge, or clean up.
3. Gather only device/browser/app version, time, preceding action, approximate counts/types, backup/restore-point existence/date, and profile/device changes.
4. If app opens, propose a private encrypted backup export only with user/data-steward approval. Do not ask them to transmit it through ordinary support.

**Evidence:** report without ministry details, times, versions, action path, approximate counts, backup metadata, payload-free error class, and consent/approvals.

**Recovery:** reproduce only with synthetic fixtures. Preview backup/restore candidates and validate schema/version. Never restore over the only copy. Daniel explicitly approves every restoration/mutation. This app is local-first; do not imply a server copy exists.

### Service-worker outage or stale cache

**Detect from:** old UI, install/activate/fetch errors, offline failure, reload/update loop, `CACHE_NAME` mismatch, mixed assets, or apparently cached API responses.

**Containment**

1. Separate Pages deployment, Cloudflare edge cache, browser HTTP cache, and browser service-worker Cache Storage. A CDN purge does not clear a user's service worker or local app data.
2. Do not begin with Clear Site Data, unregister, uninstall, or storage deletion. Preserve IndexedDB/localStorage and pause edits if version skew threatens records.
3. Verify production in a clean profile, then compare affected app version, controller, cache name, online/offline result, and failed asset.
4. For a faulty deployed service worker, roll back Pages or ship an approved correction with new `CACHE_NAME`; bump app and service-worker versions for deployable changes.
5. Use targeted URL purge only when edge staleness is proven. Purge Everything is separately approved and still does not repair browser service-worker state.

**Evidence:** deployment/commit, app/cache version, worker state, browser/OS, asset/route/status, error class, reproduction, and whether local data exists. No storage dumps.

**Validate:** first online load, offline navigation, direct HTML, version alignment, assets, update without loop, `/api/*` bypass, and synthetic local-record preservation.

### Worker loop

**Detect from:** Cloudflare `1019`, repeated self/subrequests, invocation/CPU/error spikes, recursive traces, accidental Worker traffic, or Pages Functions cycling through public Worker URLs.

Cloudflare reports `1019` when a Worker reaches its loop limit. This app should run as Pages plus Pages Functions, not as a separate Worker.

**Containment**

1. Sustained production `1019` or availability/cost impact is SEV-2; promote for exposure or uncontrolled material harm.
2. Stop deploys. Locate the loop in Pages Function, redirect, accidental Worker route, or another service.
3. Use the smallest approved break: Pages rollback, disable accidental route, or AI mock mode on the AI dependency path. Do not add retries to recursion.
4. Do not use a public URL for Worker-to-Worker recursion. Future designs need bounded calls, suitable bindings, explicit hop/depth guards, and timeouts.

**Evidence:** error code/outcome, route, UTC window, aggregate invocations, deployment/commit, routing config, redacted hop sequence, sampled Ray IDs, and CPU/latency/error aggregates. No bodies/headers.

**Recovery:** reproduce with a synthetic route graph, add deterministic depth regression, validate Pages routes, and observe an agreed quiet window. Never rely on unlimited retries.

## Credential rotation handoff

Never put a value in this record.

```text
Incident ID:
Provider / project / environment:
Secret name (not value):
Credential owner:
Exposure confirmed? yes / no / unknown
Temporary containment and approver:
Replacement created at (UTC):
Cloudflare Pages secret updated at (UTC):
Safe validation and result:
Predecessor revoked at (UTC):
Usage/audit window reviewed:
Related credentials reviewed:
Non-secret identifier recorded, if allowed:
Owner sign-off:
```

If different people create, install, and revoke a credential, each reports status only. Never move the value through the incident channel.

## Communication templates

All messages require communications-owner and IC approval. Replace brackets with verified facts and omit sensitive detail.

### Internal declaration

```text
[IR-ID] [SEV] — [short factual impact]
Detected: [UTC]
Incident commander: [name]
Known scope: [confirmed users/routes/environments]
Current containment: [approved action or none]
Data/credential status: [safe / at risk / investigating]
Next decision or update: [UTC]
Do not: [deploy / clear browser data / use AI route / other]
```

### User acknowledgment

```text
We are investigating [plain confirmed symptom].
For now, please [safe workaround]. Do not clear site data, uninstall the app, or restore a backup unless asked after preserving current data.
We do not need ministry record text or credentials. If possible, send only [browser/device, app version, approximate time, non-sensitive steps].
Next update: [time or condition].
```

### Degraded AI service

```text
AI suggestions are temporarily using the local mock path / unavailable while we investigate abnormal activity. Existing local records remain on the device, and no AI suggestion can save a record without Daniel's approval. Continue using non-AI local features. Next update: [time].
```

### Resolution

```text
[IR-ID] resolved at [UTC]. [Service/function] is operating normally.
Confirmed impact: [facts only].
User action: [none / safe steps].
Data/credential status: [facts only].
We are completing a postmortem and tracked follow-ups; additional user-relevant action will be shared directly.
```

## Postmortem and follow-through

For SEV-1/SEV-2, draft within five working days unless active recovery takes priority. Keep it blameless and metadata-only.

1. Summary and severity rationale.
2. Confirmed impact: users, duration, routes, availability, cost band, credential/data status.
3. Detection signal/gap and time to declare, contain, and recover.
4. UTC timeline of observations, decisions, approvals, changes, validation, and communication.
5. Root cause and contributing conditions; distinguish evidence from inference.
6. What went well, what was difficult, and where safety/privacy guardrails affected response.
7. Corrective actions with one owner, due date, verification, rollback, and priority.
8. Added test/simulation and synthetic fixture name.
9. Automation review: what may detect/propose and what remains human-approved.
10. Evidence location/access/retention/deletion date.

Never include real record text, names, screenshots, raw prompts, secrets, storage dumps, or unredacted logs.

## Automation limits

Allowed deterministic automation may classify synthetic signals, propose severity/checklists, verify coverage, fail CI on changed decisions, and draft (not send) templates.

Automation must never:

- inspect `.env.local`, production secret values, real ministry records, or real incident payloads;
- make network requests during an incident simulation;
- send email, chat, issue, status-page, or user messages;
- change Cloudflare, OpenAI, GitHub, DNS, WAF, cache, route, deployment, or credential state;
- restore, merge, delete, or otherwise mutate a ministry record;
- decide an AI proposal is approved; Daniel approves selected record actions;
- erase or rewrite evidence.

Production automation beyond detection needs a separate privacy/security design, explicit opt-in, reversible controls, and a human approval gate.

## Deterministic simulation

```sh
node tests/incident-response-simulations.js
```

The runner reads `tests/fixtures/incident-simulations.json`, performs no I/O beyond local fixture/runbook reads and console output, and asserts deterministic severity, containment, evidence, and approval results. It is not a real incident or authorization to execute an action.

## Official references

- [Cloudflare Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Cloudflare Workers errors, including `1019`](https://developers.cloudflare.com/workers/observability/errors/)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare cache purge options](https://developers.cloudflare.com/cache/how-to/purge-cache/)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [RUF Ministry Hub OpenAI integration](openai-integration.md)

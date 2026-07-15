# Calm OS Performance and Recovery Audit

Audit date: 2026-07-15

## Accepted-base static baseline

- Deploy HTML: 577,038 bytes raw; 113,839 bytes with local gzip.
- Inline JavaScript: 554,090 bytes / 11,305 lines.
- Inline CSS: 22,058 bytes / 1,144 lines / 175 rule blocks.
- 529 functions, 75 renderers, 44 localStorage call sites, 45 `saveData()` call sites, and 127 render call sites.
- No framework, external font, analytics client, or application database dependency.

## Findings

| Severity | Finding | Required response |
| --- | --- | --- |
| P1 | `loadData()` seeds demo data before IndexedDB recovery, so missing localStorage can mask and later overwrite the recovery mirror. | Recover and normalize IndexedDB before any demo seed; test plain and locked-vault startup. |
| P1 | AI create-meeting/follow-up constructors silently update profile dates even when no `updatePerson` action was selected. | Make constructors side-effect-free for proposal execution; require independent selected updates. |
| P2 | Full DB is serialized to localStorage, mirrored to IDB, cloned for undo, and copied into Auto Memory; photos live inside the graph. | Keep safety first, reduce avoidable writes, cap/render previews, and avoid duplicate saves. |
| P2 | Encrypted save is delayed 250 ms without page-hide/visibility flush. | Flush safely on suspension boundaries and retain recoverable state. |
| P2 | Profiles render every record and then a second full timeline. | Render three-item previews and disclose remaining history. |
| P2 | Search rerenders the entire app per keystroke and uses repeated linear person lookups. | Build a person map per search and preserve input focus; measure with hundreds of synthetic records. |
| P2 | Draft hydration omits IndexedDB draft recovery; profile and proposal confirmation are not recoverable. | Add three capture draft keys, proposal-confirm recovery, IDB draft hydration, dictation/import flushes. |
| P2 | Capture/proposal retries have no stable idempotency key or persisted in-flight state. | Upsert by capture revision and processor version; add per-action execution keys. |
| Positive | Explicit service-worker activation, `/api/*` bypass, local-only data, and 360px photo resizing are sound foundations. | Preserve and regression-test them. |

## Phase 10 measured cleanup

The Phase 9 commit (`f580c42`) is the immediate pre-cleanup comparison point. Measurements use the same local Node script against the same authoritative HTML; they are source-size and static-complexity evidence, not browser timing.

| Measure | Phase 9 | Phase 10 candidate | Change |
| --- | ---: | ---: | ---: |
| HTML bytes | 664,955 | 574,448 | -90,507 (-13.6%) |
| Local gzip bytes | 131,054 | 116,277 | -14,777 (-11.3%) |
| File lines | 14,484 | 12,502 | -1,982 (-13.7%) |
| Inline JavaScript bytes | 630,067 | 542,094 | -87,973 (-14.0%) |
| Inline CSS bytes | 33,935 | 31,401 | -2,534 (-7.5%) |
| Named functions | 607 | 544 | -63 (-10.4%) |
| Named renderers | 92 | 77 | -15 (-16.3%) |

The candidate is also 2,590 raw bytes smaller than the accepted base despite the implemented Calm OS screens, design system, compatibility metadata, and recovery hooks added since that base.

### Verified deletions

- Removed the unreachable pre-Calm profile renderer and its duplicate card/timeline helpers.
- Removed dashboard-era Today renderers, shortcuts, toggles, attention presets, and obsolete CSS.
- Removed prompt-based profile create/edit/copy paths replaced by in-app sheets, unified capture, Brief Me, and Follow Up.
- Removed the parallel manual Quick Grab processing screen and saver. Every visible saved-capture Process action now enters `beginCaptureProcessing`, so permanent structured records remain behind the shared proposal approval executor.
- Removed the uninvoked test harness that exercised that deleted manual saver; maintained proposal selection, editing, partial approval, person resolution, rollback, and idempotency tests remain active.
- Dormant legacy `process:<captureId>` autosave keys are not rendered or mutated, but remain unknown-compatible backup data rather than being destructively purged.

### Static hot-path improvements

- Person lookup now uses a first-ID-wins map that preserves old duplicate-ID behavior and rebuilds after array replacement or length changes.
- Search builds one person map per query instead of scanning the People array for every linked result. With 500 people and 2,000 unmatched linked records, the former shape could perform up to 1,000,000 identifier comparisons; the new shape builds 500 entries and performs constant-time lookups.
- Duplicate review normalizes each name once and stops after 12 candidates. At 500 people the former pairwise shape examined 124,750 pairs and could normalize 249,500 values; the new helper normalizes 500 values while retaining the same bounded result contract.
- Pinned-person ranking uses a `Set`, and proactive recommendation deduplication uses a linear seen-ID set instead of repeated array scans.

### Finding status at the Phase 10 checkpoint

- Resolved before or during Phase 10: unselected proposal side effects, unbounded profile previews, repeated search person scans, capture/proposal idempotency, and the parallel capture saver.
- Phase 11 completion blockers at that checkpoint: recovery-first IndexedDB bootstrap, IndexedDB draft hydration, and serialized encrypted lifecycle flushes.

## Phase 11 recovery closure

- Startup now renders a recovery gate before any ministry screen or automatic archive logic. IndexedDB, localStorage, settings, copy, autosave, Auto Memory, and encrypted-envelope candidates are staged before writes.
- Missing and corrupt states are distinct. A first install seeds only after both stores are confirmed empty; unreadable data without a valid mirror pauses the app and keeps raw bytes untouched.
- An encrypted envelope or Device Vault setting fails closed. The in-memory ministry graph stays empty until successful unlock, and plaintext data/copy/draft keys are removed from the encrypted path.
- IndexedDB-only plaintext data is normalized before use, including additive schema markers and interrupted-processing recovery. Draft mirrors restore main, Today, and person-linked capture keys.
- Encrypted writes are revisioned, serialized at concurrency one, and coalesce to the newest snapshot. A failed encryption/write attempt retains the last durable envelope and can be retried without a plaintext fallback.
- Page hide, hidden visibility, and freeze boundaries synchronously persist eligible plaintext drafts and request an encrypted flush. PIN/vault-locked screens cannot erase a saved draft.
- Proposal-confirm recovery stores only recoverable selections and person choice. The final approval checkbox is deliberately excluded; Cancel and successful/status-changing exits clear the stable pointer.

Focused synthetic evidence covers IDB-only plaintext and encrypted startup, corrupt-local recovery and fail-closed pause, no-IDB first install, orphan vault state, revision races, synthetic encryption failure/retry, draft lifecycle flush, and proposal resumption. Real Safari storage quota, OS process termination, battery, memory, LCP, INP, and CLS remain `NOT VERIFIED`.

## Phase 12 bounded-work and durability closure

- People renders 40 cards initially and in 40-card increments. A 500-person synthetic set retains all records while limiting initial card output to 40.
- Search builds every matching result in memory but renders each result group in 30-item increments. A 499-match synthetic People result renders 30, then 60 on request.
- Profile history keeps three-item normal previews and reveals expanded collections in 50-record increments. A 300-note profile renders 3 normally, then 50/100/all through deliberate disclosure.
- Duplicate review now normalizes names once, indexes bounded candidate buckets, uses a two-row distance calculation with a maximum-distance early exit, and caps comparisons at 12,000 for a 500-person set. The advisory result remains capped at 12.
- New profile photos reject inputs above 20 MB before decode and retain the existing 360px/0.78 JPEG resize boundary.
- Plaintext writes request the IndexedDB recovery mirror before localStorage confirmation. Backup restore and Device Vault disable use rollback/staging boundaries under deterministic quota failures.
- Service-worker activation waits for a successful draft/vault flush; offline document navigation returns the cached app shell in the executed worker simulation.

These are deterministic source/VM measurements, not browser performance vitals. Real 390px/430px Safari rendering, slow-device input latency, storage quota behavior, memory, battery, LCP, INP, CLS, and OS suspension remain `NOT VERIFIED` pending manual device evidence.

## Evidence limits

Source measurements are `OBSERVED`; focused synthetic regressions are `AUTOMATED`. LCP, INP, CLS, memory, battery, real Safari quota, slow-device behavior, and real offline startup are `NOT VERIFIED` until browser/device evidence is captured.

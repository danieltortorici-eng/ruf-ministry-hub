# Calm OS Performance and Recovery Audit

Audit date: 2026-07-15

## Static baseline

- Deploy HTML: 577,038 bytes raw; approximately 113,871 bytes with local gzip.
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

## Evidence limits

Source measurements are `OBSERVED`; baseline tests are `AUTOMATED`. LCP, INP, CLS, memory, battery, real Safari quota, slow-device behavior, and real offline startup are `NOT VERIFIED` until browser/device evidence is captured.

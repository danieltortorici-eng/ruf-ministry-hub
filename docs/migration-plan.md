# Calm OS Migration and Rollback Plan

## Strategy

Use additive normalization, never a destructive rewrite. Existing storage identifiers and backup envelope version 2 remain stable. A new optional `dataSchemaVersion` describes normalized capabilities without preventing old version-2 backups from loading.

## Schema versions

| State | Interpretation |
| --- | --- |
| Missing `dataSchemaVersion` | Pre-Calm version-2 data; normalize in memory. |
| `dataSchemaVersion: 3` | Calm OS additive fields and dormancy contract available. |
| Future greater version | Reject only if the payload cannot be safely understood; never partially replace current data. |

`version: 2` remains the portable envelope version. This separates backup container compatibility from the additive application-data schema.

## Forward normalization

1. Validate the envelope, identifiers, size, depth, and plain-JSON boundaries before mutation.
2. Require the six historical ministry collections: people, Quick Grabs, notes, meetings, prayers, and tasks.
3. Permit a historical version-2 backup with no `aiProposals`; normalize that collection to `[]`.
4. Preserve all unknown record properties.
5. Add missing safe runtime defaults, including photo, capture revision/state, arrays, and proposal selection metadata.
6. Preserve existing `preferredContactMethod` exactly as dormant data. Never search, sort, render, recommend from, brief from, or create it.
7. Run relational validation before replacing the live in-memory database.
8. Capture an Auto Memory restore point before an approved restore and retain the existing undo boundary.

## Startup recovery order

```text
read settings safely
  -> if vault enabled: recover encrypted envelope from localStorage or IndexedDB
  -> otherwise: read localStorage data
  -> if absent: read IndexedDB data and normalize
  -> recover drafts/copy/Auto Memory from the same conservative precedence
  -> only if neither data store has recoverable data: create fictional demo data
  -> restore interrupted local workflow without automatic external resend
```

Corrupt localStorage must not cause immediate demo seeding when IndexedDB or encrypted recovery may still exist. Failures leave data untouched and surface a safe local error.

## Capture/proposal migration

- Existing Quick Grabs remain valid and receive defaults only in normalized memory.
- Existing proposals retain IDs, status, selection, edits, and result metadata.
- New proposal keys and action execution links are additive.
- A stale `processing` capture recovered after restart becomes retryable `failed`; it is never resent automatically.
- Save for later creates only a raw capture and does not update people or structured collections.

## Backward and round-trip guarantees

Focused synthetic tests must prove:

1. Pre-Calm version-2 data imports without destructive loss.
2. Dormant preferred-contact values survive import, current export, and re-import byte-for-byte at the field level.
3. Existing IDs and record links survive.
4. Settings, drafts, sensitivity/privacy flags, Waiting status, Auto Memory, and Device Vault behavior survive.
5. Missing `aiProposals` normalizes to an empty collection.
6. Current data exported by Calm OS can be read again by Calm OS after a code rollback that ignores additive fields.

Historical formats older than the repository's version-2 contract are not available and remain `NOT VERIFIED`; the implementation must not invent or destructively guess their shape.

## Rollback

- Runtime rollback is a Git revert of phase commits in reverse order; no production rollback is part of this task.
- Because fields are additive and the envelope/storage keys are unchanged, older accepted code ignores Calm OS metadata while retaining historical collections and dormant values.
- Never clear localStorage, IndexedDB, the vault, or Auto Memory as a code rollback step.
- If normalization fails, keep the original serialized payload and current live data unchanged.

## Stop conditions

Stop implementation if a real backup demonstrates an incompatible undocumented format, an edit would require deleting a legacy property, encrypted recovery cannot be made conservative, or any migration path partially mutates before validation succeeds.

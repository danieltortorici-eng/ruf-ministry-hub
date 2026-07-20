# Calm OS Migration and Rollback Plan

## Strategy

Use additive normalization, never a destructive rewrite. Existing storage identifiers and backup envelope version 2 remain stable. An optional `dataSchemaVersion` describes normalized capabilities without preventing supported historical version-2 backups from loading.

## Portable backup schema versions

| State | Interpretation |
| --- | --- |
| Missing at both the envelope and nested-data positions | Supported pre-Calm version-2 data; normalize in memory. |
| Exact JSON number `2` at only the envelope, only nested data, or both matching positions | Supported historical additive schema. |
| Exact JSON number `3` at only the envelope, only nested data, or both matching positions | Supported current Calm OS additive schema. |
| `1`, a future number, mismatched positions, or any string, null, boolean, object, array, non-integer, or non-finite marker | Reject before normalization or recovery ownership; never partially replace current data. |

`version: 2` remains the portable envelope version and must be the exact JSON number `2`; coercible strings are not accepted. This separates backup container compatibility from the additive application-data schema. Versions outside this exact registry are default-denied until a reviewed migration explicitly adds them.

This registry governs selected plaintext and encrypted portable backup import. Auto Memory uses the separate, stricter local snapshot registry below; that compatibility path is not reachable from a selected portable file.

## Auto Memory snapshot versions

An Auto Memory snapshot payload must be a plain object with exactly one graph source: current `data` or legacy `db`. Its optional top-level and nested `dataSchemaVersion` markers support only absent/absent, `2` at either or both matching positions, or `3` at either or both matching positions. Mismatched `2`/`3`, schema `1`, future, coercible, malformed, fractional, and non-finite markers are rejected. Schema `3` requires every current collection including `aiProposals`; absent/schema `2` may omit that additive collection and normalize later. If either producer field is present, both exact `app: "RUF Ministry Hub"` and numeric `version: 2` are required. Unknown record and auxiliary properties remain additive.

The raw vault must be a plain exact numeric `version: 1` object with a snapshots array no longer than 50. A raw length of 51 or more is rejected before inspecting or normalizing any payload and before identifier, time, signature, summary, or sort work. This corruption ceiling does not change the established user-configured retained-snapshot range of 3–50 and is not a retention-policy decision.

Canonical local Auto Memory is authoritative at startup: an unsupported local vault remains byte-exact behind the content-free recovery gate and never yields to an older mirror. IndexedDB-only Auto Memory is classified before local publication. Normal restore and failed-write reconciliation use the same absent/schema-2/schema-3 decisions without relabeling historical provenance. Device Vault classifies both the main data and complete Auto Memory vault, stages all normalized values, and rechecks current attempt, exact envelope, and recovery epoch before any live or durable effect.

## Plaintext startup stored-record versions

The canonical local database graph has one optional `dataSchemaVersion` marker. Marker absence, exact JSON integer `2`, and exact current integer `3` are supported. Explicit `1`, a future number, string, null, boolean, object, array, non-integer, or non-finite-equivalent marker is authoritative-invalid and blocks startup before normalization, relabeling, demo seeding, or mirror selection.

An unsupported canonical local record is never replaced from a possibly older IndexedDB plaintext mirror. Before applying that plaintext gate, startup may recover the established settings and encrypted-envelope ownership signals. Explicit local or recovered `localEncryptionEnabled: true` plus a valid envelope retains the existing locked-vault path and removes the obsolete local plaintext copy; an enabled vault with no envelope retains its existing missing-vault failure. A merely present envelope does not infer vault ownership from a complete schema-unsupported plaintext graph. If no explicit or recovered vault owns startup, the unsupported graph remains exact behind the content-free gate before any IndexedDB plaintext-data read or write.

An unsupported IndexedDB-only record, or unsupported mirror behind genuinely corrupt/incomplete local bytes, likewise leaves both stores untouched behind the content-free local recovery gate. Genuine corrupt/incomplete local data may still recover from a supported missing-marker, schema-2, or schema-3 mirror, and its pre-existing orphan-envelope recovery path remains eligible. Auto Memory follows its separate strict registry above; these startup rules do not perform Device Vault decryption.

## Device Vault decrypted stored-record versions

After successful Device Vault decryption, only `payload.data.dataSchemaVersion` is the stored-record marker. This is not the encrypted envelope `version`, the portable backup's top-level `dataSchemaVersion`, or a new persisted policy registry. The envelope format, storage key, Web Crypto algorithm, KDF, passphrase behavior, and IndexedDB schema remain unchanged.

The decrypted `payload.data` must have the complete historical data shape. Marker absence, exact JSON integer `2`, and exact current integer `3` are supported and normalize additively in memory. Explicit `1`, a future number, string, null, boolean, object, array, non-integer, or non-finite marker is default-denied. Missing or structurally incomplete `payload.data` is also denied. The complete decrypted Auto Memory vault is classified through its own registry before either boundary is normalized. All values are staged, then attempt/envelope/epoch ownership is rechecked before live database/auxiliary/cache/passphrase assignment, plaintext cleanup, workflow restore, Auto Memory initialization, success toast/render, timers, revisions, generation, or durable rewrite. A denial keeps the original encrypted envelope and settings unchanged and reports only the fixed content-free storage message; it is not presented as an invalid passphrase.

Each nonempty unlock attempt claims a monotonic in-memory sequence value and captures the exact raw encrypted-envelope bytes it parsed. After decryption and in every catch path, only the latest attempt at the same recovery epoch with byte-identical current envelope may affect state or UI. Superseded success or failure returns silently. A latest attempt whose envelope changed or became unreadable stays locked with a distinct fixed content-free retry. This adds no storage key, persisted owner, polling, cross-tab policy, event listener, or crypto/envelope migration.

## Forward normalization

1. Classify the exact envelope and data-schema markers, then validate identifiers, size, depth, and plain-JSON boundaries before normalization or mutation.
2. Require the six historical ministry collections: people, Quick Grabs, notes, meetings, prayers, and tasks.
3. Permit a historical version-2 backup with no `aiProposals`; normalize that collection to `[]`.
4. Preserve all unknown record properties.
5. Add missing safe runtime defaults, including photo, capture revision/state, arrays, and proposal selection metadata.
6. Preserve existing `preferredContactMethod` exactly as dormant data. Never search, sort, render, recommend from, brief from, or create it.
7. Run relational validation before replacing the live in-memory database.
8. Capture an Auto Memory restore point before an approved restore and retain the existing undo boundary.

## Startup recovery order

```text
read settings and classify localStorage data safely
  -> discover established settings and encrypted-envelope ownership from localStorage or IndexedDB
  -> if explicitly/recovered vault enabled: retain its valid-envelope lock or missing-envelope failure
  -> do not infer vault ownership from a merely present envelope plus complete unsupported plaintext
  -> otherwise: continue the plaintext startup path
  -> if supported: preserve local precedence and normalize in memory
  -> if unsupported: stop before reading or replacing from IndexedDB plaintext data
  -> if absent/corrupt/incomplete: read and classify IndexedDB data before normalization
  -> normalize only a supported missing-marker, schema-2, or schema-3 record
  -> recover drafts/copy/Auto Memory from the same conservative precedence
  -> only if neither data store has recoverable data: create fictional demo data
  -> restore interrupted local workflow without automatic external resend
```

Corrupt localStorage must not cause immediate demo seeding when IndexedDB or encrypted recovery may still exist. Unsupported stored schema is not treated as permission to choose another copy. Failures leave data untouched and surface a safe local error without including marker or record content.

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
- A rollback to code that does not recognize a later stored schema must leave the encrypted bytes untouched for a compatible app; only absent/exact `2`/exact `3` are supported by this v38 candidate.

## Stop conditions

Stop implementation if a real backup demonstrates an incompatible undocumented format, an edit would require deleting a legacy property, encrypted recovery cannot be made conservative, or any migration path partially mutates before validation succeeds.

# Calm OS Architecture — After

## Design goal

Keep the proven framework-free Pages PWA and existing storage keys while separating product decisions into small, testable internal services. The interface renders a calm operating system; the data layer remains conservative and backward-compatible.

## Internal boundaries

```text
Bootstrap and recovery
  -> recover settings/vault/data/drafts from localStorage or IndexedDB
  -> normalize additive schema
  -> seed fictional demo data only when neither store has recoverable data
  -> restore safe interrupted workflow state
  -> render

Contextual date service
  -> parse date-only and timestamp values safely
  -> action wording
  -> history wording
  -> deliberate audit timestamp wording

Shared capture service
  Today / Capture / profile / dictation / shared text / imported text
    -> recoverable raw draft
    -> one quickGrabs record
    -> Save for later OR Process

Shared proposal adapter
  -> minimum approved context
  -> local or explicitly approved backend parser
  -> stable proposal key per capture revision
  -> upsert into aiProposals
  -> Suggested updates

Idempotent executor
  -> preflight selected actions
  -> independent person choice and update actions
  -> per-action execution key
  -> one atomic local save or full in-memory rollback

Recommendation engine
  -> pure ordered candidate list with reason codes
  -> one primary recommendation
  -> at most two After that items

Presentation
  Today | Capture | People | Prayer | More
  -> shared tokens, cards, capture composer, disclosure, empty/error/status patterns
```

## Data contracts

### Existing stores retained

- `db.quickGrabs` is the canonical raw-capture collection.
- `db.aiProposals` is the canonical suggestion and approval collection.
- Notes, meetings, prayer requests, tasks, and people retain their existing collections and identifiers.
- Storage keys, IndexedDB database/store, Device Vault envelope, Auto Memory format, and portable backup envelope version remain unchanged.

### Additive capture metadata

Calm OS may add the following fields to new or normalized Quick Grabs without requiring them on old records:

- `captureSource`: `today`, `capture`, `person`, `dictation`, `sharedText`, or `importedText`.
- `relatedPersonId`: existing link, preselected for profile capture.
- `captureRevision`: integer beginning at 1.
- `submissionKey`: stable client key preventing repeated-tap duplicate capture.
- `processingState`: `unprocessed`, `processing`, `proposalReady`, or `failed`.
- `processingError`: safe local failure code/message, never raw provider output.
- `proposalKey`: deterministic key for source ID, revision, and processor version.
- `lastProcessingAttemptAt`: audit-only timestamp.

Old Quick Grabs normalize to safe defaults; unknown fields remain untouched.

### Proposal and execution identity

- `proposalKeyForCapture = captureId + captureRevision + processorVersion`.
- Processing upserts an existing pending proposal with the same key rather than prepending a duplicate.
- Each selected action has a stable `actionId`.
- Created or updated records store `sourceAIProposalId` and `sourceAIActionId`.
- Re-execution first checks the proposal/action ledger and record links; an already executed action is reused or skipped.
- Record constructors do not mutate related people unless the selected action is an explicit `updatePerson` action.

## Recommendation contract

`buildTodayRecommendations(referenceDate)` is pure with respect to stored records. Each candidate contains:

- source type and ID;
- `reasonCode` and numeric rank;
- safe title and masked detail;
- sensitivity flag;
- primary action;
- Done behavior where meaningful;
- Later behavior and whether a return date is required;
- internal explanation suitable for deterministic tests.

Order is overdue person, person due today, important task due today, important/due capture, prayer follow-up, care-window person, oldest capture, proactive opportunity, then maintenance only when no ministry candidate exists.

## Profile grounding contract

Right Now derives content only from saved records:

- Pray: highest-relevance active/follow-up prayer.
- Next thing: open follow-up task or explicit person follow-up reason.
- Remember: latest grounded meeting memory or note.
- Reminder: saved follow-up/prayer timing.

Missing content produces a calm plain empty state, not invented pastoral guidance or spiritual scoring.

## Presentation and accessibility contract

- Initial mobile viewport maximum: 18 attention points.
- Primary screen maximum: 30; repeating card maximum: 7.
- Five primary navigation destinations.
- One CTA, three primary sections, two accent colors, 44px targets, visible focus, semantic landmarks, live announcements, fixed media geometry, and reduced-motion support.
- Details and history use disclosure; first render is capped at three records per nonempty profile section.

## Deployment boundary

No new framework, dependency, server database, cloud sync, scheduled job, integration, credential, or production setting is introduced. The Quick Grab Function contract remains proposal-only and default-safe. Real external processing still requires its existing explicit gate; human approval remains mandatory before local structured writes.

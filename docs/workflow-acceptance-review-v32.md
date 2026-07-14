# RUF Ministry Hub v32 Workflow Acceptance Review

Date: 2026-07-13

Reviewed commit: `346d3a7e1db0bee036b4cc54c6db4e70d93b0067` (`codex/canonical-integration-v32`)

Review branch: `codex/workflow-evaluation-v32`

## Outcome

The app has a credible local-first **Capture** foundation and a useful **Care** record model. It is not yet a consistently closed **Continue** loop.

- **Capture — strong:** Quick Grab is fast, supports URL intake, and can create linked person, meeting, prayer, note, follow-up, donor-update-idea, and teaching-idea records after review.
- **Care — functional but uneven:** People, meetings, prayer, tasks, privacy masking, local briefings, and draft follow-ups are connected. Prayer-to-task linking is especially coherent.
- **Continue — highest product risk:** marking a person followed up removes the next care date, `Waiting` is treated like actionable work, teaching ideas lack a dependable home, and Weekly Reset produces a plan without a guided completion loop.

The recommended next work is not broader automation. It is a set of small local-first slices that make existing records reliably reappear at the right time and prevent private or ambiguous material from crossing the wrong boundary.

## Review method and constraints

This review used only repository code, maintained synthetic demo fixtures, and local test harnesses. It did not read `.env.local`, secrets, or real ministry data.

Evidence reviewed:

- Canonical deploy source in `ruf-ministry-hub-deploy-working/`.
- `RUF_Ministry_Hub_Project_Source_Audit.md`, `docs/next-level-build-prompt.md`, `docs/next-level-roadmap.md`, `docs/manual-qa.md`, `TESTING.md`, and `DEPLOYMENT_NOTES.md`.
- Existing synthetic people, prayer, meeting, task, donor, and teaching examples in `demoData()`.
- Render and action behavior in the maintained Node regression harnesses.
- Full `npm test` run: passed on 2026-07-13, including app syntax, deploy syntax, all four maintained regression suites, asset audit, secret audit, and function-copy parity.

The in-app browser runtime failed during initialization before the local page could be interacted with. Therefore mobile visual judgments in this document are source- and render-harness-backed, not a substitute for the real iPhone Safari checklist.

## Capability boundaries observed

The implementation correctly avoids claiming that the following are active: cloud sync, accounts, email sending/import, calendar access, contact access, native widgets, or background automation. The Donor Update Builder is copy-only. AI proposals do not save selected record changes until Daniel approves them.

Every slice below must preserve those boundaries. No slice requires a new backend, account system, permission, sync service, email/calendar integration, or background process.

## Synthetic workflow findings

| Scenario | Capture | Care | Continue | Assessment |
| --- | --- | --- | --- | --- |
| After coffee, capture a student conversation with a prayer request and a dated check-in | One Quick Grab can prefill meeting, prayer, and follow-up fields | Saving creates linked meeting, prayer, task, and person updates | Records reappear through the person, Prayer, and due-task views | **Works with review friction** |
| Capture a note that names one of two people with the same first name | Local parsing selects the first substring match | Processing preselects that profile | The user can catch the error, but the default creates attachment risk | **Unsafe ambiguity** |
| Capture a confidential pastoral disclosure without selecting Sensitive | Capture defaults to non-sensitive | The user can manually mark it sensitive while processing | Until then, the raw preview can remain visible and locally eligible for normal handling | **Privacy gap** |
| Add a prayer request, set a follow-up date, and create a follow-up task | Person and Quick Grab entry paths exist | Prayer and task remain linked; person follow-up is updated | Prayer can be answered, noted, archived, and restored | **Strongest closed loop** |
| Put a due task in `Waiting` | `Waiting` can be selected when creating a profile task | The task is grouped and labeled as waiting | Today, Autopilot, Weekly Reset, and cleanup still treat it as due work; the primary action is `Done` | **Workflow contradiction** |
| Mark a recurring-care person followed up | One-tap completion records today's interaction | The next follow-up date is cleared | The person disappears from care prompts unless Daniel manually schedules another task/date | **Broken care rhythm** |
| Capture a teaching illustration and convert it | Teaching is correctly recognized and can become a Teaching Idea note | The note may be intentionally unlinked | After conversion it has no dedicated list and is absent from Weekly Reset inputs; Search is the dependable recovery path | **Weak continuation** |
| Build a donor update from recent local material | Builder has date, tone, and category controls | Private and sensitive records are excluded; student names are anonymized | Potentially identifiable stories can still enter a draft with a warning instead of being excluded pending permission | **Good boundary with one material gap** |
| Start Weekly Reset with loose grabs, due tasks, prayer follow-ups, and people needing care | Local findings are gathered into a draft proposal | Daniel can approve executable proposed actions | The screen does not guide one item at a time or provide a `done enough for now` completion state | **Plan, not reset loop** |
| Turn on the Overwhelmed attention preset | Most Today sections are hidden | Start Here and Autopilot both remain | Both can present the same next item, creating duplicate decisions at the top of the low-choice view | **ADHD friction remains** |

## What should be preserved

These behaviors already meet the product direction and should be regression-protected:

1. Quick Grab remains faster than organizing and can be saved without immediate processing.
2. Structured records are reviewed before attachment to a person.
3. Prayer requests, follow-up tasks, meetings, and people retain source links.
4. Sensitive previews are masked when a record is marked sensitive.
5. Donor drafts are never sent automatically.
6. External Quick Grab AI receives only an explicitly reviewed minimal payload.
7. AI-proposed record changes are selected and confirmed before local save.
8. Backup, Device Vault, Auto Memory Vault, undo, and import/reset safeguards remain intact.
9. Future integrations remain labeled as roadmap work.

## Prioritized product slices

### P0.1 — Make waiting states truthful and actionable

**Problem:** `Waiting` is a display label, not a working state. A waiting task can be selected by Today or Autopilot as the next action and offered `Done`, even when Daniel is waiting on someone else.

**Small slice:** Replace the current task status selector with a local workflow state sheet and teach all due-work selectors which states are actionable.

**Acceptance criteria:**

1. A task has one of: `I Owe Them`, `Waiting on Them`, `Needs Reply`, `Someday`, or `Done / Archived`. Existing `Today / Soon` records migrate to `I Owe Them`; existing `Waiting` records migrate to `Waiting on Them`.
2. Daniel can change task state after creation from every task card and the related person profile without a browser prompt.
3. `Waiting on Them` requires or suggests a review date, not a completion due date.
4. Today, I Have 15 Minutes, and Autopilot never present a not-yet-due `Waiting on Them` item as work Daniel owes.
5. When a waiting review date arrives, the suggested action is `Review waiting item`, with choices to keep waiting, move to `Needs Reply`, move to `I Owe Them`, or finish.
6. Weekly Reset reports waiting items separately from due/overdue actions.
7. Completing or changing state is undoable and persists after reload.

**Focused tests:** migration of both old statuses; selector behavior for each state; waiting item excluded before review date; due waiting item wording; state edit sheet; reload and undo.

### P0.2 — Close the person care-cadence loop

**Problem:** `Mark Followed Up` records today's interaction but clears the next follow-up date. This makes a completed care action remove the person from future care prompts.

**Small slice:** Add an optional cadence to the person and replace immediate completion with a confirmation sheet that proposes the next date.

**Acceptance criteria:**

1. A person can have cadence `None`, `Weekly`, `Every 2 Weeks`, `Monthly`, `Quarterly`, or `Custom days`.
2. New people default to `None`; no cadence is inferred merely from person type.
3. `Mark Followed Up` opens an in-app sheet showing today's interaction date, the current reason, and a proposed next date when cadence exists.
4. Daniel may accept, change, or clear the proposed date before the person record changes.
5. Saving records the interaction and next date atomically. Cancel saves neither change.
6. When cadence is `None`, the sheet offers `No next date` and an optional one-time date without forcing recurring care.
7. People To Care For and Weekly Reset rank overdue cadence first, then due soon, without treating future dates as urgent.
8. Existing people require no migration beyond a default cadence of `None`.

**Focused tests:** each cadence calculation; month-end behavior; cancel safety; custom days; cadence `None`; ranking; undo; reload.

### P0.3 — Catch sensitive capture before it becomes a normal preview

**Problem:** local Quick Grab parsing always creates `sensitiveFlag: false`. A confidential disclosure remains a normal visible capture unless Daniel notices and marks it during processing or uses a later AI review.

**Small slice:** Add deterministic, local sensitivity suggestion at capture time. It proposes privacy; it never silently sends, converts, or mutates other records.

**Acceptance criteria:**

1. A documented local term set detects phrases such as `confidential`, `private`, `do not share`, and defined pastoral-risk terms.
2. When detected, Grab It opens a small confirmation sheet with `Mark Sensitive`, `Do Not Send to AI`, and `Keep Normal` choices.
3. No Quick Grab is saved until Daniel chooses or cancels; cancel preserves the draft.
4. Suggested-sensitive text is never sent to the backend Quick Grab route before Daniel separately reviews the AI context gate.
5. A saved sensitive capture is masked immediately in Today, Quick Grab, Review, Search, Autopilot, and Weekly Reset previews.
6. The processing form carries the chosen privacy tier into every created note, meeting, and prayer record.
7. The app explains that detection is a caution, not a pastoral classification.

**Focused tests:** positive terms; ordinary false-positive examples; cancel preserves draft; immediate masking; AI gate remains blocked; privacy propagation to all selected record types.

### P0.4 — Require an explicit person choice when matching is ambiguous

**Problem:** the local parser selects the first person whose first name appears as a substring. It has no word boundary or confidence model, so common names and short names can attach a capture to the wrong profile by default.

**Small slice:** Make local matching conservative and surface candidates in the existing processing review.

**Acceptance criteria:**

1. Exact full-name match is `High confidence`; exact first-name match is at most `Needs review` when more than one person shares it.
2. Name matching uses word boundaries; a name such as `Ann` does not match `planning`.
3. Ambiguous or low-confidence matches do not preselect a related person.
4. The processing screen shows up to three candidate people with the reason for each match.
5. Saving any person-linked record requires Daniel to choose an existing person or explicitly create a new person.
6. Choosing a candidate never creates a duplicate; choosing new still uses the existing duplicate confirmation.
7. Local matching and backend proposal matching use the same user-facing confidence labels.

**Focused tests:** same first name; short-name substring; exact full name; punctuation; no match; candidate selection; duplicate prevention.

### P0.5 — Exclude permission-required stories from donor drafts by default

**Problem:** the Donor Update Builder has strong copy-only and redaction boundaries, but potentially identifiable student stories can enter the draft with `permission review needed` appended. A warning is weaker than source exclusion.

**Small slice:** Add an explicit local donor-source approval step. Do not add sending, email access, donor sync, or accounts.

**Acceptance criteria:**

1. Every candidate source is classified as `Included`, `Excluded — Private`, `Excluded — Sensitive`, `Excluded — Permission Needed`, or `Excluded — Not Donor Facing` before draft generation.
2. Permission-needed stories are excluded from draft text by default, even after name anonymization.
3. Daniel may explicitly include one permission-needed story only after checking `I have permission to use this story` for that draft session.
4. The approval is session/draft metadata, not a claim of permanent consent, unless a future dedicated consent model is designed.
5. Private, Sensitive, Highly Sensitive, and Do Not Send to AI records cannot be manually included in donor-facing drafts.
6. Prayer material is included only when `Okay to Share`; `Ask Permission`, `Anonymous Only`, and `Private` remain excluded from public copy.
7. The result stays copy-only and prominently says nothing was sent.

**Focused tests:** identifiable story excluded; explicit per-story approval; sensitive record cannot be overridden; each prayer shareability status; names, email, and phone redaction; copy-only wording.

### P1.1 — Make Autopilot one continuous next-step loop

**Problem:** Autopilot can choose a useful next record, but some actions route away and do not return to the next choice. In Overwhelmed mode, Start Here and Autopilot can duplicate the same action.

**Small slice:** Introduce an Autopilot session state that advances after one local action and suppress duplicate next-step panels.

**Acceptance criteria:**

1. ADHD/Overwhelmed Today shows exactly one next-step panel, not both Start Here and Autopilot.
2. The panel has one primary action, one `Not now` action, and `Capture instead`; secondary record-management actions stay behind the opened record.
3. After completing, snoozing, or explicitly skipping the selected item, the app returns to Autopilot and chooses the next item.
4. Opening a profile or processing form does not itself count as completion.
5. `Not now` lasts only for the current session and does not silently change the record.
6. After three actions, or whenever Daniel chooses, the app shows `Done enough for now` with counts and no shame wording.
7. Autopilot still remains fully local and deterministic.

**Focused tests:** no duplicate panel; task completion advances; Quick Grab conversion advances; profile open does not advance; session skip; done-enough state; reload behavior.

### P1.2 — Give teaching ideas a dependable local home

**Problem:** a converted Teaching Idea is stored as a note, often without a person. It has no dedicated list and is not part of Weekly Reset, so Search becomes the main recovery path.

**Small slice:** Add a Teaching Ideas filter/list over existing notes. Do not create a new curriculum system or external document integration.

**Acceptance criteria:**

1. Every note with `noteType: Teaching Idea` appears in a Teaching Ideas view reachable from More and Search suggestions.
2. The list supports `Inbox`, `Developing`, `Used`, and `Archived` states with a simple in-app state sheet.
3. Existing Teaching Idea notes migrate to `Inbox` without changing content.
4. Weekly Reset reports Teaching Inbox count and offers review, but does not mix teaching ideas into people-care urgency.
5. Donor Update Builder considers teaching ideas only when its Teaching category is selected and still applies donor-source approval rules.
6. No person link is required for a teaching idea.

**Focused tests:** migration; unlinked visibility; state changes; weekly count; search; donor category opt-out.

### P1.3 — Turn Weekly Reset from a plan into a bounded review

**Problem:** Weekly Reset gathers the right categories but primarily creates a large proposal/plan. It does not help an overwhelmed user finish a bounded pass.

**Small slice:** Add a local one-card Weekly Reset queue that uses existing records and existing action sheets.

**Acceptance criteria:**

1. Weekly Reset begins with category counts and offers `10 minute`, `30 minute`, or `Choose categories` scope.
2. The active review shows one card at a time from selected categories: stale Quick Grabs, due actions, waiting reviews, people cadence, prayer follow-ups, answered prayer, teaching inbox, duplicates, and backup health.
3. Each card offers only valid record-specific actions plus `Skip for this reset`.
4. AI/local proposal generation may suggest actions, but no record changes until Daniel approves the selected action in the existing confirmation flow.
5. The queue never exposes blocked sensitive text in its preview.
6. Daniel can stop at any time and receive `Done enough for now`, reviewed/skipped/remaining counts, and the next recommended starting point.
7. Skipping does not archive, snooze, or mutate the record.

**Focused tests:** category ordering; bounded scope; approval gate; sensitive masking; skip has no mutation; completion counts; resume/leave behavior.

### P1.4 — Make meeting-to-care suggestions an in-app approval step

**Problem:** Quick Grab can create multiple linked records well, but a meeting created directly from a profile requires separate follow-up actions. `Add Prayer Request from this Meeting` still uses a browser prompt.

**Small slice:** After a profile meeting save, show suggested prayer, follow-up, and person-field changes in one in-app sheet.

**Acceptance criteria:**

1. Saving a meeting can open a review sheet with prefilled prayer request, follow-up task/date, and person last-interaction/next-date suggestions.
2. Every proposed record/action is independently selectable.
3. Nothing except the meeting itself is saved until Daniel confirms selected actions.
4. Cancel keeps the meeting and creates no prayer, task, or person update beyond the explicitly disclosed meeting behavior.
5. Created records retain bidirectional source IDs where the current schema supports them.
6. `Add Prayer Request from this Meeting` uses the same sheet and no browser prompt.

**Focused tests:** meeting-only save; select prayer only; select task only; select both; cancel; sensitivity/shareability propagation; source links.

### P1.5 — Finish deterministic Quick Grab language coverage

**Problem:** local parsing supports only a small date subset (`next Friday`, `next Tuesday`, `tomorrow`, `this week`, `next week`) and collapses multiple selected chips to one category.

**Small slice:** Extend only deterministic local parsing and keep all outputs as editable suggestions.

**Acceptance criteria:**

1. Recognize next Monday through Sunday, `in N days`, `in N weeks`, `this weekend`, and explicit ISO-like dates when unambiguous.
2. Phrases such as `after meeting` remain unscheduled and visibly ask for a date rather than inventing one.
3. Detect `waiting on them`, `I owe them`, `needs reply`, and `resolved` as task-state suggestions using the P0.1 model.
4. Preserve multiple selected Quick Grab categories instead of silently retaining only the first; one primary category may be suggested for display.
5. Parsed person, date, state, prayer, meeting, and sensitivity outputs are visible and editable before save.
6. No parsing result directly writes a person, prayer, meeting, or task record.

**Focused tests:** all weekdays; relative dates around month/year boundaries; ambiguous phrase; each workflow state; multiple chips; no auto-save.

### P2.1 — Add a ministry-flow health summary

**Problem:** the app has many individual safeguards but no compact way to tell whether Capture → Care → Continue is healthy.

**Small slice:** Add a local summary to Weekly Reset, not a dashboard on Today.

**Acceptance criteria:**

1. Show counts for unprocessed captures, ambiguous person links, due actions, waiting reviews, people without a next cadence date, prayer follow-ups, teaching inbox, and permission-blocked donor sources.
2. Counts link to the corresponding bounded review.
3. Counts contain no sensitive preview text.
4. The summary uses neutral language and never scores Daniel's ministry performance.

## Release-level acceptance criteria

A slice is complete only when all applicable criteria below pass:

1. The full current `npm test` suite remains green.
2. New deterministic behavior has focused synthetic regression tests, including cancel/no-mutation paths.
3. Any AI proposal remains review-only until Daniel selects and confirms local record changes.
4. No secret or real ministry fixture is added to source, tests, screenshots, or docs.
5. No UI copy implies cloud sync, accounts, email/calendar/contact access, native widgets, or background execution.
6. Donor output remains draft/copy-only, with permission-required and private material excluded by default.
7. Every new sheet has a calm cancel path and preserves unsaved text where loss is plausible.
8. Mobile layout has no horizontal overflow at 390 px.
9. iPhone/Safari behavior changes are added to `docs/manual-qa.md`.
10. Deployable changes bump both `APP_VERSION` and the service-worker `CACHE_NAME`.

## Recommended implementation order

1. **P0.1 Waiting states** — removes a direct contradiction in Today and Autopilot.
2. **P0.2 Care cadence** — turns completed care into future continuity.
3. **P0.3 Sensitive capture suggestion** — closes the earliest privacy gap.
4. **P0.4 Conservative person matching** — prevents incorrect pastoral attachment.
5. **P0.5 Donor source approval** — makes the donor boundary exclusion-based.
6. **P1.1 Autopilot loop** — reduces ADHD friction after the underlying states are trustworthy.
7. **P1.2 Teaching home** — prevents captured ideas from disappearing.
8. **P1.3 Weekly bounded review** — composes the stabilized states into a finishable routine.
9. **P1.4 Meeting-to-care sheet** — reduces repeated entry while preserving approval.
10. **P1.5 Parser coverage** — improves capture suggestions after the destination models are stable.

## Product decision summary

The next release should optimize for **trustworthy reappearance**, not more inputs or more agents:

- A captured item should land in the correct domain.
- A care action should either intentionally end or intentionally return later.
- Waiting should not look like work Daniel owes.
- Sensitive and permission-required material should be excluded before it is summarized or drafted.
- ADHD modes should show one meaningful choice and a humane stopping point.

That sequence completes Capture → Care → Continue using the local capabilities already present, without inventing external infrastructure.

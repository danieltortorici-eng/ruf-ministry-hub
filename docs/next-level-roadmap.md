# RUF Ministry Hub Next-Level Roadmap

Date: 2026-07-02

This roadmap converts the 42 improvement ideas into safe build phases. It separates local-first work that can be built in the current PWA from future integrations that need services, permissions, or architecture decisions.

## Phase 1: Local-First Automation Foundation

Status: started in `2026.07.01-next-level-foundation`, continued in `2026.07.01-profile-action-sheets`, continued in `2026.07.01-edit-create-sheets`, continued in `2026.07.01-prayer-action-sheets`, continued in `2026.07.01-data-safety-sheets`, continued in `2026.07.01-security-backup-health`, and continued in `2026.07.02-auto-memory-vault`.

- Autopilot screen and Today card that choose one next local action.
- Attention presets for Minimum Noise, People Only, Prayer Only, Admin Catch-Up, Overwhelmed, and Weekly Planning.
- Guardrails in the app so future cloud/native work is not presented as already implemented.
- Regression tests for Autopilot and attention presets.

## Phase 2: Remove Friction From Input

- Replace browser prompts and confirms with in-app sheets.
- Status: profile quick actions now use in-app sheets for notes, meeting notes, prayer requests, and follow-up tasks.
- Status: profile field edits, linked record edits, and Create New Person now use in-app sheets.
- Status: prayer answered notes, prayer follow-up dates, and prayer-created tasks now use in-app sheets.
- Status: encrypted backup export, import/restore confirmation, reset demo data, and duplicate-person merge now use in-app sheets.
- Status: App Lock PIN setup/removal and Device Vault enable/disable now use in-app sheets.
- Status: Backup Health now summarizes backup state and chooses a backup action.
- Status: Auto Memory Vault now creates local restore points after saved app changes, provides in-app restore/delete/clear controls, respects a retention limit, and migrates snapshots into Device Vault encryption.
- Add one-field quick forms for remaining custom wording, meeting-to-prayer, and text-draft fallback flows.
- Keep autosave active inside every sheet where text can be lost.
- Add a calm cancel path on every sheet.

## Phase 3: Smarter Quick Grab

- Parse more date language: next Monday through Sunday, in N days, in N weeks, this weekend, before Sunday, after meeting.
- Detect waiting states: waiting on them, I owe them, needs reply, resolved.
- Detect sensitivity words and suggest sensitive/private status.
- Suggest person matches with confidence.
- Convert one Quick Grab into multiple linked records when appropriate.

## Phase 4: Care Cadence

- Add follow-up rhythm per person.
- Add default cadences by person type.
- Automatically suggest next follow-up after marking someone followed up.
- Add "who should I reach out to?" ranking based on cadence, last contact, prayer status, pinned status, and due tasks.

## Phase 5: Prayer And Meeting Intelligence

- After a meeting note, ask whether to create a prayer request, task, person update, or waiting item.
- Add prayer story timeline.
- Add automatic prayer check-in prompts.
- Add answered-prayer digest.

## Phase 6: Weekly Digest And Cleanup

- Generate a weekly digest from local data.
- Add one-card cleanup for stale Quick Grabs, answered prayer, duplicate people, and old tasks.
- Add "done enough for now" end state.

## Phase 7: Importers

- Add pasted contacts importer.
- Add CSV/vCard contact import preview.
- Add pasted calendar text parser.
- Add ministry notes importer.
- Add preview-before-import with counts, warnings, and duplicate detection.

## Phase 8: Optional Integrations

These are not implemented in the current app and should not be claimed until built and tested.

- Encrypted cloud sync.
- Calendar integration.
- Contact permissions.
- Email/Gmail import.
- Native iOS widgets.
- Background processing.
- Additional external AI parsing beyond the implemented Quick Grab proposal route.
- Donor database sync.

## Phase 9: Architecture Hardening

- Split the single-file PWA into modules when the app becomes too large to maintain safely.
- Add a versioned schema and migration tests.
- Add browser screenshot tests for core mobile flows.
- Add real iPhone Safari release checks before deploy.

## Roadblock Audit

- The only current backend surface is two stateless Cloudflare Pages Functions for AI health and Quick Grab proposals. No server database, sync service, scheduler, or general-purpose backend exists, so sync and server automation still require product and privacy decisions first.
- Auto Memory Vault is local restore history, not cloud sync. Device loss, browser data deletion, or moving to another device still require exported backups or a future backend.
- No native shell exists today, so widgets, background tasks, and OS-level contact/calendar access require a native wrapper or external platform.
- The current tests are local render/action tests, not full iPhone Safari automation.
- The current app is single-file, which is good for deployment but harder for large feature growth.
- Sensitive ministry data means every integration must be opt-in, explicit, and reversible.

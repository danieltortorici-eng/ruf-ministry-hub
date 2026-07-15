# Manual QA: iPhone Safari

These checks require a real iPhone running Safari against the deployed PWA URL. The local regression harness is useful, but it is not a substitute for this checklist.

## Before Testing

- Export a JSON backup from Settings / Data.
- Confirm the deployed URL is HTTPS.
- Open the app once in Safari while online.
- If testing Home Screen behavior, add the app to the Home Screen from Safari.

## Smoke Test

- Open the app in iPhone Safari.
- Confirm Today loads without a blank screen.
- Tap each visible bottom navigation item: Today, Grab, Find, People, Pray, More.
- From More, open I Have 15 Minutes, Weekly Reset, iPhone Readiness, and App Manual.
- Confirm the bottom navigation and floating Quick Grab button do not cover important content.
- Rotate is not required; the app is portrait-first.

## ADHD Mode

- Open More, then Settings / Data.
- Turn on ADHD Mode.
- Confirm Today uses the shorter one-thing-at-a-time layout.
- Confirm Quick Review uses a one-card review size.
- Turn off Show Quick Capture On Today and confirm the Quick Grab capture panel disappears from Today.
- Turn off Show Loose Things On Today, Show People To Care For On Today, and Show Follow-Ups On Today one at a time.
- Confirm each section disappears without breaking Today.
- Turn the hidden sections back on before continuing broader QA.

## Autopilot And Attention Presets

- Open More, then Settings / Data.
- Tap Autopilot from Workflow Shortcuts.
- Confirm Autopilot shows exactly one suggested next action and explains how it chooses.
- Return to Settings / Data.
- Choose the Overwhelmed attention preset and tap Apply Preset.
- Confirm Today keeps the Autopilot card and Quick Capture, while loose reminders, people, and follow-up sections are hidden.
- Choose Admin Catch-Up and tap Apply Preset.
- Confirm Today brings backup, App Coach, Quick Capture, loose reminders, people, and follow-ups back into view.
- Confirm no cloud sync, calendar, contacts, native widget, or external AI feature beyond the implemented Quick Grab proposal route appears as active unless it has been separately built.

## Unified Capture And Shortcut Flow

When production backend Quick Grab is enabled, sign in through the approved Cloudflare Access hostname before this flow. Confirm a signed-out request cannot create a real proposal and that the app falls back safely without changing records.

- In Safari, open the deployed app with `?quickgrab=Test%20capture`.
- Confirm Capture opens and the textarea contains `Test capture`.
- Repeat with `?quickgrab=Prayer%20capture&quickgrabCategory=prayer&quickgrabUrgency=soon`.
- Confirm the text imports but no category, urgency, or record-type controls appear.
- Refresh the page.
- Confirm the imported text does not duplicate.
- Share selected text from iOS Notes through the Shortcut.
- Confirm the shared text lands in the same Capture composer.
- Tap Save for later and confirm one unprocessed capture is saved without creating a note, meeting, prayer, follow-up, or person update.
- Add another fictional capture and tap Process. Confirm the raw text is saved before the privacy/context review opens.
- Continue with local mock processing and confirm one Suggested updates review appears. Retry processing the same capture and confirm no duplicate proposal appears.

## Data Safety

- Create a test person.
- Add a Quick Grab.
- Add a prayer request.
- Confirm Settings / Data shows a Backup Health card.
- Confirm Settings / Data shows Auto Memory Vault.
- Confirm Auto Memory Vault is on by default.
- Tap Save Now and confirm a restore point is added.
- Tap Restore Points and confirm the in-app sheet lists local restore points.
- Try Restore without checking the confirmation box and confirm current data is unchanged.
- Confirm Delete and Clear All require in-app confirmation before removing restore points.
- Turn Auto Memory Vault off and confirm the card shows a paused state.
- Turn Auto Memory Vault back on before continuing.
- Export JSON from Settings / Data.
- Confirm Backup Health changes after export.
- Tap Export encrypted backup and confirm it opens an in-app sheet instead of browser prompts.
- Cancel the encrypted backup sheet and confirm no file downloads.
- Import an intentionally invalid JSON file and confirm current data is unchanged.
- Tap Import backup and confirm restore uses an in-app sheet with file, optional passphrase, and replacement confirmation.
- Import a valid backup only after confirming the in-app replacement warning.
- Tap Reset demo data and confirm it opens an in-app sheet before replacing local data.
- Confirm archived/restored prayer requests behave as expected.

## Security

- Open Settings / Data.
- Tap Set PIN and confirm it opens an in-app sheet.
- Try a short PIN and confirm it is rejected without closing the sheet.
- Save a valid matching PIN and confirm App Lock is enabled.
- Tap Turn Off App Lock and confirm it opens an in-app sheet.
- Try the wrong current PIN and confirm App Lock stays on.
- Enter the correct PIN and confirm App Lock turns off.
- Turn on Device Vault and confirm it opens an in-app passphrase sheet.
- Try a short passphrase and confirm it is rejected.
- Save a valid matching passphrase and optional hint.
- Confirm the app still shows Auto Memory as available after Device Vault is enabled.
- If inspecting browser storage, confirm Auto Memory is not kept as a separate plain local storage entry while Device Vault is enabled.
- If testing vault disable, turn Device Vault off and confirm the in-app sheet asks for explicit confirmation.

## People And Profiles

- Create or open a person.
- Tap Create New Person and confirm it opens an in-app sheet.
- Try creating a likely duplicate and confirm the sheet asks you to confirm before saving.
- Create a new non-duplicate person and confirm the new profile opens.
- Edit phone, email, involvement, and follow-up reason.
- Confirm each edit opens an in-app sheet instead of a browser popup.
- Add a note, meeting note, prayer request, and follow-up task from the profile.
- Confirm each quick action opens an in-app sheet instead of a browser popup.
- Confirm closing the sheet does not save a blank record.
- Save each sheet and confirm the item appears on the profile.
- Confirm each item appears on the profile and in Search.
- Pin and unpin the person.
- Mark the person followed up and confirm the next follow-up clears.
- Add and remove a profile photo if photo testing is in scope.
- Open Duplicate People and confirm Merge opens an in-app sheet before removing a duplicate.

## Prayer

- Open Pray from the bottom navigation.
- Check Active, Follow-Up Needed, Prayer Walk, Answered Prayer, Archived Prayer Requests, Sensitive Prayer Requests, Recently Added, and By Person.
- Mark a request answered.
- Add an answered note and confirm it opens an in-app sheet instead of a browser popup.
- Set a prayer follow-up date and confirm it opens an in-app sheet, rejects an invalid typed date, and saves a valid date.
- Create a prayer follow-up task and confirm it opens an in-app sheet, saves the task, and links it back to the prayer request.
- Archive and restore a prayer request.
- Confirm sensitive prayer text is masked when Mask Sensitive Previews is on.

## Today

- Confirm Today loads with empty or low data.
- Confirm Today loads with real or sample data.
- Confirm Start Here appears.
- Mark a person followed up from Today.
- Mark a follow-up task done from Today.
- Confirm those actions persist after refresh.

## Suggested Updates With Synthetic Data

- Use only fictional test names and details for this check.
- Create or open a pending AI proposal with at least three supported local actions.
- Uncheck one action, refresh the app, and confirm the same action remains skipped while the other actions remain selected.
- Tap Edit action, change the draft wording and date, save, and confirm the proposal is labeled Edited.
- Confirm editing the card does not create a person, note, meeting, prayer request, or task.
- Tap Review selected, cancel from Review before saving, and confirm no records were created and the selected/skipped choices remain.
- Tap Approve all, return to Suggested updates without saving if possible, and confirm all supported actions remain selected.
- Change the selected person in Review before saving and confirm approved records link only to that person.
- Mark the source sensitive and confirm its preview becomes masked.
- Complete a partial approval and confirm the proposal leaves Pending, appears under Approved as Partially Approved, and shows the saved selected/skipped choices.
- Confirm Save approved updates still requires the explicit review checkbox before local records are created.

## PWA And Offline Cache

- Open More, then iPhone Readiness.
- Confirm the app does not crash when service worker/offline checks run.
- When testing a newer deployed version over an older open version, confirm the older app stays active and an **App update ready** notice appears on Today.
- Continue typing in an open form before choosing the update and confirm the app does not reload or replace the active worker on its own.
- Tap **Update now** from the notice and confirm the app reloads once into the newer version.
- In Settings, confirm a current version-2 backup restores successfully and an oversized, wrong-app, wrong-version, partial, or malformed backup is rejected without replacing existing records.
- Add the app to Home Screen.
- Launch from the Home Screen.
- Turn on Airplane Mode after the app has loaded once online.
- Reopen the app and confirm the cached shell loads.

## Privacy

- Turn on Mask Sensitive Previews.
- Confirm sensitive notes and prayer details are obscured in public-facing lists.
- Confirm names and navigation remain usable.
- Turn off Mask Sensitive Previews and confirm details return.
- If using Device Vault, verify the app asks for the vault passphrase after a fresh launch.

## Pass Criteria

- No blank screens.
- No duplicated Quick Grab imports after refresh.
- No data loss after reload.
- Export/import safeguards behave as expected.
- Main actions remain usable with one thumb.
- Any failure is recorded before the next feature build.

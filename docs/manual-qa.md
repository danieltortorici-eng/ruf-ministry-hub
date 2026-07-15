# Manual QA: iPhone Safari

These checks require a real iPhone running Safari against the deployed PWA URL. The local regression harness is useful, but it is not a substitute for this checklist.

## Independent RC audit note (2026-07-15)

The second release-candidate audit verified the 390px and 430px layout contracts, large-text navigation/Right Now wrapping, offline cached-shell behavior, and no-overflow preview checks with local/DevTools evidence. Real iPhone Safari, VoiceOver, Dynamic Type, Home Screen suspension, and Safari storage-quota behavior remain `NOT VERIFIED` until this checklist is run on a physical device. Use fictional records only, and confirm linked Sensitive/Do Not Send captures remain masked and are blocked before any backend Quick Grab request.

## Before Testing

- Open More, then Settings and data, and export a JSON backup.
- Confirm the deployed URL is HTTPS.
- Open the app once in Safari while online.
- If testing Home Screen behavior, add the app to the Home Screen from Safari.

## Smoke Test

- Open the app in iPhone Safari.
- Confirm Today loads without a blank screen.
- Confirm the primary navigation is exactly Today, Capture, People, Prayer, and More.
- From More, open I Have 15 Minutes, Weekly Reset, iPhone Readiness, and App Manual.
- Confirm the five-item bottom navigation respects the iPhone safe area and does not cover important content.
- Confirm Search is available from More but does not occupy a sixth primary-navigation slot.
- Rotate is not required; the app is portrait-first.

## Fixed Calm OS Attention Contract

- Open More, then Settings and data.
- Confirm Today still contains exactly Next thing to do, Quick Capture, and After that.
- Confirm there is no Calm/ADHD mode toggle or attention preset required before the calm hierarchy works.
- Open Review one at a time from More and confirm each saved capture has one Process route with no record-type preset cluster.
- Confirm older Today visibility settings cannot hide Quick Capture or reintroduce dashboard sections.

## Priority Guide

- Open More, expand Ministry rhythms, then open Priority guide.
- Confirm the guide shows exactly one suggested next action and explains the local priority order.
- Confirm Today keeps the same three-section hierarchy and does not use Autopilot as normal interface language.
- Confirm administrative content remains outside Today.
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
- Save an unprocessed capture.
- Add a prayer request.
- Confirm Settings and data shows a Backup Health card.
- Confirm Settings and data shows Auto Memory Vault.
- Confirm Auto Memory Vault is on by default.
- Tap Save Now and confirm a restore point is added.
- Tap Restore Points and confirm the in-app sheet lists local restore points.
- Try Restore without checking the confirmation box and confirm current data is unchanged.
- Confirm Delete and Clear All require in-app confirmation before removing restore points.
- Turn Auto Memory Vault off and confirm the card shows a paused state.
- Turn Auto Memory Vault back on before continuing.
- Export JSON from Settings and data.
- Confirm Backup Health changes after export.
- Tap Export encrypted backup and confirm it opens an in-app sheet instead of browser prompts.
- Cancel the encrypted backup sheet and confirm no file downloads.
- Import an intentionally invalid JSON file and confirm current data is unchanged.
- Tap Import backup and confirm restore uses an in-app sheet with file, optional passphrase, and replacement confirmation.
- Import a valid backup only after confirming the in-app replacement warning.
- Tap Reset demo data and confirm it opens an in-app sheet before replacing local data.
- Confirm archived/restored prayer requests behave as expected.

## Security

- Open More, then Settings and data.
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

- On People, confirm the page asks who you are looking for or caring for and keeps search immediately available.
- Confirm each person appears as one compact card with a small circular photo or initials, name, no more than a two-part identity line, care level, contextual next follow-up, and a short reason only when one is saved.
- Confirm the whole card opens the profile with one tap; there is no separate Open Profile button or equal-weight Pin/Followed Up cluster.
- Confirm cards never show preferred contact, Created/Updated timestamps, generic avatar icons, or a visible Pinned badge.
- Type several characters into People search and confirm the iPhone keyboard, focus, and caret remain in the field after each filtered update.
- With a synthetic person marked Sensitive, confirm a saved follow-up reason is masked; clear or corrupt the follow-up date and confirm a stale reason is not shown.
- Test a long fictional name, no photo, and a synthetic large local image. Confirm the 48px image area does not resize or shift while the card loads and the name wraps without overlap.
- Create or open a person.
- Tap Add person and confirm it opens an in-app sheet.
- Try creating a likely duplicate and confirm the sheet asks you to confirm before saving.
- Create a new non-duplicate person and confirm the new profile opens.
- Confirm the top answers who this person is, why they need care, the contextual last/next timing, reason, and phone only when populated.
- Confirm Right Now contains only Pray, Next thing, Remember, and Reminder; each statement must be traceable to a saved synthetic record, and sensitive text stays masked.
- Confirm the shared capture says Add something about the person's first name, locks that person, and exposes Process plus quiet Dictate/Save for later choices.
- Type an unfinished profile capture, choose Change person, and confirm the draft follows the new locked person without navigating away, creating records, or updating either profile.
- Refresh with an unfinished profile capture and confirm the correct person-linked draft returns.
- Tap Brief Me with AI unavailable. Confirm recent interaction, active prayer, current follow-up, useful questions, sensitivity warnings, and a plain low-information state are grounded locally; no Suggested update or permanent record is created.
- Tap Follow Up and confirm a useful Short draft appears immediately, with quiet Casual/Pastoral variants. Copy a draft and confirm nothing is sent or completed.
- Use the explicit quiet Mark followed up action and confirm only then does the next follow-up clear.
- Open Profile Details. Edit phone, email, involvement, and follow-up reason; add/remove a profile photo; and confirm preferred contact and normal administrative timestamps remain absent.
- Open More actions inside Profile Details and confirm Pin/Unpin and Mark followed up are secondary administration rather than top-level actions.
- Confirm Notes, Meetings, Prayer Requests, Follow-Ups, and Timeline remain separate, empty sections are hidden, only three recent records appear initially, and View all restores every full record without Created/Updated clutter.
- Create hundreds of synthetic history items and confirm the profile top stays the same length and initial history rendering remains bounded.
- Open Duplicate People and confirm Merge opens an in-app sheet before removing a duplicate.

## Prayer

- Open Prayer from the bottom navigation.
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
- Confirm the normal page contains only **Next thing to do**, **Quick Capture**, and **After that** as its three primary sections.
- Confirm **After that** displays no more than two compact items.
- Confirm exactly one action is visually dominant and the recommended item offers only **Do this**, **Done**, and **Later**.
- With synthetic records, confirm overdue person follow-up wins over due-today follow-up, important task, important capture, prayer follow-up, care-window, oldest capture, and proactive suggestions in that order.
- Confirm sensitive capture, prayer, and task details are masked in recommendation previews.
- Tap **Done** on a task and confirm it remains complete after refresh.
- Tap **Later** on a real task or person follow-up and confirm a future return date is required before it disappears.
- Tap **Later** on a proactive suggestion and confirm it stays dismissed for the rest of the local day.
- If both an app update and backup reminder are eligible, confirm Today renders only the higher-priority compact critical alert.
- Confirm People Shortcuts, App Coach, full capture/care/task lists, backup tools, counts, and administration do not appear as normal Today sections.

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

## Recovery And Accessibility

- With an unfinished draft in Today, Capture, and one profile, refresh each screen and confirm the correct text and locked person return.
- Begin proposal review, change the selected person and action checkboxes, refresh, and confirm the draft decision returns while the final **I reviewed…** approval checkbox is unchecked.
- Cancel proposal review and refresh; confirm the canceled workflow does not reopen.
- With synthetic browser storage only, remove the localStorage data mirror while retaining the IndexedDB mirror; reopen and confirm the real synthetic records load instead of demo data.
- With a deliberately corrupt synthetic local value and no valid recovery mirror, confirm **Local data check paused** appears and the corrupt bytes are not replaced. Never perform this step with real ministry data.
- With Device Vault enabled, reopen and confirm no ministry content appears before the vault passphrase succeeds. A wrong passphrase must keep the vault locked and focus the passphrase field.
- Use a hardware keyboard to activate **Skip to main content**, then navigate all five primary destinations. Confirm the new page heading receives focus only after navigation, not while typing in Search.
- Open every in-app sheet with the keyboard. Confirm the sheet name is announced, Tab/Shift+Tab stay inside, Escape closes safely, and focus returns to the invoking control.
- Trigger validation in capture, security, import, prayer, and final approval fields. Confirm the invalid control receives focus and the message is announced.
- With VoiceOver, confirm filter selection state, grouped checkboxes, People card names, photo/initial behavior, disabled actions, and critical notices do not rely on color.
- Test 390px and 430px portrait widths plus landscape. Confirm no horizontal page scrolling, safe-area collision, clipped bottom navigation, or unreachable sheet action.
- Test the largest practical Dynamic Type size and reduced motion. Confirm navigation labels wrap, content remains reachable, and nonessential transitions stop.

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

## Adversarial Calm OS Checks

- With synthetic data only, load more than 40 People and confirm the first view is bounded, Show more adds the next batch, and every person remains reachable.
- Search for a phrase matching more than 30 synthetic people. Confirm Search reveals results in batches without moving the caret or hiding later matches.
- Add more than 50 synthetic notes to one profile. Confirm the normal preview remains three items and View all reveals 50 at a time without changing the quiet profile top.
- Create two synthetic people sharing a first name, then process a capture using only that first name. Confirm neither person is preselected and final save requires an explicit person choice.
- Mark a synthetic capture sensitive, approve a follow-up task and person-detail update, then inspect Today and Search with preview masking on. Confirm the saved text exists locally but is not exposed in either preview.
- Import a synthetic version-2 backup containing a person ID with no name. Confirm the person appears as **Unnamed person**, Capture still works, and re-export succeeds. Never use deliberately malformed fixtures with real ministry data.
- Start typing a synthetic capture while an app update is waiting. Tap Update now and confirm activation occurs only after the draft is recoverable; reopen offline and confirm the cached app shell loads.
- Exercise a real browser storage-quota boundary only on a disposable synthetic origin. Confirm a failed restore keeps the previous data and a failed Device Vault disable leaves encryption enabled. Node regression evidence does not prove Safari quota behavior.

## Pass Criteria

- No blank screens.
- No duplicated Quick Grab imports after refresh.
- No data loss after reload.
- Export/import safeguards behave as expected.
- Main actions remain usable with one thumb.
- Any failure is recorded before the next feature build.

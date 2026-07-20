# Manual QA: iPhone Safari

These checks require a real iPhone running Safari against the deployed PWA URL. The local regression harness is useful, but it is not a substitute for this checklist.

## Independent RC audit note (2026-07-15)

The second release-candidate audit verified the 390px and 430px layout contracts, large-text navigation/Right Now wrapping, offline cached-shell behavior, and no-overflow preview checks with local/DevTools evidence. Real iPhone Safari, VoiceOver, Dynamic Type, Home Screen suspension, and Safari storage-quota behavior remain `NOT VERIFIED` until this checklist is run on a physical device. Use fictional records only, and confirm linked Sensitive/Do Not Send captures remain masked and are blocked before any backend Quick Grab request.

## Physical-device evidence (2026-07-16 17:23 CDT)

- Device/mode: iPhone 17 Pro Max, iOS 26.5.1; Safari and saved Home Screen app. No unnecessary device identifier is retained in this record.
- Candidate shown: Calm v7 stable preview alias for commit `0ecfd1a5e186f79881ff13306c06de73a8a5864b`; visible content is fictional-only.
- `MANUAL-DEVICE / OBSERVED`: Safari renders Today, the next-action card, Quick Capture, saved-thought list, and all five bottom destinations without a blank screen or visible horizontal overflow. Home Screen installation and launch are also observed.
- `P2 / OBSERVED`: when **Skip to main content** is focused in Home Screen mode, the fixed link overlaps the iOS status area. This is not accepted as a complete safe-area or accessibility pass. `CALM-A11Y-07` changes installed-app status-bar behavior from overlay to reserved status area and requires a same-device recheck.
- `NOT VERIFIED`: complete five-destination interaction, capture cancel/approved save/reload, VoiceOver semantics, largest Dynamic Type, landscape, Reduced Motion, update-ready flow, Airplane Mode reopen, backup/vault recovery, Undo, and rollback. The visible focused link does not by itself prove VoiceOver was enabled or passed.

The next preview candidate is app/package `2026.07.16-calm-os-core-v8` with cache `ruf-ministry-hub-v57-calm-os-core-v8`. Its source, preview, and physical evidence remain invalid until the bounded fix is frozen, tested, pushed through the sole release lane, deployed to the preview-only QA project, and rechecked.

## `CALM-AUTO-MEMORY-38` local v38 strict snapshot recheck

- Local candidate identity: app/package `2026.07.20-calm-os-core-v38`, cache `ruf-ministry-hub-v87-calm-os-core-v38`. It is local-only and is not committed, previewed, provider-verified, production-verified, rollback-verified, existing-real-vault verified, or physical-device verified. Use only a disposable origin, fictional records, and fictional neutral PINs/passphrases.
- With fictional local restore points, verify both current `data` and legacy `db` sources across marker absence, exact numeric `2`, and exact numeric `3` at the top only, nested only, or both matching positions. Confirm schema `3` requires `aiProposals`, while absent/schema `2` may omit it and restores additively without being relabeled before restore. Unknown record and auxiliary properties must survive.
- Try both/neither graph source; top `2`/nested `3` and top `3`/nested `2`; `1`, `999`, numeric strings, null, boolean, object, array, fraction, `NaN`, and infinities at either marker; partial/wrong producer metadata; malformed auxiliary objects; and missing current collections under schema `3`. Each must show only the content-free recovery/storage retry, preserve exact bytes and live records, and create no recovery transaction, Undo entry, normalization result, mirror write, or success.
- Seed exactly 50 fictional raw snapshots and confirm they remain eligible for the configured 3–50 retained limit. Seed 51 and 10,000 and confirm the complete vault is rejected rather than truncated before per-snapshot normalization, identifier/time/signature/summary work, or sorting. This ceiling is a corruption guard and does not approve a retention/deletion policy.
- Repeat canonical-local and IndexedDB-only startup, normal restore, failed-mirror reconciliation/retry, and Device Vault unlock. Unsupported canonical local bytes must never yield to an older mirror. Unsupported encrypted Auto Memory must remain locked with exact envelope/settings/plaintext absence and live state, then allow one later valid retry. Recheck App Lock focus and toast semantics from v37. Automated/simulated results do not verify existing real vaults, physical iPhone/Safari/Home Screen/VoiceOver, preview headers, update/offline recovery, provider state, production, or rollback.

## `CALM-TOAST-A11Y-37` local v37 toast semantics and dismissal recheck

- Local candidate identity: app/package `2026.07.20-calm-os-core-v37`, cache `ruf-ministry-hub-v86-calm-os-core-v37`. It is local-only and is not committed, previewed, provider-verified, production-verified, rollback-verified, existing-real-vault verified, or physical-device verified. Use only a disposable origin, fictional records, and fictional neutral PINs/passphrases.
- With VoiceOver on, trigger a correct fictional direct PIN and a supported fictional Device Vault unlock. Confirm each existing success message is announced politely without interrupting current speech, stays visible for about 2.8 seconds, then disappears and is not repeated from hidden text while swiping or using the rotor. Trigger an empty/wrong PIN, unsupported vault payload, and one retained **Could not…** error; confirm each is announced assertively, remains visible for about 5 seconds, then clears.
- Rapidly trigger success then error, and separately error then success. Confirm the newest message keeps its correct polite/assertive behavior and full deadline; no older deadline may hide, clear, reclassify, or shorten it. After the newest deadline, confirm the toast is absent visually and its old text is not encountered by VoiceOver.
- Repeat in iPhone Safari and the installed Home Screen app with VoiceOver on, then recheck direct PIN and Device Vault focus behavior from `CALM-STORED-SCHEMA-35B`. Automated and simulated-browser evidence does not prove physical VoiceOver announcement order, update/offline recovery, preview headers, provider state, production, or rollback; all remain `NOT VERIFIED` until observed and recorded.

## `CALM-STORED-SCHEMA-35B` local v36 unlock-focus recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v36`, cache `ruf-ministry-hub-v85-calm-os-core-v36`. It is local-only and is not committed, previewed, provider-verified, production-verified, rollback-verified, existing-real-vault verified, or physical-device verified. Use only a disposable origin, fictional records, and fictional neutral PINs/passphrases.
- With App Lock enabled, enter an empty PIN and a current wrong PIN. Confirm the live PIN field keeps focus, has `aria-invalid="true"`, and announces the existing field error. Enter the correct fictional PIN and confirm VoiceOver announces the current page heading once, focus moves to that rendered `#main-content h1` without a visible scroll jump, and normal app content remains usable.
- With Device Vault enabled and effective App Lock off, unlock supported fictional absent/schema-2/schema-3 payloads. Confirm VoiceOver announces the rendered current page heading once and focus moves there without a visible scroll jump. Repeat with App Lock enabled and a usable PIN; confirm the vault unlock keeps the PIN screen active and focus lands on the live PIN field instead of a background heading. An enabled App Lock setting without a usable PIN follows the effective-off heading behavior.
- Repeat empty/wrong passphrase, rejected-schema, changed-envelope, and overlapping-attempt scenarios. Each failure or stale completion must retain its current input focus/alert behavior and must not move focus to a page heading. Repeat direct PIN and Device-Vault transitions in iPhone Safari and the installed Home Screen app with VoiceOver on. Automated and simulated-browser evidence does not prove physical VoiceOver, update/offline recovery, preview headers, provider state, production, or rollback; all remain `NOT VERIFIED` until observed and recorded.

## `CALM-STORED-SCHEMA-35A` local v35 Device Vault unlock recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v35`, cache `ruf-ministry-hub-v84-calm-os-core-v35`. It is local-only and is not committed, previewed, provider-verified, production-verified, rollback-verified, existing-real-vault verified, or physical-device verified. Use only a disposable origin, fictional records, and fictional neutral passphrases.
- Create fictional encrypted payloads whose **decrypted `payload.data.dataSchemaVersion`** marker is absent, exact numeric `2`, then exact numeric `3`. Confirm each unlocks through the existing additive normalization path, preserves auxiliary wording/drafts/Auto Memory and unknown record properties, removes the established plaintext keys, keeps the exact settings/envelope bytes, and shows the existing success. With App Lock on, confirm the live PIN field receives focus after the supported unlock.
- Separately try decrypted marker `1`, `999`, a numeric string, null, boolean, object, array, fraction, `NaN`, positive/negative infinity through a synthetic stub, plus missing or structurally incomplete `payload.data`. Each must remain locked, focus the live vault-passphrase field without setting `aria-invalid`, and announce only **Encrypted storage could not be opened safely. It was not changed.** Confirm no marker, fictional content, passphrase, ciphertext, or error detail appears; normalization, plaintext cleanup, workflow restore, Auto Memory initialization, success render, local/IndexedDB writes, revisions, generation, and envelope/settings bytes stay unchanged. Replace the envelope with a valid schema-3 fictional payload and confirm exactly one later retry succeeds.
- Start two fictional unlock attempts and hold decryption. Complete the newer wrong-passphrase attempt before the older supported attempt; the older completion must stay silent and locked. Repeat with two valid attempts completed newest first and with an older failure completed after a newer success; the newer state, toast, focus, timer, markup, log, and storage must remain exact. During one latest attempt, replace the raw encrypted-envelope bytes before decryption completes; it must stay locked, focus the live passphrase without `aria-invalid`, and announce only **Encrypted storage changed. Try again.**
- Recheck empty and current wrong passphrases. Both retain the existing field-validation behavior: the live field is focused, `aria-invalid="true"`, and one generic assertive error is announced. Superseded attempts must never clear or add invalid state, focus, toast, warning, or render. The separate supported-success heading-focus improvement when App Lock is off is not part of v35.
- Repeat the supported, rejected, overlap, envelope-replacement, wrong-passphrase, and App Lock cases in physical iPhone Safari and the installed Home Screen app before calling them device-verified. Record only fictional observations. Automated and simulated-browser evidence does not prove existing vault compatibility, physical storage durability, VoiceOver, update/offline recovery, preview headers, provider state, production, or deployed rollback.

## `CALM-PORTABLE-SCHEMA-32` local v32 portable-backup recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v32`, cache `ruf-ministry-hub-v81-calm-os-core-v32`. It is local-only and is not committed, previewed, provider-verified, production-verified, or physical-device verified. Use only disposable fictional-data files and a fictional neutral passphrase.
- Import plaintext and encrypted fictional backups with both schema markers absent, then with exact numeric schema `2` and `3` at the top only, nested data only, and both matching positions. Confirm each supported file reaches the existing replacement workflow and current encrypted schema `3` completes one file/passphrase round trip.
- Try exact numeric schema `1`, `999`, top `2` with nested `3`, top `3` with nested `2`, and string, null, boolean, object, array, fractional, or non-finite direct synthetic markers. Also try envelope version string `"2"`. Each unsupported input must remain on one retryable import sheet, focus the file field, and show only **That backup could not be imported.** It must not start recovery, normalize or relabel the file, retain an unknown collection, replace records/settings/wording/drafts, change Undo or Auto Memory, write local storage/IndexedDB/Device Vault revisions, or show success.
- Confirm a historical local Auto Memory schema-2 restore point still restores. This is a narrow already-local compatibility path; it does not authorize a top-3/nested-2 selected file and does not prove or change startup hydration, Device Vault unlock, or Auto Memory producer/reconciliation.
- Any accepted future/malformed/mismatched file, content-bearing diagnostic, partial mutation, unknown-collection retention, schema relabeling, lost supported historical field, or claim that automated evidence proves physical iPhone/preview/provider/production behavior is a release blocker.

## `CALM-STORED-SCHEMA-33A` local v34 startup-precedence recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v34`, cache `ruf-ministry-hub-v83-calm-os-core-v34`. It is local-only and is not committed, previewed, provider-verified, production-verified, or physical-device verified. Use only disposable fictional browser storage.
- In isolated fictional localStorage, try a complete canonical database graph with its marker missing, exact numeric `2`, then exact numeric `3`. Confirm each opens normally and normalizes in memory to current schema without overwriting the existing local commit bytes during startup.
- Separately try exact numeric `1`, `999`, string, null, boolean, object, array, fractional, and non-finite direct synthetic markers. Confirm one announced **Local data check paused** gate with one **Retry local recovery** control; it must not show the marker or fictional record, normalize/relabel the stored graph, render ministry data, seed demo data, add settings/data bytes, or change IndexedDB.
- Repeat with only an IndexedDB mirror, then with genuinely corrupt/incomplete local bytes plus that unsupported mirror. Both stores must remain exact and no current-schema local copy may appear. With unsupported complete local data plus a supported current mirror, confirm the app does not read/select the mirror or overwrite either copy. Finally, confirm corrupt/incomplete local bytes still recover from a supported missing-marker/schema-2/schema-3 mirror.
- With local settings absent, complete schema-unsupported plaintext local data, and fictional IndexedDB settings explicitly enabling Device Vault plus a valid fictional envelope, confirm startup reads settings then envelope, removes only the obsolete local plaintext copy, copies the settings/envelope locally, leaves durable settings/envelope exact, and shows **Unlock Encrypted Storage** without decrypting. Repeat with explicit local Device Vault settings and envelope. With explicit vault settings but no envelope, confirm the existing specific missing-vault error preserves all bytes.
- With settings explicitly false, and separately with settings missing, pair complete schema-unsupported plaintext with a merely present local envelope. Confirm neither case infers vault ownership: the plaintext gate remains, all local bytes remain exact, and no IndexedDB plaintext record is read or written. A structurally incomplete plaintext graph plus the same envelope must retain the older orphan-envelope lock path.
- These checks preserve only established Device Vault discovery precedence. They do not prove or change Device Vault payload validation, unlock, decrypt, or persistence behavior, and do not change Auto Memory producer, normalizer, reconciliation, or restore behavior. Any claim that automated evidence proves physical iPhone/Safari, preview, provider, or production behavior remains a release blocker.

## VoiceOver follow-up evidence (2026-07-17 10:28 CDT)

- Device/mode context remains the previously recorded iPhone 17 Pro Max on iOS 26.5.1 in saved Home Screen mode; no unnecessary device identifier is retained. The current QA context was the v8 preview, although the app identity is not visible in the screenshot itself.
- `MANUAL-DEVICE / OBSERVED`: a large empty VoiceOver focus rectangle appears against the top edge and intersects the visible iOS status/time area. The screenshot does not pass status-area containment.
- `INFERENCE`: the rectangle is the first skip link's accessibility box. The exact frozen v8 CSS keeps that link full-size and hides it with `translateY(-180%)`; VoiceOver virtual focus can expose the translated accessibility rectangle without applying the keyboard `:focus` reveal state.
- `NOT VERIFIED`: the screenshot contains no audio or visible label, so the spoken **Skip to main content** announcement, activation, focus transfer, and broader VoiceOver checklist are not image-proven.
- `CALM-A11Y-08` replaces the off-viewport transform with a clipped one-pixel default box anchored at the safe-area-aware position, while keyboard focus restores a fully visible link. The local candidate is app/package `2026.07.17-calm-os-core-v9` with cache `ruf-ministry-hub-v58-calm-os-core-v9`; it must pass automated gates, exact preview verification, and same-device recheck before this P2 can close.

## Exact-v9 VoiceOver recheck evidence (2026-07-17 11:11 CDT)

- Daniel reports updating the saved Home Screen app and rerunning the requested VoiceOver check. The screenshot itself does not display the app version, commit, cache name, or spoken label, so candidate identity remains `MANUAL-QA-REPORTED` rather than image-proven.
- `MANUAL-DEVICE / OBSERVED`: the VoiceOver rectangle no longer intersects the iOS status/time area. The v8 status-bar collision is improved.
- `P2 / OBSERVED`: the wide empty focus rectangle now crosses and clips the visible **Today** heading. Focus-box containment therefore still fails; this is not a VoiceOver pass.
- `INFERENCE`: the rectangle remains the hidden **Skip to main content** link. Its width matches that label more closely than the **Today** heading, and exact v9 keeps the link in the accessibility tree as a clipped one-pixel element while only DOM `:focus` restores its visible state.
- `NOT VERIFIED`: focused element, spoken label, rotor order, skip activation/focus transfer, hardware-keyboard behavior, broader VoiceOver semantics, Dynamic Type, orientation, update/offline/recovery, backup/vault, rollback, provider, and production.

## `CALM-A11Y-10` later-preview recheck

- Candidate under local review: app/package `2026.07.17-calm-os-core-v10`, cache `ruf-ministry-hub-v59-calm-os-core-v10`. Do not run this section until its exact commit, fingerprint, and preview deployment are recorded.
- Start a fresh saved Home Screen session with VoiceOver enabled and no hardware keyboard input. Swipe from the first item. Confirm the first announced item is meaningful visible app content and no empty focus rectangle appears over the iOS status area or **Today**.
- Continue through headings and both named primary-navigation landmarks. Confirm the removed initial skip link does not remove access to the **Today** heading or main content.
- In a separate fresh session with VoiceOver off, connect a hardware keyboard and press plain Tab once. Confirm **Skip to main content** becomes visibly focused below the safe area, then activate it and confirm focus moves to current main content.
- Press Option+Tab, Control+Tab, Command+Tab, and Shift+Tab before plain Tab in separate reloads. Confirm modified keys do not reveal or focus the skip link and do not trap focus.
- Record screenshot plus spoken label/target separately. A screenshot alone cannot prove the announcement, activation, focus transfer, or broader VoiceOver semantics.

## `CALM-AI-DURABLE-LOCK-16` exact-v12 Device Vault recheck

- Candidate under local review: app/package `2026.07.18-calm-os-core-v12`, cache `ruf-ministry-hub-v61-calm-os-core-v12`. Use fictional records only after its exact fingerprint and preview are recorded.
- With Device Vault enabled, approve one fictional AI action. Confirm the review stays visibly busy, Save and Cancel remain unavailable, and no success message appears until the encrypted save finishes. After success, reload and confirm the selected action exists exactly once and the interrupted-workflow prompt is gone.
- On a disposable synthetic origin, force the encrypted-save failure boundary. Confirm no approved record appears, no success is announced, the prior records and recovery choice remain intact, and the same approval can be retried. Automated evidence does not replace this browser/device check.

## `CALM-BACKUP-TRUTH-31B` local v31 backup initiation and focus recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v31`, cache `ruf-ministry-hub-v80-calm-os-core-v31`. It is local-only and is not committed, previewed, provider-verified, production-verified, or physical-device verified. Use only a disposable fictional-data origin and one fictional neutral passphrase.
- In iPhone Readiness, Backup Health, and Weekly Reset, test no initiation timestamp, an invalid timestamp, an overdue initiation, and a current initiation with Backup Reminder off. Confirm each Backup Rhythm row says **Needs Work**; reminder-off cases must say **Reminder Off**. Only a valid current browser-download initiation with a positive reminder interval may say **Ready**. The copy must distinguish **No download initiated**, **Reminder off**, **Download initiation due**, and a recent initiation, and every backup-status path must direct you to confirm the file in Files before relying on it. A timestamp is never proof that a file exists, is durable, or can be restored.
- For a plain backup, tap Export once. Confirm the app says **Backup download started. Confirm the file appears in Files.** Then inspect Files/Downloads manually and confirm exactly one expected non-zero fictional backup file exists. Automated checks and the app message prove browser initiation only; the agent must not open Downloads, the export, or a passphrase, so this Files result remains `MANUAL-DEVICE / NOT_VERIFIED` until Daniel records it.
- Repeat with Export Encrypted Backup. Before submit, confirm the enabled passphrase input receives focus. After submit, confirm the dialog announces **Preparing encrypted backup…**, shows busy state, disables both passphrase fields, Close, Cancel, and Export, and keeps focus on the dialog panel. Tab and Shift+Tab must remain on that panel; rapid taps, Escape, backdrop taps, Close, and a second submit must not dismiss it or start another operation. After completion, confirm focus returns to Export encrypted backup, the same Files-check copy appears, and exactly one expected non-zero fictional encrypted file is present with no duplicate download. On a synthetic preparation failure, confirm the sheet returns enabled with focus on the passphrase input and can retry.
- On a disposable synthetic origin, force download initiation to fail before the browser accepts it. Confirm the prior Backup Health and timestamp remain exact, no success appears, and one generic error says nothing was recorded. Separately force status persistence to fail after the browser accepted the click; confirm the prior timestamp remains exact and the app says the download may have started but its status was not recorded. Check Files manually without opening the file.
- Start encrypted preparation A, then complete an authorized fictional Undo/restore while A remains unresolved. Before A settles, confirm its busy owner is gone and a new encrypted-export sheet can start preparation B. Resolve A and confirm it cannot clear B, download, change timestamp/settings/storage/recovery/Undo/Auto Memory/vault revisions, show a toast, or replace B's sheet. Resolve B and confirm exactly one current download initiation, status update, success message, and owner cleanup.
- Repeat the stale-generation check by navigating with the real bottom navigation and, separately, by invoking the app's forced-close recovery path. Each must retire only its own busy owner, use a mutation-suppressed render, leave fictional records/settings/storage/Undo/Auto Memory/vault revisions exact, and permit one healthy retry before the old preparation settles.
- Force one generic encrypted-preparation failure whose synthetic error text contains a fictional secret-like marker. Confirm neither visible UI nor diagnostics expose that marker or the fictional passphrase, the same sheet returns enabled, and exactly one retry succeeds.
- Any **Backed up today**, **Backup current**, **Last export**, or **current or off** status derived from initiation metadata; Ready state with reminders off/missing/invalid/due metadata; timestamp recorded before download initiation; blocked immediate retry after recovery; duplicate operation; enabled busy control; stale completion; content-bearing diagnostic; missing cleanup; false Files-durability claim; or more/less than one expected fictional file is a release blocker. Keep automated, simulated-browser, manual-device, preview, provider, and production evidence separate against one unchanged fingerprint.

## `CALM-RECOVERY-UNDO-28` local v22 retry-owned recovery recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v22`, cache `ruf-ministry-hub-v71-calm-os-core-v22`. It is not committed, previewed, provider-verified, or production-verified. Exact v12 and its preview remain unchanged while v22 is reviewed.
- `AUTOMATED / SYNTHETIC`: focused recovery checks preserve the v18 all-store recovery matrix and add an accessible retry-only lock after cancellation persistence fails, immutable ownership of the exact Undo id and generations, fail-closed restore and newer-Undo refusal, and lifecycle/render/notification/auto-archive/shared-URL containment while the owner remains. The exact audited leaf entry points for pinned/recent people, person merge, App Coach dismiss/clear, wording reset, unified Capture, snooze, photo removal, and prayer update are byte-inert while that owner remains; this does not claim every possible direct entry point without an explicit regression contract. The four-second Device Vault boundary now exercises the real prior `flushEncryptedVaultSaves()` encryption and IndexedDB transaction phases as well as fresh cancellation encryption. A recovery settlement can revoke only its exact pre-existing lease or a newer lease born inside the same epoch with matching passphrase, revision, and payload generation; timeout restores staged local bytes, aborts an active transaction before unlock, disables follow-up, and fences late fulfillment or rejection. One exact terminal revocation certificate may be consumed only when its lease id matches the independent trusted last-revoked identity; a mutated id is retained and rejected before encryption or storage work. One later healthy retry must durably converge exactly once, and a released aborted gate remains byte-inert. Current Auto Memory reconciliation requires every current data collection as an array, nonempty producer metadata, a nonempty exported timestamp, and a vault timestamp whenever snapshots exist; the maintained empty vault remains valid and historical top-level ministry data compatibility is unchanged.
- `NOT VERIFIED`: real Safari/iPhone IndexedDB suspension, page-lifecycle interruption during restore or Undo, Device Vault reload after Undo, preview headers/assets, provider state, and production behavior.
- On a separately authorized exact v22 preview, use fictional data only. Save distinct records, settings, wording, and an unfinished Capture draft; restore a fictional backup; tap Undo; confirm every pre-restore value and the original draft return. Then make an ordinary record edit, type a newer unrelated draft, and Undo the record edit; confirm the newer draft remains.
- Force cancellation persistence to fail, then confirm the normal app is replaced by one announced **Recovery needs a retry** screen with exactly one **Retry Undo** control. Background/foreground, page hide/freeze, render, pending shared URL, notification, and auto-archive activity must remain inert until that exact Undo retries successfully. A backup restore or an injected newer Undo must refuse without a storage transaction or owner removal.
- With Device Vault enabled, separately stall an already-running vault encryption, its active local-database transaction, and fresh cancellation encryption. At 3,999 ms the retry must remain pending; at 4,000 ms it must fail closed and retain the same retry owner. For the transaction case, confirm staged local bytes are restored and the transaction is aborted before the recovery screen unlocks. Start one healthy retry while the aborted old gate remains unresolved and confirm the distinct current retry succeeds exactly once; then release the old gate and confirm no byte, revision, transaction, message, owner, or Undo change. For encryption-only late settlement, confirm no late write, success, owner removal, Undo consumption, or follow-up occurs; restore storage health and confirm one retry succeeds.
- With Auto Memory on, begin a fictional Backend Quick Grab and tap Undo before processing finishes. Confirm the grab and every Auto Memory restore point return to their exact pre-processing state after reload in both plaintext and Device Vault modes. Force the cancellation save to fail on a disposable synthetic origin, let the request settle, and confirm Undo is not consumed or announced and the processing generation remains coherent. Restore storage health and confirm one retry reruns cancellation, succeeds once, removes the retry owner, and leaves no processing restore point.
- Queue two synthetic browser-storage writes whose individual durations remain under four seconds but whose combined duration exceeds four seconds. Confirm recovery waits for both without a false aggregate timeout. Separately stall one database open/write beyond four seconds and confirm it still fails closed with no late commit.
- After a forced plaintext mirror failure, change only the canonical local synthetic value and retry Undo. Confirm only failed keys are reconciled from that local value in one transaction. Test null settings, incomplete ministry data, array wording/drafts, invalid Calm mode, string or incomplete Auto Memory versions/schemas/metadata, array Auto Memory settings/wording/drafts, and string or incomplete Device Vault versions/iteration counts/envelopes; each must keep recovery blocked before any batch, preserve its ledger and exact local/IndexedDB/live state, and never log fictional content. Valid maintained shapes with exact numeric versions and an intentional missing-key delete should reconcile unchanged.
- While Undo/restore is busy, directly invoke both local mock proposal creation and final proposal save through the visible workflow. Confirm neither path changes records, Undo, Auto Memory, storage, view, toast, or render state.
- With Device Vault enabled, tap Undo once and confirm **Undoing last change…** is announced, the Undo control is busy/disabled, navigation and repeat Undo do nothing, and no **Undid** message appears before the encrypted save finishes. After completion, confirm exactly one Undo entry was consumed, reload, and confirm the intended graph appears exactly once with no plaintext recovery copy.
- While restore or Undo is busy, try changing a setting, typing in a stale field, and sending the app to the background. Confirm the single app-level busy screen remains, none of those attempts is accepted, and success appears only after the latest requested and completed Device Vault revisions match.
- Start a fictional photo resize, notification permission request, encrypted export, shared-URL import, and update check, then begin recovery before each continuation resolves. Confirm no late continuation changes data, Undo, view, toast, download, URL cleanup, or backup metadata; the shared URL should import once only after recovery finishes.
- In a synthetic browser fixture, hold a follow-up save, care-cadence save, and approved AI-action save at their durability boundary. Confirm Undo/restore refuses before taking a snapshot. Force IndexedDB open and write deadlines, release the late callbacks, and confirm no post-timeout commit lands.
- On Safari with fictional data, suspend or interrupt IndexedDB during startup and Undo. After the 4-second local-storage deadline, confirm the app fails closed, keeps the prior bytes, explains that recovery could not finish, and offers a safe Retry path; a later database callback must not change the screen or commit data.
- Enable Device Vault after creating an ordinary Undo opportunity, then confirm Undo history is cleared only after setup succeeds and no plaintext record/draft mirror remains. Repeat setup with a forced synthetic failure and confirm the prior Undo opportunity and plaintext state remain. Perform the equivalent successful and failed Device Vault removal checks; successful removal must remove the encrypted envelope, while failure must retain the envelope, passphrase context, and prior Undo history without creating plaintext.
- Force a one-shot IndexedDB cancellation-batch abort after plaintext local storage succeeds. Repeat with a one-shot encrypted-vault commit abort. In both modes, confirm live data, all local and IndexedDB keys, Auto Memory, settings, view, Undo, and requested/completed vault revisions remain byte-equivalent; after the request settles the retry owner must remain. Restore storage health, tap Undo once, reload, and confirm the exact pre-operation state is durable in every store and the Undo entry is consumed exactly once.
- Any visible early success, lost draft, restored live byte before all stores commit, changed recovery key after failure, duplicate consume, navigation during the pending transaction, plaintext vault recovery, or retry failure is a release blocker. Keep automated, simulated, manual-device, preview, provider, and production evidence separate against one unchanged fingerprint.

## `CALM-PRIVACY-DICTATION-30D` local v28 mutation-free disclosure recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v28`, cache `ruf-ministry-hub-v77-calm-os-core-v28`. Use only fictional neutral records on a separately authorized unchanged-fingerprint preview. Automated and simulated-browser evidence does not verify physical iPhone Safari, installed Home Screen, VoiceOver, browser/device permission UI, processing location/handling/retention, provider state, or production behavior.
- On a disposable synthetic origin, prepare one old fictional Answered prayer that is due for automatic archive, an enabled granted reminder with fictional pending attention, and a pending fictional shared fragment. In main Capture, Today Capture, and a fictional profile capture, separately open, cancel, and confirm **Start dictation**. Confirm those disclosure transitions leave the prayer, reminder date, notification count, pending fragment, current draft, storage, records, proposals, and Undo unchanged; only checked Start may construct recognition.
- For main Capture, confirm the pending shared fragment is not appended or autosaved during disclosure open, cancel, or checked Start. After leaving the dictation transition, perform an ordinary non-dictation render and confirm the maintained automatic archive, reminder, and pending-fragment behaviors still run normally. This positive check is required so the containment cannot silently disable maintenance globally.
- Re-run every v27 live-draft/person-identity check and every v26 terminal-success, failure rollback, delayed-autosave, Device Vault, accessibility, and privacy check below on the exact v28 candidate. Any record/settings/draft/notification/deferred-fragment effect from a dictation transition, globally disabled ordinary maintenance, content-bearing diagnostic, or earlier dictation regression is a release blocker.

## `CALM-PRIVACY-DICTATION-30C` local v27 pre-disclosure live-draft recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v27`, cache `ruf-ministry-hub-v76-calm-os-core-v27`. Use only fictional neutral words on a separately authorized unchanged-fingerprint preview. Automated and simulated-browser evidence does not verify physical iPhone Safari, installed Home Screen, VoiceOver, browser/device permission UI, processing location/handling/retention, provider state, or production behavior.
- In Today Capture and a fictional profile capture, test with draft autosave on and off. Type an exact live draft containing leading and trailing spaces plus a line break, then tap **Dictate** before the 180 ms autosave delay. Also repeat from an absent saved draft and from an older saved draft. Confirm the exact live bytes remain visible in the disclosure, the checkbox starts unchecked, and no microphone or speech-permission UI appears before checked **Start dictation**.
- Cancel the disclosure. Confirm the exact draft remains editable, no recognition starts, and no autosave, record, proposal, Undo entry, or other persistent value changes. Reopen and cancel once more to confirm the result is stable rather than dependent on one render.
- Reopen, check the disclosure, and choose **Start dictation**. Confirm the exact baseline remains visible until a terminal recognition result. If recognition fails or is interrupted, confirm the baseline remains exact and no record, proposal, Undo entry, or content-bearing error is created. If it succeeds, continue with the v26 exact-once append and persistence checks below.
- In a profile, begin with person A rendered, then change the programmatic current-person state to person B without rebuilding the visible composer. Tap **Dictate** on person A's visible composer and confirm the disclosure/session remains bound to person A. A missing, detached, stale-screen, or recovery-locked target must refuse without changing the live draft or starting recognition.
- Re-run every v26 terminal-success, failure rollback, delayed-autosave, Device Vault, accessibility, and privacy check below on the same exact v27 candidate. Any pre-disclosure draft loss, stale stored draft replacement, person-identity drift, persistence on open/cancel, recognition before checked Start, or content-bearing diagnostic is a release blocker.

## `CALM-PRIVACY-DICTATION-30B` local v26 immediate-render dictation recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v26`, cache `ruf-ministry-hub-v75-calm-os-core-v26`. Use only fictional neutral words on a separately authorized unchanged-fingerprint preview. Automated and simulated-browser evidence does not verify physical iPhone Safari, installed Home Screen, VoiceOver, browser/device permission UI, processing location/handling/retention, provider state, or production behavior.
- With draft autosave on, seed a short draft in main Capture, Today Capture, and a fictional profile capture. Start dictation through the checked disclosure, speak a fictional neutral phrase, and wait for successful recognition to end. Immediately tap **Dictate** again before 180 ms. Confirm the exact appended draft remains visible, close/reopen the sheet and screen, and confirm reload restores it exactly once. Wait at least 250 ms and confirm neither the old autosave nor a late browser callback replaces or duplicates it.
- Repeat the three capture locations with draft autosave off. Confirm the successful words remain in the current editable view across the immediate disclosure render but no autosave entry is created. Re-enable autosave before relying on reload recovery.
- On a disposable synthetic test origin, force the current-draft save to return false and to throw. Confirm the textarea value, view draft, and prior capture method return exactly to their pre-dictation state; no success is announced and no record, proposal, Undo entry, plaintext vault draft, or content-bearing error is created.
- With Device Vault unlocked on a disposable fictional dataset, repeat the immediate reopen. Confirm the current in-memory encrypted draft cache wins immediately and the existing scheduled vault save later settles normally. This does not claim that `onend` itself makes every encrypted store durable.
- Re-run the v25 disclosure, permission, failure, recovery, late-event, accessibility, and physical-device checks below. Any stale-draft restoration, duplicate persistence, success before the current draft update, or failure-path transcript retention is a release blocker.

## `CALM-PRIVACY-DICTATION-30` local v25 dictation privacy recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v25`, cache `ruf-ministry-hub-v74-calm-os-core-v25`. Run only on a separately authorized exact-v25 preview with fictional neutral words. Automated and simulated-browser evidence does not verify physical iPhone Safari, installed Home Screen, VoiceOver, browser/device permission UI, processing location/handling/retention, provider state, or production behavior.
- On a fresh origin and after upgrading a prior saved settings object, confirm **Dictate** is absent. In More → Settings and data, turn on **Dictation Button**. Confirm an in-app dialog appears before any browser/device microphone prompt, its checkbox starts unchecked, Cancel leaves Dictate off, and the disclosure says the browser/device controls permission and audio processing while RUF Ministry Hub cannot verify where recognition occurs or how audio is handled.
- Enable after checking the disclosure. In Capture, Today, and a fictional person’s capture box, tap **Dictate**. Confirm every tap opens a fresh unchecked disclosure before any Safari permission UI or microphone indicator. Cancel and confirm the original draft, autosave, records, proposals, and Undo remain unchanged.
- Separately deny microphone/speech permission and interrupt one started request. Confirm only a generic content-free failure appears, no recognized or error detail is logged, the original draft remains exact, reload adds no text, and no Quick Grab, person, prayer, AI proposal, or Undo entry was created.
- Allow one request and speak a short fictional neutral phrase. Before recognition ends, confirm no partial words appear and reload would retain only the prior draft. After a successful end, confirm the phrase appears exactly once in the editable local draft and its one successful draft autosave survives reload. Confirm no permanent record or AI proposal exists until you separately choose **Save for later** or **Process** and complete the existing review.
- Start dictation, then navigate away, disable Dictation Button, and separately begin Undo/restore before recognition settles. Return and confirm late result/error/end callbacks add and save nothing. A best-effort app abort is not proof that the browser/device stopped audio processing.
- Repeat in physical iPhone Safari and the installed Home Screen app. Observe and record the actual permission UI and failure/success behavior without inferring processing location or retention. With VoiceOver, confirm the dialog title, disclosure, unchecked confirmation, Cancel, and Start/Enable controls are announced; focus stays in the modal and returns to the invoking control. At 390px, 430px, landscape, and large Dynamic Type, confirm no control or disclosure is clipped.
- Any Dictate button before versioned enablement, recognition construction before checked per-start confirmation, partial/failure transcript, duplicate append/autosave, content-bearing error, recovery mutation, permanent record without explicit Save/Process, or inaccessible/clipped confirmation is a release blocker.

## `CALM-PRIVACY-FRAGMENT-29B` local v24 shared-capture recheck

- Local candidate identity: app/package `2026.07.19-calm-os-core-v24`, cache `ruf-ministry-hub-v73-calm-os-core-v24`. Run this section only on a separately authorized exact-v24 preview with fictional text. Automated and simulated-browser results do not verify physical iPhone Safari, installed Home Screen, preview, provider, or production behavior.
- Rebuild **Send to RUF Hub** so its URL is the exact deployed app URL plus `#quickgrab=` and the URL-encoded Shortcut Input. Do not place shared text after `?`.
- With Safari online, share fictional Unicode, a newline, `%`, `+`, and reserved punctuation from Notes. Confirm the network address contains no shared text after `?`, Capture opens with the text exactly once, and refresh, focus, back/forward, and returning from the Share Sheet do not duplicate it.
- Before tapping anything, confirm no Quick Grab record or AI proposal exists. Tap **Save for later** and confirm exactly one raw Quick Grab is saved with no proposal. Repeat with new fictional text and tap **Process**; confirm exactly one raw Quick Grab is saved and privacy review opens before any proposal is created.
- Turn **Shared Text Quick Grab** off, fully close the installed app, and relaunch it from a valid fictional fragment URL. Confirm the fragment is removed during startup without changing the screen, draft, autosave, records, proposals, or Undo; focus, returning from the Share Sheet, and a second launch must not resurrect it. Re-enable the setting, relaunch with new fictional text, and confirm it imports exactly once before continuing.
- Try an empty fragment, malformed percent encoding, duplicate `quickgrab` parameters, an extra fragment parameter, and 6,001 fictional characters. Confirm each is removed with a generic content-free error and causes no draft, autosave, view, record, proposal, or Undo change. Confirm 6,000 ASCII characters remain accepted.
- Test `#main-content` and one unrelated anchor; confirm each remains unchanged. Test an unrelated query parameter together with a valid fragment; confirm the unrelated query survives after the fragment is removed.
- Test once after one online load in Airplane Mode from the saved Home Screen app. Confirm the cached shell opens, fragment text imports once, and Save for later remains local. Restore connectivity before any separately approved backend proposal check.
- Legacy `quickgrab`, `text`, `note`, category/tag, and urgency query keys are discarded and scrubbed, never imported or forwarded by the app entry redirect. A client-side cleanup cannot retract a query that the hosting provider already received, so use only fictional text for this legacy negative and do not treat a clean address bar as provider-log deletion proof.

## Before Testing

- Open More, then Settings and data, and export a JSON backup.
- Confirm the deployed URL is HTTPS.
- Confirm `/ruf-ministry-hub` loads with `200`, `/ruf-ministry-hub.html` canonicalizes once to that extensionless route, and `/app` reaches it without a redirect loop.
- Confirm unknown `/api/*` and nested `/api/ai/*` paths return metadata-only JSON `404`, not the app HTML; confirm wrong methods on the two active routes return metadata-only JSON `405`. `/api/ai/health` and `/api/ai/quick-grab` must remain the only active release API routes.
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

- In Safari, open the deployed app with `#quickgrab=Test%20capture`.
- Confirm Capture opens and the textarea contains `Test capture`.
- Repeat with `#quickgrab=Prayer%20capture`.
- Confirm the text imports but no category, urgency, or record-type controls appear. Query-based category and urgency aliases are discarded rather than imported.
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
- Tap Export all data as JSON and confirm the browser is asked to start the JSON download; do not treat that initiation alone as proof of a saved file.
- Confirm Backup Health changes only as download-initiation status, then confirm the expected non-zero JSON file appears in Downloads/Files before relying on it.
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

# RUF Ministry Hub Next-Level Build Prompt

Use this prompt when asking Codex or another senior app builder to continue the RUF Ministry Hub roadmap.

## Prompt

You are a world-class product engineer, app architect, ADHD-aware UX designer, and privacy-first ministry workflow designer. Continue building RUF Ministry Hub from the current source of truth in `ruf-ministry-hub-deploy-working`.

Your job is to make the app simpler, calmer, more automated, and more trustworthy without disrupting what already works.

Before changing code:

1. Read `RUF_Ministry_Hub_Project_Source_Audit.md`, `TESTING.md`, `docs/manual-qa.md`, and the current `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html`.
2. Run the current regression tests.
3. Identify whether the requested improvement is local-first, browser-only, PWA-only, or requires an external integration.
4. Do not claim cloud sync, native widgets, calendar/contact permissions, email import, AI services, or background automation are implemented unless the working code and deploy path actually include them.
5. Keep the existing app usable after every change. Prefer small vertical slices over broad rewrites.

Product principles:

1. The app should require as little manual input as possible.
2. The first screen should answer, "What do I do next?"
3. ADHD Mode should reduce choices, reduce visual noise, preserve momentum, and avoid shame-based wording.
4. Capture should be faster than organizing.
5. Review should happen one card at a time when the user is overwhelmed.
6. Every automation must be reversible, explainable, and privacy-aware.
7. Sensitive ministry data must stay private by default.
8. Future integrations must be opt-in and clearly labeled before data leaves the device.

Implementation order:

1. Replace browser `prompt` and `confirm` flows with in-app sheets.
2. Improve Autopilot Today so it completes one local action, then chooses the next.
3. Strengthen Quick Grab parsing for people, dates, prayer, follow-ups, meetings, urgency, waiting status, and sensitivity.
4. Add care cadences to people and make follow-up scheduling automatic.
5. Add Waiting/I Owe Them/Needs Reply workflow states.
6. Expand meeting notes into suggested prayer requests, follow-up tasks, and person updates.
7. Add weekly digest and bulk cleanup flows.
8. Add importers for pasted contacts, CSV, calendar text, and ministry notes.
9. Only after local-first flows are stable, design optional encrypted sync and external integrations.

For every feature:

1. Add focused regression tests.
2. Update manual QA if iPhone behavior is affected.
3. Bump `APP_VERSION` and service worker `CACHE_NAME` for deployable changes.
4. Package the deploy ZIP only after tests pass.
5. Note what is implemented, what is still roadmap, and what would require outside services.

Acceptance criteria:

1. Existing tests pass.
2. No old or removed feature claims appear in docs.
3. No new feature is only decorative if the UI says it works.
4. Mobile layout has no horizontal overflow at 390px.
5. The app still works offline after one online load.
6. The user can turn major automation and ADHD sections on or off.

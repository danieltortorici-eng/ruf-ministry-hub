# RUF Ministry Hub Project Source Audit — Current Sources Only

Date: 2026-07-02

## Source of truth to use

Use the current single-file PWA bundle as the source of truth:

- `ruf-ministry-hub.html`
- `ruf-ministry-hub.webmanifest`
- `ruf-ministry-hub-sw.js`
- `index.html`
- `ruf-ministry-hub-icon-180.png`
- `ruf-ministry-hub-icon-192.png`
- `ruf-ministry-hub-icon-512.png`

The cleaned bundle removes stale/missing `ruf-ministry-hub-icon.svg` references and bumps the app/cache version to force a clean update. The current working bundle also includes audit fixes for mobile navigation, shared Quick Grab category import, ADHD Mode, Autopilot foundation, attention presets, profile quick-action sheets, edit/create-person sheets, prayer action sheets, data-safety sheets, security sheets, Backup Health, Auto Memory Vault, updated local regression checks, and current manual QA wording.

## Remove or ignore as old/out-of-date

Remove these from Project Sources or do not use them for future builds unless explicitly requested:

- `RUF_Ministry_Hub_Airtable_Starter_Kit.xlsx` — old Airtable starter path, superseded by the PWA app.
- `RUF_Ministry_Hub_iPhone_Setup_Guide.md` — old Airtable setup guide, superseded by the in-app iPhone Readiness and Manual screens.
- Duplicate older `index.html` source entries — keep only the newest redirect file if the Project Sources UI shows duplicates.

## Reference-only

- `ARCHITECTURE-READINESS.md`, `docs/next-level-build-prompt.md`, and `docs/next-level-roadmap.md` can stay as planning/reference material, but they explicitly describe future integration notes, not active features in the current build. Do not treat future native/backend/widget/cloud-sync notes as implemented features.

## Build audit notes

- The latest accessible app file included `APP_VERSION = "2026.06.30-share-import-fix"`; the cleaned source bundle first updated this to `2026.07.01-current-sources-clean`. The current working bundle now uses `2026.07.02-auto-memory-vault`.
- The service worker cache included a missing SVG icon. The cleaned bundle removes the missing SVG from the HTML, manifest, and service worker asset list.
- The current service worker cache is `ruf-ministry-hub-v20-auto-memory-vault` and caches `index.html` as well as the app shell and PNG icons.
- Keep all current bundle files in the same folder when deploying.
- Use `ruf-ministry-hub-auto-memory-vault.zip` when you want the current fixed bundle as a deployable archive.
- Deploy over HTTPS for PWA install/offline behavior.
- Auto Memory Vault is local restore history on the current browser/device. It is not cloud sync and does not replace exported backups for device loss, browser storage deletion, or moving to a new device.

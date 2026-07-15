# Calm OS Source-of-Truth Audit

Audit date: 2026-07-15
Evidence scope: tracked source and synthetic maintained tests only

## Authority map

| Layer | Authority | Rule |
| --- | --- | --- |
| Repository | `https://github.com/danieltortorici-eng/ruf-ministry-hub` | Canonical Git repository. |
| Deployable PWA | `ruf-ministry-hub-deploy-working/` | Cloudflare Pages root; blank build and deploy commands; output `.`. |
| Application source | `ruf-ministry-hub-deploy-working/ruf-ministry-hub.html` | Sole editable behavioral authority for the PWA. Baseline: 12,470 lines, 577,038 bytes. |
| Offline runtime | `ruf-ministry-hub-deploy-working/ruf-ministry-hub-sw.js` | Versioned shell, network-first documents, cache-first static assets, explicit activation, `/api/*` bypass. |
| Static policy | Deploy `_headers`, `_redirects`, `index.html`, manifest, icons | CSP, routing, install metadata, and public assets. Inline script changes require a new CSP hash. |
| Pages Functions | Deploy `functions/api/ai/{health,quick-grab}.js` | Runtime copies for the two accepted stateless endpoints. |
| Function mirrors | Root `functions/api/ai/{health,quick-grab}.js` | Must remain byte-for-byte identical to deploy copies. No Function change is planned for Calm OS. |
| Root PWA | Root HTML, service worker, manifest, icons | Compatibility/audit foundation; not the Pages publish source. |
| Historical output | `dist/ruf-ministry-hub.html` | Stale compatibility artifact; never edit or deploy. |
| Verification | `tests/`, audit scripts, `package.json` | `npm test` is the maintained full local suite. |

## Observed application map

- The baseline is a framework-free single-file PWA with inline CSS, inline JavaScript, global `db`/`settings`/`view` state, string-template renderers, and full `#app` replacement on render.
- It declares 529 functions, including 75 renderers. Desktop navigation has 10 entries, mobile has 7, `renderScreen()` dispatches 19 states, and `renderSheet()` dispatches 12 sheet types.
- Collections are `people`, `quickGrabs`, `notes`, `meetingNotes`, `prayerRequests`, `tasks`, and `aiProposals`.
- Existing proposal behavior already provides per-action selection, editing, partial approval, final confirmation, source links, and rollback on execution error.

## Storage and compatibility map

| Purpose | Current contract |
| --- | --- |
| Main data | localStorage `ruf_ministry_hub_smart_quick_grab_v1` plus IndexedDB mirror |
| Settings | `ruf_ministry_hub_settings_v1` |
| Edited copy | `ruf_ministry_hub_custom_copy_v1` |
| Drafts | `ruf_ministry_hub_autosave_drafts_v1` |
| Auto Memory | `ruf_ministry_hub_auto_memory_v1` |
| Device Vault | `ruf_ministry_hub_encrypted_storage_v1` using AES-GCM/PBKDF2-SHA-256 |
| IndexedDB | `ruf_ministry_hub_local_store`, store `keyval`, version 1 |
| Portable backup | App `RUF Ministry Hub`, envelope version 2 |
| Quick Grab API | Proposal schema `quick_grab_proposal_v2`; no server-side ministry store |

`normalizeData()` preserves unknown record properties. That behavior is the compatibility mechanism for dormant legacy fields such as `preferredContactMethod`; Calm OS must remove uses without deleting stored values.

## Duplicate and drift risks

1. Deploy, root, and `dist` HTML contain different versions. Editing the wrong file is a high-severity authority failure.
2. Root and deploy service workers differ materially; the root worker must not replace the deploy worker.
3. Deploy app version, service-worker cache name, package version, and inline CSP hash must identify the same candidate.
4. Function mirrors must remain identical even though this redesign does not need Function changes.
5. Root and deploy manifests/SVG assets are intentionally not mechanically synchronized.
6. Historical backup formats earlier than the tracked version-2 envelope are not present and remain `NOT VERIFIED`.

## Branch and external boundary

- `OBSERVED`: Audit branch `redesign/calm-os-next-action`, base `c1541625b47073c3cce2e3eb116617a3d36285f8`, Phase 0 HEAD `9d687623c36c06c139be0d6d29fb5b3c4b1e7ed6`.
- `OBSERVED`: The redesign worktree was clean during read-only audits; the original dirty checkout remains untouched.
- `AUTOMATED`: Baseline `npm test` exited 0.
- `NOT VERIFIED`: Real iPhone, provider, preview, and production state.
- Nothing in this audit authorizes push, merge, deployment, secrets, bindings, spending, external sends, or real ministry data.

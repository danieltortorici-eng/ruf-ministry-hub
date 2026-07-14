# RUF Ministry Hub Canonical Source Audit

Date: 2026-07-13

Canonical repository: `https://github.com/danieltortorici-eng/ruf-ministry-hub`. See `docs/canonical-repository-guide.md` for the current operating map; this audit preserves the evidence behind the integrated v32 layout.

## Canonical source layout

- Treat `ruf-ministry-hub-deploy-working/` as the Cloudflare Pages deployable app source.
- Keep `functions/api/ai/*.js` identical to `ruf-ministry-hub-deploy-working/functions/api/ai/*.js`.
- Keep `dist/ruf-ministry-hub.html` as a maintained release/regression artifact, not as the editable source of truth.
- Keep the root PWA files and audit scripts from GitHub `main` as the v32 compatibility and verification foundation. Cloudflare Pages must not publish the repository root.

The deploy service worker preserves the `main` v32 cache foundation and adds the maintained Pages requirements: same-origin handling, `/api/*` bypass, direct-document routing, and query-insensitive offline shell fallback.

## Integrated sources

This canonical integration starts from GitHub `main` at `ba68982360fd6533341e37074beba1958526e7f0` and ports the maintained source layout and safe features preserved at `fed19d03d2b2097cb538a61a4b3336bd09e711ce`.

Unique `main` artifacts remain in the repository, including:

- the root v32 PWA shell, manifest, icons, and service worker;
- `package.json` and the root syntax, asset, and browser-secret audits;
- `AUTONOMOUS_AUDIT.md`, `CODEX_NEXT_PROMPT.md`, and `DEPLOY_TO_GITHUB_CLOUDFLARE_CODEX.md` as historical handoff artifacts.

## Current safe capabilities

- Local-first Today, Autopilot, Quick Grab, Quick Review, people, prayer, task, backup, Device Vault, and Auto Memory Vault workflows.
- ADHD-aware attention presets and configurable Today sections.
- In-app approval sheets for profile, prayer, data-safety, and security actions.
- Cloudflare Pages Functions for AI health and Quick Grab proposals.
- Mock-first AI behavior when no server key is configured.
- Explicit AI proposal review: AI may propose actions, but Daniel selects and approves actions before local records are saved.
- Server-only OpenAI credentials; no API key or secret belongs in browser code or tracked configuration.

## Version and deployment boundary

- App version: `2026.07.08-offline-cache-hardening-local-agents`.
- Service worker cache: `ruf-ministry-hub-v32-offline-cache-hardening-local-agents`.
- Pages root: `ruf-ministry-hub-deploy-working`.
- Pages Functions directory: `functions` inside that deploy root.
- Deploy with Cloudflare Pages only; do not use `npx wrangler deploy` for this app.

No deployment is part of this source integration. Run the full local suite with `npm test` before any later review, merge, push, or deployment.

## Privacy boundary

- Code and synthetic fixtures may be committed.
- Real pastoral/ministry data stays local and must never be added to source, tests, screenshots, or external AI requests without explicit approval.
- Never read, print, commit, or copy `.env.local` or real secret values.
- Future sync, calendar, contacts, email, background automation, and additional AI integrations remain opt-in roadmap work until implemented and reviewed.

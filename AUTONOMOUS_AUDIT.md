# RUF Ministry Hub Autonomous Build Audit — 2026-07-08

> Historical record: this audit preserves the pre-canonical state observed on 2026-07-08. Do not use its access assumptions or next steps as current instructions. See `README.md` and `docs/canonical-repository-guide.md`.

## Access status
- GitHub connector login works as `danieltortorici-eng`, but the GitHub App currently has zero installed accounts/repositories available in this ChatGPT session. Direct commits, PRs, issue creation, and repo file edits are blocked until the GitHub App is installed on the intended repo/account.
- Cloudflare Pages and Codex direct connectors are not available in this chat, so I could not edit Cloudflare dashboard settings or run Codex remotely from here.
- I continued by improving the deployable local hotfix bundle and adding tests/checks that Codex can apply to the real repo.

## Fixes applied in this bundle
1. Added missing `ruf-ministry-hub-icon.svg` because the app HTML/manifest reference it.
2. Hardened the service worker:
   - caches `./`, `index.html`, `ruf-ministry-hub.html`, manifest, and icons;
   - uses `CACHE_PREFIX` so cleanup is scoped to RUF Hub caches only;
   - does not fail service-worker installation because one optional asset is missing;
   - uses network-first navigation with offline fallback to `ruf-ministry-hub.html`.
3. Bumped app/cache versions together:
   - `APP_VERSION = 2026.07.08-offline-cache-hardening-local-agents`
   - `CACHE_NAME = ruf-ministry-hub-v32-offline-cache-hardening-local-agents`
4. Added local-only ministry automation tools:
   - `Copy Local Briefing` on person profiles;
   - richer `Copy Text Drafts` with Casual / Pastoral / Short options built from local person/prayer/task data;
   - `Copy Prayer Steward Audit` in Prayer Requests.
5. Added test/audit scripts:
   - `check-app-syntax.mjs` extracts and syntax-checks the inline app script;
   - `audit-assets.mjs` verifies static asset references exist;
   - `audit-secrets.mjs` checks the browser bundle for API keys/direct OpenAI SDK imports;
   - `package.json` exposes `npm test`.

## Tests run
```bash
npm test
```

Passed:
- App script syntax check
- Service worker syntax check
- Asset audit
- Browser secret/client-boundary audit

## Current highest-priority roadblocks
1. Source-of-truth is still the biggest risk. The latest working app must live in one Git repo that Codex, GitHub, and Cloudflare all use.
2. Cloudflare Pages should deploy from the repo output folder, not a detached local folder or stale upload.
3. Real AI should remain server-only. The browser must never contain `OPENAI_API_KEY`, route secrets, or direct OpenAI SDK imports.
4. Static PWA hosting cannot do true background automation. Scheduled backend checks require Cloudflare Workers/Pages Functions cron or another backend later.
5. Local Device Vault encryption protects browser-stored data on one device, but it is not cloud sync. Backups remain mandatory until intentional sync is built.

## Recommended next build step
1. Install/authorize the GitHub App on the intended repo so ChatGPT/Codex can see it.
2. Apply this hotfix bundle to the true repo source and deploy output.
3. Run `npm test` or port the three checks into the existing test harness.
4. Confirm Cloudflare Pages deploys the updated bundle.
5. Continue feature work in this order: stabilize AI Review / Confirm AI Actions → Person Briefing UI → Follow-Up Draft UI → Prayer Steward → Data Janitor.

# RUF Ministry Hub Autonomous Build Audit — 2026-07-08

## What I could directly inspect
- Local uploaded app bundle in `/mnt/data`.
- GitHub connector login worked, but the GitHub App has zero installed accounts/repositories available in this chat, so I could not push a commit or open a PR directly.
- Cloudflare/Codex direct connectors are not available in this chat, so I could not edit Pages dashboard settings or run Codex remotely.

## Fixes applied to this hotfix bundle
1. Added missing `ruf-ministry-hub-icon.svg` because the app HTML and manifest reference it.
2. Replaced the service worker with a safer version:
   - caches `index.html` and `./` in addition to the app shell;
   - uses a `CACHE_PREFIX` so old RUF Hub caches are cleaned without deleting unrelated caches;
   - does not fail installation if a single optional asset is unavailable;
   - uses network-first navigation with offline fallback to `ruf-ministry-hub.html`.
3. Bumped the local app version to `2026.07.08-offline-cache-hardening`.
4. Added `audit-assets.mjs` to verify referenced deploy assets exist.

## Current highest-priority roadblocks
1. The current source folder on Daniel’s machine appears not to be a Git repository, so GitHub/Codex/Cloudflare cannot share one dependable source of truth until this is fixed.
2. Cloudflare Pages deployment is working, but GitHub integration is not actually wired to the current working source.
3. Real OpenAI mode must remain server-only. The browser must never contain `OPENAI_API_KEY` or any route secret.
4. The current architecture is static/local-first plus optional Cloudflare Pages Functions. True background automation will require scheduled backend checks later.

## Recommended next build step
Make the latest deployable folder a real Git repo, push it to GitHub, connect Cloudflare Pages to that repo, and make Codex work only from the same repo/branch. Then build the next app feature: AI Review Inbox → Person Briefing → Follow-Up Drafts → Prayer Steward.

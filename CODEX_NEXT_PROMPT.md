Continue building RUF Ministry Hub autonomously. You have permission to change files as needed, but keep the safety model: AI proposes, Daniel approves, and no browser code may contain `OPENAI_API_KEY` or route secrets.

Start by fixing the source-of-truth problem:
1. Determine the latest deployable source folder. Prefer `/Users/danieltortorici/ruf-ministry-hub-auto-memory-vault` if present, because recent audits show it contains `dist`, `public`, `src/client`, `functions/api/ai`, tests, and Cloudflare config.
2. If it is not a Git repo, initialize it or move it into the correct GitHub repo. Do not keep developing from detached local folders.
3. Make Cloudflare Pages deploy from the repo’s deployable output folder, not from an old folder.
4. Confirm the deployed project name is the intended one: `ref-ministry-hub` unless Daniel has intentionally renamed it.

Immediate hotfix to apply everywhere relevant (`root`, `public`, `dist`, and any deploy-working folder):
1. Ensure `ruf-ministry-hub-icon.svg` exists if HTML or manifest references it. Use the SVG from this hotfix bundle if missing.
2. Harden the service worker:
   - use `CACHE_PREFIX` and a new `CACHE_NAME`;
   - cache `./`, `index.html`, `ruf-ministry-hub.html`, manifest, and icons;
   - do not let one missing optional asset fail service-worker install;
   - use network-first for navigations with offline fallback to `ruf-ministry-hub.html`;
   - keep cache cleanup scoped to `CACHE_PREFIX` only.
3. Bump `APP_VERSION` and `CACHE_NAME` together for any deployable change.
4. Add/keep an asset audit test that fails if HTML, manifest, or service worker references a missing static asset.

Then run these checks:
- `node tests/source-regression.test.mjs` if available
- all existing `npm test` or regression scripts in `package.json`
- `node audit-assets.mjs` or the equivalent source regression asset check
- grep client files to confirm they do not contain `OPENAI_API_KEY`, route secrets, or direct OpenAI SDK imports
- hit deployed `/api/ai/health`
- hit deployed `/api/ai/quick-grab` with fake fixture data only

Next feature work after the hotfix:
1. Stabilize AI Review / Confirm AI Actions so selected/skipped action IDs persist correctly.
2. Keep Quick Grab as the only real-capable backend route for now.
3. Add mock-first Person Briefing and Follow-Up Draft UI using local data only.
4. Add regression tests before adding any new real backend AI route.

Audit before finishing:
- source-of-truth is a Git repo;
- Cloudflare deploy root matches the repo output;
- service worker cache/version changed;
- no missing static assets;
- no API keys in browser files;
- tests pass;
- deployment URL works for `/`, `/ruf-ministry-hub.html`, `/api/ai/health`, and `/api/ai/quick-grab`.

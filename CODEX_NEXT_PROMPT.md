> Historical handoff: this prompt preserves pre-canonical assumptions for audit history. Do not execute its source discovery, deploy, or connector instructions. See `README.md` and `docs/canonical-repository-guide.md` for current guidance.

Continue building RUF Ministry Hub autonomously. You have permission to change files as needed, but keep the safety model: AI proposes, Daniel approves, and no browser code may contain `OPENAI_API_KEY`, route secrets, or direct OpenAI SDK imports.

Start by fixing source-of-truth:
1. Determine the latest deployable source folder. Prefer `/Users/danieltortorici/ruf-ministry-hub-auto-memory-vault` if present, because recent terminal output shows it contains `dist`, `functions/api/ai`, tests, and Cloudflare config.
2. If it is not a Git repo, initialize it or move it into the correct GitHub repo. Do not keep developing from detached local folders.
3. Confirm Cloudflare Pages deploy root uses the repo output folder, not an old local upload.
4. Confirm project name is intentionally `ref-ministry-hub` unless Daniel changed it.

Apply the autonomous hotfix everywhere relevant (`root`, `public`, `dist`, and any deploy-working folder):
1. Ensure `ruf-ministry-hub-icon.svg` exists if HTML/manifest references it.
2. Harden the service worker:
   - use `CACHE_PREFIX` and new `CACHE_NAME`;
   - cache `./`, `index.html`, `ruf-ministry-hub.html`, manifest, and icons;
   - do not let one missing optional asset fail install;
   - use network-first navigation with fallback to `ruf-ministry-hub.html`;
   - clean only caches starting with `CACHE_PREFIX`.
3. Keep app/cache versions paired:
   - app version should be at least `2026.07.08-offline-cache-hardening-local-agents`.
4. Add or preserve these local-only features:
   - person profile button: `Copy Local Briefing`;
   - person profile button: `Copy Text Drafts` with Casual / Pastoral / Short options;
   - Prayer Requests button: `Copy Prayer Steward Audit`.
5. Add/keep these tests:
   - inline app script syntax check;
   - service worker syntax check;
   - asset audit;
   - browser secret/client-boundary audit.

Run checks:
- `npm test`
- existing regression tests in `package.json`
- `node tests/source-regression.test.mjs` if available
- `node tests/deployment-config-regression.js` if available
- `node tests/ai-functions-regression.js` if available
- grep client files for `OPENAI_API_KEY`, `sk-`, and direct `openai` imports

Then deploy and verify:
- `/`
- `/ruf-ministry-hub.html`
- `/api/ai/health`
- `/api/ai/quick-grab` with fake fixture data only

Next feature sequence after the hotfix:
1. Stabilize AI Review / Confirm AI Actions so selected/skipped action IDs persist correctly.
2. Keep Quick Grab as the only real-capable backend route for now.
3. Turn Person Briefing and Follow-Up Drafts from local-copy helpers into editable review cards.
4. Add Prayer Steward review cards.
5. Add Data Janitor review cards.
6. Only after those are stable, add another backend AI route.

Final audit before finishing:
- source-of-truth is a Git repo;
- Cloudflare deploy root matches the repo output;
- service worker cache/version changed;
- no missing static assets;
- no browser API keys;
- tests pass;
- deployed URL works for static and AI routes;
- Daniel can install the updated PWA on iPhone and refresh the service worker.

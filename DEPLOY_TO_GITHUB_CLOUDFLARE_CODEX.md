# Deploy / Source-of-Truth Runbook

Use this when applying the hotfix bundle to the real RUF Ministry Hub source.

## 1. Fix GitHub visibility first
The GitHub connector in ChatGPT is logged in as `danieltortorici-eng`, but has zero installed accounts/repositories. Install the GitHub App on the account/repository that owns RUF Ministry Hub, then reconnect/retry.

## 2. Find the real source folder
On Daniel's Mac, prefer the most recent working folder referenced in prior terminal output:

```bash
cd /Users/danieltortorici/ruf-ministry-hub-auto-memory-vault
pwd
ls
```

Confirm it contains the real source, tests, deploy output, and Cloudflare config:

```bash
find . -maxdepth 3 -type f \( -name 'package.json' -o -name 'wrangler.jsonc' -o -name 'ruf-ministry-hub.html' -o -path './functions/api/ai/*' \) -print
```

## 3. Make it a real git repo if needed

```bash
git status || git init
git branch --show-current || git checkout -b main
git add .
git commit -m "chore: establish RUF Ministry Hub source of truth"
```

Then add the GitHub remote and push:

```bash
git remote -v
# if no origin:
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

## 4. Apply this hotfix
Copy these files into every relevant deploy/source location that currently ships the static PWA shell:

- `ruf-ministry-hub.html`
- `ruf-ministry-hub-sw.js`
- `ruf-ministry-hub.webmanifest`
- `index.html`
- all icon files, including `ruf-ministry-hub-icon.svg`
- `audit-assets.mjs`
- `check-app-syntax.mjs`
- `audit-secrets.mjs`
- `package.json` scripts, or merge the scripts into the existing `package.json`

If the repo has `public/`, `dist/`, or `ruf-ministry-hub-deploy-working/`, make sure the deployed output receives the same service-worker/icon/version changes.

## 5. Run local checks

```bash
npm test
node tests/source-regression.test.mjs 2>/dev/null || true
node tests/deployment-config-regression.js 2>/dev/null || true
node tests/ai-functions-regression.js 2>/dev/null || true
node tests/regression-harness.js 2>/dev/null || true
```

Also check for secrets in browser files:

```bash
grep -RIn "OPENAI_API_KEY\|sk-[A-Za-z0-9_-]\{20,\}\|from ['\"]openai['\"]" \
  ruf-ministry-hub.html index.html public dist src/client 2>/dev/null || true
```

## 6. Deploy to Cloudflare Pages
Confirm the project is intentionally named `ref-ministry-hub` unless Daniel has renamed it:

```bash
npx wrangler pages deploy dist --project-name=ref-ministry-hub --branch=main
```

If the deploy root is not `dist`, use the actual Pages output folder, but do not deploy the repo root unless that is intentionally the compiled output.

## 7. Verify live routes
Replace `<deployment-url>` with the new Cloudflare Pages deployment URL:

```bash
curl -sS <deployment-url>/ | head
curl -sS <deployment-url>/ruf-ministry-hub.html | head
curl -sS <deployment-url>/api/ai/health | jq
curl -sS -X POST <deployment-url>/api/ai/quick-grab \
  -H "Content-Type: application/json" \
  --data @tests/fixtures/api/fake-quick-grab.json | jq
```

Expected safety model:
- `/api/ai/health` may show mock mode until `OPENAI_API_KEY` is configured in Cloudflare Pages environment variables.
- `/api/ai/quick-grab` should never require the browser to know the OpenAI key.
- Quick Grab remains the only real-capable backend AI route until AI Review is fully stable.

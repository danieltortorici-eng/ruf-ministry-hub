## Summary

<!-- What changed, and why is this the smallest safe change? -->

## Privacy and approval boundary

- [ ] I used only code and synthetic fixtures; no real ministry data, exports, screenshots, or `.env.local` values are included.
- [ ] No secret was added to browser code, tests, docs, tracked configuration, or artifacts.
- [ ] Any AI behavior only proposes actions; Daniel still approves selected actions before records are saved.
- [ ] Any external AI, sync, import, email, calendar, or contact behavior is opt-in, reversible, and documented.

## Source and deploy boundary

- [ ] I treated `ruf-ministry-hub-deploy-working/` as the deployable source of truth.
- [ ] If a Pages Function changed, I updated both required copies and the generated-output drift audit passes.
- [ ] If deployable app behavior changed, I bumped `APP_VERSION` and the service-worker `CACHE_NAME`.
- [ ] If iPhone or Safari behavior changed, I updated `docs/manual-qa.md`.
- [ ] I did not add repository internals or local data to the Cloudflare Pages output.

## Verification

- [ ] `npm test`
- [ ] Manual checks needed for this change are described below.

<!-- Include synthetic inputs, expected results, and any checks intentionally not run. -->

## Risk and rollback

<!-- What can fail, how will a reviewer notice, and how can this change be reversed? -->

## Deployment

- [ ] This pull request does not deploy, change GitHub settings, or expose secrets.
- [ ] Any later deployment will use Cloudflare Pages with `ruf-ministry-hub-deploy-working` as the root, never `npx wrangler deploy`.

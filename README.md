# RUF Ministry Hub

RUF Ministry Hub is a local-first, privacy-sensitive ministry PWA. The canonical repository is [danieltortorici-eng/ruf-ministry-hub](https://github.com/danieltortorici-eng/ruf-ministry-hub).

Start with [docs/canonical-repository-guide.md](docs/canonical-repository-guide.md). It is the current map for architecture, local setup, tests, source-of-truth rules, privacy, Cloudflare Pages operations, emergency Quick Grab AI controls, and contributor handoffs.

## Non-negotiable boundaries

- `ruf-ministry-hub-deploy-working/` is the Cloudflare Pages deploy source. Do not deploy the repository root.
- Deploy through the canonical GitHub repository into Cloudflare Pages. Do not use `npx wrangler deploy`; that creates a separate Worker deployment.
- Keep `functions/api/ai/*.js` byte-for-byte aligned with `ruf-ministry-hub-deploy-working/functions/api/ai/*.js`.
- Never read, print, copy, commit, or publish `.env.local`, real secrets, or real ministry data.
- Use synthetic fixtures in tests and reviews.
- AI returns proposals only. Daniel reviews and approves selected actions before local records are changed.

## Quick start

```sh
git clone https://github.com/danieltortorici-eng/ruf-ministry-hub.git
cd ruf-ministry-hub
npm test
```

The test suite has no required application build step. See the [local setup](docs/canonical-repository-guide.md#local-setup) for static and Pages-compatible local previews.

## Documentation index

- [Canonical repository guide](docs/canonical-repository-guide.md) — current operating map and contributor checklist.
- [Testing](TESTING.md) — commands and test coverage.
- [Deployment notes](DEPLOYMENT_NOTES.md) — production Pages settings and release verification.
- [OpenAI integration](docs/openai-integration.md) — Quick Grab request boundary and runtime settings.
- [Manual iPhone QA](docs/manual-qa.md) — release checks that require Safari on a real iPhone.
- [Canonical source audit](RUF_Ministry_Hub_Project_Source_Audit.md) — evidence behind the integrated v32 layout.
- [Next-level roadmap](docs/next-level-roadmap.md) — dated product phases and implementation status.

`AUTONOMOUS_AUDIT.md`, `CODEX_NEXT_PROMPT.md`, and `DEPLOY_TO_GITHUB_CLOUDFLARE_CODEX.md` are preserved historical handoffs. Their original commands and assumptions are not current operating instructions.

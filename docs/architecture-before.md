# Calm OS Architecture — Before

## Runtime

```text
Cloudflare Pages
├── index.html + _redirects + _headers
├── ruf-ministry-hub.html
│   ├── inline CSS
│   ├── constants and global mutable state
│   ├── storage / backup / vault helpers
│   ├── capture and proposal logic
│   ├── string-template renderers
│   └── full #app replacement + event rebinding
├── browser service worker
└── Pages Functions
    ├── GET /api/ai/health
    └── POST /api/ai/quick-grab
```

The single-file PWA is intentionally deployable without a build system, but product and data concerns are interleaved. The redesign will create internal service boundaries without adding a framework or changing the Pages shape.

## State

```text
settings -> localStorage + IndexedDB mirror
db       -> localStorage + IndexedDB mirror + Auto Memory snapshots
view     -> memory only, except selected proposal actions stored in db
drafts   -> localStorage + IndexedDB write mirror
vault    -> encrypted localStorage + IndexedDB mirror
```

The accepted startup path constructs `settings`, `db`, and `view` synchronously, renders, and only then attempts IndexedDB hydration. This ordering creates the recovery defect documented in `docs/performance-audit.md`.

## Product paths

- Today combines independent Start Here, Autopilot, shortcuts, capture, review, people, task, coach, and backup renderers.
- Quick Grab owns raw capture, category/urgency input, manual conversion, and entry into AI review.
- Profile record-specific sheets create notes, meetings, prayers, and tasks directly.
- `db.aiProposals` supports selection, edit, partial approval, confirmation, and local execution, but proposal execution currently inherits hidden date mutations from record constructors.
- Date decisions use several helpers and direct `Date` comparisons; normal UI also renders Created/Updated metadata.

## Coupled release artifacts

Any authoritative app script change couples:

1. `APP_VERSION` in the deploy HTML.
2. `CACHE_NAME` in the deploy service worker.
3. `package.json` version.
4. The deploy inline-script SHA-256 in `_headers`.

Manifest naming/theme changes are deploy-tree-only. Pages Functions remain unchanged unless the proposal wire contract itself changes, in which case root/deploy mirrors must change together.

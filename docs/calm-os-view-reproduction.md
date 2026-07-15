# Calm OS View Reproduction

No production or preview deployment is required. Use synthetic/demo data only and keep the before/after origins on different ports so their localStorage, IndexedDB, and service workers cannot overlap.

## After view

From the Calm OS branch worktree:

```sh
python3 -m http.server 8013 --directory ruf-ministry-hub-deploy-working
```

Open `http://localhost:8013/ruf-ministry-hub.html` in a disposable browser profile. Capture Today, Capture, People, one populated profile, Prayer, and More at:

- iPhone narrow: 390 × 844 CSS pixels.
- iPhone wide: 430 × 932 CSS pixels.
- Desktop: 1440 × 900 CSS pixels.

For the profile view, use only the built-in synthetic demo or create fictional local records. Keep Mask Sensitive Previews on. At 390px, verify Today has exactly Next thing to do, Quick Capture, and After that; After that has at most two rows; only one CTA is visually dominant.

## Before view

Create a disposable detached worktree from the last architecture-only commit, before runtime redesign began:

```sh
git worktree add --detach /tmp/ruf-ministry-hub-before-calm-os 779a7f3
python3 -m http.server 8012 --directory /tmp/ruf-ministry-hub-before-calm-os/ruf-ministry-hub-deploy-working
```

Open `http://localhost:8012/ruf-ministry-hub.html` in a second disposable browser profile and capture the same routes and viewport sizes. Remove the disposable worktree when finished:

```sh
git worktree remove /tmp/ruf-ministry-hub-before-calm-os
```

Do not point either origin at real ministry data. Do not use browser storage-clearing instructions on a real app origin. These steps reproduce local views only; they do not verify real iPhone Safari, VoiceOver, installed-PWA updates, provider AI, or production behavior.

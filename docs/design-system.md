# Calm OS Design System

## Foundations

### Spacing

Use the 4, 8, 12, 16, 24, and 32px scale. Primary sections use 24–32px separation; related content uses 8–16px.

### Type

- Page title: responsive 1.7–2.45rem, concise and sentence case.
- Section title: approximately 1.05rem.
- Body: system UI stack, 1.45–1.55 line height.
- Metadata: 0.88rem, muted, never the only status cue.
- Eyebrow: short uppercase orientation label, used at most once per primary card.

### Color

- Paper `#f4f5f0`, surface `#fffefa`, ink `#17231f`, muted `#68756f`.
- Core accent green `#2f6c5e`; warning accent amber `#a76f18`.
- Danger and sensitivity colors are semantic exceptions, not decoration.
- Normal primary viewports use no more than two visible accent colors.

### Shape and depth

- Small radius 10px, standard 16px, highlighted card 22px.
- Borders are quiet and sparse. Only the highlighted card uses raised shadow.
- Fixed photo/initial geometry prevents image-driven layout shift.

## Components

### Buttons

- Minimum 44x44px; primary mobile actions target 48px or more.
- Primary: filled green, one per major screen/workflow.
- Secondary: quiet neutral border.
- Quiet: transparent, used for disclosure, cancellation, and contextual alternatives.
- Destructive: red semantic treatment and confirmation.
- Disabled: semantic `disabled`, visible opacity/contrast, no pointer interaction.

### Cards

- Highlighted primary card: at most one; 5 attention points.
- Secondary card: use only for one coherent group; 3 points.
- Flat list row: preferred for repeated items; avoid card-within-card grids.
- Repeating card maximum: 7 attention points.

### Capture composer

- One labelled textarea that starts at one line and expands on focus.
- No category, urgency, or record-type controls before processing.
- One Process action; optional dictation and quiet Save for later.
- Person context is visible and locked by default on profiles; Change person is disclosed.

### Disclosure

- Native `details`/`summary` where appropriate.
- Summary target is at least 48px and describes the hidden content.
- Empty historical sections do not render.
- Profile previews show three records, followed by View all when needed.

### Status, loading, and errors

- Announce nonblocking completion through a polite live status.
- Blocking errors appear inline near the field and are announced.
- Processing is explicit, disables repeated submission, and leaves a recoverable capture.
- Offline/failure copy distinguishes raw unprocessed capture from saved structured records.
- Empty states are plain and grounded; never fabricate ministry guidance.

## Accessibility

- Semantic landmarks and labelled navigation.
- Current navigation uses `aria-current="page"`.
- Selected controls expose `aria-pressed`/`aria-selected`.
- High-contrast 3px focus-visible ring with offset.
- Reduced-motion media query removes nonessential transitions.
- Status does not rely on color alone.
- Images have useful alt text; initials are equivalent recognition content.
- Safe-area padding protects primary navigation and actions.

## Budgets

- Initial 390px viewport: 18 attention points.
- Full undrilled primary screen: 30.
- Repeating list card: 7.
- One primary CTA, three primary visual sections, two accent colors.
- A compact critical alert costs 2 points and must displace lower-value content when the initial viewport would exceed budget.

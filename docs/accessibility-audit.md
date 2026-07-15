# Calm OS Accessibility Audit

Audit date: 2026-07-15

## Observed strengths

- A main content landmark, desktop navigation element, headings, explicit form labels, dialog labels, safe-area padding, sensitive-preview masking, and fixed profile-photo geometry already exist.
- Sampled foreground/background token pairs meet normal-text contrast, ranging from approximately 4.53:1 to 9.40:1.

## Defects and required corrections

| Area | Baseline defect | Calm OS requirement |
| --- | --- | --- |
| Mobile navigation | A `div`; active item lacks `aria-current`. | Semantic `nav` with label and current-page state. |
| Selected states | Chips/tabs rely on class and color. | `aria-pressed` or `aria-selected` plus text/non-color state. |
| Announcements | Toast disappears after 1.8 seconds and has no live role. | Persistent-enough `role="status"`/`aria-live`; inline error text for blocking errors. |
| Dialog focus | First field is focused, but no trap, Escape close, inert background, or restoration. | Focus trap, Escape where safe, background isolation, return focus to opener. |
| Touch targets | Buttons, chips, tabs, and switches can be 30–42px. | Minimum 44x44px; primary mobile actions 48px. |
| Keyboard focus | No shared `:focus-visible` treatment. | High-contrast, non-color-dependent focus ring on every control/card action. |
| Motion | No reduced-motion contract. | Remove nonessential transitions/scroll animation under `prefers-reduced-motion`. |
| Large text | Seven nowrap mobile tabs may crowd/clip. | Five primary items, wrapping-safe labels, no horizontal page overflow. |
| Navigation focus | New screen heading is not focused. | Move focus to the page heading after intentional navigation without disrupting typing. |
| Errors | Transient toasts carry validation. | Associate inline errors with fields and announce them. |
| Group labels | Checkbox groups lack fieldset/legend. | Semantic grouping where controls remain. |
| Whole-card open | Planned card risks nested interactive controls. | One semantic link/button for the card; administration elsewhere. |
| Search focus | Full rerender per key can drop focus. | Preserve value, selection, and focus or debounce without hiding results. |
| Disabled state | No shared treatment. | Visual and semantic disabled style with sufficient contrast. |

## Required evidence

Automated checks must cover landmarks, labels, target-size CSS, focus styles, reduced motion, non-color status, and no 390px/430px horizontal overflow. Real VoiceOver, Dynamic Type, landscape, keyboard-only browser behavior, and one-handed iPhone use remain `NOT VERIFIED` until named manual evidence exists.

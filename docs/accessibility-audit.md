# Calm OS Accessibility Audit

Audit date: 2026-07-15

## Outcome

The Phase 11 source and synthetic audit found no unresolved high-severity accessibility defect. Calm OS now has named primary navigation, one main landmark with a skip link, explicit page-heading focus after intentional navigation, labeled controls, semantic filter/checkbox groups, non-color selected states, assertive field-error announcements, a shared focus indicator, 44px minimum repeated targets, reduced-motion and forced-color handling, and iPhone safe-area rules.

Real VoiceOver, Dynamic Type, keyboard, landscape, and one-handed iPhone evidence remains `NOT VERIFIED` until the manual matrix below is executed on named devices. Automated source checks are not represented as device evidence.

## Findings and disposition

| Area | Baseline defect | Phase 11 disposition | Evidence |
| --- | --- | --- | --- |
| Landmarks | Mobile navigation lacked semantics and active state. | Both navigation surfaces are named `nav` landmarks; active destinations use `aria-current`; a skip link targets the focusable `main`. | Calm OS accessibility regression and existing navigation regression. |
| Dialog focus | Sheets had initial-field focus but no containment, Escape behavior, background isolation, or opener restoration. | One shared sheet binding traps Tab/Shift+Tab, handles Escape, marks background regions inert/hidden, focuses field-or-close on open, and restores a stable action descriptor on close. | Modal static assertions; browser/manual behavior remains required. |
| Labels | Sheet labels were siblings without `for`; settings relied on layout/title. | `sheetField` derives explicit `for`; settings controls use visible label and description IDs; display-only headings no longer misuse `label`. | Label association and stray-label regression. |
| Control groups | Checkbox and filter groups relied on visual grouping. | Donor categories and approval sets use `fieldset`/`legend`; Prayer and Suggested update filters use named groups and `aria-pressed`. | Group-semantics regression. |
| Navigation focus | Whole-app rerenders lost context. | Intentional route changes focus the new H1; People and global Search preserve field focus and caret without moving focus during ordinary typing/filtering. | Static and maintained search regressions. |
| Errors | Blocking validation used a short polite toast. | `reportFieldError` applies `aria-invalid`, focuses the field, and announces through an assertive alert; rendered danger notices receive alert semantics. Errors persist five seconds and newer messages cancel older dismissal timers. | Error/focus/live-region regression; screen-reader cadence remains manual. |
| Touch targets | Switches and small mobile buttons could be 30–42px. | Switches and small mobile buttons are at least 44px; primary mobile navigation remains 48px. | CSS target-size regression. |
| Contrast/focus | Focus orange did not reliably meet a 3:1 adjacent-color threshold; muted text was marginal on paper. | Focus is `#b56d00` (3.72:1 on paper); muted text is `#63706a` (4.72:1 on paper). A shared three-pixel outline and switch focus-within treatment do not rely on color fill alone. | Calculated WCAG contrast regression. |
| Motion/status | Reduced motion existed, but forced-colors and some selected states were incomplete. | Reduced-motion contract retained; forced-colors rules preserve boundaries/selection; filters expose state programmatically. | Accessibility regression. |
| Safe areas/large text | Horizontal safe areas and landscape/Dynamic Type behavior were incomplete. | Content, sheets, and mobile navigation include all safe-area edges; sheets use `dvh`; nav labels wrap; landscape reduces nav height without dropping below 44px. | Static regression; device layout remains manual. |
| Images | Repeated recognition images risked layout shift or duplicate announcements. | People photos keep fixed dimensions and empty alt beside a visible name; initials remain text; profile photos retain person-context labeling. | Existing People/profile regressions. |

## Automated evidence

- `node tests/calm-os-accessibility-regression.js`: passed all landmarks, modal, labeling, grouping, error, target, contrast, motion, safe-area, and large-text source contracts.
- `node tests/regression-harness.js`: passed semantic navigation, current-page state, whole-card keyboard focus, search-caret recovery, hidden metadata, and all existing Calm OS product behavior.
- `node tests/calm-os-recovery-regression.js`: passed fail-closed startup and interrupted-input recovery checks that protect assistive-technology users from unexpected content replacement.
- `node check-app-syntax.mjs` and `git diff --check`: exited 0 at the focused checkpoint.

## Manual evidence still required

- VoiceOver on a real iPhone at 390px and 430px-class widths: navigation order, modal announcement, focus containment, error announcement, photo naming, and return focus.
- iOS Dynamic Type at 200% or the largest usable accessibility size: no clipped navigation labels, unreachable sheet action, or horizontal page scrolling.
- Safari keyboard-only: skip link, every primary action, disclosure, filter, People card, and modal Escape/Tab loop.
- Portrait and landscape with a notched device: safe-area clearance and one-handed reach.
- Windows forced-colors browser: visible focus, borders, selected filter state, and disabled controls.

Until those runs are recorded, the corresponding rows in the final report must say `NOT VERIFIED`, not pass.

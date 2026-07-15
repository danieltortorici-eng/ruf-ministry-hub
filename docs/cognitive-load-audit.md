# Calm OS Cognitive-Load Audit

Audit date: 2026-07-15

## Measured baseline

Synthetic `demoData()` was rendered through the maintained VM harness with default settings.

| Screen | Before-state count | Approximate attention score |
| --- | --- | ---: |
| Today | 8 visual groups, 2 focus heroes, 44 buttons, 12 primary buttons, 10 pills, 6 cards, 6 Created lines | 125 |
| People | 16 buttons, 5 primary buttons, 4 cards, 16 bordered stats, 4 timestamp lines | 94 |
| Profile | Header plus 7 sections, 27 buttons, 2 primary buttons, 10 pills, 4 top stats, 5 timestamp lines | 84 |
| Capture | 3 sections, up to 71 buttons with demo history, 5 primary buttons, 9 pills | Not scored; exceeds screen budget |
| Manual processing | 23 controls plus 5 buttons | Not scored; exceeds workflow budget |
| Settings | 16 sections, 52 controls, 31 buttons, 13 primary buttons | Administration-only exception still excessive |

Scores use the approved model: highlighted primary card 5, secondary card 3, primary CTA 2, secondary action 1, badge/pill 1, warning 2, competing section 3. They are comparative interface measures, not clinical measures.

## Calm OS attention-budget standard

- Maximum 18 points in the initial 390px viewport.
- Maximum 30 points across an undrilled primary screen.
- Maximum 7 points for one repeating list card.
- One primary CTA and no more than three primary visual sections.
- At most two visible accent colors; warnings may temporarily replace the secondary accent.
- One compact critical alert may add 2 points only when a lower-value element is hidden or deferred.
- A new feature that exceeds a budget must remove equal or greater visual weight from the same screen.

## Primary load failures to remove

1. Duplicate recommendations force the user to decide which “next” is authoritative.
2. Visible classification before capture adds decisions before the thought is safely stored.
3. Equal-weight profile actions make pastoral context compete with database maintenance.
4. Repeated timestamps, pills, borders, and stat boxes multiply reading without changing the decision.
5. History grows without preview limits, making profiles slower and longer as trust/history increase.
6. Desktop and mobile navigation expose secondary tools as primary destinations.
7. Whole-app rerenders during search and input threaten interruption recovery and focus.

## Target measurements

- Today: exactly three normal sections; one highlighted recommendation; two After that items maximum.
- Capture: one text input, one primary Process action, optional dictation, quiet Save for later where contextual.
- People card: one card/open action, image or initials, one identity line, one care label, one contextual follow-up line.
- Profile first viewport: identity, care timing, Right Now, unified capture, and two quiet contextual actions; details and history disclosed below.

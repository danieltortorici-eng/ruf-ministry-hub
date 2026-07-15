# Calm OS Product Constitution

Calm OS is the private, local-first operating layer for RUF Ministry Hub. Its success condition is simple: the user opens the app, understands the next faithful action within seconds, completes it, and returns to ministry.

## Non-negotiable product rules

1. **Calm before completeness.** Remove, merge, automate, relocate, or hide low-value interface before adding another visible element.
2. **Ministry first, database second.** People, care, conversation, prayer, and action precede fields, categories, counts, and administration.
3. **One question per screen.** Today asks what is next; Capture asks what to remember; People asks whom to find or care for; a profile asks what matters now; Prayer asks whom or what to pray for; More contains secondary tools.
4. **One primary action.** Every major screen and workflow has one visually dominant action. Alternatives are quiet, contextual, disclosed, or removed.
5. **Progressive disclosure.** Essential present-care context appears first. Details, history, settings, and administration remain available without competing for initial attention.
6. **Grounded assistance only.** Recommendations, Right Now, Brief Me, Follow Up, and AI proposals must be traceable to saved information. Calm OS never invents, diagnoses, spiritually scores, or ranks a person's worth.
7. **Capture before classification.** Messy input enters one recoverable pipeline. Classification happens after capture, not as an upfront burden.
8. **Human approval before permanent AI writes.** AI may propose; the user independently selects, edits, rejects, changes person, marks sensitive, and gives final approval. Retry is idempotent.
9. **Local-first privacy and compatibility.** Preserve localStorage, IndexedDB, encryption, offline access, backup round trips, unknown legacy fields, and dormant preferred-contact values. External context is minimal, explicit, and reversible.
10. **Interruption is normal.** Drafts, proposal edits, processing state, and update boundaries recover safely across refresh, suspension, offline failure, repeated taps, and retry.
11. **Accessibility is product behavior.** Semantic structure, labels, focus, touch targets, contrast, reduced motion, safe areas, scalable text, and non-color status cues are release gates.
12. **Optimize for leaving.** The target sequence is open → understand → act → leave, not engagement time.

## Attention and visual-weight budgets

- Highlighted primary card: 5 points.
- Secondary card or competing visual section: 3 points.
- Primary CTA or warning: 2 points.
- Secondary action, badge, or pill: 1 point.
- Initial 390px viewport budget: 18 points.
- Full undrilled primary-screen budget: 30 points.
- Repeating list item budget: 7 points.
- Default visual limit: one primary CTA, three primary sections, two visible accent colors, minimal borders/pills, and no equal-weight action cluster.

A proposed feature that exceeds a budget must first remove, merge, relocate, or simplify something of equal or greater weight.

## Release boundary

No production deployment, merge, Worker binding, secret change, external send, or irreversible data migration follows from this constitution. Those actions require their own explicit authorization. Automated evidence must remain distinct from real-browser, real-iPhone, provider, and production evidence.

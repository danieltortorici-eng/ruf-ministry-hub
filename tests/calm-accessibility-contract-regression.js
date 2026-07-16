const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");
const html = fs.readFileSync(appPath, "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return startIndex === -1 || endIndex === -1 ? "" : source.slice(startIndex, endIndex);
}

function minimumHeight(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  return Number(match?.[1].match(/min-height:\s*(\d+)px/)?.[1] || 0);
}

function audit(source) {
  const failures = [];
  const failUnless = (condition, code) => { if (!condition) failures.push(code); };
  const captureComposer = sourceBetween(source, "function renderCaptureComposer", "function renderCaptureWaitingRow");
  const navigation = sourceBetween(source, 'if (action === "nav") {', 'if (action === "ai-review-filter")');
  const headingFocus = sourceBetween(source, "function requestPageHeadingFocus", "function captureFocusedControl");

  failUnless(
    captureComposer.includes('<label class="visually-hidden" for="${targetId}">')
      && captureComposer.includes('<textarea class="textarea" id="${targetId}"'),
    "capture-label-association"
  );
  failUnless(
    source.includes('const controlId = String(control).match(/\\bid="([^\"]+)"/)?.[1] || "";')
      && source.includes('for="${escapeHtml(controlId)}"'),
    "generated-label-association"
  );
  failUnless(
    navigation.includes("requestPageHeadingFocus();")
      && headingFocus.includes('document.querySelector("#main-content h1")')
      && headingFocus.includes('heading.setAttribute("tabindex", "-1")'),
    "navigation-heading-focus"
  );
  failUnless(
    source.includes(":where(button, [role=\"button\"], a, input, select, textarea, summary):focus-visible")
      && source.includes("restoreSheetReturnFocus();")
      && source.includes('event.key !== "Tab"'),
    "focus-visible-and-modal-return"
  );
  for (const selector of [".button", ".button.small", ".tab", ".mobile-nav button", ".input"]) {
    failUnless(minimumHeight(source, selector) >= 44, `touch-target-${selector}`);
  }
  const reducedMotion = sourceBetween(source, "@media (prefers-reduced-motion: reduce)", "@media (max-width: 980px)");
  failUnless(
    reducedMotion.includes("transition-duration: 0.01ms !important")
      && reducedMotion.includes("animation-duration: 0.01ms !important")
      && reducedMotion.includes("animation-iteration-count: 1 !important"),
    "reduced-motion"
  );
  failUnless(
    source.includes('aria-current="page"')
      && source.includes('aria-pressed="${view.prayerFilter === filter}"')
      && source.includes('${escapeHtml(prayer.status)}</span>')
      && source.includes('${escapeHtml(task.status)}</span>')
      && source.includes('role="status" aria-live="polite" aria-atomic="true"'),
    "status-not-color-only"
  );
  failUnless(
    source.includes("@media (forced-colors: active)")
      && source.includes("background: Highlight")
      && source.includes("color: HighlightText"),
    "forced-colors"
  );
  return failures;
}

function expectMutationFailure(label, mutated, expectedCode) {
  const failures = audit(mutated);
  assert.ok(failures.includes(expectedCode), `${label} must fail ${expectedCode}; found ${failures.join(", ") || "none"}`);
  console.log(`PASS mutation guard rejects ${label}`);
}

function mutateSection(source, start, end, mutate) {
  const section = sourceBetween(source, start, end);
  assert.ok(section, `mutation section must exist: ${start}`);
  return source.replace(section, mutate(section));
}

assert.deepEqual(audit(html), [], "current Calm accessibility contract must pass");
console.log("PASS current Calm accessibility source satisfies the unique contract audit");

expectMutationFailure(
  "an unassociated capture label",
  html.replace('<label class="visually-hidden" for="${targetId}">', '<label class="visually-hidden">'),
  "capture-label-association"
);
expectMutationFailure(
  "navigation that does not request heading focus",
  mutateSection(
    html,
    'if (action === "nav") {',
    'if (action === "ai-review-filter")',
    section => section.replace("requestPageHeadingFocus();", "")
  ),
  "navigation-heading-focus"
);
expectMutationFailure(
  "a 40px primary button target",
  html.replace(".button {\n      min-height: 44px;", ".button {\n      min-height: 40px;"),
  "touch-target-.button"
);
expectMutationFailure(
  "removed reduced-motion handling",
  html.replace("@media (prefers-reduced-motion: reduce)", "@media (prefers-reduced-motion: no-preference)"),
  "reduced-motion"
);
expectMutationFailure(
  "a prayer status conveyed only by pill color",
  html.replace('${escapeHtml(prayer.status)}</span>', "</span>"),
  "status-not-color-only"
);

console.log("All Calm accessibility mutation-contract checks passed.");

const fs = require("fs");
const path = require("path");

const appPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");
const html = fs.readFileSync(appPath, "utf8");

let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${message}`);
}

function relativeLuminance(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

check(html.includes('<a class="skip-link" href="#main-content">Skip to main content</a>'), "keyboard users can skip repeated navigation");
check(html.includes('<main class="content" id="main-content" tabindex="-1">'), "the skip target is a focusable main landmark");
check(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="default">'), "installed iPhone mode reserves the status area instead of overlaying focused content");
check(/\.skip-link\s*\{[\s\S]*?top:\s*calc\(8px \+ env\(safe-area-inset-top\)\)/.test(html), "the focused skip link retains top safe-area clearance");
check(html.includes('<nav class="mobile-nav" aria-label="Primary">') && html.includes('<nav class="nav" aria-label="Primary">'), "both primary navigation surfaces are named landmarks");
check(html.includes('aria-current="page"'), "the current primary destination is announced");
check(html.includes("requestPageHeadingFocus();") && html.includes('document.querySelector("#main-content h1")'), "intentional navigation moves focus to the new heading");
check(html.includes("restoredSearch.setSelectionRange(caret, caret)"), "rerendered search preserves the typing caret");

const sheetTags = html.match(/<section class="sheet-panel"[^>]*>/g) || [];
check(sheetTags.length >= 10, "the maintained modal-sheet set is present for focus auditing");
check(sheetTags.every(tag => /role="dialog"/.test(tag) && /aria-modal="true"/.test(tag) && /aria-labelledby="[^"]+"/.test(tag) && /data-sheet-panel/.test(tag)), "every modal sheet has dialog semantics and an accessible name");
check(html.includes('event.key === "Escape"') && html.includes('event.key !== "Tab"'), "modal sheets support Escape and a Tab focus loop");
check(html.includes("region.inert = true") && html.includes('region.setAttribute("aria-hidden", "true")'), "modal sheets isolate the background from assistive technology");
check(html.includes("restoreSheetReturnFocus();") && html.includes("sheetReturnFocusDescriptor"), "closing a sheet restores focus to its invoking control");

check(html.includes('const controlId = String(control).match(/\\bid="([^\"]+)"/)?.[1] || "";') && html.includes('for="${escapeHtml(controlId)}"'), "sheet field labels are explicitly associated with controls");
check(html.includes('aria-labelledby="${fieldId}-label" aria-describedby="${fieldId}-description"'), "setting switches have visible names and descriptions");
check(html.includes('for="${fieldId}"') && html.includes('aria-describedby="${fieldId}-description"'), "setting selects have explicit labels and descriptions");
check(!/<label(?![^>]*(?:for=|class="(?:check|switch)))/.test(html), "label elements are used only for associated or wrapping form controls");
check(html.includes('role="group" aria-label="Prayer filters"') && html.includes('role="group" aria-label="Suggested update filters"'), "filter control groups have accessible names");
check((html.match(/aria-pressed="\$\{/g) || []).length >= 3, "selected filter and draft states are exposed without relying on color");
check(html.includes('<fieldset class="field-group">') && html.includes("<legend>Final approval</legend>") && html.includes("<legend>Source categories</legend>"), "related checkbox sets use fieldset and legend semantics");

check(html.includes('role="status" aria-live="polite" aria-atomic="true"'), "status changes use a polite live region");
check(html.includes('toast.setAttribute?.("role", isError ? "alert" : "status")'), "validation failures switch to assertive alert semantics");
check(html.includes('field.setAttribute?.("aria-invalid", "true")') && html.includes("reportFieldError"), "blocking field errors mark and focus the invalid control");
check(html.includes('document.querySelectorAll(".notice.danger")') && html.includes('notice.setAttribute("role", "alert")'), "rendered blocking notices are announced");

check(/\.switch\s*\{[\s\S]*?min-height:\s*44px/.test(html), "switch targets meet the 44px touch minimum");
check(/\.button\.small\s*\{[\s\S]*?min-height:\s*44px/.test(html), "small mobile buttons meet the 44px touch minimum");
check(/\.mobile-nav button\s*\{[\s\S]*?min-height:\s*48px/.test(html), "primary mobile navigation exceeds the touch minimum");
check(html.includes(":focus-visible") && html.includes("outline: 3px solid #b56d00"), "interactive controls share a visible high-contrast focus ring");
check(contrastRatio("#b56d00", "#f4f5f0") >= 3, "focus-ring contrast is at least 3:1 against the page background");
check(contrastRatio("#63706a", "#f4f5f0") >= 4.5, "muted normal text retains at least 4.5:1 contrast on the page background");

check(html.includes("@media (prefers-reduced-motion: reduce)"), "reduced-motion preferences suppress nonessential animation");
check(html.includes("@media (forced-colors: active)"), "Windows forced-colors mode keeps control boundaries and selected states");
check(html.includes("max-height: min(88dvh, 760px)"), "sheets use the dynamic viewport and remain scrollable");
check(html.includes("env(safe-area-inset-left)") && html.includes("env(safe-area-inset-right)"), "content, sheets, and mobile navigation respect horizontal safe areas");
check(/\.mobile-nav button\s*\{[\s\S]*?white-space:\s*normal/.test(html), "mobile navigation labels can wrap under larger text");
check(html.includes("grid-template-columns: minmax(96px, max-content) minmax(0, 1fr)"), "Right Now labels keep a readable column at large text sizes");

if (failed) {
  console.error(`${failed} Calm OS accessibility regression check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("All Calm OS accessibility regression checks passed.");

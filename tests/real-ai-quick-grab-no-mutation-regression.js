const fs = require("fs");
const path = require("path");

const appPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function run() {
  const html = fs.readFileSync(appPath, "utf8");
  const start = html.indexOf("function refreshFictionalPilotAvailability()");
  const end = html.indexOf("function renderReviewQueue()", start);
  assert(start > 0 && end > start, "fictional pilot UI boundary is present");
  const pilot = html.slice(start, end);
  ["saveData(", "recordUndo(", "captureAutoMemorySnapshot(", "localStorage", "indexedDB", "db.", "aiProposals", "quickGrabs.push", "people.push", "tasks.push", "notes.push", "prayerRequests.push", "meetingNotes.push"].forEach(forbidden => {
    assert(!pilot.includes(forbidden), `fictional pilot boundary excludes ${forbidden}`);
  });
  assert(!/<textarea|type=["']file["']|contenteditable/i.test(pilot), "fictional pilot has no free-form or import input");
  assert(pilot.includes("FICTIONAL_QUICK_GRAB_PILOT_FIXTURES"), "fictional pilot reads only its checked-in fixture list");
  assert(pilot.includes("view.fictionalPilotProposal") && pilot.includes("not saved"), "fictional pilot holds and labels its proposal as transient");
  assert(pilot.includes('render({ mutationEffects: false })'), "fictional pilot renders without mutation side effects");
  assert(
    pilot.includes('fetch("/api/ai/health"')
      && pilot.includes('typeof fetch !== "function"')
      && pilot.includes('credentials: "same-origin"')
      && pilot.includes('cache: "no-store"')
      && pilot.includes('availableOnThisHost === true')
      && pilot.includes("view.fictionalPilotAvailabilityChecked"),
    "fictional pilot performs one lazy host check, fails closed without fetch, and trusts only an explicit same-origin no-store report"
  );
  const renderScreen = html.slice(html.indexOf("function renderScreen()"), html.indexOf("function todayCareWindowDays("));
  assert(
    renderScreen.includes('return view.fictionalPilotAvailableOnThisHost ? renderFictionalQuickGrabPilot() : renderMore();'),
    "fictional pilot screen fails closed when host availability is absent"
  );
  const renderMore = html.slice(html.indexOf("function renderMore()"), html.indexOf("function renderAdvancedSettings()"));
  assert(
    /\$\{view\.fictionalPilotAvailableOnThisHost \? `<button class="more-link"[^>]+data-screen="fictionalPilot"/.test(renderMore),
    "fictional pilot entry is rendered only for an explicitly available host"
  );
  assert(
    html.includes('requestedScreen === "fictionalPilot" && !view.fictionalPilotAvailableOnThisHost'),
    "fictional pilot navigation rejects unavailable hosts"
  );
  assert(
    pilot.includes("function scheduleFictionalPilotGrantExpiry()")
      && pilot.includes("fictionalPilotGrantExpiryTimer = window.setTimeout")
      && pilot.includes("window.clearTimeout(fictionalPilotGrantExpiryTimer)")
      && pilot.includes("The two-minute approval expired. Approve this fictional fixture again to continue."),
    "fictional pilot clears expired grant state and gives visible retry feedback"
  );
  console.log("All fictional Quick Grab no-mutation regression checks passed.");
}

run();

const fs = require("fs");
const path = require("path");

const appPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function run() {
  const html = fs.readFileSync(appPath, "utf8");
  const start = html.indexOf("function fictionalPilotFixture()");
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
  console.log("All fictional Quick Grab no-mutation regression checks passed.");
}

run();

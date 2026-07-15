const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const appDir = process.env.RUF_HUB_APP_DIR || path.resolve(__dirname, "../ruf-ministry-hub-deploy-working");
const html = fs.readFileSync(path.resolve(appDir, "ruf-ministry-hub.html"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (!scriptMatch) throw new Error("Could not find app script in ruf-ministry-hub.html");

const storage = Object.create(null);
const elements = Object.create(null);

function makeElement(idOrTag) {
  const key = String(idOrTag || "element");
  if (elements[key]) return elements[key];
  const el = {
    id: key,
    tagName: "INPUT",
    value: "",
    textContent: "",
    files: [],
    dataset: {},
    style: {},
    children: [],
    checked: false,
    type: "text",
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    addEventListener() {},
    focus() {},
    setSelectionRange() {},
    click() {},
    get innerHTML() {
      return this._innerHTML || "";
    },
    set innerHTML(value) {
      this._innerHTML = String(value || "");
    }
  };
  elements[key] = el;
  return el;
}

const location = {
  protocol: "https:",
  hostname: "example.test",
  href: "https://example.test/ruf-ministry-hub.html",
  pathname: "/ruf-ministry-hub.html",
  search: "",
  hash: ""
};

const sandbox = {
  console,
  URLSearchParams,
  Blob,
  TextEncoder,
  TextDecoder,
  btoa(value) {
    return Buffer.from(String(value), "binary").toString("base64");
  },
  atob(value) {
    return Buffer.from(String(value), "base64").toString("binary");
  },
  crypto: nodeCrypto.webcrypto,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    },
    removeItem(key) {
      delete storage[key];
    }
  },
  navigator: {
    serviceWorker: null,
    clipboard: {
      writeText(value) {
        sandbox.__copiedText = String(value || "");
        return Promise.resolve();
      }
    }
  },
  document: {
    body: makeElement("body"),
    activeElement: null,
    getElementById: makeElement,
    createElement(tag) {
      return makeElement(`created-${tag}-${Math.random().toString(36).slice(2)}`);
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  },
  indexedDB: undefined,
  Notification: undefined,
  FileReader: function FileReader() {},
  Image: function Image() {},
  URL: {
    createObjectURL() {
      return "blob:profile-regression";
    },
    revokeObjectURL() {}
  }
};

sandbox.window = {
  location,
  navigator: sandbox.navigator,
  URL: sandbox.URL,
  history: {
    replaceState() {}
  },
  addEventListener() {},
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) {
    callback();
  },
  matchMedia() {
    return { matches: false };
  },
  confirm() {
    return true;
  },
  prompt() {
    return null;
  }
};

sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox, { filename: "ruf-ministry-hub.html" });

function appEval(code) {
  return vm.runInContext(code, sandbox);
}

function db() {
  return appEval("db");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function setPrompts(values) {
  let index = 0;
  sandbox.window.prompt = () => {
    const value = values[index];
    index += 1;
    return value ?? null;
  };
}

function resetApp() {
  Object.keys(elements).forEach(key => delete elements[key]);
  makeElement("app");
  makeElement("toast");
  appEval(`
    settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      enableAutoSave: false,
      enableUndo: true,
      appCoachEnabled: false,
      appCoachShowOnToday: false,
      backupReminderDays: "0",
      localEncryptionEnabled: false
    });
    customCopy = {};
    db = emptyData();
    const person = createPerson("Profile Test", "555-1111");
    person.email = "profile@example.com";
    person.rufInvolvement = "Bible study";
    person.nextFollowUpDate = daysFromNow(2);
    person.followUpReason = "Initial follow-up";
    view = {
      screen: "person",
      personId: person.id,
      quickGrabId: null,
      processPreset: [],
      prayerFilter: "Active",
      search: "",
      quickGrabDraftText: "",
      globalSearch: "",
      focusMode: settings.calmMode,
      locked: false,
      encryptionLocked: false,
      reviewIndex: 0,
      expandedQuickGrabIds: [],
      expandedPrayerIds: [],
      sheet: null
    };
    undoStack = [];
  `);
}

function run() {
  resetApp();
  const personId = db().people[0].id;

  const profileHtml = appEval("renderPersonProfile()");
  assert(profileHtml.includes("Phone number") && profileHtml.includes("555-1111"), "profile renders phone number");
  assert(profileHtml.includes("Right Now") && profileHtml.includes("Brief Me") && profileHtml.includes("Follow Up"), "profile renders present-care actions");
  assert(!profileHtml.includes("Quick Actions"), "profile removes the parallel direct-create action cluster");
  assert(profileHtml.includes("Profile Details") && !profileHtml.includes("Preferred contact"), "profile keeps administration collapsed without dormant contact preference");

  setPrompts(["555-2222"]);
  appEval(`editPersonField("${personId}", "phone", "Phone number")`);
  assert(db().people[0].phone === "555-2222", "editing phone updates person profile");

  appEval(`openEditFieldSheet("person", "${personId}", "phone", "Phone number")`);
  assert(appEval("view.sheet && view.sheet.type") === "edit-field", "profile edit sheet opens");
  makeElement("sheet-edit-value").value = "555-3333";
  appEval("submitEditFieldSheet()");
  assert(db().people[0].phone === "555-3333", "profile edit sheet updates person profile");
  assert(appEval("view.sheet") === null, "profile edit sheet closes after save");

  setPrompts(["Remember that Profile Test prefers Tuesday mornings."]);
  appEval(`quickAddNote("${personId}")`);
  assert(db().notes.length === 1 && db().notes[0].relatedPersonId === personId, "quick add note creates linked note");

  const firstNoteId = db().notes[0].id;
  appEval(`openEditFieldSheet("record", "${firstNoteId}", "content", "Note", "notes")`);
  makeElement("sheet-edit-value").value = "Edited note through sheet";
  appEval("submitEditFieldSheet()");
  assert(db().notes[0].content === "Edited note through sheet", "record edit sheet updates note");

  setPrompts(["Talked about Bible study and exams."]);
  appEval(`quickAddMeeting("${personId}")`);
  assert(db().meetingNotes.length === 1 && db().meetingNotes[0].relatedPersonId === personId, "quick add meeting creates linked meeting note");

  setPrompts(["Pray for wisdom this week."]);
  appEval(`quickAddPrayer("${personId}")`);
  assert(db().prayerRequests.length === 1 && db().prayerRequests[0].relatedPersonId === personId, "quick add prayer creates linked prayer request");

  setPrompts(["Text after exam", "2026-07-05"]);
  appEval(`quickAddFollowUp("${personId}")`);
  assert(db().tasks.length === 1 && db().tasks[0].dueDate === "2026-07-05", "quick add follow-up creates dated task");
  assert(db().people[0].nextFollowUpDate === "2026-07-05", "follow-up task updates profile next follow-up");

  appEval(`markFollowedUp("${personId}")`);
  assert(db().people[0].lastMeaningfulInteraction === appEval("todayISO()"), "mark followed up records today");
  assert(db().people[0].nextFollowUpDate === "", "mark followed up clears profile follow-up");

  appEval(`copyTextDraft("${personId}")`);
  assert(sandbox.__copiedText.includes("Hey Profile,"), "copy text draft uses first name");

  appEval(`openProfileActionSheet("note", "${personId}")`);
  assert(appEval("view.sheet && view.sheet.kind") === "note", "profile note sheet opens");
  makeElement("sheet-note-content").value = "Sheet-created note";
  makeElement("sheet-sensitive").checked = true;
  const noteCountBeforeSheet = db().notes.length;
  appEval(`submitProfileActionSheet("note", "${personId}")`);
  assert(db().notes.length === noteCountBeforeSheet + 1 && db().notes[0].sensitiveFlag === true, "profile note sheet saves linked note");
  assert(appEval("view.sheet") === null, "profile note sheet closes after save");

  appEval(`openProfileActionSheet("meeting", "${personId}")`);
  makeElement("sheet-meeting-summary").value = "Sheet meeting summary";
  makeElement("sheet-meeting-remember").value = "Remember this from the sheet";
  makeElement("sheet-meeting-date").value = "2026-07-06";
  makeElement("sheet-meeting-type").value = "Pastoral";
  makeElement("sheet-sensitive").checked = true;
  const meetingCountBeforeSheet = db().meetingNotes.length;
  appEval(`submitProfileActionSheet("meeting", "${personId}")`);
  assert(db().meetingNotes.length === meetingCountBeforeSheet + 1 && db().meetingNotes[0].meetingType === "Pastoral", "profile meeting sheet saves linked meeting");
  assert(db().people[0].lastMeaningfulInteraction === "2026-07-06", "profile meeting sheet updates last interaction");

  appEval(`openProfileActionSheet("prayer", "${personId}")`);
  makeElement("sheet-prayer-request").value = "Sheet prayer request";
  makeElement("sheet-prayer-follow-date").value = "2026-07-08";
  makeElement("sheet-prayer-shareable").value = "Private";
  makeElement("sheet-sensitive").checked = true;
  const prayerCountBeforeSheet = db().prayerRequests.length;
  appEval(`submitProfileActionSheet("prayer", "${personId}")`);
  assert(db().prayerRequests.length === prayerCountBeforeSheet + 1 && db().prayerRequests[0].status === "Follow-Up Needed", "profile prayer sheet saves follow-up prayer");
  assert(db().prayerRequests[0].sensitivityLevel === "Sensitive", "profile prayer sheet saves sensitivity");

  const prayerSheetId = db().prayerRequests[0].id;
  appEval(`openPrayerActionSheet("answered-note", "${prayerSheetId}")`);
  assert(appEval("view.sheet && view.sheet.type") === "prayer-action", "prayer action sheet opens");
  assert(appEval("view.sheet && view.sheet.kind") === "answered-note", "answered prayer note sheet opens");
  makeElement("sheet-prayer-answered-note").value = "Answered through action sheet";
  appEval(`submitPrayerActionSheet("answered-note", "${prayerSheetId}")`);
  assert(db().prayerRequests[0].answeredNote === "Answered through action sheet", "answered prayer note sheet saves note");
  assert(db().prayerRequests[0].status === "Answered" && db().prayerRequests[0].followUpDate === "", "answered prayer note sheet marks answered");

  appEval(`openPrayerActionSheet("follow-date", "${prayerSheetId}")`);
  makeElement("sheet-prayer-action-follow-date").value = "not-a-date";
  appEval(`submitPrayerActionSheet("follow-date", "${prayerSheetId}")`);
  assert(db().prayerRequests[0].followUpDate === "", "prayer follow-up sheet rejects invalid dates");
  assert(appEval("view.sheet && view.sheet.kind") === "follow-date", "prayer follow-up sheet stays open after invalid date");
  makeElement("sheet-prayer-action-follow-date").value = "2026-07-10";
  appEval(`submitPrayerActionSheet("follow-date", "${prayerSheetId}")`);
  assert(db().prayerRequests[0].status === "Follow-Up Needed" && db().prayerRequests[0].followUpDate === "2026-07-10", "prayer follow-up sheet saves valid date");

  appEval(`openPrayerActionSheet("task", "${prayerSheetId}")`);
  makeElement("sheet-prayer-task-title").value = "Check on answered prayer";
  makeElement("sheet-prayer-task-due").value = "2026-07-11";
  const taskCountBeforePrayerSheet = db().tasks.length;
  appEval(`submitPrayerActionSheet("task", "${prayerSheetId}")`);
  assert(db().tasks.length === taskCountBeforePrayerSheet + 1, "prayer task sheet creates task");
  assert(db().tasks[0].relatedPrayerRequestId === prayerSheetId && db().tasks[0].dueDate === "2026-07-11", "prayer task sheet links task to prayer");
  assert(db().prayerRequests[0].createdFollowUpTaskIds.includes(db().tasks[0].id), "prayer task sheet records created task on prayer");
  assert(db().people[0].nextFollowUpDate === "2026-07-11", "prayer task sheet updates profile follow-up");

  appEval(`openProfileActionSheet("followup", "${personId}")`);
  makeElement("sheet-followup-title").value = "Sheet follow-up task";
  makeElement("sheet-followup-due").value = "2026-07-09";
  makeElement("sheet-followup-status").value = "Waiting";
  const taskCountBeforeSheet = db().tasks.length;
  appEval(`submitProfileActionSheet("followup", "${personId}")`);
  assert(db().tasks.length === taskCountBeforeSheet + 1 && db().tasks[0].status === "Waiting", "profile follow-up sheet saves dated task");
  assert(db().people[0].nextFollowUpDate === "2026-07-09", "profile follow-up sheet updates next follow-up");

  appEval("openCreatePersonSheet()");
  assert(appEval("view.sheet && view.sheet.type") === "create-person", "create person sheet opens");
  const peopleBeforeDuplicate = db().people.length;
  makeElement("sheet-person-name").value = "Profile Test";
  makeElement("sheet-person-phone").value = "555-4444";
  makeElement("sheet-person-email").value = "duplicate@example.com";
  makeElement("sheet-person-type").value = "Student";
  makeElement("sheet-person-care").value = "Get to know";
  makeElement("sheet-person-contact").value = "Text";
  makeElement("sheet-person-involvement").value = "Visitor";
  makeElement("sheet-duplicate-confirm").checked = false;
  appEval("submitCreatePersonSheet()");
  assert(db().people.length === peopleBeforeDuplicate, "create person sheet blocks likely duplicate without confirmation");
  assert(appEval("view.sheet && view.sheet.type") === "create-person", "create person sheet stays open after duplicate warning");

  makeElement("sheet-person-name").value = "Jordan Rivera";
  makeElement("sheet-person-phone").value = "555-4444";
  makeElement("sheet-person-email").value = "jordan@example.com";
  makeElement("sheet-person-type").value = "Alumni";
  makeElement("sheet-person-care").value = "Low touch";
  makeElement("sheet-person-contact").value = "Email";
  makeElement("sheet-person-involvement").value = "Alumni donor";
  appEval("submitCreatePersonSheet()");
  assert(db().people.length === peopleBeforeDuplicate + 1, "create person sheet creates new person");
  assert(db().people.at(-1).email === "jordan@example.com" && db().people.at(-1).personType === "Alumni", "create person sheet saves details");
  assert(appEval("view.screen") === "person" && appEval("view.personId") === db().people.at(-1).id, "create person sheet opens new profile");

  console.log("All current person profile regression checks passed.");
}

run();

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
let promptCalls = 0;
let networkCalls = 0;

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
    focus() {
      sandbox.__focusedElementId = this.id;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
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
  fetch() {
    networkCalls += 1;
    return Promise.reject(new Error("network is unavailable in this synthetic test"));
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
    promptCalls += 1;
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
      prayerFilter: "Active",
      search: "",
      quickGrabDraftText: "",
      globalSearch: "",
      focusMode: true,
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

async function run() {
  resetApp();
  const personId = db().people[0].id;

  const profileHtml = appEval("renderPersonProfile()");
  assert(profileHtml.includes("Phone number") && profileHtml.includes("555-1111"), "profile renders phone number");
  assert(profileHtml.includes("Right Now") && profileHtml.includes("Brief Me") && profileHtml.includes("Follow Up"), "profile renders present-care actions");
  assert(!profileHtml.includes("Quick Actions"), "profile removes the parallel direct-create action cluster");
  assert(profileHtml.includes("Profile Details") && !profileHtml.includes("Preferred contact"), "profile keeps administration collapsed without dormant contact preference");

  appEval(`openEditFieldSheet("person", "${personId}", "phone", "Phone number")`);
  assert(appEval("view.sheet && view.sheet.type") === "edit-field", "profile edit sheet opens");
  makeElement("sheet-edit-value").value = "555-3333";
  appEval("submitEditFieldSheet()");
  assert(db().people[0].phone === "555-3333", "profile edit sheet updates person profile");
  assert(appEval("view.sheet") === null, "profile edit sheet closes after save");

  const createdRecords = appEval(`(() => {
    const note = createProfileNoteRecord("${personId}", { content: "Remember that Profile Test prefers Tuesday mornings." });
    const meeting = createProfileMeetingRecord("${personId}", {
      summary: "Talked about Bible study and exams.",
      whatToRemember: "Remember this grounded detail",
      meetingDate: "2026-07-06",
      meetingType: "Pastoral",
      sensitiveFlag: true
    });
    const prayer = createProfilePrayerRecord("${personId}", {
      request: "Pray for wisdom this week.",
      followUpDate: "2026-07-08",
      shareableStatus: "Private",
      sensitiveFlag: true
    });
    const task = createProfileFollowUpRecord("${personId}", {
      title: "Text after exam",
      dueDate: "2026-07-05"
    });
    return { note: note.id, meeting: meeting.id, prayer: prayer.id, task: task.id };
  })()`);
  assert(db().notes.length === 1 && db().notes[0].relatedPersonId === personId, "profile note record creates a linked note");
  assert(db().meetingNotes.length === 1 && db().meetingNotes[0].meetingType === "Pastoral", "profile meeting record creates a linked meeting");
  assert(db().people[0].lastMeaningfulInteraction === "2026-07-06", "profile meeting record updates last interaction when explicitly requested");
  assert(db().prayerRequests.length === 1 && db().prayerRequests[0].status === "Follow-Up Needed", "profile prayer record creates a linked follow-up prayer");
  assert(db().prayerRequests[0].sensitivityLevel === "Sensitive", "profile prayer record preserves sensitivity");
  assert(db().tasks.length === 1 && db().tasks[0].dueDate === "2026-07-05", "profile follow-up record creates a dated task");
  assert(db().people[0].nextFollowUpDate === "2026-07-05", "profile follow-up record updates the planned follow-up");

  const firstNoteId = db().notes[0].id;
  appEval(`openEditFieldSheet("record", "${firstNoteId}", "content", "Note", "notes")`);
  makeElement("sheet-edit-value").value = "Edited note through sheet";
  appEval("submitEditFieldSheet()");
  assert(db().notes[0].content === "Edited note through sheet", "record edit sheet updates note");

  appEval(`markFollowedUp("${personId}")`);
  assert(db().people[0].lastMeaningfulInteraction === appEval("todayISO()"), "mark followed up records today");
  assert(db().people[0].nextFollowUpDate === "", "mark followed up clears profile follow-up");

  const prayerSheetId = createdRecords.prayer;
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

  const followUpCount = db().tasks.length;
  appEval(`createProfileFollowUpRecord("${personId}", { title: "Waiting follow-up", dueDate: "2026-07-09", status: "Waiting" })`);
  assert(db().tasks.length === followUpCount + 1 && db().tasks[0].status === "Waiting", "profile follow-up primitive preserves a waiting status");
  assert(db().people[0].nextFollowUpDate === "2026-07-09", "profile follow-up primitive updates next follow-up");

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

  const copyText = "Fictional multiline copy text.\nSecond line — no real ministry data.";
  const copyStateBefore = JSON.stringify({ db: db(), storage, undoStack: appEval("undoStack"), aiProposals: db().aiProposals });
  promptCalls = 0;
  networkCalls = 0;
  sandbox.navigator.clipboard = null;
  await appEval(`copyPlainText(${JSON.stringify(copyText)}, "Copied.", "Legacy prompt")`);
  assert(appEval("view.sheet && view.sheet.type") === "copy-text", "missing Clipboard API opens the in-app copy sheet");
  const copySheetHtml = appEval("renderSheet()");
  assert(copySheetHtml.includes('role="dialog"') && copySheetHtml.includes('aria-modal="true"'), "copy fallback is an accessible modal dialog");
  assert(copySheetHtml.includes('id="copy-text-value"') && copySheetHtml.includes("readonly") && copySheetHtml.includes('data-action="copy-text-select"'), "copy fallback renders a readonly selectable field");
  assert(copySheetHtml.includes("Fictional multiline copy text.") && copySheetHtml.includes("Second line — no real ministry data."), "copy fallback preserves multiline Unicode text");
  assert(promptCalls === 0, "copy fallback never opens a browser prompt");

  makeElement("copy-text-value").value = copyText;
  appEval("selectCopyTextSheetValue()");
  assert(sandbox.__focusedElementId === "copy-text-value", "copy fallback focuses the text field before selection");
  assert(makeElement("copy-text-value").selectionStart === 0 && makeElement("copy-text-value").selectionEnd === copyText.length, "copy fallback selects the complete text");
  appEval("closeSheet()");

  sandbox.navigator.clipboard = {
    writeText() {
      return Promise.reject(new Error("fictional clipboard rejection"));
    }
  };
  await appEval(`copyPlainText(${JSON.stringify(copyText)}, "Copied.", "Copy text")`);
  assert(appEval("view.sheet && view.sheet.type") === "copy-text", "rejected Clipboard API opens the same copy sheet");
  assert(!makeElement("toast").textContent.includes("Copied."), "rejected Clipboard API does not announce copy success");
  appEval("closeSheet()");

  sandbox.navigator.clipboard = {
    writeText() {
      throw new Error("fictional synchronous clipboard failure");
    }
  };
  await appEval(`copyPlainText(${JSON.stringify(copyText)}, "Copied.", "Copy text")`);
  assert(appEval("view.sheet && view.sheet.type") === "copy-text", "synchronous Clipboard API failure opens the same copy sheet");
  appEval("closeSheet()");

  sandbox.navigator.clipboard = null;
  const nestedCopyButton = makeElement("nested-copy-button");
  nestedCopyButton.dataset = { action: "profile-followup-copy", id: personId, draftIndex: "2" };
  const nestedCopyDescriptor = appEval('focusDescriptorFor(document.getElementById("nested-copy-button"))');
  assert(nestedCopyDescriptor.draftIndex === "2", "copy focus descriptor preserves the exact draft variant");
  appEval(`view.sheet = { type: "profile-followup", personId: ${JSON.stringify(personId)}, draftIndex: 2 }`);
  await appEval(`copyPlainText(${JSON.stringify(copyText)}, "Copied.", "Copy text", ${JSON.stringify(nestedCopyDescriptor)})`);
  assert(appEval("view.sheet && view.sheet.type") === "copy-text", "copy fallback can open above an existing workflow sheet");
  sandbox.document.querySelectorAll = selector => String(selector).includes("[data-action]") ? [nestedCopyButton] : [];
  appEval("closeSheet()");
  assert(appEval("view.sheet && view.sheet.type") === "profile-followup" && appEval("view.sheet.draftIndex") === 2, "closing copy fallback restores the existing workflow sheet");
  assert(sandbox.__focusedElementId === "nested-copy-button", "closing nested copy fallback restores the exact invoking copy control");
  sandbox.document.querySelectorAll = () => [];
  appEval("view.sheet = null");

  let successfulClipboardCalls = 0;
  sandbox.navigator.clipboard = {
    writeText(value) {
      successfulClipboardCalls += 1;
      sandbox.__copiedText = String(value || "");
      return Promise.resolve();
    }
  };
  await appEval(`copyPlainText(${JSON.stringify(copyText)}, "Copied.", "Copy text")`);
  assert(successfulClipboardCalls === 1 && sandbox.__copiedText === copyText, "available Clipboard API receives the exact text once");
  assert(appEval("view.sheet") === null && makeElement("toast").textContent.includes("Copied."), "successful Clipboard API keeps the sheet closed and announces success");

  const copyStateAfter = JSON.stringify({ db: db(), storage, undoStack: appEval("undoStack"), aiProposals: db().aiProposals });
  assert(copyStateAfter === copyStateBefore, "copy attempts do not mutate records, storage, proposals, or Undo");
  assert(networkCalls === 0, "copy attempts make no network request");
  assert((html.match(/window\.prompt\(/g) || []).length === 5, "only five non-copy browser prompts remain after the four copy fallbacks are removed");

  console.log("All current person profile regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

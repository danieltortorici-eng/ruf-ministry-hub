const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const DEFAULT_APP_DIR = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working");
const appDir = process.env.RUF_HUB_APP_DIR || DEFAULT_APP_DIR;
const appPath = path.resolve(appDir, "ruf-ministry-hub.html");
const serviceWorkerPath = path.resolve(appDir, "ruf-ministry-hub-sw.js");
const redirectsPath = path.resolve(appDir, "_redirects");
const indexPath = path.resolve(appDir, "index.html");
const manifestPath = path.resolve(appDir, "ruf-ministry-hub.webmanifest");
const html = fs.readFileSync(appPath, "utf8");
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, "utf8");
const redirectsSource = fs.readFileSync(redirectsPath, "utf8");
const indexSource = fs.readFileSync(indexPath, "utf8");
const manifestSource = fs.readFileSync(manifestPath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (!scriptMatch) throw new Error("Could not find app script in ruf-ministry-hub.html");

const storage = Object.create(null);
const elements = Object.create(null);
const downloadEvents = [];
const toastMessages = [];
let objectUrlCounter = 0;

function makeElement(idOrTag) {
  const key = String(idOrTag || "element");
  if (elements[key]) return elements[key];
  const el = {
    id: key,
    tagName: key.includes("text") || key.includes("summary") ? "TEXTAREA" : "INPUT",
    value: "",
    textContent: "",
    files: [],
    dataset: {},
    style: {},
    children: [],
    attributes: {},
    checked: false,
    type: "text",
    download: "",
    href: "",
    _innerHTML: "",
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
    removeChild(child) {
      this.children = this.children.filter(item => item !== child);
      return child;
    },
    remove() {},
    addEventListener() {},
    focus() {},
    setSelectionRange() {},
    click() {
      if (this.download) downloadEvents.push({ download: this.download, href: this.href || "" });
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      this[name] = value;
    },
    get innerHTML() {
      return this._innerHTML;
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

function setUrl(search = "") {
  location.protocol = "https:";
  location.hostname = "example.test";
  location.pathname = "/ruf-ministry-hub.html";
  location.search = search;
  location.hash = "";
  location.href = `https://example.test${location.pathname}${location.search}`;
}

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
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (selector === "input, textarea, select") return Object.values(elements);
      return [];
    }
  },
  indexedDB: undefined,
  Notification: undefined,
  FileReader: function FileReader() {},
  Image: function Image() {},
  URL: {
    createObjectURL() {
      objectUrlCounter += 1;
      return `blob:regression-${objectUrlCounter}`;
    },
    revokeObjectURL() {}
  }
};

sandbox.window = {
  location,
  navigator: sandbox.navigator,
  URL: sandbox.URL,
  history: {
    replaceState(_state, _title, url) {
      const [pathAndSearch, hash = ""] = String(url).split("#");
      const [pathname, search = ""] = pathAndSearch.split("?");
      location.pathname = pathname || location.pathname;
      location.search = search ? `?${search}` : "";
      location.hash = hash ? `#${hash}` : "";
      location.href = `https://example.test${location.pathname}${location.search}${location.hash}`;
    }
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

function view() {
  return appEval("view");
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function resetDom() {
  Object.keys(elements).forEach(key => delete elements[key]);
  makeElement("app");
  makeElement("toast");
  toastMessages.length = 0;
  downloadEvents.length = 0;
  setUrl("");
  sandbox.window.prompt = () => null;
  sandbox.window.confirm = () => true;
}

function resetApp(dataCode = "emptyData()") {
  resetDom();
  appEval(`
    settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      enableAutoSave: false,
      enableUndo: true,
      appCoachEnabled: false,
      backupReminderDays: "0",
      localEncryptionEnabled: false,
      notificationsEnabled: false
    });
    customCopy = {};
    db = normalizeData(${dataCode});
    view = {
      screen: settings.launchScreen || "today",
      personId: db.people[0]?.id || null,
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
    memoryVaultCache = null;
    localStorage.removeItem(AUTO_MEMORY_KEY);
    pendingUrlQuickGrabText = "";
    pendingUrlQuickGrabParams = null;
  `);
}

function testCurrentScreensRender() {
  resetApp("demoData()");
  ["today", "autopilot", "quick", "review", "search", "people", "person", "prayer", "minutes", "weekly", "settings", "advancedSettings", "coach", "duplicates", "readiness", "manual"].forEach(screen => {
    sandbox.__screen = screen;
    const markup = appEval(`
      view.screen = __screen;
      if (__screen === "person") view.personId = db.people[0]?.id || null;
      renderScreen();
    `);
    assert(typeof markup === "string" && markup.length > 20, `${screen} screen renders`);
  });
}

function testCalmPrimaryNavigation() {
  resetApp("demoData()");
  const primary = appEval("NAV.map(item => item.join(':')).join('|')");
  assert(primary === "today:Today|quick:Capture|people:People|prayer:Prayer|settings:More", "primary navigation has exactly the five Calm OS destinations");

  appEval('view.screen = "today"; render()');
  const shell = makeElement("app").innerHTML;
  const mobileMatch = shell.match(/<nav class="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/);
  assert(Boolean(mobileMatch) && (mobileMatch[1].match(/data-action="nav"/g) || []).length === 5, "mobile navigation exposes exactly five thumb-reachable destinations");
  assert(shell.includes('aria-label="Primary"') && shell.includes('aria-current="page"'), "primary navigation is semantically named and announces the current page");
  assert(!shell.includes("mobile-fab") && !html.includes("grid-template-columns: repeat(7"), "mobile navigation removes the duplicate capture control and empty tracks");

  const topbar = appEval('renderTopbar("Synthetic", "One question")');
  assert(!topbar.includes('data-screen="search"') && !topbar.includes('data-screen="quick"'), "screen headers do not compete with primary navigation");

  const more = appEval("renderMore()");
  assert(more.includes("Where are secondary tools and administration?") && more.includes('data-screen="search"'), "More keeps Search prominent without crowding primary navigation");
  assert((more.match(/class="more-group"/g) || []).length === 4, "More progressively discloses secondary tools in four quiet groups");
  ["minutes", "weekly", "autopilot", "review", "aiReview", "coach", "advancedSettings", "duplicates", "readiness", "manual"].forEach(screen => {
    assert(more.includes(`data-screen="${screen}"`), `More keeps ${screen} reachable`);
  });

  assert(appEval('calmLaunchScreen("search")') === "today" && appEval('calmLaunchScreen("settings")') === "settings", "legacy launch choices normalize to a primary destination");
  const advanced = appEval("renderAdvancedSettings()");
  assert(advanced.includes("Back to More") && advanced.includes("Launch Screen") && !advanced.includes("Workflow Shortcuts"), "settings and data stays reachable without duplicating the More directory");
}

function testCleanupAndLargeDataPaths() {
  resetApp("emptyData()");
  const lookup = appEval(`(() => {
    db.people = Array.from({ length: 600 }, (_, index) => ({ id: "person_" + index, name: "Synthetic Person " + index }));
    const middle = personById("person_333")?.name;
    db.people.push({ id: "person_new", name: "New Synthetic Person" });
    const pushed = personById("person_new")?.name;
    db.people = db.people.filter(person => person.id !== "person_333");
    const removed = personById("person_333");
    db.people.push({ id: "duplicate_id", name: "First Duplicate" }, { id: "duplicate_id", name: "Second Duplicate" });
    const firstDuplicate = personById("duplicate_id")?.name;
    return { middle, pushed, removed: Boolean(removed), firstDuplicate };
  })()`);
  assert(lookup.middle === "Synthetic Person 333" && lookup.pushed === "New Synthetic Person" && lookup.removed === false, "person lookup index rebuilds safely after append and replacement");
  assert(lookup.firstDuplicate === "First Duplicate", "person lookup keeps first-match behavior for corrupt duplicate identifiers");

  const duplicateCost = appEval(`(() => {
    const source = Array.from({ length: 400 }, (_, index) => ({ id: "duplicate_" + index, name: "Synthetic Unique " + String(index).padStart(4, "0") }));
    const original = normalizedName;
    let calls = 0;
    normalizedName = value => { calls += 1; return original(value); };
    try {
      const pairs = duplicatePersonPairs(source);
      return { calls, pairs: pairs.length };
    } finally {
      normalizedName = original;
    }
  })()`);
  assert(duplicateCost.calls === 400 && duplicateCost.pairs <= 12, "duplicate review normalizes each person once and returns a bounded result");
  assert(appEval("dataJanitorDuplicatePeople === undefined ? false : dataJanitorDuplicatePeople(db.people).length <= 12"), "duplicate manager and Data Janitor share the bounded matcher");

  const searchSource = html.slice(html.indexOf("function buildSearchResults"), html.indexOf("function renderSearchResultCard"));
  assert(searchSource.includes("const personMap = personMapFrom") && !searchSource.includes("personById("), "cross-record search builds one person map instead of rescanning people for every record");
  assert(!html.includes("list.indexOf(id) === index"), "proactive recommendation deduplication uses a linear Set path");
  ["legacyRenderPersonProfile", "legacyAutopilotNextAction", "renderTodayWorkSections", "renderStartHere", "renderPeopleShortcuts", "renderProcessQuickGrab", "saveProcessedQuickGrab", "openProcessing", "qg-preset", "qg-mock-ai", "quick-tags", "urgency-tags", ".quick-open"].forEach(marker => {
    assert(!html.includes(marker), `verified legacy path ${marker} is removed`);
  });
  const actionSource = html.slice(html.indexOf("function handleAction"), html.indexOf("function updateSetting"));
  assert(actionSource.includes('if (action === "qg-process") beginCaptureProcessing(id);'), "every visible saved-capture Process action enters the shared approval pipeline");
  const proposalSource = html.slice(html.indexOf("function openAiProposalSource"), html.indexOf("function handleAction"));
  assert(proposalSource.includes("beginCaptureProcessing(proposal.sourceId)"), "proposal source retries reuse the shared capture pipeline");
}

function testQuickGrabSharedUrlImport() {
  resetApp();
  makeElement("quick-text").value = "";
  setUrl("?quickgrab=Prayer%20capture&quickgrabCategory=prayer&quickgrabUrgency=soon");
  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");

  assert(view().screen === "quick", "shared URL opens Quick Grab");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL populates Quick Grab draft");
  const captureMarkup = appEval("renderQuickGrab()");
  assert(!captureMarkup.includes('id="quick-tags"'), "shared URL does not expose or preselect a visible category");
  assert(!captureMarkup.includes('id="urgency-tags"'), "shared URL does not expose or preselect visible urgency");
  assert(location.search === "", "shared URL params are removed after import");

  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL import does not duplicate after cleanup");

  makeElement("quick-text").value = "Prayer capture";
  appEval('view.quickGrabDraftText = "Prayer capture"');
  setUrl("?quickgrab=Prayer%20capture&quickgrabCategory=prayer");
  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL import does not duplicate an existing identical draft");

  appEval('submitUnifiedCapture("main", "", "later");');
  const grab = db().quickGrabs[0];
  assert(grab.rawContent === "Prayer capture", "shared draft saves through unified capture");
  assert(grab.captureSource === "shared", "shared draft keeps its capture source");
  assert(grab.category === "Prayer", "classification happens after shared text is captured");
  assert(grab.urgency === "Whenever", "legacy urgency query input is dormant in the calm capture flow");
}

function testUnifiedCaptureAndProposalSafety() {
  resetApp("emptyData()");
  const captureMarkup = appEval('view.screen = "quick"; renderQuickGrab()');
  assert(captureMarkup.includes("What do I need to remember?") && captureMarkup.includes('data-mode="process"'), "Capture asks one question and exposes Process as its primary action");
  assert(!captureMarkup.includes('id="quick-tags"') && !captureMarkup.includes('id="urgency-tags"'), "Capture has no upfront category or urgency chooser");

  const personId = appEval(`(() => {
    const person = createPerson("Capture Test Person", "");
    person.lastMeaningfulInteraction = "2026-07-01";
    person.nextFollowUpDate = "2026-07-20";
    person.followUpReason = "Existing reason";
    return person.id;
  })()`);
  makeElement("profile-capture-text").value = "Remember that Capture Test Person is considering leadership.";
  const beforeProfile = JSON.parse(JSON.stringify(db().people[0]));
  appEval(`submitUnifiedCapture("profile", "${personId}", "later")`);
  const savedLater = db().quickGrabs[0];
  assert(savedLater.relatedPersonId === personId && savedLater.personLocked === true && savedLater.captureSource === "profile", "profile Save for later creates one locked person-linked capture");
  assert(db().notes.length === 0 && db().meetingNotes.length === 0 && db().prayerRequests.length === 0 && db().tasks.length === 0, "profile Save for later creates no structured records");
  assert(db().people[0].lastMeaningfulInteraction === beforeProfile.lastMeaningfulInteraction && db().people[0].nextFollowUpDate === beforeProfile.nextFollowUpDate && db().people[0].followUpReason === beforeProfile.followUpReason, "profile Save for later does not change person dates or permanent details");
  const savedCardMarkup = appEval(`renderQuickGrabCard(db.quickGrabs.find(item => item.id === "${savedLater.id}"))`);
  assert((savedCardMarkup.match(/data-action="qg-process"/g) || []).length === 1 && !savedCardMarkup.includes("Turn into"), "saved capture cards expose one Process route without manual record-type presets");
  sandbox.__processRouteButton = { dataset: { action: "qg-process", id: savedLater.id }, classList: { contains() { return false; } } };
  appEval("handleAction({ currentTarget: __processRouteButton, target: __processRouteButton })");
  assert(db().quickGrabs.find(item => item.id === savedLater.id).processingState === "awaitingApproval" && view().sheet?.type === "ai-gate", "saved capture Process uses the same privacy review as new capture Process");
  assert(db().notes.length === 0 && db().meetingNotes.length === 0 && db().prayerRequests.length === 0 && db().tasks.length === 0, "saved capture Process cannot bypass approval to write structured records");
  appEval("view.sheet = null");

  makeElement("quick-text").value = "Met with Capture Test Person. Pray for wisdom and check in tomorrow.";
  appEval('view.screen = "quick"; submitUnifiedCapture("main", "", "process")');
  const processingGrab = db().quickGrabs[0];
  assert(processingGrab.processingState === "awaitingApproval" && view().sheet?.type === "ai-gate", "Process saves raw capture before opening the privacy review");
  assert(db().aiProposals.length === 0 && db().meetingNotes.length === 0 && db().prayerRequests.length === 0 && db().tasks.length === 0, "processing creates no proposal or permanent records before approval");

  makeElement("sheet-ai-gate-confirm").checked = true;
  appEval("submitAiGateContinue()");
  assert(db().aiProposals.length === 1 && db().quickGrabs[0].processingState === "review", "approved local processing creates one review-only proposal");
  const proposalId = db().aiProposals[0].id;
  appEval(`beginCaptureProcessing("${processingGrab.id}")`);
  assert(db().aiProposals.length === 1 && appEval("view.aiReviewFocusId") === proposalId, "retry reopens the existing proposal without duplication");
  const reviewMarkup = appEval("renderAiReview()");
  assert(reviewMarkup.includes("Suggested updates") && reviewMarkup.includes("RUF Hub sorted this into") && reviewMarkup.includes("Review selected"), "proposal review uses Calm OS approval language and independent selections");

  appEval(`markAiProposalSensitive("${proposalId}")`);
  assert(db().quickGrabs.find(item => item.id === processingGrab.id).sensitiveFlag === true, "review can explicitly mark the source capture sensitive");

  appEval(`settings.enableAutoSave = true; openAiActionConfirmSheet("${proposalId}", "selected")`);
  makeElement("ai-confirm-person-choice").tagName = "SELECT";
  makeElement("ai-confirm-person-choice").value = personId;
  makeElement("ai-confirm-action-confirm").type = "checkbox";
  makeElement("ai-confirm-action-confirm").checked = true;
  appEval("saveCurrentDraftNow()");
  const workflowDraft = appEval(`loadAutosaveDrafts()["workflow:ai-confirm:${proposalId}"]`);
  assert(workflowDraft?.fields?.["ai-confirm-person-choice"] === personId, "interrupted proposal confirmation saves the chosen person locally");
  assert(!Object.prototype.hasOwnProperty.call(workflowDraft?.fields || {}, "ai-confirm-action-confirm"), "proposal recovery never persists the final approval checkbox");
  appEval(`
    view.screen = "today";
    view.aiConfirmProposalId = "";
    view.aiConfirmActionIndexes = [];
    view.aiConfirmPersonChoice = {};
    restoreInterruptedWorkflow();
  `);
  assert(view().screen === "aiConfirmActions" && view().aiConfirmProposalId === proposalId && view().aiConfirmPersonChoice.existingPersonId === personId, "interrupted proposal review resumes selected actions and person choice");
  makeElement("ai-confirm-action-confirm").checked = false;
  appEval("cancelAiActionConfirmView()");
  assert(!appEval(`loadAutosaveDrafts()[ACTIVE_WORKFLOW_DRAFT_KEY]`), "canceling proposal confirmation clears its recovery pointer");

  const failedId = appEval(`(() => {
    const grab = makeQuickGrab("Unprocessed text stays safe", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.unshift(grab);
    markCaptureProcessingFailure(grab.id, "Network unavailable. Retry later.");
    return grab.id;
  })()`);
  const failed = db().quickGrabs.find(item => item.id === failedId);
  assert(failed.rawContent === "Unprocessed text stays safe" && failed.processingState === "failed", "failed processing preserves a clearly unprocessed raw capture");
  const interrupted = appEval(`(() => {
    const grab = makeQuickGrab("Interrupted processing", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "processing";
    return normalizeData({ ...emptyData(), quickGrabs: [grab] }).quickGrabs[0];
  })()`);
  assert(interrupted.processingState === "failed" && interrupted.processingError.includes("interrupted"), "interrupted processing becomes a safe retry state after reload");

  appEval('view.screen = "quick"; settings.enableAutoSave = true');
  makeElement("quick-text").value = "Half-written capture survives refresh";
  appEval("saveCurrentDraftNow()");
  makeElement("quick-text").value = "";
  appEval("restoreAutosaveDraft()");
  assert(makeElement("quick-text").value === "Half-written capture survives refresh", "main capture draft restores after interruption");

  appEval('clearAutosaveDraft("capture:main")');
  makeElement("quick-text").value = "Lifecycle-flushed capture";
  appEval("flushRecoveryState()");
  assert(appEval('loadAutosaveDrafts()["capture:main"].fields["quick-text"]') === "Lifecycle-flushed capture", "page lifecycle flush synchronously preserves the current plaintext capture draft");
  const preservedDraft = appEval("JSON.stringify(loadAutosaveDrafts())");
  appEval("view.locked = true");
  appEval("flushRecoveryState()");
  assert(appEval("JSON.stringify(loadAutosaveDrafts())") === preservedDraft, "lifecycle flush while PIN-locked cannot delete an existing capture draft");
  appEval("view.locked = false");
}

function testProposalActionsDoNotHidePersonDateUpdates() {
  resetApp("emptyData()");
  const result = appEval(`(() => {
    const person = createPerson("Approval Boundary", "");
    person.lastMeaningfulInteraction = "2026-06-01";
    person.nextFollowUpDate = "2026-08-01";
    person.followUpReason = "Keep this reason";
    const grab = makeQuickGrab("Met with Approval Boundary and follow up tomorrow", [], "Whenever", null, { captureSource: "main" });
    grab.relatedPersonId = person.id;
    db.quickGrabs.unshift(grab);
    const proposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: grab.id,
      proposalKey: captureProposalKey(grab),
      sourceCaptureRevision: grab.captureRevision,
      proposedActions: [
        { actionId: "meeting", actionType: "createMeetingNote", summary: "A grounded meeting summary", meetingDate: "2026-07-15" },
        { actionId: "follow-up", actionType: "createFollowUpTask", title: "Send a check-in", dueDate: "2026-07-16" }
      ]
    });
    db.aiProposals.unshift(proposal);
    const validation = validateAiActionExecution(proposal, [0, 1], { personChoice: { mode: "existing", existingPersonId: person.id }, enforcePersonChoice: true });
    applyAiProposalActions(proposal, validation, { convertQuickGrab: true });
    const afterFirst = {
      last: person.lastMeaningfulInteraction,
      next: person.nextFollowUpDate,
      reason: person.followUpReason,
      meetings: db.meetingNotes.length,
      tasks: db.tasks.length,
      sourceActionIds: [db.meetingNotes[0].sourceAIActionId, db.tasks[0].sourceAIActionId]
    };
    let duplicateBlocked = false;
    try { applyAiProposalActions(proposal, validation, { convertQuickGrab: true }); } catch (error) { duplicateBlocked = true; }
    return { afterFirst, duplicateBlocked, meetingsAfterRetry: db.meetingNotes.length, tasksAfterRetry: db.tasks.length };
  })()`);
  assert(result.afterFirst.last === "2026-06-01" && result.afterFirst.next === "2026-08-01" && result.afterFirst.reason === "Keep this reason", "create meeting and follow-up approvals do not silently update unselected person fields");
  assert(result.afterFirst.meetings === 1 && result.afterFirst.tasks === 1 && result.afterFirst.sourceActionIds.every(Boolean), "approved records store per-action idempotency links");
  assert(result.duplicateBlocked && result.meetingsAfterRetry === 1 && result.tasksAfterRetry === 1, "repeated proposal execution cannot duplicate structured records");
}

async function testAdversarialApprovalAndPersistenceBoundaries() {
  resetApp("emptyData()");
  const privacy = appEval(`(() => {
    const person = createPerson("Privacy Propagation Person");
    const grab = makeQuickGrab("Private follow-up source", [], "Whenever", null, { captureSource: "main", personId: person.id });
    grab.sensitiveFlag = true;
    db.quickGrabs.push(grab);
    const proposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: grab.id,
      proposalKey: captureProposalKey(grab),
      sensitivityRisk: "high",
      result: { possiblePersonId: person.id, possiblePersonName: person.name, mockOnly: true },
      proposedActions: [
        { actionId: "private-task", actionType: "createFollowUpTask", title: "Private approved task phrase", dueDate: todayISO() },
        { actionId: "private-person-update", actionType: "updatePerson", updates: { followUpReason: "Private approved profile phrase", nextFollowUpDate: todayISO() } }
      ]
    });
    db.aiProposals.push(proposal);
    const validation = validateAiActionExecution(proposal, [0, 1], { personChoice: { mode: "existing", existingPersonId: person.id }, enforcePersonChoice: true });
    applyAiProposalActions(proposal, validation, { convertQuickGrab: true });
    settings.includeSensitiveInSearch = true;
    settings.maskSensitivePreviews = true;
    return {
      validationErrors: validation.errors,
      taskSensitive: db.tasks[0].sensitiveFlag,
      personSensitive: person.sensitiveFlag,
      today: JSON.stringify(buildTodayRecommendations()),
      search: JSON.stringify(buildSearchResults("Private approved")),
      taskTitle: db.tasks[0].title,
      reason: person.followUpReason
    };
  })()`);
  assert(privacy.validationErrors.length === 0 && privacy.taskSensitive && privacy.personSensitive, "sensitive approved actions propagate privacy to follow-up tasks and person-detail updates");
  assert(privacy.taskTitle === "Private approved task phrase" && privacy.reason === "Private approved profile phrase", "approved sensitive content remains stored locally without being discarded");
  assert(!privacy.today.includes("Private approved task phrase") && !privacy.today.includes("Private approved profile phrase") && !privacy.search.includes("Private approved task phrase") && !privacy.search.includes("Private approved profile phrase"), "Today and Search mask privacy propagated from a sensitive capture");
  const mixedPrivacy = appEval(`({ normalPlusFlag: aiPrivacyTierForRecord({ aiPrivacyTier: "Normal", sensitiveFlag: true }), normalPlusSensitivity: aiPrivacyTierForRecord({ aiPrivacyTier: "Normal", sensitivityLevel: "Sensitive" }) })`);
  assert(mixedPrivacy.normalPlusFlag === "Sensitive" && mixedPrivacy.normalPlusSensitivity === "Sensitive", "mixed legacy privacy flags fail closed instead of allowing Normal to override sensitivity");

  resetApp("emptyData()");
  const tierPropagation = appEval(`(() => {
    const person = createPerson("Tier-only privacy person");
    const grab = makeQuickGrab("Tier-only sensitive source", [], "Whenever", null, { captureSource: "main", personId: person.id });
    grab.aiPrivacyTier = "Sensitive";
    grab.sensitiveFlag = false;
    grab.relatedPersonId = person.id;
    db.quickGrabs.push(grab);
    const proposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: grab.id,
      proposalKey: captureProposalKey(grab),
      sensitivityRisk: "low",
      proposedActions: [{ actionId: "tier-task", actionType: "createFollowUpTask", title: "Tier-only sensitive task", dueDate: todayISO() }]
    });
    db.aiProposals.push(proposal);
    const validation = validateAiActionExecution(proposal, [0], { personChoice: { mode: "existing", existingPersonId: person.id }, enforcePersonChoice: true });
    applyAiProposalActions(proposal, validation, { convertQuickGrab: true });
    return { errors: validation.errors, sensitive: db.tasks[0]?.sensitiveFlag, today: JSON.stringify(buildTodayRecommendations()) };
  })()`);
  assert(tierPropagation.errors.length === 0 && tierPropagation.sensitive && !tierPropagation.today.includes("Tier-only sensitive task"), "privacy tiers without legacy flags propagate to approved records and Today masking");

  resetApp("emptyData()");
  const sensitiveProposal = appEval(`(() => {
    const person = createPerson("Secret Person");
    person.aiPrivacyTier = "Sensitive";
    const grab = makeQuickGrab("TOPSECRET pastoral counseling detail", [], "Whenever", null, { captureSource: "main", personId: person.id });
    grab.aiPrivacyTier = "Sensitive";
    grab.relatedPersonId = person.id;
    db.quickGrabs.push(grab);
    const gate = renderAiGateSheet({ type: "ai-gate", sourceType: "quickGrab", sourceId: grab.id, nextAction: "quickGrabParse" });
    const waiting = renderCaptureWaitingRow(grab);
    const cardBefore = renderQuickGrabCard(grab);
    createQuickGrabMockAiProposal(grab.id);
    const proposal = db.aiProposals[0];
    const card = renderAiProposalCard(proposal);
    db.quickGrabs = [];
    const sourceDeletedCard = renderAiProposalCard(proposal);
    const duplicate = createPerson("Secret Person");
    const duplicateProposal = emptyAiProposal({
      id: "sensitive-duplicate",
      aiPrivacyTier: "Sensitive",
      proposedActions: [{ actionId: "new-secret", actionType: "createPerson", name: "Secret Person" }]
    });
    db.aiProposals.push(duplicateProposal);
    view.aiConfirmProposalId = duplicateProposal.id;
    view.aiConfirmActionIndexes = [0];
    view.aiConfirmPersonChoice = { mode: "new", newPersonName: duplicate.name };
    const duplicateConfirm = renderConfirmAiActions();
    view.aiConfirmProposalId = proposal.id;
    view.aiConfirmActionIndexes = proposal.proposedActions.map((action, index) => index);
    const confirm = renderConfirmAiActions();
    const legacyConfirm = renderAiActionConfirmSheet({ proposalId: proposal.id, actionIndexes: view.aiConfirmActionIndexes });
    return { gate, waiting, cardBefore, proposal, card, sourceDeletedCard, duplicateConfirm, confirm, legacyConfirm };
  })()`);
  assert(!sensitiveProposal.gate.includes("TOPSECRET") && !sensitiveProposal.card.includes("TOPSECRET") && !sensitiveProposal.confirm.includes("TOPSECRET") && !sensitiveProposal.legacyConfirm.includes("TOPSECRET"), "blocked AI context, review, and confirmation surfaces never expose sensitive capture text");
  assert(!sensitiveProposal.waiting.includes("Secret Person") && !sensitiveProposal.cardBefore.includes("Secret Person"), "capture waiting and review cards mask sensitive linked person identity");
  assert(sensitiveProposal.proposal.contextPreview === "Sensitive context hidden until approval." && sensitiveProposal.proposal.rawInputPreview === "Sensitive input hidden until approval.", "sensitive proposal previews are redacted at durable creation time");
  assert(sensitiveProposal.proposal.aiPrivacyTier === "Sensitive" && sensitiveProposal.sourceDeletedCard.includes("Sensitive suggested updates") && !sensitiveProposal.sourceDeletedCard.includes("TOPSECRET"), "sensitive proposal privacy remains masked after its source capture is removed");
  assert(sensitiveProposal.duplicateConfirm.includes("Sensitive person details hidden") && !sensitiveProposal.duplicateConfirm.includes("Similar people already exist: Secret Person"), "sensitive final approval warnings do not reveal duplicate person names");

  resetApp("emptyData()");
  const gateDeletion = appEval(`(() => {
    const grab = makeQuickGrab("Gate marked raw detail", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(grab);
    const proposal = emptyAiProposal({ sourceType: "quickGrab", sourceId: grab.id, title: "Gate marked raw title", rawInputPreview: "Gate marked raw input" });
    db.aiProposals.push(proposal);
    view.sheet = { type: "ai-gate", proposalId: proposal.id };
    markAiGateDoNotSend();
    db.quickGrabs = [];
    return { tier: proposal.aiPrivacyTier, context: proposal.contextPreview, card: renderAiProposalCard(proposal) };
  })()`);
  assert(gateDeletion.tier === "Do Not Send to AI" && gateDeletion.context === "Sensitive context hidden until approval." && !gateDeletion.card.includes("Gate marked raw title") && !gateDeletion.card.includes("Gate marked raw input"), "marking a proposal Do Not Send persists redaction after its source is removed");

  const sensitiveResult = appEval(`(() => {
    const proposal = emptyAiProposal({ id: "sensitive-result", proposalType: "prayerSteward", sensitivityRisk: "medium", result: { steward: { activeOlderThan30: ["Hidden person: raw prayer detail"] } } });
    return renderAiProposalCard(proposal);
  })()`);
  assert(sensitiveResult.includes("Suggested result details hidden") && !sensitiveResult.includes("Hidden person: raw prayer detail"), "sensitive proposal result panels hide raw generated details");

  const candidatePrivacy = appEval(`(() => {
    const blocked = createPerson("Blocked candidate");
    blocked.aiPrivacyTier = "Do Not Send to AI";
    const allowed = createPerson("Allowed candidate");
    const grab = makeQuickGrab("Blocked candidate note", [], "Whenever", null, { captureSource: "main" });
    grab.detectedPersonName = blocked.name;
    const flags = { matchedPerson: blocked, possiblePeople: [blocked, allowed] };
    const original = quickGrabMockFlags;
    quickGrabMockFlags = () => flags;
    const result = quickGrabCandidatePeopleForBackend(grab);
    quickGrabMockFlags = original;
    return result;
  })()`);
  assert(candidatePrivacy.every(person => person.name !== "Blocked candidate"), "Quick Grab backend candidate context excludes people blocked by their privacy tier");

  resetApp("emptyData()");
  const backendApproval = appEval(`(() => {
    settings.aiMockMode = false;
    const person = createPerson("Backend Approval Person");
    const grab = makeQuickGrab("Backend reviewed note", [], "Whenever", null, { captureSource: "main", personId: person.id });
    db.quickGrabs.push(grab);
    const proposal = normalizeBackendQuickGrabProposal({
      ok: true,
      mode: "real",
      route: "/api/ai/quick-grab",
      proposal: {
        title: "Backend proposal",
        summary: "Review this grounded note.",
        confidence: "high",
        relatedPersonIdSuggestion: person.id,
        detectedPersonName: person.name,
        proposedActions: [{ actionId: "backend-note", actionType: "createNote", relatedPersonId: person.id, content: "Backend approved note body" }],
        result: { mockOnly: false }
      }
    }, grab);
    db.aiProposals.push(proposal);
    const validation = validateAiActionExecution(proposal, [0], { personChoice: { mode: "existing", existingPersonId: person.id }, enforcePersonChoice: true });
    applyAiProposalActions(proposal, validation, { convertQuickGrab: true });
    return {
      errors: validation.errors,
      notes: db.notes.length,
      note: db.notes[0]?.content,
      status: proposal.status,
      backendMode: proposal.result.backendMode,
      mockOnly: proposal.result.mockOnly
    };
  })()`);
  assert(backendApproval.errors.length === 0 && backendApproval.notes === 1 && backendApproval.note === "Backend approved note body", "reviewed backend proposals can be approved when local mock fallback is off");
  assert(backendApproval.status === "approved" && backendApproval.backendMode === "real" && backendApproval.mockOnly === false, "approved real-backend proposals preserve truthful provenance metadata");

  resetApp("emptyData()");
  const updateOrder = await appEval(`(async () => {
    const originalFlush = flushRecoveryState;
    const originalRegistration = serviceWorkerRegistration;
    const events = [];
    let release;
    serviceWorkerRegistration = { waiting: { postMessage() { events.push("post"); } } };
    flushRecoveryState = () => new Promise(resolve => {
      release = () => { events.push("flush"); resolve(true); };
    });
    const updatePromise = applyAppUpdate();
    await Promise.resolve();
    const beforeRelease = events.slice();
    release();
    const success = await updatePromise;
    flushRecoveryState = () => Promise.resolve(false);
    const refused = await applyAppUpdate();
    flushRecoveryState = originalFlush;
    serviceWorkerRegistration = originalRegistration;
    return { beforeRelease, events, success, refused };
  })()`);
  assert(updateOrder.beforeRelease.length === 0 && updateOrder.events[0] === "flush" && updateOrder.events[1] === "post", "app update waits for draft and vault recovery flush before activating the service worker");
  assert(updateOrder.success === true && updateOrder.refused === false && updateOrder.events.filter(event => event === "post").length === 1, "failed recovery flush leaves the waiting update inactive");

  resetApp("emptyData()");
  const quotaBoundary = appEval(`(() => {
    settings.autoMemoryVaultEnabled = false;
    const originalSet = localStorage.setItem;
    const originalMirror = mirrorToIndexedDb;
    const events = [];
    mirrorToIndexedDb = key => { events.push("mirror:" + key); };
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic quota");
      return originalSet.call(localStorage, key, value);
    };
    let threw = false;
    try { saveData(); } catch (error) { threw = true; events.push("threw"); }
    localStorage.setItem = originalSet;
    mirrorToIndexedDb = originalMirror;
    return { threw, events };
  })()`);
  assert(quotaBoundary.threw && quotaBoundary.events.length === 1 && quotaBoundary.events[0] === "threw", "quota failure does not mirror an uncommitted IndexedDB record before surfacing an unconfirmed save");

  resetApp("emptyData()");
  const restoreRollback = appEval(`(() => {
    settings.autoMemoryVaultEnabled = false;
    const original = createPerson("Original Restore Person");
    saveData();
    saveSettings();
    const oldStorage = localStorage.getItem(STORAGE_KEY);
    const oldSettings = localStorage.getItem(SETTINGS_KEY);
    const payload = JSON.parse(JSON.stringify(currentPortablePayload()));
    payload.data.people = [{ id: "replacement", name: "Replacement Person" }];
    payload.settings.launchScreen = "people";
    const originalSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic restore quota");
      return originalSet.call(localStorage, key, value);
    };
    const restored = applyRestoredPayload(payload, { captureBefore: false });
    localStorage.setItem = originalSet;
    return {
      restored,
      personName: db.people[0]?.name,
      launchScreen: settings.launchScreen,
      storageSame: localStorage.getItem(STORAGE_KEY) === oldStorage,
      settingsSame: localStorage.getItem(SETTINGS_KEY) === oldSettings,
      originalId: original.id
    };
  })()`);
  assert(restoreRollback.restored === false && restoreRollback.personName === "Original Restore Person" && restoreRollback.launchScreen === "today", "backup restore rolls in-memory state back when persistence cannot complete");
  assert(restoreRollback.storageSame && restoreRollback.settingsSame, "failed backup restore preserves the prior persisted data and settings");

  resetApp("emptyData()");
  const vaultDisableRollback = appEval(`(() => {
    settings.localEncryptionEnabled = true;
    settings.localEncryptionHint = "keep";
    vaultPassphrase = "synthetic-passphrase";
    autosaveDraftsCache = { "capture:main": { fields: { "quick-text": "Safe draft" } } };
    memoryVaultCache = emptyAutoMemoryVault();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(COPY_KEY);
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, JSON.stringify({ version: 1, ciphertext: "sentinel" }));
    const envelopeBefore = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
    const originalSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === COPY_KEY) throw new Error("synthetic plaintext quota");
      return originalSet.call(localStorage, key, value);
    };
    const disabled = disableLocalEncryptionRecord();
    localStorage.setItem = originalSet;
    return {
      disabled,
      encryptionEnabled: settings.localEncryptionEnabled,
      hint: settings.localEncryptionHint,
      envelopeSame: localStorage.getItem(ENCRYPTED_STORAGE_KEY) === envelopeBefore,
      plaintextAbsent: localStorage.getItem(STORAGE_KEY) === null && localStorage.getItem(COPY_KEY) === null,
      passphraseKept: vaultPassphrase === "synthetic-passphrase"
    };
  })()`);
  assert(vaultDisableRollback.disabled === false && vaultDisableRollback.encryptionEnabled && vaultDisableRollback.hint === "keep" && vaultDisableRollback.passphraseKept, "failed vault disable leaves encryption state and unlock context intact");
  assert(vaultDisableRollback.envelopeSame && vaultDisableRollback.plaintextAbsent, "failed vault disable preserves the prior envelope without a mixed plaintext state");
}

async function testAiApprovalWaitsForDurablePersistence() {
  resetApp("emptyData()");
  const pendingId = appEval(`(() => {
    settings.enableAutoSave = true;
    settings.localEncryptionEnabled = true;
    vaultPassphrase = "synthetic-vault-passphrase";
    memoryVaultCache = { version: 1, snapshots: [{ id: "memory-before", label: "Before approval" }] };
    const person = createPerson("Durable Approval Person");
    const proposal = emptyAiProposal({
      id: "durable-pending-proposal",
      proposedActions: [{ actionId: "durable-task", actionType: "createFollowUpTask", title: "Durable approval task", dueDate: todayISO(), relatedPersonId: person.id }]
    });
    db.aiProposals.push(proposal);
    view.screen = "aiConfirmActions";
    view.aiConfirmProposalId = proposal.id;
    view.aiConfirmActionIndexes = [0];
    view.aiConfirmPersonChoice = { mode: "existing", existingPersonId: person.id };
    autosaveDraftsCache = {
      ["workflow:ai-confirm:" + proposal.id]: { key: "workflow:ai-confirm:" + proposal.id, fields: { "ai-confirm-person-choice": person.id } },
      [ACTIVE_WORKFLOW_DRAFT_KEY]: { type: "aiConfirmActions", proposalId: proposal.id, draftKey: "workflow:ai-confirm:" + proposal.id }
    };
    vaultSaveRequestedRevision = 40;
    vaultSaveCompletedRevision = 40;
    return proposal.id;
  })()`);
  makeElement("ai-confirm-person-choice").tagName = "SELECT";
  makeElement("ai-confirm-person-choice").value = appEval("db.people[0].id");
  makeElement("ai-confirm-action-confirm").type = "checkbox";
  makeElement("ai-confirm-action-confirm").checked = true;
  appEval(`
    __durableRequiredRevision = 0;
    __durableResolve = null;
    __queuedAutosaveFired = false;
    autosaveTimer = setTimeout(() => { __queuedAutosaveFired = true; }, 0);
    __originalConfirmCareVaultRevision = confirmCareVaultRevision;
    confirmCareVaultRevision = requiredRevision => {
      __durableRequiredRevision = requiredRevision;
      if (vaultSaveTimer) {
        clearTimeout(vaultSaveTimer);
        vaultSaveTimer = null;
      }
      return new Promise(resolve => { __durableResolve = resolve; });
    };
  `);
  const pendingSave = appEval("submitAiActionConfirmSheet()");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert(view().aiConfirmSaving === true && view().screen === "aiConfirmActions", "encrypted AI approval stays in its confirmation workflow while durable persistence is pending");
  assert(appEval("__queuedAutosaveFired") === false && appEval("autosaveTimer") === null, "encrypted AI approval cancels queued autosave before taking transaction ownership");
  const pendingMarkup = appEval("renderConfirmAiActions()");
  assert(pendingMarkup.includes('role="status" aria-busy="true"') && pendingMarkup.includes('<fieldset class="field-group" disabled aria-disabled="true" aria-busy="true">') && pendingMarkup.includes("Saving approved updates") && (pendingMarkup.match(/disabled/g) || []).length >= 3, "pending encrypted approval marks its status and full approval controls busy and natively disabled");
  const requestedDuringPending = appEval("vaultSaveRequestedRevision");
  assert(appEval("__durableRequiredRevision") === requestedDuringPending && requestedDuringPending > 40, "encrypted AI approval waits for the exact requested vault revision");
  const recordsDuringPending = db().tasks.length;
  const recoveryDuringPending = appEval("JSON.stringify(autosaveDraftsCache)");
  sandbox.__blockedPendingAction = {
    dataset: { action: "nav", screen: "settings" },
    classList: { contains() { return false; } }
  };
  appEval("__pendingActionPrevented = false; __pendingActionStopped = false");
  const blockedActionResult = appEval(`handleAction({
    currentTarget: __blockedPendingAction,
    target: __blockedPendingAction,
    preventDefault() { __pendingActionPrevented = true; },
    stopPropagation() { __pendingActionStopped = true; }
  })`);
  const reentryResult = await appEval("submitAiActionConfirmSheet()");
  const cancelResult = appEval("cancelAiActionConfirmView()");
  assert(blockedActionResult === false && appEval("__pendingActionPrevented && __pendingActionStopped") && reentryResult === false && cancelResult === false && db().tasks.length === recordsDuringPending && view().screen === "aiConfirmActions", "pending encrypted approval globally blocks navigation, save re-entry, and cancellation without duplicating records");
  assert(appEval("JSON.stringify(autosaveDraftsCache)") === recoveryDuringPending, "blocked pending actions cannot clear or replace transaction-owned workflow recovery");
  assert(!String(makeElement("toast").textContent).startsWith("Saved "), "encrypted AI approval does not announce success before durability resolves");
  appEval("__durableResolve(true)");
  const pendingSuccess = await pendingSave;
  appEval("confirmCareVaultRevision = __originalConfirmCareVaultRevision");
  assert(pendingSuccess === true && db().tasks.length === 1 && view().screen === "aiReview" && view().aiConfirmSaving === false, "durable encrypted approval saves selected actions exactly once after persistence resolves");
  assert(!appEval(`loadAutosaveDrafts()["workflow:ai-confirm:${pendingId}"]`) && !appEval("loadAutosaveDrafts()[ACTIVE_WORKFLOW_DRAFT_KEY]"), "durable encrypted approval clears workflow recovery only after success");
  assert(String(makeElement("toast").textContent).startsWith("Saved 1 approved update"), "durable encrypted approval announces success only after persistence resolves");

  resetApp("emptyData()");
  const failureBefore = appEval(`(() => {
    settings.enableAutoSave = true;
    settings.localEncryptionEnabled = true;
    vaultPassphrase = "synthetic-vault-passphrase";
    memoryVaultCache = { version: 1, snapshots: [{ id: "memory-failure", label: "Failure baseline" }] };
    const person = createPerson("Failure Approval Person");
    const proposal = emptyAiProposal({
      id: "durable-failure-proposal",
      proposedActions: [{ actionId: "failure-task", actionType: "createFollowUpTask", title: "Must roll back", dueDate: todayISO(), relatedPersonId: person.id }]
    });
    db.aiProposals.push(proposal);
    view.screen = "aiConfirmActions";
    view.aiConfirmProposalId = proposal.id;
    view.aiConfirmActionIndexes = [0];
    view.aiConfirmPersonChoice = { mode: "existing", existingPersonId: person.id };
    undoStack = [{ label: "existing undo", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    autosaveDraftsCache = {
      ["workflow:ai-confirm:" + proposal.id]: { key: "workflow:ai-confirm:" + proposal.id, fields: { "ai-confirm-person-choice": person.id } },
      [ACTIVE_WORKFLOW_DRAFT_KEY]: { type: "aiConfirmActions", proposalId: proposal.id, draftKey: "workflow:ai-confirm:" + proposal.id }
    };
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, "encrypted-before-failure");
    localStorage.setItem(SETTINGS_KEY, "settings-before-failure");
    localStorage.setItem(CALM_MODE_KEY, "calm-before-failure");
    localStorage.setItem(STORAGE_KEY, "plain-before-failure");
    localStorage.setItem(COPY_KEY, "copy-before-failure");
    localStorage.setItem(AUTOSAVE_KEY, "autosave-before-failure");
    localStorage.setItem(AUTO_MEMORY_KEY, "memory-before-failure");
    vaultSaveRequestedRevision = 70;
    vaultSaveCompletedRevision = 70;
    return {
      db: JSON.stringify(db),
      memory: JSON.stringify(memoryVaultCache),
      undo: JSON.stringify(undoStack),
      drafts: JSON.stringify(autosaveDraftsCache),
      proposal: JSON.stringify(proposal),
      storage: JSON.stringify(Object.fromEntries(localStorageSnapshot([SETTINGS_KEY, CALM_MODE_KEY, STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, ENCRYPTED_STORAGE_KEY, AUTO_MEMORY_KEY])))
    };
  })()`);
  makeElement("ai-confirm-person-choice").tagName = "SELECT";
  makeElement("ai-confirm-person-choice").value = appEval("db.people[0].id");
  makeElement("ai-confirm-action-confirm").type = "checkbox";
  makeElement("ai-confirm-action-confirm").checked = true;
  const failureResult = await appEval(`(async () => {
    const originalConfirm = confirmCareVaultRevision;
    confirmCareVaultRevision = async requiredRevision => {
      __failureRequiredRevision = requiredRevision;
      if (vaultSaveTimer) {
        clearTimeout(vaultSaveTimer);
        vaultSaveTimer = null;
      }
      return false;
    };
    const result = await submitAiActionConfirmSheet();
    confirmCareVaultRevision = originalConfirm;
    return result;
  })()`);
  const failureAfter = appEval(`({
    db: JSON.stringify(db),
    memory: JSON.stringify(memoryVaultCache),
    undo: JSON.stringify(undoStack),
    drafts: JSON.stringify(autosaveDraftsCache),
    proposal: JSON.stringify(aiProposalById("durable-failure-proposal")),
    storage: JSON.stringify(Object.fromEntries(localStorageSnapshot([SETTINGS_KEY, CALM_MODE_KEY, STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, ENCRYPTED_STORAGE_KEY, AUTO_MEMORY_KEY]))),
    requested: vaultSaveRequestedRevision,
    completed: vaultSaveCompletedRevision
  })`);
  assert(failureResult === false && failureAfter.db === failureBefore.db && failureAfter.memory === failureBefore.memory && failureAfter.undo === failureBefore.undo, "failed encrypted AI approval restores exact database, memory vault, and Undo state");
  assert(failureAfter.drafts === failureBefore.drafts && failureAfter.proposal === failureBefore.proposal && failureAfter.storage === failureBefore.storage, "failed encrypted AI approval restores exact workflow recovery, proposal, and relevant local persistence");
  assert(failureAfter.requested === 70 && failureAfter.completed === 70 && db().tasks.length === 0 && view().screen === "aiConfirmActions" && view().aiConfirmSaving === false, "failed encrypted AI approval restores vault revisions, creates no record, and remains retryable");
  assert(!String(makeElement("toast").textContent).startsWith("Saved "), "failed encrypted AI approval never announces success");

  appEval(`[SETTINGS_KEY, CALM_MODE_KEY, STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, ENCRYPTED_STORAGE_KEY, AUTO_MEMORY_KEY].forEach(key => localStorage.removeItem(key))`);
  resetApp("emptyData()");
  appEval(`(() => {
    const person = createPerson("Plain Approval Person");
    const proposal = emptyAiProposal({
      id: "plain-durable-proposal",
      proposedActions: [{ actionId: "plain-task", actionType: "createFollowUpTask", title: "Plain approval task", dueDate: todayISO(), relatedPersonId: person.id }]
    });
    db.aiProposals.push(proposal);
    view.screen = "aiConfirmActions";
    view.aiConfirmProposalId = proposal.id;
    view.aiConfirmActionIndexes = [0];
    view.aiConfirmPersonChoice = { mode: "existing", existingPersonId: person.id };
    __plainStorageWrites = 0;
    __originalPersistPlainRecord = persistPlainRecord;
    persistPlainRecord = (key, value) => {
      if (key === STORAGE_KEY) __plainStorageWrites += 1;
      return __originalPersistPlainRecord(key, value);
    };
  })()`);
  makeElement("ai-confirm-person-choice").tagName = "SELECT";
  makeElement("ai-confirm-person-choice").value = appEval("db.people[0].id");
  makeElement("ai-confirm-action-confirm").type = "checkbox";
  makeElement("ai-confirm-action-confirm").checked = true;
  const plainFirst = await appEval("submitAiActionConfirmSheet()");
  const plainSecond = await appEval("submitAiActionConfirmSheet()");
  const plainWrites = appEval("__plainStorageWrites");
  appEval("persistPlainRecord = __originalPersistPlainRecord");
  assert(plainFirst === true && plainSecond === false && db().tasks.length === 1 && plainWrites === 1, "plain-mode AI approval persists selected actions exactly once and rejects re-entry");
}

function testCoreLocalActions() {
  resetApp("demoData()");
  const firstPersonId = db().people[0].id;
  appEval(`markFollowedUp("${firstPersonId}")`);
  assert(appEval(`personById("${firstPersonId}").lastMeaningfulInteraction`) === appEval("todayISO()"), "mark followed up updates interaction date");
  assert(appEval(`personById("${firstPersonId}").nextFollowUpDate`) === "", "mark followed up clears next follow-up date");

  const firstPrayerId = db().prayerRequests[0].id;
  appEval(`markPrayerAnswered("${firstPrayerId}")`);
  assert(db().prayerRequests.find(item => item.id === firstPrayerId).status === "Answered", "mark prayer answered updates status");

  const firstTaskId = db().tasks[0].id;
  appEval(`updateTask("${firstTaskId}", { status: "Done / Archived" }, "Done")`);
  assert(db().tasks.find(item => item.id === firstTaskId).status === "Done / Archived", "task can be marked done");
}

function testAdhdModeAndTodaySectionVisibility() {
  resetApp("demoData()");
  const advanced = appEval("renderAdvancedSettings()");
  assert(!advanced.includes("ADHD Mode") && !advanced.includes("Attention Preset"), "Calm OS removes the redundant ADHD mode decision");
  assert(!advanced.includes("Show Autopilot On Today") && !advanced.includes("Today List Size"), "settings cannot reintroduce dashboard controls on Today");

  const adhdToday = appEval('view.screen = "today"; renderToday();');
  assert((adhdToday.match(/data-today-section=/g) || []).length === 3, "Calm Today keeps exactly three primary sections");
  assert(adhdToday.includes("Next thing to do") && adhdToday.includes("Quick Capture") && adhdToday.includes("After that"), "Calm Today uses the shared low-choice hierarchy");
  assert((adhdToday.match(/class="button primary"/g) || []).length === 1, "Today has one visually dominant action");

  appEval(`
    settings.todayShowQuickCapture = false;
    settings.todayShowQuickReview = false;
    settings.todayShowCarePeople = false;
    settings.todayShowFollowUps = false;
    settings.todayShowPeopleShortcuts = false;
  `);
  const hiddenToday = appEval('renderToday();');
  assert((hiddenToday.match(/data-today-section=/g) || []).length === 3, "legacy dashboard visibility toggles cannot fragment Calm OS Today");
  assert(hiddenToday.includes("Quick Capture") && !hiddenToday.includes("People Shortcuts") && !hiddenToday.includes("App Coach suggestion"), "Today keeps capture while legacy dashboard sections stay relocated");

  appEval('settings.calmMode = false; view.focusMode = true; render()');
  assert(makeElement("app").innerHTML.includes("focus-mode") && !makeElement("app").innerHTML.includes("Calm Mode Off"), "legacy Calm Mode preference cannot turn Calm OS off");
}

function testAutopilotAndAttentionPresets() {
  resetApp("demoData()");
  const firstAction = appEval("autopilotNextAction()");
  assert(firstAction.kind === "Capture", "legacy Autopilot reads from the central recommendation queue");
  assert(firstAction.primaryAction === "today-recommendation-open", "legacy Autopilot routes through the central recommendation action");

  const todayMarkup = appEval('view.screen = "today"; renderToday();');
  assert(todayMarkup.includes("Next thing to do"), "Today names one clear next action");
  assert(!todayMarkup.includes("Autopilot"), "Today does not expose implementation-style Autopilot language");

  const autopilotMarkup = appEval('view.screen = "autopilot"; renderScreen();');
  assert(autopilotMarkup.includes("How Autopilot Chooses"), "Autopilot screen explains its local priority order");
  assert(autopilotMarkup.includes("Next-Level Build Guardrails"), "Autopilot screen keeps future integrations labeled as guardrails");

  assert(!html.includes("ADHD_PRESETS") && !html.includes("applyAdhdPreset"), "obsolete attention presets cannot mutate the fixed Today contract");
}

function testTodayRecommendationPriorityAndActions() {
  resetApp("emptyData()");
  const ids = appEval(`(() => {
    settings.backupReminderDays = "7";
    settings.lastBackupAt = daysAgo(14);
    const overdue = createPerson("Overdue Person");
    overdue.nextFollowUpDate = daysAgo(4);
    overdue.followUpReason = "Ask about the saved follow-up";
    const dueToday = createPerson("Today Person");
    dueToday.nextFollowUpDate = todayISO();
    dueToday.followUpReason = "Send a grounded check-in";
    const careWindow = createPerson("Care Window Person");
    careWindow.careLevel = "Check in soon";
    careWindow.lastMeaningfulInteraction = daysAgo(60);
    const proactive = createPerson("Proactive Person");
    proactive.lastMeaningfulInteraction = todayISO();
    settings.pinnedPersonIds = [proactive.id];
    const task = {
      id: uid("task"), relatedPersonId: "", title: "Important task today", dueDate: todayISO(), status: "Today / Soon",
      createdAt: nowISO(), updatedAt: nowISO()
    };
    const completedTask = { ...task, id: uid("task"), title: "Completed hidden task", status: "Done / Archived" };
    db.tasks.push(task, completedTask);
    const importantCapture = makeQuickGrab("Private capture text", [], "Important", null, { captureSource: "main" });
    importantCapture.sensitiveFlag = true;
    const oldestCapture = makeQuickGrab("Oldest ordinary capture", [], "Whenever", null, { captureSource: "main" });
    oldestCapture.createdAt = daysAgo(20) + "T12:00:00.000Z";
    const snoozedCapture = makeQuickGrab("Snoozed hidden capture", [], "Important", null, { captureSource: "main" });
    snoozedCapture.snoozedUntil = daysFromNow(3);
    const malformedSnoozed = makeQuickGrab("Malformed snooze hidden", [], "Important", null, { captureSource: "main" });
    malformedSnoozed.snoozedUntil = "not-a-date";
    db.quickGrabs.push(importantCapture, oldestCapture, snoozedCapture, malformedSnoozed);
    const prayer = {
      id: uid("prayer"), relatedPersonId: "", request: "Private prayer text", dateAdded: daysAgo(2), status: "Follow-Up Needed",
      sensitivityLevel: "Sensitive", followUpDate: todayISO(), shareableStatus: "Private", createdAt: nowISO(), updatedAt: nowISO()
    };
    db.prayerRequests.push(prayer);
    return { overdue: overdue.id, dueToday: dueToday.id, careWindow: careWindow.id, proactive: proactive.id, task: task.id, importantCapture: importantCapture.id, oldestCapture: oldestCapture.id, prayer: prayer.id };
  })()`);
  const queue = appEval("buildTodayRecommendations()");
  assert(queue.slice(0, 8).map(item => item.reasonCode).join("|") === [
    "overdue-person-follow-up",
    "person-follow-up-today",
    "important-task-due-today",
    "important-or-due-capture",
    "prayer-follow-up-due",
    "person-beyond-care-window",
    "oldest-unprocessed-capture",
    "proactive-pastoral-opportunity"
  ].join("|"), "Today follows the required ministry recommendation order");
  assert(queue.every(item => item.reasonCode && item.explanation), "every Today recommendation keeps an internal testable explanation");
  assert(queue.find(item => item.recordId === ids.importantCapture).detail === "Sensitive capture hidden.", "Today masks sensitive capture details");
  assert(queue.find(item => item.recordId === ids.prayer).detail === "Sensitive prayer concern hidden.", "Today masks sensitive prayer details");
  assert(!queue.some(item => item.title.includes("Completed hidden") || item.title.includes("Snoozed hidden") || item.title.includes("Malformed snooze hidden")), "Today excludes completed, snoozed, and malformed-snooze records");
  assert(!queue.some(item => item.reasonCode === "maintenance-backup-only"), "Today defers backup maintenance while meaningful ministry work exists");

  const linkedSensitiveToday = appEval(`(() => {
    const taskPerson = createPerson("Secret Task Person");
    const prayerPerson = createPerson("Secret Prayer Person");
    const capturePerson = createPerson("Secret Capture Person");
    const oldestPerson = createPerson("Secret Oldest Person");
    [taskPerson, prayerPerson, capturePerson, oldestPerson].forEach(person => { person.aiPrivacyTier = "Sensitive"; });
    const task = { id: uid("linked-sensitive-task"), relatedPersonId: taskPerson.id, title: "Meet Secret Task Person about private issue", dueDate: todayISO(), status: "Today / Soon", createdAt: nowISO(), updatedAt: nowISO() };
    const prayer = { id: uid("linked-sensitive-prayer"), relatedPersonId: prayerPerson.id, request: "Secret Prayer Person private prayer detail", followUpDate: todayISO(), status: "Follow-Up Needed", dateAdded: todayISO(), createdAt: nowISO(), updatedAt: nowISO() };
    const capture = makeQuickGrab("Secret Capture Person private capture detail", [], "Important", null, { captureSource: "profile", personId: capturePerson.id });
    capture.relatedPersonId = capturePerson.id;
    const oldest = makeQuickGrab("Secret Oldest Person oldest private capture", [], "Whenever", null, { captureSource: "profile", personId: oldestPerson.id });
    oldest.relatedPersonId = oldestPerson.id;
    oldest.createdAt = daysAgo(40) + "T12:00:00.000Z";
    db.tasks.push(task);
    db.prayerRequests.push(prayer);
    db.quickGrabs.push(capture, oldest);
    const recommendations = buildTodayRecommendations();
    return {
      task: recommendations.find(item => item.recordId === task.id),
      prayer: recommendations.find(item => item.recordId === prayer.id),
      capture: recommendations.find(item => item.recordId === capture.id),
      oldest: recommendations.find(item => item.recordId === oldest.id),
      profileTaskSensitive: profileRecordIsSensitive(task, "tasks")
    };
  })()`);
  assert(linkedSensitiveToday.task.title === "Complete a sensitive follow-up" && linkedSensitiveToday.task.detail === "Sensitive follow-up detail hidden." && !JSON.stringify(linkedSensitiveToday.task).includes("Secret Task Person"), "Today masks normal task titles and details linked to a sensitive person");
  assert(linkedSensitiveToday.prayer.title === "Follow up on a private prayer request" && linkedSensitiveToday.prayer.detail === "Sensitive prayer concern hidden." && !JSON.stringify(linkedSensitiveToday.prayer).includes("Secret Prayer Person"), "Today masks normal prayer text linked to a sensitive person");
  assert(linkedSensitiveToday.capture.detail === "Sensitive capture hidden.", "Today masks important capture text linked to a sensitive person");
  assert(linkedSensitiveToday.oldest.detail === "Sensitive capture hidden.", "Today masks oldest-capture text linked to a sensitive person");
  assert(linkedSensitiveToday.profileTaskSensitive === true, "profile history inherits sensitivity from the linked person");

  const archivedLinked = appEval(`(() => {
    const person = createPerson("Archived Care Person");
    person.status = "Archived";
    db.tasks.push({ id: uid("archived-task"), relatedPersonId: person.id, title: "Archived linked task", dueDate: todayISO(), status: "Today / Soon", createdAt: nowISO(), updatedAt: nowISO() });
    db.prayerRequests.push({ id: uid("archived-prayer"), relatedPersonId: person.id, request: "Archived linked prayer", followUpDate: todayISO(), status: "Follow-Up Needed", createdAt: nowISO(), updatedAt: nowISO() });
    return buildTodayRecommendations().some(item => item.personId === person.id);
  })()`);
  assert(!archivedLinked, "Today excludes tasks and prayers linked to archived people");

  const markup = appEval('view.screen = "today"; renderToday()');
  assert((markup.match(/data-today-section=/g) || []).length === 3, "normal Today renders exactly three primary sections");
  const afterMarkup = markup.split('data-today-section="after"')[1] || "";
  assert((afterMarkup.match(/data-recommendation-id=/g) || []).length <= 2, "After that renders no more than two items");

  appEval(`completeTodayRecommendation("task-due:${ids.task}")`);
  assert(db().tasks.find(task => task.id === ids.task).status === "Done / Archived", "Done completes the selected real task");
  appEval(`postponeTodayRecommendation("person-follow-up:${ids.dueToday}")`);
  assert(view().sheet?.type === "today-later", "Later opens a return-date sheet for a real ministry action");
  makeElement("today-return-date").value = appEval("daysFromNow(2)");
  appEval(`submitTodayLater("person-follow-up:${ids.dueToday}")`);
  assert(!appEval(`buildTodayRecommendations().some(item => item.id === "person-follow-up:${ids.dueToday}")`), "a postponed real action stays hidden until its selected return date");

  const proactiveId = `proactive:${ids.proactive}`;
  appEval(`postponeTodayRecommendation("${proactiveId}")`);
  assert(!appEval(`buildTodayRecommendations().some(item => item.id === "${proactiveId}")`), "a dismissed proactive suggestion does not repeat that day");

  appEval("updateAvailable = true");
  const alertMarkup = appEval("renderTodayCriticalAlert()");
  assert((alertMarkup.match(/data-critical-alert/g) || []).length === 1 && alertMarkup.includes("Update ready"), "Today shows at most one compact critical alert");
  appEval("updateAvailable = false");

  const maintenanceOnly = appEval(`(() => {
    db.people = [];
    db.tasks = [];
    db.prayerRequests = [];
    db.quickGrabs = [{ id: uid("archived-backup-fixture"), status: "Archived", createdAt: nowISO(), updatedAt: nowISO() }];
    settings.backupReminderDays = "1";
    settings.lastBackupAt = daysAgo(3);
    return buildTodayRecommendations();
  })()`);
  assert(maintenanceOnly.length === 1 && maintenanceOnly[0].reasonCode === "maintenance-backup-only", "Today shows backup maintenance only when no meaningful ministry work exists");
}

function testPeopleCardCalmContract() {
  resetApp("demoData()");
  const people = db().people;
  assert(appEval(`personIdentityLine(personById("${people[0].id}"))`) === "Student · Leadership team", "People identity chooses at most two useful pieces");
  assert(appEval(`personIdentityLine(personById("${people[1].id}"))`) === "Student · SAE", "People identity favors a useful student affiliation");
  assert(appEval(`personIdentityLine(personById("${people[2].id}"))`) === "Donor · Monthly supporter", "People identity uses grounded donor status");
  appEval(`personById("${people[0].id}").donorStatus = "Dormant supporter"`);
  assert(appEval(`personIdentityLine(personById("${people[0].id}"))`) === "Student · Leadership team", "student identity is not displaced by unrelated donor metadata");
  const formerId = appEval(`(() => { const person = createPerson("Former Student"); person.personType = "Former student"; person.hometown = "Birmingham"; person.rufInvolvement = ""; person.status = "Active"; return person.id; })()`);
  assert(appEval(`personIdentityLine(personById("${formerId}"))`) === "Former student · Birmingham", "former-student identity favors a useful hometown");

  const initialsCard = appEval(`renderPersonListCard(personById("${people[0].id}"))`);
  assert(initialsCard.includes('data-person-thumbnail="initials"') && initialsCard.includes(">AB<"), "People card uses initials when no photo exists");
  assert(initialsCard.includes('class="person-card-open"') && (initialsCard.match(/data-action="person-open"/g) || []).length === 1, "the whole People card is one semantic open control");
  assert(initialsCard.includes(appEval(`formatFollowUpDate(personById("${people[0].id}").nextFollowUpDate)`)), "People card shows one contextual next follow-up date");
  assert(initialsCard.includes("Ask how exam week settled."), "People card shows a useful concise follow-up reason");
  assert(!/person-pin|person-followed-up|Open Profile|Created|Updated|Preferred contact/i.test(initialsCard), "People card has no action cluster, timestamps, or preferred-contact UI");

  appEval(`personById("${people[0].id}").photoDataUrl = "data:image/jpeg;base64,synthetic"`);
  const photoCard = appEval(`renderPersonListCard(personById("${people[0].id}"))`);
  assert(photoCard.includes('data-person-thumbnail="photo"') && photoCard.includes('width="48" height="48"'), "People photo has fixed geometry before image decode");
  assert(photoCard.includes('alt=""') && photoCard.includes('loading="lazy"'), "People thumbnail is decorative beside the visible name and loads quietly");

  const sparseId = appEval(`(() => { const person = createPerson("A Very Long Synthetic Name That Must Wrap Calmly Without Moving The Photo"); person.followUpReason = ""; person.nextFollowUpDate = ""; return person.id; })()`);
  const sparseCard = appEval(`renderPersonListCard(personById("${sparseId}"))`);
  assert(sparseCard.includes("No follow-up planned") && !sparseCard.includes("person-card-reason"), "sparse People cards stay useful without invented reason text");
  appEval(`personById("${sparseId}").nextFollowUpDate = daysFromNow(2); personById("${sparseId}").followUpReason = "Private synthetic follow-up"; personById("${sparseId}").aiPrivacyTier = "Sensitive"`);
  assert(appEval(`usefulFollowUpReason(personById("${sparseId}"))`) === "Sensitive follow-up detail hidden.", "People masks a sensitive follow-up reason");
  appEval(`personById("${sparseId}").nextFollowUpDate = "bad-date"`);
  assert(appEval(`usefulFollowUpReason(personById("${sparseId}"))`) === "", "People hides stale reasons when no valid follow-up is planned");
  assert(html.includes(".person-thumbnail") && html.includes("width: 48px") && html.includes("overflow-wrap: anywhere"), "People card geometry supports no-photo and long-name cases");
  assert(html.includes(':where(button, [role="button"], a, input, select, textarea, summary):focus-visible') && !html.includes(".person-card-open:focus-visible"), "People card keeps the shared high-contrast focus indicator");
  assert(html.includes("restoredSearch.focus({ preventScroll: true })") && html.includes("restoredSearch.setSelectionRange(caret, caret)"), "People search restores focus and caret after filtered rendering");
  assert(html.includes("let globalSearchTimer = null") && html.includes("}, 120);"), "global Search debounces rerenders while preserving the typed fragment");

  const peopleMarkup = appEval('view.screen = "people"; renderPeople()');
  assert(peopleMarkup.includes("Who are you looking for or caring for?") && peopleMarkup.includes('aria-label="People"'), "People asks one calm screen question");
  assert(!peopleMarkup.includes("Preferred contact") && !peopleMarkup.includes("Created") && !peopleMarkup.includes("Updated"), "People list omits dormant and administrative metadata");
}

async function testAdversarialCalmOsDataShapes() {
  resetApp("emptyData()");
  appEval('settings.backupReminderDays = "0"');
  const emptyToday = appEval("renderToday()");
  assert(emptyToday.includes("Nothing is pressing") && (emptyToday.match(/data-today-section=/g) || []).length === 3, "empty database keeps the complete calm Today contract");

  const largePeople = appEval(`(() => {
    const longName = "Alexandria " + "Verylongministryname".repeat(18) + " Rivera";
    db.people = Array.from({ length: 500 }, (_, index) => ({
      id: "adversarial_person_" + index,
      name: index === 0 ? longName : "Synthetic Person " + String(index).padStart(3, "0"),
      personType: index % 2 ? "Student" : "Donor",
      careLevel: "Get to know",
      rufInvolvement: index % 3 ? "" : "Leadership team",
      nextFollowUpDate: index % 17 ? "" : "corrupt-date",
      followUpReason: "",
      photoDataUrl: ""
    }));
    view.screen = "people";
    view.search = "";
    view.peopleVisibleLimit = PEOPLE_BATCH_SIZE;
    const first = renderPeople();
    view.peopleVisibleLimit += PEOPLE_BATCH_SIZE;
    const second = renderPeople();
    return { first, second, longName };
  })()`);
  assert((largePeople.first.match(/data-person-card=/g) || []).length === 40 && largePeople.first.includes("Showing 40 of 500 people"), "hundreds of people render in a bounded first batch");
  assert((largePeople.second.match(/data-person-card=/g) || []).length === 80 && largePeople.second.includes("Showing 80 of 500 people"), "People progressive disclosure preserves access without a 500-card initial render");
  assert(largePeople.first.includes(largePeople.longName) && largePeople.first.includes('data-person-thumbnail="initials"'), "very long names and no-photo initials remain available in the bounded People list");
  assert(!largePeople.first.includes("Invalid Date") && !largePeople.first.includes("NaN"), "corrupt People dates do not leak broken date text");

  const largeSearch = appEval(`(() => {
    view.searchVisibleLimits = {};
    const results = buildSearchResults("Synthetic Person");
    const first = renderSearchResults(results);
    view.searchVisibleLimits.people = 60;
    const second = renderSearchResults(results);
    return { first, second, stored: results.find(group => group.key === "people").items.length };
  })()`);
  assert(largeSearch.stored === 499 && (largeSearch.first.match(/class="item compact focus-card"/g) || []).length === 30 && largeSearch.first.includes("Showing 30 of 499 people"), "hundreds of Search matches render in a bounded first batch");
  assert((largeSearch.second.match(/class="item compact focus-card"/g) || []).length === 60 && largeSearch.second.includes("Showing 60 of 499 people"), "Search progressive disclosure preserves access to later matches");

  const duplicateScale = appEval(`(() => {
    db.people = Array.from({ length: 500 }, (_, index) => ({
      id: "unique_duplicate_" + index,
      name: "Unique" + String(index).padStart(4, "0") + " Surname" + String(index).padStart(4, "0")
    }));
    const original = levenshtein;
    let calls = 0;
    levenshtein = (...args) => { calls += 1; return original(...args); };
    const pairs = duplicatePersonPairs(db.people);
    levenshtein = original;
    const created = createPerson("N".repeat(1000));
    return { calls, pairs: pairs.length, createdLength: created.name.length, boundedDistance: levenshtein("a".repeat(1000), "z".repeat(1000), 3) };
  })()`);
  assert(duplicateScale.calls <= 12000 && duplicateScale.pairs <= 12, "500 names keep duplicate comparison work and advisory results under deterministic ceilings");
  assert(duplicateScale.createdLength === 120 && duplicateScale.boundedDistance > 3 && html.includes('maxlength="120"'), "new-person names and fuzzy comparison work are bounded while legacy imported display remains nondestructive");

  resetApp("emptyData()");
  const searchPrivacy = appEval(`(() => {
    const person = createPerson("Sensitive Search Person");
    person.followUpReason = "Private pastoral search phrase";
    person.aiPrivacyTier = "Do Not Send to AI";
    person.sensitiveFlag = true;
    const task = createProfileFollowUpRecord(person.id, { title: "Private task search phrase", dueDate: todayISO(), sensitiveFlag: true, updatePersonDates: false });
    const linkedPrayer = createProfilePrayerRecord(person.id, { request: "Private linked prayer phrase", dateAdded: todayISO(), sensitivityLevel: "Normal" });
    const linkedGrab = makeQuickGrab("Private linked capture phrase", [], "Whenever", null, { captureSource: "profile", personId: person.id });
    linkedGrab.relatedPersonId = person.id;
    db.quickGrabs.push(linkedGrab);
    settings.includeSensitiveInSearch = false;
    settings.maskSensitivePreviews = true;
    const excluded = JSON.stringify(buildSearchResults("Private"));
    settings.includeSensitiveInSearch = true;
    const masked = JSON.stringify(buildSearchResults("Private"));
    settings.maskSensitivePreviews = false;
    const revealed = JSON.stringify(buildSearchResults("Private"));
    return { excluded, masked, revealed, taskId: task.id, linkedPrayerId: linkedPrayer.id, linkedGrabId: linkedGrab.id };
  })()`);
  assert(!searchPrivacy.excluded.includes("Private pastoral search phrase") && !searchPrivacy.excluded.includes("Private task search phrase") && !searchPrivacy.excluded.includes("Private linked prayer phrase") && !searchPrivacy.excluded.includes("Private linked capture phrase") && !searchPrivacy.excluded.includes("Sensitive Search Person"), "Search excludes sensitive private text and linked identities unless sensitive search is explicitly enabled");
  assert(searchPrivacy.masked.includes("Sensitive care detail hidden") && searchPrivacy.masked.includes("Sensitive follow-up task") && searchPrivacy.masked.includes("Sensitive grabbed item - open to process") && !searchPrivacy.masked.includes("Private pastoral search phrase") && !searchPrivacy.masked.includes("Private task search phrase") && !searchPrivacy.masked.includes("Private linked capture phrase"), "enabled sensitive Search still masks private previews by default");
  assert(searchPrivacy.revealed.includes("Private pastoral search phrase") && searchPrivacy.revealed.includes("Private task search phrase"), "private Search text appears only after both explicit search and preview settings allow it");

  resetApp("emptyData()");
  const missingDates = appEval(`(() => {
    db.quickGrabs = [
      { ...makeQuickGrab("Missing created date"), id: "missing_created", createdAt: "" },
      { ...makeQuickGrab("Valid created date"), id: "valid_created", createdAt: nowISO() }
    ];
    db.prayerRequests = [
      { id: "missing_prayer_date", relatedPersonId: "", request: "No date", status: "Active", sensitivityLevel: "Normal", dateAdded: "", createdAt: "" },
      { id: "valid_prayer_date", relatedPersonId: "", request: "Has date", status: "Active", sensitivityLevel: "Normal", dateAdded: todayISO(), createdAt: nowISO() }
    ];
    view.prayerFilter = "Recently Added";
    return { captures: openQuickGrabs().length, prayers: getFilteredPrayers().length, markup: renderPrayerRequests() };
  })()`);
  assert(missingDates.captures === 2 && missingDates.prayers === 2 && !missingDates.markup.includes("Invalid Date"), "missing capture and prayer dates sort and render without crashing or inventing broken dates");

  resetApp("emptyData()");
  const overdue = appEval(`(() => {
    const recent = createPerson("Recently Overdue");
    recent.nextFollowUpDate = daysAgo(1);
    const oldest = createPerson("Most Overdue");
    oldest.nextFollowUpDate = daysAgo(21);
    const middle = createPerson("Middle Overdue");
    middle.nextFollowUpDate = daysAgo(8);
    const prayer = {
      id: "adversarial_sensitive_prayer", relatedPersonId: "", request: "Synthetic private prayer detail",
      dateAdded: todayISO(), status: "Follow-Up Needed", sensitivityLevel: "Sensitive", followUpDate: todayISO(),
      shareableStatus: "Private", createdAt: nowISO(), updatedAt: nowISO()
    };
    db.prayerRequests.push(prayer);
    const queue = buildTodayRecommendations();
    return { queue, oldestId: oldest.id, prayerId: prayer.id };
  })()`);
  assert(overdue.queue[0].recordId === overdue.oldestId && overdue.queue[0].reasonCode === "overdue-person-follow-up", "multiple overdue people deterministically choose the longest-overdue follow-up");
  assert(overdue.queue.find(item => item.recordId === overdue.prayerId).detail === "Sensitive prayer concern hidden.", "adversarial sensitive prayer text remains masked in recommendations");

  resetApp("emptyData()");
  const extensiveProfile = appEval(`(() => {
    const person = createPerson("Extensive History Person");
    for (let index = 0; index < 300; index += 1) {
      createProfileNoteRecord(person.id, {
        content: "Synthetic historical note " + index,
        noteDate: index % 29 === 0 ? "bad-date" : daysAgo(index % 365),
        noteType: "Care note"
      });
    }
    view.screen = "person";
    view.personId = person.id;
    const markup = renderPersonProfile();
    return { markup, storedNotes: db.notes.length };
  })()`);
  assert(extensiveProfile.storedNotes === 300 && (extensiveProfile.markup.match(/data-profile-preview="notes"/g) || []).length === 3, "extensive profile history stays stored while the initial Notes preview remains bounded");
  assert((extensiveProfile.markup.match(/data-profile-preview="timeline"/g) || []).length === 3 && extensiveProfile.markup.length < 80000, "extensive history keeps the normal profile output bounded and story-first");
  const expandedHistory = appEval(`(() => {
    toggleProfileHistory("notes");
    const first = renderPersonProfile();
    showMoreProfileHistory("notes");
    const second = renderPersonProfile();
    view.profileHistoryVisibleLimits.notes = 500;
    const all = renderPersonProfile();
    return { first, second, all, stored: db.notes.length };
  })()`);
  assert((expandedHistory.first.match(/data-profile-preview="notes"/g) || []).length === 50 && expandedHistory.first.includes("Showing 50 of 300 notes"), "View all history begins with a bounded 50-record batch");
  assert((expandedHistory.second.match(/data-profile-preview="notes"/g) || []).length === 100 && expandedHistory.second.includes("Showing 100 of 300 notes"), "expanded history reveals additional records in calm batches");
  assert((expandedHistory.all.match(/data-profile-preview="notes"/g) || []).length === 300 && expandedHistory.stored === 300, "progressive history disclosure retains complete access to every stored record");

  resetApp("emptyData()");
  const ambiguousMatch = appEval(`(() => {
    const smith = createPerson("Alex Smith");
    const jones = createPerson("Alex Jones");
    const grab = makeQuickGrab("Met Alex for coffee and follow up tomorrow", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(grab);
    const proposal = createQuickGrabMockAiProposal(grab.id);
    const executable = allExecutableAiActionIndexes(proposal);
    const validation = validateAiActionExecution(proposal, executable, { enforcePersonChoice: true });
    return {
      smith: smith.id,
      jones: jones.id,
      grabPerson: grab.relatedPersonId,
      possiblePersonId: proposal.result.possiblePersonId,
      possiblePersonIds: proposal.result.possiblePersonIds,
      ambiguous: proposal.result.personMatchAmbiguous,
      confidence: proposal.confidence,
      existingPersonId: validation.existingPersonId,
      personErrors: validation.personResolutionErrors,
      records: db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length
    };
  })()`);
  assert(ambiguousMatch.ambiguous && ambiguousMatch.confidence === "low" && ambiguousMatch.possiblePersonIds.length === 2, "same-first-name capture is classified as a low-confidence ambiguous match");
  assert(ambiguousMatch.grabPerson === "" && ambiguousMatch.possiblePersonId === "" && ambiguousMatch.existingPersonId === "" && ambiguousMatch.personErrors.length > 0, "ambiguous capture never preselects either person and requires an explicit choice");
  assert(ambiguousMatch.records === 0, "ambiguous matching creates no structured record before human resolution and approval");

  resetApp("emptyData()");
  makeElement("quick-text").value = "Repeated tap capture stays singular";
  sandbox.__repeatCaptureButton = { dataset: { target: "quick-text" }, disabled: false };
  appEval('submitUnifiedCapture("main", "", "later", __repeatCaptureButton)');
  appEval('submitUnifiedCapture("main", "", "later", __repeatCaptureButton)');
  assert(db().quickGrabs.length === 1 && sandbox.__repeatCaptureButton.disabled, "repeated capture taps create one saved raw capture");

  let oversizedPhotoRejected = false;
  try {
    await appEval('resizeProfilePhoto({ type: "image/jpeg", size: 21 * 1024 * 1024 })');
  } catch (error) {
    oversizedPhotoRejected = /smaller than 8 MB/.test(String(error?.message || error));
  }
  assert(oversizedPhotoRejected && html.includes('const maxSide = 360') && html.includes('36_000_000') && html.includes('toDataURL("image/jpeg", 0.78)'), "oversized and high-pixel photos fail before canvas resize while accepted photos retain bounded output");

  assert(html.includes("@media (max-width: 980px)") && html.includes("@media (max-width: 560px)") && html.includes("orientation: landscape") && html.includes("env(safe-area-inset-right)"), "390px, 430px, and landscape layout contracts retain responsive safe-area rules");
}

async function testUnavailableCaptureProcessing() {
  resetApp("emptyData()");
  const fallbackId = appEval(`(() => {
    settings.quickGrabAiMode = "backendQuickGrab";
    settings.aiMockMode = true;
    const grab = makeQuickGrab("Offline fallback capture", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(grab);
    return grab.id;
  })()`);
  sandbox.fetch = async () => { throw new Error("synthetic offline"); };
  await appEval(`createQuickGrabBackendAiProposal("${fallbackId}")`);
  assert(db().quickGrabs[0].rawContent === "Offline fallback capture" && db().quickGrabs[0].processingState === "review" && db().aiProposals.length === 1, "offline backend processing preserves capture and safely falls back to one local proposal");

  resetApp("emptyData()");
  const failedId = appEval(`(() => {
    settings.quickGrabAiMode = "backendQuickGrab";
    settings.aiMockMode = false;
    const grab = makeQuickGrab("Offline retry capture", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(grab);
    return grab.id;
  })()`);
  await appEval(`createQuickGrabBackendAiProposal("${failedId}")`);
  assert(db().quickGrabs[0].rawContent === "Offline retry capture" && db().quickGrabs[0].processingState === "failed" && db().aiProposals.length === 0, "unavailable AI without local fallback leaves one retryable unprocessed capture and no partial proposal");

  resetApp("emptyData()");
  const blockedLinkedId = appEval(`(() => {
    settings.quickGrabAiMode = "backendQuickGrab";
    settings.aiMockMode = false;
    const person = createPerson("Blocked linked person");
    person.aiPrivacyTier = "Do Not Send to AI";
    const grab = makeQuickGrab("Raw text names no person but is linked", [], "Whenever", null, { captureSource: "profile", personId: person.id });
    grab.relatedPersonId = person.id;
    db.quickGrabs.push(grab);
    return grab.id;
  })()`);
  let blockedFetchCalls = 0;
  sandbox.fetch = async () => { blockedFetchCalls += 1; throw new Error("must not send"); };
  await appEval(`createQuickGrabBackendAiProposal("${blockedLinkedId}")`);
  assert(blockedFetchCalls === 0 && db().quickGrabs[0].processingState === "failed", "backend Quick Grab blocks raw text linked to a Do Not Send person before network use");
  delete sandbox.fetch;
}

function testCalmProfileContract() {
  resetApp("emptyData()");
  const ids = appEval(`(() => {
    const person = createPerson("Jordan Rivera", "555-0188");
    person.personType = "Student";
    person.rufInvolvement = "Leadership team";
    person.careLevel = "Check in soon";
    person.lastMeaningfulInteraction = daysAgo(14);
    person.nextFollowUpDate = daysFromNow(1);
    person.followUpReason = "Ask how the transition is going";
    for (let index = 0; index < 5; index += 1) {
      createProfileNoteRecord(person.id, { content: index === 0 ? "Saved note 0 " + "x".repeat(220) + " FULL END" : "Saved note " + index, noteDate: daysAgo(index), noteType: "Care note" });
    }
    const meeting = createProfileMeetingRecord(person.id, {
      summary: "Synthetic meeting summary",
      whatToRemember: "Private grounded memory",
      nextFaithfulStep: "Ask about the saved next step",
      meetingDate: daysAgo(2),
      sensitiveFlag: true,
      updatePersonDates: false
    });
    const prayer = createProfilePrayerRecord(person.id, { request: "Private grounded prayer concern", sensitiveFlag: true });
    const task = createProfileFollowUpRecord(person.id, { title: "Send the saved check-in", dueDate: todayISO(), updatePersonDates: false });
    for (let index = 0; index < 3; index += 1) {
      createProfileMeetingRecord(person.id, { summary: "Older meeting " + index, whatToRemember: "Older memory " + index, meetingDate: daysAgo(index + 5), updatePersonDates: false });
      createProfilePrayerRecord(person.id, { request: "Older prayer " + index, dateAdded: daysAgo(index + 5) });
      createProfileFollowUpRecord(person.id, { title: "Later task " + index, dueDate: daysFromNow(index + 3), updatePersonDates: false });
    }
    view.screen = "person";
    view.personId = person.id;
    return { person: person.id, meeting: meeting.id, prayer: prayer.id, task: task.id };
  })()`);

  const profile = appEval("renderPersonProfile()");
  assert(profile.includes('data-profile-essential') && profile.includes("Jordan Rivera") && profile.includes("Student · Leadership team"), "profile header answers who this person is");
  assert(profile.includes("Check in soon") && profile.includes("Met 2 weeks ago") && profile.includes("Follow up tomorrow") && profile.includes("Phone 555-0188"), "profile header shows grounded care and contextual contact timing");
  assert((profile.match(/data-right-now-key=/g) || []).length === 4 && profile.includes("Pray:") && profile.includes("Next thing:") && profile.includes("Remember:") && profile.includes("Reminder:"), "Right Now contains exactly four grounded care prompts");
  assert(profile.includes("Sensitive prayer concern hidden.") && profile.includes("Sensitive saved detail hidden.") && profile.includes("Send the saved check-in"), "Right Now masks sensitive evidence and keeps a grounded next action");

  const linkedPrayerPrivacy = appEval(`(() => {
    const person = createPerson("Prayer-linked privacy person");
    const prayer = createProfilePrayerRecord(person.id, { request: "Sensitive prayer-linked task source", sensitiveFlag: true, updatePersonDates: false });
    const task = createProfileFollowUpRecord(person.id, { title: "Raw linked prayer task detail", dueDate: todayISO(), updatePersonDates: false });
    task.relatedPrayerRequestId = prayer.id;
    const rightNowMarkup = renderProfileRightNow(buildProfileRightNow(person.id));
    const previewMarkup = renderProfilePreview("tasks", task);
    const briefing = buildLocalPersonBriefing(person.id);
    const followReview = buildFollowUpDraftContextReview("followUpTask", task.id);
    const followContext = followUpDraftAllowedContext("followUpTask", task.id);
    const janitor = dataJanitorAllowedRecordsByCollection();
    const weekly = weeklyResetAllowedRecordsByCollection();
    return {
      tier: aiPrivacyTierForRecord(task, "tasks"),
      rightNowMarkup,
      previewMarkup,
      briefingText: JSON.stringify(briefing),
      followBlocked: followReview.blocked,
      followSourceAllowed: Boolean(followContext.source),
      janitorAllowed: janitor.tasks.allowed.some(record => record.id === task.id),
      weeklyAllowed: weekly.tasks.allowed.some(record => record.id === task.id)
    };
  })()`);
  assert(linkedPrayerPrivacy.tier === "Sensitive" && linkedPrayerPrivacy.rightNowMarkup.includes("Sensitive action detail hidden.") && !linkedPrayerPrivacy.rightNowMarkup.includes("Raw linked prayer task detail"), "Right Now masks a normal task linked to a sensitive prayer");
  assert(linkedPrayerPrivacy.previewMarkup.includes("Sensitive saved detail hidden.") && !linkedPrayerPrivacy.previewMarkup.includes("Raw linked prayer task detail"), "profile history masks a normal task linked to a sensitive prayer");
  assert(!linkedPrayerPrivacy.briefingText.includes("Raw linked prayer task detail") && linkedPrayerPrivacy.followBlocked && !linkedPrayerPrivacy.followSourceAllowed, "Brief Me and Follow Up block a task linked to a sensitive prayer");
  assert(!linkedPrayerPrivacy.janitorAllowed && !linkedPrayerPrivacy.weeklyAllowed, "Data Janitor and Weekly Reset exclude tasks linked to a sensitive prayer");
  assert(profile.includes('data-capture-composer="profile"') && profile.includes("Add something about Jordan…") && profile.includes("Person locked for this capture") && profile.includes("Change person"), "profile uses the shared person-locked capture composer");
  assert((profile.match(/class="button primary"/g) || []).length === 1 && profile.includes("Brief Me") && profile.includes("Follow Up"), "profile has one primary Process action and two visible secondary care actions");
  assert(profile.includes('<details class="profile-details"') && profile.includes("More actions"), "profile administration stays inside collapsed Profile Details and More");
  assert(!profile.includes("Quick Actions") && !profile.includes("Preferred contact") && !profile.includes("Created:") && !profile.includes("Updated:"), "normal profile removes direct-create, dormant, and timestamp clutter");

  ["notes", "meetings", "prayers", "tasks", "timeline"].forEach(key => {
    assert(profile.includes(`data-profile-history="${key}"`), `nonempty ${key} profile history stays separate`);
    assert((profile.match(new RegExp(`data-profile-preview="${key}"`, "g")) || []).length <= 3, `${key} profile history starts with at most three records`);
  });
  assert((profile.match(/data-profile-preview="notes"/g) || []).length === 3, "profile initially shows at most three recent notes");
  assert(profile.includes('data-action="profile-history-toggle" data-id="notes"') && profile.includes("View all"), "profile offers View all when more history exists");
  const expanded = appEval('toggleProfileHistory("notes"); renderPersonProfile()');
  assert((expanded.match(/data-profile-preview="notes"/g) || []).length === 5 && expanded.includes("Show recent") && expanded.includes("FULL END"), "View all restores complete untruncated note access on demand");

  const countsBefore = `${db().notes.length}|${db().meetingNotes.length}|${db().prayerRequests.length}|${db().tasks.length}|${db().aiProposals.length}`;
  appEval(`settings.aiMockMode = false; openProfileBrief("${ids.person}")`);
  const briefMarkup = appEval("renderSheet()");
  assert(view().sheet?.type === "person-brief" && briefMarkup.includes("Grounded local briefing") && briefMarkup.includes("Useful questions"), "Brief Me opens a useful local briefing immediately");
  assert(briefMarkup.includes("Sensitive context warning") && briefMarkup.includes("No AI or network connection is required"), "Brief Me warns about sensitive context and works without AI");
  assert(`${db().notes.length}|${db().meetingNotes.length}|${db().prayerRequests.length}|${db().tasks.length}|${db().aiProposals.length}` === countsBefore, "Brief Me creates no proposals or permanent records");

  appEval(`openProfileFollowUp("${ids.person}")`);
  const followMarkup = appEval("renderSheet()");
  assert(view().sheet?.type === "profile-followup" && followMarkup.includes("Hey Jordan") && followMarkup.includes("Short") && followMarkup.includes("Casual") && followMarkup.includes("Pastoral"), "Follow Up opens an immediate draft with quiet tone variants");
  const datesBeforeDraft = `${db().people[0].lastMeaningfulInteraction}|${db().people[0].nextFollowUpDate}`;
  appEval(`copyProfileFollowUpDraft("${ids.person}", 0)`);
  assert(`${db().people[0].lastMeaningfulInteraction}|${db().people[0].nextFollowUpDate}` === datesBeforeDraft && db().aiProposals.length === 0, "copying a Follow Up draft sends nothing and completes nothing");

  appEval("settings.enableAutoSave = true");
  const otherId = appEval('createPerson("Taylor Morgan").id');
  makeElement("profile-capture-text").value = "Transfer this interrupted profile draft";
  appEval(`view.sheet = null; openProfileCapturePersonSheet("${ids.person}")`);
  assert(view().sheet?.type === "capture-person", "Change person opens a quiet locked-context chooser");
  makeElement("sheet-capture-person").value = otherId;
  const structuredBeforeChange = `${db().notes.length}|${db().meetingNotes.length}|${db().prayerRequests.length}|${db().tasks.length}`;
  appEval("submitProfileCapturePersonSheet()");
  assert(appEval("view.profileCapturePersonId") === otherId && appEval(`loadAutosaveDrafts()[captureDraftKey("profile", "${otherId}")].fields["profile-capture-text"]`) === "Transfer this interrupted profile draft", "Change person moves the recoverable draft to the new locked target");
  assert(`${db().notes.length}|${db().meetingNotes.length}|${db().prayerRequests.length}|${db().tasks.length}` === structuredBeforeChange, "Change person creates no records and updates no profile");
  const recoveredTargetMarkup = appEval(`view.profileCaptureOwnerId = ""; view.profileCapturePersonId = ""; view.profileCaptureDraftText = ""; view.profileCaptureDraftTargetId = ""; renderPersonProfile()`);
  assert(appEval("view.profileCapturePersonId") === otherId && recoveredTargetMarkup.includes("For Taylor Morgan"), "profile capture restores its changed locked person after a refresh-like view reset");

  resetApp("emptyData()");
  appEval(`const sparse = createPerson("Sparse Person"); sparse.lastMeaningfulInteraction = "bad-date"; sparse.nextFollowUpDate = "also-bad"; view.screen = "person"; view.personId = sparse.id;`);
  const sparseProfile = appEval("renderPersonProfile()");
  assert(!sparseProfile.includes("data-profile-history=") && sparseProfile.includes("No active prayer concern saved.") && sparseProfile.includes("No current action saved."), "empty or corrupt-date profiles stay calm without invented history");
  const snoozedPrayer = appEval(`(() => {
    const prayer = { id: uid("snoozed-prayer"), relatedPersonId: sparse.id, request: "Future snoozed concern", status: "Active", snoozedUntil: daysFromNow(4), dateAdded: todayISO(), createdAt: nowISO(), updatedAt: nowISO() };
    db.prayerRequests.push(prayer);
    return buildProfileRightNow(sparse.id).pray.text;
  })()`);
  assert(snoozedPrayer === "No active prayer concern saved.", "Right Now excludes future-snoozed prayer concerns");
  appEval(`openProfileBrief(view.personId)`);
  assert(appEval("renderSheet()").includes("very little saved"), "Brief Me states plainly when little information exists");
}

function testExportAndPrivacyHelpers() {
  resetApp("demoData()");
  const payload = appEval("currentPortablePayload()");
  assert(payload.version === 2 && payload.data.people.length > 0, "portable export payload includes current data");

  const backupHealthMarkup = appEval("renderBackupHealthCard()");
  assert(backupHealthMarkup.includes("Backup Health"), "backup health card renders in settings");
  assert(appEval("backupHealthState().label") === "No backup yet", "backup health notices missing backup");
  assert(appEval("backupHealthState().action") === "export-encrypted-json", "backup health chooses encrypted action for sensitive data");

  appEval("exportJson()");
  assert(downloadEvents.length === 1 && downloadEvents[0].download.includes("ruf-ministry-hub-export-"), "JSON export triggers a download");
  assert(appEval("settings.lastBackupAt") !== "", "JSON export records backup timestamp");
  assert(appEval("backupHealthState().label") !== "No backup yet", "backup health updates after export");

  assert(appEval('maskedText(true, "Hidden", "Visible")') === "Hidden", "sensitive previews are masked when enabled");
  appEval("settings.maskSensitivePreviews = false");
  assert(appEval('maskedText(true, "Hidden", "Visible")') === "Visible", "sensitive previews can be revealed by setting");
}

function testAutoMemoryVault() {
  resetApp("emptyData()");
  assert(appEval("settings.autoMemoryVaultEnabled") === true, "Auto Memory Vault is on by default");
  assert(appEval("autoMemoryVaultState().label") === "Waiting", "Auto Memory starts waiting for first saved change");

  appEval('createPerson("Saved Person", "555-0100"); saveData();');
  assert(appEval("loadAutoMemoryVault().snapshots.length") === 1, "Auto Memory creates a restore point after saved data changes");
  assert(appEval("autoMemoryVaultState().label") === "Auto saved", "Auto Memory reports saved state after snapshot");
  const firstSnapshotId = appEval("loadAutoMemoryVault().snapshots[0].id");

  appEval('createPerson("Later Person", "555-0200"); saveData();');
  assert(db().people.length === 2, "test setup has later app state");
  assert(appEval("loadAutoMemoryVault().snapshots.length") === 2, "Auto Memory keeps multiple restore points");

  appEval('openAutoMemorySheet("list")');
  const listMarkup = appEval("renderSheet()");
  assert(listMarkup.includes("Auto Memory Vault") && listMarkup.includes("Restore"), "Auto Memory restore list renders");

  appEval(`openAutoMemorySheet("restore", "${firstSnapshotId}")`);
  appEval(`submitAutoMemorySheet("restore", "${firstSnapshotId}")`);
  assert(db().people.length === 2, "Auto Memory restore sheet blocks unchecked restore");
  makeElement("sheet-auto-memory-confirm").checked = true;
  appEval(`submitAutoMemorySheet("restore", "${firstSnapshotId}")`);
  assert(db().people.length === 1 && db().people[0].name === "Saved Person", "Auto Memory restore replaces current local app state");

  const deleteSnapshotId = appEval("loadAutoMemoryVault().snapshots[0].id");
  appEval(`openAutoMemorySheet("delete", "${deleteSnapshotId}")`);
  makeElement("sheet-auto-memory-confirm").checked = true;
  appEval(`submitAutoMemorySheet("delete", "${deleteSnapshotId}")`);
  assert(appEval(`!loadAutoMemoryVault().snapshots.some(snapshot => snapshot.id === "${deleteSnapshotId}")`), "Auto Memory can delete one restore point");

  appEval(`
    settings.autoMemorySnapshotLimit = "3";
    ["A", "B", "C", "D"].forEach(name => {
      createPerson(name);
      saveData();
    });
  `);
  assert(appEval("loadAutoMemoryVault().snapshots.length") <= 3, "Auto Memory respects the restore point limit");

  appEval("settings.autoMemoryVaultEnabled = false; saveSettings();");
  const pausedMarkup = appEval("renderAutoMemoryVaultCard()");
  assert(pausedMarkup.includes("Paused"), "Auto Memory card shows paused state when disabled");
}

async function testSecuritySheets() {
  resetApp("demoData()");
  appEval('openSecuritySheet("pin-set")');
  assert(view().sheet && view().sheet.type === "security", "PIN setup sheet opens");
  makeElement("sheet-pin-new").value = "123";
  makeElement("sheet-pin-confirm").value = "123";
  await appEval('submitSecuritySheet("pin-set")');
  assert(!appEval("settings.pinHash"), "PIN setup sheet rejects short PIN");
  makeElement("sheet-pin-new").value = "1234";
  makeElement("sheet-pin-confirm").value = "4321";
  await appEval('submitSecuritySheet("pin-set")');
  assert(!appEval("settings.pinHash"), "PIN setup sheet rejects mismatched PIN");
  makeElement("sheet-pin-new").value = "1234";
  makeElement("sheet-pin-confirm").value = "1234";
  await appEval('submitSecuritySheet("pin-set")');
  assert(appEval("settings.appLockEnabled") === true && appEval("settings.pinHash") !== "", "PIN setup sheet enables app lock");
  assert(view().sheet === null, "PIN setup sheet closes after save");

  appEval('openSecuritySheet("pin-clear")');
  makeElement("sheet-pin-current").value = "0000";
  await appEval('submitSecuritySheet("pin-clear")');
  assert(appEval("settings.appLockEnabled") === true, "PIN clear sheet rejects wrong PIN");
  assert(view().sheet && view().sheet.kind === "pin-clear", "PIN clear sheet stays open after wrong PIN");
  makeElement("sheet-pin-current").value = "1234";
  await appEval('submitSecuritySheet("pin-clear")');
  assert(appEval("settings.appLockEnabled") === false && appEval("settings.pinHash") === "", "PIN clear sheet turns off app lock");

  appEval('openSecuritySheet("vault-enable")');
  assert(view().sheet && view().sheet.kind === "vault-enable", "Device Vault setup sheet opens");
  assert(appEval("loadAutoMemoryVault().snapshots.length > 0"), "Auto Memory has local snapshots before Device Vault setup");
  makeElement("sheet-vault-passphrase").value = "vault-passphrase";
  makeElement("sheet-vault-confirm").value = "vault-passphrase";
  makeElement("sheet-vault-hint").value = "safe hint";
  await appEval('submitSecuritySheet("vault-enable")');
  assert(appEval("settings.localEncryptionEnabled") === true, "Device Vault setup sheet enables encryption");
  assert(appEval("encryptedVaultExists()") === true, "Device Vault setup sheet creates encrypted vault");
  assert(appEval("settings.localEncryptionHint") === "safe hint", "Device Vault setup sheet saves hint");
  assert(appEval("localStorage.getItem(AUTO_MEMORY_KEY) === null"), "Device Vault removes plaintext Auto Memory snapshots");
  assert(appEval("loadAutoMemoryVault().snapshots.length > 0"), "Device Vault keeps Auto Memory snapshots in encrypted cache");

  appEval('openSecuritySheet("vault-disable")');
  await appEval('submitSecuritySheet("vault-disable")');
  assert(appEval("settings.localEncryptionEnabled") === true, "Device Vault disable sheet blocks unchecked disable");
  makeElement("sheet-vault-disable-confirm").checked = true;
  await appEval('submitSecuritySheet("vault-disable")');
  assert(appEval("settings.localEncryptionEnabled") === false, "Device Vault disable sheet turns off encryption");
  assert(appEval("encryptedVaultExists()") === false, "Device Vault disable sheet removes encrypted vault");
  assert(appEval("localStorage.getItem(AUTO_MEMORY_KEY) !== null"), "Device Vault disable restores local Auto Memory snapshots");
}

async function testDataSafetySheets() {
  resetApp("demoData()");
  appEval('openDataSafetySheet("encrypted-export")');
  assert(view().sheet && view().sheet.type === "data-safety", "encrypted export sheet opens");
  makeElement("sheet-export-passphrase").value = "backup-passphrase";
  makeElement("sheet-export-confirm").value = "backup-passphrase";
  await appEval('submitDataSafetySheet("encrypted-export")');
  assert(downloadEvents.length === 1 && downloadEvents[0].download.includes("ruf-ministry-hub-encrypted-backup-"), "encrypted export sheet triggers encrypted download");
  assert(view().sheet === null, "encrypted export sheet closes after download");

  resetApp("emptyData()");
  appEval('settings.resetProtection = false; createPerson("Keep Before Reset", "555-0000"); openDataSafetySheet("reset-demo");');
  assert(view().sheet && view().sheet.kind === "reset-demo", "reset demo sheet opens");
  appEval('submitDataSafetySheet("reset-demo")');
  assert(db().people.length === 1, "reset demo sheet blocks unchecked reset");
  makeElement("sheet-reset-confirm").checked = true;
  appEval('submitDataSafetySheet("reset-demo")');
  assert(db().people.length > 1 && db().people[0].name !== "Keep Before Reset", "reset demo sheet replaces data after confirmation");
  assert(view().sheet === null, "reset demo sheet closes after reset");

  resetApp("emptyData()");
  const mergeIds = appEval(`
    const from = createPerson("Jordan Test", "555-1111");
    from.email = "from@example.com";
    const to = createPerson("Jordan T.", "");
    const note = createProfileNoteRecord(from.id, { content: "Move this note" });
    settings.pinnedPersonIds = [from.id];
    settings.recentPersonIds = [from.id];
    ({ fromId: from.id, toId: to.id, noteId: note.id });
  `);
  appEval(`openMergePersonSheet("${mergeIds.fromId}", "${mergeIds.toId}")`);
  assert(view().sheet && view().sheet.type === "merge-person", "merge person sheet opens");
  appEval(`submitMergePersonSheet("${mergeIds.fromId}", "${mergeIds.toId}")`);
  assert(db().people.length === 2, "merge person sheet blocks unchecked merge");
  makeElement("sheet-merge-confirm").checked = true;
  appEval(`submitMergePersonSheet("${mergeIds.fromId}", "${mergeIds.toId}")`);
  assert(db().people.length === 1 && db().people[0].id === mergeIds.toId, "merge person sheet removes duplicate after confirmation");
  assert(db().notes[0].relatedPersonId === mergeIds.toId, "merge person sheet moves linked records");
  assert(appEval(`settings.pinnedPersonIds.includes("${mergeIds.toId}") && !settings.pinnedPersonIds.includes("${mergeIds.fromId}")`), "merge person sheet preserves pinned shortcut on kept person");
}

function testBackupValidationBoundary() {
  resetApp("emptyData()");
  appEval('createPerson("Safe Backup Person", "555-0000")');
  const result = appEval(`(() => {
    const base = JSON.parse(JSON.stringify(currentPortablePayload()));
    validateBackupPayload(base);
    const failures = {};
    const check = (name, mutate) => {
      const payload = JSON.parse(JSON.stringify(base));
      mutate(payload);
      try {
        validateBackupPayload(payload);
        failures[name] = false;
      } catch (error) {
        failures[name] = true;
      }
    };
    check("wrongApp", payload => { payload.app = "Other App"; });
    check("wrongVersion", payload => { payload.version = 999; });
    check("missingCollection", payload => { delete payload.data.tasks; });
    check("unsafeId", payload => { payload.data.people[0].id = 'person_bad"><img src=x onerror=alert(1)>'; });
    check("duplicateId", payload => { payload.data.notes.push({ id: payload.data.people[0].id, content: "duplicate" }); });
    let oversizedRejected = false;
    try {
      assertBackupFileSize({ size: MAX_BACKUP_FILE_BYTES + 1 });
    } catch (error) {
      oversizedRejected = true;
    }
    const before = JSON.stringify(db);
    try {
      const bad = JSON.parse(JSON.stringify(base));
      bad.data.people[0].id = 'bad"><script>alert(1)</script>';
      applyRestoredPayload(bad);
    } catch (error) {}
    return { failures, oversizedRejected, unchanged: JSON.stringify(db) === before };
  })()`);

  assert(result.failures.wrongApp && result.failures.wrongVersion, "backup validation rejects wrong app and schema versions");
  assert(result.failures.missingCollection, "backup validation rejects partial destructive restores");
  assert(result.failures.unsafeId && result.failures.duplicateId, "backup validation rejects unsafe and duplicate identifiers");
  assert(result.oversizedRejected, "backup validation rejects oversized files before reading");
  assert(result.unchanged, "invalid backup validation leaves current local records unchanged");
  assert(!/data-(?:id|person-id|from|to)="\$\{(?!escapeHtml\()/.test(html), "dynamic record identifiers are escaped before HTML attribute interpolation");
}

function testContextualDatesAndLegacyProfileCompatibility() {
  const dates = appEval(`(() => {
    const reference = new Date(2026, 6, 15, 12, 0, 0);
    return {
      today: formatInteractionDate("2026-07-15", reference),
      yesterday: formatInteractionDate("2026-07-14", reference),
      twoWeeks: formatInteractionDate("2026-07-01", reference),
      followToday: formatFollowUpDate("2026-07-15", reference),
      tomorrow: formatFollowUpDate("2026-07-16", reference),
      weekday: formatFollowUpDate("2026-07-17", reference),
      overdue: formatFollowUpDate("2026-07-11", reference),
      nextWeek: formatDueDate("2026-07-22", reference),
      sameYear: formatHistoryDate("2026-07-08", "Met", reference),
      priorYear: formatHistoryDate("2025-07-12", "", reference),
      dateOnlyParts: calendarDateParts("2026-01-01")
    };
  })()`);

  assert(dates.today === "Met today" && dates.yesterday === "Met yesterday", "contextual dates describe today and yesterday");
  assert(dates.twoWeeks === "Met 2 weeks ago", "contextual dates summarize recent interaction weeks");
  assert(dates.followToday === "Follow up today" && dates.tomorrow === "Follow up tomorrow", "contextual follow-up dates describe today and tomorrow");
  assert(dates.weekday === "Follow up Friday", "contextual follow-up dates use a near weekday");
  assert(dates.overdue === "Follow-up overdue by 4 days", "contextual follow-up dates describe overdue distance");
  assert(dates.nextWeek === "Due next week", "contextual due dates describe next week");
  assert(dates.sameYear === "Met Jul 8" && dates.priorYear === "Jul 12, 2025", "history dates stay concise and include prior years");
  assert(dates.dateOnlyParts.year === 2026 && dates.dateOnlyParts.month === 1 && dates.dateOnlyParts.day === 1, "date-only values do not shift across timezone boundaries");

  resetApp("emptyData()");
  const compatibility = appEval(`(() => {
    const legacy = {
      app: "RUF Ministry Hub",
      version: 2,
      data: {
        people: [{
          id: "person_legacy",
          name: "Legacy Person",
          preferredContactMethod: "Carrier pigeon",
          phone: "",
          createdAt: "2025-01-01T12:00:00.000Z",
          updatedAt: "2025-01-01T12:00:00.000Z"
        }],
        quickGrabs: [],
        notes: [],
        meetingNotes: [],
        prayerRequests: [],
        tasks: []
      }
    };
    validateBackupPayload(legacy);
    applyRestoredPayload(legacy, { captureBefore: false, toast: "Legacy restored." });
    const restoredLegacyValue = db.people[0].preferredContactMethod;
    const exported = currentPortablePayload();
    const roundTripped = normalizeData(JSON.parse(JSON.stringify(exported.data)));
    const created = createPerson("New Calm Person");
    view.personId = db.people[0].id;
    return {
      restoredLegacyValue,
      exportedLegacyValue: exported.data.people[0].preferredContactMethod,
      roundTripLegacyValue: roundTripped.people[0].preferredContactMethod,
      topSchemaVersion: exported.dataSchemaVersion,
      dataSchemaVersion: exported.data.dataSchemaVersion,
      createdHasPreferredContact: Object.prototype.hasOwnProperty.call(created, "preferredContactMethod"),
      personMarkup: renderPersonProfile(),
      peopleMarkup: renderPersonListCard(db.people[0]),
      createMarkup: renderCreatePersonSheet()
    };
  })()`);

  assert(compatibility.restoredLegacyValue === "Carrier pigeon", "pre-Calm backups retain dormant preferred-contact data on import");
  assert(compatibility.exportedLegacyValue === "Carrier pigeon" && compatibility.roundTripLegacyValue === "Carrier pigeon", "dormant preferred-contact data survives export round trip");
  assert(compatibility.topSchemaVersion === 3 && compatibility.dataSchemaVersion === 3, "portable backups declare additive data schema version 3");
  assert(compatibility.createdHasPreferredContact === false, "new people no longer create preferred-contact data");
  assert(!compatibility.personMarkup.includes("Preferred contact") && !compatibility.peopleMarkup.includes("Preferred contact") && !compatibility.createMarkup.includes("Preferred contact"), "preferred contact remains dormant in normal profile, card, and creation UI");
  assert(!compatibility.personMarkup.includes("Created:") && !compatibility.peopleMarkup.includes("Updated:"), "normal profile and people UI hide administrative timestamps");

  resetApp("emptyData()");
  const unnamedCompatibility = appEval(`(() => {
    const legacy = {
      app: "RUF Ministry Hub",
      version: 2,
      data: {
        people: [{ id: "person_missing_name" }],
        quickGrabs: [], notes: [], meetingNotes: [], prayerRequests: [], tasks: []
      }
    };
    const restored = applyRestoredPayload(legacy, { captureBefore: false });
    const capture = makeQuickGrab("Met someone for coffee", [], "Whenever", db.people);
    const card = renderPersonListCard(db.people[0]);
    const exported = JSON.parse(JSON.stringify(currentPortablePayload()));
    return { restored, name: db.people[0].name, captureText: capture.rawContent, card, exportedName: exported.data.people[0].name };
  })()`);
  assert(unnamedCompatibility.restored && unnamedCompatibility.name === "Unnamed person" && unnamedCompatibility.card.includes("Unnamed person"), "legacy person records without a name import and render with an explicit calm fallback");
  assert(unnamedCompatibility.captureText === "Met someone for coffee" && unnamedCompatibility.exportedName === "Unnamed person", "missing-name legacy data remains capture-safe and re-exports through the compatible schema");
}

function testServiceWorkerShape() {
  assert(/const APP_VERSION = "2026\.07\.\d{2}-calm-os-[^"]+"/.test(html), "deploy app version is in the Calm OS release family");
  assert(/ruf-ministry-hub-v(?:3[5-9]|[4-9]\d+)-calm-os-[^"']+/.test(serviceWorkerSource), "service worker cache version is bumped for Calm OS");
  assert(serviceWorkerSource.includes('"index.html"'), "service worker caches redirect entry point");
  assert(serviceWorkerSource.includes("ruf-ministry-hub-icon.svg"), "service worker caches the SVG icon");
  assert(serviceWorkerSource.includes("async function cacheAsset") && serviceWorkerSource.includes("Optional icons and metadata do not block an otherwise valid app shell."), "service worker treats optional assets as non-blocking while requiring the app shell");
  assert(serviceWorkerSource.includes("networkFirstNavigation"), "service worker uses network-first document navigation");
  assert(serviceWorkerSource.includes('requestUrl.pathname.startsWith("/api/")'), "service worker leaves Pages Function routes uncached");
  assert(serviceWorkerSource.includes("key.startsWith(CACHE_PREFIX)") && serviceWorkerSource.includes("key !== CACHE_NAME"), "service worker cleans only its own old caches");
  assert(html.includes("hadControllerAtRegistration"), "app does not reload on first service worker claim");
  const skipWaitingCalls = serviceWorkerSource.match(/self\.skipWaiting\(\)/g) || [];
  const messageHandlerIndex = serviceWorkerSource.indexOf('addEventListener("message"');
  const skipWaitingIndex = serviceWorkerSource.indexOf("self.skipWaiting()");
  assert(skipWaitingCalls.length === 1 && skipWaitingIndex > messageHandlerIndex, "service worker waits for an explicit update message before activating");
  assert(html.includes('waiting.postMessage({ type: "SKIP_WAITING" })'), "app activates a waiting update only after Update now is chosen");
  assert(html.includes("A newer offline copy is available. Update when you are not in the middle of typing."), "app explains that a waiting update can be deferred safely");
  const registrationSource = html.slice(html.indexOf("function registerServiceWorker()"), html.indexOf("function applyAppUpdate()"));
  assert(!registrationSource.includes("render();"), "service worker update discovery does not rerender and erase in-progress form input");
  assert(registrationSource.includes("await flushRecoveryState()") && registrationSource.includes("Reload was deferred"), "controller changes secure recoverable work before reloading");
  assert(serviceWorkerSource.includes("await cache.put(request, response.clone())"), "runtime asset caching settles before the fetch response completes");
  ["install", "activate", "fetch", "message"].forEach(eventName => {
    assert(serviceWorkerSource.includes(`addEventListener("${eventName}"`), `service worker registers ${eventName}`);
  });
}

function testRedirectAndServiceWorkerRouting() {
  assert(indexSource.includes('window.location.replace("./ruf-ministry-hub" + window.location.search + window.location.hash)'), "index enters the native extensionless Pages route");
  assert(redirectsSource.includes("/app /ruf-ministry-hub 302"), "Cloudflare redirects the app alias to the extensionless route");
  assert(!/^\/ruf-ministry-hub\s/m.test(redirectsSource), "Cloudflare leaves the native extensionless route unmodified");
  assert(manifestSource.includes('"start_url": "./ruf-ministry-hub"'), "installed app starts at the native extensionless route");
  assert(!serviceWorkerSource.includes('"ruf-ministry-hub"'), "service worker does not cache extensionless app route");
  assert(serviceWorkerSource.includes('requestUrl.pathname.startsWith("/api/")') && serviceWorkerSource.includes("if (requestUrl.pathname.startsWith(\"/api/\")) return;"), "service worker bypasses API routes");
  assert(serviceWorkerSource.includes("networkFirstNavigation(event.request)") && serviceWorkerSource.includes('cache.match(APP_SHELL, { ignoreSearch: true })'), "service worker falls back to the cached app shell for document requests");
  assert(serviceWorkerSource.includes('event.request.mode === "navigate"') && serviceWorkerSource.includes('event.request.destination === "document"'), "service worker handles direct HTML document requests");
}

function testCurrentDocsDoNotClaimRemovedScreens() {
  const testingDoc = fs.readFileSync(path.resolve(__dirname, "../TESTING.md"), "utf8");
  const manualDoc = fs.readFileSync(path.resolve(__dirname, "../docs/manual-qa.md"), "utf8");
  ["Large Group", "Semester Archive", "Relationship Graph"].forEach(removedLabel => {
    assert(!testingDoc.includes(removedLabel), `TESTING.md does not claim ${removedLabel}`);
    assert(!manualDoc.includes(removedLabel), `manual QA does not claim ${removedLabel}`);
  });
}

async function run() {
  testCurrentScreensRender();
  testCalmPrimaryNavigation();
  testCleanupAndLargeDataPaths();
  testQuickGrabSharedUrlImport();
  testUnifiedCaptureAndProposalSafety();
  testProposalActionsDoNotHidePersonDateUpdates();
  await testAdversarialApprovalAndPersistenceBoundaries();
  await testAiApprovalWaitsForDurablePersistence();
  testCoreLocalActions();
  testAdhdModeAndTodaySectionVisibility();
  testAutopilotAndAttentionPresets();
  testTodayRecommendationPriorityAndActions();
  testPeopleCardCalmContract();
  await testAdversarialCalmOsDataShapes();
  await testUnavailableCaptureProcessing();
  testCalmProfileContract();
  testExportAndPrivacyHelpers();
  testAutoMemoryVault();
  await testSecuritySheets();
  await testDataSafetySheets();
  testBackupValidationBoundary();
  testContextualDatesAndLegacyProfileCompatibility();
  testServiceWorkerShape();
  testRedirectAndServiceWorkerRouting();
  testCurrentDocsDoNotClaimRemovedScreens();
  console.log("All current regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

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
const historyReplacements = [];
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

function setUrl(search = "", hash = "") {
  location.protocol = "https:";
  location.hostname = "example.test";
  location.pathname = "/ruf-ministry-hub.html";
  location.search = search;
  location.hash = hash;
  location.href = `https://example.test${location.pathname}${location.search}${location.hash}`;
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
  },
  __replaceStateShouldThrow: false
};

sandbox.window = {
  location,
  navigator: sandbox.navigator,
  URL: sandbox.URL,
  history: {
    state: { syntheticNavigationState: "preserve" },
    replaceState(state, _title, url) {
      if (sandbox.__replaceStateShouldThrow) throw new Error("Synthetic replaceState failure");
      historyReplacements.push({ state, url: String(url) });
      this.state = state;
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
  historyReplacements.length = 0;
  sandbox.__replaceStateShouldThrow = false;
  sandbox.window.history.state = { syntheticNavigationState: "preserve" };
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
    pendingFragmentQuickGrabText = "";
    sharedFragmentImportDeferred = false;
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

function triggerSharedCaptureIntake() {
  return appEval("importQuickGrabFromCurrentFragment()");
}

function applyPendingSharedCapture() {
  return appEval("applyPendingFragmentQuickGrabText()");
}

function sharedCaptureMutationSnapshot() {
  return appEval(`JSON.stringify({
    screen: view.screen,
    draft: view.quickGrabDraftText,
    source: view.quickGrabDraftSource,
    quickGrabId: view.quickGrabId,
    db,
    undoStack,
    autosaveDraftsCache,
    autosavePending: Boolean(autosaveTimer),
    localData: localStorage.getItem(STORAGE_KEY),
    localDrafts: localStorage.getItem(AUTOSAVE_KEY)
  })`);
}

function testQuickGrabFragmentPrivacyBoundary() {
  const boundaryFailures = [];
  const boundaryCheck = (condition, label) => {
    if (!condition) boundaryFailures.push(label);
  };
  resetApp();
  const template = appEval("shortcutTemplateUrl()");
  boundaryCheck(template.endsWith("#quickgrab=[Shortcut Input]") && !template.includes("?quickgrab="), "template still exposes query content");

  const indexScript = indexSource.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const redirectLocation = {
    search: "?quickgrab=Legacy%20Host%20Visible&text=Legacy&note=Legacy&quickgrabCategory=prayer&category=task&tag=a&tags=b&quickgrabUrgency=soon&urgency=now&safe=kept",
    hash: "#quickgrab=Fragment%20Only",
    replaced: "",
    replace(value) { this.replaced = String(value); }
  };
  vm.runInNewContext(indexScript, { window: { location: redirectLocation }, URLSearchParams });
  boundaryCheck(redirectLocation.replaced === "./ruf-ministry-hub?safe=kept#quickgrab=Fragment%20Only", "index redirect still forwards legacy capture query");

  resetApp();
  const queryBefore = sharedCaptureMutationSnapshot();
  setUrl("?quickgrab=Never%20Import&text=Never&note=Never&quickgrabCategory=prayer&category=task&tag=a&tags=b&quickgrabUrgency=soon&urgency=now&safe=kept", "#main-content");
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  boundaryCheck(location.search === "?safe=kept" && location.hash === "#main-content", "legacy query scrub does not preserve only unrelated query and anchor");
  boundaryCheck(sharedCaptureMutationSnapshot() === queryBefore, "legacy query content is still imported");
  boundaryCheck(JSON.stringify(sandbox.window.history.state) === JSON.stringify({ syntheticNavigationState: "preserve" }), "cleanup replaces existing history state");

  resetApp();
  setUrl("", "#quickgrab=Red%20fragment%20probe");
  const redFragmentImported = triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  boundaryCheck(redFragmentImported === true && location.hash === "" && view().quickGrabDraftText === "Red fragment probe", "fragment intake is absent");
  if (boundaryFailures.length) throw new Error(`Fragment privacy boundary failures: ${boundaryFailures.join("; ")}`);

  assert(true, "Shortcut template, redirect, legacy-query discard, history state, and fragment intake pass the local-first boundary");

  const sharedText = "Unicode prayer 🙏\n100% + / ? & = # : exact";
  resetApp();
  setUrl("?safe=kept", `#quickgrab=${encodeURIComponent(sharedText)}`);
  const imported = triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  assert(imported === true && location.search === "?safe=kept" && location.hash === "", "one exact quickgrab fragment is scrubbed before local import while unrelated query survives");
  assert(view().screen === "quick" && view().quickGrabDraftText === sharedText, "encoded Unicode, newline, percent, plus, and reserved characters decode exactly once");
  assert(db().quickGrabs.length === 0 && db().aiProposals.length === 0 && appEval("undoStack.length") === 0, "valid fragment creates no record, proposal, or Undo entry before user action");
  const exactDraft = view().quickGrabDraftText;
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  assert(view().quickGrabDraftText === exactDraft, "reload/focus/pageshow-style repeated intake cannot duplicate a scrubbed fragment");

  makeElement("quick-text").value = sharedText;
  appEval('submitUnifiedCapture("main", "", "later");');
  assert(db().quickGrabs.length === 1 && db().quickGrabs[0].rawContent === sharedText && db().quickGrabs[0].captureSource === "shared" && db().aiProposals.length === 0, "Save for later creates exactly one raw shared Quick Grab and no proposal");

  resetApp();
  setUrl("", "#quickgrab=Process%20fragment");
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  makeElement("quick-text").value = "Process fragment";
  appEval('submitUnifiedCapture("main", "", "process");');
  assert(db().quickGrabs.length === 1 && db().quickGrabs[0].rawContent === "Process fragment" && db().aiProposals.length === 0 && view().sheet?.type === "ai-gate", "Process creates exactly one raw shared Quick Grab and opens privacy review without a proposal before approval");

  resetApp();
  const maxText = "m".repeat(6000);
  setUrl("", `#quickgrab=${maxText}`);
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  assert(view().quickGrabDraftText === maxText && location.hash === "", "a 6,000-character fragment imports exactly once");

  const invalidFragments = [
    ["empty", "#quickgrab="],
    ["malformed", "#quickgrab=%"],
    ["duplicate", "#quickgrab=one&quickgrab=two"],
    ["unknown parameter", "#quickgrab=one&unexpected=two"],
    ["oversized", `#quickgrab=${"x".repeat(6001)}`],
    ["surrogate-pair oversized", `#quickgrab=${encodeURIComponent("😀".repeat(3001))}`]
  ];
  invalidFragments.forEach(([label, hash]) => {
    resetApp();
    const before = sharedCaptureMutationSnapshot();
    setUrl("?safe=kept", hash);
    triggerSharedCaptureIntake();
    applyPendingSharedCapture();
    assert(location.search === "?safe=kept" && location.hash === "", `${label} capture fragment is rejected and cleaned`);
    assert(sharedCaptureMutationSnapshot() === before, `${label} capture fragment causes zero draft/autosave/view/record/proposal/Undo mutation`);
  });

  resetApp();
  appEval("settings.enableUrlQuickGrab = false");
  const disabledBefore = sharedCaptureMutationSnapshot();
  setUrl("", "#quickgrab=Disabled%20content");
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  assert(location.hash === "" && sharedCaptureMutationSnapshot() === disabledBefore, "feature-disabled fragment is scrubbed without import or mutation");

  resetApp();
  const failureBefore = sharedCaptureMutationSnapshot();
  setUrl("", "#quickgrab=Never%20retain%20this");
  sandbox.__replaceStateShouldThrow = true;
  triggerSharedCaptureIntake();
  applyPendingSharedCapture();
  assert(sharedCaptureMutationSnapshot() === failureBefore, "history cleanup failure retains and imports no shared content");
  assert(!makeElement("toast").textContent.includes("Never retain this") && makeElement("toast").textContent.length > 0, "history cleanup failure reports only a generic content-free status");

  ["#main-content", "#unknown-anchor", "#quickgrabbing-is-not-capture"].forEach(anchor => {
    resetApp();
    const before = sharedCaptureMutationSnapshot();
    setUrl("?safe=kept", anchor);
    triggerSharedCaptureIntake();
    assert(location.search === "?safe=kept" && location.hash === anchor && sharedCaptureMutationSnapshot() === before, `${anchor} survives because it is not a capture fragment`);
  });
}

async function testDictationPrivacyBoundary() {
  const failures = [];
  const check = (condition, label) => {
    if (!condition) failures.push(label);
  };

  const hasV25Contract = appEval(`typeof VOICE_CAPTURE_DISCLOSURE_VERSION === "string"
    && typeof DICTATION_SESSION_DEADLINE_MS === "number"
    && typeof openDictationConsentSheet === "function"
    && typeof submitDictationStartSheet === "function"
    && typeof submitVoiceCaptureEnablement === "function"
    && typeof beginConfirmedDictation === "function"`);
  check(appEval("normalizeSettings({}).enableVoiceCapture") === false, "new and missing settings still default dictation on");
  check(appEval("normalizeSettings({ enableVoiceCapture: true }).enableVoiceCapture") === false, "legacy stored true survives without a current disclosure marker");
  check(appEval("normalizeSettings({ enableVoiceCapture: 'true', voiceCaptureDisclosureVersion: 'unexpected' }).enableVoiceCapture") === false, "malformed imported voice settings survive normalization");
  check(hasV25Contract, "versioned disclosure and atomic dictation helpers are absent");
  if (!hasV25Contract) throw new Error(`Dictation privacy boundary failures: ${failures.join("; ")}`);

  const currentMarker = appEval("VOICE_CAPTURE_DISCLOSURE_VERSION");
  const normalizeMatrix = appEval(`(() => {
    const marker = VOICE_CAPTURE_DISCLOSURE_VERSION;
    return {
      current: normalizeSettings({ enableVoiceCapture: true, voiceCaptureDisclosureVersion: marker }),
      falseWithMarker: normalizeSettings({ enableVoiceCapture: false, voiceCaptureDisclosureVersion: marker }),
      wrongMarker: normalizeSettings({ enableVoiceCapture: true, voiceCaptureDisclosureVersion: marker + "-old" }),
      numeric: normalizeSettings({ enableVoiceCapture: 1, voiceCaptureDisclosureVersion: marker })
    };
  })()`);
  check(normalizeMatrix.current.enableVoiceCapture === true && normalizeMatrix.current.voiceCaptureDisclosureVersion === currentMarker, "current exact true plus marker does not remain enabled");
  check(normalizeMatrix.falseWithMarker.enableVoiceCapture === false, "explicit false does not remain disabled");
  check(normalizeMatrix.wrongMarker.enableVoiceCapture === false && normalizeMatrix.numeric.enableVoiceCapture === false, "wrong-marker or non-boolean imports do not fail closed");

  resetApp();
  const enableStorageBefore = JSON.stringify(storage);
  appEval('updateSetting("enableVoiceCapture", true)');
  const enableSheet = appEval(`({ settings: cloneJson(settings), sheet: cloneJson(view.sheet), markup: renderSheet() })`);
  check(enableSheet.settings.enableVoiceCapture === false && enableSheet.sheet?.type === "dictation" && enableSheet.sheet?.kind === "enable", "turning on dictation does not pause at disclosure");
  check(enableSheet.markup.includes('role="dialog"') && enableSheet.markup.includes('aria-modal="true"') && enableSheet.markup.includes('aria-labelledby="dictation-sheet-title"') && enableSheet.markup.includes('id="dictation-confirm"') && enableSheet.markup.includes('data-action="dictation-enable-confirm"'), "enablement disclosure is not an accessible checked-confirmation sheet");
  check(enableSheet.markup.includes("browser or device") && enableSheet.markup.includes("cannot verify") && !/processed locally|never retained|permission (?:is|was) granted/i.test(enableSheet.markup), "enablement disclosure makes an unsupported processing, retention, or permission claim");
  check(JSON.stringify(storage) === enableStorageBefore, "opening enablement disclosure persists settings or drafts");
  appEval("closeSheet()");
  check(appEval("settings.enableVoiceCapture") === false && JSON.stringify(storage) === enableStorageBefore, "canceling enablement turns dictation on or persists state");

  appEval('updateSetting("enableVoiceCapture", true)');
  makeElement("dictation-confirm").checked = true;
  const enabled = appEval("submitVoiceCaptureEnablement()");
  const persistedSettings = JSON.parse(storage[appEval("SETTINGS_KEY")]);
  check(enabled === true && appEval("settings.enableVoiceCapture") === true && appEval("settings.voiceCaptureDisclosureVersion") === currentMarker, "checked enablement does not atomically activate the current marker");
  check(persistedSettings.enableVoiceCapture === true && persistedSettings.voiceCaptureDisclosureVersion === currentMarker, "persisted settings do not contain the enabled flag and marker together");

  const preDisclosureCases = [
    { source: "today", screen: "today", targetId: "today-capture-text", viewField: "todayCaptureDraftText", autosave: true },
    { source: "today", screen: "today", targetId: "today-capture-text", viewField: "todayCaptureDraftText", autosave: false },
    { source: "profile", screen: "person", targetId: "profile-capture-text", viewField: "profileCaptureDraftText", autosave: true, usesPerson: true },
    { source: "profile", screen: "person", targetId: "profile-capture-text", viewField: "profileCaptureDraftText", autosave: false, usesPerson: true }
  ];
  for (const fixture of preDisclosureCases) {
    resetApp(fixture.usesPerson ? "demoData()" : "emptyData()");
    const ownerId = fixture.usesPerson ? appEval("db.people[0].id") : "";
    const renderedPersonId = fixture.usesPerson ? appEval("(db.people[1] || db.people[0]).id") : "";
    const liveDraft = `  ${fixture.source} ${fixture.autosave ? "autosave on" : "autosave off"} live draft\nsecond line  `;
    const olderDraft = `${fixture.source} older stored draft`;
    sandbox.__preDisclosureFixture = { ...fixture, ownerId, renderedPersonId, liveDraft, olderDraft };
    appEval(`(() => {
      const fixture = globalThis.__preDisclosureFixture;
      settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        enableAutoSave: fixture.autosave,
        enableVoiceCapture: true,
        voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
        autoMemoryVaultEnabled: false,
        localEncryptionEnabled: false
      });
      view.screen = fixture.screen;
      view.personId = fixture.ownerId || null;
      view.todayCaptureDraftText = fixture.source === "today" ? "programmatic stale view" : "";
      view.profileCaptureOwnerId = fixture.ownerId;
      view.profileCapturePersonId = fixture.renderedPersonId;
      view.profileCaptureDraftText = fixture.source === "profile" ? "programmatic stale view" : "";
      view.profileCaptureDraftTargetId = "";
      const key = captureDraftKey(fixture.source, fixture.renderedPersonId);
      if (fixture.autosave) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
          [key]: {
            key,
            fields: { [fixture.targetId]: fixture.olderDraft },
            screen: fixture.screen,
            updatedAt: "2026-07-19T00:00:00.000Z"
          }
        }));
        autosaveTimer = 30;
      } else {
        localStorage.removeItem(AUTOSAVE_KEY);
        autosaveTimer = null;
      }
      globalThis.__preDisclosureStorageBefore = localStorage.getItem(AUTOSAVE_KEY);
      globalThis.__preDisclosureRecordsBefore = JSON.stringify({ db, undoStack });
      globalThis.__preDisclosurePersistenceCalls = 0;
      globalThis.__preDisclosureOriginalSaveCurrentDraftNow = saveCurrentDraftNow;
      saveCurrentDraftNow = () => { globalThis.__preDisclosurePersistenceCalls += 1; return true; };
    })()`);
    const liveTarget = makeElement(fixture.targetId);
    liveTarget.tagName = "TEXTAREA";
    liveTarget.value = liveDraft;
    liveTarget.isConnected = true;
    if (fixture.usesPerson) {
      liveTarget.closest = selector => selector === '[data-capture-composer="profile"]'
        ? { dataset: { personId: renderedPersonId } }
        : null;
    }
    let constructed = 0;
    sandbox.window.SpeechRecognition = function Recognition() {
      constructed += 1;
      sandbox.__preDisclosureRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    const opened = appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    check(opened === true && liveTarget.value === liveDraft && appEval(`view[${JSON.stringify(fixture.viewField)}]`) === liveDraft, `${fixture.source}/${fixture.autosave} disclosure open loses byte-exact live input`);
    check(constructed === 0 && appEval("document.getElementById('dictation-confirm').checked") === false, `${fixture.source}/${fixture.autosave} disclosure constructs recognition or opens checked`);
    check(appEval("__preDisclosurePersistenceCalls") === 0 && appEval("localStorage.getItem(AUTOSAVE_KEY)") === appEval("__preDisclosureStorageBefore"), `${fixture.source}/${fixture.autosave} disclosure open persists`);
    if (fixture.usesPerson) {
      check(appEval("view.profileCaptureDraftTargetId") === renderedPersonId && appEval("view.sheet.context.profileCapturePersonId") === renderedPersonId && appEval("view.sheet.context.profileCaptureDraftTargetId") === renderedPersonId, `${fixture.source}/${fixture.autosave} disclosure context misses rendered person identity`);
    }
    appEval("closeSheet()");
    check(liveTarget.value === liveDraft && appEval(`view[${JSON.stringify(fixture.viewField)}]`) === liveDraft && constructed === 0 && appEval("__preDisclosurePersistenceCalls") === 0, `${fixture.source}/${fixture.autosave} disclosure cancel changes draft, recognition, or persistence`);
    appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    makeElement("dictation-confirm").checked = true;
    const started = appEval("submitDictationStartSheet()");
    check(started === true && constructed === 1 && liveTarget.value === liveDraft && appEval(`view[${JSON.stringify(fixture.viewField)}]`) === liveDraft && appEval("__preDisclosurePersistenceCalls") === 0, `${fixture.source}/${fixture.autosave} checked Start loses baseline or persists before terminal success`);
    if (fixture.usesPerson) {
      check(appEval("activeDictationSession.context.profileCapturePersonId") === renderedPersonId && appEval("activeDictationSession.context.profileCaptureDraftTargetId") === renderedPersonId, `${fixture.source}/${fixture.autosave} started session misses rendered person identity`);
    }
    appEval(`
      cancelActiveDictation({ announce: false });
      autosaveTimer = null;
      saveCurrentDraftNow = globalThis.__preDisclosureOriginalSaveCurrentDraftNow;
    `);
    check(appEval("localStorage.getItem(AUTOSAVE_KEY)") === appEval("__preDisclosureStorageBefore") && appEval("JSON.stringify({ db, undoStack })") === appEval("__preDisclosureRecordsBefore"), `${fixture.source}/${fixture.autosave} disclosure path mutates storage, records, proposals, or Undo`);
    check(!makeElement("toast").textContent.includes("live draft") && !makeElement("toast").textContent.includes("older stored draft"), `${fixture.source}/${fixture.autosave} disclosure status exposes draft content`);
  }

  resetApp();
  const scopedRestoreTarget = makeElement("today-capture-text");
  scopedRestoreTarget.tagName = "TEXTAREA";
  scopedRestoreTarget.value = "  private live draft\nsecond line  ";
  const scopedRestoreUnrelated = makeElement("synthetic-unrelated-field");
  scopedRestoreUnrelated.tagName = "INPUT";
  scopedRestoreUnrelated.value = "current unrelated value";
  const scopedRestoreResult = appEval(`(() => {
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, enableAutoSave: true, localEncryptionEnabled: false });
    view.screen = "today";
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      "capture:today": {
        key: "capture:today",
        fields: {
          "today-capture-text": "older target value",
          "synthetic-unrelated-field": "restored unrelated value"
        },
        screen: "today",
        updatedAt: "2026-07-19T00:00:00.000Z"
      }
    }));
    const originalRender = render;
    try {
      render = () => restoreAutosaveDraft();
      renderWithoutRestoringAutosaveTarget("today-capture-text");
      return {
        target: document.getElementById("today-capture-text").value,
        unrelated: document.getElementById("synthetic-unrelated-field").value,
        cleared: autosaveRestoreSkipTargetId === ""
      };
    } finally {
      render = originalRender;
      autosaveRestoreSkipTargetId = "";
    }
  })()`);
  check(scopedRestoreResult.target === scopedRestoreTarget.value && scopedRestoreResult.unrelated === "restored unrelated value", "dictation render guard suppresses more than its exact target field");
  check(scopedRestoreResult.cleared === true, "dictation render guard survives a successful render");

  const throwingRenderGuard = appEval(`(() => {
    const originalRender = render;
    let observed = "";
    let mutationEffects;
    let threw = false;
    try {
      render = options => {
        observed = autosaveRestoreSkipTargetId;
        mutationEffects = options?.mutationEffects;
        throw new Error("synthetic render failure");
      };
      try {
        renderWithoutRestoringAutosaveTarget("today-capture-text");
      } catch (error) {
        threw = error?.message === "synthetic render failure";
      }
      return {
        threw,
        observed,
        mutationEffects,
        cleared: autosaveRestoreSkipTargetId === ""
      };
    } finally {
      render = originalRender;
      autosaveRestoreSkipTargetId = "";
    }
  })()`);
  check(throwingRenderGuard.threw === true && throwingRenderGuard.cleared === true && throwingRenderGuard.mutationEffects === false, "dictation render guard survives a throwing render or fails to suppress mutation effects");
  check(throwingRenderGuard.observed === "today-capture-text" && !throwingRenderGuard.observed.includes("private live draft"), "dictation render guard carries content instead of only the fixed target id");

  const prepareSession = (initialText = "Existing fictional draft") => {
    resetApp();
    appEval(`
      if (typeof globalThis.__dictationOriginalScheduleAutosave !== "function") {
        globalThis.__dictationOriginalScheduleAutosave = scheduleAutosave;
      }
      if (typeof globalThis.__dictationMaintainedSaveCurrentDraftNow !== "function") {
        globalThis.__dictationMaintainedSaveCurrentDraftNow = saveCurrentDraftNow;
      }
      settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        enableAutoSave: true,
        enableVoiceCapture: true,
        voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
        autoMemoryVaultEnabled: false,
        localEncryptionEnabled: false
      });
      view.screen = "quick";
      view.quickGrabDraftText = ${JSON.stringify(initialText)};
      __dictationAutosaveCalls = 0;
      scheduleAutosave = () => { __dictationAutosaveCalls += 1; return true; };
      saveCurrentDraftNow = () => { __dictationAutosaveCalls += 1; return true; };
    `);
    const textarea = makeElement("quick-text");
    textarea.tagName = "TEXTAREA";
    textarea.value = initialText;
    textarea.isConnected = true;
    return textarea;
  };

  let constructorCalls = 0;
  let textarea = prepareSession();
  sandbox.window.SpeechRecognition = function Recognition() {
    constructorCalls += 1;
    sandbox.__recognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  const beforeOpenStorage = JSON.stringify(storage);
  const beforeOpenDrafts = appEval("JSON.stringify(autosaveDraftsCache)");
  appEval("__dictationOriginalSaveCurrentDraftNow = saveCurrentDraftNow; __dictationDraftSaveCalls = 0; saveCurrentDraftNow = () => { __dictationDraftSaveCalls += 1; return true; }");
  const dictateButton = makeElement("dictation-action-button");
  dictateButton.dataset.action = "voice-capture";
  dictateButton.dataset.target = "quick-text";
  dictateButton.classList.contains = () => false;
  const opened = appEval("handleAction({ currentTarget: globalThis.__dictationButton, target: globalThis.__dictationButton, preventDefault() {}, stopPropagation() {} })", sandbox.__dictationButton = dictateButton);
  const startMarkup = appEval("renderSheet()");
  check(opened === true && constructorCalls === 0 && appEval("view.sheet?.kind") === "start", "Dictate constructs recognition before per-start confirmation");
  check(appEval("__dictationDraftSaveCalls") === 0, "Dictate falls through the dispatcher and saves a draft before disclosure");
  check(startMarkup.includes('role="dialog"') && startMarkup.includes('id="dictation-confirm"') && startMarkup.includes('data-action="dictation-start-confirm"') && startMarkup.includes("browser or device") && startMarkup.includes("cannot verify"), "per-start sheet lacks accessible truthful confirmation");
  check(JSON.stringify(storage) === beforeOpenStorage && appEval("JSON.stringify(autosaveDraftsCache)") === beforeOpenDrafts, "opening per-start disclosure autosaves a draft");
  appEval("closeSheet()");
  check(constructorCalls === 0 && textarea.value === "Existing fictional draft" && JSON.stringify(storage) === beforeOpenStorage, "canceling per-start disclosure constructs recognition or mutates the draft");
  appEval("saveCurrentDraftNow = __dictationOriginalSaveCurrentDraftNow");

  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  const started = appEval("submitDictationStartSheet()");
  check(started === true && constructorCalls === 1 && appEval("view.sheet") === null, "checked per-start confirmation does not start exactly one session");
  const secondStart = appEval('beginConfirmedDictation("quick-text", dictationCaptureContext("quick-text"))');
  check(secondStart === false && constructorCalls === 1, "a second simultaneous start constructs another recognizer");
  const successStateBeforeResult = appEval(`JSON.stringify({ db, undoStack, draft: view.quickGrabDraftText, autosave: __dictationAutosaveCalls })`);
  sandbox.__recognition.onresult({ results: [Object.assign([{ transcript: "Staged fictional words" }], { isFinal: true })] });
  check(textarea.value === "Existing fictional draft" && appEval("__dictationAutosaveCalls") === 0 && appEval(`JSON.stringify({ db, undoStack, draft: view.quickGrabDraftText, autosave: __dictationAutosaveCalls })`) === successStateBeforeResult, "onresult commits or autosaves before terminal success");
  sandbox.__recognition.onend();
  check(textarea.value === "Existing fictional draft\nStaged fictional words" && appEval("view.quickGrabDraftText") === textarea.value && appEval("__dictationAutosaveCalls") === 1, "one successful onend does not append and autosave exactly once");
  sandbox.__recognition.onend?.();
  check(textarea.value === "Existing fictional draft\nStaged fictional words" && appEval("__dictationAutosaveCalls") === 1, "duplicate terminal completion commits twice");
  check(db().quickGrabs.length === 0 && db().people.length === 0 && db().prayerRequests.length === 0 && db().aiProposals.length === 0 && appEval("undoStack.length") === 0, "successful dictation creates a permanent record, proposal, or Undo entry");

  textarea = prepareSession("Failure baseline");
  let errorRecognition;
  sandbox.window.SpeechRecognition = function Recognition() {
    errorRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  errorRecognition.onresult({ results: [Object.assign([{ transcript: "Never persist this fictional transcript" }], { isFinal: true })] });
  errorRecognition.onerror({ error: "synthetic-private-error-code" });
  errorRecognition.onend?.();
  check(textarea.value === "Failure baseline" && appEval("view.quickGrabDraftText") === "Failure baseline" && appEval("__dictationAutosaveCalls") === 0, "onerror after a result preserves staged transcript or autosaves it");
  check(!makeElement("toast").textContent.includes("Never persist") && !makeElement("toast").textContent.includes("synthetic-private-error-code"), "failure status exposes transcript or browser error detail");

  textarea = prepareSession("Empty baseline");
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__emptyRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__emptyRecognition.onresult({ results: [Object.assign([{ transcript: "Ignored interim words" }], { isFinal: false })] });
  sandbox.__emptyRecognition.onend();
  check(textarea.value === "Empty baseline" && appEval("__dictationAutosaveCalls") === 0 && appEval("activeDictationSession") === null, "empty or interim-only terminal completion mutates or autosaves a draft");

  textarea = prepareSession("Navigation baseline");
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__navigationRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__navigationRecognition.onresult({ results: [Object.assign([{ transcript: "Wrong screen words" }], { isFinal: true })] });
  appEval('view.screen = "today"');
  sandbox.__navigationRecognition.onend();
  check(textarea.value === "Navigation baseline" && appEval("__dictationAutosaveCalls") === 0, "screen/draft identity drift accepts a terminal transcript");

  textarea = prepareSession("Disable baseline");
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__disableRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__disableRecognition.onresult({ results: [Object.assign([{ transcript: "Disabled staged words" }], { isFinal: true })] });
  appEval('updateSetting("enableVoiceCapture", false)');
  sandbox.__disableRecognition.onend?.();
  check(textarea.value === "Disable baseline" && appEval("__dictationAutosaveCalls") === 0 && appEval("activeDictationSession") === null && appEval("settings.enableVoiceCapture") === false, "disabling dictation fails to discard the active transcript and turn the feature off");

  for (const failureKind of ["constructor", "property", "start"]) {
    textarea = prepareSession(`${failureKind} baseline`);
    sandbox.window.SpeechRecognition = failureKind === "constructor"
      ? function Recognition() { throw new Error("private constructor detail"); }
      : function Recognition() {
          if (failureKind === "property") Object.defineProperty(this, "lang", { set() { throw new Error("private property detail"); } });
          this.start = () => { if (failureKind === "start") throw new Error("private start detail"); };
          this.abort = () => {};
        };
    appEval('openDictationConsentSheet("quick-text")');
    makeElement("dictation-confirm").checked = true;
    const failureResult = appEval("submitDictationStartSheet()");
    check(failureResult === false && textarea.value === `${failureKind} baseline` && appEval("__dictationAutosaveCalls") === 0 && appEval("activeDictationSession") === null, `${failureKind} failure escapes containment or mutates a draft`);
    check(!/private (?:constructor|property|start) detail/.test(makeElement("toast").textContent), `${failureKind} failure exposes exception content`);
  }

  textarea = prepareSession("Deadline baseline");
  let deadlineCallback = null;
  const dictationDeadline = appEval("DICTATION_SESSION_DEADLINE_MS");
  const originalWindowSetTimeout = sandbox.window.setTimeout;
  const originalWindowClearTimeout = sandbox.window.clearTimeout;
  sandbox.window.setTimeout = (callback, delay) => {
    if (delay === dictationDeadline) deadlineCallback = callback;
    return 77;
  };
  sandbox.window.clearTimeout = () => {};
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__deadlineRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__deadlineRecognition.onresult({ results: [Object.assign([{ transcript: "Deadline staged words" }], { isFinal: true })] });
  deadlineCallback?.();
  sandbox.__deadlineRecognition.onend?.();
  sandbox.window.setTimeout = originalWindowSetTimeout;
  sandbox.window.clearTimeout = originalWindowClearTimeout;
  check(textarea.value === "Deadline baseline" && appEval("__dictationAutosaveCalls") === 0 && appEval("activeDictationSession") === null, "missing onend deadline commits staged words or leaves a live session");

  textarea = prepareSession("Detached baseline");
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__detachedRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__detachedRecognition.onresult({ results: [Object.assign([{ transcript: "Detached staged words" }], { isFinal: true })] });
  textarea.isConnected = false;
  sandbox.__detachedRecognition.onend();
  check(textarea.value === "Detached baseline" && appEval("__dictationAutosaveCalls") === 0, "detached target accepts a terminal transcript");

  appEval(`
    scheduleAutosave = __dictationOriginalScheduleAutosave;
    saveCurrentDraftNow = __dictationMaintainedSaveCurrentDraftNow;
  `);

  const dictationRaceCases = [
    { source: "main", screen: "quick", targetId: "quick-text", viewField: "quickGrabDraftText" },
    { source: "today", screen: "today", targetId: "today-capture-text", viewField: "todayCaptureDraftText" },
    { source: "profile", screen: "person", targetId: "profile-capture-text", viewField: "profileCaptureDraftText", usesPerson: true }
  ];

  for (const fixture of dictationRaceCases) {
    resetApp(fixture.usesPerson ? "demoData()" : "emptyData()");
    const personId = fixture.usesPerson ? appEval("db.people[0].id") : "";
    const baseline = `${fixture.source} persisted baseline`;
    const transcript = `${fixture.source} recognized words`;
    const committed = `${baseline}\n${transcript}`;
    sandbox.__dictationRaceFixture = { ...fixture, personId, baseline };
    appEval(`(() => {
      const fixture = globalThis.__dictationRaceFixture;
      settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        enableAutoSave: true,
        enableVoiceCapture: true,
        voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
        autoMemoryVaultEnabled: false,
        localEncryptionEnabled: false
      });
      view.screen = fixture.screen;
      view.personId = fixture.personId || null;
      view.quickGrabDraftText = fixture.source === "main" ? fixture.baseline : "";
      view.todayCaptureDraftText = fixture.source === "today" ? fixture.baseline : "";
      view.profileCaptureOwnerId = fixture.personId || "";
      view.profileCapturePersonId = fixture.personId || "";
      view.profileCaptureDraftText = fixture.source === "profile" ? fixture.baseline : "";
      view.profileCaptureDraftTargetId = fixture.personId || "";
      autosaveDraftsCache = {};
      const key = captureDraftKey(fixture.source, fixture.personId);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        [key]: {
          key,
          fields: { [fixture.targetId]: fixture.baseline },
          screen: fixture.screen,
          updatedAt: "2026-07-19T00:00:00.000Z"
        }
      }));
      globalThis.__dictationRaceKey = key;
      globalThis.__dictationPersistenceCalls = 0;
      globalThis.__dictationSuccessPersistedValue = null;
      globalThis.__dictationOriginalSaveAutosaveDrafts = saveAutosaveDrafts;
      globalThis.__dictationOriginalShowToast = showToast;
      saveAutosaveDrafts = drafts => {
        globalThis.__dictationPersistenceCalls += 1;
        return globalThis.__dictationOriginalSaveAutosaveDrafts(drafts);
      };
      showToast = (message, type) => {
        if (message === "Dictation added to this draft.") {
          globalThis.__dictationSuccessPersistedValue = loadAutosaveDrafts()[globalThis.__dictationRaceKey]?.fields?.[fixture.targetId] ?? null;
        }
        return globalThis.__dictationOriginalShowToast(message, type);
      };
    })()`);
    textarea = makeElement(fixture.targetId);
    textarea.tagName = "TEXTAREA";
    textarea.value = baseline;
    textarea.isConnected = true;
    if (fixture.usesPerson) {
      textarea.closest = selector => selector === '[data-capture-composer="profile"]'
        ? { dataset: { personId } }
        : null;
    }
    sandbox.window.SpeechRecognition = function Recognition() {
      sandbox.__dictationRaceRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    makeElement("dictation-confirm").checked = true;
    appEval("submitDictationStartSheet()");
    appEval("scheduleAutosave()");
    const lateResult = sandbox.__dictationRaceRecognition.onresult;
    const lateEnd = sandbox.__dictationRaceRecognition.onend;
    lateResult({ results: [Object.assign([{ transcript }], { isFinal: true })] });
    lateEnd();
    const persistedImmediately = appEval("loadAutosaveDrafts()[__dictationRaceKey]?.fields?.[__dictationRaceFixture.targetId] || ''");
    check(textarea.value === committed, `${fixture.source} successful onend does not append the recognized words`);
    check(appEval(`String(view[${JSON.stringify(fixture.viewField)}] || "")`) === committed, `${fixture.source} successful onend does not synchronize the current view draft`);
    check(persistedImmediately === committed && appEval("__dictationPersistenceCalls") === 1 && appEval("autosaveTimer") === null, `${fixture.source} successful onend does not synchronously replace the older autosave exactly once`);
    check(appEval("__dictationSuccessPersistedValue") === committed, `${fixture.source} announces success before the current draft is persisted`);
    appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    check(textarea.value === committed && appEval(`String(view[${JSON.stringify(fixture.viewField)}] || "")`) === committed, `${fixture.source} immediate Dictate reopen restores the older autosave over the recognized words`);
    lateResult({ results: [Object.assign([{ transcript: `${fixture.source} late duplicate words` }], { isFinal: true })] });
    lateEnd();
    await new Promise(resolve => setTimeout(resolve, 230));
    const settledDraft = appEval("loadAutosaveDrafts()[__dictationRaceKey]?.fields?.[__dictationRaceFixture.targetId] || ''");
    check(textarea.value === committed && settledDraft === committed && appEval("__dictationPersistenceCalls") === 1, `${fixture.source} stale timer or late events duplicate or replace the committed draft`);
    appEval(`
      closeSheet();
      saveAutosaveDrafts = globalThis.__dictationOriginalSaveAutosaveDrafts;
      showToast = globalThis.__dictationOriginalShowToast;
    `);
  }

  for (const fixture of dictationRaceCases) {
    resetApp(fixture.usesPerson ? "demoData()" : "emptyData()");
    const personId = fixture.usesPerson ? appEval("db.people[0].id") : "";
    const baseline = `${fixture.source} autosave-off baseline`;
    const transcript = `${fixture.source} autosave-off words`;
    const committed = `${baseline}\n${transcript}`;
    sandbox.__dictationRaceFixture = { ...fixture, personId, baseline };
    appEval(`(() => {
      const fixture = globalThis.__dictationRaceFixture;
      settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        enableAutoSave: false,
        enableVoiceCapture: true,
        voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
        autoMemoryVaultEnabled: false,
        localEncryptionEnabled: false
      });
      view.screen = fixture.screen;
      view.personId = fixture.personId || null;
      view.quickGrabDraftText = fixture.source === "main" ? fixture.baseline : "";
      view.todayCaptureDraftText = fixture.source === "today" ? fixture.baseline : "";
      view.profileCaptureOwnerId = fixture.personId || "";
      view.profileCapturePersonId = fixture.personId || "";
      view.profileCaptureDraftText = fixture.source === "profile" ? fixture.baseline : "";
      view.profileCaptureDraftTargetId = fixture.personId || "";
      autosaveDraftsCache = {};
      localStorage.removeItem(AUTOSAVE_KEY);
      globalThis.__dictationPersistenceCalls = 0;
      globalThis.__dictationOriginalSaveAutosaveDrafts = saveAutosaveDrafts;
      saveAutosaveDrafts = drafts => {
        globalThis.__dictationPersistenceCalls += 1;
        return globalThis.__dictationOriginalSaveAutosaveDrafts(drafts);
      };
    })()`);
    textarea = makeElement(fixture.targetId);
    textarea.tagName = "TEXTAREA";
    textarea.value = baseline;
    textarea.isConnected = true;
    if (fixture.usesPerson) {
      textarea.closest = selector => selector === '[data-capture-composer="profile"]'
        ? { dataset: { personId } }
        : null;
    }
    sandbox.window.SpeechRecognition = function Recognition() {
      sandbox.__dictationAutosaveOffRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    makeElement("dictation-confirm").checked = true;
    appEval("submitDictationStartSheet()");
    sandbox.__dictationAutosaveOffRecognition.onresult({ results: [Object.assign([{ transcript }], { isFinal: true })] });
    sandbox.__dictationAutosaveOffRecognition.onend();
    const composerMarkup = appEval(`renderCaptureComposer({
      source: ${JSON.stringify(fixture.source)},
      personId: ${JSON.stringify(personId)}
    })`);
    appEval(`openDictationConsentSheet(${JSON.stringify(fixture.targetId)})`);
    check(textarea.value === committed && appEval(`String(view[${JSON.stringify(fixture.viewField)}] || "")`) === committed && composerMarkup.includes(committed), `${fixture.source} autosave-off dictation does not retain the current view draft across immediate render`);
    check(appEval("localStorage.getItem(AUTOSAVE_KEY)") === null && appEval("Object.keys(autosaveDraftsCache).length") === 0 && appEval("__dictationPersistenceCalls") === 0, `${fixture.source} autosave-off dictation creates draft persistence`);
    appEval(`
      closeSheet();
      saveAutosaveDrafts = globalThis.__dictationOriginalSaveAutosaveDrafts;
    `);
  }

  for (const failureMode of ["false", "throw"]) {
    resetApp();
    const baseline = `${failureMode} persistence baseline`;
    appEval(`
      settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        enableAutoSave: true,
        enableVoiceCapture: true,
        voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
        autoMemoryVaultEnabled: false,
        localEncryptionEnabled: false
      });
      view.screen = "quick";
      view.quickGrabDraftText = ${JSON.stringify(baseline)};
      localStorage.removeItem(AUTOSAVE_KEY);
      autosaveDraftsCache = {};
      globalThis.__dictationFailureOriginalSaveCurrentDraftNow = saveCurrentDraftNow;
      saveCurrentDraftNow = () => {
        ${failureMode === "throw" ? 'throw new Error("synthetic private persistence detail");' : "return false;"}
      };
    `);
    textarea = makeElement("quick-text");
    textarea.tagName = "TEXTAREA";
    textarea.value = baseline;
    textarea.isConnected = true;
    if (failureMode === "false") textarea.dataset.captureMethod = "keyboard";
    else delete textarea.dataset.captureMethod;
    const hadCaptureMethod = Object.prototype.hasOwnProperty.call(textarea.dataset, "captureMethod");
    const priorCaptureMethod = textarea.dataset.captureMethod;
    sandbox.window.SpeechRecognition = function Recognition() {
      sandbox.__dictationPersistenceFailureRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    appEval('openDictationConsentSheet("quick-text")');
    makeElement("dictation-confirm").checked = true;
    appEval("submitDictationStartSheet()");
    sandbox.__dictationPersistenceFailureRecognition.onresult({ results: [Object.assign([{ transcript: "must roll back" }], { isFinal: true })] });
    const failureResult = sandbox.__dictationPersistenceFailureRecognition.onend();
    check(failureResult === false && textarea.value === baseline && appEval("view.quickGrabDraftText") === baseline, `${failureMode} draft persistence failure does not roll target and view back exactly`);
    check(Object.prototype.hasOwnProperty.call(textarea.dataset, "captureMethod") === hadCaptureMethod && textarea.dataset.captureMethod === priorCaptureMethod, `${failureMode} draft persistence failure does not restore capture-method metadata exactly`);
    check(appEval("localStorage.getItem(AUTOSAVE_KEY)") === null && appEval("Object.keys(autosaveDraftsCache).length") === 0 && appEval("activeDictationSession") === null, `${failureMode} draft persistence failure leaves saved or active dictation state`);
    check(!makeElement("toast").textContent.includes("must roll back") && !makeElement("toast").textContent.includes("synthetic private persistence detail") && !makeElement("toast").textContent.includes("Dictation added"), `${failureMode} draft persistence failure exposes content or announces success`);
    appEval("saveCurrentDraftNow = globalThis.__dictationFailureOriginalSaveCurrentDraftNow");
  }

  resetApp();
  const vaultFailureBaseline = "Device Vault failure baseline";
  appEval(`
    settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      enableAutoSave: true,
      enableVoiceCapture: true,
      voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
      autoMemoryVaultEnabled: false,
      localEncryptionEnabled: true
    });
    view.screen = "quick";
    view.quickGrabDraftText = ${JSON.stringify(vaultFailureBaseline)};
    autosaveDraftsCache = {
      "capture:main": {
        key: "capture:main",
        fields: { "quick-text": ${JSON.stringify(vaultFailureBaseline)} },
        screen: "quick",
        updatedAt: "2026-07-19T00:00:00.000Z"
      }
    };
  `);
  textarea = makeElement("quick-text");
  textarea.tagName = "TEXTAREA";
  textarea.value = vaultFailureBaseline;
  textarea.isConnected = true;
  textarea.dataset.captureMethod = "keyboard";
  const originalRemoveItem = sandbox.localStorage.removeItem;
  sandbox.localStorage.removeItem = key => {
    if (key === appEval("AUTOSAVE_KEY")) throw new Error("synthetic private vault cleanup detail");
    return originalRemoveItem.call(sandbox.localStorage, key);
  };
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__dictationVaultFailureRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  sandbox.__dictationVaultFailureRecognition.onresult({ results: [Object.assign([{ transcript: "must not remain in cache" }], { isFinal: true })] });
  const vaultFailureResult = sandbox.__dictationVaultFailureRecognition.onend();
  sandbox.localStorage.removeItem = originalRemoveItem;
  check(vaultFailureResult === false && textarea.value === vaultFailureBaseline && appEval("view.quickGrabDraftText") === vaultFailureBaseline && textarea.dataset.captureMethod === "keyboard", "Device Vault cache-write failure does not restore target, view, and capture method");
  check(appEval('autosaveDraftsCache["capture:main"]?.fields?.["quick-text"]') === vaultFailureBaseline && appEval("activeDictationSession") === null, "Device Vault cache-write failure retains the recognized words or active session");
  check(!makeElement("toast").textContent.includes("must not remain") && !makeElement("toast").textContent.includes("synthetic private vault cleanup detail") && !makeElement("toast").textContent.includes("Dictation added"), "Device Vault cache-write failure exposes content or announces success");

  resetApp();
  const vaultBaseline = "Device Vault cache baseline";
  const vaultTranscript = "Device Vault recognized words";
  const vaultCommitted = `${vaultBaseline}\n${vaultTranscript}`;
  appEval(`
    settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      enableAutoSave: true,
      enableVoiceCapture: true,
      voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
      autoMemoryVaultEnabled: false,
      localEncryptionEnabled: true
    });
    view.screen = "quick";
    view.quickGrabDraftText = ${JSON.stringify(vaultBaseline)};
    localStorage.removeItem(AUTOSAVE_KEY);
    autosaveDraftsCache = {
      "capture:main": {
        key: "capture:main",
        fields: { "quick-text": ${JSON.stringify(vaultBaseline)} },
        screen: "quick",
        updatedAt: "2026-07-19T00:00:00.000Z"
      }
    };
    globalThis.__dictationVaultScheduleCalls = 0;
    globalThis.__dictationOriginalScheduleVaultSave = scheduleVaultSave;
    scheduleVaultSave = () => { globalThis.__dictationVaultScheduleCalls += 1; return true; };
  `);
  textarea = makeElement("quick-text");
  textarea.tagName = "TEXTAREA";
  textarea.value = vaultBaseline;
  textarea.isConnected = true;
  sandbox.window.SpeechRecognition = function Recognition() {
    sandbox.__dictationVaultRecognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  appEval('openDictationConsentSheet("quick-text")');
  makeElement("dictation-confirm").checked = true;
  appEval("submitDictationStartSheet()");
  appEval("scheduleAutosave()");
  sandbox.__dictationVaultRecognition.onresult({ results: [Object.assign([{ transcript: vaultTranscript }], { isFinal: true })] });
  sandbox.__dictationVaultRecognition.onend();
  appEval('openDictationConsentSheet("quick-text")');
  check(textarea.value === vaultCommitted && appEval("view.quickGrabDraftText") === vaultCommitted && appEval('autosaveDraftsCache["capture:main"]?.fields?.["quick-text"]') === vaultCommitted, "Device Vault dictation does not update the current cache before immediate render");
  check(appEval("localStorage.getItem(AUTOSAVE_KEY)") === null && appEval("__dictationVaultScheduleCalls") === 1 && appEval("autosaveTimer") === null, "Device Vault dictation creates plaintext autosave, duplicate schedule, or stale timer state");
  appEval(`
    closeSheet();
    scheduleVaultSave = globalThis.__dictationOriginalScheduleVaultSave;
  `);

  if (failures.length) throw new Error(`Dictation privacy boundary failures: ${failures.join("; ")}`);
  assert(true, "dictation defaults off, discloses before use, and commits one draft only at successful terminal completion");
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
  appEval("closeSheet()");
  assert(db().quickGrabs.some(item => item.id === savedLater.id) && db().quickGrabs.find(item => item.id === savedLater.id).processingState === "unprocessed", "Cancel keeps a previously saved capture and returns it to an unprocessed state");

  const beforeTransientCancel = appEval(`({ data: localStorage.getItem(STORAGE_KEY), memory: JSON.stringify(loadAutoMemoryVault()), undo: JSON.stringify(undoStack) })`);
  makeElement("quick-text").value = "Met with Capture Test Person. Pray for wisdom and check in tomorrow.";
  appEval('view.screen = "quick"; submitUnifiedCapture("main", "", "process")');
  const canceledGrab = db().quickGrabs[0];
  const cancelGate = appEval("renderAiGateSheet(view.sheet)");
  assert(canceledGrab.processingState === "awaitingApproval" && view().sheet?.type === "ai-gate", "Process saves one transient raw capture before opening the privacy review");
  assert(db().aiProposals.length === 0 && db().meetingNotes.length === 0 && db().prayerRequests.length === 0 && db().tasks.length === 0, "processing creates no proposal or permanent records before approval");
  assert(cancelGate.includes("Met with Capture Test Person") && cancelGate.includes('id="sheet-ai-privacy-tier"'), "initial Quick Capture privacy review shows the full local text and sensitivity selector");
  assert(cancelGate.indexOf("Mark item Do Not Send to AI") < cancelGate.indexOf("What will be used"), "initial Quick Capture privacy classification is discoverable before long context details");
  appEval("closeSheet()");
  assert(!db().quickGrabs.some(item => item.id === canceledGrab.id) && view().sheet === null, "Cancel deletes the just-created transient capture and closes the privacy review");
  assert(db().aiProposals.length === 0 && db().meetingNotes.length === 0 && db().prayerRequests.length === 0 && db().tasks.length === 0, "Cancel creates no proposal or structured ministry record");
  const afterTransientCancel = appEval(`({ data: localStorage.getItem(STORAGE_KEY), memory: JSON.stringify(loadAutoMemoryVault()), undo: JSON.stringify(undoStack) })`);
  assert(JSON.stringify(afterTransientCancel) === JSON.stringify(beforeTransientCancel), "Cancel leaves no transient capture in saved data, Auto Memory, or Undo history");

  makeElement("quick-text").value = "Keep this classified note local.";
  appEval('submitUnifiedCapture("main", "", "process")');
  const doNotSendGrabId = db().quickGrabs[0].id;
  appEval("markAiGateDoNotSend()");
  assert(db().quickGrabs.find(item => item.id === doNotSendGrabId)?.aiPrivacyTier === "Do Not Send to AI" && view().sheet === null, "Do Not Send keeps the classified capture locally and closes the review");
  assert(db().aiProposals.length === 0 && db().quickGrabs.find(item => item.id === doNotSendGrabId)?.rawContent === "Keep this classified note local.", "Do Not Send creates no proposal and preserves the full local text");

  makeElement("quick-text").value = "Met with Capture Test Person. Pray for wisdom and check in tomorrow.";
  appEval('submitUnifiedCapture("main", "", "process")');
  const processingGrab = db().quickGrabs[0];

  for (const tier of ["Private", "Sensitive", "Highly Sensitive", "Normal"]) {
    makeElement("sheet-ai-privacy-tier").value = tier;
    appEval("setAiGatePrivacyTier()");
    assert(db().quickGrabs.find(item => item.id === processingGrab.id).aiPrivacyTier === tier, `privacy review can mark the transient capture ${tier}`);
  }

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
    settings.includeSensitiveInSearch = false;
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
  assert(privacy.today.includes("Private approved profile phrase") && privacy.search.includes("Private approved task phrase") && privacy.search.includes("Private approved profile phrase"), "unlocked Today and Search show classified local content even when legacy masking settings request concealment");
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
  assert(tierPropagation.errors.length === 0 && tierPropagation.sensitive && tierPropagation.today.includes("Tier-only sensitive task"), "privacy tiers without legacy flags propagate to approved records while unlocked Today remains visible");

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
    const preservedContextPreview = proposal.contextPreview;
    const preservedRawInputPreview = proposal.rawInputPreview;
    proposal.contextPreview = "Sensitive context hidden until approval.";
    proposal.rawInputPreview = "Sensitive input hidden until approval.";
    const legacyPlaceholderCard = renderAiProposalCard(proposal);
    proposal.contextPreview = preservedContextPreview;
    proposal.rawInputPreview = preservedRawInputPreview;
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
    return { gate, waiting, cardBefore, proposal, card, legacyPlaceholderCard, sourceDeletedCard, duplicateConfirm, confirm, legacyConfirm };
  })()`);
  assert(sensitiveProposal.gate.includes("TOPSECRET"), "unlocked AI context shows classified local capture text");
  assert(sensitiveProposal.card.includes("TOPSECRET"), "unlocked AI review shows classified local capture text");
  assert(sensitiveProposal.confirm.includes("TOPSECRET"), "unlocked AI confirmation shows classified local capture text");
  assert(sensitiveProposal.legacyConfirm.includes("TOPSECRET"), "unlocked legacy AI confirmation shows classified local capture text");
  assert(sensitiveProposal.waiting.includes("Secret Person") && sensitiveProposal.cardBefore.includes("Secret Person"), "unlocked capture waiting and review cards show classified linked person identity");
  assert(sensitiveProposal.proposal.contextPreview.includes("TOPSECRET") && sensitiveProposal.proposal.rawInputPreview.includes("TOPSECRET"), "sensitive proposal previews remain locally reviewable with their classification");
  assert(sensitiveProposal.legacyPlaceholderCard.includes("TOPSECRET"), "legacy redaction placeholders fall back to the available classified local source inside AI Review");
  assert(sensitiveProposal.proposal.aiPrivacyTier === "Sensitive" && sensitiveProposal.sourceDeletedCard.includes("TOPSECRET"), "sensitive proposal content remains visible after its source capture is removed");
  assert(sensitiveProposal.duplicateConfirm.includes("Similar people already exist: Secret Person"), "sensitive final approval warnings show the local duplicate person name");

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
  assert(gateDeletion.tier === "Do Not Send to AI" && gateDeletion.context !== "Sensitive context hidden until approval." && gateDeletion.card.includes("Gate marked raw title") && gateDeletion.card.includes("Gate marked raw input"), "marking a proposal Do Not Send keeps local review content visible after its source is removed");

  const sensitiveResult = appEval(`(() => {
    const proposal = emptyAiProposal({ id: "sensitive-result", proposalType: "prayerSteward", sensitivityRisk: "medium", result: { steward: { activeOlderThan30: ["Hidden person: raw prayer detail"] } } });
    return renderAiProposalCard(proposal);
  })()`);
  assert(sensitiveResult.includes("Hidden person: raw prayer detail"), "sensitive proposal result panels remain fully visible inside unlocked AI Review");

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
  const restoreRollback = await appEval(`(async () => {
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
    const restored = await applyRestoredPayload(payload, { captureBefore: false });
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
  const vaultDisableRollback = await appEval(`(async () => {
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
    const disabled = await disableLocalEncryptionRecord();
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
    memoryVaultCache = {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: [{
        id: "memory-before",
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Before approval",
        appVersion: "synthetic-v38",
        summary: "Fictional empty state",
        signature: "fictional-memory-before",
        payload: cloneJson({ ...currentPortablePayload(), exportedAt: "2026-07-20T00:00:00.000Z" })
      }]
    };
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
    memoryVaultCache = {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: [{
        id: "memory-failure",
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Failure baseline",
        appVersion: "synthetic-v38",
        summary: "Fictional empty state",
        signature: "fictional-memory-failure",
        payload: cloneJson({ ...currentPortablePayload(), exportedAt: "2026-07-20T00:00:00.000Z" })
      }]
    };
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

async function testRestoreAndUndoTransactions() {
  resetApp("emptyData()");
  const original = appEval(`(() => {
    settings.enableAutoSave = true;
    settings.autoMemoryVaultEnabled = false;
    settings.launchScreen = "today";
    db.people = [{ id: "person_before_restore", name: "Before Restore" }];
    customCopy = { "brand.title": "Before copy" };
    const drafts = { "capture:main": { fields: { "quick-text": "Before draft" } } };
    saveSettings();
    saveData();
    saveCustomCopy();
    saveAutosaveDrafts(drafts);
    return {
      db: JSON.stringify(db),
      settings: JSON.stringify(settings),
      copy: JSON.stringify(customCopy),
      drafts: JSON.stringify(loadAutosaveDrafts())
    };
  })()`);
  sandbox.__restorePayload = appEval(`(() => {
    const payload = cloneJson(currentPortablePayload());
    payload.data.people = [{ id: "person_after_restore", name: "After Restore" }];
    payload.settings = { ...payload.settings, launchScreen: "people", enableAutoSave: true, enableUndo: true, autoMemoryVaultEnabled: false };
    payload.customCopy = { "brand.title": "Imported copy" };
    payload.autosaveDrafts = { "capture:main": { fields: { "quick-text": "Imported draft" } } };
    return payload;
  })()`);
  const restored = await appEval("applyRestoredPayload(__restorePayload)");
  const undone = await appEval("undoLast()");
  const afterUndo = appEval(`({
    db: JSON.stringify(db),
    settings: JSON.stringify(settings),
    copy: JSON.stringify(customCopy),
    drafts: JSON.stringify(loadAutosaveDrafts()),
    undoCount: undoStack.length
  })`);
  assert(restored === true && undone === true && afterUndo.db === original.db && afterUndo.settings === original.settings && afterUndo.copy === original.copy && afterUndo.drafts === original.drafts, "backup restore followed by Undo restores the exact prior records, settings, wording, and draft");
  assert(afterUndo.undoCount === 0, "successful restore Undo consumes exactly its one owned entry");

  resetApp("emptyData()");
  const ordinaryDraft = await appEval(`(async () => {
    settings.enableAutoSave = true;
    settings.autoMemoryVaultEnabled = false;
    db.people = [{ id: "ordinary_person", name: "Before ordinary edit" }];
    recordUndo("ordinary record edit");
    db.people[0].name = "After ordinary edit";
    saveAutosaveDrafts({ "capture:main": { fields: { "quick-text": "New unrelated draft" } } });
    const result = await undoLast();
    return { result, name: db.people[0].name, draft: loadAutosaveDrafts()["capture:main"]?.fields?.["quick-text"] };
  })()`);
  assert(ordinaryDraft.result === true && ordinaryDraft.name === "Before ordinary edit" && ordinaryDraft.draft === "New unrelated draft", "ordinary record Undo preserves a newer unrelated draft");

  resetApp("emptyData()");
  const failedRestore = await appEval(`(async () => {
    settings.autoMemoryVaultEnabled = false;
    db.people = [{ id: "restore_failure_person", name: "Restore failure baseline" }];
    undoStack = [{ label: "existing undo", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    const beforeUndo = JSON.stringify(undoStack);
    const payload = cloneJson(currentPortablePayload());
    payload.data.people = [{ id: "replacement_failure_person", name: "Must not persist" }];
    const originalSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic restore failure");
      return originalSet.call(localStorage, key, value);
    };
    let result = false;
    try { result = await applyRestoredPayload(payload, { captureBefore: false }); } finally { localStorage.setItem = originalSet; }
    return { result, beforeUndo, afterUndo: JSON.stringify(undoStack) };
  })()`);
  assert(failedRestore.result === false && failedRestore.afterUndo === failedRestore.beforeUndo, "forced restore failure leaves the prior Undo stack byte-identical");

  resetApp("emptyData()");
  const plainUndoFailure = await appEval(`(async () => {
    settings.autoMemoryVaultEnabled = false;
    db.people = [{ id: "plain_retry", name: "Current state" }];
    undoStack = [{ label: "plain retry", db: normalizeData({ ...emptyData(), people: [{ id: "plain_retry", name: "Undo target" }] }), settings: cloneJson(settings), customCopy: {} }];
    saveData();
    const before = { db: JSON.stringify(db), undo: JSON.stringify(undoStack), storage: localStorage.getItem(STORAGE_KEY) };
    const originalSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic undo persistence failure");
      return originalSet.call(localStorage, key, value);
    };
    let result = false;
    try { result = await undoLast(); } catch (error) { result = false; } finally { localStorage.setItem = originalSet; }
    return { result, before, after: { db: JSON.stringify(db), undo: JSON.stringify(undoStack), storage: localStorage.getItem(STORAGE_KEY) } };
  })()`);
  assert(plainUndoFailure.result === false && JSON.stringify(plainUndoFailure.after) === JSON.stringify(plainUndoFailure.before), "plain Undo persistence failure restores exact state and leaves the same entry retryable");
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
  assert(queue.find(item => item.recordId === ids.importantCapture).detail === "Private capture text", "Today shows classified capture details in the unlocked app");
  assert(queue.find(item => item.recordId === ids.prayer).detail === "Private prayer text", "Today shows classified prayer details in the unlocked app");
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
  assert(linkedSensitiveToday.task.title === "Meet Secret Task Person about private issue" && linkedSensitiveToday.task.detail === "For Secret Task Person", "Today shows task text and identity linked to a classified person");
  assert(linkedSensitiveToday.prayer.title === "Follow up on prayer with Secret Prayer Person" && linkedSensitiveToday.prayer.detail === "Secret Prayer Person private prayer detail", "Today shows classified prayer text and identity");
  assert(linkedSensitiveToday.capture.detail === "Secret Capture Person private capture detail", "Today shows important classified capture text");
  assert(linkedSensitiveToday.oldest.detail === "Secret Oldest Person oldest private capture", "Today shows oldest classified capture text");
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
  assert(appEval(`usefulFollowUpReason(personById("${sparseId}"))`) === "Private synthetic follow-up", "People shows a classified follow-up reason in the unlocked app");
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
  [searchPrivacy.excluded, searchPrivacy.masked, searchPrivacy.revealed].forEach(result => {
    assert(result.includes("Private pastoral search phrase") && result.includes("Private task search phrase") && result.includes("Private linked prayer phrase") && result.includes("Private linked capture phrase") && result.includes("Sensitive Search Person"), "Search always shows classified local text and linked identities in the unlocked app");
  });

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
  assert(overdue.queue.find(item => item.recordId === overdue.prayerId).detail === "Synthetic private prayer detail", "adversarial classified prayer text remains visible in recommendations");

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
  const boundedPersonMatch = appEval(`(() => {
    const ann = createPerson("Ann Smith");
    const substringGrab = makeQuickGrab("Met Joanne Carter for coffee", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(substringGrab);
    const substringProposal = createQuickGrabMockAiProposal(substringGrab.id);
    const substringValidation = validateAiActionExecution(
      substringProposal,
      allExecutableAiActionIndexes(substringProposal),
      { enforcePersonChoice: true }
    );
    const firstNameGrab = makeQuickGrab("Met Ann for coffee", [], "Whenever", null, { captureSource: "main" });
    const smith = createPerson("Alex Smith");
    createPerson("Alex Jones");
    const fullNameGrab = makeQuickGrab("Met Alex Smith for coffee", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(fullNameGrab);
    const fullNameProposal = createQuickGrabMockAiProposal(fullNameGrab.id);
    createPerson("Jordan Lee");
    createPerson("Jordan Lee");
    const duplicateFullNameGrab = makeQuickGrab("Met Jordan Lee for coffee", [], "Whenever", null, { captureSource: "main" });
    const lockedGrab = makeQuickGrab(
      "Met Joanne Carter for coffee",
      [],
      "Whenever",
      null,
      { captureSource: "person", personId: ann.id, personLocked: true }
    );
    return {
      annId: ann.id,
      smithId: smith.id,
      substringGrabPerson: substringGrab.relatedPersonId,
      substringProposalPerson: substringProposal.result.possiblePersonId,
      substringExistingPerson: substringValidation.existingPersonId,
      firstNameGrabPerson: firstNameGrab.relatedPersonId,
      fullNameGrabPerson: fullNameGrab.relatedPersonId,
      fullNameProposalPerson: fullNameProposal.result.possiblePersonId,
      fullNameAmbiguous: fullNameProposal.result.personMatchAmbiguous,
      duplicateFullNamePerson: duplicateFullNameGrab.relatedPersonId,
      lockedGrabPerson: lockedGrab.relatedPersonId,
      locked: lockedGrab.personLocked,
      records: db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length
    };
  })()`);
  assert(boundedPersonMatch.substringGrabPerson === "" && boundedPersonMatch.substringProposalPerson === "" && boundedPersonMatch.substringExistingPerson === "", "a first name contained inside another name never selects an existing person");
  assert(boundedPersonMatch.firstNameGrabPerson === boundedPersonMatch.annId, "one unique whole first-name token selects the intended existing person");
  assert(boundedPersonMatch.fullNameGrabPerson === boundedPersonMatch.smithId && boundedPersonMatch.fullNameProposalPerson === boundedPersonMatch.smithId && !boundedPersonMatch.fullNameAmbiguous, "one exact full-name phrase wins over a same-first-name peer");
  assert(boundedPersonMatch.duplicateFullNamePerson === "", "duplicate exact full names remain unlinked until a person is chosen explicitly");
  assert(boundedPersonMatch.locked && boundedPersonMatch.lockedGrabPerson === boundedPersonMatch.annId, "an explicit person-locked capture keeps precedence over inferred text");
  assert(boundedPersonMatch.records === 0, "bounded person matching creates no structured record before explicit approval");

  resetApp("emptyData()");
  const backendPersonContract = appEval(`(() => {
    const jordanOne = createPerson("Jordan Lee");
    const jordanTwo = createPerson("Jordan Lee");
    const ann = createPerson("Ann Smith");
    const joanne = createPerson("Joanne Carter");
    const duplicateGrab = makeQuickGrab("Met Jordan Lee for coffee", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(duplicateGrab);
    const duplicateProposal = normalizeBackendQuickGrabProposal({
      ok: true,
      mode: "real",
      proposal: {
        title: "Adversarial duplicate-person proposal",
        relatedPersonIdSuggestion: jordanOne.id,
        relatedPersonId: jordanOne.id,
        personId: jordanOne.id,
        targetPersonId: jordanOne.id,
        detectedPersonName: jordanOne.name,
        result: {
          possiblePersonId: jordanOne.id,
          relatedPersonIdSuggestion: jordanOne.id,
          relatedPersonId: jordanOne.id,
          personId: jordanOne.id,
          targetPersonId: jordanOne.id,
          personMatchAmbiguous: false
        },
        proposedActions: [{
          actionId: "duplicate-meeting",
          actionType: "createMeetingNote",
          relatedPersonId: jordanOne.id,
          personId: jordanOne.id,
          targetPersonId: jordanOne.id,
          summary: "Synthetic duplicate-name meeting",
          meetingDate: todayISO()
        }]
      }
    }, duplicateGrab);
    const duplicateValidation = validateAiActionExecution(duplicateProposal, [0], { enforcePersonChoice: true });
    const explicitValidation = validateAiActionExecution(duplicateProposal, [0], {
      personChoice: { mode: "existing", existingPersonId: jordanTwo.id },
      enforcePersonChoice: true
    });

    const lockedGrab = makeQuickGrab(
      "Met Joanne Carter for coffee",
      [],
      "Whenever",
      null,
      { captureSource: "person", personId: ann.id, personLocked: true }
    );
    db.quickGrabs.push(lockedGrab);
    const lockedProposal = normalizeBackendQuickGrabProposal({
      ok: true,
      mode: "real",
      proposal: {
        title: "Adversarial locked-person proposal",
        relatedPersonIdSuggestion: joanne.id,
        relatedPersonId: joanne.id,
        personId: joanne.id,
        targetPersonId: joanne.id,
        detectedPersonName: joanne.name,
        result: {
          possiblePersonId: joanne.id,
          relatedPersonIdSuggestion: joanne.id,
          relatedPersonId: joanne.id,
          personId: joanne.id,
          targetPersonId: joanne.id
        },
        proposedActions: [{
          actionId: "locked-meeting",
          actionType: "createMeetingNote",
          relatedPersonId: joanne.id,
          personId: joanne.id,
          targetPersonId: joanne.id,
          summary: "Synthetic locked-person meeting",
          meetingDate: todayISO()
        }]
      }
    }, lockedGrab);
    const lockedValidation = validateAiActionExecution(lockedProposal, [0], { enforcePersonChoice: true });
    return {
      jordanOneId: jordanOne.id,
      jordanTwoId: jordanTwo.id,
      annId: ann.id,
      duplicatePossiblePersonId: duplicateProposal.result.possiblePersonId,
      duplicatePossiblePersonIds: duplicateProposal.result.possiblePersonIds,
      duplicateAmbiguous: duplicateProposal.result.personMatchAmbiguous,
      duplicateProposalPersonIds: [
        duplicateProposal.relatedPersonIdSuggestion,
        duplicateProposal.relatedPersonId,
        duplicateProposal.personId,
        duplicateProposal.targetPersonId,
        duplicateProposal.result.relatedPersonIdSuggestion,
        duplicateProposal.result.relatedPersonId,
        duplicateProposal.result.personId,
        duplicateProposal.result.targetPersonId
      ],
      duplicateActionPersonIds: [
        duplicateProposal.proposedActions[0].relatedPersonId,
        duplicateProposal.proposedActions[0].personId,
        duplicateProposal.proposedActions[0].targetPersonId
      ],
      duplicateExistingPersonId: duplicateValidation.existingPersonId,
      duplicatePersonErrors: duplicateValidation.personResolutionErrors,
      explicitExistingPersonId: explicitValidation.existingPersonId,
      explicitErrors: explicitValidation.errors,
      lockedPossiblePersonId: lockedProposal.result.possiblePersonId,
      lockedProposalPersonIds: [
        lockedProposal.relatedPersonIdSuggestion,
        lockedProposal.relatedPersonId,
        lockedProposal.personId,
        lockedProposal.targetPersonId,
        lockedProposal.result.relatedPersonIdSuggestion,
        lockedProposal.result.relatedPersonId,
        lockedProposal.result.personId,
        lockedProposal.result.targetPersonId
      ],
      lockedActionPersonIds: [
        lockedProposal.proposedActions[0].relatedPersonId,
        lockedProposal.proposedActions[0].personId,
        lockedProposal.proposedActions[0].targetPersonId
      ],
      lockedExistingPersonId: lockedValidation.existingPersonId,
      lockedErrors: lockedValidation.errors,
      records: db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length
    };
  })()`);
  assert(backendPersonContract.duplicatePossiblePersonId === "" && backendPersonContract.duplicatePossiblePersonIds.length === 2 && backendPersonContract.duplicateAmbiguous && backendPersonContract.duplicateProposalPersonIds.every(id => id === ""), "backend normalization preserves duplicate-name ambiguity and clears every supplied proposal/result person ID");
  assert(backendPersonContract.duplicateActionPersonIds.every(id => id === "") && backendPersonContract.duplicateExistingPersonId === "" && backendPersonContract.duplicatePersonErrors.length > 0, "backend action IDs cannot bypass an ambiguous local person match");
  assert(backendPersonContract.explicitExistingPersonId === backendPersonContract.jordanTwoId && backendPersonContract.explicitErrors.length === 0, "an explicit human choice can resolve an ambiguous backend proposal to the selected existing person");
  assert(backendPersonContract.lockedPossiblePersonId === backendPersonContract.annId && backendPersonContract.lockedProposalPersonIds.every(id => id === backendPersonContract.annId) && backendPersonContract.lockedActionPersonIds.every(id => id === "") && backendPersonContract.lockedExistingPersonId === backendPersonContract.annId && backendPersonContract.lockedErrors.length === 0, "a person-locked capture replaces proposal/result IDs with local source truth and clears conflicting action IDs");
  assert(backendPersonContract.records === 0, "backend proposal normalization and validation create no structured records before final approval");

  resetApp("emptyData()");
  const persistedLegacyGrabContract = appEval(`(() => {
    settings.quickGrabAiMode = "backendQuickGrab";
    const ann = createPerson("Ann Smith");
    ann.aiPrivacyTier = "Do Not Send to AI";
    ann.hometown = "Synthetic Private Town";
    const joanne = createPerson("Joanne Carter");
    const staleGrab = makeQuickGrab("Met Joanne Carter for coffee", [], "Whenever", null, { captureSource: "legacy" });
    staleGrab.relatedPersonId = ann.id;
    staleGrab.detectedPersonName = ann.name;
    staleGrab.personLocked = false;
    staleGrab.category = "People";
    db.quickGrabs.push(staleGrab);

    const contractBefore = quickGrabPersonContract(staleGrab, db.people);
    const candidatePeople = quickGrabCandidatePeopleForBackend(staleGrab);
    const blockedPeople = quickGrabBlockedPeopleForBackend(staleGrab);
    const payload = buildQuickGrabBackendPayload(staleGrab);
    const context = buildQuickGrabAiContextReview(staleGrab.id);
    const contextText = JSON.stringify(context);
    const waitingMarkup = renderCaptureWaitingRow(staleGrab);
    const cardMarkup = renderQuickGrabCard(staleGrab);
    const findings = dataJanitorFindings(dataJanitorAllowedRecordsByCollection());
    const preApprovalRecords = db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length;
    const linkedToAnnBefore = linkedRecordCountForPerson(ann.id);
    const linkedToJoanneBefore = linkedRecordCountForPerson(joanne.id);
    const annSearchHasGrab = buildSearchResults(ann.name).find(group => group.key === "captures")?.items.some(item => item.quickGrabId === staleGrab.id) || false;
    const joanneSearchHasGrab = buildSearchResults(joanne.name).find(group => group.key === "captures")?.items.some(item => item.quickGrabId === staleGrab.id) || false;

    const staleProposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: staleGrab.id,
      result: { possiblePersonId: ann.id, possiblePersonName: ann.name, personMatchAmbiguous: false },
      proposedActions: [{
        actionId: "stale-egress-meeting",
        actionType: "createMeetingNote",
        relatedPersonId: ann.id,
        summary: "Synthetic stale-link reconciliation meeting",
        meetingDate: todayISO()
      }]
    });
    db.aiProposals.push(staleProposal);
    const staleValidation = validateAiActionExecution(staleProposal, [0], { enforcePersonChoice: true });
    applyAiProposalActions(staleProposal, staleValidation, { convertQuickGrab: true });
    let duplicateBlocked = false;
    try { applyAiProposalActions(staleProposal, staleValidation, { convertQuickGrab: true }); } catch (error) { duplicateBlocked = true; }

    const missingLock = makeQuickGrab(
      "Met Joanne Carter for coffee",
      [],
      "Whenever",
      null,
      { captureSource: "person", personId: ann.id, personLocked: true }
    );
    db.quickGrabs.push(missingLock);
    db.people = db.people.filter(person => person.id !== ann.id);
    const missingLockContract = quickGrabPersonContract(missingLock, db.people);
    const missingLockContext = buildQuickGrabAiContextReview(missingLock.id);
    let missingLockPayloadBlocked = false;
    try { buildQuickGrabBackendPayload(missingLock); } catch (error) { missingLockPayloadBlocked = error.message === "quick_grab_locked_person_missing"; }
    const missingLockProposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: missingLock.id,
      result: { possiblePersonId: joanne.id, possiblePersonName: joanne.name, personMatchAmbiguous: false },
      proposedActions: [{
        actionId: "missing-lock-meeting",
        actionType: "createMeetingNote",
        relatedPersonId: joanne.id,
        summary: "Synthetic missing-lock meeting",
        meetingDate: todayISO()
      }]
    });
    const missingLockValidation = validateAiActionExecution(missingLockProposal, [0], { enforcePersonChoice: true });
    const missingLockExplicitValidation = validateAiActionExecution(missingLockProposal, [0], {
      personChoice: { mode: "existing", existingPersonId: joanne.id },
      enforcePersonChoice: true
    });
    return {
      annName: ann.name,
      joanneId: joanne.id,
      joanneName: joanne.name,
      contractPersonId: contractBefore.person?.id || "",
      candidatePeople,
      blockedPeople,
      payload,
      contextBlocked: context.blocked,
      contextText,
      waitingMarkup,
      cardMarkup,
      privacyTier: aiPrivacyTierForRecord({ ...staleGrab, relatedPersonId: ann.id, personLocked: false }, "quickGrabs"),
      donorIdentifiable: donorUpdatePotentiallyIdentifiable(staleGrab, "quickGrabs"),
      unlinkedQuickGrabIds: findings.unlinkedRecords.filter(item => item.collection === "quickGrabs").map(item => item.record.id),
      linkedToAnn: linkedToAnnBefore,
      linkedToJoanne: linkedToJoanneBefore,
      annSearchHasGrab,
      joanneSearchHasGrab,
      preApprovalRecords,
      validationErrors: staleValidation.errors,
      meetingCount: db.meetingNotes.length,
      meetingPersonId: db.meetingNotes[0]?.relatedPersonId,
      sourcePersonId: staleGrab.relatedPersonId,
      sourcePersonLocked: staleGrab.personLocked,
      duplicateBlocked,
      missingLockPersonId: missingLockContract.person?.id || "",
      missingLockAmbiguous: missingLockContract.ambiguous,
      missingLockTargetMissing: missingLockContract.lockedTargetMissing,
      missingLockContextBlocked: missingLockContext.blocked,
      missingLockContextUsedText: missingLockContext.used.some(item => item.label === "One Quick Grab text"),
      missingLockPayloadBlocked,
      missingLockId: missingLock.id,
      missingLockCandidates: quickGrabCandidatePeopleForBackend(missingLock),
      missingLockValidationPersonId: missingLockValidation.existingPersonId,
      missingLockErrors: missingLockValidation.errors,
      missingLockExplicitPersonId: missingLockExplicitValidation.existingPersonId,
      missingLockExplicitErrors: missingLockExplicitValidation.errors
    };
  })()`);
  assert(persistedLegacyGrabContract.contractPersonId === persistedLegacyGrabContract.joanneId, "a persisted non-locked legacy link is re-evaluated by the current whole-token person contract");
  assert(persistedLegacyGrabContract.candidatePeople.length === 1 && persistedLegacyGrabContract.candidatePeople[0].id === persistedLegacyGrabContract.joanneId && persistedLegacyGrabContract.payload.candidatePeople.length === 1 && persistedLegacyGrabContract.payload.candidatePeople[0].id === persistedLegacyGrabContract.joanneId, "stale legacy person metadata cannot enter backend candidate context or the outbound payload");
  assert(persistedLegacyGrabContract.blockedPeople.length === 0 && !persistedLegacyGrabContract.contextBlocked && !persistedLegacyGrabContract.contextText.includes(persistedLegacyGrabContract.annName) && persistedLegacyGrabContract.contextText.includes(persistedLegacyGrabContract.joanneName), "a stale Do Not Send link neither leaks nor falsely blocks the current trusted candidate context");
  assert(persistedLegacyGrabContract.privacyTier === "Normal" && !persistedLegacyGrabContract.donorIdentifiable && persistedLegacyGrabContract.waitingMarkup.includes(persistedLegacyGrabContract.joanneName) && !persistedLegacyGrabContract.waitingMarkup.includes(persistedLegacyGrabContract.annName) && persistedLegacyGrabContract.cardMarkup.includes(persistedLegacyGrabContract.joanneName) && !persistedLegacyGrabContract.cardMarkup.includes(persistedLegacyGrabContract.annName), "local privacy, donor-review classification, and capture labels use the current trusted person rather than a stale raw ID");
  assert(!persistedLegacyGrabContract.unlinkedQuickGrabIds.length && persistedLegacyGrabContract.linkedToAnn === 0 && persistedLegacyGrabContract.linkedToJoanne === 1, "unlinked classification and linked-record counts use the trusted Quick Grab person contract");
  assert(!persistedLegacyGrabContract.annSearchHasGrab && persistedLegacyGrabContract.joanneSearchHasGrab, "Search ignores a v39 stale detected person name and uses current raw and contract-derived person truth");
  assert(persistedLegacyGrabContract.preApprovalRecords === 0 && persistedLegacyGrabContract.validationErrors.length === 0, "persisted legacy reconciliation creates no record before approval and validates against current local truth");
  assert(persistedLegacyGrabContract.meetingCount === 1 && persistedLegacyGrabContract.meetingPersonId === persistedLegacyGrabContract.joanneId && persistedLegacyGrabContract.sourcePersonId === persistedLegacyGrabContract.joanneId && persistedLegacyGrabContract.sourcePersonLocked, "approved conversion links both the new record and its source capture to the one validated person");
  assert(persistedLegacyGrabContract.duplicateBlocked && persistedLegacyGrabContract.meetingCount === 1, "repeating a reconciled legacy approval cannot duplicate the structured record");
  assert(persistedLegacyGrabContract.missingLockPersonId === "" && persistedLegacyGrabContract.missingLockAmbiguous && persistedLegacyGrabContract.missingLockTargetMissing && persistedLegacyGrabContract.missingLockCandidates.length === 0, "a missing person-lock target fails closed without rematching capture text");
  assert(persistedLegacyGrabContract.missingLockContextBlocked && !persistedLegacyGrabContract.missingLockContextUsedText && persistedLegacyGrabContract.missingLockPayloadBlocked, "a missing person-lock target is excluded before backend context or payload construction");
  assert(persistedLegacyGrabContract.missingLockValidationPersonId === "" && persistedLegacyGrabContract.missingLockErrors.length > 0 && persistedLegacyGrabContract.missingLockExplicitPersonId === persistedLegacyGrabContract.joanneId && persistedLegacyGrabContract.missingLockExplicitErrors.length === 0, "a stale lock requires explicit human resolution and still permits a deliberate existing-person choice");
  let missingLockFetchCalls = 0;
  sandbox.fetch = async () => {
    missingLockFetchCalls += 1;
    return { ok: true, async json() { return { ok: true, proposal: {} }; } };
  };
  await appEval(`createQuickGrabBackendAiProposal("${persistedLegacyGrabContract.missingLockId}")`);
  const missingLockAfterBackendAttempt = appEval(`db.quickGrabs.find(grab => grab.id === "${persistedLegacyGrabContract.missingLockId}")`);
  assert(missingLockFetchCalls === 0 && missingLockAfterBackendAttempt.processingState === "failed", "backend Quick Grab processing makes no request when a locked person target is missing");

  resetApp("emptyData()");
  const legacyPersonContract = appEval(`(() => {
    const jordanOne = createPerson("Jordan Lee");
    const jordanTwo = createPerson("Jordan Lee");
    const ann = createPerson("Ann Smith");
    const joanne = createPerson("Joanne Carter");
    const duplicateGrab = makeQuickGrab("Met Jordan Lee for coffee", [], "Whenever", null, { captureSource: "main" });
    db.quickGrabs.push(duplicateGrab);
    const staleDuplicateProposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: duplicateGrab.id,
      result: { possiblePersonId: jordanOne.id, possiblePersonName: jordanOne.name, personMatchAmbiguous: false },
      proposedActions: [{
        actionId: "stale-duplicate-meeting",
        actionType: "createMeetingNote",
        relatedPersonId: jordanOne.id,
        summary: "Synthetic stale duplicate meeting",
        meetingDate: todayISO()
      }]
    });
    const staleDuplicateValidation = validateAiActionExecution(staleDuplicateProposal, [0], { enforcePersonChoice: true });
    const explicitValidation = validateAiActionExecution(staleDuplicateProposal, [0], {
      personChoice: { mode: "existing", existingPersonId: jordanTwo.id },
      enforcePersonChoice: true
    });

    const lockedGrab = makeQuickGrab(
      "Met Joanne Carter for coffee",
      [],
      "Whenever",
      null,
      { captureSource: "person", personId: ann.id, personLocked: true }
    );
    db.quickGrabs.push(lockedGrab);
    const staleLockedProposal = emptyAiProposal({
      sourceType: "quickGrab",
      sourceId: lockedGrab.id,
      result: { possiblePersonId: joanne.id, possiblePersonName: joanne.name, personMatchAmbiguous: false },
      proposedActions: [{
        actionId: "stale-locked-meeting",
        actionType: "createMeetingNote",
        relatedPersonId: joanne.id,
        summary: "Synthetic stale locked meeting",
        meetingDate: todayISO()
      }]
    });
    db.aiProposals.push(staleLockedProposal);
    const preApprovalRecords = db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length;
    const lockedValidation = validateAiActionExecution(staleLockedProposal, [0], { enforcePersonChoice: true });
    applyAiProposalActions(staleLockedProposal, lockedValidation, { convertQuickGrab: true });
    let duplicateBlocked = false;
    try { applyAiProposalActions(staleLockedProposal, lockedValidation, { convertQuickGrab: true }); } catch (error) { duplicateBlocked = true; }
    return {
      jordanTwoId: jordanTwo.id,
      annId: ann.id,
      staleDuplicateExistingPersonId: staleDuplicateValidation.existingPersonId,
      staleDuplicatePersonErrors: staleDuplicateValidation.personResolutionErrors,
      explicitExistingPersonId: explicitValidation.existingPersonId,
      explicitErrors: explicitValidation.errors,
      lockedExistingPersonId: lockedValidation.existingPersonId,
      lockedErrors: lockedValidation.errors,
      preApprovalRecords,
      meetingCount: db.meetingNotes.length,
      meetingPersonId: db.meetingNotes[0]?.relatedPersonId,
      sourceActionId: db.meetingNotes[0]?.sourceAIActionId,
      duplicateBlocked
    };
  })()`);
  assert(legacyPersonContract.staleDuplicateExistingPersonId === "" && legacyPersonContract.staleDuplicatePersonErrors.length > 0, "saved legacy Quick Grab proposals cannot bypass current ambiguous-person validation");
  assert(legacyPersonContract.explicitExistingPersonId === legacyPersonContract.jordanTwoId && legacyPersonContract.explicitErrors.length === 0, "saved legacy proposals still accept an explicit human person choice");
  assert(legacyPersonContract.lockedExistingPersonId === legacyPersonContract.annId && legacyPersonContract.lockedErrors.length === 0, "saved legacy proposals obey the current person-lock source contract");
  assert(legacyPersonContract.preApprovalRecords === 0 && legacyPersonContract.meetingCount === 1 && legacyPersonContract.meetingPersonId === legacyPersonContract.annId && Boolean(legacyPersonContract.sourceActionId), "one approved locked-person save creates exactly one correctly linked record with an idempotency key");
  assert(legacyPersonContract.duplicateBlocked && legacyPersonContract.meetingCount === 1, "repeating the approved stale proposal cannot duplicate the linked record");

  resetApp("emptyData()");
  const crossProposalSourceContract = appEval(`(() => {
    const ann = createPerson("Ann Smith");
    const joanne = createPerson("Joanne Carter");
    const grab = makeQuickGrab("Met Joanne Carter for coffee", [], "Whenever", null, { captureSource: "legacy" });
    grab.relatedPersonId = ann.id;
    grab.detectedPersonName = ann.name;
    grab.personLocked = false;
    db.quickGrabs.push(grab);
    const proposal = emptyAiProposal({
      sourceType: "dataJanitor",
      sourceId: "",
      proposalType: "dataJanitor",
      proposedActions: [{
        actionId: "cross-proposal-stale-source",
        actionType: "createMeetingNote",
        sourceQuickGrabId: grab.id,
        relatedPersonId: ann.id,
        summary: "Synthetic cross-proposal source meeting",
        meetingDate: todayISO()
      }]
    });
    db.aiProposals.push(proposal);
    const validation = validateAiActionExecution(proposal, [0], { enforcePersonChoice: true });
    const preApprovalRecords = db.meetingNotes.length;
    applyAiProposalActions(proposal, validation, { convertQuickGrab: true });
    return {
      joanneId: joanne.id,
      resolvedPersonId: validation.existingPersonId,
      errors: validation.errors,
      preApprovalRecords,
      meetingCount: db.meetingNotes.length,
      meetingPersonId: db.meetingNotes[0]?.relatedPersonId || "",
      sourcePersonId: grab.relatedPersonId,
      sourcePersonLocked: grab.personLocked
    };
  })()`);
  assert(crossProposalSourceContract.resolvedPersonId === crossProposalSourceContract.joanneId && crossProposalSourceContract.errors.length === 0, "every proposal type resolves an action-supplied source Quick Grab through current local person truth");
  assert(crossProposalSourceContract.preApprovalRecords === 0 && crossProposalSourceContract.meetingCount === 1 && crossProposalSourceContract.meetingPersonId === crossProposalSourceContract.joanneId && crossProposalSourceContract.sourcePersonId === crossProposalSourceContract.joanneId && crossProposalSourceContract.sourcePersonLocked, "cross-proposal approval creates exactly one correctly linked record and reconciles the source capture");

  resetApp("emptyData()");
  const staleSourceNameContract = appEval(`(() => {
    const ann = createPerson("Ann Smith");
    const grab = makeQuickGrab("Met a new student after large group", [], "Whenever", null, { captureSource: "legacy" });
    grab.relatedPersonId = ann.id;
    grab.detectedPersonName = ann.name;
    grab.personLocked = false;
    db.quickGrabs.push(grab);
    const proposal = emptyAiProposal({
      sourceType: "dataJanitor",
      sourceId: "",
      proposalType: "dataJanitor",
      result: { possiblePersonId: ann.id, possiblePersonName: ann.name, personMatchAmbiguous: false },
      proposedActions: [{
        actionId: "cross-proposal-stale-name",
        actionType: "createMeetingNote",
        sourceQuickGrabId: grab.id,
        relatedPersonId: ann.id,
        personName: ann.name,
        summary: "Synthetic new-student meeting",
        meetingDate: todayISO()
      }]
    });
    const validation = validateAiActionExecution(proposal, [0], { enforcePersonChoice: true });
    return {
      annName: ann.name,
      existingPersonId: validation.existingPersonId,
      suggestedPersonName: validation.suggestedPersonName,
      newPersonName: validation.newPersonName,
      errors: validation.errors,
      records: db.notes.length + db.meetingNotes.length + db.prayerRequests.length + db.tasks.length
    };
  })()`);
  assert(staleSourceNameContract.existingPersonId === "" && staleSourceNameContract.suggestedPersonName === "" && staleSourceNameContract.newPersonName === "" && staleSourceNameContract.errors.length > 0, "a stale proposal name cannot prefill a new person when current source text has no grounded local person resolution");
  assert(staleSourceNameContract.records === 0, "an unresolved stale source name creates no canonical record before explicit human resolution");

  resetApp("emptyData()");
  const invalidSourceBindingContract = appEval(`(() => {
    const ann = createPerson("Ann Smith");
    const bob = createPerson("Bob Jones");
    const annGrab = makeQuickGrab("Met Ann Smith for coffee", [], "Whenever", null, { captureSource: "legacy" });
    const bobGrab = makeQuickGrab("Met Bob Jones for coffee", [], "Whenever", null, { captureSource: "legacy" });
    db.quickGrabs.push(annGrab, bobGrab);
    const multiSourceProposal = emptyAiProposal({
      sourceType: "dataJanitor",
      sourceId: "",
      proposalType: "dataJanitor",
      proposedActions: [
        { actionId: "multi-ann", actionType: "createMeetingNote", sourceQuickGrabId: annGrab.id, relatedPersonId: ann.id, summary: "Synthetic Ann meeting", meetingDate: todayISO() },
        { actionId: "multi-bob", actionType: "createMeetingNote", sourceQuickGrabId: bobGrab.id, relatedPersonId: bob.id, summary: "Synthetic Bob meeting", meetingDate: todayISO() }
      ]
    });
    const multiValidation = validateAiActionExecution(multiSourceProposal, [0, 1], { enforcePersonChoice: true });
    let multiApplyBlocked = false;
    try { applyAiProposalActions(multiSourceProposal, multiValidation, { convertQuickGrab: true }); } catch (error) { multiApplyBlocked = true; }

    const missingSourceProposal = emptyAiProposal({
      sourceType: "dataJanitor",
      sourceId: "",
      proposalType: "dataJanitor",
      proposedActions: [{
        actionId: "missing-source",
        actionType: "createMeetingNote",
        sourceQuickGrabId: "missing-grab",
        relatedPersonId: ann.id,
        summary: "Synthetic missing-source meeting",
        meetingDate: todayISO()
      }]
    });
    const missingValidation = validateAiActionExecution(missingSourceProposal, [0], { enforcePersonChoice: true });
    let missingApplyBlocked = false;
    try { applyAiProposalActions(missingSourceProposal, missingValidation, { convertQuickGrab: true }); } catch (error) { missingApplyBlocked = true; }
    return {
      multiErrors: multiValidation.sourceQuickGrabBindingErrors,
      multiSourceIds: multiValidation.sourceQuickGrabIds,
      multiApplyBlocked,
      missingErrors: missingValidation.sourceQuickGrabBindingErrors,
      missingSourceId: missingValidation.sourceQuickGrabId,
      missingApplyBlocked,
      meetingCount: db.meetingNotes.length,
      annStatus: annGrab.status,
      bobStatus: bobGrab.status
    };
  })()`);
  assert(invalidSourceBindingContract.multiErrors.length > 0 && invalidSourceBindingContract.multiSourceIds.length === 2 && invalidSourceBindingContract.multiApplyBlocked, "selected actions that reference different Quick Grabs fail closed before execution");
  assert(invalidSourceBindingContract.missingErrors.length > 0 && invalidSourceBindingContract.missingSourceId === "missing-grab" && invalidSourceBindingContract.missingApplyBlocked, "a proposal-carried Quick Grab reference must resolve to one current live capture");
  assert(invalidSourceBindingContract.meetingCount === 0 && invalidSourceBindingContract.annStatus === "Needs Processing" && invalidSourceBindingContract.bobStatus === "Needs Processing", "invalid source bindings create no records and convert no captures");

  resetApp("emptyData()");
  const indexedPersonScale = appEval(`(() => {
    const firstDuplicateIdPerson = { id: "duplicate-id", name: "First Duplicate" };
    const secondDuplicateIdPerson = { id: "duplicate-id", name: "Second Duplicate" };
    const duplicateIdPeople = [firstDuplicateIdPerson, secondDuplicateIdPerson];
    const duplicateIdIndex = buildQuickGrabPersonIndex(duplicateIdPeople);
    const indexedLockedPerson = quickGrabPersonContract(
      { rawContent: "Second Duplicate", relatedPersonId: "duplicate-id", personLocked: true },
      duplicateIdPeople,
      duplicateIdIndex
    ).person;
    db.people = Array.from({ length: 500 }, (_, index) => ({
      id: "scale-person-" + index,
      name: "Person" + index + " Surname" + index,
      personType: "Student",
      status: "Active",
      careLevel: "Normal"
    }));
    db.quickGrabs = Array.from({ length: 600 }, (_, index) => ({
      id: "scale-grab-" + index,
      rawContent: "Met Person" + (index % 500) + " Surname" + (index % 500) + " for coffee scale-query",
      detectedPersonName: "Stale Person",
      category: "People",
      status: "Needs Processing",
      urgency: "Whenever",
      relatedPersonId: "",
      personLocked: false,
      sensitiveFlag: false,
      createdAt: nowISO(),
      updatedAt: nowISO()
    }));
    const originalNormalizedName = normalizedName;
    let normalizedNameCalls = 0;
    normalizedName = value => {
      normalizedNameCalls += 1;
      return originalNormalizedName(value);
    };
    const startedAt = Date.now();
    const captures = buildSearchResults("scale-query").find(group => group.key === "captures")?.items || [];
    const elapsedMs = Date.now() - startedAt;
    normalizedName = originalNormalizedName;
    return {
      normalizedNameCalls,
      elapsedMs,
      captureCount: captures.length,
      indexedLockedPersonName: indexedLockedPerson?.name || ""
    };
  })()`);
  assert(indexedPersonScale.indexedLockedPersonName === "First Duplicate", "indexed locked-person lookup preserves the established first-match behavior for corrupt duplicate IDs");
  assert(indexedPersonScale.captureCount === 600, "indexed person matching preserves all 600 synthetic Search results");
  assert(indexedPersonScale.normalizedNameCalls <= 2000, "bulk Search builds one people index and performs bounded per-capture normalization instead of rebuilding all 500 people for each capture");

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
  assert(profile.includes("Private grounded prayer concern") && profile.includes("Private grounded memory") && profile.includes("Send the saved check-in"), "Right Now shows classified local evidence and keeps a grounded next action");

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
  assert(linkedPrayerPrivacy.tier === "Sensitive" && linkedPrayerPrivacy.rightNowMarkup.includes("Raw linked prayer task detail"), "Right Now shows a normal task linked to a classified prayer");
  assert(linkedPrayerPrivacy.previewMarkup.includes("Raw linked prayer task detail"), "profile history shows a normal task linked to a classified prayer");
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
  assert(appEval("backupHealthState().label") === "No download initiated", "backup health truthfully notices missing download initiation");
  assert(appEval("backupHealthState().action") === "export-encrypted-json", "backup health chooses encrypted action for sensitive data");

  appEval(`settings.backupReminderDays = "7"`);
  appEval("exportJson()");
  assert(downloadEvents.length === 1 && downloadEvents[0].download.includes("ruf-ministry-hub-export-"), "JSON export triggers a download");
  assert(appEval("settings.lastBackupAt") !== "", "JSON export records backup timestamp");
  assert(appEval("backupHealthState().label") === "Download initiated today", "backup health records only the browser download initiation after export");

  const readinessBackupRow = markup => {
    const start = markup.indexOf("Backup Rhythm");
    const end = markup.indexOf("</article>", start);
    return start < 0 || end < 0 ? "" : markup.slice(start, end);
  };
  const readinessCases = [
    { label: "missing backup with reminder off", reminder: "0", last: "", ready: false, text: "Reminder Off" },
    { label: "missing backup with reminder on", reminder: "7", last: "", ready: false },
    { label: "malformed backup timestamp", reminder: "7", last: "not-a-date", ready: false },
    { label: "stale backup with reminder on", reminder: "7", last: appEval("daysAgo(8)"), ready: false },
    { label: "fresh backup with reminder off", reminder: "0", last: appEval("nowISO()"), ready: false, text: "Reminder Off" },
    { label: "fresh backup with reminder on", reminder: "7", last: appEval("nowISO()"), ready: true }
  ];
  readinessCases.forEach(fixture => {
    sandbox.__readinessFixture = fixture;
    const row = readinessBackupRow(appEval(`
      settings.backupReminderDays = globalThis.__readinessFixture.reminder;
      settings.lastBackupAt = globalThis.__readinessFixture.last;
      renderReadinessCheck();
    `));
    assert(row.includes(fixture.ready ? "Ready" : "Needs Work"), `iPhone readiness classifies ${fixture.label} truthfully`);
    if (fixture.text) assert(row.includes(fixture.text), `iPhone readiness explains ${fixture.label}`);
  });

  const backupTruthCases = [
    { label: "absent initiation", reminder: "7", last: "", healthLabel: "No download initiated", healthTone: "rose", status: "No backup download initiation has been recorded" },
    { label: "invalid initiation", reminder: "7", last: "not-a-date", healthLabel: "No download initiated", healthTone: "rose", status: "No valid backup download initiation has been recorded" },
    { label: "reminder off", reminder: "0", last: appEval("nowISO()"), healthLabel: "Reminder off", healthTone: "gray", status: "Backup download initiated" },
    { label: "initiation due", reminder: "7", last: appEval("daysAgo(8)"), healthLabel: "Download initiation due", healthTone: "gold", status: "Backup download initiated" },
    { label: "current initiation", reminder: "7", last: appEval("nowISO()"), healthLabel: "Download initiated today", healthTone: "green", status: "Backup download initiated" }
  ];
  const forbiddenBackupClaims = ["Backed up today", "Backup current", "Last export", "current or off"];
  backupTruthCases.forEach(fixture => {
    sandbox.__backupTruthFixture = fixture;
    const copy = appEval(`(() => {
      settings.backupReminderDays = globalThis.__backupTruthFixture.reminder;
      settings.lastBackupAt = globalThis.__backupTruthFixture.last;
      const health = backupHealthState();
      const recordsByCollection = weeklyResetAllowedRecordsByCollection();
      const findings = weeklyResetFindings(recordsByCollection);
      const context = buildWeeklyResetContextReview();
      const plan = weeklyResetPlanFromFindings(findings, context);
      return {
        health,
        status: backupStatusText(),
        weekly: [
          weeklyResetContextSummary(recordsByCollection, findings),
          context.used.find(item => item.label === "Backup status")?.summary || "",
          context.warnings.find(item => /backup/i.test(item)) || "",
          plan.tenMinutePlan.at(-1),
          plan.thirtyMinutePlan.at(-1),
          plan.adminCleanup.at(-1),
          plan.backupReminder,
          plan.contextSummary
        ]
      };
    })()`);
    const allBackupCopy = JSON.stringify(copy);
    assert(copy.health.label === fixture.healthLabel && copy.health.tone === fixture.healthTone, `Backup Health distinguishes ${fixture.label}`);
    assert(copy.status.includes(fixture.status), `backup status identifies ${fixture.label} as initiation metadata`);
    assert(copy.health.detail.includes("Files") && copy.weekly.filter(Boolean).every(value => value.includes("Files")), `Backup Health and Weekly Reset direct ${fixture.label} confirmation to Files`);
    assert(forbiddenBackupClaims.every(claim => !allBackupCopy.includes(claim)), `Backup Health and Weekly Reset avoid durable-file claims for ${fixture.label}`);
  });

  const appManual = appEval("renderAppManual()");
  const backupGuideStart = appManual.indexOf("Back up and restore");
  const backupGuideEnd = appManual.indexOf("Install on iPhone Home Screen", backupGuideStart);
  const backupGuide = backupGuideStart >= 0 && backupGuideEnd > backupGuideStart
    ? appManual.slice(backupGuideStart, backupGuideEnd)
    : "";
  assert(backupGuide.includes("download-initiation status") && backupGuide.includes("browser to start a JSON backup download") && backupGuide.includes("browser to start an encrypted backup download"), "complete in-app backup guide describes export only as browser download initiation");
  assert(backupGuide.includes("confirm the expected non-zero file appears in Files before relying on it"), "complete in-app backup guide requires Files confirmation before reliance");
  assert(backupGuide.includes("To restore, choose a JSON backup file with Restore from backup file.") && backupGuide.includes("If the file is encrypted, enter the backup passphrase."), "backup guide preserves selected-file restore and encrypted-import wording");
  ["a backup is missing, due, current", "normal backup file", "make a protected backup file"].forEach(claim => {
    assert(!backupGuide.includes(claim), `complete in-app backup guide avoids stale file-existence claim: ${claim}`);
  });

  const originalCreateElement = sandbox.document.createElement;
  const originalAppendChild = sandbox.document.body.appendChild;
  const originalCreateObjectURL = sandbox.URL.createObjectURL;
  const originalRevokeObjectURL = sandbox.URL.revokeObjectURL;
  const cleanup = { remove: 0, revoke: 0, click: 0 };
  sandbox.document.createElement = () => ({
    href: "",
    download: "",
    click() { cleanup.click += 1; },
    remove() { cleanup.remove += 1; }
  });
  sandbox.document.body.appendChild = value => value;
  sandbox.URL.createObjectURL = () => "blob:cleanup-success";
  sandbox.URL.revokeObjectURL = () => { cleanup.revoke += 1; };
  try {
    appEval(`downloadJson({ fixture: "synthetic" }, "synthetic.json")`);
    assert(cleanup.click === 1 && cleanup.remove === 1 && cleanup.revoke === 1, "download helper removes its anchor and revokes its URL exactly once after success");
    cleanup.remove = 0;
    cleanup.revoke = 0;
    cleanup.click = 0;
    sandbox.document.createElement = () => ({
      href: "",
      download: "",
      click() { cleanup.click += 1; throw new Error("synthetic click failure"); },
      remove() { cleanup.remove += 1; }
    });
    const failedCleanup = appEval(`(() => { try { downloadJson({ fixture: "synthetic" }, "synthetic.json"); return false; } catch (error) { return true; } })()`);
    assert(failedCleanup && cleanup.click === 1 && cleanup.remove === 1 && cleanup.revoke === 1, "download helper removes its anchor and revokes its URL exactly once when click throws");
    cleanup.remove = 0;
    cleanup.revoke = 0;
    cleanup.click = 0;
    sandbox.URL.createObjectURL = () => { throw new Error("synthetic object URL failure"); };
    const failedObjectUrl = appEval(`(() => { try { downloadJson({ fixture: "synthetic" }, "synthetic.json"); return false; } catch (error) { return true; } })()`);
    assert(failedObjectUrl && cleanup.click === 0 && cleanup.remove === 0 && cleanup.revoke === 0, "download helper creates no cleanup debt when object URL creation fails");
    cleanup.remove = 0;
    cleanup.revoke = 0;
    cleanup.click = 0;
    sandbox.URL.createObjectURL = () => "blob:cleanup-append-failure";
    sandbox.document.body.appendChild = () => { throw new Error("synthetic anchor insertion failure"); };
    const failedAppend = appEval(`(() => { try { downloadJson({ fixture: "synthetic" }, "synthetic.json"); return false; } catch (error) { return true; } })()`);
    assert(failedAppend && cleanup.click === 0 && cleanup.remove === 1 && cleanup.revoke === 1, "download helper cleans its anchor and object URL exactly once when insertion fails");
  } finally {
    sandbox.document.createElement = originalCreateElement;
    sandbox.document.body.appendChild = originalAppendChild;
    sandbox.URL.createObjectURL = originalCreateObjectURL;
    sandbox.URL.revokeObjectURL = originalRevokeObjectURL;
  }

  resetApp("demoData()");
  appEval(`settings.lastBackupAt = "2026-01-02T03:04:05.000Z"; saveSettings();`);
  const plainFailureBefore = appEval(`JSON.stringify({
    settings,
    persistedSettings: localStorage.getItem(SETTINGS_KEY),
    db,
    undoStack,
    autoMemory: loadAutoMemoryVault(),
    vaultSaveRequestedRevision,
    vaultSaveCompletedRevision,
    vaultPayloadGeneration
  })`);
  const plainFailure = appEval(`(() => {
    const originalDownloadJson = downloadJson;
    downloadJson = () => { throw new Error("synthetic download initiation failure"); };
    try {
      try { return { result: exportJson(), threw: false }; }
      catch (error) { return { result: null, threw: true }; }
    } finally {
      downloadJson = originalDownloadJson;
    }
  })()`);
  const plainFailureAfter = appEval(`JSON.stringify({
    settings,
    persistedSettings: localStorage.getItem(SETTINGS_KEY),
    db,
    undoStack,
    autoMemory: loadAutoMemoryVault(),
    vaultSaveRequestedRevision,
    vaultSaveCompletedRevision,
    vaultPayloadGeneration
  })`);
  assert(!plainFailure.threw && plainFailure.result === false, "plain export reports a failed download initiation without throwing");
  assert(plainFailureAfter === plainFailureBefore, "plain export initiation failure preserves live and persisted backup state exactly");

  const exportOrder = appEval(`(() => {
    const originalDownloadJson = downloadJson;
    const originalSetItem = localStorage.setItem;
    const events = [];
    downloadJson = () => { events.push("download"); return true; };
    localStorage.setItem = (key, value) => {
      if (key === SETTINGS_KEY) events.push("settings");
      return originalSetItem.call(localStorage, key, value);
    };
    try { return { result: exportJson(), events, toast: document.getElementById("toast").textContent }; }
    finally { downloadJson = originalDownloadJson; localStorage.setItem = originalSetItem; }
  })()`);
  assert(exportOrder.result === true && exportOrder.events.join("|") === "download|settings", "plain export initiates the download before recording backup status");
  assert(exportOrder.toast === "Backup download started. Confirm the file appears in Files.", "plain export uses truthful confirmation copy");

  resetApp("demoData()");
  appEval(`settings.lastBackupAt = "2026-02-03T04:05:06.000Z"; saveSettings();`);
  const partialBefore = appEval(`({ live: JSON.stringify(settings), persisted: localStorage.getItem(SETTINGS_KEY) })`);
  const partialResult = appEval(`(() => {
    const originalDownloadJson = downloadJson;
    const originalSetItem = localStorage.setItem;
    const events = [];
    let failed = false;
    downloadJson = () => { events.push("download"); return true; };
    localStorage.setItem = (key, value) => {
      if (key === SETTINGS_KEY && !failed) {
        failed = true;
        events.push("settings");
        throw new Error("synthetic backup status persistence failure");
      }
      return originalSetItem.call(localStorage, key, value);
    };
    try { return { result: exportJson(), events, toast: document.getElementById("toast").textContent, live: JSON.stringify(settings), persisted: localStorage.getItem(SETTINGS_KEY) }; }
    finally { downloadJson = originalDownloadJson; localStorage.setItem = originalSetItem; }
  })()`);
  assert(partialResult.result === false && partialResult.events.join("|") === "download|settings", "plain export treats post-download status persistence failure as partial success");
  assert(partialResult.live === partialBefore.live && partialResult.persisted === partialBefore.persisted, "plain export rolls failed backup-status persistence back exactly");
  assert(partialResult.toast === "Backup download may have started, but its status was not recorded.", "plain export explains partial success without claiming a recorded backup");

  assert(appEval('maskedText(true, "Hidden", "Visible")') === "Visible", "classified previews stay visible in the unlocked app even when a legacy masking preference exists");
  appEval("settings.maskSensitivePreviews = false");
  assert(appEval('maskedText(true, "Hidden", "Visible")') === "Visible", "classified previews remain visible when the legacy preference is off");
}

async function testAutoMemoryVault() {
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
  await appEval(`submitAutoMemorySheet("restore", "${firstSnapshotId}")`);
  assert(db().people.length === 2, "Auto Memory restore sheet blocks unchecked restore");
  makeElement("sheet-auto-memory-confirm").checked = true;
  await appEval(`submitAutoMemorySheet("restore", "${firstSnapshotId}")`);
  assert(db().people.length === 1 && db().people[0].name === "Saved Person", "Auto Memory restore replaces current local app state");

  const deleteSnapshotId = appEval("loadAutoMemoryVault().snapshots[0].id");
  appEval(`openAutoMemorySheet("delete", "${deleteSnapshotId}")`);
  makeElement("sheet-auto-memory-confirm").checked = true;
  await appEval(`submitAutoMemorySheet("delete", "${deleteSnapshotId}")`);
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

  resetApp("demoData()");
  appEval('openDataSafetySheet("encrypted-export")');
  makeElement("sheet-export-passphrase").value = "synthetic-passphrase";
  makeElement("sheet-export-confirm").value = "synthetic-passphrase";
  let resolveProtectedExport;
  sandbox.__protectedExportGate = new Promise(resolve => { resolveProtectedExport = resolve; });
  appEval(`
    globalThis.__originalProtectedEncryptPayload = encryptPayload;
    globalThis.__originalProtectedDownloadJson = downloadJson;
    globalThis.__protectedEncryptCalls = 0;
    globalThis.__protectedDownloads = 0;
    encryptPayload = () => {
      globalThis.__protectedEncryptCalls += 1;
      return globalThis.__protectedExportGate;
    };
    downloadJson = () => { globalThis.__protectedDownloads += 1; return true; };
  `);
  try {
    const firstProtectedExport = appEval('submitDataSafetySheet("encrypted-export")');
    const busyMarkup = appEval("renderSheet()");
    const secondProtectedExport = await appEval('submitDataSafetySheet("encrypted-export")');
    const closeWhileBusy = appEval("closeSheet()");
    assert(appEval("globalThis.__protectedEncryptCalls") === 1 && secondProtectedExport === false, "protected export rejects rapid reentry before a second encryption or download");
    assert(appEval("Boolean(view.sheet?.backupExportOwnerId) && view.sheet.backupExportOwnerId === activeProtectedBackupExport?.id") && busyMarkup.includes('aria-busy="true"') && busyMarkup.includes("disabled"), "protected export exposes one accessible busy owner and disables its controls");
    assert(closeWhileBusy === false && view().sheet?.kind === "encrypted-export", "protected export cannot be closed while its current operation owns the sheet");
    resolveProtectedExport({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "synthetic" });
    assert(await firstProtectedExport === true, "protected export current owner completes successfully");
    assert(appEval("globalThis.__protectedDownloads") === 1 && view().sheet === null && !appEval("activeProtectedBackupExport"), "protected export downloads once, clears its owner, and closes only its own sheet");
    assert(appEval("document.getElementById('toast').textContent") === "Backup download started. Confirm the file appears in Files.", "protected export uses truthful confirmation copy");
  } finally {
    appEval(`
      encryptPayload = globalThis.__originalProtectedEncryptPayload;
      downloadJson = globalThis.__originalProtectedDownloadJson;
      delete globalThis.__originalProtectedEncryptPayload;
      delete globalThis.__originalProtectedDownloadJson;
      delete globalThis.__protectedEncryptCalls;
      delete globalThis.__protectedDownloads;
      delete globalThis.__protectedExportGate;
    `);
  }

  resetApp("demoData()");
  appEval('openDataSafetySheet("encrypted-export")');
  makeElement("sheet-export-passphrase").value = "retry-passphrase";
  makeElement("sheet-export-confirm").value = "retry-passphrase";
  const protectedWarnings = [];
  const originalWarn = sandbox.console.warn;
  sandbox.console.warn = (...args) => protectedWarnings.push(args.map(value => String(value)).join(" "));
  appEval(`
    globalThis.__originalRetryEncryptPayload = encryptPayload;
    globalThis.__originalRetryDownloadJson = downloadJson;
    globalThis.__retryEncryptCalls = 0;
    globalThis.__retryDownloads = 0;
    encryptPayload = () => {
      globalThis.__retryEncryptCalls += 1;
      if (globalThis.__retryEncryptCalls === 1) return Promise.reject(new Error("synthetic-private-export-marker"));
      return Promise.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "synthetic" });
    };
    downloadJson = () => { globalThis.__retryDownloads += 1; return true; };
  `);
  try {
    assert(await appEval('submitDataSafetySheet("encrypted-export")') === false, "protected export reports one generic current-owner failure");
    assert(view().sheet?.kind === "encrypted-export" && !view().sheet?.backupExportOwnerId && !appEval("activeProtectedBackupExport"), "protected export failure clears only the current owner and leaves one retry surface");
    assert(!protectedWarnings.join("|").includes("synthetic-private-export-marker") && !appEval("document.getElementById('toast').textContent").includes("synthetic-private-export-marker"), "protected export failure emits no content-bearing diagnostic");
    makeElement("sheet-export-passphrase").value = "retry-passphrase";
    makeElement("sheet-export-confirm").value = "retry-passphrase";
    assert(await appEval('submitDataSafetySheet("encrypted-export")') === true, "protected export allows one healthy retry after failure");
    assert(appEval("globalThis.__retryEncryptCalls === 2 && globalThis.__retryDownloads === 1") && view().sheet === null, "protected export retry creates one new generation and one download");
  } finally {
    sandbox.console.warn = originalWarn;
    appEval(`
      encryptPayload = globalThis.__originalRetryEncryptPayload;
      downloadJson = globalThis.__originalRetryDownloadJson;
      delete globalThis.__originalRetryEncryptPayload;
      delete globalThis.__originalRetryDownloadJson;
      delete globalThis.__retryEncryptCalls;
      delete globalThis.__retryDownloads;
    `);
  }

  resetApp("demoData()");
  appEval(`settings.lastBackupAt = "2026-03-04T05:06:07.000Z"; saveSettings(); openDataSafetySheet("encrypted-export")`);
  makeElement("sheet-export-passphrase").value = "partial-passphrase";
  makeElement("sheet-export-confirm").value = "partial-passphrase";
  const encryptedPartialBefore = appEval(`({ live: JSON.stringify(settings), persisted: localStorage.getItem(SETTINGS_KEY) })`);
  const encryptedPartial = await appEval(`(async () => {
    const originalEncryptPayload = encryptPayload;
    const originalDownloadJson = downloadJson;
    const originalSetItem = localStorage.setItem;
    let failed = false;
    let downloads = 0;
    encryptPayload = () => Promise.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "synthetic" });
    downloadJson = () => { downloads += 1; return true; };
    localStorage.setItem = (key, value) => {
      if (key === SETTINGS_KEY && !failed) {
        failed = true;
        throw new Error("synthetic encrypted status failure");
      }
      return originalSetItem.call(localStorage, key, value);
    };
    try {
      const result = await submitDataSafetySheet("encrypted-export");
      return {
        result,
        downloads,
        live: JSON.stringify(settings),
        persisted: localStorage.getItem(SETTINGS_KEY),
        owner: Boolean(activeProtectedBackupExport),
        sheetKind: view.sheet?.kind || "",
        sheetOwner: view.sheet?.backupExportOwnerId || "",
        toast: document.getElementById("toast").textContent
      };
    } finally {
      encryptPayload = originalEncryptPayload;
      downloadJson = originalDownloadJson;
      localStorage.setItem = originalSetItem;
    }
  })()`);
  assert(encryptedPartial.result === false && encryptedPartial.downloads === 1, "encrypted export treats status failure after one accepted click as partial success");
  assert(encryptedPartial.live === encryptedPartialBefore.live && encryptedPartial.persisted === encryptedPartialBefore.persisted, "encrypted export rolls failed status metadata back exactly");
  assert(!encryptedPartial.owner && encryptedPartial.sheetKind === "encrypted-export" && !encryptedPartial.sheetOwner, "encrypted partial success clears only its owner and returns one retry surface");
  assert(encryptedPartial.toast === "Backup download may have started, but its status was not recorded.", "encrypted export uses truthful partial-success copy");

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

async function testPortableSchemaClassificationBoundary() {
  resetApp("emptyData()");
  const result = await appEval(`(async () => {
    const base = cloneJson(currentPortablePayload());
    base.data.people = [{ id: "portable_schema_current", name: "Current fictional record" }];
    const withoutMarker = (topMarker, nestedMarker) => {
      const payload = cloneJson(base);
      delete payload.dataSchemaVersion;
      delete payload.data.dataSchemaVersion;
      if (topMarker !== "__absent__") payload.dataSchemaVersion = topMarker;
      if (nestedMarker !== "__absent__") payload.data.dataSchemaVersion = nestedMarker;
      return payload;
    };
    const positives = [
      ["absent-absent", "__absent__", "__absent__", null, false, false],
      ["top-schema-2", 2, "__absent__", 2, true, false],
      ["nested-schema-2", "__absent__", 2, 2, false, true],
      ["matching-schema-2", 2, 2, 2, true, true],
      ["top-schema-3", 3, "__absent__", 3, true, false],
      ["nested-schema-3", "__absent__", 3, 3, false, true],
      ["matching-schema-3", 3, 3, 3, true, true]
    ].map(([name, top, nested, schemaVersion, topPresent, nestedPresent]) => {
      const payload = withoutMarker(top, nested);
      if (name === "matching-schema-3") delete payload.data.aiProposals;
      try {
        const classification = classifyPortableBackupSchema(payload);
        validateBackupPayload(payload);
        return {
          name,
          passed: classification.schemaVersion === schemaVersion
            && classification.topPresent === topPresent
            && classification.nestedPresent === nestedPresent
        };
      } catch (error) {
        return { name, passed: false, message: error?.message || "" };
      }
    });
    const negatives = [
      ["string-envelope", payload => { payload.version = "2"; }, "Backup app or version is not supported."],
      ["schema-1", payload => { payload.dataSchemaVersion = 1; }, "Backup data schema is not supported."],
      ["future-schema", payload => { payload.dataSchemaVersion = 999; payload.data.dataSchemaVersion = 999; payload.data.unknownFutureCollection = [{ id: "future_unknown" }]; }, "Backup data schema is not supported."],
      ["mismatched-schema", payload => { payload.dataSchemaVersion = 2; payload.data.dataSchemaVersion = 3; }, "Backup data schema is not supported."],
      ["reverse-mismatched-schema", payload => { payload.dataSchemaVersion = 3; payload.data.dataSchemaVersion = 2; }, "Backup data schema is not supported."],
      ["string-schema", payload => { payload.data.dataSchemaVersion = "3"; }, "Backup data schema is not supported."],
      ["null-schema", payload => { payload.dataSchemaVersion = null; }, "Backup data schema is not supported."],
      ["boolean-schema", payload => { payload.data.dataSchemaVersion = true; }, "Backup data schema is not supported."],
      ["object-schema", payload => { payload.dataSchemaVersion = {}; }, "Backup data schema is not supported."],
      ["array-schema", payload => { payload.data.dataSchemaVersion = []; }, "Backup data schema is not supported."],
      ["float-schema", payload => { payload.dataSchemaVersion = 2.5; }, "Backup data schema is not supported."],
      ["nan-schema", payload => { payload.data.dataSchemaVersion = NaN; }, "Backup data schema is not supported."],
      ["infinite-schema", payload => { payload.dataSchemaVersion = Infinity; }, "Backup data schema is not supported."]
    ].map(([name, mutate, expectedMessage]) => {
      const payload = withoutMarker(3, 3);
      mutate(payload);
      try {
        validateBackupPayload(payload);
        return { name, rejected: false, fixedMessage: false };
      } catch (error) {
        return { name, rejected: true, fixedMessage: error?.message === expectedMessage };
      }
    });

    db = normalizeData({ ...emptyData(), people: [{ id: "portable_schema_before", name: "Before rejected restore" }] });
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, enableUndo: true, autoMemoryVaultEnabled: true });
    customCopy = { "brand.title": "Before rejected restore" };
    autosaveDraftsCache = { "capture:main": { fields: { "quick-text": "Before rejected restore" } } };
    memoryVaultCache = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] };
    recordUndo("portable schema before");
    view = { ...view, screen: "quick", sheet: { type: "data-safety", kind: "import" } };
    const future = withoutMarker(999, 999);
    future.data.people = [{ id: "portable_schema_future", name: "Must never replace" }];
    future.data.unknownFutureCollection = [{ id: "future_unknown_collection" }];
    const portableStateSnapshot = () => {
      const state = captureRecoveryTransactionState();
      state.localStorage = Array.from(state.localStorage.entries()).sort(([left], [right]) => left.localeCompare(right));
      return JSON.stringify({ state, epoch: recoveryEpoch, pending: recoveryTransactionPending, kind: recoveryTransactionKind });
    };
    const before = portableStateSnapshot();
    const originalBeginRecoveryTransaction = beginRecoveryTransaction;
    const originalNormalizeData = normalizeData;
    let beginCalls = 0;
    let normalizeCalls = 0;
    beginRecoveryTransaction = (...args) => { beginCalls += 1; return originalBeginRecoveryTransaction(...args); };
    normalizeData = (...args) => { normalizeCalls += 1; return originalNormalizeData(...args); };
    let applyRejected = false;
    let applyMessage = "";
    try {
      await applyRestoredPayload(future);
    } catch (error) {
      applyRejected = true;
      applyMessage = error?.message || "";
    } finally {
      beginRecoveryTransaction = originalBeginRecoveryTransaction;
      normalizeData = originalNormalizeData;
    }
    const after = portableStateSnapshot();
    return { positives, negatives, applyRejected, applyMessage, beginCalls, normalizeCalls, unchanged: before === after };
  })()`);
  assert(result.positives.every(item => item.passed), "portable classifier supports absent markers and schema 2/3 in top-only, nested-only, or matching positions");
  assert(result.negatives.every(item => item.rejected && item.fixedMessage), "portable classifier rejects coercible envelope and every unsupported, mismatched, or malformed schema with fixed content-free errors");
  assert(result.applyRejected && result.applyMessage === "Backup data schema is not supported." && result.beginCalls === 0 && result.normalizeCalls === 0 && result.unchanged, "direct future-schema restore rejects before normalization, recovery ownership, or live/durable/Undo/Auto Memory mutation");
}

async function testStoredDataSchemaClassificationBoundary() {
  resetApp("emptyData()");
  const result = await appEval(`(() => {
    const graph = marker => {
      const value = cloneJson(emptyData());
      value.people = [{ id: "stored_schema_classifier", name: "Stored schema classifier" }];
      if (marker === "__absent__") delete value.dataSchemaVersion;
      else value.dataSchemaVersion = marker;
      return value;
    };
    const positives = [
      ["missing", "__absent__", null, false],
      ["schema-2", 2, 2, true],
      ["current-3", 3, 3, true]
    ].map(([name, marker, expectedVersion, present]) => {
      try {
        const classification = classifyStoredDataSchema(graph(marker));
        return { name, passed: classification.schemaVersion === expectedVersion && classification.present === present };
      } catch (error) {
        return { name, passed: false, message: error?.message || "" };
      }
    });
    const negatives = [
      ["schema-1", 1],
      ["future", 999],
      ["string", "3"],
      ["null", null],
      ["boolean", true],
      ["object", { version: 3 }],
      ["array", [3]],
      ["fractional", 3.5],
      ["nan", NaN],
      ["infinity", Infinity]
    ].map(([name, marker]) => {
      try {
        classifyStoredDataSchema(graph(marker));
        return { name, rejected: false, fixedMessage: false };
      } catch (error) {
        return { name, rejected: true, fixedMessage: error?.message === "Saved ministry data schema is not supported." };
      }
    });
    const prior = localStorage.getItem(STORAGE_KEY);
    let canonicalRetryRejected = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph(999)));
      canonicalIndexedDbValue(STORAGE_KEY);
    } catch (error) {
      canonicalRetryRejected = error?.message === "Canonical local value for " + STORAGE_KEY + " is invalid.";
    } finally {
      if (prior === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, prior);
    }
    return { positives, negatives, canonicalRetryRejected };
  })()`);

  assert(result.positives.every(item => item.passed), "stored-data schema classifier supports only missing, exact schema 2, and exact current schema 3 records");
  assert(result.negatives.every(item => item.rejected && item.fixedMessage), "stored-data schema classifier rejects old, future, coercible, malformed, fractional, and non-finite markers with one fixed message");
  assert(result.canonicalRetryRejected, "canonical IndexedDB retry refuses an unsupported local data marker");
}

async function testContextualDatesAndLegacyProfileCompatibility() {
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
  const compatibility = await appEval(`(async () => {
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
    await applyRestoredPayload(legacy, { captureBefore: false, toast: "Legacy restored." });
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
  const unnamedCompatibility = await appEval(`(async () => {
    const legacy = {
      app: "RUF Ministry Hub",
      version: 2,
      data: {
        people: [{ id: "person_missing_name" }],
        quickGrabs: [], notes: [], meetingNotes: [], prayerRequests: [], tasks: []
      }
    };
    const restored = await applyRestoredPayload(legacy, { captureBefore: false });
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
  assert(html.includes('const APP_VERSION = "2026.07.22-calm-os-core-v42-ai-pilot.2"'), "deploy app declares the host-gated local v42 fictional AI pilot boundary");
  assert(serviceWorkerSource.includes('const CACHE_NAME = "ruf-ministry-hub-v95-calm-os-core-v42-ai-pilot.2"'), "service worker cache identity matches the host-gated local v42 fictional AI pilot app");
  const appUnlockSource = html.slice(html.indexOf("function unlockApp()"), html.indexOf("async function unlockVault()"));
  assert(
    appUnlockSource.indexOf('showToast("Unlocked.")') < appUnlockSource.indexOf("requestPageHeadingFocus()")
      && appUnlockSource.indexOf("requestPageHeadingFocus()") < appUnlockSource.indexOf("render()"),
    "successful App Lock unlock requests current page-heading focus once before rendering"
  );
  const vaultUnlockSource = html.slice(html.indexOf("async function unlockVault()"), html.indexOf("async function enableLocalEncryption()"));
  assert(
    vaultUnlockSource.includes("const unlockAttemptId = ++vaultUnlockAttemptSequence")
      && vaultUnlockSource.includes("unlockAttemptId !== vaultUnlockAttemptSequence")
      && vaultUnlockSource.includes("localStorage.getItem(ENCRYPTED_STORAGE_KEY)")
      && vaultUnlockSource.includes("!== rawEnvelope"),
    "Device Vault unlock binds every nonempty attempt to the latest in-memory owner and exact raw envelope"
  );
  assert(
    vaultUnlockSource.indexOf("classifyStoredDataSchema(payload?.data)") < vaultUnlockSource.indexOf("stagedData = normalizeData(payload.data)")
      && vaultUnlockSource.indexOf("classifyAutoMemoryVault(rawAutoMemory)") < vaultUnlockSource.indexOf("stagedData = normalizeData(payload.data)")
      && vaultUnlockSource.indexOf("const publicationOwnership = ownership()") < vaultUnlockSource.indexOf("db = stagedData")
      && vaultUnlockSource.includes("VAULT_SCHEMA_RETRY_MESSAGE")
      && vaultUnlockSource.includes("VAULT_ENVELOPE_RETRY_MESSAGE"),
    "Device Vault unlock classifies decrypted main and Auto Memory payloads before staging, then rechecks ownership before publication"
  );
  const autoMemorySource = html.slice(html.indexOf("function autoMemorySchemaError()"), html.indexOf("function loadAutoMemoryVault()"));
  assert(
    html.includes("const MAX_AUTO_MEMORY_RAW_SNAPSHOTS = 50")
      && autoMemorySource.includes("function classifyAutoMemorySnapshotPayload(payload)")
      && autoMemorySource.includes("ownsData === ownsLegacyData")
      && autoMemorySource.includes("topVersion !== nestedVersion")
      && autoMemorySource.includes("raw.snapshots.length > MAX_AUTO_MEMORY_RAW_SNAPSHOTS")
      && autoMemorySource.indexOf("classifyAutoMemoryVault(raw)") < autoMemorySource.indexOf(".map(snapshot =>"),
    "Auto Memory uses one strict snapshot classifier and rejects an oversized raw vault before per-snapshot work"
  );
  assert(
    html.includes('const VAULT_SCHEMA_RETRY_MESSAGE = "Encrypted storage could not be opened safely. It was not changed."')
      && html.includes('const VAULT_ENVELOPE_RETRY_MESSAGE = "Encrypted storage changed. Try again."'),
    "Device Vault storage retry messages are fixed and contain no marker, record, passphrase, ciphertext, or error detail"
  );
  assert(
    vaultUnlockSource.indexOf("view.locked = Boolean(settings.appLockEnabled && settings.pinHash)") < vaultUnlockSource.indexOf("if (!view.locked) requestPageHeadingFocus();")
      && vaultUnlockSource.indexOf("if (!view.locked) requestPageHeadingFocus();") < vaultUnlockSource.indexOf("render()"),
    "successful Device Vault unlock requests heading focus only when the effective App Lock screen is absent"
  );
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
  assert(indexSource.includes('window.location.replace("./ruf-ministry-hub"') && indexSource.includes("legacyCaptureQueryKeys") && indexSource.includes("new URLSearchParams(window.location.search)"), "index enters the native extensionless Pages route only after filtering legacy capture query keys");
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
  assert(manualDoc.includes("browser is asked to start the JSON download") && manualDoc.includes("download-initiation status"), "manual QA distinguishes browser download initiation from a saved file");
  assert(manualDoc.includes("expected non-zero JSON file appears in Downloads/Files before relying on it"), "manual QA requires Files confirmation before relying on an export");
  assert(!manualDoc.includes("Confirm Backup Health changes after export."), "manual QA does not imply an export created a durable file");
}

async function run() {
  testCurrentScreensRender();
  testCalmPrimaryNavigation();
  testCleanupAndLargeDataPaths();
  testQuickGrabFragmentPrivacyBoundary();
  await testDictationPrivacyBoundary();
  testUnifiedCaptureAndProposalSafety();
  testProposalActionsDoNotHidePersonDateUpdates();
  await testAdversarialApprovalAndPersistenceBoundaries();
  await testAiApprovalWaitsForDurablePersistence();
  await testRestoreAndUndoTransactions();
  testCoreLocalActions();
  testAdhdModeAndTodaySectionVisibility();
  testAutopilotAndAttentionPresets();
  testTodayRecommendationPriorityAndActions();
  testPeopleCardCalmContract();
  await testAdversarialCalmOsDataShapes();
  await testUnavailableCaptureProcessing();
  testCalmProfileContract();
  testExportAndPrivacyHelpers();
  await testAutoMemoryVault();
  await testSecuritySheets();
  await testDataSafetySheets();
  testBackupValidationBoundary();
  await testStoredDataSchemaClassificationBoundary();
  await testPortableSchemaClassificationBoundary();
  await testContextualDatesAndLegacyProfileCompatibility();
  testServiceWorkerShape();
  testRedirectAndServiceWorkerRouting();
  testCurrentDocsDoNotClaimRemovedScreens();
  console.log("All current regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

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
const html = fs.readFileSync(appPath, "utf8");
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, "utf8");
const redirectsSource = fs.readFileSync(redirectsPath, "utf8");
const indexSource = fs.readFileSync(indexPath, "utf8");
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

function makeChip(kind, value) {
  const classes = new Set(["chip"]);
  return {
    textContent: value,
    innerText: value,
    dataset: kind === "tag" ? { tag: value } : { urgency: value },
    addEventListener() {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    }
  };
}

const quickTagChips = ["People", "Prayer", "Donors", "Teaching", "Events", "Admin", "Personal"]
  .map(tag => makeChip("tag", tag));
const urgencyChips = ["Today", "Soon", "Important"].map(urgency => makeChip("urgency", urgency));

function resetChips() {
  quickTagChips.forEach(chip => chip.classList.remove("active"));
  urgencyChips.forEach(chip => chip.classList.remove("active"));
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
      if (selector === "#quick-tags .chip") return quickTagChips;
      if (selector === "#quick-tags .chip.active") return quickTagChips.filter(chip => chip.classList.contains("active"));
      if (selector === "#urgency-tags .chip") return urgencyChips;
      if (selector === "#urgency-tags .chip.active") return urgencyChips.filter(chip => chip.classList.contains("active"));
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
  resetChips();
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
      appCoachShowOnToday: false,
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
    memoryVaultCache = null;
    localStorage.removeItem(AUTO_MEMORY_KEY);
    pendingUrlQuickGrabText = "";
    pendingUrlQuickGrabTags = [];
    pendingUrlQuickGrabUrgency = "";
    pendingUrlQuickGrabParams = null;
  `);
}

function testCurrentScreensRender() {
  resetApp("demoData()");
  ["today", "autopilot", "quick", "review", "search", "people", "person", "prayer", "minutes", "weekly", "settings", "coach", "duplicates", "readiness", "manual"].forEach(screen => {
    sandbox.__screen = screen;
    const markup = appEval(`
      view.screen = __screen;
      if (__screen === "person") view.personId = db.people[0]?.id || null;
      renderScreen();
    `);
    assert(typeof markup === "string" && markup.length > 20, `${screen} screen renders`);
  });
}

function testQuickGrabSharedUrlImport() {
  resetApp();
  makeElement("quick-text").value = "";
  setUrl("?quickgrab=Prayer%20capture&quickgrabCategory=prayer&quickgrabUrgency=soon");
  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");

  assert(view().screen === "quick", "shared URL opens Quick Grab");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL populates Quick Grab draft");
  assert(quickTagChips.find(chip => chip.dataset.tag === "Prayer").classList.contains("active"), "quickgrabCategory selects Prayer chip");
  assert(urgencyChips.find(chip => chip.dataset.urgency === "Soon").classList.contains("active"), "quickgrabUrgency selects urgency chip");
  assert(location.search === "", "shared URL params are removed after import");

  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL import does not duplicate after cleanup");

  makeElement("quick-text").value = "Prayer capture";
  appEval('view.quickGrabDraftText = "Prayer capture"');
  setUrl("?quickgrab=Prayer%20capture&quickgrabCategory=prayer");
  appEval("importQuickGrabFromCurrentUrl(); applyPendingUrlQuickGrabText();");
  assert(view().quickGrabDraftText === "Prayer capture", "shared URL import does not duplicate an existing identical draft");

  appEval("createQuickGrab();");
  const grab = db().quickGrabs[0];
  assert(grab.rawContent === "Prayer capture", "shared draft saves as Quick Grab");
  assert(grab.category === "Prayer", "shared category is used when saving");
  assert(grab.urgency === "Soon", "shared urgency is used when saving");
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
  appEval('updateSetting("adhdMode", true)');
  assert(appEval("settings.adhdMode") === true, "ADHD Mode can be enabled");
  assert(appEval("settings.calmMode") === true, "ADHD Mode keeps Calm Mode on");
  assert(appEval("settings.reviewBatchSize") === "1", "ADHD Mode switches review to one card");
  assert(appEval("settings.launchScreen") === "today", "ADHD Mode opens to Today");

  const adhdToday = appEval('view.screen = "today"; renderToday();');
  assert(adhdToday.includes("One thing, then the next."), "ADHD Today uses low-choice helper copy");
  assert(adhdToday.includes("Next Loose Thing"), "ADHD Today renames loose reminders");
  assert(adhdToday.includes("Next Person"), "ADHD Today renames people section");
  assert(adhdToday.includes("Next Follow-Up"), "ADHD Today renames follow-ups");

  appEval(`
    settings.todayShowQuickCapture = false;
    settings.todayShowQuickReview = false;
    settings.todayShowCarePeople = false;
    settings.todayShowFollowUps = false;
    settings.todayShowPeopleShortcuts = false;
  `);
  const hiddenToday = appEval('renderToday();');
  assert(!hiddenToday.includes(">Capture</button>"), "ADHD Today can hide Quick Capture");
  assert(!hiddenToday.includes("Next Loose Thing"), "ADHD Today can hide loose reminders");
  assert(!hiddenToday.includes("Next Person"), "ADHD Today can hide people section");
  assert(!hiddenToday.includes("Next Follow-Up"), "ADHD Today can hide follow-ups");
}

function testAutopilotAndAttentionPresets() {
  resetApp("demoData()");
  const firstAction = appEval("autopilotNextAction()");
  assert(firstAction.kind === "Quick Grab", "Autopilot chooses a loose Quick Grab first");
  assert(firstAction.primaryAction === "qg-process", "Autopilot can route into processing");

  const todayMarkup = appEval('view.screen = "today"; renderToday();');
  assert(todayMarkup.includes("Next Best Step"), "Today can show Autopilot next step");
  assert(todayMarkup.includes("Autopilot"), "Today labels the Autopilot card");

  const autopilotMarkup = appEval('view.screen = "autopilot"; renderScreen();');
  assert(autopilotMarkup.includes("How Autopilot Chooses"), "Autopilot screen explains its local priority order");
  assert(autopilotMarkup.includes("Next-Level Build Guardrails"), "Autopilot screen keeps future integrations labeled as guardrails");

  appEval('settings.adhdPreset = "overwhelmed"; applyAdhdPreset();');
  assert(appEval("settings.adhdMode") === true, "Overwhelmed preset enables ADHD Mode");
  assert(appEval("settings.autopilotMode") === true, "Overwhelmed preset keeps Autopilot on");
  assert(appEval("settings.todayShowQuickReview") === false, "Overwhelmed preset hides loose reminders");
  assert(appEval("settings.todayShowCarePeople") === false, "Overwhelmed preset hides people section");
  assert(appEval("settings.todayShowFollowUps") === false, "Overwhelmed preset hides follow-ups");
  const overwhelmedToday = appEval('view.screen = "today"; renderToday();');
  assert(overwhelmedToday.includes("Next Best Step"), "Overwhelmed Today keeps one Autopilot action");
  assert(!overwhelmedToday.includes("Next Loose Thing"), "Overwhelmed Today hides loose section");
  assert(!overwhelmedToday.includes("Next Person"), "Overwhelmed Today hides people section");
  assert(!overwhelmedToday.includes("Next Follow-Up"), "Overwhelmed Today hides follow-up section");
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

function testServiceWorkerShape() {
  assert(/const APP_VERSION = "2026\.07\.15-calm-os-[^"]+"/.test(html), "deploy app version is in the Calm OS release family");
  assert(/ruf-ministry-hub-v(?:3[5-9]|[4-9]\d+)-calm-os-[^"']+/.test(serviceWorkerSource), "service worker cache version is bumped for Calm OS");
  assert(serviceWorkerSource.includes('"index.html"'), "service worker caches redirect entry point");
  assert(serviceWorkerSource.includes("ruf-ministry-hub-icon.svg"), "service worker caches the SVG icon");
  assert(serviceWorkerSource.includes("async function cacheAsset") && serviceWorkerSource.includes("Do not fail the whole service-worker install"), "service worker treats unavailable assets as non-blocking");
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
  assert(serviceWorkerSource.includes("await cache.put(request, response.clone())"), "runtime asset caching settles before the fetch response completes");
  ["install", "activate", "fetch", "message"].forEach(eventName => {
    assert(serviceWorkerSource.includes(`addEventListener("${eventName}"`), `service worker registers ${eventName}`);
  });
}

function testRedirectAndServiceWorkerRouting() {
  assert(indexSource.includes('window.location.replace("./ruf-ministry-hub.html" + window.location.search + window.location.hash)'), "index redirects only to ruf-ministry-hub.html");
  assert(redirectsSource.includes("/ruf-ministry-hub /ruf-ministry-hub.html 200"), "Cloudflare rewrites extensionless app path to HTML");
  assert(redirectsSource.includes("/app /ruf-ministry-hub.html 200"), "Cloudflare rewrites app alias to HTML");
  assert(!redirectsSource.includes("/ruf-ministry-hub /ruf-ministry-hub 200"), "Cloudflare redirects do not loop ruf-ministry-hub to itself");
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
  testQuickGrabSharedUrlImport();
  testCoreLocalActions();
  testAdhdModeAndTodaySectionVisibility();
  testAutopilotAndAttentionPresets();
  testExportAndPrivacyHelpers();
  testAutoMemoryVault();
  await testSecuritySheets();
  await testDataSafetySheets();
  testBackupValidationBoundary();
  testServiceWorkerShape();
  testRedirectAndServiceWorkerRouting();
  testCurrentDocsDoNotClaimRemovedScreens();
  console.log("All current regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

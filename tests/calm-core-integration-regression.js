const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const rootDir = path.resolve(__dirname, "..");
const appDir = process.env.RUF_HUB_APP_DIR || path.resolve(rootDir, "ruf-ministry-hub-deploy-working");
const htmlPath = path.resolve(appDir, "ruf-ministry-hub.html");
const html = fs.readFileSync(htmlPath, "utf8");
const serviceWorker = fs.readFileSync(path.resolve(appDir, "ruf-ministry-hub-sw.js"), "utf8");
const headers = fs.readFileSync(path.resolve(appDir, "_headers"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, "package.json"), "utf8"));
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (!scriptMatch) throw new Error("Could not find app script in ruf-ministry-hub.html");

const storage = Object.create(null);
const elements = Object.create(null);

function makeElement(idOrTag) {
  const key = String(idOrTag || "element");
  if (elements[key]) return elements[key];
  const element = {
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
  elements[key] = element;
  return element;
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
      return "blob:calm-core-regression";
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

async function waitForApp(condition, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (appEval(condition)) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(label);
}

function resetApp() {
  Object.keys(elements).forEach(key => delete elements[key]);
  Object.keys(storage).forEach(key => delete storage[key]);
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
    memoryVaultCache = null;
    vaultPassphrase = "";
    const first = createPerson("Same Name", "555-0101");
    const second = createPerson("Same Name", "555-0102");
    view = {
      screen: "person",
      personId: first.id,
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
      profileHistoryExpanded: [],
      profileHistoryVisibleLimits: {},
      sheet: null
    };
    undoStack = [];
    saveData();
  `);
}

function setCareSheetValues(cadence, customDays, nextDate) {
  makeElement("sheet-care-cadence").value = cadence;
  makeElement("sheet-care-custom-days").value = String(customDays || "");
  makeElement("sheet-care-next-date").value = nextDate;
}

function sha256(value) {
  return nodeCrypto.createHash("sha256").update(value).digest("base64");
}

async function run() {
  resetApp();
  const [firstId, secondId] = db().people.map(person => person.id);

  assert(appEval("DATA_SCHEMA_VERSION") === 3 && db().dataSchemaVersion === 3, "care cadence remains additive within data schema version 3");
  assert(appEval('proposedFollowUpDate("Weekly", "", "2026-01-31")') === "2026-02-07", "weekly cadence uses calendar-day arithmetic");
  assert(appEval('proposedFollowUpDate("Monthly", "", "2026-01-31")') === "2026-02-28", "monthly cadence clamps safely at the end of a shorter month");
  assert(appEval('proposedFollowUpDate("Custom days", 0, "2026-01-31")') === "", "zero-day custom cadence remains open-ended instead of creating an immediate loop");
  assert(appEval('proposedFollowUpDate("Custom days", 731, "2026-01-31")') === "", "custom cadence rejects an out-of-bounds interval");

  const beforeCancel = appEval("JSON.stringify(db)");
  appEval(`openCareCadenceSheet("${firstId}")`);
  setCareSheetValues("Weekly", "", appEval("daysFromNow(7)"));
  appEval("closeSheet()");
  assert(appEval("JSON.stringify(db)") === beforeCancel, "canceling cadence configuration writes no person or task data");

  appEval(`openCareCadenceSheet("${secondId}")`);
  setCareSheetValues("Custom days", 0, appEval("daysFromNow(7)"));
  assert(await appEval("submitCareCadenceSheet()") === false, "custom cadence rejects zero days before saving");
  assert(appEval("view.sheet && view.sheet.type") === "care-cadence", "invalid custom cadence keeps the confirmation sheet open");
  setCareSheetValues("Weekly", "", "not-a-date");
  assert(await appEval("submitCareCadenceSheet()") === false, "cadence configuration rejects malformed dates");

  const configuredDate = appEval("daysFromNow(7)");
  setCareSheetValues("Weekly", "", configuredDate);
  assert(await appEval("submitCareCadenceSheet()") === true, "explicit cadence confirmation saves one local rhythm");
  assert(db().people.find(person => person.id === secondId).followUpCadence === "Weekly", "cadence configuration targets the selected identifier when names are duplicated");
  assert(db().people.find(person => person.id === firstId).followUpCadence === "None", "duplicate names do not cause cadence changes on the wrong person");

  const beforeFailedSave = appEval("JSON.stringify({ db, undoStack, memoryVaultCache })");
  appEval(`openCareCadenceSheet("${firstId}")`);
  setCareSheetValues("Monthly", "", appEval("daysFromNow(30)"));
  appEval(`(() => {
    const original = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic cadence quota");
      return original.call(localStorage, key, value);
    };
    globalThis.__restoreCadenceStorage = () => { localStorage.setItem = original; };
  })()`);
  assert(await appEval("submitCareCadenceSheet()") === false, "cadence persistence failure reports an unconfirmed save");
  appEval("globalThis.__restoreCadenceStorage()");
  assert(appEval("JSON.stringify({ db, undoStack, memoryVaultCache })") === beforeFailedSave, "cadence persistence failure rolls back the exact in-memory graph and Undo stack");

  const beforeFollowUp = appEval("JSON.stringify(db)");
  assert(await appEval(`markFollowedUp("${firstId}")`) === true, "explicit followed-up action saves through the existing local path");
  assert(db().people.find(person => person.id === firstId).nextFollowUpDate === "", "a person with no recurring cadence remains intentionally open-ended");
  appEval("undoLast()");
  assert(appEval("JSON.stringify(db)") === beforeFollowUp, "Undo restores the exact person state after a followed-up action");

  const expectedNext = appEval('proposedFollowUpDate("Weekly", "", todayISO())');
  assert(await appEval(`markFollowedUp("${secondId}")`) === true, "followed-up action applies the saved cadence");
  assert(db().people.find(person => person.id === secondId).nextFollowUpDate === expectedNext, "followed-up action proposes the next local check-in date");
  assert(await appEval(`markFollowedUp("${secondId}")`) === true, "repeated followed-up action remains usable");
  assert(db().people.find(person => person.id === secondId).nextFollowUpDate === expectedNext, "repeated completion on the same day does not compound the cadence");

  appEval(`
    db.tasks = [
      { id: "waiting_due", relatedPersonId: "${firstId}", title: "Waiting for reply", dueDate: todayISO(), status: "Waiting", createdAt: nowISO(), updatedAt: nowISO() },
      { id: "waiting_open", relatedPersonId: "missing_person", title: "Open-ended waiting", dueDate: "", status: "Waiting", createdAt: nowISO(), updatedAt: nowISO() },
      { id: "owed_due", relatedPersonId: "${secondId}", title: "Send the promised note", dueDate: todayISO(), status: "Today / Soon", createdAt: nowISO(), updatedAt: nowISO() }
    ];
  `);
  assert(appEval("taskDueSoon().map(task => task.id).join(',')") === "owed_due", "15-minute owed-work list excludes Waiting tasks");
  assert(!appEval("buildTodayRecommendations().some(item => item.recordId === 'waiting_due' || item.recordId === 'waiting_open')"), "Today never presents Waiting as work the user owes");
  assert(appEval(`buildProfileRightNow("${firstId}").nextThing.sourceId`) !== "waiting_due", "Profile Right Now never presents Waiting as the person's next owed action");
  assert(appEval("waitingReviewTasks().map(task => task.id).join(',')") === "waiting_due,waiting_open", "Weekly review retains dated and open-ended Waiting items");
  const weeklyMarkup = appEval("renderWeeklyReset()");
  const waitingSection = weeklyMarkup.match(/id="waiting-review-title"[\s\S]*?<\/section>/)?.[0] || "";
  assert(waitingSection.includes("Waiting on others") && waitingSection.includes("No review date set"), "Weekly Reset labels Waiting and its open-ended review state truthfully");
  assert(waitingSection.includes("Unlinked person") && !waitingSection.includes("data-action="), "Waiting review tolerates a malformed person link and remains read-only");
  const waitingHistory = appEval("renderProfilePreview('tasks', db.tasks.find(task => task.id === 'waiting_due'))");
  assert(waitingHistory.includes("Waiting on them") && waitingHistory.includes("Review today"), "profile history retains a truthful Waiting label and review date");

  appEval(`
    globalThis.__careOriginals = { confirmCareVaultRevision, scheduleVaultSave, showToast };
    globalThis.__careToasts = [];
    scheduleVaultSave = () => {};
    showToast = (message, tone = "") => { globalThis.__careToasts.push({ message: String(message || ""), tone }); };
    settings.localEncryptionEnabled = true;
    vaultPassphrase = "synthetic-care-passphrase";
    globalThis.__installDeferredCareVault = () => {
      globalThis.__careVaultDeferred = {};
      globalThis.__careVaultDeferred.promise = new Promise(resolve => { globalThis.__careVaultDeferred.resolve = resolve; });
      confirmCareVaultRevision = () => globalThis.__careVaultDeferred.promise;
    };
  `);

  appEval("globalThis.__installDeferredCareVault()");
  appEval(`openCareCadenceSheet("${firstId}")`);
  setCareSheetValues("Monthly", "", appEval("daysFromNow(30)"));
  const pendingCadenceSave = appEval("submitCareCadenceSheet()");
  assert(appEval("careSaveIsPending() && view.sheet.type === 'care-cadence'") === true, "encrypted cadence save exposes a deterministic busy state");
  assert(appEval("closeSheet()") === false && appEval("view.sheet.type") === "care-cadence", "Escape/close cannot dismiss an encrypted cadence save in flight");
  appEval(`handleAction({
    currentTarget: { dataset: { action: "sheet-close" } },
    preventDefault() { globalThis.__pendingCareActionPrevented = true; },
    stopPropagation() {}
  })`);
  assert(appEval("view.sheet.type") === "care-cadence", "the backdrop cannot dismiss an encrypted cadence save in flight");
  appEval(`handleAction({
    currentTarget: { dataset: { action: "nav", screen: "today" } },
    preventDefault() { globalThis.__pendingCareActionPrevented = true; },
    stopPropagation() {}
  })`);
  assert(appEval("view.screen") === "person" && appEval("globalThis.__pendingCareActionPrevented") === true, "concurrent UI work is blocked while cadence persistence is unresolved");
  appEval("globalThis.__careVaultDeferred.resolve(true)");
  assert(await pendingCadenceSave === true && appEval("view.sheet") === null, "encrypted cadence success unlocks the UI only after confirmation");

  const beforeRejectedCadence = appEval("JSON.stringify({ db, undoStack, memoryVaultCache })");
  const storageBeforeRejectedCadence = JSON.stringify(storage);
  appEval("globalThis.__careToasts = []; globalThis.__installDeferredCareVault()");
  appEval(`openCareCadenceSheet("${secondId}")`);
  setCareSheetValues("Quarterly", "", appEval("daysFromNow(90)"));
  const rejectedCadenceSave = appEval("submitCareCadenceSheet()");
  appEval(`handleAction({
    currentTarget: { dataset: { action: "nav", screen: "today" } },
    preventDefault() { globalThis.__rejectedCadenceActionPrevented = true; },
    stopPropagation() {}
  })`);
  assert(appEval("view.screen") === "person" && appEval("globalThis.__rejectedCadenceActionPrevented") === true, "cadence rejection cannot erase concurrent UI work because that work is blocked before rollback");
  appEval("globalThis.__careVaultDeferred.resolve(false)");
  assert(await rejectedCadenceSave === false, "encrypted cadence rejection reports an unconfirmed save");
  assert(appEval("JSON.stringify({ db, undoStack, memoryVaultCache })") === beforeRejectedCadence, "encrypted cadence rejection restores the exact in-memory graph and Undo stack");
  assert(JSON.stringify(storage) === storageBeforeRejectedCadence, "encrypted cadence rejection restores the prior local storage snapshot");
  assert(appEval("view.sheet.type === 'care-cadence' && view.sheet.saving === false") === true, "encrypted cadence rejection returns to the editable confirmation sheet after rollback");
  assert(appEval("closeSheet()") === true, "cadence confirmation can close after the rejected save finishes");

  appEval("globalThis.__careToasts = []; globalThis.__installDeferredCareVault()");
  const pendingFollowUpSave = appEval(`markFollowedUp("${firstId}")`);
  assert(appEval("careSaveIsPending() && view.sheet.type === 'care-follow-up-saving'") === true, "encrypted followed-up action blocks the profile with an explicit saving boundary");
  assert(!appEval("globalThis.__careToasts.some(item => item.message.includes('Marked followed up'))"), "followed-up success is not announced before encrypted persistence resolves");
  assert(appEval("closeSheet()") === false && appEval("view.sheet.type") === "care-follow-up-saving", "followed-up saving boundary cannot be dismissed");
  appEval(`handleAction({
    currentTarget: { dataset: { action: "nav", screen: "today" } },
    preventDefault() { globalThis.__pendingFollowUpActionPrevented = true; },
    stopPropagation() {}
  })`);
  assert(appEval("view.screen") === "person" && appEval("globalThis.__pendingFollowUpActionPrevented") === true, "concurrent UI work is blocked while followed-up persistence is unresolved");
  appEval("globalThis.__careVaultDeferred.resolve(true)");
  assert(await pendingFollowUpSave === true, "encrypted followed-up success returns only after persistence confirmation");
  assert(appEval("globalThis.__careToasts.some(item => item.message.includes('Marked followed up'))"), "followed-up success is announced after encrypted persistence resolves");

  const beforeRejectedFollowUp = appEval("JSON.stringify({ db, undoStack, memoryVaultCache })");
  const storageBeforeRejectedFollowUp = JSON.stringify(storage);
  appEval("globalThis.__careToasts = []; globalThis.__installDeferredCareVault()");
  const rejectedFollowUpSave = appEval(`markFollowedUp("${secondId}")`);
  assert(appEval("careSaveIsPending()") === true, "encrypted followed-up rejection remains locked while unresolved");
  appEval("globalThis.__careVaultDeferred.resolve(false)");
  assert(await rejectedFollowUpSave === false, "encrypted followed-up rejection reports an unconfirmed save");
  assert(appEval("JSON.stringify({ db, undoStack, memoryVaultCache })") === beforeRejectedFollowUp, "encrypted followed-up rejection restores the exact in-memory graph and Undo stack");
  assert(JSON.stringify(storage) === storageBeforeRejectedFollowUp, "encrypted followed-up rejection restores the prior local storage snapshot");
  assert(!appEval("globalThis.__careToasts.some(item => item.message.includes('Marked followed up'))"), "encrypted followed-up rejection never announces success");
  assert(appEval("view.sheet") === null, "encrypted followed-up rejection releases the saving boundary after rollback");

  appEval(`
    confirmCareVaultRevision = globalThis.__careOriginals.confirmCareVaultRevision;
    scheduleVaultSave = globalThis.__careOriginals.scheduleVaultSave;
    showToast = globalThis.__careOriginals.showToast;
    settings.localEncryptionEnabled = false;
    vaultPassphrase = "";
    view.sheet = null;
  `);

  const storageBeforeOverlapRegressions = JSON.stringify(storage);
  sandbox.__settingsBeforeOverlapRegressions = JSON.parse(appEval("JSON.stringify(settings)"));
  appEval(`
    globalThis.__overlapOriginals = { encryptPayload, showToast };
    settings.localEncryptionEnabled = true;
    settings.autoMemoryVaultEnabled = true;
    vaultPassphrase = "synthetic-overlap-passphrase";
    showToast = (message, tone = "") => {
      globalThis.__overlapToasts.push({ message: String(message || ""), tone });
    };
    globalThis.__startCareOverlap = marker => {
      if (vaultSaveTimer) {
        const clear = window.clearTimeout || clearTimeout;
        clear(vaultSaveTimer);
      }
      vaultSaveTimer = null;
      vaultSaveInFlight = null;
      vaultSaveRequestedRevision = 0;
      vaultSaveCompletedRevision = 0;
      globalThis.__overlapToasts = [];
      globalThis.__overlapPayloads = [];
      globalThis.__overlapFirst = {};
      globalThis.__overlapSecond = {};
      globalThis.__overlapFirst.promise = new Promise((resolve, reject) => {
        globalThis.__overlapFirst.resolve = resolve;
        globalThis.__overlapFirst.reject = reject;
      });
      globalThis.__overlapSecond.promise = new Promise((resolve, reject) => {
        globalThis.__overlapSecond.resolve = resolve;
        globalThis.__overlapSecond.reject = reject;
      });
      encryptPayload = payload => {
        globalThis.__overlapPayloads.push(cloneJson(payload));
        if (globalThis.__overlapPayloads.length === 1) return globalThis.__overlapFirst.promise;
        if (globalThis.__overlapPayloads.length === 2) return globalThis.__overlapSecond.promise;
        return Promise.reject(new Error("unexpected synthetic overlap retry"));
      };
      globalThis.__overlapOlderEnvelope = {
        version: 1,
        algorithm: "AES-GCM",
        kdf: "PBKDF2-SHA-256",
        iterations: 150000,
        salt: "c3ludGhldGljLXNhbHQ=",
        iv: "c3ludGhldGljLWl2",
        ciphertext: marker === "cadence" ? "b2xkZXItY2FkZW5jZQ==" : "b2xkZXItZm9sbG93LXVw",
        encryptedAt: marker === "cadence" ? "2026-07-15T12:00:00.000Z" : "2026-07-15T12:01:00.000Z"
      };
      globalThis.__overlapOlderPromise = persistEncryptedVault();
    };
  `);

  const beforeCadenceOverlap = appEval("JSON.stringify({ db, undoStack, memoryVaultCache })");
  appEval("globalThis.__startCareOverlap('cadence')");
  appEval(`openCareCadenceSheet("${firstId}")`);
  setCareSheetValues("Quarterly", "", appEval("daysFromNow(90)"));
  appEval("globalThis.__cadenceOverlapResult = globalThis.__overlapFirst.promise.then(() => submitCareCadenceSheet())");
  const cadenceOverlapResult = appEval("globalThis.__cadenceOverlapResult");
  appEval("globalThis.__overlapFirst.resolve(globalThis.__overlapOlderEnvelope)");
  await waitForApp("globalThis.__overlapPayloads.length === 2", "cadence overlap never drove its required newer vault revision");
  const cadenceOlderDurableEnvelope = storage[appEval("ENCRYPTED_STORAGE_KEY")];
  assert(await appEval("globalThis.__overlapOlderPromise") === true, "cadence overlap reproduces an older in-flight vault promise resolving true");
  assert(appEval("vaultSaveCompletedRevision < vaultSaveRequestedRevision") === true, "cadence overlap remains pending when only the older revision is durable");
  assert(appEval(`globalThis.__overlapPayloads[0].data.people.find(person => person.id === "${firstId}").followUpCadence`) !== "Quarterly", "older cadence envelope contains the pre-operation person state");
  assert(appEval(`globalThis.__overlapPayloads[1].data.people.find(person => person.id === "${firstId}").followUpCadence`) === "Quarterly", "newer cadence revision contains the proposed care change");
  appEval("globalThis.__overlapSecond.reject(new Error('synthetic newer cadence encryption failure'))");
  assert(await cadenceOverlapResult === false, "older-success/newer-failure cadence overlap never reports success");
  assert(appEval("JSON.stringify({ db, undoStack, memoryVaultCache })") === beforeCadenceOverlap, "failed overlapping cadence revision restores the exact local graph and Undo stack");
  assert(storage[appEval("ENCRYPTED_STORAGE_KEY")] === cadenceOlderDurableEnvelope, "failed overlapping cadence revision preserves the prior durable envelope");
  assert(!appEval("globalThis.__overlapToasts.some(item => item.message.includes('Follow-up rhythm saved'))"), "failed overlapping cadence revision never announces success");
  assert(appEval("closeSheet()") === true, "cadence overlap failure releases its confirmation sheet after rollback");

  appEval(`
    const overlapPerson = personById("${secondId}");
    overlapPerson.lastMeaningfulInteraction = daysFromNow(-10);
    overlapPerson.nextFollowUpDate = daysFromNow(1);
    overlapPerson.followUpReason = "Before overlap";
    overlapPerson.updatedAt = "2026-07-15T11:00:00.000Z";
  `);
  const beforeFollowUpOverlap = appEval("JSON.stringify({ db, undoStack, memoryVaultCache })");
  appEval("globalThis.__startCareOverlap('follow-up')");
  appEval(`globalThis.__followUpOverlapResult = globalThis.__overlapFirst.promise.then(() => markFollowedUp("${secondId}"))`);
  const followUpOverlapResult = appEval("globalThis.__followUpOverlapResult");
  appEval("globalThis.__overlapFirst.resolve(globalThis.__overlapOlderEnvelope)");
  await waitForApp("globalThis.__overlapPayloads.length === 2", "follow-up overlap never drove its required newer vault revision");
  const followUpOlderDurableEnvelope = storage[appEval("ENCRYPTED_STORAGE_KEY")];
  assert(await appEval("globalThis.__overlapOlderPromise") === true, "follow-up overlap reproduces an older in-flight vault promise resolving true");
  assert(appEval("vaultSaveCompletedRevision < vaultSaveRequestedRevision") === true, "follow-up overlap remains pending when only the older revision is durable");
  assert(appEval(`globalThis.__overlapPayloads[0].data.people.find(person => person.id === "${secondId}").lastMeaningfulInteraction`) === appEval("daysFromNow(-10)"), "older follow-up envelope contains the pre-operation care state");
  assert(appEval(`globalThis.__overlapPayloads[1].data.people.find(person => person.id === "${secondId}").lastMeaningfulInteraction`) === appEval("todayISO()"), "newer follow-up revision contains the completed interaction");
  appEval("globalThis.__overlapSecond.reject(new Error('synthetic newer follow-up encryption failure'))");
  assert(await followUpOverlapResult === false, "older-success/newer-failure followed-up overlap never reports success");
  assert(appEval("JSON.stringify({ db, undoStack, memoryVaultCache })") === beforeFollowUpOverlap, "failed overlapping followed-up revision restores the exact local graph and Undo stack");
  assert(storage[appEval("ENCRYPTED_STORAGE_KEY")] === followUpOlderDurableEnvelope, "failed overlapping followed-up revision preserves the prior durable envelope");
  assert(!appEval("globalThis.__overlapToasts.some(item => item.message.includes('Marked followed up'))"), "failed overlapping followed-up revision never announces success");

  appEval(`
    if (vaultSaveTimer) {
      const clear = window.clearTimeout || clearTimeout;
      clear(vaultSaveTimer);
    }
    vaultSaveTimer = null;
    vaultSaveInFlight = null;
    vaultSaveRequestedRevision = 0;
    vaultSaveCompletedRevision = 0;
    encryptPayload = globalThis.__overlapOriginals.encryptPayload;
    showToast = globalThis.__overlapOriginals.showToast;
    settings = normalizeSettings(globalThis.__settingsBeforeOverlapRegressions);
    vaultPassphrase = "";
    view.sheet = null;
  `);
  Object.keys(storage).forEach(key => delete storage[key]);
  Object.assign(storage, JSON.parse(storageBeforeOverlapRegressions));

  const activeProfileMarkup = appEval(`renderCalmPersonProfile(personById("${secondId}"))`);
  assert((activeProfileMarkup.match(/data-action="person-followed-up"/g) || []).length === 1, "active profiles expose one Mark followed up affordance without a duplicate under More actions");
  appEval(`personById("${firstId}").status = "Archived"`);
  const beforeInactiveFollowUp = appEval("JSON.stringify(db)");
  assert(appEval(`renderProfileCareCadence(personById("${firstId}"))`) === "", "archived people expose no follow-up rhythm actions");
  assert(await appEval(`markFollowedUp("${firstId}")`) === false, "direct followed-up calls reject archived people");
  assert(appEval("JSON.stringify(db)") === beforeInactiveFollowUp, "rejected archived-person follow-up writes nothing");

  const actionFixtures = [
    { actionType: "createMeetingNote", summary: "Synthetic meeting" },
    { actionType: "createPrayerRequest", request: "Synthetic prayer" },
    { actionType: "createFollowUpTask", title: "Synthetic follow-up" },
    { actionType: "updatePerson", updates: { followUpReason: "Synthetic update" } }
  ];
  const recordsBeforeValidation = appEval("JSON.stringify(db)");
  for (const action of actionFixtures) {
    sandbox.__actionFixture = action;
    const blocked = appEval(`(() => {
      const proposal = emptyAiProposal({ proposedActions: [globalThis.__actionFixture] });
      return validateAiActionExecution(proposal, [0], { enforcePersonChoice: true });
    })()`);
    assert(blocked.errors.some(error => /person/i.test(error)), `${action.actionType} remains blocked without a resolved person`);
  }
  sandbox.__meetingFixture = actionFixtures[0];
  const existingResolution = appEval(`(() => {
    const proposal = emptyAiProposal({ proposedActions: [globalThis.__meetingFixture] });
    return validateAiActionExecution(proposal, [0], { personChoice: { mode: "existing", existingPersonId: "${firstId}" }, enforcePersonChoice: true });
  })()`);
  assert(existingResolution.errors.length === 0 && existingResolution.chosenExistingPersonId === firstId, "meeting proposal accepts an explicit existing-person resolution");
  const newResolution = appEval(`(() => {
    const proposal = emptyAiProposal({ proposedActions: [globalThis.__meetingFixture] });
    return validateAiActionExecution(proposal, [0], { personChoice: { mode: "new", newPersonName: "Synthetic New Person" }, enforcePersonChoice: true });
  })()`);
  assert(newResolution.errors.length === 0 && newResolution.willCreatePerson, "meeting proposal accepts an explicit new-person resolution without saving it");
  assert(appEval("JSON.stringify(db)") === recordsBeforeValidation, "AI validation and person resolution create no records automatically");

  const appVersion = html.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";
  const cacheName = serviceWorker.match(/const CACHE_NAME = "([^"]+)"/)?.[1] || "";
  const releaseSlug = appVersion.replace(/^\d{4}\.\d{2}\.\d{2}-/, "");
  assert(appVersion === packageJson.version && cacheName.endsWith(`-${releaseSlug}`), "app, package, and service-worker cache describe one Calm core release");
  assert(serviceWorker.includes('requestUrl.pathname.startsWith("/api/")') && serviceWorker.includes('event.data.type === "SKIP_WAITING"'), "offline/update boundary keeps APIs uncached and activation explicit");
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => sha256(match[1]));
  assert(inlineScripts.every(hash => headers.includes(`'sha256-${hash}'`)), "CSP hashes cover every current inline app script");
  assert(packageJson.scripts["test:regression"].includes("tests/calm-core-integration-regression.js"), "maintained full suite executes the Calm core integration regression");

  console.log("All Calm core integration regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

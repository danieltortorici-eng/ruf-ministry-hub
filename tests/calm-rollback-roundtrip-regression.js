const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const nodeCrypto = require("node:crypto");

const PRE_DIR = requiredDirectory("RUF_HUB_PRE_ROLLBACK_APP_DIR");
const ROLLBACK_DIR = requiredDirectory("RUF_HUB_ROLLBACK_APP_DIR");
const POST_DIR = requiredDirectory("RUF_HUB_POST_ROLLBACK_APP_DIR");
const REQUIRE_ROLLBACK_MASKING = process.env.RUF_HUB_REQUIRE_ROLLBACK_MASKING !== "false";
const FIXED_NOW = "2026-07-21T06:30:00.000Z";
const STORAGE_KEY = "ruf_ministry_hub_smart_quick_grab_v1";
const SETTINGS_KEY = "ruf_ministry_hub_settings_v1";
const CONTEXT_SENTINEL = "FICTIONAL_ROLLBACK_CONTEXT_λ\nsecond fictional line";
const RAW_SENTINEL = "FICTIONAL_ROLLBACK_RAW_🙏\nraw fictional line";
const ACTION_SENTINEL = "FICTIONAL_ROLLBACK_ACTION_ONLY";

function requiredDirectory(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const resolved = path.resolve(value);
  const app = path.join(resolved, "ruf-ministry-hub.html");
  if (!fs.statSync(resolved).isDirectory() || !fs.statSync(app).isFile()) {
    throw new Error(`${name} must contain ruf-ministry-hub.html.`);
  }
  return resolved;
}

function appSource(appDir) {
  const html = fs.readFileSync(path.join(appDir, "ruf-ministry-hub.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error(`Could not find the app script in ${appDir}.`);
  return { html, script };
}

function appVersion(html) {
  return html.match(/const APP_VERSION = "([^"]+)"/)?.[1] || "";
}

function checkExpectedVersion(label, html, envName) {
  const expected = process.env[envName];
  if (!expected) return;
  assert.equal(appVersion(html), expected, `${label} APP_VERSION must match ${envName}`);
}

function makeElement(idOrTag, elements) {
  const key = String(idOrTag || "element");
  if (elements[key]) return elements[key];
  const element = {
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
    removeEventListener() {},
    focus() {},
    setSelectionRange() {},
    click() {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      this[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(value) {
      this._innerHTML = String(value || "");
    }
  };
  elements[key] = element;
  return element;
}

function makeRuntime(appDir, sharedStorage) {
  const { html, script } = appSource(appDir);
  const elements = Object.create(null);
  const fetches = [];
  const location = {
    protocol: "https:",
    hostname: "rollback.synthetic",
    href: "https://rollback.synthetic/ruf-ministry-hub.html",
    pathname: "/ruf-ministry-hub.html",
    search: "",
    hash: ""
  };
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [FIXED_NOW]));
    }
    static now() {
      return Date.parse(FIXED_NOW);
    }
  }
  const localStorage = {
    getItem(key) {
      return sharedStorage.has(String(key)) ? sharedStorage.get(String(key)) : null;
    },
    setItem(key, value) {
      sharedStorage.set(String(key), String(value));
    },
    removeItem(key) {
      sharedStorage.delete(String(key));
    }
  };
  const document = {
    body: makeElement("body", elements),
    activeElement: null,
    visibilityState: "visible",
    getElementById(id) {
      return makeElement(id, elements);
    },
    createElement(tag) {
      return makeElement(`created-${tag}-${Object.keys(elements).length}`, elements);
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (selector === "input, textarea, select") return Object.values(elements);
      return [];
    }
  };
  const navigator = {
    serviceWorker: null,
    clipboard: { writeText: () => Promise.resolve() }
  };
  const sandbox = {
    console,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    Date: FixedDate,
    crypto: nodeCrypto.webcrypto,
    setTimeout,
    clearTimeout,
    localStorage,
    navigator,
    document,
    indexedDB: undefined,
    Notification: undefined,
    FileReader: function FileReader() {},
    Image: function Image() {},
    AbortController,
    btoa(value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(String(value), "base64").toString("binary");
    },
    fetch(...args) {
      fetches.push(args);
      return Promise.reject(new Error("Synthetic rollback guard rejects every network request."));
    },
    URL: {
      createObjectURL() { return "blob:rollback-synthetic"; },
      revokeObjectURL() {}
    }
  };
  sandbox.window = {
    location,
    navigator,
    URL: sandbox.URL,
    history: {
      state: {},
      replaceState(state) { this.state = state; }
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
    matchMedia() { return { matches: false }; },
    confirm() { return true; },
    prompt() { return null; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: path.join(appDir, "ruf-ministry-hub.html") });
  return {
    appDir,
    html,
    fetches,
    sandbox,
    evaluate(code) {
      return vm.runInContext(code, sandbox);
    },
    input(value) {
      sandbox.__rollbackInput = value;
    }
  };
}

function initializeRuntime(runtime, loadExisting = true) {
  runtime.evaluate(`
    const rollbackSeedSettings = ${loadExisting ? "loadSettings()" : "DEFAULT_SETTINGS"};
    settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...rollbackSeedSettings,
      enableAutoSave: false,
      enableUndo: true,
      appCoachEnabled: false,
      localEncryptionEnabled: false,
      autoMemoryVaultEnabled: false,
      notificationsEnabled: false,
      quickGrabAiMode: "backendQuickGrab"
    });
    customCopy = {};
    db = ${loadExisting ? "loadData()" : "emptyData()"};
    view = {
      screen: "aiReview",
      personId: null,
      quickGrabId: null,
      prayerFilter: "Active",
      aiReviewFilter: "Pending",
      aiReviewFocusId: "",
      aiActionSelections: {},
      aiConfirmProposalId: "",
      aiConfirmActionIndexes: [],
      aiConfirmPersonChoice: {},
      aiConfirmValidationErrors: [],
      aiConfirmValidationWarnings: [],
      search: "",
      globalSearch: "",
      focusMode: true,
      locked: false,
      encryptionLocked: false,
      startupHydrating: false,
      startupRecoveryError: "",
      reviewIndex: 0,
      expandedQuickGrabIds: [],
      expandedPrayerIds: [],
      sheet: null
    };
    undoStack = [];
    memoryVaultCache = null;
  `);
}

function storedData(sharedStorage) {
  const raw = sharedStorage.get(STORAGE_KEY);
  assert.ok(raw, "the shared fictional origin must contain saved app data");
  return JSON.parse(raw);
}

function occurrenceCount(text, value) {
  return String(text).split(value).length - 1;
}

function renderedSentinel(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

async function main() {
  const sharedStorage = new Map();
  const pre = makeRuntime(PRE_DIR, sharedStorage);
  const rollback = makeRuntime(ROLLBACK_DIR, sharedStorage);
  checkExpectedVersion("pre-rollback", pre.html, "RUF_HUB_EXPECT_PRE_ROLLBACK_VERSION");
  checkExpectedVersion("rollback", rollback.html, "RUF_HUB_EXPECT_ROLLBACK_VERSION");

  initializeRuntime(pre, false);
  pre.input({
    dataSchemaVersion: 3,
    people: [],
    quickGrabs: [{
      id: "fictional-grab-rollback",
      rawContent: "Fictional source capture retained locally.",
      category: "note",
      urgency: "Whenever",
      status: "Captured",
      captureSource: "main",
      captureRevision: 7,
      aiPrivacyTier: "Sensitive",
      aiDoNotSendToAi: false,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW
    }],
    notes: [],
    meetingNotes: [],
    prayerRequests: [],
    tasks: [],
    aiProposals: [{
      id: "fictional-proposal-rollback",
      sourceType: "quickGrab",
      sourceId: "fictional-grab-rollback",
      proposalKey: "fictional-grab-rollback:7",
      sourceCaptureRevision: 7,
      processorVersion: "fictional-v39-writer",
      proposalType: "quickGrabParse",
      status: "pending",
      title: "Fictional classified suggestion",
      summary: "Fictional summary for rollback verification.",
      confidence: "medium",
      sensitivityRisk: "high",
      aiPrivacyTier: "Sensitive",
      requiresReview: true,
      sendToAiApproved: false,
      contextPreview: CONTEXT_SENTINEL,
      rawInputPreview: RAW_SENTINEL,
      proposedActions: [{
        actionId: "fictional-action-1",
        actionType: "createNote",
        content: ACTION_SENTINEL,
        requiresConfirmation: true,
        executed: false
      }],
      warnings: ["Fictional sensitivity warning."],
      model: "mock",
      result: { fictional: true },
      futureRollbackField: { preserved: "future-fictional-value" },
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW
    }]
  });
  pre.evaluate(`
    db = normalizeData(__rollbackInput);
    db.aiProposals = db.aiProposals.map(prepareAiProposalForStorage);
    saveSettings();
    saveData();
  `);
  const phaseOne = storedData(sharedStorage);
  const phaseOneSettings = JSON.parse(sharedStorage.get(SETTINGS_KEY));
  assert.equal(phaseOne.aiProposals.length, 1, "v39 writer saves exactly one fictional proposal");
  assert.equal(phaseOne.quickGrabs.length, 1, "v39 writer saves exactly one linked fictional source");
  assert.equal(phaseOne.aiProposals[0].contextPreview, CONTEXT_SENTINEL, "v39 writer stores the context preview exactly");
  assert.equal(phaseOne.aiProposals[0].rawInputPreview, RAW_SENTINEL, "v39 writer stores the raw input preview exactly");
  assert.equal(phaseOneSettings.maskSensitivePreviews, false, "v39 writer persists unlocked classified-preview visibility");
  assert.equal(phaseOneSettings.includeSensitiveInSearch, true, "v39 writer persists unlocked sensitive-search visibility");
  assert.equal(pre.fetches.length, 0, "v39 writer phase makes no request");

  initializeRuntime(rollback, true);
  const rollbackView = rollback.evaluate(`(() => {
    const proposal = db.aiProposals[0];
    const vaultNormalizedSettings = normalizeSettings({ ...settings, localEncryptionEnabled: true });
    const card = renderAiProposalCard(proposal);
    view.aiConfirmProposalId = proposal.id;
    view.aiConfirmActionIndexes = [0];
    const confirmation = renderAiActionConfirmSheet({ proposalId: proposal.id, actionIndexes: [0] });
    db.aiProposals = [prepareAiProposalForStorage(proposal)];
    saveSettings();
    saveData();
    return {
      card,
      confirmation,
      contextPreview: db.aiProposals[0].contextPreview,
      rawInputPreview: db.aiProposals[0].rawInputPreview,
      proposalId: db.aiProposals[0].id,
      sourceId: db.aiProposals[0].sourceId,
      actionCount: db.aiProposals[0].proposedActions.length,
      futureValue: db.aiProposals[0].futureRollbackField?.preserved || "",
      carriedMaskSensitivePreviews: settings.maskSensitivePreviews,
      carriedIncludeSensitiveInSearch: settings.includeSensitiveInSearch,
      effectiveMaskSensitivePreviews: typeof ROLLBACK_MASK_CLASSIFIED_PREVIEWS === "boolean" ? ROLLBACK_MASK_CLASSIFIED_PREVIEWS : settings.maskSensitivePreviews,
      effectiveIncludeSensitiveInSearch: typeof ROLLBACK_INCLUDE_SENSITIVE_IN_SEARCH === "boolean" ? ROLLBACK_INCLUDE_SENSITIVE_IN_SEARCH : settings.includeSensitiveInSearch,
      vaultMaskSensitivePreviews: vaultNormalizedSettings.maskSensitivePreviews,
      vaultIncludeSensitiveInSearch: vaultNormalizedSettings.includeSensitiveInSearch
    };
  })()`);
  if (REQUIRE_ROLLBACK_MASKING) {
    assert.equal(rollbackView.card.includes(renderedSentinel(CONTEXT_SENTINEL)), false, "rollback AI Review masks the normalized context preview");
    assert.equal(rollbackView.card.includes(renderedSentinel(RAW_SENTINEL)), false, "rollback AI Review masks the normalized raw input preview");
    assert.equal(rollbackView.confirmation.includes(ACTION_SENTINEL), false, "rollback final review masks classified action content");
    assert.equal(rollbackView.effectiveMaskSensitivePreviews, true, "rollback forces classified preview concealment despite carried v39 settings");
    assert.equal(rollbackView.effectiveIncludeSensitiveInSearch, false, "rollback excludes sensitive search despite carried v39 settings");
  }
  assert.equal(rollbackView.carriedMaskSensitivePreviews, false, "rollback preserves the carried v39 preview preference in memory");
  assert.equal(rollbackView.carriedIncludeSensitiveInSearch, true, "rollback preserves the carried v39 search preference in memory");
  assert.equal(rollbackView.vaultMaskSensitivePreviews, false, "vault settings normalization preserves the carried v39 preview preference");
  assert.equal(rollbackView.vaultIncludeSensitiveInSearch, true, "vault settings normalization preserves the carried v39 search preference");
  const rollbackPersistedSettings = JSON.parse(sharedStorage.get(SETTINGS_KEY));
  assert.equal(rollbackPersistedSettings.maskSensitivePreviews, false, "an unrelated rollback settings save preserves the v39 preview preference");
  assert.equal(rollbackPersistedSettings.includeSensitiveInSearch, true, "an unrelated rollback settings save preserves the v39 search preference");
  assert.equal(pre.fetches.length + rollback.fetches.length, 0, "pre-rollback and rollback phases make no request before preservation checks");
  assert.equal(rollbackView.contextPreview, CONTEXT_SENTINEL, "rollback normalization and storage preparation preserve the context preview exactly");
  assert.equal(rollbackView.rawInputPreview, RAW_SENTINEL, "rollback normalization and storage preparation preserve the raw input preview exactly");
  assert.equal(rollbackView.proposalId, "fictional-proposal-rollback", "rollback preserves the proposal identifier");
  assert.equal(rollbackView.sourceId, "fictional-grab-rollback", "rollback preserves the proposal source link");
  assert.equal(rollbackView.actionCount, 1, "rollback preserves the proposal action count");
  assert.equal(rollbackView.futureValue, "future-fictional-value", "rollback preserves an unknown future proposal field");

  await rollback.evaluate(`(async () => {
    view.sheet = { type: "ai-gate", proposalId: "fictional-proposal-rollback" };
    markAiGateDoNotSend();
  })()`);
  const phaseTwo = storedData(sharedStorage);
  assert.equal(phaseTwo.aiProposals[0].contextPreview, CONTEXT_SENTINEL, "source-linked Do Not Send preserves the context preview exactly");
  assert.equal(phaseTwo.aiProposals[0].rawInputPreview, RAW_SENTINEL, "source-linked Do Not Send preserves the raw input preview exactly");
  assert.equal(phaseTwo.aiProposals[0].aiPrivacyTier, "Do Not Send to AI", "source-linked Do Not Send marks the proposal tier");
  assert.equal(phaseTwo.quickGrabs[0].aiPrivacyTier, "Do Not Send to AI", "source-linked Do Not Send marks the source tier");
  assert.equal(phaseTwo.people.length + phaseTwo.notes.length + phaseTwo.meetingNotes.length + phaseTwo.prayerRequests.length + phaseTwo.tasks.length, 0, "rollback creates no structured ministry record");
  assert.equal(rollback.fetches.length, 0, "rollback Do Not Send phase makes no request");

  const post = makeRuntime(POST_DIR, sharedStorage);
  checkExpectedVersion("post-rollback", post.html, "RUF_HUB_EXPECT_POST_ROLLBACK_VERSION");
  initializeRuntime(post, true);
  const postView = post.evaluate(`(() => {
    db.aiProposals = db.aiProposals.map(prepareAiProposalForStorage);
    saveData();
    const proposal = db.aiProposals[0];
    return {
      card: renderAiProposalCard(proposal),
      contextPreview: proposal.contextPreview,
      rawInputPreview: proposal.rawInputPreview,
      proposalId: proposal.id,
      sourceId: proposal.sourceId,
      actionCount: proposal.proposedActions.length,
      futureValue: proposal.futureRollbackField?.preserved || "",
      proposalTier: proposal.aiPrivacyTier,
      sourceTier: db.quickGrabs[0]?.aiPrivacyTier || "",
      countsJson: JSON.stringify(DATA_COLLECTIONS.map(key => [key, db[key].length]))
    };
  })()`);
  assert.equal(postView.contextPreview, CONTEXT_SENTINEL, "post-rollback v39 load/save retains the context preview exactly");
  assert.equal(postView.rawInputPreview, RAW_SENTINEL, "post-rollback v39 load/save retains the raw input preview exactly");
  assert.equal(postView.proposalId, "fictional-proposal-rollback", "post-rollback v39 preserves the proposal identifier");
  assert.equal(postView.sourceId, "fictional-grab-rollback", "post-rollback v39 preserves the source link");
  assert.equal(postView.actionCount, 1, "post-rollback v39 preserves the action count");
  assert.equal(postView.futureValue, "future-fictional-value", "post-rollback v39 preserves the unknown future field");
  assert.equal(postView.proposalTier, "Do Not Send to AI", "post-rollback v39 preserves the proposal Do Not Send tier");
  assert.equal(postView.sourceTier, "Do Not Send to AI", "post-rollback v39 preserves the source Do Not Send tier");
  assert.equal(occurrenceCount(postView.card, renderedSentinel(CONTEXT_SENTINEL)), 1, "unlocked post-rollback v39 shows the context preview exactly once");
  assert.equal(occurrenceCount(postView.card, renderedSentinel(RAW_SENTINEL)), 1, "unlocked post-rollback v39 shows the raw input preview exactly once");

  await post.evaluate(`createQuickGrabBackendAiProposal("fictional-grab-rollback")`);
  assert.equal(post.fetches.length, 0, "post-rollback Do Not Send blocks the backend before fetch");
  const finalData = storedData(sharedStorage);
  assert.equal(postView.countsJson, JSON.stringify([
    ["people", 0],
    ["quickGrabs", 1],
    ["notes", 0],
    ["meetingNotes", 0],
    ["prayerRequests", 0],
    ["tasks", 0],
    ["aiProposals", 1]
  ]), "all collection counts remain exact across the three phases");
  assert.equal(finalData.aiProposals[0].contextPreview, CONTEXT_SENTINEL, "final persisted context remains exact");
  assert.equal(finalData.aiProposals[0].rawInputPreview, RAW_SENTINEL, "final persisted raw input remains exact");
  assert.equal(pre.fetches.length + rollback.fetches.length + post.fetches.length, 0, "the complete three-phase round trip makes zero requests");
  console.log("PASS v39 to rollback to v39 preserves classified proposal fields while rollback display and outward paths stay blocked");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

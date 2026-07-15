const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const appPath = path.resolve(__dirname, "../ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");
const html = fs.readFileSync(appPath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error("Could not find the Calm OS app script.");

const KEYS = {
  data: "ruf_ministry_hub_smart_quick_grab_v1",
  settings: "ruf_ministry_hub_settings_v1",
  copy: "ruf_ministry_hub_custom_copy_v1",
  autosave: "ruf_ministry_hub_autosave_drafts_v1",
  autoMemory: "ruf_ministry_hub_auto_memory_v1",
  encrypted: "ruf_ministry_hub_encrypted_storage_v1"
};

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function emptyData(overrides = {}) {
  return {
    dataSchemaVersion: 2,
    people: [],
    quickGrabs: [],
    notes: [],
    meetingNotes: [],
    prayerRequests: [],
    tasks: [],
    aiProposals: [],
    ...overrides
  };
}

function makeFakeIndexedDb(seed = {}) {
  const values = new Map(Object.entries(clone(seed)));
  const reads = [];
  const writes = [];
  const api = {
    values,
    reads,
    writes,
    open() {
      const request = {};
      setTimeout(() => {
        const database = {
          objectStoreNames: { contains() { return true; } },
          createObjectStore() {},
          close() {},
          transaction(_storeName, mode) {
            const transaction = {};
            const store = {
              get(key) {
                reads.push(key);
                return scheduleRequest(transaction, () => clone(values.get(key)));
              },
              put(value, key) {
                writes.push(key);
                return scheduleRequest(transaction, () => {
                  values.set(key, clone(value));
                  return key;
                });
              },
              delete(key) {
                writes.push(`delete:${key}`);
                return scheduleRequest(transaction, () => values.delete(key));
              }
            };
            transaction.objectStore = () => store;
            transaction.mode = mode;
            return transaction;
          }
        };
        request.result = database;
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
  return api;
}

function scheduleRequest(transaction, operation) {
  const request = {};
  setTimeout(() => {
    try {
      request.result = operation();
      if (request.onsuccess) request.onsuccess();
      setTimeout(() => {
        if (transaction.oncomplete) transaction.oncomplete();
      }, 0);
    } catch (error) {
      request.error = error;
      transaction.error = error;
      if (request.onerror) request.onerror();
      if (transaction.onerror) transaction.onerror();
    }
  }, 0);
  return request;
}

function makeHarness({ local = {}, idbSeed = null } = {}) {
  const storage = Object.create(null);
  Object.entries(local).forEach(([key, value]) => {
    storage[key] = typeof value === "string" ? value : JSON.stringify(value);
  });
  const elements = Object.create(null);
  const windowListeners = Object.create(null);
  const documentListeners = Object.create(null);
  const makeElement = id => {
    if (elements[id]) return elements[id];
    elements[id] = {
      id,
      value: "",
      checked: false,
      type: "text",
      tagName: "DIV",
      dataset: {},
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {},
      focus() {},
      setSelectionRange() {},
      setAttribute() {},
      appendChild() {},
      remove() {},
      click() {},
      innerHTML: "",
      textContent: ""
    };
    return elements[id];
  };
  const fakeIdb = idbSeed === null ? null : makeFakeIndexedDb(idbSeed);
  const sandbox = {
    console,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    crypto: nodeCrypto.webcrypto,
    btoa(value) { return Buffer.from(String(value), "binary").toString("base64"); },
    atob(value) { return Buffer.from(String(value), "base64").toString("binary"); },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
      setItem(key, value) { storage[key] = String(value); },
      removeItem(key) { delete storage[key]; }
    },
    indexedDB: fakeIdb || undefined,
    navigator: { serviceWorker: null, clipboard: { writeText() { return Promise.resolve(); } } },
    Notification: undefined,
    FileReader: function FileReader() {},
    Image: function Image() {},
    URL: { createObjectURL() { return "blob:recovery"; }, revokeObjectURL() {} },
    document: {
      body: makeElement("body"),
      activeElement: null,
      visibilityState: "visible",
      getElementById: makeElement,
      createElement(tag) { return makeElement(`created-${tag}`); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener(type, listener) { documentListeners[type] = listener; }
    }
  };
  sandbox.window = {
    location: { protocol: "https:", hostname: "example.test", href: "https://example.test/ruf-ministry-hub.html", pathname: "/ruf-ministry-hub.html", search: "", hash: "" },
    navigator: sandbox.navigator,
    URL: sandbox.URL,
    history: { replaceState() {} },
    addEventListener(type, listener) { windowListeners[type] = listener; },
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
    matchMedia() { return { matches: false }; },
    confirm() { return true; },
    prompt() { return null; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptMatch[1], sandbox, { filename: appPath });
  return {
    sandbox,
    storage,
    elements,
    fakeIdb,
    windowListeners,
    documentListeners,
    eval(code) { return vm.runInContext(code, sandbox); },
    async ready() {
      const promise = vm.runInContext("startupBootstrapPromise", sandbox);
      if (promise) await promise;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
}

async function testPlaintextIndexedDbOnlyRecovery() {
  const recoveredData = emptyData({
    people: [{ id: "person_recovered", name: "Recovered Person", personType: "Student" }],
    quickGrabs: [{
      id: "grab_interrupted",
      rawContent: "Interrupted capture",
      status: "Prompt Me",
      processingState: "processing",
      captureRevision: 1,
      createdAt: "2026-07-15T10:00:00.000Z",
      updatedAt: "2026-07-15T10:00:00.000Z"
    }]
  });
  const drafts = {
    "capture:main": { fields: { "quick-text": "Main draft" } },
    "capture:today": { fields: { "today-capture-text": "Today draft" } },
    "capture:profile:person_recovered": { fields: { "profile-capture-text": "Profile draft" } }
  };
  const harness = makeHarness({
    idbSeed: {
      [KEYS.settings]: { launchScreen: "quick", enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: recoveredData,
      [KEYS.autosave]: drafts
    }
  });
  assert(harness.elements.app.innerHTML.includes("Opening Calm OS"), "startup renders a recovery gate before local data is ready");
  assert(!harness.storage[KEYS.data], "startup does not seed demo data before IndexedDB recovery settles");
  await harness.ready();
  const result = harness.eval(`({ db, view })`);
  assert(result.db.people.length === 1 && result.db.people[0].name === "Recovered Person", "IndexedDB-only startup restores the real plaintext graph instead of demo data");
  assert(result.db.dataSchemaVersion === 3, "IndexedDB-only data is normalized to the current additive schema");
  assert(result.db.quickGrabs[0].processingState === "failed" && /interrupted/i.test(result.db.quickGrabs[0].processingError), "interrupted processing recovers as an explicit safe retry");
  assert(JSON.parse(harness.storage[KEYS.autosave])["capture:profile:person_recovered"].fields["profile-capture-text"] === "Profile draft", "IndexedDB-only startup restores main, Today, and profile draft storage");
}

async function testEncryptedIndexedDbOnlyRecovery() {
  const envelope = { kind: "ruf-ministry-hub-encrypted", version: 1, salt: "salt", iv: "iv", ciphertext: "cipher", encryptedAt: "2026-07-15T10:00:00.000Z" };
  const harness = makeHarness({
    idbSeed: {
      [KEYS.settings]: { localEncryptionEnabled: true, localEncryptionHint: "test hint", autoMemoryVaultEnabled: false },
      [KEYS.encrypted]: envelope,
      [KEYS.data]: emptyData({ people: [{ id: "plaintext_should_not_load", name: "Plaintext should not load" }] })
    }
  });
  await harness.ready();
  const state = harness.eval(`({ db, settings, view })`);
  assert(state.settings.localEncryptionEnabled && state.view.encryptionLocked, "IndexedDB-only encrypted startup fails closed on the vault unlock screen");
  assert(state.db.people.length === 0, "encrypted startup keeps the in-memory ministry graph empty until successful unlock");
  assert(!harness.storage[KEYS.data] && !harness.storage[KEYS.copy] && !harness.storage[KEYS.autosave], "encrypted startup writes no plaintext data, copy, or draft keys");
  assert(harness.fakeIdb.reads.includes(KEYS.encrypted) && !harness.fakeIdb.reads.includes(KEYS.data), "encrypted startup restores settings and envelope before considering plaintext data");
}

async function testCorruptStorageRecoveryBoundary() {
  const corrupt = "{not-valid-json";
  const mirror = emptyData({ people: [{ id: "person_mirror", name: "Mirror Person" }] });
  const recovered = makeHarness({ local: { [KEYS.data]: corrupt }, idbSeed: { [KEYS.data]: mirror } });
  await recovered.ready();
  assert(recovered.eval("db.people[0].name") === "Mirror Person", "corrupt local data recovers from a valid normalized IndexedDB mirror");

  const blocked = makeHarness({ local: { [KEYS.data]: corrupt }, idbSeed: {} });
  await blocked.ready();
  assert(blocked.storage[KEYS.data] === corrupt, "corrupt local data without a mirror remains byte-for-byte untouched");
  assert(Boolean(blocked.eval("view.startupRecoveryError")) && blocked.elements.app.innerHTML.includes("Local data check paused"), "corrupt local data without a mirror pauses the app instead of seeding demo data");
}

async function testFirstInstallAndMissingVault() {
  const fresh = makeHarness();
  await fresh.ready();
  assert(JSON.parse(fresh.storage[KEYS.data]).people.length > 0, "a confirmed first install without IndexedDB seeds the local demo once");

  const missingVault = makeHarness({ local: { [KEYS.settings]: { localEncryptionEnabled: true, autoMemoryVaultEnabled: false } } });
  await missingVault.ready();
  assert(Boolean(missingVault.eval("view.startupRecoveryError")) && !missingVault.storage[KEYS.data], "Device Vault settings without an envelope fail closed and never seed plaintext demo data");
}

async function testSerializedNewestEncryptedWrite() {
  const harness = makeHarness({ local: { [KEYS.settings]: { autoMemoryVaultEnabled: false } } });
  await harness.ready();
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  harness.sandbox.__encryptHook = async payload => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (calls === 1) await firstGate;
    const envelope = { kind: "test", version: 1, snapshotName: payload.data.people[0]?.name || "", encryptedAt: `saved-${calls}` };
    active -= 1;
    return envelope;
  };
  harness.eval(`
    settings.localEncryptionEnabled = true;
    vaultPassphrase = "synthetic-passphrase";
    vaultSaveRequestedRevision = 0;
    vaultSaveCompletedRevision = 0;
    encryptPayload = payload => globalThis.__encryptHook(payload);
    db = normalizeData({ ...emptyData(), people: [{ id: "person_old", name: "Older snapshot" }] });
  `);
  const first = harness.eval("persistEncryptedVault()");
  harness.eval(`db.people[0].name = "Newest snapshot"`);
  const second = harness.eval("persistEncryptedVault()");
  releaseFirst();
  await Promise.all([first, second]);
  const finalEnvelope = JSON.parse(harness.storage[KEYS.encrypted]);
  assert(maxActive === 1 && calls === 2, "encrypted vault writes are serialized and coalesce a newer revision without overlap");
  assert(finalEnvelope.snapshotName === "Newest snapshot", "the newest requested encrypted snapshot is the final durable envelope");
  assert(!harness.storage[KEYS.data] && !harness.storage[KEYS.autosave], "serialized Device Vault persistence leaves no plaintext ministry or draft keys");

  const previousEnvelope = harness.storage[KEYS.encrypted];
  harness.sandbox.__encryptHook = async () => { throw new Error("synthetic encryption failure"); };
  await harness.eval("persistEncryptedVault()");
  assert(harness.storage[KEYS.encrypted] === previousEnvelope, "an encrypted save failure retains the last valid durable envelope");
  harness.sandbox.__encryptHook = async payload => ({ kind: "test", version: 1, snapshotName: payload.data.people[0]?.name || "", encryptedAt: "retry-saved" });
  harness.eval(`db.people[0].name = "Recovered retry"`);
  await harness.eval("persistEncryptedVault()");
  assert(JSON.parse(harness.storage[KEYS.encrypted]).snapshotName === "Recovered retry", "a later encrypted retry safely commits the newest in-memory state");
}

async function run() {
  await testPlaintextIndexedDbOnlyRecovery();
  await testEncryptedIndexedDbOnlyRecovery();
  await testCorruptStorageRecoveryBoundary();
  await testFirstInstallAndMissingVault();
  await testSerializedNewestEncryptedWrite();
  console.log("All Calm OS recovery regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

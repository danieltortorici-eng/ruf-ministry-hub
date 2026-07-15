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
    failNextTransaction: false,
    open() {
      const request = {};
      setTimeout(() => {
        const database = {
          objectStoreNames: { contains() { return true; } },
          createObjectStore() {},
          close() {},
          transaction(_storeName, mode) {
            const transaction = {
              mode,
              pending: 0,
              changes: new Map(),
              shouldFail: mode === "readwrite" && api.failNextTransaction,
              __values: values
            };
            if (transaction.shouldFail) api.failNextTransaction = false;
            const store = {
              get(key) {
                reads.push(key);
                return scheduleRequest(transaction, () => clone(values.get(key)));
              },
              put(value, key) {
                writes.push(key);
                return scheduleRequest(transaction, () => {
                  transaction.changes.set(key, { type: "put", value: clone(value) });
                  return key;
                });
              },
              delete(key) {
                writes.push(`delete:${key}`);
                return scheduleRequest(transaction, () => {
                  transaction.changes.set(key, { type: "delete" });
                  return true;
                });
              }
            };
            transaction.objectStore = () => store;
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
  transaction.pending += 1;
  setTimeout(() => {
    try {
      request.result = operation();
      if (request.onsuccess) request.onsuccess();
      transaction.pending -= 1;
      if (transaction.pending === 0) {
        setTimeout(() => {
          if (transaction.shouldFail) {
            transaction.error = new Error("synthetic transaction abort");
            if (transaction.onerror) transaction.onerror();
            if (transaction.onabort) transaction.onabort();
            return;
          }
          transaction.changes.forEach((change, key) => {
            if (change.type === "delete") valuesForTransaction(transaction).delete(key);
            else valuesForTransaction(transaction).set(key, clone(change.value));
          });
          if (transaction.oncomplete) transaction.oncomplete();
        }, 0);
      }
    } catch (error) {
      request.error = error;
      transaction.error = error;
      if (request.onerror) request.onerror();
      if (transaction.onerror) transaction.onerror();
      if (transaction.onabort) transaction.onabort();
    }
  }, 0);
  return request;
}

function valuesForTransaction(transaction) {
  return transaction.__values;
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

async function testStructuralMirrorAndAtomicEncryptedCommit() {
  const mirrored = emptyData({ people: [{ id: "mirror-person", name: "IndexedDB Mirror" }] });
  const partial = makeHarness({ local: { [KEYS.data]: {} }, idbSeed: { [KEYS.data]: mirrored } });
  await partial.ready();
  assert(partial.eval("db.people[0]?.name") === "IndexedDB Mirror", "a structurally incomplete local object yields to a valid IndexedDB mirror");

  const oldEnvelope = { kind: "old-envelope", encryptedAt: "before" };
  const oldSettings = { localEncryptionEnabled: false, autoMemoryVaultEnabled: false };
  const atomic = makeHarness({ idbSeed: {
    [KEYS.data]: emptyData({ people: [{ id: "plain-person", name: "Plain Durable" }] }),
    [KEYS.settings]: oldSettings,
    [KEYS.copy]: { "brand.title": "Private copy" },
    [KEYS.autosave]: { "capture:main": { text: "draft" } },
    [KEYS.encrypted]: oldEnvelope
  } });
  await atomic.ready();
  atomic.sandbox.__encryptHook = async () => ({ kind: "new-envelope", encryptedAt: "after" });
  atomic.eval(`encryptPayload = payload => globalThis.__encryptHook(payload); settings.localEncryptionEnabled = true; vaultPassphrase = "synthetic-passphrase";`);
  atomic.fakeIdb.failNextTransaction = true;
  const saved = await atomic.eval("persistEncryptedVault()");
  assert(saved === false, "an aborted encrypted IndexedDB transaction reports failure");
  assert(atomic.fakeIdb.values.get(KEYS.encrypted)?.kind === "old-envelope" && atomic.fakeIdb.values.get(KEYS.settings)?.localEncryptionEnabled === false, "an aborted encrypted transaction retains the prior envelope and settings");
  assert(atomic.fakeIdb.values.has(KEYS.data) && atomic.fakeIdb.values.has(KEYS.autosave), "an aborted encrypted transaction retains plaintext recovery mirrors");

  const enable = makeHarness({ local: { [KEYS.settings]: { autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData({ people: [{ id: "enable-person", name: "Plain Before Enable" }] }) } });
  await enable.ready();
  enable.sandbox.__encryptHook = async () => { throw new Error("synthetic encryption failure"); };
  enable.eval("encryptPayload = payload => globalThis.__encryptHook(payload);");
  const enabled = await enable.eval("enableLocalEncryptionRecord('synthetic-passphrase', 'hint')");
  assert(enabled === false && enable.eval("settings.localEncryptionEnabled") === false, "failed vault enable rolls back the in-memory encryption setting alias");
}

async function testLegacyAutoMemoryRestore() {
  const legacyPayload = { db: emptyData({ people: [{ id: "legacy-memory", name: "Legacy Memory Person" }] }), settings: {} };
  const harness = makeHarness({ local: {
    [KEYS.settings]: { autoMemoryVaultEnabled: true },
    [KEYS.data]: emptyData(),
    [KEYS.autoMemory]: { version: 1, snapshots: [{ id: "legacy-memory-snapshot", savedAt: "2026-07-01T12:00:00.000Z", payload: legacyPayload }] }
  } });
  await harness.ready();
  const restored = await harness.eval("restoreAutoMemorySnapshot('legacy-memory-snapshot')");
  assert(restored === true && harness.eval("db.people[0]?.name") === "Legacy Memory Person", "legacy Auto Memory payloads with a nested db field restore through the current schema");
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
  await testStructuralMirrorAndAtomicEncryptedCommit();
  await testLegacyAutoMemoryRestore();
  await testFirstInstallAndMissingVault();
  await testSerializedNewestEncryptedWrite();
  console.log("All Calm OS recovery regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

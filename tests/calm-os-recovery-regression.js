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
  calm: "ruf_ministry_hub_calm_mode",
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

async function flushControlledMicrotasks(turns = 12) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

function makeControlledTimers() {
  let nextId = 1;
  let now = 0;
  const pending = new Map();
  const runDue = () => {
    const tasks = Array.from(pending.entries())
      .filter(([, task]) => task.dueAt <= now)
      .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0]);
    tasks.forEach(([id]) => pending.delete(id));
    tasks.forEach(([, task]) => task.callback());
    return tasks.length;
  };
  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      pending.set(id, { callback, dueAt: now + (Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    advanceBy(duration) {
      now += Math.max(0, Number(duration) || 0);
      return runDue();
    },
    runAll() {
      if (!pending.size) return 0;
      now = Math.max(now, ...Array.from(pending.values(), task => task.dueAt));
      return runDue();
    },
    get size() {
      return pending.size;
    }
  };
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

function makeFakeIndexedDb(seed = {}, options = {}) {
  const values = new Map(Object.entries(clone(seed)));
  const reads = [];
  const writes = [];
  const api = {
    values,
    reads,
    writes,
    transactions: [],
    openCalls: 0,
    closeCount: 0,
    abortCount: 0,
    afterRead: null,
    failNextTransaction: false,
    failNextReadonlyTransaction: false,
    neverOpen: options.neverOpen === true,
    neverSettleNextTransaction: options.neverSettleNextTransaction === true,
    pendingOpenRequests: [],
    transactionGates: [],
    activeTransactions: 0,
    transactionWaiters: [],
    idleWaiters: [],
    revive: value => value,
    gateNextTransaction() {
      const gate = deferred();
      gate.started = deferred();
      api.transactionGates.push(gate);
      return gate;
    },
    waitForTransactions(count) {
      if (api.transactions.length >= count) return Promise.resolve();
      const waiter = deferred();
      api.transactionWaiters.push({ count, resolve: waiter.resolve });
      return waiter.promise;
    },
    waitForIdle() {
      if (api.activeTransactions === 0) return Promise.resolve();
      const waiter = deferred();
      api.idleWaiters.push(waiter.resolve);
      return waiter.promise;
    },
    releaseOpenRequests() {
      const pending = api.pendingOpenRequests.splice(0);
      pending.forEach(complete => complete());
    },
    open() {
      const request = {};
      api.openCalls += 1;
      const completeOpen = () => {
        const database = {
          objectStoreNames: { contains() { return true; } },
          createObjectStore() {},
          close() { api.closeCount += 1; },
          transaction(_storeName, mode) {
            const gate = api.transactionGates.shift() || null;
            const transaction = {
              mode,
              pending: 0,
              changes: new Map(),
              shouldFail: (mode === "readwrite" && api.failNextTransaction) || (mode === "readonly" && api.failNextReadonlyTransaction),
              neverSettle: api.neverSettleNextTransaction,
              aborted: false,
              finished: false,
              __values: values,
              __readValues: mode === "readonly" ? new Map(Array.from(values.entries(), ([key, value]) => [key, clone(value)])) : values,
              __api: api,
              __gate: gate,
              abort() {
                if (transaction.finished) return;
                api.abortCount += 1;
                transaction.aborted = true;
                transaction.error = new Error("synthetic transaction abort");
                if (transaction.onabort) transaction.onabort();
                finishFakeTransaction(transaction);
              }
            };
            api.neverSettleNextTransaction = false;
            api.activeTransactions += 1;
            api.transactions.push(mode);
            api.transactionWaiters = api.transactionWaiters.filter(waiter => {
              if (api.transactions.length < waiter.count) return true;
              waiter.resolve();
              return false;
            });
            if (gate) gate.started.resolve(transaction);
            if (mode === "readwrite" && transaction.shouldFail) api.failNextTransaction = false;
            if (mode === "readonly" && transaction.shouldFail) api.failNextReadonlyTransaction = false;
            const store = {
              get(key) {
                reads.push(key);
                return scheduleRequest(transaction, () => {
                  const value = api.revive(clone(transaction.__readValues.get(key)));
                  if (api.afterRead) api.afterRead(key, api);
                  return value;
                });
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
      };
      if (api.neverOpen) api.pendingOpenRequests.push(completeOpen);
      else setTimeout(completeOpen, 0);
      return request;
    }
  };
  return api;
}

function scheduleRequest(transaction, operation) {
  const request = {};
  transaction.pending += 1;
  const execute = () => setTimeout(() => {
    if (transaction.aborted || transaction.finished) return;
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
            finishFakeTransaction(transaction);
            return;
          }
          transaction.changes.forEach((change, key) => {
            if (change.type === "delete") valuesForTransaction(transaction).delete(key);
            else valuesForTransaction(transaction).set(key, clone(change.value));
          });
          if (transaction.oncomplete) transaction.oncomplete();
          finishFakeTransaction(transaction);
        }, 0);
      }
    } catch (error) {
      request.error = error;
      transaction.error = error;
      if (request.onerror) request.onerror();
      if (transaction.onerror) transaction.onerror();
      if (transaction.onabort) transaction.onabort();
      finishFakeTransaction(transaction);
    }
  }, 0);
  if (!transaction.neverSettle) {
    if (transaction.__gate) transaction.__gate.promise.then(execute);
    else execute();
  }
  return request;
}

function finishFakeTransaction(transaction) {
  if (transaction.finished) return;
  transaction.finished = true;
  const api = transaction.__api;
  api.activeTransactions = Math.max(0, api.activeTransactions - 1);
  if (api.activeTransactions === 0) {
    const waiters = api.idleWaiters.splice(0);
    waiters.forEach(resolve => resolve());
  }
}

function valuesForTransaction(transaction) {
  return transaction.__values;
}

function makeHarness({ local = {}, idbSeed = null, idbOptions = {}, controlledTimers = null, initialHash = "", syntheticConsole = console, instrumentStartupVault = false } = {}) {
  const storage = Object.create(null);
  const localStorageOperations = [];
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
  const fakeIdb = idbSeed === null ? null : makeFakeIndexedDb(idbSeed, idbOptions);
  const timerSet = controlledTimers ? controlledTimers.setTimeout.bind(controlledTimers) : setTimeout;
  const timerClear = controlledTimers ? controlledTimers.clearTimeout.bind(controlledTimers) : clearTimeout;
  const sandbox = {
    console: syntheticConsole,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    setTimeout: timerSet,
    clearTimeout: timerClear,
    crypto: nodeCrypto.webcrypto,
    btoa(value) { return Buffer.from(String(value), "binary").toString("base64"); },
    atob(value) { return Buffer.from(String(value), "base64").toString("binary"); },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
      setItem(key, value) {
        localStorageOperations.push(["set", String(key)]);
        storage[key] = String(value);
      },
      removeItem(key) {
        localStorageOperations.push(["remove", String(key)]);
        delete storage[key];
      }
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
    location: { protocol: "https:", hostname: "example.test", href: `https://example.test/ruf-ministry-hub.html${initialHash}`, pathname: "/ruf-ministry-hub.html", search: "", hash: initialHash },
    navigator: sandbox.navigator,
    URL: sandbox.URL,
    history: {
      state: { syntheticRecoveryState: "preserve" },
      replaceState(state, _title, url) {
        this.state = state;
        const [pathAndSearch, hash = ""] = String(url).split("#");
        const [pathname, search = ""] = pathAndSearch.split("?");
        sandbox.window.location.pathname = pathname || sandbox.window.location.pathname;
        sandbox.window.location.search = search ? `?${search}` : "";
        sandbox.window.location.hash = hash ? `#${hash}` : "";
        sandbox.window.location.href = `https://example.test${sandbox.window.location.pathname}${sandbox.window.location.search}${sandbox.window.location.hash}`;
      }
    },
    addEventListener(type, listener) { windowListeners[type] = listener; },
    setTimeout: timerSet,
    clearTimeout: timerClear,
    requestAnimationFrame(callback) { callback(); },
    matchMedia() { return { matches: false }; },
    confirm() { return true; },
    prompt() { return null; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let scriptSource = scriptMatch[1];
  if (instrumentStartupVault) {
    const marker = "    importQuickGrabFromCurrentFragment();";
    const markerCount = scriptSource.split(marker).length - 1;
    if (markerCount !== 1) throw new Error(`Expected exactly one startup-vault instrumentation marker; found ${markerCount}.`);
    scriptSource = scriptSource.replace(marker, `
    globalThis.__storedSchemaDecryptCalls = 0;
    globalThis.__storedSchemaUnlockCalls = 0;
    const __storedSchemaOriginalDecryptPayload = decryptPayload;
    const __storedSchemaOriginalUnlockVault = unlockVault;
    decryptPayload = (...args) => {
      globalThis.__storedSchemaDecryptCalls += 1;
      return __storedSchemaOriginalDecryptPayload(...args);
    };
    unlockVault = (...args) => {
      globalThis.__storedSchemaUnlockCalls += 1;
      return __storedSchemaOriginalUnlockVault(...args);
    };
${marker}`);
  }
  vm.runInContext(scriptSource, sandbox, { filename: appPath });
  return {
    sandbox,
    storage,
    localStorageOperations,
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

function sortedLocalSnapshot(harness) {
  return JSON.stringify(Object.entries(harness.storage).sort(([left], [right]) => left.localeCompare(right)));
}

function sortedIdbSnapshot(harness) {
  if (!harness.fakeIdb) return "NO_INDEXED_DB";
  return JSON.stringify(Array.from(harness.fakeIdb.values.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function expectedStartupVaultLocalStorageOperations({ writesEnvelope = false } = {}) {
  return [
    ["set", KEYS.settings],
    ...(writesEnvelope ? [["set", KEYS.encrypted]] : []),
    ["remove", KEYS.data],
    ["remove", KEYS.copy],
    ["remove", KEYS.autosave],
    ["remove", KEYS.autoMemory]
  ];
}

function assertExactSuccessfulStartupVaultLock(harness, {
  envelope,
  expectedSettingsInput,
  expectedLocalStorageOperations,
  expectedReads = [],
  expectedTransactions = [],
  expectedWrites = [],
  idbBefore = "NO_INDEXED_DB",
  label
}) {
  harness.sandbox.__storedSchemaExpectedSettingsInput = clone(expectedSettingsInput);
  const expectedSettingsJson = harness.eval("JSON.stringify(normalizeSettings(globalThis.__storedSchemaExpectedSettingsInput))");
  delete harness.sandbox.__storedSchemaExpectedSettingsInput;
  const state = harness.eval(`({
    settingsJson: JSON.stringify(settings),
    dbExact: JSON.stringify(db) === JSON.stringify(emptyData()),
    encryptionLocked: view.encryptionLocked,
    error: view.startupRecoveryError,
    customCopyExact: JSON.stringify(customCopy) === JSON.stringify({}),
    autosaveIsNull: autosaveDraftsCache === null,
    memoryIsNull: memoryVaultCache === null,
    decryptCalls: globalThis.__storedSchemaDecryptCalls,
    unlockCalls: globalThis.__storedSchemaUnlockCalls,
    markup: document.getElementById("app").innerHTML
  })`);
  const expectedLocal = JSON.stringify([
    [KEYS.encrypted, JSON.stringify(envelope)],
    [KEYS.settings, expectedSettingsJson]
  ].sort(([left], [right]) => left.localeCompare(right)));
  const reads = harness.fakeIdb?.reads || [];
  const transactions = harness.fakeIdb?.transactions || [];
  const writes = harness.fakeIdb?.writes || [];
  const observation = {
    settingsExact: state.settingsJson === expectedSettingsJson,
    dbExact: state.dbExact,
    encryptionLocked: state.encryptionLocked,
    error: state.error,
    customCopyExact: state.customCopyExact,
    autosaveIsNull: state.autosaveIsNull,
    memoryIsNull: state.memoryIsNull,
    decryptCalls: state.decryptCalls,
    unlockCalls: state.unlockCalls,
    lockUi: state.markup.includes("Unlock Encrypted Storage") && state.markup.includes('data-action="unlock-vault"'),
    reads,
    transactions,
    writes,
    localStorageOperations: harness.localStorageOperations,
    localExact: sortedLocalSnapshot(harness) === expectedLocal,
    idbExact: sortedIdbSnapshot(harness) === idbBefore
  };
  assert(
    observation.settingsExact
      && observation.dbExact
      && observation.encryptionLocked === true
      && observation.error === ""
      && observation.customCopyExact
      && observation.autosaveIsNull
      && observation.memoryIsNull
      && observation.decryptCalls === 0
      && observation.unlockCalls === 0
      && observation.lockUi
      && JSON.stringify(reads) === JSON.stringify(expectedReads)
      && JSON.stringify(transactions) === JSON.stringify(expectedTransactions)
      && JSON.stringify(writes) === JSON.stringify(expectedWrites)
      && JSON.stringify(observation.localStorageOperations) === JSON.stringify(expectedLocalStorageOperations)
      && observation.localExact
      && observation.idbExact,
    `${label}; observed ${JSON.stringify(observation)}`
  );
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
  const recoveredSettings = { localEncryptionEnabled: true, localEncryptionHint: "test hint", autoMemoryVaultEnabled: false };
  const harness = makeHarness({
    idbSeed: {
      [KEYS.settings]: recoveredSettings,
      [KEYS.encrypted]: envelope,
      [KEYS.data]: emptyData({ people: [{ id: "plaintext_should_not_load", name: "Plaintext should not load" }] })
    },
    instrumentStartupVault: true
  });
  const idbBefore = sortedIdbSnapshot(harness);
  await harness.ready();
  const state = harness.eval(`({ db, settings, view })`);
  assert(state.settings.localEncryptionEnabled && state.view.encryptionLocked, "IndexedDB-only encrypted startup fails closed on the vault unlock screen");
  assert(state.db.people.length === 0, "encrypted startup keeps the in-memory ministry graph empty until successful unlock");
  assert(!harness.storage[KEYS.data] && !harness.storage[KEYS.copy] && !harness.storage[KEYS.autosave], "encrypted startup writes no plaintext data, copy, or draft keys");
  assert(harness.fakeIdb.reads.includes(KEYS.encrypted) && !harness.fakeIdb.reads.includes(KEYS.data), "encrypted startup restores settings and envelope before considering plaintext data");
  assertExactSuccessfulStartupVaultLock(harness, {
    envelope,
    expectedSettingsInput: recoveredSettings,
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations({ writesEnvelope: true }),
    expectedReads: [KEYS.settings, KEYS.encrypted],
    expectedTransactions: ["readonly", "readonly"],
    expectedWrites: [],
    idbBefore,
    label: "IndexedDB-only encrypted startup keeps an exact two-key local vault projection and unchanged durable snapshot"
  });
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

async function testStoredDataSchemaStartupBoundary() {
  const absentMarker = Symbol("absent stored schema marker");
  const recoveryMessage = "Local recovery could not finish. Calm OS did not replace your ministry data. Retry before making changes.";
  const storedGraph = (name, marker) => {
    const value = emptyData({
      people: [{ id: `stored_schema_${name}`, name: `Stored schema ${name}` }]
    });
    if (marker === absentMarker) delete value.dataSchemaVersion;
    else value.dataSchemaVersion = marker;
    return value;
  };
  const warningsFor = warnings => ({
    ...console,
    warn(...args) {
      warnings.push(args.map(value => String(value)).join(" "));
    }
  });

  for (const [name, marker] of [
    ["schema_1", 1],
    ["future_999", 999],
    ["string_3", "3"],
    ["null", null],
    ["boolean", true],
    ["object", { version: 3 }],
    ["array", [3]],
    ["fractional", 3.5]
  ]) {
    const stored = storedGraph(name, marker);
    const storedBytes = JSON.stringify(stored);
    const warnings = [];
    const harness = makeHarness({
      local: { [KEYS.data]: storedBytes },
      idbSeed: null,
      syntheticConsole: warningsFor(warnings)
    });
    await harness.ready();
    const state = harness.eval(`({
      people: db.people.length,
      error: view.startupRecoveryError,
      heading: document.getElementById("app").innerHTML
    })`);
    assert(
      state.people === 0
        && state.error === recoveryMessage
        && state.heading.includes("Local data check paused")
        && state.heading.includes('role="alert"')
        && state.heading.includes("Retry local recovery"),
      `unsupported local ${name} stays behind one accessible content-free recovery gate`
    );
    assert(
      harness.storage[KEYS.data] === storedBytes
        && Object.keys(harness.storage).length === 1,
      `unsupported local ${name} preserves exact local bytes without settings or demo writes`
    );
    const diagnostics = `${warnings.join(" ")} ${state.error} ${state.heading}`;
    assert(
      !diagnostics.includes(`stored_schema_${name}`)
        && !diagnostics.includes(`Stored schema ${name}`)
        && !diagnostics.includes("999"),
      `unsupported local ${name} diagnostics contain no marker or fictional record content`
    );
  }

  for (const [name, marker] of [["missing", absentMarker], ["schema_2", 2], ["current_3", 3]]) {
    const stored = storedGraph(name, marker);
    const storedBytes = JSON.stringify(stored);
    const harness = makeHarness({
      local: {
        [KEYS.settings]: { autoMemoryVaultEnabled: false },
        [KEYS.data]: storedBytes
      },
      idbSeed: null
    });
    await harness.ready();
    assert(
      harness.eval(`db.dataSchemaVersion === 3 && db.people[0]?.id === "stored_schema_${name}" && view.startupRecoveryError === ""`),
      `supported local ${name} opens through the current additive normalization path`
    );
    assert(harness.storage[KEYS.data] === storedBytes, `supported local ${name} keeps the existing local commit bytes at startup`);
  }

  for (const [name, marker] of [["missing", absentMarker], ["schema_2", 2], ["current_3", 3]]) {
    const stored = storedGraph(`idb_${name}`, marker);
    const idbBefore = JSON.stringify(stored);
    const harness = makeHarness({
      local: { [KEYS.settings]: { autoMemoryVaultEnabled: false } },
      idbSeed: { [KEYS.data]: stored }
    });
    await harness.ready();
    assert(
      harness.eval(`db.dataSchemaVersion === 3 && db.people[0]?.id === "stored_schema_idb_${name}" && view.startupRecoveryError === ""`)
        && JSON.parse(harness.storage[KEYS.data]).dataSchemaVersion === 3,
      `supported IndexedDB-only ${name} restores and persists the current local marker`
    );
    assert(JSON.stringify(harness.fakeIdb.values.get(KEYS.data)) === idbBefore, `supported IndexedDB-only ${name} leaves the source mirror byte-equivalent`);
  }

  for (const [name, marker] of [
    ["future_999", 999],
    ["string_3", "3"],
    ["null", null],
    ["object", { version: 3 }]
  ]) {
    const stored = storedGraph(`idb_${name}`, marker);
    const idbBefore = JSON.stringify(stored);
    const warnings = [];
    const harness = makeHarness({
      local: { [KEYS.settings]: { autoMemoryVaultEnabled: false } },
      idbSeed: { [KEYS.data]: stored },
      syntheticConsole: warningsFor(warnings)
    });
    harness.eval(`
      globalThis.__storedSchemaNormalizeCalls = 0;
      globalThis.__storedSchemaOriginalNormalize = normalizeData;
      normalizeData = raw => {
        if (raw?.people?.some(person => person.id === "stored_schema_idb_${name}")) globalThis.__storedSchemaNormalizeCalls += 1;
        return globalThis.__storedSchemaOriginalNormalize(raw);
      };
    `);
    await harness.ready();
    const state = harness.eval(`({ people: db.people.length, error: view.startupRecoveryError, normalizeCalls: globalThis.__storedSchemaNormalizeCalls })`);
    assert(
      state.people === 0 && state.error === recoveryMessage && state.normalizeCalls === 0,
      `unsupported IndexedDB-only ${name} blocks before normalization or demo publication`
    );
    assert(
      !Object.prototype.hasOwnProperty.call(harness.storage, KEYS.data)
        && harness.storage[KEYS.settings] === JSON.stringify({ autoMemoryVaultEnabled: false })
        && Object.keys(harness.storage).length === 1
        && JSON.stringify(harness.fakeIdb.values.get(KEYS.data)) === idbBefore
        && harness.fakeIdb.writes.length === 0,
      `unsupported IndexedDB-only ${name} preserves both stores without a relabeling write`
    );
    assert(!`${warnings.join(" ")} ${state.error}`.includes(`stored_schema_idb_${name}`), `unsupported IndexedDB-only ${name} logs no fictional record content`);
  }

  const unsupportedMirror = storedGraph("unsupported_fallback", 999);
  const unsupportedMirrorBefore = JSON.stringify(unsupportedMirror);
  const corruptBytes = "{fictional-corrupt-local";
  const corruptFallback = makeHarness({
    local: {
      [KEYS.settings]: { autoMemoryVaultEnabled: false },
      [KEYS.data]: corruptBytes
    },
    idbSeed: { [KEYS.data]: unsupportedMirror }
  });
  await corruptFallback.ready();
  assert(
    corruptFallback.eval(`db.people.length === 0 && view.startupRecoveryError === "${recoveryMessage}"`)
      && corruptFallback.storage[KEYS.data] === corruptBytes
      && corruptFallback.storage[KEYS.settings] === JSON.stringify({ autoMemoryVaultEnabled: false })
      && Object.keys(corruptFallback.storage).length === 2
      && JSON.stringify(corruptFallback.fakeIdb.values.get(KEYS.data)) === unsupportedMirrorBefore
      && corruptFallback.fakeIdb.writes.length === 0,
    "corrupt local data plus an unsupported mirror blocks without overwriting either store"
  );

  const unsupportedLocal = storedGraph("unsupported_local_wins", 999);
  const supportedMirror = storedGraph("supported_mirror_must_wait", 3);
  const unsupportedLocalBytes = JSON.stringify(unsupportedLocal);
  const supportedMirrorBefore = JSON.stringify(supportedMirror);
  const precedence = makeHarness({
    local: {
      [KEYS.settings]: { autoMemoryVaultEnabled: false },
      [KEYS.data]: unsupportedLocalBytes
    },
    idbSeed: { [KEYS.data]: supportedMirror }
  });
  await precedence.ready();
  assert(
    precedence.eval(`db.people.length === 0 && view.startupRecoveryError === "${recoveryMessage}"`)
      && precedence.storage[KEYS.data] === unsupportedLocalBytes
      && precedence.storage[KEYS.settings] === JSON.stringify({ autoMemoryVaultEnabled: false })
      && Object.keys(precedence.storage).length === 2
      && JSON.stringify(precedence.fakeIdb.values.get(KEYS.data)) === supportedMirrorBefore
      && !precedence.fakeIdb.reads.includes(KEYS.data)
      && precedence.fakeIdb.writes.length === 0,
    "unsupported authoritative local data blocks before selecting or overwriting a current mirror"
  );

  const supportedFallback = makeHarness({
    local: {
      [KEYS.settings]: { autoMemoryVaultEnabled: false },
      [KEYS.data]: corruptBytes
    },
    idbSeed: { [KEYS.data]: storedGraph("supported_fallback", 2) }
  });
  await supportedFallback.ready();
  assert(
    supportedFallback.eval(`db.dataSchemaVersion === 3 && db.people[0]?.id === "stored_schema_supported_fallback" && view.startupRecoveryError === ""`)
      && JSON.parse(supportedFallback.storage[KEYS.data]).dataSchemaVersion === 3,
    "genuinely corrupt local data still recovers from a supported schema-2 mirror"
  );

  const syntheticEnvelope = {
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "synthetic-startup-salt",
    iv: "synthetic-startup-iv",
    ciphertext: "synthetic-startup-ciphertext",
    encryptedAt: "2026-07-19T00:00:00.000Z"
  };
  const vaultOwnedUnsupported = storedGraph("vault_owned_future", 999);
  const vaultOwnedUnsupportedBytes = JSON.stringify(vaultOwnedUnsupported);
  const recoveredVaultSettings = {
    localEncryptionEnabled: true,
    localEncryptionHint: "synthetic startup hint",
    autoMemoryVaultEnabled: false
  };
  const recoveredVaultIdbBefore = JSON.stringify({
    settings: recoveredVaultSettings,
    envelope: syntheticEnvelope
  });
  const recoveredVault = makeHarness({
    local: { [KEYS.data]: vaultOwnedUnsupportedBytes },
    idbSeed: {
      [KEYS.settings]: recoveredVaultSettings,
      [KEYS.encrypted]: syntheticEnvelope
    },
    instrumentStartupVault: true
  });
  const recoveredVaultFullIdbBefore = sortedIdbSnapshot(recoveredVault);
  await recoveredVault.ready();
  const recoveredVaultState = recoveredVault.eval(`({
    encryptionEnabled: settings.localEncryptionEnabled,
    encryptionLocked: view.encryptionLocked,
    error: view.startupRecoveryError,
    people: db.people.length,
    decryptCalls: globalThis.__storedSchemaDecryptCalls,
    unlockCalls: globalThis.__storedSchemaUnlockCalls,
    markup: document.getElementById("app").innerHTML
  })`);
  const recoveredVaultObservation = {
    encryptionEnabled: recoveredVaultState.encryptionEnabled,
    encryptionLocked: recoveredVaultState.encryptionLocked,
    error: recoveredVaultState.error,
    people: recoveredVaultState.people,
    decryptCalls: recoveredVaultState.decryptCalls,
    unlockCalls: recoveredVaultState.unlockCalls,
    lockUi: recoveredVaultState.markup.includes("Unlock Encrypted Storage")
      && recoveredVaultState.markup.includes('data-action="unlock-vault"'),
    reads: recoveredVault.fakeIdb.reads,
    writes: recoveredVault.fakeIdb.writes,
    localDataPresent: Object.prototype.hasOwnProperty.call(recoveredVault.storage, KEYS.data),
    localEnvelopeExact: recoveredVault.storage[KEYS.encrypted] === JSON.stringify(syntheticEnvelope),
    idbExact: JSON.stringify({
      settings: recoveredVault.fakeIdb.values.get(KEYS.settings),
      envelope: recoveredVault.fakeIdb.values.get(KEYS.encrypted)
    }) === recoveredVaultIdbBefore
  };
  assert(
    recoveredVaultState.encryptionEnabled === true
      && recoveredVaultState.encryptionLocked === true
      && recoveredVaultState.error === ""
      && recoveredVaultState.people === 0
      && recoveredVaultState.decryptCalls === 0
      && recoveredVaultState.unlockCalls === 0
      && recoveredVaultState.markup.includes("Unlock Encrypted Storage")
      && recoveredVaultState.markup.includes('data-action="unlock-vault"')
      && JSON.stringify(recoveredVault.fakeIdb.reads) === JSON.stringify([KEYS.settings, KEYS.encrypted])
      && recoveredVault.fakeIdb.writes.length === 0
      && !Object.prototype.hasOwnProperty.call(recoveredVault.storage, KEYS.data)
      && JSON.parse(recoveredVault.storage[KEYS.settings]).localEncryptionEnabled === true
      && recoveredVault.storage[KEYS.encrypted] === JSON.stringify(syntheticEnvelope)
      && recoveredVaultObservation.idbExact,
    `recovered IndexedDB Device Vault ownership wins before unsupported plaintext without decrypting or rewriting its durable stores; observed ${JSON.stringify(recoveredVaultObservation)}`
  );
  assertExactSuccessfulStartupVaultLock(recoveredVault, {
    envelope: syntheticEnvelope,
    expectedSettingsInput: recoveredVaultSettings,
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations({ writesEnvelope: true }),
    expectedReads: [KEYS.settings, KEYS.encrypted],
    expectedTransactions: ["readonly", "readonly"],
    expectedWrites: [],
    idbBefore: recoveredVaultFullIdbBefore,
    label: "recovered IndexedDB Device Vault ownership leaves only exact settings and envelope in local storage"
  });

  const localVaultSettings = { localEncryptionEnabled: true, autoMemoryVaultEnabled: false };
  const localVault = makeHarness({
    local: {
      [KEYS.settings]: localVaultSettings,
      [KEYS.data]: vaultOwnedUnsupportedBytes,
      [KEYS.encrypted]: syntheticEnvelope
    },
    instrumentStartupVault: true
  });
  await localVault.ready();
  assert(
    localVault.eval(`settings.localEncryptionEnabled === true && view.encryptionLocked === true && view.startupRecoveryError === "" && db.people.length === 0`)
      && !Object.prototype.hasOwnProperty.call(localVault.storage, KEYS.data)
      && localVault.storage[KEYS.encrypted] === JSON.stringify(syntheticEnvelope),
    "explicit local Device Vault ownership retains its existing lock and plaintext cleanup before the unsupported-plaintext gate"
  );
  assertExactSuccessfulStartupVaultLock(localVault, {
    envelope: syntheticEnvelope,
    expectedSettingsInput: localVaultSettings,
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations(),
    expectedReads: [],
    expectedTransactions: [],
    expectedWrites: [],
    label: "explicit local Device Vault ownership leaves an exact two-key local store with no plaintext or unknown key"
  });

  const localSettingsIdbEnvelope = makeHarness({
    local: {
      [KEYS.settings]: localVaultSettings,
      [KEYS.data]: vaultOwnedUnsupportedBytes
    },
    idbSeed: { [KEYS.encrypted]: syntheticEnvelope },
    instrumentStartupVault: true
  });
  const localSettingsIdbEnvelopeBefore = sortedIdbSnapshot(localSettingsIdbEnvelope);
  await localSettingsIdbEnvelope.ready();
  assertExactSuccessfulStartupVaultLock(localSettingsIdbEnvelope, {
    envelope: syntheticEnvelope,
    expectedSettingsInput: localVaultSettings,
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations({ writesEnvelope: true }),
    expectedReads: [KEYS.encrypted],
    expectedTransactions: ["readonly"],
    expectedWrites: [],
    idbBefore: localSettingsIdbEnvelopeBefore,
    label: "explicit local Device Vault settings recover an IndexedDB-only envelope before unsupported plaintext with exact stores"
  });

  const missingLocalVault = makeHarness({
    local: {
      [KEYS.settings]: localVaultSettings,
      [KEYS.data]: vaultOwnedUnsupportedBytes
    }
  });
  const missingLocalVaultBefore = sortedLocalSnapshot(missingLocalVault);
  await missingLocalVault.ready();
  const missingLocalVaultObservation = missingLocalVault.eval(`({
    encryptionEnabled: settings.localEncryptionEnabled,
    encryptionLocked: view.encryptionLocked,
    error: view.startupRecoveryError,
    people: db.people.length
  })`);
  assert(
    missingLocalVaultObservation.encryptionEnabled === true
      && missingLocalVaultObservation.encryptionLocked === false
      && missingLocalVaultObservation.error === "Encrypted storage is enabled, but its local vault could not be recovered. Nothing was replaced."
      && missingLocalVaultObservation.people === 0
      && sortedLocalSnapshot(missingLocalVault) === missingLocalVaultBefore,
    `explicit local Device Vault ownership with no envelope keeps its specific missing-vault error and preserves unsupported plaintext bytes; observed ${JSON.stringify(missingLocalVaultObservation)}`
  );

  const unownedEnvelopeSettings = { localEncryptionEnabled: false, autoMemoryVaultEnabled: false };
  const unownedEnvelopeBytes = JSON.stringify(syntheticEnvelope);
  const unownedUnsupportedBytes = JSON.stringify(storedGraph("unowned_envelope_future", 999));
  const unownedEnvelope = makeHarness({
    local: {
      [KEYS.settings]: unownedEnvelopeSettings,
      [KEYS.data]: unownedUnsupportedBytes,
      [KEYS.encrypted]: unownedEnvelopeBytes
    },
    idbSeed: {
      [KEYS.settings]: { localEncryptionEnabled: true, autoMemoryVaultEnabled: false },
      [KEYS.data]: storedGraph("unowned_idb_current", 3),
      [KEYS.encrypted]: { ...syntheticEnvelope, ciphertext: "synthetic-idb-ciphertext" }
    }
  });
  const unownedLocalBefore = sortedLocalSnapshot(unownedEnvelope);
  const unownedIdbBefore = sortedIdbSnapshot(unownedEnvelope);
  await unownedEnvelope.ready();
  assert(
    unownedEnvelope.eval(`settings.localEncryptionEnabled === false && view.encryptionLocked === false && view.startupRecoveryError === "${recoveryMessage}" && db.people.length === 0`)
      && sortedLocalSnapshot(unownedEnvelope) === unownedLocalBefore
      && sortedIdbSnapshot(unownedEnvelope) === unownedIdbBefore
      && unownedEnvelope.fakeIdb.reads.length === 0
      && unownedEnvelope.fakeIdb.transactions.length === 0
      && unownedEnvelope.fakeIdb.writes.length === 0,
    "a merely present local envelope never overrides explicit plaintext settings or promotes a complete unsupported plaintext graph into Device Vault ownership"
  );

  const missingSettingsEnvelope = makeHarness({
    local: {
      [KEYS.data]: unownedUnsupportedBytes,
      [KEYS.encrypted]: unownedEnvelopeBytes
    }
  });
  const missingSettingsEnvelopeBefore = sortedLocalSnapshot(missingSettingsEnvelope);
  await missingSettingsEnvelope.ready();
  assert(
    missingSettingsEnvelope.eval(`settings.localEncryptionEnabled === false && view.encryptionLocked === false && view.startupRecoveryError === "${recoveryMessage}" && db.people.length === 0`)
      && sortedLocalSnapshot(missingSettingsEnvelope) === missingSettingsEnvelopeBefore,
    "missing settings plus a merely present envelope does not promote complete unsupported plaintext into Device Vault ownership"
  );

  const discoveredNoVault = makeHarness({
    local: { [KEYS.data]: unownedUnsupportedBytes },
    idbSeed: { [KEYS.settings]: unownedEnvelopeSettings }
  });
  const discoveredNoVaultLocalBefore = sortedLocalSnapshot(discoveredNoVault);
  const discoveredNoVaultIdbBefore = sortedIdbSnapshot(discoveredNoVault);
  await discoveredNoVault.ready();
  assert(
    discoveredNoVault.eval(`settings.localEncryptionEnabled === false && view.encryptionLocked === false && view.startupRecoveryError === "${recoveryMessage}" && db.people.length === 0`)
      && JSON.stringify(discoveredNoVault.fakeIdb.reads) === JSON.stringify([KEYS.settings, KEYS.encrypted])
      && JSON.stringify(discoveredNoVault.fakeIdb.transactions) === JSON.stringify(["readonly", "readonly"])
      && discoveredNoVault.fakeIdb.writes.length === 0
      && sortedLocalSnapshot(discoveredNoVault) === discoveredNoVaultLocalBefore
      && sortedIdbSnapshot(discoveredNoVault) === discoveredNoVaultIdbBefore,
    "unsupported plaintext permits settings/envelope discovery but blocks before IndexedDB data reads or any store write when no vault owns startup"
  );

  const corruptJsonOrphan = makeHarness({
    local: {
      [KEYS.data]: "{synthetic-corrupt-json",
      [KEYS.encrypted]: unownedEnvelopeBytes
    },
    instrumentStartupVault: true
  });
  await corruptJsonOrphan.ready();
  assertExactSuccessfulStartupVaultLock(corruptJsonOrphan, {
    envelope: syntheticEnvelope,
    expectedSettingsInput: { localEncryptionEnabled: true },
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations(),
    expectedReads: [],
    expectedTransactions: [],
    expectedWrites: [],
    label: "corrupt JSON retains the established orphan-envelope vault lock and exact two-key local projection"
  });

  const incompleteOrphanBytes = JSON.stringify({ people: [] });
  const incompleteOrphan = makeHarness({
    local: {
      [KEYS.data]: incompleteOrphanBytes,
      [KEYS.encrypted]: unownedEnvelopeBytes
    },
    instrumentStartupVault: true
  });
  await incompleteOrphan.ready();
  assert(
    incompleteOrphan.eval(`settings.localEncryptionEnabled === true && view.encryptionLocked === true && view.startupRecoveryError === "" && db.people.length === 0`)
      && !Object.prototype.hasOwnProperty.call(incompleteOrphan.storage, KEYS.data)
      && incompleteOrphan.storage[KEYS.encrypted] === unownedEnvelopeBytes,
    "a structurally incomplete plaintext graph retains the pre-existing orphan-envelope Device Vault lock and cleanup path"
  );
  assertExactSuccessfulStartupVaultLock(incompleteOrphan, {
    envelope: syntheticEnvelope,
    expectedSettingsInput: { localEncryptionEnabled: true },
    expectedLocalStorageOperations: expectedStartupVaultLocalStorageOperations(),
    expectedReads: [],
    expectedTransactions: [],
    expectedWrites: [],
    label: "structurally incomplete plaintext retains an exact orphan-envelope vault lock projection"
  });
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
  const legacyGraph = emptyData({ people: [{ id: "legacy-memory", name: "Legacy Memory Person" }] });
  delete legacyGraph.dataSchemaVersion;
  delete legacyGraph.aiProposals;
  const legacyPayload = { db: legacyGraph, settings: {} };
  const schemaTwoGraph = emptyData({ people: [{ id: "schema-two-memory", name: "Schema Two Memory Person" }] });
  schemaTwoGraph.dataSchemaVersion = 2;
  delete schemaTwoGraph.aiProposals;
  const schemaTwoPayload = { dataSchemaVersion: 2, data: schemaTwoGraph, settings: {}, customCopy: {}, autosaveDrafts: {} };
  const harness = makeHarness({ local: {
    [KEYS.settings]: { autoMemoryVaultEnabled: true },
    [KEYS.data]: emptyData(),
    [KEYS.autoMemory]: { version: 1, snapshots: [
      { id: "legacy-memory-snapshot", savedAt: "2026-07-01T12:00:00.000Z", payload: legacyPayload },
      { id: "schema-two-memory-snapshot", savedAt: "2026-07-02T12:00:00.000Z", payload: schemaTwoPayload }
    ] }
  } });
  await harness.ready();
  const restored = await harness.eval("restoreAutoMemorySnapshot('legacy-memory-snapshot')");
  assert(restored === true && harness.eval("db.people[0]?.name") === "Legacy Memory Person", "legacy Auto Memory payloads with a nested db field restore through the current schema");
  const schemaTwoRestored = await harness.eval("restoreAutoMemorySnapshot('schema-two-memory-snapshot')");
  assert(
    schemaTwoRestored === true
      && harness.eval("db.people[0]?.name") === "Schema Two Memory Person"
      && harness.eval("db.dataSchemaVersion") === 3,
    "schema-2 Auto Memory restore retains historical provenance until the maintained additive restore normalizer"
  );

  const unsupportedGraph = emptyData({ people: [{ id: "unsupported-memory", name: "Fictional unsupported content" }] });
  delete unsupportedGraph.dataSchemaVersion;
  const unsupportedVault = {
    version: 1,
    snapshots: [{
      id: "unsupported-memory-snapshot",
      savedAt: "2026-07-03T12:00:00.000Z",
      payload: { dataSchemaVersion: 999, db: unsupportedGraph, settings: {} }
    }]
  };
  harness.sandbox.localStorage.setItem(KEYS.autoMemory, JSON.stringify(unsupportedVault));
  const unsupportedBytes = harness.storage[KEYS.autoMemory];
  const before = harness.eval("JSON.stringify({ db, undoStack, recoveryEpoch, pending: recoveryTransactionPending })");
  harness.eval(`
    globalThis.__unsupportedAutoMemoryBeginCalls = 0;
    globalThis.__unsupportedAutoMemoryOriginalBegin = beginRecoveryTransaction;
    beginRecoveryTransaction = (...args) => {
      globalThis.__unsupportedAutoMemoryBeginCalls += 1;
      return globalThis.__unsupportedAutoMemoryOriginalBegin(...args);
    };
  `);
  const unsupportedRestored = await harness.eval("restoreAutoMemorySnapshot('unsupported-memory-snapshot')");
  assert(
    unsupportedRestored === false
      && harness.eval("globalThis.__unsupportedAutoMemoryBeginCalls") === 0
      && harness.eval("JSON.stringify({ db, undoStack, recoveryEpoch, pending: recoveryTransactionPending })") === before
      && harness.storage[KEYS.autoMemory] === unsupportedBytes,
    "unsupported Auto Memory restore input is byte-preserving and cannot begin recovery or record Undo"
  );
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

async function testRestorePersistenceRollbackAcrossStores() {
  const beforeData = emptyData({ people: [{ id: "restore_before", name: "Restore Before" }] });
  const beforeDrafts = { "capture:main": { fields: { "quick-text": "Draft before failed restore" } } };
  const beforeSettings = { enableUndo: true, enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false, launchScreen: "today" };
  const harness = makeHarness({
    local: { [KEYS.settings]: beforeSettings, [KEYS.data]: beforeData, [KEYS.copy]: { "brand.title": "Before copy" }, [KEYS.autosave]: beforeDrafts },
    idbSeed: { [KEYS.settings]: beforeSettings, [KEYS.data]: beforeData, [KEYS.copy]: { "brand.title": "Before copy" }, [KEYS.autosave]: beforeDrafts }
  });
  await harness.ready();
  const beforeLocal = JSON.stringify({ ...harness.storage });
  const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  harness.sandbox.__restorePayload = harness.eval(`(() => {
    const payload = cloneJson(currentPortablePayload());
    payload.data.people = [{ id: "restore_after", name: "Restore After" }];
    payload.customCopy = { "brand.title": "Imported copy" };
    payload.autosaveDrafts = { "capture:main": { fields: { "quick-text": "Imported draft" } } };
    return payload;
  })()`);
  harness.fakeIdb.failNextTransaction = true;
  const restorePromise = harness.eval("applyRestoredPayload(__restorePayload)");
  const restoreBusyMarkup = harness.elements.app.innerHTML;
  const restored = await restorePromise;
  await new Promise(resolve => setTimeout(resolve, 25));
  const afterLocal = JSON.stringify({ ...harness.storage });
  const afterIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  assert(restoreBusyMarkup.includes("Restoring backup…") && restoreBusyMarkup.includes('aria-busy="true"') && !/<(?:button|input|textarea|select)\b/.test(restoreBusyMarkup), "backup restore exposes one truthful app-level busy surface with no enabled mutation control");
  assert(restored === false && afterLocal === beforeLocal && afterIdb === beforeIdb, "forced autosave-inclusive restore persistence failure leaves local storage and IndexedDB byte-equivalent");
}

async function testEncryptedUndoDurabilityTransaction() {
  const harness = makeHarness({ local: { [KEYS.settings]: { autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }, idbSeed: {} });
  await harness.ready();
  harness.eval(`
    settings.localEncryptionEnabled = true;
    settings.enableUndo = true;
    vaultPassphrase = "synthetic-undo-passphrase";
    db = normalizeData({ ...emptyData(), people: [{ id: "undo_current", name: "Current encrypted state" }] });
    undoStack = [
      { label: "encrypted update", db: normalizeData({ ...emptyData(), people: [{ id: "undo_target", name: "Encrypted undo target" }] }), settings: cloneJson(settings), customCopy: {} },
      { label: "older entry", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }
    ];
    vaultSaveRequestedRevision = 20;
    vaultSaveCompletedRevision = 20;
    __undoRequiredRevision = 0;
    __undoResolve = null;
    __originalUndoConfirm = confirmCareVaultRevision;
    confirmCareVaultRevision = requiredRevision => {
      __undoRequiredRevision = requiredRevision;
      return new Promise(resolve => { __undoResolve = resolve; });
    };
  `);
  const pendingUndo = harness.eval("undoLast()");
  await new Promise(resolve => setTimeout(resolve, 50));
  const pendingState = harness.eval(`({
    pending: typeof recoveryTransactionPending !== "undefined" && recoveryTransactionPending,
    undoSaving: Boolean(view.undoSaving),
    undoCount: undoStack.length,
    required: __undoRequiredRevision,
    requested: vaultSaveRequestedRevision,
    toast: document.getElementById("toast").textContent,
    markup: renderTopbar("Synthetic Undo")
  })`);
  assert(pendingState.pending && pendingState.undoSaving && pendingState.undoCount === 2 && pendingState.required === pendingState.requested && pendingState.required > 20 && !pendingState.toast.startsWith("Undid"), "encrypted Undo is busy and announces no success before its exact vault revision completes");
  assert(pendingState.markup.includes('aria-busy="true"') && pendingState.markup.includes("Undoing"), "pending encrypted Undo exposes truthful accessible busy state");

  harness.sandbox.__undoNavButton = { dataset: { action: "nav", screen: "settings" }, classList: { contains() { return false; } } };
  harness.eval("__undoPrevented = false; __undoStopped = false;");
  const blocked = harness.eval(`handleAction({
    currentTarget: __undoNavButton,
    target: __undoNavButton,
    preventDefault() { __undoPrevented = true; },
    stopPropagation() { __undoStopped = true; }
  })`);
  const reentry = await harness.eval("undoLast()");
  assert(blocked === false && harness.eval("__undoPrevented && __undoStopped") && reentry === false && harness.eval("view.screen") !== "settings", "pending encrypted Undo blocks navigation and re-entry");

  harness.eval("vaultSaveCompletedRevision = __undoRequiredRevision; __undoResolve(true)");
  const success = await pendingUndo;
  harness.eval("confirmCareVaultRevision = __originalUndoConfirm");
  const successState = harness.eval(`({ resultName: db.people[0]?.name, undoCount: undoStack.length, pending: recoveryTransactionPending, undoSaving: Boolean(view.undoSaving), toast: document.getElementById("toast").textContent })`);
  assert(success === true && successState.resultName === "Encrypted undo target" && successState.undoCount === 1 && !successState.pending && !successState.undoSaving && successState.toast.startsWith("Undid encrypted update"), "successful encrypted Undo commits exactly once and consumes exactly one entry");

  const failed = makeHarness({ local: { [KEYS.settings]: { autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }, idbSeed: {} });
  await failed.ready();
  const before = failed.eval(`(() => {
    settings.localEncryptionEnabled = true;
    settings.enableUndo = true;
    vaultPassphrase = "synthetic-undo-passphrase";
    db = normalizeData({ ...emptyData(), people: [{ id: "failed_current", name: "Current before failed Undo" }] });
    undoStack = [{ label: "failed encrypted undo", db: normalizeData({ ...emptyData(), people: [{ id: "failed_target", name: "Target must roll back" }] }), settings: cloneJson(settings), customCopy: {} }];
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, "envelope-before-undo");
    vaultSaveRequestedRevision = 40;
    vaultSaveCompletedRevision = 40;
    scheduleVaultSave = () => { vaultSaveRequestedRevision += 1; };
    confirmCareVaultRevision = async requiredRevision => {
      vaultSaveCompletedRevision = requiredRevision;
      vaultSaveRequestedRevision = requiredRevision + 1;
      localStorage.setItem(ENCRYPTED_STORAGE_KEY, "older-success-newer-failure");
      return false;
    };
    return {
      db: JSON.stringify(db),
      undo: JSON.stringify(undoStack),
      storage: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
      requested: vaultSaveRequestedRevision,
      completed: vaultSaveCompletedRevision
    };
  })()`);
  const failedResult = await failed.eval("undoLast()");
  const after = failed.eval(`({
    db: JSON.stringify(db),
    undo: JSON.stringify(undoStack),
    storage: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
    requested: vaultSaveRequestedRevision,
    completed: vaultSaveCompletedRevision,
    toast: document.getElementById("toast").textContent
  })`);
  assert(failedResult === false && after.db === before.db && after.undo === before.undo && after.storage === before.storage && after.requested === before.requested && after.completed === before.completed, "older encrypted success followed by a newer revision failure restores graph, storage, revisions, and preserves Undo");
  assert(!after.toast.startsWith("Undid"), "failed encrypted Undo never announces success and remains retryable");
}

async function testRealLifecycleOverlapOwnsStableRecoveryCeiling() {
  const beforeDrafts = { "capture:main": { fields: { "quick-text": "Draft before recovery" } } };
  const harness = makeHarness({
    local: {
      [KEYS.settings]: { enableUndo: true, enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: emptyData({ people: [{ id: "overlap_current", name: "Current encrypted state" }] })
    },
    idbSeed: {}
  });
  await harness.ready();
  let releaseOwned;
  let markOwnedStarted;
  const ownedStarted = new Promise(resolve => { markOwnedStarted = resolve; });
  const ownedGate = new Promise(resolve => { releaseOwned = resolve; });
  let encryptCalls = 0;
  harness.sandbox.__encryptHook = async payload => {
    encryptCalls += 1;
    if (encryptCalls === 1) {
      markOwnedStarted();
      await ownedGate;
      return { kind: "test", version: 1, snapshotName: payload.data.people[0]?.name || "", encryptedAt: "owned-success" };
    }
    throw new Error("synthetic newer revision failure");
  };
  const quickText = harness.elements["quick-text"];
  quickText.tagName = "TEXTAREA";
  quickText.type = "text";
  quickText.value = "Interleaved draft must not be accepted";
  harness.sandbox.document.querySelectorAll = selector => selector === "input, textarea, select" ? [quickText] : [];
  harness.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true, launchScreen: "quick" });
    vaultPassphrase = "synthetic-overlap-passphrase";
    db = normalizeData({ ...emptyData(), people: [{ id: "overlap_current", name: "Current encrypted state" }] });
    undoStack = [{ label: "overlap undo", db: normalizeData({ ...emptyData(), people: [{ id: "overlap_target", name: "Undo target" }] }), settings: cloneJson(settings), customCopy: {} }];
    autosaveDraftsCache = ${JSON.stringify(beforeDrafts)};
    vaultSaveRequestedRevision = 0;
    vaultSaveCompletedRevision = 0;
    encryptPayload = payload => globalThis.__encryptHook(payload);
  `);
  const pendingUndo = harness.eval("undoLast()");
  await ownedStarted;
  const ownedRevision = harness.eval("vaultSaveRequestedRevision");
  const directAttempts = harness.eval(`({
    draft: saveCurrentDraftNow(),
    autosave: scheduleAutosave(),
    setting: updateSetting("launchScreen", "people"),
    aiSelection: persistAiActionSelection("missing", "missing", true),
    copy: editCopyText("brand.title", "Calm OS"),
    sharedText: applyPendingFragmentQuickGrabText(),
    dictation: startDictation("quick-text"),
    care: updateCareCadenceSheetProposal(),
    timer: autosaveTimer,
    busyMarkup: document.getElementById("app").innerHTML
  })`);
  const photoResult = await harness.eval("handleProfilePhotoUpload(null)");
  const lifecycleResultPromise = harness.windowListeners.pagehide();
  const afterBlockedAttempts = harness.eval("vaultSaveRequestedRevision");
  harness.eval("scheduleVaultSave(true)");
  const forcedLatestRevision = harness.eval("vaultSaveRequestedRevision");
  releaseOwned();
  const [undoResult, lifecycleResult] = await Promise.all([pendingUndo, lifecycleResultPromise]);
  await new Promise(resolve => setTimeout(resolve, 20));
  const after = harness.eval(`({
    name: db.people[0]?.name,
    draft: loadAutosaveDrafts()["capture:main"]?.fields?.["quick-text"],
    launchScreen: settings.launchScreen,
    undoCount: undoStack.length,
    requested: vaultSaveRequestedRevision,
    completed: vaultSaveCompletedRevision,
    pending: recoveryTransactionPending,
    toast: document.getElementById("toast").textContent
  })`);
  assert(
    Object.values(directAttempts).slice(0, 8).every(value => value === false)
      && directAttempts.timer === null
      && directAttempts.busyMarkup.includes("Undoing last change…")
      && directAttempts.busyMarkup.includes('aria-busy="true"')
      && !/<(?:button|input|textarea|select)\b/.test(directAttempts.busyMarkup)
      && photoResult === false
      && lifecycleResult === false
      && afterBlockedAttempts === ownedRevision
      && forcedLatestRevision === ownedRevision + 1
      && undoResult === false
      && after.name === "Current encrypted state"
      && after.draft === "Draft before recovery"
      && after.launchScreen === "quick"
      && after.undoCount === 1
      && after.requested === 0
      && after.completed === 0
      && !after.pending
      && !after.toast.startsWith("Undid"),
    "real lifecycle/direct-input overlap cannot advance recovery ownership, and a real newer vault failure rolls Undo back without consuming or announcing"
  );

  const settled = makeHarness({ local: { [KEYS.settings]: { autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() } });
  await settled.ready();
  let releasePrior;
  let markPriorStarted;
  const priorStarted = new Promise(resolve => { markPriorStarted = resolve; });
  const priorGate = new Promise(resolve => { releasePrior = resolve; });
  let settledCalls = 0;
  settled.sandbox.__encryptHook = async payload => {
    settledCalls += 1;
    if (settledCalls === 1) {
      markPriorStarted();
      await priorGate;
    }
    return { kind: "test", version: 1, snapshotName: payload.data.people[0]?.name || "", encryptedAt: `settled-${settledCalls}` };
  };
  settled.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true });
    vaultPassphrase = "synthetic-settlement-passphrase";
    db = normalizeData({ ...emptyData(), people: [{ id: "prior_current", name: "Prior write state" }] });
    undoStack = [{ label: "settled undo", db: normalizeData({ ...emptyData(), people: [{ id: "settled_target", name: "Settled undo target" }] }), settings: cloneJson(settings), customCopy: {} }];
    vaultSaveRequestedRevision = 0;
    vaultSaveCompletedRevision = 0;
    encryptPayload = payload => globalThis.__encryptHook(payload);
  `);
  const priorWrite = settled.eval("persistEncryptedVault()");
  await priorStarted;
  const settledUndo = settled.eval("undoLast()");
  await new Promise(resolve => setTimeout(resolve, 20));
  const whileSettling = settled.eval(`({ pending: recoveryTransactionPending, name: db.people[0]?.name, requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision })`);
  releasePrior();
  const [priorResult, settledUndoResult] = await Promise.all([priorWrite, settledUndo]);
  const settledAfter = settled.eval(`({ name: db.people[0]?.name, undoCount: undoStack.length, requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision, pending: recoveryTransactionPending })`);
  assert(
    whileSettling.pending && whileSettling.name === "Prior write state" && whileSettling.requested === 1 && whileSettling.completed === 0
      && priorResult === true && settledUndoResult === true && settledCalls === 2
      && settledAfter.name === "Settled undo target" && settledAfter.undoCount === 0
      && settledAfter.requested === 2 && settledAfter.completed === 2 && !settledAfter.pending,
    "recovery waits for a prior real vault write before snapshot ownership and succeeds only with requested/completed revisions equal at the latest ceiling"
  );
}

async function testAtomicIndexedDbRecoverySnapshot() {
  const harness = makeHarness({ idbSeed: {} });
  await harness.ready();
  await new Promise(resolve => setTimeout(resolve, 20));
  const keys = harness.eval("recoveryPersistenceKeys()");
  keys.forEach(key => harness.fakeIdb.values.set(key, { generation: "before", key }));
  const beforeTransactions = harness.fakeIdb.transactions.length;
  const beforeCloses = harness.fakeIdb.closeCount;
  let interleaved = false;
  harness.fakeIdb.afterRead = (_key, api) => {
    if (interleaved) return;
    interleaved = true;
    keys.forEach(key => api.values.set(key, { generation: "after", key }));
  };
  const snapshot = await harness.eval("readIndexedDbSnapshot(recoveryPersistenceKeys())");
  harness.fakeIdb.afterRead = null;
  const generations = new Set(Array.from(snapshot.values(), value => value?.generation));
  const transactionCount = harness.fakeIdb.transactions.length - beforeTransactions;
  const successfulCloseCount = harness.fakeIdb.closeCount - beforeCloses;
  const beforeFailedClose = harness.fakeIdb.closeCount;
  harness.fakeIdb.failNextReadonlyTransaction = true;
  let rejected = false;
  try {
    await harness.eval("readIndexedDbSnapshot(recoveryPersistenceKeys())");
  } catch (error) {
    rejected = true;
  }
  const failedCloseCount = harness.fakeIdb.closeCount - beforeFailedClose;
  assert(
    transactionCount === 1 && generations.size === 1 && successfulCloseCount === 1 && rejected && failedCloseCount === 1,
    `one readonly IndexedDB transaction supplies a coherent snapshot and settles success/error/abort once while closing the database exactly once [transactions=${transactionCount}, generations=${generations.size}, successCloses=${successfulCloseCount}, rejected=${rejected}, failedCloses=${failedCloseCount}]`
  );
}

async function testDeviceVaultTransitionsOwnUndoBoundary() {
  const enable = makeHarness({
    local: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: emptyData({ people: [{ id: "enable_boundary", name: "Enable Boundary" }] })
    },
    idbSeed: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: emptyData({ people: [{ id: "enable_boundary", name: "Enable Boundary" }] })
    }
  });
  await enable.ready();
  enable.sandbox.__encryptHook = async () => ({ kind: "test", version: 1, encryptedAt: "vault-enabled" });
  enable.eval(`
    encryptPayload = payload => globalThis.__encryptHook(payload);
    undoStack = [{ label: "before vault setup", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    view.sheet = { type: "security", kind: "vault-enable" };
  `);
  enable.eval(`
    document.getElementById("sheet-vault-passphrase").value = "synthetic-passphrase";
    document.getElementById("sheet-vault-confirm").value = "synthetic-passphrase";
    document.getElementById("sheet-vault-hint").value = "synthetic hint";
  `);
  await enable.eval(`submitSecuritySheet("vault-enable")`);
  await new Promise(resolve => setTimeout(resolve, 20));
  const enabled = enable.eval(`({ enabled: settings.localEncryptionEnabled, undoCount: undoStack.length, sheet: view.sheet })`);
  const enabledDurable = Boolean(enable.storage[KEYS.encrypted])
    && !enable.storage[KEYS.data]
    && !enable.storage[KEYS.autosave]
    && enable.fakeIdb.values.has(KEYS.encrypted)
    && !enable.fakeIdb.values.has(KEYS.data);

  const failedEnable = makeHarness({
    local: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: emptyData({ people: [{ id: "failed_enable", name: "Failed Enable" }] })
    }
  });
  await failedEnable.ready();
  failedEnable.sandbox.__encryptHook = async () => { throw new Error("synthetic vault setup failure"); };
  failedEnable.eval(`
    encryptPayload = payload => globalThis.__encryptHook(payload);
    undoStack = [{ label: "preserve failed setup", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    view.sheet = { type: "security", kind: "vault-enable" };
    __undoBeforeFailedEnable = JSON.stringify(undoStack);
  `);
  failedEnable.eval(`
    document.getElementById("sheet-vault-passphrase").value = "synthetic-passphrase";
    document.getElementById("sheet-vault-confirm").value = "synthetic-passphrase";
  `);
  await failedEnable.eval(`submitSecuritySheet("vault-enable")`);
  const failedEnabled = failedEnable.eval(`({ enabled: settings.localEncryptionEnabled, undoSame: JSON.stringify(undoStack) === __undoBeforeFailedEnable, sheetOpen: Boolean(view.sheet) })`);

  enable.eval(`
    undoStack = [{ label: "before vault removal", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    view.sheet = { type: "security", kind: "vault-disable" };
  `);
  enable.eval(`document.getElementById("sheet-vault-disable-confirm").checked = true`);
  await enable.eval(`submitSecuritySheet("vault-disable")`);
  await new Promise(resolve => setTimeout(resolve, 20));
  const disabled = enable.eval(`({ enabled: settings.localEncryptionEnabled, undoCount: undoStack.length, sheet: view.sheet })`);
  const disabledDurable = Boolean(enable.storage[KEYS.data])
    && !enable.storage[KEYS.encrypted]
    && enable.fakeIdb.values.has(KEYS.data)
    && !enable.fakeIdb.values.has(KEYS.encrypted);

  const failedDisable = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true }, [KEYS.encrypted]: { kind: "sentinel", version: 1 } },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true }, [KEYS.encrypted]: { kind: "sentinel", version: 1 } }
  });
  await failedDisable.ready();
  failedDisable.eval(`
    view.encryptionLocked = false;
    vaultPassphrase = "synthetic-passphrase";
    db = normalizeData({ ...emptyData(), people: [{ id: "failed_disable", name: "Failed Disable" }] });
    autosaveDraftsCache = { "capture:main": { fields: { "quick-text": "Encrypted draft" } } };
    memoryVaultCache = emptyAutoMemoryVault();
    undoStack = [{ label: "preserve failed removal", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    view.sheet = { type: "security", kind: "vault-disable" };
    __undoBeforeFailedDisable = JSON.stringify(undoStack);
    __disableStorageSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === COPY_KEY) throw new Error("synthetic plaintext failure");
      return __disableStorageSet.call(localStorage, key, value);
    };
  `);
  failedDisable.eval(`document.getElementById("sheet-vault-disable-confirm").checked = true`);
  await failedDisable.eval(`submitSecuritySheet("vault-disable")`);
  failedDisable.eval(`localStorage.setItem = __disableStorageSet`);
  const failedDisabled = failedDisable.eval(`({ enabled: settings.localEncryptionEnabled, undoSame: JSON.stringify(undoStack) === __undoBeforeFailedDisable, sheetOpen: Boolean(view.sheet) })`);
  const failedDisableDurable = Boolean(failedDisable.storage[KEYS.encrypted]) && !failedDisable.storage[KEYS.data] && !failedDisable.storage[KEYS.copy];

  assert(
    enabled.enabled && enabled.undoCount === 0 && enabled.sheet === null && enabledDurable
      && !failedEnabled.enabled && failedEnabled.undoSame && failedEnabled.sheetOpen && !failedEnable.storage[KEYS.encrypted]
      && !disabled.enabled && disabled.undoCount === 0 && disabled.sheet === null && disabledDurable
      && failedDisabled.enabled && failedDisabled.undoSame && failedDisabled.sheetOpen && failedDisableDurable,
    "Device Vault setup/removal clear generic Undo only after success, while both failed transitions preserve Undo and their exact secure persistence boundary"
  );
}

async function testRecovery18RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["real lifecycle overlap", testRealLifecycleOverlapOwnsStableRecoveryCeiling],
    ["atomic IndexedDB snapshot", testAtomicIndexedDbRecoverySnapshot],
    ["Device Vault transition boundary", testDeviceVaultTransitionsOwnUndoBoundary]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-18 contracts failed:\n${failures.join("\n")}`);
}

async function testDeferredBackendQuickGrabCannotCrossRecovery() {
  const during = makeHarness({
    local: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
      [KEYS.data]: emptyData()
    }
  });
  await during.ready();
  const fetchStarted = deferred();
  const fetchResponse = deferred();
  const jsonStarted = deferred();
  const jsonResponse = deferred();
  const encryptStarted = deferred();
  const encryptRelease = deferred();
  during.sandbox.fetch = () => {
    fetchStarted.resolve();
    return fetchResponse.promise;
  };
  during.sandbox.__encryptHook = async payload => {
    encryptStarted.resolve();
    await encryptRelease.promise;
    return { kind: "test", version: 1, snapshotName: payload.data.people[0]?.name || "", encryptedAt: "backend-owned" };
  };
  const duringIds = during.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true, quickGrabAiMode: "backendQuickGrab", aiMockMode: true });
    vaultPassphrase = "synthetic-backend-passphrase";
    encryptPayload = payload => globalThis.__encryptHook(payload);
    const person = createPerson("Undo target person");
    const grab = makeQuickGrab("Deferred backend recovery", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    recordUndo("owned backend target");
    person.name = "Current person";
    vaultSaveRequestedRevision = 0;
    vaultSaveCompletedRevision = 0;
    return { grabId: grab.id };
  })()`);
  const backendPromise = during.eval(`createQuickGrabBackendAiProposal("${duringIds.grabId}")`);
  await fetchStarted.promise;
  fetchResponse.resolve({
    ok: true,
    json() {
      jsonStarted.resolve();
      return jsonResponse.promise;
    }
  });
  await jsonStarted.promise;
  const undoPromise = during.eval("undoLast()");
  await encryptStarted.promise;
  jsonResponse.resolve({
    ok: true,
    mode: "mock",
    route: "/api/ai/quick-grab",
    proposal: { title: "Deferred backend proposal", summary: "Must not cross recovery", confidence: "high", proposedActions: [] }
  });
  await backendPromise;
  const whilePending = during.eval(`({ pending: recoveryTransactionPending, undoLabels: undoStack.map(item => item.label), proposals: db.aiProposals.length, state: db.quickGrabs[0]?.processingState })`);
  encryptRelease.resolve();
  const undoResult = await undoPromise;
  const duringAfter = during.eval(`({
    name: db.people[0]?.name,
    proposals: db.aiProposals.length,
    state: db.quickGrabs[0]?.processingState,
    undoLabels: undoStack.map(item => item.label),
    requested: vaultSaveRequestedRevision,
    completed: vaultSaveCompletedRevision,
    toast: document.getElementById("toast").textContent
  })`);
  assert(
    whilePending.pending
      && !whilePending.undoLabels.includes("backend Quick Grab AI proposal")
      && whilePending.proposals === 0
      && undoResult === true
      && duringAfter.name === "Undo target person"
      && duringAfter.proposals === 0
      && duringAfter.state === "awaitingApproval"
      && duringAfter.undoLabels.length === 0
      && duringAfter.requested === duringAfter.completed,
    "deferred real Backend Quick Grab fetch/JSON success cannot add an Undo entry, proposal, processing drift, or revision inside encrypted recovery"
  );

  async function runLateBackend({ fallback }) {
    const harness = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
    await harness.ready();
    const started = deferred();
    const response = deferred();
    harness.sandbox.fetch = () => {
      started.resolve();
      return response.promise;
    };
    const grabId = harness.eval(`(() => {
      settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, quickGrabAiMode: "backendQuickGrab", aiMockMode: ${fallback} });
      const person = createPerson("Late continuation target");
      const grab = makeQuickGrab("Late backend continuation", [], "Whenever", null, { captureSource: "main" });
      grab.processingState = "awaitingApproval";
      db.quickGrabs = [grab];
      recordUndo("late backend owned target");
      person.name = "Late continuation current";
      return grab.id;
    })()`);
    const backend = harness.eval(`createQuickGrabBackendAiProposal("${grabId}")`);
    await started.promise;
    const undone = await harness.eval("undoLast()");
    const stable = harness.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);
    if (fallback) response.reject(new Error("synthetic late backend failure"));
    else response.resolve({ ok: true, json: async () => ({ ok: true, mode: "mock", route: "/api/ai/quick-grab", proposal: { title: "Late proposal", summary: "Must be discarded", confidence: "high", proposedActions: [] } }) });
    await backend;
    const after = harness.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);
    return { undone, stable, after };
  }

  const lateSuccess = await runLateBackend({ fallback: false });
  const lateFallback = await runLateBackend({ fallback: true });
  assert(
    lateSuccess.undone && JSON.stringify(lateSuccess.after) === JSON.stringify(lateSuccess.stable)
      && lateFallback.undone && JSON.stringify(lateFallback.after) === JSON.stringify(lateFallback.stable),
    "Backend Quick Grab success and mock-fallback continuations resolving after recovery are epoch-discarded without state, view, Undo, toast, or render drift"
  );
}

async function testStaleBackupReadCannotStartSecondRecovery() {
  const harness = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await harness.ready();
  const readerStarted = deferred();
  class DeferredReader {
    readAsText() {
      harness.sandbox.__backupReader = this;
      readerStarted.resolve();
    }
  }
  harness.sandbox.FileReader = DeferredReader;
  const payload = harness.eval(`(() => {
    const value = cloneJson(currentPortablePayload());
    value.data.people = [{ id: "stale_import_person", name: "Stale import must not apply" }];
    value.settings = { ...value.settings, enableUndo: true, autoMemoryVaultEnabled: false };
    return JSON.stringify(value);
  })()`);
  harness.eval(`
    db.people = [{ id: "stale_current", name: "Before stale import" }];
    recordUndo("stale import owned target");
    db.people[0].name = "Current before Undo";
    document.getElementById("sheet-import-backup-file").files = [{ size: 100, type: "application/json" }];
    document.getElementById("sheet-import-confirm").checked = true;
  `);
  const importPromise = harness.eval(`submitDataSafetySheet("import")`);
  await readerStarted.promise;
  const undoResult = await harness.eval("undoLast()");
  const stable = harness.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);
  harness.sandbox.__backupReader.onload({ target: { result: payload } });
  await importPromise;
  const after = harness.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);
  assert(undoResult === true && JSON.stringify(after) === JSON.stringify(stable), "a stale real backup FileReader continuation cannot start a second restore after another recovery completes");
}

async function testOrderedPlaintextPersistenceAndFailureLedger() {
  const ordered = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
  });
  await ordered.ready();
  await nextTurn();
  const baselineTransactions = ordered.fakeIdb.transactions.length;
  const baselineOpens = ordered.fakeIdb.openCalls;
  const firstGate = ordered.fakeIdb.gateNextTransaction();
  ordered.eval(`db.people = [{ id: "ordered", name: "Older mirror" }]; saveData();`);
  await firstGate.started.promise;
  ordered.eval(`db.people[0].name = "Newer mirror"; saveData();`);
  await nextTurn();
  const openedBeforeRelease = ordered.fakeIdb.openCalls - baselineOpens;
  firstGate.resolve();
  await ordered.eval("drainIndexedDbCoordinator()");
  const finalMirrorName = ordered.fakeIdb.values.get(KEYS.data)?.people?.[0]?.name;
  const orderedSafe = openedBeforeRelease === 1 && finalMirrorName === "Newer mirror";

  const queuedSnapshots = makeHarness({ idbSeed: {} });
  await queuedSnapshots.ready();
  const snapshotGate = queuedSnapshots.fakeIdb.gateNextTransaction();
  const gateWrite = queuedSnapshots.eval(`idbTransaction("readwrite", COPY_KEY, { gate: true })`);
  await snapshotGate.started.promise;
  queuedSnapshots.eval(`__batchValue = { marker: "batch-at-enqueue" }; __batchPromise = writeIndexedDbBatch([[STORAGE_KEY, __batchValue]]); __batchValue.marker = "batch-mutated-late";`);
  snapshotGate.resolve();
  await Promise.all([gateWrite, queuedSnapshots.eval("__batchPromise")]);
  await queuedSnapshots.eval("drainIndexedDbCoordinator()");
  const batchSnapshotSafe = queuedSnapshots.fakeIdb.values.get(KEYS.data)?.marker === "batch-at-enqueue";

  const queuedCommit = makeHarness({ idbSeed: {} });
  await queuedCommit.ready();
  const commitGate = queuedCommit.fakeIdb.gateNextTransaction();
  const commitGateWrite = queuedCommit.eval(`idbTransaction("readwrite", COPY_KEY, { gate: true })`);
  await commitGate.started.promise;
  queuedCommit.eval(`
    __queuedEnvelope = { kind: "envelope-at-enqueue" };
    __queuedSettings = { localEncryptionEnabled: true, marker: "settings-at-enqueue" };
    __commitPromise = commitEncryptedVaultToIndexedDb(__queuedEnvelope, __queuedSettings);
    __queuedEnvelope.kind = "envelope-mutated-late";
    __queuedSettings.marker = "settings-mutated-late";
  `);
  commitGate.resolve();
  await Promise.all([commitGateWrite, queuedCommit.eval("__commitPromise")]);
  await queuedCommit.eval("drainIndexedDbCoordinator()");
  const commitSnapshotSafe = queuedCommit.fakeIdb.values.get(KEYS.encrypted)?.kind === "envelope-at-enqueue"
    && queuedCommit.fakeIdb.values.get(KEYS.settings)?.marker === "settings-at-enqueue";

  const queued = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, enableAutoSave: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, enableAutoSave: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
  });
  await queued.ready();
  await nextTurn();
  queued.eval(`
    db.people = [{ id: "queued", name: "Queued current" }];
    undoStack = [{ id: "queued-target", label: "queued target", db: normalizeData({ ...emptyData(), people: [{ id: "queued", name: "Queued target" }] }), settings: cloneJson(settings), customCopy: {} }];
  `);
  const queuedBaseline = queued.fakeIdb.transactions.length;
  const queuedOpenBaseline = queued.fakeIdb.openCalls;
  const queuedGate = queued.fakeIdb.gateNextTransaction();
  queued.eval(`saveAutosaveDrafts({ "capture:main": { fields: { "quick-text": "queued draft" } } })`);
  await queuedGate.started.promise;
  let queuedUndoDone = false;
  const queuedUndo = queued.eval("undoLast()").then(result => {
    queuedUndoDone = true;
    return result;
  });
  await nextTurn();
  const queuedTransactionsBeforeRelease = queued.fakeIdb.openCalls - queuedOpenBaseline;
  const queuedCompletedBeforeRelease = queuedUndoDone;
  queuedGate.resolve();
  const queuedResult = await queuedUndo;
  const queuedSafe = !queuedCompletedBeforeRelease && queuedTransactionsBeforeRelease === 1 && queuedResult === true;

  const failed = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
  });
  await failed.ready();
  await nextTurn();
  failed.eval(`
    db.people = [{ id: "failed-mirror", name: "Current after failed mirror" }];
    undoStack = [{ id: "failed-target", label: "failed mirror target", db: normalizeData({ ...emptyData(), people: [{ id: "failed-mirror", name: "Must remain retryable" }] }), settings: cloneJson(settings), customCopy: {} }];
  `);
  failed.fakeIdb.failNextTransaction = true;
  const failedBefore = failed.fakeIdb.transactions.length;
  failed.eval("saveData()");
  await failed.fakeIdb.waitForTransactions(failedBefore + 1);
  await failed.fakeIdb.waitForIdle();
  const failedUndo = await failed.eval("undoLast()");
  const failedState = failed.eval(`({ name: db.people[0]?.name, undo: undoStack.map(item => item.label), failedKeys: indexedDbFailedKeys.size, toast: document.getElementById("toast").textContent })`);
  const failedSafe = failedUndo === true && failedState.name === "Must remain retryable" && failedState.undo.length === 0 && failedState.failedKeys === 0 && failedState.toast.startsWith("Undid");

  const late = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
  });
  await late.ready();
  await nextTurn();
  late.eval(`
    db.people = [{ id: "late", name: "Queued late state" }];
    undoStack = [{ id: "late-target", label: "late target", db: normalizeData({ ...emptyData(), people: [{ id: "late", name: "Undo target" }] }), settings: cloneJson(settings), customCopy: {} }];
  `);
  const lateGate = late.fakeIdb.gateNextTransaction();
  late.eval("saveData()");
  await lateGate.started.promise;
  late.eval(`
    __lateSet = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) throw new Error("synthetic rollback boundary");
      return __lateSet.call(localStorage, key, value);
    };
  `);
  let lateDone = false;
  const lateUndoPromise = late.eval("undoLast()").then(result => {
    lateDone = true;
    return result;
  });
  await nextTurn();
  const crossedBeforeRelease = lateDone;
  lateGate.resolve();
  const lateResult = await lateUndoPromise;
  late.eval("localStorage.setItem = __lateSet");
  const lateMemory = late.eval("db.people[0]?.name");
  const lateIdb = late.fakeIdb.values.get(KEYS.data)?.people?.[0]?.name;
  const lateSafe = !crossedBeforeRelease && lateResult === false && lateMemory === "Queued late state" && lateIdb === "Queued late state";
  assert(
    orderedSafe && batchSnapshotSafe && commitSnapshotSafe && queuedSafe && failedSafe && lateSafe,
    `FIFO persistence owns same-key order, immutable queued batches/commits, queued autosave snapshots, canonical failed-mirror retry, and rollback tails [ordered=${orderedSafe}, final=${finalMirrorName}, batch=${batchSnapshotSafe}, commit=${commitSnapshotSafe}, queued=${queuedSafe}, failed=${failedSafe}, late=${lateSafe}, opens=${openedBeforeRelease}, queuedOpens=${queuedTransactionsBeforeRelease}]`
  );
}

async function testUndoIdentityCollisionFailsClosed() {
  const harness = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await harness.ready();
  const durabilityEntered = deferred();
  const durabilityRelease = deferred();
  harness.sandbox.__confirmHook = async required => {
    durabilityEntered.resolve(required);
    await durabilityRelease.promise;
    harness.eval(`vaultSaveCompletedRevision = ${Number.isFinite(Number(required)) ? Number(required) : 1}`);
    return true;
  };
  harness.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true });
    vaultPassphrase = "synthetic-identity-passphrase";
    db.people = [{ id: "identity", name: "Current identity state" }];
    undoStack = [{ id: "owned-target-id", label: "owned identity target", db: normalizeData({ ...emptyData(), people: [{ id: "identity", name: "Identity target" }] }), settings: cloneJson(settings), customCopy: {} }];
    vaultSaveRequestedRevision = 10;
    vaultSaveCompletedRevision = 10;
    scheduleVaultSave = () => { vaultSaveRequestedRevision += 1; return true; };
    confirmCareVaultRevision = required => globalThis.__confirmHook(required);
  `);
  const pending = harness.eval("undoLast()");
  await durabilityEntered.promise;
  harness.eval(`undoStack.unshift({ id: "intruder-id", label: "intruder", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} })`);
  durabilityRelease.resolve();
  const result = await pending;
  const after = harness.eval(`({ name: db.people[0]?.name, ids: undoStack.map(item => item.id), labels: undoStack.map(item => item.label), toast: document.getElementById("toast").textContent })`);
  assert(result === false && after.name === "Current identity state" && after.ids.length === 1 && after.ids[0] === "owned-target-id" && !after.toast.startsWith("Undid"), "Undo target identity/generation collision rolls back exact bytes instead of shifting a different entry or announcing success");
}

async function testRecoveryEpochInvalidatesDiscardableContinuations() {
  async function performUndo(harness, label) {
    harness.eval(`
      settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false });
      db.people = [{ id: "epoch", name: "${label} target" }];
      recordUndo("${label} epoch target");
      db.people[0].name = "${label} current";
    `);
    return harness.eval("undoLast()");
  }

  const photo = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await photo.ready();
  const photoGate = deferred();
  photo.sandbox.__photoGate = photoGate;
  photo.eval(`
    db.people = [{ id: "photo-person", name: "Photo person", photoDataUrl: "", updatedAt: "before" }];
    resizeProfilePhoto = () => globalThis.__photoGate.promise;
    __photoInput = { dataset: { personId: "photo-person" }, files: [{ type: "image/jpeg", size: 100 }] };
  `);
  const photoPending = photo.eval("handleProfilePhotoUpload(__photoInput)");
  await performUndo(photo, "photo");
  const photoStable = photo.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), toast: document.getElementById("toast").textContent })`);
  photoGate.resolve("data:image/jpeg;base64,late");
  await photoPending;
  const photoAfter = photo.eval(`({ db: JSON.stringify(db), undo: JSON.stringify(undoStack), toast: document.getElementById("toast").textContent })`);

  const dictation = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await dictation.ready();
  dictation.elements["quick-text"].tagName = "TEXTAREA";
  dictation.elements["quick-text"].value = "stable dictation";
  dictation.elements["quick-text"].isConnected = true;
  dictation.sandbox.window.SpeechRecognition = function Recognition() {
    dictation.sandbox.__recognition = this;
    this.start = () => {};
    this.abort = () => {};
  };
  dictation.eval(`
    settings = normalizeSettings({
      ...settings,
      enableVoiceCapture: true,
      voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION
    });
    view.screen = "quick";
    view.quickGrabDraftText = "stable dictation";
    __dictationAutosaveCalls = 0;
    scheduleAutosave = () => { __dictationAutosaveCalls += 1; return true; };
    beginConfirmedDictation("quick-text", dictationCaptureContext("quick-text"));
  `);
  dictation.sandbox.__recognition.onresult({ results: [Object.assign([{ transcript: "late spoken words" }], { isFinal: true })] });
  await performUndo(dictation, "dictation");
  const dictationStable = dictation.eval(`JSON.stringify({
    value: document.getElementById("quick-text").value,
    viewDraft: view.quickGrabDraftText,
    autosaveCalls: __dictationAutosaveCalls,
    localDrafts: localStorage.getItem(AUTOSAVE_KEY),
    db,
    undoStack
  })`);
  dictation.sandbox.__recognition.onresult?.({ results: [Object.assign([{ transcript: "later spoken words" }], { isFinal: true })] });
  dictation.sandbox.__recognition.onerror?.({ error: "synthetic-private-error" });
  dictation.sandbox.__recognition.onend?.();
  const dictationAfter = dictation.eval(`JSON.stringify({
    value: document.getElementById("quick-text").value,
    viewDraft: view.quickGrabDraftText,
    autosaveCalls: __dictationAutosaveCalls,
    localDrafts: localStorage.getItem(AUTOSAVE_KEY),
    db,
    undoStack
  })`);

  const notification = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await notification.ready();
  const permissionGate = deferred();
  notification.sandbox.Notification = { permission: "default", requestPermission: () => permissionGate.promise };
  notification.sandbox.window.Notification = notification.sandbox.Notification;
  const notificationPending = notification.eval("requestNotifications()");
  await performUndo(notification, "notification");
  const notificationStable = notification.eval(`({ enabled: settings.notificationsEnabled, toast: document.getElementById("toast").textContent })`);
  permissionGate.resolve("granted");
  await notificationPending;
  const notificationAfter = notification.eval(`({ enabled: settings.notificationsEnabled, toast: document.getElementById("toast").textContent })`);

  const protectedGenerations = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await protectedGenerations.ready();
  const firstGenerationGate = deferred();
  const secondGenerationGate = deferred();
  protectedGenerations.sandbox.__firstGenerationGate = firstGenerationGate;
  protectedGenerations.sandbox.__secondGenerationGate = secondGenerationGate;
  protectedGenerations.eval(`
    __protectedGenerationCalls = 0;
    __protectedGenerationDownloads = 0;
    encryptPayload = () => {
      __protectedGenerationCalls += 1;
      return __protectedGenerationCalls === 1 ? globalThis.__firstGenerationGate.promise : globalThis.__secondGenerationGate.promise;
    };
    downloadJson = () => { __protectedGenerationDownloads += 1; return true; };
    openDataSafetySheet("encrypted-export");
    document.getElementById("sheet-export-passphrase").value = "first-generation-passphrase";
    document.getElementById("sheet-export-confirm").value = "first-generation-passphrase";
  `);
  const firstGenerationPending = protectedGenerations.eval(`submitDataSafetySheet("encrypted-export")`);
  const firstOwnerId = protectedGenerations.eval("activeProtectedBackupExport.id");
  await performUndo(protectedGenerations, "protected export");
  const afterRecoveryBeforeFirstSettlement = protectedGenerations.eval(`({
    activeOwnerId: activeProtectedBackupExport?.id || "",
    sheetOwnerId: view.sheet?.backupExportOwnerId || "",
    sheetBusy: renderDataSafetySheet(view.sheet || { kind: "encrypted-export" }).includes('aria-busy="true"'),
    recoveryPending: recoveryTransactionPending,
    db: JSON.stringify(db),
    settings: JSON.stringify(settings),
    undo: JSON.stringify(undoStack),
    autoMemory: JSON.stringify(loadAutoMemoryVault()),
    downloads: __protectedGenerationDownloads,
    toast: document.getElementById("toast").textContent,
    recoveryEpoch,
    vaultSaveRequestedRevision,
    vaultSaveCompletedRevision,
    vaultPayloadGeneration
  })`);
  afterRecoveryBeforeFirstSettlement.storage = JSON.stringify(protectedGenerations.storage);
  const secondSheetOpened = protectedGenerations.eval(`
    openDataSafetySheet("encrypted-export");
    document.getElementById("sheet-export-passphrase").value = "second-generation-passphrase";
    document.getElementById("sheet-export-confirm").value = "second-generation-passphrase";
    view.sheet?.kind === "encrypted-export";
  `);
  const secondGenerationPending = protectedGenerations.eval(`submitDataSafetySheet("encrypted-export")`);
  const secondOwnerId = protectedGenerations.eval("activeProtectedBackupExport?.id || ''");
  const beforeStaleGenerationSettlement = protectedGenerations.eval(`({
    activeOwnerId: activeProtectedBackupExport?.id || "",
    sheetOwnerId: view.sheet?.backupExportOwnerId || "",
    db: JSON.stringify(db),
    settings: JSON.stringify(settings),
    undo: JSON.stringify(undoStack),
    view: JSON.stringify(view),
    autoMemory: JSON.stringify(loadAutoMemoryVault()),
    downloads: __protectedGenerationDownloads,
    toast: document.getElementById("toast").textContent,
    recoveryPending: recoveryTransactionPending,
    recoveryEpoch,
    vaultSaveRequestedRevision,
    vaultSaveCompletedRevision,
    vaultPayloadGeneration
  })`);
  beforeStaleGenerationSettlement.storage = JSON.stringify(protectedGenerations.storage);
  firstGenerationGate.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "stale" });
  const firstGenerationResult = await firstGenerationPending;
  const afterStaleGenerationSettlement = protectedGenerations.eval(`({
    activeOwnerId: activeProtectedBackupExport?.id || "",
    sheetOwnerId: view.sheet?.backupExportOwnerId || "",
    db: JSON.stringify(db),
    settings: JSON.stringify(settings),
    undo: JSON.stringify(undoStack),
    view: JSON.stringify(view),
    autoMemory: JSON.stringify(loadAutoMemoryVault()),
    downloads: __protectedGenerationDownloads,
    toast: document.getElementById("toast").textContent,
    recoveryPending: recoveryTransactionPending,
    recoveryEpoch,
    vaultSaveRequestedRevision,
    vaultSaveCompletedRevision,
    vaultPayloadGeneration
  })`);
  afterStaleGenerationSettlement.storage = JSON.stringify(protectedGenerations.storage);
  secondGenerationGate.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "current" });
  const secondGenerationResult = await secondGenerationPending;
  const afterCurrentGeneration = protectedGenerations.eval(`({
    active: Boolean(activeProtectedBackupExport),
    sheet: view.sheet,
    downloads: __protectedGenerationDownloads,
    lastBackupAt: settings.lastBackupAt,
    toast: document.getElementById("toast").textContent
  })`);
  const protectedGenerationSafe = firstOwnerId
    && afterRecoveryBeforeFirstSettlement.activeOwnerId === ""
    && afterRecoveryBeforeFirstSettlement.sheetOwnerId === ""
    && !afterRecoveryBeforeFirstSettlement.sheetBusy
    && !afterRecoveryBeforeFirstSettlement.recoveryPending
    && afterRecoveryBeforeFirstSettlement.downloads === 0
    && secondSheetOpened
    && secondOwnerId
    && firstOwnerId !== secondOwnerId
    && firstGenerationResult === false
    && JSON.stringify(afterStaleGenerationSettlement) === JSON.stringify(beforeStaleGenerationSettlement)
    && secondGenerationResult === true
    && !afterCurrentGeneration.active
    && afterCurrentGeneration.sheet === null
    && afterCurrentGeneration.downloads === 1
    && Boolean(afterCurrentGeneration.lastBackupAt)
    && afterCurrentGeneration.toast === "Backup download started. Confirm the file appears in Files.";

  async function exerciseProtectedExportInvalidation(kind) {
    const harness = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
    await harness.ready();
    const staleGate = deferred();
    const retryGate = deferred();
    harness.sandbox.__staleExportGate = staleGate;
    harness.sandbox.__retryExportGate = retryGate;
    harness.eval(`
      __invalidationEncryptions = 0;
      __invalidationDownloads = 0;
      __invalidationRenderFlags = [];
      __invalidationDraftSaves = 0;
      const __originalInvalidationRender = render;
      render = options => {
        __invalidationRenderFlags.push(options?.mutationEffects);
        return __originalInvalidationRender(options);
      };
      saveCurrentDraftNow = () => { __invalidationDraftSaves += 1; return true; };
      encryptPayload = () => {
        __invalidationEncryptions += 1;
        return __invalidationEncryptions === 1 ? globalThis.__staleExportGate.promise : globalThis.__retryExportGate.promise;
      };
      downloadJson = () => { __invalidationDownloads += 1; return true; };
      openDataSafetySheet("encrypted-export");
      document.getElementById("sheet-export-passphrase").value = "invalidation-passphrase";
      document.getElementById("sheet-export-confirm").value = "invalidation-passphrase";
    `);
    const stalePending = harness.eval(`submitDataSafetySheet("encrypted-export")`);
    const staleOwnerId = harness.eval("activeProtectedBackupExport.id");
    const stateBeforeInvalidation = harness.eval(`JSON.stringify({
      db,
      settings,
      undoStack,
      autoMemory: loadAutoMemoryVault(),
      recoveryEpoch,
      vaultSaveRequestedRevision,
      vaultSaveCompletedRevision,
      vaultPayloadGeneration
    })`);
    const storageBeforeInvalidation = JSON.stringify(harness.storage);
    const invalidationResult = kind === "nav"
      ? harness.eval(`handleAction({ currentTarget: { dataset: { action: "nav", screen: "today" } } })`)
      : harness.eval(`closeSheet({ force: true })`);
    const afterInvalidation = harness.eval(`({
      activeOwnerId: activeProtectedBackupExport?.id || "",
      sheet: view.sheet,
      screen: view.screen,
      downloads: __invalidationDownloads,
      encryptions: __invalidationEncryptions,
      draftSaves: __invalidationDraftSaves,
      lastRenderMutationEffects: __invalidationRenderFlags.at(-1),
      state: JSON.stringify({
        db,
        settings,
        undoStack,
        autoMemory: loadAutoMemoryVault(),
        recoveryEpoch,
        vaultSaveRequestedRevision,
        vaultSaveCompletedRevision,
        vaultPayloadGeneration
      })
    })`);
    const storageAfterInvalidation = JSON.stringify(harness.storage);
    harness.eval(`
      openDataSafetySheet("encrypted-export");
      document.getElementById("sheet-export-passphrase").value = "retry-passphrase";
      document.getElementById("sheet-export-confirm").value = "retry-passphrase";
    `);
    const retryPending = harness.eval(`submitDataSafetySheet("encrypted-export")`);
    const retryOwnerId = harness.eval("activeProtectedBackupExport?.id || ''");
    staleGate.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "stale" });
    const staleResult = await stalePending;
    const afterStale = harness.eval(`({
      activeOwnerId: activeProtectedBackupExport?.id || "",
      sheetOwnerId: view.sheet?.backupExportOwnerId || "",
      downloads: __invalidationDownloads,
      lastBackupAt: settings.lastBackupAt,
      toast: document.getElementById("toast").textContent
    })`);
    retryGate.resolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "retry" });
    const retryResult = await retryPending;
    const afterRetry = harness.eval(`({
      active: Boolean(activeProtectedBackupExport),
      sheet: view.sheet,
      downloads: __invalidationDownloads,
      lastBackupAt: settings.lastBackupAt,
      toast: document.getElementById("toast").textContent
    })`);
    return {
      kind,
      invalidationResult,
      staleOwnerId,
      retryOwnerId,
      stateEquivalent: afterInvalidation.state === stateBeforeInvalidation && storageAfterInvalidation === storageBeforeInvalidation,
      afterInvalidation,
      staleResult,
      afterStale,
      retryResult,
      afterRetry
    };
  }

  const navInvalidation = await exerciseProtectedExportInvalidation("nav");
  const forcedCloseInvalidation = await exerciseProtectedExportInvalidation("force-close");
  const protectedExportInvalidationSafe = result => result.staleOwnerId
    && result.retryOwnerId
    && result.staleOwnerId !== result.retryOwnerId
    && result.stateEquivalent
    && result.afterInvalidation.activeOwnerId === ""
    && result.afterInvalidation.sheet === null
    && result.afterInvalidation.downloads === 0
    && result.afterInvalidation.encryptions === 1
    && result.afterInvalidation.draftSaves === 0
    && result.afterInvalidation.lastRenderMutationEffects === false
    && (result.kind !== "nav" || result.afterInvalidation.screen === "today")
    && result.staleResult === false
    && result.afterStale.activeOwnerId === result.retryOwnerId
    && result.afterStale.sheetOwnerId === result.retryOwnerId
    && result.afterStale.downloads === 0
    && result.afterStale.lastBackupAt === ""
    && result.retryResult === true
    && !result.afterRetry.active
    && result.afterRetry.sheet === null
    && result.afterRetry.downloads === 1
    && Boolean(result.afterRetry.lastBackupAt)
    && result.afterRetry.toast === "Backup download started. Confirm the file appears in Files.";
  const navInvalidationSafe = protectedExportInvalidationSafe(navInvalidation);
  const forcedCloseInvalidationSafe = protectedExportInvalidationSafe(forcedCloseInvalidation);

  const sheetlessExport = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await sheetlessExport.ready();
  sheetlessExport.eval(`
    __sheetlessDownloads = 0;
    encryptPayload = async () => ({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "sheetless" });
    downloadJson = () => { __sheetlessDownloads += 1; return true; };
  `);
  const sheetlessResult = await sheetlessExport.eval(`exportEncryptedJsonWithPassphrase("sheetless-export-passphrase")`);
  const sheetlessAfter = sheetlessExport.eval(`({
    active: Boolean(activeProtectedBackupExport),
    sheet: view.sheet,
    downloads: __sheetlessDownloads,
    lastBackupAt: settings.lastBackupAt,
    toast: document.getElementById("toast").textContent
  })`);
  const sheetlessSafe = sheetlessResult === true
    && !sheetlessAfter.active
    && sheetlessAfter.sheet === null
    && sheetlessAfter.downloads === 1
    && Boolean(sheetlessAfter.lastBackupAt)
    && sheetlessAfter.toast === "Backup download started. Confirm the file appears in Files.";

  const update = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await update.ready();
  const updateGate = deferred();
  update.sandbox.__updateGate = updateGate;
  update.eval(`serviceWorkerRegistration = { update: () => globalThis.__updateGate.promise }; updateAvailable = false; checkForAppUpdate()`);
  await performUndo(update, "update");
  const updateStable = update.eval(`({ view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);
  updateGate.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const updateAfter = update.eval(`({ view: JSON.stringify(view), toast: document.getElementById("toast").textContent })`);

  const epochResults = {
    photo: JSON.stringify(photoAfter) === JSON.stringify(photoStable),
    dictation: dictationAfter === dictationStable,
    notification: JSON.stringify(notificationAfter) === JSON.stringify(notificationStable),
    encryptedExportRecoveryGeneration: protectedGenerationSafe,
    encryptedExportNavigation: navInvalidationSafe,
    encryptedExportForcedClose: forcedCloseInvalidationSafe,
    encryptedExportSheetless: sheetlessSafe,
    update: JSON.stringify(updateAfter) === JSON.stringify(updateStable)
  };
  assert(Object.values(epochResults).every(Boolean), `discardable async continuations are epoch-invalidated after recovery ${JSON.stringify(epochResults)}`);
}

async function testActiveMutationRegistryBlocksRecovery() {
  const cases = [
    {
      label: "followed-up save",
      setup(harness) {
        harness.eval(`db.people = [{ id: "active-person", name: "Active mutation", status: "Active", followUpCadence: "Weekly", followUpCustomDays: "", nextFollowUpDate: "" }]`);
        return `markFollowedUp("active-person")`;
      }
    },
    {
      label: "care cadence save",
      setup(harness) {
        harness.eval(`
          db.people = [{ id: "active-person", name: "Active mutation", status: "Active", followUpCadence: "Weekly", followUpCustomDays: "", nextFollowUpDate: "" }];
          view.sheet = { type: "care-cadence", personId: "active-person", saving: false };
        `);
        harness.eval(`
          document.getElementById("sheet-care-cadence").value = "Weekly";
          document.getElementById("sheet-care-custom-days").value = "";
          document.getElementById("sheet-care-next-date").value = "";
        `);
        return `submitCareCadenceSheet()`;
      }
    },
    {
      label: "AI action approval save",
      setup(harness) {
        harness.eval(`
          const person = createPerson("Active mutation person");
          const proposal = emptyAiProposal({
            id: "active-proposal",
            proposedActions: [{ actionId: "active-task", actionType: "createFollowUpTask", title: "Active mutation task", dueDate: todayISO(), relatedPersonId: person.id }]
          });
          db.aiProposals.push(proposal);
          view.screen = "aiConfirmActions";
          view.aiConfirmProposalId = proposal.id;
          view.aiConfirmActionIndexes = [0];
          view.aiConfirmPersonChoice = { mode: "existing", existingPersonId: person.id };
        `);
        harness.eval(`
          document.getElementById("ai-confirm-person-choice").value = db.people[0].id;
          document.getElementById("ai-confirm-action-confirm").checked = true;
        `);
        return `submitAiActionConfirmSheet()`;
      }
    }
  ];
  const results = [];
  for (const testCase of cases) {
    const harness = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
    await harness.ready();
    const mutationEntered = deferred();
    const mutationRelease = deferred();
    harness.sandbox.__mutationConfirm = async required => {
      mutationEntered.resolve(required);
      await mutationRelease.promise;
      harness.eval(`vaultSaveCompletedRevision = ${Number.isFinite(Number(required)) ? Number(required) : 1}`);
      return true;
    };
    harness.eval(`
      settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true });
      vaultPassphrase = "synthetic-active-mutation";
      vaultSaveRequestedRevision = 4;
      vaultSaveCompletedRevision = 4;
      confirmCareVaultRevision = required => globalThis.__mutationConfirm(required);
    `);
    const expression = testCase.setup(harness);
    harness.eval(`recordUndo("active target")`);
    const active = harness.eval(expression);
    await mutationEntered.promise;
    let recoverySettled = false;
    const recovery = harness.eval("undoLast()").then(result => {
      recoverySettled = true;
      return result;
    });
    await Promise.resolve();
    const pendingState = harness.eval(`({ recovery: recoveryTransactionPending, active: activeMutations.size, undoCount: undoStack.length })`);
    mutationRelease.resolve();
    const [activeResult, recoveryResult] = await Promise.all([active, recovery]);
    results.push(recoverySettled && recoveryResult === false && !pendingState.recovery && pendingState.active === 1 && activeResult === true && pendingState.undoCount === 2);
  }
  const inverse = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await inverse.ready();
  const recoveryEntered = deferred();
  const recoveryRelease = deferred();
  inverse.sandbox.__inverseConfirm = async required => {
    recoveryEntered.resolve(required);
    await recoveryRelease.promise;
    inverse.eval(`vaultSaveCompletedRevision = ${Number.isFinite(Number(required)) ? Number(required) : 1}`);
    return true;
  };
  inverse.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true });
    vaultPassphrase = "synthetic-inverse-active-mutation";
    db.people = [{ id: "inverse-person", name: "Inverse current", status: "Active", followUpCadence: "Weekly", followUpCustomDays: "", nextFollowUpDate: "" }];
    recordUndo("inverse target");
    db.people[0].name = "Inverse changed";
    vaultSaveRequestedRevision = 6;
    vaultSaveCompletedRevision = 6;
    scheduleVaultSave = () => { vaultSaveRequestedRevision += 1; return true; };
    confirmCareVaultRevision = required => globalThis.__inverseConfirm(required);
  `);
  const pendingRecovery = inverse.eval("undoLast()");
  await recoveryEntered.promise;
  const beforeDirect = inverse.eval(`JSON.stringify({ db, undoStack, requested: vaultSaveRequestedRevision })`);
  const directResult = await inverse.eval(`markFollowedUp("inverse-person")`);
  const afterDirect = inverse.eval(`JSON.stringify({ db, undoStack, requested: vaultSaveRequestedRevision })`);
  recoveryRelease.resolve();
  const recoveryResult = await pendingRecovery;
  const inverseSafe = directResult === false && beforeDirect === afterDirect && recoveryResult === true;
  assert(results.every(Boolean) && inverseSafe, `the central active-mutation registry refuses recovery before snapshot and rejects direct registered mutation during pending recovery [before=${JSON.stringify(results)}, inverse=${inverseSafe}]`);
}

async function testSharedFragmentDeferralAndBoundedIndexedDbDeadline() {
  const shared = makeHarness({ local: { [KEYS.settings]: { enableUndo: true, enableUrlQuickGrab: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() } });
  await shared.ready();
  const confirmEntered = deferred();
  const confirmRelease = deferred();
  shared.sandbox.__sharedConfirm = async required => {
    confirmEntered.resolve(required);
    await confirmRelease.promise;
    shared.eval(`vaultSaveCompletedRevision = ${Number.isFinite(Number(required)) ? Number(required) : 1}`);
    return true;
  };
  shared.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, enableUrlQuickGrab: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: true });
    vaultPassphrase = "synthetic-shared-url";
    db.people = [{ id: "shared", name: "Shared current" }];
    undoStack = [{ id: "shared-target", label: "shared target", db: cloneJson(db), settings: cloneJson(settings), customCopy: {} }];
    vaultSaveRequestedRevision = 7;
    vaultSaveCompletedRevision = 7;
    scheduleVaultSave = () => { vaultSaveRequestedRevision += 1; return true; };
    confirmCareVaultRevision = required => globalThis.__sharedConfirm(required);
  `);
  const pendingRecovery = shared.eval("undoLast()");
  await confirmEntered.promise;
  const legacyBefore = shared.eval(`JSON.stringify({
    db,
    settings,
    view,
    undoStack,
    autosaveDraftsCache,
    autosaveTimer: Boolean(autosaveTimer),
    pendingFragmentQuickGrabText,
    sharedFragmentImportDeferred
  })`);
  shared.sandbox.window.location.search = "?quickgrab=discard&text=discard&note=discard&quickgrabCategory=prayer&category=task&tag=a&tags=b&quickgrabUrgency=soon&urgency=now&safe=kept";
  shared.sandbox.window.location.hash = "#main-content";
  shared.windowListeners.pageshow();
  shared.windowListeners.focus();
  const legacyDuring = shared.eval(`({
    unchanged: JSON.stringify({
      db,
      settings,
      view,
      undoStack,
      autosaveDraftsCache,
      autosaveTimer: Boolean(autosaveTimer),
      pendingFragmentQuickGrabText,
      sharedFragmentImportDeferred
    }) === ${JSON.stringify(legacyBefore)},
    search: window.location.search,
    hash: window.location.hash,
    historyState: JSON.stringify(window.history.state)
  })`);
  shared.sandbox.window.location.hash = "#quickgrab=deferred%20shared%20capture";
  shared.windowListeners.pageshow();
  shared.windowListeners.focus();
  const during = shared.eval(`({
    pendingText: pendingFragmentQuickGrabText,
    deferred: sharedFragmentImportDeferred,
    screen: view.screen,
    search: window.location.search,
    hash: window.location.hash,
    undoCount: undoStack.length,
    quickGrabCount: db.quickGrabs.length,
    proposalCount: db.aiProposals.length,
    autosavePending: Boolean(autosaveTimer)
  })`);
  shared.windowListeners.pageshow();
  shared.windowListeners.focus();
  const repeatedDuring = shared.eval(`({ pendingText: pendingFragmentQuickGrabText, deferred: sharedFragmentImportDeferred, hash: window.location.hash })`);
  confirmRelease.resolve();
  await pendingRecovery;
  await new Promise(resolve => setTimeout(resolve, 0));
  shared.windowListeners.pageshow();
  shared.eval("applyPendingFragmentQuickGrabText()");
  const once = shared.elements["quick-text"].value;
  shared.windowListeners.focus();
  shared.windowListeners.pageshow();
  shared.eval("applyPendingFragmentQuickGrabText()");
  const twice = shared.elements["quick-text"].value;
  const sharedSafe = legacyDuring.unchanged
    && legacyDuring.search === "?safe=kept"
    && legacyDuring.hash === "#main-content"
    && legacyDuring.historyState === JSON.stringify({ syntheticRecoveryState: "preserve" })
    && during.pendingText === "deferred shared capture"
    && during.deferred
    && during.screen !== "quick"
    && during.search === "?safe=kept"
    && during.hash === ""
    && during.undoCount === 1
    && during.quickGrabCount === 0
    && during.proposalCount === 0
    && !during.autosavePending
    && repeatedDuring.pendingText === during.pendingText
    && repeatedDuring.deferred
    && repeatedDuring.hash === ""
    && once === "deferred shared capture"
    && twice === once;

  async function runDeadlineCase(idbOptions, label) {
    const timers = makeControlledTimers();
    const harness = makeHarness({
      local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData({ people: [{ id: label, name: "Deadline sentinel" }] }) },
      idbSeed: {},
      idbOptions,
      controlledTimers: timers
    });
    const startup = harness.eval("startupBootstrapPromise");
    let settled = false;
    if (startup) startup.finally(() => { settled = true; });
    if (idbOptions.neverSettleNextTransaction) await harness.fakeIdb.waitForTransactions(1);
    for (let index = 0; index < 20; index += 1) {
      timers.runAll();
      await Promise.resolve();
    }
    const beforeLate = harness.eval(`({ error: view.startupRecoveryError, people: db.people.map(person => person.name), hydrating: view.startupHydrating })`);
    harness.fakeIdb.releaseOpenRequests();
    timers.runAll();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const afterLate = harness.eval(`({ error: view.startupRecoveryError, people: db.people.map(person => person.name), hydrating: view.startupHydrating })`);
    return { settled, beforeLate, afterLate };
  }

  const neverOpen = await runDeadlineCase({ neverOpen: true }, "never-open");
  const neverTransaction = await runDeadlineCase({ neverSettleNextTransaction: true }, "never-transaction");
  const lateCommit = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData({ people: [{ id: "late-timeout", name: "Durable before timeout" }] }) }
  });
  await lateCommit.ready();
  const lateTimers = makeControlledTimers();
  lateCommit.sandbox.setTimeout = lateTimers.setTimeout.bind(lateTimers);
  lateCommit.sandbox.clearTimeout = lateTimers.clearTimeout.bind(lateTimers);
  lateCommit.sandbox.window.setTimeout = lateCommit.sandbox.setTimeout;
  lateCommit.sandbox.window.clearTimeout = lateCommit.sandbox.clearTimeout;
  const lateGate = lateCommit.fakeIdb.gateNextTransaction();
  const timedWrite = lateCommit.eval(`idbTransaction("readwrite", STORAGE_KEY, normalizeData({ ...emptyData(), people: [{ id: "late-timeout", name: "Late commit must not land" }] }))`);
  await lateGate.started.promise;
  lateTimers.runAll();
  let timedWriteRejected = false;
  await timedWrite.catch(() => { timedWriteRejected = true; });
  lateGate.resolve();
  await nextTurn();
  await nextTurn();
  const lateWriteSafe = timedWriteRejected && lateCommit.fakeIdb.abortCount === 1 && lateCommit.fakeIdb.values.get(KEYS.data)?.people?.[0]?.name === "Durable before timeout";
  const neverOpenSafe = neverOpen.settled && /could not finish/i.test(neverOpen.beforeLate.error) && JSON.stringify(neverOpen.afterLate) === JSON.stringify(neverOpen.beforeLate);
  const neverTransactionSafe = neverTransaction.settled && /could not finish/i.test(neverTransaction.beforeLate.error) && JSON.stringify(neverTransaction.afterLate) === JSON.stringify(neverTransaction.beforeLate);
  assert(sharedSafe && neverOpenSafe && neverTransactionSafe && lateWriteSafe, `shared fragment deferral, legacy query discard, and bounded IndexedDB open/transaction deadlines hold [shared=${sharedSafe}, neverOpen=${neverOpenSafe}, neverTransaction=${neverTransactionSafe}, lateWrite=${lateWriteSafe}]`);
}

async function testRecoveredSharedCaptureOptOutWins() {
  const offText = "Fictional recovered opt-out capture";
  const offSettings = { launchScreen: "today", enableUndo: true, enableUrlQuickGrab: false, enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false };
  const onSettings = { ...offSettings, enableUrlQuickGrab: true };
  const recoveredData = emptyData();
  const outcome = (harness, text) => {
    const state = harness.eval(`({
      enabled: settings.enableUrlQuickGrab,
      pendingText: pendingFragmentQuickGrabText,
      deferred: sharedFragmentImportDeferred,
      screen: view.screen,
      draft: view.quickGrabDraftText,
      source: view.quickGrabDraftSource || "",
      autosaveCache: cloneJson(autosaveDraftsCache),
      autosavePending: Boolean(autosaveTimer),
      quickGrabCount: db.quickGrabs.length,
      proposalCount: db.aiProposals.length,
      undoCount: undoStack.length,
      hash: window.location.hash,
      recoveryError: view.startupRecoveryError,
      appText: document.getElementById("app").innerHTML,
      toastText: document.getElementById("toast").textContent
    })`);
    state.textarea = harness.elements["quick-text"]?.value || "";
    state.storageContainsText = Object.values(harness.storage).some(value => String(value).includes(text));
    return state;
  };
  const isOffAndUntouched = state => state.enabled === false
    && state.pendingText === ""
    && state.deferred === false
    && state.screen === "today"
    && state.draft === ""
    && state.source === ""
    && state.textarea === ""
    && state.autosaveCache === null
    && !state.autosavePending
    && state.quickGrabCount === 0
    && state.proposalCount === 0
    && state.undoCount === 0
    && state.hash === ""
    && !state.storageContainsText
    && !state.appText.includes(offText)
    && !state.toastText.includes(offText);

  const startupOff = makeHarness({
    idbSeed: { [KEYS.settings]: offSettings, [KEYS.data]: recoveredData },
    initialHash: `#quickgrab=${encodeURIComponent(offText)}`
  });
  const startupHashScrubbed = startupOff.sandbox.window.location.hash === "";
  await startupOff.ready();
  const startupOffState = outcome(startupOff, offText);
  startupOff.windowListeners.focus();
  startupOff.windowListeners.pageshow();
  startupOff.eval("applyPendingFragmentQuickGrabText()");
  const startupOffRepeated = outcome(startupOff, offText);
  const reload = makeHarness({ local: { ...startupOff.storage } });
  await reload.ready();
  reload.windowListeners.focus();
  reload.windowListeners.pageshow();
  const reloadState = outcome(reload, offText);
  const startupOffSafe = startupHashScrubbed
    && isOffAndUntouched(startupOffState)
    && isOffAndUntouched(startupOffRepeated)
    && reloadState.draft === ""
    && reloadState.textarea === ""
    && reloadState.pendingText === ""
    && !reloadState.storageContainsText;

  const retryText = "Fictional retry opt-out capture";
  const retry = makeHarness({
    idbSeed: { [KEYS.settings]: offSettings, [KEYS.data]: recoveredData },
    initialHash: `#quickgrab=${encodeURIComponent(retryText)}`
  });
  retry.fakeIdb.failNextReadonlyTransaction = true;
  await retry.ready();
  const retryFailed = outcome(retry, retryText);
  await retry.eval("bootstrapLocalState()");
  await nextTurn();
  const retryRecovered = outcome(retry, retryText);
  retry.windowListeners.focus();
  retry.windowListeners.pageshow();
  const retryRepeated = outcome(retry, retryText);
  const retrySafe = Boolean(retryFailed.recoveryError)
    && retryFailed.hash === ""
    && retryFailed.draft === ""
    && retryFailed.textarea === ""
    && retryFailed.pendingText === retryText
    && retryFailed.deferred
    && !retryFailed.autosavePending
    && !retryFailed.storageContainsText
    && retryRecovered.enabled === false
    && retryRecovered.pendingText === ""
    && retryRecovered.deferred === false
    && retryRecovered.draft === ""
    && retryRecovered.textarea === ""
    && !retryRecovered.autosavePending
    && !retryRecovered.storageContainsText
    && retryRepeated.draft === ""
    && retryRepeated.textarea === "";

  const transactionText = "Fictional transaction opt-out capture";
  const transaction = makeHarness({ local: { [KEYS.settings]: onSettings, [KEYS.data]: recoveredData } });
  await transaction.ready();
  const transactionStarted = transaction.eval(`beginRecoveryTransaction("undo")`);
  transaction.sandbox.window.location.hash = `#quickgrab=${encodeURIComponent(transactionText)}`;
  transaction.windowListeners.pageshow();
  transaction.eval(`settings = normalizeSettings({ ...settings, enableUrlQuickGrab: false })`);
  const transactionHeld = outcome(transaction, transactionText);
  transaction.eval("finishRecoveryTransaction()");
  await flushControlledMicrotasks();
  transaction.eval("applyPendingFragmentQuickGrabText()");
  const transactionFinished = outcome(transaction, transactionText);
  const transactionSafe = transactionStarted === true
    && transactionHeld.pendingText === transactionText
    && transactionHeld.deferred
    && transactionHeld.hash === ""
    && transactionFinished.enabled === false
    && transactionFinished.pendingText === ""
    && transactionFinished.deferred === false
    && transactionFinished.screen === "today"
    && transactionFinished.draft === ""
    && transactionFinished.textarea === ""
    && !transactionFinished.autosavePending
    && transactionFinished.quickGrabCount === 0
    && transactionFinished.proposalCount === 0
    && !transactionFinished.storageContainsText;

  const onText = "Fictional recovered on capture";
  const startupOn = makeHarness({
    idbSeed: { [KEYS.settings]: onSettings, [KEYS.data]: recoveredData },
    initialHash: `#quickgrab=${encodeURIComponent(onText)}`
  });
  await startupOn.ready();
  const onOnce = outcome(startupOn, onText);
  startupOn.windowListeners.focus();
  startupOn.windowListeners.pageshow();
  startupOn.eval("applyPendingFragmentQuickGrabText()");
  const onRepeated = outcome(startupOn, onText);
  const onSafe = onOnce.enabled === true
    && onOnce.pendingText === ""
    && onOnce.deferred === false
    && onOnce.screen === "quick"
    && onOnce.draft === onText
    && onOnce.textarea === onText
    && onOnce.quickGrabCount === 0
    && onOnce.proposalCount === 0
    && onOnce.undoCount === 0
    && onOnce.hash === ""
    && onRepeated.draft === onText
    && onRepeated.textarea === onText
    && onRepeated.quickGrabCount === 0
    && onRepeated.proposalCount === 0
    && onRepeated.undoCount === 0;

  assert(startupOffSafe && retrySafe && transactionSafe && onSafe, `recovered shared-capture opt-out wins at startup, retry, and recovery release while recovered-on imports exactly once [startupOff=${startupOffSafe}, retry=${retrySafe}, transaction=${transactionSafe}, on=${onSafe}]`);
}

async function testBackendCancellationRestoresExactAutoMemory() {
  const plain = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await plain.ready();
  const plainFetchStarted = deferred();
  const plainFetch = deferred();
  plain.sandbox.fetch = () => { plainFetchStarted.resolve(); return plainFetch.promise; };
  const plainId = plain.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    const grab = makeQuickGrab("Plain cancellation snapshot", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    recordUndo("plain cancellation target");
    return grab.id;
  })()`);
  await plain.eval("drainIndexedDbCoordinator()");
  const plainBefore = plain.eval(`({ grab: JSON.stringify(db.quickGrabs[0]), localAutoMemory: localStorage.getItem(AUTO_MEMORY_KEY), vault: JSON.stringify(loadAutoMemoryVault()) })`);
  const plainBeforeIdb = JSON.stringify(plain.fakeIdb.values.get(KEYS.autoMemory));
  const plainBackend = plain.eval(`createQuickGrabBackendAiProposal("${plainId}")`);
  await plainFetchStarted.promise;
  await plain.eval("drainIndexedDbCoordinator()");
  const plainTemporary = plain.eval(`loadAutoMemoryVault().snapshots.some(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${plainId}" && grab.processingState === "processing"))`);
  const plainUndo = await plain.eval("undoLast()");
  const plainAfter = plain.eval(`({ grab: JSON.stringify(db.quickGrabs[0]), localAutoMemory: localStorage.getItem(AUTO_MEMORY_KEY), vault: JSON.stringify(loadAutoMemoryVault()) })`);
  const plainAfterIdb = JSON.stringify(plain.fakeIdb.values.get(KEYS.autoMemory));
  plainFetch.reject(new Error("synthetic cancelled plain backend"));
  await plainBackend;

  const encrypted = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: {}
  });
  await encrypted.ready();
  const encryptedFetchStarted = deferred();
  const encryptedFetch = deferred();
  encrypted.sandbox.fetch = () => { encryptedFetchStarted.resolve(); return encryptedFetch.promise; };
  encrypted.sandbox.__encryptEnvelope = async payload => ({ kind: "synthetic-device-vault", version: 1, encryptedAt: `synthetic-${Date.now()}`, payload: clone(payload) });
  const encryptedId = encrypted.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: true, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    vaultPassphrase = "synthetic-device-vault-passphrase";
    memoryVaultCache = emptyAutoMemoryVault();
    encryptPayload = payload => globalThis.__encryptEnvelope(payload);
    const grab = makeQuickGrab("Encrypted cancellation snapshot", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    return grab.id;
  })()`);
  await encrypted.eval("persistEncryptedVault()");
  encrypted.eval(`recordUndo("encrypted cancellation target")`);
  const encryptedBefore = encrypted.eval(`({ grab: JSON.stringify(db.quickGrabs[0]), memory: JSON.stringify(memoryVaultCache), localMemory: JSON.stringify(JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.autoMemoryVault) })`);
  const encryptedBeforeIdb = JSON.stringify(encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.autoMemoryVault);
  const encryptedBackend = encrypted.eval(`createQuickGrabBackendAiProposal("${encryptedId}")`);
  await encryptedFetchStarted.promise;
  await encrypted.eval("persistEncryptedVault()");
  const encryptedTemporary = encrypted.eval(`JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.autoMemoryVault.snapshots.some(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${encryptedId}" && grab.processingState === "processing"))`);
  const encryptedUndo = await encrypted.eval("undoLast()");
  const encryptedAfter = encrypted.eval(`({ grab: JSON.stringify(db.quickGrabs[0]), memory: JSON.stringify(memoryVaultCache), localMemory: JSON.stringify(JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.autoMemoryVault) })`);
  const encryptedAfterIdb = JSON.stringify(encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.autoMemoryVault);
  encryptedFetch.reject(new Error("synthetic cancelled encrypted backend"));
  await encryptedBackend;

  const failed = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await failed.ready();
  const failedFetchStarted = deferred();
  const failedFetch = deferred();
  failed.sandbox.fetch = () => { failedFetchStarted.resolve(); return failedFetch.promise; };
  const failedId = failed.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    const grab = makeQuickGrab("Cancellation persistence failure", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    recordUndo("failed cancellation target");
    return grab.id;
  })()`);
  await failed.eval("drainIndexedDbCoordinator()");
  const failedBackend = failed.eval(`createQuickGrabBackendAiProposal("${failedId}")`);
  await failedFetchStarted.promise;
  await failed.eval("drainIndexedDbCoordinator()");
  const failedUndoBefore = failed.eval("JSON.stringify(undoStack)");
  failed.fakeIdb.failNextTransaction = true;
  const failedFirstUndo = await failed.eval("undoLast()");
  const failedFirstState = failed.eval(`({
    undo: JSON.stringify(undoStack),
    pending: recoveryTransactionPending,
    failedKeys: indexedDbFailedKeys.size,
    toast: document.getElementById("toast").textContent
  })`);
  const failedSecondUndo = await failed.eval("undoLast()");
  const failedSecondState = failed.eval(`({ undoCount: undoStack.length, pending: recoveryTransactionPending, failedKeys: indexedDbFailedKeys.size })`);
  failedFetch.reject(new Error("synthetic failed cancellation backend"));
  await failedBackend;

  const plainSafe = plainTemporary && plainUndo === true && plainAfter.grab === plainBefore.grab && plainAfter.localAutoMemory === plainBefore.localAutoMemory && plainAfter.vault === plainBefore.vault && plainAfterIdb === plainBeforeIdb;
  const encryptedChecks = {
    baselineLocal: encryptedBefore.memory === encryptedBefore.localMemory,
    baselineIdb: encryptedBefore.memory === encryptedBeforeIdb,
    temporary: encryptedTemporary,
    undo: encryptedUndo === true,
    grab: encryptedAfter.grab === encryptedBefore.grab,
    memory: encryptedAfter.memory === encryptedBefore.memory,
    localMemory: encryptedAfter.localMemory === encryptedBefore.localMemory,
    idbMemory: encryptedAfterIdb === encryptedBeforeIdb
  };
  const encryptedSafe = Object.values(encryptedChecks).every(Boolean);
  const failedSafe = failedFirstUndo === false && failedFirstState.undo === failedUndoBefore && !failedFirstState.pending && failedFirstState.failedKeys > 0 && !/^Undid\b/i.test(failedFirstState.toast)
    && failedSecondUndo === true && failedSecondState.undoCount === 0 && !failedSecondState.pending && failedSecondState.failedKeys === 0;

  assert(
    plainSafe && encryptedSafe && failedSafe,
    "immutable Auto Memory snapshots keep the pre-operation Device Vault cache/envelope aligned, and Backend Quick Grab cancellation restores the exact graph while persistence failure refuses recovery without consuming Undo"
  );
}

async function testFailedMirrorReconciliationIsCanonicalAndRetryable() {
  async function makeFailedMirror(label) {
    const harness = makeHarness({
      local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
      idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
    });
    await harness.ready();
    await nextTurn();
    harness.eval(`
      db.people = [{ id: "${label}", name: "Canonical undo target" }];
      recordUndo("${label} target");
      db.people[0].name = "Canonical current state";
    `);
    const baseline = harness.fakeIdb.transactions.length;
    harness.fakeIdb.failNextTransaction = true;
    harness.eval("saveData()");
    await harness.fakeIdb.waitForTransactions(baseline + 1);
    await harness.fakeIdb.waitForIdle();
    return harness;
  }

  const retry = await makeFailedMirror("retryable-mirror");
  const beforeRetry = retry.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);
  retry.fakeIdb.failNextTransaction = true;
  const firstRetry = await retry.eval("undoLast()");
  const afterFirstRetry = retry.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);
  const secondRetry = await retry.eval("undoLast()");
  const retryAfter = retry.eval(`({ name: db.people[0]?.name, undoCount: undoStack.length, failedKeys: indexedDbFailedKeys.size })`);
  const retryIdbName = retry.fakeIdb.values.get(KEYS.data)?.people?.[0]?.name;

  const repeated = await makeFailedMirror("repeated-mirror");
  const repeatedBefore = repeated.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);
  repeated.fakeIdb.failNextTransaction = true;
  const repeatedFirst = await repeated.eval("undoLast()");
  repeated.fakeIdb.failNextTransaction = true;
  const repeatedSecond = await repeated.eval("undoLast()");
  const repeatedAfter = repeated.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);

  const invalid = await makeFailedMirror("invalid-canonical");
  invalid.eval(`localStorage.setItem(STORAGE_KEY, "{invalid-canonical-json")`);
  const invalidBefore = invalid.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);
  const invalidResult = await invalid.eval("undoLast()");
  const invalidAfter = invalid.eval(`JSON.stringify({ db, undoStack, local: localStorage.getItem(STORAGE_KEY) })`);

  assert(
    firstRetry === false && beforeRetry === afterFirstRetry
      && secondRetry === true && retryAfter.name === "Canonical undo target" && retryAfter.undoCount === 0 && retryAfter.failedKeys === 0 && retryIdbName === "Canonical undo target"
      && repeatedFirst === false && repeatedSecond === false && repeatedAfter === repeatedBefore
      && invalidResult === false && invalidAfter === invalidBefore,
    "failed mirrors reconcile atomically from canonical local storage on retry while repeated failures and invalid canonical JSON remain fail-closed"
  );
}

async function testCancellationFailureRetainsRetryOwnership() {
  const plain = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await plain.ready();
  const plainFetchStarted = deferred();
  const plainFetch = deferred();
  plain.sandbox.fetch = () => { plainFetchStarted.resolve(); return plainFetch.promise; };
  const plainId = plain.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    const grab = makeQuickGrab("Retry-owned plaintext cancellation", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    recordUndo("retry-owned plaintext target");
    return grab.id;
  })()`);
  await plain.eval("drainIndexedDbCoordinator()");
  const plainTarget = plain.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() })`);
  const plainBackend = plain.eval(`createQuickGrabBackendAiProposal("${plainId}")`);
  await plainFetchStarted.promise;
  await plain.eval("drainIndexedDbCoordinator()");
  const plainProcessing = plain.eval(`JSON.stringify({
    db,
    undoStack,
    memoryVaultCache,
    view,
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries())
  })`);
  const plainProcessingIdb = JSON.stringify(Object.fromEntries(Array.from(plain.fakeIdb.values.entries())));
  const realSetItem = plain.sandbox.localStorage.setItem.bind(plain.sandbox.localStorage);
  let failCanonicalWrite = true;
  plain.sandbox.localStorage.setItem = (key, value) => {
    if (failCanonicalWrite && key === KEYS.data) {
      failCanonicalWrite = false;
      throw new Error("synthetic one-shot canonical data failure");
    }
    return realSetItem(key, value);
  };
  const plainFirstUndo = await plain.eval("undoLast()");
  plain.sandbox.localStorage.setItem = realSetItem;
  const plainFirstState = plain.eval(`({
    graph: JSON.stringify({ db, undoStack, memoryVaultCache, view, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) }),
    owners: Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled })),
    toast: document.getElementById("toast").textContent
  })`);
  const plainFirstIdb = JSON.stringify(Object.fromEntries(Array.from(plain.fakeIdb.values.entries())));
  plainFetch.reject(new Error("synthetic settled fetch after failed cancellation"));
  await plainBackend;
  const plainSettledOwner = plain.eval(`Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled }))`);
  const plainSecondUndo = await plain.eval("undoLast()");
  await plain.eval("drainIndexedDbCoordinator()");
  const plainFinal = plain.eval(`({
    target: JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() }),
    undoCount: undoStack.length,
    ownerCount: activeMutations.size,
    processingSnapshots: loadAutoMemoryVault().snapshots.filter(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${plainId}" && grab.processingState === "processing")).length,
    localProcessing: JSON.parse(localStorage.getItem(STORAGE_KEY)).quickGrabs.some(grab => grab.id === "${plainId}" && grab.processingState === "processing")
  })`);
  const plainFinalIdb = plain.fakeIdb.values.get(KEYS.data);

  const encrypted = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: {}
  });
  await encrypted.ready();
  const encryptedFetchStarted = deferred();
  const encryptedFetch = deferred();
  encrypted.sandbox.fetch = () => { encryptedFetchStarted.resolve(); return encryptedFetch.promise; };
  encrypted.sandbox.__encryptEnvelope = async payload => ({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "synthetic-salt",
    iv: "synthetic-iv",
    ciphertext: "synthetic-ciphertext",
    encryptedAt: `synthetic-${Date.now()}`,
    payload: clone(payload)
  });
  const encryptedId = encrypted.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: true, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    vaultPassphrase = "synthetic-device-vault-passphrase";
    memoryVaultCache = emptyAutoMemoryVault();
    encryptPayload = payload => globalThis.__encryptEnvelope(payload);
    const grab = makeQuickGrab("Retry-owned Device Vault cancellation", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    return grab.id;
  })()`);
  await encrypted.eval("persistEncryptedVault()");
  encrypted.eval(`recordUndo("retry-owned Device Vault target")`);
  const encryptedTarget = encrypted.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache })`);
  const encryptedBackend = encrypted.eval(`createQuickGrabBackendAiProposal("${encryptedId}")`);
  await encryptedFetchStarted.promise;
  await encrypted.eval("persistEncryptedVault()");
  encrypted.fakeIdb.failNextTransaction = true;
  const encryptedFirstUndo = await encrypted.eval("undoLast()");
  encryptedFetch.reject(new Error("synthetic settled encrypted fetch after failed cancellation"));
  await encryptedBackend;
  const encryptedFirstState = encrypted.eval(`({
    undoCount: undoStack.length,
    failedKeys: indexedDbFailedKeys.size,
    owners: Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled })),
    toast: document.getElementById("toast").textContent
  })`);
  const encryptedSecondUndo = await encrypted.eval("undoLast()");
  const encryptedFinal = encrypted.eval(`({
    target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
    localTarget: JSON.stringify({ grab: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.data.quickGrabs[0], memory: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.autoMemoryVault }),
    idbTarget: JSON.stringify({ grab: null, memory: null }),
    undoCount: undoStack.length,
    ownerCount: activeMutations.size,
    failedKeys: indexedDbFailedKeys.size,
    processingSnapshots: memoryVaultCache.snapshots.filter(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${encryptedId}" && grab.processingState === "processing")).length
  })`);
  encryptedFinal.idbTarget = JSON.stringify({
    grab: encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.data?.quickGrabs?.[0] || null,
    memory: encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.autoMemoryVault || null
  });

  const retryOwner = value => value.length === 1 && value[0].cancelled === true && value[0].retry === true;
  const plainGraphBefore = JSON.parse(plainProcessing);
  const plainGraphAfter = JSON.parse(plainFirstState.graph);
  const stableView = value => Object.fromEntries(Object.entries(value).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key)));
  const coherentPlainGraph = {
    db: JSON.stringify(plainGraphAfter.db) === JSON.stringify(plainGraphBefore.db),
    undo: JSON.stringify(plainGraphAfter.undoStack) === JSON.stringify(plainGraphBefore.undoStack),
    memory: JSON.stringify(plainGraphAfter.memoryVaultCache) === JSON.stringify(plainGraphBefore.memoryVaultCache),
    view: JSON.stringify(stableView(plainGraphAfter.view)) === JSON.stringify(stableView(plainGraphBefore.view))
      && !plainGraphAfter.view.undoSaving && !plainGraphAfter.view.restoreSaving,
    local: JSON.stringify(plainGraphAfter.local) === JSON.stringify(plainGraphBefore.local)
  };
  const plainChecks = {
    firstRejected: plainFirstUndo === false,
    firstGraphExact: Object.values(coherentPlainGraph).every(Boolean),
    firstIdbExact: plainFirstIdb === plainProcessingIdb,
    retryOwner: retryOwner(plainFirstState.owners),
    noFalseSuccess: !/^Undid\b/i.test(plainFirstState.toast),
    settledRetryOwner: retryOwner(plainSettledOwner) && plainSettledOwner[0].settled === true,
    secondSucceeded: plainSecondUndo === true,
    targetExact: plainFinal.target === plainTarget,
    consumedOnce: plainFinal.undoCount === 0,
    ownerRemoved: plainFinal.ownerCount === 0,
    memoryClean: plainFinal.processingSnapshots === 0,
    localClean: !plainFinal.localProcessing,
    idbClean: plainFinalIdb?.quickGrabs?.[0]?.processingState === "awaitingApproval"
  };
  const encryptedChecks = {
    firstRejected: encryptedFirstUndo === false,
    undoRetained: encryptedFirstState.undoCount === 1,
    failedLedgerRetained: encryptedFirstState.failedKeys > 0,
    settledRetryOwner: retryOwner(encryptedFirstState.owners) && encryptedFirstState.owners[0].settled === true,
    noFalseSuccess: !/^Undid\b/i.test(encryptedFirstState.toast),
    secondSucceeded: encryptedSecondUndo === true,
    liveExact: encryptedFinal.target === encryptedTarget,
    localExact: encryptedFinal.localTarget === encryptedTarget,
    idbExact: encryptedFinal.idbTarget === encryptedTarget,
    consumedOnce: encryptedFinal.undoCount === 0,
    ownerRemoved: encryptedFinal.ownerCount === 0,
    ledgerCleared: encryptedFinal.failedKeys === 0,
    memoryClean: encryptedFinal.processingSnapshots === 0
  };
  const plainSafe = Object.values(plainChecks).every(Boolean);
  const encryptedSafe = Object.values(encryptedChecks).every(Boolean);

  assert(plainSafe && encryptedSafe, `failed Backend cancellation retains a settled retry owner and only a healthy second Undo durably removes the processing generation in plaintext and Device Vault modes [plain=${JSON.stringify(plainChecks)}, coherent=${JSON.stringify(coherentPlainGraph)}, encrypted=${JSON.stringify(encryptedChecks)}]`);
}

async function testCancellationStoreAbortPublishesOnlyAfterDurability() {
  const stableView = value => Object.fromEntries(Object.entries(value).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key)));
  const exactFirstFailure = (before, after, beforeIdb, afterIdb) => {
    const left = JSON.parse(before);
    const right = JSON.parse(after);
    return JSON.stringify(left.db) === JSON.stringify(right.db)
      && JSON.stringify(left.memoryVaultCache) === JSON.stringify(right.memoryVaultCache)
      && JSON.stringify(left.undoStack) === JSON.stringify(right.undoStack)
      && JSON.stringify(left.settings) === JSON.stringify(right.settings)
      && JSON.stringify(left.revisions) === JSON.stringify(right.revisions)
      && JSON.stringify(left.local) === JSON.stringify(right.local)
      && JSON.stringify(stableView(left.view)) === JSON.stringify(stableView(right.view))
      && !right.view.undoSaving && !right.view.restoreSaving
      && beforeIdb === afterIdb;
  };
  const retryOwnerSettled = owners => owners.length === 1 && owners[0].cancelled === true && owners[0].retry === true && owners[0].settled === true;

  const plain = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await plain.ready();
  const plainFetchStarted = deferred();
  const plainFetch = deferred();
  plain.sandbox.fetch = () => { plainFetchStarted.resolve(); return plainFetch.promise; };
  const plainId = plain.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    const grab = makeQuickGrab("All-store plaintext cancellation", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    recordUndo("all-store plaintext target");
    return grab.id;
  })()`);
  await plain.eval("drainIndexedDbCoordinator()");
  const plainTarget = plain.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() })`);
  const plainBackend = plain.eval(`createQuickGrabBackendAiProposal("${plainId}")`);
  await plainFetchStarted.promise;
  await plain.eval("drainIndexedDbCoordinator()");
  const plainBefore = plain.eval(`JSON.stringify({ db, memoryVaultCache, undoStack, settings, revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, view, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
  const plainBeforeIdb = JSON.stringify(Object.fromEntries(Array.from(plain.fakeIdb.values.entries())));
  plain.fakeIdb.failNextTransaction = true;
  const plainFirstUndo = await plain.eval("undoLast()");
  const plainAfter = plain.eval(`JSON.stringify({ db, memoryVaultCache, undoStack, settings, revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, view, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
  const plainAfterIdb = JSON.stringify(Object.fromEntries(Array.from(plain.fakeIdb.values.entries())));
  plainFetch.reject(new Error("synthetic plaintext request settled after IndexedDB cancellation abort"));
  await plainBackend;
  const plainOwner = plain.eval(`Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled }))`);
  const plainSecondUndo = await plain.eval("undoLast()");
  const plainFinal = plain.eval(`({
    target: JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() }),
    localTarget: JSON.stringify({ grab: JSON.parse(localStorage.getItem(STORAGE_KEY)).quickGrabs[0], memory: JSON.parse(localStorage.getItem(AUTO_MEMORY_KEY)) }),
    undoCount: undoStack.length,
    ownerCount: activeMutations.size,
    failedKeys: indexedDbFailedKeys.size,
    processingSnapshots: loadAutoMemoryVault().snapshots.filter(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${plainId}" && grab.processingState === "processing")).length
  })`);
  const plainIdbTarget = JSON.stringify({ grab: plain.fakeIdb.values.get(KEYS.data)?.quickGrabs?.[0] || null, memory: plain.fakeIdb.values.get(KEYS.autoMemory) || null });

  const encrypted = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: {}
  });
  await encrypted.ready();
  const encryptedFetchStarted = deferred();
  const encryptedFetch = deferred();
  encrypted.sandbox.fetch = () => { encryptedFetchStarted.resolve(); return encryptedFetch.promise; };
  encrypted.sandbox.__encryptEnvelope = async payload => ({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "synthetic-salt",
    iv: "synthetic-iv",
    ciphertext: "synthetic-ciphertext",
    encryptedAt: `synthetic-${Date.now()}`,
    payload: clone(payload)
  });
  const encryptedId = encrypted.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: true, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    vaultPassphrase = "synthetic-device-vault-passphrase";
    memoryVaultCache = emptyAutoMemoryVault();
    encryptPayload = payload => globalThis.__encryptEnvelope(payload);
    const grab = makeQuickGrab("All-store Device Vault cancellation", [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    return grab.id;
  })()`);
  await encrypted.eval("persistEncryptedVault()");
  encrypted.eval(`recordUndo("all-store Device Vault target")`);
  const encryptedTarget = encrypted.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache })`);
  const encryptedBackend = encrypted.eval(`createQuickGrabBackendAiProposal("${encryptedId}")`);
  await encryptedFetchStarted.promise;
  await encrypted.eval("persistEncryptedVault()");
  const encryptedBefore = encrypted.eval(`JSON.stringify({ db, memoryVaultCache, undoStack, settings, revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, view, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
  const encryptedBeforeIdb = JSON.stringify(Object.fromEntries(Array.from(encrypted.fakeIdb.values.entries())));
  encrypted.fakeIdb.failNextTransaction = true;
  const encryptedFirstUndo = await encrypted.eval("undoLast()");
  const encryptedAfter = encrypted.eval(`JSON.stringify({ db, memoryVaultCache, undoStack, settings, revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, view, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
  const encryptedAfterIdb = JSON.stringify(Object.fromEntries(Array.from(encrypted.fakeIdb.values.entries())));
  encryptedFetch.reject(new Error("synthetic Device Vault request settled after commit abort"));
  await encryptedBackend;
  const encryptedOwner = encrypted.eval(`Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled }))`);
  const encryptedSecondUndo = await encrypted.eval("undoLast()");
  const encryptedFinal = encrypted.eval(`({
    target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
    localTarget: JSON.stringify({ grab: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.data.quickGrabs[0], memory: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).payload.autoMemoryVault }),
    undoCount: undoStack.length,
    ownerCount: activeMutations.size,
    failedKeys: indexedDbFailedKeys.size,
    revisionsEqual: vaultSaveRequestedRevision === vaultSaveCompletedRevision,
    processingSnapshots: memoryVaultCache.snapshots.filter(snapshot => snapshot.payload?.data?.quickGrabs?.some(grab => grab.id === "${encryptedId}" && grab.processingState === "processing")).length
  })`);
  const encryptedIdbTarget = JSON.stringify({ grab: encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.data?.quickGrabs?.[0] || null, memory: encrypted.fakeIdb.values.get(KEYS.encrypted)?.payload?.autoMemoryVault || null });

  const plainSafe = plainFirstUndo === false
    && exactFirstFailure(plainBefore, plainAfter, plainBeforeIdb, plainAfterIdb)
    && retryOwnerSettled(plainOwner)
    && plainSecondUndo === true
    && plainFinal.target === plainTarget && plainFinal.localTarget === plainTarget && plainIdbTarget === plainTarget
    && plainFinal.undoCount === 0 && plainFinal.ownerCount === 0 && plainFinal.failedKeys === 0 && plainFinal.processingSnapshots === 0;
  const encryptedSafe = encryptedFirstUndo === false
    && exactFirstFailure(encryptedBefore, encryptedAfter, encryptedBeforeIdb, encryptedAfterIdb)
    && retryOwnerSettled(encryptedOwner)
    && encryptedSecondUndo === true
    && encryptedFinal.target === encryptedTarget && encryptedFinal.localTarget === encryptedTarget && encryptedIdbTarget === encryptedTarget
    && encryptedFinal.undoCount === 0 && encryptedFinal.ownerCount === 0 && encryptedFinal.failedKeys === 0 && encryptedFinal.revisionsEqual && encryptedFinal.processingSnapshots === 0;
  assert(plainSafe && encryptedSafe, `plaintext and Device Vault cancellation publish no restored byte before every required store commits, then one healthy retry publishes and consumes exactly once [plain=${plainSafe}, encrypted=${encryptedSafe}]`);
}

async function preparePlainRetainedCancellationOwner(label, options = {}) {
  const harness = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await harness.ready();
  const fetchStarted = deferred();
  const fetchResult = deferred();
  harness.sandbox.fetch = () => { fetchStarted.resolve(); return fetchResult.promise; };
  const grabId = harness.eval(`(() => {
    settings = normalizeSettings({
      ...settings,
      enableUndo: true,
      enableAutoSave: true,
      autoMemoryVaultEnabled: true,
      autoArchiveAnsweredDays: ${options.renderSideEffects ? '"1"' : '"never"'},
      notificationsEnabled: ${options.renderSideEffects ? "true" : "false"},
      localEncryptionEnabled: false,
      quickGrabAiMode: "backendQuickGrab",
      aiMockMode: false,
      pinnedPersonIds: ${options.leafFixtures ? '["leaf-person-a"]' : '[]'},
      recentPersonIds: ${options.leafFixtures ? '["leaf-person-a"]' : '[]'},
      appCoachDismissed: ${options.leafFixtures ? '{ "existing-suggestion": "2026-07-19T00:00:00.000Z" }' : '{}'}
    });
    const grab = makeQuickGrab(${JSON.stringify(label)}, [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    db.people = ${options.leafFixtures ? '[{ id: "leaf-person-a", name: "Leaf A", phone: "555-0101", photoDataUrl: "data:image/png;base64,c3ludGhldGlj", updatedAt: "2026-07-19T00:00:00.000Z" }, { id: "leaf-person-b", name: "Leaf B", phone: "", photoDataUrl: "", updatedAt: "2026-07-19T00:00:00.000Z" }, { id: "leaf-person-photo", name: "Leaf Photo", phone: "", photoDataUrl: "data:image/png;base64,c3ludGhldGlj", updatedAt: "2026-07-19T00:00:00.000Z" }]' : '[]'};
    db.prayerRequests = ${options.renderSideEffects ? '[{ id: "retry-prayer", request: "Synthetic retry prayer", status: "Answered", answeredAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z" }]' : options.leafFixtures ? '[{ id: "leaf-prayer", request: "Synthetic leaf prayer", status: "Active", updatedAt: "2026-07-19T00:00:00.000Z" }]' : '[]'};
    customCopy = ${options.leafFixtures ? '{ "brand.title": "Synthetic custom title" }' : '{}'};
    saveSettings();
    saveData();
    ${options.leafFixtures ? 'saveCustomCopy(); saveAutosaveDrafts({ "capture:main": { fields: { "quick-text": "Synthetic retained draft" } } });' : ''}
    recordUndo(${JSON.stringify(`${label} target`)});
    return grab.id;
  })()`);
  await harness.eval("drainIndexedDbCoordinator()");
  const target = harness.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() })`);
  const backend = harness.eval(`createQuickGrabBackendAiProposal("${grabId}")`);
  await fetchStarted.promise;
  await harness.eval("drainIndexedDbCoordinator()");
  if (options.renderSideEffects) {
    harness.sandbox.__notificationCalls = 0;
    harness.eval(`maybeSendReminderNotification = () => { globalThis.__notificationCalls += 1; };`);
  }
  const beforeFailure = harness.eval(`JSON.stringify({
    db,
    settings,
    customCopy,
    memory: loadAutoMemoryVault(),
    undoStack,
    view: Object.fromEntries(Object.entries(view).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key))),
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
    revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }
  })`);
  const beforeFailureIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  harness.fakeIdb.failNextTransaction = true;
  const firstUndo = await harness.eval("undoLast()");
  fetchResult.reject(new Error(`synthetic ${label} request settled after retained cancellation`));
  await backend;
  await nextTurn();
  await harness.fakeIdb.waitForIdle();
  const afterFailure = harness.eval(`JSON.stringify({
    db,
    settings,
    customCopy,
    memory: loadAutoMemoryVault(),
    undoStack,
    view: Object.fromEntries(Object.entries(view).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key))),
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
    revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }
  })`);
  const afterFailureIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  return { harness, grabId, target, firstUndo, beforeFailure, beforeFailureIdb, afterFailure, afterFailureIdb };
}

async function testRetainedCancellationOwnerIsRetryOnlyAndIdentityBound() {
  const locked = await preparePlainRetainedCancellationOwner("Retry-only owner", { renderSideEffects: true });
  const { harness } = locked;
  const retryMarkup = harness.eval(`document.getElementById("app").innerHTML`);
  const claim = harness.eval(`cloneJson(Array.from(activeMutations.values())[0]?.retryClaim || null)`);
  const claimImmutable = harness.eval(`(() => {
    const mutation = Array.from(activeMutations.values())[0];
    const descriptor = mutation ? Object.getOwnPropertyDescriptor(mutation, "retryClaim") : null;
    return Boolean(mutation?.retryClaim && Object.isFrozen(mutation.retryClaim) && descriptor && descriptor.writable === false && descriptor.configurable === false);
  })()`);
  const lockedBefore = harness.eval(`JSON.stringify({
    db,
    settings,
    customCopy,
    memory: loadAutoMemoryVault(),
    undoStack,
    view: Object.fromEntries(Object.entries(view).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key))),
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
    revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
    owner: Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled, retryClaim: mutation.retryClaim })),
    queue: { sequence: indexedDbQueueSequence, pending: indexedDbPendingCount },
    timers: { autosave: Boolean(autosaveTimer), vault: Boolean(vaultSaveTimer) }
  })`);
  const lockedIdbBefore = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  const transactionCount = harness.fakeIdb.transactions.length;
  const writeCount = harness.fakeIdb.writes.length;
  harness.sandbox.window.location.search = "?text=synthetic%20retry%20capture";
  const direct = harness.eval(`({
    recordUndo: recordUndo("unsafe retry history"),
    setting: updateSetting("launchScreen", "people"),
    coachSettings: applyCoachSettings({ backupReminderDays: "30" }, "Unsafe coach settings"),
    coachApply: applyCoachSuggestion("gentle-review-flow"),
    person: createPerson("Synthetic blocked person"),
    quickGrab: updateQuickGrab("${locked.grabId}", { status: "Done" }, "Unsafe Quick Grab update"),
    saveData: saveData(),
    saveSettings: saveSettings(),
    saveCopy: saveCustomCopy(),
    autosave: scheduleAutosave(),
    handled: handleAction({ currentTarget: { dataset: { action: "coach-apply", suggestion: "gentle-review-flow" } }, preventDefault() {}, stopPropagation() {} })
  })`);
  const pagehide = await harness.windowListeners.pagehide();
  harness.sandbox.document.visibilityState = "hidden";
  harness.documentListeners.visibilitychange();
  const freeze = await harness.documentListeners.freeze();
  harness.windowListeners.pageshow();
  harness.windowListeners.focus();
  harness.eval("render()");
  await flushControlledMicrotasks();
  const lockedAfter = harness.eval(`JSON.stringify({
    db,
    settings,
    customCopy,
    memory: loadAutoMemoryVault(),
    undoStack,
    view: Object.fromEntries(Object.entries(view).filter(([key]) => !["undoSaving", "restoreSaving"].includes(key))),
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
    revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
    owner: Array.from(activeMutations.values()).map(mutation => ({ cancelled: mutation.cancelled, retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled, retryClaim: mutation.retryClaim })),
    queue: { sequence: indexedDbQueueSequence, pending: indexedDbPendingCount },
    timers: { autosave: Boolean(autosaveTimer), vault: Boolean(vaultSaveTimer) }
  })`);
  const lockedIdbAfter = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  const sideEffects = harness.eval(`({
    notificationCalls: globalThis.__notificationCalls,
    prayerStatus: db.prayerRequests[0]?.status,
    deferred: sharedFragmentImportDeferred,
    pendingText: pendingFragmentQuickGrabText,
    search: window.location.search
  })`);
  sideEffects.transactionCount = harness.fakeIdb.transactions.length;
  sideEffects.writeCount = harness.fakeIdb.writes.length;
  const healthyRetry = await harness.eval("undoLast()");
  const healthyFinal = harness.eval(`({
    target: JSON.stringify({ grab: db.quickGrabs[0], memory: loadAutoMemoryVault() }),
    undoCount: undoStack.length,
    ownerCount: activeMutations.size
  })`);

  const identity = await preparePlainRetainedCancellationOwner("Identity-bound owner");
  const identityClaim = identity.harness.eval(`cloneJson(Array.from(activeMutations.values())[0]?.retryClaim || null)`);
  identity.harness.eval(`undoStack.unshift({
    id: "unsafe-newer-undo",
    generation: ++undoGeneration,
    label: "unsafe newer history",
    db: cloneJson(db),
    settings: cloneJson(settings),
    customCopy: cloneJson(customCopy)
  })`);
  const identityBefore = identity.harness.eval(`JSON.stringify({ db, settings, customCopy, undoStack, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()), revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, owner: Array.from(activeMutations.values()).map(mutation => ({ retry: mutation.cancelNeedsRetry, retryClaim: mutation.retryClaim })) })`);
  const identityIdbBefore = JSON.stringify(Object.fromEntries(Array.from(identity.harness.fakeIdb.values.entries())));
  const identityTransactions = identity.harness.fakeIdb.transactions.length;
  const unsafeRetry = await identity.harness.eval("undoLast()");
  const identityAfter = identity.harness.eval(`JSON.stringify({ db, settings, customCopy, undoStack, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()), revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision }, owner: Array.from(activeMutations.values()).map(mutation => ({ retry: mutation.cancelNeedsRetry, retryClaim: mutation.retryClaim })) })`);
  const identityIdbAfter = JSON.stringify(Object.fromEntries(Array.from(identity.harness.fakeIdb.values.entries())));
  const identityTransactionsAfterUnsafe = identity.harness.fakeIdb.transactions.length;
  identity.harness.eval(`undoStack.shift(); undoGeneration = ${Number(identityClaim?.undoGeneration) || 0};`);
  const identityHealthyRetry = await identity.harness.eval("undoLast()");

  const restore = await preparePlainRetainedCancellationOwner("Restore-rejected owner");
  const restoreResult = await restore.harness.eval("applyRestoredPayload(currentPortablePayload())");
  const restoreOwner = restore.harness.eval(`Array.from(activeMutations.values()).map(mutation => ({ retry: mutation.cancelNeedsRetry, retryClaim: mutation.retryClaim }))`);
  const restoreHealthyRetry = await restore.harness.eval("undoLast()");

  const allDirectBlocked = Object.values(direct).every(value => value === false);
  const accessibleRetryOnly = /Recovery needs a retry/i.test(retryMarkup)
    && /data-action="undo-last"/.test(retryMarkup)
    && (retryMarkup.match(/<(?:button|input|textarea|select)\b/g) || []).length === 1
    && /role="alert"/.test(retryMarkup);
  const lockSafe = locked.firstUndo === false
    && locked.beforeFailure === locked.afterFailure
    && locked.beforeFailureIdb === locked.afterFailureIdb
    && claim?.kind === "undo" && Boolean(claim.undoId) && Number.isInteger(claim.undoEntryGeneration) && Number.isInteger(claim.undoGeneration) && claimImmutable
    && accessibleRetryOnly && allDirectBlocked && pagehide === false && freeze === false
    && lockedBefore === lockedAfter && lockedIdbBefore === lockedIdbAfter
    && sideEffects.notificationCalls === 0 && sideEffects.prayerStatus === "Answered" && sideEffects.deferred === false && !sideEffects.pendingText && sideEffects.search === ""
    && sideEffects.transactionCount === transactionCount && sideEffects.writeCount === writeCount
    && healthyRetry === true
    && JSON.stringify(JSON.parse(healthyFinal.target).grab) === JSON.stringify(JSON.parse(locked.target).grab)
    && healthyFinal.undoCount === 0 && healthyFinal.ownerCount === 0;
  const identitySafe = identity.firstUndo === false
    && identityClaim?.kind === "undo" && unsafeRetry === false
    && identityBefore === identityAfter && identityIdbBefore === identityIdbAfter
    && identityTransactionsAfterUnsafe === identityTransactions
    && identityHealthyRetry === true;
  const restoreSafe = restore.firstUndo === false && restoreResult === false
    && restoreOwner.length === 1 && restoreOwner[0].retry === true && restoreOwner[0].retryClaim?.kind === "undo"
    && restoreHealthyRetry === true;
  assert(lockSafe && identitySafe && restoreSafe, `retained cancellation owner is an accessible retry-only lock bound to the original Undo identity [lock=${lockSafe}, identity=${identitySafe}, restore=${restoreSafe}]`);
}

function testRetryOwnerLeafGuardEnumeration() {
  const namedLeaves = [
    "togglePinnedPerson",
    "recordRecentPerson",
    "mergePeopleRecord",
    "dismissCoachSuggestion",
    "clearDismissedCoachSuggestions",
    "resetCustomCopy",
    "submitUnifiedCapture",
    "setSnooze",
    "removePersonPhoto",
    "updatePrayer"
  ];
  const missing = namedLeaves.filter(name => {
    const signature = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{\\s*if\\s*\\(recoveryMutationBlocked\\(\\)\\)\\s*return false;`);
    return !signature.test(scriptMatch[1]);
  });
  assert(missing.length === 0, `all ten audited retry-owner leaf mutators guard before their first side effect [missing=${missing.join(",") || "none"}]`);
}

function retryOwnerInvariantState(harness) {
  return harness.eval(`JSON.stringify({
    db,
    settings,
    customCopy,
    drafts: loadAutosaveDrafts(),
    memory: loadAutoMemoryVault(),
    view,
    focus: document.activeElement?.id || "",
    toast: { text: document.getElementById("toast").textContent, html: document.getElementById("toast").innerHTML },
    notificationCalls: Number(globalThis.__notificationCalls || 0),
    undoStack,
    undoGeneration,
    local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
    revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
    timers: { autosave: Boolean(autosaveTimer), vault: Boolean(vaultSaveTimer), search: Boolean(globalSearchTimer) },
    queue: { sequence: indexedDbQueueSequence, pending: indexedDbPendingCount },
    owner: Array.from(activeMutations.values()).map(mutation => ({
      id: mutation.id,
      kind: mutation.kind,
      cancelled: mutation.cancelled,
      retry: mutation.cancelNeedsRetry,
      settled: mutation.operationSettled,
      retryClaim: mutation.retryClaim
    }))
  })`);
}

async function testRetryOwnerContainsAllAuditedLeafMutators() {
  const locked = await preparePlainRetainedCancellationOwner("Audited leaf owner", { leafFixtures: true });
  const { harness } = locked;
  harness.elements["quick-text"].value = "Synthetic blocked leaf capture";
  harness.elements["quick-text"].tagName = "TEXTAREA";
  harness.sandbox.document.activeElement = harness.elements["quick-text"];
  harness.elements.toast.textContent = "Stable retry notice";
  harness.sandbox.__notificationCalls = 0;
  harness.sandbox.__confirmCalls = 0;
  harness.sandbox.window.confirm = () => { harness.sandbox.__confirmCalls += 1; return true; };
  const before = retryOwnerInvariantState(harness);
  const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  const beforeTransactions = harness.fakeIdb.transactions.length;
  const beforeWrites = harness.fakeIdb.writes.length;
  const results = harness.eval(`({
    pin: togglePinnedPerson("leaf-person-a"),
    recent: recordRecentPerson("leaf-person-b"),
    merge: mergePeopleRecord("leaf-person-a", "leaf-person-b"),
    dismiss: dismissCoachSuggestion("new-suggestion"),
    clearDismissed: clearDismissedCoachSuggestions(),
    resetCopy: resetCustomCopy(),
    capture: submitUnifiedCapture("main", "", "later"),
    snooze: setSnooze("${locked.grabId}", "tomorrow"),
    removePhoto: removePersonPhoto("leaf-person-photo"),
    prayer: updatePrayer("leaf-prayer", { status: "Answered" }, "Unsafe prayer update")
  })`);
  await flushControlledMicrotasks();
  await harness.fakeIdb.waitForIdle();
  const after = retryOwnerInvariantState(harness);
  const afterIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
  const lockedSafe = Object.values(results).every(value => value === false)
    && before === after
    && beforeIdb === afterIdb
    && harness.fakeIdb.transactions.length === beforeTransactions
    && harness.fakeIdb.writes.length === beforeWrites
    && harness.sandbox.__confirmCalls === 0;

  const normal = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
  });
  await normal.ready();
  normal.elements["quick-text"].value = "Synthetic normal leaf capture";
  normal.elements["quick-text"].tagName = "TEXTAREA";
  normal.sandbox.__confirmCalls = 0;
  normal.sandbox.window.confirm = () => { normal.sandbox.__confirmCalls += 1; return true; };
  normal.eval(`
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: false, pinnedPersonIds: [], recentPersonIds: [], appCoachDismissed: { existing: "2026-07-19T00:00:00.000Z" } });
    db = normalizeData({ ...emptyData(),
      people: [
        { id: "normal-person-a", name: "Normal A", phone: "555-0102", photoDataUrl: "", updatedAt: "2026-07-19T00:00:00.000Z" },
        { id: "normal-person-b", name: "Normal B", phone: "", photoDataUrl: "", updatedAt: "2026-07-19T00:00:00.000Z" },
        { id: "normal-person-photo", name: "Normal Photo", photoDataUrl: "data:image/png;base64,c3ludGhldGlj", updatedAt: "2026-07-19T00:00:00.000Z" }
      ],
      quickGrabs: [makeQuickGrab("Synthetic normal snooze", [], "Whenever", null, { captureSource: "main" })],
      prayerRequests: [{ id: "normal-prayer", request: "Synthetic normal prayer", status: "Active", updatedAt: "2026-07-19T00:00:00.000Z" }]
    });
    db.quickGrabs[0].id = "normal-grab";
    customCopy = { "brand.title": "Synthetic normal wording" };
    saveSettings(); saveData(); saveCustomCopy();
  `);
  await normal.eval("drainIndexedDbCoordinator()");
  normal.eval(`
    togglePinnedPerson("normal-person-a");
    recordRecentPerson("normal-person-b");
    mergePeopleRecord("normal-person-a", "normal-person-b");
    dismissCoachSuggestion("new-suggestion");
    clearDismissedCoachSuggestions();
    resetCustomCopy();
    submitUnifiedCapture("main", "", "later");
    setSnooze("normal-grab", "tomorrow");
    removePersonPhoto("normal-person-photo");
    updatePrayer("normal-prayer", { status: "Answered" }, "Synthetic prayer updated");
  `);
  await normal.eval("drainIndexedDbCoordinator()");
  const normalState = normal.eval(`({
    merged: !personById("normal-person-a") && personById("normal-person-b")?.phone === "555-0102",
    pinned: settings.pinnedPersonIds.includes("normal-person-b"),
    recent: settings.recentPersonIds[0] === "normal-person-b",
    dismissedCleared: Object.keys(settings.appCoachDismissed).length === 0,
    copyReset: Object.keys(customCopy).length === 0,
    captureSaved: db.quickGrabs.some(item => item.rawContent === "Synthetic normal leaf capture"),
    snoozed: db.quickGrabs.find(item => item.id === "normal-grab")?.status === "Snoozed",
    photoRemoved: personById("normal-person-photo")?.photoDataUrl === "",
    prayerUpdated: db.prayerRequests.find(item => item.id === "normal-prayer")?.status === "Answered"
  })`);
  const normalSafe = Object.values(normalState).every(Boolean) && normal.sandbox.__confirmCalls === 1;
  assert(lockedSafe && normalSafe, `all ten audited leaf mutators are byte-inert under a retained owner and preserve normal no-owner behavior [locked=${lockedSafe}, normal=${normalSafe}]`);
}

async function prepareEncryptedRetainedCancellationOwner(label) {
  const harness = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: {}
  });
  await harness.ready();
  const fetchStarted = deferred();
  const fetchResult = deferred();
  harness.sandbox.fetch = () => { fetchStarted.resolve(); return fetchResult.promise; };
  let envelopeSequence = 0;
  harness.sandbox.__healthyCancellationEncrypt = async payload => ({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "synthetic-salt",
    iv: "synthetic-iv",
    ciphertext: `synthetic-ciphertext-${++envelopeSequence}`,
    encryptedAt: `synthetic-encrypted-${envelopeSequence}`,
    payload: clone(payload)
  });
  const grabId = harness.eval(`(() => {
    settings = normalizeSettings({ ...settings, enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: true, quickGrabAiMode: "backendQuickGrab", aiMockMode: false });
    vaultPassphrase = "synthetic-device-vault-passphrase";
    memoryVaultCache = emptyAutoMemoryVault();
    encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload);
    const grab = makeQuickGrab(${JSON.stringify(label)}, [], "Whenever", null, { captureSource: "main" });
    grab.processingState = "awaitingApproval";
    db.quickGrabs = [grab];
    saveData();
    return grab.id;
  })()`);
  await harness.eval("persistEncryptedVault()");
  harness.eval(`recordUndo(${JSON.stringify(`${label} target`)})`);
  const target = harness.eval(`JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache })`);
  const backend = harness.eval(`createQuickGrabBackendAiProposal("${grabId}")`);
  await fetchStarted.promise;
  await harness.eval("persistEncryptedVault()");
  harness.fakeIdb.failNextTransaction = true;
  const firstUndo = await harness.eval("undoLast()");
  fetchResult.reject(new Error(`synthetic ${label} request settled after retained Device Vault cancellation`));
  await backend;
  return { harness, grabId, target, firstUndo };
}

async function testCancellationCryptoDeadlineSuppressesLateResults() {
  function recoveryState(harness) {
    return harness.eval(`JSON.stringify({
      db,
      settings,
      customCopy,
      memoryVaultCache,
      undoStack,
      local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
      revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
      owner: Array.from(activeMutations.values()).map(mutation => ({ retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled, retryClaim: mutation.retryClaim }))
    })`);
  }

  async function runRealPriorFlushLateCase(outcome, startLaterRetryBeforeRelease = false, gateTransactionAfterEncryption = false) {
    const prior = await prepareEncryptedRetainedCancellationOwner(`Real prior-vault ${outcome}`);
    const priorTimers = makeControlledTimers();
    prior.harness.sandbox.setTimeout = priorTimers.setTimeout.bind(priorTimers);
    prior.harness.sandbox.clearTimeout = priorTimers.clearTimeout.bind(priorTimers);
    prior.harness.sandbox.window.setTimeout = prior.harness.sandbox.setTimeout;
    prior.harness.sandbox.window.clearTimeout = prior.harness.sandbox.clearTimeout;
    const knownEnvelope = {
      kind: "ruf-ministry-hub-encrypted",
      version: 1,
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: 150000,
      salt: "known-salt",
      iv: "known-iv",
      ciphertext: "known-ciphertext",
      encryptedAt: "known-encrypted-at"
    };
    prior.harness.sandbox.__knownPriorEnvelope = clone(knownEnvelope);
    prior.harness.eval(`
      vaultSaveRequestedRevision = 7;
      vaultSaveCompletedRevision = 6;
      settings.localEncryptionUpdatedAt = globalThis.__knownPriorEnvelope.encryptedAt;
      indexedDbFailedKeys.clear();
      writeLocalStorageBatch([
        [ENCRYPTED_STORAGE_KEY, JSON.stringify(globalThis.__knownPriorEnvelope)],
        [SETTINGS_KEY, JSON.stringify(settings)],
        [STORAGE_KEY, null],
        [COPY_KEY, null],
        [AUTOSAVE_KEY, null],
        [AUTO_MEMORY_KEY, null]
      ]);
    `);
    const knownSettings = prior.harness.eval("cloneJson(settings)");
    prior.harness.fakeIdb.values.set(KEYS.encrypted, clone(knownEnvelope));
    prior.harness.fakeIdb.values.set(KEYS.settings, clone(knownSettings));
    [KEYS.data, KEYS.copy, KEYS.autosave, KEYS.autoMemory].forEach(key => prior.harness.fakeIdb.values.delete(key));
    const encryptStarted = deferred();
    const encryptGate = deferred();
    prior.harness.sandbox.__realPriorEncrypt = payload => {
      encryptStarted.resolve(clone(payload));
      return encryptGate.promise;
    };
    const transactionGate = gateTransactionAfterEncryption ? prior.harness.fakeIdb.gateNextTransaction() : null;
    prior.harness.eval("encryptPayload = payload => globalThis.__realPriorEncrypt(payload)");
    const flushPromise = prior.harness.eval("flushEncryptedVaultSaves()");
    const latePayload = await encryptStarted.promise;
    const before = recoveryState(prior.harness);
    const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(prior.harness.fakeIdb.values.entries())));
    const beforeTransactions = prior.harness.fakeIdb.transactions.length;
    const beforeWrites = prior.harness.fakeIdb.writes.length;
    const beforeAborts = prior.harness.fakeIdb.abortCount;
    let retrySettled = false;
    let retryResult = null;
    const retry = prior.harness.eval("undoLast()").then(value => { retrySettled = true; retryResult = value; });
    await flushControlledMicrotasks();
    const deadline = prior.harness.eval("RECOVERY_CRYPTO_DEADLINE_MS");
    priorTimers.advanceBy(deadline - 1);
    await flushControlledMicrotasks();
    const beforeDeadline = !retrySettled;
    if (transactionGate) {
      encryptGate.resolve({
        ...knownEnvelope,
        ciphertext: "late-ciphertext",
        encryptedAt: "late-encrypted-at",
        payload: latePayload
      });
      await transactionGate.started.promise;
      await flushControlledMicrotasks();
    }
    priorTimers.advanceBy(1);
    await flushControlledMicrotasks();
    const atDeadline = retrySettled && retryResult === false;
    await retry;
    const afterTimeout = recoveryState(prior.harness);
    const afterTimeoutIdb = JSON.stringify(Object.fromEntries(Array.from(prior.harness.fakeIdb.values.entries())));
    const timeoutTransactions = prior.harness.fakeIdb.transactions.length;
    const timeoutWrites = prior.harness.fakeIdb.writes.length;
    const timeoutSurface = prior.harness.eval(`JSON.stringify({
      toast: document.getElementById("toast").textContent,
      timer: Boolean(vaultSaveTimer),
      ownerCount: activeMutations.size,
      undoCount: undoStack.length
    })`);
    const revokedCertificate = transactionGate
      ? prior.harness.eval("revokedVaultFlushSettlement ? cloneJson(revokedVaultFlushSettlement) : null")
      : null;
    let laterRetryPending = true;
    let laterRetryResult = null;
    let laterRetry = null;
    let transactionRetryBeforeRelease = null;
    if (startLaterRetryBeforeRelease) {
      let laterRetrySettled = false;
      if (transactionGate) {
        prior.harness.sandbox.__calm27LeaseEvidence = [];
        prior.harness.eval(`
          encryptPayload = async payload => {
            if (activeVaultFlushLease) {
              globalThis.__calm27LeaseEvidence.push({
                id: activeVaultFlushLease.id,
                recoveryEpoch: activeVaultFlushLease.recoveryEpoch,
                targetRevision: activeVaultFlushLease.targetRevision,
                payloadGeneration: activeVaultFlushLease.payloadGeneration,
                passphraseCurrent: activeVaultFlushLease.passphrase === vaultPassphrase
              });
            }
            return globalThis.__healthyCancellationEncrypt(payload);
          };
        `);
      }
      laterRetry = prior.harness.eval("undoLast()").then(value => {
        laterRetrySettled = true;
        laterRetryResult = value;
      });
      await flushControlledMicrotasks();
      laterRetryPending = !laterRetrySettled;
      if (transactionGate) {
        await laterRetry;
        await flushControlledMicrotasks(20);
        await prior.harness.fakeIdb.waitForIdle();
        transactionRetryBeforeRelease = {
          state: recoveryState(prior.harness),
          idb: JSON.stringify(Object.fromEntries(Array.from(prior.harness.fakeIdb.values.entries()))),
          surface: prior.harness.eval(`JSON.stringify({
            toast: document.getElementById("toast").textContent,
            timer: Boolean(vaultSaveTimer),
            ownerCount: activeMutations.size,
            undoCount: undoStack.length
          })`),
          evidence: prior.harness.eval(`({
            target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
            revisionsEqual: vaultSaveRequestedRevision === vaultSaveCompletedRevision,
            recoveryEpoch,
            certificate: revokedVaultFlushSettlement,
            activeLease: activeVaultFlushLease
          })`),
          transactions: prior.harness.fakeIdb.transactions.length,
          writes: prior.harness.fakeIdb.writes.length,
          leaseEvidence: clone(prior.harness.sandbox.__calm27LeaseEvidence)
        };
      }
    }
    if (transactionGate) {
      transactionGate.resolve();
    } else if (outcome === "fulfill") {
      encryptGate.resolve({
        ...knownEnvelope,
        ciphertext: "late-ciphertext",
        encryptedAt: "late-encrypted-at",
        payload: latePayload
      });
    } else {
      encryptGate.reject(new Error("synthetic late prior-vault encryption rejection"));
    }
    const flushResult = await flushPromise;
    if (laterRetry) await laterRetry;
    await flushControlledMicrotasks(20);
    await prior.harness.fakeIdb.waitForIdle();
    const afterLate = recoveryState(prior.harness);
    const afterLateIdb = JSON.stringify(Object.fromEntries(Array.from(prior.harness.fakeIdb.values.entries())));
    const afterLateSurface = prior.harness.eval(`JSON.stringify({
      toast: document.getElementById("toast").textContent,
      timer: Boolean(vaultSaveTimer),
      ownerCount: activeMutations.size,
      undoCount: undoStack.length
    })`);
    const transactionSurfaceSafe = transactionGate
      ? timeoutTransactions === beforeTransactions + 1
        && timeoutWrites === beforeWrites + 6
        && prior.harness.fakeIdb.abortCount === beforeAborts + 1
        && prior.harness.fakeIdb.activeTransactions === 0
      : timeoutTransactions === beforeTransactions
        && timeoutWrites === beforeWrites
        && prior.harness.fakeIdb.abortCount === beforeAborts;
    const freshTransactionRetrySafe = transactionGate && startLaterRetryBeforeRelease
      ? laterRetryResult === true
        && Boolean(revokedCertificate?.leaseId)
        && transactionRetryBeforeRelease?.leaseEvidence?.length >= 1
        && transactionRetryBeforeRelease.leaseEvidence[0].id !== revokedCertificate.leaseId
        && transactionRetryBeforeRelease.leaseEvidence[0].recoveryEpoch > revokedCertificate.recoveryEpoch
        && transactionRetryBeforeRelease.leaseEvidence[0].targetRevision === revokedCertificate.targetRevision
        && transactionRetryBeforeRelease.leaseEvidence[0].payloadGeneration === revokedCertificate.payloadGeneration
        && transactionRetryBeforeRelease.leaseEvidence[0].passphraseCurrent === true
        && transactionRetryBeforeRelease.evidence.target === prior.target
        && JSON.parse(transactionRetryBeforeRelease.surface).ownerCount === 0
        && JSON.parse(transactionRetryBeforeRelease.surface).undoCount === 0
        && transactionRetryBeforeRelease.evidence.revisionsEqual === true
        && transactionRetryBeforeRelease.evidence.certificate === null
        && transactionRetryBeforeRelease.evidence.activeLease === null
      : true;
    const oldTransactionReleaseIsInert = transactionGate && startLaterRetryBeforeRelease
      ? transactionRetryBeforeRelease.state === afterLate
        && transactionRetryBeforeRelease.idb === afterLateIdb
        && transactionRetryBeforeRelease.surface === afterLateSurface
        && transactionRetryBeforeRelease.transactions === prior.harness.fakeIdb.transactions.length
        && transactionRetryBeforeRelease.writes === prior.harness.fakeIdb.writes.length
      : afterTimeout === afterLate && afterTimeoutIdb === afterLateIdb && timeoutSurface === afterLateSurface;
    const lateSafe = prior.firstUndo === false && beforeDeadline && atDeadline
      && before === afterTimeout && beforeIdb === afterTimeoutIdb
      && transactionSurfaceSafe
      && flushResult === false
      && oldTransactionReleaseIsInert
      && (transactionGate && startLaterRetryBeforeRelease
        ? freshTransactionRetrySafe
        : prior.harness.fakeIdb.transactions.length === timeoutTransactions
          && prior.harness.fakeIdb.writes.length === timeoutWrites
          && (!startLaterRetryBeforeRelease || (laterRetryPending && laterRetryResult === false)));
    let healthy = true;
    if (!(transactionGate && startLaterRetryBeforeRelease)) {
      prior.harness.eval("encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload)");
      healthy = await prior.harness.eval("undoLast()");
    }
    const final = prior.harness.eval(`({
      target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
      undoCount: undoStack.length,
      ownerCount: activeMutations.size,
      revisionsEqual: vaultSaveRequestedRevision === vaultSaveCompletedRevision,
      timer: Boolean(vaultSaveTimer)
    })`);
    return lateSafe && healthy === true && final.target === prior.target
      && final.undoCount === 0 && final.ownerCount === 0 && final.revisionsEqual && !final.timer;
  }

  const priorFulfillSafe = await runRealPriorFlushLateCase("fulfill");
  const priorRejectSafe = await runRealPriorFlushLateCase("reject");
  const laterRetryFulfillSafe = await runRealPriorFlushLateCase("fulfill", true);
  const laterRetryRejectSafe = await runRealPriorFlushLateCase("reject", true);
  const transactionDeadlineSafe = await runRealPriorFlushLateCase("fulfill", false, true);
  const transactionDeadlineE2Safe = await runRealPriorFlushLateCase("fulfill", true, true);

  const priorFalse = await prepareEncryptedRetainedCancellationOwner("Prior-vault false result");
  const deadline = priorFalse.harness.eval("RECOVERY_CRYPTO_DEADLINE_MS");
  priorFalse.harness.sandbox.__falsePriorVault = Promise.resolve(false);
  priorFalse.harness.sandbox.__unexpectedCancellationEncryptCalls = 0;
  priorFalse.harness.sandbox.__unexpectedCancellationEncrypt = async payload => {
    priorFalse.harness.sandbox.__unexpectedCancellationEncryptCalls += 1;
    return priorFalse.harness.sandbox.__healthyCancellationEncrypt(payload);
  };
  priorFalse.harness.eval(`
    vaultSaveInFlight = globalThis.__falsePriorVault;
    encryptPayload = payload => globalThis.__unexpectedCancellationEncrypt(payload);
  `);
  const priorFalseBefore = recoveryState(priorFalse.harness);
  const priorFalseIdbBefore = JSON.stringify(Object.fromEntries(Array.from(priorFalse.harness.fakeIdb.values.entries())));
  const priorFalseTransactions = priorFalse.harness.fakeIdb.transactions.length;
  const priorFalseWrites = priorFalse.harness.fakeIdb.writes.length;
  const priorFalseResult = await priorFalse.harness.eval("undoLast()");
  await flushControlledMicrotasks();
  const priorFalseAfter = recoveryState(priorFalse.harness);
  const priorFalseIdbAfter = JSON.stringify(Object.fromEntries(Array.from(priorFalse.harness.fakeIdb.values.entries())));
  const priorFalseTransactionsAfterResult = priorFalse.harness.fakeIdb.transactions.length;
  const priorFalseWritesAfterResult = priorFalse.harness.fakeIdb.writes.length;
  const priorFalseEncryptCalls = priorFalse.harness.sandbox.__unexpectedCancellationEncryptCalls;
  priorFalse.harness.eval("vaultSaveInFlight = null; encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload)");
  const priorFalseHealthy = await priorFalse.harness.eval("undoLast()");
  const priorFalseFinal = priorFalse.harness.eval(`({ target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }), undoCount: undoStack.length, ownerCount: activeMutations.size })`);

  const fresh = await prepareEncryptedRetainedCancellationOwner("Fresh-encrypt deadline");
  const freshTimers = makeControlledTimers();
  fresh.harness.sandbox.setTimeout = freshTimers.setTimeout.bind(freshTimers);
  fresh.harness.sandbox.clearTimeout = freshTimers.clearTimeout.bind(freshTimers);
  fresh.harness.sandbox.window.setTimeout = fresh.harness.sandbox.setTimeout;
  fresh.harness.sandbox.window.clearTimeout = fresh.harness.sandbox.clearTimeout;
  const encryptStarted = deferred();
  const encryptGate = deferred();
  fresh.harness.sandbox.__neverCancellationEncrypt = payload => {
    encryptStarted.resolve();
    return encryptGate.promise;
  };
  fresh.harness.eval("encryptPayload = payload => globalThis.__neverCancellationEncrypt(payload)");
  const freshBefore = recoveryState(fresh.harness);
  const freshIdbBefore = JSON.stringify(Object.fromEntries(Array.from(fresh.harness.fakeIdb.values.entries())));
  let freshSettled = false;
  let freshResult = null;
  const freshRetry = fresh.harness.eval("undoLast()").then(value => { freshSettled = true; freshResult = value; });
  await encryptStarted.promise;
  freshTimers.advanceBy(deadline - 1);
  await flushControlledMicrotasks();
  const freshBeforeDeadline = !freshSettled;
  freshTimers.advanceBy(1);
  await flushControlledMicrotasks();
  const freshAtDeadline = freshSettled && freshResult === false;
  await freshRetry;
  const freshAfterTimeout = recoveryState(fresh.harness);
  const freshIdbAfterTimeout = JSON.stringify(Object.fromEntries(Array.from(fresh.harness.fakeIdb.values.entries())));
  const latePayload = fresh.harness.eval("cloneJson(encryptedVaultPayloadSnapshot())");
  encryptGate.resolve({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "late-salt",
    iv: "late-iv",
    ciphertext: "late-ciphertext",
    encryptedAt: "late-encrypted",
    payload: latePayload
  });
  await flushControlledMicrotasks(20);
  const freshAfterLate = recoveryState(fresh.harness);
  const freshIdbAfterLate = JSON.stringify(Object.fromEntries(Array.from(fresh.harness.fakeIdb.values.entries())));
  fresh.harness.eval("encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload)");
  const freshHealthy = await fresh.harness.eval("undoLast()");
  const freshFinal = fresh.harness.eval(`({ target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }), undoCount: undoStack.length, ownerCount: activeMutations.size })`);

  const priorFalseSafe = priorFalse.firstUndo === false && priorFalseResult === false
    && priorFalseBefore === priorFalseAfter && priorFalseIdbBefore === priorFalseIdbAfter
    && priorFalseTransactionsAfterResult === priorFalseTransactions
    && priorFalseWritesAfterResult === priorFalseWrites
    && priorFalseEncryptCalls === 0
    && priorFalseHealthy === true && priorFalseFinal.target === priorFalse.target
    && priorFalseFinal.undoCount === 0 && priorFalseFinal.ownerCount === 0;
  const freshSafe = fresh.firstUndo === false && freshBeforeDeadline && freshAtDeadline
    && freshBefore === freshAfterTimeout && freshAfterTimeout === freshAfterLate
    && freshIdbBefore === freshIdbAfterTimeout && freshIdbAfterTimeout === freshIdbAfterLate
    && freshHealthy === true && freshFinal.target === fresh.target && freshFinal.undoCount === 0 && freshFinal.ownerCount === 0;
  assert(priorFulfillSafe && priorRejectSafe && laterRetryFulfillSafe && laterRetryRejectSafe && transactionDeadlineSafe && transactionDeadlineE2Safe && priorFalseSafe && freshSafe, `Device Vault cancellation deadline revokes a transaction-gated prior save before E+1/E+2 recovery unlock, fences late fulfillment/rejection, suppresses fresh late encryption, and stops after a prior false result before one healthy retry [priorFulfill=${priorFulfillSafe}, priorReject=${priorRejectSafe}, laterRetryFulfill=${laterRetryFulfillSafe}, laterRetryReject=${laterRetryRejectSafe}, transactionE1=${transactionDeadlineSafe}, transactionE2=${transactionDeadlineE2Safe}, priorFalse=${priorFalseSafe}, fresh=${freshSafe}]`);
}

async function testDynamicSettlementLeaseAndCertificateIdentity() {
  function recoveryState(harness) {
    return harness.eval(`JSON.stringify({
      db,
      settings,
      customCopy,
      memoryVaultCache,
      undoStack,
      local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()),
      revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
      owner: Array.from(activeMutations.values()).map(mutation => ({ retry: mutation.cancelNeedsRetry, settled: mutation.operationSettled, retryClaim: mutation.retryClaim }))
    })`);
  }

  async function prepareTerminalCertificate(label) {
    const prepared = await prepareEncryptedRetainedCancellationOwner(label);
    const { harness } = prepared;
    const timers = makeControlledTimers();
    harness.sandbox.setTimeout = timers.setTimeout.bind(timers);
    harness.sandbox.clearTimeout = timers.clearTimeout.bind(timers);
    harness.sandbox.window.setTimeout = harness.sandbox.setTimeout;
    harness.sandbox.window.clearTimeout = harness.sandbox.clearTimeout;
    const knownEnvelope = {
      kind: "ruf-ministry-hub-encrypted",
      version: 1,
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: 150000,
      salt: "calm28-known-salt",
      iv: "calm28-known-iv",
      ciphertext: "calm28-known-ciphertext",
      encryptedAt: "calm28-known-encrypted-at"
    };
    harness.sandbox.__calm28KnownEnvelope = clone(knownEnvelope);
    harness.eval(`
      vaultSaveRequestedRevision = 7;
      vaultSaveCompletedRevision = 6;
      settings.localEncryptionUpdatedAt = globalThis.__calm28KnownEnvelope.encryptedAt;
      indexedDbFailedKeys.clear();
      writeLocalStorageBatch([
        [ENCRYPTED_STORAGE_KEY, JSON.stringify(globalThis.__calm28KnownEnvelope)],
        [SETTINGS_KEY, JSON.stringify(settings)],
        [STORAGE_KEY, null],
        [COPY_KEY, null],
        [AUTOSAVE_KEY, null],
        [AUTO_MEMORY_KEY, null]
      ]);
    `);
    harness.fakeIdb.values.set(KEYS.encrypted, clone(knownEnvelope));
    harness.fakeIdb.values.set(KEYS.settings, harness.eval("cloneJson(settings)"));
    [KEYS.data, KEYS.copy, KEYS.autosave, KEYS.autoMemory].forEach(key => harness.fakeIdb.values.delete(key));
    const oldEncryptStarted = deferred();
    const oldEncryptGate = deferred();
    harness.sandbox.__calm28OldEncrypt = payload => {
      oldEncryptStarted.resolve(clone(payload));
      return oldEncryptGate.promise;
    };
    const oldTransactionGate = harness.fakeIdb.gateNextTransaction();
    harness.eval("encryptPayload = payload => globalThis.__calm28OldEncrypt(payload)");
    const oldFlush = harness.eval("flushEncryptedVaultSaves()");
    const oldPayload = await oldEncryptStarted.promise;
    let firstRetrySettled = false;
    let firstRetryResult = null;
    const firstRetry = harness.eval("undoLast()").then(value => {
      firstRetrySettled = true;
      firstRetryResult = value;
    });
    await flushControlledMicrotasks();
    const deadline = harness.eval("RECOVERY_CRYPTO_DEADLINE_MS");
    timers.advanceBy(deadline - 1);
    await flushControlledMicrotasks();
    const beforeDeadline = !firstRetrySettled;
    oldEncryptGate.resolve({
      ...knownEnvelope,
      ciphertext: "calm28-old-late-ciphertext",
      encryptedAt: "calm28-old-late-encrypted-at",
      payload: oldPayload
    });
    await oldTransactionGate.started.promise;
    await flushControlledMicrotasks();
    timers.advanceBy(1);
    await flushControlledMicrotasks();
    await firstRetry;
    const oldFlushResult = await oldFlush;
    const certificate = harness.eval("revokedVaultFlushSettlement ? cloneJson(revokedVaultFlushSettlement) : null");
    if (!(prepared.firstUndo === false && beforeDeadline && firstRetryResult === false && oldFlushResult === false && certificate?.leaseId)) {
      throw new Error(`could not establish exact terminal certificate [firstUndo=${prepared.firstUndo}, beforeDeadline=${beforeDeadline}, firstRetry=${firstRetryResult}, oldFlush=${oldFlushResult}, certificate=${Boolean(certificate?.leaseId)}]`);
    }
    return { ...prepared, timers, deadline, oldTransactionGate, certificate };
  }

  async function runFreshSettlementStall(phase, lateOutcome = "fulfill") {
    const prepared = await prepareTerminalCertificate(`CALM28 ${phase} ${lateOutcome}`);
    const { harness, timers, deadline, oldTransactionGate, certificate } = prepared;
    const before = recoveryState(harness);
    const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const beforeTransactions = harness.fakeIdb.transactions.length;
    const beforeWrites = harness.fakeIdb.writes.length;
    const beforeAborts = harness.fakeIdb.abortCount;
    const freshEncryptStarted = deferred();
    const freshEncryptGate = deferred();
    harness.sandbox.__calm28FreshEncrypt = payload => {
      freshEncryptStarted.resolve(clone(payload));
      return freshEncryptGate.promise;
    };
    const freshTransactionGate = phase === "transaction" ? harness.fakeIdb.gateNextTransaction() : null;
    if (phase === "encryption") {
      harness.eval("encryptPayload = payload => globalThis.__calm28FreshEncrypt(payload)");
    } else {
      harness.eval("encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload)");
    }
    let secondRetrySettled = false;
    let secondRetryResult = null;
    const secondRetry = harness.eval("undoLast()").then(value => {
      secondRetrySettled = true;
      secondRetryResult = value;
    });
    if (phase === "encryption") await freshEncryptStarted.promise;
    else await freshTransactionGate.started.promise;
    await flushControlledMicrotasks();
    const leaseAtStall = harness.eval(`activeVaultFlushLease ? ({
      id: activeVaultFlushLease.id,
      recoveryEpoch: activeVaultFlushLease.recoveryEpoch,
      passphraseCurrent: activeVaultFlushLease.passphrase === vaultPassphrase,
      targetRevision: activeVaultFlushLease.targetRevision,
      payloadGeneration: activeVaultFlushLease.payloadGeneration
    }) : null`);
    timers.advanceBy(deadline - 1);
    await flushControlledMicrotasks();
    const beforeDeadline = !secondRetrySettled;
    timers.advanceBy(1);
    await flushControlledMicrotasks();
    await secondRetry;
    const afterTimeout = recoveryState(harness);
    const afterTimeoutIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const timeoutLease = harness.eval(`({
      active: activeVaultFlushLease ? ({ id: activeVaultFlushLease.id, revoked: activeVaultFlushLease.revoked, allowFollowup: activeVaultFlushLease.allowFollowup }) : null,
      trustedRevokedId: trustedRevokedVaultFlushLeaseId,
      certificate: revokedVaultFlushSettlement ? cloneJson(revokedVaultFlushSettlement) : null
    })`);
    const timeoutTransactions = harness.fakeIdb.transactions.length;
    const timeoutWrites = harness.fakeIdb.writes.length;
    const timeoutAborts = harness.fakeIdb.abortCount;
    if (phase === "encryption") {
      if (lateOutcome === "reject") freshEncryptGate.reject(new Error("synthetic CALM28 late fresh encryption rejection"));
      else freshEncryptGate.resolve(await harness.sandbox.__healthyCancellationEncrypt(harness.eval("cloneJson(encryptedVaultPayloadSnapshot())")));
    } else {
      freshTransactionGate.resolve();
    }
    await flushControlledMicrotasks(30);
    await harness.fakeIdb.waitForIdle();
    const afterLate = recoveryState(harness);
    const afterLateIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const afterLateTransactions = harness.fakeIdb.transactions.length;
    const afterLateWrites = harness.fakeIdb.writes.length;
    const afterLateAborts = harness.fakeIdb.abortCount;
    const afterLateSurface = harness.eval(`({
      certificate: revokedVaultFlushSettlement,
      activeLease: activeVaultFlushLease,
      timer: Boolean(vaultSaveTimer),
      ownerCount: activeMutations.size,
      undoCount: undoStack.length
    })`);
    oldTransactionGate.resolve();
    await flushControlledMicrotasks(20);
    const afterOldRelease = recoveryState(harness);
    const afterOldReleaseIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const afterOldReleaseTransactions = harness.fakeIdb.transactions.length;
    const afterOldReleaseWrites = harness.fakeIdb.writes.length;
    const afterOldReleaseAborts = harness.fakeIdb.abortCount;
    harness.eval("encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload)");
    const thirdRetry = await harness.eval("undoLast()");
    await flushControlledMicrotasks(20);
    await harness.fakeIdb.waitForIdle();
    const final = harness.eval(`({
      target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
      undoCount: undoStack.length,
      ownerCount: activeMutations.size,
      revisionsEqual: vaultSaveRequestedRevision === vaultSaveCompletedRevision,
      timer: Boolean(vaultSaveTimer),
      activeLease: activeVaultFlushLease,
      certificate: revokedVaultFlushSettlement
    })`);
    const exactDynamicLease = Boolean(leaseAtStall?.id)
      && leaseAtStall.id !== certificate.leaseId
      && leaseAtStall.passphraseCurrent === true
      && leaseAtStall.targetRevision === certificate.targetRevision
      && leaseAtStall.payloadGeneration === certificate.payloadGeneration
      && timeoutLease.trustedRevokedId === leaseAtStall.id
      && (timeoutLease.active
        ? timeoutLease.active.id === leaseAtStall.id
          && timeoutLease.active.revoked === true
          && timeoutLease.active.allowFollowup === false
        : phase === "transaction" && timeoutLease.certificate?.leaseId === leaseAtStall.id);
    const timeoutSafe = prepared.firstUndo === false && beforeDeadline && secondRetryResult === false
      && before === afterTimeout && beforeIdb === afterTimeoutIdb
      && exactDynamicLease
      && (phase === "transaction" ? timeoutAborts === beforeAborts + 1 : timeoutAborts === beforeAborts)
      && timeoutTransactions === beforeTransactions + (phase === "transaction" ? 1 : 0)
      && timeoutWrites === beforeWrites + (phase === "transaction" ? 6 : 0);
    const lateSafe = afterTimeout === afterLate && afterTimeoutIdb === afterLateIdb
      && afterLate === afterOldRelease && afterLateIdb === afterOldReleaseIdb
      && afterLateTransactions === timeoutTransactions && afterLateWrites === timeoutWrites && afterLateAborts === timeoutAborts
      && afterOldReleaseTransactions === timeoutTransactions && afterOldReleaseWrites === timeoutWrites && afterOldReleaseAborts === timeoutAborts
      && afterLateSurface.activeLease === null && !afterLateSurface.timer
      && afterLateSurface.ownerCount === 1 && afterLateSurface.undoCount === 1;
    const healthySafe = thirdRetry === true && final.target === prepared.target
      && final.undoCount === 0 && final.ownerCount === 0 && final.revisionsEqual
      && !final.timer && final.activeLease === null && final.certificate === null;
    return timeoutSafe && lateSafe && healthySafe;
  }

  async function runCertificateLeaseIdMismatch() {
    const prepared = await prepareTerminalCertificate("CALM28 certificate lease identity");
    const { harness, oldTransactionGate, certificate } = prepared;
    const before = recoveryState(harness);
    const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const beforeTransactions = harness.fakeIdb.transactions.length;
    const beforeWrites = harness.fakeIdb.writes.length;
    harness.sandbox.__calm28OriginalCertificate = clone(certificate);
    harness.sandbox.__calm28MismatchEncryptCalls = 0;
    harness.sandbox.__calm28MismatchEncrypt = async payload => {
      harness.sandbox.__calm28MismatchEncryptCalls += 1;
      return harness.sandbox.__healthyCancellationEncrypt(payload);
    };
    harness.eval(`
      revokedVaultFlushSettlement.leaseId = ${Number(certificate.leaseId) + 1000};
      encryptPayload = payload => globalThis.__calm28MismatchEncrypt(payload);
    `);
    const mutatedCertificate = harness.eval("cloneJson(revokedVaultFlushSettlement)");
    const mismatchResult = await harness.eval("undoLast()");
    await flushControlledMicrotasks();
    const after = recoveryState(harness);
    const afterIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const afterCertificate = harness.eval("revokedVaultFlushSettlement ? cloneJson(revokedVaultFlushSettlement) : null");
    const mismatchSafe = mismatchResult === false
      && harness.sandbox.__calm28MismatchEncryptCalls === 0
      && harness.fakeIdb.transactions.length === beforeTransactions
      && harness.fakeIdb.writes.length === beforeWrites
      && before === after && beforeIdb === afterIdb
      && JSON.stringify(afterCertificate) === JSON.stringify(mutatedCertificate)
      && harness.eval("activeVaultFlushLease === null");
    harness.eval(`
      revokedVaultFlushSettlement = cloneJson(globalThis.__calm28OriginalCertificate);
      encryptPayload = payload => globalThis.__healthyCancellationEncrypt(payload);
    `);
    oldTransactionGate.resolve();
    await flushControlledMicrotasks(20);
    const healthy = await harness.eval("undoLast()");
    const final = harness.eval(`({
      target: JSON.stringify({ grab: db.quickGrabs[0], memory: memoryVaultCache }),
      undoCount: undoStack.length,
      ownerCount: activeMutations.size,
      revisionsEqual: vaultSaveRequestedRevision === vaultSaveCompletedRevision,
      certificate: revokedVaultFlushSettlement
    })`);
    return mismatchSafe && healthy === true && final.target === prepared.target
      && final.undoCount === 0 && final.ownerCount === 0 && final.revisionsEqual && final.certificate === null;
  }

  const encryptionFulfillSafe = await runFreshSettlementStall("encryption", "fulfill");
  const encryptionRejectSafe = await runFreshSettlementStall("encryption", "reject");
  const transactionSafe = await runFreshSettlementStall("transaction");
  const certificateMismatchSafe = await runCertificateLeaseIdMismatch();
  assert(encryptionFulfillSafe && encryptionRejectSafe && transactionSafe && certificateMismatchSafe, `Device Vault settlement timeout revokes the dynamically active exact E+2 lease across encryption/IndexedDB stalls, makes late settlement inert, permits one E+3 retry, and rejects a mutated terminal certificate lease id without work or consumption [encryptFulfill=${encryptionFulfillSafe}, encryptReject=${encryptionRejectSafe}, transaction=${transactionSafe}, certificate=${certificateMismatchSafe}]`);
}

async function testCanonicalReconciliationRequiresMaintainedShapes() {
  const harness = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
  });
  await harness.ready();
  await harness.eval("drainIndexedDbCoordinator()");
  const ministryMarker = "FICTIONAL-MINISTRY-CONTENT-MUST-NOT-LOG";
  const invalidCases = [
    [KEYS.settings, "null"],
    [KEYS.calm, ministryMarker],
    [KEYS.data, JSON.stringify({ people: [], marker: ministryMarker })],
    [KEYS.copy, JSON.stringify([ministryMarker])],
    [KEYS.autosave, JSON.stringify([ministryMarker])],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "", snapshots: [{ payload: { data: { people: [], marker: ministryMarker } } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: "1", updatedAt: "", snapshots: [] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "", snapshots: [{ id: "missing-metadata", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "array-settings", savedAt: "2026-07-19T00:00:00.000Z", label: "Array settings", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: [ministryMarker], customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "array-wording", savedAt: "2026-07-19T00:00:00.000Z", label: "Array wording", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: [ministryMarker], autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "array-drafts", savedAt: "2026-07-19T00:00:00.000Z", label: "Array drafts", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: {}, autosaveDrafts: [ministryMarker] } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "string-payload-version", savedAt: "2026-07-19T00:00:00.000Z", label: "String version", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: "2", dataSchemaVersion: "3", data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "missing-ai-proposals", savedAt: "2026-07-19T00:00:00.000Z", label: "Missing proposal collection", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: (() => { const value = emptyData({ dataSchemaVersion: 3 }); delete value.aiProposals; return value; })(), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "empty-producer", savedAt: "2026-07-19T00:00:00.000Z", label: "", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [{ id: "collection-object", savedAt: "2026-07-19T00:00:00.000Z", label: "Collection object", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3, aiProposals: { marker: ministryMarker } }), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "", snapshots: [{ id: "missing-vault-time", savedAt: "2026-07-19T00:00:00.000Z", label: "Missing vault time", appVersion: "synthetic-v18", summary: "Synthetic summary", signature: "synthetic-signature", payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: emptyData({ dataSchemaVersion: 3 }), settings: {}, customCopy: {}, autosaveDrafts: {} } }] })],
    [KEYS.encrypted, JSON.stringify({ kind: "ruf-ministry-hub-encrypted", version: 1, ciphertext: ministryMarker })],
    [KEYS.encrypted, JSON.stringify({ kind: "ruf-ministry-hub-encrypted", version: "1", algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations: 150000, salt: "salt", iv: "iv", ciphertext: "cipher", encryptedAt: "2026-07-19T00:00:00.000Z" })],
    [KEYS.encrypted, JSON.stringify({ kind: "ruf-ministry-hub-encrypted", version: 1, algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations: "150000", salt: "salt", iv: "iv", ciphertext: "cipher", encryptedAt: "2026-07-19T00:00:00.000Z" })]
  ];
  const invalidLabels = [
    "null settings",
    "invalid Calm mode",
    "incomplete ministry data",
    "array wording",
    "array drafts",
    "incomplete Auto Memory payload",
    "string Auto Memory vault version",
    "missing Auto Memory snapshot metadata",
    "array Auto Memory payload settings",
    "array Auto Memory payload wording",
    "array Auto Memory payload drafts",
    "string Auto Memory payload version and schema",
    "current Auto Memory payload missing aiProposals",
    "empty Auto Memory producer metadata",
    "Auto Memory data collection object substitution",
    "nonempty Auto Memory vault missing updatedAt",
    "incomplete Device Vault envelope",
    "string Device Vault envelope version",
    "string Device Vault envelope iterations"
  ];
  const acceptedInvalidShapes = [];
  for (const [index, [key, raw]] of invalidCases.entries()) {
    harness.sandbox.localStorage.setItem(key, raw);
    harness.fakeIdb.values.set(key, { durable: `before-${key}` });
    harness.eval(`indexedDbFailedKeys.clear(); indexedDbFailedKeys.set(${JSON.stringify(key)}, { sequence: 0, label: "synthetic failed canonical key", error: new Error("synthetic") })`);
    const liveBefore = harness.eval(`JSON.stringify({ db, settings, customCopy, memoryVaultCache })`);
    const localBefore = harness.sandbox.localStorage.getItem(key);
    const idbBefore = JSON.stringify(harness.fakeIdb.values.get(key));
    const transactionCount = harness.fakeIdb.transactions.length;
    let errorMessage = "";
    try {
      await harness.eval("reconcileFailedIndexedDbKeys()");
    } catch (error) {
      errorMessage = String(error?.message || error);
    }
    const liveAfter = harness.eval(`JSON.stringify({ db, settings, customCopy, memoryVaultCache })`);
    const rejectedExactly = Boolean(errorMessage) && !errorMessage.includes(ministryMarker)
        && harness.fakeIdb.transactions.length === transactionCount
        && harness.eval(`indexedDbFailedKeys.has(${JSON.stringify(key)})`)
        && harness.sandbox.localStorage.getItem(key) === localBefore
        && JSON.stringify(harness.fakeIdb.values.get(key)) === idbBefore
        && liveAfter === liveBefore;
    if (rejectedExactly) {
      console.log(`PASS structurally invalid canonical ${invalidLabels[index]} is rejected before any reconciliation batch without clearing its ledger or logging fictional content`);
    } else {
      acceptedInvalidShapes.push(invalidLabels[index]);
    }
  }
  if (acceptedInvalidShapes.length) throw new Error(`canonical reconciliation accepted invalid shapes: ${acceptedInvalidShapes.join(", ")}`);

  harness.sandbox.localStorage.setItem(KEYS.settings, JSON.stringify({ enableUndo: true }));
  harness.sandbox.localStorage.setItem(KEYS.data, JSON.stringify({ people: [], marker: ministryMarker }));
  harness.fakeIdb.values.set(KEYS.settings, { durable: "aggregate-settings-before" });
  harness.fakeIdb.values.set(KEYS.data, { durable: "aggregate-data-before" });
  harness.eval(`indexedDbFailedKeys.clear(); indexedDbFailedKeys.set(SETTINGS_KEY, { sequence: 0, label: "synthetic aggregate settings", error: new Error("synthetic") }); indexedDbFailedKeys.set(STORAGE_KEY, { sequence: 0, label: "synthetic aggregate data", error: new Error("synthetic") })`);
  const aggregateTransactions = harness.fakeIdb.transactions.length;
  let aggregateError = "";
  try {
    await harness.eval("reconcileFailedIndexedDbKeys()");
  } catch (error) {
    aggregateError = String(error?.message || error);
  }
  assert(
    Boolean(aggregateError) && !aggregateError.includes(ministryMarker)
      && harness.fakeIdb.transactions.length === aggregateTransactions
      && harness.eval("indexedDbFailedKeys.has(SETTINGS_KEY) && indexedDbFailedKeys.has(STORAGE_KEY)")
      && JSON.stringify(harness.fakeIdb.values.get(KEYS.settings)) === JSON.stringify({ durable: "aggregate-settings-before" })
      && JSON.stringify(harness.fakeIdb.values.get(KEYS.data)) === JSON.stringify({ durable: "aggregate-data-before" }),
    "one invalid canonical key prevents the entire multi-key reconciliation batch and preserves every failed-key ledger entry"
  );

  const validData = emptyData({ dataSchemaVersion: 3, people: [{ id: "valid-positive", name: "Valid Positive" }] });
  const validMemory = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    snapshots: [{
      id: "memory_valid_positive",
      savedAt: "2026-07-19T00:00:00.000Z",
      label: "Valid positive",
      appVersion: "synthetic-v17",
      summary: "Synthetic summary",
      signature: "synthetic-signature",
      payload: { exportedAt: "2026-07-19T00:00:00.000Z", app: "RUF Ministry Hub", version: 2, dataSchemaVersion: 3, data: validData, settings: {}, customCopy: {}, autosaveDrafts: {} }
    }]
  };
  const validEnvelope = {
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "valid-salt",
    iv: "valid-iv",
    ciphertext: "valid-ciphertext",
    encryptedAt: "2026-07-19T00:00:00.000Z"
  };
  const validCases = [
    [KEYS.settings, JSON.stringify({ enableUndo: true, calmMode: true }), { enableUndo: true, calmMode: true }],
    [KEYS.calm, "on", "on"],
    [KEYS.data, JSON.stringify(validData), validData],
    [KEYS.copy, JSON.stringify({ title: "Valid wording" }), { title: "Valid wording" }],
    [KEYS.autosave, JSON.stringify({ "capture:main": { fields: { "quick-text": "Synthetic draft" } } }), { "capture:main": { fields: { "quick-text": "Synthetic draft" } } }],
    [KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "", snapshots: [] }), { version: 1, updatedAt: "", snapshots: [] }],
    [KEYS.autoMemory, JSON.stringify(validMemory), validMemory],
    [KEYS.encrypted, JSON.stringify(validEnvelope), validEnvelope]
  ];
  for (const [key, raw, expected] of validCases) {
    harness.sandbox.localStorage.setItem(key, raw);
    harness.fakeIdb.values.set(key, { stale: true });
    harness.eval(`indexedDbFailedKeys.clear(); indexedDbFailedKeys.set(${JSON.stringify(key)}, { sequence: 0, label: "synthetic valid canonical key", error: new Error("synthetic") })`);
    const reconciled = await harness.eval("reconcileFailedIndexedDbKeys()");
    assert(
      reconciled === true
        && !harness.eval(`indexedDbFailedKeys.has(${JSON.stringify(key)})`)
        && JSON.stringify(harness.fakeIdb.values.get(key)) === JSON.stringify(expected),
      `maintained canonical ${key} shape reconciles as one exact value without normalization`
    );
  }

  harness.sandbox.localStorage.removeItem(KEYS.copy);
  harness.fakeIdb.values.set(KEYS.copy, { stale: true });
  harness.eval(`indexedDbFailedKeys.clear(); indexedDbFailedKeys.set(COPY_KEY, { sequence: 0, label: "synthetic canonical delete", error: new Error("synthetic") })`);
  const deleted = await harness.eval("reconcileFailedIndexedDbKeys()");
  assert(deleted === true && !harness.fakeIdb.values.has(KEYS.copy) && harness.eval("indexedDbFailedKeys.size") === 0, "an intentionally missing canonical key reconciles as a durable delete");
}

async function testAggregateFifoWaitKeepsPerOperationDeadlines() {
  const harness = makeHarness({ idbSeed: {} });
  await harness.ready();
  await nextTurn();
  const timers = makeControlledTimers();
  harness.sandbox.setTimeout = timers.setTimeout.bind(timers);
  harness.sandbox.clearTimeout = timers.clearTimeout.bind(timers);
  harness.sandbox.window.setTimeout = harness.sandbox.setTimeout;
  harness.sandbox.window.clearTimeout = harness.sandbox.clearTimeout;
  const firstGate = harness.fakeIdb.gateNextTransaction();
  const secondGate = harness.fakeIdb.gateNextTransaction();
  const first = harness.eval(`idbTransaction("readwrite", STORAGE_KEY, { generation: "first" })`);
  const second = harness.eval(`idbTransaction("readwrite", COPY_KEY, { generation: "second" })`);
  await firstGate.started.promise;
  let drainResult = null;
  let drainSettled = false;
  const drain = harness.eval("drainIndexedDbCoordinator()").then(value => {
    drainSettled = true;
    drainResult = value;
  }, () => {
    drainSettled = true;
    drainResult = false;
  });
  timers.advanceBy(2500);
  firstGate.resolve();
  await secondGate.started.promise;
  const afterFirst = { drainSettled, aborts: harness.fakeIdb.abortCount };
  timers.advanceBy(2500);
  const beforeSecondRelease = { drainSettled, aborts: harness.fakeIdb.abortCount };
  secondGate.resolve();
  await Promise.all([first, second, drain]);
  const final = {
    drainResult,
    aborts: harness.fakeIdb.abortCount,
    first: harness.fakeIdb.values.get(KEYS.data)?.generation,
    second: harness.fakeIdb.values.get(KEYS.copy)?.generation
  };
  assert(
    !afterFirst.drainSettled && afterFirst.aborts === 0
      && !beforeSecondRelease.drainSettled && beforeSecondRelease.aborts === 0
      && final.drainResult === true && final.aborts === 0 && final.first === "first" && final.second === "second",
    "stable FIFO settlement allows two individually bounded operations to exceed four seconds in aggregate without a false queue-wide timeout"
  );
}

async function testPlainLifecycleFlushAwaitsMirrorTruth() {
  async function prepare(label) {
    const harness = makeHarness({
      local: { [KEYS.settings]: { enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
      idbSeed: { [KEYS.settings]: { enableAutoSave: true, autoMemoryVaultEnabled: false, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
    });
    await harness.ready();
    await nextTurn();
    const input = harness.sandbox.document.getElementById(`${label}-quick-text`);
    input.tagName = "TEXTAREA";
    input.type = "text";
    input.value = `${label} queued lifecycle draft`;
    harness.sandbox.document.querySelectorAll = selector => selector === "input, textarea, select" ? [input] : [];
    harness.eval(`view.screen = "quick"; settings.enableAutoSave = true;`);
    return { harness, input };
  }

  const queued = await prepare("queued");
  const gate = queued.harness.fakeIdb.gateNextTransaction();
  let queuedSettled = false;
  const queuedFlush = queued.harness.eval("flushRecoveryState()").then(value => {
    queuedSettled = true;
    return value;
  });
  await gate.started.promise;
  const settledBeforeRelease = queuedSettled;
  gate.resolve();
  const queuedResult = await queuedFlush;
  const queuedDraft = queued.harness.fakeIdb.values.get(KEYS.autosave)?.["capture:main"]?.fields?.[queued.input.id];

  const failed = await prepare("failed");
  failed.harness.fakeIdb.failNextTransaction = true;
  const failedResult = await failed.harness.eval("flushRecoveryState()");
  await failed.harness.fakeIdb.waitForIdle();
  const failedLedger = failed.harness.eval("indexedDbFailedKeys.size");

  assert(
    !settledBeforeRelease && queuedResult === true && queuedDraft === "queued queued lifecycle draft"
      && failedResult === false && failedLedger > 0,
    "plain lifecycle flush waits for queued IndexedDB mirrors and returns tracked failure truth"
  );
}

async function testDirectQuickGrabProposalPathsRejectDuringRecovery() {
  async function runPath(path) {
    const harness = makeHarness({
      local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
      idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() }
    });
    await harness.ready();
    harness.eval(`
      const grab = makeQuickGrab("Direct proposal recovery guard", [], "Whenever", null, { captureSource: "main" });
      grab.processingState = "awaitingApproval";
      db.quickGrabs = [grab];
      saveData();
      recordUndo("direct proposal target");
      globalThis.__guardGrabId = grab.id;
      globalThis.__guardProposal = emptyAiProposal({
        sourceType: "quickGrab",
        sourceId: grab.id,
        proposalKey: captureProposalKey(grab),
        proposalType: "quickGrabParse",
        title: "Direct proposal must not save",
        proposedActions: []
      });
      globalThis.__renderCount = 0;
      globalThis.__realRender = render;
      render = (...args) => { __renderCount += 1; return __realRender(...args); };
    `);
    await harness.eval("drainIndexedDbCoordinator()");
    const started = await harness.eval(`beginRecoveryTransaction("undo")`);
    const before = harness.eval(`JSON.stringify({ db, undoStack, memoryVaultCache, view, toast: document.getElementById("toast").textContent, app: document.getElementById("app").innerHTML, renderCount: __renderCount, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
    const beforeIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const result = path === "mock"
      ? harness.eval(`createQuickGrabMockAiProposal(__guardGrabId)`)
      : harness.eval(`saveQuickGrabAiProposal(__guardProposal, "direct central proposal", "Must not announce")`);
    await harness.eval("drainIndexedDbCoordinator()");
    const after = harness.eval(`JSON.stringify({ db, undoStack, memoryVaultCache, view, toast: document.getElementById("toast").textContent, app: document.getElementById("app").innerHTML, renderCount: __renderCount, local: Array.from(localStorageSnapshot(recoveryPersistenceKeys()).entries()) })`);
    const afterIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    harness.eval("finishRecoveryTransaction(); render = __realRender");
    return { started, result, before, after, beforeIdb, afterIdb };
  }

  const central = await runPath("central");
  const mock = await runPath("mock");
  const safe = value => value.started === true && value.result === false && value.after === value.before && value.afterIdb === value.beforeIdb;
  assert(safe(central) && safe(mock), "central and direct mock Quick Grab proposal paths reject during recovery with zero graph, Undo, Auto Memory, persistence, toast, view, or render mutation");
}

async function testTransientCaptureDismissalCancelsBackendContinuation() {
  async function runLateContinuation(outcome) {
    const harness = makeHarness({
      local: {
        [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false },
        [KEYS.data]: emptyData()
      },
      idbSeed: {
        [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false },
        [KEYS.data]: emptyData()
      }
    });
    await harness.ready();
    const fetchStarted = deferred();
    const fetchResponse = deferred();
    harness.sandbox.fetch = () => {
      fetchStarted.resolve();
      return fetchResponse.promise;
    };
    const setup = harness.eval(`(() => {
      settings = normalizeSettings({
        ...settings,
        enableUndo: true,
        autoMemoryVaultEnabled: true,
        localEncryptionEnabled: false,
        quickGrabAiMode: "backendQuickGrab",
        aiMockMode: false
      });
      const grab = makeQuickGrab("Transient backend dismissal", [], "Whenever", null, { captureSource: "main" });
      recordUndo("capture");
      const cancelUndoId = undoStack[0].id;
      db.quickGrabs = [grab];
      beginCaptureProcessing(grab.id, { deleteOnCancel: true, cancelUndoId });
      return { grabId: grab.id, cancelUndoId };
    })()`);
    const backend = harness.eval(`createQuickGrabBackendAiProposal("${setup.grabId}")`);
    await fetchStarted.promise;
    await harness.eval("drainIndexedDbCoordinator()");
    const closeResult = await harness.eval("closeSheet()");
    await harness.eval("drainIndexedDbCoordinator()");
    const afterClose = harness.eval(`JSON.stringify({
      db,
      undoStack,
      memoryVaultCache,
      view,
      activeCount: activeMutations.size,
      localData: localStorage.getItem(STORAGE_KEY),
      localMemory: localStorage.getItem(AUTO_MEMORY_KEY),
      toast: document.getElementById("toast").textContent
    })`);
    const afterCloseIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    if (outcome === "success") {
      fetchResponse.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          mode: "mock",
          route: "/api/ai/quick-grab",
          proposal: { title: "Late proposal", summary: "Must be discarded", confidence: "high", proposedActions: [] }
        })
      });
    } else {
      fetchResponse.reject(new Error("synthetic late Backend Quick Grab rejection"));
    }
    const backendResult = await backend;
    await harness.eval("drainIndexedDbCoordinator()");
    const afterLate = harness.eval(`JSON.stringify({
      db,
      undoStack,
      memoryVaultCache,
      view,
      activeCount: activeMutations.size,
      localData: localStorage.getItem(STORAGE_KEY),
      localMemory: localStorage.getItem(AUTO_MEMORY_KEY),
      toast: document.getElementById("toast").textContent
    })`);
    const afterLateIdb = JSON.stringify(Object.fromEntries(Array.from(harness.fakeIdb.values.entries())));
    const closed = JSON.parse(afterClose);
    const localData = JSON.parse(closed.localData);
    return {
      closeResult,
      backendResult,
      stable: afterLate === afterClose && afterLateIdb === afterCloseIdb,
      captureCount: closed.db.quickGrabs.length,
      proposalCount: closed.db.aiProposals.length,
      undoCount: closed.undoStack.length,
      activeCount: closed.activeCount,
      sheet: closed.view.sheet,
      localCaptureCount: localData.quickGrabs.length,
      localProposalCount: localData.aiProposals.length,
      localMemory: closed.localMemory,
      idbCaptureCount: harness.fakeIdb.values.get(KEYS.data)?.quickGrabs?.length,
      idbProposalCount: harness.fakeIdb.values.get(KEYS.data)?.aiProposals?.length
    };
  }

  const lateSuccess = await runLateContinuation("success");
  const lateRejection = await runLateContinuation("rejection");
  const safe = result => result.closeResult === true
    && result.backendResult === false
    && result.stable
    && result.captureCount === 0
    && result.proposalCount === 0
    && result.undoCount === 0
    && result.activeCount === 0
    && result.sheet === null
    && result.localCaptureCount === 0
    && result.localProposalCount === 0
    && result.localMemory === null
    && result.idbCaptureCount === 0
    && result.idbProposalCount === 0;

  const encrypted = makeHarness({
    local: { [KEYS.settings]: { enableUndo: true, localEncryptionEnabled: false }, [KEYS.data]: emptyData() },
    idbSeed: {}
  });
  await encrypted.ready();
  const encryptedFetchStarted = deferred();
  const encryptedFetch = deferred();
  encrypted.sandbox.fetch = () => {
    encryptedFetchStarted.resolve();
    return encryptedFetch.promise;
  };
  encrypted.sandbox.__encryptTransientEnvelope = async payload => ({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 150000,
    salt: "synthetic-salt",
    iv: "synthetic-iv",
    ciphertext: "synthetic-ciphertext",
    encryptedAt: `synthetic-${Date.now()}`,
    payload: clone(payload)
  });
  await encrypted.eval(`(async () => {
    settings = normalizeSettings({
      ...settings,
      enableUndo: true,
      autoMemoryVaultEnabled: true,
      localEncryptionEnabled: true,
      quickGrabAiMode: "backendQuickGrab",
      aiMockMode: false
    });
    vaultPassphrase = "synthetic-transient-dismissal-passphrase";
    memoryVaultCache = emptyAutoMemoryVault();
    encryptPayload = payload => globalThis.__encryptTransientEnvelope(payload);
    db = emptyData();
    await persistEncryptedVault();
  })()`);
  const encryptedId = encrypted.eval(`(() => {
    const grab = makeQuickGrab("Encrypted transient backend dismissal", [], "Whenever", null, { captureSource: "main" });
    recordUndo("capture");
    db.quickGrabs = [grab];
    beginCaptureProcessing(grab.id, { deleteOnCancel: true, cancelUndoId: undoStack[0].id });
    return grab.id;
  })()`);
  const encryptedBackend = encrypted.eval(`createQuickGrabBackendAiProposal("${encryptedId}")`);
  await encryptedFetchStarted.promise;
  await encrypted.eval("persistEncryptedVault()");
  const encryptedClose = await encrypted.eval("closeSheet()");
  const encryptedAfterClose = encrypted.eval(`JSON.stringify({
    db,
    undoStack,
    memoryVaultCache,
    view,
    activeCount: activeMutations.size,
    plaintextData: localStorage.getItem(STORAGE_KEY),
    plaintextMemory: localStorage.getItem(AUTO_MEMORY_KEY),
    envelope: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY))
  })`);
  const encryptedIdbAfterClose = JSON.stringify(encrypted.fakeIdb.values.get(KEYS.encrypted));
  encryptedFetch.resolve({
    ok: true,
    json: async () => ({
      ok: true,
      mode: "mock",
      route: "/api/ai/quick-grab",
      proposal: { title: "Late encrypted proposal", summary: "Must be discarded", confidence: "high", proposedActions: [] }
    })
  });
  const encryptedBackendResult = await encryptedBackend;
  const encryptedAfterLate = encrypted.eval(`JSON.stringify({
    db,
    undoStack,
    memoryVaultCache,
    view,
    activeCount: activeMutations.size,
    plaintextData: localStorage.getItem(STORAGE_KEY),
    plaintextMemory: localStorage.getItem(AUTO_MEMORY_KEY),
    envelope: JSON.parse(localStorage.getItem(ENCRYPTED_STORAGE_KEY))
  })`);
  const encryptedIdbAfterLate = JSON.stringify(encrypted.fakeIdb.values.get(KEYS.encrypted));
  const encryptedClosed = JSON.parse(encryptedAfterClose);
  const encryptedSafe = encryptedClose === true
    && encryptedBackendResult === false
    && encryptedAfterLate === encryptedAfterClose
    && encryptedIdbAfterLate === encryptedIdbAfterClose
    && encryptedClosed.db.quickGrabs.length === 0
    && encryptedClosed.db.aiProposals.length === 0
    && encryptedClosed.undoStack.length === 0
    && encryptedClosed.memoryVaultCache.snapshots.length === 0
    && encryptedClosed.view.sheet === null
    && encryptedClosed.activeCount === 0
    && encryptedClosed.plaintextData === null
    && encryptedClosed.plaintextMemory === null
    && encryptedClosed.envelope.payload.data.quickGrabs.length === 0
    && encryptedClosed.envelope.payload.data.aiProposals.length === 0
    && encryptedClosed.envelope.payload.autoMemoryVault.snapshots.length === 0;

  const failed = makeHarness({
    local: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false },
      [KEYS.data]: emptyData()
    },
    idbSeed: {
      [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false },
      [KEYS.data]: emptyData()
    }
  });
  await failed.ready();
  const failedFetchStarted = deferred();
  const failedFetch = deferred();
  failed.sandbox.fetch = () => {
    failedFetchStarted.resolve();
    return failedFetch.promise;
  };
  const failedId = failed.eval(`(() => {
    settings = normalizeSettings({
      ...settings,
      enableUndo: true,
      autoMemoryVaultEnabled: true,
      localEncryptionEnabled: false,
      quickGrabAiMode: "backendQuickGrab",
      aiMockMode: false
    });
    const grab = makeQuickGrab("Transient dismissal persistence failure", [], "Whenever", null, { captureSource: "main" });
    recordUndo("capture");
    db.quickGrabs = [grab];
    beginCaptureProcessing(grab.id, { deleteOnCancel: true, cancelUndoId: undoStack[0].id });
    return grab.id;
  })()`);
  const failedBackend = failed.eval(`createQuickGrabBackendAiProposal("${failedId}")`);
  await failedFetchStarted.promise;
  await failed.eval("drainIndexedDbCoordinator()");
  const failedGate = failed.fakeIdb.gateNextTransaction();
  failed.fakeIdb.failNextTransaction = true;
  const failedClosePromise = failed.eval("closeSheet()");
  await failedGate.started.promise;
  const pendingDeletion = failed.eval(`({
    busy: document.getElementById("app").innerHTML.match(/<section class="sheet-panel"[^>]*aria-busy="([^"]+)"/)?.[1],
    statusVisible: document.getElementById("app").innerHTML.includes("Deleting capture safely"),
    enabledControls: (() => {
      const panel = document.getElementById("app").innerHTML.match(/<section class="sheet-panel"[\\s\\S]*?<\\/section>/)?.[0] || "";
      return (panel.match(/<(?:button|input|select)\\b[^>]*>/g) || [])
        .filter(control => !/\\sdisabled(?:\\s|>|=)/.test(control)).length;
    })()
  })`);
  failedGate.resolve();
  const failedClose = await failedClosePromise;
  const retained = failed.eval(`({
    captureCount: db.quickGrabs.length,
    proposalCount: db.aiProposals.length,
    undoCount: undoStack.length,
    sheetOpen: view.sheet?.type === "ai-gate",
    retry: Array.from(activeMutations.values()).some(mutation => mutation.cancelNeedsRetry),
    retryNotice: document.getElementById("app").innerHTML.includes("The capture was not deleted"),
    enabledControls: (() => {
      const panel = document.getElementById("app").innerHTML.match(/<section class="sheet-panel"[\\s\\S]*?<\\/section>/)?.[0] || "";
      return (panel.match(/<(?:button|input|select)\\b[^>]*>/g) || [])
        .filter(control => !/\\sdisabled(?:\\s|>|=)/.test(control));
    })()
  })`);
  const retriedClose = await failed.eval("closeSheet()");
  await failed.eval("drainIndexedDbCoordinator()");
  failedFetch.reject(new Error("synthetic rejected request after retryable dismissal"));
  await failedBackend;
  const afterRetry = failed.eval(`({
    captureCount: db.quickGrabs.length,
    proposalCount: db.aiProposals.length,
    undoCount: undoStack.length,
    sheet: view.sheet,
    activeCount: activeMutations.size,
    localCaptureCount: JSON.parse(localStorage.getItem(STORAGE_KEY)).quickGrabs.length
  })`);
  afterRetry.idbCaptureCount = failed.fakeIdb.values.get(KEYS.data)?.quickGrabs?.length;
  const retrySafe = failedClose === false
    && pendingDeletion.busy === "true"
    && pendingDeletion.statusVisible
    && pendingDeletion.enabledControls === 0
    && retained.captureCount === 1
    && retained.proposalCount === 0
    && retained.undoCount === 1
    && retained.sheetOpen
    && retained.retry
    && retained.retryNotice
    && retained.enabledControls.length === 2
    && retained.enabledControls.every(control => control.includes('data-action="sheet-close"'))
    && retriedClose === true
    && afterRetry.captureCount === 0
    && afterRetry.proposalCount === 0
    && afterRetry.undoCount === 0
    && afterRetry.sheet === null
    && afterRetry.activeCount === 0
    && afterRetry.localCaptureCount === 0
    && afterRetry.idbCaptureCount === 0;

  async function runBackendRetry(secondOutcome) {
    const harness = makeHarness({
      local: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() },
      idbSeed: { [KEYS.settings]: { enableUndo: true, autoMemoryVaultEnabled: false }, [KEYS.data]: emptyData() }
    });
    await harness.ready();
    const requests = [];
    harness.sandbox.fetch = () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    };
    const grabId = harness.eval(`(() => {
      settings = normalizeSettings({
        ...settings,
        enableUndo: true,
        autoMemoryVaultEnabled: false,
        quickGrabAiMode: "backendQuickGrab",
        aiMockMode: false
      });
      db.people = [{ id: "retry-person", name: "Before retry", status: "Active" }];
      recordUndo("independent retry recovery");
      db.people[0].name = "Current retry name";
      const grab = makeQuickGrab("Backend retry owns one cancellation", [], "Whenever", null, { captureSource: "main" });
      recordUndo("capture");
      db.quickGrabs = [grab];
      beginCaptureProcessing(grab.id, { deleteOnCancel: true, cancelUndoId: undoStack[0].id });
      return grab.id;
    })()`);
    const first = harness.eval(`createQuickGrabBackendAiProposal("${grabId}")`);
    requests[0].reject(new Error("synthetic first Backend Quick Grab failure"));
    const firstResult = await first;
    const firstOwner = harness.eval(`Array.from(activeMutations.values()).map(mutation => mutation.id)`);
    const second = harness.eval(`createQuickGrabBackendAiProposal("${grabId}")`);
    const secondOwner = harness.eval(`Array.from(activeMutations.values()).map(mutation => mutation.id)`);
    if (secondOutcome === "success") {
      requests[1].resolve({
        ok: true,
        json: async () => ({
          ok: true,
          mode: "mock",
          route: "/api/ai/quick-grab",
          proposal: { title: "Retry proposal", summary: "One owner", confidence: "high", proposedActions: [] }
        })
      });
    } else {
      requests[1].reject(new Error("synthetic second Backend Quick Grab failure"));
    }
    const secondResult = await second;
    if (secondOutcome === "success") {
      return {
        firstResult,
        secondResult,
        firstOwner,
        secondOwner,
        activeCount: harness.eval("activeMutations.size"),
        proposalCount: harness.eval("db.aiProposals.length")
      };
    }
    const ownerCountBeforeClose = harness.eval("activeMutations.size");
    const closeResult = await harness.eval("closeSheet()");
    const ownerCountAfterClose = harness.eval("activeMutations.size");
    const undoResult = await harness.eval("undoLast()");
    return {
      firstResult,
      secondResult,
      firstOwner,
      secondOwner,
      ownerCountBeforeClose,
      closeResult,
      ownerCountAfterClose,
      undoResult,
      finalName: harness.eval("db.people[0]?.name"),
      finalCaptureCount: harness.eval("db.quickGrabs.length"),
      finalProposalCount: harness.eval("db.aiProposals.length")
    };
  }

  const retrySuccess = await runBackendRetry("success");
  const retryFailure = await runBackendRetry("failure");
  const retryOwnerSafe = retrySuccess.firstResult === false
    && retrySuccess.secondResult === true
    && retrySuccess.firstOwner.length === 1
    && retrySuccess.secondOwner.length === 1
    && retrySuccess.secondOwner[0] === retrySuccess.firstOwner[0]
    && retrySuccess.activeCount === 0
    && retrySuccess.proposalCount === 1
    && retryFailure.firstResult === false
    && retryFailure.secondResult === false
    && retryFailure.firstOwner.length === 1
    && retryFailure.secondOwner.length === 1
    && retryFailure.secondOwner[0] === retryFailure.firstOwner[0]
    && retryFailure.ownerCountBeforeClose === 1
    && retryFailure.closeResult === true
    && retryFailure.ownerCountAfterClose === 0
    && retryFailure.undoResult === true
    && retryFailure.finalName === "Before retry"
    && retryFailure.finalCaptureCount === 0
    && retryFailure.finalProposalCount === 0;

  const missingSource = makeHarness({ local: { [KEYS.settings]: { enableUndo: true }, [KEYS.data]: emptyData() } });
  await missingSource.ready();
  const missingBefore = missingSource.eval(`JSON.stringify({ db, undoStack, view, toast: document.getElementById("toast").textContent })`);
  const missingResult = missingSource.eval(`saveQuickGrabAiProposal(emptyAiProposal({
    sourceType: "quickGrab",
    sourceId: "missing-transient-capture",
    proposalType: "quickGrabParse",
    proposedActions: []
  }), "missing source proposal", "Must not announce")`);
  const missingAfter = missingSource.eval(`JSON.stringify({ db, undoStack, view, toast: document.getElementById("toast").textContent })`);

  assert(
    safe(lateSuccess) && safe(lateRejection) && encryptedSafe && retrySafe && retryOwnerSafe && missingResult === false && missingAfter === missingBefore,
    `transient Close/Cancel dismissal durably deletes once in plaintext and Device Vault, retains one owner across backend retries, exposes an accessible deletion state, cancels late Backend success/rejection, retries failed persistence, and rejects source-less proposals [success=${JSON.stringify(lateSuccess)}, rejection=${JSON.stringify(lateRejection)}, encrypted=${encryptedSafe}, persistenceRetry=${retrySafe}, pending=${JSON.stringify(pendingDeletion)}, retained=${JSON.stringify(retained)}, retriedClose=${retriedClose}, afterRetry=${JSON.stringify(afterRetry)}, backendRetry=${retryOwnerSafe}]`
  );
}

async function testRecovery19RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["deferred Backend Quick Grab", testDeferredBackendQuickGrabCannotCrossRecovery],
    ["stale backup continuation", testStaleBackupReadCannotStartSecondRecovery],
    ["ordered plaintext persistence", testOrderedPlaintextPersistenceAndFailureLedger],
    ["Undo identity collision", testUndoIdentityCollisionFailsClosed],
    ["epoch-invalidated continuations", testRecoveryEpochInvalidatesDiscardableContinuations],
    ["active mutation registry", testActiveMutationRegistryBlocksRecovery],
    ["shared fragment, legacy query discard, and bounded storage", testSharedFragmentDeferralAndBoundedIndexedDbDeadline]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-19 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery21RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["exact Backend cancellation Auto Memory rollback", testBackendCancellationRestoresExactAutoMemory],
    ["canonical failed-mirror reconciliation", testFailedMirrorReconciliationIsCanonicalAndRetryable],
    ["aggregate FIFO settlement", testAggregateFifoWaitKeepsPerOperationDeadlines],
    ["plain lifecycle mirror truth", testPlainLifecycleFlushAwaitsMirrorTruth],
    ["direct Quick Grab recovery containment", testDirectQuickGrabProposalPathsRejectDuringRecovery],
    ["transient capture Backend dismissal", testTransientCaptureDismissalCancelsBackendContinuation]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-21 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery22RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["retry-owned cancellation", testCancellationFailureRetainsRetryOwnership],
    ["maintained canonical shapes", testCanonicalReconciliationRequiresMaintainedShapes]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-22 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery23RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["preserved v22 recovery", testRecovery22RedContracts],
    ["all-store cancellation publication", testCancellationStoreAbortPublishesOnlyAfterDurability]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-23 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery24RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["preserved v23 recovery", testRecovery23RedContracts],
    ["retry-only cancellation ownership", testRetainedCancellationOwnerIsRetryOnlyAndIdentityBound],
    ["bounded cancellation crypto", testCancellationCryptoDeadlineSuppressesLateResults]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-24 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery25RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["preserved v24 recovery", testRecovery24RedContracts],
    ["static retry-owner leaf enumeration", testRetryOwnerLeafGuardEnumeration],
    ["dynamic retry-owner leaf invariance", testRetryOwnerContainsAllAuditedLeafMutators]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-25 contracts failed:\n${failures.join("\n")}`);
}

async function testRecovery28RedContracts() {
  const failures = [];
  for (const [label, test] of [
    ["preserved v25 recovery", testRecovery25RedContracts],
    ["dynamic settlement lease and certificate identity", testDynamicSettlementLeaseAndCertificateIdentity]
  ]) {
    try {
      await test();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CALM-RECOVERY-UNDO-28 contracts failed:\n${failures.join("\n")}`);
}

async function testPortableSchemaDefaultDenyRecoveryBoundary() {
  const makePortableHarness = async () => {
    const beforeData = emptyData({ people: [{ id: "schema_before", name: "Before rejected portable restore" }] });
    const beforeSettings = { enableUndo: true, autoMemoryVaultEnabled: true, localEncryptionEnabled: false };
    const beforeDrafts = { "capture:main": { fields: { "quick-text": "Before rejected portable restore" } } };
    const beforeMemory = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] };
    const harness = makeHarness({
      local: {
        [KEYS.data]: beforeData,
        [KEYS.settings]: beforeSettings,
        [KEYS.autosave]: beforeDrafts,
        [KEYS.autoMemory]: beforeMemory
      },
      idbSeed: {
        [KEYS.data]: beforeData,
        [KEYS.settings]: beforeSettings,
        [KEYS.autosave]: beforeDrafts,
        [KEYS.autoMemory]: beforeMemory
      }
    });
    await harness.ready();
    class ImmediateReader {
      readAsText(file) {
        Promise.resolve().then(() => this.onload({ target: { result: file.contents } }));
      }
    }
    harness.sandbox.FileReader = ImmediateReader;
    harness.eval(`
      customCopy = { "brand.title": "Before rejected portable restore" };
      autosaveDraftsCache = ${JSON.stringify(beforeDrafts)};
      memoryVaultCache = ${JSON.stringify(beforeMemory)};
      recordUndo("portable schema before");
      view = { ...view, screen: "advancedSettings", sheet: { type: "data-safety", kind: "import" } };
      globalThis.__portableSchemaOriginalBegin = beginRecoveryTransaction;
      globalThis.__portableSchemaOriginalNormalize = normalizeData;
      globalThis.__portableSchemaBeginCalls = 0;
      globalThis.__portableSchemaNormalizeCalls = 0;
      beginRecoveryTransaction = (...args) => {
        globalThis.__portableSchemaBeginCalls += 1;
        return globalThis.__portableSchemaOriginalBegin(...args);
      };
      normalizeData = (...args) => {
        globalThis.__portableSchemaNormalizeCalls += 1;
        return globalThis.__portableSchemaOriginalNormalize(...args);
      };
    `);
    return harness;
  };

  const unsupportedPayload = (harness, schemaCase = "future") => harness.eval(`(() => {
    const payload = cloneJson(currentPortablePayload());
    payload.dataSchemaVersion = ${schemaCase === "future" ? 999 : 3};
    payload.data.dataSchemaVersion = ${schemaCase === "future" ? 999 : 2};
    payload.data.people = [{ id: "schema_future", name: "Must never replace current state" }];
    ${schemaCase === "future" ? 'payload.data.unknownFutureCollection = [{ id: "future_unknown_collection" }];' : 'payload.data.bridgeProbeCollection = [{ id: "bridge_probe_collection" }];'}
    return payload;
  })()`);
  const stateSnapshot = harness => harness.eval(`(() => {
    const recovery = captureRecoveryTransactionState();
    recovery.localStorage = Array.from(recovery.localStorage.entries()).sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify({ recovery, epoch: recoveryEpoch, pending: recoveryTransactionPending, kind: recoveryTransactionKind });
  })()`);
  const directHarness = await makePortableHarness();
  const directPayload = unsupportedPayload(directHarness);
  const directBefore = stateSnapshot(directHarness);
  const directTransactionCount = directHarness.fakeIdb.transactions.length;
  const directWriteCount = directHarness.fakeIdb.writes.length;
  directHarness.sandbox.__portableSchemaFuturePayload = directPayload;
  const directResult = await directHarness.eval(`(async () => {
    const encryptedEnvelope = { kind: "ruf-ministry-hub-encrypted-backup", version: 1, salt: "fictional", iv: "fictional", ciphertext: "fictional" };
    const originalDecrypt = decryptPayload;
    let decodeRejected = false;
    let decodeMessage = "";
    let applyRejected = false;
    let applyMessage = "";
    try {
      decryptPayload = async () => globalThis.__portableSchemaFuturePayload;
      try {
        validateBackupPayload(await decodeBackupPayload(encryptedEnvelope, "fictional-passphrase", { allowPrompt: false }));
      } catch (error) {
        decodeRejected = true;
        decodeMessage = error?.message || "";
      }
      try {
        await applyRestoredPayload(globalThis.__portableSchemaFuturePayload);
      } catch (error) {
        applyRejected = true;
        applyMessage = error?.message || "";
      }
    } finally {
      decryptPayload = originalDecrypt;
    }
    return { decodeRejected, decodeMessage, applyRejected, applyMessage };
  })()`);
  await directHarness.fakeIdb.waitForIdle();
  assert(
    directResult.decodeRejected && directResult.applyRejected
      && directResult.decodeMessage === "Backup data schema is not supported."
      && directResult.applyMessage === "Backup data schema is not supported.",
    "future-schema direct encrypted decode and apply paths fail with one fixed content-free error"
  );
  const directBoundary = {
    stateUnchanged: stateSnapshot(directHarness) === directBefore,
    transactionsUnchanged: directHarness.fakeIdb.transactions.length === directTransactionCount,
    writesUnchanged: directHarness.fakeIdb.writes.length === directWriteCount,
    beginCalls: directHarness.eval("globalThis.__portableSchemaBeginCalls"),
    normalizeCalls: directHarness.eval("globalThis.__portableSchemaNormalizeCalls")
  };
  assert(
    Object.values(directBoundary).every(value => value === true || value === 0),
    `future-schema direct paths cannot normalize, claim recovery, or mutate local/IndexedDB/Undo/Auto Memory state ${JSON.stringify(directBoundary)}`
  );

  for (const schemaCase of ["future", "top3-nested2"]) for (const encrypted of [false, true]) {
    const harness = await makePortableHarness();
    const payload = unsupportedPayload(harness, schemaCase);
    const envelope = { kind: "ruf-ministry-hub-encrypted-backup", version: 1, salt: "fictional", iv: "fictional", ciphertext: "fictional" };
    harness.sandbox.__portableSchemaFuturePayload = payload;
    harness.sandbox.__portableSchemaFile = { size: 256, type: "application/json", contents: JSON.stringify(encrypted ? envelope : payload) };
    if (encrypted) {
      harness.eval(`
        globalThis.__portableSchemaOriginalDecrypt = decryptPayload;
        globalThis.__portableSchemaDecryptCalls = 0;
        decryptPayload = async () => {
          globalThis.__portableSchemaDecryptCalls += 1;
          return globalThis.__portableSchemaFuturePayload;
        };
      `);
    }
    harness.eval(`
      document.getElementById("sheet-import-backup-file").files = [globalThis.__portableSchemaFile];
      document.getElementById("sheet-import-confirm").checked = true;
      document.getElementById("sheet-import-passphrase").value = ${encrypted ? '"fictional-passphrase"' : '""'};
    `);
    const warnings = [];
    harness.sandbox.console = { ...console, warn: (...args) => warnings.push(args.map(value => String(value)).join(" ")) };
    const before = stateSnapshot(harness);
    const beforeTransactions = harness.fakeIdb.transactions.length;
    const beforeWrites = harness.fakeIdb.writes.length;
    await harness.eval(`submitDataSafetySheet("import")`);
    await harness.fakeIdb.waitForIdle();
    const outcome = harness.eval(`({
      beginCalls: globalThis.__portableSchemaBeginCalls,
      normalizeCalls: globalThis.__portableSchemaNormalizeCalls,
      sheetKind: view.sheet?.kind || "",
      toast: document.getElementById("toast").textContent,
      successVisible: document.getElementById("toast").textContent === "Backup restored.",
      fileInvalid: document.getElementById("sheet-import-backup-file").getAttribute?.("aria-invalid") === "true",
      decryptCalls: globalThis.__portableSchemaDecryptCalls || 0
    })`);
    assert(
      outcome.beginCalls === 0 && outcome.normalizeCalls === 0
        && stateSnapshot(harness) === before
        && harness.fakeIdb.transactions.length === beforeTransactions
        && harness.fakeIdb.writes.length === beforeWrites,
      `${encrypted ? "encrypted" : "plaintext"} ${schemaCase} file/UI import causes zero recovery, normalization, local, IndexedDB, Undo, or Auto Memory mutation`
    );
    assert(
      outcome.sheetKind === "import" && outcome.toast === "That backup could not be imported." && !outcome.successVisible
        && !outcome.toast.includes("999") && !outcome.toast.includes("future_unknown_collection")
        && warnings.every(message => !message.includes("999") && !message.includes("future_unknown_collection") && !message.includes("bridge_probe_collection"))
        && (!encrypted || outcome.decryptCalls === 1),
      `${encrypted ? "encrypted" : "plaintext"} ${schemaCase} UI rejection leaves one generic retryable import sheet without content-bearing diagnostics`
    );
  }
}

async function testAutoMemoryStrictSchemaAndRawCountRedContracts() {
  const failures = [];
  const expect = (condition, label) => {
    if (!condition) failures.push(label);
  };
  const harness = makeHarness({
    local: {
      [KEYS.settings]: { autoMemoryVaultEnabled: false },
      [KEYS.data]: emptyData()
    }
  });
  await harness.ready();
  const direct = harness.eval(`(() => {
    const fixedMessage = "Auto Memory restore point data is not supported.";
    if (typeof classifyAutoMemorySnapshotPayload !== "function") {
      return { exists: false, positives: 0, negativeCount: 0, fixed: false };
    }
    const makePayload = (source, topMarker, nestedMarker, producer = "exact") => {
      const graph = emptyData();
      if (nestedMarker === "absent") delete graph.dataSchemaVersion;
      else graph.dataSchemaVersion = nestedMarker;
      const payload = {
        exportedAt: "2026-07-20T00:00:00.000Z",
        settings: {},
        customCopy: {},
        autosaveDrafts: {},
        [source]: graph
      };
      if (topMarker !== "absent") payload.dataSchemaVersion = topMarker;
      if (producer === "exact") {
        payload.app = "RUF Ministry Hub";
        payload.version = 2;
      } else if (producer === "app-only") payload.app = "RUF Ministry Hub";
      else if (producer === "version-only") payload.version = 2;
      else if (producer === "wrong-app") {
        payload.app = "Fictional Other App";
        payload.version = 2;
      } else if (producer === "string-version") {
        payload.app = "RUF Ministry Hub";
        payload.version = "2";
      }
      return payload;
    };
    const supportedMarkers = [
      ["absent", "absent"],
      [2, "absent"],
      ["absent", 2],
      [2, 2],
      [3, "absent"],
      ["absent", 3],
      [3, 3]
    ];
    let positives = 0;
    let positiveFailures = 0;
    for (const source of ["data", "db"]) {
      for (const [topMarker, nestedMarker] of supportedMarkers) {
        for (const producer of ["exact", "absent"]) {
          try {
            classifyAutoMemorySnapshotPayload(makePayload(source, topMarker, nestedMarker, producer));
            positives += 1;
          } catch (_error) {
            positiveFailures += 1;
          }
        }
      }
    }
    const invalidPayloads = [];
    const invalidMarkers = [1, 999, "3", null, true, { version: 3 }, [3], 2.5, NaN, Infinity, -Infinity];
    invalidMarkers.forEach(marker => {
      invalidPayloads.push(makePayload("data", marker, "absent"));
      invalidPayloads.push(makePayload("data", "absent", marker));
    });
    invalidPayloads.push(makePayload("data", 2, 3));
    invalidPayloads.push(makePayload("data", 3, 2));
    invalidPayloads.push({ ...makePayload("data", 3, 3), db: emptyData() });
    const neither = makePayload("data", 3, 3);
    delete neither.data;
    invalidPayloads.push(neither);
    invalidPayloads.push(makePayload("data", 3, 3, "app-only"));
    invalidPayloads.push(makePayload("data", 3, 3, "version-only"));
    invalidPayloads.push(makePayload("data", 3, 3, "wrong-app"));
    invalidPayloads.push(makePayload("data", 3, 3, "string-version"));
    const missingCurrentCollection = makePayload("data", 3, 3);
    delete missingCurrentCollection.data.aiProposals;
    invalidPayloads.push(missingCurrentCollection);
    let negativeCount = 0;
    let fixed = true;
    invalidPayloads.forEach(payload => {
      try {
        classifyAutoMemorySnapshotPayload(payload);
      } catch (error) {
        negativeCount += 1;
        fixed = fixed && error?.message === fixedMessage;
      }
    });
    return { exists: true, positives, positiveFailures, negativeCount, expectedNegatives: invalidPayloads.length, fixed };
  })()`);
  expect(
    direct.exists && direct.positives === 28 && direct.positiveFailures === 0,
    "one strict Auto Memory classifier accepts the complete data/db absent/schema-2/schema-3 matrix"
  );
  expect(
    direct.exists && direct.negativeCount === direct.expectedNegatives && direct.fixed,
    "Auto Memory rejects malformed, future, contradictory, ambiguous, and producer-invalid payloads with one fixed content-free diagnostic"
  );

  const maintained = harness.eval(`(() => {
    const payload = {
      exportedAt: "2026-07-20T00:00:00.000Z",
      app: "RUF Ministry Hub",
      version: 2,
      dataSchemaVersion: 2,
      data: (() => {
        const graph = emptyData();
        delete graph.dataSchemaVersion;
        delete graph.aiProposals;
        return graph;
      })(),
      settings: {},
      customCopy: {},
      autosaveDrafts: {}
    };
    const vault = {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: [{
        id: "schema-two-maintained",
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Fictional schema two",
        appVersion: "synthetic-v38",
        summary: "Fictional summary",
        signature: "fictional-signature",
        payload
      }]
    };
    const accepted = hasMaintainedAutoMemoryVaultShape(vault);
    try {
      const normalized = normalizeAutoMemoryPayload(payload);
      return {
        accepted,
        normalizedTop: normalized?.dataSchemaVersion,
        normalizedNestedOwn: Object.prototype.hasOwnProperty.call(normalized?.data || {}, "dataSchemaVersion"),
        normalizationRejected: false
      };
    } catch (_error) {
      return { accepted, normalizedTop: null, normalizedNestedOwn: null, normalizationRejected: true };
    }
  })()`);
  expect(
    maintained.accepted && !maintained.normalizationRejected && maintained.normalizedTop === 2 && maintained.normalizedNestedOwn === false,
    "maintained schema-2 Auto Memory stays live for reconciliation without relabeling its schema provenance"
  );

  const countBoundary = harness.eval(`(() => {
    const payload = currentPortablePayload();
    const snapshot = index => ({
      id: "raw-" + index,
      savedAt: new Date(1700000000000 + index).toISOString(),
      label: "Fictional raw snapshot",
      appVersion: APP_VERSION,
      summary: "Fictional summary",
      signature: "fictional-" + index,
      payload
    });
    const originalNormalize = normalizeAutoMemoryPayload;
    const originalCompare = String.prototype.localeCompare;
    let normalizeCalls = 0;
    let comparisons = 0;
    normalizeAutoMemoryPayload = (...args) => {
      normalizeCalls += 1;
      return originalNormalize(...args);
    };
    String.prototype.localeCompare = function (...args) {
      comparisons += 1;
      return originalCompare.apply(this, args);
    };
    const observe = count => {
      normalizeCalls = 0;
      comparisons = 0;
      let rejected = false;
      const rawVault = { version: 1, updatedAt: "2026-07-20T00:00:00.000Z", snapshots: Array.from({ length: count }, (_, index) => snapshot(index)) };
      const startedAt = Date.now();
      try {
        normalizeAutoMemoryVault(rawVault);
      } catch (error) {
        rejected = true;
      }
      return { rejected, normalizeCalls, comparisons, elapsedMs: Date.now() - startedAt };
    };
    try {
      return { fifty: observe(50), fiftyOne: observe(51), tenThousand: observe(10000) };
    } finally {
      normalizeAutoMemoryPayload = originalNormalize;
      String.prototype.localeCompare = originalCompare;
    }
  })()`);
  expect(
    !countBoundary.fifty.rejected && countBoundary.fifty.normalizeCalls === 50,
    "the exact 50-snapshot raw Auto Memory ceiling remains accepted"
  );
  expect(
    countBoundary.fiftyOne.rejected && countBoundary.fiftyOne.normalizeCalls === 0 && countBoundary.fiftyOne.comparisons === 0
      && countBoundary.tenThousand.rejected && countBoundary.tenThousand.normalizeCalls === 0 && countBoundary.tenThousand.comparisons === 0,
    `51 and 10,000 raw Auto Memory snapshots reject before normalization or comparison ${JSON.stringify(countBoundary)}`
  );

  const startupData = emptyData({ people: [{ id: "fictional_startup", name: "Fictional startup person" }] });
  const makeStartupVault = ({ top = 999, nested = "absent", count = 1 } = {}) => {
    const graph = emptyData({ people: [{ id: "fictional_auto_memory_future", name: "Fictional future restore point" }] });
    if (nested === "absent") delete graph.dataSchemaVersion;
    else graph.dataSchemaVersion = nested;
    const payload = {
      exportedAt: "2026-07-20T00:00:00.000Z",
      db: graph,
      settings: {},
      customCopy: {},
      autosaveDrafts: {}
    };
    if (top !== "absent") payload.dataSchemaVersion = top;
    return {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: Array.from({ length: count }, (_, index) => ({
        id: `unsupported-local-${index}`,
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Fictional unsupported",
        appVersion: "synthetic-v38",
        summary: "Fictional summary",
        signature: `fictional-unsupported-${index}`,
        payload
      }))
    };
  };
  for (const [name, vault] of [
    ["top-999", makeStartupVault()],
    ["string-3", makeStartupVault({ top: "3" })],
    ["top-2-nested-3", makeStartupVault({ top: 2, nested: 3 })],
    ["raw-51", makeStartupVault({ top: 2, nested: 2, count: 51 })]
  ]) {
    const startup = makeHarness({
      local: {
        [KEYS.settings]: { autoMemoryVaultEnabled: true, localEncryptionEnabled: false },
        [KEYS.data]: startupData,
        [KEYS.autoMemory]: vault
      },
      idbSeed: {
        [KEYS.autoMemory]: { version: 1, updatedAt: "", snapshots: [] }
      },
      syntheticConsole: { ...console, warn() {} }
    });
    const startupLocalBefore = sortedLocalSnapshot(startup);
    const startupIdbBefore = sortedIdbSnapshot(startup);
    await startup.ready();
    expect(
      startup.eval(`Boolean(view.startupRecoveryError) && document.getElementById("app").innerHTML.includes("Local data check paused")`)
        && sortedLocalSnapshot(startup) === startupLocalBefore
        && sortedIdbSnapshot(startup) === startupIdbBefore
        && startup.fakeIdb.writes.length === 0,
      `${name} canonical local Auto Memory pauses startup before local or IndexedDB publication and never yields to its mirror`
    );
  }

  for (const marker of ["absent", 2]) {
    const graph = emptyData({ people: [{ id: `fictional_idb_auto_memory_${marker}`, name: "Fictional mirror snapshot" }] });
    if (marker === "absent") {
      delete graph.dataSchemaVersion;
      delete graph.aiProposals;
    } else graph.dataSchemaVersion = 2;
    const payload = {
      exportedAt: "2026-07-20T00:00:00.000Z",
      db: graph,
      settings: {},
      customCopy: {},
      autosaveDrafts: {}
    };
    if (marker !== "absent") payload.dataSchemaVersion = marker;
    const vault = {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: [{
        id: `idb-supported-${marker}`,
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Fictional supported",
        appVersion: "synthetic-v38",
        summary: "Fictional summary",
        signature: `fictional-supported-${marker}`,
        payload
      }]
    };
    const idbOnly = makeHarness({
      local: {
        [KEYS.settings]: { autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
        [KEYS.data]: startupData
      },
      idbSeed: {}
    });
    idbOnly.fakeIdb.values.set(KEYS.autoMemory, vault);
    idbOnly.fakeIdb.revive = value => idbOnly.eval(`(${JSON.stringify(value)})`);
    await idbOnly.ready();
    const restoredVault = JSON.parse(idbOnly.storage[KEYS.autoMemory] || "null");
    expect(
      !idbOnly.eval("view.startupRecoveryError")
        && restoredVault?.snapshots?.length === 1
        && restoredVault.snapshots[0].payload.dataSchemaVersion === (marker === "absent" ? undefined : 2),
      `IndexedDB-only supported ${marker} Auto Memory hydrates without relabeling its top-level provenance`
    );
  }

  {
    const unsupportedMirror = makeStartupVault({ top: 999 });
    const idbOnly = makeHarness({
      local: {
        [KEYS.settings]: { autoMemoryVaultEnabled: false, localEncryptionEnabled: false },
        [KEYS.data]: startupData
      },
      idbSeed: {},
      syntheticConsole: { ...console, warn() {} }
    });
    idbOnly.fakeIdb.values.set(KEYS.autoMemory, unsupportedMirror);
    idbOnly.fakeIdb.revive = value => idbOnly.eval(`(${JSON.stringify(value)})`);
    const localBefore = sortedLocalSnapshot(idbOnly);
    const idbBefore = sortedIdbSnapshot(idbOnly);
    await idbOnly.ready();
    expect(
      Boolean(idbOnly.eval("view.startupRecoveryError"))
        && !Object.prototype.hasOwnProperty.call(idbOnly.storage, KEYS.autoMemory)
        && sortedLocalSnapshot(idbOnly) === localBefore
        && sortedIdbSnapshot(idbOnly) === idbBefore
        && idbOnly.fakeIdb.writes.length === 0,
      "unsupported IndexedDB-only Auto Memory remains unpublished and preserves the exact missing-local and mirror states"
    );
  }

  if (failures.length) throw new Error(`CALM-AUTO-MEMORY-38 red contracts failed:\n${failures.join("\n")}`);
  assert(true, `strict Auto Memory schema, reconciliation liveness, count ceiling, and startup ownership matrix passed; ordered 10,000 fixture ${JSON.stringify(countBoundary.tenThousand)}`);
}

async function testToastAccessibilityAndDeadlineOwnership() {
  const harness = makeHarness();
  await harness.ready();
  harness.eval(`
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
  `);

  const toast = harness.sandbox.document.getElementById("toast");
  toast.attributes = {};
  toast.setAttribute = (name, value) => { toast.attributes[name] = String(value); };
  toast.getAttribute = name => toast.attributes[name] || null;
  toast.classNames = new Set();
  toast.classList = {
    add: name => toast.classNames.add(String(name)),
    remove: name => toast.classNames.delete(String(name)),
    contains: name => toast.classNames.has(String(name))
  };
  let toastText = "";
  const textMutations = [];
  Object.defineProperty(toast, "textContent", {
    configurable: true,
    get: () => toastText,
    set: value => {
      textMutations.push({
        value: String(value || ""),
        role: toast.getAttribute("role") || "",
        live: toast.getAttribute("aria-live") || ""
      });
      toastText = String(value || "");
    }
  });

  let nextTimerId = 1;
  let scheduledTimerCount = 0;
  const timers = new Map();
  const cleared = [];
  harness.sandbox.window.setTimeout = (callback, delay = 0) => {
    scheduledTimerCount += 1;
    const id = nextTimerId++;
    timers.set(id, { callback, delay: Number(delay), cleared: false, ran: false });
    return id;
  };
  harness.sandbox.window.clearTimeout = id => {
    const timer = timers.get(id);
    if (timer) timer.cleared = true;
    cleared.push(id);
  };
  const forceTimer = id => {
    const timer = timers.get(id);
    if (!timer) throw new Error(`Missing fictional toast timer ${id}.`);
    timer.ran = true;
    timer.callback();
  };
  const state = () => harness.eval(`({
    text: document.getElementById("toast").textContent,
    role: document.getElementById("toast").getAttribute("role") || "",
    live: document.getElementById("toast").getAttribute("aria-live") || "",
    shown: document.getElementById("toast").classList.contains("show"),
    timer: toastTimer
  })`);

  const failures = [];
  const expect = (condition, label) => {
    if (!condition) failures.push(label);
  };

  harness.eval(`showToast("Could not unlock fictional storage.", "error")`);
  const explicitError = state();
  expect(
    explicitError.text === "Could not unlock fictional storage."
      && explicitError.role === "alert"
      && explicitError.live === "assertive"
      && explicitError.shown === true
      && timers.get(explicitError.timer)?.delay === 5000,
    "an explicit error remains an assertive alert with an exact 5,000 ms owned deadline"
  );

  harness.eval(`showToast("Unlocked.")`);
  const directPin = state();
  expect(
    directPin.text === "Unlocked."
      && directPin.role === "status"
      && directPin.live === "polite"
      && directPin.shown === true
      && timers.get(directPin.timer)?.delay === 2800
      && cleared.includes(explicitError.timer),
    "direct PIN success after an alert is a polite status with an exact 2,800 ms replacement deadline"
  );
  expect(
    textMutations[1]?.value === "Unlocked."
      && textMutations[1]?.role === "status"
      && textMutations[1]?.live === "polite",
    "direct PIN success applies status semantics before exposing live-region text"
  );

  harness.eval(`showToast("Encrypted storage unlocked.")`);
  const vaultSuccess = state();
  expect(
    vaultSuccess.text === "Encrypted storage unlocked."
      && vaultSuccess.role === "status"
      && vaultSuccess.live === "polite"
      && vaultSuccess.shown === true
      && timers.get(vaultSuccess.timer)?.delay === 2800
      && cleared.includes(directPin.timer),
    "Device Vault success is a polite status with an exact 2,800 ms replacement deadline"
  );

  harness.eval(`showToast("Unlocked.")`);
  const staleTimer = state().timer;
  const staleCallback = timers.get(staleTimer)?.callback;
  nextTimerId = staleTimer;
  harness.eval(`showToast("Could not save the fictional change.")`);
  const currentBeforeStale = state();
  expect(
    currentBeforeStale.text === "Could not save the fictional change."
      && currentBeforeStale.role === "alert"
      && currentBeforeStale.live === "assertive"
      && currentBeforeStale.shown === true
      && timers.get(currentBeforeStale.timer)?.delay === 5000,
    "the retained Could not heuristic remains an assertive alert with an exact 5,000 ms owned deadline"
  );
  if (typeof staleCallback === "function") staleCallback();
  else failures.push("the recycled fictional timer retains its stale callback");
  const currentAfterStale = state();
  expect(
    JSON.stringify(currentAfterStale) === JSON.stringify(currentBeforeStale),
    "a forced already-queued stale callback with a recycled timer handle cannot hide, clear, reclassify, shorten, or release a newer toast"
  );

  forceTimer(currentBeforeStale.timer);
  const dismissed = state();
  expect(
    dismissed.text === ""
      && dismissed.role === "status"
      && dismissed.live === "polite"
      && dismissed.shown === false
      && dismissed.timer === null,
    "the current owned deadline hides, clears, restores idle polite semantics, and releases only its own timer"
  );
  expect(
    textMutations.at(-1)?.value === ""
      && textMutations.at(-1)?.role === "status"
      && textMutations.at(-1)?.live === "polite",
    "dismissal restores idle semantics before clearing accessibility text"
  );

  if (failures.length) throw new Error(`CALM-TOAST-A11Y-37 contracts failed:\n${failures.join("\n")}`);
  assert(scheduledTimerCount === 5, "toast accessibility matrix exercised five deterministic owned deadlines including one recycled timer handle");
}

async function testDeviceVaultUnlockSchemaAndLatestAttemptBoundary() {
  const schemaRetryMessage = "Encrypted storage could not be opened safely. It was not changed.";
  const envelopeRetryMessage = "Encrypted storage changed. Try again.";
  const envelope = label => ({
    kind: "ruf-ministry-hub-encrypted",
    version: 1,
    salt: `fictional-${label}-salt`,
    iv: `fictional-${label}-iv`,
    ciphertext: label
  });
  const rawEnvelope = label => JSON.stringify(envelope(label));
  const payload = (label, marker = 3) => ({
    data: emptyData({
      dataSchemaVersion: marker,
      people: [{ id: `unlock_${label}`, name: `Fictional ${label}` }]
    }),
    customCopy: { "brand.title": `Fictional ${label}` },
    autosaveDrafts: { "capture:main": { fields: { "quick-text": `Fictional ${label}` } } },
    autoMemoryVault: { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] }
  });
  const unlockIdbSeed = label => ({
    [KEYS.data]: emptyData({ people: [{ id: `idb_${label}`, name: `Fictional IndexedDB ${label}` }] }),
    [KEYS.settings]: { localEncryptionEnabled: true, marker: `fictional-${label}-settings` },
    [KEYS.encrypted]: envelope(`idb-${label}`),
    [KEYS.copy]: { "brand.title": `Fictional IndexedDB ${label}` },
    [KEYS.autosave]: { "capture:main": { fields: { "quick-text": `Fictional IndexedDB ${label}` } } },
    [KEYS.autoMemory]: { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] }
  });
  const warningsFor = [];
  const makeUnlockHarness = async (initialEnvelope = "e1", { idbSeed = null } = {}) => {
    const warnings = [];
    warningsFor.push(warnings);
    const harness = makeHarness({
      local: {
        [KEYS.settings]: { localEncryptionEnabled: true, localEncryptionHint: "fictional hint" },
        [KEYS.encrypted]: rawEnvelope(initialEnvelope)
      },
      idbSeed,
      syntheticConsole: {
        ...console,
        warn: (...args) => warnings.push(args.map(value => String(value)).join(" "))
      }
    });
    await harness.ready();
    harness.localStorageOperations.length = 0;
    const input = harness.sandbox.document.getElementById("vault-passphrase");
    input.tagName = "INPUT";
    input.type = "password";
    input.attributes = {};
    input.setAttribute = (name, value) => { input.attributes[name] = String(value); };
    input.getAttribute = name => input.attributes[name] || null;
    input.removeAttribute = name => { delete input.attributes[name]; };
    input.focusCount = 0;
    input.focus = () => {
      input.focusCount += 1;
      harness.sandbox.document.activeElement = input;
    };
    const pinInput = harness.sandbox.document.getElementById("pin-input");
    pinInput.tagName = "INPUT";
    pinInput.type = "password";
    pinInput.attributes = {};
    pinInput.setAttribute = (name, value) => { pinInput.attributes[name] = String(value); };
    pinInput.getAttribute = name => pinInput.attributes[name] || null;
    pinInput.removeAttribute = name => { delete pinInput.attributes[name]; };
    pinInput.focusCount = 0;
    pinInput.focus = () => {
      pinInput.focusCount += 1;
      harness.sandbox.document.activeElement = pinInput;
    };
    const toast = harness.sandbox.document.getElementById("toast");
    toast.attributes = {};
    toast.setAttribute = (name, value) => { toast.attributes[name] = String(value); };
    toast.getAttribute = name => toast.attributes[name] || null;
    toast.classNames = new Set();
    toast.classList = {
      add: name => toast.classNames.add(String(name)),
      remove: name => toast.classNames.delete(String(name)),
      contains: name => toast.classNames.has(String(name))
    };
    harness.eval(`
      db = emptyData();
      db.people = [{ id: "unlock_before", name: "Fictional before unlock" }];
      customCopy = { "brand.title": "Fictional before unlock" };
      autosaveDraftsCache = { "capture:main": { fields: { "quick-text": "Fictional before unlock" } } };
      memoryVaultCache = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] };
      undoStack = [{ id: "fictional-undo", generation: 7 }];
      undoGeneration = 7;
      vaultPassphrase = "";
      view.encryptionLocked = true;
      view.locked = false;
      view.startupRecoveryError = "";
      globalThis.__unlockRaceEffects = {
        decrypt: [],
        normalize: 0,
        restore: 0,
        initializeMemory: 0,
        renders: 0,
        headingFocus: 0,
        fields: [],
        toasts: []
      };
      globalThis.__unlockRaceTimerTokens = [];
      globalThis.__unlockRaceTimerToken = timer => {
        if (timer === null || timer === undefined) return 0;
        const existing = globalThis.__unlockRaceTimerTokens.indexOf(timer);
        if (existing >= 0) return existing + 1;
        globalThis.__unlockRaceTimerTokens.push(timer);
        return globalThis.__unlockRaceTimerTokens.length;
      };
      globalThis.__unlockRaceOriginalNormalize = normalizeData;
      globalThis.__unlockRaceOriginalRestore = restoreInterruptedWorkflow;
      globalThis.__unlockRaceOriginalInitializeMemory = initializeAutoMemoryVault;
      globalThis.__unlockRaceOriginalRender = render;
      globalThis.__unlockRaceOriginalHeadingFocus = requestPageHeadingFocus;
      globalThis.__unlockRaceOriginalField = reportFieldError;
      globalThis.__unlockRaceOriginalToast = showToast;
      normalizeData = (...args) => {
        globalThis.__unlockRaceEffects.normalize += 1;
        return globalThis.__unlockRaceOriginalNormalize(...args);
      };
      restoreInterruptedWorkflow = (...args) => {
        globalThis.__unlockRaceEffects.restore += 1;
        return globalThis.__unlockRaceOriginalRestore(...args);
      };
      initializeAutoMemoryVault = (...args) => {
        globalThis.__unlockRaceEffects.initializeMemory += 1;
        return globalThis.__unlockRaceOriginalInitializeMemory(...args);
      };
      render = (...args) => {
        globalThis.__unlockRaceEffects.renders += 1;
        return globalThis.__unlockRaceOriginalRender(...args);
      };
      requestPageHeadingFocus = (...args) => {
        globalThis.__unlockRaceEffects.headingFocus += 1;
        return globalThis.__unlockRaceOriginalHeadingFocus(...args);
      };
      reportFieldError = (field, message) => {
        globalThis.__unlockRaceEffects.fields.push(String(message || ""));
        return globalThis.__unlockRaceOriginalField(field, message);
      };
      showToast = (message, severity = "") => {
        globalThis.__unlockRaceEffects.toasts.push([String(message || ""), String(severity || "")]);
        return globalThis.__unlockRaceOriginalToast(message, severity);
      };
    `);
    return { harness, warnings };
  };
  const installDeferredDecrypt = (harness, gates) => {
    harness.sandbox.__unlockRaceGates = gates;
    harness.eval(`
      decryptPayload = (candidateEnvelope, passphrase) => {
        const key = String(candidateEnvelope?.ciphertext || "");
        globalThis.__unlockRaceEffects.decrypt.push({ key, passphrase: String(passphrase || "") });
        const gate = globalThis.__unlockRaceGates[key];
        if (!gate) return Promise.reject(new Error("not unlocked"));
        return gate.promise;
      };
    `);
  };
  const observe = ({ harness, warnings }) => ({
    live: harness.eval(`JSON.stringify({
      db,
      settings,
      customCopy,
      autosaveDraftsCache,
      memoryVaultCache,
      undoStack,
      undoGeneration,
      vaultPassphrase,
      vaultUnlockAttemptSequence,
      pendingPageHeadingFocus,
      view,
      recoveryEpoch,
      recoveryTransactionPending,
      recoveryTransactionKind,
      revisions: { requested: vaultSaveRequestedRevision, completed: vaultSaveCompletedRevision },
      vaultPayloadGeneration,
      indexedDbPersistence: {
        queueSequence: indexedDbQueueSequence,
        pendingCount: indexedDbPendingCount,
        failedKeys: Array.from(indexedDbFailedKeys).sort()
      },
      timers: {
        vaultSave: globalThis.__unlockRaceTimerToken(vaultSaveTimer),
        autosave: globalThis.__unlockRaceTimerToken(autosaveTimer),
        toast: globalThis.__unlockRaceTimerToken(toastTimer),
        globalSearch: globalThis.__unlockRaceTimerToken(globalSearchTimer)
      },
      effects: globalThis.__unlockRaceEffects,
      toastText: document.getElementById("toast").textContent,
      toastRole: document.getElementById("toast").getAttribute?.("role") || "",
      toastLive: document.getElementById("toast").getAttribute?.("aria-live") || "",
      toastShown: document.getElementById("toast").classList.contains("show"),
      activeElementId: document.activeElement?.id || "",
      bodyMarkup: document.body.innerHTML,
      inputInvalid: document.getElementById("vault-passphrase").getAttribute?.("aria-invalid") || "",
      pinInvalid: document.getElementById("pin-input").getAttribute?.("aria-invalid") || ""
    })`),
    local: sortedLocalSnapshot(harness),
    operations: JSON.stringify(harness.localStorageOperations),
    indexedDb: sortedIdbSnapshot(harness),
    idbMetrics: harness.fakeIdb ? JSON.stringify({
      openCalls: harness.fakeIdb.openCalls,
      reads: harness.fakeIdb.reads,
      transactions: harness.fakeIdb.transactions,
      writes: harness.fakeIdb.writes,
      closeCount: harness.fakeIdb.closeCount,
      abortCount: harness.fakeIdb.abortCount,
      activeTransactions: harness.fakeIdb.activeTransactions,
      pendingOpenRequests: harness.fakeIdb.pendingOpenRequests.length,
      transactionGates: harness.fakeIdb.transactionGates.length,
      transactionWaiters: harness.fakeIdb.transactionWaiters.length,
      idleWaiters: harness.fakeIdb.idleWaiters.length,
      failNextTransaction: harness.fakeIdb.failNextTransaction,
      failNextReadonlyTransaction: harness.fakeIdb.failNextReadonlyTransaction,
      neverSettleNextTransaction: harness.fakeIdb.neverSettleNextTransaction
    }) : "NO_INDEXED_DB",
    warnings: JSON.stringify(warnings),
    inputFocusCount: harness.elements["vault-passphrase"].focusCount,
    pinFocusCount: harness.elements["pin-input"].focusCount
  });
  const sameObservation = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const failures = [];
  const expect = (condition, label) => {
    if (!condition) failures.push(label);
  };
  const settleUnlockIdb = async harness => {
    await flushControlledMicrotasks();
    if (harness.fakeIdb) {
      await harness.eval("drainIndexedDbCoordinator()");
      await harness.fakeIdb.waitForIdle();
    }
    await flushControlledMicrotasks();
  };
  const durableStateUnchanged = (beforeState, afterState) => JSON.stringify({
    db: afterState.db,
    settings: afterState.settings,
    customCopy: afterState.customCopy,
    autosaveDraftsCache: afterState.autosaveDraftsCache,
    memoryVaultCache: afterState.memoryVaultCache,
    undoStack: afterState.undoStack,
    undoGeneration: afterState.undoGeneration,
    vaultPassphrase: afterState.vaultPassphrase,
    view: afterState.view,
    recoveryEpoch: afterState.recoveryEpoch,
    recoveryTransactionPending: afterState.recoveryTransactionPending,
    recoveryTransactionKind: afterState.recoveryTransactionKind,
    revisions: afterState.revisions,
    vaultPayloadGeneration: afterState.vaultPayloadGeneration,
    indexedDbPersistence: afterState.indexedDbPersistence,
    vaultSaveTimer: afterState.timers.vaultSave,
    autosaveTimer: afterState.timers.autosave,
    globalSearchTimer: afterState.timers.globalSearch,
    bodyMarkup: afterState.bodyMarkup
  }) === JSON.stringify({
    db: beforeState.db,
    settings: beforeState.settings,
    customCopy: beforeState.customCopy,
    autosaveDraftsCache: beforeState.autosaveDraftsCache,
    memoryVaultCache: beforeState.memoryVaultCache,
    undoStack: beforeState.undoStack,
    undoGeneration: beforeState.undoGeneration,
    vaultPassphrase: beforeState.vaultPassphrase,
    view: beforeState.view,
    recoveryEpoch: beforeState.recoveryEpoch,
    recoveryTransactionPending: beforeState.recoveryTransactionPending,
    recoveryTransactionKind: beforeState.recoveryTransactionKind,
    revisions: beforeState.revisions,
    vaultPayloadGeneration: beforeState.vaultPayloadGeneration,
    indexedDbPersistence: beforeState.indexedDbPersistence,
    vaultSaveTimer: beforeState.timers.vaultSave,
    autosaveTimer: beforeState.timers.autosave,
    globalSearchTimer: beforeState.timers.globalSearch,
    bodyMarkup: beforeState.bodyMarkup
  });

  for (const [name, pin, expectedMessage] of [
    ["empty", "", "Enter your PIN."],
    ["wrong", "1357", "That PIN did not match."],
    ["correct", "2468", "Unlocked."]
  ]) {
    const fixture = await makeUnlockHarness("e1", { idbSeed: unlockIdbSeed(`direct-pin-${name}`) });
    fixture.harness.eval(`
      settings.appLockEnabled = true;
      settings.pinHash = hashPin("2468");
      view.encryptionLocked = false;
      view.locked = true;
    `);
    fixture.harness.elements["pin-input"].value = pin;
    const before = observe(fixture);
    const beforeState = JSON.parse(before.live);
    const result = fixture.harness.eval("unlockApp()");
    await settleUnlockIdb(fixture.harness);
    const after = observe(fixture);
    const afterState = JSON.parse(after.live);
    const diagnosticSafe = name === "correct"
      ? afterState.view.locked === false
        && afterState.effects.headingFocus === 1
        && afterState.effects.renders === 1
        && afterState.effects.fields.length === 0
        && JSON.stringify(afterState.effects.toasts) === JSON.stringify([["Unlocked.", ""]])
        && afterState.pinInvalid === ""
        && afterState.pendingPageHeadingFocus === false
      : afterState.view.locked === true
        && afterState.effects.headingFocus === 0
        && afterState.effects.renders === 0
        && JSON.stringify(afterState.effects.fields) === JSON.stringify([expectedMessage])
        && JSON.stringify(afterState.effects.toasts) === JSON.stringify([[expectedMessage, "error"]])
        && afterState.pinInvalid === "true"
        && afterState.activeElementId === "pin-input"
        && after.pinFocusCount === 1
        && afterState.pendingPageHeadingFocus === false;
    expect(
      result === undefined
        && diagnosticSafe
        && afterState.toastText === expectedMessage
        && afterState.toastRole === (name === "correct" ? "status" : "alert")
        && afterState.toastLive === (name === "correct" ? "polite" : "assertive")
        && afterState.toastShown === true
        && afterState.timers.toast !== beforeState.timers.toast
        && afterState.effects.decrypt.length === 0
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.vaultUnlockAttemptSequence === beforeState.vaultUnlockAttemptSequence
        && afterState.recoveryEpoch === beforeState.recoveryEpoch
        && JSON.stringify(afterState.revisions) === JSON.stringify(beforeState.revisions)
        && afterState.vaultPayloadGeneration === beforeState.vaultPayloadGeneration
        && JSON.stringify(afterState.indexedDbPersistence) === JSON.stringify(beforeState.indexedDbPersistence)
        && after.local === before.local
        && after.operations === before.operations
        && after.indexedDb === before.indexedDb
        && after.idbMetrics === before.idbMetrics
        && after.warnings === "[]",
      `direct App Lock ${name} PIN preserves its exact focus, diagnostic, heading-request, and zero-durable-effect boundary`
    );
  }

  {
    const fixture = await makeUnlockHarness("e1", { idbSeed: unlockIdbSeed("empty-passphrase") });
    fixture.harness.elements["vault-passphrase"].value = "";
    const before = observe(fixture);
    const beforeState = JSON.parse(before.live);
    const result = await fixture.harness.eval("unlockVault()");
    await settleUnlockIdb(fixture.harness);
    const after = observe(fixture);
    const afterState = JSON.parse(after.live);
    expect(
      result === undefined
        && durableStateUnchanged(beforeState, afterState)
        && afterState.vaultUnlockAttemptSequence === beforeState.vaultUnlockAttemptSequence
        && afterState.effects.decrypt.length === 0
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.effects.renders === 0
        && afterState.effects.headingFocus === 0
        && JSON.stringify(afterState.effects.fields) === JSON.stringify(["Enter your vault passphrase."])
        && JSON.stringify(afterState.effects.toasts) === JSON.stringify([["Enter your vault passphrase.", "error"]])
        && afterState.toastText === "Enter your vault passphrase."
        && afterState.toastRole === "alert"
        && afterState.toastLive === "assertive"
        && afterState.toastShown === true
        && afterState.inputInvalid === "true"
        && afterState.activeElementId === "vault-passphrase"
        && after.inputFocusCount === 1
        && afterState.timers.toast !== beforeState.timers.toast
        && after.local === before.local
        && after.operations === before.operations
        && after.indexedDb === before.indexedDb
        && after.idbMetrics === before.idbMetrics
        && after.warnings === "[]",
      "empty Device Vault passphrase retains exact no-attempt/no-decrypt field validation with zero live or durable effect"
    );
  }

  {
    const fixture = await makeUnlockHarness("e1", { idbSeed: unlockIdbSeed("current-wrong-passphrase") });
    const gate = deferred();
    installDeferredDecrypt(fixture.harness, { e1: gate });
    fixture.harness.elements["vault-passphrase"].value = "fictional-current-wrong-passphrase";
    const before = observe(fixture);
    const beforeState = JSON.parse(before.live);
    const attempt = fixture.harness.eval("unlockVault()");
    gate.reject(new Error("synthetic current wrong decrypt failure"));
    const result = await attempt;
    await settleUnlockIdb(fixture.harness);
    const after = observe(fixture);
    const afterState = JSON.parse(after.live);
    expect(
      result === false
        && durableStateUnchanged(beforeState, afterState)
        && afterState.vaultUnlockAttemptSequence === beforeState.vaultUnlockAttemptSequence + 1
        && JSON.stringify(afterState.effects.decrypt) === JSON.stringify([{ key: "e1", passphrase: "fictional-current-wrong-passphrase" }])
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.effects.renders === 0
        && afterState.effects.headingFocus === 0
        && JSON.stringify(afterState.effects.fields) === JSON.stringify(["Passphrase did not unlock storage."])
        && JSON.stringify(afterState.effects.toasts) === JSON.stringify([["Passphrase did not unlock storage.", "error"]])
        && afterState.toastText === "Passphrase did not unlock storage."
        && afterState.toastRole === "alert"
        && afterState.toastLive === "assertive"
        && afterState.toastShown === true
        && afterState.inputInvalid === "true"
        && afterState.activeElementId === "vault-passphrase"
        && after.inputFocusCount === 1
        && afterState.timers.toast !== beforeState.timers.toast
        && after.local === before.local
        && after.operations === before.operations
        && after.indexedDb === before.indexedDb
        && after.idbMetrics === before.idbMetrics
        && after.warnings === JSON.stringify(["Could not unlock encrypted storage Error: synthetic current wrong decrypt failure"]),
      "current wrong Device Vault passphrase retains one decrypt, exact warning/field alert, and zero live or durable effect"
    );
  }

  const rejectedSchemaCases = [
    ["schema-1", () => payload("schema_1", 1)],
    ["future", () => payload("schema_future", 999)],
    ["string", () => payload("schema_string", "3")],
    ["null", () => payload("schema_null", null)],
    ["boolean", () => payload("schema_boolean", true)],
    ["object", () => payload("schema_object", {})],
    ["array", () => payload("schema_array", [])],
    ["fractional", () => payload("schema_fractional", 2.5)],
    ["nan", () => payload("schema_nan", Number.NaN)],
    ["positive-infinity", () => payload("schema_positive_infinity", Number.POSITIVE_INFINITY)],
    ["negative-infinity", () => payload("schema_negative_infinity", Number.NEGATIVE_INFINITY)],
    ["missing-data", () => {
      const value = payload("schema_missing_data");
      delete value.data;
      return value;
    }],
    ["incomplete-data", () => ({
      ...payload("schema_incomplete_data"),
      data: { dataSchemaVersion: 3, people: [] }
    })],
    ["auto-memory-future", () => {
      const value = payload("auto_memory_future");
      const graph = emptyData({ people: [{ id: "fictional_encrypted_auto_memory", name: "Fictional encrypted restore point" }] });
      delete graph.dataSchemaVersion;
      value.autoMemoryVault = {
        version: 1,
        updatedAt: "2026-07-20T00:00:00.000Z",
        snapshots: [{
          id: "encrypted-auto-memory-future",
          savedAt: "2026-07-20T00:00:00.000Z",
          label: "Fictional unsupported",
          appVersion: "synthetic-v38",
          summary: "Fictional summary",
          signature: "fictional-encrypted-unsupported",
          payload: {
            exportedAt: "2026-07-20T00:00:00.000Z",
            dataSchemaVersion: 999,
            db: graph,
            settings: {},
            customCopy: {},
            autosaveDrafts: {}
          }
        }]
      };
      return value;
    }]
  ];
  for (const [name, makePayload] of rejectedSchemaCases) {
    const fixture = await makeUnlockHarness("schema", { idbSeed: unlockIdbSeed(`schema-rejection-${name}`) });
    const gate = deferred();
    const validGate = deferred();
    const validEnvelopeKey = `valid-${name}`;
    installDeferredDecrypt(fixture.harness, { schema: gate, [validEnvelopeKey]: validGate });
    fixture.harness.elements["vault-passphrase"].value = `fictional-${name}-passphrase`;
    const before = observe(fixture);
    const unlock = fixture.harness.eval("unlockVault()");
    const rejectedPayload = makePayload();
    gate.resolve(name === "auto-memory-future" ? fixture.harness.eval(`(${JSON.stringify(rejectedPayload)})`) : rejectedPayload);
    const result = await unlock;
    await settleUnlockIdb(fixture.harness);
    const after = observe(fixture);
    const afterState = JSON.parse(after.live);
    const beforeState = JSON.parse(before.live);
    expect(
      result === false
        && durableStateUnchanged(beforeState, afterState)
        && afterState.view.encryptionLocked === true
        && afterState.effects.decrypt.length === 1
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.effects.renders === 0
        && afterState.effects.headingFocus === 0
        && afterState.effects.fields.length === 0
        && afterState.effects.toasts.length === 1
        && afterState.effects.toasts[0][0] === schemaRetryMessage
        && afterState.toastText === schemaRetryMessage
        && afterState.toastRole === "alert"
        && afterState.toastLive === "assertive"
        && afterState.toastShown === true
        && afterState.inputInvalid === ""
        && afterState.activeElementId === "vault-passphrase"
        && after.inputFocusCount === 1
        && afterState.timers.toast !== beforeState.timers.toast
        && after.local === before.local
        && after.operations === before.operations
        && after.indexedDb === before.indexedDb
        && after.idbMetrics === before.idbMetrics
        && after.warnings === before.warnings,
      `${name} decrypted Device Vault schema rejects before normalization, unlock, cleanup, or persistence effects`
    );
    fixture.harness.sandbox.localStorage.setItem(KEYS.encrypted, rawEnvelope(validEnvelopeKey));
    fixture.harness.elements["vault-passphrase"].value = `fictional-valid-${name}-passphrase`;
    const retry = fixture.harness.eval("unlockVault()");
    validGate.resolve(payload(`valid_retry_${name}`));
    const retryResult = await retry;
    await settleUnlockIdb(fixture.harness);
    const afterRetry = observe(fixture);
    const retryState = JSON.parse(afterRetry.live);
    expect(
      retryResult === true
        && retryState.db.dataSchemaVersion === 3
        && retryState.db.people[0]?.id === `unlock_valid_retry_${name}`
        && retryState.customCopy["brand.title"] === `Fictional valid_retry_${name}`
        && retryState.autosaveDraftsCache["capture:main"]?.fields?.["quick-text"] === `Fictional valid_retry_${name}`
        && retryState.memoryVaultCache.version === 1
        && retryState.vaultPassphrase === `fictional-valid-${name}-passphrase`
        && retryState.view.encryptionLocked === false
        && retryState.effects.decrypt.length === 2
        && retryState.effects.normalize === 1
        && retryState.effects.restore === 1
        && retryState.effects.initializeMemory === 1
        && retryState.effects.renders === 1
        && retryState.effects.headingFocus === 1
        && retryState.pendingPageHeadingFocus === false
        && retryState.effects.fields.length === 0
        && retryState.effects.toasts.length === 2
        && retryState.effects.toasts[1][0] === "Encrypted storage unlocked."
        && retryState.toastText === "Encrypted storage unlocked."
        && afterRetry.warnings === before.warnings
        && afterRetry.indexedDb === before.indexedDb
        && afterRetry.idbMetrics === before.idbMetrics,
      `${name} rejected schema permits exactly one later valid retry on the same locked harness`
    );
  }

  for (const [name, marker, lockMode, expectedLocked, expectedHeadingFocus] of [
    ["absent", undefined, "off", false, 1],
    ["schema-2", 2, "off", false, 1],
    ["schema-3", 3, "off", false, 1],
    ["schema-3-app-lock", 3, "valid-pin", true, 0],
    ["schema-3-enabled-without-pin", 3, "missing-pin", false, 1]
  ]) {
    const fixture = await makeUnlockHarness("supported");
    const gate = deferred();
    installDeferredDecrypt(fixture.harness, { supported: gate });
    fixture.harness.eval(`
      settings.appLockEnabled = ${lockMode === "off" ? "false" : "true"};
      settings.pinHash = ${lockMode === "valid-pin" ? 'hashPin("2468")' : '""'};
    `);
    const supportedPayload = payload(`supported_${name}`, marker);
    if (marker === undefined) delete supportedPayload.data.dataSchemaVersion;
    supportedPayload.data.people[0].unknownRecordProperty = { preserved: true };
    const settingsBytes = fixture.harness.storage[KEYS.settings];
    const envelopeBytes = fixture.harness.storage[KEYS.encrypted];
    fixture.harness.sandbox.localStorage.setItem(KEYS.data, JSON.stringify(emptyData({ people: [{ id: "cleanup-data" }] })));
    fixture.harness.sandbox.localStorage.setItem(KEYS.copy, JSON.stringify({ "brand.title": "cleanup copy" }));
    fixture.harness.sandbox.localStorage.setItem(KEYS.autoMemory, JSON.stringify({ version: 1, updatedAt: "", snapshots: [] }));
    fixture.harness.localStorageOperations.length = 0;
    fixture.harness.elements["vault-passphrase"].value = `fictional-supported-${name}-passphrase`;
    const unlock = fixture.harness.eval("unlockVault()");
    gate.resolve(supportedPayload);
    const result = await unlock;
    const after = observe(fixture);
    const state = JSON.parse(after.live);
    expect(
      result === true
        && state.db.dataSchemaVersion === 3
        && state.db.people[0]?.id === `unlock_supported_${name}`
        && state.db.people[0]?.unknownRecordProperty?.preserved === true
        && state.customCopy["brand.title"] === `Fictional supported_${name}`
        && state.autosaveDraftsCache["capture:main"]?.fields?.["quick-text"] === `Fictional supported_${name}`
        && state.memoryVaultCache.version === 1
        && state.vaultPassphrase === `fictional-supported-${name}-passphrase`
        && state.view.encryptionLocked === false
        && state.view.locked === expectedLocked
        && state.effects.decrypt.length === 1
        && state.effects.normalize === 1
        && state.effects.restore === 1
        && state.effects.initializeMemory === 1
        && state.effects.renders === 1
        && state.effects.headingFocus === expectedHeadingFocus
        && state.pendingPageHeadingFocus === false
        && state.effects.fields.length === 0
        && state.effects.toasts.length === 1
        && state.effects.toasts[0][0] === "Encrypted storage unlocked."
        && after.warnings === "[]"
        && after.operations === JSON.stringify([
          ["remove", KEYS.data],
          ["remove", KEYS.copy],
          ["remove", KEYS.autoMemory]
        ])
        && fixture.harness.storage[KEYS.settings] === settingsBytes
        && fixture.harness.storage[KEYS.encrypted] === envelopeBytes
        && !Object.prototype.hasOwnProperty.call(fixture.harness.storage, KEYS.data)
        && !Object.prototype.hasOwnProperty.call(fixture.harness.storage, KEYS.copy)
        && !Object.prototype.hasOwnProperty.call(fixture.harness.storage, KEYS.autosave)
        && !Object.prototype.hasOwnProperty.call(fixture.harness.storage, KEYS.autoMemory)
        && after.indexedDb === "NO_INDEXED_DB",
      `${name} decrypted Device Vault payload retains supported migration, auxiliary fields, unknown record properties, cleanup, and one success path`
    );
  }

  {
    const fixture = await makeUnlockHarness("e1");
    const originalGetItem = fixture.harness.sandbox.localStorage.getItem;
    fixture.harness.sandbox.localStorage.getItem = key => {
      if (key === KEYS.encrypted) throw new Error("synthetic local envelope read unavailable");
      return originalGetItem(key);
    };
    fixture.harness.elements["vault-passphrase"].value = "fictional-unavailable-passphrase";
    let result = null;
    let rejected = false;
    try {
      result = await fixture.harness.eval("unlockVault()");
    } catch (_error) {
      rejected = true;
    }
    fixture.harness.sandbox.localStorage.getItem = originalGetItem;
    const after = observe(fixture);
    const afterState = JSON.parse(after.live);
    expect(
      rejected === false
        && result === false
        && afterState.view.encryptionLocked === true
        && afterState.vaultPassphrase === ""
        && afterState.effects.decrypt.length === 0
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.effects.renders === 0
        && afterState.effects.headingFocus === 0
        && afterState.effects.fields.length === 0
        && afterState.effects.toasts.length === 1
        && afterState.effects.toasts[0][0] === envelopeRetryMessage
        && afterState.toastText === envelopeRetryMessage
        && afterState.toastRole === "alert"
        && afterState.toastLive === "assertive"
        && afterState.inputInvalid === ""
        && afterState.activeElementId === "vault-passphrase"
        && after.warnings === "[]"
        && after.operations === "[]"
        && after.indexedDb === "NO_INDEXED_DB",
      "an unavailable current envelope read fails closed once without recursive read, warning, invalid field, or durable effect"
    );
  }

  for (const [name, settle] of [
    ["success", gate => gate.resolve(payload("stale_epoch_supported"))],
    ["failure", gate => gate.reject(new Error("synthetic stale epoch decrypt failure"))]
  ]) {
    const fixture = await makeUnlockHarness("e1", { idbSeed: unlockIdbSeed(`stale-epoch-${name}`) });
    const gate = deferred();
    installDeferredDecrypt(fixture.harness, { e1: gate });
    fixture.harness.elements["vault-passphrase"].value = `fictional-stale-epoch-${name}-passphrase`;
    const attempt = fixture.harness.eval("unlockVault()");
    fixture.harness.eval("recoveryEpoch += 1");
    const beforeSettlement = observe(fixture);
    const beforeState = JSON.parse(beforeSettlement.live);
    settle(gate);
    const result = await attempt;
    await settleUnlockIdb(fixture.harness);
    const afterSettlement = observe(fixture);
    expect(
      result === false
        && beforeState.vaultUnlockAttemptSequence === 1
        && beforeState.effects.decrypt.length === 1
        && beforeState.effects.decrypt[0].key === "e1"
        && beforeState.recoveryEpoch === 1
        && sameObservation(afterSettlement, beforeSettlement),
      `current Device Vault ${name} settlement stays silent and inert after its recovery epoch is superseded`
    );
  }

  {
    const fixture = await makeUnlockHarness("e1");
    const older = deferred();
    const newer = deferred();
    installDeferredDecrypt(fixture.harness, { e1: older, e2: newer });
    fixture.harness.elements["vault-passphrase"].value = "fictional-older-passphrase";
    const olderAttempt = fixture.harness.eval("unlockVault()");
    fixture.harness.sandbox.localStorage.setItem(KEYS.encrypted, rawEnvelope("e2"));
    fixture.harness.elements["vault-passphrase"].value = "fictional-newer-wrong-passphrase";
    const newerAttempt = fixture.harness.eval("unlockVault()");
    newer.reject(new Error("not unlocked"));
    const newerResult = await newerAttempt;
    const afterNewer = observe(fixture);
    older.resolve(payload("older_supported"));
    const olderResult = await olderAttempt;
    const afterOlder = observe(fixture);
    expect(
      newerResult === false && olderResult === false && sameObservation(afterOlder, afterNewer),
      "older supported unlock stays silent and inert after a newer wrong-passphrase attempt settles first"
    );
  }

  {
    const fixture = await makeUnlockHarness("e1");
    const current = deferred();
    installDeferredDecrypt(fixture.harness, { e1: current });
    fixture.harness.elements["vault-passphrase"].value = "fictional-current-passphrase";
    const attempt = fixture.harness.eval("unlockVault()");
    fixture.harness.sandbox.localStorage.setItem(KEYS.encrypted, rawEnvelope("e2"));
    const afterReplacement = observe(fixture);
    current.resolve(payload("replaced_envelope"));
    const result = await attempt;
    const after = observe(fixture);
    const beforeState = JSON.parse(afterReplacement.live);
    const afterState = JSON.parse(after.live);
    const contentBearing = ["fictional-current-passphrase", "replaced_envelope", "e1", "e2"];
    expect(
      result === false
        && durableStateUnchanged(beforeState, afterState)
        && afterState.view.encryptionLocked === true
        && afterState.timers.vaultSave === beforeState.timers.vaultSave
        && afterState.timers.autosave === beforeState.timers.autosave
        && afterState.effects.normalize === 0
        && afterState.effects.restore === 0
        && afterState.effects.initializeMemory === 0
        && afterState.effects.renders === 0
        && afterState.effects.fields.length === 0
        && afterState.effects.toasts.length === 1
        && afterState.effects.toasts[0][0] === envelopeRetryMessage
        && afterState.toastText === envelopeRetryMessage
        && afterState.toastRole === "alert"
        && afterState.toastLive === "assertive"
        && afterState.toastShown === true
        && afterState.inputInvalid === ""
        && afterState.activeElementId === "vault-passphrase"
        && after.inputFocusCount === 1
        && afterState.timers.toast !== beforeState.timers.toast
        && after.local === afterReplacement.local
        && after.operations === afterReplacement.operations
        && after.indexedDb === afterReplacement.indexedDb
        && JSON.parse(after.warnings).every(message => contentBearing.every(value => !message.includes(value))),
      "a current unlock whose exact envelope bytes change during decrypt remains locked with one fixed content-free retry and no durable effect"
    );
  }

  {
    const fixture = await makeUnlockHarness("e1");
    const older = deferred();
    const newer = deferred();
    installDeferredDecrypt(fixture.harness, { e1: older, e2: newer });
    fixture.harness.elements["vault-passphrase"].value = "fictional-older-valid-passphrase";
    const olderAttempt = fixture.harness.eval("unlockVault()");
    fixture.harness.sandbox.localStorage.setItem(KEYS.encrypted, rawEnvelope("e2"));
    fixture.harness.elements["vault-passphrase"].value = "fictional-newer-valid-passphrase";
    const newerAttempt = fixture.harness.eval("unlockVault()");
    newer.resolve(payload("newer_valid"));
    const newerResult = await newerAttempt;
    const afterNewer = observe(fixture);
    older.resolve(payload("older_valid"));
    const olderResult = await olderAttempt;
    const afterOlder = observe(fixture);
    expect(
      newerResult === true && olderResult === false && sameObservation(afterOlder, afterNewer),
      "two valid overlapping unlocks retain the newest success when the older attempt settles last"
    );
    expect(
      JSON.parse(afterNewer.live).effects.headingFocus === 1 && JSON.parse(afterNewer.live).pendingPageHeadingFocus === false,
      "the newest supported App-Lock-off vault winner requests heading focus exactly once before stale success settles"
    );
  }

  {
    const fixture = await makeUnlockHarness("e1");
    const older = deferred();
    const newer = deferred();
    installDeferredDecrypt(fixture.harness, { e1: older, e2: newer });
    fixture.harness.elements["vault-passphrase"].value = "fictional-older-failing-passphrase";
    const olderAttempt = fixture.harness.eval("unlockVault()");
    fixture.harness.sandbox.localStorage.setItem(KEYS.encrypted, rawEnvelope("e2"));
    fixture.harness.elements["vault-passphrase"].value = "fictional-newer-success-passphrase";
    const newerAttempt = fixture.harness.eval("unlockVault()");
    newer.resolve(payload("newer_success"));
    const newerResult = await newerAttempt;
    const afterNewer = observe(fixture);
    older.reject(new Error("not unlocked"));
    const olderResult = await olderAttempt;
    const afterOlder = observe(fixture);
    expect(
      newerResult === true && olderResult === false && sameObservation(afterOlder, afterNewer),
      "an older decrypt failure stays silent and cannot replace a newer successful unlock UI or state"
    );
    expect(
      JSON.parse(afterNewer.live).effects.headingFocus === 1 && JSON.parse(afterNewer.live).pendingPageHeadingFocus === false,
      "the newest supported App-Lock-off vault winner requests heading focus exactly once before stale failure settles"
    );
  }

  if (failures.length) throw new Error(`CALM-STORED-SCHEMA-35A contracts failed:\n${failures.join("\n")}`);
  assert(warningsFor.length === rejectedSchemaCases.length + 17, "Device Vault schema, focus, and latest-attempt matrix exercised all fictional fixtures");
}

async function run() {
  await testAutoMemoryStrictSchemaAndRawCountRedContracts();
  await testPlaintextIndexedDbOnlyRecovery();
  await testEncryptedIndexedDbOnlyRecovery();
  await testCorruptStorageRecoveryBoundary();
  await testStoredDataSchemaStartupBoundary();
  await testStructuralMirrorAndAtomicEncryptedCommit();
  await testLegacyAutoMemoryRestore();
  await testFirstInstallAndMissingVault();
  await testSerializedNewestEncryptedWrite();
  await testRestorePersistenceRollbackAcrossStores();
  await testEncryptedUndoDurabilityTransaction();
  await testRecovery18RedContracts();
  await testRecovery19RedContracts();
  await testRecovery21RedContracts();
  await testRecovery28RedContracts();
  await testToastAccessibilityAndDeadlineOwnership();
  await testDeviceVaultUnlockSchemaAndLatestAttemptBoundary();
  await testPortableSchemaDefaultDenyRecoveryBoundary();
  await testRecoveredSharedCaptureOptOutWins();
  console.log("All Calm OS recovery regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

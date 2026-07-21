const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.join(repoRoot, "ruf-ministry-hub-deploy-working");
const appPath = "/ruf-ministry-hub.html";
const syntheticCapture = "Pray for Synthetic Browser Person after our meeting and follow up tomorrow.";
const fragmentCapture = "Fragment privacy 🙏 100% + / ? & = # exact";

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitFor(check, label, timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function pass(label) {
  console.log(`SIMULATED-BROWSER PASS ${label}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.RUF_HUB_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error("Chrome/Chromium is required. Set RUF_HUB_CHROME_PATH to its executable.");
  return executable;
}

function mimeType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function startServer() {
  const apiRequests = [];
  const requestLog = [];
  const server = http.createServer((request, response) => {
    requestLog.push(request.url);
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname.startsWith("/api/")) {
      apiRequests.push({ method: request.method, path: requestUrl.pathname });
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Synthetic browser journey keeps external AI disabled." }));
      return;
    }
    const relative = requestUrl.pathname === "/"
      ? "index.html"
      : requestUrl.pathname === "/ruf-ministry-hub"
        ? "ruf-ministry-hub.html"
        : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(appRoot, relative);
    if (!filePath.startsWith(appRoot + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": filePath.endsWith("ruf-ministry-hub-sw.js") ? "no-store" : "no-cache",
      "content-type": mimeType(filePath),
      ...(filePath.endsWith("ruf-ministry-hub-sw.js") ? { "service-worker-allowed": "/" } : {})
    });
    response.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    apiRequests,
    requestLog,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

class CdpSession {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${pending.method})`));
        else pending.resolve(message.result || {});
        return;
      }
      (this.listeners.get(message.method) || []).forEach(listener => listener(message.params || {}));
    });
  }

  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, {
        method,
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function launchBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ruf-calm-browser-"));
  const chrome = spawn(chromeExecutable(), [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=390,844",
    "about:blank"
  ], { stdio: "ignore" });
  let cdp;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    const port = await waitFor(() => {
      if (!fs.existsSync(portFile)) return false;
      return Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    }, "Chrome DevTools port");
    const target = await waitFor(async () => {
      const found = await getJson(`http://127.0.0.1:${port}/json/list`);
      return found.find(item => item.type === "page") || false;
    }, "Chrome page target");
    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.open();
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    return {
      cdp,
      chrome,
      profile,
      async close() {
        cdp.close();
        chrome.kill("SIGTERM");
        await Promise.race([new Promise(resolve => chrome.once("exit", resolve)), delay(2000)]);
        fs.rmSync(profile, { recursive: true, force: true });
      }
    };
  } catch (error) {
    if (cdp) cdp.close();
    if (chrome.exitCode === null) {
      chrome.kill("SIGTERM");
      await Promise.race([new Promise(resolve => chrome.once("exit", resolve)), delay(2000)]);
    }
    fs.rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

class BrowserPage {
  constructor(cdp) {
    this.cdp = cdp;
    this.exceptions = [];
    this.requests = [];
    this.consoleMessages = [];
    cdp.on("Runtime.exceptionThrown", event => this.exceptions.push(event.exceptionDetails?.text || "Uncaught page exception"));
    cdp.on("Network.requestWillBeSent", event => this.requests.push(event.request.url));
    cdp.on("Runtime.consoleAPICalled", event => this.consoleMessages.push((event.args || []).map(arg => String(arg.value || arg.description || "")).join(" ")));
  }

  async evaluate(expression) {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.cdp.send("Page.navigate", { url });
    await waitFor(() => this.evaluate("document.readyState === 'complete' && typeof view !== 'undefined' && view.startupHydrating === false && Boolean(document.querySelector('#main-content h1'))"), "Calm OS startup");
  }

  async click(selector) {
    const clicked = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`);
    assert.equal(clicked, true, `click target exists: ${selector}`);
  }

  async pressTab(modifiers = 0) {
    const event = {
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers
    };
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  async pressEscape() {
    const event = {
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27
    };
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  async accessibilityNodes() {
    await this.cdp.send("Accessibility.enable");
    const tree = await this.cdp.send("Accessibility.getFullAXTree");
    return tree.nodes || [];
  }

  async setValue(selector, value) {
    const changed = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(changed, true, `field exists: ${selector}`);
  }

  async check(selector) {
    const changed = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(changed, true, `checkbox exists: ${selector}`);
  }
}

function permanentCountsExpression() {
  return "({ notes: db.notes.length, meetingNotes: db.meetingNotes.length, prayerRequests: db.prayerRequests.length, tasks: db.tasks.length, people: db.people.length })";
}

async function testDeviceVaultUnlockBrowserBoundary(page, baseUrl) {
  const schemaRetryMessage = "Encrypted storage could not be opened safely. It was not changed.";
  const envelopeRetryMessage = "Encrypted storage changed. Try again.";
  const setup = await page.evaluate(`(async () => {
    const originalStorage = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .map(key => [key, localStorage.getItem(key)]);
    const makePayload = (id, marker = 3) => ({
      data: {
        ...emptyData(),
        dataSchemaVersion: marker,
        people: [{ id, name: "Fictional browser vault record", unknownRecordProperty: { preserved: true } }]
      },
      customCopy: { "brand.title": id },
      autosaveDrafts: { "capture:main": { fields: { "quick-text": id } } },
      autoMemoryVault: { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", snapshots: [] }
    });
    const future = await encryptPayload(makePayload("browser_vault_future", 999), "fictional-browser-future-passphrase");
    const invalidAutoMemoryPayload = makePayload("browser_vault_auto_memory_main", 3);
    const legacyAutoMemoryGraph = { ...emptyData() };
    delete legacyAutoMemoryGraph.dataSchemaVersion;
    invalidAutoMemoryPayload.autoMemoryVault = {
      version: 1,
      updatedAt: "2026-07-20T00:00:00.000Z",
      snapshots: [{
        id: "browser-vault-invalid-auto-memory",
        savedAt: "2026-07-20T00:00:00.000Z",
        label: "Fictional invalid Auto Memory",
        appVersion: "synthetic-v38",
        summary: "Fictional summary",
        signature: "fictional-invalid-auto-memory",
        payload: {
          exportedAt: "2026-07-20T00:00:00.000Z",
          dataSchemaVersion: 999,
          db: legacyAutoMemoryGraph,
          settings: {},
          customCopy: {},
          autosaveDrafts: {}
        }
      }]
    };
    const invalidAutoMemory = await encryptPayload(invalidAutoMemoryPayload, "fictional-browser-auto-memory-passphrase");
    const valid = await encryptPayload(makePayload("browser_vault_valid", 3), "fictional-browser-valid-passphrase");
    const raceOld = await encryptPayload(makePayload("browser_vault_race_old", 3), "fictional-browser-race-old-passphrase");
    const raceNew = await encryptPayload(makePayload("browser_vault_race_new", 3), "fictional-browser-race-new-passphrase");
    const vaultSettings = normalizeSettings({
      ...settings,
      localEncryptionEnabled: true,
      appLockEnabled: true,
      pinHash: hashPin("2468")
    });
    const settingsBytes = JSON.stringify(vaultSettings);
    const futureBytes = JSON.stringify(future);
    const invalidAutoMemoryBytes = JSON.stringify(invalidAutoMemory);
    const validBytes = JSON.stringify(valid);
    const raceOldBytes = JSON.stringify(raceOld);
    const raceNewBytes = JSON.stringify(raceNew);
    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, settingsBytes);
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, futureBytes);
    return {
      originalStorage,
      settingsBytes,
      futureBytes,
      invalidAutoMemoryBytes,
      validBytes,
      raceOldBytes,
      raceNewBytes,
      raceOldCiphertext: raceOld.ciphertext,
      raceNewCiphertext: raceNew.ciphertext
    };
  })()`);

  await page.navigate(baseUrl + appPath);
  assert.equal(await page.evaluate("view.encryptionLocked === true && Boolean(document.querySelector('#vault-passphrase'))"), true);
  const consoleStart = page.consoleMessages.length;
  await page.evaluate(`(() => {
    window.__vaultBrowserOriginals = {
      decryptPayload,
      normalizeData,
      restoreInterruptedWorkflow,
      initializeAutoMemoryVault,
      render,
      requestPageHeadingFocus,
      reportFieldError,
      showToast
    };
    window.__vaultBrowserEffects = { decrypt: 0, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [] };
    decryptPayload = async (...args) => {
      window.__vaultBrowserEffects.decrypt += 1;
      return window.__vaultBrowserOriginals.decryptPayload(...args);
    };
    normalizeData = (...args) => {
      window.__vaultBrowserEffects.normalize += 1;
      return window.__vaultBrowserOriginals.normalizeData(...args);
    };
    restoreInterruptedWorkflow = (...args) => {
      window.__vaultBrowserEffects.restore += 1;
      return window.__vaultBrowserOriginals.restoreInterruptedWorkflow(...args);
    };
    initializeAutoMemoryVault = (...args) => {
      window.__vaultBrowserEffects.initializeMemory += 1;
      return window.__vaultBrowserOriginals.initializeAutoMemoryVault(...args);
    };
    render = (...args) => {
      window.__vaultBrowserEffects.renders += 1;
      return window.__vaultBrowserOriginals.render(...args);
    };
    requestPageHeadingFocus = (...args) => {
      window.__vaultBrowserEffects.headingFocus += 1;
      return window.__vaultBrowserOriginals.requestPageHeadingFocus(...args);
    };
    reportFieldError = (field, message) => {
      window.__vaultBrowserEffects.fields.push(String(message || ""));
      return window.__vaultBrowserOriginals.reportFieldError(field, message);
    };
    showToast = (message, severity = "") => {
      window.__vaultBrowserEffects.toasts.push([String(message || ""), String(severity || "")]);
      return window.__vaultBrowserOriginals.showToast(message, severity);
    };
    return true;
  })()`);
  await page.setValue("#vault-passphrase", "fictional-browser-future-passphrase");
  await page.click('[data-action="unlock-vault"]');
  await waitFor(() => page.evaluate(`document.querySelector('#toast')?.textContent === ${JSON.stringify(schemaRetryMessage)}`), "future Device Vault schema refusal");
  const rejected = await page.evaluate(`(() => {
    const toast = document.querySelector('#toast');
    const input = document.querySelector('#vault-passphrase');
    return {
      locked: view.encryptionLocked,
      liveFuture: db.people.some(person => person.id === "browser_vault_future"),
      effects: window.__vaultBrowserEffects,
      settingsBytes: localStorage.getItem(SETTINGS_KEY),
      envelopeBytes: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
      plaintextAbsent: [STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, AUTO_MEMORY_KEY].every(key => localStorage.getItem(key) === null),
      active: document.activeElement === input,
      invalid: input?.getAttribute('aria-invalid') || '',
      role: toast?.getAttribute('role') || '',
      live: toast?.getAttribute('aria-live') || '',
      text: toast?.textContent || ''
    };
  })()`);
  assert.equal(rejected.locked, true);
  assert.equal(rejected.liveFuture, false);
  assert.deepEqual(rejected.effects, { decrypt: 1, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [[schemaRetryMessage, "error"]] });
  assert.equal(rejected.settingsBytes, setup.settingsBytes);
  assert.equal(rejected.envelopeBytes, setup.futureBytes);
  assert.equal(rejected.plaintextAbsent, true);
  assert.deepEqual({ active: rejected.active, invalid: rejected.invalid, role: rejected.role, live: rejected.live, text: rejected.text }, { active: true, invalid: "", role: "alert", live: "assertive", text: schemaRetryMessage });
  assert.equal(page.consoleMessages.slice(consoleStart).some(message => message.includes("999") || message.includes("browser_vault_future") || message.includes("future-passphrase")), false);

  await page.evaluate(`(() => {
    window.__vaultBrowserEffects = { decrypt: 0, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [] };
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.invalidAutoMemoryBytes)});
  })()`);
  const autoMemoryConsoleStart = page.consoleMessages.length;
  await page.setValue("#vault-passphrase", "fictional-browser-auto-memory-passphrase");
  await page.click('[data-action="unlock-vault"]');
  await waitFor(() => page.evaluate(`window.__vaultBrowserEffects.toasts.length === 1 && document.querySelector('#toast')?.textContent === ${JSON.stringify(schemaRetryMessage)}`), "unsupported Device Vault Auto Memory refusal");
  const rejectedAutoMemory = await page.evaluate(`(() => {
    const input = document.querySelector('#vault-passphrase');
    return {
      locked: view.encryptionLocked,
      liveMain: db.people.some(person => person.id === "browser_vault_auto_memory_main"),
      cache: JSON.stringify(memoryVaultCache),
      passphrase: vaultPassphrase,
      effects: window.__vaultBrowserEffects,
      settingsBytes: localStorage.getItem(SETTINGS_KEY),
      envelopeBytes: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
      plaintextAbsent: [STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, AUTO_MEMORY_KEY].every(key => localStorage.getItem(key) === null),
      active: document.activeElement === input,
      invalid: input?.getAttribute('aria-invalid') || ''
    };
  })()`);
  assert.equal(rejectedAutoMemory.locked && !rejectedAutoMemory.liveMain && rejectedAutoMemory.cache === "null" && rejectedAutoMemory.passphrase === "", true);
  assert.deepEqual(rejectedAutoMemory.effects, { decrypt: 1, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [[schemaRetryMessage, "error"]] });
  assert.equal(rejectedAutoMemory.settingsBytes, setup.settingsBytes);
  assert.equal(rejectedAutoMemory.envelopeBytes, setup.invalidAutoMemoryBytes);
  assert.equal(rejectedAutoMemory.plaintextAbsent && rejectedAutoMemory.active && rejectedAutoMemory.invalid === "", true);
  assert.equal(page.consoleMessages.slice(autoMemoryConsoleStart).some(message => message.includes("999") || message.includes("invalid-auto-memory") || message.includes("auto-memory-passphrase")), false);

  await page.evaluate(`window.__vaultBrowserEffects = { decrypt: 0, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [] }`);

  await page.evaluate(`localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.validBytes)})`);
  await page.setValue("#vault-passphrase", "fictional-browser-valid-passphrase");
  await page.click('[data-action="unlock-vault"]');
  await waitFor(() => page.evaluate("view.encryptionLocked === false && view.locked === true && document.activeElement === document.querySelector('#pin-input')"), "valid Device Vault unlock and App Lock focus");
  const accepted = await page.evaluate(`({
    id: db.people[0]?.id || "",
    currentSchema: db.dataSchemaVersion,
    unknownPreserved: db.people[0]?.unknownRecordProperty?.preserved === true,
    copy: customCopy["brand.title"],
    draft: autosaveDraftsCache?.["capture:main"]?.fields?.["quick-text"],
    effects: window.__vaultBrowserEffects,
    settingsBytes: localStorage.getItem(SETTINGS_KEY),
    envelopeBytes: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
    plaintextAbsent: [STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, AUTO_MEMORY_KEY].every(key => localStorage.getItem(key) === null),
    pinFocused: document.activeElement === document.querySelector('#pin-input'),
    headingFocused: document.activeElement === document.querySelector('#main-content h1'),
    pendingHeading: pendingPageHeadingFocus,
    toast: document.querySelector('#toast')?.textContent || ''
  })`);
  assert.deepEqual(
    { id: accepted.id, currentSchema: accepted.currentSchema, unknownPreserved: accepted.unknownPreserved, copy: accepted.copy, draft: accepted.draft },
    { id: "browser_vault_valid", currentSchema: 3, unknownPreserved: true, copy: "browser_vault_valid", draft: "browser_vault_valid" }
  );
  assert.deepEqual(accepted.effects, { decrypt: 1, normalize: 1, restore: 1, initializeMemory: 1, renders: 1, headingFocus: 0, fields: [], toasts: [["Encrypted storage unlocked.", ""]] });
  assert.equal(accepted.settingsBytes, setup.settingsBytes);
  assert.equal(accepted.envelopeBytes, setup.validBytes);
  assert.equal(accepted.plaintextAbsent && accepted.pinFocused && !accepted.headingFocused && !accepted.pendingHeading && accepted.toast === "Encrypted storage unlocked.", true);
  pass("real browser Web Crypto rejects future main and Auto Memory schemas without mutation, then accepts one valid replacement and preserves App Lock focus");

  await page.evaluate(`(() => {
    const timers = new Map();
    let nextId = 1;
    window.__directPinToastTimers = {
      timers,
      originalSetTimeout: window.setTimeout,
      originalClearTimeout: window.clearTimeout
    };
    window.setTimeout = (callback, delay = 0) => {
      const handle = { id: nextId++ };
      timers.set(handle, { callback, delay: Number(delay), cleared: false });
      return handle;
    };
    window.clearTimeout = handle => {
      const timer = timers.get(handle);
      if (timer) timer.cleared = true;
    };
  })()`);
  await page.setValue("#pin-input", "2468");
  await page.click('[data-action="unlock-app"]');
  await waitFor(() => page.evaluate("view.locked === false && Boolean(document.querySelector('#main-content h1'))"), "direct PIN unlock render");
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => resolve()))");
  const directPinFocus = await page.evaluate(`(() => {
    const heading = document.querySelector('#main-content h1');
    const toast = document.querySelector('#toast');
    return {
      focused: document.activeElement === heading,
      tabindex: heading?.getAttribute('tabindex') || '',
      text: heading?.textContent?.trim() || '',
      pending: pendingPageHeadingFocus,
      toastText: toast?.textContent || '',
      toastRole: toast?.getAttribute('role') || '',
      toastLive: toast?.getAttribute('aria-live') || '',
      toastShown: toast?.classList.contains('show') || false,
      toastDelay: window.__directPinToastTimers.timers.get(toastTimer)?.delay
    };
  })()`);
  const dismissedPinToast = await page.evaluate(`(() => {
    const toast = document.querySelector('#toast');
    const controlled = window.__directPinToastTimers;
    try {
      controlled.timers.get(toastTimer).callback();
      return {
        text: toast?.textContent || '',
        role: toast?.getAttribute('role') || '',
        live: toast?.getAttribute('aria-live') || '',
        shown: toast?.classList.contains('show') || false,
        timerNull: toastTimer === null
      };
    } finally {
      window.setTimeout = controlled.originalSetTimeout;
      window.clearTimeout = controlled.originalClearTimeout;
      delete window.__directPinToastTimers;
    }
  })()`);
  const dismissedPinAxNodes = await page.accessibilityNodes();
  assert.deepEqual(
    {
      directSuccess: directPinFocus.toastText === "Unlocked." && directPinFocus.toastRole === "status" && directPinFocus.toastLive === "polite" && directPinFocus.toastShown && directPinFocus.toastDelay === 2800,
      ownedDismissal: dismissedPinToast.text === "" && dismissedPinToast.role === "status" && dismissedPinToast.live === "polite" && !dismissedPinToast.shown && dismissedPinToast.timerNull,
      removedFromAccessibilityTree: dismissedPinAxNodes.every(node => node.name?.value !== "Unlocked.")
    },
    { directSuccess: true, ownedDismissal: true, removedFromAccessibilityTree: true }
  );
  pass("direct PIN success is polite and its owned 2.8-second deadline removes hidden text from the Chrome accessibility tree");

  const staleToastOwnership = await page.evaluate(`(() => {
    const toast = document.querySelector('#toast');
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    const timers = new Map();
    let nextId = 1;
    window.setTimeout = (callback, delay = 0) => {
      const handle = { id: nextId++ };
      timers.set(handle, { callback, delay: Number(delay), cleared: false });
      return handle;
    };
    window.clearTimeout = handle => {
      const timer = timers.get(handle);
      if (timer) timer.cleared = true;
    };
    const snapshot = () => ({
      text: toast?.textContent || '',
      role: toast?.getAttribute('role') || '',
      live: toast?.getAttribute('aria-live') || '',
      shown: toast?.classList.contains('show') || false,
      timer: toastTimer
    });
    try {
      showToast("Could not save the fictional change.");
      const staleHandle = toastTimer;
      showToast("Unlocked.");
      const currentHandle = toastTimer;
      const beforeStale = snapshot();
      timers.get(staleHandle).callback();
      const afterStale = snapshot();
      timers.get(currentHandle).callback();
      const afterCurrent = snapshot();
      return {
        staleDelay: timers.get(staleHandle).delay,
        currentDelay: timers.get(currentHandle).delay,
        staleCleared: timers.get(staleHandle).cleared,
        successAfterAlert: beforeStale.text === 'Unlocked.'
          && beforeStale.role === 'status'
          && beforeStale.live === 'polite'
          && beforeStale.shown === true,
        staleInert: afterStale.text === beforeStale.text
          && afterStale.role === beforeStale.role
          && afterStale.live === beforeStale.live
          && afterStale.shown === beforeStale.shown
          && afterStale.timer === currentHandle,
        currentDismissed: afterCurrent.text === ''
          && afterCurrent.role === 'status'
          && afterCurrent.live === 'polite'
          && afterCurrent.shown === false
          && afterCurrent.timer === null
      };
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    }
  })()`);
  assert.deepEqual(staleToastOwnership, {
    staleDelay: 5000,
    currentDelay: 2800,
    staleCleared: true,
    successAfterAlert: true,
    staleInert: true,
    currentDismissed: true
  });
  pass("a retained heuristic alert cannot reclassify or dismiss the newer polite success that owns the current deadline");

  await page.evaluate(`(() => {
    settings.appLockEnabled = false;
    settings.pinHash = "";
    vaultPassphrase = "";
    view.locked = false;
    view.encryptionLocked = true;
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.raceOldBytes)});
    window.__vaultBrowserOriginals.render({ mutationEffects: false });
    window.__vaultBrowserEffects = { decrypt: 0, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [] };
    window.__vaultRaceResolvers = {};
    window.__vaultTimerTokens = [];
    window.__vaultTimerToken = timer => {
      if (timer === null || timer === undefined) return 0;
      const existing = window.__vaultTimerTokens.indexOf(timer);
      if (existing >= 0) return existing + 1;
      window.__vaultTimerTokens.push(timer);
      return window.__vaultTimerTokens.length;
    };
    decryptPayload = async (candidateEnvelope, passphrase) => {
      window.__vaultBrowserEffects.decrypt += 1;
      const value = await window.__vaultBrowserOriginals.decryptPayload(candidateEnvelope, passphrase);
      await new Promise(resolve => { window.__vaultRaceResolvers[candidateEnvelope.ciphertext] = resolve; });
      return value;
    };
    window.__vaultRaceSnapshot = () => JSON.stringify({
      db,
      customCopy,
      autosaveDraftsCache,
      memoryVaultCache,
      vaultPassphrase,
      view,
      attemptSequence: vaultUnlockAttemptSequence,
      effects: window.__vaultBrowserEffects,
      storage: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean).sort().map(key => [key, localStorage.getItem(key)]),
      toast: {
        text: document.querySelector('#toast')?.textContent || '',
        role: document.querySelector('#toast')?.getAttribute('role') || '',
        live: document.querySelector('#toast')?.getAttribute('aria-live') || '',
        shown: document.querySelector('#toast')?.classList.contains('show') || false,
        timer: window.__vaultTimerToken(toastTimer)
      },
      activeId: document.activeElement?.id || '',
      headingFocused: document.activeElement === document.querySelector('#main-content h1'),
      headingTabindex: document.querySelector('#main-content h1')?.getAttribute('tabindex') || '',
      pendingHeading: pendingPageHeadingFocus,
      body: document.body.innerHTML
    });
    document.querySelector('#vault-passphrase').value = "fictional-browser-race-old-passphrase";
    window.__vaultRaceOldAttempt = unlockVault();
    return true;
  })()`);
  await waitFor(() => page.evaluate(`Boolean(window.__vaultRaceResolvers[${JSON.stringify(setup.raceOldCiphertext)}])`), "older browser vault decrypt gate");
  await page.evaluate(`(() => {
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.raceNewBytes)});
    document.querySelector('#vault-passphrase').value = "fictional-browser-race-new-passphrase";
    window.__vaultRaceNewAttempt = unlockVault();
    return true;
  })()`);
  await waitFor(() => page.evaluate(`Boolean(window.__vaultRaceResolvers[${JSON.stringify(setup.raceNewCiphertext)}])`), "newer browser vault decrypt gate");
  const raceConsoleStart = page.consoleMessages.length;
  const newerResult = await page.evaluate(`(async () => {
    window.__vaultRaceResolvers[${JSON.stringify(setup.raceNewCiphertext)}]();
    return window.__vaultRaceNewAttempt;
  })()`);
  await page.evaluate("new Promise(resolve => requestAnimationFrame(() => resolve()))");
  const afterNewer = await page.evaluate("window.__vaultRaceSnapshot()");
  const olderResult = await page.evaluate(`(async () => {
    window.__vaultRaceResolvers[${JSON.stringify(setup.raceOldCiphertext)}]();
    return window.__vaultRaceOldAttempt;
  })()`);
  const afterOlder = await page.evaluate("window.__vaultRaceSnapshot()");
  assert.equal(newerResult, true);
  assert.equal(olderResult, false);
  assert.equal(afterOlder, afterNewer);
  assert.equal(await page.evaluate("db.people[0]?.id === 'browser_vault_race_new'"), true);
  assert.equal(page.consoleMessages.length, raceConsoleStart);
  const raceFocus = JSON.parse(afterNewer);
  assert.deepEqual(
    {
      directPin: directPinFocus.focused && directPinFocus.tabindex === "-1" && Boolean(directPinFocus.text) && directPinFocus.pending === false,
      vaultWinner: raceFocus.headingFocused && raceFocus.headingTabindex === "-1" && raceFocus.pendingHeading === false && raceFocus.effects.headingFocus === 1
    },
    { directPin: true, vaultWinner: true }
  );
  pass("direct valid PIN unlock focuses the rendered current page heading once without a pending focus request");
  pass("winning App-Lock-off Device Vault unlock focuses the rendered current page heading once and stale success preserves it");
  pass("rapid real-browser overlapping Device Vault decrypts remain newest-wins and the stale success is UI/log/storage inert");

  await page.evaluate(`(() => {
    decryptPayload = window.__vaultBrowserOriginals.decryptPayload;
    vaultPassphrase = "";
    view.locked = false;
    view.encryptionLocked = true;
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.raceOldBytes)});
    window.__vaultBrowserOriginals.render({ mutationEffects: false });
    window.__vaultBrowserEffects = { decrypt: 0, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [] };
    window.__vaultRaceResolvers = {};
    decryptPayload = async (candidateEnvelope, passphrase) => {
      window.__vaultBrowserEffects.decrypt += 1;
      const value = await window.__vaultBrowserOriginals.decryptPayload(candidateEnvelope, passphrase);
      await new Promise(resolve => { window.__vaultRaceResolvers[candidateEnvelope.ciphertext] = resolve; });
      return value;
    };
    document.querySelector('#vault-passphrase').value = "fictional-browser-race-old-passphrase";
    window.__vaultEnvelopeAttempt = unlockVault();
    return true;
  })()`);
  await waitFor(() => page.evaluate(`Boolean(window.__vaultRaceResolvers[${JSON.stringify(setup.raceOldCiphertext)}])`), "browser envelope replacement decrypt gate");
  const replacementConsoleStart = page.consoleMessages.length;
  const replacementResult = await page.evaluate(`(async () => {
    localStorage.setItem(ENCRYPTED_STORAGE_KEY, ${JSON.stringify(setup.raceNewBytes)});
    window.__vaultRaceResolvers[${JSON.stringify(setup.raceOldCiphertext)}]();
    return window.__vaultEnvelopeAttempt;
  })()`);
  const replacement = await page.evaluate(`(() => {
    const input = document.querySelector('#vault-passphrase');
    const toast = document.querySelector('#toast');
    return {
      locked: view.encryptionLocked,
      id: db.people[0]?.id || '',
      passphrase: vaultPassphrase,
      effects: window.__vaultBrowserEffects,
      envelopeBytes: localStorage.getItem(ENCRYPTED_STORAGE_KEY),
      settingsBytes: localStorage.getItem(SETTINGS_KEY),
      plaintextAbsent: [STORAGE_KEY, COPY_KEY, AUTOSAVE_KEY, AUTO_MEMORY_KEY].every(key => localStorage.getItem(key) === null),
      active: document.activeElement === input,
      invalid: input?.getAttribute('aria-invalid') || '',
      toast: toast?.textContent || '',
      role: toast?.getAttribute('role') || '',
      live: toast?.getAttribute('aria-live') || ''
    };
  })()`);
  assert.equal(replacementResult, false);
  assert.equal(replacement.locked, true);
  assert.equal(replacement.id, "browser_vault_race_new");
  assert.equal(replacement.passphrase, "");
  assert.deepEqual(replacement.effects, { decrypt: 1, normalize: 0, restore: 0, initializeMemory: 0, renders: 0, headingFocus: 0, fields: [], toasts: [[envelopeRetryMessage, "error"]] });
  assert.equal(replacement.envelopeBytes, setup.raceNewBytes);
  assert.equal(replacement.settingsBytes, setup.settingsBytes);
  assert.equal(replacement.plaintextAbsent, true);
  assert.deepEqual({ active: replacement.active, invalid: replacement.invalid, toast: replacement.toast, role: replacement.role, live: replacement.live }, { active: true, invalid: "", toast: envelopeRetryMessage, role: "alert", live: "assertive" });
  assert.equal(page.consoleMessages.length, replacementConsoleStart);
  pass("real-browser mid-decrypt envelope replacement stays locked with one content-free alert and no state, render, warning, or plaintext effect");

  await page.evaluate(`(() => {
    const originals = window.__vaultBrowserOriginals;
    decryptPayload = originals.decryptPayload;
    normalizeData = originals.normalizeData;
    restoreInterruptedWorkflow = originals.restoreInterruptedWorkflow;
    initializeAutoMemoryVault = originals.initializeAutoMemoryVault;
    render = originals.render;
    requestPageHeadingFocus = originals.requestPageHeadingFocus;
    reportFieldError = originals.reportFieldError;
    showToast = originals.showToast;
    localStorage.clear();
    ${JSON.stringify(setup.originalStorage)}.forEach(([key, value]) => localStorage.setItem(key, value));
    return true;
  })()`);
  await page.navigate(baseUrl + appPath);
}

async function runJourney(page, baseUrl, apiRequests, requestLog) {
  await page.navigate(baseUrl + appPath);
  const storedSchemaSetup = await page.evaluate(`(() => {
    const originalData = localStorage.getItem(STORAGE_KEY);
    const future = JSON.parse(originalData);
    future.dataSchemaVersion = 999;
    future.people = [{ id: "browser_stored_schema_future", name: "Browser stored schema future" }];
    const futureBytes = JSON.stringify(future);
    localStorage.setItem(STORAGE_KEY, futureBytes);
    return {
      originalData,
      futureBytes
    };
  })()`);
  assert.ok(storedSchemaSetup.originalData, "synthetic browser startup has a local canonical data record before the schema negative");
  await page.navigate(baseUrl + appPath);
  const storedSchemaBlocked = await page.evaluate(`(() => {
    const main = document.querySelector("#main-content");
    return {
      heading: main?.querySelector("h1")?.textContent.trim() || "",
      role: main?.getAttribute("role") || "",
      retry: main?.querySelector('[data-action="startup-retry"]')?.textContent.trim() || "",
      text: main?.textContent || "",
      error: view.startupRecoveryError,
      livePeople: db.people.length,
      dataBytes: localStorage.getItem(STORAGE_KEY)
    };
  })()`);
  assert.equal(storedSchemaBlocked.heading, "Local data check paused");
  assert.equal(storedSchemaBlocked.role, "alert");
  assert.equal(storedSchemaBlocked.retry, "Retry local recovery");
  assert.equal(storedSchemaBlocked.livePeople, 0);
  assert.equal(storedSchemaBlocked.dataBytes, storedSchemaSetup.futureBytes);
  assert.equal(storedSchemaBlocked.text.includes("999") || storedSchemaBlocked.text.includes("Browser stored schema future"), false);
  assert.equal(storedSchemaBlocked.error, "Local recovery could not finish. Calm OS did not replace your ministry data. Retry before making changes.");
  await page.evaluate(`localStorage.setItem(STORAGE_KEY, ${JSON.stringify(storedSchemaSetup.originalData)})`);
  await page.navigate(baseUrl + appPath);
  pass("unsupported stored schema stays behind one accessible content-free recovery gate without changing local bytes");

  await testDeviceVaultUnlockBrowserBoundary(page, baseUrl);

  const initialSkipLinkHidden = await page.evaluate("document.querySelector('.skip-link')?.hidden === true");
  assert.equal(initialSkipLinkHidden, true);
  const initialAccessibilityNodes = await page.accessibilityNodes();
  assert.equal(initialAccessibilityNodes.some(node => node.role?.value === "link" && node.name?.value === "Skip to main content"), false);
  for (const modifiers of [1, 2, 4, 8]) {
    await page.pressTab(modifiers);
    assert.equal(await page.evaluate("document.querySelector('.skip-link')?.hidden === true && document.activeElement !== document.querySelector('.skip-link')"), true);
  }
  assert.equal(await page.evaluate("Boolean(document.querySelector('.mobile-nav button')?.focus()) || document.activeElement === document.querySelector('.mobile-nav button')"), true);
  await page.pressTab();
  assert.equal(await page.evaluate("document.querySelector('.skip-link')?.hidden === true && document.activeElement !== document.querySelector('.skip-link')"), true);
  assert.equal(await page.evaluate("document.activeElement?.blur(); document.activeElement === document.body"), true);
  await page.pressTab();
  await waitFor(() => page.evaluate("document.querySelector('.skip-link')?.hidden === false && document.activeElement === document.querySelector('.skip-link')"), "keyboard skip-link reveal");
  const focusedSkipLink = await page.evaluate(`(() => {
    const link = document.querySelector('.skip-link');
    const box = link?.getBoundingClientRect();
    return link && box ? { width: box.width, height: box.height, top: box.top, text: link.textContent.trim() } : null;
  })()`);
  assert.equal(focusedSkipLink?.text, "Skip to main content");
  assert.ok(focusedSkipLink.width > 1 && focusedSkipLink.height > 1 && focusedSkipLink.top >= 0);
  const keyboardAccessibilityNodes = await page.accessibilityNodes();
  assert.equal(keyboardAccessibilityNodes.some(node => node.role?.value === "link" && node.name?.value === "Skip to main content"), true);
  await page.click(".skip-link");
  await waitFor(() => page.evaluate("document.activeElement?.id === 'main-content'"), "skip-link main-content focus transfer");
  await page.navigate(baseUrl + appPath);
  assert.equal(await page.evaluate("document.querySelector('.skip-link')?.hidden === true"), true);
  const reloadedAccessibilityNodes = await page.accessibilityNodes();
  assert.equal(reloadedAccessibilityNodes.some(node => node.role?.value === "link" && node.name?.value === "Skip to main content"), false);
  pass("touch accessibility starts on meaningful app content while only plain keyboard Tab reveals and activates the skip link, then reload hides it again");

  const expectedDestinations = [
    ["today", "Today"],
    ["quick", "Capture"],
    ["people", "People"],
    ["prayer", "Prayer"],
    ["settings", "More"]
  ];
  const destinations = await page.evaluate(`Array.from(document.querySelectorAll('.mobile-nav [data-action="nav"]')).map(button => [button.dataset.screen, button.textContent.trim()])`);
  assert.deepEqual(destinations, expectedDestinations);
  for (const [screen, title] of expectedDestinations) {
    await page.click(`.mobile-nav [data-action="nav"][data-screen="${screen}"]`);
    await waitFor(() => page.evaluate(`document.querySelector('#main-content h1')?.textContent.trim() === ${JSON.stringify(title)}`), `${title} destination`);
    assert.equal(await page.evaluate(`document.querySelector('.mobile-nav [data-screen="${screen}"]')?.getAttribute('aria-current')`), "page");
  }
  pass("five thumb destinations navigate to the matching Calm heading and announce current state");

  const browserBackupReadiness = await page.evaluate(`(() => {
    const original = { reminder: settings.backupReminderDays, lastBackupAt: settings.lastBackupAt, screen: view.screen };
    const rowState = () => {
      const row = Array.from(document.querySelectorAll("article.item")).find(item => item.querySelector(".item-title")?.textContent.trim() === "Backup Rhythm");
      return { pill: row?.querySelector(".pill")?.textContent.trim() || "", text: row?.textContent || "" };
    };
    settings.backupReminderDays = "0";
    settings.lastBackupAt = "";
    view.screen = "readiness";
    render({ mutationEffects: false });
    const off = rowState();
    settings.backupReminderDays = "7";
    settings.lastBackupAt = nowISO();
    render({ mutationEffects: false });
    const current = rowState();
    settings.backupReminderDays = original.reminder;
    settings.lastBackupAt = original.lastBackupAt;
    view.screen = original.screen;
    render({ mutationEffects: false });
    return { off, current };
  })()`);
  assert.equal(browserBackupReadiness.off.pill, "Needs Work");
  assert.equal(browserBackupReadiness.off.text.includes("Reminder Off"), true);
  assert.equal(browserBackupReadiness.current.pill, "Ready");
  assert.equal(browserBackupReadiness.off.text.includes("Files") && browserBackupReadiness.current.text.includes("Files"), true);
  assert.equal(["Backed up today", "Backup current", "Last export", "current or off"].every(claim => !browserBackupReadiness.off.text.includes(claim) && !browserBackupReadiness.current.text.includes(claim)), true);
  pass("rendered iPhone readiness refuses a false-green rhythm and describes only download initiation pending Files confirmation");

  await page.click('[data-action="nav"][data-screen="advancedSettings"]');
  await waitFor(() => page.evaluate("document.querySelector('#main-content h1')?.textContent.trim() === 'Settings and data'"), "Settings and data destination");
  await page.evaluate(`(() => {
    window.__backupExportOriginals = { encryptPayload, downloadJson };
    window.__backupExportEncryptions = 0;
    window.__backupExportDownloads = 0;
    window.__backupExportGate = new Promise(resolve => { window.__backupExportResolve = resolve; });
    encryptPayload = () => {
      window.__backupExportEncryptions += 1;
      return window.__backupExportGate;
    };
    downloadJson = () => {
      window.__backupExportDownloads += 1;
      return true;
    };
    return true;
  })()`);
  await page.click('[data-action="export-encrypted-json"]');
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('#sheet-export-passphrase')"), true, "non-busy encrypted export focuses its preferred enabled passphrase field");
  await page.setValue("#sheet-export-passphrase", "fictional-browser-passphrase");
  await page.setValue("#sheet-export-confirm", "fictional-browser-passphrase");
  await page.click('[data-action="data-sheet-save"][data-kind="encrypted-export"]');
  await waitFor(() => page.evaluate("Boolean(activeProtectedBackupExport) && Boolean(view.sheet?.backupExportOwnerId)"), "protected backup owner");
  const browserBackupBusy = await page.evaluate(`(() => {
    const panel = document.querySelector('[data-sheet-panel]');
    const controls = Array.from(panel?.querySelectorAll('button, input') || []);
    return {
      ariaBusy: panel?.getAttribute('aria-busy'),
      status: panel?.querySelector('[role="status"]')?.textContent.trim() || '',
      controls: controls.map(control => ({ id: control.id || '', action: control.dataset.action || '', disabled: control.disabled })),
      role: panel?.getAttribute('role'),
      ariaModal: panel?.getAttribute('aria-modal'),
      focusInside: Boolean(panel?.contains(document.activeElement)),
      panelFocused: document.activeElement === panel,
      passphraseStoredInView: JSON.stringify(view).includes('fictional-browser-passphrase'),
      closeResult: closeSheet(),
      reentryResult: null
    };
  })()`);
  const browserBackupReentry = await page.evaluate('submitDataSafetySheet("encrypted-export")');
  assert.equal(browserBackupBusy.ariaBusy, "true");
  assert.equal(browserBackupBusy.role, "dialog");
  assert.equal(browserBackupBusy.ariaModal, "true");
  assert.equal(browserBackupBusy.status, "Preparing encrypted backup…");
  assert.equal(browserBackupBusy.controls.length >= 5 && browserBackupBusy.controls.every(control => control.disabled), true);
  assert.equal(browserBackupBusy.focusInside && browserBackupBusy.panelFocused, true, "busy encrypted export keeps focus on its dialog panel when every control is disabled");
  assert.equal(browserBackupBusy.passphraseStoredInView, false);
  assert.equal(browserBackupBusy.closeResult, false);
  assert.equal(browserBackupReentry, false);
  assert.equal(await page.evaluate("window.__backupExportEncryptions === 1 && window.__backupExportDownloads === 0"), true);
  await page.pressTab();
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('[data-sheet-panel]')"), true, "Tab remains on the busy panel when no control is enabled");
  await page.pressTab(8);
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('[data-sheet-panel]')"), true, "Shift+Tab remains on the busy panel when no control is enabled");
  await page.pressEscape();
  await page.click(".sheet-backdrop");
  await page.click('[data-action="sheet-close"][aria-label="Close"]');
  assert.equal(await page.evaluate("Boolean(activeProtectedBackupExport) && Boolean(view.sheet?.backupExportOwnerId) && document.activeElement === document.querySelector('[data-sheet-panel]')"), true, "Escape, backdrop, and disabled Close cannot dismiss or release the busy owner");
  await page.evaluate(`window.__backupExportResolve({ kind: "ruf-ministry-hub-encrypted-backup", encryptedAt: "synthetic-browser" })`);
  await waitFor(() => page.evaluate("view.sheet === null && !activeProtectedBackupExport && window.__backupExportDownloads === 1"), "protected backup completion");
  await waitFor(() => page.evaluate("document.activeElement === document.querySelector('[data-action=\"export-encrypted-json\"]')"), "protected backup return focus");
  const browserBackupComplete = await page.evaluate(`(() => {
    const result = {
      encryptions: window.__backupExportEncryptions,
      downloads: window.__backupExportDownloads,
      timestampRecorded: Boolean(settings.lastBackupAt),
      toast: document.getElementById('toast')?.textContent || ''
    };
    return result;
  })()`);
  assert.deepEqual(browserBackupComplete, {
    encryptions: 1,
    downloads: 1,
    timestampRecorded: true,
    toast: "Backup download started. Confirm the file appears in Files."
  });
  await page.evaluate(`(() => {
    window.__backupExportFailureGate = new Promise((resolve, reject) => { window.__backupExportReject = reject; });
    encryptPayload = () => window.__backupExportFailureGate;
    return true;
  })()`);
  await page.click('[data-action="export-encrypted-json"]');
  assert.equal(await page.evaluate("document.activeElement === document.querySelector('#sheet-export-passphrase')"), true, "retry sheet again focuses the enabled preferred field");
  await page.setValue("#sheet-export-passphrase", "fictional-browser-passphrase");
  await page.setValue("#sheet-export-confirm", "fictional-browser-passphrase");
  await page.click('[data-action="data-sheet-save"][data-kind="encrypted-export"]');
  await waitFor(() => page.evaluate("Boolean(activeProtectedBackupExport) && document.activeElement === document.querySelector('[data-sheet-panel]')"), "failed protected backup busy focus");
  await page.evaluate(`window.__backupExportReject(new Error("synthetic encrypted preparation failure"))`);
  await waitFor(() => page.evaluate("!activeProtectedBackupExport && view.sheet?.kind === 'encrypted-export' && !view.sheet?.backupExportOwnerId"), "protected backup retry state");
  const browserBackupRetry = await page.evaluate(`(() => {
    const panel = document.querySelector('[data-sheet-panel]');
    const controls = Array.from(panel?.querySelectorAll('button, input') || []);
    const result = {
      preferredFocused: document.activeElement === document.querySelector('#sheet-export-passphrase'),
      controlsEnabled: controls.length >= 5 && controls.every(control => !control.disabled),
      toast: document.getElementById('toast')?.textContent || ''
    };
    encryptPayload = window.__backupExportOriginals.encryptPayload;
    downloadJson = window.__backupExportOriginals.downloadJson;
    delete window.__backupExportOriginals;
    delete window.__backupExportGate;
    delete window.__backupExportResolve;
    delete window.__backupExportFailureGate;
    delete window.__backupExportReject;
    return result;
  })()`);
  assert.deepEqual(browserBackupRetry, {
    preferredFocused: true,
    controlsEnabled: true,
    toast: "Encrypted backup could not be prepared. Nothing was downloaded or recorded."
  });
  await page.click('[data-action="sheet-close"][aria-label="Close"]');
  await waitFor(() => page.evaluate("document.activeElement === document.querySelector('[data-action=\"export-encrypted-json\"]')"), "failed protected backup return focus");
  pass("protected encrypted backup traps busy focus, blocks every dismissal, returns focus on success, and restores preferred retry focus after failure");

  const portableSchemaUiResults = [];
  for (const schemaCase of ["future", "top3-nested2"]) for (const encrypted of [false, true]) {
    await page.evaluate(`(() => {
      view.screen = "advancedSettings";
      view.sheet = null;
      render({ mutationEffects: false });
      return true;
    })()`);
    await page.click('[data-action="import-json"]');
    await waitFor(() => page.evaluate("view.sheet?.kind === 'import' && Boolean(document.querySelector('#sheet-import-backup-file'))"), `${encrypted ? "encrypted" : "plaintext"} schema import sheet`);
    const consoleStart = page.consoleMessages.length;
    await page.evaluate(`(async () => {
      const payload = cloneJson(currentPortablePayload());
      payload.dataSchemaVersion = ${schemaCase === "future" ? 999 : 3};
      payload.data.dataSchemaVersion = ${schemaCase === "future" ? 999 : 2};
      payload.data.people = [{ id: "browser_future_schema", name: "Future schema fictional marker" }];
      ${schemaCase === "future" ? 'payload.data.unknownFutureCollection = [{ id: "browser_unknown_future" }];' : 'payload.data.bridgeProbeCollection = [{ id: "browser_bridge_probe" }];'}
      const envelope = { kind: "ruf-ministry-hub-encrypted-backup", version: 1, salt: "fictional", iv: "fictional", ciphertext: "fictional" };
      window.__portableSchemaOriginalBegin = beginRecoveryTransaction;
      window.__portableSchemaOriginalNormalize = normalizeData;
      window.__portableSchemaOriginalDecrypt = decryptPayload;
      window.__portableSchemaBeginCalls = 0;
      window.__portableSchemaNormalizeCalls = 0;
      window.__portableSchemaDecryptCalls = 0;
      beginRecoveryTransaction = (...args) => {
        window.__portableSchemaBeginCalls += 1;
        return window.__portableSchemaOriginalBegin(...args);
      };
      normalizeData = (...args) => {
        window.__portableSchemaNormalizeCalls += 1;
        return window.__portableSchemaOriginalNormalize(...args);
      };
      if (${encrypted}) {
        decryptPayload = async () => {
          window.__portableSchemaDecryptCalls += 1;
          return payload;
        };
      }
      window.__portableSchemaSnapshot = async () => {
        const recovery = captureRecoveryTransactionState();
        recovery.localStorage = Array.from(recovery.localStorage.entries()).sort(([left], [right]) => left.localeCompare(right));
        return JSON.stringify({
          recovery,
          epoch: recoveryEpoch,
          pending: recoveryTransactionPending,
          kind: recoveryTransactionKind,
          indexedDb: await readIndexedDbSnapshot(recoveryPersistenceKeys())
        });
      };
      window.__portableSchemaBefore = await window.__portableSchemaSnapshot();
      const filePayload = ${encrypted} ? envelope : payload;
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(filePayload)], ${encrypted ? '"synthetic-future-encrypted.json"' : '"synthetic-future-plaintext.json"'}, { type: "application/json" }));
      const input = document.querySelector("#sheet-import-backup-file");
      input.files = transfer.files;
      document.querySelector("#sheet-import-confirm").checked = true;
      document.querySelector("#sheet-import-passphrase").value = ${encrypted ? '"fictional-browser-passphrase"' : '""'};
      return true;
    })()`);
    await page.click('[data-action="data-sheet-save"][data-kind="import"]');
    await waitFor(
      () => page.evaluate("view.sheet === null || document.querySelector('#toast')?.textContent === 'That backup could not be imported.'"),
      `${encrypted ? "encrypted" : "plaintext"} future-schema import result`
    );
    const result = await page.evaluate(`(async () => {
      const result = {
        unchanged: (await window.__portableSchemaSnapshot()) === window.__portableSchemaBefore,
        beginCalls: window.__portableSchemaBeginCalls,
        normalizeCalls: window.__portableSchemaNormalizeCalls,
        decryptCalls: window.__portableSchemaDecryptCalls,
        sheetKind: view.sheet?.kind || "",
        toast: document.querySelector("#toast")?.textContent || "",
        futureCollectionRetained: Object.prototype.hasOwnProperty.call(db, "unknownFutureCollection"),
        futureSchemaRelabeled: db.dataSchemaVersion === DATA_SCHEMA_VERSION && db.people.some(person => person.id === "browser_future_schema")
      };
      beginRecoveryTransaction = window.__portableSchemaOriginalBegin;
      normalizeData = window.__portableSchemaOriginalNormalize;
      decryptPayload = window.__portableSchemaOriginalDecrypt;
      delete window.__portableSchemaSnapshot;
      delete window.__portableSchemaBefore;
      return result;
    })()`);
    result.consoleMessages = page.consoleMessages.slice(consoleStart);
    portableSchemaUiResults.push({ schemaCase, encrypted, ...result });
    if (await page.evaluate("Boolean(view.sheet)")) await page.click('[data-action="sheet-close"][aria-label="Close"]');
  }
  assert.equal(
    portableSchemaUiResults.every(result => result.unchanged
      && result.beginCalls === 0
      && result.normalizeCalls === 0
      && result.sheetKind === "import"
      && result.toast === "That backup could not be imported."
      && !result.futureCollectionRetained
      && !result.futureSchemaRelabeled
      && (!result.encrypted || result.decryptCalls === 1)
      && result.consoleMessages.every(message => !message.includes("999") && !message.includes("browser_unknown_future") && !message.includes("browser_bridge_probe") && !message.includes("Future schema fictional marker"))),
    true,
    `future-schema browser import boundary failed: ${JSON.stringify(portableSchemaUiResults)}`
  );
  pass("plaintext and encrypted future-schema or top-3/nested-2 files stay on one generic retryable import sheet; the internal Auto Memory bridge is unreachable from portable import");

  await page.evaluate(`(() => {
    view.screen = "advancedSettings";
    view.sheet = null;
    render({ mutationEffects: false });
    return true;
  })()`);
  await page.click('[data-action="import-json"]');
  await waitFor(() => page.evaluate("view.sheet?.kind === 'import'"), "current encrypted schema import sheet");
  await page.evaluate(`(async () => {
    const payload = cloneJson(currentPortablePayload());
    payload.data.people = [{ id: "browser_current_schema", name: "Current schema fictional record" }];
    const encrypted = await encryptPayload(payload, "fictional-browser-passphrase");
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(encrypted)], "synthetic-current-encrypted.json", { type: "application/json" }));
    document.querySelector("#sheet-import-backup-file").files = transfer.files;
    document.querySelector("#sheet-import-confirm").checked = true;
    document.querySelector("#sheet-import-passphrase").value = "fictional-browser-passphrase";
    return true;
  })()`);
  await page.click('[data-action="data-sheet-save"][data-kind="import"]');
  await waitFor(() => page.evaluate("view.sheet === null && document.querySelector('#toast')?.textContent === 'Backup restored.'"), "current encrypted schema round trip");
  assert.equal(await page.evaluate("db.dataSchemaVersion === 3 && db.people.length === 1 && db.people[0].id === 'browser_current_schema'"), true);
  pass("current encrypted backup completes one real browser encrypt/decrypt/file/UI round trip at schema 3");
  await page.evaluate("undoStack = []; true");

  const fragmentBefore = await page.evaluate("JSON.stringify({ db, undoStack })");
  const fragmentBeforeProposals = await page.evaluate("db.aiProposals.length");
  const requestStart = requestLog.length;
  const legacyVisible = "LegacyHostVisible";
  await page.navigate(`${baseUrl}/?quickgrab=${legacyVisible}&quickgrabCategory=prayer&safe=kept#quickgrab=${encodeURIComponent(fragmentCapture)}`);
  const boundaryFailures = [];
  const browserBoundaryCheck = (condition, label) => { if (!condition) boundaryFailures.push(label); };
  const finalLocation = await page.evaluate("({ pathname: location.pathname, search: location.search, hash: location.hash })");
  const redirectedRequests = requestLog.slice(requestStart + 1);
  browserBoundaryCheck(requestLog[requestStart]?.includes(`quickgrab=${legacyVisible}`), "synthetic server did not observe the deliberate legacy first request");
  browserBoundaryCheck(redirectedRequests.every(url => !url.includes(legacyVisible) && !url.includes("quickgrabCategory")), "index forwarded a legacy capture query beyond the unavoidable first request");
  browserBoundaryCheck(requestLog.slice(requestStart).every(url => !url.includes(encodeURIComponent(fragmentCapture)) && !url.includes(fragmentCapture)), "fragment content entered the local HTTP request log");
  browserBoundaryCheck(page.requests.every(url => !url.includes(encodeURIComponent(fragmentCapture)) && !url.includes(fragmentCapture)), "fragment content entered a browser/service-worker request URL");
  browserBoundaryCheck(finalLocation.pathname === "/ruf-ministry-hub" && finalLocation.search === "?safe=kept" && finalLocation.hash === "", "redirect/intake did not preserve only unrelated query and scrub the fragment");
  browserBoundaryCheck(await page.evaluate(`document.querySelector('#quick-text')?.value === ${JSON.stringify(fragmentCapture)}`), "fragment text did not import exactly into Quick Grab");
  browserBoundaryCheck(await page.evaluate("JSON.stringify({ db, undoStack })") === fragmentBefore, "fragment intake mutated a record, proposal, or Undo before user action");
  if (boundaryFailures.length) throw new Error(`Browser fragment privacy boundary failures: ${boundaryFailures.join("; ")}`);

  await page.evaluate("window.dispatchEvent(new Event('focus')); window.dispatchEvent(new PageTransitionEvent('pageshow')); true");
  assert.equal(await page.evaluate(`document.querySelector('#quick-text')?.value === ${JSON.stringify(fragmentCapture)}`), true, "focus/pageshow cannot duplicate a scrubbed fragment");
  await page.click('[data-action="capture-submit"][data-mode="later"][data-source="main"]');
  await waitFor(() => page.evaluate(`db.quickGrabs.filter(grab => grab.rawContent === ${JSON.stringify(fragmentCapture)}).length === 1`), "one fragment Save for later");
  assert.equal(await page.evaluate(`db.quickGrabs.filter(grab => grab.rawContent === ${JSON.stringify(fragmentCapture)}).length`), 1);
  assert.equal(await page.evaluate("db.aiProposals.length"), fragmentBeforeProposals);

  const processFragment = "Process fragment locally once";
  await page.navigate(`${baseUrl}${appPath}#quickgrab=${encodeURIComponent(processFragment)}`);
  assert.equal(await page.evaluate(`document.querySelector('#quick-text')?.value === ${JSON.stringify(processFragment)}`), true);
  const beforeProcessProposals = await page.evaluate("db.aiProposals.length");
  await page.click('[data-action="capture-submit"][data-mode="process"][data-source="main"]');
  await waitFor(() => page.evaluate(`view.sheet?.type === 'ai-gate' && db.quickGrabs.filter(grab => grab.rawContent === ${JSON.stringify(processFragment)}).length === 1`), "one fragment Process privacy gate");
  assert.equal(await page.evaluate("db.aiProposals.length"), beforeProcessProposals);
  assert.equal(page.consoleMessages.some(message => message.includes(fragmentCapture) || message.includes(processFragment)), false);
  await page.click('[data-action="sheet-close"]');
  await waitFor(() => page.evaluate(`view.sheet === null && !db.quickGrabs.some(grab => grab.rawContent === ${JSON.stringify(processFragment)})`), "canceled fragment Process deletion");
  assert.equal(await page.evaluate(`db.quickGrabs.filter(grab => grab.rawContent === ${JSON.stringify(processFragment)}).length`), 0);
  assert.equal(await page.evaluate("db.aiProposals.length"), beforeProcessProposals);
  pass("fragment-only shared capture stays out of requests/logs, imports once, and Cancel deletes the transient Process capture");

  await page.click('.mobile-nav [data-action="nav"][data-screen="quick"]');
  assert.equal(await page.evaluate("Boolean(document.querySelector('[data-action=\"voice-capture\"]'))"), false, "dictation is absent until the current disclosure is explicitly accepted");
  await page.evaluate(`
    window.__dictationConstructed = 0;
    window.SpeechRecognition = function SyntheticRecognition() {
      window.__dictationConstructed += 1;
      window.__dictationRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    settings = normalizeSettings({
      ...settings,
      enableVoiceCapture: true,
      voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION
    });
    render();
  `);
  await page.click('[data-action="voice-capture"]');
  assert.equal(await page.evaluate("window.__dictationConstructed"), 0, "recognition must not be constructed before per-start confirmation");
  assert.equal(await page.evaluate("view.sheet?.type === 'dictation' && view.sheet?.kind === 'start'"), true);
  const dictationDialog = await page.evaluate(`(() => {
    const panel = document.querySelector('[data-sheet-panel]');
    return {
      role: panel?.getAttribute('role'),
      modal: panel?.getAttribute('aria-modal'),
      labelledBy: panel?.getAttribute('aria-labelledby'),
      checked: document.querySelector('#dictation-confirm')?.checked,
      text: panel?.textContent || ''
    };
  })()`);
  assert.deepEqual({ role: dictationDialog.role, modal: dictationDialog.modal, labelledBy: dictationDialog.labelledBy, checked: dictationDialog.checked }, { role: "dialog", modal: "true", labelledBy: "dictation-sheet-title", checked: false });
  assert.equal(dictationDialog.text.includes("browser or device") && dictationDialog.text.includes("cannot verify"), true);
  await page.click('[data-action="sheet-close"]');
  assert.equal(await page.evaluate("window.__dictationConstructed"), 0);

  const recordEnvelopeCanary = await page.evaluate(`(() => {
    const checkCollection = (collection, record) => {
      const before = JSON.stringify({ db, undoStack });
      let detected = false;
      try {
        db[collection].push(record);
        detected = JSON.stringify({ db, undoStack }) !== before;
      } finally {
        db[collection].pop();
      }
      return { detected, restored: JSON.stringify({ db, undoStack }) === before };
    };
    return {
      notes: checkCollection("notes", { id: "synthetic-envelope-canary-note" }),
      meetingNotes: checkCollection("meetingNotes", { id: "synthetic-envelope-canary-meeting" }),
      tasks: checkCollection("tasks", { id: "synthetic-envelope-canary-task" })
    };
  })()`);
  assert.deepEqual(recordEnvelopeCanary, {
    notes: { detected: true, restored: true },
    meetingNotes: { detected: true, restored: true },
    tasks: { detected: true, restored: true }
  });

  const preDisclosureCases = [
    { source: "today", autosave: true, storage: "older" },
    { source: "today", autosave: false, storage: "absent" },
    { source: "profile", autosave: true, storage: "older" },
    { source: "profile", autosave: false, storage: "absent" }
  ];
  const preDisclosureFailures = [];
  for (const fixture of preDisclosureCases) {
    const liveDraft = `  ${fixture.source} ${fixture.autosave ? "autosave on" : "autosave off"} live draft\nsecond line  `;
    const olderDraft = `${fixture.source} older stored draft`;
    let setup;
    try {
      setup = await page.evaluate(`(() => {
        const fixture = ${JSON.stringify(fixture)};
        const owner = fixture.source === "profile" ? db.people[0] : null;
        const renderedPerson = fixture.source === "profile" ? (db.people[1] || owner) : null;
        settings.enableAutoSave = fixture.autosave;
        settings.localEncryptionEnabled = false;
        autosaveDraftsCache = {};
        view.sheet = null;
        window.__preDisclosureOriginalSetTimeout = window.setTimeout;
        window.__preDisclosureOriginalClearTimeout = window.clearTimeout;
        const priorAutosaveTimer = autosaveTimer;
        if (priorAutosaveTimer !== null) {
          window.__preDisclosureOriginalClearTimeout(priorAutosaveTimer);
          autosaveTimer = null;
        }
        window.__preDisclosurePriorAutosaveRetired = priorAutosaveTimer !== null;
        window.__preDisclosureAutosaveCallback = null;
        window.__preDisclosureAutosaveTimerRequests = 0;
        window.__preDisclosureUnexpectedAutosaveTimers = 0;
        const ownedAutosaveTimerId = 2147483000;
        window.setTimeout = (callback, delay, ...args) => {
          if (delay === 180) {
            window.__preDisclosureAutosaveTimerRequests += 1;
            const timerId = ownedAutosaveTimerId + window.__preDisclosureAutosaveTimerRequests - 1;
            if (window.__preDisclosureAutosaveTimerRequests === 1) {
              window.__preDisclosureAutosaveCallback = () => callback(...args);
            } else {
              window.__preDisclosureUnexpectedAutosaveTimers += 1;
            }
            return timerId;
          }
          return window.__preDisclosureOriginalSetTimeout(callback, delay, ...args);
        };
        window.clearTimeout = timer => {
          if (timer >= ownedAutosaveTimerId && timer < ownedAutosaveTimerId + 1000) {
            if (timer === ownedAutosaveTimerId) window.__preDisclosureAutosaveCallback = null;
            return;
          }
          return window.__preDisclosureOriginalClearTimeout(timer);
        };
        if (fixture.source === "today") {
          view.screen = "today";
          view.todayCaptureDraftText = "";
        } else {
          view.screen = "person";
          view.personId = owner.id;
          view.profileCaptureOwnerId = owner.id;
          view.profileCapturePersonId = renderedPerson.id;
          view.profileCaptureDraftText = "";
          view.profileCaptureDraftTargetId = "";
        }
        const targetId = fixture.source === "today" ? "today-capture-text" : "profile-capture-text";
        const draftKey = fixture.source === "today" ? "capture:today" : "capture:profile:" + renderedPerson.id;
        if (fixture.storage === "older") {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
            [draftKey]: { key: draftKey, fields: { [targetId]: ${JSON.stringify(olderDraft)} }, screen: view.screen, updatedAt: "2026-07-19T00:00:00.000Z" }
          }));
        } else {
          localStorage.removeItem(AUTOSAVE_KEY);
        }
        render();
        if (fixture.source === "today") view.todayCaptureDraftText = "";
        else {
          view.profileCaptureDraftText = "";
          view.profileCaptureDraftTargetId = "";
        }
        window.__preDisclosurePersistenceCalls = 0;
        window.__preDisclosureOriginalSaveCurrentDraftNow = saveCurrentDraftNow;
        saveCurrentDraftNow = (...args) => {
          window.__preDisclosurePersistenceCalls += 1;
          return window.__preDisclosureOriginalSaveCurrentDraftNow(...args);
        };
        window.__preDisclosureConstructed = 0;
        window.SpeechRecognition = function SyntheticPreDisclosureRecognition() {
          window.__preDisclosureConstructed += 1;
          window.__preDisclosureRecognition = this;
          this.start = () => {};
          this.abort = () => {};
        };
        const textarea = document.getElementById(targetId);
        const composer = textarea?.closest('[data-capture-composer]');
        return {
          targetId,
          draftKey,
          renderedPersonId: composer?.dataset?.personId || "",
          priorAutosaveRetired: window.__preDisclosurePriorAutosaveRetired,
          storageBefore: localStorage.getItem(AUTOSAVE_KEY),
          recordsBefore: JSON.stringify({ db, undoStack })
        };
      })()`);
      await page.setValue(`#${setup.targetId}`, liveDraft);
      const inputOwnership = await page.evaluate(`(() => ({
        timerRequests: window.__preDisclosureAutosaveTimerRequests,
        unexpectedTimers: window.__preDisclosureUnexpectedAutosaveTimers,
        callbackOwned: typeof window.__preDisclosureAutosaveCallback === "function",
        timerId: autosaveTimer
      }))()`);
      const expectedTimerRequests = fixture.autosave ? 1 : 0;
      if (inputOwnership.timerRequests !== expectedTimerRequests || inputOwnership.unexpectedTimers !== 0) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: input did not own exactly ${expectedTimerRequests} autosave timer`);
      }
      if (inputOwnership.callbackOwned !== fixture.autosave || inputOwnership.timerId !== (fixture.autosave ? 2147483000 : null)) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: input autosave callback ownership drifted`);
      }
      const selector = `[data-capture-composer="${fixture.source}"] [data-action="voice-capture"]`;
      await page.click(selector);
      const openState = await page.evaluate(`(() => {
        const target = document.getElementById(${JSON.stringify(setup.targetId)});
        return {
          value: target?.value,
          viewDraft: ${fixture.source === "today" ? "view.todayCaptureDraftText" : "view.profileCaptureDraftText"},
          profileTargetId: view.profileCaptureDraftTargetId,
          contextProfileId: view.sheet?.context?.profileCapturePersonId || "",
          contextTargetId: view.sheet?.context?.profileCaptureDraftTargetId || "",
          checked: document.getElementById("dictation-confirm")?.checked,
          constructed: window.__preDisclosureConstructed,
          persistenceCalls: window.__preDisclosurePersistenceCalls,
          storage: localStorage.getItem(AUTOSAVE_KEY),
          records: JSON.stringify({ db, undoStack })
        };
      })()`);
      if (openState.value !== liveDraft || openState.viewDraft !== liveDraft) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure open lost live bytes`);
      if (openState.checked !== false || openState.constructed !== 0) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure opened checked or constructed recognition`);
      if (openState.persistenceCalls !== 0 || openState.storage !== setup.storageBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure open persisted`);
      if (openState.records !== setup.recordsBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure open mutated records or Undo`);
      if (fixture.source === "profile" && (openState.profileTargetId !== setup.renderedPersonId || openState.contextProfileId !== setup.renderedPersonId || openState.contextTargetId !== setup.renderedPersonId)) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure context missed rendered person identity`);
      }
      await page.click('[data-sheet-panel] [data-action="sheet-close"]');
      const cancelState = await page.evaluate(`(() => ({
        value: document.getElementById(${JSON.stringify(setup.targetId)})?.value,
        viewDraft: ${fixture.source === "today" ? "view.todayCaptureDraftText" : "view.profileCaptureDraftText"},
        constructed: window.__preDisclosureConstructed,
        persistenceCalls: window.__preDisclosurePersistenceCalls,
        storage: localStorage.getItem(AUTOSAVE_KEY),
        records: JSON.stringify({ db, undoStack })
      }))()`);
      if (cancelState.value !== liveDraft || cancelState.viewDraft !== liveDraft) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure cancel lost live bytes`);
      if (cancelState.constructed !== 0 || cancelState.persistenceCalls !== 0 || cancelState.storage !== setup.storageBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure cancel caused recognition or persistence`);
      if (cancelState.records !== setup.recordsBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: disclosure cancel mutated records or Undo`);
      await page.click(selector);
      await page.check("#dictation-confirm");
      await page.click('[data-action="dictation-start-confirm"]');
      const startState = await page.evaluate(`(() => ({
        value: document.getElementById(${JSON.stringify(setup.targetId)})?.value,
        viewDraft: ${fixture.source === "today" ? "view.todayCaptureDraftText" : "view.profileCaptureDraftText"},
        constructed: window.__preDisclosureConstructed,
        persistenceCalls: window.__preDisclosurePersistenceCalls,
        storage: localStorage.getItem(AUTOSAVE_KEY),
        sessionProfileId: activeDictationSession?.context?.profileCapturePersonId || "",
        sessionTargetId: activeDictationSession?.context?.profileCaptureDraftTargetId || "",
        records: JSON.stringify({ db, undoStack })
      }))()`);
      if (startState.value !== liveDraft || startState.viewDraft !== liveDraft) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: checked Start lost live bytes`);
      if (startState.constructed !== 1 || startState.persistenceCalls !== 0 || startState.storage !== setup.storageBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: checked Start persistence/recognition count drifted`);
      if (startState.records !== setup.recordsBefore) preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: checked Start mutated records or Undo`);
      if (fixture.source === "profile" && (startState.sessionProfileId !== setup.renderedPersonId || startState.sessionTargetId !== setup.renderedPersonId)) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: started session missed rendered person identity`);
      }
      const releaseState = await page.evaluate(`(() => {
        const callback = window.__preDisclosureAutosaveCallback;
        window.__preDisclosureAutosaveCallback = null;
        if (${JSON.stringify(fixture.autosave)} && typeof callback === "function") callback();
        const storedDraft = loadAutosaveDrafts()[${JSON.stringify(setup.draftKey)}];
        return {
          hadCallback: typeof callback === "function",
          timerRequests: window.__preDisclosureAutosaveTimerRequests,
          unexpectedTimers: window.__preDisclosureUnexpectedAutosaveTimers,
          persistenceCalls: window.__preDisclosurePersistenceCalls,
          storedValue: storedDraft?.fields?.[${JSON.stringify(setup.targetId)}] ?? null,
          storage: localStorage.getItem(AUTOSAVE_KEY),
          value: document.getElementById(${JSON.stringify(setup.targetId)})?.value,
          viewDraft: ${fixture.source === "today" ? "view.todayCaptureDraftText" : "view.profileCaptureDraftText"},
          constructed: window.__preDisclosureConstructed,
          records: JSON.stringify({ db, undoStack }),
          timerId: autosaveTimer
        };
      })()`);
      if (releaseState.timerRequests !== expectedTimerRequests || releaseState.unexpectedTimers !== 0 || releaseState.hadCallback !== fixture.autosave) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: released autosave callback ownership drifted`);
      }
      if (releaseState.value !== liveDraft || releaseState.viewDraft !== liveDraft || releaseState.constructed !== 1 || releaseState.records !== setup.recordsBefore) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: autosave release changed draft, recognition, records, or Undo`);
      }
      if (fixture.autosave) {
        if (releaseState.persistenceCalls !== 1 || releaseState.storedValue !== liveDraft || releaseState.timerId !== null) {
          preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: owned autosave did not persist exact live bytes once`);
        }
      } else if (releaseState.persistenceCalls !== 0 || releaseState.storage !== setup.storageBefore || releaseState.storedValue !== null || releaseState.timerId !== null) {
        preDisclosureFailures.push(`${fixture.source}/${fixture.autosave}: autosave-off release persisted or scheduled work`);
      }
    } finally {
      await page.evaluate(`(() => {
        cancelActiveDictation({ announce: false });
        const preDisclosureClearTimeout = window.__preDisclosureOriginalClearTimeout;
        if (autosaveTimer !== null) {
          if (typeof preDisclosureClearTimeout === "function") preDisclosureClearTimeout(autosaveTimer);
          else window.clearTimeout(autosaveTimer);
          autosaveTimer = null;
        }
        window.__preDisclosureAutosaveCallback = null;
        if (typeof window.__preDisclosureOriginalSaveCurrentDraftNow === "function") {
          saveCurrentDraftNow = window.__preDisclosureOriginalSaveCurrentDraftNow;
        }
        if (typeof window.__preDisclosureOriginalSetTimeout === "function") {
          window.setTimeout = window.__preDisclosureOriginalSetTimeout;
        }
        if (typeof preDisclosureClearTimeout === "function") window.clearTimeout = preDisclosureClearTimeout;
        settings.enableAutoSave = true;
        view.sheet = null;
      })()`);
    }
  }
  assert.deepEqual(preDisclosureFailures, [], `pre-disclosure draft boundary failures: ${preDisclosureFailures.join("; ")}`);
  assert.equal(page.consoleMessages.some(message => message.includes("live draft") || message.includes("older stored draft")), false);
  const blockedPreDisclosure = await page.evaluate(`(() => {
    settings.enableAutoSave = true;
    view.screen = "today";
    view.todayCaptureDraftText = "blocked view baseline";
    view.sheet = null;
    render();
    const storageBefore = localStorage.getItem(AUTOSAVE_KEY);
    const recordsBefore = JSON.stringify({ db, undoStack });
    window.__preDisclosureConstructed = 0;
    const originalGetElementById = document.getElementById.bind(document);
    const detached = document.createElement("textarea");
    detached.id = "today-capture-text";
    detached.value = "detached live draft";
    document.getElementById = id => id === "today-capture-text" ? detached : originalGetElementById(id);
    const detachedResult = openDictationConsentSheet("today-capture-text");
    document.getElementById = originalGetElementById;
    const attached = document.getElementById("today-capture-text");
    attached.value = "recovery-blocked live draft";
    recoveryTransactionPending = true;
    const recoveryResult = openDictationConsentSheet("today-capture-text");
    recoveryTransactionPending = false;
    return {
      detachedResult,
      recoveryResult,
      viewDraft: view.todayCaptureDraftText,
      sheet: view.sheet,
      constructed: window.__preDisclosureConstructed,
      storageUnchanged: localStorage.getItem(AUTOSAVE_KEY) === storageBefore,
      recordsUnchanged: JSON.stringify({ db, undoStack }) === recordsBefore
    };
  })()`);
  assert.deepEqual(blockedPreDisclosure, {
    detachedResult: false,
    recoveryResult: false,
    viewDraft: "blocked view baseline",
    sheet: null,
    constructed: 0,
    storageUnchanged: true,
    recordsUnchanged: true
  });
  await page.evaluate(`
    localStorage.removeItem(AUTOSAVE_KEY);
    view.screen = "quick";
    view.quickGrabDraftText = "";
    view.sheet = null;
    window.__dictationConstructed = 0;
    window.SpeechRecognition = function SyntheticRecognition() {
      window.__dictationConstructed += 1;
      window.__dictationRecognition = this;
      this.start = () => {};
      this.abort = () => {};
    };
    render();
  `);
  pass("Today and profile disclosure preserve exact live drafts without persistence or premature recognition");

  const disclosureTransitionFailures = [];
  for (const source of ["main", "today", "profile"]) {
    for (const stage of ["open", "cancel", "start"]) {
      const fixture = { source, stage };
      const result = await page.evaluate(`(() => {
        const fixture = ${JSON.stringify(fixture)};
        const liveDraft = "  " + fixture.source + " " + fixture.stage + " transition draft\\nsecond line  ";
        const fragment = "pending fictional fragment for " + fixture.stage;
        db = demoData();
        const personId = db.people[0].id;
        settings = normalizeSettings({
          ...settings,
          enableAutoSave: false,
          enableUrlQuickGrab: true,
          enableVoiceCapture: true,
          voiceCaptureDisclosureVersion: VOICE_CAPTURE_DISCLOSURE_VERSION,
          autoArchiveAnsweredDays: "never",
          notificationsEnabled: false,
          lastNotificationDate: ""
        });
        view.sheet = null;
        view.screen = fixture.source === "main" ? "quick" : fixture.source === "today" ? "today" : "person";
        view.personId = fixture.source === "profile" ? personId : null;
        view.profileCaptureOwnerId = fixture.source === "profile" ? personId : "";
        view.profileCapturePersonId = fixture.source === "profile" ? personId : "";
        view.profileCaptureDraftTargetId = fixture.source === "profile" ? personId : "";
        view.quickGrabDraftText = "";
        view.todayCaptureDraftText = "";
        view.profileCaptureDraftText = "";
        pendingFragmentQuickGrabText = "";
        sharedFragmentImportDeferred = false;
        render();
        const targetId = fixture.source === "main" ? "quick-text" : fixture.source + "-capture-text";
        let target = document.getElementById(targetId);
        target.value = liveDraft;
        if (fixture.stage !== "open" && !openDictationConsentSheet(targetId)) throw new Error("synthetic disclosure setup failed");

        const answered = {
          id: "transition-answered-" + fixture.source + "-" + fixture.stage,
          request: "Fictional answered prayer",
          status: "Answered",
          answeredAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z"
        };
        db.prayerRequests.push(answered);
        db.tasks.push({
          id: "transition-task-" + fixture.source + "-" + fixture.stage,
          title: "Fictional pending attention",
          status: "Not Started",
          dueDate: todayISO(),
          createdAt: "2026-07-19T00:00:00.000Z",
          updatedAt: "2026-07-19T00:00:00.000Z"
        });
        settings.autoArchiveAnsweredDays = "7";
        settings.notificationsEnabled = true;
        settings.lastNotificationDate = "";
        if (fixture.source === "main") pendingFragmentQuickGrabText = fragment;

        const before = {
          db: JSON.stringify(db),
          settings: JSON.stringify(settings),
          undo: JSON.stringify(undoStack),
          storage: JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
          pendingFragment: pendingFragmentQuickGrabText,
          deferredFragment: sharedFragmentImportDeferred
        };
        const originals = {
          saveData,
          saveSettings,
          saveCurrentDraftNow,
          scheduleAutosave,
          SpeechRecognition: window.SpeechRecognition,
          Notification: window.Notification,
          notificationDescriptor: Object.getOwnPropertyDescriptor(window, "Notification")
        };
        const calls = { saveData: 0, saveSettings: 0, saveCurrentDraftNow: 0, scheduleAutosave: 0, notifications: 0 };
        function SyntheticNotification() { calls.notifications += 1; }
        Object.defineProperty(SyntheticNotification, "permission", { configurable: true, value: "granted" });
        saveData = () => { calls.saveData += 1; return true; };
        saveSettings = () => { calls.saveSettings += 1; return true; };
        saveCurrentDraftNow = () => { calls.saveCurrentDraftNow += 1; return true; };
        scheduleAutosave = () => { calls.scheduleAutosave += 1; return true; };
        Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: SyntheticNotification });
        window.__dictationTransitionConstructed = 0;
        window.SpeechRecognition = function SyntheticTransitionRecognition() {
          window.__dictationTransitionConstructed += 1;
          window.__dictationTransitionRecognition = this;
          this.start = () => {};
          this.abort = () => {};
        };
        let transitionResult = false;
        try {
          if (fixture.stage === "open") transitionResult = openDictationConsentSheet(targetId);
          if (fixture.stage === "cancel") transitionResult = closeSheet();
          if (fixture.stage === "start") {
            document.getElementById("dictation-confirm").checked = true;
            transitionResult = submitDictationStartSheet();
          }
          target = document.getElementById(targetId);
          return {
            transitionResult,
            calls,
            constructed: window.__dictationTransitionConstructed,
            targetValue: target?.value,
            viewDraft: fixture.source === "main" ? view.quickGrabDraftText : fixture.source === "today" ? view.todayCaptureDraftText : view.profileCaptureDraftText,
            dbUnchanged: JSON.stringify(db) === before.db,
            settingsUnchanged: JSON.stringify(settings) === before.settings,
            undoUnchanged: JSON.stringify(undoStack) === before.undo,
            storageUnchanged: JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])) === before.storage,
            pendingFragmentUnchanged: pendingFragmentQuickGrabText === before.pendingFragment && sharedFragmentImportDeferred === before.deferredFragment,
            sheetKind: view.sheet?.kind || "",
            sessionActive: Boolean(activeDictationSession)
          };
        } finally {
          if (activeDictationSession) cancelActiveDictation({ announce: false });
          saveData = originals.saveData;
          saveSettings = originals.saveSettings;
          saveCurrentDraftNow = originals.saveCurrentDraftNow;
          scheduleAutosave = originals.scheduleAutosave;
          window.SpeechRecognition = originals.SpeechRecognition;
          if (originals.notificationDescriptor) Object.defineProperty(window, "Notification", originals.notificationDescriptor);
          else if (originals.Notification) Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: originals.Notification });
          else delete window.Notification;
          pendingFragmentQuickGrabText = "";
          sharedFragmentImportDeferred = false;
          settings.autoArchiveAnsweredDays = "never";
          settings.notificationsEnabled = false;
          view.sheet = null;
        }
      })()`);
      const expectedRecognition = stage === "start" ? 1 : 0;
      if (!result.transitionResult) disclosureTransitionFailures.push(`${source}/${stage}: transition refused`);
      if (result.calls.saveData || result.calls.saveSettings || result.calls.saveCurrentDraftNow || result.calls.scheduleAutosave || result.calls.notifications) disclosureTransitionFailures.push(`${source}/${stage}: transition ran mutation effect ${JSON.stringify(result.calls)}`);
      if (result.constructed !== expectedRecognition) disclosureTransitionFailures.push(`${source}/${stage}: recognition count ${result.constructed}`);
      if (result.targetValue !== `  ${source} ${stage} transition draft\nsecond line  ` || result.viewDraft !== result.targetValue) disclosureTransitionFailures.push(`${source}/${stage}: live draft changed`);
      if (!result.dbUnchanged || !result.settingsUnchanged || !result.undoUnchanged || !result.storageUnchanged || !result.pendingFragmentUnchanged) disclosureTransitionFailures.push(`${source}/${stage}: state mutated`);
      if ((stage === "open" && result.sheetKind !== "start") || (stage === "cancel" && (result.sheetKind || result.sessionActive)) || (stage === "start" && (!result.sessionActive || result.sheetKind))) disclosureTransitionFailures.push(`${source}/${stage}: sheet/session state drifted`);
    }
  }
  assert.deepEqual(disclosureTransitionFailures, [], `dictation transition render-effect failures: ${disclosureTransitionFailures.join("; ")}`);

  const ordinaryRenderEffects = await page.evaluate(`(() => {
    db = demoData();
    settings = normalizeSettings({
      ...settings,
      enableAutoSave: false,
      enableUrlQuickGrab: true,
      autoArchiveAnsweredDays: "never",
      notificationsEnabled: false,
      lastNotificationDate: ""
    });
    view.screen = "quick";
    view.sheet = null;
    view.quickGrabDraftText = "ordinary baseline";
    pendingFragmentQuickGrabText = "";
    sharedFragmentImportDeferred = false;
    render();
    const answered = { id: "ordinary-answered", request: "Fictional ordinary prayer", status: "Answered", answeredAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" };
    db.prayerRequests.push(answered);
    db.tasks.push({ id: "ordinary-task", title: "Fictional ordinary attention", status: "Not Started", dueDate: todayISO() });
    settings.autoArchiveAnsweredDays = "7";
    settings.notificationsEnabled = true;
    settings.lastNotificationDate = "";
    pendingFragmentQuickGrabText = "ordinary fictional fragment";
    const originals = { saveData, saveSettings, scheduleAutosave, descriptor: Object.getOwnPropertyDescriptor(window, "Notification") };
    const calls = { saveData: 0, saveSettings: 0, scheduleAutosave: 0, notifications: 0 };
    function SyntheticNotification() { calls.notifications += 1; }
    Object.defineProperty(SyntheticNotification, "permission", { configurable: true, value: "granted" });
    saveData = () => { calls.saveData += 1; return true; };
    saveSettings = () => { calls.saveSettings += 1; return true; };
    scheduleAutosave = () => { calls.scheduleAutosave += 1; return true; };
    Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: SyntheticNotification });
    try {
      render();
      return {
        calls,
        prayerStatus: answered.status,
        notificationDate: settings.lastNotificationDate,
        pendingFragment: pendingFragmentQuickGrabText,
        draft: view.quickGrabDraftText,
        target: document.getElementById("quick-text")?.value
      };
    } finally {
      saveData = originals.saveData;
      saveSettings = originals.saveSettings;
      scheduleAutosave = originals.scheduleAutosave;
      if (originals.descriptor) Object.defineProperty(window, "Notification", originals.descriptor);
      else delete window.Notification;
      settings.autoArchiveAnsweredDays = "never";
      settings.notificationsEnabled = false;
      settings.enableAutoSave = true;
      pendingFragmentQuickGrabText = "";
    }
  })()`);
  assert.deepEqual(ordinaryRenderEffects.calls, { saveData: 1, saveSettings: 1, scheduleAutosave: 1, notifications: 1 });
  assert.equal(ordinaryRenderEffects.prayerStatus, "Archived");
  assert.notEqual(ordinaryRenderEffects.notificationDate, "");
  assert.equal(ordinaryRenderEffects.pendingFragment, "");
  assert.equal(ordinaryRenderEffects.draft, "ordinary baseline\n\nordinary fictional fragment");
  assert.equal(ordinaryRenderEffects.target, ordinaryRenderEffects.draft);
  assert.equal(page.consoleMessages.some(message => message.includes("pending fictional fragment") || message.includes("ordinary fictional fragment")), false);
  pass("dictation transition renders suppress unrelated mutations while ordinary render effects remain active");

  const browserDictationBaseline = "Browser dictation baseline";
  const browserDictationTranscript = "browser recognized words";
  const browserDictationCommitted = `${browserDictationBaseline}\n${browserDictationTranscript}`;
  const beforeDictationRecords = await page.evaluate("JSON.stringify({ db, undoStack })");
  await page.setValue("#quick-text", browserDictationBaseline);
  await page.evaluate(`
    saveCurrentDraftNow();
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    window.__dictationPersistenceCalls = 0;
    window.__dictationSuccessPersistedValue = null;
    window.__dictationOriginalSaveAutosaveDrafts = saveAutosaveDrafts;
    window.__dictationOriginalShowToast = showToast;
    saveAutosaveDrafts = drafts => {
      window.__dictationPersistenceCalls += 1;
      return window.__dictationOriginalSaveAutosaveDrafts(drafts);
    };
    showToast = (message, type) => {
      if (message === "Dictation added to this draft.") {
        window.__dictationSuccessPersistedValue = loadAutosaveDrafts()["capture:main"]?.fields?.["quick-text"] || null;
      }
      return window.__dictationOriginalShowToast(message, type);
    };
  `);
  await page.click('[data-action="voice-capture"]');
  await page.check("#dictation-confirm");
  await page.click('[data-action="dictation-start-confirm"]');
  await waitFor(() => page.evaluate("window.__dictationConstructed === 1 && Boolean(window.__dictationRecognition)"), "confirmed browser dictation start");
  await page.evaluate(`
    scheduleAutosave();
    window.__dictationLateResult = window.__dictationRecognition.onresult;
    window.__dictationLateEnd = window.__dictationRecognition.onend;
    window.__dictationRecognition.onresult({
      results: [Object.assign([{ transcript: ${JSON.stringify(browserDictationTranscript)} }], { isFinal: true })]
    });
    window.__dictationRecognition.onend();
  `);
  const immediateDictationState = await page.evaluate(`(() => ({
    textarea: document.querySelector('#quick-text')?.value || '',
    viewDraft: view.quickGrabDraftText,
    storedDraft: loadAutosaveDrafts()["capture:main"]?.fields?.["quick-text"] || '',
    persistenceCalls: window.__dictationPersistenceCalls,
    autosavePending: Boolean(autosaveTimer),
    persistedBeforeSuccess: window.__dictationSuccessPersistedValue,
    records: JSON.stringify({ db, undoStack })
  }))()`);
  assert.deepEqual(immediateDictationState, {
    textarea: browserDictationCommitted,
    viewDraft: browserDictationCommitted,
    storedDraft: browserDictationCommitted,
    persistenceCalls: 1,
    autosavePending: false,
    persistedBeforeSuccess: browserDictationCommitted,
    records: beforeDictationRecords
  });
  await page.click('[data-action="voice-capture"]');
  assert.equal(await page.evaluate(`document.querySelector('#quick-text')?.value === ${JSON.stringify(browserDictationCommitted)} && view.quickGrabDraftText === ${JSON.stringify(browserDictationCommitted)}`), true, "immediate Dictate reopen must not restore the older autosave");
  await page.evaluate(`
    window.__dictationLateResult({ results: [Object.assign([{ transcript: "late duplicate words" }], { isFinal: true })] });
    window.__dictationLateEnd();
  `);
  await new Promise(resolve => setTimeout(resolve, 230));
  const settledDictationState = await page.evaluate(`(() => ({
    textarea: document.querySelector('#quick-text')?.value || '',
    viewDraft: view.quickGrabDraftText,
    storedDraft: loadAutosaveDrafts()["capture:main"]?.fields?.["quick-text"] || '',
    persistenceCalls: window.__dictationPersistenceCalls,
    records: JSON.stringify({ db, undoStack })
  }))()`);
  assert.equal(settledDictationState.textarea, browserDictationCommitted);
  assert.equal(settledDictationState.viewDraft, browserDictationCommitted);
  assert.equal(settledDictationState.storedDraft, browserDictationCommitted);
  assert.equal(settledDictationState.persistenceCalls, 1);
  assert.equal(settledDictationState.records, beforeDictationRecords);
  assert.equal(page.consoleMessages.some(message => message.includes(browserDictationTranscript) || message.includes("late duplicate words")), false);
  await page.click('[data-action="sheet-close"]');
  await page.evaluate(`
    saveAutosaveDrafts = window.__dictationOriginalSaveAutosaveDrafts;
    showToast = window.__dictationOriginalShowToast;
  `);
  pass("dictation defaults off, discloses before recognition, and persists one successful draft before immediate render");

  const before = await page.evaluate(permanentCountsExpression());
  const beforeQuickGrabs = await page.evaluate("db.quickGrabs.length");
  const beforeProposals = await page.evaluate("db.aiProposals.length");
  await page.setValue("#quick-text", syntheticCapture);
  await page.click('[data-action="capture-submit"][data-mode="process"][data-source="main"]');
  await waitFor(() => page.evaluate(`view.sheet?.type === 'ai-gate' && db.quickGrabs.some(grab => grab.rawContent === ${JSON.stringify(syntheticCapture)})`), "capture privacy gate");
  assert.equal(await page.evaluate("db.quickGrabs.length"), beforeQuickGrabs + 1);
  assert.equal(await page.evaluate("db.aiProposals.length"), beforeProposals);
  assert.deepEqual(await page.evaluate(permanentCountsExpression()), before);
  pass("Process saves one raw capture and opens privacy review without creating ministry records");

  await page.check("#sheet-ai-gate-confirm");
  await page.click('[data-action="ai-gate-continue"]');
  await waitFor(() => page.evaluate(`view.screen === 'aiReview' && db.aiProposals.some(proposal => proposal.sourceType === 'quickGrab' && proposal.rawInputPreview === ${JSON.stringify(syntheticCapture)})`), "AI Review proposal");
  assert.equal(await page.evaluate("db.aiProposals.length"), beforeProposals + 1);
  assert.deepEqual(await page.evaluate(permanentCountsExpression()), before);
  const proposalId = await page.evaluate(`db.aiProposals.find(proposal => proposal.sourceType === 'quickGrab' && proposal.rawInputPreview === ${JSON.stringify(syntheticCapture)}).id`);
  assert.ok(proposalId);
  pass("privacy confirmation creates one pending suggestion and no permanent records");

  await page.click(`[data-action="ai-proposal-approve-all"][data-id="${proposalId}"]`);
  await waitFor(() => page.evaluate(`view.screen === 'aiConfirmActions' && view.aiConfirmProposalId === ${JSON.stringify(proposalId)}`), "final action confirmation");
  assert.deepEqual(await page.evaluate(permanentCountsExpression()), before);
  assert.equal(await page.evaluate("Boolean(document.querySelector('#ai-confirm-action-confirm'))"), true);
  await page.click('[data-action="ai-action-confirm-cancel"]');
  await waitFor(() => page.evaluate("view.screen === 'aiReview'"), "AI Review after cancel");
  assert.deepEqual(await page.evaluate(permanentCountsExpression()), before);
  assert.equal(await page.evaluate(`db.aiProposals.find(proposal => proposal.id === ${JSON.stringify(proposalId)}).status`), "pending");
  pass("review selection and cancellation preserve proposal-only state until final approval");

  assert.deepEqual(apiRequests, [], "local mock journey must not call a Pages AI route");
  const expectedOrigin = new URL(baseUrl).origin;
  const externalRequests = page.requests.filter(url => {
    try {
      return new URL(url).origin !== expectedOrigin && !url.startsWith("data:") && !url.startsWith("blob:");
    } catch {
      return true;
    }
  });
  assert.deepEqual(externalRequests, [], "journey must not make external requests");
  assert.deepEqual(page.exceptions, [], "journey must not produce uncaught page exceptions");
  pass("synthetic journey remains local and produces no uncaught browser exception");
}

async function run() {
  if (typeof WebSocket !== "function") throw new Error("Node.js 22 or newer is required for the built-in CDP WebSocket client.");
  const server = await startServer();
  let browser;
  try {
    browser = await launchBrowser();
    const page = new BrowserPage(browser.cdp);
    await runJourney(page, server.baseUrl, server.apiRequests, server.requestLog);
    console.log("All Calm SIMULATED-BROWSER journey checks passed.");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

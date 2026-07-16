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
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname.startsWith("/api/")) {
      apiRequests.push({ method: request.method, path: requestUrl.pathname });
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Synthetic browser journey keeps external AI disabled." }));
      return;
    }
    const relative = requestUrl.pathname === "/"
      ? "index.html"
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
    cdp.on("Runtime.exceptionThrown", event => this.exceptions.push(event.exceptionDetails?.text || "Uncaught page exception"));
    cdp.on("Network.requestWillBeSent", event => this.requests.push(event.request.url));
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

async function runJourney(page, baseUrl, apiRequests) {
  await page.navigate(baseUrl + appPath);
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

  await page.click('.mobile-nav [data-action="nav"][data-screen="quick"]');
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
    await runJourney(page, server.baseUrl, server.apiRequests);
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

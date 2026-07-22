const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nodeCrypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const deployRoot = path.resolve(repoRoot, "ruf-ministry-hub-deploy-working");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function loadQuickGrab() {
  const policyPath = path.resolve(deployRoot, "functions/api/ai/quick-grab-pilot-policy.js");
  const functionPath = path.resolve(deployRoot, "functions/api/ai/quick-grab.js");
  const policy = fs.readFileSync(policyPath, "utf8").replace(/export\s+/g, "");
  const source = fs.readFileSync(functionPath, "utf8")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/quick-grab-pilot-policy\.js";\s*/, "")
    .replace(/export\s+/g, "");
  const context = {
    console,
    Request,
    Response,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    atob,
    crypto: nodeCrypto.webcrypto,
    fetch() { throw new Error("default-off pilot must not make a network call"); }
  };
  vm.createContext(context);
  vm.runInContext(`${policy}\n${source}\nglobalThis.__handler = onRequestPost;`, context, { filename: functionPath });
  return context.__handler;
}

async function run() {
  const fixtureManifest = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "tests/fixtures/api/fictional-quick-grab-pilot.json"), "utf8"));
  const policy = fs.readFileSync(path.resolve(repoRoot, "functions/api/ai/quick-grab-pilot-policy.js"), "utf8");
  const quickGrab = fs.readFileSync(path.resolve(repoRoot, "functions/api/ai/quick-grab.js"), "utf8");
  assert(fixtureManifest.fixtures.length === 5, "pilot manifest contains exactly five fictional fixtures");
  assert(fixtureManifest.fixtures.every(fixture => fixture.rawContent.startsWith("Fictional example:")), "every pilot fixture is explicitly fictional");
  assert(policy.includes('model: "gpt-5.6-luna"') && policy.includes('reasoningEffort: "low"'), "pilot policy pins the approved model and low reasoning");
  assert(policy.includes("spendingCeilingMicros: 5_000_000"), "pilot policy fixes the five-dollar spending ceiling");
  assert(policy.includes("minuteLimit: 2") && policy.includes("dayLimit: 5") && policy.includes("lifetimeLimit: 25"), "pilot policy fixes request caps");
  assert(quickGrab.includes('authorization.method !== "cloudflare_access"'), "pilot accepts Cloudflare Access authentication only");
  assert(quickGrab.includes("quickGrabPilotConfiguration(request, env)"), "pilot checks exact preview host, policy, enablement, and expiry");
  assert(quickGrab.includes("store: false") && quickGrab.includes("tools: []") && quickGrab.includes("strict: true"), "pilot OpenAI request is non-stored, tool-free, and strict-schema");
  assert(!/callPilotOpenAI[\s\S]*?console\./.test(quickGrab.slice(quickGrab.indexOf("async function callPilotOpenAI"), quickGrab.indexOf("async function handlePilotRequest"))), "pilot provider path emits no logs");

  const handler = loadQuickGrab();
  const response = await handler({
    request: new Request("https://pilot-example.pages.dev/api/ai/quick-grab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RUF-HUB-AI-Pilot": fixtureManifest.policyVersion },
      body: JSON.stringify({ pilotAction: "run", policyVersion: fixtureManifest.policyVersion, fixtureId: fixtureManifest.fixtures[0].id, grantId: "synthetic" })
    }),
    env: {}
  });
  assert(response.status === 404, "pilot is fail-closed and indistinguishable when no approved configuration exists");
  console.log("All fictional Real AI Quick Grab pilot regression checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

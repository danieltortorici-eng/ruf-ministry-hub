const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const deployRoot = path.resolve(repoRoot, "ruf-ministry-hub-deploy-working");

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function testDeployRootShape() {
  const expectedTopLevel = new Set([
    "_redirects",
    "functions",
    "index.html",
    "ruf-ministry-hub-icon-180.png",
    "ruf-ministry-hub-icon-192.png",
    "ruf-ministry-hub-icon-512.png",
    "ruf-ministry-hub-sw.js",
    "ruf-ministry-hub.html",
    "ruf-ministry-hub.webmanifest"
  ]);
  const actualTopLevel = fs.readdirSync(deployRoot).sort();
  actualTopLevel.forEach(entry => {
    assert(expectedTopLevel.has(entry), `deploy root contains only expected entry: ${entry}`);
  });
  expectedTopLevel.forEach(entry => {
    assert(actualTopLevel.includes(entry), `deploy root includes ${entry}`);
  });
}

function testNoInternalsInDeployRoot() {
  const forbiddenNames = new Set([".git", ".wrangler", "node_modules", "tests", "docs"]);
  const stack = [deployRoot];
  while (stack.length) {
    const current = stack.pop();
    const name = path.basename(current);
    if (forbiddenNames.has(name)) {
      assert(false, `deploy root does not include ${name}`);
    }
    if (fs.statSync(current).isDirectory()) {
      fs.readdirSync(current).forEach(child => stack.push(path.join(current, child)));
    }
  }
  assert(true, "deploy root does not include repository internals");
}

function testPagesFunctionRoutesExist() {
  const healthPath = "ruf-ministry-hub-deploy-working/functions/api/ai/health.js";
  const quickGrabPath = "ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js";
  const health = read(healthPath);
  const quickGrab = read(quickGrabPath);
  assert(fs.existsSync(path.resolve(repoRoot, healthPath)), `${healthPath} exists`);
  assert(fs.existsSync(path.resolve(repoRoot, quickGrabPath)), `${quickGrabPath} exists`);
  assert(/export\s+async\s+function\s+onRequestGet/.test(health), "health endpoint is a Pages Function GET handler");
  assert(/export\s+async\s+function\s+onRequestPost/.test(quickGrab), "quick-grab endpoint is a Pages Function POST handler");
}

function assertAiApprovalFix(relativePath) {
  const html = read(relativePath);
  [
    "partiallyApproved",
    "Choose or create person",
    "selectedActionIds",
    "skippedActionIds",
    "approvedAt",
    "aiConfirmActions",
    "view.aiConfirmProposalId",
    "ai-action-confirm-save",
    "Confirm AI Actions"
  ].forEach(text => {
    assert(html.includes(text), `${relativePath} includes ${text}`);
  });
  assert(!/proposal\.status\s*=\s*allActionsExecutable\s*&&\s*allExecutableSelected\s*\?\s*"approved"\s*:\s*"edited"/.test(html), `${relativePath} does not use edited after successful action save`);
  assert(!/view\.sheet\s*=.*ai-action-confirm|type:\s*"ai-action-confirm"/.test(html), `${relativePath} does not use the legacy AI confirm sheet route`);
}

function testAiApprovalFixInDeployOutputs() {
  assertAiApprovalFix("dist/ruf-ministry-hub.html");
  assertAiApprovalFix("ruf-ministry-hub-deploy-working/ruf-ministry-hub.html");
}

function testWranglerGuardrail() {
  const wrangler = read("wrangler.jsonc");
  assert(wrangler.includes('"pages_build_output_dir": "./ruf-ministry-hub-deploy-working"'), "root wrangler config points Pages output at deploy folder");
  assert(!/"main"\s*:/.test(wrangler), "root wrangler config does not define a Worker entrypoint");
  assert(!/"assets"\s*:/.test(wrangler), "root wrangler config does not define Worker assets");
  assert(!/"directory"\s*:\s*"\."/.test(wrangler), "root wrangler config does not publish repository root as assets");
}

function testIgnoreGuardrails() {
  const gitignore = read(".gitignore");
  const assetsignore = read(".assetsignore");
  [".wrangler/", "node_modules/", ".env", ".dev.vars", "*.log"].forEach(pattern => {
    assert(gitignore.includes(pattern), `.gitignore includes ${pattern}`);
  });
  [".git", ".wrangler", "node_modules", "tests", "docs", "functions", ".env", ".dev.vars", "*.log", "*.zip", "*.tmp", "tmp", "wrangler.jsonc", "package.json"].forEach(pattern => {
    assert(assetsignore.includes(pattern), `.assetsignore includes ${pattern}`);
  });
}

function testDeploymentNotes() {
  const notes = read("DEPLOYMENT_NOTES.md");
  [
    "Root directory: `ruf-ministry-hub-deploy-working`",
    "Build command: blank",
    "Deploy command: blank",
    "Do not use `npx wrangler deploy`.",
    "Do not use the `workers.dev` URL.",
    "Build output directory: `.`",
    "Functions directory: `functions`",
    "Use Cloudflare Pages for this project, not a separate Worker",
    "test the app at the Cloudflare Pages URL",
    "Test AI health at `https://YOUR-PAGES-URL/api/ai/health`.",
    "/api/ai/health",
    "/api/ai/quick-grab"
  ].forEach(text => {
    assert(notes.includes(text), `DEPLOYMENT_NOTES.md includes ${text}`);
  });
}

function run() {
  testDeployRootShape();
  testNoInternalsInDeployRoot();
  testPagesFunctionRoutesExist();
  testAiApprovalFixInDeployOutputs();
  testWranglerGuardrail();
  testIgnoreGuardrails();
  testDeploymentNotes();
  console.log("All deployment config regression checks passed.");
}

run();

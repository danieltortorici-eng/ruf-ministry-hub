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
    "ruf-ministry-hub-icon.svg",
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

function testProductionAiSafetyAssets() {
  const worker = read("cloudflare/ai-rate-limiter/worker.js");
  const limiterConfig = read("cloudflare/ai-rate-limiter/wrangler.jsonc");
  const runbook = read("docs/production-ai-safety.md");
  assert(worker.includes("extends DurableObject"), "AI limiter uses a Durable Object implementation");
  assert(worker.includes("fixed-window"), "AI limiter persists a bounded fixed window");
  assert(limiterConfig.includes('"new_sqlite_classes": ["AiRateLimiter"]'), "AI limiter declares its Durable Object migration");
  [
    "AI_MOCK_MODE=true",
    "CF_ACCESS_TEAM_DOMAIN",
    "CF_ACCESS_AUD",
    "AI_RATE_LIMITER",
    "OPENAI_API_KEY",
    "requires Daniel approval"
  ].forEach(text => {
    assert(runbook.includes(text), `production AI runbook includes ${text}`);
  });
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

function testCanonicalDocumentation() {
  const readme = read("README.md");
  const guide = read("docs/canonical-repository-guide.md");
  const fixturePath = path.join(repoRoot, "tests", "fixtures", "api", "fake-quick-grab.json");
  [readme, guide].forEach((source, index) => {
    assert(source.includes("https://github.com/danieltortorici-eng/ruf-ministry-hub"), `${index === 0 ? "README" : "canonical guide"} names canonical GitHub repository`);
  });
  [
    "## Architecture map",
    "## Source-of-truth rules",
    "## Local setup",
    "## Test matrix",
    "## Privacy model",
    "## Worker catalog",
    "## GitHub-first handoffs",
    "## Cloudflare Pages deploy and rollback",
    "## Emergency Quick Grab external-AI disable and restore",
    "## Contributor checklist"
  ].forEach(heading => {
    assert(guide.includes(heading), `canonical guide includes ${heading}`);
  });
  assert(guide.includes("AI returns proposals only") || guide.includes("Proposals are not writes"), "canonical guide preserves human approval boundary");
  assert(guide.includes("Do not run `npx wrangler deploy`"), "canonical guide rejects standalone Worker deployment");
  assert(fs.existsSync(fixturePath), "synthetic Quick Grab QA fixture exists");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert(fixture.sourceId === "grab_synthetic_1" && fixture.candidatePeople[0].name === "Jordan Example", "Quick Grab QA fixture is explicitly synthetic");
}

function run() {
  testDeployRootShape();
  testNoInternalsInDeployRoot();
  testPagesFunctionRoutesExist();
  testAiApprovalFixInDeployOutputs();
  testWranglerGuardrail();
  testProductionAiSafetyAssets();
  testIgnoreGuardrails();
  testDeploymentNotes();
  testCanonicalDocumentation();
  console.log("All deployment config regression checks passed.");
}

run();

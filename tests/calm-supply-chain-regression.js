const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const deployRoot = path.join(repoRoot, "ruf-ministry-hub-deploy-working");
const expectedDeployEntries = new Set([
  "_headers",
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
const forbiddenDeployNames = new Set([".git", ".wrangler", "node_modules", "tests", "docs"]);
const lifecycleScripts = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"]);

function auditDeployRoot(root) {
  const failures = [];
  const topLevel = fs.readdirSync(root).sort();
  for (const expected of expectedDeployEntries) {
    if (!topLevel.includes(expected)) failures.push(`missing-deploy-entry:${expected}`);
  }
  for (const entry of topLevel) {
    if (!expectedDeployEntries.has(entry)) failures.push(`unexpected-deploy-entry:${entry}`);
  }
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const name = path.basename(current);
    if (current !== root && forbiddenDeployNames.has(name)) failures.push(`forbidden-deploy-path:${name}`);
    if (/\.(?:log|tmp|bak|orig)$/i.test(name)) failures.push(`forbidden-deploy-artifact:${name}`);
    if (fs.statSync(current).isDirectory()) {
      for (const child of fs.readdirSync(current)) stack.push(path.join(current, child));
    }
  }
  return [...new Set(failures)];
}

function auditPackage(root) {
  const failures = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = manifest.scripts || {};
  for (const name of Object.keys(scripts)) {
    if (lifecycleScripts.has(name)) failures.push(`forbidden-lifecycle-script:${name}`);
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== "string") failures.push(`non-string-script:${name}`);
    if (/\b(?:wrangler\s+deploy|npm\s+publish|curl|wget|scp|ssh|osascript)\b/.test(String(command))) {
      failures.push(`external-state-script:${name}`);
    }
  }
  if (!String(scripts.test || "").includes("npm run check:app") || !String(scripts.test || "").includes("npm run audit:secrets")) {
    failures.push("incomplete-maintained-test-script");
  }
  const dependencies = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.optionalDependencies || {})
  };
  const names = Object.keys(dependencies);
  const lockPath = path.join(root, "package-lock.json");
  if (names.length && !fs.existsSync(lockPath)) {
    failures.push("dependency-without-lockfile");
    return failures;
  }
  if (!names.length) return failures;
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    failures.push("invalid-lockfile");
    return failures;
  }
  if (lock.lockfileVersion !== 3) failures.push("unsupported-lockfile-version");
  for (const name of names) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) failures.push(`dependency-not-locked:${name}`);
    else if (!String(entry.integrity || "").startsWith("sha512-")) failures.push(`dependency-missing-integrity:${name}`);
  }
  return failures;
}

function auditWorkflow(source) {
  const failures = [];
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(source)) failures.push("workflow-permissions-not-read-only");
  if (/^\s*pull_request_target\s*:/m.test(source)) failures.push("forbidden-pull-request-target");
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
    const reference = match[1];
    const revision = reference.slice(reference.lastIndexOf("@") + 1);
    if (!/^[a-f0-9]{40}$/.test(revision)) failures.push(`unpinned-action:${reference}`);
  }
  if (!/persist-credentials:\s*false/.test(source)) failures.push("checkout-persists-credentials");
  return failures;
}

function auditPublicBoundary(wrangler, assetsIgnore) {
  const failures = [];
  if (!wrangler.includes('"pages_build_output_dir": "./ruf-ministry-hub-deploy-working"')) failures.push("wrong-pages-public-root");
  if (/"main"\s*:/.test(wrangler) || /"assets"\s*:/.test(wrangler)) failures.push("standalone-worker-publication");
  for (const pattern of [".git", ".wrangler", "node_modules", "tests", "docs", "functions", ".env", ".dev.vars", "*.log", "package.json"]) {
    if (!assetsIgnore.split(/\r?\n/).includes(pattern)) failures.push(`assetsignore-missing:${pattern}`);
  }
  return failures;
}

function auditBrowserText(text) {
  const failures = [];
  if (/OPENAI_API_KEY/.test(text)) failures.push("server-secret-name-in-browser");
  if (/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/.test(text)) failures.push("secret-signature-in-browser");
  if (/Authorization\s*:\s*["'`]Bearer\s+/i.test(text)) failures.push("bearer-token-in-browser");
  return failures;
}

function auditRepositoryPaths(paths) {
  const forbidden = [
    /(^|\/)\.env\.local$/,
    /(^|\/)\.dev\.vars(?:\.[^/]+)?$/,
    /\.(?:pem|key)$/i,
    /(^|\/)ruf-ministry-hub-backup[^/]*\.json$/i,
    /(^|\/)ministry-data[^/]*\.json$/i
  ];
  return paths.filter(file => forbidden.some(pattern => pattern.test(file))).map(file => `forbidden-repository-path:${file}`);
}

function expectFailure(label, failures, expected) {
  assert.ok(failures.includes(expected), `${label} must produce ${expected}; found ${failures.join(", ") || "none"}`);
  console.log(`PASS mutation guard rejects ${label}`);
}

const packageFailures = auditPackage(repoRoot);
assert.deepEqual(packageFailures, []);
console.log("PASS current dependency-free package and maintained scripts satisfy the bounded policy");

assert.deepEqual(auditDeployRoot(deployRoot), []);
console.log("PASS physical deploy root contains only the reviewed Pages payload");

const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
assert.deepEqual(auditWorkflow(workflow), []);
console.log("PASS current CI permissions and action revisions satisfy the deterministic workflow boundary");

const wrangler = fs.readFileSync(path.join(repoRoot, "wrangler.jsonc"), "utf8");
const assetsIgnore = fs.readFileSync(path.join(repoRoot, ".assetsignore"), "utf8");
assert.deepEqual(auditPublicBoundary(wrangler, assetsIgnore), []);
console.log("PASS Pages publishes only the deploy root and excludes repository internals");

for (const file of ["index.html", "ruf-ministry-hub.html", "ruf-ministry-hub-sw.js"]) {
  assert.deepEqual(auditBrowserText(fs.readFileSync(path.join(deployRoot, file), "utf8")), [], `${file} browser boundary`);
}
const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: repoRoot,
  encoding: "utf8"
});
assert.equal(listed.status, 0, "Git must enumerate tracked and proposed paths");
assert.deepEqual(auditRepositoryPaths(listed.stdout.split("\0").filter(Boolean)), []);
console.log("PASS browser assets and tracked/proposed paths satisfy the local secret boundary");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ruf-calm-supply-negative-"));
try {
  const deployMutation = path.join(temporaryRoot, "deploy");
  fs.cpSync(deployRoot, deployMutation, { recursive: true });
  fs.mkdirSync(path.join(deployMutation, ".wrangler"));
  fs.writeFileSync(path.join(deployMutation, "debug.log"), "synthetic log\n");
  const deployFailures = auditDeployRoot(deployMutation);
  expectFailure("a hidden .wrangler directory", deployFailures, "unexpected-deploy-entry:.wrangler");
  expectFailure("an unexpected deploy log", deployFailures, "unexpected-deploy-entry:debug.log");

  const lifecycleMutation = path.join(temporaryRoot, "lifecycle");
  fs.mkdirSync(lifecycleMutation);
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  manifest.scripts.postinstall = "node synthetic-install.js";
  fs.writeFileSync(path.join(lifecycleMutation, "package.json"), JSON.stringify(manifest));
  expectFailure("lifecycle-script tampering", auditPackage(lifecycleMutation), "forbidden-lifecycle-script:postinstall");

  const dependencyMutation = path.join(temporaryRoot, "dependency");
  fs.mkdirSync(dependencyMutation);
  const dependencyManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  dependencyManifest.dependencies = { "synthetic-package": "1.0.0" };
  fs.writeFileSync(path.join(dependencyMutation, "package.json"), JSON.stringify(dependencyManifest));
  expectFailure("a dependency without a lockfile", auditPackage(dependencyMutation), "dependency-without-lockfile");

  const unpinnedWorkflow = workflow.replace(/(uses:\s*actions\/checkout)@[a-f0-9]{40}/, "$1@v7");
  const unpinnedFailures = auditWorkflow(unpinnedWorkflow);
  assert.ok(unpinnedFailures.some(failure => failure.startsWith("unpinned-action:actions/checkout@v7")));
  console.log("PASS mutation guard rejects an unpinned GitHub Action");

  expectFailure(
    "repository-root publication",
    auditPublicBoundary(wrangler.replace('"pages_build_output_dir": "./ruf-ministry-hub-deploy-working"', '"pages_build_output_dir": "."'), assetsIgnore),
    "wrong-pages-public-root"
  );

  const syntheticSecret = ["sk", "proj", "synthetic", "x".repeat(28)].join("-");
  expectFailure("synthetic browser secret material", auditBrowserText(syntheticSecret), "secret-signature-in-browser");
  expectFailure(
    "a tracked local environment path",
    auditRepositoryPaths(["synthetic/.env.local"]),
    "forbidden-repository-path:synthetic/.env.local"
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("All Calm supply-chain mutation-contract checks passed without network access.");

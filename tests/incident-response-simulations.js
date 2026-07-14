const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const fixturePath = path.resolve(__dirname, "fixtures", "incident-simulations.json");
const runbookPath = path.resolve(repoRoot, "docs", "incident-response.md");

const RESPONSE = Object.freeze({
  secret_exposure: Object.freeze({
    containment: ["freeze_distribution", "credential_rotation_handoff"],
    evidence: ["credential_metadata", "exposure_window", "aggregate_usage"]
  }),
  public_ai_abuse: Object.freeze({
    containment: ["force_ai_mock_mode", "bound_ai_route"],
    evidence: ["aggregate_ai_usage", "route_metrics", "sampled_request_ids"]
  }),
  failed_deploy: Object.freeze({
    containment: ["freeze_deploys", "pages_rollback"],
    evidence: ["deployment_ids", "commit_shas", "version_metadata"]
  }),
  data_loss_report: Object.freeze({
    containment: ["freeze_affected_profile_writes", "preserve_browser_storage"],
    evidence: ["device_version_metadata", "action_timeline", "backup_metadata"]
  }),
  service_worker_outage: Object.freeze({
    containment: ["preserve_browser_storage", "separate_cache_layers"],
    evidence: ["app_cache_versions", "service_worker_state", "affected_route_metadata"]
  }),
  worker_loop: Object.freeze({
    containment: ["freeze_deploys", "break_recursive_route"],
    evidence: ["worker_error_outcome", "redacted_hop_sequence", "invocation_aggregates"]
  })
});

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function sameList(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function classifySeverity(type, signals) {
  if (signals.sensitiveDataExposure) return "SEV-1";
  if (type === "secret_exposure") {
    if (signals.publicExposure && signals.credentialActive) return "SEV-1";
    return signals.publicExposure ? "SEV-2" : "SEV-4";
  }
  if (type === "public_ai_abuse") {
    if (signals.materialCostRisk) return "SEV-1";
    return signals.sustainedAbuse ? "SEV-2" : "SEV-3";
  }
  if (type === "failed_deploy") {
    if (signals.productionUnavailable) return "SEV-2";
    return signals.previewOnly ? "SEV-3" : "SEV-4";
  }
  if (type === "data_loss_report") {
    if (signals.broadLossConfirmed || signals.irreversibleLossConfirmed) return "SEV-1";
    return signals.credibleReport ? "SEV-2" : "SEV-4";
  }
  if (type === "service_worker_outage") {
    if (signals.widespreadFailure || signals.localDataAtRisk) return "SEV-2";
    return "SEV-3";
  }
  if (type === "worker_loop") {
    if (signals.materialCostRisk) return "SEV-1";
    if (signals.loopLimit1019 && signals.sustainedProductionImpact) return "SEV-2";
    return signals.loopLimit1019 ? "SEV-3" : "SEV-4";
  }
  throw new Error(`Unsupported synthetic incident type: ${type}`);
}

function simulate(testCase) {
  const response = RESPONSE[testCase.type];
  if (!response) throw new Error(`No response model for ${testCase.type}`);
  return {
    severity: classifySeverity(testCase.type, testCase.signals),
    containment: [...response.containment],
    evidence: [...response.evidence],
    requiresHumanProductionApproval: true,
    requiresDanielRecordApproval: true
  };
}

function testFixtureGuardrails(fixture) {
  assert(fixture.schemaVersion === 1, "incident fixture schema is version 1");
  Object.entries(fixture.guardrails).forEach(([name, value]) => {
    const expected = name === "syntheticOnly";
    assert(value === expected, `fixture guardrail ${name} is ${expected}`);
  });
  assert(fixture.cases.length === 6, "fixture covers exactly six incident types");
  assert(new Set(fixture.cases.map(testCase => testCase.id)).size === fixture.cases.length, "synthetic incident IDs are unique");
}

function testRunbookCoverage(runbook) {
  [
    "### Secret exposure",
    "### Public AI abuse",
    "### Failed deploy",
    "### Data-loss report",
    "### Service-worker outage or stale cache",
    "### Worker loop",
    "## Severity levels",
    "## Detection inputs and privacy boundary",
    "## Credential rotation handoff",
    "## Communication templates",
    "## Postmortem and follow-through",
    "## Automation limits"
  ].forEach(heading => assert(runbook.includes(heading), `runbook includes ${heading}`));

  [
    "Do not tell a user to clear browser storage",
    "Daniel must approve every ministry-record",
    "Do not use `npx wrangler deploy`",
    "AI_MOCK_MODE=true",
    "Preview deployments are not valid rollback targets",
    "A CDN purge does not clear a user's service worker or local app data",
    "send no messages"
  ].forEach(text => assert(runbook.includes(text), `runbook preserves guardrail: ${text}`));
}

function run() {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const runbook = fs.readFileSync(runbookPath, "utf8");

  testFixtureGuardrails(fixture);
  testRunbookCoverage(runbook);

  const seenTypes = new Set();
  fixture.cases.forEach(testCase => {
    assert(testCase.id.startsWith("synthetic-"), `${testCase.id} is explicitly synthetic`);
    seenTypes.add(testCase.type);
    const actual = simulate(testCase);
    assert(actual.severity === testCase.expected.severity, `${testCase.id} severity is deterministic`);
    assert(sameList(actual.containment, testCase.expected.containment), `${testCase.id} containment is deterministic`);
    assert(sameList(actual.evidence, testCase.expected.evidence), `${testCase.id} evidence plan is deterministic`);
    assert(actual.requiresHumanProductionApproval, `${testCase.id} production action remains human-approved`);
    assert(actual.requiresDanielRecordApproval, `${testCase.id} record changes remain Daniel-approved`);
  });

  assert(sameList([...seenTypes].sort(), Object.keys(RESPONSE).sort()), "all modeled incident types have a synthetic case");
  console.log("All deterministic incident-response simulations passed without network access or external messages.");
}

run();

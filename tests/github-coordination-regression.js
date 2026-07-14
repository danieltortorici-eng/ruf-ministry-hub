const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

function testWorkflowGuardrails() {
  const workflow = read('.github/workflows/ci.yml');
  assert(/pull_request:\s*$/m.test(workflow), 'CI runs for pull requests');
  assert(/push:\s*\n\s+branches:\s*\n\s+- main/m.test(workflow), 'CI runs for pushes to main');
  assert(/permissions:\s*\n\s+contents: read/m.test(workflow), 'CI has read-only contents permission');
  assert(workflow.includes('persist-credentials: false'), 'checkout does not persist credentials');
  assert(workflow.includes('cancel-in-progress: true'), 'CI cancels superseded runs');
  assert(workflow.includes('npm test'), 'CI runs the complete local suite');
  assert(workflow.includes('retention-days: 7'), 'CI failure artifacts have short retention');
  assert(workflow.includes('if: ${{ failure() }}'), 'CI uploads artifacts only on failure');

  const actionRefs = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)/gm)];
  assert(actionRefs.length === 3, 'CI uses only the three reviewed actions');
  actionRefs.forEach(([, action, ref]) => {
    assert(/^[0-9a-f]{40}$/.test(ref), `${action} is pinned to a full commit SHA`);
  });
}

function testOwnershipAndPullRequestTemplate() {
  const owners = read('.github/CODEOWNERS');
  const template = read('.github/pull_request_template.md');
  assert(owners.includes('* @danieltortorici-eng'), 'CODEOWNERS has a repository default owner');
  assert(owners.includes('/.github/ @danieltortorici-eng'), 'GitHub safeguards require owner review');
  assert(owners.includes('/ruf-ministry-hub-deploy-working/ @danieltortorici-eng'), 'deploy source has an explicit owner');
  assert(template.includes('no real ministry data'), 'pull request template checks ministry-data privacy');
  assert(template.includes('Daniel still approves selected actions'), 'pull request template preserves AI approval');
  assert(template.includes('`npm test`'), 'pull request template records full verification');
  assert(template.includes('does not deploy, change GitHub settings, or expose secrets'), 'pull request template records external-change boundary');
}

function testAuditCoverageAndRecommendations() {
  const packageJson = JSON.parse(read('package.json'));
  const secretAudit = read('audit-secrets.mjs');
  const driftAudit = read('audit-generated-output.mjs');
  const recommendations = read('docs/github-repository-safeguards.md');
  assert(packageJson.scripts.test.includes('audit:generated'), 'full suite includes generated-output drift audit');
  assert(packageJson.scripts.test.includes('audit:secrets'), 'full suite includes secret-boundary audit');
  assert(packageJson.scripts['test:regression'].includes('github-coordination-regression.js'), 'full suite includes coordination regression checks');
  assert(secretAudit.includes("'--cached', '--others', '--exclude-standard'"), 'secret audit scans tracked and proposed files but skips ignored local files');
  assert(secretAudit.includes('ruf-ministry-hub-deploy-working/ruf-ministry-hub.html'), 'secret audit checks deploy browser output');
  assert(driftAudit.includes('ruf-ministry-hub-deploy-working/functions/api/ai/health.js'), 'drift audit checks health function mirror');
  assert(driftAudit.includes('ruf-ministry-hub-deploy-working/functions/api/ai/quick-grab.js'), 'drift audit checks quick-grab function mirror');
  assert(recommendations.includes('CI / verify'), 'branch ruleset names the required CI check');
  assert(recommendations.includes('authors cannot approve their own changes'), 'branch ruleset documents single-owner review deadlock');
  assert(recommendations.includes('Do not test secret scanning with a real credential'), 'setup verification requires synthetic secret tests');
}

function run() {
  testWorkflowGuardrails();
  testOwnershipAndPullRequestTemplate();
  testAuditCoverageAndRecommendations();
  console.log('All GitHub coordination regression checks passed.');
}

run();
